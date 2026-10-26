// La cola de las voces con los audios generados (JST-148), con relojes falsos:
// un `<audio>`, la voz del navegador y `fetch` de mentira, como en la copia
// (los audios llegan en 40 ms y cada frase dura 1,5 s).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndiceVoces } from "../src/voces.js";

const agentes = [
  { id: "a", corto: "Ana", empresa: "JSTM", aspecto: "1" },
  { id: "b", corto: "Beto", empresa: "JSTM", aspecto: "2" },
  { id: "c", corto: "Caro", empresa: "JSTM", aspecto: "3" },
  { id: "d", corto: "Dani", empresa: "JSTM", aspecto: "4" },
];

const indice: IndiceVoces = {
  version: 1,
  generado: "2026-10-22T00:00:00Z",
  resumen: "catalina",
  agentes: { a: "lorenzo", b: "alex", c: "dora", d: "santa" },
  audios: {
    "lorenzo|Ana, de JSTM: te necesito.": "ana.mp3",
    "alex|Beto, de JSTM: te necesito.": "beto.mp3",
    "dora|Caro, de JSTM: te necesito.": "caro.mp3",
    "santa|Dani, de JSTM: te necesito.": "dani.mp3",
    "catalina|2 agentes te necesitan.": "resumen2.mp3",
    "catalina|3 agentes te necesitan.": "resumen3.mp3",
    "catalina|4 agentes te necesitan.": "resumen4.mp3",
  },
};

/** Lo que se oyó, en orden: `audio:<archivo>` o `navegador:<texto>`. */
let oido: string[];
/** Cada archivo que se leyó y a los cuántos ms de la primera tarjeta. */
let pedidos: Array<{ archivo: string; ms: number }>;
let inicio: number;
let falta: Set<string>;
let demoraMp3: number;
/** JST-255: lo que dura cada MP3 (ms; los demás, 1,5 s), los que no avisan que terminaron y los que no empiezan nunca. */
let duraciones: Map<string, number>;
let sinAviso: Set<string>;
let noEmpiezan: Set<string>;
/** Cada audio que empezó (`archivo@ms`) y cada uno que otro cortó a medias (`cortado:archivo@ms`), desde la primera tarjeta. */
let linea: string[];

function preparar(): void {
  oido = [];
  pedidos = [];
  inicio = Date.now();
  falta = new Set();
  demoraMp3 = 40;
  duraciones = new Map();
  sinAviso = new Set();
  noEmpiezan = new Set();
  linea = [];
  const nombres = new WeakMap<Blob, string>();
  const archivo = (src: string) => (src.startsWith("blob:voz:") ? src.slice("blob:voz:".length) : null);
  class AudioFalso {
    private fuente = "";
    private desde: number | null = null;
    volume = 1;
    playbackRate = 1;
    preload = "";
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(src?: string) {
      if (src) this.fuente = src;
    }
    get src(): string {
      return this.fuente;
    }
    set src(v: string) {
      const a = archivo(this.fuente);
      if (a && this.desde !== null && !this.ended) linea.push(`cortado:${a}@${Date.now() - inicio}`);
      this.fuente = v;
      this.desde = null;
    }
    get duration(): number {
      const a = archivo(this.fuente);
      return a ? (duraciones.get(a) ?? 1_500) / 1000 : NaN;
    }
    get currentTime(): number {
      return this.desde === null ? 0 : Math.min(this.duration, ((Date.now() - this.desde) / 1000) * this.playbackRate);
    }
    set currentTime(_t: number) {}
    get ended(): boolean {
      return this.desde !== null && this.currentTime >= this.duration;
    }
    get paused(): boolean {
      return this.desde === null || this.ended;
    }
    play(): Promise<void> {
      const src = this.fuente;
      const a = archivo(src);
      if (!a) return Promise.resolve();
      if (noEmpiezan.has(a)) return new Promise<void>(() => undefined);
      oido.push(`audio:${a}`);
      linea.push(`${a}@${Date.now() - inicio}`);
      this.desde = Date.now();
      if (!sinAviso.has(a)) {
        setTimeout(() => {
          if (this.fuente === src) this.onended?.();
        }, (this.duration * 1000) / this.playbackRate);
      }
      return Promise.resolve();
    }
    pause(): void {
      this.desde = null;
    }
  }
  const sintesis = {
    speaking: false,
    speak: (u: { text: string }) => {
      if (u.text) oido.push(`navegador:${u.text}`);
    },
    getVoices: () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  vi.stubGlobal("window", { speechSynthesis: sintesis });
  vi.stubGlobal("document", { addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("location", { pathname: "/_plugins/u1/ui/tv.html", origin: "http://copia" });
  vi.stubGlobal("Audio", AudioFalso);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => (nombres.has(b as Blob) ? `blob:voz:${nombres.get(b as Blob)}` : "blob:otro"));
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", (url: string) => {
    const archivo = url.replace(/^\/_plugins\/u1\/ui\/voces\//, "").replace(/\?.*$/, "");
    pedidos.push({ archivo, ms: Date.now() - inicio });
    if (archivo === "indice.json") return new Promise((ok) => setTimeout(() => ok({ ok: true, json: async () => indice }), 20));
    const blob = new Blob([archivo]);
    nombres.set(blob, archivo);
    return new Promise((ok) => setTimeout(() => ok({ ok: !falta.has(archivo), blob: async () => blob }), demoraMp3));
  });
}

async function cargar() {
  vi.resetModules();
  const sonido = await import("../src/ui/sonido.js");
  sonido.desbloquearAudio();
  return sonido;
}

/** Como la vigía: la campanita con la primera tarjeta y una frase por tarjeta, a los ms de `llegadas`. */
async function tarjetas(llegadas: number[]): Promise<void> {
  const sonido = await cargar();
  let t = 0;
  for (const [i, ms] of llegadas.entries()) {
    await vi.advanceTimersByTimeAsync(ms - t);
    t = ms;
    if (i === 0) sonido.tocarCampana();
    sonido.ponerFrase("toca", agentes[i]!, "nombre-empresa");
  }
  await vi.advanceTimersByTimeAsync(15_000);
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-22T06:00:00Z") });
  preparar();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("voces con los audios generados (JST-148)", () => {
  it("escalonado (0; 0,4; 0,8 y 3,6 s): la 1.ª con su audio y el resumen, 3 s después, con el de Catalina", async () => {
    await tarjetas([0, 400, 800, 3_600]);
    expect(oido).toEqual(["audio:ana.mp3", "audio:resumen3.mp3"]);
  });

  it("el audio del resumen se pide apenas se junta (a los 3,6 s), no recién en su turno", async () => {
    // Con la Mac cargada, el MP3 tarda 1,5 s: igual sale con el audio.
    demoraMp3 = 1_500;
    await tarjetas([0, 400, 800, 3_600]);
    expect(oido).toEqual(["audio:ana.mp3", "audio:resumen3.mp3"]);
    expect(pedidos.filter((p) => p.archivo === "resumen3.mp3")).toEqual([{ archivo: "resumen3.mp3", ms: 3_600 }]);
  });

  it("junto (las 4 en 0,3 s): un solo resumen con el audio de Catalina", async () => {
    await tarjetas([0, 100, 200, 300]);
    expect(oido).toEqual(["audio:resumen4.mp3"]);
  });

  it("si el MP3 del resumen no se puede leer, lo dice la voz del navegador", async () => {
    falta.add("resumen3.mp3");
    await tarjetas([0, 400, 800, 3_600]);
    expect(oido).toEqual(["audio:ana.mp3", "navegador:3 agentes te necesitan."]);
  });

  it("si el MP3 tarda más de 2,5 s desde que se pidió, habla el navegador", async () => {
    demoraMp3 = 6_000;
    await tarjetas([0]);
    expect(oido).toEqual(["navegador:Ana, de JSTM: te necesito."]);
  });
});

describe("una frase larga suena entera y la siguiente espera (JST-255)", () => {
  /** Ana con la campanita y, a los `ms`, Beto (como las sondas de la QA de la 0.8.0); después, 60 s. */
  async function dosTarjetas(ms = 2_000) {
    const sonido = await cargar();
    sonido.tocarCampana();
    sonido.ponerFrase("toca", agentes[0]!, "nombre-empresa");
    await vi.advanceTimersByTimeAsync(ms);
    sonido.ponerFrase("toca", agentes[1]!, "nombre-empresa");
    await vi.advanceTimersByTimeAsync(60_000);
    return sonido;
  }
  const empezo = (a: string) => Number(linea.find((x) => x.startsWith(`${a}@`))!.split("@")[1]);
  const cortes = () => linea.filter((x) => x.startsWith("cortado:"));

  it("un clon de 36,6 s y otra tarjeta 2 s después: la segunda empieza cuando termina la primera (antes, a los 15 s la cortaba)", async () => {
    duraciones.set("ana.mp3", 36_600);
    await dosTarjetas();
    expect(oido).toEqual(["audio:ana.mp3", "audio:beto.mp3"]);
    expect(cortes()).toEqual([]);
    // Esperó 35 s detrás de Ana y no se botó por vieja (los 20 s cuentan solo la espera sin voz).
    expect(empezo("beto.mp3") - empezo("ana.mp3")).toBeGreaterThanOrEqual(36_600);
    expect(empezo("beto.mp3") - empezo("ana.mp3")).toBeLessThan(36_600 + 500);
  });

  it("si el `<audio>` no avisa que terminó, la siguiente empieza 1 s después de lo que dura (no a los 15 s)", async () => {
    duraciones.set("ana.mp3", 5_000);
    sinAviso.add("ana.mp3");
    await dosTarjetas();
    expect(oido).toEqual(["audio:ana.mp3", "audio:beto.mp3"]);
    expect(empezo("beto.mp3") - empezo("ana.mp3")).toBeGreaterThanOrEqual(6_000);
    expect(empezo("beto.mp3") - empezo("ana.mp3")).toBeLessThan(6_000 + 400);
  });

  it("un audio que no empieza nunca no tapa la cola: a los 15 s sigue la siguiente", async () => {
    noEmpiezan.add("ana.mp3");
    await dosTarjetas();
    expect(oido).toEqual(["audio:beto.mp3"]);
    expect(empezo("beto.mp3")).toBeGreaterThanOrEqual(15_000);
    expect(empezo("beto.mp3")).toBeLessThan(17_000);
  });

  it("vigilarFin (también lo de la oficina y el Resumen): a su velocidad, lo que dura + 1 s; nunca antes", async () => {
    const sonido = await cargar();
    const a = new Audio() as HTMLAudioElement;
    duraciones.set("largo.mp3", 18_000);
    a.src = "blob:voz:largo.mp3";
    a.playbackRate = 0.75;
    const fin = vi.fn();
    const r = sonido.vigilarFin(a, fin);
    await a.play();
    r.empezo();
    // 18 s a 0,75: 24 s, y 1 s de margen.
    await vi.advanceTimersByTimeAsync(24_900);
    expect(fin).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(fin).toHaveBeenCalledTimes(1);
    // Parado (terminó por su cuenta), ya no llama.
    const fin2 = vi.fn();
    sonido.vigilarFin(a, fin2).parar();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fin2).not.toHaveBeenCalled();
    expect(sonido.MAX_EMPEZAR_MS).toBe(15_000);
    expect(sonido.MARGEN_FIN_MS).toBe(1_000);
  });
});
