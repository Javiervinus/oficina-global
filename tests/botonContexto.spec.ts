// Lo que dice «Leer contexto» (JST-278): una descripción o un comentario corto también se lee
// («¿Lo publico hoy?», «Sí, dale.»), si después de limpiarlo queda algo que decir.
import { describe, expect, it, vi } from "vitest";
import { componerTexto } from "../src/ui/botonContexto.js";

vi.mock("@paperclipai/plugin-sdk/ui", () => ({ useHostContext: () => ({}) }));
vi.mock("../src/ui/piso.js", () => ({ cx: () => "", Icono: () => null }));
vi.mock("../src/ui/sonido.js", () => ({ vocesDisponibles: () => [] }));

let n = 0;
const tarea = (description: string | null) => ({
  id: "t288",
  identifier: "JST-288",
  title: "Prueba QA270 hija con descripción corta",
  description,
  status: "in_review",
  ancestors: [{ id: "t181", identifier: "JST-181", title: "Pestañas guardadas: respaldo de la lista (¿Google Drive?)" }],
});
const comentario = (body: string, createdAt = "2026-10-25T10:00:00.000Z") => ({ id: `c${++n}`, body, createdAt, authorType: "user" });

describe("lo corto también se lee", () => {
  it("la descripción corta de la QA (JST-288): es la pregunta", () => {
    expect(componerTexto(tarea("¿Lo publico hoy?"), [], [])).toBe(
      "Tarea JST-288: Prueba QA270 hija con descripción corta. Es parte de JST-181: Pestañas guardadas: respaldo de la lista (¿Google Drive?). La tarea dice: ¿Lo publico hoy?",
    );
  });

  it("un comentario corto: lo último que pasó", () => {
    const texto = componerTexto(tarea("¿Lo publico hoy?"), [comentario("Sí, dale.")], []);
    expect(texto).toMatch(/ Lo último en el hilo: Sí, dale\.$/);
  });

  it("sin punto final se le pone, para que la voz pare antes del siguiente", () => {
    const texto = componerTexto(tarea(null), [comentario("Sí, dale", "2026-10-25T11:00:00.000Z"), comentario("¿Lo publico hoy?")], []);
    expect(texto).toMatch(/ Lo último en el hilo: Sí, dale\. ¿Lo publico hoy\?$/);
    expect(componerTexto(tarea("publicar hoy"), [], [])).toMatch(/ La tarea dice: publicar hoy\.$/);
  });

  it("lo que queda sin nada que decir no se lee ni ocupa un lugar", () => {
    const viejos = [comentario("Primero."), comentario("Segundo."), comentario("Tercero.")];
    const texto = componerTexto(tarea(null), [comentario("👍"), comentario("---"), ...viejos], []);
    expect(texto).toMatch(/ Lo último en el hilo: Primero\. Segundo\. Tercero\.$/);
    expect(componerTexto(tarea("![](captura.png)"), [comentario("🙌")], [])).not.toMatch(/La tarea dice|Lo último/);
  });

  it("una respuesta corta a un «🙋 Te toca» se lee después de la pregunta", () => {
    const pregunta = { ...comentario("🙋 Te toca: ¿lo publico hoy?", "2026-10-25T09:00:00.000Z"), authorType: "agent" };
    const texto = componerTexto(tarea(null), [comentario("Sí, dale.", "2026-10-25T10:00:00.000Z"), pregunta], []);
    expect(texto).toMatch(/ Lo último en el hilo: Sí, dale\. Te toca: ¿lo publico hoy\?$/);
  });
});
