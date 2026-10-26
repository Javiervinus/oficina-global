// La reserva de lo que escribió la IA de Chrome (0.7.0, JST-232; punto 10 del
// spike de JST-230), sin React ni navegador: hasta 4 finales por clave
// (`claveDeFinal` de `charlas.ts`: la variante y lo que dicen sus frases fijas)
// y hasta 30 frases sueltas. Como no traen datos, le sirven a cualquier pareja y
// a cualquier pestaña: se guarda en `localStorage` (la pestaña que escribe) y
// las demás la leen con el evento `storage` (`src/ui/ia.ts`).
//
// Lo guardado se vuelve a revisar al leerlo (lo pudo escribir otra versión o
// cambiar a mano): lo que no pasa no se usa. Lo de más de 7 días se bota.
import type { FuenteIa } from "../charlas.js";
import { VERSION_PROMPT } from "./prompt.js";
import { revisarFinal, revisarSuelta } from "./revision.js";

export const CLAVE_RESERVA = "jstm.oficina-pixel.ia";
/** Hasta 4 finales por clave y 30 sueltas: al llegar uno nuevo, se va el más viejo. */
export const POR_CLAVE = 4;
export const MAX_SUELTAS = 30;
/** Como mucho tantas claves (las más viejas se van): unos 40 KB. */
export const MAX_CLAVES = 160;
/** Lo de más de 7 días se bota. */
export const VENCE_MS = 7 * 24 * 60 * 60_000;
/** Cada 15 min, una ráfaga (punto 10 del spike). */
export const CADA_MS = 15 * 60_000;

interface Escrito {
  /** El final (1 o 2 frases) o la suelta. */
  f: string[];
  /** Cuándo lo escribió. */
  en: number;
}

export interface DatosReserva {
  version: 1;
  prompt: string;
  finales: Record<string, Escrito[]>;
  sueltas: Escrito[];
  /** Cuándo empezó la última ráfaga, de cualquier pestaña. */
  rafaga: number;
}

export const reservaVacia = (): DatosReserva => ({ version: 1, prompt: VERSION_PROMPT, finales: {}, sueltas: [], rafaga: 0 });

/** Las frases fijas que se reconstruyen de una clave, para revisar un final guardado (solo cuenta cuántas son y sus textos fijos). */
function fijasDeClave(clave: string): Array<{ texto: string }> {
  const partes = clave.split("|")[1]?.split("/") ?? [];
  return partes.map((p) => ({ texto: p }));
}

/**
 * Lo guardado, revisado: si no es de esta versión del prompt o está roto, una
 * vacía; lo que no pasa la revisión o venció se bota. `nombres`: los de la
 * oficina, que tampoco puede nombrar.
 */
export function leerReserva(texto: string | null, ahora: number, nombres: readonly string[] = []): DatosReserva {
  let g: Partial<DatosReserva> | null = null;
  try {
    g = texto ? (JSON.parse(texto) as Partial<DatosReserva>) : null;
  } catch {
    g = null;
  }
  const r = reservaVacia();
  if (!g || g.version !== 1 || g.prompt !== VERSION_PROMPT) return r;
  r.rafaga = typeof g.rafaga === "number" && Number.isFinite(g.rafaga) ? g.rafaga : 0;
  const vale = (e: unknown): e is Escrito =>
    !!e && typeof e === "object" && Array.isArray((e as Escrito).f) && (e as Escrito).f.every((t) => typeof t === "string") && typeof (e as Escrito).en === "number" && ahora - (e as Escrito).en <= VENCE_MS;
  if (g.finales && typeof g.finales === "object") {
    for (const [clave, lista] of Object.entries(g.finales)) {
      if (!Array.isArray(lista) || !clave.includes("|")) continue;
      const ok = lista.filter((e) => vale(e) && revisarFinal(e.f, fijasDeClave(clave), nombres).length === 0).slice(-POR_CLAVE);
      if (ok.length) r.finales[clave] = ok;
    }
  }
  if (Array.isArray(g.sueltas)) r.sueltas = g.sueltas.filter((e) => vale(e) && e.f.length === 1 && revisarSuelta(e.f[0]!, nombres).length === 0).slice(-MAX_SUELTAS);
  return r;
}

const igual = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((t, i) => t.toLowerCase() === b[i]!.toLowerCase());

/** Suma un final a su clave: si ya está, no; si son más de 4, se va el más viejo. */
export function sumarFinal(r: DatosReserva, clave: string, frases: readonly string[], ahora: number): void {
  const lista = r.finales[clave] ?? [];
  if (lista.some((e) => igual(e.f, frases))) return;
  // La clave vuelve al final del orden (la más reciente); si hay demasiadas, se van las más viejas.
  delete r.finales[clave];
  r.finales[clave] = [...lista, { f: [...frases], en: ahora }].slice(-POR_CLAVE);
  const claves = Object.keys(r.finales);
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_CLAVES))) delete r.finales[k];
}

/** Suma una suelta: si ya está, no; si son más de 30, se va la más vieja. */
export function sumarSuelta(r: DatosReserva, texto: string, ahora: number): void {
  if (r.sueltas.some((e) => e.f[0]!.toLowerCase() === texto.toLowerCase())) return;
  r.sueltas = [...r.sueltas, { f: [texto], en: ahora }].slice(-MAX_SUELTAS);
}

/** Cuántos finales tiene cada clave (para pedir primero las que tienen menos). */
export function cuantos(r: DatosReserva, clave: string): number {
  return r.finales[clave]?.length ?? 0;
}

/** Ya toca otra ráfaga: nunca escribió, o la última empezó hace 15 min o más (o el reloj volvió atrás). */
export function tocaRafaga(r: DatosReserva, ahora: number): boolean {
  return r.rafaga <= 0 || ahora - r.rafaga >= CADA_MS || r.rafaga > ahora;
}

/** La reserva está vacía (la primera ráfaga escribe 4 paquetes; las demás, 2). */
export function vacia(r: DatosReserva): boolean {
  return Object.keys(r.finales).length === 0 && r.sueltas.length === 0;
}

/** Lo que el Guionista usa de la reserva: un final de esa clave (no el último dicho) y una suelta que no se dijo hace poco. */
export function fuenteDe(r: () => DatosReserva): FuenteIa {
  return {
    final(clave, azar, evitar) {
      const lista = (r().finales[clave] ?? []).filter((e) => e.f.join(" ") !== evitar);
      return lista.length ? lista[Math.floor(azar() * lista.length)]!.f : null;
    },
    suelta(azar, recientes) {
      const lista = r().sueltas.filter((e) => !recientes.includes(e.f[0]!));
      return lista.length ? lista[Math.floor(azar() * lista.length)]!.f[0]! : null;
    },
  };
}
