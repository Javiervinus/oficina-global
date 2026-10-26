import { afterEach, describe, expect, it, vi } from "vitest";
import { Sincronizador } from "../src/sincronizador.js";
import { armar, formaNueva, salasDeForma } from "../src/ui/useOficina.js";

// JST-77 · 1A: BET tiene 2 agentes, MIG no responde y PER (Personal) no tiene agentes.
const EMPRESAS = [
  { id: "c1", name: "Betalandia", issuePrefix: "BET", status: "active" },
  { id: "c2", name: "Migo", issuePrefix: "MIG", status: "active" },
  { id: "c3", name: "Personal", issuePrefix: "PER", status: "active" },
];
const agente = (id: string, companyId: string) => ({ id, companyId, name: id, status: "idle", adapterType: "claude_local" });

function api(caidas: readonly string[], agentesDe: Record<string, number> = { c1: 2, c2: 2, c3: 0 }) {
  return vi.fn(async (url: string) => {
    const ruta = url.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (ruta === "/companies") return json(EMPRESAS);
    const m = /^\/companies\/(c\d)\/(agents|live-runs|attention)/.exec(ruta);
    if (m && caidas.includes(m[1]!)) return json({ error: "caída" }, 500);
    if (m?.[2] === "agents") return json(Array.from({ length: agentesDe[m[1]!] ?? 0 }, (_, i) => agente(`${m[1]}-${i}`, m[1]!)));
    if (m?.[2] === "live-runs") return json([]);
    if (m?.[2] === "attention") return json({ items: [] });
    return json({}, 404);
  });
}

afterEach(() => vi.unstubAllGlobals());

const prefijos = (lista: readonly { prefijo: string }[]) => lista.map((e) => e.prefijo);

describe("qué empresas se dibujan (design-spec §2, JST-77 · 1A)", () => {
  it("una empresa sin agentes no se dibuja; una que nunca se pudo leer, sí (a oscuras)", async () => {
    vi.stubGlobal("fetch", api(["c2"]));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    const oficina = armar(sync, {});
    expect(prefijos(oficina.empresas)).toEqual(["BET", "MIG"]);
    expect(prefijos(oficina.ocultas)).toEqual(["PER"]);
    expect(prefijos(oficina.caidas)).toEqual(["MIG"]);
    sync.detener();
  });

  it("si la forma guardada dice 0, tampoco se dibuja su esqueleto mientras carga", () => {
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    sync.empresas = EMPRESAS;
    const oficina = armar(sync, { c1: 9, c3: 0 });
    expect(prefijos(oficina.empresas)).toEqual(["BET", "MIG"]);
    expect(oficina.empresas.map((e) => e.agentes)).toEqual([9, 3]);
    expect(prefijos(oficina.ocultas)).toEqual(["PER"]);
  });

  it("si falla una empresa que no se dibuja, no avisa ni cuenta en «N de N»", async () => {
    vi.stubGlobal("fetch", api(["c3"]));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    const oficina = armar(sync, { c3: 0 });
    expect(prefijos(oficina.empresas)).toEqual(["BET", "MIG"]);
    expect(oficina.caidas).toEqual([]);
    expect(oficina.cargando).toBe(false);
    sync.detener();
  });

  it("si al recargar falla una empresa sin agentes, la forma guardada la sigue ocultando (JST-82)", async () => {
    vi.stubGlobal("fetch", api(["c3"]));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    const forma = formaNueva(sync, { c1: 2, c2: 2, c3: 0, borrada: 4 });
    expect(forma).toEqual({ c1: 2, c2: 2, c3: 0 });
    const oficina = armar(sync, forma);
    expect(prefijos(oficina.empresas)).toEqual(["BET", "MIG"]);
    expect(oficina.caidas).toEqual([]);
    // Sin nada guardado de ella, sigue siendo una empresa que nunca se pudo leer.
    expect(formaNueva(sync, {})).toEqual({ c1: 2, c2: 2 });
    sync.detener();
  });

  it("cuando recibe su primer agente, su sala aparece sola; si se queda sin agentes, desaparece", async () => {
    const agentes: Record<string, number> = { c1: 2, c2: 2, c3: 0 };
    vi.stubGlobal("fetch", api([], agentes));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    expect(prefijos(armar(sync, {}).empresas)).toEqual(["BET", "MIG"]);
    // Lo que hace el canal en vivo con «agent.created» o «agent.terminated»: vuelve a leer los agentes de esa empresa.
    agentes.c3 = 1;
    await sync.recargar("c3", ["agentes"]);
    expect(prefijos(armar(sync, {}).empresas)).toEqual(["BET", "MIG", "PER"]);
    agentes.c3 = 0;
    await sync.recargar("c3", ["agentes"]);
    expect(prefijos(armar(sync, {}).empresas)).toEqual(["BET", "MIG"]);
    sync.detener();
  });
});

describe("salas guardadas para la escala del piso vacío (JST-89)", () => {
  it("son las que dibuja `armar` con la forma: con prefijo, sin las de 0 agentes y con 3 si no se sabe", () => {
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    sync.empresas = EMPRESAS;
    for (const forma of [{ c1: 9, c3: 0 }, { c1: 2, c2: 4, c3: 1 }, {}] as Record<string, number>[]) {
      const dibujadas = armar(sync, forma).empresas.map((e) => ({ prefijo: e.prefijo, agentes: e.agentes }));
      expect(salasDeForma(sync, forma)).toEqual(dibujadas);
    }
    expect(salasDeForma(sync, { c1: 9, c3: 0 })).toEqual([{ prefijo: "BET", agentes: 9 }, { prefijo: "MIG", agentes: 3 }]);
  });
});
