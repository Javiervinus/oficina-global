import { describe, expect, it } from "vitest";
import {
  aEstrella,
  camaDe,
  cubierta,
  duracionSobre,
  easeInOutQuad,
  enL,
  enRecorrido,
  hayPaso,
  largo,
  libre,
  CHARLA_DESDE_TECHO,
  objetivoCharla,
  pasillosDe,
  piesAsiento,
  piesPuesto,
  puntosDeCharla,
  recorrido,
  rejillaDe,
  ruta,
  rutaSobre,
  salidaPuesto,
  Y_MURO_SOBRE,
  type Punto,
} from "../src/caminos.js";
import { cajaHilo, tamanoHilo, tapaA } from "../src/hilo.js";
import { BORDE, PASILLO, armarPiso, armarPisoTv, armarSalaAcercada, type EntradaSala, type PisoPlano } from "../src/plano.js";

// Las 4 empresas de hoy (BET 9, ELM 4, JST 5, MIG 8), como en la prueba técnica (spike/caminar.spec.ts).
const HOY: EntradaSala[] = [
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "MIG", agentes: 8 },
];

const PISOS: Array<[string, PisoPlano]> = [
  ["computador 576", armarPiso(HOY, 576, "computador")],
  ["computador 640", armarPiso(HOY, 640, "computador")],
  ["tv", armarPisoTv(HOY)],
  ["celular 366", armarPiso(HOY, 366, "celular")],
  ["widget", armarPiso(HOY, 560, "widget")],
  ...HOY.map((s): [string, PisoPlano] => [`acercada ${s.prefijo}`, armarSalaAcercada(s, 366)]),
];

/** Cada tramo es horizontal o vertical (los caminos van en L). */
function enEle(puntos: readonly Punto[]): boolean {
  return puntos.every((p, i) => i === 0 || p.x === puntos[i - 1]!.x || p.y === puntos[i - 1]!.y);
}

/** `p` está en el tramo recto de `a` a `b` (inclusive). */
function enTramo(p: Punto, a: Punto, b: Punto): boolean {
  if (a.x === b.x) return p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y) return p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return false;
}

/** Esquinas: puntos intermedios donde cambia la dirección. */
function esquinasDe(puntos: readonly Punto[]): number {
  let n = 0;
  for (let i = 1; i < puntos.length - 1; i++) {
    const a = puntos[i - 1]!;
    const b = puntos[i]!;
    const c = puntos[i + 1]!;
    if (!((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y))) n += 1;
  }
  return n;
}

/**
 * Frente del sofá: la franja libre entre el sofá y la mesita, 2 px bajo los pies del asiento.
 * (En todos los planos, 10 px más abajo ya es la mesita: ver «el frente del sofá…».)
 */
const frenteSofa = (meta: Punto): Punto => ({ x: meta.x, y: meta.y + 2 });

describe("caminar entre el escritorio y el descanso (JST-96 §4)", () => {
  for (const [nombre, piso] of PISOS) {
    it(`${nombre}: de cada puesto a cada asiento que se usa y de vuelta, en L y sin pisar muebles`, () => {
      for (const sala of piso.salas) {
        const r = rejillaDe(sala);
        // Los asientos se toman en orden: en una sala nunca se usan más que sus puestos (más 2 de margen).
        const usados = Math.min(sala.asientos.length, sala.puestos.length + 2);
        for (let i = 0; i < sala.puestos.length; i++) {
          const puesto = sala.puestos[i]!;
          const sentado = piesPuesto(puesto);
          const salida = salidaPuesto(puesto);
          for (let k = 0; k < usados; k++) {
            const a = sala.asientos[k]!;
            const meta = piesAsiento(a);
            const frente = frenteSofa(meta);
            const ida = ruta(r, sentado, meta, { pre: [salida], post: a.sofa ? [frente] : [] });
            const msg = `${nombre} ${sala.prefijo} puesto ${i} → asiento ${k}`;
            expect(ida, msg).not.toBeNull();
            expect(enEle(ida!), `${msg} en L`).toBe(true);
            expect(ida![0]).toEqual(sentado);
            // Se levanta hacia atrás: el primer tramo es vertical y pasa por la salida (si sigue derecho, la salida queda en medio).
            expect(enTramo(salida, ida![0]!, ida![1]!), `${msg} pasa por la salida`).toBe(true);
            expect(ida!.at(-1)).toEqual(meta);
            // Fijos: levantarse (sentado → salida, tapado por el escritorio) y sentarse en el sofá desde el frente.
            const medio = [salida, ...ida!.slice(1, a.sofa ? -1 : undefined)];
            for (let j = 1; j < medio.length; j++) expect(hayPaso(r, medio[j - 1]!, medio[j]!), `${msg} tramo ${j}`).toBe(true);
            expect(largo(ida!)).toBeLessThan(sala.w + sala.h * 2);

            const vuelta = ruta(r, meta, sentado, { pre: a.sofa ? [frente] : [], post: [salida] });
            expect(vuelta, `${nombre} ${sala.prefijo} asiento ${k} → puesto ${i}`).not.toBeNull();
            expect(enEle(vuelta!), `${msg} vuelta en L`).toBe(true);
            expect(vuelta!.at(-1)).toEqual(sentado);
            expect(enTramo(salida, vuelta!.at(-2)!, vuelta!.at(-1)!), `${msg} vuelta pasa por la salida`).toBe(true);
            const medioV = [...vuelta!.slice(a.sofa ? 1 : 0, -1), salida];
            for (let j = 1; j < medioV.length; j++) expect(hayPaso(r, medioV[j - 1]!, medioV[j]!), `${msg} vuelta tramo ${j}`).toBe(true);
          }
        }
      }
    }, 30_000);
  }

  it("el frente del sofá: la franja entre el sofá y la mesita (pies + 2) es libre; 10 px más abajo ya es la mesita", () => {
    for (const [, piso] of PISOS) {
      for (const sala of piso.salas) {
        const r = rejillaDe(sala);
        for (const a of sala.asientos.filter((x) => x.sofa)) {
          const meta = piesAsiento(a);
          expect(libre(r, frenteSofa(meta)), `${sala.prefijo} frente del sofá`).toBe(true);
          expect(libre(r, { x: meta.x, y: meta.y + 10 })).toBe(false);
        }
      }
    }
  });

  it("los asientos que se usan (tantos como puestos) tienen los pies en suelo libre", () => {
    for (const [nombre, piso] of PISOS) {
      for (const sala of piso.salas) {
        const r = rejillaDe(sala);
        const usados = sala.asientos.slice(0, sala.puestos.length + 2).filter((a) => !a.sofa);
        for (const a of usados) expect(libre(r, piesAsiento(a)), `${nombre} ${sala.prefijo} asiento en ${a.x},${a.y}`).toBe(true);
      }
    }
  });

  it("el A* de 4 vecinos dobla poco: sin obstáculos, una esquina como mucho", () => {
    const base = armarPiso(HOY, 576, "computador").salas[0]!;
    // Una sala vacía (sin puestos ni muebles): solo chocan los bordes y el muro.
    const vacia = { ...base, puestos: [], muebles: [], asientos: [] };
    const r = rejillaDe(vacia);
    const a = { x: 21, y: 61 };
    const b = { x: 201, y: 121 };
    expect(libre(r, a) && libre(r, b)).toBe(true);
    const camino = aEstrella(r, a, b)!;
    expect(camino).not.toBeNull();
    expect(enEle(camino)).toBe(true);
    expect(esquinasDe(camino)).toBeLessThanOrEqual(1);
    expect(largo(camino)).toBe(180 + 60);
    // En línea recta: ni una esquina.
    expect(aEstrella(r, a, { x: b.x, y: a.y })).toHaveLength(2);
    // Con muebles, igual va en L.
    const sala = armarPiso(HOY, 576, "computador").salas.find((s) => s.prefijo === "BET")!;
    const rs = rejillaDe(sala);
    const c = aEstrella(rs, salidaPuesto(sala.puestos[0]!), piesAsiento(sala.asientos[3]!));
    expect(c).not.toBeNull();
    expect(enEle(c!)).toBe(true);
  });

  it("no hay camino hacia un lugar ocupado", () => {
    const sala = armarPiso(HOY, 576, "computador").salas[0]!;
    const r = rejillaDe(sala);
    expect(aEstrella(r, piesPuesto(sala.puestos[0]!), { x: 1, y: 1 })).toBeNull();
  });

  it("enL dobla primero en x y quita los puntos repetidos y los intermedios en línea", () => {
    expect(
      enL([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 20 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ]);
  });

  it("recorrido y enRecorrido: la posición avanza por los tramos y mira hacia donde va", () => {
    const rec = recorrido([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
    ]);
    expect(rec.largo).toBe(30);
    expect(enRecorrido(rec, 10)).toEqual({ pos: { x: 10, y: 0 }, dir: "der" });
    expect(enRecorrido(rec, 25)).toEqual({ pos: { x: 20, y: 5 }, dir: "abajo" });
    expect(enRecorrido(rec, 99).pos).toEqual({ x: 20, y: 10 });
    // Un escalón de 1 px no lo hace girar: toma la dirección del tramo siguiente.
    const escalon = recorrido([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: -30 },
    ]);
    expect(escalon.dirs).toEqual(["arriba", "arriba"]);
  });
});

describe("recorrido del sobre por el muro (JST-96 §5)", () => {
  const sala = armarPiso(HOY, 576, "computador").salas.find((s) => s.prefijo === "BET")!;
  const de = sala.puestos[0]!;
  const a = sala.puestos[7]!;

  it("sube por el pasillo de la derecha del escritorio, recorre el muro en y = 14 y baja", () => {
    const pts = rutaSobre(de, a);
    expect(pts).toEqual([
      cubierta(de),
      { x: de.x + 38, y: de.y + 15 },
      { x: de.x + 38, y: Y_MURO_SOBRE },
      { x: a.x + 38, y: Y_MURO_SOBRE },
      { x: a.x + 38, y: a.y + 15 },
      cubierta(a),
    ]);
    expect(Y_MURO_SOBRE).toBe(14);
    expect(enEle(pts)).toBe(true);
  });

  it("con quien recibe en la misma columna, el muro no suma un tramo vacío", () => {
    const misma = rutaSobre(sala.puestos[0]!, sala.puestos[3]!);
    expect(misma).toHaveLength(5);
    expect(enEle(misma)).toBe(true);
  });

  it("dura 400 ms + 4 ms por pixel, entre 1000 y 1800 ms", () => {
    expect(duracionSobre(0)).toBe(1000);
    expect(duracionSobre(200)).toBe(1200);
    expect(duracionSobre(10_000)).toBe(1800);
    const l = recorrido(rutaSobre(de, a)).largo;
    const d = duracionSobre(l);
    expect(d).toBeGreaterThanOrEqual(1000);
    expect(d).toBeLessThanOrEqual(1800);
  });

  it("easeInOutQuad: arranca y frena suave", () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(0.5)).toBe(0.5);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(-1)).toBe(0);
    expect(easeInOutQuad(2)).toBe(1);
    expect(easeInOutQuad(0.25)).toBeLessThan(0.25);
    expect(easeInOutQuad(0.75)).toBeGreaterThan(0.75);
  });
});

describe("pasillos y camas de las mascotas (JST-96 §7)", () => {
  it("4 empresas en el computador: 1 pasillo de 16 entre las filas, de borde a borde", () => {
    const piso = armarPiso(HOY, 576, "computador");
    const pasillos = pasillosDe(piso);
    expect(pasillos).toHaveLength(1);
    const arriba = piso.salas.filter((s) => s.y === BORDE);
    const p = pasillos[0]!;
    expect(p).toEqual({ x: BORDE, y: BORDE + arriba[0]!.h, w: piso.w - 2 * BORDE, h: PASILLO });
    // Las salas de abajo empiezan justo después del pasillo.
    expect(piso.salas.filter((s) => s.y > BORDE).every((s) => s.y === p.y + PASILLO)).toBe(true);
  });

  it("con 5 empresas en el TV a 2x (filas de 3) también hay 1 pasillo; con una sala acercada, ninguno", () => {
    expect(pasillosDe(armarPisoTv([...HOY, { prefijo: "PER", agentes: 3 }]))).toHaveLength(1);
    expect(pasillosDe(armarSalaAcercada(HOY[0]!, 366))).toHaveLength(0);
    expect(pasillosDe(armarPiso([HOY[0]!, HOY[1]!], 576, "computador"))).toHaveLength(0);
  });

  it("las 4 camas van a lo ancho del pasillo, en y = pasillo.y + 14", () => {
    const p = pasillosDe(armarPiso(HOY, 576, "computador"))[0]!;
    const camas = [0, 1, 2, 3].map((i) => camaDe(p, i));
    expect(camas.map((c) => c.y)).toEqual([p.y + 14, p.y + 14, p.y + 14, p.y + 14]);
    expect(camas[0]!.x).toBe(Math.round(p.x + 14 + (p.w - 28) / 8));
    for (let i = 1; i < 4; i++) expect(camas[i]!.x).toBeGreaterThan(camas[i - 1]!.x);
    expect(camas.every((c) => c.x > p.x && c.x < p.x + p.w)).toBe(true);
  });
});

describe("puntos de una conversación (JST-96 §6; 0.4.0, JST-162 §2.3)", () => {
  const piso = armarPiso(HOY, 576, "computador");
  // En todas las escenas con conversaciones (no el widget), hay lugar al medio del descanso y a 44 px del techo o más.
  for (const [nombre, plano] of PISOS.filter(([n]) => n !== "widget")) {
    it(`${nombre}: en cada sala hay 2 puntos a 44 px del techo del descanso o más (caben los 2 globos del hilo)`, () => {
      for (const sala of plano.salas) {
        const puntos = puntosDeCharla(sala, rejillaDe(sala), []);
        expect(puntos, sala.prefijo).not.toBeNull();
        expect(puntos![0].y - sala.descanso.y).toBeGreaterThanOrEqual(CHARLA_DESDE_TECHO);
      }
    });
  }
  for (const sala of piso.salas) {
    it(`${sala.prefijo}: 2 puntos libres a 16 px y a la misma altura, cerca del objetivo`, () => {
      const r = rejillaDe(sala);
      const puntos = puntosDeCharla(sala, r, []);
      expect(puntos).not.toBeNull();
      const [p, q] = puntos!;
      expect(q.x - p.x).toBe(16);
      expect(q.y).toBe(p.y);
      expect(libre(r, p) && libre(r, q)).toBe(true);
      const d = sala.descanso;
      expect(p.x).toBeGreaterThanOrEqual(d.x);
      expect(q.x).toBeLessThanOrEqual(d.x + d.w);
      const obj = objetivoCharla(sala);
      expect(Math.hypot(p.x + 8 - obj.x, p.y - obj.y)).toBeLessThan(40);
      // Sin un mueble encima del cuerpo.
      for (const c of r.cuerpos) for (const pt of [p, q]) expect(pt.x - 6 < c[2] && pt.x + 6 > c[0] && pt.y - 20 < c[3] && pt.y > c[1]).toBe(false);
    });
  }

  it("el objetivo va al medio del descanso y más abajo, con o sin cafetera (JST-162 §2.3)", () => {
    const sala = piso.salas[0]!;
    const d = sala.descanso;
    expect(objetivoCharla(sala)).toEqual({ x: d.x + d.w * 0.45, y: d.y + d.h * 0.72 });
    const sinCafetera = { ...sala, muebles: sala.muebles.filter((m) => m.nombre !== "cafetera") };
    expect(objetivoCharla(sinCafetera)).toEqual(objetivoCharla(sala));
  });

  it("los puntos quedan a más de 12×10 de los demás agentes", () => {
    const sala = piso.salas[0]!;
    const r = rejillaDe(sala);
    const [p, q] = puntosDeCharla(sala, r, [])!;
    const otros = [p, q];
    const nuevos = puntosDeCharla(sala, r, otros)!;
    expect(nuevos).not.toBeNull();
    for (const n of nuevos) for (const o of otros) expect(Math.abs(n.x - o.x) < 12 && Math.abs(n.y - o.y) < 10).toBe(false);
  });

  // JST-172: con lo que va a medir el hilo, la pareja se junta donde no le tapa la cabeza a nadie.
  const hiloDe = (sala: (typeof piso.salas)[number], lineas: number) =>
    tamanoHilo(
      Array.from({ length: lineas }, (_, i) => ({ quien: "A", texto: i % 2 ? "Pudo haber sido un correo." : "¿Otra reunión?", codigo: null, titulo: null })),
      sala.descanso.w,
    );
  for (const [nombre, plano] of PISOS.filter(([n]) => n !== "widget")) {
    it(`${nombre}: con alguien en el sofá, el hilo de una conversación corta no le tapa la cabeza ni sale de la sala por arriba (JST-172)`, () => {
      for (const sala of plano.salas) {
        const sofa = piesAsiento(sala.asientos[0]!);
        const hilo = hiloDe(sala, 3);
        const puntos = puntosDeCharla(sala, rejillaDe(sala), [sofa], hilo);
        expect(puntos, sala.prefijo).not.toBeNull();
        const [p] = puntos!;
        const caja = cajaHilo(sala.descanso, { x: p.x + 8, y: p.y - 25 }, hilo);
        expect(tapaA(caja, [sofa]), sala.prefijo).toBe(false);
        expect(caja[1]).toBeGreaterThanOrEqual(0);
        expect(p.y - sala.descanso.y).toBeGreaterThanOrEqual(CHARLA_DESDE_TECHO);
      }
    });
  }

  it("JSTM a 576: el punto de siempre le tapa la cabeza a quien está en el sofá; con el hilo, la pareja se junta más abajo (JST-172)", () => {
    const sala = piso.salas.find((s) => s.prefijo === "JST")!;
    const r = rejillaDe(sala);
    const sofa = piesAsiento(sala.asientos[0]!);
    const hilo = hiloDe(sala, 3);
    const antes = puntosDeCharla(sala, r, [sofa])!;
    expect(tapaA(cajaHilo(sala.descanso, { x: antes[0].x + 8, y: antes[0].y - 25 }, hilo), [sofa])).toBe(true);
    const ahora = puntosDeCharla(sala, r, [sofa], hilo)!;
    expect(ahora[0].y).toBeGreaterThan(antes[0].y);
  });

  it("si no hay dónde (en JSTM a 576, alguien de pie detrás del sofá), `null`: no conversan (JST-172)", () => {
    const sala = piso.salas.find((s) => s.prefijo === "JST")!;
    const detras = piesAsiento(sala.asientos[2]!);
    expect(detras).toEqual({ x: 196, y: 86 });
    expect(puntosDeCharla(sala, rejillaDe(sala), [detras], hiloDe(sala, 2))).toBeNull();
    // Sin el hilo (como antes) se juntaban igual, y el hilo le tapaba la cabeza.
    expect(puntosDeCharla(sala, rejillaDe(sala), [detras])).not.toBeNull();
  });
});
