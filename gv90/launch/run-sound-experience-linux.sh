#!/usr/bin/env bash
# ===========================================================================
#  GV90 인터렉티브 전시 콘텐츠 - 전시장 PC 실행 스크립트 (Linux / macOS)
#
#  사용법:  ./launch/run-linux.sh [콘텐츠명] [포트]
#  예시  :  ./launch/run-linux.sh sound-experience 8080
# ===========================================================================
set -euo pipefail

CONTENT="${1:-sound-experience}"
PORT="${2:-8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- 정적 서버 ---------------------------------------------------------------
python3 "$ROOT/tools/serve.py" "$PORT" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 2

URL="http://localhost:$PORT/$CONTENT/"
echo "실행: $URL"

# --- 브라우저 키오스크 --------------------------------------------------------
for BROWSER in google-chrome chromium chromium-browser; do
  if command -v "$BROWSER" >/dev/null 2>&1; then
    "$BROWSER" \
      --kiosk \
      --autoplay-policy=no-user-gesture-required \
      --disable-session-crashed-bubble \
      --disable-infobars \
      --no-first-run \
      --disable-pinch \
      --overscroll-history-navigation=0 \
      --user-data-dir="/tmp/gv90-kiosk" \
      "$URL"
    exit 0
  fi
done

echo "크롬 계열 브라우저를 찾지 못했습니다. 브라우저에서 직접 열어주세요: $URL"
wait $SERVER_PID
