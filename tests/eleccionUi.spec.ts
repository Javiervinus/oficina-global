// Elegir las voces, en la página (JST-329): si cambiar la voz de un agente (o «Volver») es instantáneo porque sus
// audios ya existen, no hay un fin de grabación que haga releer el índice: la fila quedaba con la voz de antes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eleccionInicial } from "../src/eleccionVoces.js";

const cargarIndice = vi.fn(async (_forzar?: boolean) => null);
const accionPlugin = vi.fn();

vi.mock("../src/ui/audiosVoces.js", () => ({ baseUi: async () => "/_plugins/x/ui/", cargarIndice: (f?: boolean) => cargarIndice(f), instalacion: async () => "x" }));
vi.mock("../src/fuentes.js", () => ({ accionPlugin: (...a: unknown[]) => accionPlugin(...a) }));
vi.mock("../src/ui/vozViva.js", () => ({ estadoVozViva: async () => null }));
const { cambiaIndice, elegirLectura, elegirVozAgente, reiniciarVoces } = await import("../src/ui/eleccion.js");

const AGENTE = { id: "a1", corto: "Diseño", empresa: "Acme" };

beforeEach(() => {
  cargarIndice.mockClear();
  accionPlugin.mockReset();
  // El worker responde que ya lo hizo y que no hay nada grabándose.
  accionPlugin.mockImplementation(async (_cx: unknown, _id: string, clave: string) =>
    clave === "voz-estado" ? { disponible: true, motivo: null, eleccion: eleccionInicial(), grabando: [], cambios: false } : { ok: true, eleccion: eleccionInicial() },
  );
});

describe("releer el índice al cambiar la voz de un agente", () => {
  it("la voz de un agente que no necesita grabar: se relee el índice sin esperar una grabación", async () => {
    await elegirVozAgente("c1", AGENTE, "catalina");
    expect(cargarIndice).toHaveBeenCalledWith(true);
  });

  it("«Volver a como estaba» también", async () => {
    await reiniciarVoces("c1");
    expect(cargarIndice).toHaveBeenCalledWith(true);
  });

  it("si el worker rechaza el cambio no hay nada que releer", async () => {
    accionPlugin.mockImplementation(async (_cx: unknown, _id: string, clave: string) =>
      clave === "voz-estado" ? { disponible: true, motivo: null, eleccion: eleccionInicial(), grabando: [], cambios: false } : { ok: false, motivo: "sin-mac", eleccion: eleccionInicial() },
    );
    await elegirVozAgente("c1", AGENTE, "catalina");
    expect(cargarIndice).not.toHaveBeenCalled();
  });

  it("la voz del Resumen o de «Leer contexto» no toca la fila de ningún agente", async () => {
    await elegirLectura("c1", "contexto", "igual");
    expect(cargarIndice).not.toHaveBeenCalled();
  });

  it("solo cambian el índice los pedidos de agente y «Volver»", () => {
    expect(cambiaIndice("voz-elegir", { quien: "agente" })).toBe(true);
    expect(cambiaIndice("voz-reiniciar", {})).toBe(true);
    expect(cambiaIndice("voz-elegir", { quien: "resumen" })).toBe(false);
    expect(cambiaIndice("voz-calentar", {})).toBe(false);
  });
});
