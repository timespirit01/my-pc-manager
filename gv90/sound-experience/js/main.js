/**
 * GV90 SOUND EXPERIENCE — 메인 컨트롤러
 *
 * 기획안 UX FLOW 를 그대로 옮긴다.
 *   INTRO → CLEAR(지우다) → FILL(채우다) → EXPAND(넓히다) → SOUND CHAMBER 안내
 *
 * 카피 · 타이밍 · 스피커 좌표는 모두 config.json 에 있고, 이 파일은
 * "언제 무엇을 보여주고 들려줄지"만 담당한다.
 */
import { Stage } from '../../shared/js/stage.js';
import { Sequencer } from '../../shared/js/sequencer.js';
import { AudioEngine } from '../../shared/js/audio.js';
import { Kiosk } from '../../shared/js/kiosk.js';
import { WaveField } from './viz/wavefield.js';
import { SpeakerMap } from './viz/speakers.js';
import { SoundDome } from './viz/dome.js';
import { $, $$, el, clamp, norm, easeOut } from '../../shared/js/util.js';

/* --------------------------------------------------------------------------
   설정 로드
   -------------------------------------------------------------------------- */

// 단일 파일 배포본(tools/build_standalone.py)에서는 설정이 인라인으로 주입된다.
let CONFIG = window.__GV90_CONFIG__ || null;
try {
  if (!CONFIG) {
    const res = await fetch('config.json', { cache: 'no-cache' });
    CONFIG = await res.json();
  }
} catch (err) {
  document.body.innerHTML =
    '<div style="display:grid;place-items:center;height:100%;font-size:22px;' +
    'line-height:1.8;color:#E2543A;text-align:center">' +
    'config.json 을 읽지 못했습니다.<br>' +
    '<span style="color:#888;font-size:18px">파일을 직접 여는 대신 ' +
    '<code>python3 tools/serve.py</code> 로 실행해 주세요.</span></div>';
  throw err;
}

const COPY = CONFIG.copy;
const DEBUG_ON = new URLSearchParams(location.search).has('debug');

/* --------------------------------------------------------------------------
   DOM 구성 — 카피 주입
   -------------------------------------------------------------------------- */

const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

$$('[data-copy]').forEach((node) => {
  const v = dig(COPY, node.dataset.copy);
  if (typeof v === 'string') node.textContent = v;
});
$$('[data-chrome]').forEach((node) => {
  node.textContent = CONFIG.chrome[node.dataset.chrome] || '';
});

// 하단 진행 표시
const progressEl = $('#progress');
const segEls = CONFIG.chrome.segments.map((seg) => {
  const node = el('div', { class: 'seg', 'data-seg': seg.id },
    el('span', { class: 'fill' }),
    el('span', { class: 'label', text: seg.label }));
  progressEl.append(node);
  return { id: seg.id, node, fill: node.querySelector('.fill') };
});

// CLEAR — 소음 항목
const clearItemsEl = $('#clear-items');

// FILL — B&O 기능 카드
$('#fill-features').append(...COPY.fill.features.map((f) =>
  el('article', { class: 'feature-card' },
    el('p', { class: 'tag', text: f.tag }),
    el('h3', { text: f.title }),
    el('p', { text: f.body }),
    el('img', { src: f.image, alt: '' }))));

// EXPAND — 축 설명
const axisEls = COPY.expand.axes.map((a) => {
  const node = el('li', {},
    el('span', { class: 'en', text: a.en }),
    el('span', { class: 'ko', text: a.ko }));
  $('#expand-axes').append(node);
  return node;
});

// EXPAND — 앱 아이콘 (이미지가 없으면 텍스트 칩으로 대체)
const appImg = $('#expand-apps');
appImg.addEventListener('error', () => {
  appImg.hidden = true;
  const chips = $('#expand-app-chips');
  chips.hidden = false;
  chips.append(...COPY.expand.apps.items.map((t) => el('li', { text: t })));
});
appImg.src = COPY.expand.apps.image;

/* --------------------------------------------------------------------------
   스테이지 · 비주얼 · 오디오
   -------------------------------------------------------------------------- */

const stage = new Stage($('#stage'), CONFIG.stage);

const introWave = new WaveField($('#cv-intro'), { seed: 11 });
introWave.setMode('intro');

const clearWave = new WaveField($('#cv-clear'), { gateX0: 432, gateX1: 1488, seed: 27 });

// 아웃트로는 카피 아래에서 잔향처럼 남는 낮은 파형
const outroWave = new WaveField($('#cv-outro'), { seed: 43, baseline: 0.74, amplitude: 54 });
outroWave.setMode('intro');
outroWave.setIntensity(0.30);

const audio = new AudioEngine({ master: CONFIG.audio.master, stems: CONFIG.audio.stems });

const countEl = $('#fill-count');
const shieldRun = $('.shield-run');

const speakerMap = new SpeakerMap($('#cv-fill'), CONFIG.speakers, {
  width: CONFIG.speakerPlate.w,
  height: CONFIG.speakerPlate.h,
  onFire: (sp) => {
    // 앞쪽은 낮고 넓게, 뒤쪽·천정 스피커는 높고 밝게
    const freq = 262 * Math.pow(2, (sp.depth * 1.4 + sp.height * 0.6));
    audio.ping({ pan: sp.pan * 0.85, freq, gain: 0.30, height: sp.height });
    countEl.textContent = String(speakerMap.litCount);
  },
});

const dome = new SoundDome($('#cv-expand'), { cx: 960, cy: 660, radius: 540 });

/* --------------------------------------------------------------------------
   시퀀서
   -------------------------------------------------------------------------- */

// config 의 ms:null 은 "터치할 때까지 대기"를 뜻한다.
const steps = CONFIG.steps.map((s) => ({
  ...s,
  beats: s.beats.map((b) => ({ ...b, ms: b.ms == null ? Infinity : b.ms })),
}));

const sceneOf = {
  intro: $('#scene-intro'),
  clear: $('#scene-clear'),
  fill: $('#scene-fill'),
  expand: $('#scene-expand'),
  outro: $('#scene-outro'),
};

/** 이번 비트에서만 쓰는 상태 */
let beatState = {};

/** 키오스크 셸 — 아래에서 생성한다 (비트 전환에서 유휴 타이머를 갱신하기 위해 먼저 선언) */
let kiosk = null;

const seq = new Sequencer(steps, {
  enterStep(step) {
    Object.entries(sceneOf).forEach(([id, node]) =>
      node.classList.toggle('is-active', id === step.id));
    if (step.id === 'intro') resetAll();
    updateProgress();
  },

  enterBeat(beat, step) {
    // 같은 씬 안의 beat 요소 전환
    const scene = sceneOf[step.id];
    const key = beatKey(step.id, beat.id);
    $$('.beat', scene).forEach((node) =>
      node.classList.toggle('is-active', node.dataset.beat === key));

    beatState = {};
    // 콘텐츠가 정상 재생 중이면 유휴가 아니다. 유휴 타이머는 "화면이 멈춰 있는 시간"만
    // 재야 하므로, 비트가 넘어갈 때마다 갱신한다. (전체 재생 길이가 유휴 시간보다
    // 길어도 재생 도중에 인트로로 튕기지 않는다.)
    kiosk?.poke();
    onBeatEnter(step.id, beat.id);
  },

  frame(dt, s) {
    onFrame(dt, s);
    updateProgress();
  },
});

/** 3개의 CLEAR 세부 단계는 하나의 beat 요소를 공유한다 */
function beatKey(stepId, beatId) {
  if (stepId === 'clear' && beatId !== 'title') return 'clear.stage';
  return `${stepId}.${beatId}`;
}

/* --------------------------------------------------------------------------
   비트별 연출
   -------------------------------------------------------------------------- */

function onBeatEnter(stepId, beatId) {
  switch (`${stepId}.${beatId}`) {
    case 'intro.attract':
      introWave.setIntensity(1);
      break;

    case 'clear.title':
      audio.startNoiseBed();
      audio.setNoiseReduction(0);
      clearWave.setMode('noise');
      clearWave.setReduction(0);
      clearWave.setIntensity(1);
      break;

    case 'clear.noise':
    case 'clear.vibration':
    case 'clear.harshness': {
      const phase = COPY.clear.stages.find((s) => s.id === beatId);
      $('#clear-label').textContent = phase.label;
      $('#clear-line').textContent = phase.line;
      clearWave.setMode(beatId);
      renderNoiseItems(phase.items);
      break;
    }

    case 'fill.map':
      audio.stopNoiseBed(1.4);
      countEl.textContent = '0';
      speakerMap.reset();
      beatState.mapStarted = false;
      break;

    case 'fill.statement':
      audio.startPad();
      audio.setSpatial(0.12);
      break;

    case 'fill.features':
      break;

    case 'expand.ripple':
      audio.startPad();
      audio.setSpatial(0.2);
      dome.setMorph(0);
      dome.setIntensity(0);
      sceneOf.expand.classList.remove('is-dome');
      break;

    case 'expand.dome':
      sceneOf.expand.classList.add('is-dome');
      axisEls.forEach((node, i) => {
        node.classList.remove('is-in');
        setTimeout(() => node.classList.add('is-in'), 500 + i * 420);
      });
      break;

    case 'expand.apps':
      break;

    case 'outro.outro':
      audio.reset();
      break;
  }
}

/** CLEAR 의 WIND/ROAD/TRAFFIC NOISE 항목을 순차 등장시킨다 */
function renderNoiseItems(items) {
  clearItemsEl.replaceChildren();
  items.forEach((t, i) => {
    const li = el('li', { text: t });
    clearItemsEl.append(li);
    setTimeout(() => li.classList.add('is-in'), 320 + i * 260);
  });
}

/* --------------------------------------------------------------------------
   프레임 루프 — 비트 진행도에 맞춰 그림과 소리를 함께 움직인다
   -------------------------------------------------------------------------- */

// CLEAR 3단계에 걸쳐 소음이 단계적으로 줄어드는 구간
const REDUCTION = { noise: [0.00, 0.45], vibration: [0.45, 0.78], harshness: [0.78, 1.00] };

function onFrame(dt, s) {
  const stepId = s.step ? s.step.id : '';
  const beatId = s.beat ? s.beat.id : '';
  const p = s.beatProgress();
  const elapsed = s.beatElapsed;

  // 차폐막 둘레를 도는 빛
  if (stepId === 'clear' && shieldRun) {
    const offset = -(performance.now() / 1000) * 470;
    shieldRun.style.strokeDashoffset = String(offset);
  }

  switch (stepId) {
    case 'intro':
      introWave.render(dt);
      break;

    case 'clear': {
      let red = 0;
      if (REDUCTION[beatId]) {
        const [a, b] = REDUCTION[beatId];
        red = a + (b - a) * easeOut(p);
      }
      clearWave.setReduction(red);
      audio.setNoiseReduction(red);
      clearWave.render(dt);
      break;
    }

    case 'fill':
      if (beatId === 'map') {
        // 타이틀이 자리잡은 뒤 스피커가 하나씩 켜지기 시작한다
        if (!beatState.mapStarted && elapsed > 2200) {
          beatState.mapStarted = true;
          speakerMap.start(13000);
        }
        // 마지막 몇 개가 켜질 즈음 패드가 올라온다
        if (!beatState.padStarted && speakerMap.litCount >= 18) {
          beatState.padStarted = true;
          audio.startPad();
          audio.setSpatial(0.1);
        }
        speakerMap.render(dt);
      }
      break;

    case 'expand': {
      if (beatId === 'ripple') {
        dome.setIntensity(norm(elapsed, 200, 1400));
        dome.setMorph(0);
        audio.setSpatial(0.2);
      } else if (beatId === 'dome') {
        const m = norm(elapsed, 300, 4200);
        dome.setIntensity(1);
        dome.setMorph(m);
        audio.setSpatial(0.25 + 0.75 * easeOut(m));
      } else {
        dome.setIntensity(clamp(1 - norm(elapsed, 0, 1200), 0, 1));
      }
      dome.render(dt);
      break;
    }

    case 'outro':
      outroWave.render(dt);
      break;
  }
}

/* --------------------------------------------------------------------------
   진행 표시 · 리셋
   -------------------------------------------------------------------------- */

function updateProgress() {
  const current = seq.step ? seq.step.segment : null;
  const order = segEls.map((s) => s.id);
  const idx = current ? order.indexOf(current) : -1;
  segEls.forEach((seg, i) => {
    const done = idx >= 0 && i < idx;
    const isCurrent = i === idx;
    seg.node.classList.toggle('is-done', done);
    seg.node.classList.toggle('is-current', isCurrent);
    const w = done ? 100 : isCurrent ? seq.stepProgress() * 100 : 0;
    seg.fill.style.width = w.toFixed(1) + '%';
  });
}

function resetAll() {
  audio.reset();
  speakerMap.reset();
  dome.setIntensity(0);
  dome.setMorph(0);
  sceneOf.expand.classList.remove('is-dome');
  countEl.textContent = '0';
  clearWave.setReduction(0);
  clearItemsEl.replaceChildren();
  axisEls.forEach((n) => n.classList.remove('is-in'));
}

/* --------------------------------------------------------------------------
   키오스크 셸
   -------------------------------------------------------------------------- */

kiosk = new Kiosk({
  idleMs: CONFIG.kiosk.idleMs,

  // 비트가 넘어갈 때마다 타이머를 갱신하므로, 여기까지 오는 경우는
  // 재생이 실제로 멈춰 있을 때뿐이다 (예: 운영자가 일시정지한 채 자리를 비움).
  onIdle() {
    if (seq.paused) seq.togglePause();
    if (seq.step && seq.step.id !== 'intro') {
      resetAll();
      seq.gotoStep('intro');
    }
  },

  async onInteract() {
    // 브라우저 정책상 소리는 반드시 사용자 제스처 안에서 열어야 한다
    await audio.unlock();
    seq.advance();
  },

  keys: {
    ' ': () => seq.togglePause(),
    ArrowRight: () => seq.nextStep(),
    ArrowLeft: () => seq.prevStep(),
    r: () => { resetAll(); seq.restart(); },
    R: () => { resetAll(); seq.restart(); },
    m: () => audio.toggleMute(),
    M: () => audio.toggleMute(),
  },

  debugNode: $('#debug'),
  debugInfo: () => {
    const st = seq.step ? seq.step.id : '-';
    const bt = seq.beat ? seq.beat.id : '-';
    const ms = Number.isFinite(seq.beat?.ms) ? Math.round(seq.beat.ms) : '∞';
    return [
      `STEP  ${st} / ${bt}  ${(seq.beatElapsed / 1000).toFixed(1)}s / ${ms === '∞' ? '∞' : (ms / 1000).toFixed(1) + 's'}`,
      `AUDIO ${audio.ready ? (audio.muted ? 'muted' : 'on') : 'locked'}  stems:${audio.stems.size}`,
      `FILL  ${speakerMap.litCount}/25   DOME morph ${dome.morph.toFixed(2)}`,
      `PAUSE ${seq.paused ? 'Y' : 'N'}   SCALE ${stage.scale.toFixed(3)}`,
      '',
      'SPACE 일시정지  ←/→ 단락이동  R 처음부터  M 음소거  F 전체화면  D 디버그',
    ].join('\n');
  },
});

if (DEBUG_ON) kiosk.toggleDebug();

seq.start();
