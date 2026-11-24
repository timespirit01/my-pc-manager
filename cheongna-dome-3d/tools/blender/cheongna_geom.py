# -*- coding: utf-8 -*-
"""스타필드 청라 멀티스타디움(청라돔) 형상 — 순수 파이썬 (bpy 없이도 실행됨).

좌표: 홈플레이트 = 원점, +Y = 중견, +Z = 위, 단위 m (Blender 좌표와 같음).
이 파일이 형상의 원천이다. build_blend.py 가 이 결과로 .blend / glb / seats 를 만든다.

치수 근거 표기
  [공식]   신세계·인천시 발표
  [보도]   언론 보도
  [역산]   2026.03.24 내부 조감도에서 카메라를 역산해 잰 값 (오차 ±3 m 안팎)
  [가정]   공개 자료가 없어 일반적인 야구장 치수로 둔 값
"""
import math

S2 = math.sqrt(2.0)

# ───────── 제원 ─────────
SPEC = dict(
    seats_official=23000,      # [공식] 2025.07 / 2026.03 신세계 발표 (인허가 자료는 21,000)
    line=95.0,                 # [역산] 좌·우 폴까지 93~95 m. 현 랜더스필드(95 m)와 같다고 가정
    center=120.0,              # [역산] 중견 117~124 m. 현 랜더스필드(120 m)와 같다고 가정
    alley=110.0, alley_deg=24.0,   # [역산] 좌·우중간 꺾임점: 중견에서 ±24°, 약 110 m
    fence_h=3.6,               # [역산] 외야 펜스 높이 3~4 m
    base=27.432, mound=18.44,  # 규격
    backstop=16.5,             # [역산] 홈~백스톱·내야 쪽 벽 (더그아웃 앞 13~14 m + 더그아웃 깊이)
    roof_top=60.0,             # [보도] "높이 약 60 m 지붕 구조물" (기준면 불명 → 그라운드 기준으로 가정)
    board=(100.0, 16.5),       # [보도] 2023 보도 100×16.5 m. 2026 조감도에서는 약 100×21 m 로 보임
)

def u(deg):
    r = math.radians(deg); return (math.cos(r), math.sin(r))
def pol(deg, r):
    c = u(deg); return (c[0] * r, c[1] * r)
def add(a, b, s=1.0): return (a[0] + b[0] * s, a[1] + b[1] * s)
def sub(a, b): return (a[0] - b[0], a[1] - b[1])
def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))
def hyp(a, b=(0, 0)): return math.hypot(a[0] - b[0], a[1] - b[1])
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

LINE, CFD = SPEC['line'], SPEC['center']
A_B = SPEC['alley_deg']
# 외야 펜스 꺾임점 (우익 폴 → 좌익 폴, 반시계)
FENCE = [pol(45, LINE), pol(90 - A_B, SPEC['alley']), pol(90, CFD), pol(90 + A_B, SPEC['alley']), pol(135, LINE)]
BACK = SPEC['backstop']

# 내야 쪽 벽: 파울라인에서 벽까지 거리 (홈에서 파울라인을 따라 a m 지점)  [역산]
WALL_A = [(0, BACK), (34, BACK), (68, 2.2), (LINE, 1.0)]
def wall_off(a):
    for (a0, w0), (a1, w1) in zip(WALL_A, WALL_A[1:]):
        if a <= a1: return w0 + (w1 - w0) * (a - a0) / (a1 - a0)
    return WALL_A[-1][1]
def on3(a, d): return add(pol(135, a), u(225), d)       # 3루 파울라인 a m 지점에서 바깥으로 d
def on1(a, d): return add(pol(45, a), u(315), d)        # 1루 쪽


class Path:
    """반시계 방향 경로. 바깥쪽 = 진행 방향의 오른쪽. at(s, d) = 경로 s m 지점에서 바깥으로 d m."""
    def __init__(self, pts, step=1.0):
        P = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            L = hyp(a, b); n = max(1, int(math.ceil(L / step)))
            for k in range(1, n + 1): P.append(lerp(a, b, k / n))
        self.p = P; self.s = [0.0]
        for a, b in zip(P, P[1:]): self.s.append(self.s[-1] + hyp(a, b))
        self.len = self.s[-1]; self.n = []
        for i in range(len(P)):
            nn = []
            if i > 0:
                dx, dy = sub(P[i], P[i - 1]); L = math.hypot(dx, dy); nn.append((dy / L, -dx / L))
            if i < len(P) - 1:
                dx, dy = sub(P[i + 1], P[i]); L = math.hypot(dx, dy); nn.append((dy / L, -dx / L))
            nx = sum(v[0] for v in nn); ny = sum(v[1] for v in nn); L = math.hypot(nx, ny)
            nx, ny = nx / L, ny / L; c = nx * nn[0][0] + ny * nn[0][1]
            self.n.append((nx, ny, 1.0 / max(c, 0.5)))

    def idx(self, s):
        s = max(0.0, min(self.len, s)); lo, hi = 0, len(self.s) - 2
        while lo < hi:
            m = (lo + hi + 1) // 2
            if self.s[m] <= s: lo = m
            else: hi = m - 1
        seg = self.s[lo + 1] - self.s[lo]
        return lo, (s - self.s[lo]) / seg if seg > 0 else 0.0

    def q(self, i, d):
        p, n = self.p[i], self.n[i]; return (p[0] + n[0] * n[2] * d, p[1] + n[1] * n[2] * d)

    def at(self, s, d=0.0):
        i, t = self.idx(s); return lerp(self.q(i, d), self.q(i + 1, d), t)

    def normal(self, s):
        i, t = self.idx(s); a, b = self.n[i], self.n[i + 1]
        nx, ny = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t; L = math.hypot(nx, ny); return (nx / L, ny / L)

    def stations(self, s0, s1):
        """[s0, s1] 구간의 표본 지점들 (양 끝 포함)"""
        out = [s0] + [v for v in self.s if s0 + 1e-6 < v < s1 - 1e-6] + [s1]; return out

    def nearest_s(self, pt):
        best = (1e18, 0.0)
        for i in range(len(self.p) - 1):
            a, b = self.p[i], self.p[i + 1]; ex, ey = sub(b, a); L2 = ex * ex + ey * ey
            t = max(0.0, min(1.0, ((pt[0] - a[0]) * ex + (pt[1] - a[1]) * ey) / L2))
            d = hyp(pt, lerp(a, b, t))
            if d < best[0]: best = (d, self.s[i] + (self.s[i + 1] - self.s[i]) * t)
        return best[1]


    def offset_of(self, pt):
        """점이 경로에서 바깥쪽으로 얼마나 떨어져 있는지 (안쪽이면 음수)"""
        best = (1e18, 0.0)
        for i in range(len(self.p) - 1):
            a, b = self.p[i], self.p[i + 1]; ex, ey = sub(b, a); L2 = ex * ex + ey * ey
            t = max(0.0, min(1.0, ((pt[0] - a[0]) * ex + (pt[1] - a[1]) * ey) / L2))
            c = lerp(a, b, t); d = hyp(pt, c)
            if d < best[0]:
                L = math.sqrt(L2); best = (d, (pt[0] - c[0]) * ey / L - (pt[1] - c[1]) * ex / L)
        return best[1]


def arc(c, r, a0, a1, step_deg=2.0):
    n = max(1, int(round(abs(a1 - a0) / step_deg)))
    return [add(c, u(a0 + (a1 - a0) * k / n), r) for k in range(n + 1)]

def fillet(a, p, c, R, n=10):
    """꺾인 점 p 를 반지름 R 의 호로 둥글린다. 안쪽으로 꺾인 모서리에서 바깥 열들이 서로 겹치지 않게 하려면 R 이 가장 먼 열보다 커야 한다"""
    d1 = sub(p, a); l1 = math.hypot(*d1); d1 = (d1[0] / l1, d1[1] / l1)
    d2 = sub(c, p); l2 = math.hypot(*d2); d2 = (d2[0] / l2, d2[1] / l2)
    th = math.acos(max(-1.0, min(1.0, d1[0] * d2[0] + d1[1] * d2[1]))); t = min(R * math.tan(th / 2), l1 * 0.9, l2 * 0.9)
    A = add(p, d1, -t); B = add(p, d2, t); out = []
    for k in range(n + 1):                                   # 2차 베지에 (호에 가까움)
        u_ = k / n; q = lerp(lerp(A, p, u_), lerp(p, B, u_), u_); out.append(q)
    return out

# 경로 A: 내야 쪽 벽 (좌익 폴 → 포수 뒤 → 우익 폴). 68 m 지점의 안쪽 꺾임은 크게 둥글림
_w3 = [on3(a, wall_off(a)) for a in (LINE, 68, 34)]; _w1 = [on1(a, wall_off(a)) for a in (34, 68, LINE)]
PATH_A = Path([_w3[0]] + fillet(_w3[0], _w3[1], _w3[2], 60.0) + arc((0, 0), BACK, 225, 315)
              + fillet(_w1[0], _w1[1], _w1[2], 60.0) + [_w1[2]])
SA_HOME = PATH_A.nearest_s((0, -BACK))

# 경로 B: 2·3층이 따르는 8각 평면 (파울라인과 평행 → 폴 부근에서 45° 꺾여 동·서쪽 벽과 평행)  [역산]
D_B = 35.0            # 3층 앞 난간(검은 띠 전광판)의 파울라인 기준 거리
B_KINK = 71.8         # 꺾이는 지점 (파울라인을 따라) → 동·서쪽 구간 x = ±75.5
B_NORTH = 62.0        # 동·서쪽 구간이 끝나는 y (그 뒤는 외야 건물)
B_WEST = LINE + 2.0   # 3루 쪽은 꺾이지 않고 좌익 폴 뒤 호텔 입면까지 곧게 이어진다  [역산]
_ke = on1(B_KINK, D_B)
PATH_B = Path([on3(B_WEST, D_B)] + arc((0, 0), D_B, 225, 315) + [_ke, (_ke[0], B_NORTH)])
SB_HOME = PATH_B.nearest_s((0, -D_B)); SB_KE = PATH_B.nearest_s(_ke)

def fence_pt(b):
    """홈에서 방위 b° 로 쏜 선이 외야 펜스와 만나는 점"""
    d = u(b)
    for a, c in zip(FENCE, FENCE[1:]):
        e = sub(c, a); den = d[0] * e[1] - d[1] * e[0]
        if abs(den) < 1e-9: continue
        t = (a[0] * e[1] - a[1] * e[0]) / den; s = (a[0] * d[1] - a[1] * d[0]) / den
        if t > 0 and -1e-6 <= s <= 1 + 1e-6: return (d[0] * t, d[1] * t)
    return pol(b, LINE)

# 경로 F: 좌익~중견 외야 펜스 (우중간 방위 77.5° → 중견 → 좌익 폴). 전광판이 중견을 조금 넘어 우중간까지 이어진다
PATH_F = Path([fence_pt(77.5), FENCE[2], FENCE[3], FENCE[4]])
SF_CF = PATH_F.nearest_s(FENCE[2]); SF_K1 = PATH_F.nearest_s(FENCE[3])
# 경로 G: 중견~우익 외야 펜스 (우익 폴 → 중견) — 테라스·건물 배치용
PATH_G = Path([FENCE[0], FENCE[1], FENCE[2]])
PATHS = dict(A=PATH_A, B=PATH_B, F=PATH_F, G=PATH_G)


# ───────── 관람석 층 (tier) ─────────
# d0: 경로에서 첫 열 앞 단까지, z0: 첫 열 바닥 높이, rows: 열 수, depth: 열 깊이,
# rise: (첫 열, 마지막 열) 단 높이 — 뒤로 갈수록 가팔라짐, cross: {열번호: 통로폭} 그 열 뒤에 가로 통로
def _a(side, a):        # 파울라인 a m 지점에 해당하는 경로 A 의 s
    return PATH_A.nearest_s(on3(a, wall_off(a)) if side == 3 else on1(a, wall_off(a)))
def _b(side, a):
    return PATH_B.nearest_s(on3(a, D_B) if side == 3 else on1(a, D_B))

L1_ROWS, L1_D0, L1_Z0, L1_DEPTH = 23, 0.9, 0.9, 0.85
L1_TOP_D = L1_D0 + L1_ROWS * L1_DEPTH                 # 벽에서 1층 맨 뒤까지
CONC_Z = 11.3                                          # 1층 뒤 콘코스 바닥
C2_D, C2_Z = 2.0, 14.7                                 # 2층(클럽) 앞: 경로 B 에서 +2 m (파울라인 기준 37 m), 바닥 14.7 m  [역산: 붉은 LED 띠 중심 14.1 m]
U3_Z = 22.0                                            # 3층 첫 열 바닥  [역산: 검은 띠 전광판 중심 21.6 m]
HOTEL_S = _b(3, 43.0)                                  # 3루 쪽 3층이 끝나는 곳 (호텔 자리)  [역산]

TIERS = [
    dict(id='L1', floor=1, zone='내야', path='A', s0=0.0, s1=PATH_A.len, d0=L1_D0, z0=L1_Z0, rows=L1_ROWS, depth=L1_DEPTH,
         rise=(0.34, 0.56), sec=11.5, first=101, parapet=0.3),
    # 1층 상단 확장: 벽이 파울라인 쪽으로 좁아지는 구간에서 1층 뒤와 2층 사이를 메우는 완만한 단 (3루 쪽 조감도의 붉은 테라스 자리)
    dict(id='L1X', floor=1, zone='내야', path='A', s0=0.0, s1=PATH_A.len, d0=L1_TOP_D + 1.6, z0=CONC_Z + 0.5, rows=8, depth=0.9,
         rise=(0.30, 0.30), sec=11.5, first=101, parapet=0.0, clipB=C2_D - 1.2),
    dict(id='C2', floor=2, zone='내야', path='B', s0=_b(3, 74.0), s1=PATH_B.len - 4.0, d0=C2_D + 0.7, z0=C2_Z, rows=4, depth=0.9,
         rise=(0.42, 0.46), sec=12.5, first=201, parapet=0.3),
    dict(id='U3', floor=3, zone='내야', path='B', s0=HOTEL_S, s1=PATH_B.len - 2.0, d0=0.9, z0=U3_Z, rows=19, depth=0.85,
         rise=(0.54, 0.66), cross={8: 1.4}, crossup=0.5, sec=12.0, first=301, parapet=0.3),
    dict(id='OF1', floor=1, zone='외야', path='F', s0=SF_CF + 11.0, s1=PATH_F.len - 1.5, d0=1.0, z0=SPEC['fence_h'] + 0.5, rows=10, depth=0.85,
         rise=(0.42, 0.50), sec=12.0, first=141, parapet=0.9),
    dict(id='OF2', floor=2, zone='외야', path='F', s0=SF_CF + 11.0, s1=PATH_F.len - 1.5, d0=13.0, z0=10.8, rows=8, depth=0.85,
         rise=(0.50, 0.56), sec=12.0, first=241, parapet=0.3),
]
TIER = {t['id']: t for t in TIERS}

def row_d(t, r):
    """열 r(0부터)의 앞 단 위치(경로 기준 거리)와 바닥 높이"""
    d, z = t['d0'], t['z0']; r0, r1 = t['rise']; n = t['rows']
    for k in range(r):
        cw = t.get('cross', {}).get(k + 1, 0.0)
        d += t['depth'] + cw
        z += r0 + (r1 - r0) * (k / max(1, n - 1)) + (t.get('crossup', 0.0) if cw else 0.0)     # 가로 통로 뒤 열은 한 단 더 올림
    return d, z
def tier_back(t):
    d, z = row_d(t, t['rows']); return d, z
def rows_at(t, s):
    """경로 s 지점에서 이 층에 놓을 수 있는 열 수 (clipB 가 있는 층은 2층 난간선에서 잘림)"""
    if 'clipB' not in t: return t['rows']
    P = PATHS[t['path']]; n = 0
    for r in range(t['rows']):
        d, _ = row_d(t, r)
        if PATH_B.offset_of(P.at(s, d + t['depth'])) > t['clipB'] + 0.6: break
        n = r + 1
    return n


# ───────── 구역 · 좌석 ─────────
SEAT_W = {'L1': 0.52, 'L1X': 0.52, 'C2': 0.56, 'U3': 0.50, 'OF1': 0.50, 'OF2': 0.50}
AISLE = 1.2
GRADES = {
    'FD': dict(name='1층 필드석', color='#d4a93c', note='그라운드와 가장 가까운 앞 8열'),
    'L1': dict(name='1층 내야석', color='#b23a48'),
    'TR': dict(name='1층 테라스석', color='#8e44ad', note='1층 뒤 완만한 상단 구역'),
    'CL': dict(name='2층 클럽석', color='#e2733a', note='스위트 앞 클럽 좌석'),
    'U3': dict(name='3층 내야석', color='#2f73c0'),
    'UT': dict(name='3층 상단석', color='#2f9e8f', note='가로 통로 위쪽'),
    'OF': dict(name='외야석', color='#5f9a3a'),
}
FIELD_ROWS = 8          # 1층 앞 8열은 필드석으로 나눔 (등급 구분은 가정)

def side_name(p):
    b = math.degrees(math.atan2(p[1], p[0]))
    if p[1] < 0 and abs(p[0]) < 28: return '중앙(포수 뒤)'
    if 60 <= b <= 120 and p[1] > 60: return '중견'
    if p[1] > 62: return '좌익' if p[0] < 0 else '우익'
    return '3루측' if p[0] < 0 else '1루측'

def build_sections():
    """→ [{id, tier, floor, zone, grade, side, s0, s1, rows:[{row, z, seats:[(x,y,yaw)]}]}]
    구역 번호는 공개된 배치도가 없어 임의로 붙였다 (1루 쪽 끝 → 포수 뒤 → 3루 쪽 순)."""
    out = []
    for t in TIERS:
        P = PATHS[t['path']]; L = t['s1'] - t['s0']; n = max(1, int(round(L / t['sec']))); w = L / n
        splits = [(None, 0, t['rows'])]
        if t['id'] == 'L1': splits = [('FD', 0, FIELD_ROWS), ('L1', FIELD_ROWS, t['rows'])]
        if t['id'] == 'U3': splits = [('U3', 0, 8), ('UT', 8, t['rows'])]
        for gi, (grade, ra, rb) in enumerate(splits):
            for k in range(n):
                sa, sb = t['s0'] + k * w, t['s0'] + (k + 1) * w
                num = t['first'] + (n - 1 - k)                       # 1루(경로 끝) 쪽이 작은 번호
                sid = str(num) if gi == 0 or t['id'] not in ('L1', 'U3') else str(num)
                if t['id'] == 'L1': sid = ('F' if grade == 'FD' else '') + str(num)
                if t['id'] == 'L1X': sid = 'T' + str(num)
                if t['id'] == 'U3' and grade == 'UT': sid = str(num + 100)
                g = grade or {'C2': 'CL', 'OF1': 'OF', 'OF2': 'OF', 'L1X': 'TR'}[t['id']]
                rows = []
                for r in range(ra, rb):
                    d, z = row_d(t, r); dd = d + t['depth'] * 0.62               # 좌석 중심: 단의 뒤쪽
                    st = [s for s in P.stations(sa, sb)]
                    line = [P.at(s, dd) for s in st]
                    cum = [0.0]
                    for a, b in zip(line, line[1:]): cum.append(cum[-1] + hyp(a, b))
                    tot = cum[-1]; sw = SEAT_W[t['id']]; m = int((tot - AISLE) / sw)
                    if m < 2: continue
                    off = (tot - m * sw) / 2 + sw / 2; seats = []; j = 0
                    for i in range(m):
                        x = off + i * sw
                        while j < len(cum) - 2 and cum[j + 1] < x: j += 1
                        tt = (x - cum[j]) / (cum[j + 1] - cum[j]) if cum[j + 1] > cum[j] else 0
                        p = lerp(line[j], line[j + 1], tt); nx, ny = P.normal(st[j] + (st[j + 1] - st[j]) * tt)
                        if 'clipB' in t and PATH_B.offset_of(p) > t['clipB']: continue      # 2층 난간선 밖은 좌석 없음
                        seats.append((p[0], p[1], math.atan2(-ny, -nx)))     # yaw: 그라운드 쪽을 향함
                    if len(seats) < 3: continue
                    seats.reverse()                                          # 번호는 관중 기준 왼쪽 → 오른쪽으로 감소 (1번이 오른쪽 끝)
                    rows.append(dict(row=r - ra + 1, z=z, seats=seats))
                if not rows: continue
                mid = P.at((sa + sb) / 2, row_d(t, (ra + rb) // 2)[0])
                out.append(dict(id=sid, tier=t['id'], floor=t['floor'], zone=t['zone'], grade=g, side=side_name(mid),
                                s0=sa, s1=sb, r0=ra, r1=rb, rows=rows, order=(t['floor'], t['id'], gi, -k)))
    out.sort(key=lambda s: s['order'])
    return out


if __name__ == '__main__':
    S = build_sections(); tot = 0; by = {}
    for s in S:
        n = sum(len(r['seats']) for r in s['rows']); tot += n; by[s['tier']] = by.get(s['tier'], 0) + n
    print('sections', len(S), 'seats', tot, by)
    print('path A', round(PATH_A.len, 1), 'B', round(PATH_B.len, 1), 'F', round(PATH_F.len, 1))
    for t in TIERS: print(t['id'], 'back d,z', [round(v, 2) for v in tier_back(t)])
