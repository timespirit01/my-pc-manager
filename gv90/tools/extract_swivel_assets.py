#!/usr/bin/env python3
"""GV90 제안서 PDF에서 SWIVEL 콘텐츠용 이미지를 추출한다.

제안서 15~28p 의 '대형모니터' 패널이 곧 각 시나리오의 단계별 스틸이다.
패널은 슬라이드에 개별 이미지로 박혀 있으므로(549x309), 페이지를 다시
래스터화하지 않고 원본을 그대로 꺼낸다. 두 번 리샘플링하지 않는 만큼 선명하다.

패널마다 슬라이드에 카피(단계 제목·설명)와 워터마크가 인쇄돼 있는데,
프로그램이 같은 카피를 실시간으로 그리므로 지우고 내보낸다.

원본 해상도가 549x309 라 1920x1080 모니터에서는 확대되어 부드럽게 보인다.
정식 소재(1920x1080 이상)를 같은 파일명으로 덮어쓰면 그대로 선명해진다.

사용법:
    python3 tools/extract_swivel_assets.py [PDF경로] [출력폴더]
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import pdfplate  # noqa: E402

# 슬라이드 안에서 패널을 찾는 기준.
#   위쪽 줄(y<0.55) = 터치모니터, 아래쪽 줄 = 대형모니터.
#   x 중심으로 1·2·3번 패널을 가른다.
PANEL_CENTERS = [0.241, 0.526, 0.811]
DISPLAY_ROW_Y = 0.55

# 패널 위아래에 인쇄된 것을 지우는 스크림 (hard, fade)
#   위: 좌상단 GENESIS GV90 · 우상단 SWIVEL 워터마크
#   아래: 단계 제목과 설명
# 원본에서 워터마크는 t=0.055~0.075, 단계 카피는 t=0.81~0.92 에 있다.
# 카피 아래쪽은 제안서가 이미 어둡게 깔아 둔 자리라 검게 눌러도 티가 나지 않는다.
TOP_SCRIM = (0.085, 0.165)
BOTTOM_SCRIM = (0.792, 0.730)

# 시나리오별 스틸 = (페이지, 패널번호) 목록. 순서가 곧 재생 순서다.
SCENES = {
    "lounge":          [(15, 1), (15, 2)],
    "private-lounge":  [(16, 1), (16, 2), (16, 3)],
    "row1-quick":      [(17, 1)],
    "row1-private":    [(18, 1), (18, 2), (18, 3)],
    "row2-private":    [(19, 1), (19, 2), (19, 3)],
    "row1-sleep":      [(20, 1), (20, 2), (20, 3), (21, 1), (21, 2), (21, 3), (22, 1)],
    "row2-sleep":      [(24, 1)],
    "entertainment":   [(25, 1), (25, 2)],
    "business":        [(26, 1), (26, 2)],
    "rest":            [(27, 1), (27, 2), (27, 3), (28, 1)],
}

# 대형모니터의 대기 화면 — UX FLOW 페이지(14p)의 대형모니터 컷
STAGE_PLATES = {
    "car-exterior.jpg": (14, 1),   # 차량 외관 실루엣
    "car-xray.jpg": (14, 2),       # 시트가 비쳐 보이는 상태
}
# 대기 화면 가운데에는 'SWIVELING SEAT' 문구가 인쇄돼 있다.
# 배경이 검정이라 이 자리는 사각형으로 지워도 드러나지 않는다.
STAGE_CENTER_MASK = [(0.18, 0.40, 0.82, 0.64)]

def display_panels(page):
    """대형모니터 줄의 패널 이미지를 1·2·3번 순서로 돌려준다."""
    found = {}
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        r = page.rect
        if (y0 / r.height) < DISPLAY_ROW_Y:
            continue                      # 터치모니터 줄은 건너뛴다
        cx = ((x0 + x1) / 2) / r.width
        idx = min(range(3), key=lambda i: abs(PANEL_CENTERS[i] - cx)) + 1
        found[idx] = info["xref"]
    return found


def load_panel(doc, page, index):
    xref = display_panels(page).get(index)
    if xref is None:
        raise SystemExit(f"{page.number + 1}p 에서 {index}번 패널을 찾지 못했습니다.")
    data = doc.extract_image(xref)
    return pdfplate.Image.open(pdfplate.io.BytesIO(data["image"])).convert("RGB")


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    pdf_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "docs" / "GV90_interactive_proposal.pdf"
    out_dir = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else root / "swivel" / "assets" / "img"

    doc = pdfplate.pymupdf.open(pdf_path)
    total = 0

    for scene, panels in SCENES.items():
        for step, (pno, panel) in enumerate(panels, start=1):
            img = load_panel(doc, doc[pno - 1], panel)
            img = pdfplate.scrim_bands(img, top=TOP_SCRIM, bottom=BOTTOM_SCRIM)
            target = pdfplate.save(img, out_dir / "scenes" / f"{scene}-{step}.jpg")
            print(f"{target.relative_to(root)}  {img.width}x{img.height}")
            total += 1

    for name, (pno, panel) in STAGE_PLATES.items():
        img = load_panel(doc, doc[pno - 1], panel)
        img = pdfplate.scrim_bands(img, top=TOP_SCRIM, bottom=BOTTOM_SCRIM)
        img = pdfplate.apply_copy_mask(img, STAGE_CENTER_MASK, blur=9)
        target = pdfplate.save(img, out_dir / "stage" / name)
        print(f"{target.relative_to(root)}  {img.width}x{img.height}")
        total += 1

    print(f"\n총 {total}장")


if __name__ == "__main__":
    main()
