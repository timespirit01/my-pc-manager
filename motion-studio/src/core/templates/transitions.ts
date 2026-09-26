// 장면 전환. 템플릿마다 하나를 골라 영상 전체에 동일하게 사용한다(통일된 전환).
import { clamp, lerp } from '../motion';
import type { RenderEnv } from './types';

/** 브랜드 색 패널이 비스듬히 화면을 덮었다가 걷히는 전환 */
export function panelWipe(env: RenderEnv, p: number, drawOut: () => void, drawIn: () => void, colors: [string, string]) {
  const { ctx, format } = env;
  const W = format.width, H = format.height;
  const slant = H * 0.22;
  const ease = env.mp.transition;
  const cover = (q: number) => ease(clamp(q));
  // 두 겹 패널: 뒤 패널이 조금 늦게 따라온다
  const layers = [
    { color: colors[1], lag: 0.12 },
    { color: colors[0], lag: 0 },
  ];
  if (p < 0.5) drawOut();
  else drawIn();
  for (const layer of layers) {
    const q1 = cover((p - layer.lag * 0.5) * 2); // 덮는 진행
    const q2 = cover((p - 0.5 - layer.lag * 0.5) * 2); // 걷히는 진행
    const right = lerp(-slant, W + slant, q1);
    const left = lerp(-slant, W + slant, q2);
    if (right <= left) continue;
    ctx.save();
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(left, 0);
    ctx.lineTo(right + slant, 0);
    ctx.lineTo(right, H);
    ctx.lineTo(left - slant, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** 부드러운 겹침 전환: 나가는 장면이 살짝 떠오르며 사라지고, 들어오는 장면이 겹쳐 나타난다 */
export function fadeSlide(env: RenderEnv, p: number, drawOut: () => void, drawIn: () => void) {
  const { ctx } = env;
  const e = env.mp.transition(clamp(p));
  const shift = env.mp.distance * 0.5;
  ctx.save();
  ctx.translate(0, -shift * e);
  drawOut();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = clamp(e);
  ctx.translate(0, shift * (1 - e));
  drawIn();
  ctx.restore();
}

/** 원이 커지며 다음 장면을 여는 전환 (강조색 링이 먼저 지나간다) */
export function circleReveal(env: RenderEnv, p: number, drawOut: () => void, drawIn: () => void, ringColor: string, cx?: number, cy?: number) {
  const { ctx, format } = env;
  const W = format.width, H = format.height;
  const x = cx ?? W / 2, y = cy ?? H / 2;
  const maxR = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 20;
  const ease = env.mp.transition;
  const r1 = maxR * ease(clamp(p / 0.8));
  const r2 = maxR * ease(clamp((p - 0.2) / 0.8));
  drawOut();
  if (r1 > 0) {
    ctx.save();
    ctx.fillStyle = ringColor;
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (r2 > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r2, 0, Math.PI * 2);
    ctx.clip();
    drawIn();
    ctx.restore();
  }
}
