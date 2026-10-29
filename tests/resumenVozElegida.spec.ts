// La voz que el usuario eligió para el Resumen (0.11.0, JST-325; spike de JST-323): la primera frase espera 10 s y
// las demás 8 (con 4 s, Alex caía al navegador en la mitad de las lecturas), y si eligió la del navegador no hay
// audio que esperar ni nada que avisar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FraseResumen } from "../src/resumen/frases.js";

const pedidos: Array<{ voz: string; frases: string[] }> = [];
const accion = vi.fn(async (_c: unknown, _id: string, _a: string, _co: string, p: { voz: string; frases: string[]; ms: number }) => {
  pedidos.push({ voz: p.voz, frases: p.frases });
  // El worker no la tiene a tiempo: responde «fila» cuando se acaba el plazo que le dieron.
  await new Promise((ok) => setTimeout(ok, p.ms));
  return { estados: p.frases.map(() => "fila") };
});
vi.mock("../src/fuentes.js", () => ({ accionPlugin: (...xs: Parameters<typeof accion>) => accion(...xs) }));
vi.mock("../src/ui/audiosVoces.js", () => ({ instalacion: async () => "uuid-oficina", yaBajado: () => null, pedirArchivo: async () => null }));
const { ESPERA_AUDIO_RESUMEN_MS, ESPERA_PRIMERA_MS, VozResumen } = await import("../src/ui/resumenVoz.js");

const f = (texto: string): FraseResumen => ({ sec: "toca", texto });
const voz = (v: "alex" | "dora" | null) => new VozResumen({ voz: Promise.resolve(v), resumen: "r-prueba", companyId: "co-1", audio: {} as HTMLAudioElement, alCambiar: () => undefined });

beforeEach(() => {
  vi.useFakeTimers();
  pedidos.length = 0;
  accion.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("cuánto espera el audio de la voz elegida", () => {
  it("la primera frase 10 s (el motor se abre) y las demás 8 s", () => {
    expect(ESPERA_PRIMERA_MS).toBe(10_000);
    expect(ESPERA_AUDIO_RESUMEN_MS).toBe(8_000);
  });

  it("pide la frase con la voz elegida y, si no llega en 10 s, sigue la del navegador y lo dice", async () => {
    const v = voz("alex");
    const h = v.decir(f("Hola. Hoy tienes 3 cosas."), 1, () => undefined);
    await vi.advanceTimersByTimeAsync(9_500);
    expect(v.modo).toBe("voz");
    expect(v.cayo).toBe(false);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(v.modo).toBe("navegador");
    expect(v.cayo).toBe(true);
    expect(pedidos[0]).toMatchObject({ voz: "alex" });
    h.cortar();
    await vi.runAllTimersAsync();
  });

  it("si eligió la del navegador, no pide nada ni avisa que cayó", async () => {
    const v = voz(null);
    const h = v.decir(f("Hola."), 1, () => undefined);
    await vi.advanceTimersByTimeAsync(50);
    expect(v.modo).toBe("navegador");
    expect(v.cayo).toBe(false);
    expect(accion).not.toHaveBeenCalled();
    h.cortar();
    await vi.runAllTimersAsync();
  });
});
