"""경기장 전체 조명 굽기 (Cycles, 직접광 + 반사광).

  python bake_lighting.py preview <bake폴더> <assets폴더> <출력png> [좌석번호]   # 좌석 시점 렌더로 조명 확인
  python bake_lighting.py bake    <bake폴더> <assets폴더> <출력폴더> [스탠드해상도] [샘플]

입력: bake폴더/bake_scene.glb, bake.json (tools/export_bake.cjs), assets/stands.glb, seat_lo.glb
출력(bake):
  stands_lm.jpg  스탠드 조명 라이트맵 (두 번째 UV)
  field_lm.jpg   그라운드 조명 라이트맵 (첫 번째 UV)
  bake_vertex.glb  v0..vN 메시 + 정점 색(조명)
  seat_light.json  좌석별 밝기 (구역 색에 곱함)
모든 조명 값은 그라운드 평균이 1.0 이 되도록 정규화한 뒤 ÷2 로 저장한다 (앱에서 ×2).
"""
import bpy, bmesh, json, math, os, sys, time
import numpy as np
from mathutils import Vector

MODE = next(a for a in sys.argv if a in ('preview', 'bake', 'seatlight'))
args = sys.argv[sys.argv.index(MODE) + 1:]
SRC, ASSETS, OUT = args[0], args[1], args[2]
REST = args[3:]
LAMP_W, MEMBRANE, BOARD = 2200, 1.6, 1.2          # 지붕 조명등 1개 출력(W), 막 발광 세기, 전광판 발광 세기


def tb(x, y, z):                                   # three 좌표 → Blender 좌표
    return Vector((x, -z, y))


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, merge_vertices=False)
    return [o for o in bpy.data.objects if o not in before and o.type == 'MESH']


def principled(name, rgb, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def hex2lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def to_emission(ob, strength):
    """glTF 에서 가져온 재질을 같은 색/텍스처의 발광 재질로 바꾼다."""
    for slot in ob.material_slots:
        m = slot.material
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        src = None
        if bsdf:
            for k in ('Emission Color', 'Base Color'):
                if bsdf.inputs[k].links:
                    src = bsdf.inputs[k].links[0].from_socket
                    break
        col = bsdf.inputs['Base Color'].default_value[:] if bsdf else (1, 1, 1, 1)
        out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Strength'].default_value = strength
        if src:
            nt.links.new(src, em.inputs['Color'])
        else:
            em.inputs['Color'].default_value = col
        nt.links.new(em.outputs[0], out.inputs['Surface'])


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    J = json.load(open(os.path.join(SRC, 'bake.json')))
    objs = {o.name: o for o in imp(os.path.join(SRC, 'bake_scene.glb'))}
    for o in objs.values():
        o.data.transform(o.matrix_world); o.matrix_world.identity()
    # 발광면: 지붕 막(가운데를 덮는 큰 면)은 낮빛, 지붕 바깥 판은 어두운 천장, 나머지(전광판·띠 LED)는 발광
    for name, o in objs.items():
        if not name.startswith('e'):
            continue
        zs = [v.co.z for v in o.data.vertices]
        if min(zs) > 25:
            near_c = any(math.hypot(v.co.x, v.co.y - 50) < 15 for v in o.data.vertices)
            if near_c:
                to_emission(o, MEMBRANE)
            else:
                o.data.materials.clear(); o.data.materials.append(principled('deck', (0.05, 0.05, 0.048)))
        else:
            to_emission(o, BOARD)
    # 스탠드 (라이트맵 UV 포함)
    st = imp(os.path.join(ASSETS, 'stands.glb'))
    for o in st:
        o.data.transform(o.matrix_world); o.matrix_world.identity()
        for slot in o.material_slots:
            n = slot.material.name
            slot.material = principled(n, hex2lin('#c9c5ba') if 'Concrete' in n else hex2lin('#24272c'))
    stands = st[0] if len(st) == 1 else None
    # 좌석: 저폴리를 색별로 합쳐서 배치
    seat = imp(os.path.join(ASSETS, 'seat_lo.glb'))[0]
    seat.data.transform(seat.matrix_world)
    v0 = np.array([v.co[:] for v in seat.data.vertices])
    tri = np.array([(p.vertices[0], p.vertices[k], p.vertices[k + 1]) for p in seat.data.polygons for k in range(1, len(p.vertices) - 1)])
    bpy.data.objects.remove(seat)
    S = np.array(J['seats'])
    seat_objs = []
    for ci, hexc in enumerate(J['palette']):
        Q = S[S[:, 4] == ci]
        th = math.pi - np.radians(Q[:, 3])
        c, s_ = np.cos(th)[:, None], np.sin(th)[:, None]
        X = v0[None, :, 0] * c - v0[None, :, 1] * s_ + Q[:, 0:1]
        Y = v0[None, :, 0] * s_ + v0[None, :, 1] * c - Q[:, 2:3]
        Z = v0[None, :, 2] + Q[:, 1:2]
        verts = np.stack([X, Y, Z], -1).reshape(-1, 3)
        faces = (tri[None] + (np.arange(len(Q)) * len(v0))[:, None, None]).reshape(-1)
        me = bpy.data.meshes.new('seats%d' % ci)
        me.vertices.add(len(verts)); me.vertices.foreach_set('co', verts.ravel().astype(np.float32))
        me.loops.add(len(faces)); me.loops.foreach_set('vertex_index', faces.astype(np.int32))
        me.polygons.add(len(faces) // 3); me.polygons.foreach_set('loop_start', np.arange(0, len(faces), 3, dtype=np.int32))
        me.update(calc_edges=True)
        me.materials.append(principled('seat%d' % ci, hex2lin(hexc), 0.45))
        ob = bpy.data.objects.new('seats%d' % ci, me); sc.collection.objects.link(ob)
        seat_objs.append(ob)
    # 지붕 조명등: 넓은 면광원, 그라운드 쪽을 향함
    for i, (x, y, z, dx, dy, dz) in enumerate(J['lamps']):
        L = bpy.data.lights.new('lamp%d' % i, 'AREA')
        L.shape = 'RECTANGLE'; L.size, L.size_y = 3.4, 0.9; L.energy = LAMP_W; L.color = (1.0, 0.97, 0.92)
        ob = bpy.data.objects.new('lamp%d' % i, L); sc.collection.objects.link(ob)
        ob.location = tb(x, y, z)
        d = Vector((dx, -dz, dy))
        ob.rotation_euler = (-d).to_track_quat('Z', 'Y').to_euler()     # 면광원은 -Z 로 빛을 낸다
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.5, 0.55, 0.65, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.05
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 1
    return sc, J, objs, st, seat_objs


def preview(seat_idx):
    sc, J, objs, st, seats = build()
    x, y, z, phi, _ = J['seats'][seat_idx]
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    cam.data.lens = 18; cam.location = tb(x, y + 1.14, z)
    cam.rotation_euler = (tb(0, 1, -18.44) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 880, 512
    if os.environ.get('PANO'):                       # 360° 등장방형 파노라마 (좌석 시야 사전 렌더링용)
        cam.data.type = 'PANO'
        try:
            cam.data.panorama_type = 'EQUIRECTANGULAR'
        except AttributeError:
            cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
        cam.rotation_euler = (math.radians(90), 0, math.atan2(-(cam.location.x), cam.location.y - 18.44) if False else 0)
        w = int(os.environ['PANO']); sc.render.resolution_x, sc.render.resolution_y = w, w // 2
    sc.cycles.samples = int(REST[1]) if len(REST) > 1 else 64; sc.cycles.use_denoising = True
    sc.render.filepath = OUT
    t0 = time.time(); bpy.ops.render.render(write_still=True); print('render sec', round(time.time() - t0, 1))


if MODE == 'preview':
    preview(int(REST[0]) if REST else 3000)


R_ENC = 4.0                                         # 저장 범위: 0..4 (앱에서 ×4)


def bake_img(sc, objs, uv_index, res, samples, name):
    img = bpy.data.images.new(name, res, res, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    for o in objs:
        o.data.uv_layers.active_index = uv_index
        for slot in o.material_slots:
            nt = slot.material.node_tree
            n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    sc.cycles.samples = samples
    t0 = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=8, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    print(name, 'bake sec', round(time.time() - t0, 1))
    for o in objs:
        for slot in o.material_slots:
            nt = slot.material.node_tree
            for n in [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image == img]:
                nt.nodes.remove(n)
    px = np.empty(res * res * 4, np.float32); img.pixels.foreach_get(px)
    return px.reshape(res, res, 4)[:, :, :3]


def save_srgb(arr, path, quality=90):
    """선형 값 arr(0..R_ENC) → sRGB 8비트 JPEG."""
    v = np.clip(arr / R_ENC, 0, 1)
    v = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    h, w = v.shape[:2]
    img = bpy.data.images.new('out', w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    rgba = np.concatenate([v, np.ones((h, w, 1), np.float32)], 2)
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = 'JPEG'; bpy.context.scene.render.image_settings.quality = quality
    img.filepath_raw = path; img.save()
    clip = float((arr.max(2) > R_ENC).mean())
    print('saved', path, os.path.getsize(path), 'clipped %.4f' % clip)


def bake(seat_only=False):
    res = int(REST[0]) if REST else 4096
    samples = int(REST[1]) if len(REST) > 1 else 128
    os.makedirs(OUT, exist_ok=True)
    sc, J, objs, st, seat_objs = build()
    if seat_only:
        return bake_seats(sc, J, samples)

    # 1) 그라운드 라이트맵 (첫 UV)
    g = bake_img(sc, [objs['ground']], 0, 2048 if res >= 2048 else 1024, samples, 'field')
    save_srgb(g, os.path.join(OUT, 'field_lm.jpg'))

    # 2) 스탠드 라이트맵 (두 번째 UV)
    a = bake_img(sc, st, 1, res, samples, 'stands')
    save_srgb(a, os.path.join(OUT, 'stands_lm.jpg'))
    small = a.reshape(res // 2, 2, res // 2, 2, 3).mean((1, 3)) if res > 2048 else a
    save_srgb(small, os.path.join(OUT, 'stands_lm_2k.jpg'), 88)

    # 3) 정점 색 굽기: v0..vN
    vt = [o for n, o in objs.items() if n.startswith('v')]
    for o in vt:
        if not o.data.color_attributes.get('bake'):
            o.data.color_attributes.new('bake', 'FLOAT_COLOR', 'CORNER')
        o.data.color_attributes.active_color = o.data.color_attributes['bake']
    bpy.ops.object.select_all(action='DESELECT')
    for o in vt:
        o.select_set(True)
    bpy.context.view_layer.objects.active = vt[0]
    sc.cycles.samples = samples
    t0 = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, target='VERTEX_COLORS', use_clear=True)
    print('vertex bake sec', round(time.time() - t0, 1))
    for o in vt:                                    # 저장 범위로 나눔
        a_ = o.data.color_attributes['bake']
        col = np.empty(len(a_.data) * 4, np.float32); a_.data.foreach_get('color', col)
        col = col.reshape(-1, 4); col[:, :3] = np.clip(col[:, :3] / R_ENC, 0, 1); col[:, 3] = 1
        a_.data.foreach_set('color', col.ravel())
    bpy.ops.object.select_all(action='DESELECT')
    for o in vt:
        o.select_set(True)
    bpy.context.view_layer.objects.active = vt[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'bake_vertex.glb'), export_format='GLB', use_selection=True, export_materials='NONE',
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
                              export_texcoords=True, export_normals=False, export_yup=True)
    print('bake_vertex.glb', os.path.getsize(os.path.join(OUT, 'bake_vertex.glb')))

    bake_seats(sc, J, samples)


def bake_seats(sc, J, samples):
    # 4) 좌석별 밝기: 각 좌석 앞 0.35m, 가슴 높이에 위·앞 45° 를 향한 작은 판을 두고 한 텍셀씩 굽는다
    S = np.array(J['seats']); N = int(math.ceil(math.sqrt(len(S))))
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('uv')
    for i, (x, y, z, phi, _) in enumerate(S):
        ph = math.radians(phi)
        fx, fz = -math.sin(ph), math.cos(ph)          # 그라운드 쪽 수평 방향 (three)
        c = tb(x + fx * 0.35, y + 0.8, z + fz * 0.35)
        f = Vector((fx, -fz, 0)).normalized(); n = (f + Vector((0, 0, 1))).normalized()
        side = Vector((0, 0, 1)).cross(f).normalized(); up = n.cross(side).normalized()
        vs = [bm.verts.new(c + (side * sx + up * sy) * 0.12) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        face = bm.faces.new(vs)
        if face.normal.dot(n) < 0:
            face.normal_flip()
        u0, v0_ = (i % N) / N, (i // N) / N
        for lp, (du, dv) in zip(face.loops, ((0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8))):
            lp[uv].uv = (u0 + du / N, v0_ + dv / N)
    me = bpy.data.meshes.new('probes'); bm.to_mesh(me); bm.free()
    pr = bpy.data.objects.new('probes', me); sc.collection.objects.link(pr)
    me.materials.append(principled('probe', (0.8, 0.8, 0.8)))
    pr.visible_camera = pr.visible_diffuse = pr.visible_glossy = pr.visible_shadow = pr.visible_transmission = False
    p_ = bake_img(sc, [pr], 0, N, samples * 2, 'seatlight')
    idx = np.arange(len(S))
    vals = p_[idx // N, idx % N].mean(1)
    json.dump({'scale': 1, 'light': [round(float(v), 3) for v in vals]}, open(os.path.join(OUT, 'seat_light.json'), 'w'))
    print('seat light min/mean/max', vals.min(), vals.mean(), vals.max())


if MODE == 'bake':
    bake()
if MODE == 'seatlight':                             # 좌석별 밝기만 다시
    bake(seat_only=True)
