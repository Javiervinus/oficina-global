// Arma `src/ia/palabrasFiltro.ts`, la lista de palabras en español con la que
// la revisión bota lo que la IA de Chrome escribe con palabras que no existen
// («Espero que se solven.», JST-251). Se corre a mano en la Mac (necesita
// `swiftc` y el corrector de macOS en español), no lo carga Paperclip:
//
//   ~/.paperclip/bin/qa-pesado 900 node generador/palabras/armar_palabras.mjs [--lista es_full.txt]
//
// 1. Las palabras de los subtítulos en español de OpenSubtitles 2018, por
//    frecuencia (FrequencyWords de Hermit Dave, contenido CC BY-SA 4.0), con
//    al menos 3 apariciones y solo letras.
// 2. Se quedan las que el corrector de macOS da por buenas (`corrector.swift`):
//    se van las faltas («tambien»), los nombres («john») y lo inventado.
// 3. Las 100.000 más frecuentes, más las de `extra.txt` (las de Chile, etc.).
// 4. Un filtro de Bloom (1 % de falsos positivos, ~120 KB) en base64: una
//    palabra que no está casi nunca pasa; una que está, pasa siempre.
//
// `hashes` y `normalizar` son los mismos de `src/ia/palabras.ts` (la prueba
// `tests/iaPalabras.spec.ts` lo comprueba).
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(AQUI, "../..");
const SALIDA = join(REPO, "src/ia/palabrasFiltro.ts");

/** La lista de frecuencias, fija en un commit para que se pueda rearmar igual. */
export const FUENTE = {
  url: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/es/es_full.txt",
  sha256: "b4794c425f3500c21a0ff9367175e36795a978c928a36670e9ad6ae206fb7728",
};
/** Cuántas palabras de los subtítulos (las más frecuentes que pasan el corrector). */
export const MAX_PALABRAS = 100_000;
/** Apariciones mínimas en los subtítulos: las de 1 o 2 suelen ser faltas («solven» sale 2 veces). */
export const MIN_CUENTA = 3;
/** Falsos positivos del filtro. */
export const FALSOS = 0.01;

/** Como la guarda y la busca el filtro: sin mayúsculas y con las tildes compuestas. */
export const normalizar = (p) => p.normalize("NFC").toLowerCase();

function fnv1a(bytes, semilla) {
  let h = semilla >>> 0;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h;
}
function mezclar(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** Los `k` bits de una palabra (ya normalizada) en un filtro de `m` bits: doble hash de FNV-1a. */
export function hashes(palabra, m, k) {
  const bytes = new TextEncoder().encode(palabra);
  const h1 = mezclar(fnv1a(bytes, 0x811c9dc5));
  const h2 = mezclar(fnv1a(bytes, 0x9747b28c)) | 1;
  const r = [];
  for (let i = 0; i < k; i++) r.push(((h1 + Math.imul(i, h2)) >>> 0) % m);
  return r;
}

/** El filtro de Bloom de estas palabras. */
export function armarFiltro(palabras, falsos = FALSOS) {
  const n = palabras.length;
  const m = Math.ceil((-n * Math.log(falsos)) / Math.LN2 ** 2 / 8) * 8;
  const k = Math.max(1, Math.round((m / n) * Math.LN2));
  const bits = new Uint8Array(m / 8);
  for (const p of palabras) for (const i of hashes(p, m, k)) bits[i >>> 3] |= 1 << (i & 7);
  return { m, k, bits };
}
export const estaEn = (f, p) => hashes(normalizar(p), f.m, f.k).every((i) => (f.bits[i >>> 3] & (1 << (i & 7))) !== 0);

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function lista() {
  const dada = arg("--lista");
  const ruta = dada ?? join(tmpdir(), `es_full-${FUENTE.sha256.slice(0, 12)}.txt`);
  if (!dada && !existsSync(ruta)) {
    console.log(`Bajo ${FUENTE.url}`);
    const r = await fetch(FUENTE.url);
    if (!r.ok) throw new Error(`No pude bajar la lista: ${r.status}`);
    writeFileSync(ruta, Buffer.from(await r.arrayBuffer()));
  }
  const datos = readFileSync(ruta);
  const sha = createHash("sha256").update(datos).digest("hex");
  if (sha !== FUENTE.sha256) console.warn(`Ojo: la lista no es la de siempre (sha256 ${sha}).`);
  return datos.toString("utf8");
}

async function main() {
  const solo = /^[a-záéíóúüñ]+$/;
  const candidatas = [];
  for (const linea of (await lista()).split("\n")) {
    const [p, c] = linea.trim().split(" ");
    if (!p || !c) continue;
    if (Number(c) < MIN_CUENTA) break;
    if (solo.test(p)) candidatas.push(p);
  }
  console.log(`${candidatas.length} candidatas con ${MIN_CUENTA} o más apariciones`);

  const tmp = mkdtempSync(join(tmpdir(), "palabras-"));
  const corrector = join(tmp, "corrector");
  execFileSync("swiftc", ["-O", join(AQUI, "corrector.swift"), "-o", corrector], { stdio: "inherit" });
  const r = spawnSync(corrector, ["es"], { input: candidatas.join("\n") + "\n", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`El corrector falló: ${r.stderr}`);
  const buenas = r.stdout.toString("utf8").split("\n").filter(Boolean);
  console.log(`${buenas.length} pasan el corrector de macOS`);

  const extra = readFileSync(join(AQUI, "extra.txt"), "utf8")
    .split("\n")
    .map((l) => l.replace(/#.*/, ""))
    .flatMap((l) => l.split(/\s+/))
    .filter(Boolean);
  const palabras = [...new Set([...buenas.slice(0, MAX_PALABRAS), ...extra].map(normalizar))];
  const filtro = armarFiltro(palabras);

  // Cuántas de las que el corrector botó pasarían por error (no están en la lista).
  const dentro = new Set(palabras);
  const fuera = candidatas.filter((p) => !dentro.has(p)).slice(0, 50_000);
  const falsas = fuera.filter((p) => estaEn(filtro, p)).length;
  console.log(`${palabras.length} palabras, ${filtro.m} bits, ${filtro.k} hashes; falsos positivos: ${falsas} de ${fuera.length} (${((100 * falsas) / fuera.length).toFixed(2)} %)`);

  const base64 = Buffer.from(filtro.bits).toString("base64");
  const ts = `// Generado por generador/palabras/armar_palabras.mjs (JST-251): no lo edites a mano.
// Las ${MAX_PALABRAS.toLocaleString("es-CL")} palabras más frecuentes de los subtítulos en español de
// OpenSubtitles 2018 (FrequencyWords de Hermit Dave, CC BY-SA 4.0) que pasan el
// corrector de macOS, más las de generador/palabras/extra.txt: ${palabras.length} palabras
// en un filtro de Bloom de ${filtro.m} bits y ${filtro.k} hashes (${(100 * FALSOS).toFixed(0)} % de falsos positivos).
export const BITS = ${filtro.m};
export const HASHES = ${filtro.k};
export const PALABRAS = ${palabras.length};
export const FILTRO = "${base64}";
`;
  writeFileSync(SALIDA, ts);
  console.log(`Escribí ${SALIDA} (${(ts.length / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
