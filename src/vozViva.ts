// La voz que dice de qué se trata (0.5.0, JST-167; opción B del spike de
// JST-161), en el worker del plugin: prepara las frases con el nombre de la
// tarea («Diseño, de JSTM: terminé. Diseño de Oficina global 0.5.0.») con la
// voz de cada agente, cuando una Oficina con ese interruptor prendido se lo
// pide (al ver que el agente empieza la tarea). Si la frase no está lista a
// tiempo, la página dice la de siempre.
//
// - Responde al tiro y genera en segundo plano: una fila para Edge, otra para
//   Kokoro y una sola para los clones (Qwen3 y Chatterbox), de a una frase.
// - Cada voz y texto se hace una sola vez, aunque lo pidan varias pantallas.
// - «Empecé» va delante en su fila y la página puede esperarla un poco
//   (`esperar`): es la única que se dice apenas empieza la tarea (JST-194).
// - 0.8.0 (JST-241): «te necesito» con la pregunta (`pide`) se pide cuando sube
//   la mano, también delante, y la página la espera hasta 30 s.
// - El texto lo arma el plugin (`textoVoz` con la tarea cortada por
//   `tareaParaVoz`, ~60 letras) y va al motor por su entrada estándar, nunca en
//   la línea de comandos. El motor corre con prioridad baja (nice 10) y un tope
//   de 3 min por frase; si se pasa, se mata (`uv` y su Python, JST-198).
// - No empieza un clon si queda poco swap o la carga de la Mac está muy alta,
//   la de 1 min y también la de 5 (un respiro de un momento no basta). Durante
//   el clon la vuelve a mirar cada 10 s y lo corta apenas sube; después de
//   cortar uno, no empieza otro en 5 min (JST-198).
// - Deja los MP3 en `dist/ui/voces/vivo/` (con `vivo.json`), como mucho
//   ~200 MB, y borra lo que tenga más de 7 días.
// - Si falta `uv` o `ffmpeg`, no hace nada y lo dice (`estado`).
// - 0.6.0 (JST-226, opción C del spike de JST-224): también prepara lo que se
//   lee de la oficina (las frases de una conversación, juntas, un minuto antes;
//   la entrega, la mascota, la frase suelta y la hora) y la página puede
//   esperarlas (`esperarOficina`). Solo acepta lo que el plugin pudo haber
//   armado (`validarPedidoOficina`): lo demás se rechaza.
// - 0.7.0 (JST-232, puntos 5 y 7 del spike de JST-230): acepta también lo que
//   escribió la IA de Chrome si pasa su revisión, con un tope de frases nuevas
//   por minuto, y le dice a la página si la IA puede escribir (`permisoIa`: la
//   Mac no está cargada y no hay un clon generando, que también usa la GPU).
// - 0.9.0 (JST-246): lee el Resumen con la voz del Chief of staff (`esperarResumen`):
//   la página pide la frase que suena y las 2 que siguen; van delante en su
//   fila, con sus reglas (`src/resumen/voz.ts`): un largo máximo, solo letras y
//   signos, un tope por resumen y por minuto, y solo con Edge o Kokoro.
// - 0.9.1 (JST-255): un clon que dura demasiado para su texto (`maximoAudioMs`,
//   3 s más el doble de sus letras a 10 por segundo) se bota, al hacerlo y al
//   arrancar el worker con los que ya estaban guardados.
//
// No lee ni escribe nada en Paperclip.
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cpus, homedir, loadavg, setPriority, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { LETRAS_PIDE, MAX_MAS, TIPOS_PIDE, tareaParaVoz, textoVoz, type Frase, type PideVoz, type Presentacion } from "./avisos.js";
import { comando, convertir, datosDeVoz, hayModeloKokoro, maximoAudioMs, problemaCon, PRUEBA_FFMPEG } from "../generador/motores.js";
import { paraDecir } from "../generador/pronunciar.js";
import { archivoVivo, CARPETA_VIVO, duracionMp3, leerIndice, vozPorId, type IndiceVoces, type Motor } from "./voces.js";
import { textoOficina, validarPedidoOficina, VOCES_MASCOTA } from "./vozOficina.js";
import { CupoResumen, fraseResumenValida, leerPedidoResumen } from "./resumen/voz.js";

/** Lo que pide la página: la frase de un agente con el nombre de una tarea, con la presentación de ese navegador. */
export interface PedidoVoz {
  agenteId: string;
  frase: Exclude<Frase, "error">;
  corto: string;
  empresa: string;
  presentacion: Presentacion;
  /** El nombre de la tarea, entero (se corta con `tareaParaVoz`). Con `pide`, no se dice (va igual: el pedido es el mismo de siempre). */
  tarea: string;
  /** 0.8.0: «te necesito» dice lo que espera (la pregunta breve, o qué aprobar o revisar) en vez de la tarea. */
  pide?: PideVoz;
}

/** Como mucho, por pedido (la página manda las de los agentes que trabajan: unos 26 × 3). */
export const MAX_PEDIDOS = 120;
/** Tope de cada frase en su motor. */
export const TOPE_FRASE_MS = 3 * 60_000;
/** Durante un clon, cada cuánto se vuelve a mirar la carga de la Mac. */
export const VIGILAR_MS = 10_000;
/** Después de cortar un clon porque la Mac se cargó, no se empieza otro en este rato. */
export const PAUSA_CLONES_MS = 5 * 60_000;
/** Un motor sin trabajo se cierra a los 2 min (los clones, a los 10: tardan en cargar). */
const INACTIVO_MS: Record<Fila, number> = { edge: 2 * 60_000, kokoro: 2 * 60_000, clon: 10 * 60_000 };
/** Lo de más de 7 días se borra, y la carpeta no pasa de ~200 MB. */
export const VIVO_DIAS_MS = 7 * 24 * 60 * 60_000;
export const VIVO_MAX_BYTES = 200 * 1024 * 1024;
/** Si no hay `uv` o `ffmpeg`, se vuelve a mirar cada 5 min (por si se arregla sin reiniciar Paperclip). */
const REVISAR_MS = 5 * 60_000;

/**
 * Tope del nombre del agente y de la empresa (JST-195). El texto tiene que ser
 * el mismo que arma la página, así que el nombre no se corta acá: Paperclip no
 * le pone tope al nombre de un agente y antes, con 60, uno de 73 letras no
 * decía nunca de qué se trata.
 */
export const LETRAS_NOMBRE = 200;

const FRASES_DETALLE: ReadonlySet<string> = new Set(["toca", "fin", "emp"]);
const PRESENTACIONES: ReadonlySet<string> = new Set(["nombre-empresa", "nombre", "frase"]);
const corto = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);

/** Lo que espera (0.8.0) con la forma esperada y dentro de los topes, o `null`. Sin `pide` es `undefined` (un pedido de siempre). */
function validarPide(x: unknown): PideVoz | null | undefined {
  if (x === undefined) return undefined;
  const p = x as Partial<PideVoz> | null;
  if (!p || typeof p !== "object" || !TIPOS_PIDE.includes(p.tipo as PideVoz["tipo"]) || !corto(p.texto, LETRAS_PIDE)) return null;
  if (!Number.isInteger(p.mas) || p.mas! < 0 || p.mas! > MAX_MAS) return null;
  return { tipo: p.tipo!, texto: p.texto!, mas: p.mas! };
}

/** Un pedido con la forma esperada y dentro de los topes, o `null`. */
export function validarPedido(x: unknown): PedidoVoz | null {
  const p = x as Partial<PedidoVoz> | null;
  if (!p || typeof p !== "object") return null;
  if (!corto(p.agenteId, 80) || !FRASES_DETALLE.has(p.frase as string) || !PRESENTACIONES.has(p.presentacion as string)) return null;
  // Con «Solo la frase» el nombre y la empresa no se dicen: no cuenta su largo.
  const nombres = p.presentacion === "frase" ? Infinity : LETRAS_NOMBRE;
  if (!corto(p.corto, nombres) || !corto(p.empresa, nombres) || !corto(p.tarea, 400)) return null;
  // Lo que espera solo va con «te necesito».
  const pide = validarPide(p.pide);
  if (pide === null || (pide && p.frase !== "toca")) return null;
  return { agenteId: p.agenteId!, frase: p.frase!, corto: p.corto!, empresa: p.empresa!, presentacion: p.presentacion!, tarea: p.tarea!, ...(pide ? { pide } : {}) };
}

/**
 * El texto que se genera: el mismo que arma la página (la frase con la tarea,
 * o «te necesito» con lo que espera). `null` si no queda nada que decir.
 */
export function textoPedido(p: PedidoVoz): string | null {
  if (p.pide) {
    const con = textoVoz(p.corto, p.empresa, p.frase, p.presentacion, { pide: p.pide });
    return con === textoVoz(p.corto, p.empresa, p.frase, p.presentacion) ? null : con;
  }
  return tareaParaVoz(p.tarea) ? textoVoz(p.corto, p.empresa, p.frase, p.presentacion, { tarea: p.tarea }) : null;
}

export type Fila = "edge" | "kokoro" | "clon";
export const filaDe = (m: Motor): Fila => (m === "edge" || m === "kokoro" ? m : "clon");

/** La voz de un trabajo: una de las 9, o la de una mascota (0.6.0), que es una de Edge más aguda. */
export interface VozTrabajo {
  id: string;
  motor: Motor;
  clave: string;
  pitch?: string;
  rate?: string;
}

export interface TrabajoVoz {
  voz: VozTrabajo;
  texto: string;
  /** `vivo/<voz>-<hash>.mp3`, dentro de la carpeta de las voces. */
  archivo: string;
  /** «Empecé» (JST-194) y «te necesito» con la pregunta (0.8.0): van delante en su fila. */
  delante?: boolean;
}

/**
 * Hace una frase y deja su MP3 en `destino` (el de verdad corre el motor y
 * ffmpeg; en las pruebas, uno de mentira). Si `cortar` se activa, deja la
 * frase, mata el motor y falla con su motivo.
 */
export type Generar = (t: TrabajoVoz, destino: string, cortar: AbortSignal) => Promise<void>;

export interface EstadoVoz {
  disponible: boolean;
  /** Por qué no: «falta uv (no está en el PATH)», «ffmpeg no funciona: dyld…». */
  motivo: string | null;
}

export interface OpcionesPreparador {
  /** La carpeta del plugin (la de `package.json`). */
  raiz: string;
  generar?: Generar;
  /** Revisa `uv` y `ffmpeg` (`null` si arrancan). */
  revisar?: () => string | null;
  /** Se puede empezar un clon ahora (swap y carga de la Mac). */
  clonesOk?: () => boolean;
  /** El clon que se está haciendo puede seguir (se mira cada 10 s). */
  clonSigue?: () => boolean;
  log?: (mensaje: string, datos?: Record<string, unknown>) => void;
  ahora?: () => number;
}

/** Lo más que `esperar` tiene abierta la respuesta (el RPC corta a los 30 s), y cada cuánto mira si la frase ya está. */
export const ESPERA_MAX_MS = 25_000;
const MIRAR_MS = 250;
/**
 * Lo de la oficina (0.6.0) responde a los 20 s como mucho, medidos con el reloj: con la Mac cargada, contar vueltas de
 * 250 ms se pasaba de los 30 s del RPC (502 en la página). La página vuelve a preguntar hasta su plazo.
 */
export const ESPERA_OFICINA_MAX_MS = 20_000;
/** 0.7.0: como mucho tantas frases nuevas de la IA por minuto en la fila (una conversación con voz por minuto trae 1 o 2). */
export const TOPE_IA_POR_MIN = 8;
/** 0.8.1 (JST-249): lo más que el permiso de la IA espera a que termine el clon que se está haciendo (el RPC corta a los 30 s). */
export const ESPERA_PERMISO_IA_MAX_MS = 15_000;

/** 0.7.0 (punto 5 del spike de JST-230): si la IA de Chrome puede escribir ahora, y si no, por qué. */
export interface PermisoIa {
  escribir: boolean;
  motivo: "carga" | "clon" | null;
}

interface IndiceVivo {
  version: 1;
  /** `ms`: cuánto dura (0.6.0). */
  audios: Record<string, { voz: string; texto: string; creado: string; ms?: number | null }>;
}

/** Cómo está cada frase pedida: ya está, en su fila o no se puede hacer (sin voz, pedido raro, sin clones ahora, falló). */
export type EstadoFrase = "lista" | "fila" | "no";

export class PreparadorVoces {
  private readonly dirVoces: string;
  private readonly filas: Record<Fila, TrabajoVoz[]> = { edge: [], kokoro: [], clon: [] };
  private readonly corriendo: Record<Fila, boolean> = { edge: false, kokoro: false, clon: false };
  /** Pedidos o en la fila: cada voz y texto, una vez. */
  private readonly enCurso = new Set<string>();
  private problema: { motivo: string | null; en: number } | null = null;
  private readonly generar: Generar;
  private readonly revisarProgramas: () => string | null;
  private readonly clonesOk: () => boolean;
  private readonly clonSigue: () => boolean;
  /** Hasta cuándo no se empiezan clones (después de cortar uno por la carga). */
  private sinClonesHasta = 0;
  private readonly log: (mensaje: string, datos?: Record<string, unknown>) => void;
  private readonly ahora: () => number;
  private readonly motores: Motores;
  /** 0.7.0: cuándo entró a la fila cada frase nueva de la IA (el último minuto). */
  private nuevasIa: number[] = [];
  /** 0.9.0: las frases nuevas de cada resumen y del último minuto. */
  private readonly cupoResumen: CupoResumen;
  /** Lo hecho (para las pruebas y el registro). */
  hechos = 0;
  saltados = 0;

  constructor(o: OpcionesPreparador) {
    this.dirVoces = join(o.raiz, "dist", "ui", "voces");
    this.ahora = o.ahora ?? Date.now;
    this.log = o.log ?? (() => undefined);
    this.motores = new Motores(o.raiz, this.log);
    this.generar = o.generar ?? ((t, destino, cortar) => this.motores.generar(t, destino, cortar));
    this.revisarProgramas = o.revisar ?? (() => problemaCon("uv", ["--version"], entorno()) ?? problemaCon("ffmpeg", PRUEBA_FFMPEG, entorno()));
    this.clonesOk = o.clonesOk ?? (() => clonesSeguros());
    this.clonSigue = o.clonSigue ?? (() => clonSigue(loadavg()[0]!, nucleosDelMotor(this.motores.pid("clon")), cpus().length, swapLibreMb()));
    this.cupoResumen = new CupoResumen(this.ahora);
    try {
      this.botarLargosGuardados();
    } catch (e) {
      this.log("voces: no se pudieron revisar los clones guardados", { error: (e as Error).message.slice(0, 300) });
    }
  }

  /** Si hay `uv` y `ffmpeg` (se mira al empezar y, si faltan, de nuevo cada 5 min). */
  estado(): EstadoVoz {
    const t = this.ahora();
    if (!this.problema || (this.problema.motivo && t - this.problema.en >= REVISAR_MS)) {
      const motivo = this.revisarProgramas();
      this.problema = { motivo, en: t };
      if (motivo) this.log("voces: no disponible", { motivo });
    }
    return { disponible: !this.problema.motivo, motivo: this.problema.motivo };
  }

  private indice(): IndiceVoces | null {
    try {
      return leerIndice(JSON.parse(readFileSync(join(this.dirVoces, "indice.json"), "utf8")));
    } catch {
      return null;
    }
  }

  /**
   * Pone en su fila las frases que falten (al tiro: no espera a que se hagan).
   * Devuelve cuántas ya estaban, cuántas quedaron en fila y cuántas no se
   * pueden hacer (agente sin voz, tarea sin nombre, pedido raro).
   */
  preparar(pedidos: readonly unknown[]): { listas: number; enFila: number; saltadas: number } {
    const r = { listas: 0, enFila: 0, saltadas: 0 };
    if (!this.estado().disponible) return { ...r, saltadas: pedidos.length };
    const indice = this.indice();
    let raros = 0;
    for (const x of pedidos.slice(0, MAX_PEDIDOS)) {
      const p = validarPedido(x);
      const voz = p && indice ? vozPorId(indice.agentes[p.agenteId]) : null;
      const texto = p ? textoPedido(p) : null;
      if (!p || !voz || !texto) {
        if (!p) raros += 1;
        r.saltadas += 1;
        continue;
      }
      // «Empecé» se dice apenas empieza la tarea; «te necesito» y «terminé», minutos después: «empecé» pasa delante (JST-194).
      // «Te necesito» con la pregunta (0.8.0) también: se pide recién cuando sube la mano.
      const e = this.encolar(voz, texto, p.frase === "emp" || !!p.pide);
      if (e === "lista") r.listas += 1;
      else if (e === "fila") r.enFila += 1;
      else r.saltadas += 1;
    }
    // Antes se descartaban sin dejar rastro (JST-195).
    if (raros > 0) this.log("voces: pedidos que no se entienden (forma o topes)", { raros });
    for (const f of ["edge", "kokoro", "clon"] as const) void this.correr(f);
    return r;
  }

  /** Pone una frase en su fila si falta (cada voz y texto, una vez). `delante`: antes de lo que no va delante. */
  private encolar(voz: VozTrabajo, texto: string, delante: boolean): EstadoFrase {
    const archivo = archivoVivo(voz.id, texto);
    if (existsSync(join(this.dirVoces, archivo))) return "lista";
    if (this.enCurso.has(archivo)) return "fila";
    if (voz.motor === "kokoro" && !hayModeloKokoro()) return "no";
    this.enCurso.add(archivo);
    const fila = this.filas[filaDe(voz.motor)];
    const i = delante ? fila.findIndex((t) => !t.delante) : -1;
    fila.splice(i < 0 ? fila.length : i, 0, { voz, texto, archivo, delante });
    return "fila";
  }

  /** La voz y el texto de un pedido de la oficina (0.6.0), o `null` si no se puede hacer. `ia`: lo escribió la IA de Chrome (0.7.0). */
  private trabajoOficina(x: unknown, indice: IndiceVoces | null): { voz: VozTrabajo; texto: string; ia: boolean } | null {
    const p = validarPedidoOficina(x);
    if (!p) return null;
    const voz: VozTrabajo | null = p.mascota ? VOCES_MASCOTA[p.mascota] : indice ? vozPorId(indice.agentes[p.agenteId!]) : null;
    const texto = textoOficina(p);
    return voz && texto ? { voz, texto, ia: !!p.ia } : null;
  }

  /**
   * 0.7.0 (punto 5 del spike de JST-230): la IA de Chrome escribe solo si la Mac
   * no está cargada (lo mismo que para empezar un clon, JST-198) y no hay un
   * clon generando (también usa la GPU). La fila de los clones va de a una
   * frase y empieza apenas llega algo: si hay frases esperando, es porque hay
   * una generándose (`corriendo`), y al terminar la última queda libre.
   */
  permisoIa(): PermisoIa {
    if (this.corriendo.clon || this.filas.clon.length > 0) return { escribir: false, motivo: "clon" };
    if (this.ahora() < this.sinClonesHasta || !this.clonesOk()) return { escribir: false, motivo: "carga" };
    return { escribir: true, motivo: null };
  }

  /**
   * 0.8.1 (JST-249): como `permisoIa`, pero si hay un clon generando espera
   * hasta `ms` (como mucho 15 s, por reloj) a que la fila de los clones quede
   * libre. Con las voces prendidas los clones se hacen casi todo el rato, con
   * huecos entre una conversación y otra: así la ráfaga cae en un hueco en vez
   * de saltarse cada vez. Con la Mac cargada responde al tiro (no se libera en
   * unos segundos).
   */
  async esperarPermisoIa(ms: number): Promise<PermisoIa> {
    const fin = Date.now() + Math.min(Math.max(0, ms), ESPERA_PERMISO_IA_MAX_MS);
    let p = this.permisoIa();
    while (p.motivo === "clon" && Date.now() < fin) {
      await new Promise((ok) => setTimeout(ok, Math.min(MIRAR_MS, fin - Date.now())));
      p = this.permisoIa();
    }
    return p;
  }

  /** 0.7.0: una frase nueva de la IA más en la fila, si no se pasa del tope del último minuto. */
  private cupoIa(): boolean {
    const t = this.ahora();
    this.nuevasIa = this.nuevasIa.filter((x) => t - x < 60_000);
    if (this.nuevasIa.length >= TOPE_IA_POR_MIN) return false;
    this.nuevasIa.push(t);
    return true;
  }

  /**
   * Lo que se lee de la oficina (0.6.0, JST-226): pone en su fila lo que falte,
   * al tiro, y devuelve cómo está cada pedido, en el mismo orden. Un pedido
   * raro o de un agente sin voz queda en «no».
   */
  prepararOficina(pedidos: readonly unknown[]): EstadoFrase[] {
    if (!this.estado().disponible) return pedidos.map(() => "no");
    const indice = this.indice();
    let raros = 0;
    const r = pedidos.slice(0, MAX_PEDIDOS).map((x): EstadoFrase => {
      const t = this.trabajoOficina(x, indice);
      if (!t) {
        if (!validarPedidoOficina(x)) raros += 1;
        return "no";
      }
      // Un clon que ahora no se puede empezar (la Mac cargada, JST-198) se dice al tiro, aunque haya otros en su fila:
      // la página prepara otra conversación en vez de esperar el minuto. Si se puede, se vuelve a mirar al empezarlo.
      const sinClon = filaDe(t.voz.motor) === "clon" && (this.ahora() < this.sinClonesHasta || !this.clonesOk());
      const archivo = archivoVivo(t.voz.id, t.texto);
      const hecho = existsSync(join(this.dirVoces, archivo));
      if (sinClon && !hecho) return "no";
      // 0.7.0: lo nuevo de la IA tiene su tope por minuto (lo que ya está o ya está en la fila no cuenta).
      if (t.ia && !hecho && !this.enCurso.has(archivo) && !this.cupoIa()) return "no";
      return this.encolar(t.voz, t.texto, false);
    });
    if (raros > 0) this.log("voces: frases de la oficina que no son del plugin", { raros });
    for (const f of ["edge", "kokoro", "clon"] as const) void this.correr(f);
    return r;
  }

  /**
   * Como `prepararOficina`, y responde cuando están todas, cuando alguna ya no
   * se puede hacer (un clon que no se empezó porque la Mac está cargada, o que
   * falló) o a los `ms` (como mucho 20 s, por reloj): la página vuelve a
   * preguntar hasta su plazo. Lo que el worker ya estaba haciendo se termina y
   * se guarda igual.
   */
  async esperarOficina(pedidos: readonly unknown[], ms: number): Promise<EstadoFrase[]> {
    let estados = this.prepararOficina(pedidos);
    const indice = this.indice();
    const archivos = pedidos.slice(0, MAX_PEDIDOS).map((x) => {
      const t = this.trabajoOficina(x, indice);
      return t ? archivoVivo(t.voz.id, t.texto) : null;
    });
    const mirar = (): EstadoFrase[] => archivos.map((a) => (!a ? "no" : existsSync(join(this.dirVoces, a)) ? "lista" : this.enCurso.has(a) ? "fila" : "no"));
    const fin = Date.now() + Math.min(ms, ESPERA_OFICINA_MAX_MS);
    while (Date.now() < fin && estados.includes("fila") && !estados.includes("no")) {
      await new Promise((ok) => setTimeout(ok, Math.min(MIRAR_MS, fin - Date.now())));
      estados = mirar();
    }
    return estados;
  }

  /**
   * 0.9.0 (JST-246): las frases del Resumen con la voz del Chief of staff. Pone
   * en su fila las que falten, delante y en orden (la que suena primero), y
   * responde cuando la primera está, cuando ya no se puede o a los `ms` (como
   * mucho 20 s, por reloj). Una frase que no pasa las reglas, de una voz que no
   * sea Edge o Kokoro o que no cabe en el cupo queda en «no»: la página la dice
   * con la voz del navegador.
   */
  async esperarResumen(x: unknown, ms: number): Promise<EstadoFrase[]> {
    const p = leerPedidoResumen(x);
    const n = Array.isArray((x as { frases?: unknown } | null)?.frases) ? Math.min(3, (x as { frases: unknown[] }).frases.length) : 0;
    if (!p) {
      this.log("voces: un resumen que no se entiende", {});
      return Array<EstadoFrase>(n).fill("no");
    }
    if (!this.estado().disponible) return p.frases.map(() => "no");
    const voz = vozPorId(p.voz)!;
    const archivos = p.frases.map((t) => (fraseResumenValida(t) ? archivoVivo(voz.id, t) : null));
    let estados = p.frases.map((t, i): EstadoFrase => {
      const archivo = archivos[i];
      if (!archivo) return "no";
      if (existsSync(join(this.dirVoces, archivo))) return "lista";
      if (this.enCurso.has(archivo)) return "fila";
      if (!this.cupoResumen.tomar(p.resumen, t)) return "no";
      return this.encolar(voz, t, true);
    });
    const malas = archivos.filter((a) => !a).length;
    if (malas > 0) this.log("voces: frases del resumen que no pasan sus reglas", { malas });
    for (const f of ["edge", "kokoro"] as const) void this.correr(f);
    const mirar = (): EstadoFrase[] => archivos.map((a) => (!a ? "no" : existsSync(join(this.dirVoces, a)) ? "lista" : this.enCurso.has(a) ? "fila" : "no"));
    const fin = Date.now() + Math.min(ms, ESPERA_OFICINA_MAX_MS);
    while (Date.now() < fin && estados[0] === "fila") {
      await new Promise((ok) => setTimeout(ok, Math.min(MIRAR_MS, fin - Date.now())));
      estados = mirar();
    }
    return estados;
  }

  /** Una fila: de a una frase. Edge y Kokoro no esperan a los clones. */
  private async correr(fila: Fila): Promise<void> {
    if (this.corriendo[fila]) return;
    this.corriendo[fila] = true;
    try {
      for (let t = this.filas[fila].shift(); t; t = this.filas[fila].shift()) {
        if (fila === "clon" && (this.ahora() < this.sinClonesHasta || !this.clonesOk())) {
          this.saltados += 1;
          this.log("voces: sin clones ahora (poco swap o mucha carga)", { voz: t.voz.id });
          this.enCurso.delete(t.archivo);
          continue;
        }
        const control = new AbortController();
        const inicio = this.ahora();
        // Un clon: cada 10 s se vuelve a mirar la Mac y, si se cargó, se corta ahí (no a los 3 min).
        const vigia = fila === "clon" ? setInterval(() => this.clonSigue() || control.abort(new Error("la Mac se cargó")), VIGILAR_MS) : null;
        try {
          mkdirSync(join(this.dirVoces, CARPETA_VIVO), { recursive: true });
          await this.generar(t, join(this.dirVoces, t.archivo), control.signal);
          const ms = this.duracion(t.archivo);
          if (this.botarSiLargo(t.archivo, t.voz.motor, t.texto, ms)) this.saltados += 1;
          else {
            this.anotar(t, ms);
            this.hechos += 1;
          }
        } catch (e) {
          this.saltados += 1;
          if (control.signal.aborted) {
            this.sinClonesHasta = this.ahora() + PAUSA_CLONES_MS;
            this.log("voces: clon cortado (la Mac se cargó)", { voz: t.voz.id, segundos: Math.round((this.ahora() - inicio) / 1000) });
          } else this.log("voces: no se pudo hacer una frase", { voz: t.voz.id, error: (e as Error).message.slice(0, 300) });
        } finally {
          if (vigia) clearInterval(vigia);
          this.enCurso.delete(t.archivo);
        }
      }
    } finally {
      this.corriendo[fila] = false;
      this.motores.dormir(fila, INACTIVO_MS[fila]);
    }
  }

  /** Cuánto dura un MP3 de la carpeta de las voces (ms), o `null` si no se sabe. */
  private duracion(archivo: string): number | null {
    try {
      return duracionMp3(readFileSync(join(this.dirVoces, archivo)));
    } catch {
      // Sin el archivo: sin duración.
      return null;
    }
  }

  /**
   * Un clon que dura demasiado para su texto (JST-255; Qwen3 a veces repite el
   * comienzo al final) se borra y no se anota: la página dice la frase de
   * siempre y, si la vuelve a pedir, se hace otra vez. `true` si se borró.
   */
  private botarSiLargo(archivo: string, motor: Motor, texto: string, ms: number | null): boolean {
    if (filaDe(motor) !== "clon" || ms === null) return false;
    const tope = maximoAudioMs(paraDecir(texto, motor));
    if (ms <= tope) return false;
    rmSync(join(this.dirVoces, archivo), { force: true });
    this.log("voces: un clon dura demasiado para su texto, se bota", { archivo, segundos: ms / 1000, tope: tope / 1000 });
    return true;
  }

  private leerVivo(): IndiceVivo {
    try {
      const leido = JSON.parse(readFileSync(join(this.dirVoces, "vivo.json"), "utf8")) as IndiceVivo;
      if (leido?.version === 1 && leido.audios) return leido;
    } catch {
      // Primera vez, o roto: se arma de nuevo.
    }
    return { version: 1, audios: {} };
  }

  private escribirVivo(indice: IndiceVivo): void {
    const ruta = join(this.dirVoces, "vivo.json");
    writeFileSync(`${ruta}.parcial`, JSON.stringify(indice));
    renameSync(`${ruta}.parcial`, ruta);
  }

  /** Lo hecho queda en `vivo.json` (escrito aparte y renombrado), y se limpia lo viejo. */
  private anotar(t: TrabajoVoz, ms: number | null): void {
    const indice = this.leerVivo();
    indice.audios[t.archivo] = { voz: t.voz.id, texto: t.texto, creado: new Date(this.ahora()).toISOString(), ms };
    limpiarVivo(join(this.dirVoces, CARPETA_VIVO), this.ahora(), (archivo) => delete indice.audios[`${CARPETA_VIVO}/${archivo}`]);
    this.escribirVivo(indice);
  }

  /**
   * Al arrancar (JST-255): los clones que ya estaban guardados y duran
   * demasiado para su texto (los de antes de este tope, como los de 36 s de
   * la QA de la 0.8.0) se borran; se vuelven a hacer cuando se pidan.
   */
  private botarLargosGuardados(): void {
    if (!existsSync(join(this.dirVoces, "vivo.json"))) return;
    const indice = this.leerVivo();
    let botados = 0;
    for (const [archivo, a] of Object.entries(indice.audios)) {
      const voz = vozPorId(a.voz);
      if (!voz || typeof a.ms !== "number" || !this.botarSiLargo(archivo, voz.motor, a.texto, a.ms)) continue;
      delete indice.audios[archivo];
      botados += 1;
    }
    if (botados > 0) this.escribirVivo(indice);
  }

  /**
   * «Empecé» con la tarea (JST-194) o «te necesito» con la pregunta (0.8.0): la
   * pone en su fila, delante, y responde cuando está hecha o a los `ms` (como
   * mucho 25 s: la página vuelve a preguntar si espera más). «lista»: ya está;
   * «no»: no se puede hacer (sin voz, sin uv o ffmpeg, falló o se saltó; un
   * clon con la Mac cargada); «tarde»: no alcanzó.
   */
  async esperar(x: unknown, ms: number): Promise<"lista" | "no" | "tarde"> {
    const r = this.preparar([x]);
    if (r.listas > 0) return "lista";
    if (r.enFila === 0) return "no";
    const p = validarPedido(x)!;
    const archivo = archivoVivo(vozPorId(this.indice()?.agentes[p.agenteId])!.id, textoPedido(p)!);
    const hecha = () => existsSync(join(this.dirVoces, archivo));
    for (let t = 0; t < Math.min(ms, ESPERA_MAX_MS); t += MIRAR_MS) {
      await new Promise((ok) => setTimeout(ok, MIRAR_MS));
      if (hecha()) return "lista";
      if (!this.enCurso.has(archivo)) return "no";
    }
    return hecha() ? "lista" : "tarde";
  }

  /** Paperclip se apaga o reinicia el worker: se cierran los motores (la fila se pierde; la página vuelve a pedir). */
  cerrar(): void {
    for (const f of ["edge", "kokoro", "clon"] as const) this.filas[f] = [];
    this.motores.cerrarTodos();
  }
}

/**
 * Borra lo de más de 7 días y, si la carpeta pasa de ~200 MB, lo más viejo
 * hasta quedar bajo el tope. `alBorrar`: el nombre de cada archivo que se va.
 */
export function limpiarVivo(dir: string, ahora: number, alBorrar: (archivo: string) => void = () => undefined): void {
  let lista: Array<{ f: string; t: number; b: number }>;
  try {
    lista = readdirSync(dir)
      .filter((f) => f.endsWith(".mp3"))
      .map((f) => {
        const s = statSync(join(dir, f));
        return { f, t: s.mtimeMs, b: s.size };
      });
  } catch {
    return;
  }
  lista.sort((a, b) => a.t - b.t);
  let total = lista.reduce((s, x) => s + x.b, 0);
  for (const x of lista) {
    if (ahora - x.t <= VIVO_DIAS_MS && total <= VIVO_MAX_BYTES) continue;
    rmSync(join(dir, x.f), { force: true });
    total -= x.b;
    alBorrar(x.f);
  }
}

/** El entorno de los motores: el `PATH` con que arrancó Paperclip y lo que `uv` necesita (el worker no recibe `HOME`). */
function entorno(): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: homedir(), TMPDIR: tmpdir(), LANG: "en_US.UTF-8", PYTHONUNBUFFERED: "1" };
}

/** Swap libre (MB) según `sysctl vm.swapusage` (macOS), o `null` si no se sabe. */
function swapLibreMb(): number | null {
  try {
    const s = execFileSync("sysctl", ["-n", "vm.swapusage"], { encoding: "utf8", timeout: 2_000 });
    const m = /free = ([\d.]+)M/.exec(s);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

const swapAlcanza = (libre: number | null) => libre === null || libre >= 512;

/**
 * Se puede empezar un clon: la carga de 1 min **y** la de 5 min no pasan de 2
 * procesos por núcleo esperando, y quedan al menos 512 MB de swap libre. Con
 * la de 5 min, que la de 1 baje un momento del tope no basta (JST-198).
 */
export function clonesSeguros(carga: readonly number[] = loadavg(), nucleos = cpus().length, libre = swapLibreMb()): boolean {
  return Math.max(carga[0]!, carga[1]!) <= nucleos * 2 && swapAlcanza(libre);
}

/**
 * Un clon que ya empezó sigue mientras la carga de 1 min sin contarlo a él
 * (`propio`: los núcleos que usa su motor) no pase de 2 por núcleo y quede
 * swap. Así no se corta solo por lo que él mismo suma.
 */
export function clonSigue(carga1: number, propio: number, nucleos: number, libre: number | null): boolean {
  return carga1 - propio <= nucleos * 2 && swapAlcanza(libre);
}

/**
 * Los núcleos que usan un proceso y sus hijos (`uv` y su Python), de la salida
 * de `ps -A -o pid=,ppid=,%cpu=` (con el idioma en español, «66,0»).
 */
export function nucleosDe(ps: string, pid: number): number {
  const cpu = new Map<number, number>();
  const hijos = new Map<number, number[]>();
  for (const linea of ps.split("\n")) {
    const [p, padre, uso] = linea.trim().split(/\s+/).map((x) => Number(x.replace(",", ".")));
    if (!Number.isFinite(p) || !Number.isFinite(padre) || !Number.isFinite(uso)) continue;
    cpu.set(p!, uso!);
    hijos.set(padre!, [...(hijos.get(padre!) ?? []), p!]);
  }
  let total = 0;
  const vistos = new Set<number>();
  for (const pendientes = [pid]; pendientes.length > 0; ) {
    const p = pendientes.pop()!;
    if (vistos.has(p)) continue;
    vistos.add(p);
    total += cpu.get(p) ?? 0;
    pendientes.push(...(hijos.get(p) ?? []));
  }
  return total / 100;
}

/** Lo que usa ahora el motor de los clones, o 0 si no se sabe (entonces cuenta toda la carga). */
function nucleosDelMotor(pid: number | undefined): number {
  if (!pid) return 0;
  try {
    return nucleosDe(execFileSync("ps", ["-A", "-o", "pid=,ppid=,%cpu="], { encoding: "utf8", timeout: 2_000 }), pid);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Los procesos de los motores
// ---------------------------------------------------------------------------

interface Abierto {
  motor: Motor;
  hijo: ChildProcessWithoutNullStreams;
  tmp: string;
  /** La frase que espera su respuesta. */
  espera: { salida: string; ok: () => void; mal: (e: Error) => void; reloj: ReturnType<typeof setTimeout> } | null;
  dormir: ReturnType<typeof setTimeout> | null;
}

/** Un proceso abierto por fila (el modelo queda cargado entre frases), que se cierra si no tiene trabajo. */
class Motores {
  private readonly abiertos = new Map<Fila, Abierto>();

  constructor(
    private readonly raiz: string,
    private readonly log: (m: string, d?: Record<string, unknown>) => void,
  ) {}

  private abrir(fila: Fila, motor: Motor): Abierto {
    const ya = this.abiertos.get(fila);
    if (ya && ya.motor === motor && ya.hijo.exitCode === null && !ya.hijo.killed) {
      if (ya.dormir) clearTimeout(ya.dormir);
      ya.dormir = null;
      return ya;
    }
    // La fila de los clones cambia de motor: el anterior se cierra (uno a la vez, por la memoria).
    if (ya) this.cerrar(fila);
    // En su propio grupo de procesos: al matarlo se mata también el Python que abre `uv` (si no, sigue andando solo).
    const hijo = spawn("uv", comando(this.raiz, motor, "-"), { stdio: ["pipe", "pipe", "pipe"], env: entorno(), detached: true });
    try {
      if (hijo.pid) setPriority(hijo.pid, 10);
    } catch {
      // Sin permiso para bajar la prioridad: sigue igual.
    }
    const a: Abierto = { motor, hijo, tmp: mkdtempSync(join(tmpdir(), `oficina-vivo-${motor}-`)), espera: null, dormir: null };
    let error = "";
    hijo.stderr.on("data", (b: Buffer) => (error = `${error}${b.toString()}`.slice(-1500)));
    createInterface({ input: hijo.stdout }).on("line", (linea) => {
      let r: { salida?: string; error?: string };
      try {
        r = JSON.parse(linea) as typeof r;
      } catch {
        return;
      }
      const e = a.espera;
      if (!e || r.salida !== e.salida) return;
      a.espera = null;
      clearTimeout(e.reloj);
      if (r.error) e.mal(new Error(r.error));
      else e.ok();
    });
    hijo.on("close", (codigo) => {
      if (this.abiertos.get(fila) === a) this.abiertos.delete(fila);
      rmSync(a.tmp, { recursive: true, force: true });
      if (a.espera) {
        clearTimeout(a.espera.reloj);
        a.espera.mal(new Error(`${motor} terminó con ${codigo}: ${error.trim().split("\n").slice(-2).join(" ")}`));
        a.espera = null;
      }
    });
    this.abiertos.set(fila, a);
    this.log("voces: motor abierto", { motor });
    return a;
  }

  /** Una frase: el motor la escribe en su carpeta temporal y ffmpeg la deja lista en `destino`. */
  async generar(t: TrabajoVoz, destino: string, cortar: AbortSignal): Promise<void> {
    const fila = filaDe(t.voz.motor);
    const a = this.abrir(fila, t.voz.motor);
    const salida = join(a.tmp, `${t.archivo.split("/").pop()!.replace(/\.mp3$/, "")}${t.voz.motor === "edge" ? ".edge.mp3" : ".wav"}`);
    // Las mascotas (0.6.0): una voz de Edge más aguda y a su ritmo.
    const tono = t.voz.pitch || t.voz.rate ? { pitch: t.voz.pitch ?? "+0Hz", rate: t.voz.rate ?? "+0%" } : {};
    const trabajo = { texto: paraDecir(t.texto, t.voz.motor), salida, ...datosDeVoz(this.raiz, t.voz.motor, t.voz.clave), ...tono };
    await new Promise<void>((ok, mal) => {
      const listo = () => {
        clearTimeout(reloj);
        cortar.removeEventListener("abort", alCortar);
      };
      // Tope de 3 min por frase, o antes si se corta: se mata el proceso (la próxima frase abre otro).
      const matar = (e: Error) => {
        listo();
        a.espera = null;
        mal(e);
        matarGrupo(a.hijo);
      };
      const alCortar = () => matar(cortar.reason instanceof Error ? cortar.reason : new Error("cortada"));
      const reloj = setTimeout(() => matar(new Error(`más de ${TOPE_FRASE_MS / 1000} s`)), TOPE_FRASE_MS);
      cortar.addEventListener("abort", alCortar, { once: true });
      a.espera = { salida, ok: () => (listo(), ok()), mal: (e) => (listo(), mal(e)), reloj };
      a.hijo.stdin.write(`${JSON.stringify(trabajo)}\n`);
    });
    try {
      convertir(salida, destino, entorno());
    } finally {
      rmSync(salida, { force: true });
    }
  }

  /** Sin trabajo: se cierra a los `ms` (si no llega otra frase antes). */
  dormir(fila: Fila, ms: number): void {
    const a = this.abiertos.get(fila);
    if (!a) return;
    if (a.dormir) clearTimeout(a.dormir);
    a.dormir = setTimeout(() => this.cerrar(fila), ms);
    a.dormir.unref?.();
  }

  private cerrar(fila: Fila): void {
    const a = this.abiertos.get(fila);
    if (!a) return;
    this.abiertos.delete(fila);
    if (a.dormir) clearTimeout(a.dormir);
    a.hijo.stdin.end();
    // Si no termina solo en 10 s, se mata.
    setTimeout(() => a.hijo.exitCode === null && matarGrupo(a.hijo), 10_000).unref?.();
  }

  cerrarTodos(): void {
    for (const f of [...this.abiertos.keys()]) this.cerrar(f);
  }

  /** El proceso del motor abierto en esa fila (para medir lo que usa). */
  pid(fila: Fila): number | undefined {
    const a = this.abiertos.get(fila);
    return a && a.hijo.exitCode === null ? a.hijo.pid : undefined;
  }
}

/** Mata a `uv` y a todo lo que abrió (su grupo de procesos). */
function matarGrupo(hijo: ChildProcessWithoutNullStreams): void {
  try {
    if (hijo.pid) process.kill(-hijo.pid, "SIGKILL");
  } catch {
    // Ya no estaba el grupo.
  }
  // También a `uv` por su lado: así `killed` queda en true y la próxima frase abre otro motor.
  hijo.kill("SIGKILL");
}
