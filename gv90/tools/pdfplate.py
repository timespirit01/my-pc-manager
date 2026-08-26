"""제안서 PDF에서 콘텐츠용 이미지 플레이트를 뽑을 때 쓰는 공용 도구.

제안서 슬라이드는 1920x1080 플랫 이미지라 레이어 분리가 안 된다.
필요한 영역만 잘라내고, 슬라이드에 인쇄된 카피를 지우고, 크롭 경계를
부드럽게 만드는 세 가지 처리를 여기 모아 둔다.
"""
import io  # noqa: F401  (extract_swivel_assets 가 pdfplate.io 로 함께 쓴다)

try:
    import pymupdf
except ImportError:  # pragma: no cover
    raise SystemExit("pymupdf가 필요합니다:  pip install pymupdf")

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    raise SystemExit("pillow가 필요합니다:  pip install pillow")


def crop_page(page, box, dpi=200):
    """페이지의 일부(0~1 비율 x0,y0,x1,y1)를 잘라 PIL 이미지로 돌려준다."""
    x0, y0, x1, y1 = box
    r = page.rect
    clip = pymupdf.Rect(x0 * r.width, y0 * r.height, x1 * r.width, y1 * r.height)
    pix = page.get_pixmap(dpi=dpi, clip=clip)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def apply_copy_mask(img, areas, blur=52):
    """지정 영역을 검정으로 부드럽게 덮어 슬라이드에 인쇄된 카피를 지운다.

    프로그램이 같은 카피를 실시간으로 그리므로 그대로 두면 글자가 겹쳐 보인다.
    가장자리는 가우시안으로 흐리되 안쪽 심(core)은 완전한 검정으로 눌러,
    어두운 전시장에서 글자가 유령처럼 남는 것을 막는다.
    """
    w, h = img.size
    black = Image.new("RGB", (w, h), (0, 0, 0))
    soft = Image.new("L", (w, h), 255)
    core = Image.new("L", (w, h), 255)
    ds, dc = ImageDraw.Draw(soft), ImageDraw.Draw(core)
    for x0, y0, x1, y1 in areas:
        ds.rectangle([x0 * w, y0 * h, x1 * w, y1 * h], fill=0)
        dc.rectangle([x0 * w + blur, y0 * h + blur, x1 * w - blur, y1 * h - blur], fill=0)
    out = Image.composite(img, black, soft.filter(ImageFilter.GaussianBlur(blur)))
    return Image.composite(out, black, core)


def scrim_bands(img, top=None, bottom=None):
    """위/아래 가장자리를 세로 그라디언트로 검게 눌러 인쇄된 카피를 지운다.

    작은 스틸에서는 사각형 마스크가 모서리에 검은 블록으로 드러난다.
    비네트처럼 위아래로 자연스럽게 어두워지는 띠가 훨씬 잘 맞는다.

    top / bottom 은 (hard, fade) 쌍. hard 안쪽은 완전한 검정, fade 까지 서서히 사라진다.
    """
    w, h = img.size
    mask = Image.new("L", (w, h), 255)
    px = mask.load()
    for y in range(h):
        t = y / h
        keep = 255
        if top:
            hard, fade = top
            if t <= hard:
                keep = 0
            elif t < fade:
                keep = min(keep, int(255 * (t - hard) / (fade - hard)))
        if bottom:
            hard, fade = bottom       # hard 아래는 완전 검정, fade 위쪽부터 스며든다
            if t >= hard:
                keep = 0
            elif t > fade:
                keep = min(keep, int(255 * (hard - t) / (hard - fade)))
        if keep < 255:
            for x in range(w):
                px[x, y] = keep
    return Image.composite(img, Image.new("RGB", (w, h), (0, 0, 0)), mask)


def feather_edges(img, pad):
    """가장자리를 알파로 흐려 검정 배경 위에서 크롭 경계가 보이지 않게 한다."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rectangle([pad, pad, w - pad, h - pad], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(pad * 0.6))
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def save(img, path, quality=86):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() in (".jpg", ".jpeg"):
        img.convert("RGB").save(path, quality=quality)
    else:
        img.save(path)
    return path
