# GV90 GENESIS SUJI — 인터렉티브 전시 콘텐츠

제네시스 수지 GV90 런칭 전시의 인터렉티브 콘텐츠 프로그램.
제안서(`docs/GV90_interactive_proposal.pdf`)의 UX FLOW 를 그대로 구현한다.

| 콘텐츠 | 폴더 | 상태 |
|---|---|---|
| **SOUND EXPERIENCE** — 여백의 소리 / SEE THE SOUND | `sound-experience/` | ✅ 구현 완료 |
| **SIESTA** — GEN-UX 네 개의 루틴 | `siesta/` | ⏳ 예정 |
| **SWIVEL** — 4가지 상황별 시나리오 | `swivel/` | ⏳ 예정 |

세 콘텐츠 모두 같은 키오스크 셸(`shared/`)을 쓴다.
1920×1080 고정 좌표계로 만들고 실행 시 모니터 해상도에 맞춰 통째로 스케일하므로,
4K나 세로형 모니터에서도 좌표를 다시 잡을 필요가 없다.

---

## 빠른 실행

```bash
python3 tools/serve.py
# → http://localhost:8080/sound-experience/
```

브라우저 보안 정책 때문에 `index.html` 을 파일로 직접 열면 동작하지 않는다.
반드시 위 서버로 띄운다.

**전시장 PC 실행** (크롬 키오스크 전체화면 + 서버 자동 기동)

```
Windows :  launch\run-windows.bat
Linux   :  ./launch/run-linux.sh sound-experience 8080
```

**단일 파일 배포본** — 서버 없이 브라우저로 열기만 하면 되는 한 개짜리 HTML.
클라이언트 검수용 공유나, 네트워크가 막힌 전시장 PC 반입에 쓴다.

```bash
python3 tools/build_standalone.py sound-experience
# → dist/gv90-sound-experience.html  (약 1 MB, 이미지·설정·스크립트 모두 포함)
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
├─ tools/
│  ├─ serve.py             정적 서버
│  ├─ extract_assets.py    제안서 PDF → 이미지 플레이트 추출
│  └─ build_standalone.py  단일 HTML 배포본 빌드
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
| 2 | **CLEAR** 지우다 | 30s | 차량 방어막 테두리 빛 순환 / NVH 파형 접근 모션<br>→ NOISE(소음) · VIBRATION(진동) · HARSHNESS(하시니스) 3단계 |
| 3 | **FILL** 채우다 | 30s | 스피커 위치별 원형 펄스 순차 등장 (0→25 카운트)<br>→ 7.1.4 채널 선언 → B&O 3대 기술 |
| 4 | **EXPAND** 넓히다 | 35s | 2차원 파동 → 터치 → 3차원 돔으로 변화 → 돌비 애트모스 CarPlay |
| 5 | **OUTRO** | 12s | "이제 직접 들어보실 차례입니다" · SOUND CHAMBER 안내 |

관람객 터치는 **INTRO 시작**과 **EXPAND 확장** 두 곳이다.
EXPAND 는 14초가 지나면 터치가 없어도 자동으로 넘어가 쇼가 멈추지 않는다.

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

## 남은 작업

- [ ] Figma 원본 접근 권한 확보 후 타이포·간격·색상 최종 보정
      (현재는 제안서 PDF 기준으로 구현했다)
- [ ] 정식 이미지 소재 교체
- [ ] 실제 음원 스템 적용
- [ ] SIESTA 콘텐츠 개발 — 4개 무드 선택 + 조명·커튼·스피커 제어 연동
- [ ] SWIVEL 콘텐츠 개발 — 터치 모니터 + 대형 모니터 듀얼 스크린 구성
