// La vida de la 0.5.0 (design-spec de JST-163, A · En cada sala): «✓ listo», tu fila y la entrega en la mesa.
import { describe, expect, it } from "vitest";
import { cajasEntrega, cruzan, subirEntrega, tapaA, type CajaHilo } from "../src/hilo.js";
import { anchoCelular, armarPiso, armarPisoTv, armarSalaAcercada, type EntradaSala, type PisoPlano, type SalaPlano } from "../src/plano.js";
import { JUNTOS_MS, LISTO_MIN_MS, LISTO_MS, RESPONDE_MS, Vida, type AgenteVida, type OpcionesVida, type VistaJunta } from "../src/vida.js";
import type { Dibujo } from "../src/vista.js";

const HOY: EntradaSala[] = [
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "MIG", agentes: 8 },
];
// A 640 (la pantalla del usuario, a 3x): las 4 salas tienen tu escritorio.
const PISO = armarPiso(HOY, 640, "computador");
const TODAS: ReadonlySet<string> = new Set(HOY.map((s) => s.prefijo));
const OP: OpcionesVida = { rm: false, charlas: false, mascotas: false, cargando: false, oculta: false };
const sala = (pre: string, piso: PisoPlano = PISO) => piso.salas.find((s) => s.prefijo === pre)!;
const T0 = Date.UTC(2026, 9, 22, 18, 0);

interface Cambio {
  st?: Dibujo;
  need?: boolean;
  /** Minutos que lleva esperando su primera espera. */
  espera?: number;
  codigo?: string;
  runId?: string;
  /** Trabaja sin run: el run que terminó ya salió de la lista y el agente todavía dice que trabaja, o el nuevo todavía no llega. */
  sinRun?: boolean;
}

/** Todos trabajando en `<id>-T`, salvo los cambios. `toca` te espera sin trabajar. */
function agentes(cambios: Record<string, Cambio> = {}): AgenteVida[] {
  return HOY.flatMap((s) =>
    Array.from({ length: s.agentes }, (_, i) => {
      const id = `${s.prefijo}-${i}`;
      const c = cambios[id] ?? {};
      const st = c.st ?? "trabaja";
      const need = c.need ?? st === "toca";
      const codigo = st === "trabaja" && !c.sinRun ? (c.codigo ?? `${id}T`) : null;
      return {
        id,
        companyId: `c-${s.prefijo}`,
        prefijo: s.prefijo,
        st,
        need,
        codigo,
        nombre: i === 6 ? "Ingeniero Frontend React + Expo" : `Agente ${id}`,
        esperaDesde: need ? new Date(T0 - (c.espera ?? 1) * 60_000).toISOString() : null,
        espera: need ? { codigo: `${s.prefijo}-${100 + i}`, titulo: "Confirmar qué carpetas respaldar", mas: 0 } : null,
        run: st === "trabaja" && !c.sinRun ? { codigo, titulo: `Tarea de ${id}`, enCola: false, hora: "≈15:05" } : null,
        runId: st === "trabaja" && !c.sinRun ? (c.runId ?? `r-${id}`) : null,
      };
    }),
  );
}

function semilla(n = 7): () => number {
  let s = n;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function banco(plano: PisoPlano = PISO) {
  const reloj = { t: 1_000 };
  const vida = new Vida({ ahora: () => reloj.t, azar: semilla() });
  let estado = agentes();
  let op = OP;
  let p = plano;
  const sync = (o: { cambios?: Record<string, Cambio>; op?: Partial<OpcionesVida>; plano?: PisoPlano } = {}) => {
    if (o.cambios) estado = agentes(o.cambios);
    if (o.op) op = { ...op, ...o.op };
    if (o.plano) p = o.plano;
    vida.sincronizar(p, estado, TODAS, op);
  };
  const avanzar = (ms: number, cada?: () => void) => {
    for (let k = 0; k < ms; k += 16) {
      reloj.t += 16;
      vida.paso(reloj.t);
      cada?.();
    }
  };
  const hasta = (listo: () => boolean, max = 60_000) => {
    let ms = 0;
    while (!listo() && ms < max) {
      reloj.t += 16;
      ms += 16;
      vida.paso(reloj.t);
    }
    return ms;
  };
  return { vida, reloj, sync, avanzar, hasta };
}

const camina = (v: Vida, id: string) => !!v.fuera(id)?.caminando;

/** Los globos de una entrega como los dibuja la página (JST-190). */
function cajasDe(j: VistaJunta, s: SalaPlano, k: number) {
  return subirEntrega(cajasEntrega(j.de.pos, j.a.pos, j.codigo, j.para, s.descanso, k)!, j.alto);
}

/** A quiénes de `ids` (quietos, sin contar a los de la entrega) les tapan la cabeza esos globos. */
function tapados(v: Vida, j: VistaJunta, s: SalaPlano, k: number, ids: readonly string[]): string[] {
  const c = cajasDe(j, s, k);
  return ids.filter((id) => {
    const f = id === j.de.id || id === j.a.id ? null : v.fuera(id);
    return !!f && !f.caminando && (tapaA(c.de, [f.pos]) || tapaA(c.a, [f.pos]));
  });
}

const idsDe = (pre: string) => Array.from({ length: HOY.find((s) => s.prefijo === pre)!.agentes }, (_, i) => `${pre}-${i}`);

describe("«✓ listo» al terminar (JST-163 §7)", () => {
  it("el run termina bien: «✓ listo» 6 s sentado en su puesto y después camina al descanso", () => {
    const { vida, sync, avanzar, reloj } = banco();
    sync();
    vida.terminoRun("BET-0", "r-BET-0", "succeeded");
    // Todavía se ve trabajando (el run sigue en la lista un momento): ya sale el «✓ listo».
    expect(vida.listo("BET-0")).toEqual({ codigo: "BET-0T" });
    sync({ cambios: { "BET-0": { st: "libre" } } });
    expect(vida.enEscritorio("BET-0")).toBe(true);
    expect(camina(vida, "BET-0")).toBe(false);
    const t0 = reloj.t;
    avanzar(LISTO_MS - 200);
    expect(vida.listo("BET-0")).not.toBeNull();
    expect(vida.enEscritorio("BET-0")).toBe(true);
    avanzar(300);
    expect(reloj.t - t0).toBeGreaterThanOrEqual(LISTO_MS);
    expect(vida.listo("BET-0")).toBeNull();
    expect(camina(vida, "BET-0")).toBe(true);
    expect(vida.fuera("BET-0")!.hacia).toBe("descanso");
  });

  it("no sale si queda «te necesita» (sale la mano), si el run falla ni si recién entregó la tarea", () => {
    const { vida, sync } = banco();
    sync();
    vida.terminoRun("BET-1", "r-BET-1", "succeeded");
    sync({ cambios: { "BET-1": { st: "toca" } } });
    expect(vida.listo("BET-1")).toBeNull();
    vida.terminoRun("BET-2", "r-BET-2", "failed");
    expect(vida.listo("BET-2")).toBeNull();
    vida.entrega("BET-3", "BET-4", "BET-50");
    vida.terminoRun("BET-3", "r-BET-3", "succeeded");
    expect(vida.listo("BET-3")).toBeNull();
  });

  it("si en esos 6 s toma otra tarea, queda al menos 2 s y pasa al globo de la tarea nueva; si pasa a «te necesita», se corta", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    vida.terminoRun("BET-0", "r-BET-0", "succeeded");
    sync({ cambios: { "BET-0": { st: "libre" } } });
    avanzar(500);
    sync({ cambios: { "BET-0": { st: "trabaja", codigo: "BET-77", runId: "r2" } } });
    expect(vida.listo("BET-0")).not.toBeNull();
    avanzar(LISTO_MIN_MS - 500 + 32);
    expect(vida.listo("BET-0")).toBeNull();
    // Otro: termina y al segundo te necesita.
    vida.terminoRun("BET-5", "r-BET-5", "succeeded");
    sync({ cambios: { "BET-5": { st: "libre" } } });
    avanzar(1_000);
    sync({ cambios: { "BET-5": { st: "toca" } } });
    expect(vida.listo("BET-5")).toBeNull();
  });

  it("con movimiento reducido: 6 s quieto y después aparece en el descanso, sin caminar", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: { rm: true } });
    vida.terminoRun("ELM-1", "r-ELM-1", "succeeded");
    sync({ cambios: { "ELM-1": { st: "libre" } } });
    avanzar(LISTO_MS + 100);
    expect(vida.listo("ELM-1")).toBeNull();
    expect(vida.enEscritorio("ELM-1")).toBe(false);
    expect(camina(vida, "ELM-1")).toBe(false);
  });

  it("el rótulo de la sala lo cuenta: «✓ BET-414 Listo: …»", () => {
    const { vida, sync } = banco();
    vida.fijarTitulos({ titulo: (c) => (c === "BET-0T" ? "QA — login en el celular, capturas ANTES/DESPUÉS" : null) });
    sync();
    vida.terminoRun("BET-0", "r-BET-0", "succeeded");
    sync({ cambios: { "BET-0": { st: "libre" } } });
    const r = vida.rotuloDe("BET")!;
    expect(r.item).toMatchObject({ tipo: "listo", codigo: "BET-0T", texto: "Listo: QA — login en el celular, capturas ANTES/DESPUÉS", agente: "BET-0" });
    expect(r.anillo).toBe("BET-0");
  });

  /** Lo que cuenta el rótulo de BET en cada cambio, como lo dibuja React. */
  function rotuloBet(vida: Vida, reloj: { t: number }) {
    const vistos: Array<{ t: number; k: string }> = [];
    const mirar = () => {
      const r = vida.rotuloDe("BET");
      const k = r ? `${r.item.tipo}:${r.item.codigo}` : "";
      if (k !== vistos.at(-1)?.k) vistos.push({ t: reloj.t, k });
    };
    return { vistos, mirar };
  }

  it("el rótulo pasa a «✓ listo» con el fin del run, aunque todavía se vea trabajando o ya sin su run, sin pasar antes a otro (JST-191)", () => {
    const { vida, sync, avanzar, reloj } = banco();
    sync();
    const { vistos, mirar } = rotuloBet(vida, reloj);
    mirar();
    avanzar(1_000, mirar);
    // El fin del run llega por el canal en vivo antes que la relectura: todavía se ve trabajando.
    const t0 = reloj.t;
    vida.terminoRun("BET-0", "r-BET-0", "succeeded");
    mirar();
    expect(vistos.at(-1)).toEqual({ t: t0, k: "listo:BET-0T" });
    // Llega la relectura de los runs: el suyo ya no está, pero el agente todavía dice que trabaja.
    avanzar(300, mirar);
    sync({ cambios: { "BET-0": { sinRun: true } } });
    expect(vida.listo("BET-0")).toEqual({ codigo: "BET-0T" });
    // 1,1 s después, que está libre.
    avanzar(1_100, mirar);
    sync({ cambios: { "BET-0": { st: "libre" } } });
    avanzar(LISTO_MS - 1_400 - 100, mirar);
    expect(vistos.filter((v) => v.t >= t0)).toEqual([{ t: t0, k: "listo:BET-0T" }]);
    avanzar(200, mirar);
    const despues = vistos.filter((v) => v.t > t0);
    expect(despues).toHaveLength(1);
    expect(despues[0]!.k).not.toMatch(/^listo/);
  });

  it("si le llega otra tarea, el rótulo sigue con «✓ listo» al menos 2 s y pasa una sola vez, a lo de la vuelta (JST-191)", () => {
    const { vida, sync, avanzar, reloj } = banco();
    sync();
    const { vistos, mirar } = rotuloBet(vida, reloj);
    mirar();
    avanzar(1_000, mirar);
    const t0 = reloj.t;
    vida.terminoRun("BET-0", "r-BET-0", "succeeded");
    sync({ cambios: { "BET-0": { st: "libre" } } });
    mirar();
    // 1 s después le llega otra tarea: primero el agente dice que trabaja (sin run) y 150 ms después llega su run.
    avanzar(1_200, mirar);
    sync({ cambios: { "BET-0": { st: "trabaja", sinRun: true } } });
    avanzar(150, mirar);
    sync({ cambios: { "BET-0": { st: "trabaja", codigo: "BET-77", runId: "r2" } } });
    avanzar(LISTO_MIN_MS - 1_350 - 100, mirar);
    expect(vistos.filter((v) => v.t >= t0)).toEqual([{ t: t0, k: "listo:BET-0T" }]);
    avanzar(5_000, mirar);
    const despues = vistos.filter((v) => v.t > t0);
    expect(despues[0]!.t - t0).toBeGreaterThanOrEqual(LISTO_MIN_MS);
    expect(despues[0]!.k).not.toMatch(/^listo/);
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]!.t - vistos[i - 1]!.t).toBeGreaterThanOrEqual(500);
  });
});

describe("tu fila (JST-163 §14)", () => {
  it("al cargar, quien te espera sin trabajar aparece en la fila de su sala: el que espera hace más adelante, hasta 3", () => {
    const { vida, sync } = banco();
    sync({ cambios: { "BET-0": { st: "toca", espera: 5 }, "BET-1": { st: "toca", espera: 50 }, "BET-2": { st: "toca", espera: 20 }, "BET-3": { st: "toca", espera: 1 }, "BET-4": { st: "trabaja", need: true, espera: 90 } } });
    const fila = sala("BET").fila;
    expect(vida.fuera("BET-1")).toMatchObject({ pos: fila[0], fila: 0, quieto: true, anim: "caminar-arriba", caminando: false });
    expect(vida.fuera("BET-2")).toMatchObject({ pos: fila[1], fila: 1 });
    expect(vida.fuera("BET-0")).toMatchObject({ pos: fila[2], fila: 2 });
    // El 4.º espera en su puesto, con la mano; quien trabaja y te espera, también en su puesto.
    expect(vida.enEscritorio("BET-3")).toBe(true);
    expect(vida.enEscritorio("BET-4")).toBe(true);
    expect(vida.lugarEnFila("BET-3")).toBeUndefined();
    expect(vida.seMueve()).toBe(false);
  });

  it("a la fila se camina; cuando le respondes vuelve, y cada uno avanza un lugar caminando", () => {
    const { vida, sync, hasta } = banco();
    sync();
    sync({ cambios: { "MIG-1": { st: "toca", espera: 30 }, "MIG-2": { st: "toca", espera: 10 } } });
    expect(camina(vida, "MIG-1")).toBe(true);
    expect(vida.fuera("MIG-1")!.hacia).toBe("fila");
    hasta(() => !camina(vida, "MIG-1") && !camina(vida, "MIG-2"));
    expect(vida.fuera("MIG-1")).toMatchObject({ fila: 0, pos: sala("MIG").fila[0] });
    expect(vida.fuera("MIG-2")).toMatchObject({ fila: 1, pos: sala("MIG").fila[1] });
    // Le respondes a MIG-1: vuelve a trabajar (a su escritorio); MIG-2 avanza al primer lugar, caminando.
    sync({ cambios: { "MIG-2": { st: "toca", espera: 10 } } });
    expect(camina(vida, "MIG-1")).toBe(true);
    expect(vida.fuera("MIG-1")!.hacia).toBe("escritorio");
    expect(camina(vida, "MIG-2")).toBe(true);
    hasta(() => !camina(vida, "MIG-2"));
    expect(vida.fuera("MIG-2")).toMatchObject({ fila: 0, pos: sala("MIG").fila[0] });
    hasta(() => vida.enEscritorio("MIG-1"));
    expect(vida.enEscritorio("MIG-1")).toBe(true);
  });

  it("en el celular no hay fila: quien te espera levanta la mano en su puesto", () => {
    const { vida, sync } = banco(armarPiso(HOY, anchoCelular(390), "celular"));
    sync({ cambios: { "BET-1": { st: "toca", espera: 30 } } });
    expect(vida.enEscritorio("BET-1")).toBe(true);
    expect(vida.lugarEnFila("BET-1")).toBeUndefined();
  });

  it("con movimiento reducido nadie camina: aparecen en la fila", () => {
    const { vida, sync } = banco();
    sync({ op: { rm: true } });
    sync({ cambios: { "ELM-0": { st: "toca", espera: 30 } } });
    expect(camina(vida, "ELM-0")).toBe(false);
    expect(vida.fuera("ELM-0")).toMatchObject({ fila: 0, pos: sala("ELM").fila[0] });
  });

  it("en el TV, donde el descanso es más bajo, la fila es más corta y los que sobran esperan en su puesto", () => {
    const tv = armarPisoTv(HOY);
    const { vida, sync } = banco(tv);
    expect(sala("JST", tv).fila).toHaveLength(2);
    sync({ cambios: { "JST-0": { st: "toca", espera: 3 }, "JST-1": { st: "toca", espera: 2 }, "JST-2": { st: "toca", espera: 1 } } });
    expect(vida.lugarEnFila("JST-0")).toBe(0);
    expect(vida.lugarEnFila("JST-1")).toBe(1);
    expect(vida.enEscritorio("JST-2")).toBe(true);
  });
});

describe("entrega en la mesa (JST-163 §10)", () => {
  it("si quien recibe está libre en el descanso, los dos caminan a la mesa, quien entrega a la derecha y con el sobre en la mano", () => {
    const { vida, sync, hasta, avanzar } = banco();
    sync({ cambios: { "MIG-6": { st: "libre" } } });
    expect(vida.entrega("MIG-0", "MIG-6", "MIG-21")).toBe(true);
    expect(vida.sobresDe("MIG", false)).toEqual([]);
    expect(vida.fuera("MIG-0")).toMatchObject({ caminando: true, hacia: "mesa", junta: true });
    expect(vida.fuera("MIG-6")).toMatchObject({ hacia: "mesa", junta: true });
    const mano = vida.sobresManoDe("MIG");
    expect(mano).toHaveLength(1);
    expect(mano[0]!.mueve).toBe(true);
    const ms = hasta(() => vida.juntaDe("MIG") !== null);
    expect(ms).toBeLessThan(10_000);
    const j = vida.juntaDe("MIG")!;
    expect(j).toMatchObject({ codigo: "MIG-21", para: "Ingeniero frontend", responde: false });
    const m = sala("MIG").mesa;
    expect(j.de.pos).toEqual({ x: m.x + m.w + 7, y: m.y + m.h + 1 });
    expect(j.a.pos).toEqual({ x: m.x - 7, y: m.y + m.h + 1 });
    // Frente a frente, con el sobre sobre la mesa; quien entrega habla y quien recibe escucha.
    expect(vida.sobresManoDe("MIG")[0]!.pos).toEqual({ x: m.x + Math.round(m.w / 2), y: m.y + 2 });
    expect(vida.fuera("MIG-0")!.anim).toBe("charlar-izq");
    expect(vida.fuera("MIG-6")!.anim).toBe("escuchar-der");
    avanzar(RESPONDE_MS);
    expect(vida.juntaDe("MIG")!.responde).toBe(true);
    expect(vida.fuera("MIG-6")!.anim).toBe("charlar-der");
    // Mientras dura, el rótulo de la sala lo cuenta.
    expect(vida.rotuloDe("MIG")!.item).toMatchObject({ tipo: "entrega", codigo: "MIG-21", texto: "para Ingeniero frontend" });
  });

  it("a los 9 s terminan: quien recibe, que ya trabaja, se lleva el sobre a su escritorio y lo abre ahí; quien entrega vuelve a lo suyo", () => {
    const { vida, sync, hasta, avanzar } = banco();
    sync({ cambios: { "MIG-6": { st: "libre" } } });
    vida.entrega("MIG-0", "MIG-6", "MIG-21");
    hasta(() => vida.juntaDe("MIG") !== null);
    // Le llega su run (no corta la entrega).
    sync({ cambios: { "MIG-6": { st: "trabaja", codigo: "MIG-21" } } });
    avanzar(JUNTOS_MS - 200);
    expect(vida.juntaDe("MIG")).not.toBeNull();
    avanzar(250);
    expect(vida.juntaDe("MIG")).toBeNull();
    expect(vida.fuera("MIG-6")).toMatchObject({ caminando: true, hacia: "escritorio" });
    expect(vida.fuera("MIG-0")).toMatchObject({ caminando: true, hacia: "escritorio" });
    expect(vida.sobresManoDe("MIG")[0]!.mueve).toBe(true);
    hasta(() => vida.enEscritorio("MIG-6"));
    expect(vida.sobresDe("MIG", false)[0]).toMatchObject({ fase: "abre", codigo: "MIG-21" });
    expect(vida.sobresManoDe("MIG")).toEqual([]);
  });

  it("si quien recibe sigue libre al terminar, el sobre desaparece y se queda en el descanso", () => {
    const { vida, sync, hasta, avanzar } = banco();
    sync({ cambios: { "BET-7": { st: "libre" } } });
    vida.entrega("BET-0", "BET-7", "BET-50");
    hasta(() => vida.juntaDe("BET") !== null);
    avanzar(JUNTOS_MS + 50);
    expect(vida.sobresManoDe("BET")).toEqual([]);
    expect(vida.fuera("BET-7")!.hacia === "descanso" || !camina(vida, "BET-7")).toBe(true);
  });

  it("se corta si a alguno le cambia el estado (te necesita, error o pausa): cada uno sigue con lo suyo", () => {
    const { vida, sync } = banco();
    sync({ cambios: { "ELM-2": { st: "libre" } } });
    vida.entrega("ELM-0", "ELM-2", "ELM-5");
    sync({ cambios: { "ELM-2": { st: "libre" }, "ELM-0": { st: "error" } } });
    expect(vida.fuera("ELM-2")?.junta ?? false).toBe(false);
    expect(vida.sobresManoDe("ELM")).toEqual([]);
    expect(vida.fuera("ELM-0")?.hacia ?? "escritorio").toBe("escritorio");
  });

  it("el sobre de siempre si quien recibe trabaja (con «→ nombre» mientras vuela por el muro), con la mesa ocupada, a 1x y con movimiento reducido", () => {
    const { vida, sync, avanzar } = banco();
    sync({ cambios: { "MIG-5": { st: "libre" }, "MIG-7": { st: "libre" } } });
    // Trabaja: el sobre vuela; en el muro dice para quién va.
    vida.entrega("MIG-0", "MIG-6", "MIG-21");
    const para: Array<string | null> = [];
    avanzar(1_500, () => {
      const s = vida.sobresDe("MIG", false).find((x) => x.codigo === "MIG-21");
      if (s?.etiqueta === "muro") para.push(s.para);
    });
    expect(para.length).toBeGreaterThan(0);
    expect(new Set(para)).toEqual(new Set(["Ingeniero frontend"]));
    // La mesa ocupada: el siguiente, en sobre.
    expect(vida.entrega("MIG-1", "MIG-5", "MIG-22")).toBe(true);
    expect(vida.fuera("MIG-5")!.junta).toBe(true);
    vida.entrega("MIG-2", "MIG-7", "MIG-23");
    expect(vida.fuera("MIG-7")!.junta).toBe(false);
    expect(vida.sobresDe("MIG", false).some((s) => s.codigo === "MIG-23")).toBe(true);
    // A 1x (widget) y con movimiento reducido: sobre.
    const w = banco(armarPiso(HOY, 560, "widget"));
    w.sync({ cambios: { "BET-7": { st: "libre" } } });
    w.vida.entrega("BET-0", "BET-7", "BET-50");
    expect(w.vida.sobresDe("BET", true)).toHaveLength(1);
    const r = banco();
    r.sync({ op: { rm: true }, cambios: { "BET-7": { st: "libre" } } });
    r.vida.entrega("BET-0", "BET-7", "BET-50");
    expect(r.vida.sobresDe("BET", false)[0]).toMatchObject({ fase: "espera", etiqueta: "arriba", para: "Agente BET-7" });
  });

  it("quien está en la fila no recibe en la mesa, y quien entrega no va a la fila mientras entrega", () => {
    const { vida, sync } = banco();
    sync({ cambios: { "BET-7": { st: "toca", espera: 3 } } });
    vida.entrega("BET-0", "BET-7", "BET-50");
    expect(vida.fuera("BET-7")!.junta).toBe(false);
    expect(vida.sobresDe("BET", false)).toHaveLength(1);
  });

  const PISOS: Array<[string, PisoPlano]> = [
    ["la página a 2x", PISO],
    ["la página a 3x", { ...PISO, escala: 3 }],
    ["la página a 576", armarPiso(HOY, 576, "computador")],
    ["el TV", armarPisoTv(HOY)],
  ];
  for (const [nombre, piso] of PISOS) {
    it(`${nombre}: con el sofá lleno y gente al lado, los dos globos suben lo justo y no le tapan la cabeza a nadie mientras hablan (JST-190)`, () => {
      for (const pre of ["BET", "MIG"]) {
        const { vida, sync, hasta, avanzar } = banco(piso);
        const ids = idsDe(pre);
        // Todos libres en el descanso menos quien entrega y uno que trabaja.
        sync({ cambios: Object.fromEntries(ids.slice(2).map((id) => [id, { st: "libre" as const }])) });
        expect(vida.entrega(`${pre}-0`, ids.at(-1)!, `${pre}-519`)).toBe(true);
        hasta(() => vida.juntaDe(pre) !== null);
        const j = vida.juntaDe(pre)!;
        const s = sala(pre, piso);
        // Donde iban antes (sobre los dos, con su cola), le tapaban la cabeza a quien está en el sofá.
        expect(tapados(vida, { ...j, alto: 0 }, s, piso.escala, ids).length).toBeGreaterThan(0);
        expect(j.alto).toBeGreaterThan(0);
        expect(cajasDe(j, s, piso.escala).de[1]).toBeGreaterThanOrEqual(0);
        const malos = new Set<string>();
        avanzar(JUNTOS_MS - 100, () => {
          const jj = vida.juntaDe(pre);
          if (jj) for (const id of tapados(vida, jj, s, piso.escala, ids)) malos.add(id);
        });
        expect([...malos]).toEqual([]);
      }
    });
  }

  it("sin nadie más en el descanso, los globos van donde siempre: sobre los dos, con su cola (JST-190)", () => {
    const { vida, sync, hasta } = banco();
    sync({ cambios: { "MIG-6": { st: "libre" } } });
    vida.entrega("MIG-0", "MIG-6", "MIG-21");
    hasta(() => vida.juntaDe("MIG") !== null);
    expect(vida.juntaDe("MIG")!.alto).toBe(0);
  });

  it("en la sala acercada del celular, la frase de quien entrega queda dentro del descanso, encima del «🤝» y sin taparle la cabeza a nadie (JST-214)", () => {
    const piso = armarSalaAcercada(HOY[0]!, anchoCelular(390));
    const s = sala("BET", piso);
    const { vida, sync, hasta, avanzar } = banco(piso);
    const ids = idsDe("BET");
    sync({ cambios: Object.fromEntries(ids.slice(2).map((id) => [id, { st: "libre" as const }])) });
    expect(vida.entrega("BET-0", ids.at(-1)!, "BET-537")).toBe(true);
    hasta(() => vida.juntaDe("BET") !== null);
    const j = vida.juntaDe("BET")!;
    expect(j.encima).toBeGreaterThan(0);
    expect(j.corre).toBeLessThan(0);
    const c = cajasDe(j, s, piso.escala);
    expect(c.de[0]).toBeGreaterThanOrEqual(s.descanso.x + 2);
    expect(c.de[2]).toBeLessThanOrEqual(s.descanso.x + s.descanso.w - 2);
    expect(c.de[1]).toBeGreaterThanOrEqual(0);
    expect(cruzan(c.de, c.a)).toBe(false);
    const malos = new Set<string>();
    avanzar(JUNTOS_MS - 100, () => {
      const jj = vida.juntaDe("BET");
      if (jj) for (const id of tapados(vida, jj, s, piso.escala, ids)) malos.add(id);
    });
    expect([...malos]).toEqual([]);
    // A 360 el descanso mide 40: no cabe ni el código, va el sobre de siempre.
    const angosta = banco(armarSalaAcercada(HOY[0]!, anchoCelular(360)));
    angosta.sync({ cambios: { "BET-8": { st: "libre" } } });
    angosta.vida.entrega("BET-0", "BET-8", "BET-537");
    expect(angosta.vida.fuera("BET-8")?.junta).toBe(false);
    expect(angosta.vida.sobresDe("BET", false)).toHaveLength(1);
  });

  it("quien llega al descanso mientras hablan no se sienta bajo sus globos (JST-190)", () => {
    const { vida, sync, hasta, avanzar } = banco();
    const ids = idsDe("BET");
    // En el sofá BET-2 y BET-3; BET-8 recibe.
    const libres = (lista: string[]) => Object.fromEntries(lista.map((id) => [id, { st: "libre" as const }]));
    sync({ cambios: libres(["BET-2", "BET-3", "BET-8"]) });
    vida.entrega("BET-0", "BET-8", "BET-519");
    hasta(() => vida.juntaDe("BET") !== null);
    const j = vida.juntaDe("BET")!;
    const c = cajasDe(j, sala("BET"), PISO.escala);
    // Hay asientos libres bajo los globos (detrás del sofá, a la derecha): ahí no se sienta nadie mientras hablan.
    const bajo = sala("BET").asientos.filter((a) => !a.sofa && (tapaA(c.de, [{ x: a.x + 8, y: a.y + 24 }]) || tapaA(c.a, [{ x: a.x + 8, y: a.y + 24 }])));
    expect(bajo.length).toBeGreaterThan(0);
    // Llegan otros 5 (de a 3 por el cupo de caminar).
    const llegan = ["BET-1", "BET-4", "BET-5", "BET-6", "BET-7"];
    sync({ cambios: libres(["BET-2", "BET-3", "BET-8", ...llegan]) });
    const malos = new Set<string>();
    const sentados = new Set<string>();
    avanzar(JUNTOS_MS, () => {
      const jj = vida.juntaDe("BET");
      if (!jj) return;
      for (const id of tapados(vida, jj, sala("BET"), PISO.escala, ids)) malos.add(id);
      for (const id of llegan) if (!camina(vida, id) && !vida.enEscritorio(id)) sentados.add(id);
    });
    expect(sentados.size).toBeGreaterThanOrEqual(3);
    expect([...malos]).toEqual([]);
    expect(vida.juntaDe("BET")).toBeNull();
  });

  it("con conversaciones: ni el hilo tapa los globos de la entrega ni ellos al hilo, y con muchos libres nadie queda tapado (JST-190)", () => {
    const { vida, sync, avanzar } = banco();
    const ids = idsDe("BET");
    const charlas = () => (vida as unknown as { charlas: Array<{ prefijo: string; caja: CajaHilo; a: string; b: string }> }).charlas;
    const cambios = Object.fromEntries(ids.slice(1).map((id) => [id, { st: "libre" as const }]));
    sync({ op: { charlas: true }, cambios });
    const malos = new Set<string>();
    let juntas = 0;
    let cruces = 0;
    for (let k = 0; k < 12; k++) {
      avanzar(15_000, () => {
        const j = vida.juntaDe("BET");
        if (!j) return;
        for (const id of tapados(vida, j, sala("BET"), PISO.escala, ids)) malos.add(id);
        const c = cajasDe(j, sala("BET"), PISO.escala);
        for (const ch of charlas()) if (ch.prefijo === "BET" && (cruzan(ch.caja, c.de) || cruzan(ch.caja, c.a))) cruces += 1;
      });
      // Una entrega cada 15 s, de quien trabaja a alguien libre del descanso que no conversa.
      const a = ids.slice(1).find((id) => !charlas().some((ch) => ch.a === id || ch.b === id) && !camina(vida, id) && !vida.fuera(id)?.junta);
      if (a && vida.entrega("BET-0", a, `BET-${600 + k}`) && vida.fuera(a)?.junta) juntas += 1;
    }
    expect(juntas).toBeGreaterThan(5);
    expect([...malos]).toEqual([]);
    expect(cruces).toBe(0);
  });

  it("si alguno conversaba, la conversación se corta: lo llamaron a la mesa", () => {
    const { vida, sync, hasta } = banco();
    sync({ op: { charlas: true }, cambios: { "BET-5": { st: "libre" }, "BET-7": { st: "libre" } } });
    const charlas = () => (vida as unknown as { charlas: Array<{ a: string; b: string; fase: string }> }).charlas;
    hasta(() => charlas().length > 0, 120_000);
    const ch = charlas()[0]!;
    expect(vida.entrega("BET-0", ch.a, "BET-50")).toBe(true);
    expect(charlas()).toHaveLength(0);
    expect(vida.fuera(ch.a)!.junta).toBe(true);
  });
});

describe("rótulo: la hora estimada en una pastilla (JST-163 §9)", () => {
  it("cuando cuenta lo que hace alguien, lleva su hora; en cola, no", () => {
    const { vida, sync } = banco();
    sync();
    const r = vida.rotuloDe("ELM")!;
    expect(r.item.tipo).toBe("trabaja");
    expect(r.item.hora).toBe("≈15:05");
  });
});
