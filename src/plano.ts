// Plano del piso de la propuesta A («Piso abierto», design-spec de JST-65 §2,
// §6 y §7), sin React ni DOM: dónde va cada sala, cada escritorio, cada mueble
// y cada asiento de la sala de descanso. Todo en pixeles de arte; la UI los
// multiplica por la escala entera (1x, 2x o 3x).
import MUEBLES from "./ui/assets/muebles.json" with { type: "json" };

export const MURO = 22;
export const PASILLO = 16;
export const BORDE = 8;

/** Medidas de las piezas del atlas de muebles. */
const PIEZAS: Readonly<Record<string, { w: number; h: number }>> = MUEBLES.piezas;

/** Muebles del suelo que no se pisan. La alfombra, el muro y lo colgado (ventana, cuadro, reloj, pizarra) no chocan. */
export const MUEBLES_SOLIDOS: ReadonlySet<string> = new Set(["cafetera", "planta", "planta-grande", "arcade", "pingpong", "estante", "puff", "dispensador", "mesita", "sofa", "sofa-calido"]);

export type Escena = "computador" | "tv" | "celular" | "acercada" | "widget" | "widget-celular";

interface Plan {
  /** Paso horizontal y vertical entre escritorios. */
  px: number;
  py: number;
  /** Paso vertical con el que se calcula el alto de cada fila (el widget usa el de la página). */
  pyFila: number;
  /** Columnas de escritorios por prefijo (§2). */
  columnas: Readonly<Record<string, number>>;
}

const COLUMNAS: Readonly<Record<string, number>> = { BET: 3, ELM: 2, JST: 3, MIG: 4 };
const COLUMNAS_CELULAR: Readonly<Record<string, number>> = { ...COLUMNAS, MIG: 3 };

const PLANES: Readonly<Record<Exclude<Escena, "acercada">, Plan>> = {
  computador: { px: 46, py: 44, pyFila: 44, columnas: COLUMNAS },
  tv: { px: 46, py: 38, pyFila: 38, columnas: COLUMNAS },
  celular: { px: 34, py: 40, pyFila: 40, columnas: COLUMNAS_CELULAR },
  widget: { px: 34, py: 38, pyFila: 44, columnas: COLUMNAS },
  "widget-celular": { px: 34, py: 38, pyFila: 40, columnas: COLUMNAS_CELULAR },
};

/** Escala entera de cada escena (§2). El computador sube a 3x si cabe (`armarPisoComputador`, JST-86). */
export const ESCALA: Readonly<Record<Escena, 1 | 2 | 3>> = {
  computador: 2,
  tv: 3,
  celular: 1,
  acercada: 2,
  widget: 1,
  "widget-celular": 1,
};

/** Columnas de una empresa que no está en la tabla del diseño. */
export function columnasDe(prefijo: string, escena: Escena, agentes: number): number {
  const tabla = escena === "celular" || escena === "widget-celular" || escena === "acercada" ? COLUMNAS_CELULAR : COLUMNAS;
  return tabla[prefijo] ?? Math.min(4, Math.max(2, Math.ceil(agentes / 2)));
}

/** Empresas con baldosas, silla y cuadro propios. Las demás usan las de JSTM en gris (§8, `of-co-none`). */
export const CON_COLOR: readonly string[] = ["BET", "ELM", "JST", "MIG"];

/** Prefijo de los sprites de la empresa (`silla-<pre>`, `cuadro-<pre>`): el suyo o el de JSTM. */
export function spriteDe(prefijo: string): string {
  return CON_COLOR.includes(prefijo) ? prefijo.toLowerCase() : "jst";
}

// ---------------------------------------------------------------------------
// Ancho del piso según la pantalla (§2)
// ---------------------------------------------------------------------------

/** Computador: el contenedor es el ancho de la página sin el menú lateral. */
export function anchoComputador(contenedor: number): number {
  return Math.max(520, Math.min(Math.floor((contenedor - 48) / 2), 640));
}

export function anchoCelular(ventana: number): number {
  return Math.min(ventana - 24, 366);
}

export function anchoWidgetCelular(ventana: number): number {
  return Math.min(ventana - 50, 340);
}

export const ANCHO_WIDGET = 560;
export const ANCHO_TV = 624;

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

export interface Pieza {
  nombre: string;
  x: number;
  y: number;
  z: number;
}

export interface Asiento {
  x: number;
  y: number;
  /** En el sofá (animación `sofa`) o de pie con su taza (`libre`). */
  sofa: boolean;
}

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SalaPlano {
  prefijo: string;
  /** Posición y tamaño de la sala en el piso. */
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  /** Ancho de la zona de escritorios. */
  anchoEscritorios: number;
  /** Esquina del personaje en cada puesto, en el orden de los agentes (relativa a la sala). */
  puestos: Array<{ x: number; y: number }>;
  /** Muebles quietos, relativos a la sala. Las ventanas se nombran `ventana` y la UI elige día o noche. */
  muebles: Pieza[];
  /** Asientos de la sala de descanso, primero los del sofá y después los más cercanos a él. */
  asientos: Asiento[];
  descanso: Caja;
  sofaCalido: boolean;
  /**
   * El rótulo de la sala (JST-138 §3.1): 10 de alto en la franja de alfombra
   * bajo la última fila de escritorios, desde x = 5 hasta el primer mueble del
   * descanso que toque la franja. Es un mueble más: nadie camina por encima.
   * `null` a 1x (ahí va un solo rótulo bajo el piso).
   */
  rotulo: Caja | null;
  /**
   * Tu escritorio (0.5.0, JST-163 §14): la esquina del puesto, como en
   * `puestos`, arriba a la izquierda del descanso, contra el muro. `null` donde
   * no va: el celular (piso y sala acercada) y un descanso de menos de 70.
   */
  escritorio: { x: number; y: number } | null;
  /** Los pies de cada lugar de la fila de tu escritorio, hacia abajo (hasta 3; ninguno sin escritorio). */
  fila: Array<{ x: number; y: number }>;
  /** La mesita del descanso, donde se juntan para una entrega (0.5.0, JST-163 §10). */
  mesa: Caja;
}

export interface PisoPlano {
  escena: Escena;
  escala: 1 | 2 | 3;
  w: number;
  h: number;
  salas: SalaPlano[];
}

export interface EntradaSala {
  prefijo: string;
  agentes: number;
}

function pieza(nombre: string, x: number, y: number, z: number): Pieza {
  return { nombre, x, y, z };
}

function medida(nombre: string): { w: number; h: number } {
  const m = PIEZAS[nombre];
  if (!m) throw new Error(`Falta la pieza ${nombre} en muebles.json`);
  return m;
}

/**
 * Sala de descanso (§7): alfombra con sofá y mesita, cafetera contra el muro,
 * plantas y, si hay espacio, ping-pong y arcade. Devuelve los muebles y los
 * asientos: 2 en el sofá y el resto de pie en una rejilla de 17×16 que evita
 * los muebles, ordenada desde lo más cercano al sofá.
 *
 * Con tu escritorio (0.5.0, `izq`): va arriba a la izquierda en vez de la
 * planta, la alfombra y el sofá empiezan al menos `izq` más a la derecha, y en
 * las cajas de `apartado` (el frente de tu escritorio y tu fila) no hay asientos.
 */
export function salaDescanso(
  x: number,
  y: number,
  w: number,
  h: number,
  opciones: { cafetera: boolean; sofaCalido: boolean; izq?: number; apartado?: ReadonlyArray<readonly [number, number, number, number]> },
): { muebles: Pieza[]; asientos: Asiento[]; mesa: Caja } {
  const muebles: Pieza[] = [];
  const cajas: Array<readonly [number, number, number, number]> = [];
  const poner = (nombre: string, px: number, py: number, solido = true) => {
    const m = medida(nombre);
    muebles.push(pieza(nombre, px, py, py + m.h));
    if (solido) cajas.push([px, py, px + m.w, py + m.h]);
  };
  const izq = opciones.izq ?? 0;
  if (opciones.cafetera && w >= 60) poner("cafetera", x + w - 22, y - 6);
  if (!izq) poner("planta", x + 1, y);
  if (opciones.apartado) cajas.push(...opciones.apartado);
  if (w >= 150) poner("arcade", x + w - 42, y - 8);
  const anchoAlfombra = 60;
  const rx = Math.max(x + Math.max(0, Math.round((w - anchoAlfombra) / 2) - (w >= 90 ? 6 : 0)), x + izq);
  const ry = y + 22;
  if (w >= 66) muebles.push(pieza("alfombra-sala", rx, ry, 1));
  const sx = rx + Math.round((anchoAlfombra - 34) / 2);
  const sy = ry - 2;
  muebles.push(pieza(opciones.sofaCalido ? "sofa-calido" : "sofa", sx, sy, sy + 2));
  cajas.push([sx, sy, sx + 34, sy + 15]);
  poner("mesita", sx + 8, sy + 19);
  if (w >= 110 && h >= 104) poner("pingpong", x + Math.round((w - 40) / 2) + 10, y + h - 26);

  const candidatos: Asiento[] = [];
  for (let cy = y + 4; cy + 24 <= y + h; cy += 16) {
    for (let cx = x + 2; cx + 16 <= x + w; cx += 17) {
      const pie = [cx + 3, cy + 17, cx + 13, cy + 24] as const;
      if (cajas.some((c) => pie[0] < c[2] + 1 && pie[2] > c[0] - 1 && pie[1] < c[3] + 1 && pie[3] > c[1] - 1)) continue;
      if (cy + 24 > sy - 2 && cy < sy + 14 && cx + 16 > sx && cx < sx + 34) continue;
      candidatos.push({ x: cx, y: cy, sofa: false });
    }
  }
  const ccx = sx + 17;
  const ccy = sy + 20;
  const distancia = (a: Asiento) => Math.hypot(a.x + 8 - ccx, (a.y + 20 - ccy) * 1.3);
  candidatos.sort((a, b) => distancia(a) - distancia(b));
  const asientos: Asiento[] = [
    { x: sx + 2, y: sy - 9, sofa: true },
    { x: sx + 16, y: sy - 9, sofa: true },
  ];
  const tomados: Asiento[] = [];
  for (const c of candidatos) {
    if (tomados.some((t) => Math.abs(t.x - c.x) < 16 && Math.abs(t.y - c.y) < 14)) continue;
    tomados.push(c);
    asientos.push(c);
  }
  const mesita = medida("mesita");
  return { muebles, asientos, mesa: { x: sx + 8, y: sy + 19, w: mesita.w, h: mesita.h } };
}

/**
 * El descanso tiene que medir al menos esto para que quepan tu escritorio (30)
 * y, a su derecha, la alfombra con el sofá (60). La spec de JST-163 §14 dice 70,
 * pero entre 70 y 89 la alfombra y el sofá, corridos 30, se salen de la sala
 * (en el prototipo, el sofá de JSTM queda cortado a 1440 × 900): ahí no va.
 */
export const DESCANSO_ESCRITORIO = 90;
/** Tu fila: el primero a 8 de arte del frente de tu escritorio (sus pies, 62 bajo su esquina) y cada uno 13 más atrás. */
const FILA_PRIMERO = 62;
const FILA_PASO = 13;

/**
 * Una sala (§2): muro con ventanas, escritorios sobre la alfombra de la empresa
 * y sala de descanso a la derecha. `conRotulo`: lleva el rótulo de la sala
 * (JST-138 §3.1; a 2x y 3x, no a 1x).
 */
export function armarSala(prefijo: string, agentes: number, x: number, y: number, w: number, h: number, cols: number, px: number, py: number, conRotulo = false, conEscritorio = false): SalaPlano {
  const pre = spriteDe(prefijo);
  const anchoEscritorios = 8 + cols * px;
  const muebles: Pieza[] = [];
  for (let wx = 70; wx + 24 < anchoEscritorios - 4; wx += 56) muebles.push(pieza("ventana", wx, 1, 2));
  if (w - anchoEscritorios > 120) muebles.push(pieza("pizarra", anchoEscritorios + 10, 2, 2));
  muebles.push(pieza(`cuadro-${pre}`, w - 46, 3, 2), pieza("reloj", w - 30, 4, 2));

  const puestos: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < agentes; i++) {
    puestos.push({ x: 8 + (i % cols) * px + Math.round((px - 34) / 2), y: MURO + 14 + Math.floor(i / cols) * py });
  }

  const lx = anchoEscritorios + 6;
  const lw = w - lx - 6;
  const sofaCalido = prefijo === "ELM" || prefijo === "MIG";
  // Tu escritorio (0.5.0, JST-163 §14): arriba a la izquierda del descanso, y tu fila hacia abajo.
  let escritorio: SalaPlano["escritorio"] = null;
  const fila: SalaPlano["fila"] = [];
  let apartado: Array<readonly [number, number, number, number]> | undefined;
  if (conEscritorio && lw >= DESCANSO_ESCRITORIO) {
    const ux = lx + 2;
    const uy = MURO + 4;
    escritorio = { x: ux, y: uy };
    for (let k = 0; k < 3 && uy + FILA_PRIMERO + FILA_PASO * k <= h - 6; k++) fila.push({ x: ux + 16, y: uy + FILA_PRIMERO + FILA_PASO * k });
    apartado = [
      [ux - 1, uy + 13, ux + 29, uy + 29],
      [ux + 6, uy + 30, ux + 26, uy + FILA_PRIMERO + 2 + FILA_PASO * Math.max(0, fila.length - 1)],
    ];
  }
  const descanso = salaDescanso(lx, MURO + 4, lw, h - MURO - 8, { cafetera: lw > 64, sofaCalido, izq: escritorio ? 30 : 0, apartado });
  muebles.push(...descanso.muebles);
  if (lw > 110) muebles.push(pieza("estante", w - 26, MURO - 8, MURO + 18));
  if (lw > 150) muebles.push(pieza("planta-grande", w - 18, h - 30, h), pieza("puff", lx + 4, h - 22, h - 10));
  else if (lw > 90) muebles.push(pieza("dispensador", w - 14, h - 30, h));

  let asientos = descanso.asientos;
  let rotulo: Caja | null = null;
  if (conRotulo) {
    // Hasta el primer mueble del descanso que toque la franja de abajo, con 3 de aire; nunca más angosto que los escritorios.
    let fin = w - 5;
    for (const m of muebles) {
      if (!MUEBLES_SOLIDOS.has(m.nombre)) continue;
      const t = medida(m.nombre);
      if (m.x >= anchoEscritorios - 2 && m.y + t.h > h - 13 && m.y < h) fin = Math.min(fin, m.x - 3);
    }
    fin = Math.max(fin, anchoEscritorios - 4);
    rotulo = { x: 5, y: h - 12, w: fin - 5, h: 10 };
    // Los lugares de pie del descanso que caen en la franja se quitan (hay de sobra).
    asientos = asientos.filter((a) => a.sofa || !(a.x + 12 > 4 && a.x + 4 < fin && a.y + 24 > h - 15));
  }

  return {
    prefijo,
    x,
    y,
    w,
    h,
    cols,
    anchoEscritorios,
    puestos,
    muebles,
    asientos,
    descanso: { x: lx, y: MURO + 4, w: lw, h: h - MURO - 8 },
    sofaCalido,
    rotulo,
    escritorio,
    fila,
    mesa: descanso.mesa,
  };
}

/** Las escenas con tu escritorio (JST-163 §14): la página, el TV y el widget del computador. En el celular no va. */
export function llevaEscritorio(escena: Escena): boolean {
  return escena === "computador" || escena === "tv" || escena === "widget";
}

/**
 * Filas de hasta `porFila` salas, en orden alfabético por prefijo (§2 y §14):
 * el menor número de filas, parejas, y si no da exacto las de arriba llevan
 * una sala más. Con 2 por fila: 4 → 2 + 2 y 5 → 2 + 2 + 1 (la última sola y a
 * lo ancho). Con 3: 5 → 3 + 2, 7 → 3 + 2 + 2.
 */
export function filasDeSalas(salas: readonly EntradaSala[], porFila = 2): EntradaSala[][] {
  const ordenadas = [...salas].sort((a, b) => a.prefijo.localeCompare(b.prefijo));
  const nf = Math.max(1, Math.ceil(ordenadas.length / porFila));
  const base = Math.floor(ordenadas.length / nf);
  const extra = ordenadas.length % nf;
  const filas: EntradaSala[][] = [];
  for (let f = 0, i = 0; f < nf && i < ordenadas.length; f++) {
    const m = base + (f < extra ? 1 : 0);
    filas.push(ordenadas.slice(i, i + m));
    i += m;
  }
  return filas;
}

/**
 * Piso completo (§2) de ancho `w`: filas de salas separadas por un pasillo de
 * 16 y un borde de 8. Lo que sobra de cada fila se reparte entre las salas de
 * descanso en proporción a (agentes + 4).
 */
export function armarPiso(salas: readonly EntradaSala[], w: number, escena: Exclude<Escena, "acercada">): PisoPlano {
  return armarPisoCon(salas, w, escena, PLANES[escena], ESCALA[escena], 2);
}

/**
 * Alto que la página guarda bajo la cabecera además del piso (JST-86): un
 * banner de 44 siempre reservado (el más alto, con el botón «Reintentar» de
 * 28), los 10 que lo separan del piso y 16 abajo para el contorno del piso a
 * 3x (6) y algo de aire. Así la escala no cambia cuando aparece un aviso.
 */
export const RESERVA_PAGINA = 44 + 10 + 16;

/**
 * Piso del computador: la escala entera más grande que cabe, como el TV (§14),
 * entre 3x y 2x. Va a 3x si el piso a 3x cabe entero a lo ancho de la página
 * (con sus márgenes de 24) y a lo alto de lo que queda visible bajo la
 * cabecera (`altoLibre`); si no, a 2x como siempre. El ancho en arte no cambia
 * (`anchoComputador`, hasta 640), así que a 3x hace falta una página de 1968.
 *
 * El piso vacío (mientras se leen las empresas) cabe siempre: se mide con
 * `previas`, las salas de la última vez, y sin ellas queda a 2x (JST-89). Así
 * la escala del primer cuadro es la misma que cuando llegan las salas.
 */
export function armarPisoComputador(salas: readonly EntradaSala[], contenedor: number, altoLibre: number, previas: readonly EntradaSala[] = []): PisoPlano {
  const piso = armarPiso(salas, anchoComputador(contenedor), "computador");
  const medido = salas.length > 0 ? piso : previas.length > 0 ? armarPiso(previas, piso.w, "computador") : null;
  const cabe = medido !== null && piso.w * 3 <= contenedor - 48 && medido.h * 3 + RESERVA_PAGINA <= altoLibre;
  return cabe ? { ...piso, escala: 3 } : piso;
}

/** Alto del lienzo del TV que queda para el piso: 1080 − 113 de cabecera − 46 reservados para un banner (§14). */
export const ALTO_PISO_TV = 1080 - 113 - 46;

/** Escalas del TV, de mayor a menor (§14, JST-77 · 2A): gana la primera cuyo piso cabe en `ALTO_PISO_TV`. */
const OPCIONES_TV: ReadonlyArray<{ escala: 1 | 2 | 3; porFila: number; w: number; py: number }> = [
  { escala: 3, porFila: 2, w: ANCHO_TV, py: 38 },
  { escala: 2, porFila: 3, w: 936, py: 44 },
  { escala: 1, porFila: 4, w: 1872, py: 44 },
];

/**
 * Piso del modo TV: la escala entera más grande que cabe, medida sin el banner
 * (su lugar queda siempre reservado, así la escala no cambia cuando aparece un
 * aviso). Hoy, con 4 empresas, 3x; con 5, 2x en filas de 3; si ni así cabe, 1x.
 * El piso vacío se mide con `previas`, como en el computador (JST-89).
 */
export function armarPisoTv(salas: readonly EntradaSala[], previas: readonly EntradaSala[] = []): PisoPlano {
  const medidas = salas.length > 0 ? salas : previas;
  const con = (lista: readonly EntradaSala[], op: (typeof OPCIONES_TV)[number]) =>
    armarPisoCon(lista, op.w, "tv", { ...PLANES.tv, py: op.py, pyFila: op.py }, op.escala, op.porFila);
  const op = OPCIONES_TV.find((o) => con(medidas, o).h * o.escala <= ALTO_PISO_TV) ?? OPCIONES_TV[OPCIONES_TV.length - 1]!;
  return con(salas, op);
}

function armarPisoCon(salas: readonly EntradaSala[], w: number, escena: Exclude<Escena, "acercada">, plan: Plan, escala: 1 | 2 | 3, porFila: number): PisoPlano {
  const filas = filasDeSalas(salas, porFila);
  const cols = (s: EntradaSala) => plan.columnas[s.prefijo] ?? columnasDe(s.prefijo, escena, s.agentes);
  const altos = filas.map((fila) => {
    const maxFilas = Math.max(1, ...fila.map((s) => Math.ceil(s.agentes / cols(s))));
    return MURO + 14 + maxFilas * plan.pyFila + 6;
  });
  const h = BORDE * 2 + altos.reduce((a, b) => a + b, 0) + PASILLO * Math.max(0, filas.length - 1);
  const resultado: SalaPlano[] = [];
  let y = BORDE;
  filas.forEach((fila, fi) => {
    const escritorios = fila.map((s) => 8 + cols(s) * plan.px);
    const sobra = w - BORDE * 2 - PASILLO * (fila.length - 1) - escritorios.reduce((a, b) => a + b, 0);
    const pesoTotal = fila.reduce((a, s) => a + s.agentes + 4, 0);
    let x = BORDE;
    fila.forEach((s, ci) => {
      const descanso = Math.round((sobra * (s.agentes + 4)) / pesoTotal);
      const ancho = escritorios[ci]! + descanso;
      resultado.push(armarSala(s.prefijo, s.agentes, x, y, ancho, altos[fi]!, cols(s), plan.px, plan.py, escala > 1, llevaEscritorio(escena)));
      x += ancho + PASILLO;
    });
    y += altos[fi]! + PASILLO;
  });
  return { escena, escala, w, h, salas: resultado };
}

/** Sala acercada del celular (§2 y §10): la mitad del ancho del piso, a 2x, con paso 36 × 42. */
export function armarSalaAcercada(sala: EntradaSala, anchoPiso: number): PisoPlano {
  const cols = columnasDe(sala.prefijo, "acercada", sala.agentes);
  const w = Math.floor(anchoPiso / 2);
  const filas = Math.max(1, Math.ceil(sala.agentes / cols));
  const h = MURO + 14 + filas * 42 + 12;
  return { escena: "acercada", escala: 2, w, h, salas: [armarSala(sala.prefijo, sala.agentes, 0, 0, w, h, cols, 36, 42, true)] };
}
