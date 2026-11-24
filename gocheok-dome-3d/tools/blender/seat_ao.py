"""좌석 모델에 주변 차폐(AO)를 정점 색으로 굽는다 (계단식 3×3 좌석 배치 안의 가운데 좌석 기준).
  python seat_ao.py <assets폴더>     # seat_hi.glb, seat_lo.glb 를 덮어쓴다 (build_assets.py 다음에 실행)
좌판 아래·등받이 뒤·다리 사이가 어두워져, 실시간 화면에서도 좌석이 입체적으로 보인다."""
import bpy, os, sys, math
import numpy as np

A = sys.argv[-1]


def run(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=os.path.join(A, name + '.glb'))
    src = [o for o in sc.objects if o.type == 'MESH'][0]
    src.data.transform(src.matrix_world); src.matrix_world.identity()
    # 이웃 좌석 8개 + 계단 (열 간격 0.85m, 단 높이 0.45m, 좌석 간격 0.53m)
    for r in (-1, 0, 1):
        for c in (-1, 0, 1):
            if r == 0 and c == 0:
                continue
            o = src.copy(); o.data = src.data.copy(); sc.collection.objects.link(o)
            o.location = (c * 0.53, -r * 0.85, r * 0.45)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -r * 0.85 - 0.05, r * 0.45 - 0.5))
        bpy.context.object.scale = (2.2, 0.85, 1)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -2.0, 1.5)); bpy.context.object.scale = (2.2, 0.2, 3)   # 뒤 벽 대신
    me = src.data
    base = me.color_attributes[0].name               # glTF 에서 가져온 원래 색 (COLOR_0)
    ao = me.color_attributes.new('ao', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 256
    sc.world = bpy.data.worlds.new('w'); sc.world.light_settings.distance = 0.6
    if not me.materials:
        me.materials.append(bpy.data.materials.new('m'))
    bpy.ops.object.select_all(action='DESELECT'); src.select_set(True); bpy.context.view_layer.objects.active = src
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', use_clear=True)
    col = me.color_attributes[base]
    a = np.empty(len(ao.data) * 4, np.float32); ao.data.foreach_get('color', a)
    c = np.empty(len(col.data) * 4, np.float32); col.data.foreach_get('color', c)
    a, c = a.reshape(-1, 4), c.reshape(-1, 4)
    k = 0.35 + 0.65 * a[:, :1]                      # 너무 새까맣지 않게
    c[:, :3] *= k
    col.data.foreach_set('color', c.ravel())
    me.color_attributes.remove(me.color_attributes['ao'])
    me.color_attributes.active_color = me.color_attributes[base]
    for o in list(sc.objects):
        if o != src:
            bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action='DESELECT'); src.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(A, name + '.glb'), export_format='GLB', use_selection=True, export_materials='NONE',
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
                              export_texcoords=False, export_normals=True, export_yup=True)
    print(name, 'ao min/mean', float(k.min()), float(k.mean()))


for n in ('seat_hi', 'seat_lo'):
    run(n)
