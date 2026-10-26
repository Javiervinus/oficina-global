"""Sonidos propios del aviso de «Oficina global» 0.2.0 (JST-95). Sin muestras de terceros: todo sale de estas fórmulas.

Uso:  python3 -I fuente/sonidos.py      → sonidos/aviso-<nombre>.wav (44,1 kHz, 16 bits, mono) y .mp3 (ffmpeg)

- campana: dos notas de campanita que suben (sol → do), 0,9 s. Propuesta A.
- gota:    dos gotas de marimba (re → la), 0,5 s. Propuesta B.
- pixel:   arpegio de 8 bits con onda triangular, suavizado (do → mi → sol), 0,55 s. Propuesta C.

Todos quedan a −14 dBFS de pico, con entrada de 5 ms y salida suave: se oyen sin asustar.
"""
import math
import struct
import subprocess
import wave
from pathlib import Path

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "sonidos"
PEAK = 10 ** (-14 / 20)


def env(t, attack, tau):
    a = min(1.0, t / attack) if attack else 1.0
    return a * math.exp(-t / tau)


def campana():
    dur = 0.9
    notas = [(0.0, 783.99), (0.16, 1046.5)]  # sol5, do6
    parciales = [(1.0, 1.0), (2.0, 0.22), (3.01, 0.07), (4.2, 0.03)]
    s = [0.0] * int(SR * dur)
    for t0, f in notas:
        for i in range(int(SR * t0), len(s)):
            t = i / SR - t0
            s[i] += sum(g * math.sin(2 * math.pi * f * k * t) * env(t, 0.005, 0.32 / k ** 0.5) for k, g in parciales)
    return s


def gota():
    dur = 0.5
    notas = [(0.0, 1174.66), (0.12, 880.0)]  # re6, la5
    s = [0.0] * int(SR * dur)
    for t0, f in notas:
        fase = 0.0
        for i in range(int(SR * t0), len(s)):
            t = i / SR - t0
            fi = f * (1 + 0.08 * math.exp(-t / 0.012))  # cae un poco de tono al empezar: suena a gota
            fase += 2 * math.pi * fi / SR
            s[i] += math.sin(fase) * env(t, 0.004, 0.11) + 0.15 * math.sin(4 * fase) * env(t, 0.002, 0.025)
    return s


def pixel():
    dur = 0.55
    notas = [(0.0, 1046.5, 0.07), (0.075, 1318.51, 0.07), (0.15, 1567.98, 0.32)]  # do6, mi6, sol6
    s = [0.0] * int(SR * dur)
    for t0, f, largo in notas:
        for i in range(int(SR * t0), min(len(s), int(SR * (t0 + largo + 0.08)))):
            t = i / SR - t0
            x = (f * t) % 1.0
            tri = 4 * abs(x - 0.5) - 1  # onda triangular: más suave que la cuadrada
            g = env(t, 0.004, 0.09 if largo < 0.1 else 0.16)
            s[i] += tri * g * (0.8 if largo < 0.1 else 1.0)
    # filtro pasa bajos de un polo: le quita lo áspero a los 8 bits
    y, a = 0.0, 0.35
    for i in range(len(s)):
        y += a * (s[i] - y)
        s[i] = y
    return s


def escribir(nombre, s):
    m = max(abs(v) for v in s) or 1
    fade = int(SR * 0.04)
    for i in range(fade):
        s[-1 - i] *= i / fade
    datos = b"".join(struct.pack("<h", int(max(-1, min(1, v / m * PEAK)) * 32767)) for v in s)
    wav = OUT / f"aviso-{nombre}.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(datos)
    mp3 = wav.with_suffix(".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "96k", str(mp3)], check=True)
    print(f"{wav.name} {wav.stat().st_size // 1024} KB · {mp3.name} {mp3.stat().st_size // 1024} KB · {len(s) / SR:.2f} s")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    escribir("campana", campana())
    escribir("gota", gota())
    escribir("pixel", pixel())
