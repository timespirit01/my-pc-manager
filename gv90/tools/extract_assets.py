#!/usr/bin/env python3
"""GV90 제안서 PDF에서 콘텐츠용 이미지 플레이트를 추출한다.

제안서 슬라이드는 1920x1080 플랫 이미지라 레이어 분리가 안 된다.
배경이 순수 검정이므로 차량/실내 영역만 크롭하면 그대로 검정 배경 위에
얹을 수 있는 플레이트가 된다. (정식 소재는 디자이너가 Figma에서
투명 PNG로 내보내 같은 경로에 덮어쓰면 된다.)

사용법:
    python3 tools/extract_assets.py [PDF경로] [출력폴더]
"""
import sys
import pathlib

try:
    import pymupdf
except ImportError:  # pragma: no cover
    sys.exit("pymupdf가 필요합니다:  pip install pymupdf")

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("pillow가 필요합니다:  pip install pillow")

# (출력 파일명, 슬라이드 페이지 번호, 크롭 영역 0~1 비율 x0,y0,x1,y1)
PLATES = [
    ("car-side.png",     34, (0.268, 0.372, 0.742, 0.702)),
    ("car-top.png",      38, (0.200, 0.325, 0.800, 0.810)),
    ("interior.jpg",     41, (0.000, 0.000, 1.000, 1.000)),
    ("feature-1.jpg",     40, (0.0756, 0.606, 0.2830, 0.783)),
    ("feature-2.jpg",     40, (0.3960, 0.606, 0.6030, 0.783)),
    ("feature-3.jpg",     40, (0.7160, 0.606, 0.9230, 0.783)),
    ("apps.png",          44, (0.2900, 0.660, 0.7100, 0.748)),
]

# 슬라이드에 인쇄된 카피를 지울 영역 (크롭 기준 0~1 비율) + 페더 반경(px).
# 프로그램이 같은 카피를 실시간으로 그리므로 그대로 두면 글자가 겹쳐 보인다.
MASKS = {
    "interior.jpg": {
        "blur": 52,
        "areas": [
            (-0.06, -0.06, 1.06, 0.150),  # 상단 헤더 (GENESIS GV90 / SOUND EXPERIENCE)
            (-0.06, 0.080, 0.430, 0.340),  # 좌상단 EXPAND THE SOUND / 소리를 확장하다
            (0.250, 0.630, 0.750, 0.830),  # 하단 TOUCH / 화면을 터치하면...
            (-0.06, 0.840, 1.06, 1.06),    # 하단 진행 표시
        ],
    },
}

# CLEAR 구간의 주행 연출용 휠. 측면 렌더는 정지 이미지라 휠이 돌지 않으므로,
# 림(rim)만 원형으로 떼어내 같은 자리에 겹쳐 놓고 CSS 로 회전시킨다.
# 좌표는 car-side.png 원본 픽셀 기준 (중심 x, 중심 y, 반지름).
WHEELS = [
    ("wheel-front.png", 147, 270, 50),
    ("wheel-rear.png", 750, 279, 51),
]

# 크롭 경계가 검은 배경 위에서 사각형으로 드러나지 않도록 가장자리를 흐릴 이미지 (페더 폭 px)
FEATHER = {
    "car-side.png": 46,
    "car-top.png": 26,
    "apps.png": 24,
}

RENDER_DPI = 200


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    pdf_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "docs" / "GV90_interactive_proposal.pdf"
    out_dir = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else root / "sound-experience" / "assets" / "img"
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(pdf_path)
    for name, page_no, (x0, y0, x1, y1) in PLATES:
        page = doc[page_no - 1]
        w, h = page.rect.width, page.rect.height
        clip = pymupdf.Rect(x0 * w, y0 * h, x1 * w, y1 * h)
        pix = page.get_pixmap(dpi=RENDER_DPI, clip=clip)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

        if name in MASKS:
            img = apply_copy_mask(img, MASKS[name])
        if name in FEATHER:
            img = feather_edges(img, FEATHER[name])

        target = out_dir / name
        if target.suffix == ".jpg":
            img.save(target, quality=86)
        else:
            img.save(target)
        print(f"{target.relative_to(root)}  {img.width}x{img.height}")

    extract_wheels(out_dir, root)


def extract_wheels(out_dir, root) -> None:
    """차량 측면 렌더에서 림만 원형으로 떼어낸다 (주행 회전용)."""
    src = out_dir / "car-side.png"
    if not src.exists():
        return
    car = Image.open(src).convert("RGBA")
    for name, cx, cy, r in WHEELS:
        disc = car.crop((cx - r, cy - r, cx + r, cy + r))
        mask = Image.new("L", disc.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, disc.width - 1, disc.height - 1], fill=255)
        # 회전하는 림과 고정된 타이어의 경계가 드러나지 않게 살짝 흐린다
        mask = mask.filter(ImageFilter.GaussianBlur(2.5))
        disc.putalpha(mask)
        target = out_dir / name
        disc.save(target)
        print(f"{target.relative_to(root)}  {disc.width}x{disc.height}  중심({cx},{cy}) r={r}")


def apply_copy_mask(img, spec):
    """지정 영역을 검정으로 부드럽게 덮어 슬라이드에 인쇄된 카피를 지운다.

    가장자리는 가우시안으로 흐리되, 안쪽 심(core)은 완전한 검정으로 눌러
    어두운 전시장에서 글자가 유령처럼 남는 것을 막는다.
    """
    w, h = img.size
    blur = spec["blur"]
    black = Image.new("RGB", (w, h), (0, 0, 0))

    soft = Image.new("L", (w, h), 255)
    core = Image.new("L", (w, h), 255)
    ds, dc = ImageDraw.Draw(soft), ImageDraw.Draw(core)
    for x0, y0, x1, y1 in spec["areas"]:
        ds.rectangle([x0 * w, y0 * h, x1 * w, y1 * h], fill=0)
        # 심 영역은 블러 반경만큼 안쪽으로 들여 그린다
        dc.rectangle([x0 * w + blur, y0 * h + blur, x1 * w - blur, y1 * h - blur], fill=0)

    out = Image.composite(img, black, soft.filter(ImageFilter.GaussianBlur(blur)))
    return Image.composite(out, black, core)


def feather_edges(img, pad):
    """가장자리를 알파로 흐려 검정 배경 위에서 크롭 경계가 보이지 않게 한다."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rectangle([pad, pad, w - pad, h - pad], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(pad * 0.6))
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


if __name__ == "__main__":
    main()
