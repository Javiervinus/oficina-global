// Los globos de estado de una sala no se tapan entre sí ni salen de ella
// (JST-197, punto 4 de la QA de JST-168 y §9 de JST-163: «cabe sin tocar al
// vecino»). En la sala acercada del celular los escritorios van a 72 px de
// pantalla y un globo con «✋ BET-502 +2» mide ~84: los vecinos se tapan y el
// de la orilla se sale. Cada globo se corre lo menos posible hacia el lado y,
// solo si la fila entera no cabe en la sala, uno de cada dos sube un piso.
//
// Sin DOM: recibe las cajas tal como se dibujan (en pixeles de pantalla) y
// devuelve cuánto correr cada una. `Sala.revisar` (piso.tsx) mide y aplica.

/** Caja de un globo en pantalla: izquierda, derecha, arriba y abajo. */
export interface CajaGlobo {
  l: number;
  r: number;
  t: number;
  b: number;
}

/** Cuánto se corre un globo (pixeles de pantalla). */
export interface Corrimiento {
  dx: number;
  dy: number;
}

/**
 * Corre los globos para que entre `izq` y `der` ninguno toque a otro (con
 * `aire` entre ellos). Van por filas: los que se cruzan a lo alto. En cada fila
 * se conserva el orden de izquierda a derecha y se corren lo menos posible
 * (mínimos cuadrados: si dos se tapan en medio de la sala, cada uno se corre la
 * mitad; en la orilla, el de la orilla entra y empuja al vecino). Si la fila no
 * cabe ni así, uno de cada dos sube por encima de los otros.
 */
export function repartirGlobos(cajas: readonly CajaGlobo[], izq: number, der: number, aire: number): Corrimiento[] {
  const res: Corrimiento[] = cajas.map(() => ({ dx: 0, dy: 0 }));
  for (const fila of filasDe(cajas)) {
    const orden = [...fila].sort((a, b) => cajas[a]!.l + cajas[a]!.r - (cajas[b]!.l + cajas[b]!.r) || a - b);
    const total = orden.reduce((s, i) => s + cajas[i]!.r - cajas[i]!.l, 0) + aire * (orden.length - 1);
    if (total <= der - izq) {
      ponerEnLinea(orden, cajas, izq, der, aire, res);
      continue;
    }
    // No cabe: los pares quedan abajo y los impares suben hasta quedar sobre el más alto de abajo.
    const abajo = orden.filter((_, k) => k % 2 === 0);
    const arriba = orden.filter((_, k) => k % 2 === 1);
    const techo = Math.min(...abajo.map((i) => cajas[i]!.t));
    for (const i of arriba) res[i]!.dy = techo - aire - cajas[i]!.b;
    ponerEnLinea(abajo, cajas, izq, der, aire, res);
    ponerEnLinea(arriba, cajas, izq, der, aire, res);
  }
  return res;
}

/** Grupos de globos que se cruzan a lo alto (los únicos que pueden taparse entre sí). */
function filasDe(cajas: readonly CajaGlobo[]): number[][] {
  const orden = cajas.map((_, i) => i).sort((a, b) => cajas[a]!.t - cajas[b]!.t || a - b);
  const filas: number[][] = [];
  let fondo = -Infinity;
  for (const i of orden) {
    const c = cajas[i]!;
    if (filas.length === 0 || c.t >= fondo) {
      filas.push([i]);
      fondo = c.b;
    } else {
      filas[filas.length - 1]!.push(i);
      fondo = Math.max(fondo, c.b);
    }
  }
  return filas;
}

/**
 * Una fila en orden (`orden`), sin taparse y dentro de [izq, der], lo más cerca
 * posible de donde estaban: se juntan en bloques que se empujan (cada bloque,
 * en el promedio de lo que querían sus globos y sin salir de la sala). Si ni
 * así cabe, queda pegada a la izquierda.
 */
function ponerEnLinea(orden: readonly number[], cajas: readonly CajaGlobo[], izq: number, der: number, aire: number, res: Corrimiento[]): void {
  interface Bloque {
    desde: number;
    n: number;
    /** Suma de lo que querría la izquierda del bloque según cada globo. */
    suma: number;
    /** Ancho del bloque, del borde izquierdo del primero al derecho del último. */
    ancho: number;
    x: number;
  }
  const lugar = (b: Bloque) => Math.max(izq, Math.min(b.suma / b.n, der - b.ancho));
  const bloques: Bloque[] = [];
  orden.forEach((i, k) => {
    const c = cajas[i]!;
    let b: Bloque = { desde: k, n: 1, suma: c.l, ancho: c.r - c.l, x: 0 };
    b.x = lugar(b);
    // Mientras toque al bloque de la izquierda, se juntan.
    while (bloques.length > 0) {
      const a = bloques[bloques.length - 1]!;
      if (a.x + a.ancho + aire <= b.x) break;
      bloques.pop();
      const corre = a.ancho + aire;
      b = { desde: a.desde, n: a.n + b.n, suma: a.suma + b.suma - b.n * corre, ancho: corre + b.ancho, x: 0 };
      b.x = lugar(b);
    }
    bloques.push(b);
  });
  for (const b of bloques) {
    let x = b.x;
    for (let k = b.desde; k < b.desde + b.n; k++) {
      const i = orden[k]!;
      const c = cajas[i]!;
      res[i]!.dx = x - c.l;
      x += c.r - c.l + aire;
    }
  }
}
