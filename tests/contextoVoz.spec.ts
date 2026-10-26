// Cómo lee «Leer contexto» el texto de una tarea y su hilo (JST-275, QA JST-270), con textos reales de JSTM
// (leídos de la real el 26-10, solo con GET).
import { describe, expect, it } from "vitest";
import { enIngles, esComentarioAutomatico, sinEmojis, sinEntidades, textoParaVoz } from "../src/ui/contextoVoz.js";

describe("textoParaVoz: lo de las comillas invertidas (JST-275)", () => {
  it("JST-268: dice la carpeta y las palabras, y un comando largo es «un comando»", () => {
    const t =
      "1. Desde `_instalado`, en el tag que pasó la re-QA: `npm ci && npm run build` y `plugin upgrade jstm.oficina-pixel` con el login del usuario, sin las variables `PAPERCLIP_*`. Si `npx paperclipai@…` falla con `edgesOut`, usar el CLI que ya está bajado (ver JST-243).";
    expect(textoParaVoz(t)).toBe(
      "1. Desde instalado, en el tag que pasó la re-QA: un comando y un comando con el login del usuario, sin las variables PAPERCLIP. Si un comando falla con edges Out, usar el CLI que ya está bajado (ver JST-243).",
    );
  });

  it("JST-181: una carpeta se dice por su nombre (antes quedaba «Carpeta: , al lado de la vieja ().»)", () => {
    expect(textoParaVoz("- Carpeta: `Descargas/pestanas-guardadas-0.1.12`, al lado de la vieja (`pestanas-guardadas-0.1.0`).")).toBe(
      "- Carpeta: pestanas guardadas 0.1.12, al lado de la vieja (pestanas guardadas 0.1.0).",
    );
  });

  it("los estados de una tarea se dicen en español", () => {
    expect(textoParaVoz("JST-264 ya está `done`; JST-270 pasó a `in_review` y JST-271 sigue `blocked`.")).toBe(
      "JST-264 ya está terminada; JST-270 pasó a en revisión y JST-271 sigue bloqueada.",
    );
  });

  it("un commit o un id: se quita si la palabra de antes ya lo dice, si no es «un commit» o «un código»", () => {
    expect(textoParaVoz("Es el commit `198723e`, encima de `5904a5f`.")).toBe("Es el commit, encima de un commit.");
    expect(textoParaVoz("Lo pidió en el comentario `2dfe7a0f`; la tarjeta `aa146526` sigue.")).toBe("Lo pidió en el comentario; la tarjeta sigue.");
    expect(textoParaVoz("Con la clave `e5a2c7b3…29a4`.")).toBe("Con la clave un código.");
  });

  it("archivos, funciones y nombres de código", () => {
    expect(textoParaVoz("El arreglo está en `src/ui/botonContexto.tsx:72` y en `puedeCaminar()`.")).toBe(
      "El arreglo está en boton Contexto tsx y en puede Caminar.",
    );
    expect(textoParaVoz("Tag `oficina-pixel-v0.5.2` en `~/.paperclip-prueba-celular`.")).toBe("Tag oficina pixel 0.5.2 en paperclip prueba celular.");
    expect(textoParaVoz("Lo marca `blocker_attention` en `rows[0]`.")).toBe("Lo marca blocker attention en rows.");
  });

  it("comandos y código", () => {
    expect(textoParaVoz("Corre `python3.11 -I s/r242.py` y después `npm ci`.")).toBe("Corre un comando y después npm ci.");
    expect(textoParaVoz("Con `/opt/homebrew/bin/python3.11 -I qa/x.py` o `date +%F`.")).toBe("Con un comando o un comando.");
    expect(textoParaVoz("Pon `executionPolicy.stages = []` o llama `alargarSobre(id, ms)`.")).toBe("Pon un código o llama un código.");
    expect(textoParaVoz("Lo lee `GET /api/issues/:id/activity`.")).toBe("Lo lee un pedido a la API.");
  });

  it("una dirección entre comillas invertidas pasa por sinDirecciones (JST-259)", () => {
    expect(textoParaVoz("Abre `chrome://flags` y luego el enlace `http://192.0.2.15:3100/JST`.")).toBe("Abre chrome flags y luego el enlace.");
  });

  it("un bloque de código es «un bloque de código»", () => {
    expect(textoParaVoz("Pasos:\n```sh\nnpm ci\nnpm run build\n```\nDespués revisa.")).toBe("Pasos: un bloque de código. Después revisa.");
  });

  it("lo que no tiene letras se quita sin dejar comas ni paréntesis sueltos", () => {
    expect(textoParaVoz("Todos los `*` y el `--` de antes.")).toBe("Todos los y el de antes.");
  });

  it("markdown de siempre: negritas, enlaces y títulos", () => {
    expect(textoParaVoz("**✅ Listo:** detalle en [JST-234](/JST/issues/JST-234).\n\n## Qué se hizo")).toBe("Listo: detalle en JST-234. Qué se hizo");
  });
});

describe("sinEntidades: códigos HTML (JST-275)", () => {
  it("JST-269: «todo&#x20;» ya no se lee «todo y x20»", () => {
    expect(sinEntidades("a leer todo&#x20;")).toBe("a leer todo ");
    expect(textoParaVoz("tengo q meterme a la tarea a leer todo&#x20;")).toBe("tengo q meterme a la tarea a leer todo");
  });

  it("decimales, hexadecimales y con nombre; lo que no conoce lo deja", () => {
    expect(sinEntidades("Ana&#39;s &amp; Co &lt;b&gt; &quot;x&quot;&nbsp;y &#xE9; &copy;")).toBe("Ana's & Co <b> \"x\" y é &copy;");
  });

  it("un comando escrito con &amp;&amp; también es «un comando»", () => {
    expect(textoParaVoz("Corre `npm ci &amp;&amp; npm run build`.")).toBe("Corre un comando.");
  });
});

describe("esComentarioAutomatico y enIngles (JST-275)", () => {
  it("los avisos de Paperclip (JST-256, JST-270) no se leen", () => {
    expect(
      esComentarioAutomatico({
        authorType: "system",
        presentation: { kind: "system_notice" },
        body: "Paperclip needs a disposition before this issue can continue.",
      }),
    ).toBe(true);
    expect(esComentarioAutomatico({ authorType: "agent", presentation: { kind: "system_notice" }, body: "x" })).toBe(true);
    // Viene como del agente, con `internal_agent_write`: se ve por el texto.
    expect(
      esComentarioAutomatico({
        authorType: "agent",
        presentation: null,
        body: "Run completed. Agent did not post a summary comment this run (transcript withheld — see run log).",
      }),
    ).toBe(true);
  });

  it("lo que escribe un agente o el usuario sí se lee", () => {
    expect(esComentarioAutomatico({ authorType: "agent", presentation: null, body: "⏳ Avance: recibí tu «Sí, enviar al QA»." })).toBe(false);
    expect(esComentarioAutomatico({ authorType: "user", body: "pero queda clonada al ocupar esta" })).toBe(false);
  });

  it("enIngles: los textos en inglés de la real sí, los de los agentes en español no", () => {
    expect(enIngles("Paperclip automatically retried continuation for this assigned `in_progress` issue during terminal run recovery, but it still has no live execution path.")).toBe(true);
    expect(enIngles("I didn't change anything this time because JST-136 was already done when this wake came in.")).toBe(true);
    expect(enIngles("Paperclip needs a disposition before this issue can continue.")).toBe(true);
    expect(enIngles("⏳ Avance: el corte de internet de esta tarde (entre las 14:04 y las 17:31) frenó la prueba del botón «Leer contexto».")).toBe(false);
    expect(enIngles("El `run` de `in_review` vuelve con `issue.comment_added` y el `status` es `done` for real.")).toBe(false);
    expect(enIngles("pero queda clonada al ocupar esta no sale una sola vez en chrome")).toBe(false);
  });
});

describe("sinEmojis: la voz decía el nombre de cada emoji (JST-274, QA JST-270)", () => {
  it("las etiquetas de los comentarios se dicen con sus palabras", () => {
    expect(textoParaVoz("**⏳ Avance:** recibí tu «Sí, enviar al QA».")).toBe("Avance: recibí tu «Sí, enviar al QA».");
    expect(textoParaVoz("🙋 Te toca: revisar la implementación.")).toBe("Te toca: revisar la implementación.");
    expect(textoParaVoz("✅ Listo: la real tiene la 0.9.3.")).toBe("Listo: la real tiene la 0.9.3.");
    expect(textoParaVoz("⛔ Bloqueado: falta el acceso.")).toBe("Bloqueado: falta el acceso.");
    expect(textoParaVoz("apretar el botón «🔊 Leer contexto» (🔊) de la barra")).toBe("apretar el botón «Leer contexto» de la barra");
    expect(textoParaVoz("el ícono &#x1F50A; vuelve")).toBe("el ícono vuelve");
  });

  it("con lo que arma un emoji: variante, unión, tono de piel, bandera, tecla y etiquetas", () => {
    expect(sinEmojis("⚠️ ojo")).toBe("ojo");
    expect(sinEmojis("(👨‍💻 👍🏽 🇨🇱 🏴󠁧󠁢󠁳󠁣󠁴󠁿)")).toBe("()");
    expect(sinEmojis("1️⃣ uno").replace(/\s+/g, " ")).toBe("1 uno");
  });

  it("deja las letras, los números, los signos y lo que la voz no dice por su nombre", () => {
    const t = "¿Ñandú? «Sí», 20 °C, 50 %, #3, *, 0.9.3 → 0.9.5, ✓ listo, ✦ IA";
    expect(sinEmojis(t)).toBe(t);
  });
});
