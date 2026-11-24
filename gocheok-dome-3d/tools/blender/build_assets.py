"""고척돔 3D 시야 — Blender 에셋 생성 스크립트

Blender(bpy 모듈 또는 blender --background --python)로 실행한다.
  python build_assets.py <scene.json> <출력폴더>
scene.json 은 tools/export_scene.cjs 가 만든다 (지붕 곡면 반지름 표).

만드는 파일 (모두 glTF 바이너리, three.js 좌표: Y 위, 정면 -Z)
  seat_hi.glb   : 접이식 관람석 고품질 (가까운 구역용)
  seat_lo.glb   : 같은 좌석의 저폴리 (먼 구역용)
  roof_truss.glb: 지붕 바깥 띠의 입체 철골 트러스 + 막 구간 케이블
  players.glb   : 선수 자세 4종 (stand / ready / catcher / batter), 재질 이름으로 색을 바꿔 쓴다
"""
import bpy, bmesh, math, json, sys, os
from mathutils import Vector, Matrix

args = [a for a in sys.argv if a.endswith('.json')] + sys.argv[-1:]
SCENE_JSON, OUT = args[0], args[-1]
os.makedirs(OUT, exist_ok=True)
D2R = math.pi / 180


# ── 공통 도구 ───────────────────────────────────────────
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def bake_object(ob):
    """모디파이어·커브를 적용한 메시 오브젝트로 바꾼다."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    new = link(bpy.data.objects.new(ob.name + '_m', me))
    new.matrix_world = ob.matrix_world.copy()
    bpy.data.objects.remove(ob)
    return new


def set_color(ob, rgb):
    me = ob.data
    a = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for d in a.data:
        d.color = (*rgb, 1.0)


def set_material(ob, name, rgb=(0.8, 0.8, 0.8), rough=0.6, metal=0.0):
    mat = bpy.data.materials.get(name)
    if not mat:
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (*rgb, 1)
            bsdf.inputs['Roughness'].default_value = rough
            bsdf.inputs['Metallic'].default_value = metal
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return mat


def join(objs, name):
    for o in objs:                                  # 변환을 메시에 굽는다
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with bpy.context.temp_override(active_object=objs[0], object=objs[0], selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def shade_smooth(ob, smooth=True):
    for p in ob.data.polygons:
        p.use_smooth = smooth


def export(objs, path, colors=False, materials='NONE'):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_materials=materials, export_vertex_color='ACTIVE' if colors else 'NONE',
                              export_all_vertex_colors=colors, export_texcoords=False, export_normals=True, export_yup=True)
    print('wrote', path, os.path.getsize(path), 'bytes')


def tri_count(objs):
    n = 0
    for o in objs:
        for p in o.data.polygons:
            n += len(p.vertices) - 2
    return n


def tube(bm, a, b, r, sides=6, r2=None):
    """a→b 원통(뚜껑 없음)을 bm 에 추가."""
    a, b = Vector(a), Vector(b)
    d = b - a
    if d.length < 1e-6:
        return
    d.normalize()
    u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
    v = d.cross(u)
    ra, rb = r, (r if r2 is None else r2)
    ring_a = [bm.verts.new(a + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * ra) for k in range(sides)]
    ring_b = [bm.verts.new(b + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * rb) for k in range(sides)]
    for k in range(sides):
        k2 = (k + 1) % sides
        bm.faces.new((ring_a[k], ring_a[k2], ring_b[k2], ring_b[k]))


# ── 1. 좌석 ─────────────────────────────────────────────
def rounded_rect(w, h, r, seg):
    pts = []
    for cx, cy, a0 in [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]:
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def slab(name, w, h, t, r, seg, bev, bevres):
    """둥근 모서리 판 (XY 평면, 두께는 Z)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = max(0.0005, t / 2 - bev)
    cu.bevel_depth = bev
    cu.bevel_resolution = bevres
    sp = cu.splines.new('POLY')
    pts = rounded_rect(w, h, r, seg)
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    return bake_object(link(bpy.data.objects.new(name, cu)))


def cut(ob, xs=(), zs=()):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for x in xs:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x, 0, 0), plane_no=(1, 0, 0))
    for z in zs:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, z, 0), plane_no=(0, 1, 0))
    bm.to_mesh(ob.data)
    bm.free()


def box(name, sx, sy, sz, loc):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=loc, verts=bm.verts)
    return mesh_obj(name, bm)


def build_seat(hi):
    """정면 +Y(three: -Z), 바닥 원점. 플라스틱=흰색(구역 색으로 곱해짐), 금속=어두운 색."""
    WHITE, METAL, PAD = (0.96, 0.96, 0.96), (0.045, 0.047, 0.05), (0.03, 0.03, 0.032)
    seg, bev, bres = (3, 0.008, 1) if hi else (1, 0.0, 0)
    parts = []
    # 등받이: 가로로 살짝 감싸고 허리 받침이 있는 곡면, 뒤로 12° 기울임
    bk = slab('back', 0.44, 0.45, 0.034, 0.065, seg, bev, bres)
    if hi:
        cut(bk, xs=[-0.11, 0, 0.11], zs=[-0.08, 0.08])
    for v in bk.data.vertices:
        x, y, z = v.co                              # 판 좌표: y=높이 방향, z=두께
        v.co.z -= 0.42 * x * x + (0.018 * math.sin(math.pi * (y / 0.45 + 0.5)) if hi else 0)   # 가장자리·허리 부분이 앞(+Y)으로
    bk.rotation_euler = (math.radians(90 + 12), 0, 0)
    bk.location = (0, -0.205, 0.665)
    set_color(bk, WHITE)
    parts.append(bk)
    # 접힌 좌판
    pan = slab('pan', 0.43, 0.40, 0.045, 0.06, seg, bev, bres)
    if hi:
        cut(pan, xs=[-0.1, 0.1])
        for v in pan.data.vertices:
            v.co.z += 0.25 * v.co.x * v.co.x
    pan.rotation_euler = (math.radians(90 + 6), 0, 0)
    pan.location = (0, -0.115, 0.6)
    set_color(pan, WHITE)
    parts.append(pan)
    # 양옆 지지대: 기둥 + 팔걸이 + 바닥판, 좌판 회전축
    sides = 6 if hi else 4
    for sx in (-1, 1):
        x = sx * 0.238
        bm = bmesh.new()
        tube(bm, (x, -0.17, 0.0), (x, -0.185, 0.6), 0.019, sides)
        tube(bm, (x, -0.185, 0.6), (x, -0.27, 0.62), 0.017, sides)
        tube(bm, (x, -0.13, 0.42), (x, -0.185, 0.56), 0.012, sides)
        post = mesh_obj('post', bm)
        set_color(post, METAL)
        parts.append(post)
        arm = slab('arm', 0.05, 0.32, 0.034, 0.02, 3 if hi else 1, 0.008 if hi else 0, 1 if hi else 0)
        arm.rotation_euler = (0, 0, 0)
        arm.location = (x, -0.12, 0.64)
        set_color(arm, PAD)
        parts.append(arm)
        plate = box('plate', 0.06, 0.12, 0.012, (x, -0.17, 0.006))
        set_color(plate, METAL)
        parts.append(plate)
    bm = bmesh.new()
    tube(bm, (-0.238, -0.13, 0.42), (0.238, -0.13, 0.42), 0.014, sides)
    hub = mesh_obj('hub', bm)
    set_color(hub, METAL)
    parts.append(hub)
    seat = join(parts, 'seat_hi' if hi else 'seat_lo')
    shade_smooth(seat, hi)
    if hi:                                            # 넓은 면이 법선을 주도하게 해 곡면 얼룩을 없앤다
        wn = seat.modifiers.new('wn', 'WEIGHTED_NORMAL')
        wn.mode = 'FACE_AREA'
        wn.keep_sharp = True
        seat = bake_object(seat)
        seat.name = seat.data.name = 'seat_hi'
    return seat


# ── 2. 지붕 트러스 ───────────────────────────────────────
def build_truss(sc):
    r0, dout, CZ, H, YW = sc['r0'], sc['dout'], sc['centerZ'], sc['roofHeight'], sc['ywall']
    TM = sc['tm']

    def lerp_tab(tab, phi):
        f = (phi % 360) * 2
        i = int(f)
        t = f - i
        return tab[i % 720] * (1 - t) + tab[(i + 1) % 720] * t

    def S(phi, t):                                   # 지붕 곡면 (three 좌표) → Blender 좌표
        R = t * (lerp_tab(r0, phi) + lerp_tab(dout, phi))
        x, y, z = R * math.sin(phi * D2R), YW + (H - YW) * (1 - t * t), CZ - R * math.cos(phi * D2R)
        return Vector((x, -z, y))

    def Nrm(phi, t):                                 # 곡면 아래쪽 법선
        a = S(phi + 0.5, t) - S(phi - 0.5, t)
        b = S(phi, min(1, t + 0.01)) - S(phi, max(0, t - 0.01))
        n = a.cross(b).normalized()
        return n if n.z < 0 else -n

    NR, TS, DEPTH = 48, [TM + (1 - TM) * k / 8 for k in range(9)], 2.6
    bm = bmesh.new()
    top = {}
    bot = {}
    for i in range(NR):
        phi = 360 * i / NR
        for j, t in enumerate(TS):
            p = S(phi, t)
            top[i, j] = p
            bot[i, j] = p + Nrm(phi, t) * DEPTH * (0.55 + 0.45 * math.sin(math.pi * (j / 8)))   # 가운데가 깊은 트러스
    for i in range(NR):
        i2 = (i + 1) % NR
        for j in range(8):
            tube(bm, top[i, j], top[i, j + 1], 0.22, 6)                     # 상현재
            tube(bm, bot[i, j], bot[i, j + 1], 0.2, 6)                      # 하현재
            tube(bm, top[i, j] if j % 2 == 0 else bot[i, j], bot[i, j + 1] if j % 2 == 0 else top[i, j + 1], 0.1, 5)   # 사재
            tube(bm, top[i, j], bot[i, j], 0.08, 5)                         # 수직재
            tube(bm, top[i, j], top[i2, j], 0.11, 5)                        # 링 방향 보
            if (i + j) % 2 == 0:
                tube(bm, top[i, j], top[i2, j + 1], 0.06, 4)                # 가새
                tube(bm, top[i2, j], top[i, j + 1], 0.06, 4)
        for j in (2, 4, 6):
            tube(bm, bot[i, j], bot[i2, j], 0.12, 5)
        tube(bm, top[i, 8], top[i2, 8], 0.5, 8)                             # 외곽 링
    # 막 구간 경계의 압축 링 (굵은 상자형 보)
    N2 = 96
    for k in range(N2):
        a, c = 360 * k / N2, 360 * (k + 1) / N2
        tube(bm, S(a, TM - 0.005), S(c, TM - 0.005), 0.75, 8)
        tube(bm, S(a, TM) + Nrm(a, TM) * 1.6, S(c, TM) + Nrm(c, TM) * 1.6, 0.45, 8)
    truss = mesh_obj('roof_truss', bm)
    set_material(truss, 'truss', (0.78, 0.8, 0.82), 0.45, 0.6)
    shade_smooth(truss, True)

    # 막 구간: 짧은 축 방향으로 나란한 아치 + 긴 축 방향 보 (가상투어 사진 참고)
    def surf(x, z):                                  # three 좌표 (x, z) 에서 지붕 막 높이, 막 바깥이면 None
        phi = math.degrees(math.atan2(x, -(z - CZ))) % 360
        R = math.hypot(x, z - CZ)
        t = R / (lerp_tab(r0, phi) + lerp_tab(dout, phi))
        if t > TM:
            return None
        return Vector((x, -z, YW + (H - YW) * (1 - t * t) - 0.3))

    def polyline(pts, r):
        pts = [p for p in pts if p is not None]
        for a, b in zip(pts, pts[1:]):
            if (a - b).length < 6:
                tube(bm, a, b, r, 5)

    bm = bmesh.new()
    for z in range(-114, 16, 4):                     # 아치: x 방향으로 가로지름 (가상투어: 약 4m 간격으로 촘촘)
        polyline([surf(x, z) for x in range(-90, 91, 3)], 0.16)
    for x in (-24, 0, 24):                           # 긴 축 방향 보
        polyline([surf(x, z) for z in range(-130, 31, 3)], 0.12)
    cable = mesh_obj('roof_cable', bm)
    set_material(cable, 'cable', (0.92, 0.9, 0.9), 0.5, 0.2)
    shade_smooth(cable, True)
    return [truss, cable]


# ── 3. 선수 ─────────────────────────────────────────────
JERSEY, PANTS, SKIN, SHOES = 'jersey', 'pants', 'skin', 'shoes'
R = {  # 관절 반지름 (가로, 앞뒤)
    'pelvis': (0.165, 0.12), 'waist': (0.15, 0.11), 'chest': (0.185, 0.12), 'collar': (0.14, 0.09), 'neck': (0.055, 0.055),
    'sh': (0.06, 0.06), 'el': (0.045, 0.045), 'wr': (0.034, 0.03), 'hand': (0.04, 0.025),
    'hip': (0.09, 0.09), 'kn': (0.06, 0.06), 'an': (0.042, 0.042), 'toe': (0.04, 0.03),
}
SEGS = [('pelvis', 'waist', JERSEY), ('waist', 'chest', JERSEY), ('chest', 'collar', JERSEY), ('collar', 'neck', SKIN),
        ('chest', 'Lsh', JERSEY), ('Lsh', 'Lel', JERSEY), ('Lel', 'Lwr', SKIN), ('Lwr', 'Lhand', SKIN),
        ('chest', 'Rsh', JERSEY), ('Rsh', 'Rel', JERSEY), ('Rel', 'Rwr', SKIN), ('Rwr', 'Rhand', SKIN),
        ('pelvis', 'Lhip', PANTS), ('Lhip', 'Lkn', PANTS), ('Lkn', 'Lan', PANTS), ('Lan', 'Ltoe', SHOES),
        ('pelvis', 'Rhip', PANTS), ('Rhip', 'Rkn', PANTS), ('Rkn', 'Ran', PANTS), ('Ran', 'Rtoe', SHOES)]


def sym(d, **kw):
    out = dict(d)
    for k, (x, y, z) in kw.items():
        out['L' + k] = (-x, y, z)
        out['R' + k] = (x, y, z)
    return out


POSES = {
    'stand': dict(sym({'pelvis': (0, 0, 0.98), 'waist': (0, 0.01, 1.13), 'chest': (0, 0, 1.31), 'collar': (0, 0, 1.44), 'neck': (0, 0.01, 1.52)},
                      sh=(0.2, 0, 1.41), el=(0.25, 0.02, 1.14), wr=(0.26, 0.05, 0.92), hand=(0.26, 0.07, 0.85),
                      hip=(0.1, 0, 0.94), kn=(0.12, 0.03, 0.52), an=(0.13, -0.02, 0.09), toe=(0.14, 0.13, 0.03)), head=(0, 0.015, 1.655), look=(0, 1, 0)),
    'ready': dict(sym({'pelvis': (0, -0.13, 0.8), 'waist': (0, -0.05, 0.95), 'chest': (0, 0.08, 1.11), 'collar': (0, 0.15, 1.21), 'neck': (0, 0.2, 1.27)},
                      sh=(0.2, 0.12, 1.18), el=(0.25, 0.25, 0.94), wr=(0.21, 0.3, 0.74), hand=(0.2, 0.32, 0.68),
                      hip=(0.11, -0.11, 0.77), kn=(0.2, 0.12, 0.46), an=(0.25, -0.03, 0.09), toe=(0.28, 0.11, 0.03)), head=(0, 0.26, 1.39), look=(0, 1, 0.1)),
    'catcher': dict(sym({'pelvis': (0, -0.12, 0.47), 'waist': (0, -0.05, 0.63), 'chest': (0, 0.03, 0.82), 'collar': (0, 0.07, 0.94), 'neck': (0, 0.09, 1.0)},
                        sh=(0.21, 0.04, 0.9), el=(0.3, 0.22, 0.72), wr=(0.25, 0.32, 0.6), hand=(0.23, 0.35, 0.57),
                        hip=(0.13, -0.08, 0.45), kn=(0.3, 0.25, 0.46), an=(0.27, -0.06, 0.08), toe=(0.29, 0.08, 0.02)), head=(0, 0.13, 1.13), look=(0, 1, 0.05)),
    'batter': dict({'pelvis': (0, 0, 0.9), 'waist': (0, 0.02, 1.05), 'chest': (0, 0.03, 1.24), 'collar': (0, 0.02, 1.37), 'neck': (-0.01, 0.02, 1.45),
                    'Lsh': (-0.19, 0.04, 1.34), 'Lel': (-0.06, 0.25, 1.17), 'Lwr': (0.1, 0.2, 1.27), 'Lhand': (0.13, 0.18, 1.31),
                    'Rsh': (0.19, -0.02, 1.36), 'Rel': (0.27, 0.07, 1.13), 'Rwr': (0.15, 0.17, 1.28), 'Rhand': (0.14, 0.16, 1.34),
                    'Lhip': (-0.1, 0, 0.87), 'Lkn': (-0.27, 0.07, 0.49), 'Lan': (-0.36, 0, 0.09), 'Ltoe': (-0.38, 0.13, 0.03),
                    'Rhip': (0.1, 0, 0.87), 'Rkn': (0.24, 0.07, 0.49), 'Ran': (0.3, -0.02, 0.09), 'Rtoe': (0.33, 0.11, 0.03)},
                   head=(-0.015, 0.03, 1.585), look=(-1, 0.35, 0), bat=((0.135, 0.17, 1.33), (0.33, -0.22, 1.98))),
}


def rkey(n):
    for k in R:
        if n == k or n[1:] == k:
            return R[k]
    raise KeyError(n)


def seg_dist(p, a, b):
    ab = b - a
    t = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length


def build_player(pose_name, glove=True):
    P = POSES[pose_name]
    names = [k for k in P if k not in ('head', 'look', 'bat')]
    idx = {n: i for i, n in enumerate(names)}
    me = bpy.data.meshes.new('sk')
    me.from_pydata([P[n] for n in names], [(idx[a], idx[b]) for a, b, _ in SEGS], [])
    ob = link(bpy.data.objects.new('sk', me))
    ob.modifiers.new('skin', 'SKIN')
    for n, sv in zip(names, me.skin_vertices[0].data):
        sv.radius = rkey(n)
    me.skin_vertices[0].data[idx['pelvis']].use_root = True
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = 1
    body = bake_object(ob)
    mats = [JERSEY, PANTS, SKIN, SHOES, 'cap', 'glove', 'bat']
    for m in mats:
        body.data.materials.append(bpy.data.materials.get(m) or bpy.data.materials.new(m))
    segs = [(Vector(P[a]), Vector(P[b]), mats.index(lab)) for a, b, lab in SEGS]
    for poly in body.data.polygons:
        c = poly.center
        poly.material_index = min(segs, key=lambda s: seg_dist(c, s[0], s[1]))[2]
    parts = [body]
    # 머리 + 모자(챙은 시선 방향)
    hc, look = Vector(P['head']), Vector(P['look']).normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.1)
    bmesh.ops.scale(bm, vec=(0.92, 1.0, 1.12), verts=bm.verts)
    bmesh.ops.translate(bm, vec=hc, verts=bm.verts)
    head = mesh_obj('head', bm)
    head.data.materials.append(bpy.data.materials[SKIN])
    parts.append(head)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.108)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context='VERTS')
    bmesh.ops.scale(bm, vec=(0.95, 1.02, 0.95), verts=bm.verts)
    bmesh.ops.translate(bm, vec=hc + Vector((0, 0, 0.035)), verts=bm.verts)
    yaw = math.atan2(-look.x, look.y)
    brim_c = hc + Vector((0, 0, 0.03)) + Vector((-math.sin(yaw), math.cos(yaw), 0)) * 0.1
    bm2 = bmesh.new()
    bmesh.ops.create_cone(bm2, cap_ends=True, segments=14, radius1=0.075, radius2=0.075, depth=0.012)
    bmesh.ops.scale(bm2, vec=(1.0, 0.75, 1), verts=bm2.verts)
    bmesh.ops.rotate(bm2, cent=(0, 0, 0), matrix=Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(-0.12, 3, 'X'), verts=bm2.verts)
    bmesh.ops.translate(bm2, vec=brim_c, verts=bm2.verts)
    cap = mesh_obj('cap', bm)
    brim = mesh_obj('brim', bm2)
    for o in (cap, brim):
        o.data.materials.append(bpy.data.materials['cap'])
        parts.append(o)
    if glove:                                        # 왼손 글러브
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.085)
        bmesh.ops.scale(bm, vec=(0.6, 1.0, 1.15), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector(P['Lhand']) + Vector((-0.01, 0.03, 0.02)), verts=bm.verts)
        g = mesh_obj('glove', bm)
        g.data.materials.append(bpy.data.materials['glove'])
        parts.append(g)
    if 'bat' in P:
        a, b = P['bat']
        bm = bmesh.new()
        tube(bm, a, b, 0.015, 10, 0.033)
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.033)
        bmesh.ops.translate(bm, vec=Vector(b), verts=r['verts'])
        bt = mesh_obj('bat', bm)
        bt.data.materials.append(bpy.data.materials['bat'])
        parts.append(bt)
    pl = join(parts, 'pose_' + pose_name)
    shade_smooth(pl, True)
    return pl


def main():
    sc = json.load(open(SCENE_JSON))
    reset()
    for hi in (True, False):
        s = build_seat(hi)
        print(s.name, 'tris', tri_count([s]))
        export([s], os.path.join(OUT, s.name + '.glb'), colors=True)
        bpy.data.objects.remove(s)

    reset()
    objs = build_truss(sc)
    print('truss tris', tri_count(objs))
    export(objs, os.path.join(OUT, 'roof_truss.glb'), materials='EXPORT')

    reset()
    for m, c in [(JERSEY, (0.9, 0.9, 0.9)), (PANTS, (0.9, 0.9, 0.9)), (SKIN, (0.72, 0.5, 0.38)), (SHOES, (0.03, 0.03, 0.03)),
                 ('cap', (0.3, 0.05, 0.1)), ('glove', (0.35, 0.2, 0.08)), ('bat', (0.65, 0.48, 0.28))]:
        mat = bpy.data.materials.new(m)
        mat.use_nodes = True
        mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*c, 1)
        mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.8
    pls = [build_player('stand'), build_player('ready'), build_player('catcher'), build_player('batter', glove=False)]
    for p in pls:
        print(p.name, 'tris', tri_count([p]))
    export(pls, os.path.join(OUT, 'players.glb'), materials='EXPORT')


main()
