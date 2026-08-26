/**
 * 스피커 맵 — FILL 구간.
 * 25개 스피커가 앞에서 뒤로 하나씩 켜지며 원형 펄스를 퍼뜨린다.
 * 켜지는 순간마다 콜백으로 좌우 위치(pan)와 높이를 넘겨 실제 소리와 그림을 붙인다.
 */
import { fitCanvas, clamp } from '../../../shared/js/util.js';

export class SpeakerMap {
  /**
   * @param {HTMLCanvasElement} canvas 플레이트 이미지 위에 겹치는 캔버스
   * @param {Array<{x:number,y:number,height:number}>} speakers 0~1 정규화 좌표
   * @param {{width:number,height:number,onFire?:(sp:object,i:number)=>void}} opts
   */
  constructor(canvas, speakers, opts = {}) {
    this.w = opts.width || 1200;
    this.h = opts.height || 547;
    this.ctx = fitCanvas(canvas, this.w, this.h);
    this.onFire = opts.onFire || (() => {});

    this.speakers = speakers.map((s, i) => ({
      ...s,
      i,
      px: s.x * this.w,
      py: s.y * this.h,
      pan: clamp((s.y - 0.5) * 2, -1, 1),   // 상하(=좌우 축) → 스테레오 위치
      depth: s.x,                            // 0 앞 → 1 뒤
      lit: false,
      litAt: 0,
    }));

    this.time = 0;
    this.pulses = [];
    this.litCount = 0;
    this._nextIndex = 0;
    this._interval = 480;
    this._acc = 0;
    this.playing = false;
  }

  /** 순차 점등 시작. totalMs 안에 25개를 모두 켠다. */
  start(totalMs = 12000) {
    this.reset();
    this._interval = totalMs / this.speakers.length;
    this.playing = true;
  }

  reset() {
    this.speakers.forEach((s) => { s.lit = false; s.litAt = 0; });
    this.pulses.length = 0;
    this.litCount = 0;
    this._nextIndex = 0;
    this._acc = 0;
    this.playing = false;
  }

  _fire(sp) {
    sp.lit = true;
    sp.litAt = this.time;
    this.litCount++;
    this.pulses.push({ x: sp.px, y: sp.py, t: 0, life: 1500 });
    this.onFire(sp, sp.i);
  }

  render(dtMs) {
    this.time += dtMs;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    if (this.playing) {
      this._acc += dtMs;
      while (this._acc >= this._interval && this._nextIndex < this.speakers.length) {
        this._acc -= this._interval;
        this._fire(this.speakers[this._nextIndex++]);
      }
      if (this._nextIndex >= this.speakers.length) this.playing = false;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // 퍼져나가는 원형 펄스
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dtMs;
      const k = p.t / p.life;
      if (k >= 1) { this.pulses.splice(i, 1); continue; }
      const r = 6 + k * 62;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(232, 149, 92, ${(1 - k) * 0.55})`;
      ctx.lineWidth = 1.6 * (1 - k) + 0.4;
      ctx.stroke();
    }

    // 켜진 스피커 — 은은한 호흡
    for (const s of this.speakers) {
      if (!s.lit) continue;
      const age = (this.time - s.litAt) / 1000;
      const breathe = 0.72 + 0.28 * Math.sin(age * 2.1 + s.i);
      const glow = ctx.createRadialGradient(s.px, s.py, 0, s.px, s.py, 26);
      glow.addColorStop(0, `rgba(255, 186, 128, ${0.55 * breathe})`);
      glow.addColorStop(1, 'rgba(255, 186, 128, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(s.px, s.py, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.px, s.py, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 226, 200, ${0.85 * breathe})`;
      ctx.fill();
    }

    ctx.restore();
  }
}
