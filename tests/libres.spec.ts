import { afterEach, describe, expect, it, vi } from "vitest";
import { Sincronizador } from "../src/sincronizador.js";
import { armar, todosLibres } from "../src/ui/useOficina.js";

// BET y MIG con 2 agentes cada una, nadie trabajando.
const EMPRESAS = [
  { id: "c1", name: "Betalandia", issuePrefix: "BET", status: "active" },
  { id: "c2", name: "Migo", issuePrefix: "MIG", status: "active" },
];
const agente = (id: string, companyId: string) => ({ id, companyId, name: id, status: "idle", adapterType: "claude_local" });

/** `fallan`: rutas que responden 500, por ejemplo `c1/attention` o `c2/agents`. */
function api(fallan: readonly string[] = []) {
  return vi.fn(async (url: string) => {
    const ruta = url.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (ruta === "/companies") return json(EMPRESAS);
    const m = /^\/companies\/(c\d)\/(agents|live-runs|attention)/.exec(ruta);
    if (m && fallan.includes(`${m[1]}/${m[2]}`)) return json({ error: "caída" }, 500);
    if (m?.[2] === "agents") return json([agente(`${m[1]}-0`, m[1]!), agente(`${m[1]}-1`, m[1]!)]);
    if (m?.[2] === "live-runs") return json([]);
    if (m?.[2] === "attention") return json({ items: [] });
    return json({}, 404);
  });
}

async function oficinaCon(fallan: readonly string[] = []) {
  vi.stubGlobal("fetch", api(fallan));
  const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
  await sync.iniciar();
  const oficina = armar(sync, {});
  sync.detener();
  return oficina;
}

afterEach(() => vi.unstubAllGlobals());

describe("banner «Todos libres» (design-spec §12, JST-83)", () => {
  it("sale si nadie trabaja ni espera y se leyó toda la oficina", async () => {
    expect(todosLibres(await oficinaCon())).toBe(true);
  });

  it("no sale sin «Te toca»: los que esperaban se ven libres, pero no se sabe si alguien espera", async () => {
    const oficina = await oficinaCon(["c1/attention"]);
    expect(oficina.sinAtencion).toBe(true);
    expect(oficina.agentes.every((a) => a.st === "libre")).toBe(true);
    expect(todosLibres(oficina)).toBe(false);
  });

  it("no sale si una empresa no responde: sus agentes no cuentan", async () => {
    const oficina = await oficinaCon(["c2/agents"]);
    expect(oficina.caidas.map((e) => e.prefijo)).toEqual(["MIG"]);
    expect(todosLibres(oficina)).toBe(false);
  });
});
