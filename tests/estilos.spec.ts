import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(import.meta.dirname, "../src/ui");
const HOJAS = readdirSync(DIR).filter((f) => /^estilos.*\.ts$/.test(f));

describe("el atajo font de las hojas", () => {
  it("inherit, initial o unset van solos: con medidas, el navegador descarta la declaración entera (JST-196)", () => {
    const malos: string[] = [];
    for (const f of HOJAS) {
      for (const m of readFileSync(join(DIR, f), "utf8").matchAll(/(?<![\w-])font:\s*([^;}]+)/g)) {
        const v = m[1].trim();
        if (/\b(inherit|initial|unset|revert|revert-layer)\b/.test(v) && !/^(inherit|initial|unset|revert|revert-layer)$/.test(v)) malos.push(`${f}: font: ${v}`);
      }
    }
    expect(HOJAS.length).toBeGreaterThan(4);
    expect(malos).toEqual([]);
  });
});
