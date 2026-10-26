// JST-257: la voz del Resumen pide antes el audio de lo que escribió la IA
// (`preparar`) y dice si llega a tiempo, con el worker y la descarga de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FraseResumen } from "../src/resumen/frases.js";

type Estado = "lista" | "fila" | "no";
const pedidos: Array<{ frases: string[]; ms: number }> = [];
/** Lo que responde el worker a cada pedido y cuándo (ms). */
let responde: { estado: Estado; en: number } = { estado: "lista", en: 0 };
const accion = vi.fn(async (_c: unknown, _id: string, _a: string, _co: string, p: { frases: string[]; ms: number }) => {
  pedidos.push({ frases: p.frases, ms: p.ms });
  const { estado, en } = responde;
  // «fila»: el worker espera hasta los `ms` que le dieron.
  await new Promise((ok) => setTimeout(ok, estado === "fila" ? p.ms : en));
  return { estados: p.frases.map((_, i) => (i === 0 ? estado : "fila")) };
});
const bajados = new Map<string, Promise<Blob | null>>();
vi.mock("../src/fuentes.js", () => ({ accionPlugin: (...xs: Parameters<typeof accion>) => accion(...xs) }));
vi.mock("../src/ui/audiosVoces.js", () => ({
  instalacion: async () => "uuid-oficina",
  yaBajado: (a: string) => bajados.get(a) ?? null,
  pedirArchivo: (a: string) => {
    const p = Promise.resolve(new Blob(["mp3"]));
    bajados.set(a, p);
    return p;
  },
}));
const { VozResumen } = await import("../src/ui/resumenVoz.js");

const f = (texto: string): FraseResumen => ({ sec: "toca", texto, ia: true });
const voz = (o: { companyId?: string | null; vozId?: "lorenzo" | null } = {}) =>
  new VozResumen({ voz: Promise.resolve(o.vozId === undefined ? "lorenzo" : o.vozId), resumen: "r-prueba", companyId: o.companyId === undefined ? "co-1" : o.companyId, audio: {} as HTMLAudioElement, alCambiar: () => undefined });

beforeEach(() => {
  vi.useFakeTimers();
  pedidos.length = 0;
  bajados.clear();
  accion.mockClear();
  responde = { estado: "lista", en: 0 };
});
afterEach(() => vi.useRealTimers());

describe("preparar el audio de lo que escribió la IA (JST-257)", () => {
  it("lo pide solo (sin las que siguen) y dice que está cuando el worker lo tiene y se bajó; después, al tiro", async () => {
    responde = { estado: "lista", en: 1_200 };
    const v = voz();
    const r = v.preparar(f("Tienes 3 cosas esperando."), 2_000);
    expect(r).toBeInstanceOf(Promise);
    let listo: boolean | null = null;
    void (r as Promise<boolean>).then((x) => (listo = x));
    await vi.advanceTimersByTimeAsync(1_199);
    expect(listo).toBe(null);
    await vi.advanceTimersByTimeAsync(1);
    expect(listo).toBe(true);
    expect(pedidos.map((p) => p.frases)).toEqual([["Tienes 3 cosas esperando."]]);
    expect(v.preparar(f("Tienes 3 cosas esperando."), 100)).toBe(true);
  });

  it("si no está a los `ms`, `false`; el pedido sigue y otro `preparar` de la misma frase no pide de nuevo", async () => {
    responde = { estado: "lista", en: 3_000 };
    const v = voz();
    let primero: boolean | null = null;
    void (v.preparar(f("Tienes 3 cosas esperando."), 1_100) as Promise<boolean>).then((x) => (primero = x));
    await vi.advanceTimersByTimeAsync(1_100);
    expect(primero).toBe(false);
    let segundo: boolean | null = null;
    void (v.preparar(f("Tienes 3 cosas esperando."), 5_000) as Promise<boolean>).then((x) => (segundo = x));
    await vi.advanceTimersByTimeAsync(1_900);
    expect(segundo).toBe(true);
    expect(accion).toHaveBeenCalledTimes(1);
  });

  it("si el worker dice que no se puede, `false` al tiro", async () => {
    responde = { estado: "no", en: 50 };
    const v = voz();
    let listo: boolean | null = null;
    void (v.preparar(f("Tienes 3 cosas esperando."), 3_000) as Promise<boolean>).then((x) => (listo = x));
    await vi.advanceTimersByTimeAsync(50);
    expect(listo).toBe(false);
  });

  it("con la voz del navegador no hay audio que esperar", async () => {
    expect(voz({ companyId: null }).preparar(f("Hola."), 1_000)).toBe(true);
    // Sin voz del Chief of staff también habla el navegador.
    const sinVoz = voz({ vozId: null });
    await expect(sinVoz.preparar(f("Hola."), 1_000)).resolves.toBe(true);
    expect(accion).not.toHaveBeenCalled();
  });
});
