/**
 * 주행 연출 — CLEAR 구간.
 *
 * 차량 측면 렌더는 정지 이미지다. 휠 회전과 상하동은 CSS 가 맡고,
 * 이 모듈은 "차가 지나가고 있다"를 만드는 흐름을 그린다.
 *
 *   노면    타이어 접지선 아래에 깔린 옅은 노면 띠와, 그 위를 뒤로 흘러가는 속도선
 *   배경    차체 위쪽을 스쳐 지나가는 흐릿한 광원
 *
 * 차량은 화면 왼쪽을 향해 달린다. 따라서 노면과 배경은 오른쪽으로 흐른다.
 */
import { fitCanvas, mulberry32, clamp } from '../../../shared/js/util.js';

export class RoadMotion {
  /**
   * @param {HTMLCanvasElement} canvas 차폐 프레임 안에 겹치는 캔버스
   * @param {{width:number,height:number,groundY:number,seed?:number}} opts
   *        groundY 는 타이어 접지선의 프레임 기준 y
   */
  constructor(canvas, opts = {}) {
    this.w = opts.width || 1056;
    this.h = opts.height || 470;
    this.ctx = fitCanvas(canvas, this.w, this.h);
    this.groundY = opts.groundY ?? 368;

    this.speed = 0;      // 0 = 정지, 1 = 주행
    this.intensity = 0;  // 씬 페이드
    this.time = 0;

    const rnd = mulberry32(opts.seed ?? 5150);

    // 노면 속도선 — 접지선 아래에서 원근감이 생기도록 아래쪽일수록 길고 빠르게
    this.ground = Array.from({ length: 46 }, () => {
      const depth = rnd();               // 0 = 먼 노면, 1 = 가까운 노면
      return {
        x: rnd(),
        depth,
        len: 45 + depth * 240,
        sp: 0.42 + depth * 1.25,
        a: 0.10 + depth * 0.42,
      };
    });

    // 차체 위쪽을 스쳐 가는 광원 — 도심을 지나는 느낌만 얕게
    this.sky = Array.from({ length: 14 }, () => ({
      x: rnd(),
      y: 0.08 + rnd() * 0.32,
      len: 90 + rnd() * 260,
      sp: 0.55 + rnd() * 0.9,
      a: 0.03 + rnd() * 0.07,
    }));
  }

  /** 0 = 정지, 1 = 주행 */
  setSpeed(t) { this.speed = clamp(t, 0, 1); }
  setIntensity(t) { this.intensity = clamp(t, 0, 1); }

  render(dtMs) {
    const ctx = this.ctx;
    const dt = dtMs / 1000;
    this.time += dt;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.intensity <= 0.001) return;

    const alpha = this.intensity;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    this._drawSky(ctx, dt, alpha);
    this._drawRoadBed(ctx, alpha);
    this._drawGround(ctx, dt, alpha);
    ctx.restore();
  }

  /**
   * 속도선이 허공에 뜬 선으로 보이지 않도록 깔아 두는 옅은 노면 띠.
   * 위아래·좌우 모두 서서히 사라지게 해서 검은 배경에 경계선이 생기지 않도록,
   * 가로 그라디언트 띠를 세로로 쌓아 그린다.
   */
  _drawRoadBed(ctx, alpha) {
    const top = this.groundY;
    const band = this.h - top;
    if (band <= 0) return;
    const step = 4;
    for (let y = 0; y < band; y += step) {
      const t = y / band;
      // 접지선 바로 아래에서 가장 밝고, 위아래로 부드럽게 사라진다
      const fall = Math.sin(Math.min(t * 1.35, 1) * Math.PI) ** 1.5;
      const a = 0.16 * fall * this.speed * alpha;
      if (a < 0.002) continue;
      const g = ctx.createLinearGradient(0, 0, this.w, 0);
      g.addColorStop(0, 'rgba(110, 152, 184, 0)');
      g.addColorStop(0.22, `rgba(112, 152, 184, ${a})`);
      g.addColorStop(0.78, `rgba(112, 152, 184, ${a})`);
      g.addColorStop(1, 'rgba(110, 152, 184, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, top + y, this.w, step + 1);
    }
  }

  _advance(p, dt, scale) {
    p.x += dt * p.sp * this.speed * scale;
    if (p.x > 1.35) p.x -= 1.7;
    return p.x * this.w - this.w * 0.2;
  }

  _drawGround(ctx, dt, alpha) {
    for (const p of this.ground) {
      const x = this._advance(p, dt, 0.55);
      const y = this.groundY + 5 + p.depth * (this.h - this.groundY - 12);
      const grad = ctx.createLinearGradient(x, 0, x + p.len, 0);
      grad.addColorStop(0, 'rgba(150, 190, 215, 0)');
      grad.addColorStop(0.5, `rgba(170, 205, 228, ${p.a * this.speed * alpha})`);
      grad.addColorStop(1, 'rgba(150, 190, 215, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.0 + p.depth * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + p.len, y);
      ctx.stroke();
    }
  }

  _drawSky(ctx, dt, alpha) {
    for (const p of this.sky) {
      const x = this._advance(p, dt, 0.5);
      const y = p.y * this.h;
      const grad = ctx.createLinearGradient(x, 0, x + p.len, 0);
      grad.addColorStop(0, 'rgba(200, 220, 240, 0)');
      grad.addColorStop(0.5, `rgba(210, 228, 245, ${p.a * this.speed * alpha})`);
      grad.addColorStop(1, 'rgba(200, 220, 240, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + p.len, y);
      ctx.stroke();
    }
  }

}
