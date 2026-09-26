// 템플릿 공용 그리기 도구. 모든 템플릿이 같은 도구를 쓰므로 여백·정렬·움직임 규칙이 일관된다.
import { luminance } from '../color';
import { coverSource, type Rect } from '../imageFit';
import { clamp, enter, type EnterState } from '../motion';
import { fitText, type FitSpec, type TextBlock } from '../text';
import type { ImageCrop } from '../types';
import type { Ctx, LoadedImage, RenderEnv } from './types';

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fit(env: RenderEnv, text: string, spec: FitSpec): TextBlock {
  return fitText(text, spec, env.measure);
}

export type Align = 'left' | 'center' | 'right';

export interface LinesAnim {
  /** 줄 단위로 등장 상태를 돌려준다 */
  state: (line: number) => EnterState;
  /** true면 줄 영역을 마스크로 잘라 아래에서 밀려 올라오는 효과 */
  mask?: boolean;
}

/** 여러 줄 텍스트 그리기. (x, y)는 블록의 왼쪽 위(정렬 기준점은 align에 따름) */
export function drawLines(ctx: Ctx, block: TextBlock, x: number, y: number, align: Align, color: string, anim?: LinesAnim) {
  ctx.save();
  ctx.font = block.font;
  (ctx as CanvasRenderingContext2D).letterSpacing = `${block.letterSpacingPx}px`;
  // 'middle' = em 상자의 가운데. 한글 글꼴은 글리프가 em 상자 가운데에 놓여 줄 가운데 정렬이 안정적이다
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  block.lines.forEach((line, i) => {
    const w = measureLine(ctx, line, block.letterSpacingPx);
    const lx = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
    const top = y + i * block.lineHeightPx;
    const baseline = top + block.lineHeightPx / 2;
    const st = anim?.state(i);
    if (st && st.opacity <= 0) return;
    ctx.save();
    if (st) {
      if (anim?.mask) {
        ctx.beginPath();
        ctx.rect(lx - block.size, top - block.lineHeightPx * 0.25, w + block.size * 2, block.lineHeightPx * 1.3);
        ctx.clip();
        ctx.translate(0, (1 - st.p) * block.lineHeightPx * 1.05);
        ctx.globalAlpha *= clamp(st.raw * 3);
      } else {
        ctx.globalAlpha *= st.opacity;
        ctx.translate(st.dx, st.dy);
      }
    }
    ctx.fillText(line, lx, baseline);
    ctx.restore();
  });
  ctx.restore();
}

function measureLine(ctx: Ctx, line: string, ls: number) {
  return ctx.measureText(line).width - (line.length ? ls : 0);
}

/** 이미지 틀. 이미지가 없으면 자리표시를 그린다 */
export function drawImageBox(
  env: RenderEnv,
  img: LoadedImage | undefined,
  rect: Rect,
  crop: ImageCrop,
  opts: { radius?: number; extraZoom?: number; placeholder?: string } = {},
) {
  const { ctx } = env;
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, opts.radius ?? 0);
  ctx.clip();
  if (img) {
    const s = coverSource(img.width, img.height, rect, crop, opts.extraZoom ?? 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.source, s.sx, s.sy, s.sw, s.sh, rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.fillStyle = opts.placeholder ?? '#888';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}

/** 요소 하나에 등장 상태(이동·배율·투명도)를 적용해 그린다. 배율 기준점은 (ox, oy) */
export function withEnter(ctx: Ctx, st: EnterState, ox: number, oy: number, draw: () => void) {
  if (st.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha *= st.opacity;
  ctx.translate(st.dx + ox, st.dy + oy);
  ctx.scale(st.scale, st.scale);
  ctx.translate(-ox, -oy);
  draw();
  ctx.restore();
}

/** 장면 기준 시간으로 요소 등장 상태를 만드는 단축 함수 */
export const stateAt = (env: RenderEnv, localT: number, delay: number) =>
  (order: number, dir: Parameters<typeof enter>[4] = 'up', distScale = 1) => enter(env.mp, localT, delay, order, dir, distScale);

/** 로고/브랜드명: 로고가 있으면 로고를, 없으면 브랜드명 텍스트를 그린다. 그린 폭을 반환 */
export function drawBrandMark(
  env: RenderEnv,
  box: Rect,
  align: 'left' | 'center' | 'right',
  textColor: string,
  font: { family: string; weight: number; size: number },
): number {
  const { ctx, project } = env;
  const logo = env.image(project.logoId);
  if (logo) {
    // 로고 밝기와 배경이 비슷하면(흰 로고 on 밝은 배경 등) 받침판을 깔아 묻히지 않게 한다
    const tone = project.logoId ? project.assets[project.logoId]?.tone : undefined;
    const bgIsDark = luminance(textColor) > 0.5; // 배경 위 글자색이 밝으면 배경은 어둡다
    const needsPlate = !!tone && (bgIsDark ? tone.dark > 0.15 : tone.light > 0.15);
    const padX = needsPlate ? box.h * 0.24 : 0, padY = needsPlate ? box.h * 0.1 : 0;
    const scale = Math.min((box.w - padX * 2) / logo.width, (box.h - padY * 2) / logo.height);
    const w = logo.width * scale, h = logo.height * scale;
    const outerW = w + padX * 2;
    const x = align === 'left' ? box.x : align === 'center' ? box.x + (box.w - outerW) / 2 : box.x + box.w - outerW;
    if (needsPlate) {
      ctx.save();
      ctx.fillStyle = bgIsDark ? '#FFFFFF' : '#15161A';
      roundRectPath(ctx, x, box.y + (box.h - h) / 2 - padY, outerW, h + padY * 2, (h + padY * 2) / 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(logo.source, x + padX, box.y + (box.h - h) / 2, w, h);
    return outerW;
  }
  if (!project.brandName.trim()) return 0;
  const block = fit(env, project.brandName, {
    family: font.family, weight: font.weight, sizes: [font.size], lineHeight: 1.2, letterSpacing: 0.04,
    maxWidth: box.w, maxLines: 1,
  });
  const x = align === 'left' ? box.x : align === 'center' ? box.x + box.w / 2 : box.x + box.w;
  drawLines(ctx, block, x, box.y + (box.h - block.height) / 2, align, textColor);
  return block.width;
}

/** 텍스트 블록 여러 개를 간격과 함께 세로로 쌓았을 때의 전체 높이 */
export function stackHeight(items: Array<{ h: number; gap?: number }>): number {
  let total = 0;
  items.forEach((it, i) => {
    if (it.h <= 0) return;
    total += it.h + (i > 0 ? it.gap ?? 0 : 0);
  });
  return total;
}

/** 흔들림 없는 결정적 떠다니기(배경 장식) */
export const drift = (t: number, seed: number, amp: number) => Math.sin(t * 0.6 + seed * 1.7) * amp;

export const isLandscape = (img: LoadedImage | undefined) => !!img && img.width / img.height > 1.15;
export const isPortrait = (img: LoadedImage | undefined) => !!img && img.width / img.height < 0.87;
