// 화면 동작. 통역 로직은 interpreter.js, 문안과 조정값은 config.js에 있다.

import { CONFIG, LANGUAGES, STRINGS } from './config.js';
import { Interpreter } from './interpreter.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// 브라우저 저장소는 막혀 있을 수 있다(사생활 보호 모드 등). 없어도 앱은 돌아가야 한다.
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('majoo.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('majoo.' + key, JSON.stringify(value));
    } catch {
      /* 저장 못 해도 계속 */
    }
  },
};

const knownLang = (code) => LANGUAGES.some((l) => l.code === code);

const state = {
  partnerLang: knownLang(store.get('lang')) ? store.get('lang') : CONFIG.defaultPartnerLang,
  mode: store.get('mode', 'auto') === 'button' ? 'button' : 'auto',
  scale: Number(store.get('scale', 1)) || 1,
  showMeter: !!store.get('meter', false),
  passcode: store.get('passcode', ''),
  status: { conn: 'idle', listening: false, mode: 'auto', activeSide: null, busy: false },
  autoPaused: false,
  lags: [],
  bannerKind: null,
};

const app = $('app');
const panes = {
  me: { el: $('pane-me'), log: $('log-me'), intro: $('intro-me'), status: $('status-me'), talk: $('talk-me') },
  partner: {
    el: $('pane-partner'),
    log: $('log-partner'),
    intro: $('intro-partner'),
    status: $('status-partner'),
    talk: $('talk-partner'),
  },
};
const strings = (side) => (side === 'me' ? STRINGS[CONFIG.myLang] : STRINGS[state.partnerLang] || STRINGS.en);

// 화면 낭독기에는 끝난 문장만 알린다 (글자가 흘러나올 때마다 읽으면 시끄럽다).
for (const side of ['me', 'partner']) {
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  panes[side].el.appendChild(live);
  panes[side].live = live;
}

// ---------- 통역 서버 접속 ----------

async function getToken() {
  let res;
  try {
    res = await fetch('api/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passcode: state.passcode }),
    });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  if (res.status === 401) throw Object.assign(new Error('passcode'), { code: 'passcode' });
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* 본문 없음 */
  }
  if (!res.ok || !body.wsUrl) {
    throw Object.assign(new Error('server'), { code: body.code || 'server', detail: body.detail || String(res.status) });
  }
  return body;
}

const interp = new Interpreter({
  config: CONFIG,
  getToken,
  myLang: CONFIG.myLang,
  partnerLang: state.partnerLang,
  mode: state.mode,
  micProcessing: params.get('rawmic') !== '1',
  on: {
    status: (s) => {
      state.status = s;
      if (s.conn === 'ready' && state.bannerKind === 'conn') hideBanner();
      renderStatus();
    },
    turn: renderTurn,
    level: (rms) => {
      levelTarget = Math.min(1, rms * 7);
    },
    error: showError,
    metric: (m) => {
      state.lags.push(m.lagMs);
      renderMeter();
    },
    autoPaused: () => {
      state.autoPaused = true;
      releaseWake();
      renderStatus();
    },
  },
});

// ---------- 문안과 상태 ----------

function applyLanguage() {
  const lang = LANGUAGES.find((l) => l.code === state.partnerLang);
  panes.partner.el.lang = state.partnerLang;
  $('lang-value').textContent = lang.name;
  $('btn-lang').setAttribute('aria-label', `상대 언어: ${lang.ko}. 바꾸려면 누르세요`);
  for (const side of ['me', 'partner']) {
    const S = strings(side);
    for (const el of panes[side].el.querySelectorAll('[data-s]')) el.textContent = S[el.dataset.s] || '';
  }
  for (const grid of [$('onboard-langs'), $('sheet-langs')]) {
    for (const b of grid.children) b.setAttribute('aria-checked', String(b.dataset.code === state.partnerLang));
  }
  renderStatus();
}

function sideStatus(side) {
  const s = state.status;
  const S = strings(side);
  const mine = side === 'me';
  const connecting = s.conn === 'connecting' || s.conn === 'reconnecting';

  if (s.mode === 'button') {
    if (s.conn === 'blocked') return ['paused', mine ? '연결할 수 없습니다' : ''];
    if (s.listening && connecting) return ['reconnecting', mine && s.conn === 'connecting' ? S.connecting : S.reconnecting];
    if (s.activeSide === side) return ['speak', '']; // 버튼 자체가 "말씀하세요"로 바뀐다
    if (s.busy) return ['interpreting', S.interpreting];
    return ['idle', ''];
  }
  if (!s.listening) {
    if (!mine) return ['paused', S.paused];
    return ['paused', state.autoPaused ? '멈췄습니다. 가운데 버튼을 누르면 다시 시작합니다' : '가운데 버튼을 눌러 시작하세요'];
  }
  if (s.conn === 'blocked') return ['paused', mine ? '연결할 수 없습니다' : S.paused];
  if (connecting) return ['reconnecting', mine && s.conn === 'connecting' ? S.connecting : S.reconnecting];
  if (s.busy) return ['interpreting', S.interpreting];
  return ['listening', S.listening];
}

function renderStatus() {
  const s = state.status;
  app.dataset.mode = s.mode;
  app.dataset.listening = String(s.listening);
  app.dataset.conn = s.conn;

  const mic = $('btn-mic');
  mic.setAttribute('aria-pressed', String(s.listening));
  mic.setAttribute('aria-label', s.listening ? '듣기 멈추기' : '대화 시작');

  for (const side of ['me', 'partner']) {
    const p = panes[side];
    const [key, text] = sideStatus(side);
    p.status.dataset.state = key;
    p.status.querySelector('.status__text').textContent = text;
    p.status.hidden = !text; // 보여 줄 말이 없으면 자리도 차지하지 않는다
    const pressed = s.mode === 'button' && s.activeSide === side;
    p.talk.setAttribute('aria-pressed', String(pressed));
    p.talk.querySelector('.talk__label').textContent = pressed ? strings(side).speakNow : strings(side).tapToSpeak;
  }
}

// 마이크 음량을 버튼 테두리로 보여 준다: 앱이 듣고 있다는 가장 빠른 신호다.
let levelTarget = 0;
let level = 0;
function animateLevel() {
  level += (levelTarget - level) * 0.35;
  levelTarget *= 0.9;
  app.style.setProperty('--level', state.status.listening ? level.toFixed(3) : '0');
  requestAnimationFrame(animateLevel);
}
requestAnimationFrame(animateLevel);

// ---------- 대화 내용 ----------

const turnEls = new Map();
const PLAY_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

function addMessage(side, kind) {
  const p = panes[side];
  if (p.intro.isConnected) p.intro.remove();
  const el = document.createElement('div');
  el.className = `msg msg--${kind}`;
  const text = document.createElement('p');
  text.className = 'msg__text';
  text.dir = 'auto';
  el.appendChild(text);
  p.log.appendChild(el);
  while (p.log.children.length > 80) p.log.firstElementChild.remove();
  if (kind === 'in') {
    for (const old of p.log.querySelectorAll('.msg--in.is-latest')) old.classList.remove('is-latest');
    el.classList.add('is-latest');
  }
  return el;
}

function renderTurn(t) {
  const ownSide = t.dir === 'out' ? 'me' : 'partner';
  const inSide = t.dir === 'out' ? 'partner' : 'me';
  let els = turnEls.get(t.id);
  if (!els) {
    els = {};
    turnEls.set(t.id, els);
  }
  if (t.original) {
    els.own = els.own || addMessage(ownSide, 'own');
    els.own.firstChild.textContent = t.original;
  }
  if (t.translated) {
    els.inc = els.inc || addMessage(inSide, 'in');
    els.inc.firstChild.textContent = t.translated;
    if (t.hasAudio && !els.inc.querySelector('.msg__replay')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'msg__replay';
      b.setAttribute('aria-label', strings(inSide).replay);
      b.innerHTML = PLAY_ICON;
      b.addEventListener('click', () => interp.replay(t.id, t.dir));
      els.inc.appendChild(b);
    }
  }
  for (const el of [els.own, els.inc]) if (el) el.classList.toggle('is-live', !t.final);
  for (const side of [ownSide, inSide]) panes[side].log.scrollTop = panes[side].log.scrollHeight;
  if (t.final) {
    if (t.translated) panes[inSide].live.textContent = t.translated;
    turnEls.delete(t.id);
  }
}

// 화면 구성이 바뀌면(글자 크기, 대화 방식) 가장 최근 말이 보이게 다시 맞춘다.
function scrollLogs() {
  requestAnimationFrame(() => {
    for (const side of ['me', 'partner']) panes[side].log.scrollTop = panes[side].log.scrollHeight;
  });
}

function clearConversation() {
  interp.clear();
  turnEls.clear();
  for (const side of ['me', 'partner']) {
    const p = panes[side];
    p.log.replaceChildren(p.intro);
    p.live.textContent = '';
  }
  state.lags = [];
  renderMeter();
}

// ---------- 응답 속도 ----------

function renderMeter() {
  const box = $('meter');
  box.hidden = !state.showMeter;
  if (!state.showMeter) return;
  const lags = state.lags;
  if (!lags.length) {
    $('meter-text').textContent = '응답 속도: 측정 전';
    return;
  }
  const last = lags[lags.length - 1];
  const sorted = [...lags].sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  const within = lags.filter((v) => v <= CONFIG.latencyTargetMs).length;
  const fmt = (ms) => (ms <= 0 ? '말하는 중 시작' : (ms / 1000).toFixed(1) + '초');
  $('meter-text').textContent = `통역 시작 ${fmt(last)} · 중앙값 ${fmt(median)} · 1초 이내 ${within}/${lags.length}`;
}

// ---------- 알림 ----------

function showBanner(kind, text, actionLabel, action) {
  state.bannerKind = kind;
  $('banner-text').textContent = text;
  const btn = $('banner-btn');
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel || '';
  btn.onclick = action || null;
  $('banner').hidden = false;
}

function hideBanner() {
  state.bannerKind = null;
  $('banner').hidden = true;
}

function showError(e) {
  const retry = () => {
    hideBanner();
    interp.retry();
  };
  switch (e.code) {
    case 'passcode':
      askPasscode(!!state.passcode);
      break;
    case 'network':
      showBanner('conn', '인터넷 연결이 끊겼습니다. 다시 연결되면 자동으로 이어집니다.');
      break;
    case 'config':
      showBanner('fatal', '통역 서버에 API 키나 접속 암호가 설정되어 있지 않습니다. 배포 설정을 확인해 주세요.', '다시 시도', retry);
      break;
    case 'upstream':
      showBanner('fatal', `통역 서버의 API 키가 거절됐습니다. 키 설정을 확인해 주세요. (${e.detail || '원인 불명'})`, '다시 시도', retry);
      break;
    case 'engine':
      showBanner('fatal', `통역 엔진에 연결하지 못했습니다${e.detail ? ` (${e.detail})` : ''}.`, '다시 시도', retry);
      break;
    case 'mic-denied':
      showBanner('mic', '마이크 권한이 꺼져 있습니다. 브라우저 설정에서 이 사이트의 마이크를 허용한 뒤 다시 시도해 주세요.', '다시 시도', startListening);
      break;
    case 'mic-missing':
      showBanner('mic', '마이크를 찾지 못했습니다. 기기의 마이크를 확인해 주세요.', '다시 시도', startListening);
      break;
    case 'mic-unsupported':
      showBanner('mic', '이 브라우저에서는 마이크를 쓸 수 없습니다. https 주소로 접속했는지 확인해 주세요.');
      break;
    case 'mic-failed':
      showBanner('mic', '마이크를 켜지 못했습니다. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.', '다시 시도', startListening);
      break;
    default:
      showBanner('fatal', `통역 서버에 연결하지 못했습니다 (${e.detail || e.code || '원인 불명'}).`, '다시 시도', retry);
  }
}

function askPasscode(wrong) {
  const dlg = $('dlg-passcode');
  if (dlg.open) return;
  $('passcode-help').textContent = wrong ? '암호가 맞지 않습니다. 다시 입력해 주세요.' : '이 앱을 쓰려면 암호가 필요합니다.';
  $('passcode').value = '';
  dlg.showModal();
}

$('form-passcode').addEventListener('submit', (ev) => {
  ev.preventDefault();
  state.passcode = $('passcode').value;
  store.set('passcode', state.passcode);
  $('dlg-passcode').close();
  hideBanner();
  interp.retry();
});

// ---------- 듣기 시작·멈춤 ----------

let wake = null;
async function acquireWake() {
  try {
    if (navigator.wakeLock && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => {
        wake = null;
      });
    }
  } catch {
    /* 화면 켜짐 유지를 못 해도 통역은 된다 */
  }
}
function releaseWake() {
  if (wake) wake.release().catch(() => {});
  wake = null;
}

async function startListening() {
  if (state.bannerKind === 'mic') hideBanner();
  try {
    await interp.start(); // 첫 줄에서 소리 재생 허용을 받으므로 탭 안에서 불러야 한다
    state.autoPaused = false;
    acquireWake();
  } catch (e) {
    showError(e);
  }
  renderStatus();
}

function stopListening() {
  interp.pause();
  state.autoPaused = false;
  releaseWake();
  renderStatus();
}

$('btn-mic').addEventListener('click', () => {
  if (interp.listening) stopListening();
  else startListening();
});

for (const side of ['me', 'partner']) {
  panes[side].talk.addEventListener('click', async () => {
    if (!interp.listening) {
      await startListening();
      if (!interp.listening) return;
    }
    interp.setActiveSide(interp.activeSide === side ? null : side);
  });
}

// 화면이 꺼지거나 다른 앱으로 가면 마이크를 끈다.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && interp.listening) {
    interp.pause();
    state.autoPaused = true;
    releaseWake();
    renderStatus();
  }
});

// ---------- 언어 고르기 ----------

function buildLangGrid(grid, onPick) {
  for (const l of LANGUAGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.code = l.code;
    b.lang = l.code;
    b.innerHTML = '<span class="lang__name"></span><span class="lang__ko" lang="ko"></span>';
    b.children[0].textContent = l.name;
    b.children[1].textContent = l.ko;
    b.addEventListener('click', () => onPick(l.code));
    grid.appendChild(b);
  }
}

function setPartnerLang(code) {
  if (code === state.partnerLang) return;
  state.partnerLang = code;
  store.set('lang', code);
  clearConversation(); // 지난 대화는 이전 언어로 쓰여 있다
  interp.setPartnerLang(code);
  applyLanguage();
}

buildLangGrid($('onboard-langs'), setPartnerLang);
buildLangGrid($('sheet-langs'), (code) => {
  setPartnerLang(code);
  $('sheet-lang').close();
});
$('btn-lang').addEventListener('click', () => $('sheet-lang').showModal());

// ---------- 설정 ----------

const MODE_HELP = {
  auto: '버튼을 누르지 않아도 누가 어떤 언어로 말하는지 알아서 구분합니다.',
  button: '말할 사람이 자기 쪽 버튼을 누릅니다. 시끄러운 곳에서 더 정확합니다.',
};

function renderSettings() {
  for (const b of $('seg-mode').children) b.setAttribute('aria-checked', String(b.dataset.value === state.mode));
  for (const b of $('seg-size').children) b.setAttribute('aria-checked', String(Number(b.dataset.value) === state.scale));
  $('help-mode').textContent = MODE_HELP[state.mode];
  $('chk-meter').checked = state.showMeter;
  document.documentElement.style.setProperty('--scale', String(state.scale));
  renderMeter();
  scrollLogs();
}

$('btn-settings').addEventListener('click', () => $('sheet-settings').showModal());

$('seg-mode').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  state.mode = b.dataset.value;
  store.set('mode', state.mode);
  interp.setMode(state.mode);
  renderSettings();
});

$('seg-size').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  state.scale = Number(b.dataset.value);
  store.set('scale', state.scale);
  renderSettings();
});

$('chk-meter').addEventListener('change', (ev) => {
  state.showMeter = ev.target.checked;
  store.set('meter', state.showMeter);
  renderMeter();
});

$('btn-clear').addEventListener('click', () => {
  clearConversation();
  $('sheet-settings').close();
});
$('btn-passcode').addEventListener('click', () => {
  $('sheet-settings').close();
  askPasscode(false);
});
$('btn-guide').addEventListener('click', () => {
  $('sheet-settings').close();
  if (interp.listening) stopListening();
  $('onboard').hidden = false;
});

// 창 바깥(어두운 부분)을 누르면 닫는다.
for (const id of ['sheet-lang', 'sheet-settings']) {
  $(id).addEventListener('click', (ev) => {
    if (ev.target === ev.currentTarget) ev.currentTarget.close();
  });
}

// ---------- 처음 안내 ----------

$('onboard-start').addEventListener('click', () => {
  store.set('onboarded', true);
  $('onboard').hidden = true;
  if (state.mode === 'auto') startListening();
  else {
    interp.ensureAudio();
    interp.prepare();
  }
});

// ---------- 시작 ----------

applyLanguage();
renderSettings();

if (store.get('onboarded', false) && params.get('guide') !== '1') {
  interp.prepare(); // 미리 연결해 두어 첫 통역이 늦지 않게 한다
} else {
  $('onboard').hidden = false;
}

// 실기기 검수와 자동 검사에서 측정값을 읽을 수 있게 한다.
window.__majoo = { state, interp };
