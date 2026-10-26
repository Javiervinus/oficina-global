// «Te necesito» con la pregunta y «terminé» que no es terminé (0.8.0, JST-241),
// sin React, navegador ni red: los tiempos los ponen quien los usa (la vigía) y
// las pruebas (con relojes de mentira).
//
// - «Te necesito» dice la pregunta breve, y la pregunta recién se sabe cuando
//   sube la mano: el worker la prepara en ese momento (delante en su fila) y
//   tarda 1–3 s con Edge, menos de 2 s con Kokoro y 3–26 s con un clon. La voz
//   la espera fuera de la cola, como «empecé» (JST-194), hasta
//   `ESPERA_PREGUNTA_MS`; si no llega, dice lo de siempre (la frase con la
//   tarea, si está, y el subtítulo con la pregunta). La campanita y el aviso
//   salen al tiro, como antes. Si se responde mientras espera, no dice nada; si
//   el agente va a decir otra frase, sale antes que ella.
// - Una tarea que pasa a revisión y deja una pregunta para ti en esa misma
//   tarea no terminó: te está preguntando algo. «Terminé» espera un poco
//   (`ESPERA_REVISION_MS`) por si llega la tarjeta (el agente la crea antes o
//   después de cambiar el estado, y el feed se relee ~1 s después) y, si
//   llega, dice solo «te necesito» con la pregunta.

/** Lo más que «te necesito» espera su audio con la pregunta, desde que sube la mano. */
export const ESPERA_PREGUNTA_MS = 30_000;
/** Lo que «terminé» de una tarea que pasó a revisión espera a ver si llega una pregunta para ti en esa tarea. */
export const ESPERA_REVISION_MS = 8_000;

export interface EsperaDe {
  itemId: string;
  issueId: string | null;
}

export interface AgenteEsperas {
  id: string;
  teNecesita: readonly EsperaDe[];
}

export interface OpcionesPregunta<A, D> {
  /** Le pide al worker la frase con la pregunta y vuelve cuando está (o cuando ya no vale la pena esperar). */
  esperar: (a: A, dato: D) => Promise<unknown>;
  /** Dice «te necesito» (con la pregunta si su audio llegó; si no, lo de siempre). */
  decir: (a: A, dato: D) => void;
}

interface EsperaPregunta<A, D> {
  a: A;
  itemId: string;
  dato: D;
  reloj: ReturnType<typeof setTimeout>;
}

/** «Te necesito» con la pregunta: espera su audio, como mucho `ESPERA_PREGUNTA_MS`, sin frenar a las demás frases. */
export class PreguntaEnEspera<A extends AgenteEsperas, D> {
  private readonly esperas = new Map<string, EsperaPregunta<A, D>>();

  constructor(private readonly o: OpcionesPregunta<A, D>) {}

  /** Subió la mano por `itemId`: pide el audio y lo dice apenas está (o al plazo). Una anterior del mismo agente sale antes. */
  subio(a: A, itemId: string, dato: D): void {
    this.soltar(a.id);
    const e: EsperaPregunta<A, D> = { a, itemId, dato, reloj: setTimeout(() => this.decir(e), ESPERA_PREGUNTA_MS) };
    this.esperas.set(a.id, e);
    void Promise.resolve()
      .then(() => this.o.esperar(a, dato))
      .catch(() => null)
      .then(() => this.decir(e));
  }

  /**
   * Con cada cambio de la página: si ya le respondiste, no dice nada. `agentes`:
   * los de las empresas cuyo «Te toca» se leyó bien; uno que no está sigue esperando.
   */
  revisar(agentes: readonly A[]): void {
    if (this.esperas.size === 0) return;
    const porId = new Map(agentes.map((a) => [a.id, a]));
    for (const e of [...this.esperas.values()]) {
      const a = porId.get(e.a.id);
      if (a && !a.teNecesita.some((x) => x.itemId === e.itemId)) this.callar(e);
    }
  }

  /** Ese agente va a decir otra frase: su «te necesito», si espera, sale antes. */
  soltar(agenteId: string): void {
    const e = this.esperas.get(agenteId);
    if (e) this.decir(e);
  }

  /** Cuántos «te necesito» esperan (para las pruebas). */
  get esperando(): number {
    return this.esperas.size;
  }

  private callar(e: EsperaPregunta<A, D>): void {
    if (this.esperas.get(e.a.id) !== e) return;
    this.esperas.delete(e.a.id);
    clearTimeout(e.reloj);
  }

  private decir(e: EsperaPregunta<A, D>): void {
    if (this.esperas.get(e.a.id) !== e) return;
    this.callar(e);
    this.o.decir(e.a, e.dato);
  }
}

export interface OpcionesRevision<A extends AgenteEsperas> {
  /** Dice «terminé» de esa tarea. */
  terminar: (a: A, issueId: string, titulo: string | null) => void;
  /** No terminó: dice «te necesito» por la espera de esa misma tarea (`i`: su lugar en `a.teNecesita`). */
  preguntar: (a: A, i: number) => void;
}

interface EsperaRevision<A> {
  a: A;
  issueId: string;
  titulo: string | null;
  reloj: ReturnType<typeof setTimeout>;
}

/**
 * «Terminé» de una tarea que pasó a revisión: si en esa tarea queda algo
 * esperando tu respuesta (una tarjeta, una aprobación, la revisión misma), dice
 * «te necesito» por eso y no «terminé». Lo mira al tiro y, si no hay nada,
 * espera hasta `ESPERA_REVISION_MS` por si llega. A terminada, «terminé» al tiro
 * (no pasa por aquí).
 */
export class FinEnRevision<A extends AgenteEsperas> {
  /** Por agente y tarea. */
  private readonly esperas = new Map<string, EsperaRevision<A>>();

  constructor(private readonly o: OpcionesRevision<A>) {}

  paso(a: A, issueId: string, titulo: string | null): void {
    const clave = `${a.id}|${issueId}`;
    if (this.esperas.has(clave)) return;
    if (this.mirar(a, issueId)) return;
    const e: EsperaRevision<A> = {
      a,
      issueId,
      titulo,
      reloj: setTimeout(() => {
        if (this.esperas.get(clave) !== e) return;
        this.esperas.delete(clave);
        this.o.terminar(e.a, issueId, titulo);
      }, ESPERA_REVISION_MS),
    };
    this.esperas.set(clave, e);
  }

  /** Con cada cambio de la página: si llegó la pregunta en esa tarea, «te necesito» y no «terminé». */
  revisar(agentes: readonly A[]): void {
    if (this.esperas.size === 0) return;
    const porId = new Map(agentes.map((a) => [a.id, a]));
    for (const [clave, e] of [...this.esperas]) {
      const a = porId.get(e.a.id);
      if (!a) continue;
      e.a = a;
      if (this.mirar(a, e.issueId)) {
        clearTimeout(e.reloj);
        this.esperas.delete(clave);
      }
    }
  }

  /** Cuántos «terminé» esperan (para las pruebas). */
  get esperando(): number {
    return this.esperas.size;
  }

  private mirar(a: A, issueId: string): boolean {
    const i = a.teNecesita.findIndex((x) => x.issueId === issueId);
    if (i < 0) return false;
    this.o.preguntar(a, i);
    return true;
  }
}
