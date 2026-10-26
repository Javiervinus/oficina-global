# Kokoro-82M (kokoro-onnx 0.6.1, kokoro-v1.0.onnx): Alex, Dora y Santa (JST-124).
# Lo corre generar_voces.ts: lee los trabajos [{texto, salida, voz}] y escribe cada WAV.
# Español de Latinoamérica (espeak-ng «es-419»): «necesito» con s, no con z.
# Uso: ... python motor_kokoro.py <trabajos.json> <kokoro-v1.0.onnx> <voices-v1.0.bin>
import json
import sys
import time

import soundfile as sf
from kokoro_onnx import Kokoro


def trabajos():
    """Del archivo, o con «-» (0.5.0, el worker del plugin) uno por línea de la entrada estándar, hasta que se cierre."""
    if sys.argv[1] == "-":
        for linea in sys.stdin:
            if linea.strip():
                yield json.loads(linea)
    else:
        yield from json.load(open(sys.argv[1], encoding="utf-8"))

t0 = time.time()
k = Kokoro(sys.argv[2], sys.argv[3])
print(json.dumps({"carga_s": round(time.time() - t0, 1)}), flush=True)
for t in trabajos():
    t0 = time.time()
    try:
        s, sr = k.create(t["texto"], voice=t["voz"], speed=1.0, lang="es-419")
        sf.write(t["salida"], s, sr)
        print(json.dumps({"salida": t["salida"], "s": round(time.time() - t0, 2), "audio_s": round(len(s) / sr, 2)}), flush=True)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"salida": t["salida"], "error": str(e)[:300]}), flush=True)
