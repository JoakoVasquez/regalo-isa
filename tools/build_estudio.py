# Construye en Blender el estudio de televisión del Capítulo 8 (el concurso) y lo exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_estudio.py -- assets\escenarios\estudio.json assets\escenarios\estudio.glb [assets\escenarios\estudio.blend]
#
# Todo sale de assets/escenarios/estudio.json (el mismo plano que usa el juego para ubicar a los Miis).
# Set de concurso de noche: tarima redonda con borde luminoso, dos atriles (animador y concursante),
# telón curvo de paneles con columnas de luz, marco de la pantalla gigante, torres de luces a los
# lados y una parrilla de focos arriba. Los materiales que empiezan con "luz" brillan solos en el juego.
#
# Coordenadas: punto del juego (x, y, z) = (x, -z, y) en Blender. El exportador glTF lo deshace solo.
import bpy, bmesh, json, sys, math
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
LAYOUT, OUT = argv[0], argv[1]
BLEND = argv[2] if len(argv) > 2 else None
with open(LAYOUT, encoding='utf-8') as f:
    L = json.load(f)

bpy.ops.wm.read_factory_settings(use_empty=True)


def lin(c):
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(((c >> 16) & 255) / 255), f(((c >> 8) & 255) / 255), f((c & 255) / 255), 1.0)


# ───────────── Materiales (uno por objeto final) ─────────────
MATS = {}


def M(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 1.0
    b.inputs['Specular'].default_value = 0.0
    b.inputs['Base Color'].default_value = lin(color)
    m.use_backface_culling = True
    MATS[name] = {'mat': m, 'bm': bmesh.new()}


def BM(name):
    return MATS[name]['bm']


def T(x, y, z):
    return Matrix.Translation((x, y, z))


def S(sx, sy, sz):
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def G(x, z, y=0.0):
    return T(x, -z, y)


def RY(h):
    """Giro del juego alrededor del eje vertical (rumbo h: 0 = mirando a +z, positivo hacia +x)."""
    return Matrix.Rotation(h, 4, 'Z')


def gbox(mat, x0, z0, x1, z1, y0, y1):
    bmesh.ops.create_cube(BM(mat), size=1.0, matrix=G((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2) @ S(x1 - x0, z1 - z0, y1 - y0))


def rbox(mat, x, z, y0, y1, w, d, h=0.0, dx=0.0, dz=0.0):
    """Caja girada: centro (x, z), ancho w, fondo d, rumbo h; (dx, dz) = corrimiento en sus propios ejes."""
    bmesh.ops.create_cube(BM(mat), size=1.0, matrix=G(x, z, (y0 + y1) / 2) @ RY(h) @ T(dx, -dz, 0) @ S(w, d, y1 - y0))


def cyl(mat, x, z, y0, h, r, seg=12, r2=None):
    bmesh.ops.create_cone(BM(mat), cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2,
                          depth=h, matrix=G(x, z, y0 + h / 2))


def panel(mat, pts, inward):
    """Cara de un solo lado. pts = 4 puntos del juego (x, y, z); inward = hacia dónde mira (juego)."""
    bm = BM(mat)
    f = bm.faces.new([bm.verts.new((x, -z, y)) for x, y, z in pts])
    f.normal_update()
    want = Vector((inward[0], -inward[2], inward[1]))
    if f.normal.dot(want) < 0:
        f.normal_flip()


M('piso', 0x12142a)
M('tarima', 0x2a2f63)
M('tarima_centro', 0x353b7a)
M('luz_borde', 0xff7fb8)
M('luz_anillo', 0xffd257)
M('atril', 0x2c3170)
M('atril_tapa', 0xf0c24a)
M('luz_atril', 0x7fe3ff)
M('panel_a', 0x1d2150)
M('panel_b', 0x2b2f6e)
M('luz_columna', 0xffd257)
M('luz_zocalo', 0xff7fb8)
M('marco', 0xf0c24a)
M('marco_fondo', 0x0c0d1d)
M('torre', 0x23264f)
M('luz_torre', 0x7fe3ff)
M('truss', 0x3c4066)
M('foco', 0x1a1c33)
M('luz_foco', 0xfff3c4)

R, SH = L['stageR'], L['stageH']

# ───────────── Piso y tarima ─────────────
cyl('piso', 0, 0, -0.04, 0.04, 16, 40)
cyl('luz_borde', 0, 0, 0, SH * 0.7, R + 0.09, 48)
cyl('tarima', 0, 0, 0, SH, R, 48)
cyl('luz_anillo', 0, 0, 0, SH + 0.006, R * 0.62, 48)
cyl('tarima_centro', 0, 0, 0, SH + 0.012, R * 0.58, 48)
# escalón de entrada hacia el fondo
gbox('tarima', -0.9, -R - 0.5, 0.9, -R + 0.5, 0, SH * 0.5)

# ───────────── Atriles (uno por persona, girados igual que ella) ─────────────
P = L['podium']
for key in ('joaco', 'isa'):
    x, z, h = L['spots'][key]
    px, pz = x + math.sin(h) * P['dist'], z + math.cos(h) * P['dist']
    y0, y1 = SH, SH + P['h']
    rbox('atril', px, pz, y0, y1, P['w'], P['d'], h)
    rbox('atril_tapa', px, pz, y1, y1 + 0.04, P['w'] + 0.08, P['d'] + 0.08, h)
    rbox('atril_tapa', px, pz, y0, y0 + 0.05, P['w'] + 0.06, P['d'] + 0.06, h)
    # franjas de luz en el frente (lado de la cámara)
    for k in (-1, 0, 1):
        rbox('luz_atril', px, pz, y0 + 0.14, y1 - 0.1, 0.05, 0.02, h, dx=k * 0.18, dz=P['d'] / 2 + 0.005)

# ───────────── Telón curvo de paneles ─────────────
BR, BH, N = L['backR'], L['backH'], L['backPanels']
arc = math.radians(L['backArc'])
ang = [-arc + 2 * arc * i / N for i in range(N + 1)]            # 0 = justo detrás (-z)
pt = lambda a, r=BR: (math.sin(a) * r, -math.cos(a) * r)
for i in range(N):
    (x0, z0), (x1, z1) = pt(ang[i]), pt(ang[i + 1])
    mid = (ang[i] + ang[i + 1]) / 2
    inward = (-math.sin(mid), 0, math.cos(mid))
    panel('panel_a' if i % 2 else 'panel_b', [(x0, 0, z0), (x1, 0, z1), (x1, BH, z1), (x0, BH, z0)], inward)
    # zócalo luminoso al pie de cada panel
    (a0, c0), (a1, c1) = pt(ang[i], BR - 0.03), pt(ang[i + 1], BR - 0.03)
    panel('luz_zocalo', [(a0, 0.02, c0), (a1, 0.02, c1), (a1, 0.12, c1), (a0, 0.12, c0)], inward)
for a in ang:
    x, z = pt(a, BR - 0.06)
    cyl('luz_columna', x, z, 0, BH, 0.045, 8)
    cyl('truss', x, z, 0, 0.3, 0.09, 8)

# ───────────── Marco de la pantalla gigante (la imagen la pone el juego) ─────────────
sx, sy, sz, sw, sh = L['screen']
B = 0.1
gbox('marco_fondo', sx - sw / 2, sz - 0.08, sx + sw / 2, sz - 0.02, sy - sh / 2, sy + sh / 2)
gbox('marco', sx - sw / 2 - B, sz - 0.1, sx + sw / 2 + B, sz + 0.02, sy + sh / 2, sy + sh / 2 + B)
gbox('marco', sx - sw / 2 - B, sz - 0.1, sx + sw / 2 + B, sz + 0.02, sy - sh / 2 - B, sy - sh / 2)
gbox('marco', sx - sw / 2 - B, sz - 0.1, sx - sw / 2, sz + 0.02, sy - sh / 2, sy + sh / 2)
gbox('marco', sx + sw / 2, sz - 0.1, sx + sw / 2 + B, sz + 0.02, sy - sh / 2, sy + sh / 2)
# patas
for k in (-1, 1):
    gbox('truss', sx + k * sw * 0.36 - 0.06, sz - 0.12, sx + k * sw * 0.36 + 0.06, sz - 0.02, 0, sy - sh / 2 - B)

# ───────────── Torres de luces a los lados ─────────────
for tx, tz in L['towers']:
    gbox('torre', tx - 0.22, tz - 0.22, tx + 0.22, tz + 0.22, 0, 3.4)
    gbox('torre', tx - 0.34, tz - 0.34, tx + 0.34, tz + 0.34, 0, 0.16)
    s = -1 if tx > 0 else 1                                          # cara que mira al centro
    for j in range(6):
        y = 0.5 + j * 0.47
        gbox('luz_torre', tx - 0.16, tz + 0.22, tx + 0.16, tz + 0.235, y, y + 0.26)
        gbox('luz_torre', tx + s * 0.22, tz - 0.16, tx + s * 0.235, tz + 0.16, y, y + 0.26)

# ───────────── Parrilla de focos ─────────────
TY = L['trussY']
for dz in (-0.18, 0.18):
    gbox('truss', -4.6, -0.8 + dz - 0.03, 4.6, -0.8 + dz + 0.03, TY, TY + 0.06)
    gbox('truss', -4.6, -0.8 + dz - 0.03, 4.6, -0.8 + dz + 0.03, TY + 0.3, TY + 0.36)
for i in range(24):
    x = -4.6 + 9.2 * i / 23
    gbox('truss', x - 0.02, -1.0, x + 0.02, -0.6, TY, TY + 0.36)
for lx, lz in L['lamps']:
    cyl('truss', lx, lz, TY - 0.22, 0.24, 0.02, 6)
    cyl('foco', lx, lz, TY - 0.46, 0.26, 0.1, 12, r2=0.15)
    cyl('luz_foco', lx, lz, TY - 0.475, 0.02, 0.085, 12)

# ───────────── Mallas finales y exportación ─────────────
for name, d in MATS.items():
    bm = d['bm']
    if not bm.faces:
        bm.free()
        continue
    bm.normal_update()
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
print('ESTUDIO OK ->', OUT, len(bpy.data.objects), 'objetos')
