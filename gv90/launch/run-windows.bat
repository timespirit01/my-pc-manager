@echo off
REM ===========================================================================
REM  GV90 인터렉티브 전시 콘텐츠 - 전시장 PC 실행 스크립트 (Windows)
REM
REM  1) 로컬 정적 서버를 띄우고
REM  2) 크롬을 키오스크 전체화면으로 열어 콘텐츠를 재생한다.
REM
REM  전시장 PC에는 Python 3 와 Chrome 이 설치돼 있어야 한다.
REM  자동 실행이 필요하면 이 파일의 바로가기를 시작프로그램 폴더
REM  (shell:startup) 에 넣는다.
REM ===========================================================================

setlocal
set PORT=8080
set CONTENT=sound-experience
set ROOT=%~dp0..

REM --- 이전 실행이 남아 있으면 정리 -----------------------------------------
taskkill /F /IM chrome.exe >nul 2>&1

REM --- 정적 서버 (별도 창, 최소화) ------------------------------------------
start "GV90 SERVER" /MIN cmd /c "python "%ROOT%\tools\serve.py" %PORT%"

REM --- 서버가 뜰 때까지 잠시 대기 -------------------------------------------
timeout /t 2 /nobreak >nul

REM --- 크롬 키오스크 실행 ----------------------------------------------------
REM  --kiosk                     : 전체화면, 브라우저 UI 없음
REM  --autoplay-policy           : 첫 터치 없이도 오디오 컨텍스트가 열리도록
REM  --disable-session-crashed-bubble / --no-first-run : 복구 팝업 차단
REM  --disable-pinch --overscroll-history-navigation=0 : 터치 오작동 차단
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
  --user-data-dir="%TEMP%\gv90-kiosk" ^
  "http://localhost:%PORT%/%CONTENT%/"

endlocal
