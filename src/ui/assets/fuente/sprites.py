"""Sprites propios de «Oficina global», dibujados desde cero con mapas de pixeles.

Uso:  /opt/homebrew/bin/python3.11 -I fuente/sprites.py
Genera en sprites/:
  personajes.png + personajes.json   cuadros de 16x24 px, una fila por aspecto (rol + variante)
  efectos.png    + efectos.json      cuadros de 16x16 px (Zz, alerta, humo, vapor, aviso)
  muebles.png    + muebles.json      atlas de muebles y baldosas (rectángulos con nombre)
  vista-previa.png                   hoja ampliada para revisar y presentar
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sprites"
OUT.mkdir(exist_ok=True)

FW, FH = 16, 24


def hx(c):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)


class Px:
    """Lienzo de un cuadro: diccionario (x, y) -> color."""

    def __init__(self, w=FW, h=FH):
        self.w, self.h, self.p = w, h, {}

    def put(self, x, y, c):
        if c is None or not (0 <= x < self.w and 0 <= y < self.h):
            return
        self.p[(x, y)] = c

    def stamp(self, rows, ox, oy, pal, flip=False):
        for j, row in enumerate(rows):
            n = len(row)
            for i, ch in enumerate(row):
                if ch == "." or ch == " ":
                    continue
                if ch == "_":  # borra
                    self.p.pop((ox + (n - 1 - i if flip else i), oy + j), None)
                    continue
                self.put(ox + (n - 1 - i if flip else i), oy + j, pal[ch])

    def img(self):
        im = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        for (x, y), c in self.p.items():
            im.putpixel((x, y), c)
        return im


# ---------------------------------------------------------------- paletas
OUTLINE = hx("#2a2230")
SKINS = {
    "clara": (hx("#f7d6bb"), hx("#e3ad8e")),
    "media": (hx("#e8b083"), hx("#c98a60")),
    "tostada": (hx("#bf8455"), hx("#9a653c")),
    "oscura": (hx("#7f4f31"), hx("#603823")),
}
HAIRS = {
    "negro": (hx("#2f2a36"), hx("#4a4256")),
    "castano": (hx("#5e3b24"), hx("#80553a")),
    "cobrizo": (hx("#a2492a"), hx("#c8673c")),
    "rubio": (hx("#d9a93f"), hx("#f0cf6e")),
    "gris": (hx("#8f9099"), hx("#bdbec7")),
    "azul": (hx("#2c3e66"), hx("#45609a")),
}

# ---------------------------------------------------------------- partes del cuerpo
# Cabeza 12x10 en (2,2). s piel, S sombra, o contorno.
HEAD = [
    "..oooooooo..",
    ".osssssssso.",
    "osssssssssso",
    "osssssssssso",
    "osssssssssso",
    "osssssssssso",
    "osssssssssso",
    "oSssssssssSo",
    ".oSssssssSo.",
    "..oooooooo..",
]
# Cara (sobre la cabeza): ojos, mejillas y boca
FACE = {
    "abierta": ["", "", "", "", "", "...e....e...", "...e....e...", "..r......r..", ".....mm....."],
    "parpadeo": ["", "", "", "", "", "", "...e....e...", "..r......r..", ".....mm....."],
    "susto": ["", "", "", "", "", "..ee....ee..", "...e....e...", "..r......r..", ".....oo.....", ".....oo....."],
    "dormida": ["", "", "", "", "", "..ee....ee..", "", "..r......r..", "......m....."],
    "sorbo": ["", "", "", "", "", "", "..ee....ee..", "..r......r..", ""],
}
# Peinados: (frente, atrás) en coordenadas de la cabeza (2,2); el de atrás se dibuja antes que el cuerpo.
HAIR = {
    "corto": ([
        "..oooooooo..",
        ".ohhhhhhhho.",
        "ohhHHhhhhhho",
        "ohhhhhhhhhho",
        "ohh.hhhhh.ho",
        "oh........ho",
        "oh.........o",
    ], None),
    "largo": ([
        "..oooooooo..",
        ".ohhhhhhhho.",
        "ohhHHhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhh.hhhho",
        "ohh......hho",
        "oh........ho",
        "oh........ho",
        "oh........ho",
    ], [
        "", "", "", "", "", "", "", "",
        "oh........ho",
        "ohh......hho",
        "ohho....ohho",
        "ohho....ohho",
        "oiio....oiio",
        ".oo......oo.",
    ]),
    "tomate": ([
        "....oooo....",
        "..oohhhhoo..",
        ".ohhhHhhhho.",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohh......hho",
        "oh........ho",
    ], None),
    "rizos": ([
        ".o.oo..oo.o.",
        "ohohhoohhoho",
        "ohhhHhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohh.hhh.hhho",
        "oh........ho",
        "oh........ho",
    ], None),
    "cola": ([
        "..oooooooo..",
        ".ohhhhhhhho.",
        "ohhHHhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhh.hho",
        "oh........ho",
        "oh.........o",
    ], [
        "", "", "", "", "",
        "...........oo",
        "...........ho",
        "...........ho",
        "...........hio",
        "............io",
        "............o.",
    ]),
    "rapado": ([
        "..oooooooo..",
        ".oiiiiiiiio.",
        "oiiiiiiiiiio",
        "oi........io",
    ], None),
}
# El moño va un poco más arriba que la cabeza
BUN = ["....oooo....", "...ohhHho...", "...ohhhho...", "....oooo...."]

# Cuerpo de pie (12 col, x=2..13, y=12..17)
TORSO_STAND = [
    ".occcccccco.",
    "occcccccccco",
    "ocCccccccCco",
    "ocCccccccCco",
    "osCccccccCso",
    ".oCCCCCCCCo.",
]
LEGS_STAND = [
    ".oppppppppo.",
    ".opppoopppo.",
    ".opPpoopPpo.",
    ".okkkookkko.",
    ".oooo..oooo.",
]
LEGS_WALK = [
    [".oppppppppo.", ".opppoopppo.", ".opPpo.oppo.", ".okkko.oPpo.", ".oooo..okkko", "......oooo.."],
    [".oppppppppo.", ".opppoopppo.", ".opPpoopPpo.", ".okkkookkko.", ".oooo..oooo.", ""],
    [".oppppppppo.", ".opppoopppo.", ".oppo.opPpo.", ".oPpo.okkko.", "okkko..oooo.", "..oooo......"],
    [".oppppppppo.", ".opppoopppo.", ".opPpoopPpo.", ".okkkookkko.", ".oooo..oooo.", ""],
]
# Sentado (12 col): los muslos vienen hacia nosotros y se ven las rodillas y los pies.
TORSO_SIT = TORSO_STAND
LEGS_SIT = [
    ".oppppppppo.",
    ".oPppppppPo.",
    "..oooooooo..",
    "..opo..opo..",
    "..okko.okko.",
    "..oooo.oooo.",
]


# ---------------------------------------------------------------- aspectos (rol + variante)
# Cada aspecto: piel, pelo, peinado, ropa (c, C), pantalón, accesorios.
def look(id, rol, piel, pelo, peinado, ropa, pantalon="#3b4257", **acc):
    c, C = ropa
    return dict(id=id, rol=rol, piel=piel, pelo=pelo, peinado=peinado, c=hx(c), C=hx(C), p=hx(pantalon), P=mix(hx(pantalon), (0, 0, 0), .25), **acc)


LOOKS = [
    # Dirección: traje y corbata
    look("direccion-1", "direccion", "clara", "castano", "corto", ("#2d3a5c", "#1f2942"), "#2d3a5c", corbata="#c8413b"),
    look("direccion-2", "direccion", "oscura", "negro", "rizos", ("#3a3d46", "#282a31"), "#3a3d46", corbata="#3f7fd0"),
    look("direccion-3", "direccion", "media", "cobrizo", "tomate", ("#5a5f6b", "#43474f"), "#43474f", corbata="#7a3fb0", auricular=True),
    look("direccion-4", "direccion", "tostada", "gris", "corto", ("#2d3a5c", "#1f2942"), "#2d3a5c", corbata="#d38b1f", lentes=True),
    # Ingeniería: polerón con capucha y audífonos
    look("ingenieria-1", "ingenieria", "clara", "negro", "corto", ("#2f8a83", "#22665f"), audifonos="#e0574f"),
    look("ingenieria-2", "ingenieria", "tostada", "castano", "cola", ("#6a4fb0", "#4f3a87"), audifonos="#3bc0b0"),
    look("ingenieria-3", "ingenieria", "media", "azul", "rapado", ("#454a55", "#30343c"), audifonos="#f2b632"),
    look("ingenieria-4", "ingenieria", "oscura", "negro", "rizos", ("#5d7a34", "#455b26"), audifonos="#e56aa6"),
    look("ingenieria-5", "ingenieria", "clara", "rubio", "largo", ("#2f6fb3", "#235486"), audifonos="#f08a3c"),
    # Diseño: boina y camisa clara
    look("diseno-1", "diseno", "media", "negro", "largo", ("#f0c9c0", "#d9a69b"), "#4a3f5c", boina="#a8323e"),
    look("diseno-2", "diseno", "clara", "cobrizo", "corto", ("#bfe0d2", "#94c4b0"), "#3b4257", boina="#2f6f8f"),
    look("diseno-3", "diseno", "oscura", "castano", "tomate", ("#f2e2a8", "#d8c47e"), "#5a4632", boina="#2f2a36"),
    # QA: chaleco reflectante
    look("qa-1", "qa", "tostada", "negro", "corto", ("#3d6fb6", "#2c548b"), chaleco=True),
    look("qa-2", "qa", "clara", "rubio", "cola", ("#3d6fb6", "#2c548b"), chaleco=True),
    look("qa-3", "qa", "media", "castano", "rizos", ("#3d6fb6", "#2c548b"), chaleco=True),
    # Revisión de código: visera verde y lentes
    look("revisor-1", "revisor", "clara", "gris", "corto", ("#7b4a3a", "#5c372b"), visera=True, lentes=True),
    look("revisor-2", "revisor", "oscura", "negro", "rapado", ("#4f6b4a", "#3a5036"), visera=True),
    look("revisor-3", "revisor", "media", "cobrizo", "largo", ("#6b5a8f", "#4f4269"), visera=True, lentes=True),
    # Documentación: chaleco de lana, lentes y libro
    look("docs-1", "docs", "media", "castano", "tomate", ("#c98c45", "#a46d2f"), "#4a3f5c", lentes=True, libro=True),
    # Marketing: chaqueta llamativa y lentes de sol
    look("marketing-1", "marketing", "tostada", "negro", "largo", ("#d1467e", "#a5325f"), "#2f2a36", sol=True),
    # Contenido: jockey y cámara
    look("contenido-1", "contenido", "clara", "rubio", "corto", ("#f08a3c", "#c56a26"), "#3b4257", jockey="#2f6fb3", camara=True),
    # Especificaciones (Speckit): casco blanco y plano
    look("specs-1", "specs", "media", "negro", "corto", ("#4b86c9", "#356aa3"), "#3b4257", casco=True),
    # Hermes: casco alado, túnica y bolso de mensajero
    look("hermes-1", "hermes", "clara", "rubio", "rizos", ("#f3efe4", "#d6cfbd"), "#8a6a3a", hermes=True),
]

ROL_NOMBRE = {
    "direccion": "Dirección", "ingenieria": "Ingeniería", "diseno": "Diseño", "qa": "QA", "revisor": "Revisión de código",
    "docs": "Documentación", "marketing": "Marketing", "contenido": "Contenido", "specs": "Especificaciones", "hermes": "Hermes",
}

GOLD, GOLD2 = hx("#e2b23c"), hx("#b8862a")
WHITE, WHITE2 = hx("#fbf9f3"), hx("#d9d4c8")


def pal(L, red=False):
    s, S = SKINS[L["piel"]]
    h, H = HAIRS[L["pelo"]]
    P = {
        "o": OUTLINE, "s": s, "S": S, "h": h, "H": H, "i": mix(h, (0, 0, 0), .3),
        "c": L["c"], "C": L["C"], "p": L["p"], "P": L["P"], "k": hx("#3a3340"),
        "e": OUTLINE, "r": hx("#ee9a8c"), "m": hx("#a8494a"),
        "w": WHITE, "W": WHITE2, "g": OUTLINE, "l": hx("#cfe3f5"),
        "u": hx("#f4efe4"), "U": hx("#c9bfae"), "q": hx("#6b3f22"),
        "y": GOLD, "Y": GOLD2, "x": hx("#2a2230"),
    }
    if red:
        R = hx("#e0443e")
        for k, v in list(P.items()):
            if k in ("o", "e", "g", "x"):
                P[k] = hx("#5a1418")
            elif k in ("w", "W", "u", "U", "l"):
                P[k] = mix(v, R, .45)
            else:
                P[k] = mix(v, R, .62)
    return P


def accessories_back(px, L, P, dy=0):
    """Lo que va detrás de la cabeza (por ahora nada)."""


def accessories_head(px, L, P, dy=0, sleep=False):
    """Sombreros y accesorios de cabeza, sobre el peinado."""
    if L.get("audifonos"):
        a = hx(L["audifonos"]) if not P["o"] == hx("#5a1418") else P["c"]
        pp = dict(P, a=a, A=mix(a, (0, 0, 0), .3), n=hx("#5b5f6b"))
        px.stamp([
            "...oooooooooo...",
            "..onnnnnnnnnno..",
        ], 0, 1 + dy, pp)
        if not sleep:
            for side in (0, 13):
                px.stamp(["ooo", "oaa", "oAa", "oaa", "ooo"] if side == 0 else ["ooo", "aao", "aAo", "aao", "ooo"], side, 6 + dy, pp)
    if L.get("auricular"):
        pp = dict(P, n=hx("#5b5f6b"), a=hx("#2a2230"))
        px.stamp(["...oooooooooo...", "..onnnnnnnnnno.."], 0, 1 + dy, pp)
        if not sleep:
            px.stamp(["oo", "an", "an", "on", ".n", ".n", ".nnn"], 1, 6 + dy, pp)
    if L.get("boina"):
        b = hx(L["boina"])
        pp = dict(P, b=b, B=mix(b, (0, 0, 0), .3), d=mix(b, (255, 255, 255), .25))
        px.stamp([
            "........oo......",
            ".......obo......",
            "...oooooooooo...",
            "..obbbdddbbbbo..",
            ".obbbbbbbbbbbbo.",
            ".oBBBBBBBBBBBBo.",
            "..oooooooooooo..",
        ], 0, -1 + dy, pp)
    if L.get("visera"):
        pp = dict(P, v=hx("#3f9a5a"), V=hx("#7fd393"), n=hx("#2e6b40"))
        px.stamp([
            "..onnnnnnnnnno..",
            ".ovvvvvvvvvvvvo.",
            ".oVVVVVVVVVVVVo.",
            "..oooooooooooo..",
        ], 0, 4 + dy, pp)
    if L.get("jockey"):
        j = hx(L["jockey"])
        pp = dict(P, j=j, J=mix(j, (0, 0, 0), .3), d=mix(j, (255, 255, 255), .3))
        px.stamp([
            "....oooooooo....",
            "...ojjjdjjjjo...",
            "..ojjjjdjjjjjo..",
            "..ojjjjjjjjjjo..",
            "..oJJJJJJJJJJoo.",
            "...ooooojJJJJJJo",
            "........ooooooo.",
        ], 0, 0 + dy, pp)
    if L.get("casco"):
        pp = dict(P, w=WHITE, W=WHITE2, n=hx("#f0b43a"))
        px.stamp([
            ".....oooooo.....",
            "...oowwwwwwoo...",
            "..owwwwnnwwwwo..",
            "..owwwwnnwwwwo..",
            ".oWWWWWWWWWWWWo.",
            "oWWWWWWWWWWWWWWo",
            ".oooooooooooooo.",
        ], 0, -1 + dy, pp)
    if L.get("hermes"):
        pp = dict(P, y=GOLD, Y=GOLD2, w=WHITE, W=WHITE2, z=hx("#f6dc85"))
        px.stamp([
            ".....oooooo.....",
            "...ooyyzzyyoo...",
            "..oyyyzyyyyyyo..",
            "..oyyyyyyyyyyo..",
            "..oYYYYYYYYYYo..",
            "...oooooooooo...",
        ], 0, 0 + dy, pp)
        # alas a los lados del casco
        px.stamp(["o...", "wo..", "wwo.", "Wwwo", ".ooo"], 0, 0 + dy, pp)
        px.stamp(["...o", "..ow", ".oww", "owwW", "ooo."], 12, 0 + dy, pp)


def accessories_face(px, L, P, dy=0, sleep=False, closed=False):
    """dy: desplazamiento de la cabeza respecto de y=2. Los ojos van en y=7..8 (x=5 y x=10)."""
    if L.get("lentes") and not L.get("sol"):
        rows = ["gggg..gggg", "gllggggllg", "geeg..geeg", "gggg..gggg"] if closed else ["gggg..gggg", "gleggggelg", "gleg..gelg", "gggg..gggg"]
        px.stamp(rows, 3, 6 + dy, dict(P, g=P["o"]))
    if L.get("sol") and not sleep:
        pp = dict(P, d=hx("#1d1a22"), z=hx("#6d6a80"))
        px.stamp(["oooooooooo", "odzdoodzdo", ".ooo..ooo."], 3, 7 + dy, pp)


def accessories_torso(px, L, P, dy=0, pose="stand"):
    """Corbata, chaleco, polerón, bolso… sobre el torso (y=12..17)."""
    y0 = 12 + dy
    if L.get("corbata"):
        t = hx(L["corbata"]) if P["o"] != hx("#5a1418") else P["C"]
        pp = dict(P, t=t, T=mix(t, (0, 0, 0), .3), w=P["w"])
        px.stamp(["....wwtww....", ".....wtw.....", "......T......", ".....tTt....."], 1, y0, pp)
    if L["rol"] == "ingenieria":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .25))
        px.stamp(["..odddddddo..", "....w..w....", "....w..w...."], 1, y0 - 1, pp)
    if L.get("chaleco"):
        pp = dict(P, v=hx("#f5b72a") if P["o"] != hx("#5a1418") else P["c"], V=hx("#d58d12"), z=hx("#e9eef2"))
        px.stamp(["..vvv..vvv..", "..vvv..vvv..", "..zzzzzzzz..", "..vvvvvvvv..", "..VVVVVVVV.."], 2, y0, pp)
    if L["rol"] == "revisor":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .22))
        px.stamp(["...w....w...", "...cdcdcd...", "...dcdcdc...", "...cdcdcd..."], 2, y0, pp)
    if L["rol"] == "docs":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .35))
        px.stamp(["....ww.ww...", ".....d.d....", ".....w.w....", ".....d.d...."], 2, y0, pp)
    if L["rol"] == "marketing":
        px.stamp(["....xxxx....", "....xxxx....", ".....xx.....", "............"], 2, y0, P)
    if L["rol"] == "diseno":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .5))
        px.stamp(["............", "...dddddd...", "............", "...dddddd...", "............"], 2, y0, pp)
    if L.get("camara"):
        pp = dict(P, n=hx("#2a2230"), z=hx("#8fd0f0"))
        px.stamp(["...x....x...", "....x..x....", "....oooo....", "....ozno....", "....oooo...."], 2, y0, pp)
    if L.get("casco"):
        pp = dict(P, b=hx("#cfe0f7"))
        px.stamp(["............", "............", "...bbbbbb...", "............"], 2, y0, pp)
    if L.get("hermes"):
        pp = dict(P, y=GOLD, Y=GOLD2, q=hx("#8a5a2b"), Q=hx("#6a4220"))
        px.stamp(["..y.........", "...y........", "....y.......", ".....y......", "......qqq...", "......QQQ..."], 2, y0, pp)


def draw(L, pose, f=0):
    """pose: teclear(0-3) mano(0-1) error(0-1) dormir(0-1) libre(0-5) sofa(0-3) caminar(0-3) sentado parado"""
    red = pose == "error"
    P = pal(L, red)
    px = Px()
    seated = pose in ("teclear", "mano", "error", "dormir", "sofa", "sentado")
    sleep = pose == "dormir"
    dx = 1 if (red and f == 1) else 0
    bob = 0
    if pose == "caminar":
        bob = -1 if f in (0, 2) else 0
    hy = 2 + bob + (2 if sleep else 0) + (1 if sleep and f == 1 else 0)
    hair_front, hair_back = HAIR[L["peinado"]]
    # pelo de atrás
    if hair_back and not sleep:
        px.stamp(hair_back, 2 + dx, hy, P)
    # piernas
    legs = LEGS_SIT if seated else (LEGS_WALK[f] if pose == "caminar" else LEGS_STAND)
    px.stamp(legs, 2 + dx, 18 + bob, P)
    # torso
    px.stamp(TORSO_STAND, 2 + dx, 12 + bob, P)
    accessories_torso(px, L, P, bob)
    # cabeza
    if sleep:
        # cabeza apoyada sobre los brazos, ojos cerrados
        px.stamp(HEAD, 2 + dx, hy, P)
        px.stamp(FACE["dormida"], 2 + dx, hy, P)
        px.stamp(hair_front, 2 + dx, hy, P)
        if L["peinado"] == "tomate":
            px.stamp(BUN, 2 + dx, hy - 2, P)
        accessories_head(px, L, P, hy - 2)
        accessories_face(px, L, P, hy - 2, closed=True)
    else:
        px.stamp(HEAD, 2 + dx, hy, P)
        face = "abierta"
        if pose == "libre" and f == 1 or pose == "sofa" and f == 1:
            face = "parpadeo"
        if red:
            face = "susto"
        if (pose == "libre" and f in (3, 4)) or (pose == "sofa" and f == 3):
            face = "sorbo"
        px.stamp(FACE[face], 2 + dx, hy, P)
        px.stamp(hair_front, 2 + dx, hy, P)
        if L["peinado"] == "tomate":
            px.stamp(BUN, 2 + dx, hy - 2, P)
        accessories_head(px, L, P, hy - 2)
        accessories_face(px, L, P, hy - 2)

    # brazos según pose (sobre el torso)
    arms(px, L, P, pose, f, dx, bob)
    return px


def arms(px, L, P, pose, f, dx, bob):
    y = 12 + bob
    if pose == "teclear":
        # manos hacia el teclado; alternan arriba/abajo
        l_up, r_up = [(1, 0), (0, 1), (0, 0), (1, 1)][f]
        px.stamp(["oco", "oCo", "oCo"], 1 + dx, y + 1, P)
        px.stamp(["oco", "oCo", "oCo"], 12 + dx, y + 1, P)
        px.stamp(["osso", "oooo"], 3 + dx, y + 4 - l_up, P)
        px.stamp(["osso", "oooo"], 9 + dx, y + 4 - r_up, P)
    elif pose == "mano":
        # brazo levantado (a la izquierda de la pantalla); la mano saluda de un lado a otro
        if f == 0:
            arm = [".oo.", "osso", "osso", "oooo", "occo", "occo", "occo", "oCco", "oCco", "oCco", "oCco"]
            px.stamp(arm, 0, 1, P)
        else:
            arm = ["..oo.", ".osso", ".osso", "ooooo", "occo.", "occo.", "occo.", "oCco.", "oCco.", "oCco.", "oCco."]
            px.stamp(arm, 0, 1, P)
            px.stamp(["o", "o", "o"], 4, 1, P)
        px.stamp(["oco", "oCo", "oso"], 12, y + 1, P)
    elif pose == "error":
        # manos a la cabeza
        px.stamp(["oso", "oco", "oco", "oCo", "oCo"], 0 + dx, 7, P)
        px.stamp(["oso", "oco", "oco", "oCo", "oCo"], 13 + dx, 7, P)
    elif pose == "dormir":
        # brazos cruzados sobre el escritorio
        yy = 15
        px.stamp(["..oooooooooooo..", ".occcccccccccccco", "ocCssccccccssCco", ".oooooooooooooo."], 0 + dx, yy, P)
    elif pose in ("libre", "sofa"):
        # taza en la mano (a la derecha de la pantalla): abajo, a medio camino o tomando un sorbo
        fr = f if pose == "libre" else [0, 1, 3, 4][f]
        MUG = ["ooooo.", "oqqqoo", "ouuuo.o"[:6], "ouUuoo", ".ooo.."]
        px.stamp(["oCo", "oco", "oso"], 1, y + 1, P)
        if fr in (0, 1):
            px.stamp(["oco", "oCo", "oso"], 12, y + 1, P)
            px.stamp(MUG, 11, y + 3, P)
        elif fr in (2, 5):
            px.stamp(["oco", "oso"], 12, y + 1, P)
            px.stamp(MUG, 10, y - 1, P)
        else:
            px.stamp(["occo", "osso"], 10, y + 1, P)
            px.stamp(MUG, 7, y - 4, P)
    elif pose == "caminar":
        sw = [1, 0, -1, 0][f]
        px.stamp(["oco", "oCo", "oso"], 1, y + 1 + max(0, sw), P)
        px.stamp(["oco", "oCo", "oso"], 12, y + 1 + max(0, -sw), P)
    else:  # sentado / parado
        px.stamp(["oco", "oCo", "oso"], 1 + dx, y + 1, P)
        px.stamp(["oco", "oCo", "oso"], 12 + dx, y + 1, P)


ANIM = [  # nombre, cuadros, ms por cuadro, bucle
    ("teclear", 4, 140), ("mano", 2, 420), ("error", 2, 160), ("dormir", 2, 900),
    ("libre", 6, 520), ("sofa", 4, 600), ("caminar", 4, 150), ("sentado", 1, 0), ("parado", 1, 0),
]


def build_characters():
    cols = sum(n for _, n, _ in ANIM)
    sheet = Image.new("RGBA", (cols * FW, len(LOOKS) * FH), (0, 0, 0, 0))
    frames, x = {}, 0
    for name, n, ms in ANIM:
        frames[name] = {"desde": x, "cuadros": n, "ms": ms}
        x += n
    for r, L in enumerate(LOOKS):
        for name, n, ms in ANIM:
            for f in range(n):
                im = draw(L, name, f).img()
                sheet.paste(im, ((frames[name]["desde"] + f) * FW, r * FH), im)
    sheet.save(OUT / "personajes.png")
    meta = {
        "imagen": "personajes.png", "cuadro": {"ancho": FW, "alto": FH}, "columnas": cols,
        "animaciones": frames,
        "filas": [{"fila": i, "id": L["id"], "rol": L["rol"], "rolNombre": ROL_NOMBRE[L["rol"]]} for i, L in enumerate(LOOKS)],
        "nota": "Cuadro (col, fila) = (animaciones[a].desde + i, filas[k].fila). Escala entera (1x, 2x, 3x) con image-rendering: pixelated.",
    }
    (OUT / "personajes.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return sheet, meta


# ---------------------------------------------------------------- efectos 16x16
def build_effects():
    P = {"o": OUTLINE, "w": WHITE, "W": WHITE2, "z": hx("#8fa3c8"), "Z": hx("#5f739c"), "r": hx("#e0443e"), "R": hx("#a8282a"),
         "g": hx("#9a9aa6"), "G": hx("#6e6e7a"), "s": hx("#e8e8ef"), "v": hx("#7c3aed"), "V": hx("#5b21b6"), "y": hx("#fde68a"),
         "h": hx("#f7d6bb"), "H": hx("#e3ad8e")}
    E = {
        "zz": [
            ["................", "................", "................", "................", "................", "................", "................",
             "................", "................", "........ooooo...", "........ozzzo...", "..........oo....", ".........oo.....", "........ozzzo...", "........ooooo...", "................"],
            ["................", "................", "................", "...........oooo.", "...........ozzo.", "............oo..", "...........ozzo.",
             "...........oooo.", "........ooooo...", "........ozzzo...", "..........oo....", ".........oo.....", "........ozzzo...", "........ooooo...", "................", "................"],
            ["..........oooo..", "..........ozzo..", "...........oo...", "..........ozzo..", "..........oooo..", "................", ".......ooooo....",
             ".......ozzzo....", ".........oo.....", "........oo......", ".......ozzzo....", ".......ooooo....", "................", "................", "................", "................"],
        ],
        "alerta": [
            ["................", ".......oo.......", "......orro......", "......orro......", ".....orrrro.....", ".....orwwro.....", "....orrwwrro....",
             "....orrwwrro....", "...orrrwwrrro...", "...orrrrrrrro...", "..orrrrwwrrrro..", "..orrrrwwrrrro..", ".orrrrrrrrrrrro.", ".oRRRRRRRRRRRRo.", "..oooooooooooo..", "................"],
            ["................", "................", ".......oo.......", "......orro......", "......orro......", ".....orwwro.....", ".....orwwro.....",
             "....orrwwrro....", "....orrwwrro....", "...orrrrrrrro...", "...orrrwwrrro...", "..orrrrwwrrrro..", "..oRRRRRRRRRRo..", "...oooooooooo...", "................", "................"],
        ],
        "humo": [
            ["................", "................", "................", "................", "................", "................", "................",
             "................", "................", "................", "......ooo.......", ".....oggo.......", ".....oGgo.......", "......ooo.......", "................", "................"],
            ["................", "................", "................", "................", "................", "................", "........oooo....",
             ".......ogsgo...", ".......oggGo....", "......oooooo....", ".....oggo.......", ".....oGgo.......", "......oo........", "................", "................", "................"],
            ["................", "................", "..........oooo..", ".........ossgo..", ".........ogggo..", ".........oGGo...", "......oooooo....",
             ".....ogsggo.....", ".....oggGo......", "......ooo.......", "................", "................", "................", "................", "................", "................"],
        ],
        "vapor": [
            ["................", "................", "................", "................", "................", "................", "................",
             "................", "................", "......s.........", ".......s........", "......s.........", "................", "................", "................", "................"],
            ["................", "................", "................", "................", "................", "................", ".......s........",
             "......s.........", ".......s...s....", "......s....s....", "...........s....", "................", "................", "................", "................", "................"],
            ["................", "................", "................", "................", "......s.........", ".......s........", "......s....s....",
             "..........s.....", "...........s....", "................", "................", "................", "................", "................", "................", "................"],
        ],
        "aviso": [  # globo violeta con una mano: «te necesita» a escala chica (widget, TV, mapa)
            ['.oooooooooooooo.', 'ovvvvvvvvvvvvvvo', 'ovvvvooooooovvvo', 'ovvvvohohohovvvo', 'ovvvvohohohovvvo', 'ovvvohhhhhhhovvo', 'ovohhhhhhhhhovvo', 'ovvohhhhhhhhovvo', 'ovvvohhhhhhovvvo', 'ovvvvohhhhovvvvo', 'ovvvvvoooovvvvvo', 'oVVVVVVVVVVVVVVo', '.ooooooVVoooooo.', '.......oVo......', '........o.......', '................'],
            ['................', '.oooooooooooooo.', 'ovvvvvvvvvvvvvvo', 'ovvvvooooooovvvo', 'ovvvvohohohovvvo', 'ovvvvohohohovvvo', 'ovvvohhhhhhhovvo', 'ovohhhhhhhhhovvo', 'ovvohhhhhhhhovvo', 'ovvvohhhhhhovvvo', 'ovvvvohhhhovvvvo', 'ovvvvvoooovvvvvo', 'oVVVVVVVVVVVVVVo', '.ooooooVVoooooo.', '.......oVo......', '........o.......'],
        ],
    }
    order = [(k, len(v)) for k, v in E.items()]
    cols = sum(n for _, n in order)
    sheet = Image.new("RGBA", (cols * 16, 16), (0, 0, 0, 0))
    meta, x = {}, 0
    for k, fr in E.items():
        meta[k] = {"desde": x, "cuadros": len(fr), "ms": {"zz": 700, "alerta": 450, "humo": 260, "vapor": 380, "aviso": 520}[k]}
        for rows in fr:
            px = Px(16, 16)
            px.stamp([r[:16] for r in rows], 0, 0, P)
            sheet.paste(px.img(), (x * 16, 0))
            x += 1
    sheet.save(OUT / "efectos.png")
    (OUT / "efectos.json").write_text(json.dumps({"imagen": "efectos.png", "cuadro": {"ancho": 16, "alto": 16}, "animaciones": meta}, ensure_ascii=False, indent=1))
    return sheet, meta


if __name__ == "__main__":
    import muebles  # noqa: E402  (atlas de muebles y salas, en su propio archivo)
    ch, chm = build_characters()
    ef, efm = build_effects()
    mu, mum = muebles.build(OUT)
    # vista previa ampliada
    Z = 4
    W = ch.width * Z + 40
    prev = Image.new("RGBA", (W, ch.height * Z + 80), (36, 36, 42, 255))
    prev.paste(ch.resize((ch.width * Z, ch.height * Z), Image.NEAREST), (20, 60))
    d = ImageDraw.Draw(prev)
    f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    for name, a in chm["animaciones"].items():
        d.text((20 + a["desde"] * FW * Z + 4, 22), name, fill=(230, 230, 230), font=f)
    prev.save(OUT / "vista-previa-personajes.png")
    print("ok", ch.size, ef.size, mu.size)
