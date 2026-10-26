# Edge TTS (edge-tts 7.3.1; con la 7.2.7 Microsoft responde 403): Lorenzo y Catalina (JST-124).
# Lo corre generar_voces.ts: lee los trabajos [{texto, salida, voz}] y escribe cada MP3.
# A Microsoft le llega el texto de cada frase, solo aquí, al generar.
# Con «-» en vez del archivo (0.5.0, el worker del plugin): un trabajo por línea de la entrada estándar, hasta que se cierre.
import asyncio
import json
import sys
import time

import edge_tts


def trabajos():
    if sys.argv[1] == "-":
        for linea in sys.stdin:
            if linea.strip():
                yield json.loads(linea)
    else:
        yield from json.load(open(sys.argv[1], encoding="utf-8"))


async def main():
    for t in trabajos():
        t0 = time.time()
        try:
            # Las mascotas (0.6.0, JST-226): la misma voz, más aguda y a su ritmo.
            await edge_tts.Communicate(t["texto"], t["voz"], pitch=t.get("pitch", "+0Hz"), rate=t.get("rate", "+0%")).save(t["salida"])
            print(json.dumps({"salida": t["salida"], "s": round(time.time() - t0, 2)}), flush=True)
        except Exception as e:  # noqa: BLE001 — una frase que falla no corta las demás
            print(json.dumps({"salida": t["salida"], "error": str(e)[:300]}), flush=True)


asyncio.run(main())
