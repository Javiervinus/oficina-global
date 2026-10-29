// El ▶ de cada voz en «Voces» (0.11.0, JST-325; design-spec de JST-324 §1.2):
// una muestra corta, una a la vez. Las de la lista suenan con el audio que se
// grabó al instalar («Instalar la Oficina global en la real.», la misma de «▶
// Probar»); la del navegador, con su voz. Mientras suena una, la voz de la
// oficina no empieza frases (como con «Leer contexto») y la que sonaba se calla.
import { useSyncExternalStore } from "react";
import { TEXTO_MUESTRA } from "../avisos.js";
import { claveAudio, type VozId } from "../voces.js";
import { cargarIndice, pedirArchivo } from "./audiosVoces.js";
import { callarOficina, desbloquearAudio, fijarMuestraSonando, tocarOficina, vocesDisponibles } from "./sonido.js";

export type VozMuestra = VozId | "navegador";

let sonando: VozMuestra | null = null;
let version = 0;
let cortarNavegador: (() => void) | null = null;
const oyentes = new Set<() => void>();

const avisar = () => {
  version += 1;
  for (const o of oyentes) o();
};

export function useMuestra(): VozMuestra | null {
  useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => version,
  );
  return sonando;
}

function terminar(voz: VozMuestra): void {
  if (sonando !== voz) return;
  sonando = null;
  cortarNavegador = null;
  fijarMuestraSonando(false);
  avisar();
}

/** Calla la muestra que suena (también al cerrar el panel). */
export function detenerMuestra(): void {
  const voz = sonando;
  if (!voz) return;
  cortarNavegador?.();
  callarOficina(0);
  terminar(voz);
}

/** ▶: toca la muestra de esa voz; si ya suena, la detiene. Una a la vez. */
export async function tocarMuestra(voz: VozMuestra): Promise<void> {
  if (sonando === voz) {
    detenerMuestra();
    return;
  }
  detenerMuestra();
  // Dentro del toque, para que el iPhone deje sonar.
  desbloquearAudio();
  sonando = voz;
  fijarMuestraSonando(true);
  avisar();
  if (voz === "navegador") {
    const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
    if (!synth) return terminar(voz);
    const u = new SpeechSynthesisUtterance(TEXTO_MUESTRA);
    const v = vocesDisponibles()[0];
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = "es-MX";
    u.onend = () => terminar(voz);
    u.onerror = () => terminar(voz);
    cortarNavegador = () => {
      try {
        synth.cancel();
      } catch {
        // Ya no sonaba.
      }
    };
    try {
      synth.cancel();
      synth.speak(u);
    } catch {
      terminar(voz);
    }
    return;
  }
  const indice = await cargarIndice().catch(() => null);
  const archivo = indice?.audios[claveAudio(voz, TEXTO_MUESTRA)];
  const blob = archivo && sonando === voz ? await pedirArchivo(archivo) : null;
  // Si el toque ya no es el último, o no hay audio, no suena nada.
  if (sonando !== voz) return;
  if (!blob || !tocarOficina(blob, () => undefined, () => terminar(voz))) terminar(voz);
}
