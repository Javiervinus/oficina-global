// «Empecé» con la tarea (JST-194, del QA de JST-168): «Diseño, de JSTM:
// empecé. QA de Oficina global con las 4 empresas.»
//
// Es la única frase que se dice apenas el agente empieza: el worker la prepara
// en ese mismo momento (o un poco antes, si el run estuvo en cola) y Edge tarda
// 3–5 s (8–14 s con la Mac cargada) y Kokoro algo más. Con la espera de siempre
// (2,5 s) casi nunca estaba, y además el nombre de la tarea a veces todavía no
// se había leído. Por eso, con «la tarea» prendida, «empecé» espera fuera de la
// cola de las voces (las demás frases siguen):
// - al nombre de la tarea, si todavía no se sabe, y después a que el worker
//   tenga el audio;
// - como mucho `ESPERA_EMPECE_MS` desde que empezó (si no, la frase de siempre);
// - sale al tiro si el agente deja esa tarea o si va a decir otra frase (así
//   «empecé» va antes que su «terminé»).

/** Lo más que «empecé» espera su audio con la tarea, desde que se le pidió al worker (y desde que empezó). */
export const ESPERA_EMPECE_MS = 20_000;

export interface AgenteEmpece {
  id: string;
  run: { issueId: string | null; titulo: string | null } | null;
}

export interface OpcionesEmpece<A extends AgenteEmpece> {
  /** Le pide al worker la frase de ese agente con esa tarea y vuelve cuando está (o cuando ya no vale la pena esperar). */
  esperar: (a: A, tarea: string) => Promise<unknown>;
  /** Dice «empecé», con la tarea si se supo. */
  decir: (a: A, tarea: string | null) => void;
}

interface Espera<A> {
  a: A;
  issueId: string | null;
  tarea: string | null;
  reloj: ReturnType<typeof setTimeout>;
}

export class EmpeceEnEspera<A extends AgenteEmpece> {
  private readonly esperas = new Map<string, Espera<A>>();

  constructor(private readonly o: OpcionesEmpece<A>) {}

  /** Un agente empezó una tarea: su «empecé» espera el nombre y el audio. */
  empezo(a: A): void {
    this.soltar(a.id);
    const e: Espera<A> = { a, issueId: a.run?.issueId ?? null, tarea: null, reloj: setTimeout(() => this.decir(e), ESPERA_EMPECE_MS) };
    this.esperas.set(a.id, e);
    this.mirar(e, a);
  }

  /** Con cada cambio de la página: si ya se sabe el nombre, pide el audio; si dejó la tarea, «empecé» sale al tiro. */
  revisar(agentes: readonly A[]): void {
    if (this.esperas.size === 0) return;
    const porId = new Map(agentes.map((a) => [a.id, a]));
    for (const e of [...this.esperas.values()]) {
      const a = porId.get(e.a.id);
      if (!a || (a.run?.issueId ?? null) !== e.issueId) this.decir(e);
      else this.mirar(e, a);
    }
  }

  /** Ese agente va a decir otra frase: su «empecé», si espera, sale antes. */
  soltar(agenteId: string): void {
    const e = this.esperas.get(agenteId);
    if (e) this.decir(e);
  }

  /** Cuántos «empecé» esperan (para las pruebas). */
  get esperando(): number {
    return this.esperas.size;
  }

  private mirar(e: Espera<A>, a: A): void {
    const tarea = a.run?.titulo;
    if (e.tarea || !tarea) return;
    e.a = a;
    e.tarea = tarea;
    void this.o
      .esperar(a, tarea)
      .catch(() => null)
      .then(() => this.decir(e));
  }

  private decir(e: Espera<A>): void {
    if (this.esperas.get(e.a.id) !== e) return;
    this.esperas.delete(e.a.id);
    clearTimeout(e.reloj);
    this.o.decir(e.a, e.tarea);
  }
}
