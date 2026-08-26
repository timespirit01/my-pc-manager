@echo off
REM ===========================================================================
REM  GV90 SIESTA - 전시장 PC 실행 스크립트 (Windows)
REM
REM  1) 공간 제어 브릿지 (조명 DMX / 커튼 RS-485)
REM  2) 콘텐츠 정적 서버
REM  3) 크롬 키오스크
REM
REM  브릿지가 늦게 떠도 콘텐츠가 다시 붙으므로 순서가 어긋나도 결국 연결된다.
REM  Node.js 18 이상과 Python 3, Chrome 이 설치돼 있어야 한다.
REM ===========================================================================

setlocal
set PORT=8080
set ROOT=%~dp0..

taskkill /F /IM chrome.exe >nul 2>&1

REM --- 공간 제어 브릿지 ------------------------------------------------------
if exist "%ROOT%\bridge\config.json" (
  start "GV90 BRIDGE" cmd /c "cd /d "%ROOT%\bridge" && node server.js"
) else (
  echo [알림] bridge\config.json 이 없어 브릿지를 띄우지 않습니다.
  echo        config.example.json 을 복사해 현장 값으로 채우세요.
  echo        콘텐츠는 조명/커튼 없이 화면만 정상 동작합니다.
)

start "GV90 SERVER" /MIN cmd /c "python "%ROOT%\tools\serve.py" %PORT%"
timeout /t 3 /nobreak >nul

set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

start "" %CHROME% ^
  --kiosk ^
  --autoplay-policy=no-user-gesture-required ^
  --disable-session-crashed-bubble ^
  --disable-infobars ^
  --no-first-run ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --user-data-dir="%TEMP%\gv90-siesta" ^
  "http://localhost:%PORT%/siesta/"

endlocal
