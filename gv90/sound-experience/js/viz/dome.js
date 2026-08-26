/**
 * 사운드 돔 — EXPAND 구간.
 *
 * 하나의 지오메트리로 두 장면을 모두 그린다.
 *   morph = 0 → 바닥에 깔린 2차원 동심 파동 (터치 전)
 *   morph = 1 → 머리 위까지 감싸는 3차원 반구 와이어프레임 (터치 후)
 * 기획안의 "2차원 파동 → 3차원 형태로 변화"를 형태 보간으로 그대로 구현한다.
 */
import { fitCanvas, clamp, easeInOut } from '../../../shared/js/util.js';

const LAT = [0, 14, 28, 42, 56, 70, 84];   // 위도(도)
const LON = 18;                             // 경도 선 개수

export class SoundDome {
  constructor(canvas, opts = {}) {
    this.w = opts.width || 1920;
    this.h = opts.height || 1080;
    this.ctx = fitCanvas(canvas, this.w, this.h);

    this.cx = opts.cx ?? this.w / 2;
    this.cy = opts.cy ?? 700;
    this.R = opts.radius ?? 520;
    this.flatten = 0.30;   // 바닥 타원의 눌림 정도
    this.rise = 0.86;      // 돔 높이 비율

    this.morph = 0;
    this.time = 0;
    this.spin = 0;
    this.intensity = 0;
    this.ripples = [];
    this._rippleAcc = 0;

    // 돔 표면을 도는 음원 — "소리 하나하나에 좌표가 있다"
    this.voices = [
      { az: 0.0, el: 0.30, sp: 0.42, col: '#E8955C' },
      { az: 2.1, el: 0.62, sp: -0.31, col: '#86D6F7' },
      { az: 4.2, el: 0.14, sp: 0.55, col: '#8E7BD8' },
    ];
  }

  setMorph(t) { this.morph = clamp(t, 0, 1); }
  setIntensity(t) { this.intensity = clamp(t, 0, 1); }

  /** 구면 좌표 → 화면 좌표. m=0 이면 모든 점이 바닥 타원으로 눌린다. */
  _project(azimuth, elevation, m) {
    const r = Math.cos(elevation);
    const x = Math.cos(azimuth + this.spin) * r;
    const z = Math.sin(azimuth + this.spin) * r;
    const y = Math.sin(elevation);
    return {
      x: this.cx + x * this.R,
      y: this.cy - z * this.R * this.flatten - y * this.R * this.rise * m,
      depth: z,
    };
  }

  render(dtMs) {
    const ctx = this.ctx;
    this.time += dtMs / 1000;
    this.spin += (dtMs / 1000) * 0.075;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.intensity <= 0.001) return;

    const m = easeInOut(this.morph);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = this.intensity;

    this._drawRipples(ctx, dtMs, m);
    this._drawLatitudes(ctx, m);
    this._drawLongitudes(ctx, m);
    this._drawVoices(ctx, dtMs, m);

    ctx.restore();
  }

  /** 바닥에서 계속 퍼져나가는 파동 — 2차원 국면의 주인공 */
  _drawRipples(ctx, dtMs, m) {
    this._rippleAcc += dtMs;
    const period = 900;
    while (this._rippleAcc >= period) {
      this._rippleAcc -= period;
      this.ripples.push({ t: 0, life: 5200 });
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.t += dtMs;
      const k = r.t / r.life;
      if (k >= 1) { this.ripples.splice(i, 1); continue; }
      const rad = this.R * (0.10 + k * 1.05);
      const fade = (1 - k) * (0.42 - 0.24 * m);
      ctx.beginPath();
      ctx.ellipse(this.cx, this.cy, rad, rad * this.flatten, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 150, 220, ${fade})`;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }

  /** 위도 링 — m=0 이면 겹겹의 동심 타원, m=1 이면 돔의 가로 단면 */
  _drawLatitudes(ctx, m) {
    LAT.forEach((deg, i) => {
      const el = (deg * Math.PI) / 180;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 1.1 - i * 0.55);
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const p = this._project((a / 64) * Math.PI * 2, el, m);
        a === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      const warm = i === 0;
      const alpha = (warm ? 0.42 : 0.20 + 0.16 * pulse) * (0.55 + 0.45 * m);
      ctx.strokeStyle = warm
        ? `rgba(226, 140, 96, ${alpha})`
        : `rgba(150, 140, 235, ${alpha})`;
      ctx.lineWidth = warm ? 1.7 : 1.1;
      ctx.stroke();
    });
  }

  /** 경도 선 — 3차원으로 세워질 때만 나타난다 */
  _drawLongitudes(ctx, m) {
    if (m < 0.02) return;
    for (let j = 0; j < LON; j++) {
      const az = (j / LON) * Math.PI * 2;
      ctx.beginPath();
      for (let s = 0; s <= 24; s++) {
        const el = (s / 24) * (Math.PI / 2) * 0.96;
        const p = this._project(az, el, m);
        s === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      const front = 0.5 + 0.5 * Math.sin(az + this.spin);
      ctx.strokeStyle = `rgba(130, 125, 215, ${(0.08 + 0.16 * front) * m})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** 돔 위를 도는 음원 점과 꼬리 */
  _drawVoices(ctx, dtMs, m) {
    for (const v of this.voices) {
      v.az += (dtMs / 1000) * v.sp;
      const el = v.el * (0.15 + 0.85 * m) * (0.75 + 0.25 * Math.sin(this.time * 0.6 + v.el * 9));
      for (let k = 0; k < 9; k++) {
        const p = this._project(v.az - k * 0.055 * Math.sign(v.sp || 1), el, m);
        const a = (1 - k / 9) * 0.55 * (0.4 + 0.6 * m);
        ctx.beginPath();
        ctx.arc(p.x, p.y, k === 0 ? 5.5 : 3.4 * (1 - k / 12), 0, Math.PI * 2);
        ctx.fillStyle = v.col.replace(/^#/, '');
        ctx.fillStyle = hexToRgba(v.col, a);
        ctx.fill();
      }
    }
  }

  /** 현재 음원들의 위치를 오디오 엔진에 넘기기 위한 값 */
  voiceState() {
    return this.voices.map((v) => ({
      pan: Math.sin(v.az + this.spin),
      height: v.el,
    }));
  }
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
