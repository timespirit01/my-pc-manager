#!/usr/bin/env python3
"""단일 HTML 파일 배포본을 만든다.

CSS · ES 모듈 · config.json · 이미지를 전부 한 파일 안에 넣어,
서버 없이 브라우저로 열기만 하면 되는 배포본을 만든다.
클라이언트 검수용 공유나, 네트워크가 막힌 전시장 PC 반입에 쓴다.

    python3 tools/build_standalone.py [콘텐츠명] [출력경로] [--fragment]
    python3 tools/build_standalone.py sound-experience dist/gv90-sound-experience.html

--fragment 를 주면 <html>/<head>/<body> 를 뺀 조각만 출력한다.
문서 뼈대를 직접 감싸는 호스트(웹 공유 페이지, iframe 임베드)에 넣을 때 쓴다.

ES 모듈은 상대 경로 import 를 그대로 둔 채로는 인라인할 수 없다.
각 모듈을 data: URL 로 만들고 import 지정자를 임포트맵의 이름으로 바꿔
모듈 구조를 그대로 유지한 채 한 파일에 담는다.
"""
import base64
import json
import mimetypes
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# 인라인할 모듈 (상대 경로 import 는 파일명 기준 이름으로 치환된다)
MODULES = [
    "shared/js/util.js",
    "shared/js/stage.js",
    "shared/js/sequencer.js",
    "shared/js/audio.js",
    "shared/js/kiosk.js",
    "{content}/js/viz/wavefield.js",
    "{content}/js/viz/speakers.js",
    "{content}/js/viz/dome.js",
    "{content}/js/main.js",
]


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def js_data_uri(source: str) -> str:
    return "data:text/javascript;base64," + base64.b64encode(source.encode()).decode()


ASSET_RE = re.compile(r"^assets/.+\.(?:png|jpe?g|svg|webp|mp3|wav|ogg|m4a)$", re.I)


def inline_config_assets(node, src: pathlib.Path):
    """설정 안의 소재 경로를 data URI 로 바꾼다. 파일이 없으면 그 항목을 지운다.

    (없는 음원 스템까지 그대로 남기면 배포본에서 매번 로드 실패 로그가 찍힌다.
    오디오 엔진은 스템이 없으면 실시간 합성음으로 재생하므로 지워도 안전하다.)
    """
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            r = inline_config_assets(v, src)
            if r is not None:
                out[k] = r
        return out
    if isinstance(node, list):
        return [inline_config_assets(v, src) for v in node]
    if isinstance(node, str) and ASSET_RE.match(node):
        path = (src / node).resolve()
        return data_uri(path) if path.exists() else None
    return node


def main() -> None:
    argv = [a for a in sys.argv[1:] if not a.startswith("--")]
    fragment = "--fragment" in sys.argv
    content = argv[0] if argv else "sound-experience"
    out = pathlib.Path(argv[1]) if len(argv) > 1 else ROOT / "dist" / f"gv90-{content}.html"
    src = ROOT / content

    html = (src / "index.html").read_text()
    config = inline_config_assets(json.loads((src / "config.json").read_text()), src)

    # --- CSS: 링크를 인라인 style 로, 배경 이미지가 있으면 data URI 로 -----------
    styles = []
    for href in re.findall(r'<link rel="stylesheet" href="([^"]+)">', html):
        css_path = (src / href).resolve()
        css = css_path.read_text()
        css = re.sub(
            r'url\((["\']?)([^)"\']+)\1\)',
            lambda m: m.group(0)
            if m.group(2).startswith(("#", "data:"))  # SVG 조각 참조는 그대로 둔다
            else f'url({data_uri((css_path.parent / m.group(2)).resolve())})',
            css,
        )
        styles.append(css)
    html = re.sub(r'\s*<link rel="stylesheet" href="[^"]+">', "", html)

    # --- 모듈: import 지정자를 임포트맵 이름으로 바꾸고 data URL 로 -------------
    names = {pathlib.Path(m.format(content=content)).name: "gv90/" + pathlib.Path(m).stem
             for m in MODULES}
    imports = {}
    for rel in MODULES:
        path = ROOT / rel.format(content=content)
        source = re.sub(
            r"""(from\s+)(['"])([^'"]+?)\2""",
            lambda m: f"{m.group(1)}'{names.get(pathlib.Path(m.group(3)).name, m.group(3))}'",
            path.read_text(),
        )
        imports[names[path.name]] = js_data_uri(source)

    # --- 이미지: src 속성을 data URI 로 -----------------------------------------
    html = re.sub(
        r'src="((?!data:)[^"]+\.(?:png|jpg|jpeg|svg|webp))"',
        lambda m: f'src="{data_uri((src / m.group(1)).resolve())}"',
        html,
    )

    # --- 스크립트 태그 교체 -------------------------------------------------------
    entry = names["main.js"]
    bundle = (
        f"<style>\n{chr(10).join(styles)}\n</style>\n"
        f'<script>window.__GV90_CONFIG__ = {json.dumps(config, ensure_ascii=False)};</script>\n'
        f'<script type="importmap">{json.dumps({"imports": imports})}</script>\n'
        f'<script type="module">import "{entry}";</script>'
    )
    # 치환문을 람다로 넘긴다. 문자열로 넘기면 config 안의 \n 이 이스케이프로
    # 해석돼 인라인 JS 가 깨진다.
    html = re.sub(r'<script type="module" src="[^"]+"></script>', lambda _: bundle, html)

    if fragment:
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        body = re.search(r"<body[^>]*>(.*)</body>", html, re.S)
        html = (f"<title>{title.group(1)}</title>\n" if title else "") + \
               (body.group(1).strip() if body else html)

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print(f"{out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}  "
          f"{len(html.encode()) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
