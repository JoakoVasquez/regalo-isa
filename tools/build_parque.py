# Construye en Blender el parque del Capítulo 7 (el picnic) y lo exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_parque.py -- assets\escenarios\parque.json assets\escenarios\parque.glb [assets\escenarios\parque.blend]
#
# Todo sale de assets/escenarios/parque.json (el mismo plano que usa el juego para sentar a los Miis).
# Un prado con el mantel del picnic al centro (canasto, platos, termo, kuchen), un árbol grande que da sombra,
# un sendero de maicillo con bancas y faroles, una laguna con patos, arbustos, flores, cerros y nubes al fondo.
# La cámara del juego mira desde +z hacia -z, así que casi todo lo lindo queda hacia -z y hacia los lados.
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
nrng = np.random.default_rng(7)

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


def tex_grass(size=256):
    """Pasto con manchones más claros y más oscuros, y briznas sueltas."""
    k = 1 + 0.10 * smooth_noise(size, 8, 6) + 0.07 * smooth_noise(size, 32, 2) + 0.05 * nrng.normal(0, 1, (size, size))
    img = rgb(0x7dbb4e)[None, None, :] * k[..., None]
    warm = np.clip(smooth_noise(size, 4, 8) * 0.5, 0, 1)[..., None]
    return img * (1 - warm * 0.25) + rgb(0xa9cf5a)[None, None, :] * warm * 0.25


def tex_gravel(size=128):
    k = 1 + 0.06 * smooth_noise(size, 16, 3) + 0.07 * nrng.normal(0, 1, (size, size))
    return rgb(0xd9c7a0)[None, None, :] * k[..., None]


def tex_gingham(size=256, n=8):
    """Mantel a cuadros rojo y blanco (los cruces quedan más oscuros, como en la tela de verdad)."""
    yy, xx = np.mgrid[0:size, 0:size]
    w = size // n
    a = ((xx // w) % 2).astype(np.float32)
    b = ((yy // w) % 2).astype(np.float32)
    k = (a + b) / 2
    img = rgb(0xfbf4ea)[None, None, :] * (1 - k[..., None]) + rgb(0xd8343c)[None, None, :] * k[..., None]
    weave = 1 + 0.03 * np.sin(xx * 1.9) * np.sin(yy * 1.9) + 0.02 * nrng.normal(0, 1, (size, size))
    return img * weave[..., None]


def tex_wicker(size=128):
    """Mimbre trenzado del canasto."""
    yy, xx = np.mgrid[0:size, 0:size]
    row = yy // 8
    k = 0.86 + 0.2 * (np.sin((xx + (row % 2) * 8) * math.pi / 8) > 0) + 0.04 * nrng.normal(0, 1, (size, size))
    k = np.where((yy % 8) < 1, 0.7, k)
    return rgb(0xc9995a)[None, None, :] * k[..., None]


def tex_wood(size=128):
    yy, xx = np.mgrid[0:size, 0:size]
    k = 1 + 0.08 * np.sin(xx * 0.9 + smooth_noise(size, 8, 4) * 2) + 0.05 * nrng.normal(0, 1, (size, size))
    return rgb(0xa9794c)[None, None, :] * k[..., None]


def tex_water(size=128):
    k = smooth_noise(size, 8, 5)
    img = rgb(0x5fb4d8)[None, None, :] * (1 + 0.05 * k)[..., None]
    shine = np.clip(k - 1.1, 0, 1)[..., None]
    return img * (1 - shine) + rgb(0xdff3fb)[None, None, :] * shine


def image(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


# ───────────── Materiales (uno por objeto final) ─────────────
MATS = {}
FLAT = set()  # mallas facetadas (copas de árbol, arbustos, cerros…)


def M(name, color=None, img=None, tile=4.0, uv=None, double=False, flat=False):
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
    else:
        b.inputs['Base Color'].default_value = lin(color)
    m.use_backface_culling = not double
    MATS[name] = {'mat': m, 'tile': tile, 'bm': bmesh.new(), 'uv': uv or ('world' if img is not None else None)}
    if flat:
        FLAT.add(name)


def BM(name):
    return MATS[name]['bm']


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def S(sx, sy, sz):
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def G(x, z, y=0.0):
    return T(x, -z, y)


def RY(a):
    """Giro alrededor del eje vertical del juego (heading: 0 = mirando hacia +z)."""
    return Matrix.Rotation(a, 4, 'Z')


def gbox(mat, x0, z0, x1, z1, y0, y1, at=None):
    """Caja. Con `at` = (x, z, heading) las coordenadas son locales a ese punto girado."""
    m = G((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2) @ S(x1 - x0, z1 - z0, y1 - y0)
    if at:
        m = G(at[0], at[1]) @ RY(at[2]) @ m
    bmesh.ops.create_cube(BM(mat), size=1.0, matrix=m)


def cyl(mat, x, z, y0, h, r, seg=10, r2=None, caps=True):
    bmesh.ops.create_cone(BM(mat), cap_ends=caps, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                          depth=h, matrix=G(x, z, y0 + h / 2))


def blob(mat, x, z, y, r, sy=1.0, sub=1, jitter=0.18, sx=1.0, sz=1.0):
    """Bola irregular (arbusto, copa de árbol, piedra, nube)."""
    bm = BM(mat)
    before = set(bm.verts)
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r, matrix=G(x, z, y) @ S(sx, sz, sy))
    c = Vector((x, -z, y))
    for v in set(bm.verts) - before:
        d = v.co - c
        v.co = c + d * (1 + nrng.uniform(-jitter, jitter))


def quad_uv(mat, pts, uvs):
    """Cara suelta con UV propio. pts en coordenadas del juego (x, y, z)."""
    bm = BM(mat)
    uv = bm.loops.layers.uv.verify()
    f = bm.faces.new([bm.verts.new((x, -z, y)) for (x, y, z) in pts])
    for lp, t in zip(f.loops, uvs):
        lp[uv].uv = t


# Materiales
M('pasto', img=image('pasto', tex_grass()), tile=7.0)
M('sendero', img=image('sendero', tex_gravel()), tile=2.5)
M('mantel', img=image('mantel', tex_gingham()), uv='own', double=True)
M('canasto', img=image('canasto', tex_wicker()), tile=0.45)
M('madera', img=image('madera', tex_wood()), tile=1.2)
M('agua', img=image('agua', tex_water()), tile=5.0)
M('tronco', 0x8a6a4c)
M('copa', 0x5fa544, flat=True)
M('copa2', 0x79bb4b, flat=True)
M('copa3', 0x94cc5a, flat=True)
M('pino', 0x3f8a4a, flat=True)
M('arbusto', 0x4f9a3f, flat=True)
M('arbusto2', 0x6fb44a, flat=True)
M('tallo', 0x4f9a3f)
M('flor_rosa', 0xff8fb8, flat=True)
M('flor_amarilla', 0xffd84a, flat=True)
M('flor_blanca', 0xffffff, flat=True)
M('flor_lila', 0xb79af0, flat=True)
M('piedra', 0xb9b6ad, flat=True)
M('junco', 0x6f9a4a)
M('fierro', 0x3d4349)
M('farol', 0xfff6d8)
M('pato', 0xffffff, flat=True)
M('pato_pico', 0xf59a23)
M('loza', 0xffffff)
M('pan', 0xe3b56c)
M('relleno', 0x7fbf4f)
M('queso', 0xf6c945)
M('manzana', 0xd8343c)
M('uva', 0x7b4fa8, flat=True)
M('termo', 0x3f8fcf)
M('termo_tapa', 0xe9eef2)
M('vaso', 0xffd0df)
M('kuchen', 0xe9c489)
M('crema', 0xfff3df)
M('frutilla', 0xe2403f, flat=True)
M('cojin', 0xffc94d)
M('cojin2', 0x7fc8e8)
M('cerro', 0x8fc063, flat=True)
M('cerro2', 0x76ad5d, flat=True)
M('nube', 0xffffff, flat=True)

# ───────────── Prado, sendero y laguna ─────────────
gbox('pasto', -110, -110, 110, 60, -0.4, 0.0)

# sendero de maicillo que serpentea por detrás del picnic (discos planos encadenados)
PZ = L['pathZ']
for x in np.arange(-60, 60.1, 0.55):
    z = PZ + 1.3 * math.sin(x * 0.14) + 0.6 * math.sin(x * 0.05 + 1)
    cyl('sendero', x, z, 0.0, 0.025, 1.05, seg=10)
# un ramal que baja hacia la laguna
px, pz, pr = L['pond']
for t in np.linspace(0, 1, 16):
    cyl('sendero', 3.0 + (px - pr * 0.9 - 3.0) * t, PZ - 0.4 + (pz + 1.0 - PZ) * t + 0.6 * math.sin(t * math.pi), 0.0, 0.025, 0.7, seg=8)

# laguna: borde de tierra, agua, piedras, juncos y patos
cyl('sendero', px, pz, 0.0, 0.03, pr + 0.35, seg=28)
cyl('agua', px, pz, 0.0, 0.05, pr, seg=28)
for k in range(26):
    a = k / 26 * 2 * math.pi + nrng.uniform(-0.08, 0.08)
    blob('piedra', px + math.cos(a) * (pr + 0.15), pz + math.sin(a) * (pr + 0.15), 0.08, nrng.uniform(0.16, 0.34), sy=0.6, jitter=0.25)
for a0 in (0.4, 2.2, 3.9, 5.3):
    for k in range(7):
        a = a0 + nrng.uniform(-0.25, 0.25)
        r = pr - nrng.uniform(0.1, 0.7)
        cyl('junco', px + math.cos(a) * r, pz + math.sin(a) * r, 0.0, nrng.uniform(0.7, 1.3), 0.025, seg=4, r2=0.008)
for (x, z, h) in L['ducks']:
    blob('pato', x, z, 0.19, 0.2, sy=0.72, jitter=0.05, sx=1.0, sz=1.0)
    hx, hz = x + math.sin(h) * 0.17, z + math.cos(h) * 0.17
    blob('pato', hx, hz, 0.42, 0.11, jitter=0.04)
    blob('pato', x - math.sin(h) * 0.2, z - math.cos(h) * 0.2, 0.27, 0.08, jitter=0.04)   # colita
    bmesh.ops.create_cone(BM('pato_pico'), cap_ends=True, segments=5, radius1=0.045, radius2=0.0, depth=0.12,
                          matrix=G(hx + math.sin(h) * 0.13, hz + math.cos(h) * 0.13, 0.41) @ RY(h) @ Matrix.Rotation(math.pi / 2, 4, 'X'))


# ───────────── Árboles ─────────────
def tree(x, z, s=1.0, kind=0):
    if kind == 1:  # pino
        cyl('tronco', x, z, 0, 1.2 * s, 0.16 * s, seg=6)
        for k in range(4):
            bmesh.ops.create_cone(BM('pino'), cap_ends=True, segments=7, radius1=(1.45 - k * 0.3) * s, radius2=0.0, depth=1.7 * s,
                                  matrix=G(x, z, (1.6 + k * 0.95) * s))
        return
    cyl('tronco', x, z, 0, 2.5 * s, 0.2 * s, seg=7, r2=0.14 * s)
    mats = ['copa', 'copa2', 'copa3']
    for k in range(6):
        a = k / 6 * 2 * math.pi + nrng.uniform(0, 0.8)
        blob(mats[k % 3], x + math.cos(a) * 0.95 * s, z + math.sin(a) * 0.95 * s, nrng.uniform(2.8, 3.7) * s, nrng.uniform(0.85, 1.15) * s, sy=0.85, jitter=0.22)
    blob('copa2', x, z, 4.1 * s, 1.25 * s, sy=0.85, jitter=0.22)


# el árbol grande que le da sombra al picnic: tronco grueso, ramas y una copa enorme
bx, bz = L['bigTree']
cyl('tronco', bx, bz, 0, 3.4, 0.42, seg=9, r2=0.3)
for k, (dx, dz) in enumerate([(1.1, 0.5), (-0.9, 0.7), (0.2, -1.1), (1.0, -0.6)]):
    bmesh.ops.create_cone(BM('tronco'), cap_ends=True, segments=6, radius1=0.16, radius2=0.08, depth=2.2,
                          matrix=G(bx + dx * 0.6, bz + dz * 0.6, 3.5) @ Matrix.Rotation(0.75, 4, Vector((-dz, -dx, 0)).normalized()))
for k in range(11):
    a = k / 11 * 2 * math.pi + nrng.uniform(0, 0.5)
    r = nrng.uniform(1.6, 2.7)
    blob(['copa', 'copa2', 'copa3'][k % 3], bx + math.cos(a) * r, bz + math.sin(a) * r, nrng.uniform(4.2, 5.4), nrng.uniform(1.3, 1.8), sy=0.8, jitter=0.22)
blob('copa2', bx, bz, 5.9, 2.2, sy=0.8, jitter=0.22)
blob('copa3', bx + 0.6, bz + 0.5, 6.6, 1.5, sy=0.8, jitter=0.22)

for (x, z, s, kind) in L['trees']:
    tree(x, z, s, int(kind))
# arboleda del fondo, más tupida mientras más lejos
for _ in range(90):
    a = nrng.uniform(0, 2 * math.pi)
    r = nrng.uniform(26, 62)
    x, z = math.cos(a) * r, -8 + math.sin(a) * r
    if z > 14 and abs(x) < 16:
        continue  # nada justo detrás de la cámara
    tree(x, z, nrng.uniform(1.1, 1.9), 1 if nrng.uniform() < 0.3 else 0)

# ───────────── Arbustos y flores ─────────────
for (x, z, r) in L['bushes']:
    blob('arbusto', x, z, r * 0.7, r, sy=0.8, jitter=0.25)
    blob('arbusto2', x + r * 0.55, z + r * 0.2, r * 0.55, r * 0.7, sy=0.8, jitter=0.25)
    blob('arbusto2', x - r * 0.4, z - r * 0.35, r * 0.5, r * 0.6, sy=0.8, jitter=0.25)

FLORES = ['flor_rosa', 'flor_amarilla', 'flor_blanca', 'flor_lila']
for i, (x, z) in enumerate(L['flowers']):
    for k in range(7):
        fx, fz = x + nrng.uniform(-0.45, 0.45), z + nrng.uniform(-0.45, 0.45)
        h = nrng.uniform(0.16, 0.3)
        cyl('tallo', fx, fz, 0, h, 0.012, seg=4)
        blob(FLORES[(i + k // 3) % 4], fx, fz, h + 0.03, 0.055, sy=0.7, sub=1, jitter=0.1)
        blob('flor_amarilla' if FLORES[(i + k // 3) % 4] != 'flor_amarilla' else 'flor_blanca', fx, fz, h + 0.055, 0.022, sub=1, jitter=0.0)
# florcitas sueltas por todo el prado cercano
for _ in range(160):
    fx, fz = nrng.uniform(-16, 16), nrng.uniform(-9, 5)
    bl = L['blanket']
    if bl[0] - 0.3 < fx < bl[2] + 0.3 and bl[1] - 0.3 < fz < bl[3] + 0.3:
        continue
    blob(FLORES[nrng.integers(0, 4)], fx, fz, 0.06, 0.04, sy=0.6, sub=1, jitter=0.1)

# ───────────── Bancas y faroles ─────────────
for (x, z, h) in L['benches']:
    at = (x, z, h)
    for k in range(4):   # asiento
        gbox('madera', -0.8, -0.26 + k * 0.13, 0.8, -0.26 + k * 0.13 + 0.1, 0.42, 0.46, at=at)
    for k in range(3):   # respaldo
        gbox('madera', -0.8, -0.34, 0.8, -0.3, 0.56 + k * 0.14, 0.56 + k * 0.14 + 0.1, at=at)
    for sx in (-0.7, 0.7):
        gbox('fierro', sx - 0.03, -0.34, sx + 0.03, 0.24, 0.0, 0.42, at=at)
        gbox('fierro', sx - 0.03, -0.36, sx + 0.03, -0.3, 0.42, 0.98, at=at)

for (x, z) in L['lamps']:
    cyl('fierro', x, z, 0, 0.12, 0.14, seg=8)
    cyl('fierro', x, z, 0, 3.0, 0.045, seg=6)
    cyl('fierro', x, z, 3.0, 0.06, 0.2, seg=8)
    blob('farol', x, z, 3.24, 0.2, sub=2, jitter=0.0)
    cyl('fierro', x, z, 3.42, 0.05, 0.12, seg=8, r2=0.02)

# ───────────── El picnic ─────────────
x0, z0, x1, z1 = L['blanket']
N = 6
# mantel con unas arrugas suaves (malla de N x N, UV propio: un cuadro cada 30 cm)
for i in range(N):
    for j in range(N):
        def P(a, b):
            x = x0 + (x1 - x0) * a / N
            z = z0 + (z1 - z0) * b / N
            y = 0.02 + 0.012 * math.sin(a * 1.7 + b * 0.9) * (0 < a < N) * (0 < b < N)
            return (x, y, z)
        ps = [P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), P(i, j)]
        quad_uv('mantel', ps, [(p[0] / 1.2, p[2] / 1.2) for p in ps])

# canasto de mimbre con la tapa entreabierta, el asa y un paño asomado
cx, cz = L['basket']
gbox('canasto', cx - 0.3, cz - 0.2, cx + 0.3, cz + 0.2, 0.02, 0.3)
bmesh.ops.create_cube(BM('canasto'), size=1.0, matrix=G(cx, cz - 0.19, 0.36) @ Matrix.Rotation(-0.5, 4, 'X') @ S(0.6, 0.4, 0.03))
for k in range(9):   # asa en arco
    a = k / 8 * math.pi
    hx, hy = cx + math.cos(a) * 0.29, 0.3 + math.sin(a) * 0.24
    bmesh.ops.create_cube(BM('canasto'), size=1.0, matrix=G(hx, cz + 0.05, hy) @ Matrix.Rotation(-(a + math.pi / 2), 4, 'Y') @ S(0.11, 0.05, 0.025))
gbox('loza', cx - 0.2, cz + 0.02, cx + 0.22, cz + 0.23, 0.3, 0.325)
blob('pan', cx + 0.02, cz + 0.08, 0.36, 0.11, sy=0.6, sx=2.2, jitter=0.05)   # una baguette asomada

# platos con sándwiches, fruta
for i, (x, z) in enumerate(L['plates']):
    cyl('loza', x, z, 0.03, 0.015, 0.2, seg=16, r2=0.22)
    for k, dx in enumerate((-0.07, 0.07)):
        gbox('pan', x + dx - 0.06, z - 0.07, x + dx + 0.06, z + 0.07, 0.045, 0.065)
        gbox('relleno' if k == 0 else 'queso', x + dx - 0.065, z - 0.075, x + dx + 0.065, z + 0.075, 0.065, 0.078)
        gbox('pan', x + dx - 0.06, z - 0.07, x + dx + 0.06, z + 0.07, 0.078, 0.098)
    blob('manzana', x + 0.3, z - 0.12 + i * 0.2, 0.09, 0.07, jitter=0.04)
for k in range(9):   # racimo de uvas
    blob('uva', cx - 0.52 + (k % 3) * 0.05, cz - 0.18 + (k // 3) * 0.05, 0.055 + (k % 2) * 0.03, 0.032, jitter=0.05)

# termo y dos vasos
tx, tz = L['thermos']
cyl('termo', tx, tz, 0.03, 0.26, 0.055, seg=10)
cyl('termo_tapa', tx, tz, 0.29, 0.05, 0.05, seg=10, r2=0.04)
for dx in (-0.16, 0.17):
    cyl('vaso', tx + dx, tz + 0.1, 0.03, 0.09, 0.035, seg=10, r2=0.045)

# kuchen de frutilla sobre un plato
kx, kz = L['cake']
cyl('loza', kx, kz, 0.03, 0.015, 0.24, seg=16, r2=0.26)
cyl('kuchen', kx, kz, 0.045, 0.07, 0.19, seg=16)
cyl('crema', kx, kz, 0.115, 0.02, 0.17, seg=16)
for k in range(7):
    a = k / 7 * 2 * math.pi
    blob('frutilla', kx + math.cos(a) * 0.11, kz + math.sin(a) * 0.11, 0.155, 0.032, sy=1.2, jitter=0.05)
blob('frutilla', kx, kz, 0.16, 0.036, sy=1.2, jitter=0.05)

# cojines
for i, (x, z) in enumerate(L['cushions']):
    blob('cojin' if i == 0 else 'cojin2', x, z, 0.09, 0.26, sy=0.35, sub=2, jitter=0.03)

# ───────────── Fondo: cerros y nubes ─────────────
for (x, z, r, sy, m) in [(-70, -100, 55, 0.2, 'cerro'), (10, -118, 70, 0.17, 'cerro2'), (85, -98, 50, 0.22, 'cerro'),
                         (-112, -30, 45, 0.2, 'cerro2'), (114, -20, 48, 0.2, 'cerro2'), (-40, -128, 45, 0.26, 'cerro2')]:
    blob(m, x, z, -6, r, sy=sy, sub=2, jitter=0.07)

for (x, z, y, s) in [(-38, -70, 30, 6.5), (6, -85, 36, 8), (44, -66, 28, 6), (-70, -40, 33, 7), (74, -30, 31, 6.5),
                     (-16, -60, 42, 5), (26, -45, 44, 5.5), (60, 10, 34, 6), (-58, 14, 36, 6.5)]:
    for k in range(5):
        blob('nube', x + (k - 2) * s * 0.75, z + nrng.uniform(-1, 1) * s * 0.3, y + nrng.uniform(-0.15, 0.25) * s,
             s * nrng.uniform(0.65, 1.0) * (1.0 if 0 < k < 4 else 0.7), sy=0.55, sub=2, jitter=0.06)

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
    for p in me.polygons:
        p.use_smooth = name not in FLAT and name not in ('pasto', 'sendero', 'mantel', 'canasto', 'madera', 'fierro', 'pan', 'relleno', 'queso')
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                          export_cameras=False, export_lights=False)
print('PARQUE OK ->', OUT, len(bpy.data.objects), 'objetos')
