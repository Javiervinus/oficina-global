// Los datos del Resumen (0.9.0, design-spec de JST-245 §3.1), sin React ni
// navegador: el árbol de pedidos y cómo se cuenta cada parte.
//
// - Te esperan y quién trabaja salen de lo que la Oficina ya tiene: las esperas
//   de cada agente (la misma función que levanta la mano, sin `blocker_attention`,
//   JST-135) y los runs vivos.
// - Lo terminado y la cola se leen al abrir el menú (`leerTerminadas` y
//   `leerAbiertas` de `fuentes.ts`, una vez por empresa). Con las abiertas se
//   arma la cola y se sube hasta el pedido de origen; lo que falte de más arriba
//   se lee una vez por tarea (`leerCadena`), como mucho `MAX_PADRES`.
// - Lo terminado va por pedido de origen (la tarea de más arriba). Una rutina
//   («Sincronizar Trello: tableros y listas») va por su título en su empresa: las 8
//   veces son una frase.
import { nombreCorto, pideDe, rolesDeEmpresa } from "../avisos.js";
import type { AgenteOficina, Espera } from "../estado.js";
import { leerCadena, terminadaEn, type Conexion, type EslabonTarea, type FilaTarea } from "../fuentes.js";
import { analizarPregunta, palabrasDichas, preguntaParaVoz, sinBarras, sinPreguntasCitadas, sinRolDelante, tareaParaVoz, type Topes } from "../paraVoz.js";
import { limpiarParaResumen } from "./voz.js";

/** Las tareas de más arriba que faltan se leen de a 4, y como mucho estas por resumen. */
export const MAX_PADRES = 40;

// ---------------------------------------------------------------------------
// El árbol de pedidos
// ---------------------------------------------------------------------------

/** Una tarea en el árbol: `parentId` `undefined` si todavía no se sabe. */
export interface Nodo {
  id: string;
  identifier: string | null;
  titulo: string;
  parentId: string | null | undefined;
  rutina: boolean;
}

export class Arbol {
  readonly nodos = new Map<string, Nodo>();

  sumarFila(f: FilaTarea): void {
    this.sumar({ id: f.id, identifier: f.identifier ?? null, titulo: f.title, parentId: f.parentId ?? null, rutina: f.originKind === "routine_execution" });
  }

  sumar(n: Nodo | EslabonTarea): void {
    const ya = this.nodos.get(n.id);
    // Lo que ya se sabía (un título, el padre) no se pierde con una lectura que no lo trae.
    if (ya) this.nodos.set(n.id, { ...ya, ...n, titulo: n.titulo || ya.titulo, parentId: n.parentId === undefined ? ya.parentId : n.parentId, rutina: ya.rutina || n.rutina });
    else this.nodos.set(n.id, n);
  }

  /** El pedido de origen: subiendo por `parentId` hasta la de más arriba que se conoce. */
  raiz(id: string): Nodo | null {
    let n = this.nodos.get(id) ?? null;
    const vistos = new Set<string>();
    while (n && n.parentId && !vistos.has(n.id)) {
      vistos.add(n.id);
      const p = this.nodos.get(n.parentId);
      if (!p) break;
      n = p;
    }
    return n;
  }

  /** Las tareas de más arriba que faltan para subir desde estas. */
  faltan(ids: Iterable<string>): string[] {
    const r = new Set<string>();
    for (const id of ids) {
      const n = this.raiz(id);
      if (n?.parentId && !this.nodos.has(n.parentId)) r.add(n.parentId);
    }
    return [...r];
  }
}

/**
 * Completa el árbol con las tareas de más arriba que falten (de a 4, como mucho
 * `max`). Cada lectura trae la cadena entera. Si una falla, se cuenta desde la
 * que se conoce. Devuelve cuántas se leyeron.
 */
export async function completarArbol(cx: Conexion, arbol: Arbol, ids: readonly string[], max = MAX_PADRES, leer: typeof leerCadena = leerCadena): Promise<number> {
  let leidas = 0;
  for (let vuelta = 0; vuelta < 8 && leidas < max; vuelta++) {
    const faltan = arbol.faltan(ids).slice(0, max - leidas);
    if (faltan.length === 0) break;
    for (let i = 0; i < faltan.length; i += 4) {
      const lote = faltan.slice(i, i + 4);
      leidas += lote.length;
      const cadenas = await Promise.all(lote.map((id) => leer(cx, id).catch(() => null)));
      cadenas.forEach((c, k) => {
        // Si no se pudo leer, queda como pedido de origen la que la nombra (sin título: no es un pedido nuevo).
        if (!c) arbol.sumar({ id: lote[k]!, identifier: null, titulo: "", parentId: null, rutina: false });
        else for (const n of c) arbol.sumar(n);
      });
    }
  }
  return leidas;
}

// ---------------------------------------------------------------------------
// Las 4 partes
// ---------------------------------------------------------------------------

export interface EmpresaRes {
  id: string;
  prefijo: string;
  nombre: string;
}

/** Lo que te espera (§3.1): una tarjeta, una aprobación o una revisión. */
export interface Toca {
  prefijo: string;
  agenteId: string;
  agente: string;
  /** Lo que pide, para después de «te pide»: «revisar el PR del login con Google»; o la pregunta, para después de «te pregunta:». */
  pide: string;
  /** `pide` es una pregunta («¿Instalo la versión nueva ahora?»). */
  pregunta: boolean;
  tid: string | null;
  desde: number;
  /**
   * El título corto de la tarea, si lo que pide no dice de cuál es (JST-259):
   * la nombraba por su código («¿Apruebas commit + PR de BT-6927?», «BET-508 ·
   * ¿Apruebas commit + PR?») o se repite con otra. Se dice «Es de «…».».
   */
  deTarea?: string | null;
}

/** Una tarea viva de un agente (la de su run). */
export interface TareaViva {
  id: string | null;
  identifier: string | null;
  titulo: string;
}

/** Quién trabaja ahora (§3.1). */
export interface Trabajo {
  prefijo: string;
  agenteId: string;
  agente: string;
  /** Desde que empezó su ejecución (o desde que espera turno, si está en cola). */
  desde: number;
  enCola: boolean;
  /** Sus tareas vivas (la que corre primero), con su pedido de origen. */
  tareas: Array<TareaViva & { raiz: Nodo | null }>;
}

/** Con qué espera una tarea de la cola (§3.1): lista para empezar, otra de la cola, una que ya se está haciendo, a ti, o bloqueada sin otra tarea. */
export type EsperaCola = "lista" | "cola" | "curso" | "ti" | "sin";

export interface EnCola {
  prefijo: string;
  id: string;
  identifier: string | null;
  titulo: string;
  bloqueada: boolean;
  espera: EsperaCola;
  raiz: Nodo | null;
}

/** Un pedido con lo que se terminó (§3.1): por la tarea de más arriba, o una rutina por su título. */
export interface Pedido {
  clave: string;
  prefijo: string;
  titulo: string;
  tid: string | null;
  rutina: boolean;
  n: number;
  /** La última que se terminó (para desempatar). */
  ultima: number;
}

const plano = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

/** Lo terminado por pedido de origen, los más grandes primero. Una rutina cuenta por su título en su empresa. */
export function porPedido(hechas: ReadonlyArray<{ fila: FilaTarea; prefijo: string }>, arbol: Arbol): Pedido[] {
  const m = new Map<string, Pedido>();
  for (const { fila, prefijo } of hechas) {
    const propia: Nodo = { id: fila.id, identifier: fila.identifier ?? null, titulo: fila.title, parentId: null, rutina: fila.originKind === "routine_execution" };
    const r = arbol.raiz(fila.id);
    // Una de más arriba sin título (no se pudo leer) no es un pedido: cuenta la que se terminó.
    const raiz = r && r.titulo ? r : propia;
    const rutina = raiz.rutina || (raiz.id === fila.id && propia.rutina);
    const titulo = raiz.titulo || fila.title;
    const clave = rutina ? `r:${prefijo}:${plano(titulo)}` : `p:${raiz.id}`;
    const t = terminadaEn(fila);
    const ya = m.get(clave);
    if (ya) {
      ya.n += 1;
      if (t > ya.ultima) {
        ya.ultima = t;
        if (rutina) ya.tid = fila.identifier ?? ya.tid;
      }
    } else m.set(clave, { clave, prefijo, titulo, tid: rutina ? (fila.identifier ?? null) : (raiz.identifier ?? fila.identifier ?? null), rutina, n: 1, ultima: t });
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.ultima - a.ultima || a.clave.localeCompare(b.clave));
}

/** Con qué espera una tarea de la cola. `teToca`: las tareas con algo que te espera (tarjetas, aprobaciones, revisiones). */
export function esperaDe(f: FilaTarea, teToca: ReadonlySet<string>): EsperaCola {
  if (teToca.has(f.id) || f.assigneeUserId) return "ti";
  const abiertos = (f.blockedBy ?? []).filter((b) => b.status !== "done" && b.status !== "cancelled");
  if (abiertos.length === 0) return f.status === "blocked" ? "sin" : "lista";
  if (abiertos.some((b) => b.assigneeUserId || teToca.has(b.id))) return "ti";
  if (abiertos.some((b) => b.status === "in_progress" || b.status === "in_review")) return "curso";
  return "cola";
}

/** Los títulos en la voz (§3.3): más cortos que en los avisos. */
export const TOPES_RESUMEN: Topes = { palabras: 11, letras: 64 };

/**
 * Un título como se dice en el resumen (§3.3): sin el rol de adelante («QA —
 * …», «Ingeniero: …»), hasta la primera coma si antes hay 3 palabras o más, y
 * cortado en un límite natural (`tareaParaVoz`, 0.8.0). Las palabras son las
 * que se dicen (JST-272): en «BET-250 · commit, push y PR…» antes de la coma
 * se dice una, «commit», y no se corta ahí; en «Borrador de A, pantalla de B…»,
 * otra («Borrador»: no termina en «de A»).
 */
export function tituloParaVoz(t: string, roles: ReadonlySet<string> = new Set()): string {
  let x = sinRolDelante(String(t ?? ""), roles);
  const raya = x.split(/\s+[—–]\s+/);
  if (raya.length > 1 && raya[0]!.trim().split(/\s+/).length <= 3) x = raya.slice(1).join(" — ");
  const coma = x.indexOf(", ");
  if (coma > 0 && palabrasDichas(tareaParaVoz(x.slice(0, coma), TOPES_RESUMEN)) >= 3) x = x.slice(0, coma);
  return limpiarParaResumen(tareaParaVoz(x, TOPES_RESUMEN) || tareaParaVoz(t, TOPES_RESUMEN));
}

/** El nombre de un agente en la voz: el corto, sin barras ni símbolos (§3.3). */
export function agenteParaVoz(nombre: string): string {
  return limpiarParaResumen(sinBarras(nombreCorto(nombre))) || "Un agente";
}

const sinPunto = (t: string) => t.replace(/[.\s]+$/, "");
/** Primera letra en minúscula, salvo una sigla («QA», «PR»). */
const minuscula = (t: string) => t.replace(/^([¿¡]*)(\p{Lu})(?!\p{Lu})/u, (_m, s: string, l: string) => `${s}${l.toLowerCase()}`);

/** Un código de tarea («BET-508», «BT-6927»), como lo quita la voz. */
const CODIGO_TAREA = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/u;

/** Lo que pide una espera, para el Resumen. */
export interface PideResumen {
  pide: string;
  pregunta: boolean;
  /** Sale de lo que escribió el agente en la tarjeta (la pregunta, o «responder …»), no del título de la tarea. */
  deTarjeta?: boolean;
  /** Ese texto nombraba una tarea por su código, que la voz no dice (JST-259). */
  conCodigo?: boolean;
}

/** Lo que pide una espera (§3.3), con lo de la 0.8.0 (`pideDe`): «aprobar el plan de …», «revisar …», «aprobar …», «elegir tareas: …» (0.9.1) o la pregunta. */
export function pideDeEspera(e: Espera, roles: ReadonlySet<string>): PideResumen {
  const p = pideDe([e], roles);
  const tarea = (x: string | null | undefined) => tituloParaVoz(x ?? "", roles);
  if (p?.tipo === "plan") return { pide: `aprobar el plan de ${tarea(p.texto)}`, pregunta: false };
  if (p?.tipo === "revisar") return { pide: `revisar ${minuscula(tarea(p.texto))}`, pregunta: false };
  if (p?.tipo === "aprobar") return { pide: `aprobar ${minuscula(tarea(p.texto))}`, pregunta: false };
  if (p?.tipo === "elegir") return { pide: `elegir tareas: ${minuscula(tarea(p.texto))}`, pregunta: false };
  if (p?.tipo === "pregunta") {
    const q = analizarPregunta(p.texto, TOPES_RESUMEN);
    const texto = q?.pregunta ? limpiarParaResumen(preguntaParaVoz(p.texto, TOPES_RESUMEN)) : "";
    const conCodigo = CODIGO_TAREA.test(p.texto);
    // También con lo de antes del «¿» (JST-254): «Hotfix de web-admin: ¿commit y PR?», como «te necesito»; antes salía «responder hotfix…».
    if (texto && /¿.*\?$/u.test(texto)) return { pide: texto, pregunta: true, deTarjeta: true, conCodigo };
    return { pide: `responder ${minuscula(sinPunto(tarea(p.texto)))}`, pregunta: false, deTarjeta: true, conCodigo };
  }
  const t = tarea(e.tituloTarea ?? e.titulo);
  return { pide: t ? `responder sobre ${minuscula(t)}` : "una respuesta", pregunta: false };
}

/** Para comparar lo que se dice: minúsculas, sin tildes ni signos. */
const comparable = (t: string) => ` ${t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** Palabras que no dicen de qué tarea es («¿Apruebas commit y PR?», «¿Sigo con esta?»). */
const GENERICAS = new Set(
  "apruebas aprueba aprobar apruebo commit commits merge mergeo mergeas push revisar revisas reviso cambio cambios tarea tareas sigo seguimos ahora puedo quieres hacemos hago queda para como esta este esto estas estos todo toda todos todas solo pero cada otra otro bien algo".split(" "),
);
/** Las palabras de 4 letras o más que no son genéricas («gate», «Exportar»). */
const palabrasDe = (t: string) => new Set(comparable(t).trim().split(" ").filter((w) => w.length >= 4 && !GENERICAS.has(w)));

/**
 * La tarea de cada espera que no dice de cuál es (JST-259): lo escrito en la
 * tarjeta nombraba la tarea por su código y no comparte ninguna palabra con su
 * título («¿Apruebas commit + PR de BT-6927?»), o se dice igual que otra
 * («¿Apruebas commit y PR?» 3 veces). Lleva el título corto de su tarea, si lo
 * hay y no está ya en lo que pide. «BET-544 · ¿Apruebas commit + PR de los
 * tests de Exportar?» ya dice de cuál es: su tarea es «…Exportar falla…».
 */
function conSuTarea(toca: Array<Toca & { pideDe: PideResumen; tituloTarea: string | null; roles: ReadonlySet<string> }>): void {
  // De cuántas tareas distintas se dice lo mismo (2 tarjetas de la misma tarea no se distinguen con su título).
  const tareas = new Map<string, Set<string>>();
  for (const x of toca) tareas.set(comparable(x.pide), (tareas.get(comparable(x.pide)) ?? new Set<string>()).add(x.tid ?? x.tituloTarea ?? ""));
  for (const x of toca) {
    if (!x.pideDe.deTarjeta || !x.tituloTarea) continue;
    const repetida = (tareas.get(comparable(x.pide))?.size ?? 0) > 1;
    if (!repetida) {
      if (!x.pideDe.conCodigo) continue;
      const enTitulo = palabrasDe(x.tituloTarea);
      if ([...palabrasDe(x.pide)].some((w) => enTitulo.has(w))) continue;
    }
    // Sin el «¿…?» de una casilla citada en el título («Mostrar la casilla «¿Es usuario invitado?»…»): va después de la pregunta.
    const t = tituloParaVoz(sinPreguntasCitadas(x.tituloTarea), x.roles).replace(/[¿?¡!]/gu, "");
    if (t && !comparable(x.pide).includes(comparable(t))) x.deTarea = t;
  }
}

/** Lo que te espera, de la más antigua a la más nueva (§3.1 y §3.2.2): las esperas de cada agente de la Oficina. */
export function tocaDe(agentes: readonly AgenteOficina[]): Toca[] {
  const roles = new Map<string, Set<string>>();
  const rolesDe = (companyId: string) => {
    let r = roles.get(companyId);
    if (!r) roles.set(companyId, (r = rolesDeEmpresa(agentes, companyId)));
    return r;
  };
  const toca: Array<Toca & { pideDe: PideResumen; tituloTarea: string | null; roles: ReadonlySet<string> }> = [];
  for (const a of agentes) {
    const corto = agenteParaVoz(a.nombre);
    const roles = rolesDe(a.companyId);
    for (const e of a.teNecesita) {
      const p = pideDeEspera(e, roles);
      toca.push({ prefijo: a.prefijo, agenteId: a.id, agente: corto, pide: p.pide, pregunta: p.pregunta, tid: e.identifier, desde: Date.parse(e.desde ?? "") || 0, pideDe: p, tituloTarea: e.tituloTarea, roles });
    }
  }
  conSuTarea(toca);
  return toca
    .map(({ pideDe: _p, tituloTarea: _t, roles: _r, ...x }) => x)
    .sort((x, y) => x.desde - y.desde || x.agenteId.localeCompare(y.agenteId) || (x.tid ?? "").localeCompare(y.tid ?? ""));
}

/** Quién trabaja ahora (§3.1): los que la Oficina dibuja trabajando, con sus tareas vivas y su pedido. El que lleva más, primero. */
export function trabajanDe(agentes: readonly AgenteOficina[], tareasVivas: (a: AgenteOficina) => readonly TareaViva[], arbol: Arbol | null): Trabajo[] {
  const r: Trabajo[] = [];
  for (const a of agentes) {
    if (a.base !== "trabajando") continue;
    const principal: TareaViva[] = a.run ? [{ id: a.run.issueId, identifier: a.run.identifier, titulo: a.run.titulo ?? "" }] : [];
    const otras = tareasVivas(a).filter((t) => !principal.some((p) => p.id && p.id === t.id));
    const tareas = [...principal, ...otras].map((t) => ({ ...t, raiz: t.id && arbol ? arbol.raiz(t.id) : null }));
    r.push({ prefijo: a.prefijo, agenteId: a.id, agente: agenteParaVoz(a.nombre), desde: Date.parse(a.run?.desde ?? a.desde ?? "") || 0, enCola: !!a.run?.enCola, tareas });
  }
  return r.sort((x, y) => Number(x.enCola) - Number(y.enCola) || x.desde - y.desde || x.agenteId.localeCompare(y.agenteId));
}

/** La cola (§3.1): las `todo` y `blocked` de las abiertas, con qué esperan y su pedido. */
export function colaDe(abiertas: ReadonlyArray<{ fila: FilaTarea; prefijo: string }>, arbol: Arbol, teToca: ReadonlySet<string>): EnCola[] {
  return abiertas
    .filter(({ fila }) => fila.status === "todo" || fila.status === "blocked")
    .map(({ fila, prefijo }) => ({ prefijo, id: fila.id, identifier: fila.identifier ?? null, titulo: fila.title, bloqueada: fila.status === "blocked", espera: esperaDe(fila, teToca), raiz: arbol.raiz(fila.id) }));
}

/** Todo lo de un resumen, ya filtrado por empresas. */
export interface DatosResumen {
  /** Las empresas que entran (las elegidas, o todas, menos las que no respondieron), en el orden de la Oficina. */
  empresas: EmpresaRes[];
  /** Las elegidas que no respondieron (no entran en nada). */
  fallan: EmpresaRes[];
  toca: Toca[];
  trabajan: Trabajo[];
  /** Las terminadas del período, una por tarea (para contarlas por empresa). */
  hechas: Array<{ prefijo: string; id: string }>;
  pedidos: Pedido[];
  cola: EnCola[];
  /** Desde cuándo cuenta lo terminado (ms). */
  inicio: number;
}

/** Lo que se junta para armar un resumen. */
export interface Insumos {
  /** Todas las empresas que el usuario ve, en el orden de la Oficina (por prefijo). */
  empresas: readonly EmpresaRes[];
  /** Los agentes de la Oficina (con sus esperas y su run). */
  agentes: readonly AgenteOficina[];
  /** Las tareas de los runs vivos de un agente. */
  tareasVivas: (a: AgenteOficina) => readonly TareaViva[];
  /** Lo terminado desde el inicio, por empresa (`null`: todavía no llega). */
  terminadas: ReadonlyMap<string, readonly FilaTarea[]>;
  /** Las abiertas, por empresa. */
  abiertas: ReadonlyMap<string, readonly FilaTarea[]>;
  /** Las empresas que no respondieron (la Oficina, lo terminado o las abiertas). */
  fallan: ReadonlySet<string>;
  arbol: Arbol;
  inicio: number;
}

/** Las empresas elegidas (`co`: prefijos; vacío, todas). */
export function elegidasDe(empresas: readonly EmpresaRes[], co: readonly string[]): EmpresaRes[] {
  const e = co.length > 0 ? empresas.filter((x) => co.includes(x.prefijo)) : [...empresas];
  return e.length > 0 ? e : [...empresas];
}

/** Arma los datos de un resumen con lo que hay: sin las empresas que no respondieron. */
export function armarDatos(ins: Insumos, co: readonly string[]): DatosResumen {
  const elegidas = elegidasDe(ins.empresas, co);
  const empresas = elegidas.filter((e) => !ins.fallan.has(e.id));
  const fallan = elegidas.filter((e) => ins.fallan.has(e.id));
  const ids = new Set(empresas.map((e) => e.id));
  const prefijoDe = new Map(ins.empresas.map((e) => [e.id, e.prefijo]));
  const agentes = ins.agentes.filter((a) => ids.has(a.companyId));
  const teToca = new Set(ins.agentes.flatMap((a) => a.teNecesita.map((e) => e.issueId).filter((x): x is string => !!x)));
  const hechasFilas = empresas.flatMap((e) => (ins.terminadas.get(e.id) ?? []).filter((f) => terminadaEn(f) >= ins.inicio).map((fila) => ({ fila, prefijo: e.prefijo })));
  const abiertas = empresas.flatMap((e) => (ins.abiertas.get(e.id) ?? []).map((fila) => ({ fila, prefijo: prefijoDe.get(fila.companyId) ?? e.prefijo })));
  return {
    empresas,
    fallan,
    toca: tocaDe(agentes),
    trabajan: trabajanDe(agentes, ins.tareasVivas, ins.arbol),
    hechas: hechasFilas.map((h) => ({ prefijo: h.prefijo, id: h.fila.id })),
    pedidos: porPedido(hechasFilas, ins.arbol),
    cola: colaDe(abiertas, ins.arbol, teToca),
    inicio: ins.inicio,
  };
}

/** Las tareas cuyo pedido de origen hace falta conocer: las terminadas, las que se hacen y las de la cola. */
export function idsParaArbol(d: Pick<DatosResumen, "hechas" | "trabajan" | "cola">): string[] {
  return [...new Set([...d.hechas.map((h) => h.id), ...d.trabajan.flatMap((t) => t.tareas.map((x) => x.id).filter((x): x is string => !!x)), ...d.cola.map((c) => c.id)])];
}

/** Cuántas hay de cada parte (los números del menú y de la primera frase). */
export function contarPartes(d: Pick<DatosResumen, "toca" | "trabajan" | "hechas" | "cola">): { toca: number; hecho: number; trabajan: number; cola: number } {
  return { toca: d.toca.length, hecho: d.hechas.length, trabajan: d.trabajan.length, cola: d.cola.length };
}
