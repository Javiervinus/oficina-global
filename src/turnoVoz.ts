// Una voz a la vez (0.6.0, design-spec de JST-225 §5 y punto 4 del spike de
// JST-224), sin React, navegador ni Node: quién puede hablar ahora.
//
// El orden, de más a menos importante: los 4 avisos, la mascota que tocas, una
// entrega, la conversación preparada y, en un hueco, una frase suelta o la hora.
// - Los avisos pasan primero: cortan lo que se esté leyendo de la oficina (lo
//   que le queda a esa conversación se ve sin voz). Después de un aviso, la
//   próxima conversación espera 10 s. Su cola sigue como hoy (`ColaVoces`).
// - La mascota que tocas suena al tiro y corta lo de la oficina; con un aviso
//   sonando, responde sin voz.
// - Lo demás que llega mientras alguien habla se bota: no queda en cola. La
//   respuesta de la misma entrega («¡Dale!») va dentro de su turno, y la hora
//   puede volver a preguntar hasta 30 s (eso lo lleva quien la pide).
// - Una conversación con voz por minuto como mucho (tarjeta de JST-224), una
//   frase suelta por minuto y, en el TV, una mascota que despierta sola cada
//   5 min.
//
// Hay uno por pestaña. Lo que suena en otra pestaña llega con `ajeno` (la vigía
// y la Oficina pueden estar en pestañas distintas).

export const TOPE_CHARLA_MS = 60_000;
export const TRAS_AVISO_MS = 10_000;
export const TOPE_SUELTA_MS = 60_000;
export const TOPE_MASCOTA_SOLA_MS = 5 * 60_000;
/** La hora espera su audio y el canal libre hasta 30 s después de aparecer en su globo. */
export const ESPERA_HORA_MS = 30_000;

/** Lo de la oficina que puede sonar. */
export type LoOficina = "charla" | "mascota" | "entrega" | "suelta" | "hora";

export interface Ocupa {
  lo: LoOficina;
  /** Quién es: `c:<id>` (una conversación), `e:<id>` (una entrega), `t:<id>`, `m:<mascota>`, `h:<agente>`. */
  clave: string;
  /** Hasta cuándo, como mucho (si nadie avisa que terminó antes). */
  hasta: number;
}

export class TurnoVoz {
  private propio: Ocupa | null = null;
  private deOtra: Ocupa | null = null;
  private aviso = false;
  private finAviso = -Infinity;
  private ultimaCharla = -Infinity;
  private ultimaSuelta = -Infinity;
  private ultimaMascotaSola = -Infinity;

  constructor(private readonly ahora: () => number = Date.now) {}

  /** Algo de la oficina suena (en esta pestaña o en otra). */
  ocupado(): boolean {
    const t = this.ahora();
    return (!!this.propio && t < this.propio.hasta) || (!!this.deOtra && t < this.deOtra.hasta);
  }

  /** Lo que suena en esta pestaña (o `null`). */
  actual(): Ocupa | null {
    return this.propio && this.ahora() < this.propio.hasta ? this.propio : null;
  }

  avisoSonando(): boolean {
    return this.aviso;
  }

  /**
   * Un aviso empieza, espera su turno o suena la campanita (`true`), o ya no
   * queda ninguno (`false`). Al empezar corta lo de la oficina de esta pestaña:
   * devuelve lo que había que callar. Al terminar empieza a contar los 10 s.
   */
  avisos(activo: boolean): Ocupa | null {
    if (activo === this.aviso) return null;
    this.aviso = activo;
    if (!activo) {
      this.finAviso = this.ahora();
      return null;
    }
    const cortado = this.actual();
    this.propio = null;
    return cortado;
  }

  /**
   * Se puede empezar eso ahora. `sola`: una mascota que despierta sola en el
   * TV. `clave`: lo que ya tiene el turno puede seguir (la respuesta de la
   * misma entrega).
   */
  puede(lo: LoOficina, o: { sola?: boolean; clave?: string } = {}): boolean {
    if (this.aviso) return false;
    const t = this.ahora();
    const yaEs = !!o.clave && this.actual()?.clave === o.clave;
    switch (lo) {
      case "mascota":
        // La que tocas corta lo demás; la que despierta sola espera un hueco y sus 5 min.
        return o.sola ? !this.ocupado() && t >= this.ultimaMascotaSola + TOPE_MASCOTA_SOLA_MS : true;
      case "charla":
        return (yaEs || !this.ocupado()) && t >= this.ultimaCharla + TOPE_CHARLA_MS && t >= this.finAviso + TRAS_AVISO_MS;
      case "suelta":
        return !this.ocupado() && t >= this.ultimaSuelta + TOPE_SUELTA_MS;
      case "entrega":
      case "hora":
        return yaEs || !this.ocupado();
    }
  }

  /**
   * Empieza (después de `puede`): toma el turno hasta `hasta`. Devuelve lo que
   * sonaba en esta pestaña y queda callado (lo que corta la mascota que tocas).
   */
  empieza(lo: LoOficina, clave: string, hasta: number, o: { sola?: boolean } = {}): Ocupa | null {
    const t = this.ahora();
    const antes = this.actual();
    this.propio = { lo, clave, hasta };
    if (lo === "charla") this.ultimaCharla = t;
    if (lo === "suelta") this.ultimaSuelta = t;
    if (lo === "mascota" && o.sola) this.ultimaMascotaSola = t;
    return antes && antes.clave !== clave ? antes : null;
  }

  /** Lo que tiene el turno dura más (o menos) de lo pensado. */
  alargar(clave: string, hasta: number): void {
    if (this.propio?.clave === clave) this.propio = { ...this.propio, hasta };
  }

  /** Terminó (o se cortó): suelta el turno si lo tenía. */
  termina(clave: string): void {
    if (this.propio?.clave === clave) this.propio = null;
  }

  /**
   * Lo que suena en otra pestaña (`null`: nada). Una conversación allá también
   * cuenta para el tope de 1 por minuto, desde que empezó (`desde`, con el reloj
   * de las dos: `Date.now`).
   */
  ajeno(o: (Ocupa & { desde?: number }) | null): void {
    this.deOtra = o ? { lo: o.lo, clave: o.clave, hasta: o.hasta } : null;
    if (o?.lo === "charla") this.ultimaCharla = Math.max(this.ultimaCharla, o.desde ?? this.ahora());
  }
}
