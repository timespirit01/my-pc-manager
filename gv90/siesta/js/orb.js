/**
 * 무드 오브 — 구동 중 화면의 중심.
 *
 * 모드 색으로 은은하게 빛나는 구체와, 그 둘레를 도는 원형 프로그레스 바.
 * (제안서 49p '원형 프로그레스 바 모션')
 *
 * 색은 모드가 바뀔 때 부드럽게 건너간다. 조명이 실제로 물드는 속도와
 * 화면이 물드는 속도를 맞춰 두면 공간과 화면이 한 몸처럼 보인다.
 */
import { fitCanvas, clamp, lerp, easeInOut } from '../../shared/js/util.js';

export class MoodOrb {
  constructor(canvas, opts = {}) {
    this.w = opts.width || 1920;
    this.h = opts.height || 1080;
    this.ctx = fitCanvas(canvas, this.w, this.h);
    this.cx = opts.cx ?? this.w / 2;
    this.cy = opts.cy ?? this.h * 0.455;
    this.r = opts.radius ?? 74;
    this.colorFadeMs = opts.colorFadeMs ?? 2500;

    this.time = 0;
    this.progress = 0;        // 0..1 원형 프로그레스
    this.intensity = 0;       // 씬 페이드
    this.rgb = [168, 168, 168];
    this._from = [168, 168, 168];
    this._to = [168, 168, 168];
    this._fadeT = 1;
  }

  /** 모드 색으로 건너간다 */
  setColor(hex) {
    const next = hexToRgb(hex);
    if (!next) return;
    this._from = this.rgb.slice();
    this._to = next;
    this._fadeT = 0;
  }

  setProgress(t) { this.progress = clamp(t, 0, 1); }
  setIntensity(t) { this.intensity = clamp(t, 0, 1); }

  render(dtMs) {
    const ctx = this.ctx;
    this.time += dtMs / 1000;

    if (this._fadeT < 1) {
      this._fadeT = Math.min(this._fadeT + dtMs / this.colorFadeMs, 1);
      const k = easeInOut(this._fadeT);
      this.rgb = this._from.map((v, i) => Math.round(lerp(v, this._to[i], k)));
    }

    ctx.clearRect(0, 0, this.w, this.h);
    if (this.intensity <= 0.001) return;

    const [r, g, b] = this.rgb;
    const breathe = 0.92 + 0.08 * Math.sin(this.time * 1.15);
    const R = this.r * breathe;
    const a = this.intensity;

    ctx.save();

    // 공간으로 번지는 빛
    const halo = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, R * 7.2);
    halo.addColorStop(0, `rgba(${r},${g},${b},${0.30 * a})`);
    halo.addColorStop(0.30, `rgba(${r},${g},${b},${0.10 * a})`);
    halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, this.w, this.h);

    // 구체 — 위쪽에서 빛을 받는 입체감
    const body = ctx.createRadialGradient(
      this.cx - R * 0.34, this.cy - R * 0.40, R * 0.06,
      this.cx, this.cy, R);
    body.addColorStop(0, `rgba(${mix(r, 255, 0.55)},${mix(g, 255, 0.55)},${mix(b, 255, 0.55)},${a})`);
    body.addColorStop(0.55, `rgba(${r},${g},${b},${0.95 * a})`);
    body.addColorStop(1, `rgba(${Math.round(r * 0.34)},${Math.round(g * 0.34)},${Math.round(b * 0.34)},${a})`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2);
    ctx.fill();

    // 원형 프로그레스 — 구체를 감싸는 얇은 링
    const ringR = R * 1.42;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.20 * a})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (this.progress > 0.001) {
      const start = -Math.PI / 2;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, ringR, start, start + Math.PI * 2 * this.progress);
      ctx.strokeStyle = `rgba(${mix(r, 255, 0.5)},${mix(g, 255, 0.5)},${mix(b, 255, 0.5)},${0.85 * a})`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.shadowColor = `rgba(${r},${g},${b},${0.7 * a})`;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
}

const mix = (v, t, k) => Math.round(v + (t - v) * k);

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
