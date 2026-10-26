# Qwen3-TTS 0.6B Base (qwen-tts 0.1.1): clones del mismo hombre y la misma mujer chilenos (JST-124).
# Lo corre generar_voces.ts: lee los trabajos [{texto, salida, referencia, referencia_texto}] y escribe cada WAV.
# Si el audio dura raro para el largo de la frase, se repite (hasta 3 veces). Sin tope, una frase corta
# puede no terminar nunca (lo permite hasta 2048 tokens, ~170 s): se corta en lo más largo que es razonable.
# JST-255: a veces repite el comienzo al final (36,6 s una frase de 152 letras, ~15 s lo normal). Lo más
# largo razonable es 3 s más el doble de sus letras a 10 por segundo (`maximoAudioMs` en motores.ts),
# y si las 3 tomas salen raras no se escribe nada: es un error y la página dice la frase de siempre.
import json
import random
import sys
import time

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel


def maximo(texto):
    return 3 + sum(c.isalpha() for c in texto) / 5


def razonable(texto, segundos):
    return sum(c.isalpha() for c in texto) / 22 <= segundos <= maximo(texto)


def trabajos():
    """Del archivo, o con «-» (0.5.0, el worker del plugin) uno por línea de la entrada estándar, hasta que se cierre."""
    if sys.argv[1] == "-":
        for linea in sys.stdin:
            if linea.strip():
                yield json.loads(linea)
    else:
        yield from json.load(open(sys.argv[1], encoding="utf-8"))


dispositivo = "mps" if torch.backends.mps.is_available() else "cpu"
t0 = time.time()
m = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-Base", device_map=dispositivo, dtype=torch.float32)
print(json.dumps({"carga_s": round(time.time() - t0, 1), "dispositivo": dispositivo}), flush=True)
for t in trabajos():
    t0 = time.time()
    try:
        for intento in range(3):
            # Al azar: si una toma sale mala y se borra, la próxima vez sale otra.
            semilla = random.randrange(2**31)
            torch.manual_seed(semilla)
            # 12 tokens por segundo de audio.
            tope = int(12 * maximo(t["texto"])) + 12
            wavs, sr = m.generate_voice_clone(text=t["texto"], language="Spanish", ref_audio=t["referencia"], ref_text=t["referencia_texto"], max_new_tokens=tope)
            dur = len(wavs[0]) / sr
            if razonable(t["texto"], dur):
                break
        else:
            raise ValueError(f"dura {dur:.1f} s para {sum(c.isalpha() for c in t['texto'])} letras (3 tomas)")
        sf.write(t["salida"], wavs[0], sr)
        print(json.dumps({"salida": t["salida"], "s": round(time.time() - t0, 2), "audio_s": round(dur, 2), "intentos": intento + 1, "semilla": semilla}), flush=True)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"salida": t["salida"], "error": str(e)[:300]}), flush=True)
