// 통역 세션 2개(나→상대 'out', 상대→나 'in')를 묶어 한 대화로 만든다.
// 마이크 음성 배분, 되울림 차단, 한 마디(turn) 조립, 응답 속도 측정을 맡는다.

import { GeminiSession } from './engine-gemini.js';
import { MicInput } from './audio-in.js';
import { PcmPlayer } from './audio-out.js';

function toBase64(buffer) {
  const u = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

const sameLang = (a, b) => !!a && !!b && a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0];
const keyOfSide = (side) => (side === 'me' ? 'out' : 'in');

// 마이크 음량으로 말하는 구간을 대략 잡는다 (자동 멈춤과 응답 속도 측정용).
class VoiceMeter {
  constructor() {
    this.noise = 0.004;
    this.speaking = false;
    this.lastVoice = 0;
    this.segments = [];
  }
  update(rms, t) {
    const threshold = Math.max(0.012, this.noise * 3);
    if (rms > threshold) {
      if (!this.speaking) {
        this.speaking = true;
        this.segments.push({ start: t, end: null });
        if (this.segments.length > 20) this.segments.shift();
      }
      this.lastVoice = t;
    } else {
      this.noise = this.noise * 0.95 + rms * 0.05;
      if (this.speaking && t - this.lastVoice > 500) {
        this.speaking = false;
        this.segments[this.segments.length - 1].end = this.lastVoice;
      }
    }
  }
  segmentBefore(t) {
    for (let i = this.segments.length - 1; i >= 0; i--) if (this.segments[i].start < t) return this.segments[i];
    return null;
  }
}

export class Interpreter {
  constructor({ config, getToken, myLang, partnerLang, mode, micProcessing = true, on }) {
    this.cfg = config;
    this.getToken = getToken;
    this.myLang = myLang;
    this.partnerLang = partnerLang;
    this.mode = mode; // 'auto' | 'button'
    this.micProcessing = micProcessing;
    this.on = on;

    this.ctx = null;
    this.mic = null;
    this.player = null;
    this.sessions = { out: null, in: null };
    this.listening = false;
    this.activeSide = null; // 눌러서 말하기에서 지금 말하는 쪽
    this.sideSince = 0;
    this.sideSpoke = false;
    this.meter = new VoiceMeter();
    this.turns = { out: null, in: null };
    this.turnSeq = 0;
    this.audioByTurn = new Map();
    this.pendingMetrics = [];
    this.lastActivity = 0;
    this.pausedAt = 0;
    this.lastStatus = '';
    this.timer = setInterval(() => this._tick(), 250);
  }

  // ---------- 연결 ----------

  _targetOf(key) {
    return key === 'out' ? this.partnerLang : this.myLang;
  }

  _makeSession(key) {
    const s = this.cfg.session;
    return new GeminiSession({
      key,
      targetLang: this._targetOf(key),
      model: this.cfg.model,
      inputRate: this.cfg.audio.inputRate,
      getToken: this.getToken,
      maxAgeMs: s.maxAgeMs,
      bufferChunks: Math.ceil(s.micBufferMs / this.cfg.audio.chunkMs),
      maxRetries: s.maxRetries,
      on: {
        state: () => this._emitStatus(),
        error: (e) => this.on.error?.(e),
        inputText: (text, lang) => this._onInputText(key, text, lang),
        outputText: (text) => this._onOutputText(key, text),
        audio: (pcm, rate) => this._onAudio(key, pcm, rate),
        turnEnd: () => this._finishTurn(key),
      },
    });
  }

  // 통역 세션을 미리 연결해 둔다 (마이크 없이도 가능).
  prepare() {
    for (const key of ['out', 'in']) {
      if (!this.sessions[key]) {
        this.sessions[key] = this._makeSession(key);
        this.sessions[key].connect();
      }
    }
    this.pausedAt = performance.now();
    this._emitStatus();
  }

  release() {
    for (const key of ['out', 'in']) {
      if (this.sessions[key]) this.sessions[key].close();
      this.sessions[key] = null;
      this.turns[key] = null;
    }
    this._emitStatus();
  }

  retry() {
    for (const key of ['out', 'in']) this.sessions[key]?.retryNow();
    if (!this.sessions.out) this.prepare();
  }

  setPartnerLang(code) {
    if (code === this.partnerLang) return;
    this.partnerLang = code;
    // 목표 언어가 바뀌는 쪽만 새로 연결한다.
    if (this.sessions.out) {
      this.sessions.out.close();
      this.turns.out = null;
      this.sessions.out = this._makeSession('out');
      this.sessions.out.connect();
    }
    this._emitStatus();
  }

  // ---------- 듣기 ----------

  // 반드시 사용자 조작(탭) 안에서 불러야 한다. 브라우저가 소리 재생을 허용하는 조건이다.
  ensureAudio() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.player = new PcmPlayer(this.ctx, { leadMs: this.cfg.audio.playbackLeadMs });
      this.mic = new MicInput(this.ctx, {
        rate: this.cfg.audio.inputRate,
        chunkMs: this.cfg.audio.chunkMs,
        processing: this.micProcessing,
        onChunk: (pcm, rms) => this._onMic(pcm, rms),
      });
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  async start() {
    this.ensureAudio();
    this.prepare();
    await this.mic.start(); // 실패하면 code가 달린 오류를 던진다
    this.listening = true;
    this.lastActivity = performance.now();
    this._emitStatus();
  }

  pause() {
    if (!this.listening) return;
    this.listening = false;
    this.activeSide = null;
    this.mic.stop();
    for (const key of ['out', 'in']) this.sessions[key]?.endAudio();
    this.pausedAt = performance.now();
    this._emitStatus();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.activeSide) this.setActiveSide(null);
    this._emitStatus();
  }

  // 눌러서 말하기: side는 'me' | 'partner' | null
  setActiveSide(side) {
    const prev = this.activeSide;
    if (prev === side) return;
    if (prev) this.sessions[keyOfSide(prev)]?.endAudio();
    this.activeSide = side;
    this.sideSince = performance.now();
    this.sideSpoke = false;
    this.lastActivity = this.sideSince;
    this._emitStatus();
  }

  _onMic(pcm, rms) {
    const now = performance.now();
    this.meter.update(rms, now);
    this.on.level?.(rms);
    if (!this.listening) return;
    if (this.meter.speaking) {
      this.lastActivity = now;
      this.sideSpoke = true;
    }
    const b64 = toBase64(pcm);
    if (this.mode === 'button') {
      if (this.activeSide) this.sessions[keyOfSide(this.activeSide)]?.sendAudio(b64);
      return;
    }
    // 되울림 차단: 한쪽 통역 음성이 스피커로 나가는 동안에는 반대 방향 세션에 보내지 않는다.
    const playing = this.player.playingTag(this.cfg.session.echoTailMs / 1000);
    if (playing !== 'in') this.sessions.out?.sendAudio(b64);
    if (playing !== 'out') this.sessions.in?.sendAudio(b64);
  }

  // ---------- 한 마디 조립 ----------

  _turn(key) {
    let t = this.turns[key];
    if (!t) {
      t = this.turns[key] = {
        id: ++this.turnSeq,
        dir: key,
        original: '',
        translated: '',
        committed: false,
        hasAudio: false,
        lastAt: 0,
      };
    }
    t.lastAt = performance.now();
    return t;
  }

  _emitTurn(t, final = false) {
    this.on.turn?.({
      id: t.id,
      dir: t.dir,
      original: t.original.trim(),
      translated: t.translated.trim(),
      hasAudio: t.hasAudio,
      final,
    });
  }

  _onInputText(key, text, lang) {
    const target = this._targetOf(key);
    // 이미 목표 언어인 말(통역할 필요가 없는 말)의 받아쓰기는 버린다.
    if (lang && sameLang(lang, target)) return;
    const t = this._turn(key);
    t.original += text;
    // 자동 방식에서는 두 세션이 같은 말을 듣는다. 실제로 통역하는 세션의 받아쓰기만 화면에 올린다.
    if (!t.committed && (this.mode === 'button' || lang)) t.committed = true;
    if (t.committed) this._emitTurn(t);
  }

  _onOutputText(key, text) {
    const t = this._turn(key);
    t.translated += text;
    t.committed = true;
    this.lastActivity = t.lastAt;
    this._emitTurn(t);
  }

  _onAudio(key, pcm, rate) {
    const t = this._turn(key);
    const first = !t.hasAudio;
    t.committed = true;
    t.hasAudio = true;
    this.lastActivity = t.lastAt;
    const delay = this.player ? this.player.enqueue(pcm, rate, key) : 0;
    let store = this.audioByTurn.get(t.id);
    if (!store) {
      store = [];
      this.audioByTurn.set(t.id, store);
      if (this.audioByTurn.size > 20) this.audioByTurn.delete(this.audioByTurn.keys().next().value);
    }
    store.push({ pcm, rate });
    if (first) {
      const audibleAt = performance.now() + delay * 1000;
      const seg = this.meter.segmentBefore(audibleAt);
      if (seg) this.pendingMetrics.push({ turnId: t.id, audibleAt, seg });
      this._emitTurn(t);
      this._emitStatus();
    }
  }

  _finishTurn(key) {
    const t = this.turns[key];
    if (!t) return;
    this.turns[key] = null;
    if (t.committed) this._emitTurn(t, true);
    this._emitStatus();
  }

  // 통역 음성 다시 듣기. dir을 그대로 넘겨 되울림 차단이 똑같이 걸리게 한다.
  replay(id, dir) {
    const chunks = this.audioByTurn.get(id);
    if (!chunks) return false;
    this.ensureAudio();
    for (const c of chunks) this.player.enqueue(c.pcm, c.rate, dir);
    this._emitStatus();
    return true;
  }

  clear() {
    this.turns = { out: null, in: null };
    this.audioByTurn.clear();
    this.player?.stop();
  }

  // ---------- 주기 점검 ----------

  _busy() {
    const t = this.turns;
    return !!((t.out && t.out.committed) || (t.in && t.in.committed) || (this.player && this.player.playingTag(0)));
  }

  _tick() {
    const now = performance.now();
    const s = this.cfg.session;

    // 한동안 새 내용이 없으면 그 마디를 끝낸다 (엔진이 끝 신호를 안 보내는 경우 대비).
    for (const key of ['out', 'in']) {
      const t = this.turns[key];
      if (t && now - t.lastAt > s.turnGapMs) this._finishTurn(key);
    }

    // 응답 속도: 말 끝 → 통역 음성이 들리기 시작한 시각. 음수면 말하는 도중에 시작한 것.
    if (this.pendingMetrics.length) {
      const rest = [];
      for (const m of this.pendingMetrics) {
        if (m.seg.end != null) this.on.metric?.({ turnId: m.turnId, lagMs: Math.round(m.audibleAt - m.seg.end) });
        else if (now - m.audibleAt < 60000) rest.push(m);
      }
      this.pendingMetrics = rest;
    }

    if (this.listening) {
      // 눌러서 말하기: 말이 끝나면 버튼을 자동으로 뗀다.
      if (this.mode === 'button' && this.activeSide) {
        const p = this.cfg.pushToTalk;
        const quiet = now - Math.max(this.meter.lastVoice, this.sideSince);
        if ((this.sideSpoke && quiet > p.silenceAfterSpeechMs) || (!this.sideSpoke && quiet > p.silenceNoSpeechMs)) {
          this.setActiveSide(null);
        }
      }
      // 아무도 말하지 않으면 듣기를 멈춘다 (요금·배터리 보호).
      if (!this._busy() && now - this.lastActivity > s.idlePauseMs) {
        this.pause();
        this.on.autoPaused?.();
      }
    } else if (this.sessions.out && now - this.pausedAt > s.releaseMs && !this._busy()) {
      this.release();
    }

    const idle = !this.meter.speaking && !this._busy();
    for (const key of ['out', 'in']) this.sessions[key]?.maybeRefresh(idle && !this.turns[key]);

    this._emitStatus();
  }

  _conn() {
    const a = this.sessions.out;
    const b = this.sessions.in;
    if (!a || !b) return 'idle';
    const st = [a.state, b.state];
    if (st.includes('blocked')) return 'blocked';
    if (st.includes('reconnecting')) return 'reconnecting';
    if (st.includes('connecting')) return 'connecting';
    return 'ready';
  }

  _emitStatus() {
    const status = {
      conn: this._conn(),
      listening: this.listening,
      mode: this.mode,
      activeSide: this.activeSide,
      busy: this._busy(),
      playing: this.player ? this.player.playingTag(0) : null,
    };
    const sig = JSON.stringify(status);
    if (sig === this.lastStatus) return;
    this.lastStatus = sig;
    this.on.status?.(status);
  }

  destroy() {
    clearInterval(this.timer);
    this.mic?.stop();
    this.player?.stop();
    this.release();
  }
}
