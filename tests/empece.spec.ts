// «Empecé» con la tarea (JST-194, del QA de JST-168): espera su nombre y su audio, como mucho 20 s, sin frenar a las demás frases.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmpeceEnEspera, ESPERA_EMPECE_MS, type AgenteEmpece } from "../src/empece.js";
import type { PedidoVoz } from "../src/vozViva.js";

const accion = vi.hoisted(() => vi.fn());
vi.mock("../src/fuentes.js", () => ({ accionPlugin: (...xs: unknown[]) => accion(...xs) }));
vi.mock("../src/ui/audiosVoces.js", () => ({ instalacion: async () => "uuid-oficina" }));
const { esperarFrase, prepararFrases } = await import("../src/ui/vozViva.js");

const QA = "QA de «Oficina global» con las 4 empresas, en computador y en celular";
const agente = (id: string, issueId: string | null, titulo: string | null = null): AgenteEmpece => ({ id, run: issueId ? { issueId, titulo } : null });

/** Una espera de mentira: lo que pidió, lo que dijo y cómo soltar cada pedido. */
function armar() {
  const pedidos: Array<{ id: string; tarea: string; listo: () => void }> = [];
  const dichos: Array<[string, string | null]> = [];
  const e = new EmpeceEnEspera<AgenteEmpece>({
    esperar: (a, tarea) => new Promise<void>((ok) => pedidos.push({ id: a.id, tarea, listo: ok })),
    decir: (a, tarea) => dichos.push([a.id, tarea]),
  });
  return { e, pedidos, dichos };
}

describe("«empecé» con la tarea espera su audio", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("con el nombre ya leído, pide el audio al empezar y lo dice apenas está, con la tarea", async () => {
    const { e, pedidos, dichos } = armar();
    e.empezo(agente("dis", "t1", QA));
    expect(pedidos.map((p) => [p.id, p.tarea])).toEqual([["dis", QA]]);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(dichos).toEqual([]);
    pedidos[0]!.listo();
    await vi.advanceTimersByTimeAsync(0);
    expect(dichos).toEqual([["dis", QA]]);
    expect(e.esperando).toBe(0);
  });

  it("si el nombre de la tarea todavía no se leyó, lo espera y recién ahí pide el audio", async () => {
    const { e, pedidos, dichos } = armar();
    e.empezo(agente("dis", "t1"));
    expect(pedidos).toEqual([]);
    e.revisar([agente("dis", "t1")]);
    expect(pedidos).toEqual([]);
    e.revisar([agente("dis", "t1", QA)]);
    e.revisar([agente("dis", "t1", QA)]);
    expect(pedidos.map((p) => p.tarea)).toEqual([QA]);
    pedidos[0]!.listo();
    await vi.advanceTimersByTimeAsync(0);
    expect(dichos).toEqual([["dis", QA]]);
  });

  it("como mucho 20 s desde que empezó: después dice «empecé» igual (la página pone la tarea si el audio llegó, si no la frase de siempre)", async () => {
    const { e, dichos } = armar();
    e.empezo(agente("dis", "t1", QA));
    e.empezo(agente("sin-nombre", "t2"));
    await vi.advanceTimersByTimeAsync(ESPERA_EMPECE_MS - 1);
    expect(dichos).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(dichos).toEqual([
      ["dis", QA],
      ["sin-nombre", null],
    ]);
    expect(ESPERA_EMPECE_MS).toBe(20_000);
  });

  it("si deja la tarea antes, o va a decir otra frase, «empecé» sale al tiro y una sola vez", async () => {
    const { e, pedidos, dichos } = armar();
    e.empezo(agente("a", "t1", QA));
    e.empezo(agente("b", "t2", QA));
    e.empezo(agente("c", "t3", QA));
    e.revisar([agente("a", null), agente("b", "t2", QA), agente("c", "t3", QA)]);
    expect(dichos).toEqual([["a", QA]]);
    // «terminé» de b: su «empecé» va antes.
    e.soltar("b");
    expect(dichos).toEqual([
      ["a", QA],
      ["b", QA],
    ]);
    // c empieza otra tarea: la anterior sale primero.
    e.empezo(agente("c", "t4", "Otra tarea"));
    expect(dichos.at(-1)).toEqual(["c", QA]);
    for (const p of pedidos) p.listo();
    await vi.advanceTimersByTimeAsync(ESPERA_EMPECE_MS);
    expect(dichos).toEqual([
      ["a", QA],
      ["b", QA],
      ["c", QA],
      ["c", "Otra tarea"],
    ]);
  });

  it("si el worker no responde (o falla), dice «empecé» al tiro", async () => {
    const dichos: Array<string | null> = [];
    const e = new EmpeceEnEspera<AgenteEmpece>({ esperar: async () => Promise.reject(new Error("502")), decir: (_a, t) => dichos.push(t) });
    e.empezo(agente("dis", "t1", QA));
    await vi.advanceTimersByTimeAsync(0);
    expect(dichos).toEqual([QA]);
  });
});

describe("la página le pide al worker que espere la frase", () => {
  const pedido = (extra: Partial<PedidoVoz> = {}): PedidoVoz => ({ agenteId: "dis", frase: "emp", corto: "Diseño", empresa: "JSTM", presentacion: "nombre-empresa", tarea: QA, ...extra });

  it("la espera cuenta desde que se pidió por primera vez (en cola o al asignarla), y lo esperado no se vuelve a pedir", async () => {
    accion.mockReset();
    accion.mockResolvedValue({ listas: 0, enFila: 1, saltadas: 0 });
    const t0 = 1_000_000;
    await prepararFrases("jstm", [pedido({ tarea: "En cola" })], t0);
    accion.mockReset();
    accion.mockResolvedValue({ estado: "lista" });
    expect(await esperarFrase("jstm", pedido({ tarea: "En cola" }), t0 + 6_000)).toBe(true);
    expect(accion).toHaveBeenCalledWith({ base: "" }, "uuid-oficina", "voz-esperar", "jstm", { pedido: pedido({ tarea: "En cola" }), ms: ESPERA_EMPECE_MS - 6_000 });
    // Pedida recién al empezar: los 20 s enteros, y `prepararFrases` ya no la manda.
    accion.mockClear();
    expect(await esperarFrase("jstm", pedido(), t0 + 7_000)).toBe(true);
    expect(accion.mock.calls[0]![4]).toEqual({ pedido: pedido(), ms: ESPERA_EMPECE_MS });
    accion.mockClear();
    expect(await prepararFrases("jstm", [pedido()], t0 + 8_000)).toBe(0);
    expect(accion).not.toHaveBeenCalled();
  });

  it("0.8.0: «te necesito» con la pregunta espera 30 s, en 2 llamadas (el worker responde a los 25 s como mucho)", async () => {
    vi.useFakeTimers();
    try {
      accion.mockReset();
      // El worker responde «tarde» a los 25 s (lo más que tiene abierta la respuesta) y, a la 2.ª, «lista».
      accion.mockImplementationOnce(() => new Promise((ok) => setTimeout(() => ok({ estado: "tarde" }), 25_000))).mockResolvedValueOnce({ estado: "lista" });
      const p = pedido({ frase: "toca", tarea: "Pregunta", pide: { tipo: "pregunta", texto: "¿Instalo la 0.8.0?", mas: 0 } });
      const r = esperarFrase("jstm", p, Date.now(), 30_000);
      await vi.advanceTimersByTimeAsync(25_000);
      expect(await r).toBe(true);
      expect(accion).toHaveBeenCalledTimes(2);
      expect(accion.mock.calls[0]![4]).toEqual({ pedido: p, ms: 25_000 });
      expect(accion.mock.calls[1]![4]).toEqual({ pedido: p, ms: 5_000 });
      // Un «tarde» antes de tiempo (un worker que no esperó) no se vuelve a preguntar: no queda dando vueltas.
      accion.mockReset();
      accion.mockResolvedValue({ estado: "tarde" });
      expect(await esperarFrase("jstm", pedido({ frase: "toca", tarea: "Apurado", pide: { tipo: "pregunta", texto: "¿Y?", mas: 0 } }), Date.now(), 30_000)).toBe(false);
      expect(accion).toHaveBeenCalledTimes(1);
      // Con 20 s (empecé), una sola llamada.
      accion.mockReset();
      accion.mockResolvedValue({ estado: "tarde" });
      expect(await esperarFrase("jstm", pedido({ tarea: "Una sola" }), Date.now())).toBe(false);
      expect(accion).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pasados los 20 s no espera; si el worker no está o no alcanzó, `false`", async () => {
    accion.mockReset();
    const t0 = 2_000_000;
    accion.mockResolvedValue({ listas: 0, enFila: 1, saltadas: 0 });
    await prepararFrases("jstm", [pedido({ tarea: "Vieja" })], t0);
    accion.mockClear();
    expect(await esperarFrase("jstm", pedido({ tarea: "Vieja" }), t0 + ESPERA_EMPECE_MS)).toBe(false);
    expect(accion).not.toHaveBeenCalled();
    accion.mockResolvedValue({ estado: "tarde" });
    expect(await esperarFrase("jstm", pedido({ tarea: "Lenta" }), t0)).toBe(false);
    // Un worker viejo (sin «voz-esperar») o reiniciándose: se puede volver a pedir.
    accion.mockResolvedValue(null);
    expect(await esperarFrase("jstm", pedido({ tarea: "Sin worker" }), t0)).toBe(false);
    accion.mockReset();
    accion.mockResolvedValue({ listas: 0, enFila: 1, saltadas: 0 });
    expect(await prepararFrases("jstm", [pedido({ tarea: "Sin worker" })], t0 + 1_000)).toBe(1);
  });
});
