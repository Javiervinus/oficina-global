// La voz del Resumen (0.9.0, design-spec de JST-245 §4): cada frase es un audio
// de la voz del Chief of staff (hoy Lorenzo, de Edge) que hace el worker
// (`voz-resumen`) y queda en `voces/vivo/`, como las demás voces de la Oficina.
//
// - La frase que suena y las 2 que siguen se le piden juntas; mientras suena
//   una, se pide la siguiente (Edge tarda de 0,3 a 2,5 s por frase y cada frase
//   dura ~4 s).
// - Lo primero que escribió la IA de una parte se pide antes de decirlo
//   (`preparar`, JST-257): si su audio no está a tiempo, el lector dice la
//   armada, cuyo audio ya se pidió con la frase anterior.
// - Si un audio tarda más de 4 s o falla, desde esa frase hasta el final habla
//   la voz en español del navegador, para que no se alternen voces. Sin voz en
//   español, la frase queda escrita y se avanza al ritmo de lo que duraría.
// - La velocidad: `playbackRate` del audio con `preservesPitch`; con la voz del
//   navegador, `rate`.
import { vocesEspanol } from "../avisos.js";
import { accionPlugin } from "../fuentes.js";
import { duracionFrase, type FraseResumen } from "../resumen/frases.js";
import type { Habla, VozLector } from "../resumen/lector.js";
import { FRASES_POR_PEDIDO } from "../resumen/voz.js";
import { archivoVivo, type VozId } from "../voces.js";
import { instalacion, pedirArchivo, yaBajado } from "./audiosVoces.js";
import { vigilarFin } from "./sonido.js";

/** Lo más que se espera el audio de una frase desde que toca decirla. */
export const ESPERA_AUDIO_RESUMEN_MS = 4_000;
/** Lo más que se pide el audio de una frase que se prepara (después, quien la espere decide). */
const PREPARAR_MS = 8_000;
/** La voz del navegador a veces no avisa que terminó (Chrome): se sigue a las 2,2 veces lo que debería durar. */
const TOPE_NAVEGADOR = 2.2;

export type ModoVoz = "lorenzo" | "navegador";

/** Lo que sonó (para la QA y el audio de muestra): cuándo, qué, con qué voz, cuánto esperó su audio y cuánto duró. */
export interface Sonado {
  t: number;
  texto: string;
  voz: "lorenzo" | "navegador" | "escrita";
  archivo: string | null;
  esperaMs: number;
  ms: number | null;
}

const espera = (ms: number) => new Promise<void>((ok) => setTimeout(ok, Math.max(0, ms)));
const conPlazo = <T>(p: Promise<T>, hasta: number): Promise<T | null> => Promise.race([p, espera(hasta - Date.now()).then(() => null)]);

export class VozResumen implements VozLector {
  modo: ModoVoz;
  /** Este navegador no tiene voz en español: lo que no sonó con Lorenzo queda escrito. */
  sinVoces = false;
  readonly sonado: Sonado[] = [];
  private cortes = new Set<() => void>();
  private pedidasAntes = new Set<string>();
  /** Lo que `preparar` está pidiendo (por texto) y lo que ya bajó. */
  private preparadas = new Map<string, Promise<Blob | null>>();
  private listas = new Set<string>();
  /** La voz del Chief of staff, cuando se leyó el índice de las voces (`null`: no hay; habla el navegador). */
  vozId: VozId | null = null;
  private readonly lista: Promise<void>;

  constructor(
    private readonly o: {
      /** La voz del Chief of staff (Edge o Kokoro), cuando se sepa; `null` si no hay voces: habla el navegador. */
      voz: Promise<VozId | null>;
      resumen: string;
      /** Para la acción del worker (el host revisa que el usuario la vea). */
      companyId: string | null;
      audio: HTMLAudioElement | null;
      alCambiar: () => void;
    },
  ) {
    this.modo = o.companyId && o.audio ? "lorenzo" : "navegador";
    this.lista = o.voz.then(
      (v) => {
        this.vozId = v;
      },
      () => undefined,
    );
  }

  private async accion(textos: readonly string[], ms: number): Promise<string[] | null> {
    const id = await instalacion().catch(() => null);
    if (!id || !this.o.companyId || !this.vozId) return null;
    const r = await accionPlugin<{ estados: string[] }>({ base: "" }, id, "voz-resumen", this.o.companyId, { voz: this.vozId, resumen: this.o.resumen, frases: textos.slice(0, FRASES_POR_PEDIDO), ms: Math.max(0, Math.round(ms)) }).catch(() => null);
    return r && Array.isArray(r.estados) ? r.estados : null;
  }

  private archivo(texto: string): string {
    return archivoVivo(this.vozId!, texto);
  }

  /** El audio de una frase: el que ya bajó esta pestaña o, si el worker dice que está, lo baja; hasta `hasta`. */
  private async blobDe(texto: string, siguen: readonly string[], hasta: number): Promise<Blob | null> {
    await conPlazo(this.lista, hasta);
    if (!this.vozId) return null;
    const archivo = this.archivo(texto);
    const ya = yaBajado(archivo);
    if (ya) {
      const b = await conPlazo(ya, hasta);
      if (b) return b;
    }
    while (Date.now() < hasta) {
      const r = await this.accion([texto, ...siguen], hasta - Date.now());
      if (r?.[0] === "lista") return conPlazo(pedirArchivo(archivo), hasta);
      if (r?.[0] === "no") return null;
      if (!r) await espera(Math.min(400, hasta - Date.now()));
    }
    return null;
  }

  /**
   * Las que vienen, mientras suena una: se le preguntan al worker (ya están en
   * su fila, detrás de la que suena) y se bajan apenas estén. Espera como mucho
   * 8 s por la primera.
   */
  private bajarLasQueSiguen(siguen: readonly string[]): void {
    if (this.modo !== "lorenzo" || siguen.length === 0 || !this.vozId) return;
    const textos = siguen.slice(0, FRASES_POR_PEDIDO).filter((t) => !yaBajado(this.archivo(t)));
    if (textos.length === 0) return;
    const clave = textos.join("\u0000");
    if (this.pedidasAntes.has(clave)) return;
    this.pedidasAntes.add(clave);
    void this.accion(textos, 8_000).then((r) => {
      r?.forEach((e, i) => {
        if (e === "lista") void pedirArchivo(this.archivo(textos[i]!));
      });
    });
  }

  /**
   * JST-257: pide el audio de una frase que todavía no suena (lo primero que
   * escribió la IA de una parte) y dice si está dentro de `ms`; si ya bajó,
   * `true` al tiro. La voz del navegador no necesita audio: `true`.
   */
  preparar(f: FraseResumen, ms: number): boolean | Promise<boolean> {
    if (this.modo !== "lorenzo" || !this.o.audio || this.listas.has(f.texto)) return true;
    const hasta = Date.now() + ms;
    return (async () => {
      const leida = await conPlazo(this.lista.then(() => true), hasta);
      if (!leida) return false;
      // Sin la voz del Chief of staff habla el navegador: no hay audio que esperar.
      if (!this.vozId || this.modo !== "lorenzo") return true;
      const texto = f.texto;
      let p = this.preparadas.get(texto);
      if (!p) {
        p = this.blobDe(texto, [], Date.now() + PREPARAR_MS);
        this.preparadas.set(texto, p);
        void p.then((b) => {
          this.preparadas.delete(texto);
          if (b) this.listas.add(texto);
        });
      }
      return !!(await conPlazo(p, hasta));
    })();
  }

  decir(f: FraseResumen, velocidad: number, alEmpezar: (ms: number | null) => void, siguenFr: readonly FraseResumen[] = []): Habla {
    const siguen = siguenFr.map((x) => x.texto);
    let cortada = false;
    let cortarAhora: () => void = () => undefined;
    const corte = () => {
      cortada = true;
      cortarAhora();
    };
    this.cortes.add(corte);
    const fin = (async () => {
      const t0 = Date.now();
      if (this.modo === "lorenzo") {
        const blob = await this.blobDe(f.texto, siguen, t0 + ESPERA_AUDIO_RESUMEN_MS);
        if (cortada) return;
        if (blob && this.o.audio) {
          this.bajarLasQueSiguen(siguen);
          const ok = await this.tocar(blob, f, velocidad, alEmpezar, (c) => (cortarAhora = c), Date.now() - t0);
          if (ok || cortada) return;
        }
        // No llegó a tiempo (o no se pudo tocar): desde aquí, la voz del navegador.
        this.modo = "navegador";
        this.o.alCambiar();
      }
      if (cortada) return;
      await this.navegador(f, velocidad, alEmpezar, (c) => (cortarAhora = c), Date.now() - t0);
    })().finally(() => this.cortes.delete(corte));
    return { fin, cortar: corte };
  }

  /** Toca el audio; `false` si el navegador no lo dejó sonar. */
  private tocar(blob: Blob, f: FraseResumen, velocidad: number, alEmpezar: (ms: number | null) => void, alCortar: (c: () => void) => void, esperaMs: number): Promise<boolean> {
    const a = this.o.audio!;
    return new Promise<boolean>((listo) => {
      const url = URL.createObjectURL(blob);
      let hecho = false;
      const terminar = (ok: boolean) => {
        if (hecho) return;
        hecho = true;
        reloj.parar();
        a.onended = null;
        a.onerror = null;
        URL.revokeObjectURL(url);
        listo(ok);
      };
      // Si el `<audio>` no avisa que terminó: según lo que dura, a su velocidad (JST-255; antes, 20 s fijos).
      const reloj = vigilarFin(a, () => terminar(true));
      alCortar(() => {
        try {
          a.pause();
        } catch {
          // Ya no sonaba.
        }
        terminar(true);
      });
      a.onended = () => terminar(true);
      a.onerror = () => terminar(false);
      a.src = url;
      a.playbackRate = velocidad;
      a.defaultPlaybackRate = velocidad;
      (a as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean }).preservesPitch = true;
      (a as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      a.volume = 1;
      a.play().then(
        () => {
          reloj.empezo();
          const ms =Number.isFinite(a.duration) && a.duration > 0 ? Math.round((a.duration * 1000) / velocidad) : null;
          this.sonado.push({ t: Date.now(), texto: f.texto, voz: "lorenzo", archivo: this.archivo(f.texto), esperaMs, ms });
          if (this.sonado.length > 200) this.sonado.shift();
          alEmpezar(ms);
        },
        () => terminar(false),
      );
    });
  }

  /** La voz en español del navegador; sin ninguna, la frase queda escrita lo que duraría. */
  private navegador(f: FraseResumen, velocidad: number, alEmpezar: (ms: number | null) => void, alCortar: (c: () => void) => void, esperaMs: number): Promise<void> {
    const dura = duracionFrase(f.texto, velocidad);
    const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
    const voces = synth ? vocesEspanol(synth.getVoices()) : [];
    const anotar = (voz: Sonado["voz"]) => {
      this.sonado.push({ t: Date.now(), texto: f.texto, voz, archivo: null, esperaMs, ms: dura });
      if (this.sonado.length > 200) this.sonado.shift();
    };
    if (!synth || voces.length === 0) {
      if (!this.sinVoces) {
        this.sinVoces = true;
        this.o.alCambiar();
      }
      anotar("escrita");
      alEmpezar(dura);
      return new Promise<void>((ok) => {
        const reloj = setTimeout(ok, dura);
        alCortar(() => {
          clearTimeout(reloj);
          ok();
        });
      });
    }
    return new Promise<void>((ok) => {
      let hecho = false;
      const terminar = () => {
        if (hecho) return;
        hecho = true;
        clearTimeout(reloj);
        ok();
      };
      const u = new SpeechSynthesisUtterance(f.texto);
      // Una sola voz para todo el resumen (la primera en español, como el respaldo de la Oficina).
      u.voice = voces[0]!;
      u.lang = voces[0]!.lang;
      u.rate = velocidad;
      u.onend = terminar;
      u.onerror = terminar;
      const reloj = setTimeout(terminar, dura * TOPE_NAVEGADOR);
      alCortar(() => {
        try {
          synth.cancel();
        } catch {
          // Sin voces.
        }
        terminar();
      });
      anotar("navegador");
      alEmpezar(dura);
      try {
        synth.cancel();
        synth.speak(u);
      } catch {
        terminar();
      }
    });
  }

  /** Corta lo que suena (cerrar el resumen). */
  parar(): void {
    for (const c of [...this.cortes]) c();
    this.cortes.clear();
    try {
      this.o.audio?.pause();
    } catch {
      // No sonaba.
    }
  }
}
