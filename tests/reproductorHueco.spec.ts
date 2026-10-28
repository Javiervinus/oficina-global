import { readFileSync } from "node:fs";
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

// JST-314 (C · Dos filas de JST-305): con el reproductor de menos de 600 px, dos filas; el arco del loader no se rellena.
describe("reproductor angosto (JST-314)", () => {
  it("se mide el reproductor (no la ventana), solo en el computador, y la caja pasa a una grilla de dos filas", () => {
    expect(CSS_RESUMEN).toContain(".of-rs-a:not(.is-m) .of-rsa-dock { container: rsa / inline-size; }");
    const bloque = CSS_RESUMEN.split("@container rsa (width < 600px) {")[1]!.split("\n}")[0]!;
    expect(bloque).toContain('grid-template-areas: "c c c c c c c" "pl pv nx . vl tx x"');
    expect(bloque).toContain("grid-template-columns: 42px 32px 32px minmax(0, 1fr) auto auto 32px");
    expect(bloque).toContain("row-gap: 8px");
    for (const a of ["c", "pl", "pv", "nx", "vl", "tx", "x"]) expect(bloque).toContain(`grid-area: ${a}`);
  });

  it("los 4 botones que faltaban tienen su clase y el orden del DOM no cambia", () => {
    const fuente = readFileSync(new URL("../src/ui/reproductorResumen.tsx", import.meta.url), "utf8");
    const orden = ["of-rsa-play", "of-rsa-prev", "of-rsa-next", "of-rsa-c", "of-rsa-vel", "of-rsa-txt", "of-rsa-x"].map((c) => fuente.indexOf(c, fuente.indexOf("export function ReproductorResumen")));
    expect(orden.every((i) => i > 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it("el arco del loader del ▶ no se rellena (of-rs-fill también rellenaba el arco)", () => {
    expect(CSS_RESUMEN).toContain(".of-rs-fill svg.of-i.of-rs-spin { fill: none; }");
  });

  it("el piso de la Oficina baja 128 px más, o lo que mida el reproductor si es más", () => {
    expect(CSS_RESUMEN).toContain(".of.of-rs-on .of-scroll { padding-bottom: calc(16px + max(128px, var(--of-rs-piso, 0px))); }");
  });
});
