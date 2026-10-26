// Los globos de estado de una sala no se tapan ni salen de ella (JST-197, punto 4 de la QA de JST-168).
import { describe, expect, it } from "vitest";
import { repartirGlobos, type CajaGlobo } from "../src/ui/repartir.js";

const caja = (l: number, t: number, r: number, b: number): CajaGlobo => ({ l, t, r, b });

/** Las cajas ya corridas. */
function corridas(cajas: readonly CajaGlobo[], izq: number, der: number, aire: number): CajaGlobo[] {
  return repartirGlobos(cajas, izq, der, aire).map(({ dx, dy }, i) => {
    const c = cajas[i]!;
    return { l: c.l + dx, r: c.r + dx, t: c.t + dy, b: c.b + dy };
  });
}

/** Ningún par se toca (con `aire` entre ellos) y todos quedan entre `izq` y `der`. */
function sinTocarse(cajas: readonly CajaGlobo[], izq: number, der: number, aire: number): void {
  for (const c of cajas) {
    expect(c.l).toBeGreaterThanOrEqual(izq - 1e-9);
    expect(c.r).toBeLessThanOrEqual(der + 1e-9);
  }
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i]!;
      const b = cajas[j]!;
      const aLo = a.b <= b.t || b.b <= a.t;
      const aLoAncho = a.r + aire <= b.l + 1e-9 || b.r + aire <= a.l + 1e-9;
      expect(aLo || aLoAncho, `${i} y ${j} se tocan`).toBe(true);
    }
  }
}

describe("los globos de estado de una sala no se tapan ni salen de ella (JST-197)", () => {
  // Las cajas que midió la QA en el celular (390 × 844), sala acercada a 2x: la sala va de 12 a 378.
  const IZQ = 14;
  const DER = 376;

  it("Betalandia: «⏱ lleva 23 h», «✋ BET-502 +2» y «BET-755 / ✋ BET-752 +2» en una fila quedan sin tocarse, en orden y cerca de su dueño", () => {
    const antes = [caja(14, 352, 78, 382), caja(76, 364, 160, 382), caja(153, 352, 227, 382)];
    const despues = corridas(antes, IZQ, DER, 4);
    sinTocarse(despues, IZQ, DER, 4);
    expect(despues.map((c) => c.l)).toEqual([...despues.map((c) => c.l)].sort((a, b) => a - b));
    for (let i = 0; i < antes.length; i++) expect(Math.abs(despues[i]!.l - antes[i]!.l)).toBeLessThan(20);
    // Nadie sube: a lo ancho caben.
    expect(despues.map((c) => c.t)).toEqual(antes.map((c) => c.t));
  });

  it("El Mirador: «✋ ELM-502 +2» en la orilla izquierda entra a la sala y empuja a «ELM-537»", () => {
    const despues = corridas([caja(4.45, 280, 87.55, 298), caja(85, 280, 151, 298)], IZQ, DER, 4);
    sinTocarse(despues, IZQ, DER, 4);
    expect(despues[0]!.l).toBeCloseTo(IZQ);
    expect(despues[1]!.l).toBeCloseTo(IZQ + 83.1 + 4);
  });

  it("si nada se toca ni se sale, nada se mueve", () => {
    const cajas = [caja(20, 50, 80, 68), caja(92, 38, 160, 68), caja(200, 50, 260, 68), caja(290, 150, 370, 168)];
    expect(repartirGlobos(cajas, IZQ, DER, 4)).toEqual(cajas.map(() => ({ dx: 0, dy: 0 })));
  });

  it("dos que se tapan en medio de la sala se corren la mitad cada uno", () => {
    const [a, b] = repartirGlobos([caja(100, 10, 180, 28), caja(170, 10, 250, 28)], IZQ, DER, 4);
    expect(a!.dx).toBeCloseTo(-7);
    expect(b!.dx).toBeCloseTo(7);
  });

  it("el de la orilla derecha entra a la sala", () => {
    const [a] = repartirGlobos([caja(330, 10, 390, 28)], IZQ, DER, 4);
    expect(a!.dx).toBeCloseTo(DER - 390);
  });

  it("los globos de filas distintas (que no se cruzan a lo alto) no se empujan", () => {
    const cajas = [caja(100, 10, 180, 28), caja(110, 90, 190, 120)];
    expect(repartirGlobos(cajas, IZQ, DER, 4)).toEqual([
      { dx: 0, dy: 0 },
      { dx: 0, dy: 0 },
    ]);
  });

  it("un globo alto de dos pisos y uno de un piso con la misma base son de la misma fila", () => {
    const despues = corridas([caja(100, 352, 174, 382), caja(170, 364, 254, 382)], IZQ, DER, 4);
    sinTocarse(despues, IZQ, DER, 4);
  });

  it("si la fila no cabe a lo ancho, uno de cada dos sube por encima de los otros y ninguno se tapa", () => {
    const cajas = [caja(20, 100, 120, 118), caja(90, 100, 190, 118), caja(160, 100, 260, 118), caja(230, 100, 330, 118)];
    const despues = corridas(cajas, 20, 320, 4);
    sinTocarse(despues, 20, 320, 4);
    expect(despues.map((c) => c.t < 100)).toEqual([false, true, false, true]);
    for (const c of [despues[1]!, despues[3]!]) expect(c.b).toBeLessThanOrEqual(100 - 4);
  });
});
