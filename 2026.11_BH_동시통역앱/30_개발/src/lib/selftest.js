// 진단용: 서버에서 깨끗한 합성 음성을 만들어 실제 통역 엔진에 흘려 보내고, 엔진이 돌려준 것을 그대로 기록한다.
// 통역 품질 문제가 엔진 쪽인지 휴대폰의 마이크·스피커 쪽인지 가르는 데 쓴다.
// 호출할 때마다 음성 합성과 통역 요금이 조금 든다. SELFTEST_TOKEN 환경 변수가 있을 때만 동작한다.

import { mintToken } from './issue-token.js';

const API = 'https://generativelanguage.googleapis.com';
const WS = 'wss://generativelanguage.googleapis.com';
const CONSTRAINED = '/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

const SAMPLES = {
  ko: '안녕하세요. 만나서 반갑습니다. 오늘 회의는 오후 세 시에 시작하고, 끝나면 같이 저녁을 먹으러 갑시다.',
  en: 'Hello, nice to meet you. The meeting starts at three this afternoon, and afterwards let us go out for dinner together.',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function synthesize({ text, model, voice }, env, fetchImpl) {
  const base = env.GEMINI_API_BASE || API;
  const res = await fetchImpl(`${base}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`tts ${res.status}: ${raw.slice(0, 400)}`);
  const json = JSON.parse(raw);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error(`tts: no audio in response: ${raw.slice(0, 400)}`);
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
  const buf = Buffer.from(part.inlineData.data, 'base64');
  return { pcm: new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1), rate, mimeType: part.inlineData.mimeType };
}

// 선형 보간 재표본화 (진단용으로 충분하다)
function resample(pcm, from, to) {
  if (from === to) return pcm;
  const n = Math.floor((pcm.length * to) / from);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to;
    const a = Math.floor(x);
    const b = Math.min(pcm.length - 1, a + 1);
    out[i] = pcm[a] + (pcm[b] - pcm[a]) * (x - a);
  }
  return out;
}

export async function runSelfTest(q, env = process.env, fetchImpl = fetch, WebSocketImpl = globalThis.WebSocket) {
  const lang = q.lang === 'en' ? 'en' : 'ko';
  const opts = {
    text: q.say || SAMPLES[lang],
    target: q.target || (lang === 'ko' ? 'en' : 'ko'),
    echo: q.echo === '1',
    resume: q.resume !== '0',
    transcripts: q.tr !== '0',
    ttsModel: q.tts || 'gemini-2.5-flash-preview-tts',
    voice: q.voice || 'Kore',
    model: q.model || 'models/gemini-3.5-live-translate-preview',
    inputRate: Number(q.rate) || 16000,
    chunkMs: Number(q.chunk) || 40,
    tailSec: Math.min(8, Number(q.tail) || 3),
    endSignal: q.end === '1',
    gain: Number(q.gain) || 1,
  };
  const out = { opts };

  let t = Date.now();
  let speech;
  try {
    speech = await synthesize({ text: opts.text, model: opts.ttsModel, voice: opts.voice }, env, fetchImpl);
  } catch (e) {
    return { ...out, error: String(e.message || e) };
  }
  let pcm = resample(speech.pcm, speech.rate, opts.inputRate);
  if (opts.gain !== 1) pcm = pcm.map((v) => Math.max(-32768, Math.min(32767, v * opts.gain)));
  out.tts = { ms: Date.now() - t, mimeType: speech.mimeType, seconds: +(speech.pcm.length / speech.rate).toFixed(2) };

  const minted = await mintToken(env, fetchImpl);
  if (minted.error) return { ...out, error: `token: ${minted.error}` };

  const setup = {
    model: opts.model,
    generationConfig: {
      responseModalities: ['AUDIO'],
      translationConfig: { targetLanguageCode: opts.target, echoTargetLanguage: opts.echo },
    },
  };
  if (opts.transcripts) {
    setup.inputAudioTranscription = {};
    setup.outputAudioTranscription = {};
  }
  if (opts.resume) setup.sessionResumption = {};
  out.setup = setup;

  const events = [];
  const live = { inputText: '', outputText: '', inputLangs: [], audioSec: 0, flags: {}, peaks: [], usageEvents: 0, usageIn: 0, usageOut: 0, lastUsageMs: null };
  let t0 = 0; // 음성 전송을 시작한 시각
  const at = () => (t0 ? Date.now() - t0 : -(Date.now() - t));
  const wsBase = env.GEMINI_WS_BASE || WS;
  t = Date.now();

  await new Promise((resolve) => {
    const ws = new WebSocketImpl(`${wsBase}${CONSTRAINED}?access_token=${encodeURIComponent(minted.name)}`);
    ws.binaryType = 'arraybuffer';
    let done = false;
    const finish = (why) => {
      if (done) return;
      done = true;
      live.end = why;
      try {
        ws.close(1000);
      } catch {
        /* 이미 닫힘 */
      }
      resolve();
    };
    const guard = setTimeout(() => finish('timeout'), 50000);

    ws.onopen = () => {
      live.openMs = Date.now() - t;
      ws.send(JSON.stringify({ setup }));
    };
    ws.onerror = (e) => {
      live.error = String((e && e.message) || 'websocket error');
    };
    ws.onclose = (e) => {
      live.close = { code: e.code, reason: String(e.reason || '').slice(0, 300) };
      clearTimeout(guard);
      finish('closed');
    };
    ws.onmessage = async (ev) => {
      let msg;
      try {
        const text = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8');
        msg = JSON.parse(text);
      } catch {
        return;
      }
      if (msg.setupComplete) {
        live.setupMs = Date.now() - t;
        stream();
      }
      const sc = msg.serverContent;
      const e = { t: at(), keys: Object.keys(msg).concat(sc ? Object.keys(sc).map((k) => 'sc.' + k) : []) };
      if (sc) {
        if (sc.inputTranscription) {
          e.in = sc.inputTranscription.text;
          live.inputText += sc.inputTranscription.text || '';
          const lc = sc.inputTranscription.languageCode;
          if (lc && !live.inputLangs.includes(lc)) live.inputLangs.push(lc);
          const extra = Object.keys(sc.inputTranscription).filter((k) => k !== 'text');
          if (extra.length) e.inKeys = extra;
        }
        if (sc.outputTranscription) {
          e.out = sc.outputTranscription.text;
          live.outputText += sc.outputTranscription.text || '';
          if (live.firstOutTextMs == null) live.firstOutTextMs = at();
        }
        for (const p of sc.modelTurn?.parts || []) {
          if (p.inlineData?.data) {
            const raw = Buffer.from(p.inlineData.data, 'base64');
            const bytes = raw.length;
            // 조각별 최대 진폭: 엔진이 말 없는 구간에 보내는 음성이 완전한 무음인지 보려는 것
            let peak = 0;
            for (let i = 0; i + 1 < raw.length; i += 2) {
              const v = Math.abs(raw.readInt16LE(i));
              if (v > peak) peak = v;
            }
            live.peaks.push(peak);
            const rate = Number(/rate=(\d+)/.exec(p.inlineData.mimeType || '')?.[1] || 24000);
            e.audioMs = Math.round((bytes / 2 / rate) * 1000);
            live.audioSec += bytes / 2 / rate;
            live.outMime = p.inlineData.mimeType;
            if (live.firstOutAudioMs == null) live.firstOutAudioMs = at();
            live.lastOutAudioMs = at();
          } else if (p.text) {
            e.partText = p.text.slice(0, 120);
          }
        }
        for (const k of ['turnComplete', 'generationComplete', 'interrupted', 'waitingForInput']) {
          if (sc[k]) live.flags[k] = (live.flags[k] || 0) + 1;
        }
      }
      if (msg.goAway) e.goAway = msg.goAway;
      if (msg.usageMetadata) {
        live.usageEvents++;
        live.usageIn += msg.usageMetadata.promptTokenCount || 0;
        live.usageOut += msg.usageMetadata.responseTokenCount || 0;
        live.lastUsageMs = at();
      }
      if (msg.sessionResumptionUpdate) e.resumable = msg.sessionResumptionUpdate.resumable;
      if (events.length < 400) events.push(e);
    };

    async function stream() {
      const n = Math.round((opts.inputRate * opts.chunkMs) / 1000);
      const send = (chunk) =>
        ws.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                data: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('base64'),
                mimeType: `audio/pcm;rate=${opts.inputRate}`,
              },
            },
          }),
        );
      t0 = Date.now();
      // 실제 마이크처럼 실시간 속도로 보낸다.
      for (let i = 0, k = 0; i < pcm.length && !done; i += n, k++) {
        send(pcm.subarray(i, Math.min(pcm.length, i + n)));
        const wait = t0 + (k + 1) * opts.chunkMs - Date.now();
        if (wait > 0) await sleep(wait);
      }
      live.speechEndMs = Date.now() - t0;
      if (opts.endSignal) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      else {
        const silence = new Int16Array(n);
        const tailChunks = Math.round((opts.tailSec * 1000) / opts.chunkMs);
        const ts = Date.now();
        for (let k = 0; k < tailChunks && !done; k++) {
          send(silence);
          const wait = ts + (k + 1) * opts.chunkMs - Date.now();
          if (wait > 0) await sleep(wait);
        }
      }
      // 뒤늦게 오는 통역이 끝날 때까지 기다린다: 1.5초 동안 새 음성이 없으면 끝.
      const waitStart = Date.now();
      while (!done && Date.now() - waitStart < 12000) {
        await sleep(250);
        const quietFor = at() - (live.lastOutAudioMs ?? live.speechEndMs);
        if (quietFor > 1500 && Date.now() - waitStart > (opts.endSignal ? 3000 : 500)) break;
      }
      clearTimeout(guard);
      finish('complete');
    }
  });

  live.audioSec = +live.audioSec.toFixed(2);
  if (live.firstOutAudioMs != null && live.speechEndMs != null) {
    live.firstAudioAfterSpeechEndMs = live.firstOutAudioMs - live.speechEndMs; // 음수면 말하는 도중에 시작
    live.lastAudioAfterSpeechEndMs = live.lastOutAudioMs - live.speechEndMs;
  }
  // 이벤트는 요약해서 돌려준다 (같은 종류가 이어지면 합친다).
  const compact = [];
  for (const e of events) {
    const prev = compact[compact.length - 1];
    const kind = e.keys.join(',');
    if (prev && prev.kind === kind && !e.in && !e.out && !e.goAway) {
      prev.n++;
      prev.tEnd = e.t;
      prev.audioMs = (prev.audioMs || 0) + (e.audioMs || 0);
    } else compact.push({ t: e.t, kind, n: 1, ...(e.in != null && { in: e.in }), ...(e.out != null && { out: e.out }), ...(e.inKeys && { inKeys: e.inKeys }), ...(e.audioMs && { audioMs: e.audioMs }), ...(e.goAway && { goAway: e.goAway }), ...(e.partText && { partText: e.partText }) });
  }
  return { ...out, live, events: compact.slice(0, 120) };
}
