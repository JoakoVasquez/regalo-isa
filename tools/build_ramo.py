# Modela en Blender el ramo del Capítulo 5 y lo exporta a .glb.
#
# Uso (desde la carpeta del proyecto):
#   "C:\Program Files\Blender Foundation\Blender 3.6\blender.exe" -b --factory-startup ^
#       -P tools\build_ramo.py -- assets\escenarios\ramo.glb [assets\escenarios\ramo.blend]
#
# Son las flores de verdad: lirios blancos (con dos botones verdes), crisantemos blancos y rosados,
# limonium morado, paniculata y hojas, envueltas en papel. El origen es donde lo toma la mano;
# los tallos bajan y las flores suben (+y en el juego). Mide unos 55 cm.
import bpy, bmesh, sys, math
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
BLEND = argv[1] if len(argv) > 1 else None
rng = np.random.default_rng(14)

bpy.ops.wm.read_factory_settings(use_empty=True)


def lin(c):
    f = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(((c >> 16) & 255) / 255), f(((c >> 8) & 255) / 255), f((c & 255) / 255), 1.0)


MATS = {}


def M(name, color, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(color)
    b.inputs['Roughness'].default_value = 1.0
    b.inputs['Specular'].default_value = 0.0
    m.use_backface_culling = not double
    MATS[name] = {'mat': m, 'bm': bmesh.new()}


def BM(n):
    return MATS[n]['bm']


M('tallo', 0x5e8f3a)
M('hoja', 0x4a8236, double=True)
M('papel', 0xf2cdd6, double=True)
M('papel2', 0xfbf7f2, double=True)
M('cinta', 0xd65c7c)
M('crisantemo_blanco', 0xf6f3ea)
M('crisantemo_rosa', 0xf1b5cc)
M('centro', 0xe7e3b8)
M('lirio', 0xfaf8f1, double=True)
M('estambre', 0xc28b3c)
M('boton', 0xc9d99a)
M('limonium', 0x8f86c9)
M('paniculata', 0xffffff)


def up_matrix(pos, direction):
    """Matriz que lleva +Z al vector `direction` y el origen a `pos`."""
    d = Vector(direction).normalized()
    q = Vector((0, 0, 1)).rotation_difference(d)
    return Matrix.Translation(pos) @ q.to_matrix().to_4x4()


def stem(p0, p1, r=0.005):
    d = Vector(p1) - Vector(p0)
    bmesh.ops.create_cone(BM('tallo'), cap_ends=False, segments=5, radius1=r, radius2=r * 0.8, depth=d.length,
                          matrix=up_matrix((Vector(p0) + Vector(p1)) / 2, d))


def pompon(mat, pos, r):
    """Crisantemo: bola de pétalos en punta."""
    bm = BM(mat)
    before = set(bm.verts)
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r, matrix=Matrix.Translation(pos) @ Matrix.Diagonal((1, 1, 0.8, 1)))
    c = Vector(pos)
    for v in set(bm.verts) - before:
        v.co = c + (v.co - c) * rng.uniform(0.75, 1.3)
    bmesh.ops.create_icosphere(BM('centro'), subdivisions=1, radius=r * 0.35, matrix=Matrix.Translation(c + Vector((0, 0, r * 0.62))))


def petal(mat, base, direction, length, width, curl=0.35):
    """Pétalo de lirio en dos tramos: sube y se abre hacia afuera."""
    bm = BM(mat)
    d = Vector(direction).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    out = Vector((d.x, d.y, 0)).normalized() if Vector((d.x, d.y, 0)).length > 1e-3 else side.cross(Vector((0, 0, 1)))
    b = Vector(base)
    mid = b + d * length * 0.55
    tip = mid + (d * (1 - curl) + out * curl).normalized() * length * 0.5 - Vector((0, 0, length * 0.12))
    w = width / 2
    vs = [bm.verts.new(b), bm.verts.new(mid + side * w), bm.verts.new(tip), bm.verts.new(mid - side * w)]
    bm.faces.new(vs)


def lily(pos, direction):
    d = Vector(direction).normalized()
    for k in range(6):
        a = k / 6 * 2 * math.pi
        ring = Vector((math.cos(a), math.sin(a), 0))
        pd = (d * 0.8 + ring * 0.75).normalized()
        petal('lirio', pos, pd, 0.11, 0.035)
    for k in range(5):
        a = k / 5 * 2 * math.pi
        tip = Vector(pos) + d * 0.07 + Vector((math.cos(a), math.sin(a), 0)) * 0.015
        bmesh.ops.create_cone(BM('estambre'), cap_ends=True, segments=3, radius1=0.002, radius2=0.002, depth=0.07,
                              matrix=up_matrix((Vector(pos) + tip) / 2, tip - Vector(pos)))
        bmesh.ops.create_icosphere(BM('estambre'), subdivisions=1, radius=0.006, matrix=Matrix.Translation(tip))


def leaf(base, direction, length=0.16, width=0.04):
    bm = BM('hoja')
    d = Vector(direction).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    b = Vector(base)
    vs = [bm.verts.new(b), bm.verts.new(b + d * length * 0.45 + side * width / 2),
          bm.verts.new(b + d * length), bm.verts.new(b + d * length * 0.45 - side * width / 2)]
    bm.faces.new(vs)


def cone_wrap(mat, r0, r1, z0, z1, seg=12, wobble=0.0, phase=0.0):
    """Papel: cono abierto con el borde de arriba ondulado."""
    bm = BM(mat)
    lo, hi = [], []
    for k in range(seg):
        a = k / seg * 2 * math.pi + phase
        lo.append(bm.verts.new((math.cos(a) * r0, math.sin(a) * r0, z0)))
        rr = r1 * (1 + wobble * math.sin(a * 3 + 1))
        hi.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z1 + wobble * 0.4 * math.cos(a * 2))))
    for k in range(seg):
        bm.faces.new([lo[k], lo[(k + 1) % seg], hi[(k + 1) % seg], hi[k]])


# ───────────── Tallos y envoltorio ─────────────
for k in range(14):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(0, 0.018)
    x, y = math.cos(a) * r, math.sin(a) * r
    stem((x * 0.6, y * 0.6, -0.17), (x * 3, y * 3, 0.16))
cone_wrap('papel2', 0.03, 0.15, -0.03, 0.22, wobble=0.12, phase=0.3)
cone_wrap('papel', 0.034, 0.17, -0.06, 0.2, wobble=0.18)
bmesh.ops.create_cone(BM('cinta'), cap_ends=False, segments=12, radius1=0.04, radius2=0.042, depth=0.035,
                      matrix=Matrix.Translation((0, 0, -0.01)))
for s in (-1, 1):  # moño
    bmesh.ops.create_icosphere(BM('cinta'), subdivisions=1, radius=0.025,
                               matrix=Matrix.Translation((0.03 * s, -0.045, -0.005)) @ Matrix.Diagonal((1.6, 0.5, 0.9, 1)))

# ───────────── Flores ─────────────
# cúpula de crisantemos (blancos y algunos rosados)
heads = []
for k in range(11):
    a = k * 2.4 + rng.uniform(-0.2, 0.2)
    rr = 0.035 + 0.1 * math.sqrt(k / 11)
    pos = Vector((math.cos(a) * rr, math.sin(a) * rr, 0.3 - rr * 0.55 + rng.uniform(-0.01, 0.01)))
    heads.append(pos)
    pompon('crisantemo_rosa' if k in (3, 7, 9) else 'crisantemo_blanco', pos, rng.uniform(0.042, 0.052))

# dos lirios abiertos que asoman arriba y al costado, con sus botones
lily(Vector((-0.07, 0.03, 0.36)), (-0.5, 0.15, 1))
lily(Vector((0.06, -0.06, 0.35)), (0.4, -0.5, 1))
stem((-0.03, 0.01, 0.15), (-0.07, 0.03, 0.36))
stem((0.02, -0.02, 0.15), (0.06, -0.06, 0.35))
for (x, y, z) in [(-0.02, 0.06, 0.47), (0.01, 0.04, 0.44)]:
    stem((x * 0.3, y * 0.3, 0.16), (x, y, z - 0.03))
    bmesh.ops.create_cone(BM('boton'), cap_ends=True, segments=6, radius1=0.016, radius2=0.002, depth=0.09,
                          matrix=Matrix.Translation((x, y, z + 0.01)))

# limonium morado a un costado
for c in [Vector((-0.12, 0.05, 0.22)), Vector((-0.1, -0.06, 0.24))]:
    for _ in range(26):
        p = c + Vector(rng.normal(0, 0.022, 3)) * Vector((1, 1, 1.6))
        bmesh.ops.create_icosphere(BM('limonium'), subdivisions=1, radius=0.011, matrix=Matrix.Translation(p))

# paniculata adelante
for c in [Vector((0.03, -0.13, 0.2)), Vector((0.11, -0.07, 0.19)), Vector((-0.05, -0.12, 0.21))]:
    for _ in range(22):
        p = c + Vector(rng.normal(0, 0.02, 3))
        bmesh.ops.create_icosphere(BM('paniculata'), subdivisions=1, radius=0.006, matrix=Matrix.Translation(p))

# hojas que asoman entre las flores
for k in range(9):
    a = k / 9 * 2 * math.pi + rng.uniform(0, 0.4)
    base = Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.18))
    leaf(base, (math.cos(a) * 0.8, math.sin(a) * 0.8, 1.0), rng.uniform(0.12, 0.18))

# ───────────── Exportación ─────────────
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
    for p in me.polygons:
        p.use_smooth = name in ('papel', 'papel2', 'cinta')
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)

if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=False,
                          export_cameras=False, export_lights=False)
print('RAMO OK ->', OUT, len(bpy.data.objects), 'objetos')
