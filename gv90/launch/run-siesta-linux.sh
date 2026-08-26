#!/usr/bin/env bash
# ===========================================================================
#  GV90 SIESTA - 전시장 PC 실행 스크립트 (Linux / macOS)
#
#  공간 제어 브릿지 + 콘텐츠 서버 + 크롬 키오스크를 함께 띄운다.
#  사용법:  ./launch/run-siesta-linux.sh [포트]
# ===========================================================================
set -euo pipefail

PORT="${1:-8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS=()

cleanup() { for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

# --- 공간 제어 브릿지 --------------------------------------------------------
if [ -f "$ROOT/bridge/config.json" ]; then
  (cd "$ROOT/bridge" && node server.js) &
  PIDS+=($!)
else
  echo "[알림] bridge/config.json 이 없어 브릿지를 띄우지 않습니다."
  echo "       config.example.json 을 복사해 현장 값으로 채우세요."
  echo "       콘텐츠는 조명/커튼 없이 화면만 정상 동작합니다."
fi

python3 "$ROOT/tools/serve.py" "$PORT" &
PIDS+=($!)
sleep 3

URL="http://localhost:$PORT/siesta/"
for BROWSER in google-chrome chromium chromium-browser; do
  if command -v "$BROWSER" >/dev/null 2>&1; then
    "$BROWSER" --kiosk --autoplay-policy=no-user-gesture-required \
      --disable-session-crashed-bubble --disable-infobars --no-first-run \
      --disable-pinch --overscroll-history-navigation=0 \
      --user-data-dir="/tmp/gv90-siesta" "$URL"
    exit 0
  fi
done

echo "크롬 계열 브라우저를 찾지 못했습니다. 직접 열어주세요: $URL"
wait
