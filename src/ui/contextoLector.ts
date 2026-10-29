// La lectura de «Leer contexto» (JST-276, design-spec de JST-282 §5 a §7): los
// estados del botón de la barra de arriba, las frases de a una (para saber cuál
// va, «2/5») y lo escrito cuando el navegador no tiene voz en español. Sin React
// ni navegador: la voz y los relojes llegan de afuera (las pruebas los simulan).
//
// - Listo → Cargando (al tiro, al tocar) → Leyendo → Terminó (2,5 s) → Listo.
// - Si falla la carga: No se pudo (4 s) → Listo.
// - Tocar en Cargando o Leyendo lo detiene; en Terminó o No se pudo, lee otra vez.
// - Una voz a la vez (§7): antes de leer se pausa el Resumen (`antesDeLeer`); si
//   otra voz corta la frase que suena, la lectura se detiene (no salta a la siguiente).

export type EstadoContexto = "listo" | "cargando" | "leyendo" | "fin" | "error";

/** Lo que dura «Terminó» y «No se pudo» antes de volver a «Listo» (§5). */
export const FIN_MS = 2_500;
export const ERROR_MS = 4_000;
/** Sin voz, cada frase queda marcada lo que tardaría en leerse: unas 16 letras por segundo, mínimo 1,8 s (§5). */
export const LETRAS_POR_SEGUNDO = 16;
export const MIN_FRASE_MS = 1_800;

export function msEscrita(frase: string): number {
  return Math.max(MIN_FRASE_MS, Math.round((frase.length * 1000) / LETRAS_POR_SEGUNDO));
}

/**
 * Las frases del texto, para decirlas de a una (§5). Corta tras «.», «!», «?» o
 * «…» seguidos de un espacio y de una mayúscula, un número, «¿» o «¡». No corta
 * tras el número de una lista («1. Abrir…»).
 */
export function frasesDe(texto: string): string[] {
  const trozos = texto
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+(?=[¿¡«"(\p{Lu}\p{N}])/u);
  const frases: string[] = [];
  for (const t of trozos) {
    const antes = frases.at(-1);
    if (antes !== undefined && /(?:^|\s)\d{1,2}\.$/.test(antes)) frases[frases.length - 1] = `${antes} ${t}`;
    else if (t) frases.push(t);
  }
  return frases;
}

export interface VozContexto {
  /** Si hay voz en español (puede esperar un poco a que el navegador cargue sus voces). */
  hayVoz(): Promise<boolean>;
  /**
   * Dice la frase. `alTerminar(cortada)`: `cortada` si otra voz la cortó (no llama
   * si la cortó la función que devuelve). `primera`: la primera frase de la lectura.
   */
  decir(frase: string, alTerminar: (cortada: boolean) => void, primera: boolean): () => void;
  /**
   * 0.11.0 (JST-325): con una voz de la lista, pide el audio de las primeras frases y espera el de la primera mientras
   * el estado sigue en «Cargando…» (el motor tarda 3 a 5 s en abrirse). La del navegador no lo necesita.
   */
  preparar?(frases: readonly string[]): Promise<void>;
}

export interface DepsContexto {
  voz: VozContexto;
  programar: (fn: () => void, ms: number) => () => void;
  /** Antes de leer: pausar el Resumen si suena (§7). */
  antesDeLeer?: () => void;
  /** Cambia si está activa (Cargando o Leyendo): el reproductor del Resumen dice «En pausa · lees el contexto». */
  alActivo?: (activo: boolean) => void;
}

export class LectorContexto {
  estado: EstadoContexto = "listo";
  /** La tarea que se lee o se leyó (la de la ruta). */
  tarea: string | null = null;
  frases: string[] = [];
  /** La frase que va (0 a `frases.length - 1`). */
  k = 0;
  /** El navegador no tiene voz en español: lo deja escrito en el panel. */
  sinVoz = false;
  /** Sube con cada cambio (para React). */
  version = 0;
  private lectura = 0;
  private reloj: (() => void) | null = null;
  private cortarVoz: (() => void) | null = null;
  private activoAntes = false;
  private readonly oyentes = new Set<() => void>();

  constructor(private readonly d: DepsContexto) {}

  suscribir = (o: () => void): (() => void) => {
    this.oyentes.add(o);
    return () => this.oyentes.delete(o);
  };

  /** Cargando o Leyendo. */
  activo(): boolean {
    return this.estado === "cargando" || this.estado === "leyendo";
  }

  /** El toque del botón: detiene si está activo; si no, lee (también desde Terminó o No se pudo). */
  tocar(tarea: string, cargar: () => Promise<string>): void {
    if (this.activo()) this.detener();
    else void this.leer(tarea, cargar);
  }

  async leer(tarea: string, cargar: () => Promise<string>): Promise<void> {
    this.parar();
    const n = ++this.lectura;
    this.d.antesDeLeer?.();
    this.tarea = tarea;
    this.frases = [];
    this.k = 0;
    this.sinVoz = false;
    this.estado = "cargando";
    this.avisar();
    let texto: string;
    let hayVoz: boolean;
    try {
      [texto, hayVoz] = await Promise.all([cargar(), this.d.voz.hayVoz().catch(() => false)]);
    } catch {
      if (n !== this.lectura) return;
      this.estado = "error";
      this.avisar();
      this.reloj = this.d.programar(() => this.volverListo(n, "error"), ERROR_MS);
      return;
    }
    if (n !== this.lectura) return;
    this.frases = frasesDe(texto);
    this.sinVoz = !hayVoz;
    if (this.frases.length === 0) {
      this.terminar(n);
      return;
    }
    // Con una voz de la lista, el audio de la primera frase se espera aquí, en «Cargando…».
    if (hayVoz && this.d.voz.preparar) {
      await this.d.voz.preparar(this.frases).catch(() => undefined);
      if (n !== this.lectura) return;
    }
    this.estado = "leyendo";
    this.avisar();
    this.decir(n);
  }

  /** Detener (la X, salir de la tarea o el Resumen que sigue): vuelve a Listo y corta lo que suena. */
  detener(): void {
    const habia = this.estado !== "listo";
    this.lectura += 1;
    this.parar();
    this.estado = "listo";
    this.k = 0;
    this.sinVoz = false;
    if (habia) this.avisar();
  }

  private decir(n: number): void {
    const f = this.frases[this.k]!;
    const sigue = () => {
      if (n !== this.lectura || this.estado !== "leyendo") return;
      this.reloj = null;
      this.cortarVoz = null;
      if (this.k + 1 >= this.frases.length) {
        this.terminar(n);
        return;
      }
      this.k += 1;
      this.avisar();
      this.decir(n);
    };
    if (this.sinVoz) {
      this.reloj = this.d.programar(sigue, msEscrita(f));
      return;
    }
    this.cortarVoz = this.d.voz.decir(
      f,
      (cortada) => {
        if (n !== this.lectura) return;
        this.cortarVoz = null;
        // Otra voz tomó el navegador: no se sigue leyendo encima.
        if (cortada) this.detener();
        else sigue();
      },
      this.k === 0,
    );
  }

  private terminar(n: number): void {
    this.parar();
    this.estado = "fin";
    this.k = Math.max(0, this.frases.length - 1);
    this.avisar();
    this.reloj = this.d.programar(() => this.volverListo(n, "fin"), FIN_MS);
  }

  private volverListo(n: number, desde: EstadoContexto): void {
    if (n !== this.lectura || this.estado !== desde) return;
    this.reloj = null;
    this.estado = "listo";
    this.k = 0;
    this.sinVoz = false;
    this.avisar();
  }

  /** Corta el reloj y la voz de la lectura que va. */
  private parar(): void {
    this.reloj?.();
    this.reloj = null;
    const c = this.cortarVoz;
    this.cortarVoz = null;
    c?.();
  }

  private avisar(): void {
    this.version += 1;
    const activo = this.activo();
    if (activo !== this.activoAntes) {
      this.activoAntes = activo;
      this.d.alActivo?.(activo);
    }
    for (const o of this.oyentes) o();
  }
}

/** La tarea de la ruta `/{prefijo}/issues/{código o id}`; `null` en las demás páginas (también las listas de tareas). */
const LISTAS = new Set(["active", "all", "backlog", "done", "recent"]);
export function tareaDeRuta(pathname: string): string | null {
  const m = pathname.match(/^\/[^/]+\/issues\/([^/]+)\/?$/);
  if (!m) return null;
  let ref: string;
  try {
    ref = decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
  return ref && !LISTAS.has(ref.toLowerCase()) ? ref : null;
}
