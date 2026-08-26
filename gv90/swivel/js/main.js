/**
 * GV90 SWIVEL — 메인 컨트롤러
 *
 * 두 대의 모니터로 이루어진 콘텐츠다.
 *   터치모니터  관람객이 상황과 시나리오를 고른다
 *   대형모니터  고른 시나리오대로 차량 환경이 바뀌는 모습을 보여준다
 *
 * 실행 모드는 주소의 ?screen= 으로 정한다.
 *   ?screen=touch     터치모니터만
 *   ?screen=display   대형모니터만
 *   (생략)            두 화면을 나란히 — 검수·시연용
 */
import { Stage } from '../../shared/js/stage.js';
import { Kiosk } from '../../shared/js/kiosk.js';
import { $, $$, el } from '../../shared/js/util.js';
import { Store, VIEW } from './store.js';
import { SyncBus } from './syncbus.js';
import { TouchView } from './views/touch.js';
import { DisplayView } from './views/display.js';

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

const params = new URLSearchParams(location.search);
const SCREEN = params.get('screen') || 'both';
const DEBUG_ON = params.has('debug');

/* --------------------------------------------------------------------------
   화면 구성
   -------------------------------------------------------------------------- */

const store = new Store(CONFIG);
const viewport = $('#viewport');
const stages = [];

/** 스테이지 한 대를 만든다. both 모드에서는 컨테이너 크기에 맞춰 축소된다. */
function mountScreen(kind) {
  const pane = el('div', { class: 'pane', 'data-kind': kind });
  const inner = el('div', { class: 'pane-stage', 'data-screen-root': kind });
  pane.append(
    SCREEN === 'both' ? el('span', { class: 'pane-label',
      text: kind === 'touch' ? '터치모니터' : '대형모니터' }) : '',
    el('div', { class: 'pane-frame' }, inner));
  viewport.append(pane);

  const stage = new Stage(inner, {
    ...CONFIG.stage,
    container: SCREEN === 'both' ? pane.querySelector('.pane-frame') : null,
  });
  stages.push(stage);

  const View = kind === 'touch' ? TouchView : DisplayView;
  return new View(inner, store);
}

viewport.dataset.mode = SCREEN;
if (SCREEN === 'touch' || SCREEN === 'both') mountScreen('touch');
if (SCREEN === 'display' || SCREEN === 'both') mountScreen('display');

/* --------------------------------------------------------------------------
   화면 간 동기화
   -------------------------------------------------------------------------- */

// 터치모니터가 상태를 쥔다. 대형모니터만 띄운 창은 따라 그리기만 한다.
const role = SCREEN === 'display' ? 'follower' : 'controller';
const sync = SCREEN === 'both' ? null : new SyncBus(CONFIG.sync.channel, { role, store });

/* --------------------------------------------------------------------------
   단계 진행
   -------------------------------------------------------------------------- */

// 시나리오가 시작되면 단계가 스스로 넘어간다. 마지막 단계에서 멈추고,
// 그 뒤로는 관람객이 앞뒤 시나리오를 고르거나 유휴 복귀를 기다린다.
let stepTimer = 0;

function scheduleSteps() {
  clearTimeout(stepTimer);
  if (role !== 'controller') return;             // 진행은 컨트롤러만 맡는다
  if (store.state.view !== VIEW.PLAYING) return;
  if (store.atLastStep()) return;
  stepTimer = setTimeout(() => {
    store.nextStep();
  }, CONFIG.stepMs);
}

store.subscribe((state, prev) => {
  if (!prev) return;
  const moved = prev.view !== state.view
    || prev.sceneId !== state.sceneId
    || prev.stepIndex !== state.stepIndex;
  if (moved) scheduleSteps();
});

/* --------------------------------------------------------------------------
   키오스크 셸
   -------------------------------------------------------------------------- */

const kiosk = new Kiosk({
  idleMs: CONFIG.kiosk.idleMs,

  // 메뉴에 서 있을 때는 되돌릴 것이 없다
  onIdle() {
    if (role === 'controller' && store.state.view !== VIEW.MENU) store.openMenu();
  },

  keys: {
    Escape: () => store.openMenu(),
    Home: () => store.openMenu(),
    ArrowLeft: () => store.moveScene(-1),
    ArrowRight: () => store.moveScene(1),
    ArrowDown: () => store.nextStep(),
    r: () => store.openMenu(),
    R: () => store.openMenu(),
  },

  debugNode: $('#debug'),
  debugInfo: () => {
    const s = store.state;
    const sc = store.scene();
    return [
      `SCREEN ${SCREEN}  ROLE ${role}${sync ? '' : ' (동기화 없음)'}`,
      `VIEW   ${s.view}  CAT ${s.categoryId || '-'}`,
      `SCENE  ${sc ? sc.title : '-'}  STEP ${sc ? s.stepIndex + 1 : 0}/${sc ? sc.steps.length : 0}`,
      `REV    ${s.rev}   SCALE ${stages.map((g) => g.scale.toFixed(2)).join(' / ')}`,
      '',
      'ESC/HOME 처음으로  ←/→ 시나리오  ↓ 다음 단계  F 전체화면  D 디버그',
    ].join('\n');
  },
});

if (DEBUG_ON) kiosk.toggleDebug();

// 대형모니터만 띄운 창은 관람객이 만질 일이 없다
if (SCREEN === 'display') document.body.classList.add('is-display-only');

scheduleSteps();
