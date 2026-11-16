# Construye en Blender los puentes del Capítulo 5 (de día) y los exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_puentes.py -- assets\escenarios\puentes.json assets\escenarios\puentes.glb [assets\escenarios\puentes.blend]
#
# Todo sale de assets/escenarios/puentes.json (el mismo plano que usa el juego para caminar y esconderse).
# Dos niveles de pasarelas entre una torre de vidrio, un edificio gris y uno de ladrillo, con un jardín abajo
# (mesitas, árboles jóvenes, arbustos) y la ciudad con la Costanera y los cerros al fondo (hacia -z).
# Las barandas son paneles con textura de barrotes recortada (alpha): el juego les pone alphaTest.
#
# Coordenadas: punto del juego (x, y, z) = (x, -z, y) en Blender. El exportador glTF lo deshace solo.
import bpy, bmesh, json, sys, math
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
LAYOUT, OUT = argv[0], argv[1]
BLEND = argv[2] if len(argv) > 2 else None
with open(LAYOUT, encoding='utf-8') as f:
    L = json.load(f)
nrng = np.random.default_rng(5)
DY, UY = L['deckY'], L['upperY']

bpy.ops.wm.read_factory_settings(use_empty=True)


# ───────────── Colores y texturas ─────────────
def lin(c):
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(((c >> 16) & 255) / 255), f(((c >> 8) & 255) / 255), f((c & 255) / 255), 1.0)


def rgb(c):
    return np.array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255], np.float32)


def smooth_noise(size, cells, passes=10):
    a = nrng.normal(0, 1, (cells, cells))
    a = np.kron(a, np.ones((size // cells, size // cells)))
    for _ in range(passes):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a / (a.std() + 1e-6)


def tex_noise(base, size=256, amount=0.06):
    k = 1 + amount * smooth_noise(size, 16, 8) + amount * 0.5 * nrng.normal(0, 1, (size, size))
    return rgb(base)[None, None, :] * k[..., None]


def tex_tiles(base, size=256, n=4, joint=0.78):
    """Baldosas de piedra clara con junta."""
    yy, xx = np.mgrid[0:size, 0:size]
    w = size // n
    tone = nrng.uniform(0.94, 1.05, (n, n))[(yy // w) % n, (xx // w) % n]
    k = tone * (1 + 0.035 * nrng.normal(0, 1, (size, size)))
    k = np.where(((xx % w) < 2) | ((yy % w) < 2), joint, k)
    return rgb(base)[None, None, :] * k[..., None]


def tex_glass(size=256):
    """Muro cortina azul: paños verticales con reflejos distintos, montantes y losas."""
    yy, xx = np.mgrid[0:size, 0:size]
    col = (xx // 32)
    tone = nrng.uniform(0.9, 1.1, 8)[col]
    grad = 0.9 + 0.25 * (yy / size)
    base = rgb(0x5d8fc4)[None, None, :] * (tone * grad)[..., None]
    sky = rgb(0xbfdcf5)[None, None, :]
    refl = np.clip(smooth_noise(size, 8, 6) * 0.18 + 0.1, 0, 0.35)[..., None]
    img = base * (1 - refl) + sky * refl
    frame = ((xx % 32) < 2) | ((yy % 64) < 3)
    img[frame] = rgb(0x8d99a6)
    return img


def tex_windows(wall, glass, size=256, cols=4, rows=4, wf=0.62, hf=0.55):
    """Fachada con ventanas en grilla (edificios de concreto y ladrillo)."""
    yy, xx = np.mgrid[0:size, 0:size]
    cw, rh = size // cols, size // rows
    u, v = (xx % cw) / cw, (yy % rh) / rh
    win = (np.abs(u - 0.5) < wf / 2) & (np.abs(v - 0.5) < hf / 2)
    img = tex_noise(wall, size, 0.05)
    g = rgb(glass)[None, None, :] * (0.85 + 0.3 * nrng.uniform(0, 1, (rows, cols)))[(yy // rh) % rows, (xx // cw) % cols][..., None]
    img[win] = g[win]
    sill = (np.abs(u - 0.5) < wf / 2 + 0.04) & (np.abs(v - (0.5 - hf / 2) + 0.03) < 0.03)
    img[sill] = rgb(wall) * 1.15
    return img


def tex_brick(size=256):
    yy, xx = np.mgrid[0:size, 0:size]
    bh, bw = 8, 24
    row = yy // bh
    off = (row % 2) * (bw // 2)
    tone = nrng.uniform(0.85, 1.12, (size // bh + 1, size // bw + 2))[row, (xx + off) // bw]
    img = rgb(0xa0644a)[None, None, :] * tone[..., None]
    mortar = ((yy % bh) < 1) | (((xx + off) % bw) < 1)
    img[mortar] = rgb(0xc9b8a6)
    # ventanas grandes
    cw, rh = 64, 64
    u, v = (xx % cw) / cw, (yy % rh) / rh
    win = (np.abs(u - 0.5) < 0.3) & (np.abs(v - 0.55) < 0.28)
    img[win] = rgb(0x34424f) * 1.1
    return img


def tex_wood(size=128):
    yy, xx = np.mgrid[0:size, 0:size]
    k = 1 + 0.08 * np.sin(xx * 0.9 + smooth_noise(size, 8, 4) * 2) + 0.05 * nrng.normal(0, 1, (size, size))
    return rgb(0xb5895a)[None, None, :] * k[..., None]


def tex_grass(size=256):
    k = 1 + 0.12 * smooth_noise(size, 16, 4) + 0.08 * nrng.normal(0, 1, (size, size))
    return rgb(0x6f9a46)[None, None, :] * k[..., None]


def image(name, arr, alpha=None):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(arr, 0, 1)
    if alpha is not None:
        px[..., 3] = alpha
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def rail_image():
    """Barrotes verticales delgados (8 por metro), pasamanos arriba y riel abajo. Fondo transparente."""
    size = 128
    yy, xx = np.mgrid[0:size, 0:size]
    a = np.zeros((size, size), np.float32)
    a[(xx % 16) < 2] = 1                      # barrotes
    a[yy > size - 7] = 1                      # pasamanos (arriba de la imagen = v alto)
    a[(yy > 10) & (yy < 14)] = 1              # riel inferior
    img = np.zeros((size, size, 3), np.float32) + rgb(0x3b4147)
    img[yy > size - 7] = rgb(0x5a6168)
    return image('baranda', img, a)


# ───────────── Materiales (uno por objeto final) ─────────────
MATS = {}


def M(name, color=None, img=None, tile=4.0, uv=None, alpha=False, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 1.0
    b.inputs['Specular'].default_value = 0.0
    if img is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if alpha:
            nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
            m.blend_method = 'CLIP'
            m.alpha_threshold = 0.5
    else:
        b.inputs['Base Color'].default_value = lin(color)
    m.use_backface_culling = not double
    MATS[name] = {'mat': m, 'tile': tile, 'bm': bmesh.new(), 'uv': uv or ('world' if img is not None else None)}


def BM(name):
    return MATS[name]['bm']


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def S(sx, sy, sz):
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def G(x, z, y=0.0):
    return T(x, -z, y)


def gbox(mat, x0, z0, x1, z1, y0, y1):
    bmesh.ops.create_cube(BM(mat), size=1.0, matrix=G((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2) @ S(x1 - x0, z1 - z0, y1 - y0))


def cyl(mat, x, z, y0, h, r, seg=8, r2=None):
    bmesh.ops.create_cone(BM(mat), cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                          depth=h, matrix=G(x, z, y0 + h / 2))


def blob(mat, x, z, y, r, sy=1.0, sub=1, jitter=0.18):
    """Bola irregular (arbusto, copa de árbol)."""
    bm = BM(mat)
    before = set(bm.verts)
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r, matrix=G(x, z, y) @ S(1, 1, sy))
    c = Vector((x, -z, y))
    for v in set(bm.verts) - before:
        d = v.co - c
        v.co = c + d * (1 + nrng.uniform(-jitter, jitter))


def rail(x0, z0, x1, z1, y, h=1.1):
    """Panel de baranda vertical entre (x0, z0) y (x1, z1), de y a y + h. UV: 1 unidad = 2 m a lo largo."""
    bm = BM('baranda')
    uv = bm.loops.layers.uv.verify()
    length = math.hypot(x1 - x0, z1 - z0)
    vs = [bm.verts.new((x0, -z0, y)), bm.verts.new((x1, -z1, y)), bm.verts.new((x1, -z1, y + h)), bm.verts.new((x0, -z0, y + h))]
    f = bm.faces.new(vs)
    for lp, (u, v) in zip(f.loops, [(0, 0), (length / 2, 0), (length / 2, 1), (0, 1)]):
        lp[uv].uv = (u, v)
    # pasamanos sólido para que se lea desde lejos
    if abs(x1 - x0) > abs(z1 - z0):
        gbox('pasamanos', min(x0, x1), z0 - 0.03, max(x0, x1), z0 + 0.03, y + h - 0.02, y + h + 0.04)
    else:
        gbox('pasamanos', x0 - 0.03, min(z0, z1), x0 + 0.03, max(z0, z1), y + h - 0.02, y + h + 0.04)


def rails_around(r, y, skip=()):
    """Baranda alrededor de un rectángulo, salvo los tramos de `skip` = [(lado, a, b)] (lado: 'x0','x1','z0','z1')."""
    x0, z0, x1, z1 = r
    sides = {'x0': (x0, z0, x0, z1), 'x1': (x1, z0, x1, z1), 'z0': (x0, z0, x1, z0), 'z1': (x0, z1, x1, z1)}
    for name, (ax, az, bx, bz) in sides.items():
        cuts = sorted([(a, b) for s, a, b in skip if s == name and a is not None])
        if any(s == name and a is None for s, a, b in skip):
            continue
        horiz = name in ('z0', 'z1')
        lo, hi = (ax, bx) if horiz else (az, bz)
        segs, cur = [], lo
        for a, b in cuts:
            if a > cur:
                segs.append((cur, a))
            cur = max(cur, b)
        if cur < hi:
            segs.append((cur, hi))
        for a, b in segs:
            if b - a < 0.05:
                continue
            if horiz:
                rail(a, az, b, az, y)
            else:
                rail(ax, a, ax, b, y)


# Materiales
M('suelo', img=image('suelo', tex_tiles(0xc9c3b6, n=4)), tile=3.0)
M('pasto', img=image('pasto', tex_grass()), tile=4.0)
M('calle', img=image('calle', tex_noise(0x77797c, amount=0.05)), tile=6.0)
M('vereda', img=image('vereda', tex_tiles(0xb8b3a8, n=4, joint=0.85)), tile=4.0)
M('borde', 0x8f8a80)
M('tierra', 0x6a5440)
M('arbusto', 0x4f7d34)
M('arbusto2', 0x6c9a3e)
M('helecho', 0x3f6e2c)
M('tronco', 0x7a6a5c)
M('hojas', 0x9cc45a)
M('hojas2', 0xbfd877)
M('mesa', 0x2f3236)
M('silla', 0x3a3e43)
M('vidrio', img=image('vidrio', tex_glass()), tile=8.0)
M('concreto', img=image('concreto', tex_windows(0x8e9092, 0x2d3943)), tile=6.0)
M('ladrillo', img=image('ladrillo', tex_brick()), tile=8.0)
M('losa', img=image('losa', tex_tiles(0xb7b3aa, n=2, joint=0.85)), tile=2.0)
M('losa_bajo', 0x6b6f73)
M('viga', 0x353b42)
M('pilar', 0x2c3137)
M('baranda', img=rail_image(), uv='own', alpha=True, double=True)
M('pasamanos', 0x4b5259)
M('madera', img=image('madera', tex_wood()), tile=1.5)
M('macetero', 0x5b5e60)
M('planta', 0x3d7a33)
M('planta2', 0x5f9c3c)
M('flor_jardin', 0xf2c8d8)
M('ciudad1', img=image('ciudad1', tex_windows(0xd8d2c4, 0x5d7488, cols=4, rows=6)), tile=10.0)
M('ciudad2', img=image('ciudad2', tex_windows(0x9fa7ad, 0x3e4d5a, cols=6, rows=6, wf=0.8, hf=0.6)), tile=12.0)
M('ciudad3', img=image('ciudad3', tex_glass()), tile=14.0)
M('ciudad4', img=image('ciudad4', tex_windows(0xc7b49a, 0x4a5662, cols=5, rows=5, wf=0.5, hf=0.5)), tile=9.0)
M('costanera', img=image('costanera', tex_glass()), tile=20.0)
M('costanera_corona', 0x4d5f72)
M('cerro', 0x8c8a5e)
M('cerro2', 0x6f7d4c)

# ───────────── Suelo y jardín ─────────────
gbox('calle', -320, -460, 320, 180, -0.2, -0.01)
gbox('suelo', -36, -16, 34, 54, -0.2, 0.0)

for (x0, z0, x1, z1) in L['beds']:
    gbox('borde', x0, z0, x1, z1, 0.0, 0.32)
    gbox('pasto', x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15, 0.32, 0.36)
    # arbustos y helechos repartidos en el cantero
    n = int((x1 - x0) * (z1 - z0) / 2.2)
    for _ in range(n):
        x = nrng.uniform(x0 + 0.5, x1 - 0.5)
        z = nrng.uniform(z0 + 0.5, z1 - 0.5)
        k = nrng.uniform()
        if k < 0.45:
            blob('arbusto' if nrng.uniform() < 0.5 else 'arbusto2', x, z, 0.62, nrng.uniform(0.35, 0.6), sy=0.75)
        elif k < 0.85:
            for a in range(5):
                ang = a / 5 * 2 * math.pi + nrng.uniform(0, 1)
                bmesh.ops.create_cone(BM('helecho'), cap_ends=False, segments=3, radius1=0.09, radius2=0.0, depth=0.8,
                                      matrix=G(x, z, 0.7) @ Matrix.Rotation(0.55, 4, Vector((math.cos(ang), math.sin(ang), 0))))
        else:
            blob('flor_jardin', x, z, 0.5, 0.18, sub=1)

# Árboles jóvenes: tronco delgado y copas livianas
for (x, z) in L['trees']:
    cyl('tronco', x, z, 0.3, 3.2, 0.09, seg=6, r2=0.06)
    for k in range(5):
        a = k / 5 * 2 * math.pi + nrng.uniform(0, 0.8)
        blob('hojas' if k % 2 else 'hojas2', x + math.cos(a) * 0.7, z + math.sin(a) * 0.7, nrng.uniform(3.0, 4.2), nrng.uniform(0.45, 0.7), sy=0.8, jitter=0.3)
    blob('hojas', x, z, 4.4, 0.7, sy=0.85, jitter=0.3)

# Mesitas de bistró con dos sillas plegables
for (x, z) in L['tables']:
    cyl('mesa', x, z, 0.70, 0.04, 0.38, seg=12)
    cyl('mesa', x, z, 0.0, 0.70, 0.03, seg=6)
    cyl('mesa', x, z, 0.0, 0.03, 0.22, seg=8)
    for s in (-1, 1):
        cx = x + s * 0.68
        gbox('silla', cx - 0.2, z - 0.2, cx + 0.2, z + 0.2, 0.43, 0.47)
        bx = cx + s * 0.2
        gbox('silla', bx - 0.02, z - 0.2, bx + 0.02, z + 0.2, 0.47, 0.9)
        for lx in (cx - 0.18, cx + 0.16):
            gbox('silla', lx, z - 0.19, lx + 0.02, z - 0.17, 0, 0.45)
            gbox('silla', lx, z + 0.17, lx + 0.02, z + 0.19, 0, 0.45)

# ───────────── Edificios ─────────────
x0, z0, x1, z1, h = L['towerL']
gbox('vidrio', x0, z0, x1, z1, 0, h)
gbox('viga', x1 - 0.1, z0, x1 + 0.05, z1, h - 0.6, h)  # coronación
x0, z0, x1, z1, h = L['buildR']
gbox('concreto', x0, z0, x1, z1, 0, h)
x0, z0, x1, z1, h = L['buildBack']
gbox('ladrillo', x0, z0, x1, z1, 0, h)
gbox('viga', x0, z0 - 0.2, x1, z0, h - 0.5, h)

# ───────────── Pasarelas (nivel del juego) ─────────────
TH = 0.4  # espesor de la losa
walk = L['walk']
A, B1, B, MIR = walk
for r in walk:
    gbox('losa', r[0], r[1], r[2], r[3], DY - 0.02, DY)
    gbox('losa_bajo', r[0], r[1], r[2], r[3], DY - TH, DY - 0.02)
# vigas de borde bajo los puentes
for (bx0, bz0, bx1, bz1) in (B1, MIR):
    gbox('viga', bx0, bz0, bx1, bz0 + 0.18, DY - TH - 0.35, DY - TH)
    gbox('viga', bx0, bz1 - 0.18, bx1, bz1, DY - TH - 0.35, DY - TH)

# barandas (sin cortar donde se juntan las pasarelas ni contra los edificios)
rails_around(A, DY, skip=[('x0', None, None), ('z1', None, None), ('x1', B1[1], B1[3])])
rails_around(B1, DY, skip=[('x0', None, None), ('x1', None, None)])
rails_around(B, DY, skip=[('x1', None, None), ('x0', B1[1], B1[3]), ('x0', MIR[1], MIR[3])])
rails_around(MIR, DY, skip=[('x1', None, None)])

# ───────────── Nivel de arriba (decoración, como en la foto) ─────────────
up = L['upper']
for r in up:
    gbox('losa', r[0], r[1], r[2], r[3], UY - 0.02, UY)
    gbox('losa_bajo', r[0], r[1], r[2], r[3], UY - TH, UY - 0.02)
UA, UB1, UB = up
gbox('viga', UB1[0], UB1[1], UB1[2], UB1[1] + 0.18, UY - TH - 0.35, UY - TH)
gbox('viga', UB1[0], UB1[3] - 0.18, UB1[2], UB1[3], UY - TH - 0.35, UY - TH)
rails_around(UA, UY, skip=[('x0', None, None), ('z1', None, None), ('x1', UB1[1], UB1[3])])
rails_around(UB1, UY, skip=[('x0', None, None), ('x1', None, None)])
rails_around(UB, UY, skip=[('x1', None, None), ('z1', None, None), ('x0', UB1[1], UB1[3])])

# pérgola de madera sobre el balcón de arriba de la torre de vidrio
px0, pz0, px1, pz1 = UA
for z in np.arange(pz0 + 0.3, pz1, 0.45):
    gbox('madera', px0, z, px1, z + 0.12, UY + 3.0, UY + 3.18)
for z in (pz0 + 0.2, (pz0 + pz1) / 2, pz1 - 0.2):
    gbox('madera', px1 - 0.2, z - 0.1, px1 - 0.05, z + 0.1, UY, UY + 3.18)
gbox('madera', px1 - 0.25, pz0, px1, pz1, UY + 3.18, UY + 3.35)

# jardineras colgando de las barandas de arriba
for z in np.arange(UA[1] + 1, UA[3] - 1, 3.2):
    gbox('macetero', UA[2] - 0.05, z, UA[2] + 0.3, z + 1.2, UY + 0.7, UY + 1.05)
    blob('planta2', UA[2] + 0.15, z + 0.6, UY + 1.1, 0.35, sy=0.6)
    for k in range(3):
        cyl('planta', UA[2] + 0.2, z + 0.25 + k * 0.35, UY + 0.1, 0.65, 0.05, seg=4)

# pilares (bajo los puentes, desde el jardín)
for (x, z) in L['pillars']:
    yy = UY if 20 <= z <= 23 else DY
    gbox('pilar', x - 0.18, z - 0.18, x + 0.18, z + 0.18, 0, yy - TH)

# ───────────── Maceteros con arbustos sobre las pasarelas (para esconderse) ─────────────
for (x, z, r) in L['planters']:
    cyl('macetero', x, z, DY, 0.75, r, seg=10, r2=r * 0.85)
    blob('planta', x, z, DY + 1.05, r * 1.15, sy=0.85, jitter=0.25)
    blob('planta2', x + r * 0.3, z - r * 0.2, DY + 1.45, r * 0.8, sy=0.9, jitter=0.25)

# ───────────── Ciudad de fondo ─────────────
# Cuadras de 34 m con calles de 10 m: cada cuadra es una vereda con edificios o un parque con árboles.
crng = np.random.default_rng(11)
cx, cz, ch = L['costanera']
BLK, ST = 34.0, 10.0
for i in range(-6, 7):
    for j in range(-9, 4):
        x0, z0 = i * (BLK + ST) - BLK / 2 + 1, j * (BLK + ST) - BLK / 2 + 12
        x1, z1 = x0 + BLK, z0 + BLK
        mx, mz = (x0 + x1) / 2, (z0 + z1) / 2
        if x1 > -36 and x0 < 34 and z1 > -16 and z0 < 54:
            continue  # el patio y sus edificios
        if math.hypot(mx - cx, mz - cz) < 30:
            gbox('vereda', x0, z0, x1, z1, 0, 0.15)
            continue  # la Costanera va aquí
        gbox('vereda', x0, z0, x1, z1, 0, 0.15)
        if crng.uniform() < 0.16:  # parque
            gbox('pasto', x0 + 1.5, z0 + 1.5, x1 - 1.5, z1 - 1.5, 0.15, 0.2)
            for _ in range(14):
                tx, tz = crng.uniform(x0 + 3, x1 - 3), crng.uniform(z0 + 3, z1 - 3)
                cyl('tronco', tx, tz, 0.2, 2.6, 0.18, seg=5)
                blob('arbusto' if crng.uniform() < 0.5 else 'arbusto2', tx, tz, 3.6, crng.uniform(1.6, 2.4), sy=0.85, jitter=0.2)
            continue
        # uno a tres edificios por cuadra; hacia la vista (-z) más altos
        tall = 1.6 if mz < -60 else 1.0
        n = crng.integers(1, 4)
        for k in range(n):
            w = crng.uniform(12, BLK - 2) if n == 1 else crng.uniform(10, BLK / n + 4)
            d = crng.uniform(14, BLK - 2)
            bx = x0 + 1 + (BLK - 2 - w) * (k + 0.5) / n if n > 1 else crng.uniform(x0 + 1, x1 - 1 - w)
            bz = crng.uniform(z0 + 1, z1 - 1 - d)
            h = crng.uniform(9, 30) * tall
            mat = ['ciudad1', 'ciudad2', 'ciudad3', 'ciudad4'][crng.integers(0, 4)]
            gbox(mat, bx, bz, bx + w, bz + d, 0.15, h)
        # árboles en la vereda, a lo largo de la calle
        for t in np.arange(x0 + 3, x1 - 2, 7):
            cyl('tronco', t, z0 + 1.2, 0.15, 2.4, 0.15, seg=5)
            blob('hojas', t, z0 + 1.2, 3.4, 1.5, sy=0.85, jitter=0.2)

# Gran Torre Santiago (la Costanera): torre de vidrio esbelta que se angosta y remata en una corona abierta
bmesh.ops.create_cone(BM('costanera'), cap_ends=True, cap_tris=False, segments=16, radius1=10, radius2=5.6, depth=ch,
                      matrix=G(cx, cz, ch / 2) @ Matrix.Rotation(math.pi / 16, 4, 'Z'))
for k in range(8):
    a = k / 8 * 2 * math.pi
    gbox('costanera_corona', cx + math.cos(a) * 5.0 - 0.45, cz + math.sin(a) * 5.0 - 0.45, cx + math.cos(a) * 5.0 + 0.45, cz + math.sin(a) * 5.0 + 0.45, ch, ch + 14)
bmesh.ops.create_cone(BM('costanera_corona'), cap_ends=False, segments=16, radius1=5.6, radius2=5.0, depth=1.2,
                      matrix=G(cx, cz, ch + 13.4))
gbox('ciudad2', cx - 26, cz - 12, cx - 9, cz + 16, 0, 20)  # el mall a los pies de la torre
gbox('ciudad1', cx + 10, cz - 6, cx + 24, cz + 14, 0, 26)

# Cerros al fondo
for (x, z, r, sy, m) in [(-120, -320, 120, 0.42, 'cerro'), (40, -340, 150, 0.35, 'cerro2'), (170, -300, 110, 0.4, 'cerro'),
                         (-230, -260, 120, 0.35, 'cerro2')]:
    blob(m, x, z, -10, r, sy=sy, sub=2, jitter=0.06)

# ───────────── Mallas finales, UVs y exportación ─────────────
for name, d in MATS.items():
    bm = d['bm']
    if not bm.faces:
        bm.free()
        continue
    bm.normal_update()
    if d['uv'] == 'world':
        uv = bm.loops.layers.uv.verify()
        t = d['tile']
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                co = lp.vert.co
                lp[uv].uv = (co.x / t, co.y / t) if ax == 2 else (co.y / t, co.z / t) if ax == 0 else (co.x / t, co.z / t)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(d['mat'])
    if name in ('arbusto', 'arbusto2', 'hojas', 'hojas2', 'planta', 'planta2', 'cerro', 'cerro2'):
        for p in me.polygons:
            p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                          export_cameras=False, export_lights=False)
print('PUENTES OK ->', OUT, len(bpy.data.objects), 'objetos')
