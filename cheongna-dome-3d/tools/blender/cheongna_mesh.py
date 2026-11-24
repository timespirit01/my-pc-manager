# -*- coding: utf-8 -*-
"""청라돔 메시 생성 — 순수 파이썬. build() → {객체 이름: Obj}.

모든 객체에 이름이 있고(고척돔 교훈 3), 객체마다 그룹이 있다.
  common   항상 보임            baseball  야구 모드 전용       concert  콘서트 모드 전용
  detail   렌더 전용 세부(난간·그물 등, 웹에서는 뺌)
"""
import math
import cheongna_geom as G
from cheongna_geom import u, pol, add, sub, lerp, hyp, PATH_A, PATH_B, PATH_F, PATH_G, TIER, row_d, tier_back

# ───────── 재질: (색, 거칠기, 금속, 발광 세기, 발광 색, 불투명도) ─────────
MATS = {
    'field': ((1, 1, 1), .95, 0, 0, None, 1),                 # 그라운드 텍스처 (assets/field.jpg)
    'dirt': ((0.45, 0.29, 0.18), .95, 0, 0, None, 1),
    'base_white': ((0.92, 0.92, 0.90), .6, 0, 0, None, 1),
    'pad_navy': ((0.035, 0.07, 0.16), .7, 0, 0, None, 1),      # 내야 벽·펜스 패드
    'pad_top': ((0.85, 0.72, 0.10), .6, 0, 0, None, 1),        # 펜스 위 노란 띠
    'pad_fence': ((0.045, 0.075, 0.085), .7, 0, 0, None, 1),   # 외야 펜스 패드: 짙은 청록 회색 [조감도 화소 확인]
    'led_logo': ((0.8, 0.8, 0.8), .4, 0, 1.4, (0.95, 0.95, 1.0), 1),           # 띠 전광판의 흰 로고
    'pole': ((0.92, 0.80, 0.10), .5, 0, 0, None, 1),
    'concrete': ((0.24, 0.245, 0.25), .85, 0, 0, None, 1),     # 관람석 단
    'aisle': ((0.36, 0.36, 0.365), .8, 0, 0, None, 1),         # 계단 통로
    'nosing': ((0.85, 0.72, 0.10), .6, 0, 0, None, 1),         # 계단 끝 노란 디딤판
    'wall_dark': ((0.075, 0.08, 0.09), .7, 0, 0, None, 1),
    'wall_gray': ((0.26, 0.265, 0.275), .75, 0, 0, None, 1),
    'soffit': ((0.11, 0.115, 0.125), .8, 0, 0, None, 1),       # 상층 밑면
    'stone': ((0.56, 0.55, 0.52), .7, 0, 0, None, 1),
    'slab_white': ((0.78, 0.77, 0.74), .7, 0, 0, None, 1),
    'led_red': ((0.20, 0.01, 0.01), .4, 0, 1.6, (1.0, 0.03, 0.02), 1),         # 2층 앞 붉은 LED 띠
    'led_ribbon': ((0.012, 0.012, 0.015), .35, 0, 0.07, (0.55, 0.58, 0.65), 1),   # 3층 앞 검은 띠 전광판
    'led_board': ((0.03, 0.01, 0.01), .3, 0, 1.3, (0.85, 0.20, 0.18), 1),      # 메인 전광판
    'led_ad': ((0.03, 0.02, 0.02), .3, 0, 1.1, (0.90, 0.40, 0.25), 1),         # 보조 전광판
    'board_frame': ((0.03, 0.03, 0.035), .5, 0, 0, None, 1),
    'glass_suite': ((0.05, 0.07, 0.07), .08, 0, 0.30, (1.0, 0.86, 0.62), 1),    # 스위트·스카이박스 유리 (실내등)
    'glass_shop': ((0.10, 0.11, 0.13), .12, 0, 0.8, (1.0, 0.90, 0.72), 1),
    'glass_top': ((0.13, 0.15, 0.18), .08, 0, 0.4, (0.80, 0.88, 1.0), 1),      # 지붕 아래 채광 유리
    'glass_rail': ((0.55, 0.65, 0.68), .05, 0, 0, None, 0.16),
    'steel': ((0.60, 0.62, 0.66), .45, .7, 0, None, 1),        # 난간
    'truss': ((0.62, 0.64, 0.67), .5, .5, 0, None, 1),         # 지붕 철골
    'roof_skin': ((0.045, 0.05, 0.06), .8, 0, 0, None, 1),
    'roof_led': ((0.05, 0.03, 0.07), .5, 0, 0.42, (0.50, 0.33, 0.85), 1),       # 지붕 중앙 미디어 천장
    'lamp': ((0.9, 0.9, 0.9), .3, 0, 200.0, (1.0, 0.97, 0.90), 1),              # 경기 조명
    'lamp_body': ((0.05, 0.05, 0.055), .5, .3, 0, None, 1),
    'net': ((0.02, 0.02, 0.02), .6, 0, 0, None, 0.13),
    'hotel_white': ((0.82, 0.80, 0.76), .65, 0, 0, None, 1),
    'hotel_room': ((0.50, 0.45, 0.38), .8, 0, 0.9, (1.0, 0.85, 0.65), 1),
    'wood': ((0.45, 0.27, 0.15), .6, 0, 0, None, 1),
    'water': ((0.02, 0.12, 0.15), .04, 0, 0, None, 1),
    'pool_tile': ((0.58, 0.70, 0.74), .3, 0, 0, None, 1),
    'dugout_roof': ((0.04, 0.09, 0.22), .5, 0, 0, None, 1),
    'bench': ((0.25, 0.26, 0.28), .6, 0, 0, None, 1),
    # 콘서트
    'cover': ((0.20, 0.21, 0.22), .85, 0, 0, None, 1),
    'stage': ((0.03, 0.03, 0.035), .4, 0, 0, None, 1),
    'stage_top': ((0.18, 0.18, 0.20), .25, 0, 0, None, 1),
    'stage_truss': ((0.30, 0.30, 0.32), .4, .7, 0, None, 1),
    'led_stage': ((0.05, 0.02, 0.05), .4, 0, 2.2, (0.95, 0.45, 0.70), 1),
}


class Obj:
    def __init__(s, name, group): s.name, s.group, s.V, s.F, s.FM, s.UV = name, group, [], [], [], []
    def face(s, pts, m, uv=None):
        i = len(s.V); s.V.extend(pts); s.F.append(list(range(i, i + len(pts)))); s.FM.append(m); s.UV.append(uv)
    def quad(s, a, b, c, d, m, uv=None): s.face([a, b, c, d], m, uv)
    def box(s, c, size, m, rotz=0.0):
        cx, cy, cz = c; sx, sy, sz = size; co, si = math.cos(rotz), math.sin(rotz); P = []
        for dx in (-.5, .5):
            for dy in (-.5, .5):
                for dz in (-.5, .5):
                    x, y = dx * sx, dy * sy; P.append((cx + co * x - si * y, cy + si * x + co * y, cz + dz * sz))
        for a, b, cc, d in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            s.quad(P[a], P[b], P[cc], P[d], m)
    def prism(s, q, z0, z1, m, top=True, bottom=False, mtop=None):
        """평면 다각형 q (반시계) 를 z0~z1 로 세운 기둥"""
        n = len(q)
        for i in range(n):
            a, b = q[i], q[(i + 1) % n]; s.quad((a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1), m)
        if top: s.face([(p[0], p[1], z1) for p in q], mtop or m)
        if bottom: s.face([(p[0], p[1], z0) for p in q[::-1]], m)
    def beam(s, p, q, w, m, h=None):
        """p→q 사각 단면 부재"""
        h = h or w; dx, dy, dz = q[0] - p[0], q[1] - p[1], q[2] - p[2]; L = math.sqrt(dx * dx + dy * dy + dz * dz)
        if L < 1e-6: return
        d = (dx / L, dy / L, dz / L)
        a = (d[1], -d[0], 0.0) if abs(d[2]) < 0.95 else (1.0, 0.0, 0.0); la = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2); a = tuple(v / la for v in a)
        b = (a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0])
        cs = [tuple(p[i] + (sa * a[i] * w + sb * b[i] * h) / 2 for i in range(3)) for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        ce = [tuple(c[i] + d[i] * L for i in range(3)) for c in cs]
        for i in range(4): s.quad(cs[i], cs[(i + 1) % 4], ce[(i + 1) % 4], ce[i], m)


GEO = {}
def O(name, group='common'):
    if name not in GEO: GEO[name] = Obj(name, group)
    return GEO[name]

def p3(p, z): return (p[0], p[1], z)

def ribbon(ob, P, s0, s1, d0, z0, d1, z1, m, flip=False):
    """경로를 따라 (d0,z0)-(d1,z1) 단면 선분을 쓸어 만든 띠"""
    st = P.stations(s0, s1)
    for a, b in zip(st, st[1:]):
        q = [p3(P.at(a, d0), z0), p3(P.at(b, d0), z0), p3(P.at(b, d1), z1), p3(P.at(a, d1), z1)]
        ob.quad(*(q[::-1] if flip else q), m)

def poly_ribbon(ob, pts, z0, z1, m):
    for a, b in zip(pts, pts[1:]): ob.quad(p3(a, z0), p3(b, z0), p3(b, z1), p3(a, z1), m)


# ───────── 8각 외곽 · 지붕 ─────────
XW = 102.0; DW = 61.5; YS = 61.5; YN = 166.0; DNE = 148.0      # [가정] 외벽: 3층 뒤 + 콘코스 8 m
RIM_Z = 50.5          # [역산] 지붕 가장자리 철골 아래 (전광판 윗변 50 m 가 닿는 높이)
CEIL_Z = 60.0         # 지붕 중앙 안쪽 높이 (지붕 구조물 높이 약 60 m [보도])
RC = (0.0, (YN - YS) / 2)
_HP = [((1, 0), XW), ((-1, 0), XW), ((0, -1), YS), ((0, 1), YN),
       ((1 / G.S2, -1 / G.S2), DW), ((-1 / G.S2, -1 / G.S2), DW), ((1 / G.S2, 1 / G.S2), DNE), ((-1 / G.S2, 1 / G.S2), DNE)]

def oct_rho(p):
    """8각 외곽 기준 정규화 반지름 (중심 0, 외벽 1)"""
    r = 0.0
    for n, c in _HP:
        c0 = c - (RC[0] * n[0] + RC[1] * n[1]); r = max(r, ((p[0] - RC[0]) * n[0] + (p[1] - RC[1]) * n[1]) / c0)
    return r

def oct_ring(rho, n=96):
    out = []
    for k in range(n):
        d = u(360.0 * k / n); t = min((c - (RC[0] * nn[0] + RC[1] * nn[1])) / (d[0] * nn[0] + d[1] * nn[1])
                                      for nn, c in _HP if d[0] * nn[0] + d[1] * nn[1] > 1e-9)
        out.append(add(RC, d, t * rho))
    return out

def roof_z(rho): return RIM_Z + (CEIL_Z - RIM_Z) * (1 - rho * rho)

fence_pt = G.fence_pt


# ───────── 관람석 ─────────
def tier_mesh(t):
    """단(tread)·챌판(riser)·계단 통로·앞 난간벽·뒷벽"""
    P = G.PATHS[t['path']]; ob = O('stands_' + t['id']); n = t['rows']
    st = P.stations(t['s0'], t['s1'])
    L = t['s1'] - t['s0']; nsec = max(1, int(round(L / t['sec']))); w = L / nsec
    bounds = [t['s0'] + k * w for k in range(nsec + 1)]
    rows = [(row_d(t, r)) for r in range(n + 1)]
    nr = [G.rows_at(t, s) for s in st]
    for a, b, na, nb in zip(st, st[1:], nr, nr[1:]):
        m = min(na, nb)
        for r in range(m):
            d, z = rows[r]; d2 = d + t['depth']; z2 = rows[r + 1][1]
            ob.quad(p3(P.at(a, d), z), p3(P.at(b, d), z), p3(P.at(b, d2), z), p3(P.at(a, d2), z), 'concrete')
            zr = z2 - (t.get('crossup', 0.0) if t.get('cross', {}).get(r + 1) else 0.0)
            ob.quad(p3(P.at(a, d2), z), p3(P.at(b, d2), z), p3(P.at(b, d2), zr), p3(P.at(a, d2), zr), 'concrete')
            cw = t.get('cross', {}).get(r + 1)
            if cw:                                          # 가로 통로 바닥 + 뒤 턱
                zc_ = z2 - t.get('crossup', 0.0)
                ob.quad(p3(P.at(a, d2), zc_), p3(P.at(b, d2), zc_), p3(P.at(b, d2 + cw), zc_), p3(P.at(a, d2 + cw), zc_), 'aisle')
                ob.quad(p3(P.at(a, d2 + cw), zc_), p3(P.at(b, d2 + cw), zc_), p3(P.at(b, d2 + cw), z2), p3(P.at(a, d2 + cw), z2), 'concrete')
        if m and t.get('parapet'):                      # 앞 난간벽
            d, z = rows[0]; ob.quad(p3(P.at(a, d - 0.12), z), p3(P.at(b, d - 0.12), z), p3(P.at(b, d - 0.12), z + t['parapet']), p3(P.at(a, d - 0.12), z + t['parapet']), 'concrete')
    # 계단 통로: 구역 경계마다 폭 1.2 m, 단마다 반단 + 노란 디딤판
    for sb in bounds:
        m = G.rows_at(t, sb)
        for r in range(m):
            d, z = rows[r]; z2 = rows[r + 1][1]; h = (z2 - z) / 2; s0, s1 = sb - 0.6, sb + 0.6
            if s0 < t['s0'] - 0.7 or s1 > t['s1'] + 0.7: continue
            q = lambda dd, zz: [p3(P.at(s0, dd), zz), p3(P.at(s1, dd), zz)]
            dm = d + t['depth'] / 2; d2 = d + t['depth']
            ob.quad(*q(d, z + 0.012), *q(dm, z + 0.012)[::-1], 'aisle')
            ob.quad(*q(dm, z), *q(dm, z + h)[::-1], 'aisle'); ob.quad(*q(dm, z + h), *q(d2, z + h)[::-1], 'aisle')
            ob.quad(*q(dm - 0.07, z + 0.02), *q(dm, z + 0.02)[::-1], 'nosing')
            ob.quad(*q(d2 - 0.07, z + h + 0.008), *q(d2, z + h + 0.008)[::-1], 'nosing')
    return bounds


def rail(name, P, s0, s1, d, z, h=1.05, glass=True, post=1.5, group='detail'):
    """유리 + 철제 난간 (렌더 전용)"""
    ob = O(name, group); st = P.stations(s0, s1)
    for a, b in zip(st, st[1:]):
        A, B = P.at(a, d), P.at(b, d)
        if glass: ob.quad(p3(A, z + 0.08), p3(B, z + 0.08), p3(B, z + h - 0.06), p3(A, z + h - 0.06), 'glass_rail')
        ob.beam(p3(A, z + h), p3(B, z + h), 0.05, 'steel')
    s = s0
    while s <= s1 + 1e-6:
        A = P.at(s, d); ob.beam(p3(A, z), p3(A, z + h), 0.045, 'steel'); s += post


def mullions(ob, P, s0, s1, d, z0, z1, step=3.0, m='wall_dark', w=0.14, bands=()):
    """유리 띠 앞 세로 창살과 가로 띠"""
    s = s0
    while s <= s1 + 1e-6:
        A = P.at(s, d); ob.beam(p3(A, z0), p3(A, z1), w, m); s += step
    for zz in bands:
        st = P.stations(s0, s1)
        for a, b in zip(st, st[1:]): ob.beam(p3(P.at(a, d), zz), p3(P.at(b, d), zz), w, m)


def build_stands():
    A, B, F = PATH_A, PATH_B, PATH_F
    for t in G.TIERS: tier_mesh(t)
    w = O('stands_walls')
    # ── 1층: 뒤 콘코스 바닥, 콘코스 뒷벽, 필드석 뒤 가로 통로 표시 ──
    t = TIER['L1']; d1, z1 = tier_back(t)
    ribbon(w, A, 0, A.len, d1, z1, d1 + 1.6, z1, 'aisle')
    # 2층 난간선까지의 콘코스 바닥 (경로 B 기준으로 채움) + 콘코스 뒷벽
    ribbon(w, B, 0, B.len, G.C2_D - 1.4, G.CONC_Z - 0.02, G.C2_D + 9.0, G.CONC_Z - 0.02, 'wall_gray')
    ribbon(w, B, 0, B.len, G.C2_D + 9.0, G.CONC_Z, G.C2_D + 9.0, G.C2_Z - 0.5, 'wall_dark', flip=True)
    # ── 2층(클럽·스위트): 붉은 LED 띠, 바닥 슬래브와 밑면, 스위트 유리 2개 층 ──
    c = TIER['C2']; s0, s1 = 0.0, B.len
    led = O('led_club')
    ribbon(led, B, s0, s1, G.C2_D, G.C2_Z - 1.0, G.C2_D, G.C2_Z, 'led_red', flip=True)
    ribbon(w, B, s0, s1, G.C2_D, G.C2_Z - 1.0, G.C2_D + 12.0, G.C2_Z - 0.5, 'soffit')                 # 2층 밑면
    ribbon(w, B, s0, s1, G.C2_D, G.C2_Z, G.C2_D + 0.7, G.C2_Z, 'aisle')
    dc, zc = tier_back(c)
    ribbon(w, B, s0, s1, dc, zc, dc + 1.6, zc, 'aisle')
    gl = O('glass_suites')
    ribbon(gl, B, s0, s1, dc + 1.6, zc, dc + 1.6, zc + 3.1, 'glass_suite', flip=True)                  # 2층 스위트
    ribbon(w, B, s0, s1, dc + 1.6, zc + 3.1, dc + 1.6, zc + 3.7, 'wall_dark', flip=True)
    # ── 3층: 검은 띠 전광판, 밑면(경사), 뒷벽과 스카이박스 유리, 띠 ──
    t = TIER['U3']; d3, z3 = tier_back(t)
    rb = O('led_ribbon')
    ribbon(rb, B, G.HOTEL_S, B.len, 0.0, G.U3_Z - 1.25, 0.0, G.U3_Z + 0.05, 'led_ribbon', flip=True)
    lg = O('led_logos'); s = G.HOTEL_S + 2.0                       # 검은 띠 위 흰 로고 (조감도) — 내용은 가상
    while s < B.len - 2.0:
        lg.quad(p3(B.at(s, -0.04), G.U3_Z - 0.95), p3(B.at(s + 1.7, -0.04), G.U3_Z - 0.95), p3(B.at(s + 1.7, -0.04), G.U3_Z - 0.3), p3(B.at(s, -0.04), G.U3_Z - 0.3), 'led_logo'); s += 4.6
    ribbon(w, B, G.HOTEL_S, B.len, 0.0, G.U3_Z - 1.1, 2.4, G.U3_Z - 1.1, 'soffit')
    ribbon(w, B, G.HOTEL_S, B.len, 2.4, G.U3_Z - 1.1, dc + 1.6, zc + 3.7, 'soffit')
    ribbon(w, B, G.HOTEL_S, B.len, 0.0, G.U3_Z + 0.05, 0.9, G.U3_Z, 'concrete')
    ribbon(w, B, G.HOTEL_S, B.len, d3, z3, d3 + 1.8, z3, 'aisle')                                             # 3층 뒤 통로
    ribbon(rb, B, G.HOTEL_S, B.len, d3 + 1.8, z3 + 0.1, d3 + 1.8, z3 + 1.3, 'led_ribbon', flip=True)          # 최상단 띠 (로고 띠)
    ribbon(gl, B, G.HOTEL_S, B.len, d3 + 1.9, z3 + 1.3, d3 + 1.9, z3 + 5.2, 'glass_suite', flip=True)         # 스카이박스 유리
    sh = O('shell_backwall')                                   # 전체 보기에서 숨기는 높은 뒷벽
    ribbon(sh, B, G.HOTEL_S, B.len, d3 + 1.9, z3 + 5.2, d3 + 1.9, RIM_Z - 3.0, 'wall_dark', flip=True)
    mu = O('mullions')
    mullions(mu, B, s0 + 0.5, s1 - 0.5, dc + 1.5, zc, zc + 3.1, 3.2)
    mullions(mu, B, G.HOTEL_S + 0.5, B.len - 0.5, d3 + 1.8, z3 + 1.3, z3 + 5.2, 2.4, bands=(z3 + 3.3,))
    # 동쪽(1루 외야 쪽) 3층 뒷벽 위 'WIN' 보조 전광판  [역산: 높이 41~46.6 m]
    ad = O('board_sub'); sa, sb = B.nearest_s((94.0, 46.0)), B.nearest_s((94.0, 59.5))
    ribbon(ad, B, sa, sb, d3 + 1.7, 41.0, d3 + 1.7, 46.6, 'led_ad', flip=True)
    # 3루 쪽 3층이 끝나는 자리 ~ 호텔: 2층 위 큰 벽
    ribbon(sh, B, 0, G.HOTEL_S, dc + 1.7, zc + 3.7, dc + 1.7, RIM_Z - 3.0, 'wall_dark', flip=True)
    ribbon(w, B, 0, G.HOTEL_S, 0.0, G.U3_Z - 1.1, dc + 1.7, zc + 3.7, 'soffit')
    for s_end, sgn in ((G.HOTEL_S, 1),):                                                               # 3층 끝 옆벽
        w.quad(p3(B.at(s_end, 0), G.U3_Z - 1.1), p3(B.at(s_end, d3 + 1.8), z3 - 6), p3(B.at(s_end, d3 + 1.8), z3 + 1.2), p3(B.at(s_end, 0), G.U3_Z + 1.1), 'wall_gray')
    # ── 외야 좌측 2개 층 ──
    o1, o2 = TIER['OF1'], TIER['OF2']; db, zb = tier_back(o1)
    ribbon(w, F, o1['s0'], o1['s1'], db, zb, o2['d0'] - 0.12, zb, 'aisle')
    ribbon(w, F, o1['s0'], o1['s1'], o2['d0'] - 0.12, zb, o2['d0'] - 0.12, o2['z0'], 'wall_dark', flip=True)
    ribbon(rb, F, o1['s0'], o1['s1'], o2['d0'] - 0.14, o2['z0'] - 0.9, o2['d0'] - 0.14, o2['z0'] + 0.1, 'led_ribbon', flip=True)
    d2b, z2b = tier_back(o2)
    ribbon(w, F, 0, F.len, d2b, z2b, d2b + 3.0, z2b, 'aisle')
    ribbon(w, F, 0, F.len, d2b + 3.0, z2b, d2b + 3.0, BOARD_Z0, 'wall_dark', flip=True)
    # 외야석 옆 끝벽
    for t in (o1, o2):
        for s_end in (t['s0'], t['s1']):
            d, z = t['d0'], t['z0']; dB, zB = tier_back(t)
            w.quad(p3(F.at(s_end, d), 0), p3(F.at(s_end, dB), 0), p3(F.at(s_end, dB), zB), p3(F.at(s_end, d), z), 'wall_gray')
            w.quad(p3(F.at(s_end, dB), 0), p3(F.at(s_end, d), 0), p3(F.at(s_end, d), z), p3(F.at(s_end, dB), zB), 'wall_gray')
    # 중견 쪽: 외야석이 없는 구간의 배터스아이 (검은 벽)
    be = O('batters_eye')
    ribbon(be, F, G.SF_CF - 9.0, o1['s0'], 0.6, 0, 0.6, 12.0, 'wall_dark', flip=True)
    ribbon(be, F, G.SF_CF - 9.0, o1['s0'], 0.6, 12.0, d2b + 3.0, 12.0, 'wall_dark')
    # ── 난간 (렌더 전용) ──
    rail('rail_L1', A, 0, A.len, 0.05, 1.15, h=0.5, glass=False, post=2.5)
    rail('rail_C2', B, c['s0'], c['s1'], G.C2_D + 0.08, G.C2_Z, h=1.1)
    rail('rail_U3', B, TIER['U3']['s0'], TIER['U3']['s1'], 0.12, G.U3_Z + 0.05, h=1.05)
    rail('rail_OF2', F, o2['s0'], o2['s1'], o2['d0'] - 0.05, o2['z0'], h=1.1)
    u3 = TIER['U3']; dcx, zcx = row_d(u3, 8)
    rail('rail_U3_cross', B, u3['s0'], u3['s1'], dcx - 0.08, zcx, h=0.75, post=2.0)


# ───────── 그라운드 ─────────
FIELD_BOX = (-92.0, -26.0, 92.0, 132.0)       # 그라운드 텍스처가 덮는 범위 (x0, y0, x1, y1)

def field_poly():
    return [PATH_A.at(s) for s in PATH_A.s] + G.FENCE

def build_field():
    f = O('field'); x0, y0, x1, y1 = FIELD_BOX
    poly = field_poly(); c = (0.0, 52.0)
    uv = lambda p: ((p[0] - x0) / (x1 - x0), (p[1] - y0) / (y1 - y0))
    for a, b in zip(poly, poly[1:] + poly[:1]):
        f.face([p3(c, 0), p3(a, 0), p3(b, 0)], 'field', [uv(c), uv(a), uv(b)])
    # 마운드 (지름 5.5 m, 높이 0.25 m)
    m = O('field_mound', 'baseball'); my = G.SPEC['mound'] - 0.46; n = 28
    ring = lambda r, z: [(r * math.cos(2 * math.pi * k / n), my + r * math.sin(2 * math.pi * k / n), z) for k in range(n)]
    r0, r1, r2 = ring(2.74, 0.005), ring(1.6, 0.17), ring(0.6, 0.25)
    for k in range(n):
        j = (k + 1) % n; m.quad(r0[k], r0[j], r1[j], r1[k], 'dirt'); m.quad(r1[k], r1[j], r2[j], r2[k], 'dirt')
    m.face(r2, 'dirt'); m.box((0, G.SPEC['mound'], 0.27), (0.61, 0.15, 0.04), 'base_white')
    b = G.SPEC['base'] / G.S2
    for x, y in ((b, b), (0, 2 * b), (-b, b)): m.box((x, y, 0.04), (0.38, 0.38, 0.08), 'base_white', math.radians(45))
    m.face([(-.216, .216, .012), (-.216, 0, .012), (.216, 0, .012), (.216, .216, .012), (0, .432, .012)][::-1], 'base_white')
    # 내야 쪽 벽 (패드) 과 외야 펜스
    w = O('wall_infield'); ribbon(w, PATH_A, 0, PATH_A.len, 0, 0, 0, 1.15, 'pad_navy', flip=True)
    ribbon(w, PATH_A, 0, PATH_A.len, 0, 1.15, 0.78, 1.15, 'pad_navy')
    fe = O('fence'); h = G.SPEC['fence_h']
    poly_ribbon(fe, G.FENCE[::-1], 0, h - 0.15, 'pad_fence'); poly_ribbon(fe, G.FENCE[::-1], h - 0.15, h, 'pad_top')
    for a, c2 in zip(G.FENCE, G.FENCE[1:]):                                   # 펜스 윗면 (두께 0.6 m)
        e = sub(c2, a); L = hyp(a, c2); nn = (e[1] / L, -e[0] / L)
        if nn[0] * a[0] + nn[1] * a[1] < 0: nn = (-nn[0], -nn[1])
        fe.quad(p3(a, h), p3(c2, h), p3(add(c2, nn, 1.0), h), p3(add(a, nn, 1.0), h), 'pad_fence')
    po = O('foul_poles', 'baseball')
    for p in (G.FENCE[0], G.FENCE[-1]):
        po.beam(p3(p, 0), p3(p, 24.0), 0.18, 'pole')
        d = u(45) if p[0] > 0 else u(135)                                     # 폴에서 파울 지역 쪽으로 달린 그물판
        for z in (h + 1.0, 24.0): po.beam(p3(p, z), p3(add(p, (d[1], -d[0]) if p[0] > 0 else (-d[1], d[0]), 1.1), z), 0.08, 'pole')
    # 더그아웃 (1루 홈 / 3루 원정): 벽 앞으로 3.6 m, 길이 22 m
    du = O('dugouts')
    for side in (1, 3):
        f_ = G.on1 if side == 1 else G.on3
        for (z0, z1, m_, d0) in ((0.0, 1.05, 'wall_dark', BACKD - 0.1), (1.05, 1.25, 'dugout_roof', BACKD - 3.9)):   # 지붕은 내야 벽 높이 (바닥은 그라운드보다 낮은 반지하로 가정)
            q = [f_(12, d0), f_(34, d0), f_(34, BACKD + 0.2), f_(12, BACKD + 0.2)]
            if side == 3: q = q[::-1]
            du.prism(q, z0, z1, m_)
        q = [f_(12.5, BACKD - 2.9), f_(33.5, BACKD - 2.9), f_(33.5, BACKD - 2.5), f_(12.5, BACKD - 2.5)]
        if side == 3: q = q[::-1]
        du.prism(q, 0.0, 0.45, 'bench')
        for a in (12, 23, 34):                                                 # 지붕 기둥
            du.beam(p3(f_(a, BACKD - 3.8), 0), p3(f_(a, BACKD - 3.8), 1.05), 0.12, 'steel')
    # 백스톱 그물 (렌더·웹 공용 얇은 판 + 기둥): 홈 뒤 ±60° 범위, 높이 9 m
    nt = O('net', 'baseball'); s0, s1 = G._a(3, 30), G._a(1, 30); st = PATH_A.stations(s0, s1)
    for a, c2 in zip(st, st[1:]): nt.quad(p3(PATH_A.at(a, -0.15), 1.15), p3(PATH_A.at(c2, -0.15), 1.15), p3(PATH_A.at(c2, -0.15), 10.0), p3(PATH_A.at(a, -0.15), 10.0), 'net')
    np_ = O('net_posts', 'baseball')
    for s in (s0, s1): np_.beam(p3(PATH_A.at(s, -0.15), 0), p3(PATH_A.at(s, -0.15), 10.0), 0.08, 'wall_dark')
    for a, c2 in zip(st, st[1:]): np_.beam(p3(PATH_A.at(a, -0.15), 10.0), p3(PATH_A.at(c2, -0.15), 10.0), 0.03, 'wall_dark')

BACKD = G.BACK


# ───────── 지붕 ─────────
RINGS = [1.0, 0.90, 0.80, 0.70, 0.62, 0.54, 0.44, 0.33, 0.22]     # 조명은 0.80·0.62 고리(캣워크)에 달림
ROOF_SLIDE = (XW * (1 - 0.54), 2.4)      # 지붕이 열릴 때 패널 이동량: 동·서로 약 47 m, 위로 2.4 m (고정 지붕 위로 올라탐)
NRAD = 72

def build_roof():
    shell = O('shell_wall'); rim = oct_ring(1.0, 8 * 12)
    n = len(rim)
    for i in range(n):
        a, b = rim[i], rim[(i + 1) % n]
        for z0, z1, m in ((0, RIM_Z - 7.0, 'wall_dark'), (RIM_Z - 7.0, RIM_Z - 1.0, 'glass_top'), (RIM_Z - 1.0, RIM_Z + 4.0, 'wall_dark')):
            shell.quad(p3(b, z0), p3(a, z0), p3(a, z1), p3(b, z1), m)
    gnd = O('ground_slab'); gnd.face([p3(p, -0.8) for p in rim], 'wall_gray')      # 그라운드와 겹쳐 깜박이지 않게 충분히 아래
    # 개폐식 지붕 (사용자 지정 · 개폐 방식은 가정): 조명 고리 안쪽(ρ ≤ 0.54)이 동·서 두 장의 패널로 나뉘어
    # 바깥 고정 지붕 위로 미끄러져 열린다. 고정부 = roof_skin·roof_truss, 이동부 = roof_panel_W·roof_panel_E
    rings = [oct_ring(r, NRAD) for r in RINGS]; T = 4.0          # T: 철골 춤 (위현재 = 지붕면)
    KP = RINGS.index(0.54)                                     # 이 고리(ρ = RINGS[KP])부터 안쪽이 이동 패널
    def part(k, mid):                                          # (객체 접미사) 고정부면 None
        return None if k < KP else ('W' if mid[0] < RC[0] else 'E')
    def SK(pn): return O('roof_skin') if pn is None else O('roof_panel_' + pn)
    def TR(pn): return O('roof_truss') if pn is None else O('roof_panel_' + pn)
    for k in range(len(RINGS) - 1):
        for j in range(NRAD):
            j2 = (j + 1) % NRAD; z0, z1 = roof_z(RINGS[k]) + T, roof_z(RINGS[k + 1]) + T
            q = [rings[k][j2], rings[k][j], rings[k + 1][j], rings[k + 1][j2]]
            pn = part(k, lerp(lerp(q[0], q[1], .5), lerp(q[2], q[3], .5), .5))
            SK(pn).quad(p3(q[0], z0), p3(q[1], z0), p3(q[2], z1), p3(q[3], z1), 'roof_skin')
            if pn:                                             # 패널 아랫면: 미디어 천장
                SK(pn).quad(p3(q[0], z0 - 0.4), p3(q[1], z0 - 0.4), p3(q[2], z1 - 0.4), p3(q[3], z1 - 0.4), 'roof_led')
    c = rings[-1]; zc = roof_z(RINGS[-1]) + T                  # 가운데 덮개도 동·서로 나눔
    for pn, sel in (('W', lambda p: p[0] <= RC[0] + 1e-6), ('E', lambda p: p[0] >= RC[0] - 1e-6)):
        half = [p for p in c if sel(p)]
        half.sort(key=lambda p: math.atan2(p[1] - RC[1], (p[0] - RC[0]) * (1 if pn == 'E' else -1)))
        SK(pn).face([p3(p, zc) for p in half], 'roof_skin'); SK(pn).face([p3(p, zc - 0.4) for p in half], 'roof_led')
        ys = [p[1] for p in half]                              # 패널이 맞닿는 가운데 이음매 보
        SK(pn).beam((RC[0], min(ys) - 0.0, zc - 2.0), (RC[0], max(ys), zc - 2.0), 0.5, 'truss', 4.0)
    for k, r in enumerate(RINGS):
        zb = roof_z(r); deep = 7.0 if k == 0 else T; w = 0.55 if k == 0 else 0.38
        for j in range(NRAD):
            j2 = (j + 1) % NRAD; a, b = rings[k][j], rings[k][j2]
            tr = TR(part(k, lerp(a, b, .5)) if k > KP else None)        # ρ = 0.54 고리는 열리는 구멍의 테두리라 고정부
            tr.beam(p3(a, zb), p3(b, zb), w, 'truss'); tr.beam(p3(a, zb + deep), p3(b, zb + deep), w, 'truss')
            tr.beam(p3(a, zb), p3(a, zb + deep), w * 0.7, 'truss')
            if j % 2 == 0 or k == 0: tr.beam(p3(a, zb), p3(b, zb + deep), w * 0.6, 'truss')
            if j % 2 == 1 or k == 0: tr.beam(p3(a, zb + deep), p3(b, zb), w * 0.6, 'truss')      # 가장자리 고리는 X 가새
        if k + 1 < len(RINGS):
            zb2 = roof_z(RINGS[k + 1])
            for j in range(NRAD):
                a, b = rings[k][j], rings[k + 1][j]; m_ = lerp(a, b, 0.5); zm = (zb + zb2) / 2
                tr = TR(part(k, lerp(m_, rings[k][(j + 1) % NRAD], 0.5)))           # 이음매 위 부재는 가새가 뻗는 쪽 패널에 붙임
                tr.beam(p3(a, zb), p3(b, zb2), 0.34, 'truss'); tr.beam(p3(a, zb + T), p3(b, zb2 + T), 0.34, 'truss')
                tr.beam(p3(a, zb), p3(m_, zm + T), 0.2, 'truss'); tr.beam(p3(m_, zm + T), p3(b, zb2), 0.2, 'truss')
                if j % 2 == 0:                                   # 지붕면 대각 가새
                    tr.beam(p3(a, zb + T), p3(rings[k + 1][(j + 1) % NRAD], zb2 + T), 0.16, 'truss')
    # 경기 조명: 타원 고리 2줄에 조명 뱅크
    lp = O('roof_lamps', 'baseball'); lb = O('roof_lamp_bodies')
    for rho, cnt, zoff in ((0.62, 14, -1.0), (0.80, 18, -1.2)):
        ring = oct_ring(rho, cnt)
        for i, p in enumerate(ring):
            ang = math.atan2(p[1] - RC[1], p[0] - RC[0]) + math.pi / 2; z = roof_z(rho) + zoff
            co, si = math.cos(ang), math.sin(ang)
            lb.box((p[0], p[1], z + 0.4), (9.4, 2.4, 0.3), 'lamp_body', ang)            # 틀
            for a in range(6):                                                            # 작은 LED 모듈 6 × 2
                for b in range(2):
                    lx, ly = (a - 2.5) * 1.5, (b - 0.5) * 1.1
                    c = (p[0] + co * lx - si * ly, p[1] + si * lx + co * ly, z + 0.12)
                    lb.box((c[0], c[1], z + 0.2), (1.3, 0.95, 0.16), 'lamp_body', ang); lp.box(c, (1.1, 0.75, 0.06), 'lamp', ang)


# ───────── 전광판 · 외야 건물 · 호텔 ─────────
BOARD_Z0, BOARD_Z1 = 28.0, 50.0       # [역산] 메인 전광판 아래·위 높이 (폭 약 98 m — 2023 보도의 100 m 와 일치, 높이는 22 m 로 보도의 16.5 m 보다 큼)
BOARD_D = 23.0                        # 펜스에서 뒤로
BOARD_S = (2.0, G.SF_K1 + 27.0)       # 경로 F 구간 (우중간 → 중견 → 좌익)  [역산]

BOARD_PATH = G.Path([G.PATH_F.p[0]] + G.fillet(G.PATH_F.p[0], G.FENCE[2], G.FENCE[3], 80.0, 14)
                    + G.fillet(G.FENCE[2], G.FENCE[3], G.FENCE[4], 80.0, 14) + [G.FENCE[4]], step=2.0)   # 꺾임 없는 곡면 [Gemini 검수 → 조감도 확인]

def build_board():
    F = BOARD_PATH; fr = O('board_frame'); bd = O('board_main')
    s0, s1 = BOARD_S[0], BOARD_S[1] - (G.PATH_F.len - BOARD_PATH.len)
    ribbon(fr, F, s0 - 1.0, s1 + 1.0, BOARD_D + 0.3, BOARD_Z0 - 1.0, BOARD_D + 0.3, BOARD_Z1 + 1.0, 'board_frame', flip=True)
    st = F.stations(s0, s1); L = s1 - s0
    for a, b in zip(st, st[1:]):
        ua, ub = 1 - (a - s0) / L, 1 - (b - s0) / L                 # 관중이 볼 때 왼쪽(좌익)이 u=0
        bd.quad(p3(F.at(b, BOARD_D), BOARD_Z0), p3(F.at(a, BOARD_D), BOARD_Z0), p3(F.at(a, BOARD_D), BOARD_Z1), p3(F.at(b, BOARD_D), BOARD_Z1),
                'led_board', [(ub, 0), (ua, 0), (ua, 1), (ub, 1)])


def blk(ob, a, b, z0, z1, f0, depth, m, t0=0.0, t1=0.0, mtop=None):
    """a→b 선분(평면)을 앞면으로, 바깥(홈 반대쪽)으로 f0 만큼 물러나 깊이 depth 인 상자"""
    L = hyp(a, b); d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L); n = (d[1], -d[0])
    mid = lerp(a, b, 0.5)
    if n[0] * (mid[0] - 0) + n[1] * (mid[1] - 45.0) < 0: n = (-n[0], -n[1])
    a = add(a, d, t0); b = add(b, d, -t1); f1 = f0 + depth
    q = [add(a, n, f0), add(b, n, f0), add(b, n, f1), add(a, n, f1)]
    cr = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0])
    if cr < 0: q = q[::-1]
    ob.prism(q, z0, z1, m, mtop=mtop)
    return n

def grid(ob, a, b, z0, z1, f0, nx, zs=(), m='wall_dark', w=0.3):
    """유리면 앞 멀리언: 세로 nx 칸 + 주어진 높이의 가로 띠"""
    L = hyp(a, b)
    for k in range(1, nx):
        t = L * k / nx; blk(ob, a, b, z0, z1, f0 - 0.22, 0.22, m, t - w / 2, max(0.0, L - t - w / 2))
    for zz in (z0,) + tuple(zs) + (z1,): blk(ob, a, b, zz - w / 2, zz + w / 2, f0 - 0.22, 0.22, m)

def build_outfield():
    """중견~우익 외야 건물. 방위(홈 기준)와 높이는 2026 조감도에서 역산 [역산], 깊이·세부는 가정"""
    fp = fence_pt; ob = O('outfield_buildings'); gl = O('outfield_glass'); ad = O('board_sub')
    # ── 우익 (45.5°~66°): 펜스 뒤 테라스(쇼핑몰 연결부) → 상가 유리 → 간판 띠 → 석재 건물 ──
    a, b = fp(45.5), fp(66)
    blk(ob, a, b, 0, 5.0, 0.6, 14, 'wall_gray', mtop='slab_white')                  # 테라스 데크 (z 5 m)
    blk(gl, fp(46.5), fp(65.5), 5.0, 10.5, 14.0, 0.3, 'glass_shop'); grid(ob, fp(46.5), fp(65.5), 5.0, 10.5, 14.0, 12)
    for bb in (62, 58, 54, 50): blk(ob, fp(bb + 0.45), fp(bb), 5.0, 10.5, 12.6, 0.9, 'slab_white')   # 기둥
    blk(ob, a, b, 10.5, 14.0, 12.4, 1.2, 'board_frame')                              # 간판 띠 (Starfield)
    blk(ob, a, b, 5.0, 14.0, 14.3, 14, 'wall_dark')
    blk(ob, fp(45.5), fp(57), 14.0, 40.0, 11.0, 16, 'stone')                         # 석재 건물 (스타벅스 간판)
    for z0, z1 in ((17.0, 25.0), (28.0, 37.0)):
        blk(gl, fp(47.5), fp(55.5), z0, z1, 10.7, 0.3, 'glass_shop'); grid(ob, fp(47.5), fp(55.5), z0, z1, 10.7, 6, ((z0 + z1) / 2,))
    # 동쪽 3층 북쪽 끝과 맞닿는 석재 타워 + 세로 전광판 (홈 쪽 면)
    ob.prism([(76.0, 62.4), (97.0, 62.4), (97.0, 82.0), (76.0, 82.0)], 0.0, 43.0, 'stone')
    ad.quad((78.5, 62.3, 27.0), (83.5, 62.3, 27.0), (83.5, 62.3, 38.0), (78.5, 62.3, 38.0), 'led_ad')
    # ── 우중간 (58°~68°): 유리 커튼월 박스 ──
    blk(gl, fp(58), fp(68), 15.0, 46.0, 14.0, 14, 'glass_top'); grid(ob, fp(58), fp(68), 15.0, 46.0, 14.0, 8, (22.5, 30.0, 38.0), w=0.4)
    # ── 우중간~중견 (69°~85°): STARFIELD 타워 (흰 격자 + 유리) ──
    blk(ob, fp(69), fp(85), 19.0, 49.0, 14.0, 14, 'hotel_white')
    blk(gl, fp(70), fp(84), 21.0, 44.0, 13.7, 0.3, 'glass_top'); grid(ob, fp(70), fp(84), 21.0, 44.0, 13.7, 9, (26.5, 32.0, 38.0), m='hotel_white', w=0.5)
    blk(ob, fp(72), fp(82), 44.8, 48.2, 13.6, 0.3, 'board_frame')                    # 상단 간판
    # 펜스 뒤 낮은 층 (66°~85°): 식음 시설 유리 + 간판 띠
    a, b = fp(66), fp(85)
    blk(ob, a, b, 0, 5.2, 0.6, 13, 'wall_dark', mtop='slab_white')
    blk(gl, fp(66.5), fp(84.5), 5.2, 10.0, 6.0, 0.3, 'glass_shop'); grid(ob, fp(66.5), fp(84.5), 5.2, 10.0, 6.0, 12)
    blk(ob, a, b, 10.0, 19.0, 6.3, 22, 'wall_dark'); blk(ob, a, b, 10.0, 12.6, 5.6, 0.7, 'board_frame')
    blk(ob, fp(58), fp(69), 10.0, 15.0, 12.0, 16, 'wall_dark')
    # ── 중견 (85°~95°): 펜스 뒤 회색 박스 (배터스아이 위 시설) ──
    for b0, b1 in ((85.5, 90.0), (90.0, 95.0)):                                      # 펜스 꺾임점(중견)에서 나눠 펜스 앞으로 튀어나오지 않게
        blk(ob, fp(b0), fp(b1), 6.0, 20.5, 4.0, 12, 'wall_gray')
        blk(gl, fp(b0 + 0.6), fp(b1 - 0.6), 12.0, 19.0, 3.7, 0.3, 'glass_shop'); grid(ob, fp(b0 + 0.6), fp(b1 - 0.6), 12.0, 19.0, 3.7, 3, (15.5,))
        blk(ob, fp(b0), fp(b1), 0, 6.0, 0.6, 16, 'wall_dark')
    # 전광판 아래 아치형 콘코스 (외야 2층 뒤)  — 조감도의 노란 아치 띠
    F = PATH_F; d2b, z2b = tier_back(TIER['OF2']); s = TIER['OF2']['s0'] + 2.0
    while s < TIER['OF2']['s1'] - 3.0:
        A_, B_ = F.at(s, d2b + 2.85), F.at(s + 2.6, d2b + 2.85)
        gl.quad(p3(A_, z2b + 0.2), p3(B_, z2b + 0.2), p3(B_, z2b + 3.6), p3(A_, z2b + 3.6), 'glass_shop'); s += 4.2
    # 외야 뒤를 막는 큰 벽 (건물 덩어리 뒤·사이)
    sh = O('shell_backwall'); blk(sh, fp(45.5), fp(66), 0, RIM_Z, 28, 6, 'wall_dark'); blk(sh, fp(66), fp(90), 0, RIM_Z, 28, 6, 'wall_dark')


HOTEL_FLOORS, FLOOR_H, HOTEL_Z0 = 6, 3.8, 9.8        # [보도] 호텔 55실, 3~6층 / [역산] 입면 9~33 m
HOTEL_TOP = HOTEL_Z0 + HOTEL_FLOORS * FLOOR_H

def hotel_frame():
    """호텔 입면 [역산]: 좌익 폴 바로 뒤에서 3루 파울라인과 직각으로 바깥쪽 36 m. 홈 쪽을 바라본다.
    → (원점, X(입면 방향: 파울라인에서 바깥으로), Y(홈 쪽), 길이)"""
    o = G.on3(G.LINE + 2.0, -1.0); X = u(225); Y = u(315)
    return o, X, Y, 37.0

def build_hotel():
    o, X, Y, L = hotel_frame(); ob = O('hotel'); gl = O('hotel_glass')
    H = lambda x, y, z: (o[0] + X[0] * x + Y[0] * y, o[1] + X[1] * x + Y[1] * y, z)
    def hb(x0, x1, y0, y1, z0, z1, m, target=ob):
        q = [H(x0, y0, 0)[:2], H(x1, y0, 0)[:2], H(x1, y1, 0)[:2], H(x0, y1, 0)[:2]]
        cr = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0])
        target.prism(q if cr > 0 else q[::-1], z0, z1, m, bottom=True)
    D = 18.0
    hb(0, L, -D, -0.4, 0, HOTEL_TOP + 3.0, 'wall_dark')                       # 본체
    hb(0, L, -6.0, -0.5, HOTEL_Z0, HOTEL_TOP, 'hotel_room')                    # 객실 안쪽 (불 켜진 방)
    for n in range(HOTEL_FLOORS + 1):                                           # 층 슬래브
        z = HOTEL_Z0 + n * FLOOR_H; hb(-0.3, L + 0.3, -0.5, 0.9, z - 0.25, z + 0.25, 'hotel_white')
    x = 0.0; FIN = 3.7; wood0, wood1 = FIN * 5, FIN * 7                 # 가운데 목재 발코니 스택
    while x <= L + 1e-6:
        if not (wood0 - 0.1 < x < wood1 + 0.1): hb(x - 0.2, x + 0.2, -0.5, 1.0, HOTEL_Z0, HOTEL_TOP, 'hotel_white')
        x += FIN
    hb(0, L, -0.45, -0.35, HOTEL_Z0, HOTEL_TOP, 'glass_rail', gl)
    for n in range(HOTEL_FLOORS):
        z = HOTEL_Z0 + n * FLOOR_H
        hb(wood0, wood1, -0.5, 2.6, z - 0.2, z + 0.25, 'wood'); hb(wood0, wood1, 2.5, 2.6, z + 0.25, z + 1.2, 'glass_rail', gl)
    hb(wood0 + 2.2, wood1 - 2.2, -1.2, 0.6, HOTEL_Z0, HOTEL_TOP + 2.0, 'wood')
    hb(-0.3, L + 0.3, -0.5, 1.0, HOTEL_TOP, HOTEL_TOP + 1.2, 'hotel_white')    # 옥상 난간
    # 호텔 아래 (1층 뒤 ~ 호텔 바닥): 어두운 벽과 붉은 테라스 앞 띠
    hb(-2.0, L, -0.4, 0.0, 0.0, HOTEL_Z0 - 0.25, 'wall_dark')
    # 인피니티풀 (호텔 옥상, 그라운드 쪽 끝)  [보도: 왼쪽 상단] — 위치·크기 가정
    px0, px1 = L * 0.06, L * 0.62; T = HOTEL_TOP + 1.2
    hb(px0, px1, -9.0, 1.0, T - 0.2, T, 'pool_tile'); hb(px0, px1, 0.8, 1.0, T, T + 0.95, 'glass_rail', gl)
    hb(px0 + 0.3, px1 - 0.3, -8.7, 0.8, T + 0.85, T + 0.88, 'water')
    return dict(pool=H((px0 + px1) / 2, -1.0, T + 0.9 + 0.55), room=H(L * 0.7, -1.2, HOTEL_Z0 + FLOOR_H * 3 + 1.3))


# ───────── 맞닿은 건물에서 보는 시야 ─────────
VIEW_EYE = 1.55 - 1.14      # 서서 보는 눈높이 1.55 m (앱은 좌석 바닥 + 1.14 m 를 눈높이로 쓰므로 그 차이만큼 올려 적음)

def view_sections():
    """경기장과 맞닿은 건물의 시점들. 좌석 구역과 같은 형식(행 = 층, 번호 = 창 위치)이라 앱·렌더·시야 검사가 그대로 쓴다.
    건물 위치·높이는 조감도 역산, 층 높이와 창 위치는 가정."""
    out = []
    def sec(sid, note, side, rows):
        out.append(dict(id=sid, tier='BLD', floor=9, zone='건물', grade='BV', side=side, view=True, note=note,
                        rows=[dict(row=i + 1, z=z + VIEW_EYE, seats=s) for i, (z, s) in enumerate(rows)]))
    # 호텔 (좌익 폴 뒤): 층마다 객실 발코니 10곳
    o, X, Y, L = hotel_frame(); FIN = 3.7; yaw = math.atan2(Y[1], Y[0])
    H = lambda x, y: (o[0] + X[0] * x + Y[0] * y, o[1] + X[1] * x + Y[1] * y)
    rows = []
    for n in range(HOTEL_FLOORS):
        z = HOTEL_Z0 + n * FLOOR_H + 0.25
        rows.append((z, [(*H(FIN * (k + 0.5), 1.9 if k in (5, 6) else 0.45), yaw) for k in range(9, -1, -1)]))
    sec('호텔', '호텔 객실 발코니 (좌익 폴 뒤, 층 = 모델의 객실 층)', '좌익', rows)
    # 인피니티풀 (호텔 옥상, 그라운드 쪽 가장자리)
    px0, px1 = L * 0.06, L * 0.62; T = HOTEL_TOP + 1.2; n = 7
    sec('풀', '인피니티풀 가장자리 (호텔 옥상, 위치는 가정)', '좌익',
        [(T + 0.9 + 0.55 - 1.55, [(*H(px1 - 1.5 - (px1 - px0 - 3.0) * k / (n - 1), 0.3), yaw) for k in range(n)])])
    # 외야 건물: 펜스 선분을 앞면으로, 바깥으로 f m 물러난 줄에 step 간격
    def line(b0, b1, f, step=4.0):
        a, b = fence_pt(b0), fence_pt(b1); Lb = hyp(a, b); d = ((b[0] - a[0]) / Lb, (b[1] - a[1]) / Lb); nn = (d[1], -d[0])
        if nn[0] * (lerp(a, b, .5)[0]) + nn[1] * (lerp(a, b, .5)[1] - 45.0) < 0: nn = (-nn[0], -nn[1])
        k = max(2, int(Lb // step)); yw = math.atan2(-nn[1], -nn[0])
        pts = [(*add(add(a, d, Lb * (i + 0.5) / k), nn, f), yw) for i in range(k)]
        return pts                                               # 방위가 큰 쪽(관중 기준 오른쪽)이 1번
    sec('테라스', '우익 펜스 뒤 테라스 (쇼핑몰 연결부)', '우익', [(5.0, line(65.0, 46.5, 2.0, 3.0))])
    sec('석재관', '우익 석재 건물 창가 (층 높이는 가정)', '우익', [(z, line(55.5, 47.5, 9.9)) for z in (17.2, 21.2, 28.2, 32.7)])
    sec('유리관', '우중간 유리 건물 창가 (층 높이는 가정)', '우익', [(z, line(68.0, 58.0, 13.2)) for z in (15.3, 22.8, 30.3, 38.3)])
    sec('타워', '우중간~중견 타워 창가 (층 높이는 가정)', '중견', [(z, line(84.0, 70.0, 12.9)) for z in (21.3, 26.8, 32.3, 38.3)])
    sec('중견관', '중견 펜스 뒤 시설 창가', '중견', [(12.3, line(95.0, 90.4, 2.9, 3.0) + line(89.6, 85.5, 2.9, 3.0))])
    return out


# ───────── 콘서트 (가상 배치) ─────────
def build_concert():
    cv = O('concert_cover', 'concert'); poly = field_poly(); c = (0.0, 52.0)
    for a, b in zip(poly, poly[1:] + poly[:1]): cv.face([p3(c, .06), p3(a, .06), p3(b, .06)], 'cover')
    st = O('concert_stage', 'concert'); Y0, Y1, HW, SH = 92.0, 106.0, 30.0, 2.2
    st.box((0, (Y0 + Y1) / 2, SH / 2), (HW * 2, Y1 - Y0, SH), 'stage'); st.box((0, (Y0 + Y1) / 2, SH + 0.03), (HW * 2 - .2, Y1 - Y0 - .2, .06), 'stage_top')
    st.box((0, Y1 + 1.6, 11), (40, 2.4, 22), 'stage')
    st.box((0, (45 + Y0) / 2, SH / 2), (5, Y0 - 45, SH), 'stage_top'); st.box((0, 45, SH / 2), (13, 13, SH), 'stage_top')
    for xx in (-HW + 1, HW - 1):
        for yy in (Y0 + .5, Y1 - .5): st.box((xx, yy, 12), (.8, .8, 24), 'stage_truss')
    for yy in (Y0 + .5, Y0 + 6, Y1 - .5): st.box((0, yy, 24), (HW * 2, .8, .8), 'stage_truss')
    ld = O('concert_led', 'concert'); y = Y1 + .3
    ld.quad((-17, y, 3), (17, y, 3), (17, y, 20), (-17, y, 20), 'led_stage')
    ld.quad((-30, y - 4, 4), (-20, y - 1, 4), (-20, y - 1, 16), (-30, y - 4, 16), 'led_stage')
    ld.quad((20, y - 1, 4), (30, y - 4, 4), (30, y - 4, 16), (20, y - 1, 16), 'led_stage')


def guides():
    """조감도 겹쳐 보기용 기준선"""
    g = {}; F = PATH_F
    s0, s1 = BOARD_S
    g['board'] = ([p3(F.at(s, BOARD_D), z) for s, z in ((s0, BOARD_Z0), (s1, BOARD_Z0), (s1, BOARD_Z1), (s0, BOARD_Z1), (s0, BOARD_Z0))], (255, 255, 255))
    o, X, Y, L = hotel_frame(); H = lambda x, z: (o[0] + X[0] * x, o[1] + X[1] * x, z)
    g['hotel'] = ([H(0, HOTEL_Z0), H(L, HOTEL_Z0), H(L, HOTEL_TOP), H(0, HOTEL_TOP), H(0, HOTEL_Z0)], (120, 200, 255))
    rim = oct_ring(1.0, 96); g['rim'] = ([p3(p, RIM_Z) for p in rim + rim[:1]], (255, 255, 120))
    for k, r in enumerate(RINGS[1:]):
        ring = oct_ring(r, 48); g['ring%d' % k] = ([p3(p, roof_z(r)) for p in ring + ring[:1]], (200, 200, 90))
    return g


def build(concert=True):
    GEO.clear()
    build_field(); build_stands(); build_roof(); build_board(); build_outfield()
    info = build_hotel()
    if concert: build_concert()
    return GEO, info


if __name__ == '__main__':
    geo, info = build()
    for s in view_sections(): print('view', s['id'], [len(r['seats']) for r in s['rows']])
    tot = 0
    for o in geo.values():
        tot += len(o.F); print(f'{o.name:22s} {o.group:9s} faces {len(o.F)}')
    print('total faces', tot, info)
