"""생성한 glb 를 Cycles 로 렌더해 형태를 확인한다.  python preview.py <에셋폴더> <출력폴더>"""
import bpy, sys, os, math
from mathutils import Vector
A, O = sys.argv[-2], sys.argv[-1]


def scene(res=(900, 560)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.6, 0.68, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (0.7, 0.3, 0.8)
    sc.collection.objects.link(sun)
    return sc


def cam(sc, loc, look, lens=40):
    c = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); c.data.lens = lens; c.location = loc
    c.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(c); sc.camera = c


def imp(name):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(A, name)); return [o for o in bpy.data.objects if o not in before]


def floor(sc, size=20, col=(0.35, 0.35, 0.36)):
    bpy.ops.mesh.primitive_plane_add(size=size); m = bpy.data.materials.new('f'); m.diffuse_color = (*col, 1)
    m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1); bpy.context.object.data.materials.append(m)


def color_mat(rgb):
    m = bpy.data.materials.new('c'); m.use_nodes = True; nt = m.node_tree
    a = nt.nodes.new('ShaderNodeVertexColor'); b = nt.nodes['Principled BSDF']
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    mix.inputs[6].default_value = (*rgb, 1); nt.links.new(a.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.4; return m


def render(sc, name):
    sc.render.filepath = os.path.join(O, name); bpy.ops.render.render(write_still=True); print('rendered', name)


# 좌석: 고품질 3석 + 저폴리 3석, 계단 2열
sc = scene(); floor(sc)
for fname, x0, col in (('seat_hi.glb', -0.8, (0.45, 0.07, 0.15)), ('seat_lo.glb', 0.9, (0.45, 0.07, 0.15))):
    src = imp(fname)[0]; src.data.materials.clear(); src.data.materials.append(color_mat(col))
    for row in range(2):
        for i in range(3):
            o = src.copy(); o.location = (x0 + i * 0.53, row * 0.85, row * 0.45); sc.collection.objects.link(o)
    bpy.data.objects.remove(src)
    for row in range(2):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x0 + 0.53, row * 0.85 - 0.05, row * 0.45 - 0.5)); bpy.context.object.scale = (1.8, 0.85, 1)
cam(sc, (0.2, -3.0, 1.55), (0.1, 0.4, 0.55), 35); render(sc, 'pv_seats.png')

# 선수 4자세
sc = scene(); floor(sc, 12, (0.25, 0.45, 0.22))
objs = imp('players.glb')
for i, o in enumerate(sorted([o for o in objs if o.type == 'MESH' or o.children], key=lambda o: o.name)):
    o.location.x = -1.5 + i * 1.0
cam(sc, (0.2, -4.2, 1.3), (0, 0, 0.85), 40); render(sc, 'pv_players.png')

# 트러스: 아래에서 올려다보기
sc = scene((900, 560)); imp('roof_truss.glb')
cam(sc, (0, -10, 12), (0, 40, 45), 24); render(sc, 'pv_truss.png')
