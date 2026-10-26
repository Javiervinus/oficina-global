import { describe, expect, it } from "vitest";
import { Guionista, type AgenteCharla, type ContextoCharla, type Linea } from "../src/charlas.js";
import { altoEntrega, anchoTexto, cabezaDe, cajaHilo, cajasEntrega, cruzan, HILO_SOBRE_CABEZA, subirEntrega, tamanoHilo, tapaA } from "../src/hilo.js";

// JST-172: lo que mide el hilo de una conversación antes de dibujarlo, para que la pareja se junte donde no le tapa
// la cabeza a nadie que no conversa.

const l = (texto: string, codigo: string | null = null, titulo: string | null = null): Linea => ({ quien: "A", texto, codigo, titulo });
/** Un globo de una línea sin tarea, a 2x: relleno y borde (4) + una línea de 5 × 1,22. */
const UNA = 4 + 5 * 1.22;

describe("lo que mide el hilo (JST-172)", () => {
  it("dos frases cortas en un descanso ancho: 2 globos de una línea, 2 px entre ellos y 2 de holgura", () => {
    const t = tamanoHilo([l("¿Otra reunión?"), l("Pudo haber sido un correo.")], 172);
    expect(t.h).toBeCloseTo(UNA + 2 + UNA + 2, 5);
    // El ancho: lo que mide la frase más larga, con relleno, borde y la sangría de 8, más 4 de holgura.
    expect(t.w).toBeCloseTo(anchoTexto("Pudo haber sido un correo.") + 7 + 8 + 4, 5);
  });

  it("nunca menos de 44 px de ancho, ni más que el descanso − 2 (más la holgura)", () => {
    expect(tamanoHilo([l("☕"), l("Ánimo.")], 172).w).toBe(44 + 4);
    expect(tamanoHilo([l("Este café está más cargado que el servidor."), l("Por eso todos teclean tan rápido.")], 55).w).toBe(53 + 4);
  });

  it("en un descanso angosto la frase se parte en 2 líneas (y no más) y el hilo crece", () => {
    const frases = [l("Este café está más cargado que el servidor."), l("Por eso todos teclean tan rápido.")];
    const ancho = tamanoHilo(frases, 172);
    const angosto = tamanoHilo(frases, 55);
    expect(angosto.h).toBeCloseTo(ancho.h + 2 * 5 * 1.22, 5);
    expect(tamanoHilo([l("una frase muy pero muy larga que en un descanso angosto ocuparía cuatro o cinco líneas si no se cortara"), l("Sí.")], 55).h).toBeCloseTo(4 + 2 * 6.1 + 2 + UNA + 2, 5);
  });

  it("la tarea suma su línea (0,9 em abajo, 0,85 em arriba) y no pasa del ancho", () => {
    const sin = tamanoHilo([l("Acabo de terminar esta."), l("¡Bien! ¿Fue complicado?")], 172);
    const con = tamanoHilo([l("Acabo de terminar esta.", "JST-91", "Re-QA de «Oficina global» 0.1.5 en la copia"), l("¡Bien! ¿Fue complicado?")], 172);
    // Lo más alto es la 2.ª frase con la 1.ª arriba (la tarea a 0,85 em, más 1 px de separación).
    expect(con.h - sin.h).toBeCloseTo(1 + 5 * 0.85 * 1.22, 5);
    expect(con.w).toBeGreaterThan(sin.w);
    expect(tamanoHilo([l("Esta.", "JST-91", "Re-QA de «Oficina global» 0.1.5 en la copia")], 60).w).toBe(58 + 4);
  });

  // Hilos dibujados de verdad en el banco (Chrome, la Inter del host), en pixeles de arte: lo estimado no queda corto
  // y, a 2x, se pasa como mucho por la holgura (4 de ancho y 2 de alto) y un poco más (los anchos van redondeados hacia arriba).
  // Los nombres largos del banco (`largos=1`), con la tarea en una línea (JST-175).
  const PORTAL = "Alta en el portal · C-2 correo de bienvenida y verificación";
  const PESTANAS = "Pestañas de la ficha con el log del run y los archivos";
  const MEDIDOS: Array<{ donde: string; ancho: number; lineas: Linea[]; w: number; h: number; px: number }> = [
    { donde: "BET en la página (2x)", ancho: 172, lineas: [l("Este café está más cargado que el servidor."), l("Por eso todos teclean tan rápido.")], w: 120.27, h: 22.19, px: 2 },
    { donde: "JSTM en la página (2x)", ancho: 76, lineas: [l("Acabo de terminar esta.", "JST-91", PORTAL), l("¡Bien! ¿Fue complicado?")], w: 74, h: 28.37, px: 2 },
    { donde: "JSTM en la página (2x), la tarea sin nombre", ancho: 76, lineas: [l("¿En qué anda JST 3?"), l("En esta.", "JST-103")], w: 65.43, h: 28.67, px: 2 },
    { donde: "JSTM acercada en el celular (2x)", ancho: 55, lineas: [l("¿Cómo te fue con la última?"), l("Bien, ya está lista.", "JST-92", PESTANAS)], w: 53, h: 34.77, px: 2 },
    { donde: "BET en el TV (3x)", ancho: 202, lineas: [l("¿En qué anda BET 3?"), l("En esta.", "BET-103")], w: 61.94, h: 26.84, px: 3 },
  ];
  for (const m of MEDIDOS) {
    it(`como lo dibuja Chrome: ${m.donde}`, () => {
      const t = tamanoHilo(m.lineas, m.ancho);
      expect(t.w).toBeGreaterThanOrEqual(m.w);
      expect(t.h).toBeGreaterThanOrEqual(m.h);
      if (m.px === 2) {
        expect(t.w - m.w).toBeLessThanOrEqual(4 + 3);
        expect(t.h - m.h).toBeLessThanOrEqual(2 + 0.5);
      }
    });
  }

  it("la caja: centrada sobre la pareja, 3 px sobre la cabeza más alta, y corrida entera para no salir del descanso", () => {
    const d = { x: 100, w: 80 };
    expect(cajaHilo(d, { x: 140, y: 70 }, { w: 40, h: 30 })).toEqual([120, 70 - HILO_SOBRE_CABEZA - 30, 160, 70 - HILO_SOBRE_CABEZA]);
    expect(cajaHilo(d, { x: 105, y: 70 }, { w: 40, h: 30 })[0]).toBe(101);
    expect(cajaHilo(d, { x: 175, y: 70 }, { w: 40, h: 30 })[2]).toBe(179);
    // Más ancho que el descanso: empieza en su borde izquierdo.
    expect(cajaHilo(d, { x: 140, y: 70 }, { w: 90, h: 30 })[0]).toBe(101);
  });

  it("tapa una cabeza si toca la mitad de arriba del dibujo de 16×24 (como la mide la QA); el borde justo no cuenta", () => {
    const pies = { x: 50, y: 80 };
    expect(cabezaDe(pies)).toEqual([42, 56, 58, 68]);
    expect(tapaA([0, 0, 100, 56], [pies])).toBe(false);
    expect(tapaA([0, 0, 100, 57], [pies])).toBe(true);
    expect(tapaA([58, 0, 100, 100], [pies])).toBe(false);
    expect(tapaA([0, 68, 100, 100], [pies])).toBe(false);
    expect(tapaA([0, 0, 100, 57], [])).toBe(false);
  });
});

// JST-190: los globos de la entrega en la mesa, con lo que midió la QA en BET a 2x (BET-519, 22-10 19:31; en pixeles
// de arte de la sala): quien entrega a la derecha de la mesa con los pies en (376, 76), quien recibe en (344, 76).
describe("los globos de la entrega en la mesa (JST-190)", () => {
  const DE = { x: 376, y: 76 };
  const A = { x: 344, y: 76 };
  // El descanso termina en 439: la frase llega hasta 437.
  const D = { x: 284, w: 155 };
  const FIN = D.x + D.w - 2;
  // Las cabezas que tapaban: en el sofá (los dos asientos), de pie a la derecha del sofá y detrás, más arriba.
  const SOFA_1 = { x: 353, y: 61 };
  const SOFA_2 = { x: 367, y: 61 };
  const AL_LADO = { x: 387, y: 70 };
  const DETRAS = { x: 387, y: 54 };
  const base = cajasEntrega(DE, A, "BET-519", "Sonda QA168 recibe", D, 2)!;

  it("miden lo que mide la página: la frase de 14 px a la izquierda de quien entrega hasta el borde del descanso, el «🤝» de 11 centrado", () => {
    // La QA midió [738, 346, 874, 362] y [677, 346, 699, 362] px de pantalla (÷ 2, con la sala 133 más abajo).
    expect(base.de).toEqual([369, 40, 437, 48]);
    expect(base.a).toEqual([338.5, 40, 349.5, 48]);
    // Una frase corta no llega al borde.
    const corta = cajasEntrega(DE, A, "BET-5", "QA", D, 2)!;
    expect(corta.de[2]).toBeLessThan(FIN - 20);
    expect(corta.de[2] - corta.de[0]).toBeGreaterThan(anchoTexto("BET-5 → QA"));
  });

  it("sin nadie cerca no suben; con el sofá lleno y gente al lado, suben lo justo para no taparle la cabeza a nadie", () => {
    expect(altoEntrega(base, [])).toBe(0);
    expect(altoEntrega(base, [{ x: 300, y: 61 }])).toBe(0);
    const otros = [SOFA_1, SOFA_2, AL_LADO, DETRAS];
    expect(tapaA(base.de, otros) && tapaA(base.a, otros)).toBe(true);
    const alto = altoEntrega(base, otros)!;
    // Sobre la cabeza más alta (la de detrás, desde 30), con 2 de aire (al aparecer, el globo baja 3 px de pantalla).
    expect(alto).toBe(48 - 30 + 2);
    const arriba = subirEntrega(base, alto);
    expect(tapaA(arriba.de, otros) || tapaA(arriba.a, otros)).toBe(false);
    // Con 3 menos ya le tapan la cabeza (con 2 menos, la tocan justo en el borde).
    const menos = subirEntrega(base, alto - 3);
    expect(tapaA(menos.de, otros) || tapaA(menos.a, otros)).toBe(true);
    // Solo el sofá: les basta quedar sobre las cabezas del sofá.
    expect(altoEntrega(base, [SOFA_1, SOFA_2])).toBe(48 - 37 + 2);
  });

  it("tampoco tocan el hilo de una conversación ni tu escritorio; si para eso salen de la sala por arriba, `null`", () => {
    expect(altoEntrega(base, [], [[400, 30, 430, 45]])).toBe(48 - 30 + 2);
    expect(altoEntrega(base, [], [[300, 0, 440, 45]])).toBeNull();
  });
});

// JST-214: en la sala acercada de BET en el celular a 390, el descanso mide 55 (desde 122) y quien entrega queda a 7 de
// arte del borde; la frase medía 14 de arte (28 px) y «BET-537 →» se salía. ELM, en la página a 1300, con tu escritorio.
describe("la frase de la entrega cuando no cabe hasta el borde del descanso (JST-214)", () => {
  const DE = { x: 168, y: 76 };
  const A = { x: 136, y: 76 };
  const D = { x: 122, w: 55 };
  const SOFA = [
    { x: 145, y: 61 },
    { x: 159, y: 61 },
  ];

  it("donde hasta el borde cabe el código con la flecha, va donde siempre (la página a 2x)", () => {
    const c = cajasEntrega({ x: 376, y: 76 }, { x: 344, y: 76 }, "BET-519", "Sonda QA168 recibe", { x: 284, w: 155 }, 2)!;
    expect(c).toMatchObject({ corre: 0, encima: 0 });
    expect(c.de[0]).toBe(376 - 7);
  });

  it("en la sala acercada del celular va encima del «🤝», en todo el ancho del descanso y sin taparlo", () => {
    const c = cajasEntrega(DE, A, "BET-537", "Sonda QA168 recibe", D, 2)!;
    expect(c.a).toEqual([130.5, 40, 141.5, 48]);
    expect(c.de).toEqual([124, 30, 175, 38]);
    expect(c).toMatchObject({ corre: 124 - 161, encima: 10 });
    expect(cruzan(c.de, c.a)).toBe(false);
    // Con el sofá lleno, los dos suben sobre sus cabezas y la frase sigue encima del «🤝», dentro de la sala.
    const alto = altoEntrega(c, SOFA)!;
    expect(alto).toBe(48 - 37 + 2);
    const arriba = subirEntrega(c, alto);
    expect(tapaA(arriba.de, SOFA) || tapaA(arriba.a, SOFA)).toBe(false);
    expect(arriba.de[1]).toBeGreaterThanOrEqual(0);
    expect(arriba).toMatchObject({ corre: c.corre, encima: 10 });
  });

  it("si junto al «🤝» cabe el código, se corre hacia adentro sin taparlo, solo lo que falta para decirla entera", () => {
    const de = { x: 182, y: 76 };
    const a = { x: 150, y: 76 };
    const d = { x: 106, w: 104 };
    const c = cajasEntrega(de, a, "ELM-537", "Ingeniero frontend", d, 2)!;
    expect(c.encima).toBe(0);
    // Hasta el borde (208) había 33 de arte; junto al «🤝» (que termina en 155,5), 50,5: el nombre se corta con «…».
    expect(c.de).toEqual([157.5, 40, 208, 48]);
    expect(c.corre).toBe(157.5 - 175);
    const corta = cajasEntrega(de, a, "ELM-537", "QA", d, 2)!;
    expect(corta.de[0]).toBeGreaterThan(157.5);
    expect(corta.de[2]).toBeCloseTo(208, 5);
    expect(corta.corre).toBeLessThan(0);
  });

  it("si en el descanso no cabe ni encima (el celular a 360, descanso de 40), `null`: no se juntan", () => {
    expect(cajasEntrega(DE, A, "BET-537", "Sonda QA168 recibe", { x: 122, w: 40 }, 2)).toBeNull();
  });
});

describe("el guion que no se dijo no cuenta (JST-172)", () => {
  const ag = (id: string): AgenteCharla => ({ id, prefijo: "JST", nombre: id, empresa: "JSTM", st: "libre", need: false, rol: null, rolApi: null, motivo: null, espera: null, run: null });
  const semilla = (n: number) => {
    let s = n;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  };
  const ctx = (): ContextoCharla => {
    const a = ag("Ana");
    const b = ag("Beto");
    return { prefijo: "JST", a, b, agentes: [a, b], temas: () => null, titulo: () => null, reloj: 0, ahora: 1_000, azar: semilla(12_345) };
  };

  it("`recuerdo` devuelve cómo olvidar lo que se armó después: se vuelve a armar lo mismo", () => {
    const g = new Guionista();
    g.armar(ctx());
    const olvidar = g.recuerdo();
    const uno = g.armar(ctx());
    olvidar();
    expect(g.armar(ctx())).toEqual(uno);
    // Sin olvidar, la memoria no deja repetir la misma variante.
    expect(g.armar(ctx())?.variante).not.toBe(uno?.variante);
  });
});
