#!/usr/bin/env python3
"""전시 콘텐츠용 정적 서버.

브라우저 보안 정책 때문에 file:// 로 직접 열면 config.json 과 ES 모듈을
읽지 못한다. 전시장 PC에서는 이 스크립트로 띄운다.

    python3 tools/serve.py            # http://localhost:8080
    python3 tools/serve.py 9000       # 포트 지정
"""
import functools
import http.server
import pathlib
import socketserver
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 콘텐츠를 교체했을 때 예전 파일이 남지 않도록 캐시를 끈다.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):  # 조용히
        pass


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    handler = functools.partial(Handler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"GV90 전시 콘텐츠 서버 실행 중")
        print(f"  사운드 익스피어리언스 : http://localhost:{port}/sound-experience/")
        print(f"  종료: Ctrl+C")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n종료했습니다.")


if __name__ == "__main__":
    main()
