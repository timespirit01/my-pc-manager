# GV90 GENESIS SUJI — 인터렉티브 전시 콘텐츠

제네시스 수지 GV90 런칭 전시의 인터렉티브 콘텐츠 프로그램.
제안서(`docs/GV90_interactive_proposal.pdf`)의 UX FLOW 를 그대로 구현한다.

| 콘텐츠 | 폴더 | 상태 |
|---|---|---|
| **SOUND EXPERIENCE** — 여백의 소리 / SEE THE SOUND | `sound-experience/` | ✅ 구현 완료 |
| **SWIVEL** — 4가지 상황별 시나리오 (듀얼 모니터) | `swivel/` | ✅ 구현 완료 |
| **SIESTA** — GEN-UX 네 개의 루틴 | `siesta/` | ⏳ 예정 |

세 콘텐츠 모두 같은 키오스크 셸(`shared/`)을 쓴다.
1920×1080 고정 좌표계로 만들고 실행 시 모니터 해상도에 맞춰 통째로 스케일하므로,
4K나 세로형 모니터에서도 좌표를 다시 잡을 필요가 없다.

---

## 빠른 실행

```bash
python3 tools/serve.py
# → http://localhost:8080/sound-experience/
# → http://localhost:8080/swivel/          (두 화면을 나란히 — 검수용)
```

브라우저 보안 정책 때문에 `index.html` 을 파일로 직접 열면 동작하지 않는다.
반드시 위 서버로 띄운다.

**전시장 PC 실행** (크롬 키오스크 전체화면 + 서버 자동 기동)

```
SOUND EXPERIENCE
  Windows :  launch\run-sound-experience-windows.bat
  Linux   :  ./launch/run-sound-experience-linux.sh sound-experience 8080

SWIVEL (듀얼 모니터 — 창 두 개를 각 모니터에 띄운다)
  Windows :  launch\run-swivel-windows.bat
  Linux   :  ./launch/run-swivel-linux.sh 8080 1920
```

**단일 파일 배포본** — 서버 없이 브라우저로 열기만 하면 되는 한 개짜리 HTML.
클라이언트 검수용 공유나, 네트워크가 막힌 전시장 PC 반입에 쓴다.

```bash
python3 tools/build_standalone.py sound-experience
python3 tools/build_standalone.py swivel
# → dist/gv90-sound-experience.html  (약 1.0 MB)
# → dist/gv90-swivel.html            (약 1.3 MB)
```

---

## 운영자 단축키

| 키 | 동작 |
|---|---|
| `Space` | 일시정지 / 재개 |
| `←` `→` | 단락(CLEAR / FILL / EXPAND …) 이동 |
| `R` | 처음부터 다시 재생 |
| `M` | 음소거 |
| `F` | 전체화면 전환 |
| `D` | 디버그 오버레이 (현재 단락·비트·FPS·오디오 상태) |

**SWIVEL**

| 키 | 동작 |
|---|---|
| `Esc` `Home` | 메뉴로 |
| `←` `→` | 같은 상황 안의 앞뒤 시나리오 |
| `↓` | 다음 단계 |
| `F` | 전체화면 전환 |
| `D` | 디버그 오버레이 |

주소 뒤에 `?debug=1` 을 붙이면 디버그 오버레이가 켜진 채로 시작한다.

무인 운영을 전제로 만들었다. 관람객이 도중에 자리를 떠도 콘텐츠가 끝까지
재생된 뒤 인트로로 돌아가고, 재생이 실제로 멈춘 경우(운영자 일시정지 등)에만
유휴 타이머가 인트로로 되돌린다.

---

## 폴더 구조

```
gv90/
├─ shared/                 세 콘텐츠가 공유하는 키오스크 코어
│  ├─ css/base.css         디자인 토큰 · 스테이지 · 공통 크롬
│  └─ js/
│     ├─ stage.js          1920x1080 → 모니터 해상도 스케일링
│     ├─ sequencer.js      단락(step) / 비트(beat) 타임라인
│     ├─ audio.js          Web Audio 사운드 엔진
│     ├─ kiosk.js          유휴 복귀 · 커서 숨김 · 단축키 · 디버그
│     └─ util.js
├─ sound-experience/
│  ├─ index.html
│  ├─ config.json          ★ 카피 · 타이밍 · 스피커 좌표 (여기만 고치면 됨)
│  ├─ css/sound.css
│  ├─ js/
│  │  ├─ main.js           연출 컨트롤러
│  │  └─ viz/
│  │     ├─ wavefield.js   INTRO 파형 / CLEAR 소음·진동·하시니스
│  │     ├─ speakers.js    FILL 25개 스피커 순차 점등
│  │     └─ dome.js        EXPAND 2차원 파동 → 3차원 돔 모핑
│  └─ assets/{img,audio}
├─ swivel/
│  ├─ index.html
│  ├─ config.json          ★ 카테고리 · 시나리오 · 단계 카피 (여기만 고치면 됨)
│  ├─ css/swivel.css
│  ├─ js/
│  │  ├─ main.js           화면 구성 · 단계 진행 · 키오스크
│  │  ├─ store.js          두 화면이 함께 보는 상태
│  │  ├─ syncbus.js        BroadcastChannel 동기화
│  │  └─ views/
│  │     ├─ touch.js       터치모니터 (메뉴 · 선택 · 재생)
│  │     └─ display.js     대형모니터 (플레이트 · 크로스페이드 · 자막)
│  └─ assets/img/{scenes,stage}
├─ tools/
│  ├─ serve.py                 정적 서버
│  ├─ pdfplate.py              PDF 플레이트 추출 공용 도구
│  ├─ extract_assets.py        SOUND EXPERIENCE 소재 추출
│  ├─ extract_swivel_assets.py SWIVEL 소재 추출
│  └─ build_standalone.py      단일 HTML 배포본 빌드
├─ launch/                 전시장 PC 실행 스크립트
└─ docs/                   제안서 원본
```

---

## SOUND EXPERIENCE

### 재생 흐름

제안서 32p UX FLOW 그대로다. 터치 대기를 뺀 순수 재생 길이는 약 **107초**.

| # | 단락 | 길이 | 내용 |
|---|---|---|---|
| 1 | **INTRO** | 터치까지 대기 | "보이지 않는 소리를, 눈으로 경험하다" · 어트랙트 파형 · TOUCH 유도 |
| 2 | **CLEAR** 지우다 | 30s | 주행 중인 차량 · 방어막 테두리 빛 순환 / NVH 파형 접근 모션<br>→ NOISE(소음) · VIBRATION(진동) · HARSHNESS(하시니스) 3단계 |
| 3 | **FILL** 채우다 | 30s | 스피커 위치별 원형 펄스 순차 등장 (0→25 카운트)<br>→ 7.1.4 채널 선언 → B&O 3대 기술 |
| 4 | **EXPAND** 넓히다 | 35s | 2차원 파동 → 터치 → 3차원 돔으로 변화 → 돌비 애트모스 CarPlay |
| 5 | **OUTRO** | 12s | "이제 직접 들어보실 차례입니다" · SOUND CHAMBER 안내 |

관람객 터치는 **INTRO 시작**과 **EXPAND 확장** 두 곳이다.
EXPAND 는 14초가 지나면 터치가 없어도 자동으로 넘어가 쇼가 멈추지 않는다.

터치를 기다리는 동안에는 하단 진행바가 움직이지 않는다. 대기 시간은 관람객이
정하는 것이라, 그동안 바가 차오르면 "곧 넘어간다"는 잘못된 신호를 준다.
터치해서 다음 화면으로 넘어간 순간부터 바가 움직인다.

### CLEAR 의 주행 연출

NVH 는 달리는 차에서만 성립하는 이야기라 CLEAR 구간에서 차량이 주행한다.
제안서의 측면 컷은 정지 렌더이므로 네 가지를 겹쳐 주행감을 만든다.

| 요소 | 방식 |
|---|---|
| 휠 회전 | 림만 원형으로 떼어낸 조각(`wheel-front/rear.png`)을 같은 자리에 겹쳐 CSS 로 회전 |
| 노면 흐름 | 접지선 아래에 옅은 노면 띠를 깔고 그 위로 속도선이 뒤로 흐른다 |
| 서스펜션 | 차체와 휠을 함께 담은 리그를 미세하게 상하동 |
| 배경 | 차체 위쪽을 스쳐 지나가는 흐릿한 광원 |

차량은 화면 왼쪽을 향해 달린다. 휠은 반시계 방향, 노면·배경은 오른쪽으로 흐른다.
`prefers-reduced-motion` 이 켜진 환경에서는 회전과 상하동이 멈춘다.

차량 이미지를 교체하면 `config.json` 의 `carRig` 값(휠 중심 좌표·반지름·접지선)과
`tools/extract_assets.py` 의 `WHEELS` 좌표를 함께 맞춘다.

### 소리

`Noise → Silence → Sound → Immersion` 을 실제로 들려준다.

- **CLEAR** 도시 소음(교통 럼블 + 노면 + 윈드)이 대역별로 다른 속도로 사라진다.
  윈드가 먼저, 저역 럼블이 마지막에 빠지면서 "정제된다"는 인상을 만든다.
- **FILL** 스피커가 켜질 때마다 그 위치의 좌우 값으로 포인트음이 울린다.
  앞쪽은 낮고 넓게, 뒤쪽·천정 스피커는 높고 밝게.
- **EXPAND** 패드의 스테레오 폭·리버브·고역이 함께 열리며 3차원으로 퍼진다.

**음원 파일 없이도 바로 재생된다.** 전 구간이 Web Audio 실시간 합성이라
시연·검수 단계에서 소재를 기다릴 필요가 없다.

실제 음원(B&O 데모 트랙 등)이 준비되면 `config.json` 의 `audio.stems` 에
경로를 넣는다. 로드에 성공한 스템은 합성음 대신 재생되고, 파일이 없으면
조용히 합성음으로 되돌아간다.

```json
"audio": {
  "stems": {
    "city":  "assets/audio/city-noise.mp3",
    "atmos": "assets/audio/atmos-demo.mp3"
  }
}
```

### 수정 가이드

거의 모든 조정은 `sound-experience/config.json` 안에서 끝난다.

| 하고 싶은 것 | 고칠 곳 |
|---|---|
| 카피 문구 변경 | `copy.*` |
| 단계별 길이 조절 | `steps[].beats[].ms` (밀리초) |
| 관람객 터치 대기 시간 | `steps[].beats[].gate` 가 `true` 인 항목의 `ms`<br>(`null` 이면 터치할 때까지 무한 대기) |
| 스피커 위치 보정 | `speakers[]` (탑뷰 이미지 기준 0~1 비율) |
| 주행 속도 · 휠 위치 | `carRig` (`spinMs` 가 작을수록 빠르다) |
| 탑뷰 이미지 배치 | `speakerPlate` |
| 유휴 복귀 시간 | `kiosk.idleMs` |

### 이미지 소재

현재 소재는 제안서 PDF에서 추출한 플레이트다. 슬라이드가 1920×1080 플랫
이미지라 레이어 분리가 안 되므로, `tools/extract_assets.py` 가 필요한 영역만
잘라내고 ① 슬라이드에 인쇄돼 있던 카피를 지우고 ② 크롭 경계를 부드럽게 만든다.
(프로그램이 같은 카피를 실시간으로 그리기 때문에 인쇄된 글자가 남으면 겹쳐 보인다.)

```bash
python3 tools/extract_assets.py
```

**정식 소재로 교체할 때**는 디자이너가 Figma에서 투명 배경 PNG로 내보내
`sound-experience/assets/img/` 의 같은 파일명으로 덮어쓰면 된다.

| 파일 | 용도 | 권장 규격 |
|---|---|---|
| `car-side.png` | CLEAR 차량 측면 | 1820×712 (@2x), 투명 배경 |
| `wheel-front/rear.png` | CLEAR 회전용 휠 (추출기가 자동 생성) | — |
| `car-top.png` | FILL 차량 탑뷰 | 2400×1094 (@2x), 투명 배경 |
| `interior.jpg` | EXPAND 실내 | 3840×2160, 카피 없는 원본 |
| `feature-1~3.jpg` | B&O 기능 컷 | 1032×400 (@2x) |
| `apps.png` | 애트모스 지원 앱 아이콘 | 1680×200 (@2x), 투명 배경 |

`feature-*.jpg` 와 `apps.png` 의 경로는 `config.json` 의 `copy.fill.features[].image`,
`copy.expand.apps.image` 에 있다. 파일명을 바꾸려면 그쪽을 고친다.

### 폰트

전시장 PC는 외부 네트워크가 막혀 있는 경우가 많아 웹폰트를 링크하지 않았다.
현재는 시스템 한글 폰트로 표시된다. Genesis Sans 라이선스가 확보되면
PC에 폰트를 설치하기만 하면 `shared/css/base.css` 의 폰트 스택
(`--font-head` / `--font-text`)이 자동으로 잡는다.

---

## SWIVEL

터치모니터와 대형모니터, 두 대로 이루어진 콘텐츠다.
관람객이 터치모니터에서 상황과 시나리오를 고르면, 대형모니터가 그 시나리오대로
차량 환경이 바뀌는 모습을 단계별로 보여준다.

### 화면 구성

| 실행 | 주소 | 용도 |
|---|---|---|
| 터치모니터 | `swivel/?screen=touch` | 관람객이 만지는 화면 |
| 대형모니터 | `swivel/?screen=display` | 관람객이 바라보는 화면 |
| 나란히 보기 | `swivel/` | 두 화면을 한 창에 — 검수·시연용 |

### 두 화면은 어떻게 맞춰지나

같은 PC 의 브라우저 창 두 개가 **BroadcastChannel** 로 상태를 주고받는다.
서버도, 네트워크 설정도 필요 없다.

- **터치모니터가 상태를 쥔다.** 관람객이 고른 것과 단계 진행을 모두 여기서 결정하고 알린다.
- **대형모니터는 받은 대로 그린다.** 스스로 판단하지 않으므로 두 화면이 어긋날 일이 없다.
- 대형모니터를 나중에 켜거나 새로고침해도 `hello` 를 보내면 현재 상태를 다시 받아 곧바로 따라붙는다.

두 창이 **같은 브라우저 프로필**에서 떠야 한다. 실행 스크립트가 `--user-data-dir` 을
같은 값으로 맞춰 둔다.

### 재생 흐름

```
메뉴(4가지 상황)  →  시나리오 선택  →  재생(단계 자동 진행)
      ↑                                      │
      └──────────  홈 버튼 · 유휴 복귀  ←──────┘
```

- 단계는 `config.json` 의 `stepMs`(기본 5.6초)마다 자동으로 넘어가고, 마지막 단계에서 멈춘다.
- 재생 중 `‹ ›` 로 같은 상황 안의 다른 시나리오로 건너뛸 수 있다. 시나리오가 하나뿐이면 화살표가 숨는다.
- 90초 동안 아무도 만지지 않으면 메뉴로 돌아간다.

### 시나리오 구성

제안서 15~28p 를 그대로 옮겼다. 총 4상황 · 10시나리오 · 28단계.

| 상황 | 시나리오 (단계 수) |
|---|---|
| 01 함께 시간 보내기 | 라운지(2) · 프라이빗 라운지(3) |
| 02 영화 보기 | 1열 간편 시청(1) · 1열 프라이빗 시청(3) · 2열 프라이빗 시청(3) |
| 03 휴식 | 1열 수면(7) · 2열 수면(1) |
| 04 쇼퍼 드리븐 | 엔터테인먼트(2) · 비즈니스(2) · 휴식(4) |

### 확인이 필요한 카피

- **시나리오 선택 카드의 설명문** — 제안서에는 '영화 보기' 3종만 확정돼 있다.
  나머지 7종은 같은 어조로 임시 작성했고, `config.json` 에서 `"wantDraft": true` 로 표시해 두었다.
- **1열 운전석·조수석 수면(23p)** — 제안서에 `요청사항 | 차량 환경 특징 및 세부 설명 자료` 로
  표시된 미정 항목이다. 스틸 3컷은 있으나 단계 카피가 없어 재생 목록에서 제외했다.
  자료가 오면 `row1-sleep` 뒤에 단계로 붙이거나 별도 시나리오로 분리하면 된다.

### 이미지 소재

`tools/extract_swivel_assets.py` 가 제안서의 '대형모니터' 패널을 그대로 꺼낸다.
패널은 슬라이드에 개별 이미지로 박혀 있어(549×309) 페이지를 다시 래스터화하지 않는다.
인쇄돼 있던 단계 카피와 워터마크는 위아래 그라디언트 스크림으로 지운다.

```bash
python3 tools/extract_swivel_assets.py
```

**원본이 549×309 라 1920×1080 모니터에서는 확대되어 부드럽게 보인다.**
대형모니터가 주인공인 콘텐츠이므로 정식 소재 교체가 필요하다.

| 파일 | 권장 규격 |
|---|---|
| `assets/img/scenes/<시나리오>-<단계>.jpg` | 3840×2160 (최소 1920×1080), 16:9, 카피 없는 원본 |
| `assets/img/stage/car-exterior.jpg` | 대기 화면 차량 외관 |
| `assets/img/stage/car-xray.jpg` | 시트가 비쳐 보이는 차량 |

파일명만 맞추면 코드 수정 없이 교체된다. 대기 화면 두 장의 경로는
`config.json` 의 `copy.display.plates` 에 있다.

### 수정 가이드

| 하고 싶은 것 | 고칠 곳 |
|---|---|
| 상황 · 시나리오 · 단계 카피 | `categories[]` |
| 단계 넘어가는 속도 | `stepMs` |
| 유휴 복귀 시간 | `kiosk.idleMs` |
| 동기화 채널 이름 | `sync.channel` (한 PC 에서 두 콘텐츠를 동시에 돌릴 때만) |

---

## 남은 작업

- [ ] Figma 원본 접근 권한 확보 후 타이포·간격·색상 최종 보정
      (현재는 제안서 PDF 기준으로 구현했다)
- [ ] 정식 이미지 소재 교체
- [ ] 실제 음원 스템 적용
- [ ] SWIVEL 시나리오 선택 카드 설명문 확정 (`wantDraft` 7종)
- [ ] SWIVEL '1열 운전석·조수석 수면' 단계 카피 수급 (제안서 23p 요청사항)
- [ ] SIESTA 콘텐츠 개발 — 4개 무드 선택 + 조명·커튼·스피커 제어 연동
