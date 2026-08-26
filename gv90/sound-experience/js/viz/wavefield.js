/**
 * 파형 필드 — INTRO / CLEAR 구간의 배경 그래픽.
 *
 * 핵심 아이디어: 화면 왼쪽에서 들어온 도시 소음이 차량(차폐 프레임)을 통과하면서
 * 진폭이 사라진다. 프레임 구간을 경계로 진폭 포락선을 깎아 "정제된다"를 눈으로 보여준다.
 */
import { fitCanvas, mulberry32, clamp, norm } from '../../../shared/js/util.js';

const PALETTE = {
  noise:     ['#E2543A', '#E8955C', '#C1795A', '#86D6F7', '#8E7BD8', '#D9C4A6'],
  vibration: ['#FFFFFF'],
  harshness: ['#FFFFFF', '#D9C4A6'],
  intro:     ['#FFFFFF'],
};

export class WaveField {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{width:number,height:number,gateX0?:number,gateX1?:number,seed?:number}} opts
   */
  constructor(canvas, opts = {}) {
    this.w = opts.width || 1920;
    this.h = opts.height || 1080;
    this.ctx = fitCanvas(canvas, this.w, this.h);
    this.gateX0 = opts.gateX0 ?? 432;
    this.gateX1 = opts.gateX1 ?? 1488;
    this.baseline = opts.baseline ?? 0.548;   // intro 모드 파형의 세로 위치 (0~1)
    this.amplitude = opts.amplitude ?? 82;

    this.mode = 'intro';
    this.time = 0;
    this.reduction = 0;   // 0 = 소음 그대로, 1 = 완전 소거
    this.intensity = 1;   // 씬 진입 페이드용

    const rnd = mulberry32(opts.seed ?? 20260825);
    this.strands = Array.from({ length: 7 }, (_, i) => ({
      base: 0.5 + (i - 3) * 0.028,
      amp: 46 + rnd() * 62,
      parts: Array.from({ length: 4 }, () => ({
        k: 1.4 + rnd() * 5.6,        // 공간 주파수
        s: 0.25 + rnd() * 0.85,      // 시간 속도
        p: rnd() * Math.PI * 2,      // 위상
        a: 0.35 + rnd() * 0.65,      // 성분 비중
      })),
      hue: i,
    }));

    // 하시니스 표현용 입자
    this.particles = Array.from({ length: 900 }, () => ({
      x: rnd(),
      row: Math.floor(rnd() * 5),
      off: (rnd() - 0.5) * 34,
      sp: 0.02 + rnd() * 0.06,
      sz: 0.7 + rnd() * 1.5,
      al: 0.25 + rnd() * 0.75,
    }));
  }

  setMode(mode) { this.mode = mode; }
  setReduction(t) { this.reduction = clamp(t, 0, 1); }
  setIntensity(t) { this.intensity = clamp(t, 0, 1); }

  /** x 위치에서 살아남는 진폭 비율 */
  _envelope(x) {
    const through = norm(x, this.gateX0 - 120, this.gateX1);
    const smooth = through * through * (3 - 2 * through);
    return 1 - smooth * this.reduction;
  }

  _wave(strand, x, t) {
    const u = x / this.w;
    let v = 0;
    let wsum = 0;
    for (const p of strand.parts) {
      v += Math.sin(u * p.k * Math.PI * 2 + t * p.s + p.p) * p.a;
      wsum += p.a;
    }
    return v / wsum;
  }

  render(dtMs) {
    const ctx = this.ctx;
    this.time += dtMs / 1000;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.intensity <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = this.intensity;
    ctx.globalCompositeOperation = 'screen';

    switch (this.mode) {
      case 'intro':     this._drawIntro(ctx); break;
      case 'noise':     this._drawNoise(ctx); break;
      case 'vibration': this._drawVibration(ctx); break;
      case 'harshness': this._drawHarshness(ctx); break;
      default:          this._drawIntro(ctx); break;
    }
    ctx.restore();
  }

  /** 화면을 가로지르는 한 줄의 잔잔한 파형 */
  _drawIntro(ctx) {
    const t = this.time;
    const s = this.strands[3];
    const y0 = this.h * this.baseline;
    ctx.beginPath();
    for (let x = -20; x <= this.w + 20; x += 4) {
      const y = y0 + this._wave(s, x, t * 0.45) * this.amplitude;
      x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(255,255,255,0.35)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /** 여러 색의 소음 가닥이 왼쪽에서 들어와 차량을 지나며 사라진다 */
  _drawNoise(ctx) {
    const t = this.time;
    const colors = PALETTE.noise;
    this.strands.forEach((s, i) => {
      const y0 = this.h * s.base;
      ctx.beginPath();
      for (let x = -20; x <= this.w + 20; x += 3) {
        const y = y0 + this._wave(s, x, t) * s.amp * this._envelope(x);
        x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors[i % colors.length];
      ctx.globalAlpha = this.intensity * (0.30 + 0.16 * Math.sin(t * 0.7 + i));
      ctx.lineWidth = 1.25;
      ctx.stroke();
    });
    ctx.globalAlpha = this.intensity;
  }

  /** 바닥에 깔린 진동 시트 */
  _drawVibration(ctx) {
    const t = this.time;
    const rows = 24;
    const y0 = this.h * 0.80;
    for (let r = 0; r < rows; r++) {
      const s = this.strands[r % this.strands.length];
      const off = (r - rows / 2) * 5.2;
      ctx.beginPath();
      for (let x = -20; x <= this.w + 20; x += 4) {
        const y = y0 + off + this._wave(s, x, t * 0.6 + r * 0.08) * (34 + r * 0.9) * this._envelope(x);
        x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.globalAlpha = this.intensity * (0.05 + 0.055 * (1 - Math.abs(r - rows / 2) / (rows / 2)));
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = this.intensity;
  }

  /** 거친 질감을 입자로 — 프레임을 지나며 흩어져 사라진다 */
  _drawHarshness(ctx) {
    const t = this.time;
    for (const p of this.particles) {
      p.x += (p.sp * 0.0016) * (16.6);
      if (p.x > 1.05) p.x -= 1.1;
      const x = p.x * this.w;
      const s = this.strands[p.row];
      const env = this._envelope(x);
      const y = this.h * (0.44 + p.row * 0.03) + this._wave(s, x, t * 0.8) * (58 * env) + p.off * env;
      ctx.globalAlpha = this.intensity * p.al * env * 0.85;
      ctx.fillStyle = p.row % 2 ? '#D9C4A6' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(x, y, p.sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = this.intensity;
  }
}
