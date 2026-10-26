// «Leer contexto» en la barra de arriba (JST-276, design-spec de JST-282 rev 2
// §5 a §7): los estados, las frases de a una, lo escrito sin voz, la ruta y una
// voz a la vez con el lector del Resumen. Voz y relojes de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_MS, FIN_MS, frasesDe, LectorContexto, MIN_FRASE_MS, msEscrita, tareaDeRuta, type VozContexto } from "../src/ui/contextoLector.js";
import type { FraseResumen } from "../src/resumen/frases.js";
import { Lector, type Habla, type VozLector } from "../src/resumen/lector.js";

class VozFalsa implements VozContexto {
  hay = true;
  dichas: string[] = [];
  primeras: boolean[] = [];
  cortadas = 0;
  private abierta: ((cortada: boolean) => void) | null = null;
  hayVoz() {
    return Promise.resolve(this.hay);
  }
  decir(frase: string, alTerminar: (cortada: boolean) => void, primera: boolean) {
    this.dichas.push(frase);
    this.primeras.push(primera);
    this.abierta = alTerminar;
    return () => {
      this.cortadas += 1;
      this.abierta = null;
    };
  }
  /** Termina la frase que suena (o la corta otra voz). */
  termina(cortada = false) {
    const a = this.abierta;
    this.abierta = null;
    a?.(cortada);
  }
}

const TEXTO = "Te pregunta: ¿Cómo quieres pasar tu lista? Es de la tarea JST-181: Pestañas guardadas. Es parte de JST-114: problema de ram.";

let voz: VozFalsa;
let pausas = 0;
let activos: boolean[] = [];
const nuevo = () =>
  new LectorContexto({
    voz,
    programar: (fn, ms) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    },
    antesDeLeer: () => (pausas += 1),
    alActivo: (on) => activos.push(on),
  });

beforeEach(() => {
  vi.useFakeTimers();
  voz = new VozFalsa();
  pausas = 0;
  activos = [];
});
afterEach(() => vi.useRealTimers());

describe("frasesDe", () => {
  it("corta en las oraciones, también tras «?» y antes de «¿»", () => {
    expect(frasesDe(TEXTO)).toEqual(["Te pregunta: ¿Cómo quieres pasar tu lista?", "Es de la tarea JST-181: Pestañas guardadas.", "Es parte de JST-114: problema de ram."]);
  });
  it("no corta en versiones, decimales ni en el número de una lista", () => {
    expect(frasesDe("Instala la 0.9.6 en la real. Pasos: 1. Abrir JST-181. 2. Buscar el botón.")).toEqual(["Instala la 0.9.6 en la real.", "Pasos: 1. Abrir JST-181.", "2. Buscar el botón."]);
  });
  it("«Lo último en el hilo:» va con el primer comentario, y lo vacío no es una frase", () => {
    expect(frasesDe("Tarea JST-1: algo. Lo último en el hilo: Sí, dale.")).toEqual(["Tarea JST-1: algo.", "Lo último en el hilo: Sí, dale."]);
    expect(frasesDe("   ")).toEqual([]);
  });
});

describe("msEscrita", () => {
  it("unas 16 letras por segundo, mínimo 1,8 s", () => {
    expect(msEscrita("Sí.")).toBe(MIN_FRASE_MS);
    expect(msEscrita("x".repeat(160))).toBe(10_000);
  });
});

describe("tareaDeRuta", () => {
  it("solo la página de una tarea", () => {
    expect(tareaDeRuta("/JST/issues/JST-181")).toBe("JST-181");
    expect(tareaDeRuta("/JST/issues/BET-693/")).toBe("BET-693");
    expect(tareaDeRuta("/JST/issues/2f0c1a3e-1111-4222-8333-944455556666")).toBe("2f0c1a3e-1111-4222-8333-944455556666");
    for (const p of ["/JST/issues", "/JST/issues/all", "/JST/issues/recent", "/JST/dashboard", "/JST/oficina-global", "/JST/projects/p1/issues/x", "/JST/execution-workspaces/w/issues", "/"]) expect(tareaDeRuta(p)).toBeNull();
  });
});

describe("LectorContexto", () => {
  it("Listo → Cargando al tiro → Leyendo de a una frase → Terminó 2,5 s → Listo", async () => {
    const c = nuevo();
    let pedir!: (t: string) => void;
    c.tocar("JST-181", () => new Promise((ok) => (pedir = ok)));
    expect(c.estado).toBe("cargando");
    expect(pausas).toBe(1);
    pedir(TEXTO);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    expect(c.frases).toHaveLength(3);
    expect(voz.dichas).toEqual(["Te pregunta: ¿Cómo quieres pasar tu lista?"]);
    voz.termina();
    expect(c.k).toBe(1);
    voz.termina();
    voz.termina();
    expect(voz.dichas).toHaveLength(3);
    expect(voz.primeras).toEqual([true, false, false]);
    expect(c.estado).toBe("fin");
    await vi.advanceTimersByTimeAsync(FIN_MS - 1);
    expect(c.estado).toBe("fin");
    await vi.advanceTimersByTimeAsync(1);
    expect(c.estado).toBe("listo");
    expect(activos).toEqual([true, false]);
  });

  it("tocar mientras carga o lee lo detiene; lo que llega tarde no empieza a hablar", async () => {
    const c = nuevo();
    let pedir!: (t: string) => void;
    c.tocar("JST-181", () => new Promise((ok) => (pedir = ok)));
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    expect(c.estado).toBe("listo");
    pedir(TEXTO);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("listo");
    expect(voz.dichas).toEqual([]);

    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    expect(c.estado).toBe("listo");
    expect(voz.cortadas).toBe(1);
  });

  it("si falla la carga: No se pudo por 4 s; tocar ahí lee otra vez", async () => {
    const c = nuevo();
    c.tocar("JST-181", () => Promise.reject(new Error("HTTP 500")));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("error");
    await vi.advanceTimersByTimeAsync(ERROR_MS - 1);
    expect(c.estado).toBe("error");
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    expect(c.estado).toBe("cargando");
    await vi.advanceTimersByTimeAsync(ERROR_MS);
    expect(c.estado).toBe("leyendo");
  });

  it("si otra voz corta la frase, se detiene (no salta a la siguiente)", async () => {
    const c = nuevo();
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    voz.termina(true);
    expect(c.estado).toBe("listo");
    expect(voz.dichas).toHaveLength(1);
  });

  it("sin voz en español: lo deja escrito, frase a frase, al ritmo de la lectura", async () => {
    voz.hay = false;
    const c = nuevo();
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    expect(c.sinVoz).toBe(true);
    expect(voz.dichas).toEqual([]);
    await vi.advanceTimersByTimeAsync(msEscrita(c.frases[0]!));
    expect(c.k).toBe(1);
    c.detener();
    expect(c.estado).toBe("listo");
    expect(c.sinVoz).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(c.estado).toBe("listo");
  });

  it("detener desde Terminó vuelve a Listo y ya no cambia solo", async () => {
    const c = nuevo();
    c.tocar("JST-181", () => Promise.resolve("Sí."));
    await vi.advanceTimersByTimeAsync(0);
    voz.termina();
    expect(c.estado).toBe("fin");
    c.detener();
    expect(c.estado).toBe("listo");
    await vi.advanceTimersByTimeAsync(FIN_MS);
    expect(c.estado).toBe("listo");
  });
});

describe("una voz a la vez con el Resumen (§7)", () => {
  class VozResumenFalsa implements VozLector {
    dichas: string[] = [];
    decir(f: FraseResumen): Habla {
      this.dichas.push(f.texto);
      return { fin: new Promise<void>(() => undefined), cortar: () => undefined };
    }
  }

  it("el Resumen avisa antes de cada frase: al seguir con ▶, el contexto se calla antes de que hable", async () => {
    const vr = new VozResumenFalsa();
    const orden: string[] = [];
    const c = nuevo();
    const l = new Lector({
      voz: { decir: (f, v, e, s) => (orden.push(`resumen: ${f.texto}`), vr.decir(f)) },
      ahora: Date.now,
      programar: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      alCambiar: () => undefined,
      antesDeHablar: () => {
        if (c.activo()) {
          orden.push("calla el contexto");
          c.detener();
        }
      },
    });
    l.empezar(["toca"], false);
    l.fijarArmadas("toca", [{ sec: "toca", texto: "Te toca JST-181." }]);
    l.fijarIa("toca", false);
    expect(l.fase).toBe("leyendo");
    l.pausar();
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    l.seguir();
    expect(c.estado).toBe("listo");
    expect(orden).toEqual(["resumen: Te toca JST-181.", "calla el contexto", "resumen: Te toca JST-181."]);
  });
});
