# Construye en Blender la disco del Capítulo 3 y la exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_disco.py -- assets\escenarios\disco.json assets\escenarios\disco.glb [assets\escenarios\disco.blend]
#
# Todo sale de assets/escenarios/disco.json (el mismo plano que usa el juego para los choques y el sillón).
# Paredes y techo son caras de un solo lado mirando hacia adentro: desde fuera no se ven,
# así la cámara puede girar alrededor del jugador sin que una pared tape la vista.
# La pista ('pista') lleva UV de 0 a 1: el juego le pone una textura de baldosas que cambia de color.
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
nrng = np.random.default_rng(3)

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


def tex_tiles(base, size=256, n=8):
    """Baldosas oscuras con junta (el piso fuera de la pista)."""
    yy, xx = np.mgrid[0:size, 0:size]
    w = size // n
    tone = nrng.uniform(0.92, 1.06, (n, n))[(yy // w) % n, (xx // w) % n]
    k = tone * (1 + 0.04 * nrng.normal(0, 1, (size, size)))
    k = np.where(((xx % w) < 2) | ((yy % w) < 2), 0.6, k)
    return rgb(base)[None, None, :] * k[..., None]


def tex_velvet(base, size=128):
    k = 1 + 0.08 * smooth_noise(size, 8, 6)
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


def M(name, color=None, img=None, tile=4.0, uv=None):
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


def disc_z(mat, x, z, y, r, seg=12, facing=1):
    """Círculo vertical (cono de parlante) mirando hacia +z (facing=1) o -z."""
    bm = BM(mat)
    vs = [bm.verts.new((x + r * math.cos(a), -z, y + r * math.sin(a))) for a in np.linspace(0, 2 * math.pi, seg, endpoint=False)]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(Vector((0, -facing, 0))) < 0:
        f.normal_flip()


def panel(mat, pts, inward):
    """Cara de un solo lado. pts = 4 puntos del juego (x, y, z); inward = hacia dónde mira (juego)."""
    bm = BM(mat)
    f = bm.faces.new([bm.verts.new((x, -z, y)) for x, y, z in pts])
    f.normal_update()
    want = Vector((inward[0], -inward[2], inward[1]))
    if f.normal.dot(want) < 0:
        f.normal_flip()


def wall_x(mat, x, z0, z1, y0, y1, inward):  # pared lateral
    panel(mat, [(x, y0, z0), (x, y0, z1), (x, y1, z1), (x, y1, z0)], (inward, 0, 0))


def wall_z(mat, z, x0, x1, y0, y1, inward):  # pared frontal o del fondo
    panel(mat, [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], (0, 0, inward))


M('piso', img=image('piso', tex_tiles(0x2a2433)), tile=4)
M('pista', 0xffffff, uv='unit')
M('pista_borde', 0xb9bec6)
M('muro', img=image('muro', tex_noise(0x3a2550, amount=0.08)), tile=4)
M('zocalo', 0x1c1424)
M('techo', 0x0e0b12)
M('viga', 0x24202a)
M('neon_rosa', 0xff4fb8)
M('neon_azul', 0x3fd7ff)
M('neon_amarillo', 0xffe14a)
M('escenario', 0x1d1a22)
M('escenario_borde', 0xd8dde3)
M('cabina', 0x2b2f38)
M('cabina_frente', 0x8d5cf6)
M('tornamesa', 0x111114)
M('disco_vinilo', 0x050507)
M('pantalla', 0x7ee0ff)
M('parlante', 0x15151a)
M('parlante_cono', 0x3a3d44)
M('barra', img=image('barra', tex_noise(0x5a3423, amount=0.07)), tile=2)
M('barra_top', 0x2a2a30)
M('repisa', 0x3d2a20)
M('botella_verde', 0x4fe08a)
M('botella_ambar', 0xffb347)
M('botella_azul', 0x58a6ff)
M('taburete', 0xb9bec6)
M('taburete_asiento', 0xd2384f)
M('sofa', img=image('sofa', tex_velvet(0x8e1f3f)), tile=1.5)
M('cojin', 0xd8a13c)
M('mesa_centro', 0x1b1b20)
M('mesa_vidrio', 0x6f8fa8)
M('puerta', 0x262130)
M('salida', 0x55ff7a)
M('bola', 0xd6dbe2)
M('cadena', 0x6b6f76)
M('letrero', 0xff4fb8)

rx0, rz0, rx1, rz1 = L['room']
H = L['height']

# ───────────── Piso, pista, paredes y techo ─────────────
panel('piso', [(rx0, 0, rz0), (rx1, 0, rz0), (rx1, 0, rz1), (rx0, 0, rz1)], (0, 1, 0))

fx0, fz0, fx1, fz1 = L['floor']
panel('pista', [(fx0, 0.03, fz0), (fx1, 0.03, fz0), (fx1, 0.03, fz1), (fx0, 0.03, fz1)], (0, 1, 0))
b = 0.12
for (a0, c0, a1, c1) in ((fx0 - b, fz0 - b, fx1 + b, fz0), (fx0 - b, fz1, fx1 + b, fz1 + b),
                         (fx0 - b, fz0, fx0, fz1), (fx1, fz0, fx1 + b, fz1)):
    gbox('pista_borde', a0, c0, a1, c1, 0, 0.05)

wall_z('muro', rz0, rx0, rx1, 0, H, 1)
wall_z('muro', rz1, rx0, rx1, 0, H, -1)
wall_x('muro', rx0, rz0, rz1, 0, H, 1)
wall_x('muro', rx1, rz0, rz1, 0, H, -1)
panel('techo', [(rx0, H, rz0), (rx1, H, rz0), (rx1, H, rz1), (rx0, H, rz1)], (0, -1, 0))
# zócalo oscuro y dos líneas de neón que dan la vuelta a la sala
for (z, inward) in ((rz0, 1), (rz1, -1)):
    wall_z('zocalo', z - 0.01 * inward * -1, rx0, rx1, 0, 0.35, inward)
for (x, inward) in ((rx0, 1), (rx1, -1)):
    wall_x('zocalo', x + 0.01 * inward, rz0, rz1, 0, 0.35, inward)
for (y, mat) in ((3.3, 'neon_rosa'), (3.5, 'neon_azul')):
    d = 0.06
    gbox(mat, rx0, rz0, rx0 + d, rz1, y, y + 0.06)
    gbox(mat, rx1 - d, rz0, rx1, rz1, y, y + 0.06)
    gbox(mat, rx0, rz1 - d, rx1, rz1, y, y + 0.06)
    gbox(mat, rx0, rz0, rx1, rz0 + d, y, y + 0.06)
# vigas del techo
for k in range(int((rz1 - rz0) / 4.4)):
    z = 2.5 + k * 4.4
    gbox('viga', rx0, z - 0.15, rx1, z + 0.15, H - 0.4, H)

# ───────────── Escenario y cabina del DJ ─────────────
sx0, sz0, sx1, sz1 = L['stage']
SH = L['stageH']
gbox('escenario', sx0, sz0, sx1, sz1, 0, SH)
gbox('escenario_borde', sx0, sz1 - 0.04, sx1, sz1 + 0.02, SH - 0.05, SH + 0.01)
gbox('neon_amarillo', sx0, sz1, sx1, sz1 + 0.03, 0.08, 0.13)
bx0, bz0, bx1, bz1 = L['booth']
gbox('cabina', bx0, bz0, bx1, bz1, SH, SH + 1.05)
gbox('cabina_frente', bx0 + 0.1, bz1, bx1 - 0.1, bz1 + 0.03, SH + 0.15, SH + 0.95)
gbox('cabina', bx0 - 0.05, bz0 - 0.05, bx1 + 0.05, bz1 + 0.05, SH + 1.05, SH + 1.1)
for xx in (-1.2, 1.2):  # dos tornamesas
    gbox('tornamesa', xx - 0.45, bz0 + 0.1, xx + 0.45, bz1 - 0.1, SH + 1.1, SH + 1.18)
    cyl('disco_vinilo', xx, (bz0 + bz1) / 2, SH + 1.18, 0.02, 0.32, seg=16)
gbox('tornamesa', -0.35, bz0 + 0.15, 0.35, bz1 - 0.15, SH + 1.1, SH + 1.2)  # mezclador
# pantalla grande detrás del DJ
gbox('cabina', -4.2, 0, 4.2, 0.12, 1.4, 4.4)
gbox('pantalla', -4.0, 0.12, 4.0, 0.14, 1.6, 4.2)
for (x, z) in L['speakers']:  # torres de parlantes
    gbox('parlante', x - 0.7, z - 0.6, x + 0.7, z + 0.6, 0, 2.6)
    for (yy, r) in ((0.65, 0.42), (1.6, 0.42), (2.3, 0.16)):
        disc_z('parlante_cono', x, z + 0.61, yy, r)

# Letrero de neón "DISCO" sobre la pantalla
cu = bpy.data.curves.new('letrero_txt', 'FONT')
cu.body = 'DISCO'
cu.size = 1.1
cu.extrude = 0.04
cu.align_x = 'CENTER'
tob = bpy.data.objects.new('tmp_txt', cu)
bpy.context.scene.collection.objects.link(tob)
dg = bpy.context.evaluated_depsgraph_get()
me = tob.evaluated_get(dg).to_mesh()
tmp = bmesh.new()
tmp.from_mesh(me)
# el texto está acostado en XY de Blender: se pone de pie mirando hacia la pista (+z del juego = -y Blender)
tmp.transform(G(0, 0.2, 4.55) @ Matrix.Rotation(math.radians(90), 4, 'X'))
tme = bpy.data.meshes.new('t')
tmp.to_mesh(tme)
tmp.free()
BM('letrero').from_mesh(tme)
tob.evaluated_get(dg).to_mesh_clear()
bpy.data.objects.remove(tob)

# ───────────── Barra (pared izquierda) ─────────────
ax0, az0, ax1, az1 = L['bar']
gbox('barra', ax1 - 0.6, az0, ax1, az1, 0, 1.05)
gbox('barra_top', ax1 - 0.75, az0 - 0.1, ax1 + 0.1, az1 + 0.1, 1.05, 1.12)
gbox('neon_azul', ax1 + 0.0, az0, ax1 + 0.03, az1, 0.12, 0.17)
for yy in (1.5, 2.2):  # repisas con botellas contra la pared
    gbox('repisa', rx0, az0 + 0.5, rx0 + 0.4, az1 - 0.5, yy - 0.04, yy)
    z = az0 + 0.8
    k = 0
    while z < az1 - 0.7:
        mat = ('botella_verde', 'botella_ambar', 'botella_azul')[k % 3]
        h = 0.3 + 0.12 * ((k * 7) % 3)
        cyl(mat, rx0 + 0.2, z, yy, h, 0.06, seg=6)
        z += 0.32
        k += 1
for (x, z) in L['stools']:
    cyl('taburete', x, z, 0, 0.72, 0.035, seg=6)
    cyl('taburete', x, z, 0, 0.03, 0.22, seg=10)
    cyl('taburete_asiento', x, z, 0.72, 0.08, 0.22, seg=12)

# ───────────── Zona de sillones (fondo derecho) ─────────────
def sofa(x0, z0, x1, z1, facing):
    """Sillón: base, asiento, respaldo y brazos. facing = 'z-' (mira hacia la pista) o 'x-'."""
    SEAT = L['sofaSeatH']
    if facing == 'z-':
        gbox('sofa', x0, z0, x1, z1, 0.05, SEAT - 0.1)                     # base
        gbox('sofa', x0 + 0.25, z0, x1 - 0.25, z1 - 0.45, SEAT - 0.1, SEAT)  # cojín de asiento
        gbox('sofa', x0, z1 - 0.45, x1, z1, SEAT - 0.1, SEAT + 0.7)        # respaldo
        gbox('sofa', x0, z0, x0 + 0.25, z1, SEAT - 0.1, SEAT + 0.32)        # brazos
        gbox('sofa', x1 - 0.25, z0, x1, z1, SEAT - 0.1, SEAT + 0.32)
        gbox('cojin', x0 + 0.35, z1 - 0.62, x0 + 0.85, z1 - 0.45, SEAT, SEAT + 0.45)
        gbox('cojin', x1 - 0.85, z1 - 0.62, x1 - 0.35, z1 - 0.45, SEAT, SEAT + 0.45)
        for xx in (x0 + 0.1, x1 - 0.18):
            for zz in (z0 + 0.1, z1 - 0.18):
                gbox('mesa_centro', xx, zz, xx + 0.08, zz + 0.08, 0, 0.05)
    else:
        gbox('sofa', x0, z0, x1, z1, 0.05, SEAT - 0.1)
        gbox('sofa', x0, z0 + 0.25, x1 - 0.45, z1 - 0.25, SEAT - 0.1, SEAT)
        gbox('sofa', x1 - 0.45, z0, x1, z1, SEAT - 0.1, SEAT + 0.7)
        gbox('sofa', x0, z0, x1, z0 + 0.25, SEAT - 0.1, SEAT + 0.32)
        gbox('sofa', x0, z1 - 0.25, x1, z1, SEAT - 0.1, SEAT + 0.32)
        gbox('cojin', x1 - 0.62, z0 + 0.4, x1 - 0.45, z0 + 0.9, SEAT, SEAT + 0.45)


sofa(*L['sofa'], 'z-')
sofa(*L['sofa2'], 'x-')
tx0, tz0, tx1, tz1 = L['table']
gbox('mesa_centro', tx0, tz0, tx1, tz1, 0.36, 0.42)
gbox('mesa_vidrio', tx0 + 0.08, tz0 + 0.08, tx1 - 0.08, tz1 - 0.08, 0.42, 0.44)
for xx in (tx0 + 0.05, tx1 - 0.13):
    gbox('mesa_centro', xx, tz0 + 0.05, xx + 0.08, tz1 - 0.05, 0, 0.36)
cyl('botella_ambar', tx0 + 0.4, tz0 + 0.5, 0.44, 0.16, 0.05, seg=6)
cyl('botella_azul', tx0 + 0.65, tz0 + 0.35, 0.44, 0.16, 0.05, seg=6)
# neón sobre los sillones
nx0, nx1 = L['sofa'][0] + 0.2, L['sofa'][2] - 0.2
gbox('neon_rosa', nx0, rz1 - 0.05, nx1, rz1, 2.2, 2.26)
gbox('neon_rosa', nx0, rz1 - 0.05, nx0 + 0.06, rz1, 1.4, 2.26)
gbox('neon_rosa', nx1 - 0.06, rz1 - 0.05, nx1, rz1, 1.4, 2.26)

# ───────────── Puerta de entrada y cartel de salida ─────────────
dx0, dx1 = L['door']
gbox('puerta', dx0, rz1 - 0.08, dx1, rz1, 0, 2.6)
gbox('pista_borde', dx0 - 0.1, rz1 - 0.1, dx1 + 0.1, rz1, 2.6, 2.7)
gbox('salida', (dx0 + dx1) / 2 - 0.4, rz1 - 0.12, (dx0 + dx1) / 2 + 0.4, rz1 - 0.08, 2.8, 3.1)

# ───────────── Bola de espejos ─────────────
bx, by, bz = L['ball']
bmesh.ops.create_uvsphere(BM('bola'), u_segments=14, v_segments=9, radius=0.55, matrix=G(bx, bz, by))
cyl('cadena', bx, bz, by + 0.5, H - by - 0.5, 0.02, seg=4)

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
    elif d['uv'] == 'unit':  # la pista: (0,0) en una esquina, (1,1) en la opuesta
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for lp in f.loops:
                co = lp.vert.co
                lp[uv].uv = ((co.x - fx0) / (fx1 - fx0), (-co.y - fz0) / (fz1 - fz0))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(d['mat'])
    if name == 'bola':
        for p in me.polygons:
            p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                          export_cameras=False, export_lights=False)
print('DISCO OK ->', OUT, len(bpy.data.objects), 'objetos')
