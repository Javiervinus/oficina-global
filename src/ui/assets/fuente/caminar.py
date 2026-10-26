"""Sprites de personajes de «Oficina global» 0.3.0 (JST-96): caminar de espalda y de lado, charlar y escuchar.

Uso:  /opt/homebrew/bin/python3.11 -I fuente/caminar.py
Parte de la hoja de JST-65 (columnas 0–25, sin cambios) y agrega:
  caminar-arriba 26–29 · caminar-izq 30–33 · caminar-der 34–37 · charlar-izq 38–39 · charlar-der 40–41
  escuchar-izq 42 · escuchar-der 43
Genera en sprites/: personajes.png + personajes.json y vista-previa-caminar.png.
El lado izquierdo es el espejo exacto del derecho. Reutiliza paletas, aspectos y accesorios de
oficina-global/fuente/sprites.py (generador de JST-65), que no se modifica.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent.parent / "oficina-global"
sys.path.insert(0, str(BASE / "fuente"))
import sprites as S  # noqa: E402  (generador de JST-65)
from PIL import Image, ImageChops, ImageDraw, ImageFont  # noqa: E402

OUT = HERE.parent / "sprites"
OUT.mkdir(exist_ok=True)
FW, FH = S.FW, S.FH
hx, mix = S.hx, S.mix

# ---------------------------------------------------------------- vista de ESPALDA
# Cabeza vista desde atrás: el pelo la cubre (12 columnas en x = 2, filas desde hy).
HAIR_BACK = {
    "corto": [
        "..oooooooo..",
        ".ohhhhhhhho.",
        "ohhHHhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "oihhhhhhhhio",
        ".oiSSSSSSio.",
        "..oooooooo..",
    ],
    "largo": [
        "..oooooooo..",
        ".ohhhhhhhho.",
        "ohhHHhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        ".ohhhhhhhho.",
        ".ohhhhhhhho.",
        ".oihhihhhio.",
        "..oooooooo..",
    ],
    "tomate": [
        "..oooooooo..",
        ".ohhhhhhhho.",
        "ohhhHHhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "oihhhhhhhhio",
        ".oiSSSSSSio.",
        "..oooooooo..",
    ],
    "rizos": [
        ".o.oo..oo.o.",
        "ohohhoohhoho",
        "ohhhHhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        ".ohhihhihho.",
        "..oooooooo..",
    ],
    "cola": [
        "..oooooooo..",
        ".ohhhhhhhho.",
        "ohhHHhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "ohhhhhhhhhho",
        "oihhhhhhhhio",
        ".oiSSSSSSio.",
        "..oooooooo..",
    ],
    "rapado": [
        "..oooooooo..",
        ".oiiiiiiiio.",
        "oiiiiiiiiiio",
        "oiiiiiiiiiio",
        "oiiiiiiiiiio",
        "oiiiiiiiiiio",
        "oiiiiiiiiiio",
        "oSiiiiiiiiSo",
        ".oSSSSSSSSo.",
        "..oooooooo..",
    ],
}
# Peinados con las orejas a la vista desde atrás
EARS_BACK = ("corto", "tomate", "cola", "rapado")
# Cola de caballo al centro de la nuca (sobre el pelo)
TAIL_BACK = [".oo.", "ohho", "ohHo", "ohho", "ohho", ".oo."]


def acc_head_back(px, L, P, hy):
    dy = hy - 2
    # Audífonos, auricular, boina, casco y casco alado se ven igual desde atrás (son simétricos)
    keep = {k: L[k] for k in ("audifonos", "auricular", "boina", "casco", "hermes") if L.get(k)}
    if keep:
        S.accessories_head(px, dict(keep, rol=L["rol"]), P, dy)
    if L.get("visera"):  # desde atrás, solo la cinta verde
        pp = dict(P, v=hx("#3f9a5a"), V=hx("#2e6b40"))
        px.stamp(["..ovvvvvvvvvvo..", "...oVVVVVVVVo..."], 0, 5 + dy, pp)
    if L.get("jockey"):  # gorra por detrás, con el cierre
        j = hx(L["jockey"])
        pp = dict(P, j=j, J=mix(j, (0, 0, 0), .3), d=mix(j, (255, 255, 255), .3))
        px.stamp([
            "....oooooooo....",
            "...ojjjdjjjjo...",
            "..ojjjjdjjjjjo..",
            "..ojjjjjjjjjjo..",
            "..oJJJJoJJJJJo..",
            "...ooooooooooo..",
        ], 0, 0 + dy, pp)


def torso_back(px, L, P, dy):
    y0 = 12 + dy
    if L["rol"] == "ingenieria":  # capucha del polerón sobre la espalda
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .25))
        px.stamp(["...oddddddo...", "....oddddo....", ".....oooo....."], 1, y0, pp)
    if L.get("chaleco"):
        pp = dict(P, v=hx("#f5b72a"), V=hx("#d58d12"), z=hx("#e9eef2"))
        px.stamp(["..vvvvvvvv..", "..vvvvvvvv..", "..zzzzzzzz..", "..vvvvvvvv..", "..VVVVVVVV.."], 2, y0, pp)
    if L["rol"] == "revisor":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .22))
        px.stamp(["............", "...cdcdcd...", "...dcdcdc...", "...cdcdcd..."], 2, y0, pp)
    if L["rol"] == "diseno":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .5))
        px.stamp(["............", "...dddddd...", "............", "...dddddd...", "............"], 2, y0, pp)
    if L.get("camara"):  # la correa por detrás del cuello
        px.stamp(["...x....x...", "....xxxx...."], 2, y0, P)
    if L.get("hermes"):  # correa cruzada y bolso al costado (espejo de la vista de frente)
        pp = dict(P, y=S.GOLD, q=hx("#8a5a2b"), Q=hx("#6a4220"))
        px.stamp(["..y.........", "...y........", "....y.......", ".....y......", "......qqq...", "......QQQ..."], 2, y0, pp, flip=True)


def draw_back(L, f):
    P = S.pal(L)
    px = S.Px()
    bob = -1 if f in (0, 2) else 0
    hy = 2 + bob
    px.stamp(S.LEGS_WALK[f], 2, 18 + bob, P)
    px.stamp(S.TORSO_STAND, 2, 12 + bob, P)
    torso_back(px, L, P, bob)
    sw = [1, 0, -1, 0][f]
    y = 12 + bob
    px.stamp(["oco", "oCo", "oso"], 1, y + 1 + max(0, -sw), P)
    px.stamp(["oco", "oCo", "oso"], 12, y + 1 + max(0, sw), P)
    peinado = L["peinado"]
    px.stamp(HAIR_BACK[peinado], 2, hy, P)
    if peinado in EARS_BACK and not (L.get("audifonos") or L.get("auricular")):
        # orejas a los lados de la cabeza: sobresalen 1 px
        px.stamp(["os", "oS"], 1, hy + 5, P)
        px.stamp(["so", "So"], 13, hy + 5, P)
    if peinado == "tomate":
        px.stamp(S.BUN, 2, hy - 2, P)
    if peinado == "cola":
        px.stamp(TAIL_BACK, 6, hy + 6, P)
    acc_head_back(px, L, P, hy)
    return px


# ---------------------------------------------------------------- vista de LADO (mirando a la derecha)
HEAD_SIDE = [
    "....oooooooo....",
    "...osssssssso...",
    "..osssssssssso..",
    "..osssssssssso..",
    "..osssssssssso..",
    "..osssssssssso..",
    "..ossssssssssso.",
    "..oSsssssssssso.",
    "...oSssssssssoo.",
    "....oooooooooo..",
]
# Pelo de perfil: (filas, desplazamiento en y respecto de hy). '.' deja ver la cabeza.
HAIR_SIDE = {
    "corto": ([
        "....oooooooo....",
        "...ohhhhhhhho...",
        "..ohhHHhhhhhho..",
        "..ohhhhhhhhhho..",
        "..ohhhhhhhhh.o..",
        "..ohhhhh........",
        "..ohhhh.........",
        "..oihh..........",
    ], 0),
    "largo": ([
        "....oooooooo....",
        "...ohhhhhhhho...",
        "..ohhHHhhhhhho..",
        ".ohhhhhhhhhhho..",
        ".ohhhhhhhhhh.o..",
        ".ohhhhhhhh......",
        ".ohhhhhhh.......",
        ".ohhhhhhh.......",
        ".ohhhhhh........",
        ".ohhhhho........",
        ".ohhhho.........",
        ".ohhhho.........",
        ".oihhio.........",
        "..oooo..........",
    ], 0),
    "tomate": ([
        "....oooooooo....",
        "...ohhHhhhhho...",
        "..ohhhHhhhhhho..",
        "..ohhhhhhhhhho..",
        "..ohhhhhhhh..o..",
        "..ohhhhh........",
        "..ohhhh.........",
        "..oihh..........",
    ], 0),
    "rizos": ([
        "....o.oo.oo.....",
        "...ohohhohhoo...",
        "..ohhhhhhhhhhoo.",
        ".ohhhHhhhhhhhho.",
        ".ohhhhhhhhhhhho.",
        ".ohhhhhhhhhhh.o.",
        ".ohhhhhhhh......",
        ".ohhhhhhh.......",
        "..ohhhhhh.......",
        "...ohhhho.......",
        "....oooo........",
    ], -1),
    "cola": ([
        "....oooooooo....",
        "...ohhhhhhhho...",
        "..ohhHHhhhhhho..",
        "..ohhhhhhhhhho..",
        "..ohhhhhhhh..o..",
        "..ohhhhh........",
        "..ohhhh.........",
        "..oihh..........",
    ], 0),
    "rapado": ([
        "....oooooooo....",
        "...oiiiiiiiio...",
        "..oiiiiiiiiiio..",
        "..oiiiiiiii..o..",
        "..oiiiiii.......",
        "..oiiii.........",
        "..oiii..........",
        "..oSi...........",
    ], 0),
}
# Moño (tomate) y cola de caballo, detrás de la cabeza: se dibujan antes que ella.
BUN_SIDE = ([".oooo.", "ohHhho", "ohhhho", "ohhhho", ".oooo."], 0, -2)
TAIL_SIDE = ([".oo.", "ohho", "ohHo", "ohho", "ohho", ".oho", ".oio", "..o."], 0, 3)
EAR_SIDE = ("corto", "tomate", "cola", "rapado")

TORSO_SIDE = [
    ".....occcco.....",
    "....occcccco....",
    "....oCccccco....",
    "....oCccccco....",
    "....oCccccco....",
    ".....oCCCCo.....",
]
LEGS_SIDE = [
    [  # 0 · contacto: la pierna de adelante (cercana) adelante
        ".....oppppo.....",
        "....oPPoppo.....",
        "...oPPo.oppo....",
        "..oPPo...oppo...",
        "..okko...okkko..",
        "..oooo...ooooo..",
    ],
    [  # 1 · paso: la cercana apoyada, la lejana se levanta atrás
        ".....oppppo.....",
        "....oPPoppo.....",
        "...okkoopppo....",
        "....oo..okkko...",
        "........ooooo...",
    ],
    [  # 2 · contacto: la lejana adelante
        ".....oppppo.....",
        "....oppoPPo.....",
        "...oppo.oPPo....",
        "..oppo...oPPo...",
        "..okko...okkko..",
        "..oooo...ooooo..",
    ],
    [  # 3 · paso: la lejana apoyada, la cercana se levanta atrás
        ".....oppppo.....",
        "....oppoPPo.....",
        "...okkooPPPo....",
        "....oo..okkko...",
        "........ooooo...",
    ],
]
LEGS_SIDE_STAND = [
    ".....oppppo.....",
    ".....oPpppo.....",
    ".....oPpppo.....",
    ".....okkkkko....",
    ".....ooooooo....",
]
# Brazo de perfil: (x, filas) desde el hombro (y = 13 + bob)
ARM_NEUTRAL = (6, ["oco", "oCo", "oCo", "oso", "ooo"])
ARM_BACK = (None, [(6, "oco"), (5, "oCo"), (4, "oCo"), (3, "oso"), (3, "ooo")])
ARM_FWD = (None, [(6, "oco"), (7, "oCo"), (8, "oCo"), (9, "oso"), (9, "ooo")])


def arm(px, P, kind, y, far=False):
    pp = dict(P, c=P["C"], s=P["S"]) if far else P
    if kind == "neutral":
        x, rows = ARM_NEUTRAL
        px.stamp(rows, x, y, pp)
        return
    rows = (ARM_BACK if kind == "back" else ARM_FWD)[1]
    for j, (x, r) in enumerate(rows):
        px.stamp([r], x, y + j, pp)


def acc_head_side(px, L, P, hy):
    dy = hy - 2
    if L.get("audifonos"):
        a = hx(L["audifonos"])
        pp = dict(P, a=a, A=mix(a, (0, 0, 0), .3), n=hx("#5b5f6b"))
        px.stamp(["ooo", "ono", "ono", "ono", "ono"], 7, hy - 1, pp)
        px.stamp([".oo.", "oaao", "oAao", "oaao", ".oo."], 6, hy + 4, pp)
    if L.get("auricular"):
        pp = dict(P, n=hx("#5b5f6b"), a=hx("#2a2230"))
        px.stamp(["ooo", "ono", "ono", "ono", "ono"], 7, hy - 1, pp)
        px.stamp(["oo", "an"], 7, hy + 4, pp)
        px.stamp(["n...", ".n..", "..nn", "...a"], 8, hy + 5, pp)
    if L.get("boina"):
        b = hx(L["boina"])
        pp = dict(P, b=b, B=mix(b, (0, 0, 0), .3), d=mix(b, (255, 255, 255), .25))
        px.stamp([
            ".......oo.......",
            "......obo.......",
            "..ooooooooooo...",
            ".obbbdddbbbbbo..",
            "obbbbbbbbbbbbbo.",
            "oBBBBBBBBBBBBo..",
            ".ooooooooooo....",
        ], 0, -1 + dy, pp)
    if L.get("visera"):
        pp = dict(P, v=hx("#3f9a5a"), V=hx("#7fd393"), n=hx("#2e6b40"))
        px.stamp([
            "..onnnnnnnnnnoo.",
            "..........oVVVVo",
            "...........oooo.",
        ], 0, 4 + dy, pp)
    if L.get("jockey"):
        j = hx(L["jockey"])
        pp = dict(P, j=j, J=mix(j, (0, 0, 0), .3), d=mix(j, (255, 255, 255), .3))
        px.stamp([
            "....oooooooo....",
            "...ojjjdjjjjo...",
            "..ojjjjdjjjjjo..",
            "..ojjjjjjjjjjo..",
            "..oJJJJJJJJJJooo",
            "...ooooooooJJJJo",
            "...........oooo.",
        ], 0, 0 + dy, pp)
    if L.get("casco"):
        pp = dict(P, w=S.WHITE, W=S.WHITE2, n=hx("#f0b43a"))
        px.stamp([
            ".....oooooo.....",
            "...oowwwwwwoo...",
            "..owwnnwwwwwwo..",
            "..owwnnwwwwwwo..",
            ".oWWWWWWWWWWWWo.",
            "oWWWWWWWWWWWWWWo",
            ".oooooooooooooo.",
        ], 0, -1 + dy, pp)
    if L.get("hermes"):
        pp = dict(P, y=S.GOLD, Y=S.GOLD2, w=S.WHITE, W=S.WHITE2, z=hx("#f6dc85"))
        px.stamp([
            ".....oooooo.....",
            "...ooyyyzzyoo...",
            "..oyyyyyzyyyyo..",
            "..oyyyyyyyyyyo..",
            "..oYYYYYYYYYYo..",
            "...oooooooooo...",
        ], 0, 0 + dy, pp)
        # un ala hacia atrás
        px.stamp(["o...", "wo..", "wwo.", "Wwwo", ".ooo"], 1, 0 + dy, pp)


def acc_face_side(px, L, P, hy, closed=False):
    if L.get("lentes") and not L.get("sol"):
        g = P["o"]
        pp = dict(P, g=g)
        px.stamp(["...ggg", "gggg.l", "...g.l", "...ggg"], 7, hy + 4, pp)
    if L.get("sol"):
        pp = dict(P, d=hx("#1d1a22"), z=hx("#6d6a80"))
        px.stamp(["ooooo", "...dz", "...oo"], 8, hy + 5, pp)


def torso_side(px, L, P, dy):
    y0 = 12 + dy
    if L.get("corbata"):
        t = hx(L["corbata"])
        pp = dict(P, t=t, T=mix(t, (0, 0, 0), .3))
        px.stamp(["w.", ".t", ".t", ".T"], 9, y0, pp)
    if L["rol"] == "ingenieria":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .25))
        px.stamp([".oo.", "oddo", ".oo."], 2, y0, pp)
        px.stamp(["w", "w"], 9, y0 + 1, P)
    if L.get("chaleco"):
        pp = dict(P, v=hx("#f5b72a"), V=hx("#d58d12"), z=hx("#e9eef2"))
        px.stamp([".vvvv.", "vvvvvv", "zzzzzz", "vvvvvv", "VVVVV."], 5, y0, pp)
    if L["rol"] == "revisor":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .22))
        px.stamp(["....w", "d.d..", ".d.d.", "d.d.."], 6, y0, pp)
    if L["rol"] == "docs":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .35))
        px.stamp(["w.", ".d", ".w", ".d"], 8, y0, pp)
    if L["rol"] == "marketing":
        px.stamp(["x.", "x.", ".x"], 8, y0, P)
    if L["rol"] == "diseno":
        pp = dict(P, d=mix(P["c"], (255, 255, 255), .5))
        px.stamp(["......", "dddddd", "......", "dddddd"], 5, y0, pp)
    if L.get("camara"):
        pp = dict(P, n=hx("#2a2230"), z=hx("#8fd0f0"))
        px.stamp(["x...", ".x..", ".ooo", ".ozno", ".oooo"], 8, y0, pp)
    if L.get("hermes"):
        pp = dict(P, y=S.GOLD, q=hx("#8a5a2b"), Q=hx("#6a4220"))
        px.stamp(["....y", "...y.", "..y..", "oooo.", "oqqo.", "oQQo.", "oooo."], 2, y0, pp)


def draw_side(L, pose, f=0):
    """Mirando a la derecha. pose: caminar (0-3) | charlar (0-1) | escuchar."""
    P = S.pal(L)
    px = S.Px()
    walk = pose == "caminar"
    bob = (-1 if f in (0, 2) else 0) if walk else 0
    hy = 2 + bob
    y = 13 + bob  # hombro
    # brazo lejano (detrás del cuerpo)
    if walk:
        arm(px, P, {0: "fwd", 2: "back"}.get(f, "neutral"), y, far=True)
    # piernas
    if walk:
        px.stamp(LEGS_SIDE[f], 0, 23 - len(LEGS_SIDE[f]), P)  # los pies tocan la fila 22
    else:
        px.stamp(LEGS_SIDE_STAND, 0, 18, P)
    # torso
    px.stamp(TORSO_SIDE, 0, 12 + bob, P)
    torso_side(px, L, P, bob)
    # cabeza: moño y cola detrás
    peinado = L["peinado"]
    if peinado == "tomate":
        rows, ox, oy = BUN_SIDE
        px.stamp(rows, ox, hy + oy, P)
    if peinado == "cola":
        rows, ox, oy = TAIL_SIDE
        px.stamp(rows, ox, hy + oy, P)
    px.stamp(HEAD_SIDE, 0, hy, P)
    # cara: ojo, mejilla y boca
    talking = pose == "charlar" and f == 1
    px.put(11, hy + 5, P["e"])
    px.put(11, hy + 6, P["e"])
    px.put(10, hy + 7, P["r"])
    if talking:
        px.put(12, hy + 8, P["o"])
        px.put(11, hy + 8, P["m"])
    else:
        px.put(12, hy + 8, P["m"])
    rows, oy = HAIR_SIDE[peinado]
    px.stamp(rows, 0, hy + oy, P)
    if peinado in EAR_SIDE and not (L.get("audifonos") or L.get("auricular")):
        px.put(7, hy + 5, P["S"])
        px.put(7, hy + 6, P["S"])
        px.put(8, hy + 6, P["S"])
    acc_head_side(px, L, P, hy)
    acc_face_side(px, L, P, hy)
    # brazo cercano
    if walk:
        arm(px, P, {0: "back", 2: "fwd"}.get(f, "neutral"), y)
    else:
        # brazo doblado con la taza adelante, a la altura del pecho
        lift = 1 if talking else 0
        mug = [r[::-1] for r in ["ooooo.", "oqqqoo", "ouuuo.", "ouUuoo", ".ooo.."]]  # asa hacia la mano
        if talking:  # la mano libre se abre adelante, a la altura de la cintura (gesto)
            px.stamp([".ooo.", "oCsso", ".ooo."], 10, 16, P)
        px.stamp(["oco", "oCos", "oCco", "oooo"], 6, 13 - lift, P)
        px.stamp(mug, 9, 12 - lift, P)
    return px


# ---------------------------------------------------------------- hoja completa
NEW = [  # nombre, cuadros, ms
    ("caminar-arriba", 4, 150),
    ("caminar-izq", 4, 150),
    ("caminar-der", 4, 150),
    ("charlar-izq", 2, 280),
    ("charlar-der", 2, 280),
    ("escuchar-izq", 1, 0),
    ("escuchar-der", 1, 0),
]


def frame(L, name, f):
    if name == "caminar-arriba":
        return draw_back(L, f).img()
    side, _, d = name.rpartition("-")
    pose = side if side != "caminar" else "caminar"
    im = draw_side(L, pose, f).img()
    return im.transpose(Image.FLIP_LEFT_RIGHT) if d == "izq" else im


def build():
    old = Image.open(BASE / "sprites" / "personajes.png").convert("RGBA")
    meta_old = json.loads((BASE / "sprites" / "personajes.json").read_text())
    assert meta_old["columnas"] == 26 and old.size == (26 * FW, len(S.LOOKS) * FH)
    cols = 26 + sum(n for _, n, _ in NEW)
    sheet = Image.new("RGBA", (cols * FW, len(S.LOOKS) * FH), (0, 0, 0, 0))
    sheet.paste(old, (0, 0))
    anims = dict(meta_old["animaciones"])
    anims["caminar-abajo"] = {"desde": 20, "cuadros": 4, "ms": 150}
    x = 26
    for name, n, ms in NEW:
        anims[name] = {"desde": x, "cuadros": n, "ms": ms}
        x += n
    for r, L in enumerate(S.LOOKS):
        for name, n, ms in NEW:
            for f in range(n):
                im = frame(L, name, f)
                sheet.paste(im, ((anims[name]["desde"] + f) * FW, r * FH), im)
    # columnas 0–25 idénticas a la hoja de JST-65
    diff = ImageChops.difference(sheet.crop((0, 0, 26 * FW, sheet.height)), old).getbbox()
    print("columnas 0–25 idénticas a JST-65:", diff is None)
    assert diff is None
    sheet.save(OUT / "personajes.png")
    meta = {
        "imagen": "personajes.png",
        "cuadro": meta_old["cuadro"],
        "columnas": cols,
        "animaciones": anims,
        "filas": meta_old["filas"],
        "nota": meta_old["nota"] + " Caminar en 4 direcciones (JST-96): caminar-abajo (= caminar, de frente), caminar-arriba (de espalda),"
        " caminar-izq y caminar-der (de perfil; izq es el espejo exacto de der). charlar-* y escuchar-*: de pie de perfil con la taza,"
        " para las conversaciones en la sala de descanso. Los pies tocan la fila 22 en todas las poses de pie.",
    }
    (OUT / "personajes.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return sheet, meta


def preview(sheet, meta, z=6):
    groups = [("frente", "caminar-abajo"), ("espalda", "caminar-arriba"), ("izq", "caminar-izq"), ("der", "caminar-der"),
              ("charlar-izq", "charlar-izq"), ("charlar-der", "charlar-der"), ("escuchar", "escuchar-izq")]
    gap, left, top = 10, 150, 46
    a = meta["animaciones"]
    widths = [(a[k]["cuadros"] + (1 if k == "escuchar-izq" else 0)) * FW * z for _, k in groups]
    W = left + sum(widths) + gap * len(groups) + 20
    H = top + sheet.height * z + 20
    img = Image.new("RGBA", (W, H), (36, 36, 42, 255))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20)
    fs = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
    x = left
    for (lab, k), w in zip(groups, widths):
        n = a[k]["cuadros"] + (1 if k == "escuchar-izq" else 0)
        crop = sheet.crop((a[k]["desde"] * FW, 0, (a[k]["desde"] + n) * FW, sheet.height))
        img.paste(crop.resize((crop.width * z, crop.height * z), Image.NEAREST), (x, top), crop.resize((crop.width * z, crop.height * z), Image.NEAREST))
        d.text((x + 4, 14), lab, fill=(230, 230, 230), font=f)
        x += w + gap
    for r, L in enumerate(S.LOOKS):
        d.text((10, top + r * FH * z + FH * z // 2 - 8), L["id"], fill=(200, 200, 210), font=fs)
    img.save(OUT / "vista-previa-caminar.png")


if __name__ == "__main__":
    sh, m = build()
    preview(sh, m)
    print("ok", sh.size)
