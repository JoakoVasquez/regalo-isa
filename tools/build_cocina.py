# Construye en Blender la cocina del Capítulo 6 (el pie de limón) y la exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_cocina.py -- assets\escenarios\cocina.json assets\escenarios\cocina.glb [assets\escenarios\cocina.blend]
#
# Todo sale de assets/escenarios/cocina.json (el mismo plano que usa el juego para ubicar a los Miis).
# Cocina de casa, de día: mesón con lavaplatos bajo la ventana, cocina a gas con el horno abajo
# (con vidrio y el interior hueco, para ver el pie dorándose), refri, isla al centro con pisos,
# una mesita con un frutero de limones. Paredes y techo son caras de un solo lado hacia adentro.
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
nrng = np.random.default_rng(6)

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


def tex_checker(c1, c2, size=256, n=4):
    """Baldosas de piso en damero, con junta y algo de suciedad suave."""
    yy, xx = np.mgrid[0:size, 0:size]
    w = size // n
    chk = ((xx // w) + (yy // w)) % 2
    col = np.where(chk[..., None] == 0, rgb(c1)[None, None, :], rgb(c2)[None, None, :])
    k = 1 + 0.03 * smooth_noise(size, 16, 8)
    grout = ((xx % w) < 2) | ((yy % w) < 2)
    k = np.where(grout, 0.82, k)
    return col * k[..., None]


def tex_tiles(base, size=256, nx=8, ny=16):
    """Azulejos tipo metro (rectangulares, trabados) para la pared detrás del mesón."""
    yy, xx = np.mgrid[0:size, 0:size]
    th = size // ny
    tw = size // nx
    row = yy // th
    xs = (xx + (row % 2) * (tw // 2)) % size
    tone = nrng.uniform(0.95, 1.04, (ny, nx))[row % ny, (xs // tw) % nx]
    k = tone * (1 + 0.04 * (1 - (yy % th) / th))  # brillo arriba de cada azulejo
    grout = ((yy % th) < 2) | ((xs % tw) < 2)
    k = np.where(grout, 0.78, k)
    return rgb(base)[None, None, :] * k[..., None]


def tex_wood(base, size=256, slats=8):
    yy, xx = np.mgrid[0:size, 0:size]
    w = size // slats
    tone = nrng.uniform(0.9, 1.08, slats)[(yy // w) % slats]
    grain = np.repeat(nrng.normal(0, 1, (size, 1)), size, 1)
    for _ in range(2):
        grain = (grain + np.roll(grain, 1, 0) + np.roll(grain, -1, 0)) / 3
    k = tone * (1 + 0.06 * grain + 0.03 * smooth_noise(size, 8))
    k = np.where((yy % w) < 1, 0.75, k)
    return rgb(base)[None, None, :] * k[..., None]


def tex_stone(base, size=256):
    """Cubierta tipo granito claro: moteado fino."""
    k = 1 + 0.05 * smooth_noise(size, 32, 3) + 0.06 * nrng.normal(0, 1, (size, size))
    dots = nrng.random((size, size)) < 0.02
    k = np.where(dots, 0.7, k)
    return rgb(base)[None, None, :] * k[..., None]


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


def M(name, color=None, img=None, tile=2.0):
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
    m.use_backface_culling = True
    MATS[name] = {'mat': m, 'tile': tile, 'bm': bmesh.new(), 'uv': img is not None}


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


def cyl(mat, x, z, y0, h, r, seg=12, r2=None):
    bmesh.ops.create_cone(BM(mat), cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                          depth=h, matrix=G(x, z, y0 + h / 2))


def sphere(mat, x, z, y, r, sy=1.0, seg=10):
    bmesh.ops.create_uvsphere(BM(mat), u_segments=seg, v_segments=max(4, seg // 2), radius=r,
                              matrix=G(x, z, y) @ S(1, 1, sy))


def panel(mat, pts, inward):
    """Cara de un solo lado. pts = 4 puntos del juego (x, y, z); inward = hacia dónde mira (juego)."""
    bm = BM(mat)
    f = bm.faces.new([bm.verts.new((x, -z, y)) for x, y, z in pts])
    f.normal_update()
    want = Vector((inward[0], -inward[2], inward[1]))
    if f.normal.dot(want) < 0:
        f.normal_flip()


def wall_x(mat, x, z0, z1, y0, y1, inward):
    panel(mat, [(x, y0, z0), (x, y0, z1), (x, y1, z1), (x, y1, z0)], (inward, 0, 0))


def wall_z(mat, z, x0, x1, y0, y1, inward):
    panel(mat, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], (0, 0, inward))


M('piso', img=image('piso', tex_checker(0xf3eee2, 0xd9cfbb)), tile=1.6)
M('muro', 0xfbf3df)
M('azulejo', img=image('azulejo', tex_tiles(0xe9f4ef)), tile=1.2)
M('techo', 0xfffaf0)
M('zocalo', 0xe2d6bd)
M('mueble', 0x8fc3a8)          # muebles de cocina verde menta
M('mueble_borde', 0x76a88e)
M('tirador', 0xd9c79b)
M('cubierta', img=image('cubierta', tex_stone(0xf2ede4)), tile=1.0)
M('madera', img=image('madera', tex_wood(0xc99a64)), tile=1.5)
M('acero', 0xc9ced3)
M('acero_osc', 0x7d848b)
M('negro', 0x2d3034)
M('quemador', 0x4a4f55)
M('horno_int', 0x3a2c25)
M('vidrio_horno', 0x1c1f24)
M('luz_horno', 0xffb35c)
M('refri', 0xf4f6f7)
M('refri_borde', 0xd5dadf)
M('ventana', 0xcfeaf8)
M('marco', 0xffffff)
M('cortina', 0xffe28a)
M('maceta', 0xd9784a)
M('hoja', 0x5fae55)
M('limon', 0xf6d936)
M('hoja_limon', 0x3f8f3c)
M('frutero', 0xf2f2f2)
M('tabla', 0xb4834d)
M('lampara', 0xfff4c8)
M('lampara_cable', 0x3a3a3a)
M('reloj', 0xffffff)
M('reloj_borde', 0xef6aa7)
M('alfombra', 0xef9ab8)
M('cuadro', 0x9fd2e6)
M('cuadro_marco', 0xb88a5a)
M('olla', 0xe2463a)

rx0, rz0, rx1, rz1 = L['room']
H = L['height']
CH, CD = L['counterH'], L['counterD']
TOP = 0.05                       # grosor de la cubierta
BACK = rz0 + CD                  # frente del mesón del fondo

# ───────────── Piso, paredes y techo ─────────────
panel('piso', [(rx0, 0, rz0), (rx1, 0, rz0), (rx1, 0, rz1), (rx0, 0, rz1)], (0, 1, 0))
panel('techo', [(rx0, H, rz0), (rx1, H, rz0), (rx1, H, rz1), (rx0, H, rz1)], (0, -1, 0))
wx0, wx1, wy0, wy1 = L['window']
# pared del fondo: azulejos entre el mesón y los muebles de arriba, muro en el resto, hueco de la ventana
wall_z('muro', rz0, rx0, rx1, 0, CH, 1)
wall_z('azulejo', rz0, rx0, wx0, CH, 2.0, 1)
wall_z('azulejo', rz0, wx1, rx1, CH, 2.0, 1)
wall_z('azulejo', rz0, wx0, wx1, CH, wy0, 1)
wall_z('muro', rz0, rx0, wx0, 2.0, H, 1)
wall_z('muro', rz0, wx1, rx1, 2.0, H, 1)
wall_z('muro', rz0, wx0, wx1, wy1, H, 1)
wall_z('ventana', rz0 - 0.02, wx0, wx1, wy0, wy1, 1)
for (a, b) in ((wx0 - 0.06, wx0), (wx1, wx1 + 0.06), ((wx0 + wx1) / 2 - 0.03, (wx0 + wx1) / 2 + 0.03)):
    gbox('marco', a, rz0, b, rz0 + 0.06, wy0, wy1)
for yy in (wy0, wy1, (wy0 + wy1) / 2):
    gbox('marco', wx0 - 0.06, rz0, wx1 + 0.06, rz0 + 0.06, yy - 0.03, yy + 0.03)
gbox('marco', wx0 - 0.1, rz0, wx1 + 0.1, rz0 + 0.14, wy0 - 0.06, wy0 - 0.02)   # alféizar
# cortinita amarilla arriba
gbox('cortina', wx0 - 0.12, rz0 + 0.07, wx1 + 0.12, rz0 + 0.1, wy1 - 0.28, wy1 + 0.12)
# macetitas en el alféizar
for px in (wx0 + 0.25, wx1 - 0.25):
    cyl('maceta', px, rz0 + 0.07, wy0 - 0.02, 0.13, 0.065, r2=0.08)
    sphere('hoja', px, rz0 + 0.07, wy0 + 0.17, 0.1, 0.9, 8)

for x, inward in ((rx0, 1), (rx1, -1)):
    wall_x('muro', x, rz0, rz1, 0, H, inward)
wall_z('muro', rz1, rx0, rx1, 0, H, -1)
# zócalo
gbox('zocalo', rx0, rz0 + CD, rx0 + 0.03, rz1, 0, 0.1)
gbox('zocalo', rx1 - 0.03, rz0 + CD, rx1, rz1, 0, 0.1)
gbox('zocalo', rx0, rz1 - 0.03, rx1, rz1, 0, 0.1)

# ───────────── Mesón del fondo: muebles bajos, cubierta, lavaplatos, cocina y horno ─────────────
fx0, fz0, fx1, fz1 = L['fridge']
sx0, sx1 = L['sink']
kx0, kx1 = L['stove']
ox0, ox1, oy0, oy1 = L['oven']
mx0 = fx1 + 0.02                 # el mesón empieza al lado del refri
mx1 = rx1

# muebles bajos (el hueco del horno queda abierto)
gbox('mueble', mx0, rz0, ox0, BACK - 0.02, 0.1, CH - TOP)
gbox('mueble', ox1, rz0, mx1, BACK - 0.02, 0.1, CH - TOP)
gbox('mueble', ox0, rz0, ox1, BACK - 0.02, oy1 + 0.04, CH - TOP)   # cajón sobre el horno
gbox('mueble_borde', ox0, rz0, ox1, BACK - 0.02, 0.1, oy0)
gbox('negro', mx0, rz0, mx1, BACK - 0.06, 0, 0.1)                     # zócalo del mueble
# puertas y cajones (líneas y tiradores)
doors = []
x = mx0
while x < mx1 - 0.3:
    w = 0.55
    if x < ox1 and x + w > ox0:     # salta el horno
        x = ox1
        continue
    xe = min(x + w, mx1)
    doors.append((x, xe))
    x = xe
for (a, b) in doors:
    gbox('mueble_borde', a + 0.005, BACK - 0.02, a + 0.02, BACK, 0.12, CH - TOP)
    gbox('mueble_borde', a, BACK - 0.02, b, BACK, CH - TOP - 0.2, CH - TOP - 0.18)
    gbox('tirador', (a + b) / 2 - 0.08, BACK, (a + b) / 2 + 0.08, BACK + 0.03, CH - TOP - 0.1, CH - TOP - 0.07)
    gbox('tirador', b - 0.09, BACK, b - 0.06, BACK + 0.03, 0.4, 0.55)
# cubierta
gbox('cubierta', mx0, rz0, mx1, BACK + 0.03, CH - TOP, CH)
# lavaplatos (cuba hundida + llave)
gbox('acero', sx0, rz0 + 0.1, sx1, BACK - 0.08, CH - 0.004, CH + 0.002)
gbox('acero_osc', sx0 + 0.06, rz0 + 0.16, sx1 - 0.06, BACK - 0.14, CH - 0.002, CH + 0.004)
sxm = (sx0 + sx1) / 2
cyl('acero', sxm, rz0 + 0.1, CH, 0.32, 0.025, 8)
gbox('acero', sxm - 0.025, rz0 + 0.08, sxm + 0.025, rz0 + 0.32, CH + 0.3, CH + 0.34)
cyl('acero', sxm, rz0 + 0.31, CH + 0.26, 0.06, 0.018, 8)
# cocina a gas: plancha negra con 4 quemadores
gbox('negro', kx0, rz0 + 0.06, kx1, BACK - 0.04, CH, CH + 0.015)
for (dx, dz) in ((0.3, 0.2), (0.85, 0.2), (0.3, 0.5), (0.85, 0.5)):
    cyl('quemador', kx0 + dx + 0.025, rz0 + dz, CH + 0.015, 0.025, 0.1, 12)
    cyl('acero_osc', kx0 + dx + 0.025, rz0 + dz, CH + 0.04, 0.012, 0.045, 10)
# una olla roja en un quemador de atrás
cyl('olla', kx0 + 0.875, rz0 + 0.2, CH + 0.04, 0.2, 0.15, 14)
cyl('negro', kx0 + 0.875, rz0 + 0.2, CH + 0.24, 0.02, 0.155, 14)
gbox('negro', kx0 + 0.86, rz0 + 0.18, kx0 + 0.89, rz0 + 0.22, CH + 0.26, CH + 0.3)
# perillas del horno en el frente
for i in range(4):
    px = ox0 + 0.18 + i * ((ox1 - ox0 - 0.36) / 3)
    bmesh.ops.create_cone(BM('acero_osc'), cap_ends=True, cap_tris=False, segments=10, radius1=0.035, radius2=0.03, depth=0.04,
                          matrix=G(px, BACK + 0.0, oy1 + 0.075) @ Matrix.Rotation(math.pi / 2, 4, 'X'))

# horno: caja hueca con el interior visible (caras hacia adentro), vidrio y manilla
oz0, oz1 = rz0 + 0.08, BACK - 0.06
wall_z('horno_int', oz0, ox0 + 0.05, ox1 - 0.05, oy0, oy1, 1)                       # fondo
wall_x('horno_int', ox0 + 0.05, oz0, oz1, oy0, oy1, 1)
wall_x('horno_int', ox1 - 0.05, oz0, oz1, oy0, oy1, -1)
panel('horno_int', [(ox0 + 0.05, oy0, oz0), (ox1 - 0.05, oy0, oz0), (ox1 - 0.05, oy0, oz1), (ox0 + 0.05, oy0, oz1)], (0, 1, 0))
panel('horno_int', [(ox0 + 0.05, oy1, oz0), (ox1 - 0.05, oy1, oz0), (ox1 - 0.05, oy1, oz1), (ox0 + 0.05, oy1, oz1)], (0, -1, 0))
gbox('acero', ox0 + 0.1, oz0 + 0.04, ox1 - 0.1, oz1 - 0.04, oy0 + 0.13, oy0 + 0.14)     # rejilla
gbox('luz_horno', ox0 + 0.4, oz0, ox0 + 0.55, oz0 + 0.02, oy1 - 0.12, oy1 - 0.06)     # lucecita
# puerta: marco de acero alrededor del vidrio
gbox('acero', ox0, oz1, ox1, oz1 + 0.04, oy0, oy0 + 0.08)
gbox('acero', ox0, oz1, ox1, oz1 + 0.04, oy1 - 0.1, oy1)
gbox('acero', ox0, oz1, ox0 + 0.1, oz1 + 0.04, oy0, oy1)
gbox('acero', ox1 - 0.1, oz1, ox1, oz1 + 0.04, oy0, oy1)
wall_z('vidrio_horno', oz1 + 0.03, ox0 + 0.1, ox1 - 0.1, oy0 + 0.08, oy1 - 0.1, 1)
gbox('acero_osc', ox0 + 0.15, oz1 + 0.07, ox1 - 0.15, oz1 + 0.1, oy1 - 0.06, oy1 - 0.03)   # manilla
gbox('acero_osc', ox0 + 0.15, oz1 + 0.03, ox0 + 0.18, oz1 + 0.1, oy1 - 0.06, oy1 - 0.03)
gbox('acero_osc', ox1 - 0.18, oz1 + 0.03, ox1 - 0.15, oz1 + 0.1, oy1 - 0.06, oy1 - 0.03)

# campana sobre la cocina
gbox('acero', kx0 - 0.05, rz0, kx1 + 0.05, rz0 + 0.55, 1.95, 2.05)
bm = BM('acero')
bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.5, radius2=0.18, depth=0.4,
                      matrix=G((kx0 + kx1) / 2, rz0 + 0.27, 2.25) @ Matrix.Rotation(math.pi / 4, 4, 'Z') @ S(1.15, 0.55, 1))
gbox('acero', (kx0 + kx1) / 2 - 0.13, rz0, (kx0 + kx1) / 2 + 0.13, rz0 + 0.26, 2.4, H)

# muebles de arriba (a los lados de la ventana y de la campana)
UY0, UY1, UD = 2.05, 2.85, 0.36
for (a, b) in ((mx0, wx0 - 0.25), (wx1 + 0.25, kx0 - 0.15), (kx1 + 0.15, mx1)):
    if b - a < 0.3:
        continue
    gbox('mueble', a, rz0, b, rz0 + UD, UY0, UY1)
    n = max(1, round((b - a) / 0.55))
    w = (b - a) / n
    for i in range(n):
        xa = a + i * w
        gbox('mueble_borde', xa + 0.005, rz0 + UD, xa + 0.02, rz0 + UD + 0.01, UY0 + 0.02, UY1 - 0.02)
        gbox('tirador', xa + w - 0.08, rz0 + UD, xa + w - 0.05, rz0 + UD + 0.03, UY0 + 0.06, UY0 + 0.2)

# cosas sobre el mesón: tabla de picar, frutero con limones, frasco
gbox('tabla', sx1 + 0.15, rz0 + 0.12, sx1 + 0.55, rz0 + 0.42, CH, CH + 0.025)
cyl('frutero', -2.6, rz0 + 0.35, CH, 0.08, 0.2, 14, r2=0.14)
for (dx, dz) in ((-0.06, -0.04), (0.07, -0.02), (0.0, 0.07), (0.02, -0.08)):
    sphere('limon', -2.6 + dx, rz0 + 0.35 + dz, CH + 0.12, 0.055, 0.8, 10)
sphere('limon', -2.58, rz0 + 0.34, CH + 0.2, 0.055, 0.8, 10)
cyl('cortina', 3.0, rz0 + 0.18, CH, 0.22, 0.07, 10)        # frasco de azúcar (tapa amarilla)
cyl('frutero', 3.0, rz0 + 0.18, CH, 0.2, 0.072, 10)

# ───────────── Refri ─────────────
gbox('refri', fx0, fz0, fx1, fz1, 0.02, 2.05)
gbox('refri_borde', fx0, fz1, fx1, fz1 + 0.01, 1.32, 1.34)                  # separación congelador
for (y0, y1) in ((0.75, 1.15), (1.5, 1.85)):
    gbox('acero', fx1 - 0.12, fz1 + 0.01, fx1 - 0.08, fz1 + 0.06, y0, y1)
# imanes y una notita
gbox('limon', fx0 + 0.25, fz1, fx0 + 0.33, fz1 + 0.015, 1.55, 1.63)
gbox('marco', fx0 + 0.4, fz1, fx0 + 0.62, fz1 + 0.008, 1.45, 1.72)
gbox('reloj_borde', fx0 + 0.48, fz1 + 0.005, fx0 + 0.54, fz1 + 0.02, 1.66, 1.72)

# ───────────── Isla con pisos ─────────────
ix0, iz0, ix1, iz1 = L['island']
gbox('mueble', ix0 + 0.05, iz0 + 0.05, ix1 - 0.05, iz1 - 0.05, 0.1, CH - TOP)
gbox('negro', ix0 + 0.1, iz0 + 0.1, ix1 - 0.1, iz1 - 0.1, 0, 0.1)
gbox('madera', ix0 - 0.05, iz0 - 0.05, ix1 + 0.05, iz1 + 0.18, CH - TOP, CH)    # cubierta de madera con alero
for k in range(3):
    a = ix0 + 0.05 + k * (ix1 - ix0 - 0.1) / 3
    b = a + (ix1 - ix0 - 0.1) / 3
    gbox('mueble_borde', a + 0.005, iz0 + 0.04, a + 0.02, iz0 + 0.05, 0.12, CH - TOP)
    gbox('tirador', (a + b) / 2 - 0.08, iz0 + 0.02, (a + b) / 2 + 0.08, iz0 + 0.05, CH - 0.15, CH - 0.12)
for (px, pz) in L['stools']:
    cyl('madera', px, pz, 0.5, 0.05, 0.19, 14)
    cyl('acero_osc', px, pz, 0.0, 0.5, 0.025, 8)
    cyl('acero_osc', px, pz, 0.0, 0.03, 0.17, 12)
    bmesh.ops.create_cone(BM('acero_osc'), cap_ends=False, cap_tris=False, segments=14, radius1=0.15, radius2=0.15, depth=0.02,
                          matrix=G(px, pz, 0.22))

# alfombrita frente al lavaplatos
gbox('alfombra', sx0 - 0.15, BACK + 0.15, sx1 + 0.15, BACK + 0.7, 0, 0.012)

# ───────────── Mesita con frutero, reloj, cuadro y lámparas ─────────────
tx, tz, tr = L['table']
cyl('madera', tx, tz, 0.7, 0.04, tr, 18)
cyl('acero_osc', tx, tz, 0, 0.7, 0.04, 8)
cyl('acero_osc', tx, tz, 0, 0.03, 0.3, 14)
cyl('frutero', tx, tz, 0.74, 0.07, 0.17, 14, r2=0.12)
for (dx, dz) in ((-0.05, 0.0), (0.06, 0.03), (0.0, -0.06)):
    sphere('limon', tx + dx, tz + dz, 0.85, 0.05, 0.8, 10)
sphere('hoja_limon', tx + 0.05, tz - 0.02, 0.9, 0.035, 0.4, 8)

# reloj en la pared derecha y cuadrito
bmesh.ops.create_cone(BM('reloj_borde'), cap_ends=True, cap_tris=False, segments=20, radius1=0.24, radius2=0.24, depth=0.04,
                      matrix=T(rx1 - 0.02, -(-0.6), 2.35) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
bmesh.ops.create_cone(BM('reloj'), cap_ends=True, cap_tris=False, segments=20, radius1=0.2, radius2=0.2, depth=0.04,
                      matrix=T(rx1 - 0.035, -(-0.6), 2.35) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
gbox('negro', rx1 - 0.06, -0.62, rx1 - 0.05, -0.58, 2.35, 2.5)
gbox('negro', rx1 - 0.06, -0.6, rx1 - 0.05, -0.48, 2.33, 2.37)
gbox('cuadro_marco', rx0, 0.4, rx0 + 0.04, 1.4, 1.4, 2.1)
gbox('cuadro', rx0 + 0.04, 0.48, rx0 + 0.05, 1.32, 1.48, 2.02)
sphere('limon', rx0 + 0.06, 0.9, 1.75, 0.15, 0.8, 12)

# lámparas colgando sobre la isla
for px in (-0.8, 0.8):
    cyl('lampara_cable', px, (iz0 + iz1) / 2, 2.3, H - 2.3, 0.008, 6)
    bmesh.ops.create_cone(BM('lampara'), cap_ends=True, cap_tris=False, segments=14, radius1=0.24, radius2=0.06, depth=0.24,
                          matrix=G(px, (iz0 + iz1) / 2, 2.2))

# ───────────── Mallas finales, UVs y exportación ─────────────
for name, d in MATS.items():
    bm = d['bm']
    if not bm.faces:
        bm.free()
        continue
    bm.normal_update()
    if d['uv']:
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
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                          export_cameras=False, export_lights=False)
print('COCINA OK ->', OUT, len(bpy.data.objects), 'objetos')
