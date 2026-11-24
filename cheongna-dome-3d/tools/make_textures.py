# -*- coding: utf-8 -*-
"""그라운드·전광판 텍스처를 만든다 (Blender 렌더와 웹이 같은 그림을 씀).

  python tools/make_textures.py [assets 폴더]
    → field.jpg (4096×3520, 그라운드 184×158 m), board.jpg (전광판, 가상 내용)
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blender'))
import cheongna_geom as G
import cheongna_mesh as M

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
X0, Y0, X1, Y1 = M.FIELD_BOX
W = 4096; K = W / (X1 - X0); H = int(round((Y1 - Y0) * K))
px = lambda p: ((p[0] - X0) * K, (Y1 - p[1]) * K)             # 위쪽이 중견 (glTF·Blender UV 는 따로 맞춤)

GRASS_A, GRASS_B = (52, 104, 44), (60, 116, 50)
DIRT, TRACK, LINE = (150, 104, 70), (142, 96, 64), (236, 236, 230)


def inset(poly, d):
    """반시계 다각형을 안쪽으로 d 만큼 줄인다 (꼭짓점 마이터)"""
    n = len(poly); out = []
    for i in range(n):
        a, b, c = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (b[0] - a[0], b[1] - a[1]); e2 = (c[0] - b[0], c[1] - b[1])
        l1 = math.hypot(*e1) or 1; l2 = math.hypot(*e2) or 1
        n1 = (-e1[1] / l1, e1[0] / l1); n2 = (-e2[1] / l2, e2[0] / l2)
        nx, ny = n1[0] + n2[0], n1[1] + n2[1]; L = math.hypot(nx, ny) or 1; nx, ny = nx / L, ny / L
        k = 1 / max(0.5, nx * n1[0] + ny * n1[1]); out.append((b[0] + nx * d * k, b[1] + ny * d * k))
    return out


def field():
    poly = M.field_poly()
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))
    if area < 0: poly = poly[::-1]
    im = Image.new('RGB', (W, H), TRACK); d = ImageDraw.Draw(im)
    # 잔디: 경계에서 4.5 m 안쪽. 잔디깎기 무늬는 5 m 폭 격자
    mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).polygon([px(p) for p in inset(poly, 4.5)], fill=255)
    yy, xx = np.mgrid[0:H, 0:W]; wx = xx / K + X0; wy = Y1 - yy / K
    a = ((wx + wy) / G.S2 / 5.0).astype(int) + ((wy - wx) / G.S2 / 5.0 + 100).astype(int)
    t = (a % 2)[..., None].astype(np.float32)
    grass = np.array(GRASS_A, np.float32) * (1 - t) + np.array(GRASS_B, np.float32) * t
    rng = np.random.default_rng(7); grass += rng.normal(0, 2.2, (H, W, 1)).astype(np.float32)
    base = np.asarray(im, np.float32) + rng.normal(0, 2.5, (H, W, 1)).astype(np.float32)
    m = (np.asarray(mask, np.float32) / 255)[..., None]
    im = Image.fromarray(np.clip(base * (1 - m) + grass * m, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    circ = lambda c, r, fill: d.ellipse([px((c[0] - r, c[1] + r)), px((c[0] + r, c[1] - r))], fill=fill)
    # 내야 흙: 투수판 중심 반지름 29 m (95 ft) 원과 파울라인 사이
    my = G.SPEC['mound']; R = 28.96; pts = [(0.0, -1.2)]
    for k in range(0, 181, 2):
        ang = math.radians(k); p = (R * math.cos(ang), my + R * math.sin(ang))
        if p[1] > abs(p[0]) - 1.6: pts.append(p)
    d.polygon([px(p) for p in sorted(pts[1:], key=lambda p: -math.atan2(p[1] + 1.2, p[0])) + [(0.0, -1.7)]], fill=DIRT)
    b = G.SPEC['base'] / G.S2; s = b - 1.1                           # 내야 잔디 (베이스라인 안쪽)
    gi = Image.new('L', (W, H), 0); ImageDraw.Draw(gi).polygon([px(p) for p in ((0, b - s), (s, b), (0, b + s), (-s, b))], fill=255)
    for c, r in (((0, 0), 4.0), ((b, b), 3.0), ((0, 2 * b), 3.0), ((-b, b), 3.0)):
        ImageDraw.Draw(gi).ellipse([px((c[0] - r, c[1] + r)), px((c[0] + r, c[1] - r))], fill=0)
    im.paste(Image.fromarray(np.clip(grass, 0, 255).astype(np.uint8)), (0, 0), gi); d = ImageDraw.Draw(im)
    circ((0, 0), 4.0, DIRT); circ((0, my - 0.46), 2.74, DIRT)
    # 선: 파울라인, 타석, 포수석
    lw = max(2, int(round(0.12 * K)))
    for th in (45, 135): d.line([px((0, 0)), px(G.pol(th, G.LINE))], fill=LINE, width=lw)
    for sx in (-1, 1):
        x0, x1 = sx * 0.37, sx * (0.37 + 1.22); d.rectangle([px((min(x0, x1), 0.92 + 0.216)), px((max(x0, x1), -0.92 + 0.216))], outline=LINE, width=lw)
    d.line([px((-0.65, -0.7)), px((-0.65, -2.44)), px((0.65, -2.44)), px((0.65, -0.7))], fill=LINE, width=lw)
    for sx in (-1, 1):                                               # 대기 타석
        c = (sx * 11.3, -3.5); d.ellipse([px((c[0] - 0.76, c[1] + 0.76)), px((c[0] + 0.76, c[1] - 0.76))], outline=LINE, width=lw)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im.save(os.path.join(OUT, 'field.jpg'), quality=88); print('field.jpg', im.size)


def font(size, bold=True):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',):
        if os.path.exists(f): return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def board():
    """메인 전광판 (가상 내용). 조감도처럼 붉은 바탕에 라인업·영상·점수판"""
    w, h = 2048, 440; im = Image.new('RGB', (w, h), (96, 14, 22)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, 44], fill=(52, 8, 14)); d.text((24, 6), 'INCHEON  CHEONGNA', font=font(28), fill=(250, 230, 230))
    d.text((w - 330, 6), '3D SEAT VIEW', font=font(28), fill=(250, 230, 230))
    for col, x in enumerate((24, 1500)):                               # 양쪽 라인업
        d.rectangle([x, 60, x + 520, h - 20], fill=(40, 6, 10))
        d.text((x + 16, 66), ('HOME', 'AWAY')[col], font=font(26), fill=(255, 210, 200))
        for i in range(9):
            y = 106 + i * 34; d.rectangle([x + 12, y, x + 508, y + 28], fill=(120, 22, 30) if i % 2 == 0 else (92, 16, 24))
            d.text((x + 22, y + 2), f'{i + 1}', font=font(20), fill=(255, 255, 255)); d.rectangle([x + 60, y + 9, x + 300 - (i * 13) % 90, y + 19], fill=(240, 220, 215))
            d.rectangle([x + 420, y + 9, x + 490, y + 19], fill=(255, 190, 120))
    d.rectangle([568, 60, 1476, 250], fill=(150, 24, 32))            # 가운데 영상
    for i in range(22): d.line([(568 + i * 46, 250), (760 + i * 46, 60)], fill=(176, 40, 46), width=14)
    d.text((820, 110), 'CHEONGNA DOME', font=font(54), fill=(255, 245, 240))
    d.rectangle([568, 262, 1476, h - 20], fill=(34, 6, 10))          # 이닝 점수판
    for i in range(12):
        x = 760 + i * 58; d.text((x, 270), str(i + 1) if i < 9 else 'RHE'[i - 9], font=font(22), fill=(255, 200, 190))
        for r in range(2): d.text((x, 312 + r * 46), str((i * 7 + r * 3) % 3) if i < 9 else str(4 + r + i % 3), font=font(28), fill=(255, 255, 255))
    for r, t in enumerate(('HOME', 'AWAY')): d.text((592, 312 + r * 46), t, font=font(28), fill=(255, 255, 255))
    im.save(os.path.join(OUT, 'board.jpg'), quality=88); print('board.jpg', im.size)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True); field(); board()
