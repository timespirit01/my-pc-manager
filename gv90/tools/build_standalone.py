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
import/export 구문을 걷어내고 의존 순서대로 이어 붙여 하나의 인라인
모듈 스크립트로 만든다.

data: URL 과 임포트맵을 쓰지 않는 이유: 배포본을 엄격한 CSP 아래
(아티팩트·사내 포털 등) 올리면 script-src 가 data: 스킴을 거부해
아무것도 실행되지 않는다. 인라인 스크립트는 어디서나 통한다.
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
    "{content}/js/viz/roadmotion.js",
    "{content}/js/main.js",
]


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


# import 구문 (여러 줄 허용) 과 선언 앞의 export 키워드
IMPORT_RE = re.compile(r"^\s*import\s+[\s\S]*?from\s+['\"][^'\"]+['\"]\s*;?[ \t]*\n", re.M)
EXPORT_RE = re.compile(r"^(\s*)export\s+(?=(?:const|let|var|function|class|async)\b)", re.M)
DECL_RE = re.compile(r"^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)", re.M)


def bundle_modules(paths):
    """모듈들을 하나의 인라인 모듈 스크립트로 합친다.

    모두 같은 스코프에 놓이므로 최상위 이름이 겹치면 조용히 덮어써진다.
    빌드 시점에 검사해서 겹치면 즉시 실패시킨다.
    """
    seen = {}
    chunks = []
    for path in paths:
        source = path.read_text()
        for name in DECL_RE.findall(source):
            if name in seen:
                sys.exit(f"이름 충돌: '{name}' 이 {seen[name]} 와 {path.name} 에 함께 있습니다. "
                         f"한쪽 이름을 바꿔야 배포본이 정상 동작합니다.")
            seen[name] = path.name
        source = EXPORT_RE.sub(r"\1", IMPORT_RE.sub("", source))
        chunks.append(f"/* ==== {path.name} ==== */\n{source.strip()}\n")
    return "\n".join(chunks)


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

    # --- 모듈: 의존 순서대로 이어 붙여 하나의 인라인 스크립트로 -----------------
    script = bundle_modules([ROOT / m.format(content=content) for m in MODULES])

    # --- 이미지: src 속성을 data URI 로 -----------------------------------------
    html = re.sub(
        r'src="((?!data:)[^"]+\.(?:png|jpg|jpeg|svg|webp))"',
        lambda m: f'src="{data_uri((src / m.group(1)).resolve())}"',
        html,
    )

    # --- 스크립트 태그 교체 -------------------------------------------------------
    bundle = (
        f"<style>\n{chr(10).join(styles)}\n</style>\n"
        f'<script>window.__GV90_CONFIG__ = {json.dumps(config, ensure_ascii=False)};</script>\n'
        f'<script type="module">\n{script}\n</script>'
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
