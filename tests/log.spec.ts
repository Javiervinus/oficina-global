import { describe, expect, it } from "vitest";
import { diaYHora, duracion, horaLinea, LINEAS_LOG, lineasDelLog, textoCopia } from "../src/log.js";

const trozo = (chunk: string, stream = "stdout", ts = "2026-10-21T14:37:58.000Z") => JSON.stringify({ ts, stream, chunk, seq: 1 });
const ndjson = (...lineas: string[]) => `${lineas.join("\n")}\n`;
const acpx = (o: Record<string, unknown>) => `${JSON.stringify(o)}\n`;

describe("final del log (design-spec de JST-95 §4, JST-94)", () => {
  it("si el tramo empieza a mitad del log, la primera línea llega cortada y se descarta", () => {
    const contenido = ndjson('k":"cortado"}', trozo("$ npm test\n"));
    expect(lineasDelLog(contenido, true).map((l) => l.texto)).toEqual(["$ npm test"]);
    expect(lineasDelLog(ndjson(trozo("uno\n"), trozo("dos\n")), false).map((l) => l.texto)).toEqual(["uno", "dos"]);
  });

  it("un trozo con varias líneas da varias líneas, con su hora; las vacías no cuentan", () => {
    const l = lineasDelLog(ndjson(trozo("a\n\nb\n  \nc")), false);
    expect(l.map((x) => x.texto)).toEqual(["a", "b", "c"]);
    expect(l.every((x) => x.ts === "2026-10-21T14:37:58.000Z")).toBe(true);
  });

  it("stderr va marcado (en rojo)", () => {
    const l = lineasDelLog(ndjson(trozo("ok\n"), trozo("FAIL src/x.spec.ts\n", "stderr")), false);
    expect(l.map((x) => x.error)).toEqual([false, true]);
  });

  it("en los agentes de Claude se muestra el `text` de cada evento; los `text_delta` seguidos se juntan y los `usage_update` se saltan", () => {
    const contenido = ndjson(
      trozo(acpx({ type: "acpx.status", text: "usage updated: 47325/200000", tag: "usage_update" })),
      trozo(acpx({ type: "acpx.text_delta", text: "Est", channel: "output" })),
      trozo(acpx({ type: "acpx.text_delta", text: "oy revisando c" })),
      trozo(acpx({ type: "acpx.text_delta", text: "ómo armé ent" })),
      trozo(acpx({ type: "acpx.text_delta", text: "radas.\nSigo." })),
      trozo(acpx({ type: "acpx.tool_call", name: "Terminal", text: "Terminal (pending)", tag: "tool_call" })),
    );
    expect(lineasDelLog(contenido, false).map((l) => l.texto)).toEqual(["Estoy revisando cómo armé entradas.", "Sigo.", "Terminal (pending)"]);
  });

  it("solo las últimas 20", () => {
    const contenido = ndjson(...Array.from({ length: 30 }, (_, i) => trozo(`línea ${i + 1}\n`)));
    const l = lineasDelLog(contenido, false);
    expect(l).toHaveLength(LINEAS_LOG);
    expect(l[0]!.texto).toBe("línea 11");
    expect(l.at(-1)!.texto).toBe("línea 30");
  });

  it("líneas que no son JSON o sin `chunk` se ignoran", () => {
    expect(lineasDelLog(ndjson("basura", JSON.stringify({ ts: "x" }), trozo("bien\n")), false).map((l) => l.texto)).toEqual(["bien"]);
  });
});

describe("cuándo y cuánto duró (§4)", () => {
  const ahora = new Date(2026, 9, 21, 14, 42, 0).getTime();
  it("hoy, ayer o la fecha corta, con la hora en HH:MM:SS", () => {
    expect(diaYHora(new Date(2026, 9, 21, 14, 38, 21).toISOString(), ahora)).toBe("hoy 14:38:21");
    expect(diaYHora(new Date(2026, 9, 20, 23, 10, 4).toISOString(), ahora)).toBe("ayer 23:10:04");
    expect(diaYHora(new Date(2026, 9, 18, 9, 12, 40).toISOString(), ahora)).toBe("18 oct 09:12:40");
    expect(diaYHora(null, ahora)).toBe("");
  });

  it("duró: segundos, minutos u horas", () => {
    expect(duracion("2026-10-21T14:37:29Z", "2026-10-21T14:38:21Z")).toBe("52 s");
    expect(duracion("2026-10-21T14:30:00Z", "2026-10-21T14:34:10Z")).toBe("4 min");
    expect(duracion("2026-10-21T13:00:00Z", "2026-10-21T14:12:00Z")).toBe("1 h 12 min");
    expect(duracion(null, "2026-10-21T14:38:21Z")).toBe("");
  });
});

describe("«Copiar» (§4)", () => {
  it("empresa, agente y run; código, salida y hora; el motivo; y las líneas con su hora, stderr con [err]", () => {
    const lineas = [
      { ts: new Date(2026, 9, 21, 14, 37, 58).toISOString(), error: false, texto: "$ npm test" },
      { ts: new Date(2026, 9, 21, 14, 38, 20).toISOString(), error: true, texto: "FAIL src/…" },
    ];
    const texto = textoCopia({
      empresa: "Betalandia",
      agente: "Ingeniero de Integracion y CI",
      runId: "4f2a91c3-1111-2222-3333-444455556666",
      errorCode: "adapter_failed",
      exitCode: 1,
      signal: null,
      cuando: "hoy 14:38:21",
      motivo: "El run terminó con error.",
      lineas,
    });
    expect(texto).toBe(
      [
        "Betalandia · Ingeniero de Integracion y CI · run 4f2a91c3",
        "adapter_failed (exit 1) · hoy 14:38:21",
        "El run terminó con error.",
        "",
        `${horaLinea(lineas[0]!.ts)} $ npm test`,
        `${horaLinea(lineas[1]!.ts)} [err] FAIL src/…`,
      ].join("\n"),
    );
    expect(horaLinea(lineas[0]!.ts)).toBe("14:37:58");
    expect(textoCopia({ empresa: "E", agente: "A", runId: "r", errorCode: null, exitCode: null, signal: "SIGTERM", cuando: "ayer 10:00:00", motivo: null, lineas: [] }).split("\n").slice(0, 2)).toEqual([
      "E · A · run r",
      "error (SIGTERM) · ayer 10:00:00",
    ]);
  });
});
