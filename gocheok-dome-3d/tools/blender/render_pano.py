"""좌석 시야 사전 렌더링 (Cycles). 조명 굽기용 장면(bake_lighting.build)에 렌더 전용 세부 요소를 더해 그린다.

  python render_pano.py views <bake폴더> <assets폴더> <views.json> <출력폴더> <가로px> <세로px> <샘플> [gpu]
      views.json: [{"name":..., "pos":[x,y,z], "yaw":라디안, "pitch":라디안, "hfov":도}]  (three 좌표, 가상투어 비교용)
  python render_pano.py pano  <bake폴더> <assets폴더> <panos.json> <출력폴더> <가로px> <샘플> [gpu]
      panos.json: [{"name":..., "pos":[x,y,z]}]  → 360° 등장방형, 이미지 가운데가 마운드 방향

입력: bake폴더/bake_scene.glb, bake.json (tools/export_bake.cjs — anchors 포함), assets/seat_hi.glb, stands.glb
"""
import bpy, bmesh, json, math, os, sys, time
import numpy as np
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_lighting as BL                      # noqa: E402  (MODE 없이 가져오면 build() 만 씀)

D2R = math.pi / 180
MODE = next(a for a in sys.argv if a in ('views', 'pano'))
ARGS = sys.argv[sys.argv.index(MODE) + 1:]
SRC, ASSETS, LIST, OUT = ARGS[:4]
GPU = 'gpu' in ARGS[4:]
NUMS = [a for a in ARGS[4:] if a != 'gpu']
tb = BL.tb


# ── 형상 기준 (three 좌표) ───────────────────────────────
class Geo:
    def __init__(self, A):
        self.A = A
        self.r0, self.dout, self.CZ = A['r0'], A['dout'], A['centerZ']

    def tab(self, t, phi):
        f = (phi % 360) * 2
        i = int(f); w = f - i
        return t[i % 720] * (1 - w) + t[(i + 1) % 720] * w

    def P(self, phi, d, y):                       # → Blender 좌표
        R = self.tab(self.r0, phi) + d
        return tb(R * math.sin(phi * D2R), y, self.CZ - R * math.cos(phi * D2R))

    def Pout(self, phi, inset, y):                # 둘레 벽 기준
        R = self.tab(self.r0, phi) + self.tab(self.dout, phi) - inset
        return tb(R * math.sin(phi * D2R), y, self.CZ - R * math.cos(phi * D2R))


def mat(name, rgb, rough=0.6, metal=0.0, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    for k, v in kw.items():
        b.inputs[k].default_value = v
    return m


def obj(name, bm, material):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return o


def tube(bm, a, b, r, sides=6):
    a, b = Vector(a), Vector(b); d = b - a
    if d.length < 1e-6:
        return
    d.normalize()
    u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized(); v = d.cross(u)
    ra = [bm.verts.new(a + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)]
    rb = [bm.verts.new(b + (u * math.cos(2 * math.pi * k / sides) + v * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)]
    for k in range(sides):
        bm.faces.new((ra[k], ra[(k + 1) % sides], rb[(k + 1) % sides], rb[k]))


def quad(bm, p0, p1, p2, p3, uv=None, uvl=None):
    f = bm.faces.new([bm.verts.new(p) for p in (p0, p1, p2, p3)])
    if uv:
        for lp, c in zip(f.loops, uv):
            lp[uvl].uv = c
    return f


def boxq(bm, corners):                            # 8 꼭짓점 상자 (아래 4, 위 4)
    v = [bm.verts.new(c) for c in corners]
    for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([v[i] for i in f])


def arc_steps(a, b, R, spacing):
    n = max(1, int(round((b - a) * D2R * R / spacing)))
    return [a + (b - a) * k / n for k in range(n + 1)]


# ── 세부 요소 ────────────────────────────────────────────
def add_seats(J, geo):
    src = BL.imp(os.path.join(ASSETS, 'seat_hi.glb'))[0]
    src.data.transform(src.matrix_world); src.matrix_world.identity()
    cname = src.data.color_attributes[0].name if src.data.color_attributes else None
    m = bpy.data.materials.new('seat'); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 0.38
    b.inputs['Coat Weight'].default_value = 0.25                               # 플라스틱 광택
    ai = nt.nodes.new('ShaderNodeAttribute'); ai.attribute_type = 'INSTANCER'; ai.attribute_name = 'scol'
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    nt.links.new(ai.outputs['Color'], mix.inputs[6])
    if cname:
        ag = nt.nodes.new('ShaderNodeAttribute'); ag.attribute_type = 'GEOMETRY'; ag.attribute_name = cname
        nt.links.new(ag.outputs['Color'], mix.inputs[7])
    else:
        mix.inputs[7].default_value = (1, 1, 1, 1)
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    src.data.materials.clear(); src.data.materials.append(m)
    src.hide_render = True; src.hide_viewport = False
    S = np.array(J['seats']); pal = [BL.hex2lin(h) for h in J['palette']]
    pts = [tb(x, y, z) for x, y, z, _, _ in S]
    me = bpy.data.meshes.new('seatpts'); me.from_pydata([tuple(p) for p in pts], [], [])
    rot = me.attributes.new('rot', 'FLOAT_VECTOR', 'POINT')
    rot.data.foreach_set('vector', np.array([(0, 0, math.pi - phi * D2R) for *_, phi, _ in S], np.float32).ravel())
    col = me.attributes.new('scol', 'FLOAT_COLOR', 'POINT')
    col.data.foreach_set('color', np.array([(*pal[int(c)], 1) for *_, c in S], np.float32).ravel())
    o = bpy.data.objects.new('seats', me); bpy.context.scene.collection.objects.link(o)
    ng = bpy.data.node_groups.new('SeatInst', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    gi = ng.nodes.new('NodeGroupInput'); go = ng.nodes.new('NodeGroupOutput')
    iop = ng.nodes.new('GeometryNodeInstanceOnPoints')
    oi = ng.nodes.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = src
    na = ng.nodes.new('GeometryNodeInputNamedAttribute'); na.data_type = 'FLOAT_VECTOR'; na.inputs['Name'].default_value = 'rot'
    ng.links.new(gi.outputs[0], iop.inputs['Points']); ng.links.new(oi.outputs['Geometry'], iop.inputs['Instance'])
    ng.links.new(na.outputs['Attribute'], iop.inputs['Rotation']); ng.links.new(iop.outputs['Instances'], go.inputs[0])
    o.modifiers.new('inst', 'NODES').node_group = ng
    return o


def add_railings(geo):
    A = geo.A; glass = mat('glass', (0.85, 0.92, 0.95), 0.03, 0.0, **{'Transmission Weight': 1.0, 'IOR': 1.5})
    steel = mat('rail_steel', (0.75, 0.77, 0.8), 0.3, 0.9); black = mat('rail_black', (0.03, 0.03, 0.035), 0.45, 0.6)
    bg, bs, bb = bmesh.new(), bmesh.new(), bmesh.new()
    for t in A['tiers']:
        R = geo.tab(geo.r0, (t['a'] + t['b']) / 2) + t['d0']
        if t.get('parapet') and not (t.get('ground') and t['parapet'] < 0.3):          # 상층 앞: 콘크리트 턱 위 유리 + 금속 기둥·손잡이
            y0, y1, d = t['y0'] + t['parapet'], t['y0'] + 1.1, t['d0'] + 0.1
            ph = arc_steps(t['a'], t['b'], R, 1.5)
            for p0, p1 in zip(ph, ph[1:]):
                quad(bg, geo.P(p0, d, y0 + 0.04), geo.P(p1, d, y0 + 0.04), geo.P(p1, d, y1 - 0.06), geo.P(p0, d, y1 - 0.06))
                tube(bs, geo.P(p0, d, y1), geo.P(p1, d, y1), 0.03, 8)
            for p in ph:
                tube(bs, geo.P(p, d, y0), geo.P(p, d, y1), 0.025, 6)
        elif t['zone'] == '외야' and t['floor'] == 1:                           # 외야 1층 앞: 검은 철제 난간
            y0, d = t['y0'], t['d0'] + 0.15
            ph = arc_steps(t['a'], t['b'], R, 1.8)
            for p0, p1 in zip(ph, ph[1:]):
                for h in (0.45, 1.0):
                    tube(bb, geo.P(p0, d, y0 + h), geo.P(p1, d, y0 + h), 0.03 if h > 0.5 else 0.02, 8)
            for p in ph:
                tube(bb, geo.P(p, d, y0), geo.P(p, d, y0 + 1.0), 0.025, 6)
            for p in arc_steps(t['a'], t['b'], R, 0.12):                       # 세로 살 12cm 간격 (가상투어)
                tube(bb, geo.P(p, d, y0 + 0.1), geo.P(p, d, y0 + 0.97), 0.008, 4)
    bf = bmesh.new()                                                            # 외야 펜스 위 노란 띠 (높이 4m, 폴 부근에서 1m로)
    sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(min(1, max(0, (x - a) / (b - a))))
    fh = lambda p: 1.0 + 3.0 * (1 - sm(71, 77, abs((p + 180) % 360 - 180)))
    ph = arc_steps(-77, 77, geo.tab(geo.r0, 0), 0.8)
    for p0, p1 in zip(ph, ph[1:]):
        tube(bf, geo.P(p0, 0.15, fh(p0) + 0.06), geo.P(p1, 0.15, fh(p1) + 0.06), 0.09, 8)
    obj('fence_cap', bf, mat('fence_yellow', (0.9, 0.62, 0.03), 0.5))
    obj('rail_glass', bg, glass); obj('rail_steel', bs, steel); obj('rail_black', bb, black)


def add_aisles(geo):
    A = geo.A; conc = mat('step_conc', (0.47, 0.45, 0.42), 0.85)
    yel = mat('nosing_yellow', (0.85, 0.62, 0.05), 0.5); gry = mat('nosing_grey', (0.25, 0.25, 0.26), 0.6)
    bc, by, bgy = bmesh.new(), bmesh.new(), bmesh.new()
    W = 0.55                                                            # 통로 반폭(m)
    for t in A['tiers']:
        ph_list = [p for p in A['aisles'].get(t['id'], []) if t['a'] + 0.3 < p < t['b'] - 0.3]
        yellow = t['floor'] >= 3 or t['zone'] == '외야'
        for p in ph_list:
            Rm = geo.tab(geo.r0, p) + t['r0']; dphi = W / Rm / D2R
            for k in range(t['rows']):
                dA, dB = t['r0'] + (k + 0.5) * t['depth'], t['r0'] + (k + 1) * t['depth']
                y0 = t['y0'] + k * t['rise']; y1 = y0 + t['rise'] / 2
                c = [geo.P(p - dphi, dA, y0), geo.P(p + dphi, dA, y0), geo.P(p + dphi, dB, y0), geo.P(p - dphi, dB, y0),
                     geo.P(p - dphi, dA, y1), geo.P(p + dphi, dA, y1), geo.P(p + dphi, dB, y1), geo.P(p - dphi, dB, y1)]
                boxq(bc, c)
                for dd, yy in ((dA, y1), (t['r0'] + k * t['depth'], y0)):        # 계단 끝 미끄럼 방지 띠
                    e = 0.004
                    q = [geo.P(p - dphi, dd, yy + e), geo.P(p + dphi, dd, yy + e), geo.P(p + dphi, dd + 0.06, yy + e), geo.P(p - dphi, dd + 0.06, yy + e)]
                    quad(by if yellow else bgy, *q)
    obj('aisle_steps', bc, conc); obj('nosing_y', by, yel); obj('nosing_g', bgy, gry)


def add_net(geo):
    n = geo.A['net']; bm = bmesh.new(); uvl = bm.loops.layers.uv.new('uv')
    R = geo.tab(geo.r0, 180) + n['d']; ph = arc_steps(n['a'], n['b'], R, 1.0); u = 0
    for p0, p1 in zip(ph, ph[1:]):
        du = (p1 - p0) * D2R * (geo.tab(geo.r0, (p0 + p1) / 2) + n['d'])
        quad(bm, geo.P(p0, n['d'], n['y0']), geo.P(p1, n['d'], n['y0']), geo.P(p1, n['d'], n['y1']), geo.P(p0, n['d'], n['y1']),
             [(u, 0), (u + du, 0), (u + du, n['y1'] - n['y0']), (u, n['y1'] - n['y0'])], uvl)
        u += du
    m = bpy.data.materials.new('net'); m.use_nodes = True; nt = m.node_tree
    out = nt.nodes['Material Output']; bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.06, 0.06, 0.06, 1); bsdf.inputs['Roughness'].default_value = 0.8
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    uvn = nt.nodes.new('ShaderNodeUVMap'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(uvn.outputs['UV'], sep.inputs[0])
    def line(axis):                                              # 4.5cm 간격, 3mm 굵기 그물 선
        m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'; m1.inputs[1].default_value = 1 / 0.045
        nt.links.new(sep.outputs[axis], m1.inputs[0])
        fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(m1.outputs[0], fr.inputs[0])
        lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; lt.inputs[1].default_value = 0.035
        nt.links.new(fr.outputs[0], lt.inputs[0]); return lt
    mxv = nt.nodes.new('ShaderNodeMath'); mxv.operation = 'MAXIMUM'
    nt.links.new(line(0).outputs[0], mxv.inputs[0]); nt.links.new(line(1).outputs[0], mxv.inputs[1])
    fade = nt.nodes.new('ShaderNodeMath'); fade.operation = 'MULTIPLY'; fade.inputs[1].default_value = 0.55   # 가는 선이 화소보다 작아 실제론 흐릿하게 보임
    nt.links.new(mxv.outputs[0], fade.inputs[0]); nt.links.new(fade.outputs[0], mx.inputs['Fac']); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(bsdf.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    o = obj('net', bm, m)
    for p in o.data.polygons:
        p.use_smooth = False
    steel = mat('net_post', (0.7, 0.7, 0.72), 0.4, 0.8); bp = bmesh.new()
    for p in range(n['a'], n['b'] + 1, 17):
        if abs(p - 180) < 5:
            continue                                             # 포수 뒤 정중앙엔 기둥 없음 (가상투어)
        tube(bp, geo.P(p, n['d'], 0.9), geo.P(p, n['d'], n['y1']), 0.045, 8)
    obj('net_posts', bp, steel)
    for i, nm in enumerate(geo.names):                           # 웹용 그물 기둥(포수 뒤 정중앙 포함)은 렌더에서 숨김
        if nm in ('net_post', 'net_web', 'net_top') and ('v%d' % i) in bpy.data.objects:
            bpy.data.objects['v%d' % i].hide_render = True


def add_lattice(geo, J):
    """둘레 벽: 흰 철골 격자 (기둥 4.5° 간격, 가로재 3단, X 가새)."""
    white = mat('lattice_white', (0.82, 0.83, 0.84), 0.45, 0.5); bm = bmesh.new()
    H = geo.A['ywall']; levels = [0, 11, 18, 25.5, H]; ins = 0.6
    phs = [k * 4.5 for k in range(80)]
    for i, p in enumerate(phs):
        q = phs[(i + 1) % len(phs)]
        tube(bm, geo.Pout(p, ins, 0), geo.Pout(p, ins, H), 0.3, 8)
        for j, y in enumerate(levels[1:]):
            tube(bm, geo.Pout(p, ins, y), geo.Pout(q, ins, y), 0.14, 6)
            y0 = levels[j]
            tube(bm, geo.Pout(p, ins, y0), geo.Pout(q, ins, y), 0.08, 6)
            tube(bm, geo.Pout(q, ins, y0), geo.Pout(p, ins, y), 0.08, 6)
    obj('lattice', bm, white)
    # 원래 벽(격자 무늬 그림)은 어두운 배경으로
    for i, n in enumerate(J.get('names', [])):
        if n == 'perimeter_wall' and ('v%d' % i) in bpy.data.objects:
            o = bpy.data.objects['v%d' % i]; o.data.materials.clear(); o.data.materials.append(mat('wall_bg', (0.36, 0.37, 0.38), 0.9))


def add_fixtures(J):
    """지붕 조명: 둥근 투광기 2×4 묶음 + 하우징 (면광원 위치·방향 그대로)."""
    house = mat('fx_house', (0.2, 0.21, 0.22), 0.5, 0.7)
    lens = bpy.data.materials.new('fx_lens'); lens.use_nodes = True
    em = lens.node_tree.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 35; em.inputs['Color'].default_value = (1, 0.97, 0.92, 1)
    lens.node_tree.links.new(em.outputs[0], lens.node_tree.nodes['Material Output'].inputs['Surface'])
    bh, bl = bmesh.new(), bmesh.new()
    for x, y, z, dx, dy, dz in J['lamps']:
        c = tb(x, y, z); d = Vector((dx, -dz, dy)).normalized()
        side = d.cross(Vector((0, 0, 1))).normalized(); up = side.cross(d).normalized()
        tube(bh, c - d * 0.6 - side * 1.9, c - d * 0.6 + side * 1.9, 0.12, 6)         # 거치 바
        for i in range(4):
            for j in range(2):
                p = c + side * (-1.35 + i * 0.9) + up * (-0.22 + j * 0.44)
                tube(bh, p - d * 0.35, p + d * 0.1, 0.27, 12)
                ring = [bl.verts.new(p + d * 0.11 + (side * math.cos(a) + up * math.sin(a)) * 0.24) for a in np.linspace(0, 2 * math.pi, 12, endpoint=False)]
                bl.faces.new(ring)
    obj('fixtures', bh, house); obj('fixture_lens', bl, lens)


def add_space_frame(geo):
    """지붕 바깥 띠: 촘촘한 흰 입체 트러스 (가상투어). 상·하현재 + 방사·링 + 양방향 사재."""
    A = geo.A; H, YW, TM = A['roofHeight'], A['ywall'], 0.64
    def S(phi, t):
        R = t * (geo.tab(geo.r0, phi) + geo.tab(geo.dout, phi))
        return tb(R * math.sin(phi * D2R), YW + (H - YW) * (1 - t * t) - 0.35, geo.CZ - R * math.cos(phi * D2R))
    NR, NT, DEP = 144, 10, Vector((0, 0, -2.4))
    top = {(i, k): S(360 * i / NR, TM + (1 - TM) * k / NT) for i in range(NR) for k in range(NT + 1)}
    bm = bmesh.new()
    for i in range(NR):
        j = (i + 1) % NR
        for k in range(NT + 1):
            a, b = top[i, k], top[j, k]
            tube(bm, a, b, 0.09, 5); tube(bm, a + DEP, b + DEP, 0.09, 5); tube(bm, a, a + DEP, 0.06, 4)
            if k < NT:
                c = top[i, k + 1]
                tube(bm, a, c, 0.11, 5); tube(bm, a + DEP, c + DEP, 0.09, 5)
                tube(bm, a, top[j, k + 1] + DEP, 0.05, 4); tube(bm, b, c + DEP, 0.05, 4)
    o = obj('space_frame', bm, mat('frame_white', (0.86, 0.87, 0.88), 0.4, 0.4))
    for p in o.data.polygons:
        p.use_smooth = False


def tune_roof(J):
    """막: 분홍빛 (가상투어), 트러스 뒤 지붕 밑면: 밝은 회색, 웹용 성긴 트러스는 숨김."""
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or not o.name.startswith('e'):
            continue
        zs = [v.co.z for v in o.data.vertices]
        if not zs or min(zs) < 25:
            continue
        for slot in o.material_slots:
            nt = slot.material.node_tree if slot.material and slot.material.use_nodes else None
            em = next((n for n in nt.nodes if n.type == 'EMISSION'), None) if nt else None
            if em:                                                   # 막
                mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
                mul.inputs[7].default_value = (1.0, 0.7, 0.76, 1)
                src = em.inputs['Color'].links[0].from_socket if em.inputs['Color'].links else None
                if src:
                    nt.links.new(src, mul.inputs[6])
                else:
                    mul.inputs[6].default_value = em.inputs['Color'].default_value
                nt.links.new(mul.outputs[2], em.inputs['Color']); em.inputs['Strength'].default_value = 1.7
            else:                                                    # 트러스 뒤 지붕 밑면
                slot.material = mat('deck_light', (0.42, 0.43, 0.44), 0.9)
    for i, n in enumerate(J.get('names', [])):
        if n in ('roof_truss', 'roof_cable') and ('v%d' % i) in bpy.data.objects:   # 웹용 성긴 트러스·굵은 링 케이블 숨김
            bpy.data.objects['v%d' % i].hide_render = True
    for o in bpy.data.objects:                                       # 층 사이 띠·통로 벽: 사진처럼 밝은 회색
        for slot in getattr(o, 'material_slots', []):
            if slot.material and 'Dark' in slot.material.name:
                slot.material = mat('stands_dark_r', (0.2, 0.205, 0.215), 0.8)


def tune_field():
    """그라운드: 가상투어 사진처럼 채도를 낮추고 잔디는 살짝 노란 기 (사진 대비 Gemini 검수)."""
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.data.vertices:
            continue
        zs = [v.co.z for v in o.data.vertices[:2000]]
        xs = [v.co.x for v in o.data.vertices[:2000]]
        if max(zs) > 0.6 or max(xs) - min(xs) < 100:
            continue
        for slot in o.material_slots:
            nt = slot.material.node_tree if slot.material and slot.material.use_nodes else None
            bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None) if nt else None
            if not bsdf or not bsdf.inputs['Base Color'].links:
                continue
            src = bsdf.inputs['Base Color'].links[0].from_socket
            hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Hue'].default_value = 0.492
            hs.inputs['Saturation'].default_value = 0.88; hs.inputs['Value'].default_value = 1.0
            nt.links.new(src, hs.inputs['Color']); nt.links.new(hs.outputs['Color'], bsdf.inputs['Base Color'])
            print('field tuned', o.name, slot.material.name)


def detail(sc, J):
    geo = Geo(J['anchors']); geo.names = J.get('names', [])
    add_seats(J, geo); add_railings(geo); add_aisles(geo); add_net(geo); add_lattice(geo, J); add_fixtures(J)
    add_space_frame(geo); tune_roof(J); tune_field()
    # 지붕 트러스·막 아치: 흰 도장 (가상투어)
    tw = mat('truss_white', (0.8, 0.81, 0.82), 0.4, 0.6)
    for i, n in enumerate(J.get('names', [])):
        if n in ('roof_truss', 'roof_cable') and ('v%d' % i) in bpy.data.objects:
            o = bpy.data.objects['v%d' % i]; o.data.materials.clear(); o.data.materials.append(tw)
    return geo


def setup(samples):
    sc, J, objs, st, _ = BL.build(SRC, ASSETS, seats=False, concrete='#a39d94')   # 지붕 트러스는 bake_scene 안에 이미 있음
    detail(sc, J)
    sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.02
    sc.cycles.transparent_max_bounces = 16
    sc.view_settings.exposure = 0.35                                  # 가상투어 사진처럼 밝게
    if GPU:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    break
            except TypeError:
                continue
        for d in prefs.devices:
            d.use = d.type != 'CPU'
        sc.cycles.device = 'GPU'
        print('GPU', prefs.compute_device_type, [d.name for d in prefs.devices if d.use])
    return sc, J


def camera(sc):
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.clip_start = 0.05; cam.data.clip_end = 1000
    return cam


def run_views():
    W, H, samples = int(NUMS[0]), int(NUMS[1]), int(NUMS[2])
    sc, J = setup(samples); cam = camera(sc)
    sc.render.resolution_x, sc.render.resolution_y = W, H
    cam.data.sensor_fit = 'HORIZONTAL'
    os.makedirs(OUT, exist_ok=True)
    for v in json.load(open(LIST)):
        yaw, pitch = v['yaw'], v['pitch']
        f3 = (-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch))
        cam.location = tb(*v['pos']); cam.rotation_euler = tb(*f3).to_track_quat('-Z', 'Y').to_euler()
        cam.data.angle = v['hfov'] * D2R
        sc.render.filepath = os.path.join(OUT, v['name'] + '.png')
        t0 = time.time(); bpy.ops.render.render(write_still=True); print('view', v['name'], 'sec', round(time.time() - t0, 1), flush=True)


def run_panos():
    W, samples = int(NUMS[0]), int(NUMS[1])
    sc, J = setup(samples); cam = camera(sc)
    cam.data.type = 'PANO'
    try:
        cam.data.panorama_type = 'EQUIRECTANGULAR'
    except AttributeError:
        cam.data.cycles.panorama_type = 'EQUIRECTANGULAR'
    sc.render.resolution_x, sc.render.resolution_y = W, W // 2
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
    os.makedirs(OUT, exist_ok=True)
    mound = tb(0, 1.0, -18.44)
    for v in json.load(open(LIST)):
        p = tb(*v['pos']); cam.location = p
        d = mound - p
        cam.rotation_euler = (math.pi / 2, 0, math.atan2(-d.x, d.y))       # 이미지 가운데 = 마운드 방향(수평)
        sc.render.filepath = os.path.join(OUT, v['name'] + '.jpg')
        if os.path.exists(sc.render.filepath):
            continue
        t0 = time.time(); bpy.ops.render.render(write_still=True); print('pano', v['name'], 'sec', round(time.time() - t0, 1), flush=True)


run_views() if MODE == 'views' else run_panos()
