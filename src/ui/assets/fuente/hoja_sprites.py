"""Hoja de presentación de los sprites (para la tarea): estados en su puesto, un personaje por rol,
cuadros de animación y muebles.  Uso: /opt/homebrew/bin/python3.11 -I fuente/hoja_sprites.py → sprites/hoja-sprites.png"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
S = ROOT / "sprites"
PJ, PJM = Image.open(S / "personajes.png"), json.loads((S / "personajes.json").read_text())
MU, MUM = Image.open(S / "muebles.png"), json.loads((S / "muebles.json").read_text())["piezas"]
EF, EFM = Image.open(S / "efectos.png"), json.loads((S / "efectos.json").read_text())["animaciones"]
ROW = {f["id"]: f["fila"] for f in PJM["filas"]}
BG, FG, MUTED = (24, 24, 27), (240, 240, 240), (160, 160, 170)


def font(n, bold=False):
    return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", n, index=1 if bold else 0)


def char(look, anim, f=0):
    a = PJM["animaciones"][anim]
    x, y = (a["desde"] + f) * 16, ROW[look] * 24
    return PJ.crop((x, y, x + 16, y + 24))


def mu(name):
    m = MUM[name]
    return MU.crop((m["x"], m["y"], m["x"] + m["w"], m["y"] + m["h"]))


def fx(name, f=0):
    e = EFM[name]
    return EF.crop(((e["desde"] + f) * 16, 0, (e["desde"] + f + 1) * 16, 16))


def station(look, st, co="jst"):
    """Puesto con las mismas capas y posiciones que el prototipo. Origen del personaje en (8, 16)."""
    im = Image.new("RGBA", (44, 46), (0, 0, 0, 0))
    x, y = 8, 16
    paste = lambda src, px, py: im.alpha_composite(src, (px, py))
    paste(mu(f"silla-{co}"), x + 11, y + 8)
    anim = {"trabaja": "teclear", "toca": "mano", "error": "error", "pausa": "dormir"}.get(st)
    if anim:
        paste(char(look, anim, 0), x + 10, y)
    paste(mu("escritorio"), x, y + 8)
    scr = {"trabaja": "codigo", "toca": "espera", "error": "error", "pausa": "dormida"}.get(st, "apagada")
    paste(mu(f"pantalla-{scr}-0"), x + 2, y + 9)
    if st == "pausa":
        paste(fx("zz", 2), x + 19, y - 12)
    if st == "error":
        paste(fx("humo", 1), x - 1, y - 4)
        paste(fx("alerta"), x + 20, y - 12)
    if st == "toca":
        paste(fx("aviso"), x + 19, y - 15)
    return im


def lounge_scene(a, b):
    im = Image.new("RGBA", (64, 46), (0, 0, 0, 0))
    im.alpha_composite(mu("alfombra-sala"), (2, 14))
    im.alpha_composite(mu("sofa"), (10, 12))
    im.alpha_composite(char(a, "sofa", 0), (12, 3))
    im.alpha_composite(mu("mesita"), (18, 31))
    im.alpha_composite(char(b, "libre", 3), (44, 16))
    im.alpha_composite(fx("vapor", 1), (40, 6))
    return im


def up(im, z):
    return im.resize((im.width * z, im.height * z), Image.NEAREST)


def main():
    W = 1760
    sheet = Image.new("RGB", (W, 1880), BG)
    d = ImageDraw.Draw(sheet)
    d.text((48, 36), "Sprites de «Oficina global»", fill=FG, font=font(40, True))
    d.text((48, 90), "Dibujados desde cero para este plugin · personajes de 16×24 px por cuadro · se escalan a 1x, 2x o 3x sin suavizar (image-rendering: pixelated)", fill=MUTED, font=font(20))
    y = 150
    # 1. Estados en el puesto
    d.text((48, y), "Los 5 estados (forma + color: nunca solo color)", fill=FG, font=font(26, True))
    y += 46
    states = [("trabaja", "Trabajando", "teclea; pantalla con código;\nglobo con la tarea (JST-64)"), ("toca", "Te necesita", "levanta la mano; globo violeta\ncon mano; pantalla en espera"),
              ("error", "Con error", "se pone rojo, manos a la cabeza;\n«!» y humo; pantalla roja"), ("pausa", "En pausa", "duerme sobre el escritorio;\nZz; pantalla apagada"), ("libre", "Libre", "en la sala de descanso,\ncon su taza (sofá o de pie)")]
    x = 48
    for st, name, desc in states:
        img = lounge_scene("diseno-1", "qa-2") if st == "libre" else station("ingenieria-1", st)
        img = up(img, 5)
        sheet.paste(img, (x, y), img)
        d.text((x, y + img.height + 8), name, fill=FG, font=font(22, True))
        d.text((x, y + img.height + 38), desc, fill=MUTED, font=font(17))
        x += img.width + 36
    y += 46 * 5 + 110
    # 2. Un personaje por rol
    d.text((48, y), "Un aspecto por rol (se reconoce por lo que lleva en la cabeza y la ropa)", fill=FG, font=font(26, True))
    y += 50
    roles = [("direccion-1", "Dirección", "traje y corbata"), ("direccion-3", "Chief of staff", "traje y auricular"), ("ingenieria-1", "Ingeniería", "polerón y audífonos"), ("diseno-1", "Diseño", "boina"),
             ("qa-1", "QA", "chaleco reflectante"), ("revisor-1", "Revisión", "visera verde"), ("docs-1", "Documentación", "lentes y chaleco"), ("marketing-1", "Marketing", "lentes de sol"),
             ("contenido-1", "Contenido", "jockey y cámara"), ("specs-1", "Especificaciones", "casco blanco"), ("hermes-1", "Hermes", "casco alado y bolso")]
    x = 48
    for look, name, desc in roles:
        img = up(char(look, "parado"), 6)
        sheet.paste(img, (x + 10, y), img)
        d.text((x, y + img.height + 6), name, fill=FG, font=font(17, True))
        d.text((x, y + img.height + 30), desc, fill=MUTED, font=font(15))
        x += 152
    y += 24 * 6 + 80
    # 3. Variantes (23 aspectos)
    d.text((48, y), "23 aspectos: variantes de piel, pelo y color para que nadie sea un clon", fill=FG, font=font(26, True))
    y += 48
    x = 48
    for f in PJM["filas"]:
        img = up(char(f["id"], "parado"), 4)
        sheet.paste(img, (x, y), img)
        x += 72
    y += 24 * 4 + 40
    # 4. Cuadros de animación
    d.text((48, y), "Cuadros de animación de un personaje (personajes.png: una fila por aspecto)", fill=FG, font=font(26, True))
    y += 48
    x = 48
    for anim, a in PJM["animaciones"].items():
        d.text((x, y), f"{anim} · {a['cuadros']} × {a['ms']} ms" if a["ms"] else f"{anim} · fijo", fill=MUTED, font=font(15))
        for f in range(a["cuadros"]):
            img = up(char("hermes-1", anim, f), 3)
            sheet.paste(img, (x + f * 50, y + 26), img)
        x += max(a["cuadros"] * 50, 120) + 24
        if x > W - 300:
            x = 48
            y += 24 * 3 + 50
    y += 24 * 3 + 64
    # 5. Efectos y muebles
    d.text((48, y), "Efectos y muebles (efectos.png y muebles.png, con su atlas en JSON)", fill=FG, font=font(26, True))
    y += 48
    x = 48
    for name, e in EFM.items():
        for f in range(e["cuadros"]):
            img = up(fx(name, f), 4)
            sheet.paste(img, (x, y), img)
            x += 70
        x += 20
    y += 90
    x = 48
    rowh = 0
    for name in ["escritorio", "silla-bet", "silla-elm", "silla-jst", "silla-mig", "sofa", "sofa-calido", "cafetera", "mesita", "planta", "planta-grande", "dispensador", "estante", "pizarra", "arcade", "pingpong", "puff", "lampara", "reloj", "ventana-dia", "ventana-noche", "cuadro-bet", "ascensor", "alfombra-sala"]:
        img = up(mu(name), 4)
        if x + img.width > W - 48:
            x, y, rowh = 48, y + rowh + 24, 0
        sheet.paste(img, (x, y), img)
        x += img.width + 24
        rowh = max(rowh, img.height)
    y += rowh + 40
    sheet = sheet.crop((0, 0, W, y))
    sheet.save(S / "hoja-sprites.png")
    print("hoja-sprites.png", sheet.size)


if __name__ == "__main__":
    main()
