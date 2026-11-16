# Construye en Blender la plaza del Baticristo (Paseo del Sagrado Corazón) y la exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_plaza.py -- assets\escenarios\plaza.json assets\escenarios\plaza.glb
#
# Si quieres abrirla y retocarla a mano en Blender, agrega un tercer argumento con un .blend:
#   ... -- assets\escenarios\plaza.json assets\escenarios\plaza.glb assets\escenarios\plaza.blend
#
# Todo sale del plano assets/escenarios/plaza.json (el mismo que usa el juego para los choques),
# así que mover un árbol o agrandar el pasto es cambiar un número ahí y volver a correr esto.
#
# Coordenadas: el juego usa x = este, z = sur, y = arriba. Blender usa z = arriba, así que
# un punto del juego (x, y, z) es (x, -z, y) en Blender. El exportador glTF lo deshace solo.
import bpy, bmesh, json, sys, math, random
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
LAYOUT, OUT = argv[0], argv[1]
BLEND = argv[2] if len(argv) > 2 else None
with open(LAYOUT, encoding='utf-8') as f:
    L = json.load(f)

rng = random.Random(68)
nrng = np.random.default_rng(68)
TAU = math.pi * 2

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
    for _ in range(passes):  # desenfoque que da la vuelta → la textura se repite sin costuras
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a / (a.std() + 1e-6)


def tex_pavers(base, n=8, size=256, bond=False, grout=0.8, jitter=0.07):
    t = size // n
    yy, xx = np.mgrid[0:size, 0:size]
    tw = t * 2 if bond else t  # adoquín rectangular (doble de largo) en hileras desfasadas
    row = yy // t
    xs = xx + np.where(bond & (row % 2 == 1), t, 0) if bond else xx
    tiles = nrng.uniform(1 - jitter, 1 + jitter, (n + 2, n + 2))
    k = tiles[row % n, (xs // tw) % n]
    edge = ((xs % tw) < 2) | ((yy % t) < 2)
    k = np.where(edge, grout, k)
    k = k * (1 + 0.035 * nrng.normal(0, 1, (size, size))) * (1 + 0.04 * smooth_noise(size, 8))
    return rgb(base)[None, None, :] * k[..., None]


def tex_organic(base, size=256, amp=0.13, fine=0.06, tint=None):
    k = 1 + amp * smooth_noise(size, 16, 8) + fine * nrng.normal(0, 1, (size, size))
    out = rgb(base)[None, None, :] * k[..., None]
    if tint is not None:  # manchas de otro color (pasto seco, tierra)
        m = np.clip(smooth_noise(size, 8, 12) * 0.5 - 0.3, 0, 1)[..., None]
        out = out * (1 - m) + rgb(tint)[None, None, :] * m
    return out


def tex_flag(kind, w=96, h=64):
    a = np.ones((h, w, 3), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    top = yy >= h // 2  # en las imágenes de Blender la fila 0 es la de abajo
    if kind == 'vaticano':
        a[xx < w // 2] = rgb(0xf3c623)
        a[xx >= w // 2] = rgb(0xffffff)
        m = ((xx - w * 0.72) ** 2 + (yy - h * 0.5) ** 2) < (h * 0.16) ** 2
        a[m] = rgb(0xd9b44a)  # escudo, simplificado
    elif kind == 'chile':
        a[:] = rgb(0xd52b1e)
        a[top] = rgb(0xffffff)
        blue = top & (xx < w // 3)
        a[blue] = rgb(0x0039a6)
        cx, cy = w / 6, h * 0.75  # estrella (círculo chico, a esta resolución no se nota)
        a[((xx - cx) ** 2 + (yy - cy) ** 2) < (h * 0.07) ** 2] = rgb(0xffffff)
    else:  # bandera blanca de la universidad con escudo azul
        a[:] = rgb(0xffffff)
        m = (np.abs(xx - w / 2) < w * 0.12) & (np.abs(yy - h / 2) < h * 0.22)
        a[m] = rgb(0x1d4f9c)
        a[(np.abs(xx - w / 2) < w * 0.04) & (np.abs(yy - h / 2) < h * 0.16)] = rgb(0xf3c623)
    return a


def tex_banner(kind, w=48, h=128):
    yy, xx = np.mgrid[0:h, 0:w]
    a = np.ones((h, w, 3), np.float32)
    if kind == 'azul':
        a[:] = rgb(0x2759a8)
        a[(yy > h * 0.55) & (yy < h * 0.8) & (np.abs(xx - w / 2) < w * 0.3)] = rgb(0xe9eef6)
        a[(yy > h * 0.2) & (yy < h * 0.25)] = rgb(0xf3c623)
    else:
        a[:] = rgb(0xf4f4f2)
        a[(yy > h * 0.6) & (yy < h * 0.72)] = rgb(0x2759a8)
        a[(yy > h * 0.3) & (yy < h * 0.52) & (np.abs(xx - w / 2) < w * 0.32)] = rgb(0x9db8d8)
    return a


def image(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


# ───────────── Materiales: cada uno junta su propia malla ─────────────
# Todo lo que comparte material termina en un solo objeto → pocos dibujados en el juego.
MATS = {}


def M(name, color=None, img=None, tile=4.0, double=False, uv='world'):
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
    MATS[name] = {'mat': m, 'tile': tile, 'bm': bmesh.new(), 'uv': uv if img is not None else None}


def BM(name):
    return MATS[name]['bm']


I4 = Matrix.Identity(4)


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def S(sx, sy, sz):
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def R(a, axis):
    return Matrix.Rotation(a, 4, axis)


def G(x, z, y=0.0):  # punto del juego → Blender
    return T(x, -z, y)


def box(mat, mtx):
    bmesh.ops.create_cube(BM(mat), size=1.0, matrix=mtx)


def gbox(mat, x0, z0, x1, z1, y0, y1):
    box(mat, G((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2) @ S(x1 - x0, z1 - z0, y1 - y0))


def cyl(mat, x, z, y0, h, r1, r2=None, seg=10, extra=I4):
    bmesh.ops.create_cone(BM(mat), cap_ends=True, cap_tris=False, segments=seg, radius1=r1,
                          radius2=r1 if r2 is None else r2, depth=h, matrix=G(x, z, y0 + h / 2) @ extra)


def ico(mat, x, z, y, r, sub=1, sc=(1, 1, 1)):
    bmesh.ops.create_icosphere(BM(mat), subdivisions=sub, radius=r, matrix=G(x, z, y) @ S(*sc))


def quad(mat, x0, z0, x1, z1, y):
    bm = BM(mat)
    vs = [bm.verts.new((x, -z, y)) for x, z in [(x0, z1), (x1, z1), (x1, z0), (x0, z0)]]
    bm.faces.new(vs)


def cloth(mat, x, z, y0, w, h, yaw, segs=6, wave=0.12, vertical=False):
    """Tela con UV propias (bandera o pendón). Sale del poste hacia +x local."""
    bm = BM(mat)
    uv = bm.loops.layers.uv.verify()
    mtx = G(x, z, y0) @ R(yaw, 'Z')
    rows = []
    for i in range(segs + 1):
        u = i / segs
        off = wave * math.sin(u * 3.6) * u
        rows.append([(mtx @ Vector((u * w, off, v * h)), (u, v)) for v in (0.0, 1.0)])
    for i in range(segs):
        a0, a1 = rows[i]
        b0, b1 = rows[i + 1]
        f = bm.faces.new([bm.verts.new(p[0]) for p in (a0, b0, b1, a1)])
        for loop, p in zip(f.loops, (a0, b0, b1, a1)):
            loop[uv].uv = p[1]


# ───────────── Materiales de la plaza ─────────────
M('suelo_pasto', img=image('pasto_base', tex_organic(0x5d8a35, tint=0x8a9a4a)), tile=7)
M('pasto', img=image('pasto', tex_organic(0x6c9c3c, amp=0.11, tint=0x93a64e)), tile=6)
M('tierra', img=image('tierra', tex_organic(0x7d6a4c, amp=0.16, tint=0x5d7a34)), tile=6)
M('adoquin_plaza', img=image('adoquin_plaza', tex_pavers(0x9d9e9b, n=8)), tile=8)
M('adoquin_norte', img=image('adoquin_norte', tex_pavers(0xb4afa4, n=8, bond=True)), tile=8)
M('adoquin_sur', img=image('adoquin_sur', tex_pavers(0xa7a49c, n=8, bond=True)), tile=8)
M('adoquin_oeste', img=image('adoquin_oeste', tex_pavers(0xaaa9a5, n=8)), tile=6)
M('franja', img=image('franja', tex_pavers(0xc6c2b8, n=4, grout=0.9, jitter=0.03)), tile=8)
M('franja_sur', 0xbab6ad)
M('linea_blanca', 0xf2f1ec)
M('linea_amarilla', 0xd8b23e)
M('solera', 0xcfcac0)
M('concreto', 0xe2ded4)
M('concreto_oscuro', 0x3a3c41)
M('bronce', 0x4f5449)
M('tronco', 0x5b4532)
M('hojas_1', 0x3f7a2e)
M('hojas_2', 0x4f8c35)
M('hojas_3', 0x356a2a)
M('hojas_otono', 0xc99a3b)
M('hojas_otono_2', 0xb6772f)
M('arbusto', 0x497f35)
M('flor_amarilla', 0xe9c94a)
M('flor_rosada', 0xd9507a)
M('tierra_macetero', 0x4a3a2a)
M('poste', 0xe9e9e6)
M('poste_oscuro', 0x3a3f45)
M('lampara', 0xf6f0d6)
M('madera', 0x9a6b40)
M('edificio', 0xd9cba9)
M('edificio_gris', 0xc8c3b8)
M('vidrio', 0x7f9bb6)
M('ventana', 0x3c4756)
M('marco', 0xe0e3e5)
M('kiosko', 0x3d6e4f)
M('techo', 0xb6bcc0)
M('quitasol', 0xf3f3f1)
M('cerro', 0x7f8ca4)
M('cerro_bajo', 0x8b977d)
M('nieve', 0xf1f3f7)
for k in ('vaticano', 'chile', 'uc'):
    M('bandera_' + k, img=image('bandera_' + k, tex_flag(k)), double=True, uv='manual')
for k in ('azul', 'blanco'):
    M('pendon_' + k, img=image('pendon_' + k, tex_banner(k)), double=True, uv='manual')


# ───────────── Suelo ─────────────
quad('suelo_pasto', -260, -260, 260, 260, -0.02)
for (x0, z0, x1, z1) in L['dirt']:
    quad('tierra', x0, z0, x1, z1, 0.0)

PAVED_H = 0.04
for name, rects in L['paved'].items():
    for (x0, z0, x1, z1) in rects:
        gbox('adoquin_' + name, x0, z0, x1, z1, -0.1, PAVED_H)

# franja clara con línea blanca discontinua (ciclovía)
sx0, sz0, sx1, sz1 = L['strip']
gbox('franja', sx0, sz0, sx1, sz1, -0.1, PAVED_H + 0.01)
zc = (sz0 + sz1) / 2
x = sx0 + 0.6
while x < sx1 - 1.2:
    gbox('linea_blanca', x, zc - 0.09, x + 1.1, zc + 0.09, 0, PAVED_H + 0.025)
    x += 2.4
for zz in (sz0 + 0.12, sz1 - 0.12):  # bordes
    gbox('linea_blanca', sx0, zz - 0.05, sx1, zz + 0.05, 0, PAVED_H + 0.022)

# líneas amarillas (guías podotáctiles) que cruzan la plaza
gbox('linea_amarilla', -30, 12.1, 24, 12.5, 0, PAVED_H + 0.02)
gbox('linea_amarilla', 3.6, -36, 4.0, 31, 0, PAVED_H + 0.02)
gbox('linea_amarilla', -30, -0.2, -1.6, 0.2, 0, PAVED_H + 0.02)

# franjas diagonales de hormigón en la zona sur (como en la foto aérea)
for i in range(7):
    cx = -10 + i * 4.6
    box('franja_sur', G(cx, 21.5, PAVED_H) @ R(math.radians(-24), 'Z') @ S(0.8, 17, 0.03))

# pasto con solera alrededor
GRASS_H = 0.1
for (x0, z0, x1, z1) in L['grass']:
    gbox('pasto', x0, z0, x1, z1, -0.1, GRASS_H)
    c = 0.22
    gbox('solera', x0 - c, z0 - c, x1 + c, z0, -0.1, GRASS_H + 0.05)
    gbox('solera', x0 - c, z1, x1 + c, z1 + c, -0.1, GRASS_H + 0.05)
    gbox('solera', x0 - c, z0, x0, z1, -0.1, GRASS_H + 0.05)
    gbox('solera', x1, z0, x1 + c, z1, -0.1, GRASS_H + 0.05)


# ───────────── Baticristo ─────────────
sx, sz = L['statue']
gbox('solera', sx - 1.1, sz - 1.1, sx + 1.1, sz + 1.1, 0, 0.35)
gbox('concreto', sx - 0.62, sz - 0.46, sx + 0.62, sz + 0.46, 0.35, 6.4)
for side in (-1, 1):  # hueco oscuro abajo, por delante y por detrás
    gbox('concreto_oscuro', sx - 0.36, sz + side * 0.46 - 0.03, sx + 0.36, sz + side * 0.46 + 0.03, 1.1, 3.3)
gbox('concreto', sx - 0.7, sz - 0.52, sx + 0.7, sz + 0.52, 6.2, 6.45)
# figura: túnica que se ensancha hacia arriba, brazos abiertos como alas, cabeza
cyl('bronce', sx, sz, 6.45, 2.0, 0.22, 0.5, seg=10)
box('bronce', G(sx, sz, 7.95) @ R(math.radians(45), 'Y') @ S(1.25, 0.16, 1.25))
for s in (-1, 1):
    box('bronce', G(sx + s * 1.05, sz, 8.05) @ R(s * math.radians(-11), 'Y') @ S(1.9, 0.18, 0.62))
    box('bronce', G(sx + s * 1.9, sz, 7.78) @ R(s * math.radians(-28), 'Y') @ S(0.5, 0.16, 0.5))
cyl('bronce', sx, sz, 8.3, 0.25, 0.14, 0.14, seg=8)
ico('bronce', sx, sz, 8.72, 0.3, sub=2, sc=(0.9, 0.9, 1.1))


# ───────────── Macetero con banderas y pendones ─────────────
px0, pz0, px1, pz1 = L['planter']
gbox('solera', px0, pz0, px1, pz1, 0, 0.55)
gbox('tierra_macetero', px0 + 0.2, pz0 + 0.2, px1 - 0.2, pz1 - 0.2, 0.3, 0.58)
for _ in range(26):
    bx, bz = rng.uniform(px0 + 0.6, px1 - 0.6), rng.uniform(pz0 + 0.6, pz1 - 0.6)
    ico('arbusto', bx, bz, 0.75, rng.uniform(0.4, 0.62), sc=(1, 1, 0.75))
for _ in range(30):
    bx, bz = rng.uniform(px0 + 0.4, px1 - 0.4), rng.uniform(pz0 + 0.4, pz1 - 0.4)
    ico(rng.choice(['flor_amarilla', 'flor_rosada']), bx, bz, rng.uniform(0.85, 1.05), 0.13, sub=0)
for (fx, fz, kind) in L['flags']:
    cyl('poste', fx, fz, 0.5, 10.5, 0.07, 0.05, seg=8)
    ico('poste', fx, fz, 11.05, 0.12, sub=1)
    cloth('bandera_' + kind, fx, fz, 8.6, 3.0, 2.0, math.radians(-15), wave=0.18)
for (bx, bz, kind) in L['banners']:
    cyl('poste_oscuro', bx, bz, 0.5, 4.6, 0.05, seg=6)
    cyl('poste_oscuro', bx + 1.3, bz, 0.5, 4.6, 0.05, seg=6)
    cloth('pendon_' + kind, bx + 0.05, bz, 1.8, 1.2, 3.1, 0.0, segs=2, wave=0.0)
    box('poste_oscuro', G(bx + 0.65, bz, 4.95) @ S(1.45, 0.06, 0.06))


# ───────────── Árboles ─────────────
def tree(x, z, s, kind=None):
    h = 3.2 * s
    cyl('tronco', x, z, 0, h, 0.26 * s, 0.17 * s, seg=7)
    for k in (-1, 1):  # dos ramas gruesas
        box('tronco', G(x + k * 0.5 * s, z, h * 0.9) @ R(k * math.radians(35), 'Y') @ S(0.2 * s, 0.2 * s, 1.4 * s))
    leaves = ['hojas_otono', 'hojas_otono_2'] if kind == 'otono' else ['hojas_1', 'hojas_2', 'hojas_3']
    for i in range(6):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0.3, 1.5) * s
        r = rng.uniform(1.15, 1.7) * s
        ico(rng.choice(leaves), x + math.cos(a) * d, z + math.sin(a) * d, h + rng.uniform(0.6, 2.4) * s, r,
            sc=(1, 1, rng.uniform(0.75, 0.95)))


for t in L['trees']:
    tree(t[0], t[1], t[2], t[3] if len(t) > 3 else None)

# ───────────── Faroles y bancas ─────────────
for (lx, lz) in L['lamps']:
    cyl('poste_oscuro', lx, lz, 0, 0.3, 0.2, 0.16, seg=8)
    cyl('poste_oscuro', lx, lz, 0.3, 4.4, 0.08, 0.06, seg=8)
    box('poste_oscuro', G(lx, lz, 4.72) @ S(0.55, 0.55, 0.08))
    box('lampara', G(lx, lz, 4.55) @ S(0.42, 0.42, 0.3))

for (bx, bz, rot) in L['benches']:
    base = G(bx, bz, 0) @ R(math.radians(-rot), 'Z')
    for k in (-0.75, 0.75):
        box('solera', base @ T(k, 0, 0.22) @ S(0.25, 0.55, 0.44))
    box('madera', base @ T(0, 0, 0.5) @ S(2.0, 0.6, 0.1))

# escultura/asiento de hormigón en el pasto noroeste
qx0, qz0, qx1, qz1 = L['sculpture']
gbox('concreto', qx0, qz0, qx1, qz1, 0, 0.7)
gbox('concreto_oscuro', qx0 + 0.3, qz0 - 0.02, qx1 - 0.3, qz0 + 0.3, 0.2, 0.55)


# ───────────── Edificios ─────────────
def building(x0, z0, x1, z1, h, mat, face_x=None, face_z=None, floors=3):
    gbox(mat, x0, z0, x1, z1, 0, h)
    gbox('marco', x0 - 0.15, z0 - 0.15, x1 + 0.15, z1 + 0.15, h, h + 0.35)
    fh = h / floors
    for f in range(floors):
        y0, y1 = f * fh + fh * 0.35, f * fh + fh * 0.8
        if face_x is not None:  # ventanas en la cara este u oeste
            z = z0 + 1.0
            while z < z1 - 2.2:
                gbox('ventana', face_x - 0.06, z, face_x + 0.06, z + 1.8, y0, y1)
                z += 2.6
        if face_z is not None:  # ventanas en la cara norte o sur
            x = x0 + 1.0
            while x < x1 - 2.2:
                gbox('ventana', x, face_z - 0.06, x + 1.8, face_z + 0.06, y0, y1)
                x += 2.6


bx0, bz0, bx1, bz1 = L['building']
building(bx0, bz0, bx1, bz1, 10, 'edificio', face_x=bx1, floors=3)
# baranda de vidrio/acero entre el edificio y la plaza
z = bz0 + 1
while z < bz1 - 1:
    gbox('poste_oscuro', -34.9, z, -34.75, z + 0.15, 0, 1.1)
    z += 2.0
gbox('poste_oscuro', -34.95, bz0 + 1, -34.7, bz1 - 1, 1.05, 1.15)

building(-30, -74, 6, -58, 14, 'edificio_gris', face_z=-58, floors=4)
gbox('vidrio', 20, -70, 50, -56, 0, 11)
for y in (3.6, 7.3, 11):
    gbox('marco', 19.9, -70.1, 50.1, -55.9, y - 0.25, y + 0.1)
building(-24, 48, 22, 60, 8, 'edificio_gris', face_z=48, floors=2)

# kiosko con techo de calamina y quitasol
kx0, kz0, kx1, kz1 = L['kiosk']
gbox('kiosko', kx0, kz0, kx1, kz1, 0, 2.6)
gbox('ventana', kx0 + 0.6, kz1 - 0.02, kx1 - 0.6, kz1 + 0.05, 1.1, 2.1)
for i in range(9):  # calamina acanalada
    x = kx0 - 0.4 + i * ((kx1 - kx0 + 0.8) / 8.0)
    gbox('techo', x - 0.18, kz0 - 0.4, x + 0.18, kz1 + 0.4, 2.6, 2.86)
gbox('techo', kx0 - 0.4, kz0 - 0.4, kx1 + 0.4, kz1 + 0.4, 2.6, 2.76)
cyl('poste_oscuro', kx0 - 1.6, kz1 - 1.0, 0, 2.2, 0.04, seg=6)
cyl('quitasol', kx0 - 1.6, kz1 - 1.0, 2.0, 0.6, 1.3, 0.05, seg=8)


# ───────────── Cordillera al fondo ─────────────
for i in range(30):
    a = i / 30 * TAU + rng.uniform(-0.06, 0.06)
    east = max(0.0, math.cos(a))  # la cordillera es más alta hacia el este
    rr = rng.uniform(215, 250)
    h = rng.uniform(32, 55) * (1 + 0.9 * east)
    r = h * rng.uniform(1.2, 1.6)
    x, z = math.cos(a) * rr, math.sin(a) * rr
    spin = R(rng.uniform(0, TAU), 'Z')
    cyl('cerro', x, z, -2, h, r, 0.0, seg=7, extra=spin)
    if h > 55:  # nieve en las puntas
        k = 0.3
        bmesh.ops.create_cone(BM('nieve'), cap_ends=True, cap_tris=False, segments=7, radius1=r * k * 1.03,
                              radius2=0.0, depth=h * k * 1.01, matrix=G(x, z, -2 + h * (1 - k) + h * k * 0.5) @ spin)
for i in range(22):
    a = i / 22 * TAU + rng.uniform(-0.1, 0.1)
    rr = rng.uniform(140, 165)
    h = rng.uniform(9, 18)
    cyl('cerro_bajo', math.cos(a) * rr, math.sin(a) * rr, -1, h, h * 2.6, 0.0, seg=6, extra=R(rng.uniform(0, TAU), 'Z'))


# ───────────── Mallas finales, UVs y exportación ─────────────
for name, d in MATS.items():
    bm = d['bm']
    if not bm.faces:
        bm.free()
        continue
    bm.normal_update()
    if d['uv'] == 'world':  # proyección por caras: arriba usa x/y, los lados usan la altura
        uv = bm.loops.layers.uv.verify()
        t = d['tile']
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                co = lp.vert.co
                if ax == 2:
                    lp[uv].uv = (co.x / t, co.y / t)
                elif ax == 0:
                    lp[uv].uv = (co.y / t, co.z / t)
                else:
                    lp[uv].uv = (co.x / t, co.z / t)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(d['mat'])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                          export_cameras=False, export_lights=False)
print('PLAZA OK ->', OUT, len(bpy.data.objects), 'objetos')
