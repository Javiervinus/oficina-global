// Cuánto mide el hilo de una conversación antes de dibujarlo (JST-172), sin
// DOM: con eso la pareja elige dónde juntarse para que sus 2 globos no le tapen
// la cabeza a nadie que no conversa (JST-162 §2.3 y la restricción del brief
// §7: «el hilo no puede tapar al vecino ni salir del descanso»). Lo mismo para
// los globos de la entrega en la mesa (JST-190): la mesa no se mueve, así que
// suben lo justo para no taparle la cabeza a quien está en el sofá o al lado.
//
// Todo en pixeles de arte, con las medidas de la página a 2x (`estilosVida.ts`:
// la frase en Inter 500 de 4·px + 2 px, hasta 2 líneas; la tarea en una línea
// de 0,9 em, con el código en monoespaciada). A 3x el hilo mide en arte un poco
// menos, así que ahí sobra margen. Los anchos de letra son los de la Inter del
// host (`InterVariable.woff2`) medidos en Chrome a 10 y 14 px (a esos tamaños
// usa su corte para texto, ~9 % más ancho que a 100 px), por grupos y hacia
// arriba.
import type { Punto } from "./caminos.js";
import { lineasDe, tituloDe, type Linea } from "./charlas.js";

/** Caja en pixeles de arte, [x0, y0, x1, y1). */
export type CajaHilo = readonly [number, number, number, number];

export interface TamanoHilo {
  w: number;
  h: number;
}

/** Ancho de cada letra en em (Inter 500); las que no están, 0,68, y los símbolos y emojis, 1,2. */
const GRUPOS: ReadonlyArray<readonly [number, string]> = [
  [0.28, " ijlíìïIÍ"],
  [0.32, ".,;:¡!·'|"],
  [0.34, "ft"],
  [0.4, "()[]/r"],
  [0.42, "1"],
  [0.5, "-\"–"],
  [0.54, "s¿?*"],
  [0.56, "kxz"],
  [0.58, "acvyáàJL"],
  [0.62, "bdeghnopquéèóòúùñü257EÉF«»"],
  [0.68, "0346890BPRSTZ#&+"],
  [0.72, "KXY"],
  [0.76, "ACDGHNUVÁÚÑ♪"],
  [0.78, "OQÓ"],
  [0.84, "w"],
  [0.92, "mM…✓"],
  [1.04, "W%@—→♥♫"],
];
const EM = new Map<string, number>(GRUPOS.flatMap(([w, letras]) => [...letras].map((c) => [c, w] as const)));
const emDe = (c: string): number => EM.get(c) ?? (c.codePointAt(0)! > 0x2000 ? 1.2 : 0.68);

/** Tamaño de la letra del globo a 2x, en pixeles de arte (4·px + 2 px). */
const FUENTE = 5;
const ALTO_LINEA = 1.22;
/** El código de la tarea, en monoespaciada: 0,6 em cada letra. */
const EM_MONO = 0.61;
/** Relleno (1,5·px × 3·px) y borde (1 px) de cada globo, por lado. */
const RELLENO_V = 1.5;
const RELLENO_H = 3;
const BORDE = 0.5;
/** Entre la frase y la tarea (1·px), entre los 2 globos (2·px) y la sangría hacia el otro (8·px). */
const SEP = 1;
const ENTRE = 2;
const SANGRIA = 8;
/** El hilo mide entre 44·px y el ancho del descanso − 4 px (2 de arte a 2x). */
const MIN_W = 44;
const MARGEN_DESCANSO = 2;
/** El borde de abajo del hilo va 6 px (3 de arte a 2x) sobre la cabeza más alta de la pareja. */
export const HILO_SOBRE_CABEZA = 3;
/** Lo que se suma a lo estimado, por si la letra mide un poco más que lo medido. */
const HOLGURA_W = 4;
const HOLGURA_H = 2;

/** Ancho de `t` en Inter 500 de `fuente` px de arte. */
export function anchoTexto(t: string, fuente = FUENTE): number {
  let em = 0;
  for (const c of t) em += emDe(c);
  return em * fuente;
}

/** Ancho y alto de un globo con la frase `l` si su texto puede medir hasta `texto` px. `prev`: la frase anterior (la tarea a 0,85 em). */
function globo(l: Linea, texto: number, prev: boolean): TamanoHilo {
  const lineas = Math.min(2, lineasDe(l.texto, texto, 0, (s) => anchoTexto(s)));
  let w = Math.min(texto, anchoTexto(l.texto));
  let h = 2 * (RELLENO_V + BORDE) + lineas * FUENTE * ALTO_LINEA;
  if (l.codigo) {
    const f = FUENTE * (prev ? 0.85 : 0.9);
    const nombre = tituloDe(l);
    // El código (con «:», en monoespaciada) y el nombre, en una línea como en `GloboFrase` (JST-175): si no cabe, se corta.
    const tarea = (l.codigo.length + (nombre ? 1 : 0)) * EM_MONO * f + (nombre ? anchoTexto(` ${nombre}`, f) : 0);
    w = Math.max(w, Math.min(texto, tarea));
    h += SEP + f * ALTO_LINEA;
  }
  return { w: w + 2 * (RELLENO_H + BORDE), h };
}

/**
 * Lo más grande que llega a medir el hilo de una conversación con estas frases
 * en un descanso de `ancho` px: cada frase abajo y, desde la segunda, la
 * anterior arriba (JST-162 §5.1). Con un poco de holgura.
 */
export function tamanoHilo(lineas: readonly Linea[], ancho: number): TamanoHilo {
  const maxW = Math.max(MIN_W, ancho - MARGEN_DESCANSO);
  const texto = maxW - 2 * (RELLENO_H + BORDE);
  let w = 0;
  let h = 0;
  lineas.forEach((l, i) => {
    const cur = globo(l, texto, false);
    const prev = i > 0 ? globo(lineas[i - 1]!, texto, true) : null;
    w = Math.max(w, cur.w + SANGRIA, prev ? prev.w + SANGRIA : 0);
    h = Math.max(h, cur.h + (prev ? ENTRE + prev.h : 0));
  });
  return { w: Math.min(maxW, Math.max(MIN_W, w)) + HOLGURA_W, h: h + HOLGURA_H };
}

/**
 * Dónde queda el hilo (como `HiloCharla` y el `revisar` del piso): centrado en
 * `centro.x`, corrido entero para no salir del descanso `d` (con 1 px de
 * margen), y con su borde de abajo 3 px sobre `centro.y` (la cabeza más alta).
 */
export function cajaHilo(d: { x: number; w: number }, centro: Punto, t: TamanoHilo): CajaHilo {
  const izq = d.x + 1;
  const der = d.x + d.w - 1;
  let x0 = centro.x - t.w / 2;
  if (x0 < izq) x0 = izq;
  else if (x0 + t.w > der) x0 = Math.max(izq, der - t.w);
  const y1 = centro.y - HILO_SOBRE_CABEZA;
  return [x0, y1 - t.h, x0 + t.w, y1];
}

/** La cabeza de quien tiene los pies en `p`: la mitad de arriba de su dibujo de 16×24 (como la mide la QA). */
export function cabezaDe(p: Punto): CajaHilo {
  return [p.x - 8, p.y - 24, p.x + 8, p.y - 12];
}

/** El hilo en `caja` le tapa (aunque sea un poco) la cabeza a alguno de los que tienen los pies en `otros`. */
export function tapaA(caja: CajaHilo, otros: readonly Punto[]): boolean {
  return otros.some((p) => cruzan(caja, cabezaDe(p)));
}

/** Las dos cajas se tocan (aunque sea un poco). */
export function cruzan(a: CajaHilo, b: CajaHilo): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

// ---------------------------------------------------------------------------
// La entrega en la mesa (JST-190)
// ---------------------------------------------------------------------------

/** Los dos globos de una entrega en la mesa: la frase de quien entrega y el «🤝» de quien recibe. */
export interface CajasEntrega {
  de: CajaHilo;
  a: CajaHilo;
  /** Cuánto se corre la frase hacia la izquierda de donde va siempre (≤ 0) y cuánto sube sola, sobre el «🤝» (JST-214). */
  corre: number;
  encima: number;
}

/** Lo que se suma al ancho estimado de la frase de quien entrega. */
const HOLGURA_ENTREGA = 2;
/** Entre lo que suben los globos de la entrega y lo más alto que tocaban: 2 de arte, porque al aparecer bajan 3 px de pantalla. */
const AIRE_ENTREGA = 2;
/** La frase de quien entrega queda 2 de arte dentro del descanso, de cada lado. */
const MARGEN_ENTREGA = 2;

/**
 * Dónde quedan los globos de una entrega en la mesa (como `GlobosEntrega` y
 * `.of-ent` de `estilosVida.ts`) en el descanso `d` de un piso a escala `k`,
 * sin subir: la frase de quien entrega con los pies en `de` empieza 14 px a
 * su izquierda y crece hacia la derecha hasta el borde del descanso (el código
 * en monoespaciada, la flecha y el nombre de quien recibe); el «🤝», centrado
 * sobre `a`. Los dos miden 6·px + 4 de alto y su borde de abajo va 25 de arte
 * y 6 px sobre los pies.
 *
 * Si hasta el borde no cabe ni el código con la flecha (en la sala acercada
 * del celular, quien entrega queda a 7 de arte de él), la frase se corre hacia
 * adentro lo que falte para decirla entera, pero sin tapar el «🤝», y se corta
 * el nombre con «…»; si así tampoco cabe el código, va encima del «🤝», en todo
 * el ancho del descanso (JST-214). `null` si ni ahí cabe: no se juntan.
 */
export function cajasEntrega(de: Punto, a: Punto, codigo: string, para: string, d: { x: number; w: number }, k: number): CajasEntrega | null {
  const f = 4 + 2 / k;
  const h = 6 + 4 / k;
  const abajo = (p: Punto) => p.y - 25 - 6 / k;
  const ini = d.x + MARGEN_ENTREGA;
  const fin = d.x + d.w - MARGEN_ENTREGA;
  const x0 = de.x - 14 / k;
  const ancho = (nombre: number) => 2 * 2.5 + 2 / k + codigo.length * EM_MONO * f + 4 / k + emDe("→") * f + nombre + HOLGURA_ENTREGA;
  const w = ancho(anchoTexto(para, f));
  // Lo menos que dice: el código y la flecha, con el nombre en «…».
  const minimo = ancho(emDe("…") * f);
  const wa = 2 * 2 + 5 + 2 / k + 2 / k;
  const cajaA: CajaHilo = [a.x - wa / 2, abajo(a) - h, a.x + wa / 2, abajo(a)];
  let x = x0;
  let y1 = abajo(de);
  if (x0 + minimo > fin) {
    const junto = cajaA[2] + AIRE_ENTREGA;
    if (fin - junto >= minimo) x = Math.max(junto, fin - w);
    else if (fin - ini >= minimo) {
      x = Math.max(ini, fin - w);
      y1 = cajaA[1] - AIRE_ENTREGA;
    } else return null;
  }
  return { de: [x, y1 - h, Math.min(fin, x + w), y1], a: cajaA, corre: x - x0, encima: abajo(de) - y1 };
}

/** Las cajas subidas `dy`. */
function subir(c: CajaHilo, dy: number): CajaHilo {
  return [c[0], c[1] - dy, c[2], c[3] - dy];
}

/**
 * Cuánto suben los globos de una entrega (`base`, sin subir) para no taparle
 * la cabeza a nadie más (`otros`: sus pies) ni tocar otras cosas (`cajas`: el
 * hilo de una conversación, tu escritorio): 0 si no hace falta; si no, lo
 * justo para quedar 2 de arte sobre lo que tocaban, los dos a la misma altura.
 * `null` si para eso tendrían que salir de la sala por arriba.
 */
export function altoEntrega(base: CajasEntrega, otros: readonly Punto[], cajas: readonly CajaHilo[] = []): number | null {
  const estorbos = [...otros.map(cabezaDe), ...cajas];
  const libres = (dy: number) => [base.de, base.a].every((c) => !estorbos.some((e) => cruzan(subir(c, dy), e)));
  if (libres(0)) return 0;
  const altos = new Set<number>();
  for (const e of estorbos) for (const c of [base.de, base.a]) if (c[3] > e[1] - AIRE_ENTREGA) altos.add(Math.ceil(c[3] - e[1] + AIRE_ENTREGA));
  for (const dy of [...altos].sort((x, y) => x - y)) {
    if (Math.min(base.de[1], base.a[1]) - dy < 0) return null;
    if (libres(dy)) return dy;
  }
  return null;
}

/** Los globos de la entrega subidos `alto`. */
export function subirEntrega(base: CajasEntrega, alto: number): CajasEntrega {
  return { ...base, de: subir(base.de, alto), a: subir(base.a, alto) };
}
