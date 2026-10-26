// Las palabras en español que puede usar la IA de Chrome (0.8.1, JST-251), sin
// React ni navegador: la revisión bota una frase si trae una palabra que no está
// («Espero que se solven.»). La lista son 100.000 palabras de los subtítulos en
// español que pasan el corrector de macOS, más las de Chile de
// `generador/palabras/extra.txt`, en un filtro de Bloom (`palabrasFiltro.ts`,
// ~160 KB): una palabra de la lista pasa siempre; una inventada pasa 1 vez de
// cada 100. El filtro se lee la primera vez que se pregunta, no al cargar.
//
// `normalizar` y `hashes` son los de `generador/palabras/armar_palabras.mjs`.
import { BITS, FILTRO, HASHES } from "./palabrasFiltro.js";

/** Como la guarda y la busca el filtro: sin mayúsculas y con las tildes compuestas. */
export const normalizar = (p: string): string => p.normalize("NFC").toLowerCase();

function fnv1a(bytes: Uint8Array, semilla: number): number {
  let h = semilla >>> 0;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h;
}

function mezclar(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Los `k` bits de una palabra (ya normalizada) en un filtro de `m` bits: doble hash de FNV-1a. */
export function hashes(palabra: string, m: number, k: number): number[] {
  const bytes = new TextEncoder().encode(palabra);
  const h1 = mezclar(fnv1a(bytes, 0x811c9dc5));
  const h2 = mezclar(fnv1a(bytes, 0x9747b28c)) | 1;
  const r: number[] = [];
  for (let i = 0; i < k; i++) r.push(((h1 + Math.imul(i, h2)) >>> 0) % m);
  return r;
}

let bits: Uint8Array | null = null;
function filtro(): Uint8Array {
  if (!bits) {
    const b = atob(FILTRO);
    bits = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) bits[i] = b.charCodeAt(i);
  }
  return bits;
}

/** Si la palabra está en la lista (sin importar mayúsculas). */
export function esPalabra(p: string): boolean {
  const f = filtro();
  return hashes(normalizar(p), BITS, HASHES).every((i) => (f[i >>> 3]! & (1 << (i & 7))) !== 0);
}

/** Las palabras de un texto que no están en la lista, sin repetir y como venían. */
export function palabrasRaras(texto: string): string[] {
  const raras: string[] = [];
  for (const w of texto.normalize("NFC").match(/\p{L}+/gu) ?? []) {
    if (!esPalabra(w) && !raras.some((r) => normalizar(r) === normalizar(w))) raras.push(w);
  }
  return raras;
}
