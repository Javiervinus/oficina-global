import { describe, expect, it } from "vitest";
import { cuantoLleva, estimar, HistorialRuns, horaCorta, MIN_RUNS, RELEER_MS, textoFicha, textoGlobo, textoTooltip, type Estimacion } from "../src/hora.js";
import type { RunResumen } from "../src/shared.js";

const MIN = 60_000;
/** Jueves 22-10-2026 14:42, hora local. */
const AHORA = new Date(2026, 9, 22, 14, 42, 0).getTime();

describe("hora estimada: los 3 casos del spike de JST-161", () => {
  it("con 5 o más runs que duraron más que lo que lleva: ahora + la mediana de lo que les faltó", () => {
    // Lleva 10 min; los que duraron más (20, 30, 40, 50, 60) les faltaron 10, 20, 30, 40 y 50: mediana 30.
    const e = estimar([5, 8, 20, 30, 40, 50, 60].map((m) => m * MIN), 10 * MIN, AHORA);
    expect(e).toEqual({ tipo: "hora", fin: AHORA + 30 * MIN, n: 7 });
    // Con un número par, el promedio de los dos del medio (como `statistics.median`).
    expect(estimar([20, 30, 40, 50, 60, 70].map((m) => m * MIN), 10 * MIN, AHORA)).toMatchObject({ tipo: "hora", fin: AHORA + 35 * MIN });
  });

  it("si menos de 5 duraron más: «lleva», con cuántos de sus últimos runs duraron lo mismo o menos", () => {
    const e = estimar([5, 8, 9, 10, 20, 30, 40, 50].map((m) => m * MIN), 25 * MIN, AHORA);
    expect(e).toEqual({ tipo: "lleva", edad: 25 * MIN, n: 8, menos: 5 });
  });

  it("el borde: un run que duró exactamente lo que lleva el actual no cuenta", () => {
    const iguales = [10, 10, 10, 10, 10, 30].map((m) => m * MIN);
    expect(estimar(iguales, 10 * MIN, AHORA).tipo).toBe("lleva");
    expect(estimar(iguales, 10 * MIN - 1, AHORA).tipo).toBe("hora");
  });

  it("con menos de 5 runs terminados no hay dato", () => {
    expect(estimar([10, 20, 30, 40].map((m) => m * MIN), MIN, AHORA)).toEqual({ tipo: "sin", n: 4 });
    expect(estimar([], 0, AHORA)).toEqual({ tipo: "sin", n: 0 });
    expect(MIN_RUNS).toBe(5);
  });

  it("solo cuentan los últimos 30 runs", () => {
    // 30 cortos y, antes, 10 largos que ya no cuentan.
    const d = [...Array(10).fill(120 * MIN), ...Array(30).fill(2 * MIN)];
    expect(estimar(d, 5 * MIN, AHORA)).toMatchObject({ tipo: "lleva", n: 30, menos: 30 });
  });
});

describe("hora estimada: cómo se dice (JST-163 §9)", () => {
  it("«≈15:05» en 24 h y sin cero inicial; si no es hoy, con el día", () => {
    expect(horaCorta(new Date(2026, 9, 22, 15, 5).getTime(), AHORA)).toBe("15:05");
    expect(horaCorta(new Date(2026, 9, 22, 9, 10).getTime(), AHORA)).toBe("9:10");
    expect(horaCorta(new Date(2026, 9, 23, 9, 10).getTime(), AHORA)).toBe("vie 9:10");
    expect(horaCorta(new Date(2026, 9, 22, 23, 40).getTime(), AHORA)).toBe("23:40");
  });

  it("«lleva 50 min» bajo 1 h, «lleva 2 h» y «lleva 1 día» desde 24 h", () => {
    expect(cuantoLleva(50 * MIN)).toBe("50 min");
    expect(cuantoLleva(59 * MIN + 59_000)).toBe("59 min");
    expect(cuantoLleva(125 * MIN)).toBe("2 h");
    expect(cuantoLleva(23 * 60 * MIN + 59 * MIN)).toBe("23 h");
    expect(cuantoLleva(24 * 60 * MIN)).toBe("1 día");
    expect(cuantoLleva(3 * 24 * 60 * MIN)).toBe("3 días");
    expect(cuantoLleva(0)).toBe("1 min");
  });

  it("el globo, el tooltip y la ficha de cada caso; lo más largo cabe en 11 caracteres", () => {
    const hora: Estimacion = { tipo: "hora", fin: new Date(2026, 9, 22, 15, 5).getTime(), n: 30 };
    const manana: Estimacion = { tipo: "hora", fin: new Date(2026, 9, 23, 9, 10).getTime(), n: 30 };
    const lleva: Estimacion = { tipo: "lleva", edad: 125 * MIN, n: 30, menos: 26 };
    const sin: Estimacion = { tipo: "sin", n: 3 };
    expect(textoGlobo(hora, AHORA)).toBe("≈15:05");
    expect(textoGlobo(manana, AHORA)).toBe("≈vie 9:10");
    expect(textoGlobo(lleva, AHORA)).toBe("lleva 2 h");
    expect(textoGlobo(sin, AHORA)).toBeNull();
    expect(textoGlobo(null, AHORA)).toBeNull();
    expect(textoTooltip(hora, AHORA)).toBe("termina ≈15:05, según sus últimos runs");
    expect(textoTooltip(manana, AHORA)).toBe("termina ≈mañana viernes a las 9:10, según sus últimos runs");
    expect(textoTooltip(lleva, AHORA)).toBe("lleva 2 h: más de lo habitual, no hay una hora confiable");
    expect(textoTooltip(sin, AHORA)).toBe("sin hora estimada (todavía tiene menos de 5 runs terminados)");
    expect(textoFicha(hora, AHORA)).toBe("Termina ≈15:05 · según sus últimos 30 runs (acierta a ±30 min 7 de cada 10 veces)");
    expect(textoFicha(lleva, AHORA)).toBe("Lleva 2 h · más que 26 de sus últimos 30 runs: no hay una hora confiable");
    expect(textoFicha(sin, AHORA)).toBe("Sin hora estimada · todavía tiene menos de 5 runs terminados");
    expect(textoGlobo({ tipo: "hora", fin: new Date(2026, 9, 23, 23, 40).getTime(), n: 30 }, AHORA)!.length).toBeLessThanOrEqual(11);
    expect(textoGlobo({ tipo: "lleva", edad: 23 * 60 * MIN, n: 30, menos: 30 }, AHORA)!.length).toBeLessThanOrEqual(11);
  });
});

const iso = (t: number) => new Date(t).toISOString();
const run = (id: string, inicio: number, minutos: number, status = "succeeded"): RunResumen => ({
  id,
  agentId: "a1",
  status,
  createdAt: iso(inicio),
  startedAt: iso(inicio),
  finishedAt: minutos >= 0 ? iso(inicio + minutos * MIN) : null,
});

describe("los runs de cada agente: lecturas y canal en vivo", () => {
  const espera = () => new Promise((ok) => setTimeout(ok, 0));

  it("al cargar, 1 lectura por agente, de a 4 a la vez; los cancelados, en curso o sin fin no cuentan", async () => {
    const pedidas: string[] = [];
    let aLaVez = 0;
    let max = 0;
    const h = new HistorialRuns(async (_co, ag) => {
      pedidas.push(ag);
      aLaVez += 1;
      max = Math.max(max, aLaVez);
      await espera();
      aLaVez -= 1;
      return [run("r1", AHORA - 100 * MIN, 10), run("r2", AHORA - 80 * MIN, 5, "failed"), run("r3", AHORA - 60 * MIN, 7, "cancelled"), run("r4", AHORA - 5 * MIN, -1, "running")];
    });
    h.cargar(Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, companyId: "c1" })));
    h.cargar([{ id: "a0", companyId: "c1" }]);
    for (let i = 0; i < 10; i++) await espera();
    expect(pedidas).toHaveLength(10);
    expect(max).toBe(4);
    expect(h.duraciones("a0")).toEqual([10 * MIN, 5 * MIN]);
    expect(h.duraciones("otro")).toBeNull();
  });

  it("el run que termina por el canal en vivo entra en prev (0 lecturas) y cambia la estimación", async () => {
    let t = AHORA;
    const h = new HistorialRuns(async () => [1, 2, 3, 4].map((k) => run(`r${k}`, AHORA - k * 100 * MIN, 30)), () => t);
    h.cargar([{ id: "a1", companyId: "c1" }]);
    await espera();
    const inicio = iso(AHORA - 5 * MIN);
    expect(h.estimacion("a1", inicio, t)).toEqual({ tipo: "sin", n: 4 });
    const antes = h.version();
    h.alEvento({ type: "heartbeat.run.status", payload: { runId: "r9", agentId: "a1", status: "succeeded", startedAt: iso(AHORA - 40 * MIN), finishedAt: iso(AHORA - 10 * MIN) } });
    expect(h.version()).toBe(antes + 1);
    expect(h.lecturas).toBe(1);
    // Ya son 5 y todos duraron 30: le faltan 25.
    expect(h.estimacion("a1", inicio, t)).toEqual({ tipo: "hora", fin: AHORA + 25 * MIN, n: 5 });
    // El mismo evento otra vez, uno sin fin o de otro agente que no se leyó: no cambia nada.
    h.alEvento({ type: "heartbeat.run.status", payload: { runId: "r9", agentId: "a1", status: "succeeded", startedAt: iso(AHORA - 40 * MIN), finishedAt: iso(AHORA - 10 * MIN) } });
    h.alEvento({ type: "heartbeat.run.status", payload: { runId: "r10", agentId: "a1", status: "running", startedAt: iso(AHORA), finishedAt: null } });
    h.alEvento({ type: "heartbeat.run.status", payload: { runId: "r11", agentId: "zz", status: "succeeded", startedAt: iso(AHORA - 9 * MIN), finishedAt: iso(AHORA) } });
    expect(h.version()).toBe(antes + 1);
    // La hora avanza sola, sin lecturas: 30 min después ya pasó lo habitual, y lo dice.
    t = AHORA + 30 * MIN;
    expect(h.estimacion("a1", inicio, t)).toMatchObject({ tipo: "lleva", edad: 35 * MIN });
  });

  it("al reconectar su empresa, un agente se vuelve a leer solo si se leyó hace 1 h o más", async () => {
    let t = AHORA;
    const pedidas: string[] = [];
    const h = new HistorialRuns(async (_co, ag) => {
      pedidas.push(ag);
      return [];
    }, () => t);
    h.cargar([
      { id: "a1", companyId: "c1" },
      { id: "b1", companyId: "c2" },
    ]);
    await espera();
    h.reconecto("c1");
    await espera();
    expect(pedidas).toEqual(["a1", "b1"]);
    t = AHORA + RELEER_MS;
    h.reconecto("c1");
    h.reconecto("c1");
    await espera();
    expect(pedidas).toEqual(["a1", "b1", "a1"]);
  });
});
