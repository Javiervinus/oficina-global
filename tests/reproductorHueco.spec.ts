import { describe, expect, it } from "vitest";
import { CSS_RESUMEN } from "../src/ui/estilosResumen.js";
import { huecoAbajo } from "../src/ui/reproductorResumen.js";

// JST-298: con el Resumen sonando, en la página de una tarea de Paperclip 2026.824.1 el reproductor tapaba el cuadro de
// comentario. En el celular (375 × 812) el reproductor va a 72 px del borde de abajo y la página (`main`, con
// `padding-bottom: 5rem`) ya deja 80 px; en el computador, a 14 px, y la página deja 24 (`md:p-6`).
describe("huecoAbajo (JST-298)", () => {
  it("en el celular, lo último de la página queda 8 px arriba del reproductor de 1 línea (79 px)", () => {
    const arriba = 812 - 72 - 79;
    const hueco = huecoAbajo(812, arriba, 80);
    expect(hueco).toBe(79);
    // Al final de la página, lo último termina a 80 + hueco del borde de abajo: 8 px arriba del reproductor.
    expect(812 - 80 - hueco).toBe(arriba - 8);
  });

  it("crece con el reproductor: con la cabecera en 3 líneas (117 px), 38 px más", () => {
    expect(huecoAbajo(812, 812 - 72 - 117, 80) - huecoAbajo(812, 812 - 72 - 79, 80)).toBe(38);
  });

  it("en el computador, con el reproductor de 64 px a 14 px del borde", () => {
    const arriba = 900 - 14 - 64;
    const hueco = huecoAbajo(900, arriba, 24);
    expect(hueco).toBe(62);
    expect(900 - 24 - hueco).toBe(arriba - 8);
  });

  it("redondea para arriba y nunca es negativo (la página ya deja espacio de sobra)", () => {
    expect(huecoAbajo(812, 660.4, 80)).toBe(80);
    expect(huecoAbajo(812, 760, 200)).toBe(0);
  });

  it("el hueco va en el `main` de Paperclip solo mientras el reproductor lo pide", () => {
    expect(CSS_RESUMEN).toContain('html[data-of-rs-hueco] #main-content::after { content: ""; display: block; height: var(--of-rs-hueco, 0px); }');
  });
});
