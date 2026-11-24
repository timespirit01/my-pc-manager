# -*- coding: utf-8 -*-
"""청라돔 Blender 장면 조립 · 내보내기 · 렌더.

  python build_blend.py blend  <출력.blend>                     장면 저장 (개별 좌석 포함)
  python build_blend.py export <assets 폴더>                    웹용 stadium.glb + seats.bin + sections.json + panos.json
  python build_blend.py views  <views.json> <출력폴더> <가로> <세로> <샘플> [gpu]   조감도와 같은 시점 렌더
  python build_blend.py pano   <panos.json> <출력폴더> <가로> <샘플> [gpu] [시작:끝]   360° 등장방형
  python build_blend.py check  [panos.json]                     시야 자동 검사 (광선)

필요: pip install bpy==5.3.0 numpy  ·  assets/field.jpg, board.jpg (tools/make_textures.py), seat_hi.glb
"""
import bpy, json, math, os, struct, sys, time
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cheongna_geom as G
import cheongna_mesh as M

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(ROOT, 'assets')
EYE = 1.14                                        # 앉은 눈높이 (좌석 바닥 기준, 고척돔과 같음)
SEAT_REAL = {'FD': '#22304f', 'L1': '#8a1c24', 'TR': '#22304f', 'CL': '#22304f', 'U3': '#8a1c24', 'UT': '#8a1c24', 'OF': '#8a1c24'}   # [가정] 좌석 색


def hex2lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def material(name):
    col, rough, metal, es, ec, alpha = M.MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if es:
        b.inputs['Emission Color'].default_value = (*ec, 1); b.inputs['Emission Strength'].default_value = es
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'
    tex = {'field': ('field.jpg', 'Base Color'), 'led_board': ('board.jpg', 'Emission Color')}.get(name)
    if tex and os.path.exists(os.path.join(ASSETS, tex[0])):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(ASSETS, tex[0]))
        nt.links.new(t.outputs['Color'], b.inputs[tex[1]])
        if name == 'led_board': nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    m.diffuse_color = (*col, 1)
    return m


def make_objects(sc, groups=('common', 'baseball', 'detail'), concert=False):
    geo, info = M.build(concert=True)
    mats = {}
    cols = {}
    for g in ('common', 'baseball', 'concert', 'detail'):
        c = bpy.data.collections.new(g.upper()); sc.collection.children.link(c); cols[g] = c
    objs = {}
    for ob in geo.values():
        me = bpy.data.meshes.new(ob.name); me.from_pydata(ob.V, [], ob.F)
        names = sorted(set(ob.FM)); idx = {n: i for i, n in enumerate(names)}
        for n in names:
            if n not in mats: mats[n] = material(n)
            me.materials.append(mats[n])
        me.polygons.foreach_set('material_index', [idx[n] for n in ob.FM])
        if any(ob.UV):
            uvl = me.uv_layers.new(name='UVMap'); k = 0
            for f, uv in zip(ob.F, ob.UV):
                for j in range(len(f)):
                    uvl.data[k].uv = uv[j] if uv else (0, 0); k += 1
        me.update()
        o = bpy.data.objects.new(ob.name, me); cols[ob.group].objects.link(o); objs[ob.name] = o
        o['group'] = ob.group
    cols['concert'].hide_render = not concert; cols['concert'].hide_viewport = not concert
    if concert: cols['baseball'].hide_render = True
    for g in ('common', 'baseball', 'detail'):
        if g not in groups: cols[g].hide_render = True
    return objs, info, cols


def flat_seats(sections):
    out = []
    for si, s in enumerate(sections):
        for r in s['rows']:
            for n, (x, y, yaw) in enumerate(r['seats']):
                out.append((x, y, r['z'], yaw, si, r['row'], n + 1))
    return out


def add_seats(sc, sections, hide_near=None):
    """개별 좌석: 점 구름 + 기하 노드 인스턴스 (구역 색 × 좌석 모델 정점색)"""
    path = os.path.join(ASSETS, 'seat_hi.glb')
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]; src = next(o for o in new if o.type == 'MESH')
    src.data.transform(src.matrix_world); src.matrix_world.identity()
    for o in new:
        if o is not src: bpy.data.objects.remove(o, do_unlink=True)
    cname = src.data.color_attributes[0].name if src.data.color_attributes else None
    m = bpy.data.materials.new('seat'); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 0.38; b.inputs['Coat Weight'].default_value = 0.25
    ai = nt.nodes.new('ShaderNodeAttribute'); ai.attribute_type = 'INSTANCER'; ai.attribute_name = 'scol'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    nt.links.new(ai.outputs['Color'], mix.inputs[6])
    if cname:
        ag = nt.nodes.new('ShaderNodeAttribute'); ag.attribute_type = 'GEOMETRY'; ag.attribute_name = cname
        nt.links.new(ag.outputs['Color'], mix.inputs[7])
    else: mix.inputs[7].default_value = (1, 1, 1, 1)
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    src.data.materials.clear(); src.data.materials.append(m); src.name = 'seat_model'; src.hide_render = True
    S = flat_seats(sections); P = np.array([(s[0], s[1], s[2]) for s in S], np.float32)
    keep = np.ones(len(S), bool)
    if hide_near is not None and len(hide_near):                 # 카메라가 앉은 의자는 뺀다 (발밑이 가려지지 않게)
        c = np.array(hide_near, np.float32)
        d = np.hypot(P[:, None, 0] - c[None, :, 0], P[:, None, 1] - c[None, :, 1])
        keep = ~((d < 0.4) & (np.abs(P[:, None, 2] - c[None, :, 2]) < 1.8)).any(1)
    S = [s for s, k in zip(S, keep) if k]; P = P[keep]
    me = bpy.data.meshes.new('seat_points'); me.from_pydata([tuple(p) for p in P.tolist()], [], [])
    rot = me.attributes.new('rot', 'FLOAT_VECTOR', 'POINT')
    rot.data.foreach_set('vector', np.array([(0, 0, s[3] - math.pi / 2) for s in S], np.float32).ravel())   # 좌석 모델은 +Y 를 봄
    pal = {g: hex2lin(c) for g, c in SEAT_REAL.items()}
    col = me.attributes.new('scol', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', np.array([(*pal[sections[s[4]]['grade']], 1) for s in S], np.float32).ravel())
    o = bpy.data.objects.new('seats', me); sc.collection.objects.link(o)
    ng = bpy.data.node_groups.new('SeatInst', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    gi = ng.nodes.new('NodeGroupInput'); go = ng.nodes.new('NodeGroupOutput'); iop = ng.nodes.new('GeometryNodeInstanceOnPoints')
    oi = ng.nodes.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = src
    na = ng.nodes.new('GeometryNodeInputNamedAttribute'); na.data_type = 'FLOAT_VECTOR'; na.inputs['Name'].default_value = 'rot'
    ng.links.new(gi.outputs[0], iop.inputs['Points']); ng.links.new(oi.outputs['Geometry'], iop.inputs['Instance'])
    ng.links.new(na.outputs['Attribute'], iop.inputs['Rotation']); ng.links.new(iop.outputs['Instances'], go.inputs[0])
    o.modifiers.new('inst', 'NODES').node_group = ng
    return o


def world_and_cycles(sc, samples=32, gpu=False, exposure=0.0, world=0.05):
    w = bpy.data.worlds.new('World'); w.use_nodes = True; sc.world = w
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.56, 0.65, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = world
    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.02
    sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 2; sc.cycles.transparent_max_bounces = 16
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError: pass
    sc.view_settings.exposure = exposure
    sc.cycles.device = 'CPU'
    if gpu:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                devs = [d for d in prefs.devices if d.type == kind]
                if devs:
                    for d in prefs.devices: d.use = d.type == kind
                    sc.cycles.device = 'GPU'; print('GPU', kind, [d.name for d in devs]); break
            except Exception as e: print('gpu', kind, e)
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92


def scene(seats=True, detail=True, concert=False, hide_near=None):
    sc = reset()
    objs, info, cols = make_objects(sc, groups=('common', 'baseball', 'detail') if detail else ('common', 'baseball'), concert=concert)
    sections = G.build_sections()
    if seats: add_seats(sc, sections, hide_near)
    return sc, objs, info, sections


def look_cam(sc, name, pos, yaw_deg, pitch_deg, hfov_deg):
    cd = bpy.data.cameras.new(name); cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 36
    cd.lens = 18.0 / math.tan(math.radians(hfov_deg) / 2); cd.clip_start = 0.05; cd.clip_end = 2000
    o = bpy.data.objects.new(name, cd); sc.collection.objects.link(o); o.location = pos
    y, p = math.radians(yaw_deg), math.radians(pitch_deg)
    d = Vector((math.cos(p) * math.cos(y), math.cos(p) * math.sin(y), math.sin(p)))
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o


# ───────── 렌더 지점 · 시야 검사 ─────────
def pano_points(sections):
    """구역마다 가운데 열, 6열 이상이면 맨 앞·맨 뒤 열 추가 (고척돔 교훈 5)"""
    out = []
    for s in sections:
        rows = s['rows']; idx = [len(rows) // 2]
        if len(rows) >= 6: idx = [0, len(rows) // 2, len(rows) - 1]
        for i in idx:
            r = rows[i]; x, y, yaw = r['seats'][len(r['seats']) // 2]
            out.append(dict(name='p%03d' % len(out), id=s['id'], row=r['row'], num=len(r['seats']) // 2 + 1, pos=[x, y, r['z'] + EYE]))
    return out


PRIMARY = {'홈': (0, 0, 0.3), '마운드': (0, 18.44, 0.5), '1루': (19.4, 19.4, 0.3), '3루': (-19.4, 19.4, 0.3), '2루': (0, 38.8, 0.3)}
SECONDARY = {'좌익 폴': (*G.FENCE[-1], 2.0), '우익 폴': (*G.FENCE[0], 2.0), '중견 펜스': (0, G.CFD - 1.5, 1.5),
             '좌익수 자리': (-45.0, 75.0, 0.3), '우익수 자리': (45.0, 75.0, 0.3), '전광판 중앙': (-20.0, 135.0, 39.0)}
IGNORE = ('net', 'rail_', 'glass_', 'seat', 'foul_poles', 'field_mound', 'hotel_glass', 'mullions')    # 의도된 투명·가는 물체

def view_check(sc, pts, targets):
    """모든 렌더 지점에서 기준점으로 광선을 쏴, 그 전에 구조물에 막히면 보고 (고척돔 교훈 4)"""
    dg = bpy.context.evaluated_depsgraph_get(); bad = []
    for p in pts:
        o = Vector(p['pos']); blocked = {}
        for name, t in targets.items():
            d = Vector(t) - o; L = d.length; d.normalize(); start = o + d * 0.35; guard = 0
            while guard < 12:
                hit, loc, nor, idx, ob, _ = sc.ray_cast(dg, start, d, distance=L - (start - o).length - 0.8)
                if not hit: break
                if any(ob.name.startswith(k) for k in IGNORE): start = loc + d * 0.05; guard += 1; continue
                mat = ob.data.materials[ob.data.polygons[idx].material_index].name if ob.type == 'MESH' and ob.data.materials else '?'
                blocked[name] = (ob.name, round((loc - o).length, 1), mat, tuple(round(v, 1) for v in loc)); break
        if blocked: bad.append((p, blocked))
    return bad


# ───────── 명령 ─────────
def cmd_blend(out):
    sc, objs, info, sections = scene(concert=False)
    bpy.data.collections['CONCERT'].hide_render = True
    world_and_cycles(sc, 64)
    for v in json.load(open(os.path.join(ROOT, 'reference', 'views.json'))):
        look_cam(sc, 'CAM_' + v['name'], v['pos'], v['yaw'], v['pitch'], v['hfov'])
    sc.camera = bpy.data.objects.get('CAM_interior_2026')
    sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out)); print('saved', out)


def cmd_export(out):
    sc, objs, info, sections = scene(seats=False, concert=True)
    for c in bpy.data.collections: c.hide_render = False; c.hide_viewport = False
    for o in objs.values():                                        # 같은 자리 꼭짓점 합치기 (용량 ↓)
        if o.data.uv_layers: continue
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.001)
        bpy.ops.object.mode_set(mode='OBJECT'); o.select_set(False)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'stadium.glb'), export_format='GLB', export_yup=True, export_apply=True,
                              export_normals=False, export_texcoords=True, export_materials='EXPORT', export_extras=True,
                              export_image_format='JPEG', export_jpeg_quality=85, use_visible=False)
    # 좌석: seats.bin = Float32 [x, y, z, yaw] × N (Blender 좌표), sections.json = 구역 정보와 열별 좌석 수
    S = flat_seats(sections)
    with open(os.path.join(out, 'seats.bin'), 'wb') as f:
        f.write(np.array([(s[0], s[1], s[2], s[3]) for s in S], '<f4').tobytes())
    meta = dict(spec=G.SPEC, grades=G.GRADES, seatReal=SEAT_REAL, eye=EYE, total=len(S), info={k: list(v) for k, v in info.items()},
                fence=G.FENCE, wall=[PATH for PATH in G.PATH_A.p[::2]], roofTop=M.CEIL_Z,
                sections=[dict(id=s['id'], tier=s['tier'], floor=s['floor'], zone=s['zone'], grade=s['grade'], side=s['side'],
                               rows=[[r['row'], len(r['seats'])] for r in s['rows']]) for s in sections])
    json.dump(meta, open(os.path.join(out, 'sections.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    pts = pano_points(sections); os.makedirs(os.path.join(ROOT, 'out'), exist_ok=True)
    json.dump(pts, open(os.path.join(ROOT, 'out', 'panos.json'), 'w'), ensure_ascii=False)
    print('export', len(S), 'seats', len(sections), 'sections', len(pts), 'pano points',
          {f: os.path.getsize(os.path.join(out, f)) // 1024 for f in ('stadium.glb', 'seats.bin', 'sections.json')})


def cmd_views(listing, out, w, h, samples, gpu):
    views = json.load(open(listing)); os.makedirs(out, exist_ok=True)
    sc, objs, info, sections = scene()
    world_and_cycles(sc, samples, gpu)
    sc.render.resolution_x, sc.render.resolution_y = w, h
    for v in views:
        if ONLY and v['name'] not in ONLY: continue
        cam = look_cam(sc, v['name'], v['pos'], v['yaw'], v['pitch'], v['hfov']); sc.camera = cam
        sc.render.resolution_y = int(round(w / v.get('aspect', w / h)))
        sc.render.filepath = os.path.join(out, v['name'] + '.jpg'); t0 = time.time(); bpy.ops.render.render(write_still=True)
        print('view', v['name'], round(time.time() - t0, 1), 's')


def cmd_pano(listing, out, w, samples, gpu, rng):
    pts = json.load(open(listing)); os.makedirs(out, exist_ok=True)
    sc, objs, info, sections = scene(hide_near=[p['pos'][:2] + [p['pos'][2] - EYE] for p in pts])
    world_and_cycles(sc, samples, gpu)
    cd = bpy.data.cameras.new('pano'); cd.type = 'PANO'; cd.panorama_type = 'EQUIRECTANGULAR'; cd.clip_start = 0.05
    cam = bpy.data.objects.new('pano', cd); sc.collection.objects.link(cam); sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = w, w // 2
    a, b = rng
    for p in pts[a:b]:
        f = os.path.join(out, p['name'] + '.jpg')
        if os.path.exists(f): continue
        x, y, z = p['pos']; dx, dy = 0 - x, 18.44 - y                 # 이미지 가운데 = 마운드 방향
        cam.location = (x, y, z); cam.rotation_euler = (math.pi / 2, 0, math.atan2(-dx, dy))
        sc.render.filepath = f; t0 = time.time(); bpy.ops.render.render(write_still=True)
        print('pano', p['name'], p['id'], round(time.time() - t0, 1), 's', flush=True)
    open(os.path.join(out, 'DONE'), 'w').write('ok')


def cmd_check(listing=None, verbose=False):
    sc, objs, info, sections = scene(seats=False)
    pts = json.load(open(listing)) if listing else pano_points(sections)
    bpy.context.view_layer.update()
    res = {}
    for label, targets in (('내야 기준점(홈·마운드·1~3루)', PRIMARY), ('외야·전광판(참고)', SECONDARY)):
        bad = view_check(sc, pts, targets); by = {}
        for p, b in bad:
            for k, (ob, dist, mat, loc) in b.items(): by.setdefault((k, ob), []).append('%s/%d열(%.0fm %s %s)' % (p['id'], p['row'], dist, mat, loc) if verbose else '%s/%d열' % (p['id'], p['row']))
        print('시야 검사 [%s]: 지점 %d, 막힌 지점 %d' % (label, len(pts), len(bad)))
        for (k, ob), v in sorted(by.items(), key=lambda kv: -len(kv[1])):
            print('  %-8s ← %-20s %3d곳  %s' % (k, ob, len(v), ', '.join(v[:10 if verbose else 6]) + (' …' if len(v) > 10 else '')))
        res[label] = len(bad)
    return res


if __name__ == '__main__':
    argv = sys.argv[1:]; mode = argv[0]; gpu = 'gpu' in argv
    ONLY = [a[5:] for a in argv if a.startswith('only=')]
    rest = [a for a in argv[1:] if a != 'gpu' and not a.startswith('only=')]
    if mode == 'blend': cmd_blend(rest[0])
    elif mode == 'export': cmd_export(rest[0])
    elif mode == 'views': cmd_views(rest[0], rest[1], int(rest[2]), int(rest[3]), int(rest[4]), gpu)
    elif mode == 'pano':
        rng = tuple(int(v) if v else None for v in rest[4].split(':')) if len(rest) > 4 else (None, None)
        cmd_pano(rest[0], rest[1], int(rest[2]), int(rest[3]), gpu, rng)
    elif mode == 'check': cmd_check(next((a for a in rest if a.endswith('.json')), None), 'v' in rest)
