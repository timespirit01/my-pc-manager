"""스탠드 콘크리트에 주변 차폐(AO) 그림자를 굽는다 (Cycles).
  python bake_stands.py <scene.json·stands.glb 폴더> <에셋 폴더(seat_lo.glb)> <출력폴더> [해상도] [샘플]
출력: stands.glb (원래 UV + 라이트맵 UV, 재질 2개) , stands_ao.jpg (+ _2k 축소본)
좌석은 저폴리 모델을 15,825개 위치에 배치해 가림 물체로만 쓴다."""
import bpy, json, math, os, sys, time
import numpy as np

SRC, ASSETS, OUT = sys.argv[-5], sys.argv[-4], sys.argv[-3]
RES, SAMPLES = int(sys.argv[-2]), int(sys.argv[-1])
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def imp(path, merge=False):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, merge_vertices=merge)
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']


# 1) 스탠드 메시: 정점 병합 → 하나로 합침 (재질 2개 유지)
stands = imp(os.path.join(SRC, 'stands.glb'), merge=True)
for o in stands:
    o.data.transform(o.matrix_world); o.matrix_world.identity()
bpy.ops.object.select_all(action='DESELECT')
for o in stands:
    o.select_set(True)
bpy.context.view_layer.objects.active = stands[0]
bpy.ops.object.join()
st = bpy.context.view_layer.objects.active
st.name = st.data.name = 'stands'
area = sum(p.area for p in st.data.polygons)
print('stands faces', len(st.data.polygons), 'area m2', round(area), 'texel cm', round(100 * math.sqrt(area / (RES * RES * 0.7)), 1))

# 2) 라이트맵 UV
st.data.uv_layers.new(name='lightmap')
st.data.uv_layers.active = st.data.uv_layers['lightmap']
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.0015, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')

# 3) 가림 물체: 좌석 15,825개 (저폴리)
sj = json.load(open(os.path.join(SRC, 'scene.json')))
seat = imp(os.path.join(ASSETS, 'seat_lo.glb'))[0]
seat.data.transform(seat.matrix_world)
v0 = np.array([v.co[:] for v in seat.data.vertices])
tri = []
for p in seat.data.polygons:
    vs = list(p.vertices)
    for k in range(1, len(vs) - 1):
        tri.append((vs[0], vs[k], vs[k + 1]))
tri = np.array(tri)
bpy.data.objects.remove(seat)
S = np.array(sj['seats'])                             # three 좌표 x,y,z,phi
th = math.pi - np.radians(S[:, 3])
c, s = np.cos(th)[:, None], np.sin(th)[:, None]
X = v0[None, :, 0] * c - v0[None, :, 1] * s + S[:, 0:1]          # Blender Z 축 회전 + 이동 (Blender 좌표 = x, -z, y)
Y = v0[None, :, 0] * s + v0[None, :, 1] * c - S[:, 2:3]
Z = v0[None, :, 2] + S[:, 1:2]
verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
faces = (tri[None, :, :] + (np.arange(len(S)) * len(v0))[:, None, None]).reshape(-1)
me = bpy.data.meshes.new('occ')
me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel().astype(np.float32))
me.loops.add(len(faces)); me.loops.foreach_set('vertex_index', faces.astype(np.int32))
me.polygons.add(len(faces) // 3); me.polygons.foreach_set('loop_start', np.arange(0, len(faces), 3, dtype=np.int32))
me.update(calc_edges=True)
occ = bpy.data.objects.new('occ', me); sc.collection.objects.link(occ)
print('occluder tris', len(faces) // 3)

# 4) AO 굽기
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = SAMPLES
sc.world = bpy.data.worlds.new('w')
sc.world.light_settings.distance = 1.8                # 1.8m 이내의 가림만 반영
img = bpy.data.images.new('stands_ao', RES, RES, alpha=False, float_buffer=False)
img.colorspace_settings.name = 'Non-Color'
for slot in st.material_slots:
    m = slot.material
    m.use_nodes = True
    n = m.node_tree.nodes.new('ShaderNodeTexImage')
    n.image = img
    m.node_tree.nodes.active = n
bpy.ops.object.select_all(action='DESELECT')
st.select_set(True)
bpy.context.view_layer.objects.active = st
t0 = time.time()
bpy.ops.object.bake(type='AO', margin=6, margin_type='EXTEND', use_clear=True)
print('bake sec', round(time.time() - t0, 1))

img.file_format = 'JPEG'
sc.render.image_settings.quality = 90
img.filepath_raw = os.path.join(OUT, 'stands_ao.jpg'); img.save()
small = img.copy(); small.scale(RES // 2, RES // 2)
small.filepath_raw = os.path.join(OUT, 'stands_ao_2k.jpg'); small.file_format = 'JPEG'; small.save()

# 5) 스탠드 내보내기 (UV 두 벌, 재질 이름 유지)
bpy.data.objects.remove(occ)
for slot in st.material_slots:                        # 굽기용 노드 제거
    for n in [n for n in slot.material.node_tree.nodes if n.type == 'TEX_IMAGE']:
        slot.material.node_tree.nodes.remove(n)
bpy.ops.object.select_all(action='DESELECT'); st.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'stands.glb'), export_format='GLB', use_selection=True,
                          export_materials='EXPORT', export_texcoords=True, export_normals=True, export_vertex_color='NONE', export_yup=True)
for f in ('stands.glb', 'stands_ao.jpg', 'stands_ao_2k.jpg'):
    print(f, os.path.getsize(os.path.join(OUT, f)))
