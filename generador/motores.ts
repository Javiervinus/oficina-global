// Los motores de las voces y la conversión a MP3 (JST-124), compartidos por el
// generador (`npm run voces`, una vez en la Mac) y, desde la 0.5.0, por el
// worker del plugin, que prepara al momento las frases con el nombre de la
// tarea (JST-167). Cada motor corre en su propio proceso, con `uv`.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Motor } from "../src/voces.js";

export const LUFS = -19;

export const KOKORO_DIR = join(homedir(), ".cache", "oficina-voces", "kokoro");
const KOKORO: Readonly<Record<string, string>> = {
  "kokoro-v1.0.onnx": "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
  "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
};

/** Baja el modelo de Kokoro si falta (los mismos archivos que se usaron en las pruebas del usuario). */
export async function modeloKokoro(): Promise<void> {
  mkdirSync(KOKORO_DIR, { recursive: true });
  for (const [archivo, sha] of Object.entries(KOKORO)) {
    const destino = join(KOKORO_DIR, archivo);
    if (existsSync(destino)) continue;
    console.log(`bajando ${archivo} (github.com/thewh1teagle/kokoro-onnx, una vez)…`);
    const r = await fetch(`https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/${archivo}`);
    if (!r.ok || !r.body) throw new Error(`${archivo}: ${r.status}`);
    const h = createHash("sha256");
    const cuerpo = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream<Uint8Array>);
    cuerpo.on("data", (b: Buffer) => h.update(b));
    await pipeline(cuerpo, createWriteStream(`${destino}.parcial`));
    if (h.digest("hex") !== sha) throw new Error(`${archivo} llegó distinto (SHA-256)`);
    renameSync(`${destino}.parcial`, destino);
  }
}

/** El modelo de Kokoro ya está bajado (el worker no baja nada: lo hace `npm run voces`). */
export function hayModeloKokoro(): boolean {
  return Object.keys(KOKORO).every((a) => existsSync(join(KOKORO_DIR, a)));
}

/**
 * Los argumentos de `uv` para correr un motor. `trabajos`: el archivo JSON con
 * las frases, o «-» para leerlas de a una por la entrada estándar (el worker).
 * El texto nunca va en la línea de comandos.
 */
export function comando(raiz: string, m: Motor, trabajos: string): string[] {
  const py = (version: string, ...paquetes: string[]) => ["run", "--no-project", "--python", version, ...paquetes.flatMap((p) => ["--with", p]), "python", "-I", join(raiz, "generador", `motor_${m}.py`), trabajos];
  if (m === "edge") return py("3.11", "edge-tts==7.3.1");
  if (m === "kokoro") return [...py("3.11", "kokoro-onnx==0.6.1", "soundfile"), join(KOKORO_DIR, "kokoro-v1.0.onnx"), join(KOKORO_DIR, "voices-v1.0.bin")];
  if (m === "qwen3") return py("3.12", "qwen-tts==0.1.1");
  return py("3.11", "chatterbox-tts==0.1.7");
}

/** Lo que el motor necesita además del texto: la voz en su motor, o el audio (y su texto) que se clona. */
export function datosDeVoz(raiz: string, m: Motor, clave: string): { voz: string; referencia: string; referencia_texto?: string } {
  const ref = join(raiz, "generador", "referencias", clave);
  return { voz: clave, referencia: `${ref}.wav`, referencia_texto: m === "qwen3" ? readFileSync(`${ref}.txt`, "utf8").trim() : undefined };
}

/**
 * Lo más que puede durar el audio de un clon (JST-255): 3 s más el doble de lo
 * que tomaría a 10 letras por segundo, con las letras de lo que de verdad se
 * dice (`paraDecir`: «0.9.1» sale «cero punto nueve punto uno»). Lo normal es
 * ~0,1 s por letra (hasta 0,2 en las frases largas); Qwen3 a veces repite el
 * comienzo al final y llega a 0,24 (36,6 s una frase de 152 letras). El
 * `maximo` de `motor_qwen3.py` y `motor_chatterbox.py` es el mismo.
 */
export function maximoAudioMs(dicho: string): number {
  return 3_000 + 200 * [...dicho].filter((c) => /\p{L}/u.test(c)).length;
}

const RECORTE ="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse";

/**
 * Sin silencio en las puntas y a ~−19 LUFS (ganancia lineal, sin pasar −1 dB
 * de pico), MP3 mono 24 kHz 48 kbit/s. Se escribe aparte y se renombra al
 * final: nadie lee un MP3 a medias.
 */
export function convertir(entrada: string, salida: string, env?: NodeJS.ProcessEnv): void {
  const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", entrada, "-af", `${RECORTE},ebur128=framelog=quiet,volumedetect`, "-f", "null", "-"], { encoding: "utf8", env });
  const lufs = Number(/\bI:\s+(-?[\d.]+) LUFS/.exec(m.stderr)?.[1] ?? NaN);
  const pico = Number(/max_volume: (-?[\d.]+) dB/.exec(m.stderr)?.[1] ?? NaN);
  const ganancia = Number.isFinite(lufs) && Number.isFinite(pico) ? Math.min(LUFS - lufs, -1 - pico) : 0;
  const tmp = `${salida}.parcial.mp3`;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", entrada, "-af", `${RECORTE},volume=${ganancia.toFixed(1)}dB`, "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k", tmp], { encoding: "utf8", env });
  if (r.status !== 0) throw new Error(`ffmpeg: ${(r.stderr ?? "").slice(-300)}`);
  renameSync(tmp, salida);
}

/** `null` si el programa arranca bien; si no, por qué (JST-150: «falta uv», «ffmpeg no funciona: dyld…»). */
export function problemaCon(programa: string, argumentos: string[], env?: NodeJS.ProcessEnv): string | null {
  const r = spawnSync(programa, argumentos, { encoding: "utf8", env, timeout: 20_000 });
  if (r.status === 0) return null;
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return `falta ${programa} (no está en el PATH)`;
  const porque = r.error?.message ?? ((r.stderr ?? "").trim().split("\n")[0] || `terminó con ${r.status ?? r.signal}`);
  return `${programa} no funciona: ${porque}`;
}

/** Los argumentos para probar ffmpeg: un MP3 corto como los de `convertir`. */
export const PRUEBA_FFMPEG = ["-v", "error", "-f", "lavfi", "-i", "sine=duration=0.2", "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k", "-f", "null", "-"];

/** Corta antes del primer motor si `uv` o `ffmpeg` no arrancan (JST-150). */
export function revisar(programa: string, argumentos: string[], arreglo: string): void {
  const p = problemaCon(programa, argumentos);
  if (p) throw new Error(`${p}. ${arreglo}`);
}
