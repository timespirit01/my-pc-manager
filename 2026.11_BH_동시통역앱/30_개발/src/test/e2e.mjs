// 자동 검사: 실제 브라우저(Chromium) + 가짜 Google 서버.
// 실행: npm test            (전체)
//       npm test -- shots   (화면 캡처만)
//       npm test -- soak    (15분 연속 대화)
//
// 가짜 마이크 입력으로 "한국어 2.4초 → 쉼 → 영어 2.4초 → 쉼"이 반복되는 음성 파일을 쓴다.
// 통역 품질과 실제 엔진의 응답 속도는 여기서 확인할 수 없다 (docs/checks.md 참고).

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.js';
import { startMock } from './mock-google.js';
import { issueToken, checkHealth } from '../lib/issue-token.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const SECRET = 'TEST-SECRET-KEY-do-not-leak-9f3a';
const only = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 시험용 음성 ----------

function makeWav(file) {
  const rate = 48000;
  const plan = [
    [0, 0.6],
    [250, 2.4], // 한국어 역
    [0, 2.6],
    [1100, 2.4], // 영어 역
    [0, 3.0],
  ];
  const total = Math.round(plan.reduce((s, p) => s + p[1], 0) * rate);
  const pcm = new Int16Array(total);
  let i = 0;
  for (const [freq, sec] of plan) {
    const n = Math.round(sec * rate);
    for (let k = 0; k < n; k++, i++) {
      if (!freq) continue;
      const t = k / rate;
      const syllable = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t); // 말소리처럼 크기가 출렁이게
      const edge = Math.min(1, k / 2400, (n - k) / 2400);
      pcm[i] = Math.round(Math.sin(2 * Math.PI * freq * t) * 0.5 * syllable * edge * 32767);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  writeFileSync(file, Buffer.concat([header, Buffer.from(pcm.buffer)]));
}

const WAV = path.join(OUT, 'conversation.wav');
makeWav(WAV);

// ---------- 틀 ----------

const results = [];
function check(id, name, pass, detail = '') {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${WAV}`,
  ],
});

async function setup({ env = {}, mockOpts = {}, ctxOpts = {}, onboarded = false, query = '' } = {}) {
  const mock = await startMock({ port: 0, expectedKey: SECRET, ...mockOpts });
  const server = await startServer({
    port: 0,
    env: {
      GEMINI_API_KEY: SECRET,
      GEMINI_API_BASE: `http://127.0.0.1:${mock.port}`,
      GEMINI_WS_BASE: `ws://127.0.0.1:${mock.port}`,
      ...env,
    },
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['microphone'],
    ...ctxOpts,
  });
  const seen = []; // 브라우저가 주고받은 모든 것 (API 키 노출 검사용)
  const page = await context.newPage();
  page.on('request', (r) => seen.push(r.url() + ' ' + (r.postData() || '') + ' ' + JSON.stringify(r.headers())));
  page.on('response', async (r) => {
    if (r.url().includes('/api/token')) seen.push(await r.text().catch(() => ''));
  });
  page.on('websocket', (ws) => {
    seen.push(ws.url());
    ws.on('framesent', (f) => seen.push(String(f.payload).slice(0, 300)));
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (onboarded) await context.addInitScript(() => localStorage.setItem('majoo.onboarded', 'true'));
  await page.goto(base + '/' + query);
  const close = async () => {
    await context.close();
    await mock.close();
    await new Promise((r) => server.close(r));
  };
  return { mock, page, context, seen, errors, close, base };
}

const text = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));
const waitText = (page, sel, needle, timeout = 15000) =>
  page.waitForFunction(([s, n]) => [...document.querySelectorAll(s)].some((e) => e.textContent.includes(n)), [sel, needle], { timeout });

// ---------- 1. 자동 방식 양방향 대화 ----------

async function testAuto() {
  const t = await setup();
  const { page, mock } = t;
  const onboardShown = await page.isVisible('#onboard');
  await page.click('#onboard-start');
  await page.waitForSelector('#app[data-listening="true"]');
  await waitText(page, '#pane-partner .msg--in', 'Hello');
  await waitText(page, '#pane-me .msg--own', '안녕하세요');
  await waitText(page, '#pane-me .msg--in', '안녕하세요');
  await waitText(page, '#pane-partner .msg--own', 'Hello');
  await sleep(2500);

  const meOwn = await text(page, '#pane-me .msg--own');
  const meIn = await text(page, '#pane-me .msg--in');
  const ptOwn = await text(page, '#pane-partner .msg--own');
  const ptIn = await text(page, '#pane-partner .msg--in');
  check('A1', '처음 실행 시 안내 화면이 보인다', onboardShown);
  check('A2', '한국어 → 상대 화면에 통역 자막, 내 화면에 원문', ptIn[0]?.startsWith('Hello') && meOwn[0]?.startsWith('안녕하세요'), `상대: "${ptIn[0]}" / 나: "${meOwn[0]}"`);
  check('A3', '영어 → 내 화면에 통역 자막, 상대 화면에 원문', meIn[0]?.startsWith('안녕하세요') && ptOwn[0]?.startsWith('Hello'), `나: "${meIn[0]}" / 상대: "${ptOwn[0]}"`);

  // 두 세션이 같은 말을 듣지만 화면에는 한 번만 나와야 한다.
  const koUtterances = mock.sessions.find((s) => s.target === 'en').outputs.length;
  check('A4', '같은 말이 두 번 표시되지 않는다', meOwn.length === koUtterances && ptIn.length === koUtterances, `한국어 발화 ${koUtterances}회, 내 원문 ${meOwn.length}개, 상대 자막 ${ptIn.length}개`);

  const rot = await page.$eval('#pane-partner', (el) => getComputedStyle(el).transform);
  check('A5', '상대 쪽 화면이 180° 뒤집혀 있다', rot.startsWith('matrix(-1, 0, 0, -1'), rot);

  // 되울림 차단: 한쪽 통역 음성이 나가는 동안 반대 방향 세션은 마이크 음성을 받지 않는다.
  const out = mock.sessions.find((s) => s.target === 'en');
  const inn = mock.sessions.find((s) => s.target === 'ko');
  const leaked = (speaker, listener) =>
    speaker.outputs.reduce((n, o) => n + listener.frames.filter((f) => f > o.start + 250 && f < o.end - 50).length, 0);
  const leak = leaked(out, inn) + leaked(inn, out);
  const framesDuring = out.outputs.reduce((n, o) => n + out.frames.filter((f) => f > o.start + 250 && f < o.end - 50).length, 0);
  check('A6', '통역 음성 재생 중 반대 방향 세션으로 음성이 가지 않는다', leak === 0 && framesDuring > 10, `새어 나간 조각 ${leak}개, 말하는 쪽 세션은 ${framesDuring}개 수신`);

  const setupMsg = out.setup;
  check(
    'A7',
    '엔진 설정 메시지가 사양과 같다',
    setupMsg.model === 'models/gemini-3.5-live-translate-preview' &&
      setupMsg.generationConfig.translationConfig.echoTargetLanguage === false &&
      setupMsg.generationConfig.responseModalities[0] === 'AUDIO' &&
      !!setupMsg.inputAudioTranscription &&
      !!setupMsg.outputAudioTranscription &&
      inn.setup.generationConfig.translationConfig.targetLanguageCode === 'ko',
    `목표 언어 ${out.target}/${inn.target}`,
  );

  // 음성 조각 간격 (지연에 직접 영향)
  const gaps = out.frames.slice(1).map((f, i) => f - out.frames[i]).filter((g) => g < 500).sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];
  check('A8', '마이크 음성을 40ms 안팎 간격으로 보낸다', medianGap >= 25 && medianGap <= 60, `중앙값 ${medianGap}ms`);

  const leakedKey = t.seen.some((s) => s.includes(SECRET));
  check('C7', 'API 키가 브라우저로 내려가지 않는다', !leakedKey && mock.tokenRequests[0].key === SECRET, `브라우저 통신 ${t.seen.length}건 검사, 토큰 요청 ${mock.tokenRequests.length}건`);
  const tr = mock.tokenRequests[0].body;
  check('A9', '임시 토큰이 1회용·단기 수명으로 발급된다', tr.uses === 1 && new Date(tr.expireTime) - Date.now() < 31 * 60000 && new Date(tr.newSessionExpireTime) - Date.now() < 61000);

  const replay = await page.$('#pane-partner .msg--in .msg__replay');
  check('A10', '통역 자막에 다시 듣기 버튼이 있다', !!replay);

  const lags = await page.evaluate(() => window.__majoo.state.lags);
  console.log(`      (참고) 가짜 서버 기준 "말 끝 → 통역 음성" 측정값: ${JSON.stringify(lags)} ms — 실제 엔진 값이 아님`);
  check('A11', '응답 속도 측정 기능이 값을 기록한다', lags.length > 0, `${lags.length}건`);

  // 멈춤
  await page.click('#btn-mic');
  await page.waitForSelector('#app[data-listening="false"]');
  const before = out.frames.length;
  await sleep(600);
  check('A12', '가운데 버튼으로 멈추면 음성 전송이 멈춘다', out.frames.length === before && out.streamEnds >= 1);
  check('A13', '브라우저 오류 없음', t.errors.length === 0, t.errors.join(' | '));
  await t.close();
}

// ---------- 2. 언어 코드를 주지 않는 엔진 ----------

async function testNoLangCodes() {
  const t = await setup({ mockOpts: { langCodes: false } });
  const { page, mock } = t;
  await page.click('#onboard-start');
  await waitText(page, '#pane-me .msg--in', '안녕하세요');
  await waitText(page, '#pane-partner .msg--own', 'Hello');
  await sleep(4000); // 영어 발화(2.4초)가 끝나 가짜 서버가 기록을 남길 때까지
  const meOwn = await text(page, '#pane-me .msg--own');
  const ptOwn = await text(page, '#pane-partner .msg--own');
  const ko = mock.sessions.find((s) => s.target === 'en').outputs.length;
  const en = mock.sessions.find((s) => s.target === 'ko').outputs.length;
  check('B1', '엔진이 언어 정보를 주지 않아도 원문이 한 번씩만 나온다', meOwn.length === ko && ptOwn.length === en && meOwn[0]?.startsWith('안녕하세요'), `내 원문 ${meOwn.length}/${ko}, 상대 원문 ${ptOwn.length}/${en}`);
  await t.close();
}

// ---------- 3. 연결 유지 ----------

async function testReconnect() {
  // (a) 엔진이 연결 시간 한도를 알림(goAway) → 사용자 모르게 갈아탄다
  let t = await setup({ mockOpts: { goAwayAfterMs: 5000 } });
  await t.page.click('#onboard-start');
  await waitText(t.page, '#pane-partner .msg--in', 'Hello');
  let sawReconnecting = false;
  const start = Date.now();
  while (Date.now() - start < 16000) {
    const conn = await t.page.getAttribute('#app', 'data-conn');
    if (conn === 'reconnecting' || conn === 'blocked') sawReconnecting = true;
    await sleep(100);
  }
  const resumed = t.mock.sessions.filter((s) => s.resumedFrom);
  const partnerMsgs = (await text(t.page, '#pane-partner .msg--in')).length;
  const dropped = t.mock.sessions.filter((s) => s.closedAt && s.outputs.some((o) => o.end > s.closedAt));
  check('C5a', '연결 시간 한도 알림을 받으면 끊김 표시 없이 새 연결로 갈아탄다', resumed.length >= 2 && !sawReconnecting && partnerMsgs >= 2, `세션 ${t.mock.sessions.length}개, 재개 ${resumed.length}개, 통역 ${partnerMsgs}건`);
  check('C5b', '통역이 나오는 도중에는 연결을 갈아타지 않는다', dropped.length === 0);
  await t.close();

  // (b) 갑자기 끊김 → 5초 안에 재연결
  t = await setup();
  await t.page.click('#onboard-start');
  await waitText(t.page, '#pane-partner .msg--in', 'Hello');
  const n0 = t.mock.sessions.length;
  const t0 = Date.now();
  t.mock.dropAll();
  await t.page.waitForFunction(() => document.querySelector('#app').dataset.conn === 'reconnecting', null, { timeout: 3000 });
  const statusText = await t.page.textContent('#status-partner .status__text');
  while (t.mock.live().length < 2 && Date.now() - t0 < 8000) await sleep(50);
  const took = Date.now() - t0;
  check('C6a', '연결이 끊기면 양쪽 화면에 표시하고 5초 안에 다시 연결한다', t.mock.live().length === 2 && took < 5000 && statusText.includes('Reconnecting'), `${took}ms, 상대 화면 "${statusText}", 세션 ${n0}→${t.mock.sessions.length}`);
  await t.close();

  // (c) 인터넷이 끊겼다가 돌아옴
  t = await setup();
  await t.page.click('#onboard-start');
  await waitText(t.page, '#pane-partner .msg--in', 'Hello');
  await t.context.setOffline(true);
  t.mock.dropAll();
  await t.page.waitForSelector('#banner:not([hidden])', { timeout: 8000 });
  const bannerText = await t.page.textContent('#banner-text');
  await sleep(2500);
  const t1 = Date.now();
  await t.context.setOffline(false);
  while (t.mock.live().length < 2 && Date.now() - t1 < 8000) await sleep(50);
  const back = Date.now() - t1;
  await t.page.waitForSelector('#banner', { state: 'hidden', timeout: 3000 }).catch(() => {});
  const bannerGone = await t.page.isHidden('#banner');
  const count0 = (await text(t.page, '#pane-partner .msg--in')).length;
  await sleep(12000);
  const count1 = (await text(t.page, '#pane-partner .msg--in')).length;
  check('C6b', '인터넷이 끊기면 안내가 뜨고, 돌아오면 5초 안에 이어진다', bannerText.includes('인터넷') && back < 5000 && bannerGone && count1 > count0, `복구 ${back}ms, 안내 "${bannerText}", 통역 ${count0}→${count1}건`);
  await t.close();
}

// ---------- 4. 접속 암호와 서버 오류 ----------

async function testAccess() {
  let t = await setup({ env: { APP_PASSCODE: 'open-sesame' } });
  await t.page.click('#onboard-start');
  await t.page.waitForSelector('#dlg-passcode[open]');
  const none = t.mock.tokenRequests.length;
  await t.page.fill('#passcode', 'wrong');
  await t.page.click('#form-passcode button[type=submit]');
  await t.page.waitForFunction(() => document.querySelector('#dlg-passcode').open && document.querySelector('#passcode-help').textContent.includes('맞지'));
  const stillNone = t.mock.tokenRequests.length;
  await t.page.fill('#passcode', 'open-sesame');
  await t.page.click('#form-passcode button[type=submit]');
  await waitText(t.page, '#pane-partner .msg--in', 'Hello');
  check('D1', '접속 암호가 틀리면 토큰을 발급하지 않고, 맞으면 통역이 시작된다', none === 0 && stillNone === 0 && t.mock.tokenRequests.length >= 2);
  await t.close();

  t = await setup({ env: { GEMINI_API_KEY: 'blocked-key' } });
  await t.page.click('#onboard-start');
  await t.page.waitForSelector('#banner:not([hidden])');
  const msg = await t.page.textContent('#banner-text');
  await sleep(3000);
  check('D2', 'API 키가 거절되면 원인을 화면에 알리고 무한 재시도하지 않는다', msg.includes('API_KEY_SERVICE_BLOCKED') && t.mock.tokenRequests.length <= 2, `"${msg}" · 토큰 요청 ${t.mock.tokenRequests.length}건`);
  await t.close();

  const noPass = await issueToken({}, { VERCEL: '1', GEMINI_API_KEY: 'k' }, async () => ({ ok: true, json: async () => ({ name: 'auth_tokens/x' }) }));
  const noKey = await issueToken({}, {}, async () => ({}));
  check('D3', '암호 없는 공개 배포와 키 없는 서버는 토큰 발급을 거부한다', noPass.status === 500 && noKey.status === 500);

  // 상태 확인 경로: 값은 내보내지 않고 설정 유무와 엔진 응답만 알려 준다.
  t = await setup({ onboarded: true });
  const health = await t.page.evaluate(() => fetch('api/health?engine=1').then((r) => r.text()));
  const h = JSON.parse(health);
  const bad = await checkHealth({ engine: true }, { GEMINI_API_KEY: 'x' }, async () => ({ ok: false, status: 400, json: async () => ({ error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }) }));
  check('D4', '상태 확인 경로가 키 값을 내보내지 않고 설정 유무와 엔진 응답만 알려 준다', h.key === true && h.passcode === false && h.engine === 'ok' && !health.includes(SECRET) && bad.engine === '400 API_KEY_INVALID', health);
  await t.close();
}

// ---------- 5. 눌러서 말하기 ----------

async function testButtonMode() {
  const t = await setup({ onboarded: true });
  const { page, mock } = t;
  await page.waitForFunction(() => document.querySelector('#app').dataset.conn === 'ready');
  check('E1', '앱을 열면 마이크를 켜기 전에 통역 세션을 미리 연결한다', mock.live().length === 2 && mock.sessions.every((s) => s.frames.length === 0));
  await page.click('#btn-settings');
  await page.click('#seg-mode button[data-value="button"]');
  await page.click('#sheet-settings .sheet__head button');
  const micHidden = await page.$eval('#btn-mic', (el) => getComputedStyle(el).visibility === 'hidden');
  await page.click('#talk-me');
  await page.waitForSelector('#talk-me[aria-pressed="true"]');
  await waitText(page, '#pane-partner .msg--in', 'Hello', 20000);
  const out = mock.sessions.find((s) => s.target === 'en');
  const inn = mock.sessions.find((s) => s.target === 'ko');
  check('E2', '내 버튼을 누르면 나→상대 세션에만 음성이 간다', out.frames.length > 20 && inn.frames.length === 0 && micHidden, `나→상대 ${out.frames.length}조각, 상대→나 ${inn.frames.length}조각`);
  await page.click('#talk-me');
  await page.waitForSelector('#talk-me[aria-pressed="false"]');
  await sleep(300);
  check('E3', '버튼을 떼면 말 끝 신호를 보낸다', out.streamEnds >= 1);
  const label = await page.textContent('#talk-partner .talk__label');
  check('E4', '상대 쪽 버튼 문구가 상대 언어로 나온다', label === 'Tap to speak', label);
  await t.close();
}

// ---------- 6. 언어 바꾸기 ----------

async function testLanguage() {
  const t = await setup({ onboarded: true });
  const { page, mock } = t;
  await page.waitForFunction(() => document.querySelector('#app').dataset.conn === 'ready');
  await page.click('#btn-lang');
  const count = await page.$$eval('#sheet-langs button', (b) => b.length);
  await page.click('#sheet-langs button[data-code="ja"]');
  await page.waitForFunction(() => document.querySelector('#intro-partner .intro__hello').textContent === 'こんにちは！');
  while (!mock.live().some((s) => s.target === 'ja')) await sleep(50);
  const lang = await page.getAttribute('#pane-partner', 'lang');
  check('C8', '상대 언어를 5개 이상 중에서 고를 수 있고, 고르면 화면과 통역 방향이 바뀐다', count >= 5 && lang === 'ja' && mock.live().length === 2, `${count}개 언어, 살아 있는 세션 목표: ${mock.live().map((s) => s.target).join(', ')}`);
  await t.close();
}

// ---------- 7. 장시간 연속 대화 (기본 15분, 따로 실행: npm test -- soak) ----------

async function testSoak() {
  const minutes = Number(process.env.SOAK_MIN || 15);
  const t = await setup();
  const { page, mock } = t;
  await page.click('#onboard-start');
  await waitText(page, '#pane-partner .msg--in', 'Hello');
  const start = Date.now();
  let badSamples = 0;
  let last = 0;
  let stalledMinutes = 0;
  let nextMark = start + 60000;
  while (Date.now() - start < minutes * 60000) {
    await sleep(1000);
    const st = await page.evaluate(() => ({ ...document.querySelector('#app').dataset }));
    if (st.conn !== 'ready' || st.listening !== 'true') badSamples++;
    if (Date.now() >= nextMark) {
      nextMark += 60000;
      const done = mock.sessions.reduce((n, s) => n + s.outputs.length, 0);
      if (done - last < 6) stalledMinutes++; // 1분에 한국어·영어 각 5회 남짓 통역된다
      console.log(`      ${Math.round((Date.now() - start) / 60000)}분: 통역 누적 ${done}건, 세션 ${mock.sessions.length}개`);
      last = done;
    }
  }
  const refreshed = mock.sessions.filter((s) => s.resumedFrom).length;
  const cut = mock.sessions.filter((s) => s.closedAt && s.outputs.some((o) => o.end > s.closedAt + 100)).length;
  const dom = await page.evaluate(() => document.querySelectorAll('.msg').length);
  check('C5', `${minutes}분 연속 대화 동안 손대지 않아도 통역이 이어진다`, badSamples === 0 && stalledMinutes === 0 && refreshed >= 2 && cut === 0 && t.errors.length === 0,
    `끊김 표시 ${badSamples}회, 통역이 멈춘 분 ${stalledMinutes}개, 연결 갈아타기 ${refreshed}회, 통역 중 끊긴 세션 ${cut}개, 화면 메시지 ${dom}개, 오류 ${t.errors.length}건`);
  await t.close();
}

// ---------- 화면 캡처 ----------

async function shots() {
  const dir = path.join(HERE, '..', '..', 'docs', 'screens');
  mkdirSync(dir, { recursive: true });
  const shot = (page, name) => page.screenshot({ path: path.join(dir, name) });

  let t = await setup({ ctxOpts: { deviceScaleFactor: 2 } });
  await sleep(300);
  await shot(t.page, '01_처음안내.png');
  await t.page.click('#onboard-start');
  await t.page.waitForSelector('#app[data-listening="true"]');
  await sleep(500);
  await shot(t.page, '02_대화시작전.png');
  await waitText(t.page, '#pane-partner .msg--in', 'nice');
  await sleep(300);
  await shot(t.page, '03_통역중.png');
  await waitText(t.page, '#pane-me .msg--in', '반갑습니다');
  await sleep(14000);
  await shot(t.page, '04_대화진행.png');
  await t.page.click('#btn-settings');
  await sleep(300);
  await shot(t.page, '05_설정.png');
  await t.page.click('#seg-mode button[data-value="button"]');
  await t.page.click('#seg-size button[data-value="1.2"]');
  await t.page.click('#sheet-settings .sheet__head button');
  await t.page.click('#talk-me');
  await sleep(1200);
  await shot(t.page, '06_눌러서말하기.png');
  await t.page.click('#btn-lang');
  await sleep(300);
  await shot(t.page, '07_언어선택.png');
  await t.close();

  t = await setup({ env: { GEMINI_API_KEY: 'blocked-key' }, onboarded: true, ctxOpts: { deviceScaleFactor: 2 } });
  await t.page.waitForSelector('#banner:not([hidden])');
  await shot(t.page, '08_오류안내.png');
  await t.close();

  t = await setup({ ctxOpts: { deviceScaleFactor: 2, colorScheme: 'dark' } });
  await t.page.click('#onboard-start');
  await waitText(t.page, '#pane-me .msg--in', '반갑습니다');
  await sleep(400);
  await shot(t.page, '09_어두운화면.png');
  await t.close();
  console.log('화면 캡처 저장:', dir);
}

// ---------- 실행 ----------

const suites = { auto: testAuto, nolang: testNoLangCodes, reconnect: testReconnect, access: testAccess, button: testButtonMode, language: testLanguage, soak: testSoak, shots };
try {
  for (const [name, fn] of Object.entries(suites)) {
    if (only ? only !== name : name === 'shots' || name === 'soak') continue;
    console.log(`\n== ${name}`);
    try {
      await fn();
    } catch (e) {
      check(name, '검사 실행', false, String(e.message || e).split('\n')[0]);
    }
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(`\n결과: ${results.length - failed.length}/${results.length} 통과`);
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
