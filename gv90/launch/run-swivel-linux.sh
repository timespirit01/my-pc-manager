#!/usr/bin/env bash
# ===========================================================================
#  GV90 SWIVEL - 전시장 PC 실행 스크립트 (Linux / macOS, 듀얼 모니터)
#
#  사용법:  ./launch/run-swivel-linux.sh [포트] [대형모니터 X좌표]
#  예시  :  ./launch/run-swivel-linux.sh 8080 1920
#
#  두 창은 같은 브라우저 프로필에서 떠야 BroadcastChannel 로 서로를 본다.
# ===========================================================================
set -euo pipefail

PORT="${1:-8080}"
DISPLAY_X="${2:-1920}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 "$ROOT/tools/serve.py" "$PORT" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 2

BROWSER=""
for CANDIDATE in google-chrome chromium chromium-browser; do
  if command -v "$CANDIDATE" >/dev/null 2>&1; then BROWSER="$CANDIDATE"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "크롬 계열 브라우저를 찾지 못했습니다. 아래 두 주소를 각 모니터에서 직접 열어주세요."
  echo "  터치모니터 : http://localhost:$PORT/swivel/?screen=touch"
  echo "  대형모니터 : http://localhost:$PORT/swivel/?screen=display"
  wait $SERVER_PID
fi

FLAGS=(--kiosk --disable-session-crashed-bubble --disable-infobars --no-first-run
       --disable-pinch --overscroll-history-navigation=0
       --user-data-dir="/tmp/gv90-swivel")

"$BROWSER" "${FLAGS[@]}" --window-position=0,0 \
  "http://localhost:$PORT/swivel/?screen=touch" &
sleep 1
"$BROWSER" "${FLAGS[@]}" --window-position="$DISPLAY_X",0 \
  "http://localhost:$PORT/swivel/?screen=display" &

wait
