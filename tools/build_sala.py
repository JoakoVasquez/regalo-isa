# Construye en Blender la sala de clases en cascada del Capítulo 2 y la exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_sala.py -- assets\escenarios\sala.json assets\escenarios\sala.glb [assets\escenarios\sala.blend]
#
# Todo sale de assets/escenarios/sala.json (el mismo plano que usa el juego para los asientos y choques).
# Paredes y techo son caras de un solo lado mirando hacia adentro: desde fuera de la sala no se ven,
# así la cámara puede girar alrededor del jugador sin que una pared tape la vista.
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
nrng = np.random.default_rng(2)

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


def tex_wood(base, size=256, slats=16):
    """Listones verticales de madera clara, cada uno con su tono y vetas finas."""
    yy, xx = np.mgrid[0:size, 0:size]
    w = size // slats
    tone = nrng.uniform(0.9, 1.08, slats)[(xx // w) % slats]
    grain = np.repeat(nrng.normal(0, 1, (1, size)), size, 0)  # vetas a lo largo (verticales)
    for _ in range(2):
        grain = (grain + np.roll(grain, 1, 1) + np.roll(grain, -1, 1)) / 3
    k = tone * (1 + 0.05 * grain + 0.03 * smooth_noise(size, 8))
    k = np.where((xx % w) < 1, 0.72, k)  # junta oscura entre listones
    return rgb(base)[None, None, :] * k[..., None]


def tex_floor(base, size=256):
    k = 1 + 0.05 * smooth_noise(size, 16, 8) + 0.025 * nrng.normal(0, 1, (size, size))
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


def M(name, color=None, img=None, tile=4.0):
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


def cyl(mat, x, z, y0, h, r, seg=6):
    bmesh.ops.create_cone(BM(mat), cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=h,
                          matrix=G(x, z, y0 + h / 2))


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


M('piso', img=image('piso', tex_floor(0xc9644b)), tile=3)
M('escalon', img=image('escalon', tex_floor(0xbd5c45)), tile=3)
M('borde_escalon', 0x8e4434)
M('madera', img=image('madera', tex_wood(0xd8b27a)), tile=3)
M('muro', 0xf1efea)
M('techo', 0x3d3f44)
M('viga', 0x55585e)
M('luz', 0xffffff)
M('ventana', 0xcfe6f7)
M('marco_ventana', 0x6f747a)
M('marco_puerta', 0x6f747a)
M('mesa', 0xa5a9ac)
M('mesa_canto', 0x7e8387)
M('mesa_panel', 0x8c9196)
M('pata', 0x4a4e53)
M('silla', 0x8e9398)
M('silla_pata', 0xc6cace)
M('pizarra', 0xf7f8f8)
M('pizarra_marco', 0xb9bdc1)
M('puerta', 0x8f7a5c)
M('manilla', 0xd8dade)
M('vidrio_puerta', 0xbfd6e6)
M('escritorio', 0x8b7356)
M('telon', 0xf2f2f0)

rx0, rz0, rx1, rz1 = L['room']
H = L['height']
FRONT, ROWS, TD, STEP = L['front'], L['rows'], L['tierDepth'], L['step']
WOOD_Y = 1.4

# ───────────── Piso, escalones, paredes y techo ─────────────
panel('piso', [(rx0, 0, rz0), (rx1, 0, rz0), (rx1, 0, rz1), (rx0, 0, rz1)], (0, 1, 0))
for i in range(1, ROWS):
    z0 = FRONT + i * TD
    y = i * STEP
    gbox('escalon', rx0, z0, rx1, rz1, 0, y)
    gbox('borde_escalon', rx0, z0 - 0.01, rx1, z0 + 0.08, y - 0.03, y + 0.005)  # canto antideslizante

wall_z('muro', rz0, rx0, rx1, 0, H, 1)                       # pared de la pizarra (blanca)
for x, inward in ((rx0, 1), (rx1, -1)):                      # paredes laterales: blanco abajo, madera arriba
    wall_x('muro', x, rz0, rz1, 0, WOOD_Y, inward)
    wall_x('madera', x, rz0, rz1, WOOD_Y, H, inward)
wall_z('madera', rz1, rx0, rx1, 0, H, -1)                    # fondo
panel('techo', [(rx0, H, rz0), (rx1, H, rz0), (rx1, H, rz1), (rx0, H, rz1)], (0, -1, 0))

# ventanas en la pared derecha (cerca de la pizarra)
for (wz0, wz1) in L['windows']:
    wall_x('ventana', rx1 - 0.02, wz0, wz1, 2.4, 5.4, -1)
    for zz in (wz0, wz1, (wz0 + wz1) / 2):
        gbox('marco_ventana', rx1 - 0.08, zz - 0.05, rx1, zz + 0.05, 2.4, 5.4)
    for yy in (2.4, 5.4):
        gbox('marco_ventana', rx1 - 0.08, wz0, rx1, wz1, yy - 0.05, yy + 0.05)

# vigas y tubos de luz largos en el techo, paralelos a las filas
for k in range(8):
    z = 2.0 + k * 3.3
    gbox('viga', rx0, z - 0.15, rx1, z + 0.15, H - 0.35, H)
    gbox('luz', -7.5, z + 0.9, 7.5, z + 1.05, H - 0.08, H - 0.02)

# ───────────── Frente: pizarra, telón, escritorio y puertas dobles en las esquinas ─────────────
bx0, bx1 = L['board']
gbox('pizarra_marco', bx0 - 0.08, rz0, bx1 + 0.08, rz0 + 0.06, 0.92, 2.58)
gbox('pizarra', bx0, rz0, bx1, rz0 + 0.08, 1.0, 2.5)
gbox('pizarra_marco', bx0, rz0, bx1, rz0 + 0.2, 0.92, 0.97)        # bandeja de plumones
gbox('pizarra_marco', bx0 + 1, rz0, bx1 - 1, rz0 + 0.25, 5.6, 5.8)          # caja del telón
gbox('telon', bx0 + 1.2, rz0 + 0.1, bx1 - 1.2, rz0 + 0.12, 3.0, 5.6)
dx0, dz0, dx1, dz1 = L['desk']
gbox('escritorio', dx0, dz0, dx1, dz1, 0.72, 0.78)
gbox('escritorio', dx0 + 0.05, dz0, dx1 - 0.05, dz0 + 0.05, 0.1, 0.72)
for xx in (dx0 + 0.05, dx1 - 0.1):
    gbox('pata', xx, dz0, xx + 0.05, dz1, 0, 0.72)

for (px0, px1) in L['doors']:
    gbox('marco_puerta', px0 - 0.1, rz0, px1 + 0.1, rz0 + 0.1, 0, 2.8)
    mid = (px0 + px1) / 2
    for (a, b) in ((px0, mid - 0.01), (mid + 0.01, px1)):  # dos hojas
        gbox('puerta', a, rz0 + 0.06, b, rz0 + 0.12, 0.02, 2.7)
        gbox('vidrio_puerta', a + 0.25, rz0 + 0.11, b - 0.25, rz0 + 0.13, 1.6, 2.4)
    gbox('manilla', mid - 0.2, rz0 + 0.12, mid - 0.05, rz0 + 0.18, 1.05, 1.1)
    gbox('manilla', mid + 0.05, rz0 + 0.12, mid + 0.2, rz0 + 0.18, 1.05, 1.1)

# ───────────── Filas: una mesa continua por escalón y por bloque (4 · 8 · 4) ─────────────
tz0, tz1 = L['tableZ']
TH, SZ, SH, SP = L['tableH'], L['seatZ'], L['seatH'], L['seatSpacing']
for i in range(ROWS):
    z0 = FRONT + i * TD
    y = i * STEP
    for (xs, n) in L['tables']:
        xe = xs + n * SP
        gbox('mesa', xs, z0 + tz0, xe, z0 + tz1, y + TH - 0.04, y + TH)
        gbox('mesa_canto', xs, z0 + tz0 - 0.01, xe, z0 + tz0 + 0.02, y + TH - 0.05, y + TH)
        gbox('mesa_panel', xs + 0.05, z0 + tz0 + 0.03, xe - 0.05, z0 + tz0 + 0.07, y + 0.22, y + TH - 0.04)
        for k in range(0, n + 1, 2):  # patas en T cada dos puestos
            xx = min(max(xs + k * SP, xs + 0.06), xe - 0.06)
            gbox('pata', xx - 0.04, z0 + (tz0 + tz1) / 2 - 0.04, xx + 0.04, z0 + (tz0 + tz1) / 2 + 0.04, y, y + TH - 0.04)
            gbox('pata', xx - 0.04, z0 + tz0 + 0.05, xx + 0.04, z0 + tz1 - 0.05, y, y + 0.05)
        for k in range(n):  # sillas
            sx, sz = xs + (k + 0.5) * SP, z0 + SZ
            gbox('silla', sx - 0.23, sz - 0.24, sx + 0.23, sz + 0.2, y + SH - 0.045, y + SH)
            gbox('silla', sx - 0.23, sz + 0.2, sx + 0.23, sz + 0.25, y + SH + 0.08, y + SH + 0.5)
            for (lx, lz) in ((-0.19, -0.2), (0.19, -0.2), (-0.19, 0.2), (0.19, 0.2)):
                cyl('silla_pata', sx + lx, sz + lz, y, SH - 0.045, 0.018)

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
print('SALA OK ->', OUT, len(bpy.data.objects), 'objetos')
