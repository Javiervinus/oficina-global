// 0.7.0 (JST-232; punto 10 del spike de JST-230): la frase con el dato es la de hoy, exacta, y el final sale de la
// reserva de la IA de Chrome. Sin final para esa clave, sin la IA o si no cabe, va la conversación de siempre.
import { describe, expect, it } from "vitest";
import { claveDeFinal, fijasDe, Guionista, MAX_FRASES_IA, unirFinal, type AgenteCharla, type ContextoCharla, type FuenteIa, type Guion, type Linea } from "../src/charlas.js";
import type { Temas } from "../src/temas.js";

const RELOJ = Date.parse("2026-10-24T03:00:00.000Z");

function semilla(n = 7): () => number {
  let s = (n * 48271) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const ag = (id: string, o: Partial<AgenteCharla> = {}): AgenteCharla => ({ id, prefijo: "JST", nombre: id, empresa: "JSTM", st: "libre", need: false, rol: null, rolApi: null, motivo: null, espera: null, run: null, ...o });

function ctx(o: { otros?: AgenteCharla[]; temas?: Record<string, Temas>; azar?: () => number; ahora?: number } = {}): ContextoCharla {
  const a = ag("Ana");
  const b = ag("Beto");
  return { prefijo: "JST", a, b, agentes: [a, b, ...(o.otros ?? [])], temas: (id) => o.temas?.[id] ?? null, titulo: () => null, reloj: RELOJ, ahora: o.ahora ?? 0, azar: o.azar ?? semilla() };
}

/** Alguien de la sala con un error («sin cupo»): sale «A CEO le falló el run. / ¿Qué le pasó? / Se quedó sin cupo, parece.». */
const conError = (nombre = "CEO", motivo = "Claude usage limit reached") => ag(nombre, { st: "error", motivo });
const lineas = (...t: string[]): Linea[] => t.map((texto, i) => ({ quien: i % 2 ? "Beto" : "Ana", texto, codigo: null, titulo: null }));
const textos = (g: Guion | null) => g?.lineas.map((l) => l.texto) ?? [];

function fuente(finales: Record<string, string[]>, sueltas: string[] = []) {
  const pedidos: Array<{ clave: string; evitar: string | null }> = [];
  const f: FuenteIa = {
    final: (clave, _azar, evitar) => {
      pedidos.push({ clave, evitar });
      return finales[clave] ?? null;
    },
    suelta: (_azar, recientes) => sueltas.find((s) => !recientes.includes(s)) ?? null,
  };
  return { f, pedidos };
}

const CLAVE_ERROR = "error-1|P3()/¿Qué le pasó?/Se quedó sin cupo, parece.";

describe("qué frases de hoy quedan fijas (v4 del spike)", () => {
  it("hasta la última que trae un dato: el motivo del error es un dato", () => {
    expect(fijasDe(lineas("A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf. Ojalá lo vean luego."))).toBe(3);
    expect(fijasDe(lineas("¿Cuántos están trabajando?", "5. Un día normal."))).toBe(2);
  });

  it("si la última con dato es una pregunta, también su respuesta («¿Por esta?» no lo contesta la IA)", () => {
    const l = lineas("Catalina está esperando una respuesta.", "¿Por esta?", "Esa. Ojalá le contesten luego.");
    l[1]!.codigo = "JST-91";
    expect(fijasDe(l)).toBe(3);
  });

  it("una broma no trae datos (0) y lo que ya tiene 4 fijas no lleva final", () => {
    expect(fijasDe(lineas("¿Deploy el viernes?", "Ni en broma."))).toBe(0);
    const cola = lineas("¿Tienes mucho en cola?", "Tres, por lo menos.", "¡Uf! ¿Por cuál partes?", "Por esta.");
    cola[3]!.codigo = "JST-9";
    expect(fijasDe(cola)).toBe(MAX_FRASES_IA);
  });
});

describe("la clave de la reserva: la variante y lo que dicen sus frases fijas, sin nombres ni números", () => {
  it("le sirve a cualquiera con el mismo motivo", () => {
    expect(claveDeFinal("error-1", lineas("A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece."))).toBe(CLAVE_ERROR);
    expect(claveDeFinal("error-1", lineas("A Ingeniero de Betalandia le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece."))).toBe(CLAVE_ERROR);
    // Otro motivo, otra clave (la reacción puede ser otra).
    expect(claveDeFinal("error-1", lineas("A CEO le falló el run.", "¿Qué le pasó?", "Le fallaron las pruebas."))).not.toBe(CLAVE_ERROR);
  });

  it("los números van por tramos (nadie, uno o dos, unos pocos, muchos)", () => {
    const c = (n: number) => claveDeFinal("te-espera-3", lineas(`Hay ${n} esperando respuesta.`));
    expect(c(3)).toBe(c(5));
    expect(c(3)).not.toBe(c(12));
  });

  it("una frase que no es del plugin no tiene clave (no lleva final de la IA)", () => {
    expect(claveDeFinal("error-1", lineas("Esto no lo dijo la Oficina."))).toBeNull();
  });
});

describe("el Guionista con la reserva de la IA", () => {
  it("las fijas quedan tal cual y el final es el de la IA, dicho por quien no habló al último", () => {
    const g = new Guionista();
    const { f } = fuente({ [CLAVE_ERROR]: ["Uf, qué mal momento."] });
    g.fijarIa(f);
    const r = g.armar(ctx({ otros: [conError()] }), "error")!;
    expect(r.variante).toBe("error-1");
    expect(textos(r)).toEqual(["A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf, qué mal momento."]);
    expect(r.lineas[3]!.quien).not.toBe(r.lineas[2]!.quien);
    expect(r.lineas[3]).toMatchObject({ codigo: null, titulo: null });
    expect(r.ia).toEqual({ clave: CLAVE_ERROR, fijas: 3, frases: ["Uf, qué mal momento."] });
  });

  it("vuelta a las plantillas: sin la IA, sin final para esa clave o si no cabe, la de siempre", () => {
    const deHoy = ["A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf. Ojalá lo vean luego."];
    expect(textos(new Guionista().armar(ctx({ otros: [conError()] }), "error"))).toEqual(deHoy);
    const sinFinal = new Guionista();
    sinFinal.fijarIa(fuente({}).f);
    const r = sinFinal.armar(ctx({ otros: [conError()] }), "error")!;
    expect(textos(r)).toEqual(deHoy);
    expect(r.ia).toBeUndefined();
    // 3 fijas + 2 frases son 5: no cabe, va la de siempre.
    const largo = new Guionista();
    largo.fijarIa(fuente({ [CLAVE_ERROR]: ["Uf.", "Mal día."] }).f);
    expect(textos(largo.armar(ctx({ otros: [conError()] }), "error"))).toEqual(deHoy);
  });

  it("no repite el último final de esa clave (le pide otro a la reserva)", () => {
    const g = new Guionista();
    const { f, pedidos } = fuente({ [CLAVE_ERROR]: ["Uf, qué mal momento."] });
    g.fijarIa(f);
    g.armar(ctx({ otros: [conError()] }), "error");
    // Una variante espera 8 conversaciones del piso: 8 bromas en medio.
    for (let i = 0; i < 8; i++) g.armar(ctx({ ahora: i }), "broma");
    expect(g.armar(ctx({ otros: [conError()], ahora: 3_600_000 }), "error")?.variante).toBe("error-1");
    expect(pedidos.map((p) => p.evitar)).toEqual([null, "Uf, qué mal momento."]);
  });

  it("las bromas quedan como hoy: no se le pide nada a la IA", () => {
    const g = new Guionista();
    const { f, pedidos } = fuente({});
    g.fijarIa(f);
    const r = g.armar(ctx(), "broma")!;
    expect(r.tema).toBe("broma");
    expect(r.ia).toBeUndefined();
    expect(pedidos).toEqual([]);
  });

  it("rearmar (la conversación con voz): el mismo final; sin la IA o si cambió lo fijo, se descarta", () => {
    const g = new Guionista();
    g.fijarIa(fuente({ [CLAVE_ERROR]: ["Uf, qué mal momento."] }).f);
    const r = g.armar(ctx({ otros: [conError()] }), "error")!;
    expect(textos(g.rearmar(ctx({ otros: [conError()] }), r))).toEqual(textos(r));
    expect(g.rearmar(ctx({ otros: [conError()] }), r)!.ia).toEqual(r.ia);
    // Cambió el motivo: lo fijo es otro, y el final era para el de antes.
    expect(g.rearmar(ctx({ otros: [conError("CEO", "tests failed")] }), r)).toBeNull();
    // Se eligieron las frases de siempre (o la IA quedó en pausa): la que sigue ya es de siempre.
    g.fijarIa(null);
    expect(g.rearmar(ctx({ otros: [conError()] }), r)).toBeNull();
  });

  it("las sueltas: la mitad de las que no traen dato sale de la reserva, sin repetir las 5 últimas", () => {
    const g = new Guionista();
    g.fijarIa(fuente({}, ["Este café me salva.", "Un respiro y sigo."]).f);
    const z = semilla(11);
    const dichas = Array.from({ length: 40 }, () => g.suelta("Ana", null, z).texto);
    const deIa = dichas.filter((t) => t === "Este café me salva." || t === "Un respiro y sigo.");
    expect(deIa.length).toBeGreaterThan(0);
    expect(deIa.length).toBeLessThan(40);
    // Sin la IA, nunca.
    const hoy = new Guionista();
    expect(Array.from({ length: 40 }, () => hoy.suelta("Ana", null, semilla(3)).texto)).not.toContain("Este café me salva.");
  });

  it("las sueltas con dato (la tarea) siguen siendo las de hoy", () => {
    const g = new Guionista();
    g.fijarIa(fuente({}, ["Este café me salva."]).f);
    const temas: Temas = { hecho: "JST-91", tituloHecho: "Re-QA", sigue: null, enCola: 0 };
    const r = g.suelta("Ana", temas, () => 0);
    expect(r).toMatchObject({ texto: "Esta ya está. Me gané el café.", codigo: "JST-91" });
  });
});

describe("lo que se le puede pedir a la IA ahora (muestras)", () => {
  it("una por variante con datos que se puede decir: sus frases fijas y su clave; ni bromas ni las que ya tienen 4 fijas", () => {
    const m = new Guionista().muestras(ctx({ otros: [conError()] }));
    const error = m.find((x) => x.variante === "error-1")!;
    expect(error.clave).toBe(CLAVE_ERROR);
    expect(error.fijas.map((l) => l.texto)).toEqual(["A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece."]);
    expect(m.some((x) => x.variante.startsWith("broma"))).toBe(false);
    expect(m.every((x) => x.fijas.length >= 1 && x.fijas.length < MAX_FRASES_IA)).toBe(true);
  });

  it("no recuerda nada: después se puede armar igual cualquier variante", () => {
    const g = new Guionista();
    g.muestras(ctx({ otros: [conError()] }));
    expect(g.armar(ctx({ otros: [conError()] }), "error")?.variante).toBe("error-1");
  });
});

describe("unir el final", () => {
  it("se turnan desde la última fija", () => {
    const u = unirFinal(lineas("Uno.", "Dos."), ["Tres.", "Cuatro."], "Ana", "Beto");
    expect(u.map((l) => l.quien)).toEqual(["Ana", "Beto", "Ana", "Beto"]);
  });
});
