/**
 * 공간 제어 — 조명(DMX) · 커튼(RS-485) · 사운드(BeoLab 50).
 *
 * 브라우저는 시리얼 포트를 직접 열 수 없다. 전시장 PC 에서 브릿지 서비스
 * (bridge/server.js) 를 띄우고 WebSocket 으로 명령만 보낸다.
 *
 *   브라우저 ──ws──▶ 브릿지 ──┬─ DMX (Enttec DMX USB Pro / Art-Net)
 *                              └─ RS-485 (커튼 모터)
 *
 * 사운드는 PC 오디오 출력이 BeoLab 50 으로 물려 있다고 보고 브라우저가 직접
 * 재생한다. 스피커 자체의 프리셋을 네트워크로 바꿔야 한다면 speaker 명령을
 * 브릿지에서 처리하면 된다.
 *
 * 브릿지가 없어도 콘텐츠는 그대로 돌아간다. 명령은 기록만 되고, 연결 상태는
 * 운영자 디버그 오버레이에 나온다. 하드웨어가 아직 없는 단계에서 화면만
 * 검수할 때를 위한 것이다.
 */
export const LINK = { OFFLINE: 'offline', CONNECTING: 'connecting', ONLINE: 'online' };

export class RoomControl {
  /**
   * @param {{bridge:{url:string,reconnectMs:number}, dmx:object, curtain:object, audio:object}} hw
   * @param {{onLink?:(state:string, status:string)=>void, onCommand?:(cmd:object)=>void}} hooks
   *        onLink 은 생성자 안에서도 한 번 불린다. 바깥에서 아직 인스턴스를 잡기 전이라
   *        상태 문구를 인자로 함께 넘긴다.
   */
  constructor(hw, hooks = {}) {
    this.hw = hw;
    this.onLink = hooks.onLink || (() => {});
    this.onCommand = hooks.onCommand || (() => {});

    this.link = LINK.OFFLINE;
    this.ws = null;
    this.log = [];            // 최근 명령 (디버그 오버레이용)
    this.lastError = null;
    this._reconnect = 0;
    this._backoff = 0;
    this._audio = null;
    this._fade = 0;

    this._connect();
  }

  // --- 브릿지 연결 ---------------------------------------------------------

  _connect() {
    const url = this.hw.bridge && this.hw.bridge.url;
    if (!url) return;
    this._setLink(LINK.CONNECTING);
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this._retry(err);
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this._setLink(LINK.ONLINE);
      this.lastError = null;
      this._backoff = 0;
    };
    ws.onclose = () => { this.ws = null; this._retry(); };
    ws.onerror = () => { this.lastError = '브릿지에 연결하지 못했습니다'; };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'error') this.lastError = msg.message;
      } catch (_) { /* 브릿지가 보낸 형식이 아니면 무시 */ }
    };
  }

  /**
   * 다시 붙어 본다. 간격을 점점 늘려 최대 30초까지 벌린다.
   * 브릿지를 나중에 켜도 결국 붙지만, 아예 없는 환경(검수용 배포본 등)에서
   * 3초마다 실패 로그가 쌓이지는 않는다.
   */
  _retry(err) {
    if (err) this.lastError = String(err.message || err);
    this._setLink(LINK.OFFLINE);
    const base = (this.hw.bridge && this.hw.bridge.reconnectMs) || 3000;
    const wait = Math.min(base * Math.pow(2, this._backoff), 30000);
    this._backoff = Math.min(this._backoff + 1, 6);
    clearTimeout(this._reconnect);
    this._reconnect = setTimeout(() => this._connect(), wait);
  }

  _setLink(state) {
    if (this.link === state) return;
    this.link = state;
    this.onLink(state, this.status());
  }

  _send(cmd) {
    const entry = { ...cmd, at: new Date().toTimeString().slice(0, 8) };
    this.log.unshift(entry);
    this.log.length = Math.min(this.log.length, 8);
    this.onCommand(entry);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(cmd));
      return true;
    }
    return false;   // 브릿지 없음 — 기록만 남기고 화면은 그대로 진행한다
  }

  // --- 공간 전환 -----------------------------------------------------------

  /**
   * 한 모드의 공간 상태를 통째로 적용한다.
   * @param {{light:{color:string,dimmer:number}, curtain:'open'|'close', audio:object|null}} room
   */
  apply(room) {
    if (!room) return;
    this.setLight(room.light);
    this.setCurtain(room.curtain);
    this.setAudio(room.audio);
  }

  setLight(light) {
    if (!light) return;
    this._send({
      type: 'dmx',
      color: light.color,
      dimmer: light.dimmer,
      fadeMs: this.hw.dmx ? this.hw.dmx.fadeMs : 2000,
    });
  }

  setCurtain(action) {
    if (!action) return;
    this._send({ type: 'curtain', action });
  }

  /** 음원 전환. null 이면 재생 중인 음원을 페이드아웃한다. */
  setAudio(audio) {
    const cfg = this.hw.audio || {};
    if (!audio || !audio.src) {
      this._fadeOutAudio(cfg.fadeOutMs || 2000);
      this._send({ type: 'audio', action: 'stop' });
      return;
    }

    this._fadeOutAudio(cfg.fadeOutMs || 2000);

    const el = new Audio(audio.src);
    el.loop = true;
    el.volume = 0;
    // 음원 파일이 아직 없어도 콘텐츠는 그대로 진행한다
    el.addEventListener('error', () => {
      this.lastError = `음원을 찾지 못했습니다: ${audio.src}`;
    });
    const play = el.play();
    if (play && play.catch) play.catch(() => { /* 자동재생 차단 — 첫 터치 이후에는 열린다 */ });

    this._audio = el;
    this._fadeTo(el, cfg.volume ?? 0.85, cfg.fadeInMs || 1500);
    this._send({ type: 'audio', action: 'play', src: audio.src, label: audio.label });
  }

  _fadeOutAudio(ms) {
    const el = this._audio;
    if (!el) return;
    this._audio = null;
    this._fadeTo(el, 0, ms, () => { try { el.pause(); } catch (_) {} });
  }

  /** requestAnimationFrame 기반 볼륨 페이드 */
  _fadeTo(el, target, ms, done) {
    const from = el.volume;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min((now - t0) / ms, 1);
      try { el.volume = from + (target - from) * k; } catch (_) { return; }
      if (k < 1) requestAnimationFrame(tick);
      else if (done) done();
    };
    requestAnimationFrame(tick);
  }

  /** 운영자 디버그 표시용 요약 */
  status() {
    const label = { offline: '끊김', connecting: '연결 중', online: '연결됨' }[this.link];
    return `${label}${this.lastError ? ` · ${this.lastError}` : ''}`;
  }
}
