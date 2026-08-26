/**
 * 키오스크 셸 — 무인 전시 운영에 필요한 공통 동작.
 *   · 일정 시간 무입력 시 인트로로 자동 복귀
 *   · 커서 숨김 (운영자가 마우스를 움직이면 잠시 표시)
 *   · 운영자 단축키
 *   · 디버그 오버레이
 *   · 컨텍스트 메뉴 / 드래그 / 핀치줌 차단
 */
export class Kiosk {
  /**
   * @param {{
   *   idleMs?: number,
   *   onIdle?: () => void,
   *   onInteract?: (ev: PointerEvent) => void,
   *   keys?: Record<string, () => void>,
   *   debugNode?: HTMLElement,
   *   debugInfo?: () => string
   * }} opts
   */
  constructor(opts = {}) {
    this.idleMs = opts.idleMs ?? 60000;
    this.onIdle = opts.onIdle || (() => {});
    this.onInteract = opts.onInteract || (() => {});
    this.keys = opts.keys || {};
    this.debugNode = opts.debugNode || null;
    this.debugInfo = opts.debugInfo || (() => '');

    this._lastInput = performance.now();
    this._cursorTimer = 0;
    this._fps = 0;
    this._frames = 0;
    this._fpsAt = performance.now();

    this._install();
  }

  _install() {
    document.body.classList.add('hide-cursor');

    // 관람객 입력
    window.addEventListener('pointerdown', (ev) => {
      this._lastInput = performance.now();
      this.onInteract(ev);
    });

    // 운영자 마우스 — 잠시 커서 표시
    window.addEventListener('mousemove', () => {
      this._lastInput = performance.now();
      document.body.classList.remove('hide-cursor');
      clearTimeout(this._cursorTimer);
      this._cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 2500);
    });

    // 전시장에서 오작동을 부르는 브라우저 기본 동작 차단
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

    window.addEventListener('keydown', (ev) => {
      this._lastInput = performance.now();
      if (ev.key === 'F' || ev.key === 'f') { this.toggleFullscreen(); return; }
      if (ev.key === 'D' || ev.key === 'd') { this.toggleDebug(); return; }
      const fn = this.keys[ev.key];
      if (fn) { ev.preventDefault(); fn(); }
    });

    this._tick();
  }

  _tick = () => {
    const now = performance.now();
    this._frames++;
    if (now - this._fpsAt >= 500) {
      this._fps = Math.round((this._frames * 1000) / (now - this._fpsAt));
      this._frames = 0;
      this._fpsAt = now;
    }
    if (this.idleMs > 0 && now - this._lastInput > this.idleMs) {
      this._lastInput = now;
      this.onIdle();
    }
    if (this.debugNode && this.debugNode.classList.contains('is-on')) {
      this.debugNode.textContent =
        `FPS ${String(this._fps).padStart(3)}   IDLE ${((now - this._lastInput) / 1000).toFixed(0)}s\n` +
        this.debugInfo();
    }
    requestAnimationFrame(this._tick);
  };

  /** 관람객 입력이 아닌 경로(자동 진행 등)에서도 유휴 타이머를 갱신할 때 */
  poke() { this._lastInput = performance.now(); }

  toggleDebug() {
    if (this.debugNode) this.debugNode.classList.toggle('is-on');
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (err) {
      console.warn('[kiosk] 전체화면 전환 실패', err);
    }
  }
}
