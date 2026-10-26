// El filtro del worker para el Resumen (0.9.0, JST-246): la acción `voz-resumen`
// y sus reglas (`src/resumen/voz.ts`).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CupoResumen, fraseResumenValida, leerPedidoResumen, limpiarParaResumen, LETRAS_FRASE_RESUMEN, MAX_FRASES_RESUMEN, problemasFraseResumen, TOPE_RESUMEN_POR_MIN, vozParaResumen } from "../src/resumen/voz.js";
import { archivoVivo, type IndiceVoces } from "../src/voces.js";
import { PreparadorVoces, type TrabajoVoz } from "../src/vozViva.js";

function plugin(): string {
  const raiz = mkdtempSync(join(tmpdir(), "oficina-resumen-test-"));
  mkdirSync(join(raiz, "dist", "ui", "voces"), { recursive: true });
  const indice: IndiceVoces = { version: 1, generado: "", resumen: "catalina", agentes: { "a-cos": "lorenzo" }, audios: {} };
  writeFileSync(join(raiz, "dist", "ui", "voces", "indice.json"), JSON.stringify(indice));
  return raiz;
}

describe("las reglas de una frase del resumen", () => {
  it("lee letras, números y signos; no emojis, símbolos, enlaces, códigos ni estados en inglés; hasta 240 letras", () => {
    expect(problemasFraseResumen("Hola. Desde las 8:12, la última vez que lo escuchaste: 15 terminadas, 11 trabajando y 71 en cola.")).toEqual([]);
    expect(problemasFraseResumen("Los más grandes: «Sincronizar Jira: CORE y épicas», que corrió 8 veces.")).toEqual([]);
    expect(problemasFraseResumen("Te espera una cosa: ¿Instalo la 0.9.0 ahora?")).toEqual([]);
    expect(problemasFraseResumen("Eso es todo 🚀")).toContain("signos, emojis o símbolos");
    expect(problemasFraseResumen("Mira https://x.cl")).toContain("un enlace");
    expect(problemasFraseResumen("Revisar BET-421 hoy.")).toContain("un código de tarea");
    expect(problemasFraseResumen("Quedan 3 in_review.")).toContain("un estado en inglés");
    expect(problemasFraseResumen("Quedan 3 blocked.")).toContain("un estado en inglés");
    expect(problemasFraseResumen("x".repeat(LETRAS_FRASE_RESUMEN + 1))).toContain("larga");
    expect(problemasFraseResumen(" Hola.")).toContain("espacios de más");
    expect(problemasFraseResumen("123")).toContain("vacía");
    expect(problemasFraseResumen(42)).toEqual(["no es texto"]);
    expect(fraseResumenValida("Eso es todo.")).toBe(true);
  });

  it("un nombre que va dentro de una frase queda sin códigos, `_`, estados en inglés ni símbolos", () => {
    expect(limpiarParaResumen("BET-421 · fix_login 🚀 in_review")).toBe("fix login");
    expect(fraseResumenValida(limpiarParaResumen("Ingeniero/a <Plugins> & co. #12"))).toBe(true);
  });

  it("el pedido: solo con una voz rápida (Edge o Kokoro), un id de resumen y de 1 a 3 frases", () => {
    expect(vozParaResumen("lorenzo")).toBe("lorenzo");
    expect(vozParaResumen("alex")).toBe("alex");
    expect(vozParaResumen("qwen3-mujer")).toBeNull();
    expect(vozParaResumen("nadie")).toBeNull();
    expect(leerPedidoResumen({ voz: "lorenzo", resumen: "r1abc-x9", frases: ["Hola."] })).toEqual({ voz: "lorenzo", resumen: "r1abc-x9", frases: ["Hola."] });
    expect(leerPedidoResumen({ voz: "qwen3-hombre", resumen: "r1abc-x9", frases: ["Hola."] })).toBeNull();
    expect(leerPedidoResumen({ voz: "lorenzo", resumen: "R/../x", frases: ["Hola."] })).toBeNull();
    expect(leerPedidoResumen({ voz: "lorenzo", resumen: "r1abc-x9", frases: [] })).toBeNull();
    expect(leerPedidoResumen({ voz: "lorenzo", resumen: "r1abc-x9", frases: ["a", "b", "c", "d"] })).toBeNull();
    expect(leerPedidoResumen({ voz: "lorenzo", resumen: "r1abc-x9", frases: [3] })!.frases).toEqual([""]);
  });

  it("el cupo: como mucho 60 frases distintas por resumen y 45 nuevas por minuto entre todos; repetir una no cuenta", () => {
    let ahora = 1_000_000;
    const c = new CupoResumen(() => ahora);
    for (let i = 0; i < TOPE_RESUMEN_POR_MIN; i++) expect(c.tomar("r-uno", `Frase ${i}.`)).toBe(true);
    expect(c.tomar("r-dos", "Otra.")).toBe(false);
    expect(c.tomar("r-uno", "Frase 0.")).toBe(true);
    ahora += 60_000;
    for (let i = TOPE_RESUMEN_POR_MIN; i < MAX_FRASES_RESUMEN; i++) expect(c.tomar("r-uno", `Frase ${i}.`)).toBe(true);
    expect(c.tomar("r-uno", "Una más.")).toBe(false);
    expect(c.tomar("r-dos", "Otra.")).toBe(true);
  });
});

describe("la acción `voz-resumen` del worker", () => {
  const pedido = (frases: string[], voz = "lorenzo") => ({ voz, resumen: "r-test-1", frases });

  it("hace las frases con la voz pedida, delante y en orden, y responde cuando está la primera", async () => {
    const raiz = plugin();
    const hechos: TrabajoVoz[] = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, generar: async (t, d) => (hechos.push(t), writeFileSync(d, "mp3")) });
    const r = await v.esperarResumen(pedido(["Hola. Hoy: 6 terminadas.", "Te esperan 3 cosas.", "Eso es todo."]), 5_000);
    expect(r[0]).toBe("lista");
    expect(hechos[0]).toMatchObject({ texto: "Hola. Hoy: 6 terminadas.", delante: true, voz: { id: "lorenzo", motor: "edge" } });
    expect(hechos[0]!.archivo).toBe(archivoVivo("lorenzo", "Hola. Hoy: 6 terminadas."));
    // La segunda vez ya están todas.
    await new Promise((ok) => setTimeout(ok, 20));
    expect(await v.esperarResumen(pedido(["Hola. Hoy: 6 terminadas.", "Te esperan 3 cosas.", "Eso es todo."]), 0)).toEqual(["lista", "lista", "lista"]);
    expect(hechos.map((h) => h.texto)).toEqual(["Hola. Hoy: 6 terminadas.", "Te esperan 3 cosas.", "Eso es todo."]);
  });

  it("van delante de lo que espera en la fila (las frases que se preparan para la oficina)", () => {
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, clonesOk: () => true, generar: () => new Promise<void>(() => undefined) });
    v.prepararOficina([{ clase: "charla", agenteId: "a-cos", texto: "Bacán." }, { clase: "charla", agenteId: "a-cos", texto: "Tuvo lo suyo, pero salió." }]);
    void v.esperarResumen(pedido(["Uno.", "Dos."]), 0);
    const fila = (v as unknown as { filas: Record<string, TrabajoVoz[]> }).filas.edge.map((t) => t.texto);
    // «Bacán.» ya empezó (la fila la sacó al correr); lo del resumen va antes que el resto.
    expect(fila).toEqual(["Uno.", "Dos.", "Tuvo lo suyo, pero salió."]);
  });

  it("rechaza lo que no pasa las reglas (esa frase queda en «no») y un pedido con otra voz", async () => {
    const hechos: string[] = [];
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, clonesOk: () => true, generar: async (t, d) => (hechos.push(t.texto), writeFileSync(d, "mp3")) });
    expect(await v.esperarResumen(pedido(["Revisar BET-421 🚀", "Eso es todo."]), 5_000)).toEqual(["no", "fila"]);
    expect(await v.esperarResumen(pedido(["Hola."], "qwen3-mujer"), 5_000)).toEqual(["no"]);
    expect(await v.esperarResumen({ frases: ["Hola."] }, 5_000)).toEqual(["no"]);
    await new Promise((ok) => setTimeout(ok, 20));
    expect(hechos).toEqual(["Eso es todo."]);
  });

  it("sin uv o ffmpeg no hace nada", async () => {
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => "falta uv", generar: async () => undefined });
    expect(await v.esperarResumen(pedido(["Hola."]), 5_000)).toEqual(["no"]);
  });
});
