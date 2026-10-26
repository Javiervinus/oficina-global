# Chatterbox Multilingual (chatterbox-tts 0.1.7): clones de un hombre y una mujer chilenos (JST-124).
# Lo corre generar_voces.ts: lee los trabajos [{texto, salida, referencia}] y escribe cada WAV.
# Con frases cortas a veces corta o alarga el audio: si dura raro para su largo, se repite (hasta 3 veces, con otra semilla).
# JST-255: lo más largo razonable es 3 s más el doble de sus letras a 10 por segundo, como en Qwen3
# (`maximoAudioMs` en motores.ts), y si las 3 tomas salen raras no se escribe nada (es un error).
import json
import random
import sys
import time

import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS


def razonable(texto, segundos):
    letras = sum(c.isalpha() for c in texto)
    return letras / 22 <= segundos <= 3 + letras / 5


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
m = ChatterboxMultilingualTTS.from_pretrained(device=dispositivo)
print(json.dumps({"carga_s": round(time.time() - t0, 1), "dispositivo": dispositivo}), flush=True)
referencia = None
for t in trabajos():
    t0 = time.time()
    try:
        # La referencia se prepara una vez por voz, no en cada frase.
        if t["referencia"] != referencia:
            m.prepare_conditionals(t["referencia"])
            referencia = t["referencia"]
        for intento in range(3):
            # Al azar: si una toma sale mala y se borra, la próxima vez sale otra.
            semilla = random.randrange(2**31)
            torch.manual_seed(semilla)
            wav = m.generate(t["texto"], language_id="es", temperature=0.5)
            dur = wav.shape[-1] / m.sr
            if razonable(t["texto"], dur):
                break
        else:
            raise ValueError(f"dura {dur:.1f} s para {sum(c.isalpha() for c in t['texto'])} letras (3 tomas)")
        ta.save(t["salida"], wav, m.sr)
        print(json.dumps({"salida": t["salida"], "s": round(time.time() - t0, 2), "audio_s": round(dur, 2), "intentos": intento + 1, "semilla": semilla}), flush=True)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"salida": t["salida"], "error": str(e)[:300]}), flush=True)
