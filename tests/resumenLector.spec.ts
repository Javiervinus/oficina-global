// El lector del Resumen (0.9.0, JST-246; design-spec de JST-245 §4 y §8) con
// una voz de mentira y relojes de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FraseResumen, Seccion } from "../src/resumen/frases.js";
import { ESPERA_IA_MS, Lector, PAUSA_FRASES_MS, PAUSA_PARTES_MS, PREPARAR_ANTES_MS, SILENCIO_MAX_MS, VOLVER_MS, type Habla, type VozLector } from "../src/resumen/lector.js";

class VozFalsa implements VozLector {
  dichas: string[] = [];
  velocidades: number[] = [];
  siguen: string[][] = [];
  cortadas = 0;
  /** Lo que dura cada frase al sonar (ms, ya con la velocidad). */
  msFrase = 1_000;
  /** `false`: el audio no empieza hasta `empieza()` (lo espera, como el de Lorenzo mientras se hace). */
  alTiro = true;
  private porEmpezar: Array<() => void> = [];
  private abiertas: Array<() => void> = [];
  decir(f: FraseResumen, velocidad: number, alEmpezar: (ms: number | null) => void, siguen: readonly FraseResumen[]): Habla {
    this.dichas.push(f.texto);
    this.velocidades.push(velocidad);
    this.siguen.push(siguen.map((x) => x.texto));
    const ms = this.msFrase;
    if (this.alTiro) alEmpezar(ms);
    else this.porEmpezar.push(() => alEmpezar(ms));
    let ok!: () => void;
    const fin = new Promise<void>((r) => (ok = r));
    this.abiertas.push(ok);
    // Una frase cortada ya no termina: sale de las que suenan.
    const cortar = () => {
      this.cortadas += 1;
      this.abiertas = this.abiertas.filter((x) => x !== ok);
    };
    return { fin, cortar };
  }
  /** Empieza a sonar la frase que esperaba su audio. */
  empieza(): void {
    this.porEmpezar.shift()?.();
  }
  /** Termina la frase que suena. */
  async termina(): Promise<void> {
    this.abiertas.shift()?.();
    await vi.advanceTimersByTimeAsync(0);
  }
}

const fr = (sec: Seccion, ...textos: string[]): FraseResumen[] => textos.map((texto) => ({ sec, texto }));

let voz: VozFalsa;
let cambios = 0;
const nuevo = () =>
  new Lector({
    voz,
    ahora: Date.now,
    programar: (fn, ms) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    },
    alCambiar: () => (cambios += 1),
  });

beforeEach(() => {
  vi.useFakeTimers();
  voz = new VozFalsa();
  cambios = 0;
});
afterEach(() => vi.useRealTimers());

describe("el lector", () => {
  it("arma, lee una frase a la vez con 250 ms entre frases y 600 ms al cambiar de parte, y termina", async () => {
    const l = nuevo();
    l.empezar(["intro", "toca", "cierre"], false);
    expect(l.fase).toBe("armando");
    l.fijarArmadas("intro", fr("intro", "Hola: 3 te esperan."));
    expect(l.fase).toBe("leyendo");
    expect(voz.dichas).toEqual(["Hola: 3 te esperan."]);
    l.fijarArmadas("toca", fr("toca", "Te esperan 3 cosas.", "Y 2 más."));
    l.fijarArmadas("cierre", fr("cierre", "Eso es todo."));
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS - 1);
    expect(voz.dichas).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(voz.dichas.at(-1)).toBe("Te esperan 3 cosas.");
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_FRASES_MS);
    expect(voz.dichas.at(-1)).toBe("Y 2 más.");
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    expect(l.fase).toBe("fin");
    expect(l.oido()).toBe(1);
    expect(l.escuchado()).toBe(true);
    expect(voz.dichas).toEqual(["Hola: 3 te esperan.", "Te esperan 3 cosas.", "Y 2 más.", "Eso es todo."]);
  });

  it("pide los audios de las que siguen junto con la que suena", () => {
    const l = nuevo();
    l.empezar(["intro", "toca"], false);
    l.fijarArmadas("toca", fr("toca", "A.", "B.", "C."));
    l.fijarArmadas("intro", fr("intro", "Hola."));
    expect(voz.siguen[0]).toEqual(["A.", "B."]);
  });

  it("una parte que la IA todavía escribe espera como mucho 3,4 s desde que terminó la frase anterior (con la pausa); después van las armadas", async () => {
    const l = nuevo();
    l.empezar(["intro", "hecho", "cierre"], true);
    l.fijarArmadas("intro", fr("intro", "Hola."));
    l.fijarArmadas("hecho", fr("hecho", "Se terminaron 3 tareas."));
    l.fijarArmadas("cierre", fr("cierre", "Eso es todo."));
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    expect(l.fase).toBe("espera");
    await vi.advanceTimersByTimeAsync(ESPERA_IA_MS - PAUSA_PARTES_MS - 10);
    expect(l.fase).toBe("espera");
    await vi.advanceTimersByTimeAsync(10);
    expect(voz.dichas.at(-1)).toBe("Se terminaron 3 tareas.");
    // Lo que llega después de la IA no cambia nada de esa parte.
    l.fijarIa("hecho", [{ sec: "hecho", texto: "Se cerraron 3 tareas.", ia: true }]);
    expect(l.secciones[1]!.usadas![0]!.texto).toBe("Se terminaron 3 tareas.");
    // La parte que sí llegó a tiempo va con lo de la IA.
    l.fijarIa("cierre", [{ sec: "cierre", texto: "Eso es todo, nos vemos.", ia: true }]);
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    expect(voz.dichas.at(-1)).toBe("Eso es todo, nos vemos.");
  });

  it("si la IA no va (`false`), la parte sigue al tiro con las armadas", async () => {
    const l = nuevo();
    l.empezar(["intro", "toca"], true);
    l.fijarArmadas("intro", fr("intro", "Hola."));
    l.fijarArmadas("toca", fr("toca", "No te espera nada."));
    l.fijarIa("toca", false);
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    expect(voz.dichas.at(-1)).toBe("No te espera nada.");
  });

  it("una parte sin sus datos espera sus datos (sin tope)", async () => {
    const l = nuevo();
    l.empezar(["intro", "hecho"], false);
    l.fijarArmadas("intro", fr("intro", "Hola."));
    await voz.termina();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(l.fase).toBe("espera");
    l.fijarArmadas("hecho", fr("hecho", "Se terminaron 3 tareas."));
    expect(voz.dichas.at(-1)).toBe("Se terminaron 3 tareas.");
  });

  it("pausar y seguir repite la frase desde el principio; la velocidad la vuelve a empezar", async () => {
    const l = nuevo();
    l.empezar(["intro"], false);
    l.fijarArmadas("intro", fr("intro", "Uno.", "Dos."));
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_FRASES_MS);
    expect(voz.dichas).toEqual(["Uno.", "Dos."]);
    l.pausar();
    expect(l.fase).toBe("pausa");
    expect(voz.cortadas).toBe(1);
    // Lo que termina después de la pausa no avanza nada.
    await voz.termina();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(voz.dichas).toHaveLength(2);
    l.seguir();
    expect(voz.dichas).toEqual(["Uno.", "Dos.", "Dos."]);
    l.cambiarVelocidad();
    expect(l.velocidad).toBe(1.25);
    expect(voz.dichas.at(-1)).toBe("Dos.");
    expect(voz.velocidades.at(-1)).toBe(1.25);
    l.cambiarVelocidad();
    l.cambiarVelocidad();
    expect(l.velocidad).toBe(1);
  });

  it("parte anterior: al principio de la parte; en sus primeros 1,5 s, a la anterior. Siguiente: la próxima; en la última, termina", async () => {
    const l = nuevo();
    l.empezar(["intro", "toca", "cierre"], false);
    l.fijarArmadas("intro", fr("intro", "Hola."));
    l.fijarArmadas("toca", fr("toca", "T1.", "T2."));
    l.fijarArmadas("cierre", fr("cierre", "Fin."));
    l.saltar(1);
    expect(voz.dichas.at(-1)).toBe("T1.");
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_FRASES_MS);
    expect(voz.dichas.at(-1)).toBe("T2.");
    l.saltar(-1);
    expect(voz.dichas.at(-1)).toBe("T1.");
    await vi.advanceTimersByTimeAsync(VOLVER_MS - 100);
    l.saltar(-1);
    expect(voz.dichas.at(-1)).toBe("Hola.");
    l.ir({ s: 2, k: 0 });
    expect(voz.dichas.at(-1)).toBe("Fin.");
    l.saltar(1);
    expect(l.fase).toBe("fin");
    l.otraVez();
    expect(voz.dichas.at(-1)).toBe("Hola.");
  });

  it("cuánto se oyó (para «Lo nuevo», desde la mitad)", async () => {
    const l = nuevo();
    l.empezar(["intro", "cierre"], false);
    l.fijarArmadas("intro", fr("intro", "x".repeat(100)));
    l.fijarArmadas("cierre", fr("cierre", "x".repeat(100)));
    expect(l.oido()).toBe(0);
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    expect(l.oido()).toBe(0.5);
    expect(l.escuchado()).toBe(true);
    l.cerrar();
    expect(l.fase).toBe("off");
    expect(cambios).toBeGreaterThan(0);
  });
});

describe("cuánto se oyó de verdad (JST-261)", () => {
  // Un resumen corto como el de la QA: 6 partes, 2 o 3 frases de ~4 s cada una.
  const SECS: Seccion[] = ["intro", "toca", "hecho", "trabajan", "cola", "cierre"];
  // Todas del mismo largo: pesan lo mismo.
  const frase = (n: number) => `Frase ${String(n).padStart(2, "0")} de un resumen que dura unos cuatro segundos.`;
  const armar = (l: Lector) => {
    let n = 0;
    for (const s of SECS) l.fijarArmadas(s, fr(s, ...Array.from({ length: s === "intro" || s === "cierre" ? 2 : 3 }, () => frase(++n))));
  };

  it("apretar «Parte siguiente» hasta el final, cada 0,5 s, no cuenta como escuchado", async () => {
    voz.msFrase = 4_000;
    const l = nuevo();
    l.empezar(SECS, false);
    armar(l);
    for (let i = 0; i < SECS.length; i++) {
      await vi.advanceTimersByTimeAsync(500);
      l.saltar(1);
    }
    expect(l.fase).toBe("fin");
    // Sonaron 0,5 s de la primera frase de cada parte: 6 de 16 frases, 1/8 de cada una.
    expect(l.oido()).toBeCloseTo(6 / 16 / 8, 3);
    expect(l.escuchado()).toBe(false);
  });

  it("oír entera más de la mitad y saltar el resto sí cuenta; oír menos, no", async () => {
    const oirYSaltar = async (oidas: number) => {
      const l = nuevo();
      l.empezar(SECS, false);
      armar(l);
      for (let i = 0; i < oidas; i++) {
        await voz.termina();
        // Después de la última, se salta antes de que empiece la siguiente.
        if (i < oidas - 1) await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
      }
      while (l.fase !== "fin") l.saltar(1);
      return l;
    };
    // 9 de 16 frases iguales enteras: 56 %.
    expect((await oirYSaltar(9)).escuchado()).toBe(true);
    // 7 de 16: 44 %.
    const l = await oirYSaltar(7);
    expect(l.oido()).toBeCloseTo(7 / 16, 3);
    expect(l.escuchado()).toBe(false);
    // «Otra vez» y oírlo entero: ahora sí.
    l.otraVez();
    for (let i = 0; i < 16; i++) {
      await voz.termina();
      await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    }
    expect(l.fase).toBe("fin");
    expect(l.escuchado()).toBe(true);
  });

  it("pausar y seguir repite la frase, pero lo repetido no suma dos veces", async () => {
    voz.msFrase = 4_000;
    const l = nuevo();
    l.empezar(["intro"], false);
    l.fijarArmadas("intro", fr("intro", "x".repeat(60), "x".repeat(60)));
    await vi.advanceTimersByTimeAsync(2_000);
    l.pausar();
    expect(l.oido()).toBeCloseTo(0.25, 3);
    l.seguir();
    await vi.advanceTimersByTimeAsync(2_000);
    l.pausar();
    expect(l.oido()).toBeCloseTo(0.25, 3);
    l.seguir();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(l.oido()).toBeCloseTo(0.375, 3);
    await voz.termina();
    expect(l.oido()).toBeCloseTo(0.5, 3);
  });

  it("cuenta la frase que suena (antes de cerrar) y no el rato que se espera su audio", async () => {
    voz.msFrase = 4_000;
    voz.alTiro = false;
    const l = nuevo();
    l.empezar(["intro"], false);
    l.fijarArmadas("intro", fr("intro", "x".repeat(60)));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(l.oido()).toBe(0);
    voz.empieza();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(l.oido()).toBeCloseTo(0.25, 3);
    expect(l.escuchado()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(l.escuchado()).toBe(true);
  });

  it("a 1,5× cuenta por lo que dura el audio a esa velocidad", async () => {
    voz.msFrase = 2_000;
    const l = nuevo();
    l.empezar(["intro", "cierre"], false);
    l.fijarArmadas("intro", fr("intro", "x".repeat(60)));
    l.fijarArmadas("cierre", fr("cierre", "x".repeat(60)));
    l.cambiarVelocidad();
    l.cambiarVelocidad();
    expect(l.velocidad).toBe(1.5);
    await vi.advanceTimersByTimeAsync(1_000);
    l.saltar(1);
    expect(l.oido()).toBeCloseTo(0.25, 3);
  });

  it("una parte vacía no cuenta: oír lo único que hay es oírlo todo", async () => {
    const l = nuevo();
    l.empezar(["intro", "toca", "cierre"], false);
    l.fijarArmadas("intro", fr("intro", "Hola."));
    l.fijarArmadas("toca", []);
    l.fijarArmadas("cierre", []);
    await voz.termina();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS * 2);
    expect(l.fase).toBe("fin");
    expect(l.oido()).toBe(1);
  });
});

/** Una voz que pide audios (como la de Lorenzo): `preparar` responde cuando llega el audio, o `false` a los `ms`. */
class VozConAudios extends VozFalsa {
  preparadas: Array<{ texto: string; ms: number }> = [];
  /** El audio nunca llega ni avisa que no llegó: decide el reloj del lector. */
  nunca = false;
  private listas = new Set<string>();
  private pendientes = new Map<string, Array<(ok: boolean) => void>>();
  preparar(f: FraseResumen, ms: number): boolean | Promise<boolean> {
    this.preparadas.push({ texto: f.texto, ms });
    if (this.listas.has(f.texto)) return true;
    return new Promise<boolean>((ok) => {
      const t = this.nunca ? null : setTimeout(() => ok(false), ms);
      const l = this.pendientes.get(f.texto) ?? [];
      l.push((x) => {
        if (t) clearTimeout(t);
        ok(x);
      });
      this.pendientes.set(f.texto, l);
    });
  }
  /** Llega el audio de esa frase (o el worker dice que no se puede). */
  async llega(texto: string, ok = true): Promise<void> {
    if (ok) this.listas.add(texto);
    for (const r of this.pendientes.get(texto) ?? []) r(ok);
    this.pendientes.delete(texto);
    await vi.advanceTimersByTimeAsync(0);
  }
}

describe("como mucho 4 s de silencio antes de una parte que escribe la IA (JST-257)", () => {
  let v: VozConAudios;
  const IA1 = "Tienes 3 cosas esperando.";
  const ia = (sec: Seccion, ...textos: string[]): FraseResumen[] => textos.map((texto) => ({ sec, texto, ia: true }));
  /** «Hola.» suena; «Lo que te toca» y el cierre ya tienen sus armadas y la IA los escribe. */
  const leyendo = () => {
    const l = nuevo();
    l.empezar(["intro", "toca", "cierre"], true);
    l.fijarArmadas("toca", fr("toca", "Te esperan 3 cosas.", "Y 2 más."));
    l.fijarArmadas("cierre", fr("cierre", "Eso es todo."));
    l.fijarArmadas("intro", fr("intro", "Hola."));
    return l;
  };
  /** Termina «Hola.»: desde aquí se cuenta el silencio. */
  const callaDesde = async () => {
    const t = Date.now();
    await v.termina();
    return t;
  };

  beforeEach(() => {
    v = new VozConAudios();
    voz = v;
  });

  it("la cuenta deja medio segundo para que empiece la armada", () => {
    expect(ESPERA_IA_MS).toBeLessThanOrEqual(SILENCIO_MAX_MS - 500);
    expect(ESPERA_IA_MS).toBeGreaterThan(PAUSA_PARTES_MS + 2_000);
  });

  it("mientras la IA escribe la parte que sigue, su primera armada se pide con la frase que suena (y nada más de esa parte)", () => {
    leyendo();
    expect(v.siguen[0]).toEqual(["Te esperan 3 cosas."]);
  });

  it("la IA no llega: la armada empieza a los 3,4 s de terminar la frase anterior, con la pausa entre partes adentro (antes, 0,6 + 4 s + su audio)", async () => {
    const l = leyendo();
    const t0 = await callaDesde();
    await vi.advanceTimersByTimeAsync(ESPERA_IA_MS - 1);
    expect(l.fase).toBe("espera");
    expect(v.dichas).toEqual(["Hola."]);
    await vi.advanceTimersByTimeAsync(1);
    expect(v.dichas.at(-1)).toBe("Te esperan 3 cosas.");
    expect(Date.now() - t0).toBe(ESPERA_IA_MS);
    expect(l.secciones[1]!.ia).toBe(false);
    // Lo que escribe la IA después no cambia esa parte.
    l.fijarIa("toca", ia("toca", IA1));
    expect(l.secciones[1]!.usadas!.map((f) => f.texto)).toEqual(["Te esperan 3 cosas.", "Y 2 más."]);
  });

  it("la IA llega a tiempo con una frase nueva pero su audio no: va la armada a los 3,4 s (el caso de 5,72 s de la QA)", async () => {
    v.nunca = true;
    const l = leyendo();
    const t0 = await callaDesde();
    // La IA escribe «Lo que te toca» 1,7 s después de la pausa entre partes.
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS + 1_700);
    l.fijarIa("toca", ia("toca", IA1, "Y 2 más."));
    expect(v.preparadas).toEqual([{ texto: IA1, ms: ESPERA_IA_MS - PAUSA_PARTES_MS - 1_700 }]);
    expect(l.fase).toBe("espera");
    await vi.advanceTimersByTimeAsync(ESPERA_IA_MS - PAUSA_PARTES_MS - 1_700 - 1);
    expect(v.dichas).toEqual(["Hola."]);
    await vi.advanceTimersByTimeAsync(1);
    expect(v.dichas.at(-1)).toBe("Te esperan 3 cosas.");
    expect(Date.now() - t0).toBe(ESPERA_IA_MS);
    expect(l.secciones[1]!.audioTarde).toBe(true);
    // Su audio llega tarde: no cambia nada.
    await v.llega(IA1);
    expect(v.dichas).toEqual(["Hola.", "Te esperan 3 cosas."]);
    expect(l.secciones[1]!.usadas!.map((f) => f.texto)).toEqual(["Te esperan 3 cosas.", "Y 2 más."]);
  });

  it("la IA y su audio llegan a tiempo: va lo de la IA apenas está el audio", async () => {
    const l = leyendo();
    const t0 = await callaDesde();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS + 500);
    l.fijarIa("toca", ia("toca", IA1, "Y 2 más."));
    await vi.advanceTimersByTimeAsync(800);
    expect(l.fase).toBe("espera");
    await v.llega(IA1);
    expect(v.dichas.at(-1)).toBe(IA1);
    expect(Date.now() - t0).toBe(PAUSA_PARTES_MS + 1_300);
    expect(l.secciones[1]!.audioTarde).toBeFalsy();
    // La que sigue se pide con la que suena, como siempre.
    expect(v.siguen.at(-1)).toEqual(["Y 2 más.", "Eso es todo."]);
  });

  it("si el audio de la IA no se puede, va la armada al tiro", async () => {
    const l = leyendo();
    const t0 = await callaDesde();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS + 300);
    l.fijarIa("toca", ia("toca", IA1));
    await v.llega(IA1, false);
    expect(v.dichas.at(-1)).toBe("Te esperan 3 cosas.");
    expect(Date.now() - t0).toBe(PAUSA_PARTES_MS + 300);
    expect(l.secciones[1]!.audioTarde).toBe(true);
  });

  it("si la IA llega mientras suena la frase anterior, su audio se pide ahí y la parte empieza con la pausa de siempre", async () => {
    const l = leyendo();
    l.fijarIa("toca", ia("toca", IA1, "Y 2 más."));
    // La del cierre no es la que sigue: su audio se pide después, con las frases de antes.
    l.fijarIa("cierre", ia("cierre", "Eso es todo, nos vemos."));
    expect(v.preparadas).toEqual([{ texto: IA1, ms: PREPARAR_ANTES_MS }]);
    await v.llega(IA1);
    const t0 = await callaDesde();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    expect(v.dichas.at(-1)).toBe(IA1);
    expect(Date.now() - t0).toBe(PAUSA_PARTES_MS);
    expect(l.secciones[1]!.audioTarde).toBeFalsy();
  });

  it("una parte vacía no espera a la IA ni vuelve a empezar la cuenta", async () => {
    const l = nuevo();
    l.empezar(["intro", "toca", "cierre"], true);
    l.fijarArmadas("toca", []);
    l.fijarArmadas("cierre", fr("cierre", "Eso es todo."));
    l.fijarArmadas("intro", fr("intro", "Hola."));
    const t0 = await callaDesde();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS);
    expect(l.secciones[1]!.usadas).toEqual([]);
    expect(l.seccionActual()?.sec).toBe("cierre");
    await vi.advanceTimersByTimeAsync(ESPERA_IA_MS - PAUSA_PARTES_MS);
    expect(v.dichas.at(-1)).toBe("Eso es todo.");
    expect(Date.now() - t0).toBe(ESPERA_IA_MS);
  });

  it("en pausa mientras espera el audio de la IA: al seguir, si ya está, va lo de la IA; si no, la armada al tiro", async () => {
    v.nunca = true;
    const l = leyendo();
    await callaDesde();
    await vi.advanceTimersByTimeAsync(PAUSA_PARTES_MS + 200);
    l.fijarIa("toca", ia("toca", IA1));
    l.pausar();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(v.dichas).toEqual(["Hola."]);
    l.seguir();
    expect(v.dichas.at(-1)).toBe("Te esperan 3 cosas.");
    expect(l.secciones[1]!.audioTarde).toBe(true);
  });
});
