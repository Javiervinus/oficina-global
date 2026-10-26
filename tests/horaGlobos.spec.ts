// JST-192: al cambiar el minuto, la hora de los globos no cambia toda en el mismo instante, ni a la vez que un rótulo
// (design-spec de JST-163 §8: «ningún globo cambia a la vez que otro ni que un rótulo»).
import { describe, expect, it } from "vitest";
import { HistorialRuns, HorasDeGlobos, instantesDeHora, MINUTO_MS, textoGlobo } from "../src/hora.js";
import { armarPiso, type EntradaSala } from "../src/plano.js";
import { PASO_SALA_MS, proximoPaso } from "../src/rotulo.js";
import type { RunResumen } from "../src/shared.js";
import { Vida, type AgenteVida, type OpcionesVida } from "../src/vida.js";

const MIN = 60_000;
const mod = (i: number, n: number) => ((i % n) + n) % n;
const iso = (t: number) => new Date(t).toISOString();
/** Lo que falta o sobra para el paso de rótulo más cercano: con `nSalas` salas, los rótulos pasan cada 6 s / `nSalas`. */
const aUnPaso = (t: number, nSalas: number) => {
  const r = mod(t, PASO_SALA_MS / nSalas);
  return Math.min(r, PASO_SALA_MS / nSalas - r);
};
const espera = () => new Promise((ok) => setTimeout(ok, 0));

describe("cada globo dice su hora en su instante del minuto (JST-192)", () => {
  it("uno distinto por agente, entre dos pasos de los rótulos y lejos de ellos", () => {
    for (const [n, nSalas] of [
      [26, 4],
      [40, 4],
      [57, 4],
      [5, 1],
      [8, 3],
    ] as const) {
      const ids = Array.from({ length: n }, (_, i) => `a${i}`);
      const instantes = [...instantesDeHora(ids, nSalas).values()].sort((a, b) => a - b);
      const hueco = PASO_SALA_MS / nSalas;
      const porHueco = Math.ceil(n / (MINUTO_MS / hueco));
      // Hasta 40 agentes con 4 salas, uno por hueco: a 750 ms de los rótulos y a 1,5 s o más entre ellos.
      const lejos = hueco / (porHueco + 1);
      const entreEllos = porHueco === 1 ? hueco : lejos;
      expect(new Set(instantes).size, `${n} agentes, ${nSalas} salas`).toBe(n);
      instantes.forEach((x, i) => {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(MINUTO_MS);
        expect(aUnPaso(x, nSalas)).toBeGreaterThanOrEqual(lejos - 1e-6);
        const siguiente = i + 1 < n ? instantes[i + 1]! : instantes[0]! + MINUTO_MS;
        expect(siguiente - x).toBeGreaterThanOrEqual(entreEllos - 1e-6);
      });
    }
  });

  /**
   * 12 agentes en 4 salas trabajando, la mitad «lleva N min» (cambia cada
   * minuto) y la otra «≈hh:mm» (cambia al pasar lo que duró alguno de sus runs).
   * La página se vuelve a dibujar cada 100 ms (el vigilante de la QA).
   */
  async function piso() {
    const ahora0 = new Date(2026, 9, 22, 19, 25, 52, 489).getTime();
    const ids = Array.from({ length: 12 }, (_, k) => `a${k}`);
    const desde = new Map(ids.map((id, k) => [id, iso(ahora0 - (k % 2 ? 2 * k * MIN + k * 11_000 : (3 + k) * MIN + k * 7_000))]));
    const runs = (id: string): RunResumen[] => {
      const k = Number(id.slice(1));
      const minutos = k % 2 ? Array.from({ length: 12 }, (_, i) => 5 * (i + 1)) : Array<number>(10).fill(2);
      return minutos.map((m, i) => ({ id: `${id}-r${i}`, agentId: id, status: "succeeded", createdAt: iso(ahora0 - 600 * MIN), startedAt: iso(ahora0 - 600 * MIN + i * 70 * MIN), finishedAt: iso(ahora0 - 600 * MIN + i * 70 * MIN + m * MIN) }));
    };
    const horas = new HistorialRuns(async (_c, id) => runs(id));
    horas.cargar(ids.map((id) => ({ id, companyId: "c" })));
    for (let i = 0; i < 6; i++) await espera();
    const globos = new HorasDeGlobos();
    globos.fijarPiso(ids, 4);
    const instantes = instantesDeHora(ids, 4);
    // El reloj de la vida (`performance.now()`) no va alineado con el minuto.
    const t0 = 123_456.7;
    const texto = (id: string, real: number) => textoGlobo(horas.estimacion(id, desde.get(id), real), real);
    const dibujar = (t: number) => {
      const real = ahora0 + (t - t0);
      return new Map(ids.map((id) => [id, texto(id, globos.ahoraDe(id, desde.get(id)!, t, real))]));
    };
    return { ids, desde, globos, instantes, t0, ahora0, texto, dibujar };
  }

  it("con 12 trabajando, en 6 minutos cambia uno a la vez, cada uno justo después de su instante y lejos de los rótulos", async () => {
    const { ids, desde, instantes, t0, ahora0, dibujar } = await piso();
    let antes = dibujar(t0);
    let cambios = 0;
    for (let t = t0 + 100; t < t0 + 6 * MIN; t += 100) {
      const ahora = dibujar(t);
      const cambiaron = ids.filter((id) => ahora.get(id) !== antes.get(id));
      expect(cambiaron.length, `a los ${Math.round(t - t0)} ms: ${cambiaron.join(", ")}`).toBeLessThanOrEqual(1);
      for (const id of cambiaron) {
        expect(mod(t - instantes.get(id)!, MINUTO_MS)).toBeLessThan(100);
        expect(aUnPaso(t, 4)).toBeGreaterThanOrEqual(600);
      }
      // «lleva N min» dice lo que llevaba hace a lo más 1 min.
      for (const id of ids.filter((x) => ahora.get(x)?.startsWith("lleva"))) {
        const real = Math.floor((ahora0 + (t - t0) - Date.parse(desde.get(id)!)) / MIN);
        expect([real - 1, real]).toContain(Number(/lleva (\d+) min/.exec(ahora.get(id)!)![1]));
      }
      cambios += cambiaron.length;
      antes = ahora;
    }
    // Los «lleva» cambian cada minuto (6 × 6) y algunos «≈» también.
    expect(cambios).toBeGreaterThanOrEqual(36);
  });

  it("dibujar más seguido o a otra hora no cambia nada fuera de su instante", async () => {
    const { ids, t0, dibujar } = await piso();
    const base = dibujar(t0);
    // Entre el instante del primero y el del siguiente, a cualquier hora, dice lo mismo.
    for (const dt of [1, 7, 33, 250, 499, 700]) expect([...dibujar(t0 + dt)]).toEqual([...base]);
    expect(ids.length).toBe(12);
  });

  it("con la pestaña oculta no cambia, y al volver nadie cambia en el mismo instante: cada uno en su próximo instante", async () => {
    const { ids, globos, t0, dibujar } = await piso();
    let antes = dibujar(t0);
    for (let t = t0 + 100; t < t0 + MIN; t += 100) antes = dibujar(t);
    const oculta = t0 + MIN;
    globos.fijarOculta(true, oculta);
    for (let t = oculta; t < oculta + 4 * MIN; t += 1_000) expect([...dibujar(t)]).toEqual([...antes]);
    const vuelve = oculta + 4 * MIN + 30;
    globos.fijarOculta(false, vuelve);
    expect([...dibujar(vuelve)]).toEqual([...antes]);
    let cambiaron = 0;
    for (let t = vuelve + 100; t < vuelve + MIN; t += 100) {
      const ahora = dibujar(t);
      const n = ids.filter((id) => ahora.get(id) !== antes.get(id)).length;
      expect(n).toBeLessThanOrEqual(1);
      cambiaron += n;
      antes = ahora;
    }
    // Los 6 «lleva» saltaron los 4 minutos que no se vieron, cada uno en su momento.
    expect(cambiaron).toBeGreaterThanOrEqual(6);
  });

  it("`proximo` dice cuándo le toca al primero que va a decir otra cosa", async () => {
    const { ids, desde, globos, t0, ahora0, texto, dibujar } = await piso();
    let antes = dibujar(t0);
    const quienes = ids.map((id) => ({ id, run: desde.get(id)! }));
    const cuando = globos.proximo(quienes, texto, t0, ahora0)!;
    expect(cuando).toBeGreaterThan(t0);
    let t = t0 + 100;
    for (; t < t0 + 2 * MIN; t += 100) {
      const ahora = dibujar(t);
      if (ids.some((id) => ahora.get(id) !== antes.get(id))) break;
      antes = ahora;
    }
    expect(t).toBeGreaterThanOrEqual(cuando);
    expect(t - cuando).toBeLessThan(100);
  });

  it("un run nuevo dice su hora al tiro (no espera su instante), como si recién empezara", async () => {
    const { globos, t0, ahora0, texto } = await piso();
    // a1 empieza otro run 10 s antes de dibujar: su último instante fue antes de que empezara.
    const nuevo = iso(ahora0 - 10_000);
    const ahora = globos.ahoraDe("a1", nuevo, t0, ahora0);
    expect(ahora).toBeLessThanOrEqual(ahora0);
    expect(texto("a1", ahora)).toBe(texto("a1", ahora0));
    expect(globos.ahoraDe("a1", nuevo, t0 + 50, ahora0 + 50)).toBe(ahora);
  });
});

// ---------------------------------------------------------------------------
// La pastilla del rótulo
// ---------------------------------------------------------------------------

const HOY: EntradaSala[] = [
  { prefijo: "BET", agentes: 3 },
  { prefijo: "ELM", agentes: 2 },
  { prefijo: "JST", agentes: 2 },
  { prefijo: "MIG", agentes: 2 },
];
const PISO = armarPiso(HOY, 640, "computador");
const TODAS: ReadonlySet<string> = new Set(HOY.map((s) => s.prefijo));

/** ELM-0 trabaja en `codigo` con la hora `hora`; los demás, libres. */
function agentes(hora: string, codigo = "ELM-7"): AgenteVida[] {
  return HOY.flatMap((s) =>
    Array.from({ length: s.agentes }, (_, i): AgenteVida => {
      const id = `${s.prefijo}-${i}`;
      const trabaja = id === "ELM-0";
      return {
        id,
        companyId: `c-${s.prefijo}`,
        prefijo: s.prefijo,
        st: trabaja ? "trabaja" : "libre",
        need: false,
        codigo: trabaja ? codigo : null,
        nombre: `Agente ${id}`,
        espera: null,
        run: trabaja ? { codigo, titulo: "Poner al día el changelog", enCola: false, hora } : null,
        runId: trabaja ? `r-${codigo}` : null,
      };
    }),
  );
}

describe("la pastilla del rótulo dice la hora nueva en el paso del rótulo, no a la vez que el globo (JST-192)", () => {
  // Solo la sala de El Mirador con rótulo (filtro), sin conversaciones ni mascotas: lo único que cambia solo es el rótulo.
  const OP: OpcionesVida = { rm: false, charlas: false, mascotas: false, cargando: false, oculta: false, filtro: ["ELM"] };
  const i = PISO.salas.findIndex((s) => s.prefijo === "ELM");
  const pasoDespues = (t: number) => proximoPaso(t, 2, i, PISO.salas.length)!;

  it("con una sola tarea en la vuelta, la pastilla cambia en el próximo paso del rótulo, y el bucle despierta para eso", () => {
    const reloj = { t: 1_000 };
    const vida = new Vida({ ahora: () => reloj.t });
    vida.sincronizar(PISO, agentes("≈19:26"), TODAS, OP);
    expect(vida.rotuloDe("ELM")!.item).toMatchObject({ codigo: "ELM-7", hora: "≈19:26" });
    // Sin nada pendiente, una sola tarea: el rótulo no cambia solo.
    expect(vida.proximo()).toBeNull();
    // El globo dice la nueva en su instante (un poco después de un paso); la pastilla sigue con la de antes.
    reloj.t = pasoDespues(reloj.t) + 400;
    vida.sincronizar(PISO, agentes("lleva 1 min"), TODAS, OP);
    const paso = pasoDespues(reloj.t);
    expect(vida.rotuloDe("ELM")!.item.hora).toBe("≈19:26");
    expect(vida.proximo()).toBe(paso);
    reloj.t = paso - 1;
    vida.paso(reloj.t);
    expect(vida.rotuloDe("ELM")!.item.hora).toBe("≈19:26");
    const version = vida.version("ELM");
    reloj.t = paso;
    vida.paso(reloj.t);
    expect(vida.version("ELM")).toBeGreaterThan(version);
    expect(vida.rotuloDe("ELM")!.item.hora).toBe("lleva 1 min");
    // Ya no queda nada pendiente (pasada la espera de 500 ms entre cambios del rótulo, JST-191).
    reloj.t = paso + 600;
    vida.paso(reloj.t);
    expect(vida.proximo()).toBeNull();
  });

  it("dos horas nuevas antes del paso: la pastilla sigue con la que decía y salta a la última", () => {
    const reloj = { t: 1_000 };
    const vida = new Vida({ ahora: () => reloj.t });
    vida.sincronizar(PISO, agentes("lleva 3 min"), TODAS, OP);
    reloj.t = pasoDespues(reloj.t) + 100;
    vida.sincronizar(PISO, agentes("lleva 4 min"), TODAS, OP);
    reloj.t += 200;
    vida.sincronizar(PISO, agentes("lleva 5 min"), TODAS, OP);
    expect(vida.rotuloDe("ELM")!.item.hora).toBe("lleva 3 min");
    reloj.t = pasoDespues(reloj.t);
    vida.paso(reloj.t);
    expect(vida.rotuloDe("ELM")!.item.hora).toBe("lleva 5 min");
  });

  it("con otro run (otra tarea) el rótulo cambia al tiro, con su hora", () => {
    const reloj = { t: 1_000 };
    const vida = new Vida({ ahora: () => reloj.t });
    vida.sincronizar(PISO, agentes("≈19:26"), TODAS, OP);
    reloj.t = pasoDespues(reloj.t) + 400;
    vida.sincronizar(PISO, agentes("≈20:10", "ELM-8"), TODAS, OP);
    expect(vida.rotuloDe("ELM")!.item).toMatchObject({ codigo: "ELM-8", hora: "≈20:10" });
  });

  it("con el mouse sobre el agente, su pastilla también espera el paso", () => {
    const reloj = { t: 1_000 };
    const vida = new Vida({ ahora: () => reloj.t });
    vida.sincronizar(PISO, agentes("lleva 3 min"), TODAS, OP);
    vida.fijarPin("ELM", "ELM-0");
    reloj.t = pasoDespues(reloj.t) + 400;
    vida.sincronizar(PISO, agentes("lleva 4 min"), TODAS, OP);
    expect(vida.rotuloDe("ELM")!.item.hora).toBe("lleva 3 min");
    reloj.t = pasoDespues(reloj.t);
    vida.paso(reloj.t);
    expect(vida.rotuloDe("ELM")!.item.hora).toBe("lleva 4 min");
  });
});
