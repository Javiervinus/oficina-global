// Lista de agentes bajo la oficina (design-spec de JST-95 §3), sin React:
// grupos por urgencia, orden dentro de cada grupo y la línea de contexto.
import { ESPERAS, ESTADOS, desdeCuando, hace, motivoPausa, runCorto, type AgenteVista, type Dibujo } from "./vista.js";
import type { Espera } from "./estado.js";

export type Grupo = "toca" | "error" | "trabaja" | "pausa" | "libre";

export const GRUPOS: ReadonlyArray<{ k: Grupo; label: string; icono: string; pista: string | null }> = [
  { k: "toca", label: "Te necesitan", icono: "hand", pista: "el que espera hace más, arriba" },
  { k: "error", label: "Con error", icono: "triangle-alert", pista: "el más reciente, arriba" },
  { k: "trabaja", label: "Trabajando", icono: "keyboard", pista: "el que empezó último, arriba" },
  { k: "pausa", label: "En pausa", icono: "moon", pista: null },
  { k: "libre", label: "Libres", icono: "coffee", pista: null },
];

/** En el celular vienen plegados «En pausa» y «Libres» (§3). */
export const PLEGADOS_CELULAR: readonly Grupo[] = ["pausa", "libre"];

/** Quien te espera va solo en «Te necesitan», en cualquier estado; los demás, en el de su estado. */
export function grupoDe(a: AgenteVista): Grupo {
  return a.need ? "toca" : a.st;
}

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** La espera más antigua (ms). */
export function primeraEspera(a: AgenteVista): number {
  const t = a.teNecesita.map((e) => ms(e.desde)).filter((x) => x > 0);
  return t.length ? Math.min(...t) : 0;
}

/**
 * Orden dentro de un grupo: en «Te necesitan», la espera más antigua primero;
 * en los demás, `since` más reciente primero (en «Trabajando», el que empezó
 * último). Si empatan, por prefijo de empresa y después por nombre.
 */
export function comparar(a: AgenteVista, b: AgenteVista): number {
  const g = grupoDe(a);
  const t = g === "toca" ? primeraEspera(a) - primeraEspera(b) : ms(b.desde) - ms(a.desde);
  return t || a.prefijo.localeCompare(b.prefijo) || a.nombre.localeCompare(b.nombre) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface GrupoLista {
  k: Grupo;
  label: string;
  icono: string;
  agentes: AgenteVista[];
  /** Los de este estado que van arriba porque además te necesitan («y 1 más arriba…»). */
  arriba: number;
  /** «el que espera hace más, arriba» (solo computador, con 2 o más). */
  pista: string | null;
}

/**
 * Los 5 grupos en orden, sin los vacíos. `sinAtencion`: «Te toca» no
 * respondió; «Te necesitan» se muestra igual, con «?» (§3, estados).
 */
export function agrupar(agentes: readonly AgenteVista[], sinAtencion = false): GrupoLista[] {
  return GRUPOS.map((g) => {
    const lista = agentes.filter((a) => grupoDe(a) === g.k).sort(comparar);
    const arriba = g.k === "toca" ? 0 : agentes.filter((a) => a.need && a.st === g.k).length;
    return { k: g.k, label: g.label, icono: g.icono, agentes: lista, arriba, pista: g.pista };
  }).filter((g) => g.agentes.length > 0 || (g.k === "toca" && sinAtencion));
}

/** «· y 1 más arriba, que además te necesita» o la pista del orden. `null` si no va nada. */
export function notaGrupo(g: GrupoLista, celular: boolean): string | null {
  if (g.arriba > 0) return `· y ${g.arriba} más arriba, que además te ${g.arriba === 1 ? "necesita" : "necesitan"}`;
  if (!celular && g.pista && g.agentes.length > 1) return `· ${g.pista}`;
  return null;
}

/** La tarea que se muestra en la fila: la de la espera, la del run o la última (si se conoce). */
export interface TareaFila {
  identifier: string;
  titulo: string | null;
}

export interface LineaFila {
  tarea: TareaFila | null;
  contexto: string;
  /** Color de la línea de contexto: violeta (te espera) o rojo (error). */
  tono: "toca" | "error" | null;
}

function preguntaDe(e: Espera): string {
  return e.titulo ?? ESPERAS[e.tipo].label;
}

/**
 * Lo que dice la fila (§3): código y título de la tarea, y debajo una línea de
 * contexto. `ultima`: la última tarea de un agente libre o en pausa, si se leyó.
 * `errorCode`: el código del último run de un agente con error, si se conoce
 * («adapter_failed · ‹motivo›»).
 */
export function lineaDe(a: AgenteVista, ahora: number, ultima?: TareaFila | null, errorCode?: string | null): LineaFila {
  if (a.need) {
    const e = a.teNecesita[0]!;
    const n = a.teNecesita.length;
    return {
      tarea: e.identifier ? { identifier: e.identifier, titulo: e.tituloTarea } : null,
      contexto: `Espera: ${preguntaDe(e)}${n > 1 ? ` (+${n - 1})` : ""}`,
      tono: "toca",
    };
  }
  const delRun = a.run?.identifier ? { identifier: a.run.identifier, titulo: a.run.titulo } : null;
  switch (a.st) {
    case "error": {
      const motivo = a.motivo ?? "El último run terminó con error.";
      return { tarea: delRun ?? ultima ?? null, contexto: errorCode ? `${errorCode} · ${motivo}` : motivo, tono: "error" };
    }
    case "trabaja":
      return {
        tarea: delRun,
        contexto: a.run?.enCola ? "En cola, parte en segundos" : `Run ${runCorto(a.run?.id ?? "")} · empezó ${hace(a.run?.desde ?? a.desde, ahora)}`,
        tono: null,
      };
    case "pausa": {
      const motivo = a.motivo ? motivoPausa(a.motivo) : ESTADOS.pausa.label;
      return { tarea: ultima ?? null, contexto: `${motivo} · ${desdeCuando(a.desde, ahora)}`, tono: null };
    }
    default:
      return { tarea: ultima ?? null, contexto: `${ultima ? "Última tarea · " : ""}En la sala de descanso ${hace(a.desde, ahora)}`, tono: null };
  }
}

/** Lo que va a la derecha de la fila en computador: el botón «Responder», «⚠ hace 4 min» o «hace X». */
export function cuandoFila(a: AgenteVista, ahora: number): string {
  if (a.need) return hace(new Date(primeraEspera(a) || Date.now()).toISOString(), ahora);
  return hace(a.desde, ahora);
}

/**
 * Tocar una fila (o un personaje) hace lo mismo (§3): quien solo te espera
 * (libre y con algo pendiente, sin run) abre directo la ventana para
 * responder; en los demás casos se abre su ficha.
 */
export function abreVentana(a: AgenteVista): boolean {
  return a.st === "toca";
}

/** Los estados que se dibujan en la fila, con sus íconos (§3). */
export function chipsDe(a: AgenteVista): Array<{ st: Dibujo; texto: string }> {
  // Quien solo te espera lleva «Te necesita» (el número va en «Responder · 3»); quien además trabaja,
  // tiene error o está en pausa suma el violeta, con el número si espera 2 o más.
  if (a.st === "toca") return [{ st: "toca", texto: ESTADOS.toca.label }];
  const chips: Array<{ st: Dibujo; texto: string }> = [{ st: a.st, texto: a.st === "trabaja" && a.run?.enCola ? "En cola" : ESTADOS[a.st].label }];
  if (a.need) chips.push({ st: "toca", texto: a.teNecesita.length > 1 ? `Te necesita · ${a.teNecesita.length}` : "Te necesita" });
  return chips;
}
