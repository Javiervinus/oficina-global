"""Mascotas y efectos nuevos de «Oficina global» 0.3.0 (JST-96), dibujados desde cero con mapas de pixeles.

Uso:  /opt/homebrew/bin/python3.11 -I fuente/mascotas.py
Genera en sprites/:
  mascotas.png + mascotas.json   cuadros de 16x16: gato, perro, conejo y robot aspiradora (una fila cada uno)
  efectos.png  + efectos.json    los 13 cuadros de JST-65 sin cambios + sobre (vuela, llega, quieto, abre) y charla
  vista-previa-mascotas.png      hoja ampliada, sobre las baldosas del piso en los dos temas

Cada cuadro se dibuja como un mapa del INTERIOR (una letra por color, «.» vacío); el contorno #2a2230 se agrega
solo alrededor (4 vecinos), como en los personajes. Las poses -izq son el espejo exacto de las -der.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT.parent / "oficina-global"
sys.path.insert(0, str(BASE / "fuente"))
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps  # noqa: E402
from sprites import OUTLINE, hx  # noqa: E402  (mismo contorno y helper de color que los personajes)

OUT = ROOT / "sprites"
OUT.mkdir(exist_ok=True)
C = 16  # cuadro de 16x16


def render(rows, pal, outline=True):
    """rows: 16 strings de 16 letras (interior). Devuelve una imagen RGBA de 16x16 con contorno automático."""
    rows = [(r + "." * C)[:C] for r in rows] + ["." * C] * (C - len(rows))
    im = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    fill = {(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch != "."}
    for (x, y) in fill:
        im.putpixel((x, y), pal[rows[y][x]])
    if outline:
        for y in range(C):
            for x in range(C):
                if (x, y) in fill:
                    continue
                if any((x + dx, y + dy) in fill for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    im.putpixel((x, y), OUTLINE)
    return im


def P(**k):
    d = {key: hx(v) for key, v in k.items()}
    d["e"] = OUTLINE  # ojos, nariz y líneas de detalle
    return d


# =====================================================================================================
# GATO · atigrado naranjo con pecho y patas blancas. Mira a la derecha.
# =====================================================================================================
GATO = P(a="#e8913a", A="#b8601f", b="#f8c58a", w="#fbf3e6", p="#ee8f86")


def gato_de_pie(piernas, cola, ojos="aeae"):
    """piernas: 4 tuplas (x en y12–13, x en y14, tono): «a» la pata cercana, «A» la lejana. cola: (x, y, color)."""
    g = [["."] * C for _ in range(C)]

    def put(x, y, ch):
        if 0 <= x < C and 0 <= y < C:
            g[y][x] = ch

    # orejas y cabeza (x 10..14)
    put(10, 5, "a"), put(14, 5, "a")
    for x in range(10, 15):
        put(x, 6, "a")
    for x, ch in {10: "a", 11: ojos[1], 12: "a", 13: ojos[3], 14: "a"}.items():
        put(x, 7, ch)
    for x, ch in {10: "a", 11: "b", 12: "p", 13: "b", 14: "a"}.items():
        put(x, 8, ch)
    # lomo y cuerpo (x 3..11)
    for x in range(3, 11):
        put(x, 9, "A" if x in (4, 6, 8) else "a")
    for x, ch in {10: "a", 11: "b", 12: "b", 13: "b"}.items():
        put(x, 9, ch)
    for x in range(3, 12):
        put(x, 10, "a")
    put(11, 10, "w"), put(3, 10, "A")
    for x in range(4, 11):
        put(x, 11, "w" if 5 <= x <= 9 else "a")
    # patas
    for x12, x14, tono in piernas:
        put(x12, 12, tono)
        put(x12 if abs(x14 - x12) < 2 else (x12 + x14) // 2, 13, tono)
        put(x14, 14, "w" if tono == "a" else "b")
    for x, y, ch in cola:
        put(x, y, ch)
    return ["".join(r) for r in g]


COLA_ARRIBA = [(3, 8, "a"), (2, 7, "A"), (2, 6, "a"), (2, 5, "A"), (3, 4, "a")]
COLA_ARRIBA2 = [(3, 8, "a"), (2, 7, "A"), (2, 6, "a"), (2, 5, "A"), (1, 4, "a")]


def gato_caminar(f):
    piernas = [
        [(4, 3, "A"), (6, 7, "a"), (10, 9, "A"), (11, 12, "a")],
        [(4, 4, "A"), (5, 5, "a"), (10, 10, "A"), (11, 11, "a")],
        [(5, 6, "A"), (4, 3, "a"), (11, 12, "A"), (10, 9, "a")],
        [(5, 5, "A"), (4, 4, "a"), (11, 11, "A"), (10, 10, "a")],
    ][f]
    cola = [COLA_ARRIBA, COLA_ARRIBA, COLA_ARRIBA2, COLA_ARRIBA2][f]
    return render(gato_de_pie(piernas, cola), GATO)


def gato_quieto(f):
    piernas = [(4, 4, "A"), (5, 5, "a"), (10, 10, "A"), (11, 11, "a")]
    ojos = "aeae" if f == 0 else "aAaA"
    cola = COLA_ARRIBA if f == 0 else COLA_ARRIBA2
    return render(gato_de_pie(piernas, cola, ojos), GATO)


GATO_SENTADO = [
    "................",
    "................",
    "................",
    "........a...a...",
    "........aaaaa...",
    "........a{e}a{e}a...",
    "........abpba...",
    ".......aabbba...",
    "......aaawwba...",
    ".....aAaawwa....",
    ".....aaAawwa....",
    ".....aaaawwa....",
    "....Aaaaawwa....",
    "....aAaaw.w.....",
    "..aaaAAAw.w.....",
    "................",
]


def gato_gesto(f):
    """Sentado: en el cuadro 0 se lame la pata (la pata sube a la boca), en el 1 cierra los ojos, contento."""
    ojos = "e" if f == 0 else "A"
    rows = [r.replace("{e}", ojos) for r in GATO_SENTADO]
    if f == 0:
        rows[13] = "....aAaaw.......".ljust(16, ".")
        rows[14] = "..aaaAAAw.......".ljust(16, ".")
        rows[8] = "......aaawwbaw.."  # pata levantada junto al hocico
        rows[9] = ".....aAaawwa.w.."
    return render(rows, GATO)


GATO_DORMIDO = [
    "", "", "", "", "", "", "", "", "", "",
    "......aAa.a.a...",
    ".....aaaaaaaaa..",
    "....aAaaaaAaAa..",
    "....aaaaaaabpb..",
    ".....AbAbAbbb...",
]


def gato_dormir(f):
    rows = list(GATO_DORMIDO)
    if f == 1:  # respira: el lomo sube un pixel
        rows[10] = ".....aaAa.a.a..."
    return render(rows, GATO)


COJIN = P(r="#8698b1", R="#60718a", s="#b4c1d3", S="#9aa9be")


def gato_cama():
    rows = [""] * 9 + [
        "..ssssssssssss..",
        ".sSSSSSSSSSSSSs.",
        ".sSSSSSSSSSSSSs.",
        ".rrrrrrrrrrrrrr.",
        ".rrrrrrrrrrrrrr.",
        "..RRRRRRRRRRRR..",
    ]
    return render(rows, COJIN)


# =====================================================================================================
# PERRO · café claro con una oreja oscura, hocico crema y collar verde azulado. Mira a la derecha.
# =====================================================================================================
PERRO = P(c="#c9955a", C="#9c6a3a", d="#5e3b24", w="#f1e2c4", k="#2f8a83", t="#ee8f86")


def perro_de_pie(patas, cola, lengua=False):
    g = [["."] * C for _ in range(C)]

    def put(x, y, ch):
        if 0 <= x < C and 0 <= y < C:
            g[y][x] = ch

    # cabeza (x 9..14) con la oreja oscura caída atrás
    for x in range(10, 13):
        put(x, 4, "c")
    put(9, 5, "d"), put(10, 5, "c"), put(11, 5, "c"), put(12, 5, "c")
    put(9, 6, "d"), put(10, 6, "d"), put(11, 6, "c"), put(12, 6, "e"), put(13, 6, "w"), put(14, 6, "e")
    put(9, 7, "d"), put(10, 7, "d"), put(11, 7, "c"), put(12, 7, "c"), put(13, 7, "w"), put(14, 7, "w")
    put(10, 8, "k"), put(11, 8, "k"), put(12, 8, "c"), put(13, 8, "w")
    if lengua:
        put(13, 9, "t")
    # cuerpo (x 3..12)
    for x in range(3, 12):
        put(x, 9, "c")
    for x in range(3, 12):
        put(x, 10, "c")
    put(11, 10, "w")
    for x in range(3, 12):
        put(x, 11, "C" if x in (3, 4) else "c")
    put(10, 11, "w")
    # patas (3 de alto)
    for xs in patas:
        for i, x in enumerate(xs):
            put(x, 12 + i, "C" if i < 2 else "d")
    for x, y, ch in cola:
        put(x, y, ch)
    return ["".join(r) for r in g]


COLA_P1 = [(2, 9, "c"), (1, 8, "c"), (1, 7, "C")]
COLA_P2 = [(2, 9, "c"), (2, 8, "c"), (3, 7, "C")]


def perro_caminar(f):
    patas = [
        [(4, 4, 3), (6, 6, 6), (9, 9, 10), (11, 11, 11)],
        [(4, 4, 4), (5, 5, 5), (10, 10, 10), (11, 11, 11)],
        [(4, 4, 4), (6, 6, 7), (9, 9, 9), (11, 11, 12)],
        [(4, 4, 4), (5, 5, 5), (10, 10, 10), (11, 11, 11)],
    ][f]
    return render(perro_de_pie(patas, COLA_P1 if f in (0, 1) else COLA_P2), PERRO)


def perro_quieto(f):
    patas = [(4, 4, 4), (6, 6, 6), (9, 9, 9), (11, 11, 11)]
    return render(perro_de_pie(patas, COLA_P1 if f == 0 else COLA_P2, lengua=f == 0), PERRO)


PERRO_SENTADO = [
    "................",
    "................",
    "................",
    "........ccc.....",
    ".......dccc.....",
    ".......ddcewe...",
    ".......ddccww...",
    "........kkcw....",
    "......cccccw....",
    ".....cccccw.....",
    "....CccccCw.....",
    "....CccccCc.....",
    "...CCcccCcc.....",
    "...CCccc.c.c....",
    "..dddcc..d.d....",
    "................",
]


def perro_gesto(f):
    """Sentado, menea la cola con fuerza y saca la lengua."""
    rows = list(PERRO_SENTADO)
    if f == 0:
        rows[12] = ".c.CCcccCcc....."
        rows[11] = "c...CccccCc....."
        rows[8] = "......cccccwt..."
    else:
        rows[13] = "c..CCccc.c.c...."
        rows[14] = ".cdddcc..d.d...."
    return render(rows, PERRO)


PERRO_DORMIDO = [
    "", "", "", "", "", "", "", "", "", "",
    "......cccc......",
    "....ccccccccdd..",
    "...Cccccccdddd..",
    "...CCcccccdAccw.",
    "....CCCC..wwwwe.",
]


def perro_dormir(f):
    rows = [r.replace("A", "e") for r in PERRO_DORMIDO]
    if f == 1:
        rows[10] = ".....ccccc......"
    return render(rows, PERRO)


CANASTO = P(m="#a4743f", M="#7c5530", n="#c99a5e", q="#e8dcc4")


def perro_cama():
    rows = [""] * 9 + [
        "..nnnnnnnnnnnn..",
        ".nqqqqqqqqqqqqn.",
        ".mqqqqqqqqqqqqm.",
        ".mMmMmMmMmMmMmm.",
        ".MmMmMmMmMmMmMM.",
        "..MMMMMMMMMMMM..",
    ]
    return render(rows, CANASTO)


# =====================================================================================================
# CONEJO · blanco con sombra gris clara y orejas rosadas por dentro. Mira a la derecha.
# =====================================================================================================
CONEJO = P(w="#f4f1ea", W="#c9c2b6", p="#f0a0a8", g="#9e978f")

CONEJO_AGACHADO = [
    "................",
    "................",
    "........w.w.....",
    "........p.w.....",
    "........p.w.....",
    "........wwww....",
    ".......wwwwew...",
    ".......wwwwwp...",
    "...wwwwwwwww....",
    "..WwwwwwwwWw....",
    "..wwwwwwwwWw....",
    "...WwwwwwwW.....",
    "...WWWWwwWw.....",
    "...wwwww.ww.....",
    "................",
    "................",
]


def bajar(rows, n=1):
    """Baja el dibujo n filas (para apoyar en la fila 15 con el contorno)."""
    rows = [(r + "." * C)[:C] for r in rows]
    return ["." * C] * n + rows[: C - n]


def conejo_caminar(f):
    if f in (0, 3):
        rows = list(CONEJO_AGACHADO)
        if f == 3:  # orejas un poco atrás
            rows[2], rows[3], rows[4] = ".......w.w......", "........pw......", "........pw......"
        return render(bajar(rows), CONEJO)
    if f == 1:  # se estira: patas de atrás en el suelo, el cuerpo adelante y arriba
        rows = [
            "................",
            "................",
            "..........w.w...",
            ".........p.w....",
            "........p.w.....",
            ".........wwww...",
            "........wwwwew..",
            "......wwwwwwwp..",
            "..wwwwwwwwwww...",
            ".WwwwwwwwwwW....",
            "..wwwwwwww.ww...",
            "..WWwww.....ww..",
            ".WW.............",
            "www.............",
        ]
        return render(bajar(rows), CONEJO)
    # f == 2: aterriza con las patas de adelante; las de atrás quedan arriba
    rows = [
        "................",
        "................",
        "................",
        "......w.w.......",
        ".......p.w......",
        "........wwww....",
        "..W....wwwwew...",
        "..wwwwwwwwwwwp..",
        "...WwwwwwwwwW...",
        "....WWwwwwwW....",
        ".........ww.....",
        ".........ww.....",
        "..........ww....",
        "..........ww....",
    ]
    return render(bajar(rows), CONEJO)


def conejo_quieto(f):
    rows = list(CONEJO_AGACHADO)
    if f == 1:  # mueve la nariz
        rows[7] = ".......wwwwwpp.."
        rows[6] = ".......wwwwew..."
    return render(bajar(rows), CONEJO)


def conejo_gesto(f):
    """De pie en dos patas, mueve las orejas."""
    rows = [
        "................",
        ".......w.w......",
        ".......p.w......",
        ".......p.w......",
        ".......wwww.....",
        "......wwwwew....",
        "......wwwwwp....",
        ".......wwwww....",
        "......wwwwwW....",
        "......wwwwwww...",
        ".....WwwwwwW....",
        "......wwwwwW....",
        "......Wwwwww....",
        ".....wwww.ww....",
    ]
    if f == 1:
        rows[1], rows[2], rows[3] = "........w..w....", ".......p..w.....", ".......p.w......"
    return render(bajar(rows), CONEJO)


CONEJO_PAN = [
    "", "", "", "", "", "", "", "", "",
    "................",
    ".....ppwwww.....",
    "....wwwwwwwww...",
    "...wwwwwwwWWwp..",
    "...WwwwwwwwwwW..",
    "....WWWWWWWWW...",
]


def conejo_dormir(f):
    rows = [r.replace("A", "g") for r in CONEJO_PAN]
    if f == 1:
        rows[10] = "......ppwww....."
    return render(rows, CONEJO)


COJIN_ZANAHORIA = P(r="#d8c8a8", R="#b9a682", s="#ece0c6", z="#f08a3c", Z="#c56a26", v="#5d9a4a")


def conejo_cama():
    rows = [""] * 10 + [
        "...ssssssssss.v.",
        "..srrrrrrrrrrvv.",
        "..rRRRRRRRRRr.z.",
        "..rRRRRRRRRRrzZ.",
        "...rrrrrrrrr.z..",
    ]
    return render(rows, COJIN_ZANAHORIA)


# =====================================================================================================
# ROBOT ASPIRADORA · disco gris oscuro visto de 3/4, parachoques claro y luz cian. Mira a la derecha.
# =====================================================================================================
ROBOT = P(d="#454955", D="#2c2f37", l="#9a9ba5", L="#c8c9d1", c="#4fd1d9", C="#2c7f86", m="#b98a3e", n="#6e5a3a", b="#6b6f7a", B="#d4cdbd")


def robot(luz="c", cepillo=0, sensor="der"):
    s = {"der": 11, "frente": 7, "izq": 4}[sensor]
    rows = [
        "",
        "", "", "", "", "", "", "", "",
        ".....LLLLLL.....",
        "...dddd" + luz * 2 + "dddd...",
        "..dddddddddddd..",
        "..llllllllllll..",
        "...llllllllll...",
        "....b......b...." if cepillo == 0 else "....B......B....",
    ]
    r = list(rows[11])
    r[s], r[s + 1] = "D", "D"
    rows[11] = "".join(r)
    return rows


def robot_caminar(f):
    rows = robot("c", f % 2)
    if f % 2 == 1:
        rows[14] = ".....b....b....."
    return render(bajar(rows, 0), ROBOT)


def robot_quieto(f):
    return render(robot("c" if f == 0 else "C"), ROBOT)


def robot_gesto(f):
    return render(robot("c", f, "frente" if f == 0 else "izq"), ROBOT)


def robot_dormir(f):
    rows = robot("m" if f == 0 else "n")
    rows[14] = ""
    rows = bajar(rows[:14], 1)
    return render(rows, ROBOT)


BASE_CARGA = P(D="#2c2f37", d="#454955", l="#9a9ba5", c="#4fd1d9", C="#2c7f86")


def robot_cama():
    rows = [
        "", "", "", "", "", "",
        "......dddd......",
        ".....dDDDDd.....",
        ".....dDccDd.....",
        ".....dDDDDd.....",
        "....dddddddd....",
        "...llllllllll...",
        "", "",
        "..DDDDDDDDDDDD..",
    ]
    return render(rows, BASE_CARGA)


# =====================================================================================================
# Hoja de mascotas
# =====================================================================================================
MASCOTAS = [
    ("gato", "Gato", gato_caminar, gato_quieto, gato_gesto, gato_dormir, gato_cama),
    ("perro", "Perro", perro_caminar, perro_quieto, perro_gesto, perro_dormir, perro_cama),
    ("conejo", "Conejo", conejo_caminar, conejo_quieto, conejo_gesto, conejo_dormir, conejo_cama),
    ("robot", "Robot aspiradora", robot_caminar, robot_quieto, robot_gesto, robot_dormir, robot_cama),
]
ANIM_M = [  # nombre, desde, cuadros, ms
    ("caminar-der", 0, 4, 130), ("caminar-izq", 4, 4, 130),
    ("quieto-der", 8, 2, 650), ("quieto-izq", 10, 2, 650),
    ("gesto-der", 12, 2, 320), ("gesto-izq", 14, 2, 320),
    ("dormir", 16, 2, 900), ("cama", 18, 1, 0),
]


def build_mascotas():
    cols = 19
    sheet = Image.new("RGBA", (cols * C, len(MASCOTAS) * C), (0, 0, 0, 0))
    for r, (mid, _, cam, qui, ges, dor, cama) in enumerate(MASCOTAS):
        cells = {}
        for f in range(4):
            cells[0 + f] = cam(f)
            cells[4 + f] = ImageOps.mirror(cells[0 + f])
        for f in range(2):
            cells[8 + f] = qui(f)
            cells[10 + f] = ImageOps.mirror(cells[8 + f])
            cells[12 + f] = ges(f)
            cells[14 + f] = ImageOps.mirror(cells[12 + f])
            cells[16 + f] = dor(f)
        cells[18] = cama()
        for c, im in cells.items():
            sheet.paste(im, (c * C, r * C), im)
    sheet.save(OUT / "mascotas.png")
    meta = {
        "imagen": "mascotas.png",
        "cuadro": {"ancho": C, "alto": C},
        "columnas": cols,
        "animaciones": {n: {"desde": d, "cuadros": k, "ms": ms} for n, d, k, ms in ANIM_M},
        "filas": [{"fila": i, "id": m[0], "nombre": m[1]} for i, m in enumerate(MASCOTAS)],
        "nota": "Cuadro (col, fila) = (animaciones[a].desde + i, filas[k].fila). Las -izq son el espejo de las -der. "
                "Patas o ruedas en la fila 15 y cuerpo centrado en x≈8: el pie de la mascota es (x+8, y+16) del cuadro. "
                "dormir se dibuja encima de cama, en la misma posición (cama va debajo). Todas en bucle. "
                "Escala entera con image-rendering: pixelated.",
    }
    (OUT / "mascotas.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return sheet, meta


# =====================================================================================================
# Efectos nuevos: sobre (vuela, llega, quieto, abre) y charla
# =====================================================================================================
SOBRE = P(w="#fbf9f3", W="#d9d4c8", y="#e2b23c", Y="#b8862a", s="#f6dc85")

SOBRE_BASE = [
    "wWwwwwwwwwWw",
    "wwWwwwwwwWww",
    "wwwWwwwwWwww",
    "wwwwWyyWwwww",
    "wwwwwYYwwwww",
    "wwwwwwwwwwww",
    "WWWWWWWWWWWW",
]


def poner(rows, ox, oy, shear=0.0):
    """Pone un mapa en un cuadro vacío de 16x16 en (ox, oy); shear inclina las filas (para el vuelo)."""
    g = [["."] * C for _ in range(C)]
    n = len(rows)
    for j, r in enumerate(rows):
        dx = round(shear * (j - (n - 1) / 2))
        for i, ch in enumerate(r):
            x, y = ox + i + dx, oy + j
            if ch != "." and 0 <= x < C and 0 <= y < C:
                g[y][x] = ch
    return ["".join(r) for r in g]


def sobre_vuela(f):
    # 0 derecho · 1 inclinado · 2 derecho y un pixel arriba · 3 inclinado al otro lado
    if f == 0:
        return render(poner(SOBRE_BASE, 2, 5), SOBRE)
    if f == 1:
        return render(poner(SOBRE_BASE, 2, 5, shear=-0.34), SOBRE)
    if f == 2:
        rows = list(SOBRE_BASE)
        rows[0], rows[1] = "wwWwwwwwwWww", "wwwWwwwwWwww"  # la solapa aletea
        rows[2] = "wwwwWwwWwwww"
        return render(poner(rows, 2, 4), SOBRE)
    return render(poner(SOBRE_BASE, 2, 5, shear=0.34), SOBRE)


def chispas(g, pts, ch="y"):
    g = [list(r) for r in g]
    for x, y in pts:
        if 0 <= x < C and 0 <= y < C and g[y][x] == ".":
            g[y][x] = ch
    return ["".join(r) for r in g]


def sobre_llega(f):
    if f == 0:
        rows = ["wWwwwwwwwwWw", "wwWwwwwwwWww", "wwwWwyyWwwww", "wwwwwYYwwwww", "wwwwwwwwwwww", "WWWWWWWWWWWW"]
        g = poner(rows, 2, 6)
        return render(chispas(g, [(1, 3), (14, 3), (0, 14), (15, 14)], "s"), SOBRE)
    if f == 1:
        rows = ["wWwwwwwwwwwWw", "wwWWwyywwWWww", "wwwwwYYwwwwww", "WWWWWWWWWWWWW"]
        g = poner(rows, 1, 8)
        g = chispas(g, [(1, 3), (14, 3), (0, 5), (15, 5)], "y")
        g = chispas(g, [(2, 2), (13, 2)], "s")
        return render(g, SOBRE)
    rows = ["wWwwwwwwwwWw", "wwWWyyWWwwww", "wwwwYYwwwwww", "WWWWWWWWWWWW"]
    g = poner(rows, 2, 8)
    g = chispas(g, [(0, 2), (15, 2)], "s")
    return render(g, SOBRE)


SOBRE_PLANO = [
    "wwwwwwwwww",
    "wWwwwwwwWw",
    "wwWwwwwWww",
    "wwwWyyWwww",
    "wwwwYYwwww",
    "WWWWWWWWWW",
]


def sobre_quieto():
    return render(poner(SOBRE_PLANO, 3, 8), SOBRE)


def sobre_abre(f):
    if f == 0:
        rows = [
            "....wWww....",
            "...wwwWww...",
            "..wwwwwWww..",
            ".wwwwwwwWww.",
            "WWWWWWWWWWWW",
            "wwwwwwwwwwww",
            "wwwwwYYwwwww",
            "wwwwwwwwwwww",
            "WWWWWWWWWWWW",
        ]
        return render(poner(rows, 2, 4), SOBRE)
    hoja = P(w="#fbf9f3", W="#d9d4c8", y="#e2b23c", Y="#b8862a", h="#ffffff", r="#9a9aa6")
    rows = [
        "...hhhhhh...",
        "...hrrrrh...",
        "...hhhhhh...",
        "...hrrrhh...",
        "..whhhhhhw..",
        ".wwwwwwwwww.",
        "WWWWWWWWWWWW",
        "wwwwwYYwwwww",
        "wwwwwwwwwwww",
        "WWWWWWWWWWWW",
    ]
    return render(poner(rows, 2, 3), hoja)


GLOBO = P(w="#fbf9f3", W="#d9d4c8")


def charla(f):
    puntos = {0: [4], 1: [4, 6], 2: [4, 6, 8]}[f]
    base = [
        "..wwwwwwwww.....",
        ".wwwwwwwwwww....",
        ".wwwwwwwwwww....",
        ".wwwwwwwwwww....",
        ".wwwwwwwwwww....",
        "..WWWWWWWWW.....",
        "..ww............",
        "..w.............",
    ]
    g = poner([r.rstrip(".") or "." for r in base], 1, 4)
    g = [list(r) for r in g]
    for x in puntos:
        g[4 + 3][1 + x] = "e"
    return render(["".join(r) for r in g], GLOBO)


NUEVOS = [  # nombre, cuadros, ms, bucle, función
    ("sobre-vuela", 4, 110, True, sobre_vuela),
    ("sobre-llega", 3, 90, False, sobre_llega),
    ("sobre-quieto", 1, 0, True, lambda f: sobre_quieto()),
    ("sobre-abre", 2, 160, False, sobre_abre),
    ("charla", 3, 300, True, charla),
]


def build_efectos():
    viejo = Image.open(BASE / "sprites" / "efectos.png").convert("RGBA")
    meta_v = json.loads((BASE / "sprites" / "efectos.json").read_text())
    n_viejo = viejo.width // C
    total = n_viejo + sum(n for _, n, _, _, _ in NUEVOS)
    sheet = Image.new("RGBA", (total * C, C), (0, 0, 0, 0))
    sheet.paste(viejo, (0, 0))
    anim = dict(meta_v["animaciones"])
    x = n_viejo
    for name, n, ms, bucle, fn in NUEVOS:
        anim[name] = {"desde": x, "cuadros": n, "ms": ms}
        if not bucle:
            anim[name]["bucle"] = False
        for f in range(n):
            im = fn(f)
            sheet.paste(im, (x * C, 0), im)
            x += 1
    sheet.save(OUT / "efectos.png")
    meta = {"imagen": "efectos.png", "cuadro": {"ancho": C, "alto": C}, "animaciones": anim,
            "nota": "Columnas 0–12 sin cambios desde JST-65. Nuevas en la 0.3.0: sobre-vuela, sobre-llega, sobre-quieto, sobre-abre y charla. "
                    "Las que llevan \"bucle\": false se muestran una vez y quedan en el último cuadro."}
    (OUT / "efectos.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    # verificación: columnas 0..12 idénticas a la hoja de JST-65
    nuevo = Image.open(OUT / "efectos.png").convert("RGBA").crop((0, 0, viejo.width, C))
    diff = ImageChops.difference(nuevo, viejo).getbbox()
    print(f"efectos: columnas 0–{n_viejo - 1} idénticas a JST-65: {'sí' if diff is None else 'NO ' + str(diff)}")
    return sheet, meta


# =====================================================================================================
# Vista previa
# =====================================================================================================
def font(n):
    return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", n)


def tile_fill(name, w, h):
    t = Image.open(BASE / "sprites" / "baldosas" / f"{name}.png").convert("RGBA")
    im = Image.new("RGBA", (w, h))
    for y in range(0, h, t.height):
        for x in range(0, w, t.width):
            im.paste(t, (x, y))
    return im


def preview(ms, mm, ef, em):
    Z = 6
    bg = (36, 36, 42, 255)
    W = max(ms.width * Z + 260, 2200)
    H = 60 + ms.height * Z + 80 + 4 * (16 * 3 + 30) + 80 + 4 * (16 * 3 + 30) + 120 + C * Z + 100
    img = Image.new("RGBA", (W, H), bg)
    d = ImageDraw.Draw(img)
    f20, f16 = font(20), font(16)
    y = 20
    d.text((20, y), "mascotas.png (16x16 por cuadro, a 6x)", fill=(240, 240, 240), font=f20)
    y += 36
    for name, a in mm["animaciones"].items():
        d.text((220 + a["desde"] * C * Z + 4, y), name, fill=(200, 200, 210), font=f16)
    y += 26
    img.paste(ms.resize((ms.width * Z, ms.height * Z), Image.NEAREST), (220, y), ms.resize((ms.width * Z, ms.height * Z), Image.NEAREST))
    for r in mm["filas"]:
        d.text((20, y + r["fila"] * C * Z + 40), r["nombre"], fill=(230, 230, 230), font=f20)
    # rejilla tenue
    for c in range(mm["columnas"] + 1):
        d.line([(220 + c * C * Z, y), (220 + c * C * Z, y + ms.height * Z)], fill=(60, 60, 70), width=1)
    y += ms.height * Z + 40
    # sobre las baldosas, a 3x
    d.text((20, y), "Sobre el piso, a 3x: caminar-der · quieto · gesto · dormir sobre su cama", fill=(240, 240, 240), font=f20)
    y += 34
    tiles = ["piso-madera-claro", "piso-madera-oscuro", "piso-baldosa-claro", "piso-baldosa-oscuro", "alfombra-jst-claro", "alfombra-mig-oscuro"]
    Z3 = 3
    for r in mm["filas"]:
        x = 20
        d.text((x, y + 40), r["nombre"], fill=(230, 230, 230), font=f16)
        x = 220
        for tname in tiles:
            box = tile_fill(tname, 16 * 6, 16 * 1 + 8)
            # 4 poses: caminar f0, quieto f0, gesto f0, dormir f0 + cama
            for i, col in enumerate([0, 8, 12, 18]):
                cell = ms.crop((col * C, r["fila"] * C, col * C + C, r["fila"] * C + C))
                box.paste(cell, (i * 24, -4), cell)
                if col == 18:
                    dorm = ms.crop((16 * C, r["fila"] * C, 16 * C + C, r["fila"] * C + C))
                    box.paste(dorm, (i * 24, -4), dorm)
            big = box.resize((box.width * Z3, box.height * Z3), Image.NEAREST)
            img.paste(big, (x, y))
            x += big.width + 16
        y += (16 + 8) * Z3 + 12
    y += 20
    # efectos nuevos
    d.text((20, y), "efectos.png: nuevos de la 0.3.0 (a 6x)", fill=(240, 240, 240), font=f20)
    y += 34
    x0 = 13 * C
    nuevos = ef.crop((x0, 0, ef.width, C))
    for name, a in em["animaciones"].items():
        if a["desde"] >= 13:
            d.text((20 + (a["desde"] - 13) * C * Z + 4, y), name, fill=(200, 200, 210), font=f16)
    y += 24
    img.paste(nuevos.resize((nuevos.width * Z, C * Z), Image.NEAREST), (20, y), nuevos.resize((nuevos.width * Z, C * Z), Image.NEAREST))
    y += C * Z + 20
    # sobre sobre un escritorio y sobre madera clara/oscura, a 3x
    for i, tname in enumerate(["piso-madera-claro", "piso-madera-oscuro", "alfombra-bet-claro", "alfombra-elm-oscuro"]):
        box = tile_fill(tname, nuevos.width, C)
        box.paste(nuevos, (0, 0), nuevos)
        big = box.resize((box.width * Z3, C * Z3), Image.NEAREST)
        img.paste(big, (20 + (i % 2) * (big.width + 20), y + (i // 2) * (C * Z3 + 12)))
    img = img.crop((0, 0, W, y + 2 * (C * Z3 + 12) + 20))
    img.save(OUT / "vista-previa-mascotas.png")


if __name__ == "__main__":
    ms, mm = build_mascotas()
    ef, em = build_efectos()
    preview(ms, mm, ef, em)
    print("ok", ms.size, ef.size)
