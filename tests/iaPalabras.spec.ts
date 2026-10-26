// 0.8.1 (JST-251): la lista de palabras en español con la que la revisión bota lo que la IA de Chrome escribe con
// palabras que no existen («Espero que se solven.», de la QA JST-233). Es un filtro de Bloom armado por
// generador/palabras/armar_palabras.mjs: si el hash de aquí y el del generador no fueran el mismo, no estaría ni
// una de las palabras de extra.txt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EJEMPLO_RESPUESTA } from "../src/ia/prompt.js";
import { esPalabra, palabrasRaras } from "../src/ia/palabras.js";
import { BITS, FILTRO, HASHES, PALABRAS } from "../src/ia/palabrasFiltro.js";

const EXTRA = readFileSync(new URL("../generador/palabras/extra.txt", import.meta.url), "utf8")
  .split("\n")
  .map((l) => l.replace(/#.*/, ""))
  .flatMap((l) => l.split(/\s+/))
  .filter(Boolean);

describe("la lista de palabras", () => {
  it("es un filtro de unas 100.000 palabras, ~120 KB, con 7 hashes", () => {
    expect(PALABRAS).toBeGreaterThan(100_000);
    expect(HASHES).toBe(7);
    expect(atob(FILTRO).length * 8).toBe(BITS);
    expect(FILTRO.length).toBeLessThan(170_000);
  });

  it("tiene todas las de extra.txt (las de Chile, los diminutivos y las interjecciones): el hash es el del generador", () => {
    expect(EXTRA.length).toBeGreaterThan(50);
    for (const p of EXTRA) expect(esPalabra(p), p).toBe(true);
  });

  it("tiene las palabras de todos los días y las de los ejemplos del prompt", () => {
    for (const p of ["de", "que", "café", "sofá", "ventana", "estirarse", "respiro", "ojalá", "paciencia", "alivio", "solucionen", "resuelvan", "pega", "tranqui", "finde"]) {
      expect(esPalabra(p), p).toBe(true);
    }
    const ejemplos = JSON.parse(EJEMPLO_RESPUESTA) as { charlas: { frases: { texto: string }[] }[]; sueltas: { texto: string }[] };
    for (const t of [...ejemplos.charlas.flatMap((c) => c.frases.map((f) => f.texto)), ...ejemplos.sueltas.map((s) => s.texto)]) {
      expect(palabrasRaras(t), t).toEqual([]);
    }
  });

  it("no tiene lo que escribió mal la IA en la QA y en el spike, ni las faltas de los subtítulos", () => {
    for (const p of ["solven", "descanza", "macano", "cheekear", "apparently", "backlog", "run", "tambien", "aqui", "asi", "despues"]) {
      expect(esPalabra(p), p).toBe(false);
    }
  });

  it("sin importar mayúsculas ni cómo vienen las tildes", () => {
    expect(esPalabra("CAFÉ")).toBe(true);
    expect(esPalabra("café")).toBe(true);
    expect(esPalabra("Ojalá")).toBe(true);
  });

  it("una inventada pasa 1 vez de cada 100, más o menos (5.000 al azar)", () => {
    let x = 12345;
    const azar = () => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32;
    const letras = "abcdefghijklmnopqrstuvwxyzáéíóúñ";
    let pasan = 0;
    for (let i = 0; i < 5_000; i++) {
      const largo = 6 + Math.floor(azar() * 6);
      let p = "";
      for (let j = 0; j < largo; j++) p += letras[Math.floor(azar() * letras.length)];
      if (esPalabra(p)) pasan++;
    }
    expect(pasan / 5_000).toBeLessThan(0.02);
  });
});

describe("palabrasRaras", () => {
  it("las que no están, como venían y sin repetir", () => {
    expect(palabrasRaras("Sí, un poco lento. Espero que se solven.")).toEqual(["solven"]);
    expect(palabrasRaras("Ah, qué bueno. ¡Descanza! ¡descanza!")).toEqual(["Descanza"]);
    expect(palabrasRaras("¿Qué pasó con el run? ¿Y el backlog?")).toEqual(["run", "backlog"]);
    expect(palabrasRaras("¡Bacán! Harta pega, ¿cachai?")).toEqual([]);
    expect(palabrasRaras("")).toEqual([]);
  });
});
