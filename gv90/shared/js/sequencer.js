/**
 * 시퀀서 — 전시 콘텐츠의 재생 타임라인.
 *
 * 구조:  steps[] → 각 step 안에 beats[]
 *   step  : 하단 진행바 한 칸에 대응하는 큰 단락 (CLEAR / FILL / EXPAND ...)
 *   beat  : 한 단락 안에서 순차 전환되는 화면 (타이틀 → 소음 → 진동 → 하시니스)
 *
 * beat.gate 가 true 면 beat.ms 동안 관람객 터치를 기다린다.
 * ms 가 Infinity 면 터치할 때까지 무한 대기(인트로 어트랙트 루프).
 * ms 가 유한하면 그 시간이 지날 때 자동으로 넘어가 쇼가 멈추지 않는다.
 */
export class Sequencer {
  constructor(steps, handlers = {}) {
    this.steps = steps;
    this.on = handlers;

    this.stepIndex = -1;
    this.beatIndex = -1;
    this.beatElapsed = 0;
    this.stepElapsed = 0;
    this.paused = false;
    this.running = false;
    this._raf = 0;
    this._last = 0;
  }

  get step() { return this.steps[this.stepIndex] || null; }
  get beat() { return this.step ? this.step.beats[this.beatIndex] || null : null; }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._goToStep(0);
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  restart() {
    this.paused = false;
    this._last = performance.now();
    this._goToStep(0);
  }

  togglePause() {
    this.paused = !this.paused;
    this._last = performance.now();
    return this.paused;
  }

  /** 관람객 터치 — 게이트가 열려 있을 때만 다음 비트로 넘어간다. */
  advance() {
    if (!this.beat || !this.beat.gate) return false;
    this._nextBeat();
    return true;
  }

  /** 운영자용 — 단락 단위 이동 */
  nextStep() { this._goToStep(Math.min(this.stepIndex + 1, this.steps.length - 1)); }
  prevStep() { this._goToStep(Math.max(this.stepIndex - 1, 0)); }
  gotoStep(id) {
    const i = this.steps.findIndex((s) => s.id === id);
    if (i >= 0) this._goToStep(i);
  }

  _goToStep(i) {
    const prev = this.step;
    this.stepIndex = i;
    this.stepElapsed = 0;
    if (prev && this.on.leaveStep) this.on.leaveStep(prev);
    if (this.on.enterStep) this.on.enterStep(this.step, i);
    this.beatIndex = -1;
    this._goToBeat(0);
  }

  _goToBeat(i) {
    this.beatIndex = i;
    this.beatElapsed = 0;
    if (this.on.enterBeat) this.on.enterBeat(this.beat, this.step, i);
  }

  _nextBeat() {
    if (this.beatIndex + 1 < this.step.beats.length) {
      this._goToBeat(this.beatIndex + 1);
    } else if (this.stepIndex + 1 < this.steps.length) {
      this._goToStep(this.stepIndex + 1);
    } else {
      this._goToStep(0); // 마지막 → 인트로로 순환
    }
  }

  _frame = (now) => {
    if (!this.running) return;
    let dt = now - this._last;
    this._last = now;
    if (dt > 250) dt = 250; // 탭 비활성 등으로 튄 프레임 보정

    if (!this.paused) {
      this.beatElapsed += dt;
      this.stepElapsed += dt;
      const beat = this.beat;
      if (beat && Number.isFinite(beat.ms) && this.beatElapsed >= beat.ms) {
        this._nextBeat();
      }
    }

    if (this.on.frame) this.on.frame(this.paused ? 0 : dt, this);
    this._raf = requestAnimationFrame(this._frame);
  };

  /** 현재 비트의 진행도 0..1 (무한 대기 비트는 0) */
  beatProgress() {
    const b = this.beat;
    if (!b || !Number.isFinite(b.ms) || b.ms <= 0) return 0;
    return Math.min(this.beatElapsed / b.ms, 1);
  }

  /**
   * 현재 단락의 진행도 0..1
   *
   * 관람객 터치를 기다리는 비트는 계산에서 통째로 뺀다. 대기 시간은 관람객이
   * 정하는 것이라 진행바가 그동안 움직이면 "곧 넘어간다"는 잘못된 신호를 준다.
   * 터치해서 다음 비트로 넘어간 순간부터 바가 움직이기 시작한다.
   */
  stepProgress() {
    const s = this.step;
    if (!s) return 0;
    const span = (b) => (b.gate || !Number.isFinite(b.ms) ? 0 : b.ms);
    const total = s.beats.reduce((n, b) => n + span(b), 0);
    if (total <= 0) return 0;
    const before = s.beats.slice(0, this.beatIndex).reduce((n, b) => n + span(b), 0);
    const current = this.beat && this.beat.gate ? 0 : this.beatElapsed;
    return Math.min((before + current) / total, 1);
  }
}
