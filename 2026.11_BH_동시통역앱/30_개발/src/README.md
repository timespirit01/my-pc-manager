# 마주 통역

폰 한 대를 두 사람 사이에 놓고, 각자 자기 말로 이야기하면 음성과 자막으로 통역해 주는 모바일 웹앱.

- 화면 위쪽(남색)은 상대가 보도록 180° 뒤집혀 있고, 아래쪽은 내가 본다.
- 가운데 버튼을 한 번 누르면 그다음부터는 버튼 없이 대화한다. 시끄러운 곳에서는 설정에서 "눌러서 말하기"로 바꾼다.
- 통역 엔진: Gemini Live API의 통역 전용 모델(`gemini-3.5-live-translate-preview`).

설계와 판단 근거는 `../docs/`에 있다.

## 현재 상태 (2026-11-25)

앱은 완성돼 있고 가짜 통역 서버를 상대로 한 자동 검사는 모두 통과한다. **실제 통역 엔진으로는 아직 한 번도 돌려 보지 못했다** — API 키는 정상이지만 개발에 쓴 클라우드 환경에서는 통역 엔진에 닿지 않기 때문이다(이유는 `../docs/checks.md`). 배포본에서 확인해야 한다. 항목별 확인 결과는 `../docs/checks.md`.

## 실행

```bash
npm install
GEMINI_API_KEY=발급받은_키 npm run dev     # http://localhost:5173
```

휴대폰 브라우저는 HTTPS 주소에서만 마이크를 허용한다. 같은 와이파이의 `http://192.168.x.x:5173`으로는 마이크가 켜지지 않으므로, 휴대폰에서 쓰려면 배포해야 한다.

## 환경 변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `GEMINI_API_KEY` | 예 | Gemini API 키. 서버에만 두며 브라우저로 내려가지 않는다 |
| `APP_PASSCODE` | 배포 시 예 | 접속 암호. Vercel 배포에서 비어 있으면 서버가 토큰 발급을 거부한다 (주소를 아는 누구나 요금을 쓰는 것을 막기 위해) |
| `GEMINI_API_BASE`, `GEMINI_WS_BASE` | 아니오 | 엔진 주소를 바꿀 때만. 자동 검사가 가짜 서버를 가리키는 데 쓴다 |

## 배포 (Vercel)

1. 저장소를 Vercel 프로젝트로 가져오고 **Root Directory**를 `2026.11_BH_동시통역앱/30_개발/src`로 지정한다.
2. 프레임워크는 "Other", 빌드 명령은 비워 둔다. `public/`이 정적 파일로, `api/token.js`가 서버리스 함수로 올라간다.
3. 환경 변수 `GEMINI_API_KEY`, `APP_PASSCODE`를 넣는다.
4. 배포된 주소를 휴대폰에서 열고, 홈 화면에 추가하면 앱처럼 실행된다.

2026-11-25에 `majoo-interpreter` 프로젝트로 배포했다: https://majoo-interpreter-timespirit01.vercel.app (Vercel 로그인 보호가 켜져 있다). 환경 변수를 바꾼 뒤에는 재배포해야 적용된다.

## 구조

```
public/
  index.html, styles.css      화면
  js/config.js                언어 목록·화면 문안·모델 이름·조정값 (코드 수정 없이 바꾸는 곳)
  js/app.js                   화면 동작
  js/interpreter.js           세션 2개 조율: 음성 배분, 되울림 차단, 한 마디 조립, 응답 속도 측정
  js/engine-gemini.js         통역 엔진 접속 (엔진을 바꾸려면 이 파일만 교체)
  js/audio-in.js, pcm-worklet.js   마이크 → 16kHz PCM
  js/audio-out.js             통역 음성 재생
api/token.js                  POST /api/token (Vercel 함수)
lib/issue-token.js            임시 토큰 발급 (암호 확인 → Google에 1회용 토큰 요청)
server.js                     개발용 서버
test/mock-google.js           가짜 Google 서버 (실제와 같은 주소·메시지 형식)
test/e2e.mjs                  자동 검사
```

동작 방식:

```
마이크 ─┬→ 세션 A (목표: 상대 언어)  한국어가 들리면 통역, 상대 언어면 침묵
        └→ 세션 B (목표: 한국어)     상대 언어가 들리면 통역, 한국어면 침묵
```

통역 음성이 스피커로 나가는 동안에는 반대 방향 세션에 마이크 음성을 보내지 않는다. 통역 음성을 마이크가 다시 주워 되받아 통역하는 것을 막기 위해서다.

## 검사

```bash
npm test             # 자동 검사 27개 (약 3분)
npm test -- soak     # 15분 연속 대화
npm test -- shots    # 화면 캡처 → ../docs/screens/
```

Chromium에 가짜 마이크 음성을 넣고 가짜 Google 서버로 통역을 흉내 낸다. 통역 품질과 실제 엔진의 응답 속도는 이 검사로 알 수 없다.

## 실기기에서 1초 기준 재는 법

1. 설정 → "응답 속도 표시"를 켠다.
2. 한국어로 10문장, 상대 언어로 10문장을 말한다 (짧은 문장 포함).
3. 내 화면 오른쪽 위에 "통역 시작 0.6초 · 중앙값 0.7초 · 1초 이내 8/10"처럼 나온다. 말하는 도중에 통역이 시작되면 "말하는 중 시작"으로 표시된다.

측정은 마이크 음량으로 말의 끝을 추정하므로 ±0.1~0.2초의 오차가 있다.

## 엔진 바꾸기

`js/engine-gemini.js`와 같은 메서드(`connect`, `sendAudio`, `endAudio`, `maybeRefresh`, `retryNow`, `close`)와 같은 `on.*` 콜백을 가진 클래스를 만들고 `interpreter.js`의 `_makeSession`에서 그 클래스를 쓰면 된다. 토큰 발급도 엔진마다 다르므로 `lib/issue-token.js`에 해당 엔진용 발급을 추가한다.
