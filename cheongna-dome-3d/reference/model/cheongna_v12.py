# -*- coding: utf-8 -*-
# 스타필드 청라 멀티스타디움 베이스 씬 v2 (Blender 4.2~5.x)
# 기준: 신세계 2026.03.24 내부 조감도. 좌표: 홈=원점, +Y=센터, m. 치수는 전부 [추정].
import math, os

try:
    import bpy
    from mathutils import Vector
except ImportError:
    bpy = None

# ───────── 파라미터 [추정] ─────────
LINE_DIST, CF_DIST, BACKSTOP = 99.0, 122.0, 18.0
C = (0.0, 45.0)
LOW_ROWS, LOW_DEPTH, LOW_RISE, LOW_Z0 = 30, 0.85, 0.45, 1.6
UP_ROWS, UP_DEPTH, UP_RISE = 24, 0.90, 0.62
CONC_W = 5.0
UP_TRIM_L = 22                      # 좌익 상단 관중석을 폴 앞 약 33 m에서 끝냄 (호텔 자리)
LOW_END = 1.0 + LOW_ROWS * LOW_DEPTH
UP_OFF = LOW_END + CONC_W
LOW_TOP = LOW_Z0 + LOW_ROWS * LOW_RISE
UP_Z0 = LOW_TOP + 6.0
UP_TOP = UP_Z0 + UP_ROWS * UP_RISE
OF_ROWS, OF_DEPTH, OF_RISE, OF_Z0 = 10, 0.85, 0.5, 3.4      # 외야 블리처
FACADE_OFF = 1.0 + OF_ROWS * OF_DEPTH + 1.5                  # 펜스 → 외야 건물 입면
ROOF_RIM_Z, ROOF_RISE = 60.0, 22.0
WALL_FOUL, WALL_OF = 58.0, 40.0                              # 돔 외벽 오프셋 (파울 쪽 / 외야 쪽)

HOTEL_BEARING, HOTEL_W, HOTEL_D = 129.0, 46.0, 20.0          # 좌익 코너
HOTEL_Z0, FLOOR_H, HOTEL_FLOORS = 10.0, 3.6, 9
HOTEL_TOP = HOTEL_Z0 + FLOOR_H * HOTEL_FLOORS
FIN = 3.6

STAGE_Y0, STAGE_Y1, STAGE_HW, STAGE_H = 98.0, 112.0, 30.0, 2.2
LED_W, LED_Z0, LED_Z1 = 34.0, 3.0, 20.0
THRUST, THRUST_Y0, THRUST_HW, THRUST_END = True, 45.0, 2.5, (0.0, 45.0, 6.5)

HOME_UP_ROW, HOME_LENS, HOME_PITCH = 4, 14.0, -16.0
ROOM_FLOOR = 5                       # 레퍼런스 빨간 박스 층
ROOM_X = 14.6
ROOM_LENS, ROOM_PITCH, ROOM_YAW_OFF = 24.0, -17.0, 5.0
POOL_LENS, POOL_PITCH, POOL_YAW_OFF = 24.0, -12.0, 10.0
POOL = (-23.0, -8.0, -9.0, 1.5)      # 풀 x0,x1,y0,y1 (호텔 로컬)
FIELD_AIM = (4.0, 50.0)

# ───────── 기본 기하 ─────────
def u(d):
    r = math.radians(d); return (math.cos(r), math.sin(r))
def add(a, b, s=1.0): return (a[0] + b[0] * s, a[1] + b[1] * s)
def fence_dist(th):
    b = abs(th - 90.0) / 45.0
    return CF_DIST - (CF_DIST - LINE_DIST) * b ** 1.6

FENCE_BEARINGS = [45, 58, 72, 86, 112, 124, 135]
def fence_arc(step=1.5):
    pts = [add((0, 0), u(b), fence_dist(b)) for b in FENCE_BEARINGS]
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(round(L / step)))
        for k in range(1, n + 1): out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out

LF_OFF = add(add((0, 0), u(135), LINE_DIST), u(225), BACKSTOP)
RF_OFF = add(add((0, 0), u(45), LINE_DIST), u(315), BACKSTOP)
BACK_ARC = [add((0, 0), u(225 + i * 5), BACKSTOP) for i in range(19)]
KINK_ALONG, POLE_OFF = 62.0, 5.0
PL = add(add((0, 0), u(135), LINE_DIST), u(225), POLE_OFF); KL = add(add((0, 0), u(135), KINK_ALONG), u(225), BACKSTOP)
PR = add(add((0, 0), u(45), LINE_DIST), u(315), POLE_OFF); KR = add(add((0, 0), u(45), KINK_ALONG), u(315), BACKSTOP)
FIELD = fence_arc(3) + [PL, KL] + BACK_ARC + [KR, PR]

def resample(path, step):
    out = [path[0]]
    for a, b in zip(path, path[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(round(L / step)))
        for k in range(1, n + 1): out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out

def normals(path):
    """반시계 경로의 바깥쪽 노멀 + 마이터 길이"""
    ns = []
    for i in range(len(path)):
        a = path[max(i - 1, 0)]; b = path[min(i + 1, len(path) - 1)]
        if i == 0: a = path[0]
        if i == len(path) - 1: b = path[-1]
        segs = []
        if i > 0: segs.append((path[i - 1], path[i]))
        if i < len(path) - 1: segs.append((path[i], path[i + 1]))
        nn = []
        for p, q in segs:
            dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy) or 1
            nn.append((dy / L, -dx / L))
        nx = sum(n[0] for n in nn); ny = sum(n[1] for n in nn); L = math.hypot(nx, ny) or 1
        nx, ny = nx / L, ny / L
        cosh = nx * nn[0][0] + ny * nn[0][1]
        ns.append((nx, ny, 1.0 / max(cosh, 0.5)))
    return ns

RF_EXT = 14.0                       # 우익 관중석을 폴 너머 외야 코너까지 연장 (조감도)
_f45 = add((0, 0), u(45), fence_dist(45)); _f52 = add((0, 0), u(52), fence_dist(52))
_dx = (_f52[0] - _f45[0], _f52[1] - _f45[1]); _dl0 = math.hypot(*_dx)
PX = (PR[0] + _dx[0] / _dl0 * RF_EXT, PR[1] + _dx[1] / _dl0 * RF_EXT)
FOUL_PATH = resample([PL, KL] + BACK_ARC + [KR, PR, PX], 1.5)
OF_PATH = fence_arc(1.5)

def ray_poly(phi, poly=FIELD, c=C):
    dx, dy = u(phi); best = None
    for i in range(len(poly)):
        ax, ay = poly[i]; bx, by = poly[(i + 1) % len(poly)]
        ex, ey = bx - ax, by - ay; den = dx * ey - dy * ex
        if abs(den) < 1e-12: continue
        wx, wy = ax - c[0], ay - c[1]
        t = (wx * ey - wy * ex) / den; s = (wx * dy - wy * dx) / den
        if t > 0 and -1e-9 <= s <= 1 + 1e-9: best = t if best is None else min(best, t)
    return best

def point_in_poly(x, y, poly=FIELD):
    ins = False
    for i in range(len(poly)):
        ax, ay = poly[i]; bx, by = poly[(i + 1) % len(poly)]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax: ins = not ins
    return ins

def dist_edge(x, y, poly=FIELD):
    best = 1e9
    for i in range(len(poly)):
        ax, ay = poly[i]; bx, by = poly[(i + 1) % len(poly)]
        ex, ey = bx - ax, by - ay; L = ex * ex + ey * ey
        t = max(0, min(1, ((x - ax) * ex + (y - ay) * ey) / L)) if L else 0
        best = min(best, math.hypot(x - ax - t * ex, y - ay - t * ey))
    return best

def wall_off(phi):
    """C 기준 각도 → 돔 외벽 오프셋 (외야 20~160° 좁게)"""
    def sm(a, b, x):
        t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t)
    w = sm(10, 28, phi) * (1 - sm(152, 170, phi)) if 0 <= phi <= 180 else 0
    return WALL_FOUL + (WALL_OF - WALL_FOUL) * w

# 호텔 로컬 프레임 (입면 y=0, +y = 홈 쪽, +x = 홈을 바라볼 때 오른쪽)
def seg_pt(b): return add((0, 0), u(b), fence_dist(b))
def chord_front(b0, b1, off):
    a = seg_pt(b0); c = seg_pt(b1); dx, dy = c[0] - a[0], c[1] - a[1]; L = math.hypot(dx, dy)
    n = (dy / L, -dx / L); mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
    if n[0] * mid[0] + n[1] * mid[1] < 0: n = (-n[0], -n[1])
    return (a[0] + n[0] * off, a[1] + n[1] * off), (c[0] + n[0] * off, c[1] + n[1] * off), n
def frame_pts(p_pole, p_cf, n):
    L = math.hypot(p_cf[0] - p_pole[0], p_cf[1] - p_pole[1]); mid = ((p_pole[0] + p_cf[0]) / 2, (p_pole[1] + p_cf[1]) / 2)
    Y = (-n[0], -n[1]); X = (Y[1], -Y[0]); return (mid, X, Y, L)
def isect(p, d, q, e):
    den = d[0] * e[1] - d[1] * e[0]; t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den
    return (p[0] + t * d[0], p[1] + t * d[1])
UPB_ROWS, UPB_Z0 = 8, 9.0
UPB_OFF = 1.0 + OF_ROWS * OF_DEPTH + 1.0
HOFF = UPB_OFF + UPB_ROWS * OF_DEPTH + 0.5          # 호텔·건물 앞면 (2층 외야석 뒤)
_fa0, _fa1, _nA = chord_front(140, 128, HOFF)
_n0 = normals(FOUL_PATH)[0]
_S = isect(PL, (_n0[0], _n0[1]), _fa0, (_fa1[0] - _fa0[0], _fa1[1] - _fa0[1]))   # 좌익 관중석 끝면과 맞닿는 점
_fb0, _fb1, _nB = chord_front(137, 131, HOFF)
_dl = math.hypot(_S[0] - _fb0[0], _S[1] - _fb0[1]); HOTEL_EXT = 14.0     # 상단 관중석이 끝난 자리까지 호텔 연장
_S = (_S[0] + (_S[0] - _fb0[0]) / _dl * HOTEL_EXT, _S[1] + (_S[1] - _fb0[1]) / _dl * HOTEL_EXT)
FR_A = frame_pts(_S, _fb0, _nA)
FR_B = frame_pts(_fb0, _fb1, _nB)
def HF(fr, p):
    (ox, oy), X, Y, L = fr; x, y, z = p
    return (ox + x * X[0] + y * Y[0], oy + x * X[1] + y * Y[1], z)
def H(p): return HF(FR_A, p)
def room_x(fr):
    W = fr[3]; k = int((W / 2) / FIN); return -W / 2 + FIN * (k + 0.5)
def yaw_to(a, b): return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))

def cameras():
    r = BACKSTOP + UP_OFF + HOME_UP_ROW * UP_DEPTH + 0.35
    home = (0.0, -r, UP_Z0 + HOME_UP_ROW * UP_RISE + 1.15)
    room = HF(FR_A, (room_x(FR_A), -1.1, HOTEL_Z0 + FLOOR_H * ROOM_FLOOR + 1.3))
    WB = FR_B[3]; px0, px1 = -WB / 2 + 1, WB / 2 - 1
    pool = HF(FR_B, ((px0 + px1) / 2, 1.5 - 1.2, HOTEL_TOP + 0.6 + 0.88 + 0.5))
    ya = math.degrees(math.atan2(FR_A[2][1], FR_A[2][0])); yb = math.degrees(math.atan2(FR_B[2][1], FR_B[2][0]))
    home = (1.23, -39.92, 28.27)   # 2026 조감도 구도에 맞춘 카메라 (랜드마크 역산)
    return [("CAM_01_HOME", home, 91.41, -8.69, 10.4),
            ("CAM_02_HOTEL", room, ya + ROOM_YAW_OFF, ROOM_PITCH, ROOM_LENS),
            ("CAM_03_POOL", pool, yb + POOL_YAW_OFF, POOL_PITCH, POOL_LENS)]

SHOTS = [("01_home_baseball", "CAM_01_HOME", "baseball"), ("01_home_concert", "CAM_01_HOME", "concert"),
         ("02_hotel_baseball", "CAM_02_HOTEL", "baseball"), ("02_hotel_concert", "CAM_02_HOTEL", "concert"),
         ("03_pool_baseball", "CAM_03_POOL", "baseball"), ("03_pool_concert", "CAM_03_POOL", "concert")]

# ───────── 재질 · 상태 ─────────
# name: (color, rough, metal, emit_key, emit_color, alpha)
MATS = {
    "grass": ((0.09, 0.32, 0.08), .9, 0, None, None, 1), "grass2": ((0.11, 0.36, 0.09), .9, 0, None, None, 1),
    "dirt": ((0.50, 0.32, 0.19), .95, 0, None, None, 1), "white": ((0.9, 0.9, 0.9), .5, 0, None, None, 1),
    "pad": ((0.03, 0.06, 0.16), .7, 0, None, None, 1), "seat": ((0.42, 0.06, 0.07), .6, 0, None, None, 1),
    "seat_up": ((0.40, 0.06, 0.07), .6, 0, None, None, 1), "seat_blue": ((0.07, 0.12, 0.32), .6, 0, None, None, 1),
    "concrete": ((0.20, 0.20, 0.20), .85, 0, None, None, 1), "aisle": ((0.38, 0.37, 0.36), .8, 0, None, None, 1),
    "riser": ((0.14, 0.14, 0.15), .8, 0, None, None, 1), "wall": ((0.20, 0.20, 0.22), .8, 0, None, None, 1),
    "darkwall": ((0.10, 0.10, 0.11), .7, 0, None, None, 1), "stone": ((0.58, 0.57, 0.54), .7, 0, None, None, 1),
    "ribbon": ((0.05, 0, 0), .4, 0, "ribbon", (1.0, 0.10, 0.07), 1), "banner": ((0.03, 0.03, 0.05), .5, 0, "banner", (0.5, 0.5, 0.6), 1),
    "suite": ((0.10, 0.10, 0.12), .2, 0, "suite", (1.0, 0.82, 0.62), 1),
    "shopglass": ((0.12, 0.13, 0.15), .15, 0, "shop", (1.0, 0.88, 0.70), 1),
    "topglass": ((0.15, 0.17, 0.20), .15, 0, "top", (0.85, 0.90, 1.0), 1),
    "roof": ((0.05, 0.055, 0.065), .7, 0, None, None, 1), "truss": ((0.62, 0.64, 0.68), .4, .6, None, None, 1),
    "rooflight": ((0.9, 0.9, 0.9), .3, 0, "rooflight", (1, 0.97, 0.9), 1),
    "roofled": ((0.05, 0.02, 0.06), .4, 0, "roofled", (0.55, 0.25, 0.85), 1),
    "score_fr": ((0.03, 0.03, 0.035), .5, 0, None, None, 1), "score": ((0.02, 0, 0), .3, 0, "score", (0.95, 0.15, 0.12), 1),
    "adscreen": ((0.02, 0.02, 0.02), .3, 0, "score", (0.9, 0.6, 0.4), 1),
    "hotel_white": ((0.86, 0.85, 0.82), .6, 0, None, None, 1), "wood": ((0.45, 0.27, 0.15), .6, 0, None, None, 1),
    "glass": ((0.35, 0.45, 0.5), .05, 0, None, None, 0.12), "room": ((0.55, 0.50, 0.44), .8, 0, "room", (1.0, 0.85, 0.65), 1),
    "slab": ((0.78, 0.76, 0.73), .8, 0, None, None, 1), "room_wall": ((0.72, 0.66, 0.58), .8, 0, None, None, 1),
    "curtain": ((0.82, 0.78, 0.70), .9, 0, None, None, 1), "fabric": ((0.36, 0.34, 0.31), .9, 0, None, None, 1),
    "water": ((0.02, 0.10, 0.12), .03, 0, None, None, 0.9), "pool_tile": ((0.58, 0.70, 0.74), .3, 0, None, None, 1),
    "deck": ((0.62, 0.59, 0.54), .7, 0, None, None, 1), "cover": ((0.24, 0.25, 0.26), .85, 0, None, None, 1),
    "chair": ((0.10, 0.10, 0.11), .6, 0, None, None, 1), "stage": ((0.03, 0.03, 0.035), .4, 0, None, None, 1),
    "stage_top": ((0.20, 0.20, 0.22), .2, 0, None, None, 1), "stage_truss": ((0.30, 0.30, 0.32), .4, .7, None, None, 1),
    "performer": ((0.88, 0.88, 0.88), .6, 0, None, None, 1), "led": ((0, 0, 0), .5, 0, "led", (1, 1, 1), 1),
}
STATE = {
    "baseball": dict(sun=3.0, world=0.7, exposure=0.0, spots=0.0, ribbon=3.0, banner=0.3, suite=1.5, shop=2.0, top=1.2,
                     rooflight=30.0, roofled=1.5, score=4.0, room=0.8, led=0.0),
    "concert": dict(sun=0.6, world=0.18, exposure=0.6, spots=1.0, ribbon=1.5, banner=0.1, suite=0.8, shop=1.0, top=0.5,
                    rooflight=0.0, roofled=0.8, score=0.0, room=0.5, led=4.0),
}
SPOTS = []   # (pos, target, energy[W], angle, color)
def _spots():
    pink, cool, warm = (1.0, .45, .8), (.6, .7, 1.0), (1.0, .85, .7)
    for x in (-18, -9, 0, 9, 18):
        SPOTS.append(((x, STAGE_Y0 + 6, 23.5), (x * .6, STAGE_Y0 + 5, STAGE_H), 25000, 40, pink if x % 18 == 0 else cool))
    for x in (-14, 14): SPOTS.append(((x, 40, 16), (0, 103, 3.5), 150000, 16, warm))
    SPOTS.append(((0, 20, 14), (0, 102, 3.4), 80000, 5, warm))
    for x in (-24, -8, 8, 24): SPOTS.append(((x, STAGE_Y0 + .5, 23), (x * 1.3, 35, 0), 70000, 48, cool))
_spots()

# ───────── 메시 수집 ─────────
class Obj:
    def __init__(s, name, group): s.name, s.group, s.V, s.F, s.FM = name, group, [], [], []
    def face(s, pts, m):
        i = len(s.V); s.V.extend(pts); s.F.append(list(range(i, i + len(pts)))); s.FM.append(m)
    def quad(s, a, b, c, d, m): s.face([a, b, c, d], m)
    def box(s, cx, cy, cz, sx, sy, sz, m, rotz=0.0, xf=None):
        c, si = math.cos(rotz), math.sin(rotz); P = []
        for dx in (-.5, .5):
            for dy in (-.5, .5):
                for dz in (-.5, .5):
                    x, y = dx * sx, dy * sy; p = (cx + c * x - si * y, cy + si * x + c * y, cz + dz * sz)
                    P.append(xf(p) if xf else p)
        for a, b, cc, d in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            s.quad(P[a], P[b], P[cc], P[d], m)

GEO = {}
def O(name, group="common"):
    if name not in GEO: GEO[name] = Obj(name, group)
    return GEO[name]

def profile(rows, depth, rise, z0, front_h, tail):
    prof = [(0.0, z0 - front_h), (0.0, z0)]; seg = ["front"]
    for i in range(rows):
        r = i * depth; z = z0 + i * rise
        for p, s in (((r + depth * .55, z), "floor"), ((r + depth * .55, z + .42), "seat"), ((r + depth * .68, z + .42), "seat"),
                     ((r + depth * .68, z), "seat"), ((r + depth, z), "floor"), ((r + depth, z + rise), "riser")):
            prof.append(p); seg.append(s)
    for p, s in tail(rows * depth, z0 + rows * rise): prof.append(p); seg.append(s)
    return prof, seg

def sweep(ob, path, base, prof, seg, matfn, aisle_every=12):
    ns = normals(path)
    rows = [[(p[0] + n[0] * (base + r) * n[2], p[1] + n[1] * (base + r) * n[2], z) for r, z in prof] for p, n in zip(path, ns)]
    for j in range(len(path) - 1):
        A, B = rows[j], rows[j + 1]
        for k in range(len(prof) - 1):
            ob.quad(A[k], B[k], B[k + 1], A[k + 1], matfn(seg[k], j % aisle_every == 0, j, len(path)))

# ───────── 빌드 ─────────
def build():
    GEO.clear()
    # 그라운드: 흙 바탕 → 안쪽 4.5 m 잔디 → 내야
    f = O("FIELD_baseball", "baseball")
    cen = (0.0, 55.0)
    for a, b in zip(FIELD, FIELD[1:] + FIELD[:1]): f.face([(cen[0], cen[1], 0), (a[0], a[1], 0), (b[0], b[1], 0)], "dirt")
    ns = normals(FIELD + [FIELD[0]])[:-1]
    inner = [(p[0] - n[0] * 4.5 * n[2], p[1] - n[1] * 4.5 * n[2]) for p, n in zip(FIELD, ns)]
    for a, b in zip(inner, inner[1:] + inner[:1]): f.face([(cen[0], cen[1], .01), (a[0], a[1], .01), (b[0], b[1], .01)], "grass")
    mx, my, R = 0.0, 18.44, 29.0
    def hit(th):
        ux, uy = u(th); bb = ux * mx + uy * my; return bb + math.sqrt(bb * bb - (mx * mx + my * my - R * R))
    t1, t2 = hit(45), hit(135)
    a1 = math.degrees(math.atan2(t1 * u(45)[1] - my, t1 * u(45)[0] - mx)); a2 = math.degrees(math.atan2(t2 * u(135)[1] - my, t2 * u(135)[0] - mx))
    f.face([(0, 0, .02)] + [(mx + R * math.cos(math.radians(a1 + (a2 - a1) * i / 30)), my + R * math.sin(math.radians(a1 + (a2 - a1) * i / 30)), .02) for i in range(31)], "dirt")
    f.face([(8 * math.cos(math.radians(a)), 8 * math.sin(math.radians(a)), .025) for a in range(0, 360, 10)][::-1], "dirt")
    s = 27.43 / math.sqrt(2) * .86; cy = 27.43 / math.sqrt(2)
    f.face([(0, cy - s, .03), (s, cy, .03), (0, cy + s, .03), (-s, cy, .03)], "grass2")
    f.face([(2.74 * math.cos(math.radians(a)), my + 2.74 * math.sin(math.radians(a)), .12) for a in range(0, 360, 12)], "dirt")
    for th in (45, 135):
        ux, uy = u(th); px, py = -uy * .06, ux * .06; d = LINE_DIST
        f.quad((px, py, .04), (d * ux + px, d * uy + py, .04), (d * ux - px, d * uy - py, .04), (-px, -py, .04), "white")
    b = 27.43 / math.sqrt(2)
    for x, y in ((b, b), (0, 2 * b), (-b, b)): f.box(x, y, .06, .45, .45, .1, "white", math.radians(45))
    f.face([(-.25, 0, .05), (.25, 0, .05), (.25, .25, .05), (0, .5, .05), (-.25, .25, .05)], "white")

    # 내야 쪽 관중석 (파울라인과 평행한 열)
    def lo_tail(r, z): return [((r + CONC_W, z), "floor"), ((r + CONC_W, z + 2.2), "suite"), ((r + CONC_W, z + 3.0), "banner")]
    def up_tail(r, z): return [((r, z + 3.0), "wall")]
    lp, ls = profile(LOW_ROWS, LOW_DEPTH, LOW_RISE, LOW_Z0, LOW_Z0, lo_tail)
    up, us = profile(UP_ROWS, UP_DEPTH, UP_RISE, UP_Z0, 3.2, up_tail)
    def mf(upper):
        def g(s, aisle, j, n):
            if s == "seat": return "aisle" if aisle else ("seat_up" if upper else ("seat_blue" if 0.25 < j / n < 0.75 else "seat"))
            if s == "floor": return "aisle" if aisle else "concrete"
            if s == "front": return "ribbon" if upper else "pad"
            return s if s in ("riser", "suite", "banner") else "wall"
        return g
    sweep(O("STANDS_lower"), FOUL_PATH, 1.0, lp, ls, mf(False))
    sweep(O("STANDS_upper"), FOUL_PATH[UP_TRIM_L:], UP_OFF, up, us, mf(True))
    # 바닥(돔 전체) + 코너 메움 벽
    gnd = O("GROUND")
    gnd.quad((-260, -200, -0.02), (260, -200, -0.02), (260, 320, -0.02), (-260, 320, -0.02), "concrete")
    def of_tail(r, z): return [((r, z + 1.2), "wall")]
    def brg(p): return math.degrees(math.atan2(p[1], p[0]))
    OFP = fence_arc(1.5)
    lf_path = [p for p in OFP if brg(p) >= 85.9]; rf_path = []; mid_path = [p for p in OFP if 85.9 >= brg(p)]
    bl = lambda s, a, j, n: "pad" if s == "front" else ("aisle" if a else "seat_blue") if s == "seat" else ("aisle" if a else "concrete") if s == "floor" else ("riser" if s == "riser" else "wall")
    op, os_ = profile(OF_ROWS, OF_DEPTH, OF_RISE, OF_Z0, OF_Z0, of_tail)
    sweep(O("STANDS_outfield"), lf_path, 0.0, op, os_, bl)
    up2, us2 = profile(UPB_ROWS, OF_DEPTH, 0.55, UPB_Z0, UPB_Z0, of_tail)
    bl2 = lambda s, a, j, n: "ribbon" if s == "front" else bl(s, a, j, n)
    sweep(O("STANDS_outfield"), lf_path, UPB_OFF, up2, us2, bl2)
    fw = O("STANDS_outfield")
    for a, b in zip(mid_path, mid_path[1:]): fw.quad((a[0], a[1], 0), (b[0], b[1], 0), (b[0], b[1], 3.2), (a[0], a[1], 3.2), "pad")
    fac = O("OUTFIELD_buildings")
    def seglen(b0, b1): a = seg_pt(b0); c = seg_pt(b1); return math.hypot(c[0] - a[0], c[1] - a[1])
    def sblk(b0, b1, z0, z1, f0, depth, m, t0=0.0, t1=0.0):
        a = seg_pt(b0); c = seg_pt(b1); dx, dy = c[0] - a[0], c[1] - a[1]; L = math.hypot(dx, dy); d = (dx / L, dy / L)
        n = (d[1], -d[0]); mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
        if n[0] * mid[0] + n[1] * mid[1] < 0: n = (-n[0], -n[1])
        a = (a[0] + d[0] * t0, a[1] + d[1] * t0); c = (c[0] - d[0] * t1, c[1] - d[1] * t1); f1 = f0 + depth
        q = [(a[0] + n[0] * f0, a[1] + n[1] * f0), (c[0] + n[0] * f0, c[1] + n[1] * f0), (c[0] + n[0] * f1, c[1] + n[1] * f1), (a[0] + n[0] * f1, a[1] + n[1] * f1)]
        for i in range(4):
            p, r_ = q[i], q[(i + 1) % 4]; fac.quad((p[0], p[1], z0), (r_[0], r_[1], z0), (r_[0], r_[1], z1), (p[0], p[1], z1), m)
        fac.face([(p[0], p[1], z1) for p in q], m); fac.face([(p[0], p[1], z0) for p in q[::-1]], m)
    F = HOFF   # 2층 외야석 뒤 건물 앞면 (펜스 기준 거리)
    # 좌중간 전광판 블록 (128~86): 하부 매스 · 아치 띠 · 뒤쪽 매스 · 상단 대형 전광판
    sblk(131, 86, 0, 16, F, 24, "darkwall")
    sblk(131, 86, 16, 23, F - 1.0, 8, "stone")
    L1 = seglen(131, 86); k = 0
    while k * 4.2 + 3.5 < L1 - 1:
        sblk(131, 86, 17, 22, F - 1.3, 0.3, "shopglass", k * 4.2 + 1.2, L1 - (k * 4.2 + 3.8)); k += 1
    sblk(131, 86, 23, 56, F + 6, 18, "darkwall")
    sblk(130, 88, 26, 50, F - 2.5, 3.0, "score_fr"); sblk(130, 88, 27, 49, F - 2.8, 0.3, "score", 1, 1)
    sblk(130, 88, 50, 51.5, F - 2.5, 9, "darkwall")
    sblk(93, 86, 9, 23, F - 4, 8, "stone"); sblk(93, 86, 11, 21, F - 4.3, 0.3, "shopglass", 1.2, 1.2)
    # ── 중앙~우익 (조감도 역산 위치 · 높이) ──
    def fins(b0, b1, z0, z1, f0, step, m="darkwall", w=0.35):
        Lf = seglen(b0, b1); kk = 0
        while kk * step < Lf - 0.3:
            sblk(b0, b1, z0, z1, f0 - 0.4, 0.4, m, kk * step, max(0.0, Lf - kk * step - w)); kk += 1
    def grid(b0, b1, z0, z1, f0, nx, zs=(), m="darkwall", w=0.3):
        """유리면 앞 멀리언: 세로 nx칸 + 주어진 높이의 가로 띠"""
        Lg = seglen(b0, b1)
        for kk in range(1, nx):
            t = Lg * kk / nx; sblk(b0, b1, z0, z1, f0 - 0.25, 0.25, m, t - w / 2, max(0.0, Lg - t - w / 2))
        for zz in (z0,) + tuple(zs) + (z1,):
            sblk(b0, b1, zz - w / 2, zz + w / 2, f0 - 0.25, 0.25, m)
    # 1층 오픈 콘코스 (뒤로 들어감) + 빛 기둥
    sblk(88, 45, 0, 9.6, 7, 22, "darkwall")
    for bb in (60, 57): sblk(bb + 0.4, bb, 0, 9.6, 6.5, 0.8, "suite")
    # 상가 띠 (왼쪽, emart) / Starfield 리본 띠 (오른쪽, 앞으로 돌출)
    sblk(86, 64, 6.5, 16, 4, 20, "stone"); sblk(85.5, 64.5, 7.5, 15, 3.7, 0.3, "shopglass"); grid(85.5, 64.5, 7.5, 15, 3.7, 10, (12.3,))
    # 왼쪽 아래 작은 큐브 (스타벅스 사인)
    sblk(89.5, 84, 6, 22.6, 0, 14, "stone"); sblk(89, 84.5, 8, 15, -0.3, 0.3, "shopglass"); grid(89, 84.5, 8, 15, -0.3, 4, (11.5,))
    # AQUAFIELD 흰 상부 박스 + 창 3개
    sblk(86, 67, 36, 56, 3, 22, "hotel_white")
    for a0, a1, nx in ((84.3, 80.8, 3), (79.8, 75.2, 4), (74.4, 68.2, 5)):
        sblk(a0, a1, 38.5, 49.5, 2.7, 0.3, "shopglass"); grid(a0, a1, 38.5, 49.5, 2.7, nx, (44.0,))
    sblk(86, 67, 16, 36, 6, 18, "darkwall")
    # 루버 박스 (세로핀, 앞으로 돌출)
    sblk(78.3, 63.5, 19, 36, 1.5, 8, "topglass"); fins(78.3, 63.5, 19, 36, 1.5, 1.2); grid(78.3, 63.5, 19, 36, 1.5, 1, (27.5,), w=0.6)
    # ── 사용자 지정 덩어리 (조감도 역산) ──
    # 갈색: 큰 유리 박스 (68~34°, 24~55 m, 뒤로 물러남)
    sblk(68, 39, 22, 46, 5, 18, "topglass"); grid(68, 39, 22, 46, 5, 13, (28.0, 34.0, 40.0), w=0.45)
    sblk(68, 39, 46, 47.5, 4.6, 19, "darkwall")
    # 녹색: 아래 상가 띠 (63.5~41°, 6~24 m) + 하단 Starfield 리본
    sblk(63.5, 42, 5, 21, 1.5, 20, "shopglass"); grid(63.5, 42, 5, 21, 1.5, 10, (11.0, 16.0), w=0.4)
    sblk(63.5, 42, 8.5, 11.0, 1.1, 0.4, "banner")
    # 분홍+빨강: 앞으로 돌출된 석재 박스 (55.5~35°, 16~42 m)
    sblk(56, 37.5, 14, 37, 0.5, 9, "stone")
    sblk(55.6, 45.5, 26, 34.5, 0.2, 0.3, "shopglass"); grid(55.6, 45.5, 26, 34.5, 0.2, 6, (30.3,))
    sblk(55.6, 45.5, 22.6, 25.2, 0.0, 0.3, "darkwall")
    sblk(55.6, 45.5, 17, 22.6, 0.2, 0.3, "shopglass"); grid(55.6, 45.5, 17, 22.6, 0.2, 6)
    sblk(43.5, 38.5, 22, 34, 0.2, 0.3, "adscreen")
    sblk(86, 68, 50, 53, 4, 22, "darkwall")
    def pblk(p0, p1, z0, z1, f0, depth, m, n=None):
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy); d = (dx / L, dy / L)
        if n is None:
            n = (d[1], -d[0]); mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            if n[0] * mid[0] + n[1] * mid[1] < 0: n = (-n[0], -n[1])
        f1 = f0 + depth
        q = [(p0[0] + n[0] * f0, p0[1] + n[1] * f0), (p1[0] + n[0] * f0, p1[1] + n[1] * f0), (p1[0] + n[0] * f1, p1[1] + n[1] * f1), (p0[0] + n[0] * f1, p0[1] + n[1] * f1)]
        for i in range(4):
            p, r_ = q[i], q[(i + 1) % 4]; fac.quad((p[0], p[1], z0), (r_[0], r_[1], z0), (r_[0], r_[1], z1), (p[0], p[1], z1), m)
        fac.face([(p[0], p[1], z1) for p in q], m); fac.face([(p[0], p[1], z0) for p in q[::-1]], m)
    # 우익: 석재 타워 앞면을 우익 관중석 끝면까지 연장해 맞붙임
    a62 = seg_pt(48); a55 = seg_pt(45); dd = (a55[0] - a62[0], a55[1] - a62[1])
    nr = normals(FOUL_PATH)[-1]
    SR = isect(PX, (nr[0], nr[1]), a62, dd)
    L3 = math.hypot(SR[0] - a62[0], SR[1] - a62[1]); u3 = ((SR[0] - a62[0]) / L3, (SR[1] - a62[1]) / L3)
    # 우익 상단 관중석 위로 걸친 박스 (WIN 스크린)
    fe = FOUL_PATH[-14]; fb = FOUL_PATH[-36]; _nm = normals(FOUL_PATH)[-25]; nw = (_nm[0], _nm[1])
    pblk(fb, fe, 46, 55, UP_OFF + 8, WALL_FOUL - UP_OFF - 6, "topglass", nw)   # 뒤쪽 바깥 벽까지 연결
    pblk(fb, fe, UP_TOP + 3, 46, UP_OFF + UP_ROWS * UP_DEPTH, WALL_FOUL - UP_OFF - UP_ROWS * UP_DEPTH + 2, "darkwall", nw)   # 아래 받침 매스
    pblk(fb, fe, 47.5, 53.5, UP_OFF + 7.7, 0.3, "adscreen", nw)
    # 좌·우 관중석 끝면을 따라 경기장 바깥 벽까지 이어지는 건물 덩어리
    def unit(v): L = math.hypot(v[0], v[1]); return (v[0] / L, v[1] / L)
    nl = normals(FOUL_PATH)[0]; dl = unit((FOUL_PATH[0][0] - FOUL_PATH[1][0], FOUL_PATH[0][1] - FOUL_PATH[1][1]))
    tS = (_S[0] - PL[0]) * nl[0] + (_S[1] - PL[1]) * nl[1]
    pA = (PL[0] + nl[0] * tS, PL[1] + nl[1] * tS); pB = (PL[0] + nl[0] * (WALL_FOUL + 2), PL[1] + nl[1] * (WALL_FOUL + 2))
    pblk(pA, pB, 0, HOTEL_TOP + 3, 0.0, 22, "darkwall", dl)                 # 호텔 뒤로 이어지는 매스
    pblk(pA, pB, HOTEL_TOP + 3, HOTEL_TOP + 6, 0.0, 22, "darkwall", dl)
    pblk(pA, pB, UP_TOP + 4, UP_TOP + 6.5, -0.4, 0.4, "banner", dl)          # 관중석 위 배너 띠
    pblk(pA, pB, UP_TOP + 7.5, HOTEL_TOP + 2, -0.3, 0.3, "topglass", dl)     # 상부 유리층
    nr2 = normals(FOUL_PATH)[-1]; dr = unit((FOUL_PATH[-1][0] - FOUL_PATH[-2][0], FOUL_PATH[-1][1] - FOUL_PATH[-2][1]))
    tR = (SR[0] - PX[0]) * nr2[0] + (SR[1] - PX[1]) * nr2[1]
    qA = (PR[0] + nr2[0] * tR, PR[1] + nr2[1] * tR); qB = (PR[0] + nr2[0] * (WALL_FOUL + 2), PR[1] + nr2[1] * (WALL_FOUL + 2))

    N = 120; rim = [ray_poly(j * 3) + wall_off(j * 3) for j in range(N)]
    w = O("DOME_wall")
    for j in range(N):
        k = (j + 1) % N; a = add(C, u(j * 3), rim[j]); b_ = add(C, u(k * 3), rim[k])
        for z0, z1, m in ((0, 48, "darkwall"), (48, 51, "banner"), (51, 57, "topglass"), (57, ROOF_RIM_Z, "darkwall")):
            w.quad((a[0], a[1], z0), (b_[0], b_[1], z0), (b_[0], b_[1], z1), (a[0], a[1], z1), m)
    rings = [1.0, .9, .8, .7, .6, .5, .4, .3, .2, .1]
    def rp(s_, j, off=0):
        p = add(C, u((j % N) * 3), s_ * rim[j % N]); return (p[0], p[1], ROOF_RIM_Z + ROOF_RISE * (1 - s_ * s_) + off)
    rf = O("ROOF_panels"); tr = O("ROOF_truss"); rl = O("ROOF_lights")
    for ki in range(len(rings) - 1):
        for j in range(N):
            m = "roofled" if rings[ki] <= 0.5 else "roof"
            rf.quad(rp(rings[ki], j, 2), rp(rings[ki], j + 1, 2), rp(rings[ki + 1], j + 1, 2), rp(rings[ki + 1], j, 2), m)
    top = (C[0], C[1], ROOF_RIM_Z + ROOF_RISE + 2)
    for j in range(N): rf.face([rp(rings[-1], j, 2), rp(rings[-1], j + 1, 2), top], "roofled")
    def beam(p, q, wdt=0.7):
        dx, dy, dz = q[0] - p[0], q[1] - p[1], q[2] - p[2]; L = math.sqrt(dx * dx + dy * dy + dz * dz)
        d = (dx / L, dy / L, dz / L); a = (d[1], -d[0], 0.0); la = math.hypot(a[0], a[1]) or 1; a = (a[0] / la, a[1] / la, 0)
        bb = (a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0])
        cs = [tuple(p[i] + (sa * a[i] + sb * bb[i]) * wdt / 2 for i in range(3)) for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        ce = [tuple(c_[i] + d[i] * L for i in range(3)) for c_ in cs]
        for i in range(4): tr.quad(cs[i], cs[(i + 1) % 4], ce[(i + 1) % 4], ce[i], "truss")
    for ki, s_ in enumerate(rings):
        for j in range(N):
            beam(rp(s_, j), rp(s_, j + 1), 0.9 if ki % 3 == 0 else 0.5)
            if ki + 1 < len(rings):
                beam(rp(s_, j), rp(rings[ki + 1], j), 0.6)
                if j % 2 == 0: beam(rp(s_, j), rp(rings[ki + 1], j + 1), 0.4)
                else: beam(rp(s_, j), rp(rings[ki + 1], j - 1), 0.4)
            beam(rp(s_, j), rp(s_, j, -2.5), 0.3)
    for s_ in (.62, .85):
        for j in range(0, N, 4):
            p = rp(s_, j, -1.2); rl.box(p[0], p[1], p[2], 7, 1.4, .5, "rooflight", math.radians(j * 3 + 90))

    # 호텔 (레퍼런스: 흰 그리드 입면 + 가운데 목재 발코니 스택)
    ho = O("HOTEL_and_POOL")
    def facet(fr, wood_left, room, pool):
        W = fr[3]; W2 = W / 2; D = HOTEL_D
        hb = lambda cx, cy, cz, sx, sy, sz, m: ho.box(cx, cy, cz, sx, sy, sz, m, 0, lambda p: HF(fr, p))
        hq = lambda a, b_, c_, d, m: ho.quad(HF(fr, a), HF(fr, b_), HF(fr, c_), HF(fr, d), m)
        hb(0, -D, (HOTEL_TOP + 3) / 2, W, .4, HOTEL_TOP + 3, "stone")
        for sx in (-W2, W2): hb(sx, -D / 2, (HOTEL_TOP + 3) / 2, .5, D + .6, HOTEL_TOP + 3, "hotel_white")   # 옆벽
        hb(0, -D / 2, HOTEL_Z0 / 2, W, D, HOTEL_Z0, "darkwall")
        hb(0, -D / 2, HOTEL_TOP + .3, W + .5, D, .6, "hotel_white")
        hb(0, -D / 2 - 2, HOTEL_TOP + 2.5, W * .6, D * .6, 4, "hotel_white")      # 옥상 기계실 박스
        for n in range(HOTEL_FLOORS + 1):
            z = HOTEL_Z0 + n * FLOOR_H
            hb(0, -D / 2, z - .15, W, D, .3, "slab"); hb(0, .25, z, W + .5, .5, .5, "hotel_white")
            if n < HOTEL_FLOORS:
                hq((-W2, -5.5, z), (W2, -5.5, z), (W2, -5.5, z + FLOOR_H - .3), (-W2, -5.5, z + FLOOR_H - .3), "room")
                if wood_left: hb(-W2 + 1.5, 1.4, z + .1, 6, 2.8, .35, "wood"); hb(-W2 + 1.5, 2.75, z + .6, 6, .08, 1.0, "glass")
        if wood_left: hb(-W2 + 1.5, -.5, (HOTEL_Z0 + HOTEL_TOP) / 2 + 2, 3.0, 2.0, HOTEL_TOP - HOTEL_Z0 + 4, "wood")
        hq((-W2, 0, HOTEL_Z0), (W2, 0, HOTEL_Z0), (W2, 0, HOTEL_TOP), (-W2, 0, HOTEL_TOP), "glass")
        x = -W2 + (FIN if wood_left else 0)
        while x <= W2 + 1e-6:
            hb(x, .3, (HOTEL_Z0 + HOTEL_TOP) / 2, .3, .6, HOTEL_TOP - HOTEL_Z0, "hotel_white"); x += FIN
        if room:
            fz = HOTEL_Z0 + FLOOR_H * ROOM_FLOOR; rx = room_x(fr)
            for sx in (-1.8, 1.8): hb(rx + sx, -3.0, fz + FLOOR_H / 2, .15, 6.0, FLOOR_H, "room_wall")
            hb(rx - .86, -.30, fz + (FLOOR_H - .3) / 2, .25, .20, FLOOR_H - .3, "curtain")
            hb(rx + 1.08, -.30, fz + .475, .8, .4, .95, "fabric")
        if pool:
            T = HOTEL_TOP + .6; WL = T + .88; x0, x1, y0, y1 = -W2 + 1, W2 - 1, -9.0, 1.5
            hb((x0 + x1) / 2, (y0 + y1) / 2 + .4, T - .1, x1 - x0 + 2, y1 - y0 + 3, .2, "deck")
            hb((x0 + x1) / 2, y0 - .15, T + .5, x1 - x0 + .6, .3, 1.0, "pool_tile")
            for xx in (x0 - .15, x1 + .15): hb(xx, (y0 + y1) / 2, T + .5, .3, y1 - y0, 1.0, "pool_tile")
            hb((x0 + x1) / 2, y1 + .05, T + .44, x1 - x0, .1, .88, "pool_tile")
            hb((x0 + x1) / 2, y1 + .45, T + .2, x1 - x0 + .6, .7, .4, "pool_tile")
            hb((x0 + x1) / 2, (y0 + y1) / 2, T + .05, x1 - x0, y1 - y0, .1, "pool_tile")
            hq((x0, y0, WL), (x1, y0, WL), (x1, y1, WL), (x0, y1, WL), "water")
    facet(FR_A, True, True, False)
    facet(FR_B, False, False, True)

    cv = O("CONCERT_ground_cover", "concert")
    for a, b_ in zip(FIELD, FIELD[1:] + FIELD[:1]): cv.face([(cen[0], cen[1], .08), (a[0], a[1], .08), (b_[0], b_[1], .08)], "cover")
    st = O("CONCERT_stage", "concert")
    st.box(0, (STAGE_Y0 + STAGE_Y1) / 2, STAGE_H / 2 - .05, STAGE_HW * 2, STAGE_Y1 - STAGE_Y0, STAGE_H - .1, "stage")
    st.box(0, (STAGE_Y0 + STAGE_Y1) / 2, STAGE_H - .05, STAGE_HW * 2 - .2, STAGE_Y1 - STAGE_Y0 - .2, .1, "stage_top")
    st.box(0, STAGE_Y1 + 1.5, (LED_Z1 + 2) / 2, LED_W + 4, 2.5, LED_Z1 + 2, "stage")
    if THRUST:
        st.box(0, (THRUST_Y0 + STAGE_Y0) / 2, STAGE_H / 2, THRUST_HW * 2, STAGE_Y0 - THRUST_Y0, STAGE_H, "stage_top")
        ex, ey, er = THRUST_END; st.box(ex, ey, STAGE_H / 2, er * 2, er * 2, STAGE_H, "stage_top")
    for xx in (-STAGE_HW + 1, STAGE_HW - 1):
        for yy in (STAGE_Y0 + .5, STAGE_Y1 - .5): st.box(xx, yy, 12, .8, .8, 24, "stage_truss")
    for yy in (STAGE_Y0 + .5, STAGE_Y0 + 6, STAGE_Y1 - .5): st.box(0, yy, 24, STAGE_HW * 2, .8, .8, "stage_truss")
    for xx in (-STAGE_HW + 1, 0, STAGE_HW - 1): st.box(xx, (STAGE_Y0 + STAGE_Y1) / 2, 24, .8, STAGE_Y1 - STAGE_Y0, .8, "stage_truss")
    ld = O("CONCERT_LED_idol_closeup", "concert"); y = STAGE_Y1 + .2; L2 = LED_W / 2
    ld.quad((-L2, y, LED_Z0), (L2, y, LED_Z0), (L2, y, LED_Z1), (-L2, y, LED_Z1), "led")
    ld.quad((-L2 - 13, y - 4, 4), (-L2 - 3, y - 1, 4), (-L2 - 3, y - 1, 16), (-L2 - 13, y - 4, 16), "led")
    ld.quad((L2 + 3, y - 1, 4), (L2 + 13, y - 4, 4), (L2 + 13, y - 4, 16), (L2 + 3, y - 1, 16), "led")
    pf = O("CONCERT_performers", "concert")
    for xx, yy in [(0, 102), (-4, 104), (4, 104), (-8, 106), (8, 106)]:
        pf.box(xx, yy, STAGE_H + .8, .45, .3, 1.6, "performer"); pf.box(xx, yy, STAGE_H + 1.78, .26, .26, .28, "performer")
        pf.box(xx, yy - .15, STAGE_H + 1.78, .05, .08, .05, "performer")
    ch = O("CONCERT_floor_seats", "concert")
    for x0_, x1_ in [(-46, -27), (-25, -4.5), (4.5, 25), (27, 46)]:
        for y0_, y1_ in [(-13, 2), (4, 28), (30, 54), (56, 94)]:
            yy = y0_
            while yy <= y1_:
                xx = x0_
                while xx <= x1_:
                    if point_in_poly(xx, yy) and dist_edge(xx, yy) > 3 and not (THRUST and abs(xx) < THRUST_END[2] + 1.5 and yy > THRUST_END[1] - THRUST_END[2] - 1.5) and not (yy > STAGE_Y0 - 2.5):
                        ch.box(xx, yy, .3, .46, .42, .48, "chair"); ch.box(xx, yy - .2, .7, .46, .05, .4, "chair")
                    xx += .52
                yy += .9
    return GEO

# ───────── 블렌더 ─────────
def bl_material(name):
    col, rough, metal, ek, ec, alpha = MATS[name]
    m = bpy.data.materials.new(name)
    if hasattr(m, "use_nodes"):
        try: m.use_nodes = True
        except Exception: pass
    nt = m.node_tree
    if name == "led":
        nt.nodes.clear(); out = nt.nodes.new("ShaderNodeOutputMaterial")
        em = nt.nodes.new("ShaderNodeEmission"); em.name = "EMIT"
        tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1.5 / (LED_W / 2), 0, 0.75 / ((LED_Z1 - LED_Z0) / 2))
        mp.inputs["Location"].default_value = (0, 0, -0.75 / ((LED_Z1 - LED_Z0) / 2) * (LED_Z0 + LED_Z1) / 2)
        gr = nt.nodes.new("ShaderNodeTexGradient"); gr.gradient_type = "SPHERICAL"
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.10, 0.03, 0.14, 1); ramp.color_ramp.elements[1].position = 0.55
        ramp.color_ramp.elements[1].color = (0.95, 0.70, 0.62, 1)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], gr.inputs["Vector"])
        nt.links.new(gr.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"]); return m
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*col, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if ek:
        e = b.inputs.get("Emission Color") or b.inputs.get("Emission"); e.default_value = (*ec, 1)
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        if hasattr(m, "surface_render_method"): m.surface_render_method = "DITHERED"
        elif hasattr(m, "blend_method"): m.blend_method = "HASHED"
    m.diffuse_color = (*col, 1)
    return m

def set_state(state):
    s = STATE[state]
    for c, on in (("BASEBALL", state == "baseball"), ("CONCERT", state == "concert")):
        bpy.data.collections[c].hide_render = not on; bpy.data.collections[c].hide_viewport = not on
    bpy.data.lights["HOUSE_sun"].energy = s["sun"]
    bpy.context.scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = s["world"]
    bpy.context.scene.view_settings.exposure = s["exposure"]
    for name, v in MATS.items():
        ek = v[3]
        if not ek: continue
        m = bpy.data.materials.get(name)
        if not m: continue
        if name == "led": m.node_tree.nodes["EMIT"].inputs["Strength"].default_value = s["led"]
        else: m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = s[ek]

def bl_build(mode):
    if bpy.app.background: bpy.ops.wm.read_factory_settings(use_empty=True)
    else:
        for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
        for c in list(bpy.data.collections): bpy.data.collections.remove(c)
        for cl in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.worlds):
            for d in list(cl): cl.remove(d)
    sc = bpy.context.scene
    cols = {}
    for n in ("COMMON", "BASEBALL", "CONCERT", "CAMERAS", "LIGHTS"):
        cols[n] = bpy.data.collections.new(n); sc.collection.children.link(cols[n])
    mats = {n: bl_material(n) for n in MATS}
    build()
    for ob in GEO.values():
        me = bpy.data.meshes.new(ob.name); me.from_pydata(ob.V, [], ob.F)
        names = sorted(set(ob.FM)); idx = {n: i for i, n in enumerate(names)}
        for n in names: me.materials.append(mats[n])
        me.polygons.foreach_set("material_index", [idx[n] for n in ob.FM]); me.update()
        o = bpy.data.objects.new(ob.name, me)
        cols["BASEBALL" if ob.group == "baseball" else "CONCERT" if ob.group == "concert" else "COMMON"].objects.link(o)
    for i, (pos, tgt, en, ang, colr) in enumerate(SPOTS):
        l = bpy.data.lights.new(f"LT_concert_{i:02d}", "SPOT"); l.energy = en; l.color = colr
        l.spot_size = math.radians(ang); l.spot_blend = 0.4
        o = bpy.data.objects.new(l.name, l); cols["CONCERT"].objects.link(o); o.location = pos
        o.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat("-Z", "Y").to_euler()
    l = bpy.data.lights.new("HOUSE_sun", "SUN"); l.use_shadow = False; l.angle = math.radians(30)
    o = bpy.data.objects.new("HOUSE_sun", l); cols["LIGHTS"].objects.link(o); o.rotation_euler = (math.radians(20), 0, math.radians(35))
    w = bpy.data.worlds.new("World")
    try: w.use_nodes = True
    except Exception: pass
    sc.world = w; w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.57, 0.6, 1)
    for name, loc, yaw, pitch, lens in cameras():
        cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_fit = "HORIZONTAL"; cd.sensor_width = 36; cd.clip_start = .05; cd.clip_end = 2000
        o = bpy.data.objects.new(name, cd); cols["CAMERAS"].objects.link(o); o.location = loc
        d = Vector((math.cos(math.radians(pitch)) * math.cos(math.radians(yaw)), math.cos(math.radians(pitch)) * math.sin(math.radians(yaw)), math.sin(math.radians(pitch))))
        o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try: sc.render.engine = eng; break
        except TypeError: pass
    sc.render.resolution_x, sc.render.resolution_y = (3840, 2160) if mode == "final" else (1920, 1080)
    sc.render.resolution_percentage = 100; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGB"
    ee = sc.eevee
    if hasattr(ee, "taa_render_samples"): ee.taa_render_samples = 128 if mode == "final" else 48
    if hasattr(ee, "use_raytracing"): ee.use_raytracing = True
    try: sc.view_settings.view_transform = "AgX"
    except TypeError: pass
    set_state("baseball"); sc.camera = bpy.data.objects["CAM_01_HOME"]

# ===== 블렌더 화면에서 실행할 때 설정 =====
GUI_MODE = "preview"       # "preview" / "final"
GUI_ONLY = None
GUI_OUT = os.path.join(os.path.expanduser("~"), "Documents", "cheongna_out")

def bl_main():
    os.makedirs(GUI_OUT, exist_ok=True)
    blend = os.path.join(GUI_OUT, "starfield_cheongna_base.blend")
    bl_build(GUI_MODE); bpy.ops.wm.save_as_mainfile(filepath=blend)
    shots = [s for s in SHOTS if not GUI_ONLY or any(s[0].endswith(w.strip()) for w in GUI_ONLY.split(","))]
    sc = bpy.context.scene; suf = "_4K" if GUI_MODE == "final" else "_preview"
    for fname, cam, state in shots:
        set_state(state); sc.camera = bpy.data.objects[cam]
        sc.render.filepath = os.path.join(GUI_OUT, fname + suf + ".png"); bpy.ops.render.render(write_still=True)
    set_state("baseball"); sc.camera = bpy.data.objects["CAM_01_HOME"]; bpy.ops.wm.save_mainfile()

if bpy is not None and __name__ == "__main__":
    bl_main()
