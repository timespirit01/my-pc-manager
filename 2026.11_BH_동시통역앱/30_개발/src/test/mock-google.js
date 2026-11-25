// 검증용 가짜 Google 서버.
// 실제 Gemini Live API와 같은 주소·메시지 형식으로 응답하므로 앱의 실제 접속 코드가 그대로 시험된다.
// 언어 구분은 시험용 음성의 음높이로 흉내 낸다: 낮은 음(약 250Hz)=한국어, 높은 음(약 1100Hz)=영어.
// 통역 품질이나 실제 응답 속도는 이 서버로 알 수 없다.

import http from 'node:http';
import { WebSocketServer } from 'ws';

const WS_PATH = '/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const WORDS = {
  ko: ['안녕하세요,', '만나서', '반갑습니다.', '오늘', '기분이', '어떠세요?', '저는', '아주', '좋습니다.'],
  en: ['Hello,', 'nice', 'to', 'meet', 'you.', 'How', 'are', 'you', 'today?'],
};
const STEP_MS = 250;

function tone(ms, rate = 24000) {
  const n = Math.round((rate * ms) / 1000);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 330 * i) / rate) * 1500);
  return Buffer.from(pcm.buffer).toString('base64');
}
const AUDIO_STEP = tone(STEP_MS);
const SILENT_STEP = Buffer.alloc((24000 * STEP_MS * 2) / 1000).toString('base64'); // 완전한 무음

export async function startMock({ port, expectedKey = null, langCodes = true, goAwayAfterMs = 0, firstOutputMs = 350 } = {}) {
  const mock = {
    opts: { langCodes, goAwayAfterMs, firstOutputMs },
    tokenRequests: [],
    sessions: [],
    sockets: new Set(),
    dropAll() {
      for (const ws of this.sockets) ws.terminate();
    },
    live() {
      return this.sessions.filter((s) => s.ready && !s.closedAt);
    },
    async close() {
      this.dropAll();
      await new Promise((r) => server.close(r));
    },
  };

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.startsWith('/v1alpha/auth_tokens')) {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        const key = req.headers['x-goog-api-key'];
        mock.tokenRequests.push({ key, body: JSON.parse(data || '{}'), at: Date.now() });
        res.setHeader('content-type', 'application/json');
        if (expectedKey && key !== expectedKey) {
          res.writeHead(401).end(
            JSON.stringify({
              error: { code: 401, status: 'UNAUTHENTICATED', details: [{ reason: 'API_KEY_SERVICE_BLOCKED' }] },
            }),
          );
          return;
        }
        res.writeHead(200).end(JSON.stringify({ name: `auth_tokens/mock-${mock.tokenRequests.length}` }));
      });
      return;
    }
    if (req.method === 'POST' && /:generateContent$/.test(req.url)) {
      // 음성 합성 흉내: 한국어 역의 낮은 음 1.5초
      const n = 36000;
      const pcm = new Int16Array(n);
      for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 250 * i) / 24000) * 12000);
      req.resume();
      res.setHeader('content-type', 'application/json');
      res.writeHead(200).end(
        JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.from(pcm.buffer).toString('base64') } }] } }] }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('access_token') || '';
    if (url.pathname !== WS_PATH || !token.startsWith('auth_tokens/mock-')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => session(ws, token));
  });

  // 실제 엔진에서 실측한 동작(2026-11-25, docs/checks.md)을 흉내 낸다:
  //  - 음성이 들어오기 시작하면 250ms마다 출력 음성 조각을 계속 보낸다. 통역할 말이 없으면 완전한 무음(0)이다.
  //  - 한 마디가 끝났다는 신호(turnComplete)를 보내지 않는다.
  //  - 음성이 들어오는 동안에만 통역을 진행한다. 말 뒤에 입력이 끊기면 문장 끝부분은 통역되지 않는다.
  //  - audioStreamEnd를 보내도 남은 통역을 마저 내보내지 않는다.
  function session(ws, token) {
    mock.sockets.add(ws);
    const rec = {
      id: mock.sessions.length + 1,
      token,
      target: null,
      setup: null,
      resumedFrom: null,
      ready: false,
      openedAt: Date.now(),
      closedAt: 0,
      frames: [], // 음성 조각이 도착한 시각
      silentFrames: 0, // 그중 완전한 무음 조각 수
      streamEnds: 0,
      silentSent: 0, // 내보낸 무음 출력 조각 수
      outputs: [], // { start, end } 통역 음성을 내보낸 구간
      voiced: [], // 통역 음성 조각(250ms)을 내보낸 시각
    };
    mock.sessions.push(rec);
    const send = (obj) => ws.readyState === 1 && ws.send(Buffer.from(JSON.stringify(obj))); // 실제 서버처럼 이진 프레임
    const sendAudio = (data) => send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data } }] } } });
    let utt = null;
    let silenceMs = 0;
    let lastVoiced = 0;
    let ticker = null;

    const speak = (now) => {
      const words = WORDS[rec.target];
      if (!utt.out.start) {
        utt.out.start = now;
        rec.outputs.push(utt.out);
      }
      utt.out.end = now + STEP_MS;
      lastVoiced = now;
      rec.voiced.push(now);
      send({ serverContent: { outputTranscription: { text: (utt.outN ? ' ' : '') + words[utt.outN++ % words.length] } } });
      sendAudio(AUDIO_STEP);
    };

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.setup) {
        const tc = msg.setup.generationConfig && msg.setup.generationConfig.translationConfig;
        if (!msg.setup.model || !tc || !tc.targetLanguageCode) {
          ws.close(1007, 'invalid setup');
          return;
        }
        rec.setup = msg.setup;
        rec.target = tc.targetLanguageCode;
        rec.resumedFrom = (msg.setup.sessionResumption && msg.setup.sessionResumption.handle) || null;
        rec.ready = true;
        send({ setupComplete: {} });
        send({ sessionResumptionUpdate: { newHandle: `handle-${rec.id}`, resumable: true } });
        if (mock.opts.goAwayAfterMs) {
          setTimeout(() => send({ goAway: { timeLeft: '14s' } }), mock.opts.goAwayAfterMs);
          setTimeout(() => ws.close(1000, 'session time limit'), mock.opts.goAwayAfterMs + 14000);
        }
        return;
      }
      const ri = msg.realtimeInput;
      if (!ri || !rec.ready) return;
      if (ri.audioStreamEnd) {
        rec.streamEnds++;
        return;
      }
      if (!ri.audio || !ri.audio.data) return;

      const buf = Buffer.from(ri.audio.data, 'base64');
      const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
      const now = Date.now();
      rec.frames.push(now);
      // 첫 음성이 들어온 뒤로는 출력 흐름이 끊기지 않는다 (말이 없으면 무음 조각).
      if (!ticker) {
        ticker = setInterval(() => {
          if (Date.now() - lastVoiced >= STEP_MS - 30) {
            rec.silentSent++;
            sendAudio(SILENT_STEP);
            if (rec.silentSent % 4 === 0) send({ serverContent: { outputTranscription: {} } }); // 빈 자막도 섞여 온다
          }
        }, STEP_MS);
      }
      let sum = 0;
      let crossings = 0;
      for (let i = 0; i < pcm.length; i++) {
        sum += pcm[i] * pcm[i];
        if (i && pcm[i - 1] < 0 !== pcm[i] < 0) crossings++;
      }
      const ms = (pcm.length / 16000) * 1000;
      const rms = Math.sqrt(sum / Math.max(1, pcm.length)) / 32768;
      const speech = rms > 0.02;
      if (sum === 0) rec.silentFrames++;

      if (!speech) {
        silenceMs += ms;
        if (!utt) return;
        if (!utt.translating) {
          if (silenceMs >= 400) utt = null;
          return;
        }
        // 문장 끝부분은 말이 끝난 뒤에도 입력이 이어져야 나온다.
        if (silenceMs >= 700 && utt.tail === 0) {
          utt.tail = 1;
          speak(now);
        } else if (silenceMs >= 1400 && utt.tail === 1) {
          speak(now);
          utt = null;
        }
        return;
      }
      silenceMs = 0;
      if (!utt) {
        // 첫 조각은 소리가 중간에 시작돼 음높이가 낮게 잡힐 수 있으므로 판정에서 뺀다.
        utt = { lang: null, probeCross: 0, probeMs: 0, start: now, lastIn: 0, lastOut: 0, inN: 0, outN: 0, tail: 0, translating: false, out: { start: 0, end: 0 } };
        return;
      }
      if (!utt.lang) {
        utt.probeCross += crossings;
        utt.probeMs += ms;
        if (utt.probeMs < 120) return;
        utt.lang = utt.probeCross / 2 / (utt.probeMs / 1000) < 600 ? 'ko' : 'en';
        utt.translating = utt.lang !== rec.target;
      }
      if (now - utt.lastIn >= STEP_MS) {
        utt.lastIn = now;
        const t = { text: (utt.inN ? ' ' : '') + WORDS[utt.lang][utt.inN++ % WORDS[utt.lang].length] };
        if (mock.opts.langCodes) t.languageCode = utt.lang;
        send({ serverContent: { inputTranscription: t } });
      }
      if (utt.translating && now - utt.start >= mock.opts.firstOutputMs && now - utt.lastOut >= STEP_MS) {
        utt.lastOut = now;
        speak(now);
      }
    });

    ws.on('close', () => {
      rec.closedAt = Date.now();
      clearInterval(ticker);
      mock.sockets.delete(ws);
    });
  }

  await new Promise((r) => server.listen(port, r));
  mock.port = server.address().port;
  return mock;
}
