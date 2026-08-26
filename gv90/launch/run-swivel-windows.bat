@echo off
REM ===========================================================================
REM  GV90 SWIVEL - 전시장 PC 실행 스크립트 (Windows, 듀얼 모니터)
REM
REM  터치모니터와 대형모니터에 크롬 창을 하나씩 띄운다.
REM  두 창은 BroadcastChannel 로 서로 상태를 맞추므로 별도 서버가 필요 없다.
REM
REM  --window-position 은 확장 데스크톱 기준 좌표다.
REM  주 모니터가 1920x1080 이고 대형모니터가 그 오른쪽에 붙어 있다고 가정한다.
REM  배치가 다르면 아래 TOUCH_POS / DISPLAY_POS 만 바꾼다.
REM ===========================================================================

setlocal
set PORT=8080
set ROOT=%~dp0..
set TOUCH_POS=0,0
set DISPLAY_POS=1920,0

taskkill /F /IM chrome.exe >nul 2>&1

start "GV90 SERVER" /MIN cmd /c "python "%ROOT%\tools\serve.py" %PORT%"
timeout /t 2 /nobreak >nul

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

REM 두 창이 같은 프로필을 써야 BroadcastChannel 로 서로를 볼 수 있다.
set FLAGS=--kiosk --disable-session-crashed-bubble --disable-infobars --no-first-run ^
 --disable-pinch --overscroll-history-navigation=0 --user-data-dir="%TEMP%\gv90-swivel"

start "" %CHROME% %FLAGS% --window-position=%TOUCH_POS% ^
  "http://localhost:%PORT%/swivel/?screen=touch"

timeout /t 1 /nobreak >nul

start "" %CHROME% %FLAGS% --window-position=%DISPLAY_POS% ^
  "http://localhost:%PORT%/swivel/?screen=display"

endlocal
