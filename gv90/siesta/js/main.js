/**
 * GV90 SIESTA — 메인 컨트롤러
 *
 * 제안서 47~56p 를 그대로 옮긴다.
 *   INTRO → MODE 선택 → 시스템 구동 중 → 선택 화면 복귀
 *
 * 모드를 고르면 화면만 바뀌는 것이 아니라 공간이 바뀐다.
 *   조명   DMX 로 그 모드의 색과 밝기로 전환
 *   커튼   RS-485 로 개방 / 닫힘
 *   사운드 전용 음원 재생 (PC 오디오 출력 → BeoLab 50)
 *
 * 구동 화면이 끝나 선택 화면으로 돌아와도 공간은 직전 모드 상태를 유지한다.
 * 다음 전환의 대비를 만들기 위한 것으로, 제안서 48p 에 명시돼 있다.
 */
import { Stage } from '../../shared/js/stage.js';
import { Kiosk } from '../../shared/js/kiosk.js';
import { $, $$, el, norm } from '../../shared/js/util.js';
import { RoomControl, LINK } from './roomcontrol.js';
import { MoodOrb } from './orb.js';

/* --------------------------------------------------------------------------
   설정 로드
   -------------------------------------------------------------------------- */

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
   DOM 구성
   -------------------------------------------------------------------------- */

$$('[data-chrome]').forEach((n) => { n.textContent = CONFIG.chrome[n.dataset.chrome] || ''; });
$$('[data-copy]').forEach((n) => {
  const v = COPY[n.dataset.copy];
  if (typeof v === 'string') n.textContent = v;
});

const intro = COPY.intro[Math.min(Math.max(CONFIG.introVariant, 1), COPY.intro.length) - 1];
$('#intro-headline').textContent = intro.headline;
$('#intro-sub').textContent = intro.sub;

const stageEl = $('#stage');
const headRight = $('#head-right');

// 모드 타일
$('#mode-grid').append(...CONFIG.modes.map((m) =>
  el('button', {
    class: 'mode-tile', type: 'button', style: `--tile:${m.color}`,
    onclick: () => runMode(m.id),
  },
    el('span', { class: 'mode-title', text: m.title }),
    el('span', { class: 'mode-desc', text: m.card }))));

// 하드웨어 연결 표시 — 운영자만 보면 되므로 문제가 있을 때만 띄운다
const linkBadge = el('div', { id: 'link-badge' },
  el('span', { class: 'led' }), el('span', { class: 'label' }));
stageEl.append(linkBadge);

const scenes = {
  intro: $('#scene-intro'),
  select: $('#scene-select'),
  running: $('#scene-running'),
};

/* --------------------------------------------------------------------------
   스테이지 · 오브 · 공간 제어
   -------------------------------------------------------------------------- */

const stage = new Stage(stageEl, CONFIG.stage);
const orb = new MoodOrb($('#cv-orb'), { colorFadeMs: CONFIG.hardware.dmx.fadeMs });

const room = new RoomControl(CONFIG.hardware, {
  onLink: (state, status) => {
    linkBadge.classList.toggle('is-online', state === LINK.ONLINE);
    linkBadge.classList.toggle('is-connecting', state === LINK.CONNECTING);
    // 연결됐을 때는 굳이 보여주지 않는다
    linkBadge.classList.toggle('is-shown', DEBUG_ON || state !== LINK.ONLINE);
    linkBadge.querySelector('.label').textContent = `공간 제어 · ${status}`;
  },
});

/* --------------------------------------------------------------------------
   화면 전환
   -------------------------------------------------------------------------- */

let view = 'intro';
let activeMode = null;
let runStartedAt = 0;
let runTimer = 0;

function show(next) {
  view = next;
  Object.entries(scenes).forEach(([id, node]) =>
    node.classList.toggle('is-active', id === next));
  kiosk?.poke();
}

/** 인트로로 — 공간을 대기 상태로 되돌린다 */
function goIntro() {
  clearTimeout(runTimer);
  activeMode = null;
  orb.setIntensity(0);
  stageEl.classList.remove('has-mood');
  headRight.textContent = CONFIG.chrome.right;
  room.apply(CONFIG.idleRoom);
  show('intro');
}

/** 모드 선택 화면으로 — 공간은 직전 모드 상태를 그대로 둔다 (제안서 48p ③) */
function goSelect() {
  clearTimeout(runTimer);
  show('select');
}

function runMode(id) {
  const mode = CONFIG.modes.find((m) => m.id === id);
  if (!mode) return;

  activeMode = mode;
  runStartedAt = performance.now();

  headRight.textContent = mode.family;
  $('#run-title').textContent = mode.title;
  $('#run-sub').textContent = mode.running;

  stageEl.style.setProperty('--mood', mode.color);
  stageEl.classList.add('has-mood');
  orb.setColor(mode.color);
  orb.setProgress(0);

  // 화면과 공간이 함께 물든다
  room.apply(mode.room);

  show('running');

  clearTimeout(runTimer);
  runTimer = setTimeout(goSelect, CONFIG.runMs);
}

/* --------------------------------------------------------------------------
   프레임 루프
   -------------------------------------------------------------------------- */

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 250);
  last = now;

  if (view === 'running') {
    orb.setIntensity(Math.min(orb.intensity + dt / 700, 1));
    orb.setProgress(norm(now - runStartedAt, 0, CONFIG.runMs));
  } else {
    orb.setIntensity(Math.max(orb.intensity - dt / 700, 0));
  }
  orb.render(dt);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* --------------------------------------------------------------------------
   키오스크 셸
   -------------------------------------------------------------------------- */

let kiosk = null;

kiosk = new Kiosk({
  idleMs: CONFIG.kiosk.idleMs,

  // 아무도 없으면 공간까지 대기 상태로 되돌린다
  onIdle() {
    if (view !== 'intro') goIntro();
  },

  async onInteract() {
    // 브라우저 자동재생 정책상 첫 터치 이후에야 음원이 열린다
    if (view === 'intro') goSelect();
  },

  keys: {
    Escape: () => goIntro(),
    Home: () => goSelect(),
    r: () => goIntro(),
    R: () => goIntro(),
    1: () => runMode(CONFIG.modes[0].id),
    2: () => runMode(CONFIG.modes[1].id),
    3: () => runMode(CONFIG.modes[2].id),
    4: () => runMode(CONFIG.modes[3].id),
  },

  debugNode: $('#debug'),
  debugInfo: () => {
    const cmds = room.log.slice(0, 4)
      .map((c) => `  ${c.at}  ${describe(c)}`).join('\n') || '  (없음)';
    return [
      `VIEW   ${view}${activeMode ? `  MODE ${activeMode.id}` : ''}`,
      `공간제어 ${room.status()}   ${CONFIG.hardware.bridge.url}`,
      `SCALE  ${stage.scale.toFixed(3)}`,
      '최근 명령',
      cmds,
      '',
      'ESC 인트로  HOME 선택화면  1~4 모드  F 전체화면  D 디버그',
    ].join('\n');
  },
});

function describe(c) {
  if (c.type === 'dmx') return `조명  ${c.color} · ${Math.round(c.dimmer * 100)}% · ${c.fadeMs}ms`;
  if (c.type === 'curtain') return `커튼  ${c.action === 'open' ? '개방' : '닫힘'}`;
  if (c.type === 'audio') return `사운드 ${c.action === 'play' ? `재생 ${c.label || ''}` : '정지'}`;
  return c.type;
}

if (DEBUG_ON) kiosk.toggleDebug();

goIntro();
