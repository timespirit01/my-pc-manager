// Gemini Live API 통역 세션 하나(한 방향)를 맡는다.
// 다른 엔진으로 바꾸려면 이 파일과 같은 메서드(connect, sendAudio,
// maybeRefresh, retryNow, close)와 같은 on.* 콜백을 가진 클래스를 만들면 된다.
//
// 프로토콜 출처: @google/genai 3.6.1 소스 (live.connect, tokens.create).

const decoder = new TextDecoder();

function decodePcm(b64) {
  const bin = atob(b64);
  const len = bin.length - (bin.length % 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function rateOf(mimeType) {
  const m = /rate=(\d+)/.exec(mimeType || '');
  return m ? Number(m[1]) : 24000;
}

export class GeminiSession {
  constructor({ key, targetLang, model, inputRate, getToken, maxAgeMs, bufferChunks, maxRetries, on }) {
    this.key = key;
    this.targetLang = targetLang;
    this.model = model;
    this.inputRate = inputRate;
    this.getToken = getToken;
    this.maxAgeMs = maxAgeMs;
    this.bufferChunks = bufferChunks;
    this.maxRetries = maxRetries;
    this.on = on;

    this.state = 'idle'; // idle | connecting | ready | refreshing | reconnecting | blocked
    this.ws = null;
    this.handle = null; // 세션 재개용
    this.resumption = 'on'; // on → 실패 시 nohandle → off 순으로 물러난다
    this.fails = 0;
    this.everReady = false;
    this.connectedAt = 0;
    this.wantRefresh = false;
    this.refreshDeadline = Infinity;
    this.pending = []; // 연결 전·재연결 중에 모아 둔 음성
    this.retryTimer = null;
    this.closed = false;
    this.attempt = 0;

    this._onOnline = () => this.retryNow();
    window.addEventListener('online', this._onOnline);
  }

  get ready() {
    return this.state === 'ready';
  }

  _setState(s, detail) {
    if (this.state === s) return;
    this.state = s;
    this.on.state?.(s, detail);
  }

  _setup() {
    const setup = {
      model: this.model,
      generationConfig: {
        responseModalities: ['AUDIO'],
        translationConfig: { targetLanguageCode: this.targetLang, echoTargetLanguage: false },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    };
    if (this.resumption !== 'off') {
      setup.sessionResumption = this.resumption === 'on' && this.handle ? { handle: this.handle } : {};
    }
    return setup;
  }

  async connect() {
    if (this.closed || this.ws) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const attempt = ++this.attempt;
    if (this.state !== 'refreshing') this._setState(this.everReady ? 'reconnecting' : 'connecting');

    let wsUrl;
    try {
      ({ wsUrl } = await this.getToken());
    } catch (e) {
      if (this.closed || attempt !== this.attempt) return;
      this.on.error?.(e);
      if (e.code === 'network') this._retryLater();
      else this._setState('blocked', e); // 암호·서버 설정 문제는 사람이 고쳐야 한다
      return;
    }
    if (this.closed || attempt !== this.attempt) return;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      this._retryLater();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    let setupDone = false;

    ws.onopen = () => ws.send(JSON.stringify({ setup: this._setup() }));

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : decoder.decode(ev.data));
      } catch {
        return;
      }
      if (msg.setupComplete && !setupDone) {
        setupDone = true;
        this.fails = 0;
        this.everReady = true;
        this.connectedAt = performance.now();
        this.wantRefresh = false;
        this.refreshDeadline = Infinity;
        const queued = this.pending;
        this.pending = [];
        for (const m of queued) ws.send(m);
        this._setState('ready');
      }
      this._handle(msg);
    };

    ws.onerror = () => {}; // 뒤이어 onclose가 온다

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closed) return;
      if (!setupDone) {
        // 설정이 거절됐을 수 있다. 세션 재개 옵션을 한 단계씩 빼고 다시 시도한다.
        if (this.resumption === 'on' && this.handle) this.resumption = 'nohandle';
        else if (this.resumption !== 'off' && this.fails >= 1) this.resumption = 'off';
        this.lastClose = `${ev.code}${ev.reason ? ' ' + ev.reason : ''}`;
      }
      this._retryLater();
    };
  }

  _handle(msg) {
    const upd = msg.sessionResumptionUpdate;
    if (upd && upd.newHandle && upd.resumable !== false) {
      this.handle = upd.newHandle;
      if (this.resumption === 'nohandle') this.resumption = 'on';
    }
    if (msg.goAway) {
      this.wantRefresh = true;
      const sec = parseFloat(msg.goAway.timeLeft);
      const left = Number.isFinite(sec) ? Math.max(0, sec - 2) * 1000 : 3000;
      this.refreshDeadline = performance.now() + left;
    }
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.inputTranscription && sc.inputTranscription.text) {
      this.on.inputText?.(sc.inputTranscription.text, sc.inputTranscription.languageCode || null);
    }
    if (sc.outputTranscription && sc.outputTranscription.text) {
      this.on.outputText?.(sc.outputTranscription.text);
    }
    const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) {
        this.on.audio?.(decodePcm(p.inlineData.data), rateOf(p.inlineData.mimeType));
      }
    }
    if (sc.turnComplete) this.on.turnEnd?.();
  }

  _retryLater() {
    if (this.closed) return;
    this.fails++;
    if (this.fails > this.maxRetries) {
      const err = Object.assign(new Error('engine'), { code: 'engine', detail: this.lastClose || '' });
      this.on.error?.(err);
      this._setState('blocked', err);
      return;
    }
    this._setState(this.everReady ? 'reconnecting' : 'connecting');
    const delay = Math.min(5000, 250 * 2 ** this.fails); // 0.5, 1, 2, 4, 5초
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  // 네트워크가 돌아왔거나 사용자가 '다시 시도'를 눌렀을 때
  retryNow() {
    if (this.closed || this.ws) return;
    if (this.state === 'idle') return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.state === 'blocked') this.fails = 0;
    this.connect();
  }

  // 엔진의 연결 시간 한도 전에, 대화가 비는 틈을 골라 새 연결로 갈아탄다.
  maybeRefresh(idle) {
    if (this.state !== 'ready') return;
    const now = performance.now();
    const age = now - this.connectedAt;
    const due = this.wantRefresh || age > this.maxAgeMs;
    if (!due) return;
    const must = now > this.refreshDeadline || age > this.maxAgeMs + 45000;
    if (!idle && !must) return;
    const old = this.ws;
    this.ws = null;
    this._setState('refreshing');
    try {
      old.close(1000);
    } catch {
      /* 이미 닫힘 */
    }
    this.connect();
  }

  _send(text) {
    if (this.ws && this.state === 'ready' && this.ws.readyState === 1) {
      this.ws.send(text);
    } else if (this.state !== 'idle' && this.state !== 'blocked') {
      this.pending.push(text);
      if (this.pending.length > this.bufferChunks) this.pending.shift();
    }
  }

  sendAudio(b64) {
    this._send(`{"realtimeInput":{"audio":{"data":"${b64}","mimeType":"audio/pcm;rate=${this.inputRate}"}}}`);
  }

  close() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    window.removeEventListener('online', this._onOnline);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try {
        ws.close(1000);
      } catch {
        /* 이미 닫힘 */
      }
    }
    this.state = 'idle';
  }
}
