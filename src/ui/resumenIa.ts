// La IA de Chrome escribe el Resumen (0.9.0, design-spec de JST-245 §3.4): la
// misma sesión de Gemini Nano de la 0.7.0, pedida al apretar «Leer» (no en la
// reserva de cada 15 min), parte por parte, con los datos ya contados.
//
// - Solo en Chrome del computador con la IA lista; si no, el Resumen va con
//   frases armadas (y el menú lo dice).
// - Le pregunta al worker si la Mac está libre (`ia-permiso`, el de la 0.7.0) y
//   toma el candado `oficina-ia`: si otra pestaña o una ráfaga la está usando,
//   van las armadas.
// - Cada parte se pide cuando sus armadas están (toca primero: es lo que se lee
//   después de los números) y se revisa con `leerParteIa`. Lo que no pasa, o lo
//   que llega cuando el lector ya pasó por esa parte, no se usa.
// - Al cerrar el resumen se corta todo (`signal`).
import { accionPlugin } from "../fuentes.js";
import { OPCIONES_MODELO, type SesionIa } from "../ia/escritor.js";
import { EJEMPLO_PEDIDO_RESUMEN, EJEMPLO_RESPUESTA_RESUMEN, leerParteIa, pedidoIa, SISTEMA_RESUMEN, VERSION_PROMPT_RESUMEN } from "../resumen/ia.js";
import type { FraseResumen, Seccion } from "../resumen/frases.js";
import { instalacion } from "./audiosVoces.js";
import { candadoIa, escritorIa, modeloIa } from "./ia.js";

/** Lo más que se espera la sesión (cargar el modelo tardó 9–31 s en el spike de JST-230) y cada parte. */
export const TOPE_SESION_RESUMEN_MS = 30_000;
export const TOPE_PARTE_MS = 15_000;
const TOPE_LETRAS_PARTE = 3_000;

/** La IA de Chrome puede escribir el Resumen aquí (Chrome del computador, con la IA bajada y lista). */
export function iaParaResumen(): boolean {
  const e = escritorIa().estado();
  return !!modeloIa() && (e.k === "lista" || e.k === "pausa");
}

/** Lo que pasó con cada parte (para la QA: `window.__oficinaResumen()`). */
export interface RegistroIa {
  t: number;
  sec: Seccion | "sesion" | "permiso";
  ms: number;
  ok: boolean;
  mal: string[];
  version: string;
}

export interface ParteParaIa {
  sec: Seccion;
  /** Las armadas de esa parte, cuando están (`null`: no se pudieron armar). */
  armadas: () => Promise<FraseResumen[] | null>;
}

async function* trozos(s: AsyncIterable<string> | ReadableStream<string>): AsyncGenerator<string> {
  if (Symbol.asyncIterator in s) {
    for await (const t of s as AsyncIterable<string>) yield t;
    return;
  }
  const r = (s as ReadableStream<string>).getReader();
  for (;;) {
    const { value, done } = await r.read();
    if (done) return;
    yield value;
  }
}

/** Un `AbortSignal` que se corta con `padre` o a los `ms`. */
function conTope(padre: AbortSignal, ms: number): { signal: AbortSignal; soltar: () => void } {
  const c = new AbortController();
  const alCortar = () => c.abort();
  padre.addEventListener("abort", alCortar, { once: true });
  const reloj = setTimeout(() => c.abort(), ms);
  return {
    signal: c.signal,
    soltar: () => {
      clearTimeout(reloj);
      padre.removeEventListener("abort", alCortar);
    },
  };
}

/**
 * Escribe las partes con la IA, en orden. Cada una llega por `alParte` (sus
 * frases, o `false` si no va). Si la IA no se puede usar ahora, todas `false`.
 */
export async function escribirResumen(o: {
  partes: readonly ParteParaIa[];
  nombres: readonly string[];
  companyId: string | null;
  signal: AbortSignal;
  alParte: (sec: Seccion, frases: FraseResumen[] | false) => void;
  anotar: (r: RegistroIa) => void;
}): Promise<void> {
  const todasNo = () => {
    for (const p of o.partes) o.alParte(p.sec, false);
  };
  const m = modeloIa();
  if (!m || !iaParaResumen() || o.partes.length === 0) {
    todasNo();
    return;
  }
  const t0 = Date.now();
  // La Mac está libre (la carga y los clones, como para las ráfagas de la 0.7.0).
  const id = await instalacion().catch(() => null);
  const permiso = id && o.companyId ? await accionPlugin<{ escribir: boolean }>({ base: "" }, id, "ia-permiso", o.companyId, {}).catch(() => null) : null;
  if (!permiso?.escribir) {
    o.anotar({ t: Date.now(), sec: "permiso", ms: Date.now() - t0, ok: false, mal: [permiso ? "la Mac está ocupada" : "sin respuesta del worker"], version: VERSION_PROMPT_RESUMEN });
    todasNo();
    return;
  }
  const hecho = await candadoIa(async () => {
    const s0 = Date.now();
    const tope = conTope(o.signal, TOPE_SESION_RESUMEN_MS);
    let base: SesionIa;
    try {
      base = await m.create({
        ...OPCIONES_MODELO,
        initialPrompts: [
          { role: "system", content: SISTEMA_RESUMEN },
          { role: "user", content: EJEMPLO_PEDIDO_RESUMEN },
          { role: "assistant", content: EJEMPLO_RESPUESTA_RESUMEN },
        ],
        signal: tope.signal,
      });
    } catch (e) {
      o.anotar({ t: Date.now(), sec: "sesion", ms: Date.now() - s0, ok: false, mal: [String((e as Error)?.message ?? e).slice(0, 160)], version: VERSION_PROMPT_RESUMEN });
      return false;
    } finally {
      tope.soltar();
    }
    o.anotar({ t: Date.now(), sec: "sesion", ms: Date.now() - s0, ok: true, mal: [], version: VERSION_PROMPT_RESUMEN });
    try {
      for (const p of o.partes) {
        if (o.signal.aborted) break;
        const armadas = await p.armadas();
        if (!armadas || armadas.length === 0 || o.signal.aborted) {
          o.alParte(p.sec, false);
          continue;
        }
        const pedido = pedidoIa(p.sec, armadas);
        const p0 = Date.now();
        const t = conTope(o.signal, TOPE_PARTE_MS);
        let salida = "";
        let copia: SesionIa | null = null;
        let error: string | null = null;
        try {
          copia = await base.clone({ signal: t.signal });
          for await (const x of trozos(copia.promptStreaming(pedido.texto, { responseConstraint: pedido.esquema, signal: t.signal }))) {
            salida += x;
            if (salida.length > TOPE_LETRAS_PARTE) throw new Error("escribió de más");
          }
        } catch (e) {
          error = t.signal.aborted ? "se demoró" : String((e as Error)?.message ?? e).slice(0, 160);
        } finally {
          t.soltar();
          copia?.destroy();
        }
        const leido = error ? { frases: null, mal: [error] } : leerParteIa(salida, armadas, o.nombres);
        o.anotar({ t: Date.now(), sec: p.sec, ms: Date.now() - p0, ok: !!leido.frases, mal: leido.mal.slice(0, 6), version: VERSION_PROMPT_RESUMEN });
        o.alParte(p.sec, leido.frases ?? false);
      }
    } finally {
      base.destroy();
    }
    return true;
  });
  if (!hecho) {
    if (hecho === null) o.anotar({ t: Date.now(), sec: "permiso", ms: Date.now() - t0, ok: false, mal: ["la IA la está usando otra pestaña"], version: VERSION_PROMPT_RESUMEN });
    todasNo();
  }
}
