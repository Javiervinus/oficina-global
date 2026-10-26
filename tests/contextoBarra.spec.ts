import { describe, expect, it } from "vitest";
import { alBordeDeLaBarra, MARGEN_BARRA, type NodoBarra } from "../src/ui/contextoBarra.js";

// La barra de arriba de Paperclip 2026.824.1 en el celular: la barra (`px-4`) > el grupo de los plugins (`pl-2`) >
// los slots > un elemento por plugin, ordenados por nombre («Avisos», «Cambios en git», «Oficina global»).
interface Nodo extends NodoBarra {
  nextElementSibling: Nodo | null;
  parentElement: Nodo | null;
  margen: number;
  ancho: number;
  derecha: number;
}

function nodo(margen = 0, ancho = 10, derecha = 0): Nodo {
  return {
    nextElementSibling: null,
    parentElement: null,
    margen,
    ancho,
    derecha,
    getBoundingClientRect() {
      return { width: this.ancho, right: this.derecha };
    },
  };
}

function hijos(padre: Nodo, ...h: Nodo[]): Nodo {
  h.forEach((x, i) => {
    x.parentElement = padre;
    x.nextElementSibling = h[i + 1] ?? null;
  });
  return padre;
}

/** La barra a 390 px y el botón de la Oficina; `despues` son los elementos que quedan después de él en los slots. */
function barra({ margen = MARGEN_BARRA, derecha = 390, despues = [] as Nodo[], grupoDespues = [] as Nodo[] } = {}) {
  const fila = nodo(margen, 390, derecha);
  const grupo = nodo(0, 200);
  const slots = nodo(0, 180);
  const oficina = nodo(0, 24);
  hijos(fila, nodo(0, 36), nodo(0, 150), grupo);
  hijos(grupo, slots, ...grupoDespues);
  hijos(slots, nodo(0, 59), nodo(0, 70), oficina, ...despues);
  return oficina;
}

const margenDe = (n: NodoBarra) => (n as Nodo).margen;

describe("el 🔊 al borde de la pantalla en el celular (JST-290, design-spec de JST-294 §2)", () => {
  it("va al borde si es lo último de la barra y la barra llega al borde con 16 px de margen", () => {
    expect(alBordeDeLaBarra(barra(), margenDe, 390)).toBe(true);
  });

  it("no, si otro plugin queda después (en los slots o en los lanzadores del grupo)", () => {
    expect(alBordeDeLaBarra(barra({ despues: [nodo(0, 44)] }), margenDe, 390)).toBe(false);
    expect(alBordeDeLaBarra(barra({ grupoDespues: [nodo(0, 70)] }), margenDe, 390)).toBe(false);
  });

  it("un elemento después que no ocupa nada (escondido o vacío) no cuenta", () => {
    expect(alBordeDeLaBarra(barra({ despues: [nodo(0, 0)], grupoDespues: [nodo(0, 0)] }), margenDe, 390)).toBe(true);
  });

  it("no, si la barra cambia de margen o no llega al borde de la pantalla", () => {
    expect(alBordeDeLaBarra(barra({ margen: 24 }), margenDe, 390)).toBe(false);
    expect(alBordeDeLaBarra(barra({ margen: 8 }), margenDe, 390)).toBe(false);
    expect(alBordeDeLaBarra(barra({ derecha: 340 }), margenDe, 390)).toBe(false);
  });

  it("no, si no encuentra la barra (sin contenedor con margen)", () => {
    const solo = nodo(0, 24);
    expect(alBordeDeLaBarra(solo, margenDe, 390)).toBe(false);
    let x = solo;
    for (let i = 0; i < 8; i++) {
      const p = nodo(0, 100);
      hijos(p, x);
      x = p;
    }
    expect(alBordeDeLaBarra(solo, margenDe, 390)).toBe(false);
  });
});
