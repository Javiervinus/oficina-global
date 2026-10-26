// El lector del Resumen (0.9.0, design-spec de JST-245 §4 y §8), sin React ni
// navegador: qué frase suena, en qué parte va, la pausa, los saltos, la
// velocidad y cuándo una parte espera a la IA. La voz (Lorenzo, la del
// navegador o ninguna) y los relojes llegan de afuera (`DepsLector`).
//
// - Una frase a la vez. Entre una y otra, 250 ms de silencio; 600 ms al cambiar
//   de parte.
// - Cada parte se fija al llegar a ella: lo que escribió la IA si ya está (y
//   pasó la revisión) y su primer audio también, o las frases armadas. Entre
//   una frase y la siguiente hay como mucho 4 s de silencio (JST-257): a la IA
//   y a su audio se les espera `ESPERA_IA_MS` contados desde que terminó la
//   frase anterior (con la pausa entre partes); después van las armadas, sin
//   avisar, y su primer audio ya está pedido (se pide junto con la frase
//   anterior mientras la IA escribe).
// - Una parte sin sus datos todavía (lo terminado, mientras se sube hasta el
//   pedido de origen) espera sus datos.
// - Pausar y seguir repite la frase desde el principio. «Parte anterior» vuelve
//   al principio de la parte (en sus primeros 1,5 s, a la anterior);
//   «siguiente» salta a la próxima (en la última, termina).
// - Cuánto se escuchó (para «Lo nuevo», §9) es lo que de verdad sonó de cada
//   frase, no hasta dónde se llegó: saltar hasta el final no cuenta (JST-261).
import { duracionFrase, type FraseResumen, type Seccion } from "./frases.js";

export type FaseLector = "off" | "armando" | "leyendo" | "espera" | "pausa" | "fin";
export const VELOCIDADES = [1, 1.25, 1.5] as const;
export const PAUSA_FRASES_MS = 250;
export const PAUSA_PARTES_MS = 600;
/** Lo más que se calla entre una frase y la siguiente cuando una parte espera a la IA (QA de la 0.9.0, punto 5). */
export const SILENCIO_MAX_MS = 4_000;
/**
 * Lo más que se espera, desde que terminó la frase anterior, a una parte que la
 * IA todavía escribe y al audio de su primera frase (§3.4). Lo que falta para
 * los 4 s es para que empiece la armada (su audio ya está bajado).
 */
export const ESPERA_IA_MS = 3_400;
/** Cuánto se espera el audio de lo que escribió la IA si llegó mientras suena la frase anterior. */
export const PREPARAR_ANTES_MS = 8_000;
/** «Parte anterior» en los primeros 1,5 s de una parte va a la anterior (§4). */
export const VOLVER_MS = 1_500;
/** «Lo nuevo» cuenta desde un resumen si se oyó al menos esta parte de él (§9). */
export const MITAD = 0.5;

export interface Pos {
  s: number;
  k: number;
}

export interface SeccionLector {
  sec: Seccion;
  /** Las frases armadas (`null`: todavía faltan sus datos). */
  armadas: FraseResumen[] | null;
  /** Lo que escribió la IA y pasó la revisión: `null` mientras escribe; `false` si no va (no hay IA, falló o se demoró). */
  ia: FraseResumen[] | null | false;
  /** Lo que se lee: se fija al llegar a la parte. */
  usadas: FraseResumen[] | null;
  /** La IA llegó a tiempo pero el audio de su primera frase no: fueron las armadas (JST-257). */
  audioTarde?: boolean;
}

/** Una frase que suena: termina sola (`fin`) o se corta. */
export interface Habla {
  fin: Promise<void>;
  cortar(): void;
}

export interface VozLector {
  /**
   * Dice la frase a esa velocidad. `alEmpezar`: cuando empieza a sonar, con lo
   * que dura (ms, ya con la velocidad) si se sabe. `siguen`: las que vienen y ya
   * se saben, para pedir sus audios junto con el de esta.
   */
  decir(f: FraseResumen, velocidad: number, alEmpezar: (ms: number | null) => void, siguen: readonly FraseResumen[]): Habla;
  /**
   * Pide el audio de una frase que todavía no suena (lo primero que escribió la
   * IA de una parte) y dice si estará para decirla al tiro dentro de `ms`
   * (`true` también si esta voz no necesita audio). Sin este método, la frase
   * se da por lista.
   */
  preparar?(f: FraseResumen, ms: number): boolean | Promise<boolean>;
  /** Se cerró el resumen: corta todo. */
  parar?(): void;
}

export interface DepsLector {
  voz: VozLector;
  ahora(): number;
  /** Corre `fn` en `ms`; devuelve cómo cancelarlo. */
  programar(fn: () => void, ms: number): () => void;
  /** Algo cambió (para volver a dibujar). */
  alCambiar(): void;
}

export class Lector {
  fase: FaseLector = "off";
  secciones: SeccionLector[] = [];
  pos: Pos = { s: 0, k: 0 };
  velocidad = 1;
  conIa = false;
  /** Cuándo empezó a sonar la frase actual y cuánto dura (el avance de su tramo). En pausa, cuánto llevaba. */
  sonando: { desde: number; ms: number } | null = null;
  pausadaEn: number | null = null;
  private habla: Habla | null = null;
  private cancelar: (() => void) | null = null;
  /** Sube con cada frase o corte: lo que llega tarde de una frase anterior no hace nada. */
  private vuelta = 0;
  /** Desde cuándo calla: cuando terminó la frase anterior (o se llegó a la parte, si no sonaba nada). */
  private esperaDesde: number | null = null;
  /** El audio de lo primero que escribió la IA de una parte, mientras se pide (`listo`: `null` hasta que se sabe). */
  private preparando: { S: SeccionLector; listo: boolean | null } | null = null;
  private inicioParte = 0;
  /** Cuánto sonó de cada frase («s:k» → 0 a 1, lo más que llegó): lo repetido no suma dos veces. */
  private readonly oidas = new Map<string, number>();
  /** La frase que suena: desde cuándo suena de verdad (`null` mientras espera su audio) y lo que dura a esa velocidad. */
  private oyendo: { clave: string; desde: number | null; ms: number } | null = null;

  constructor(private readonly d: DepsLector) {}

  /** Empieza un resumen nuevo con esas partes (sin sus frases todavía). `conIa`: la IA escribe todo menos los números. */
  empezar(secs: readonly Seccion[], conIa: boolean): void {
    this.cortar();
    this.oidas.clear();
    this.conIa = conIa;
    this.secciones = secs.map((sec) => ({ sec, armadas: null, ia: conIa && sec !== "intro" ? null : false, usadas: null }));
    this.pos = { s: 0, k: 0 };
    this.velocidad = this.velocidad || 1;
    this.fase = "armando";
    this.esperaDesde = null;
    this.preparando = null;
    this.avanzar();
  }

  /** Las frases armadas de una parte (llegan sus datos). */
  fijarArmadas(sec: Seccion, frases: readonly FraseResumen[]): void {
    const S = this.secciones.find((x) => x.sec === sec);
    if (!S || S.armadas) return;
    S.armadas = [...frases];
    this.alLlegar(S);
  }

  /** Lo que escribió la IA de una parte (`false`: no va). Si ya se leyó esa parte, no cambia nada. */
  fijarIa(sec: Seccion, frases: readonly FraseResumen[] | false): void {
    const S = this.secciones.find((x) => x.sec === sec);
    if (!S || S.ia !== null) return;
    S.ia = frases === false || frases.length === 0 ? false : [...frases];
    // Llegó mientras suena la última frase antes de esa parte: su primer audio se pide ya (JST-257).
    if (S.ia && !S.usadas && this.fase === "leyendo" && this.proximas(1)[0] === S.ia[0]) void this.d.voz.preparar?.(S.ia[0]!, PREPARAR_ANTES_MS);
    this.alLlegar(S);
  }

  private alLlegar(S: SeccionLector): void {
    const actual = this.secciones[this.pos.s];
    if (actual === S && (this.fase === "armando" || this.fase === "espera")) this.avanzar();
    else this.d.alCambiar();
  }

  activo(): boolean {
    return this.fase === "armando" || this.fase === "leyendo" || this.fase === "espera";
  }

  /** La frase que suena (o la que se repite al seguir); `null` mientras se arma o se espera una parte. */
  actual(): FraseResumen | null {
    if (this.fase === "off" || this.fase === "fin" || this.fase === "armando") return null;
    return this.secciones[this.pos.s]?.usadas?.[this.pos.k] ?? null;
  }

  /** La parte en la que va (aunque espere a la IA o a sus datos). */
  seccionActual(): SeccionLector | null {
    return this.fase === "off" || this.fase === "fin" ? null : (this.secciones[this.pos.s] ?? null);
  }

  /** Lo que se ve de una parte: lo que se lee, o lo que se va a leer; `null` si la IA todavía la escribe (esqueleto) o faltan datos. */
  previa(s: number): FraseResumen[] | null {
    const S = this.secciones[s];
    if (!S) return null;
    if (S.usadas) return S.usadas;
    if (S.ia) return S.ia;
    if (S.ia === null) return null;
    return S.armadas;
  }

  /** Lo que dura cada parte, estimado (el ancho de su tramo en el avance). Sin frases todavía, ~4 s. */
  duraciones(): number[] {
    return this.secciones.map((_, s) => {
      const fr = this.previa(s) ?? this.secciones[s]!.armadas;
      return fr && fr.length ? fr.reduce((t, f) => t + duracionFrase(f.texto), 0) : 4_000;
    });
  }

  /**
   * Cuánto del resumen se oyó de verdad (0 a 1, por lo que dura cada frase a
   * 1×): de cada frase, lo más que llegó a sonar, también la que suena ahora.
   * Saltar o tocar otra frase no suma lo que se pasó de largo (JST-261). Una
   * parte vacía no cuenta; una que todavía no tiene frases, ~4 s.
   */
  oido(): number {
    let total = 0;
    let oido = 0;
    const ahora = this.oyendo && this.habla ? this.parteOida(this.oyendo) : 0;
    this.secciones.forEach((S, s) => {
      const fr = this.previa(s) ?? S.armadas;
      if (!fr) {
        total += 4_000;
        return;
      }
      fr.forEach((f, k) => {
        const d = duracionFrase(f.texto);
        const clave = `${s}:${k}`;
        total += d;
        if (S.usadas) oido += d * Math.max(this.oidas.get(clave) ?? 0, this.oyendo?.clave === clave ? ahora : 0);
      });
    });
    return total > 0 ? Math.min(1, oido / total) : 0;
  }

  /** Se oyó al menos la mitad: «Lo nuevo» cuenta desde este resumen (§9). */
  escuchado(): boolean {
    return this.oido() >= MITAD;
  }

  /** Cuánto lleva sonando esa frase (0 a 1); `null` en `desde` es que su audio todavía no empieza. */
  private parteOida(o: { desde: number | null; ms: number }): number {
    if (o.desde === null) return 0;
    return o.ms > 0 ? Math.max(0, Math.min(1, (this.d.ahora() - o.desde) / o.ms)) : 1;
  }

  /** Anota lo que sonó de la frase que sonaba (`parte`: 1 si terminó sola). */
  private anotarOida(parte: number): void {
    const o = this.oyendo;
    if (!o) return;
    this.oyendo = null;
    if (parte > (this.oidas.get(o.clave) ?? 0)) this.oidas.set(o.clave, parte);
  }

  /** «Listo · 1:02»: lo que dura todo lo leído (estimado, a 1×). */
  duracionTotal(): number {
    return this.secciones.reduce((t, S) => t + (S.usadas ?? S.armadas ?? []).reduce((u, f) => u + duracionFrase(f.texto), 0), 0);
  }

  private avisar(): void {
    this.d.alCambiar();
  }

  private limpiarReloj(): void {
    this.cancelar?.();
    this.cancelar = null;
  }

  /** Corta lo que suena y lo que estaba programado. */
  private cortar(): void {
    this.vuelta += 1;
    this.limpiarReloj();
    const h = this.habla;
    this.habla = null;
    if (h && this.oyendo) this.anotarOida(this.parteOida(this.oyendo));
    h?.cortar();
  }

  /** Intenta leer la frase de `pos`: fija su parte si hace falta, o espera. */
  private avanzar(): void {
    this.limpiarReloj();
    const S = this.secciones[this.pos.s];
    if (!S) {
      this.terminar();
      return;
    }
    let fr = S.usadas;
    if (!fr) {
      if (!S.armadas) {
        this.fase = this.pos.s === 0 && this.pos.k === 0 && this.fase === "armando" ? "armando" : "espera";
        this.avisar();
        return;
      }
      fr = this.fijarParte(S);
      if (!fr) return;
    }
    if (this.pos.k >= fr.length) {
      this.pos = { s: this.pos.s + 1, k: 0 };
      this.avanzar();
      return;
    }
    this.decirActual();
  }

  /**
   * Fija lo que se lee de una parte que ya tiene sus armadas (JST-257): lo de la
   * IA si llegó y el audio de su primera frase también, dentro de `ESPERA_IA_MS`
   * desde que calla; si no, las armadas. `null` mientras espera.
   */
  private fijarParte(S: SeccionLector): FraseResumen[] | null {
    const t = this.d.ahora();
    if (this.esperaDesde === null) this.esperaDesde = t;
    const resta = ESPERA_IA_MS - (t - this.esperaDesde);
    // Se demoró, o no hay nada que leer (la IA escribe a partir de las armadas): van las armadas, y lo que llegue después de la IA no cambia nada.
    if (S.ia === null && (resta <= 0 || S.armadas!.length === 0)) S.ia = false;
    let usar = S.ia !== null;
    if (S.ia) {
      const listo = this.audioIa(S, S.ia, resta);
      if (listo === null && resta > 0) usar = false;
      else if (listo !== true) S.audioTarde = true;
    }
    if (!usar) return this.esperar(resta);
    S.usadas = S.ia && !S.audioTarde ? S.ia : S.armadas!;
    this.preparando = null;
    return S.usadas;
  }

  /** Si el audio de la primera frase de la IA está para decirla al tiro: `true`, `false` (no llega o no se pudo) o `null` (se pidió y se espera). */
  private audioIa(S: SeccionLector, ia: FraseResumen[], resta: number): boolean | null {
    const p = this.preparando;
    if (p?.S === S) return p.listo;
    if (!this.d.voz.preparar) return true;
    const r = this.d.voz.preparar(ia[0]!, Math.max(0, resta));
    if (typeof r === "boolean") return r;
    if (resta <= 0) return false;
    const estado: { S: SeccionLector; listo: boolean | null } = { S, listo: null };
    this.preparando = estado;
    void r
      .catch(() => false)
      .then((ok) => {
        if (this.preparando !== estado) return;
        estado.listo = ok;
        if (this.secciones[this.pos.s] === S && !S.usadas && this.fase === "espera") this.avanzar();
      });
    return null;
  }

  /** Espera a la IA o a su audio, como mucho `ms` (después se vuelve a mirar). */
  private esperar(ms: number): null {
    this.fase = "espera";
    const v = this.vuelta;
    this.cancelar = this.d.programar(() => {
      if (v === this.vuelta) this.avanzar();
    }, Math.max(0, ms));
    this.avisar();
    return null;
  }

  private decirActual(): void {
    const S = this.secciones[this.pos.s]!;
    const f = S.usadas![this.pos.k]!;
    this.vuelta += 1;
    const v = this.vuelta;
    const t = this.d.ahora();
    this.fase = "leyendo";
    this.pausadaEn = null;
    this.esperaDesde = null;
    if (this.pos.k === 0) this.inicioParte = t;
    this.sonando = { desde: t, ms: duracionFrase(f.texto, this.velocidad) };
    // Lo que se oye cuenta desde que su audio empieza a sonar, no mientras se espera.
    const oyendo: { clave: string; desde: number | null; ms: number } = { clave: `${this.pos.s}:${this.pos.k}`, desde: null, ms: this.sonando.ms };
    this.oyendo = oyendo;
    const h = this.d.voz.decir(
      f,
      this.velocidad,
      (ms) => {
        if (v !== this.vuelta) return;
        this.sonando = { desde: this.d.ahora(), ms: ms ?? duracionFrase(f.texto, this.velocidad) };
        oyendo.desde = this.sonando.desde;
        oyendo.ms = this.sonando.ms;
        this.avisar();
      },
      this.proximas(2),
    );
    this.habla = h;
    this.avisar();
    void h.fin.then(() => {
      if (v !== this.vuelta || this.fase !== "leyendo") return;
      this.habla = null;
      // Terminó sola: se oyó entera (si alcanzó a sonar).
      this.anotarOida(oyendo.desde !== null ? 1 : 0);
      const sig = this.siguiente(this.pos);
      const pausa = sig.s !== this.pos.s ? PAUSA_PARTES_MS : PAUSA_FRASES_MS;
      // El silencio hasta la próxima frase cuenta desde aquí, con la pausa (JST-257).
      this.esperaDesde = this.d.ahora();
      this.cancelar = this.d.programar(() => {
        if (v !== this.vuelta) return;
        this.pos = sig;
        this.avanzar();
      }, pausa);
    });
  }

  /** La posición que sigue (la próxima frase o el comienzo de la próxima parte). */
  private siguiente(p: Pos): Pos {
    const fr = this.secciones[p.s]?.usadas ?? [];
    return p.k + 1 < fr.length ? { s: p.s, k: p.k + 1 } : { s: p.s + 1, k: 0 };
  }

  /**
   * Las frases que vienen después de la actual y ya se saben (para pedir sus
   * audios). De una parte que la IA todavía escribe, la primera armada, que va
   * si la IA no llega a tiempo (JST-257); lo que sigue no se sabe.
   */
  proximas(n: number): FraseResumen[] {
    const r: FraseResumen[] = [];
    let p = this.siguiente(this.pos);
    while (r.length < n && p.s < this.secciones.length) {
      const S = this.secciones[p.s]!;
      const fr = S.usadas ?? (S.ia || S.armadas);
      if (!fr) break;
      const f = fr[p.k];
      if (!f) {
        p = { s: p.s + 1, k: 0 };
        continue;
      }
      r.push(f);
      if (!S.usadas && S.ia === null) break;
      p = p.k + 1 < fr.length ? { s: p.s, k: p.k + 1 } : { s: p.s + 1, k: 0 };
    }
    return r;
  }

  pausar(): void {
    if (!this.activo()) return;
    const s = this.sonando;
    this.cortar();
    this.pausadaEn = s ? Math.max(0, this.d.ahora() - s.desde) : null;
    this.fase = "pausa";
    this.avisar();
  }

  /** Sigue desde el principio de la frase (§4). Terminado, vuelve a leer todo. */
  seguir(): void {
    if (this.fase === "fin") {
      this.otraVez();
      return;
    }
    if (this.fase !== "pausa") return;
    this.avanzar();
  }

  alternar(): void {
    if (this.activo()) this.pausar();
    else this.seguir();
  }

  /** Lee desde esa frase (tocar una frase en «Texto»). Una parte que todavía no se fijó se fija ahí. */
  ir(p: Pos): void {
    if (this.fase === "off") return;
    const S = this.secciones[p.s];
    if (!S) return;
    this.cortar();
    if (!S.usadas && S.armadas && S.ia !== null) S.usadas = S.ia || S.armadas;
    if (!S.usadas && S.armadas && S.ia === null) {
      // Al tocarla no se espera a la IA: va lo que hay.
      S.ia = false;
      S.usadas = S.armadas;
    }
    this.pos = { s: p.s, k: Math.max(0, S.usadas ? Math.min(p.k, S.usadas.length - 1) : 0) };
    this.esperaDesde = null;
    this.preparando = null;
    this.avanzar();
  }

  /** «Parte anterior» (−1) y «siguiente» (+1), §4. */
  saltar(dir: 1 | -1): void {
    if (this.fase === "off" || this.fase === "fin") return;
    if (dir > 0) {
      if (this.pos.s + 1 >= this.secciones.length) {
        this.cortar();
        this.terminar();
        return;
      }
      this.ir({ s: this.pos.s + 1, k: 0 });
      return;
    }
    const enElComienzo = this.pos.k === 0 && this.d.ahora() - this.inicioParte < VOLVER_MS;
    this.ir({ s: enElComienzo ? Math.max(0, this.pos.s - 1) : this.pos.s, k: 0 });
  }

  /** 1× → 1,25× → 1,5×: la frase vuelve a empezar (§4). */
  cambiarVelocidad(): void {
    const i = VELOCIDADES.indexOf(this.velocidad as (typeof VELOCIDADES)[number]);
    this.velocidad = VELOCIDADES[(i + 1) % VELOCIDADES.length]!;
    if (this.fase === "leyendo") this.ir(this.pos);
    else this.avisar();
  }

  /** «Otra vez» (§8): desde el principio, con las mismas frases. */
  otraVez(): void {
    if (this.secciones.length === 0) return;
    this.cortar();
    this.pos = { s: 0, k: 0 };
    this.fase = "espera";
    this.avanzar();
  }

  private terminar(): void {
    this.limpiarReloj();
    this.fase = "fin";
    this.sonando = null;
    this.pos = { s: this.secciones.length, k: 0 };
    this.avisar();
  }

  /** Cierra el resumen: corta la voz y quita el reproductor. */
  cerrar(): void {
    this.cortar();
    this.d.voz.parar?.();
    this.fase = "off";
    this.sonando = null;
    this.avisar();
  }
}
