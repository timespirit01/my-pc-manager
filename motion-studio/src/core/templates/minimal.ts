// 템플릿 2: 클린 에디토리얼 — 밝은 종이 배경, 명조 제목, 넓은 여백, 반면 가득 채운 사진, 부드러운 겹침 전환
import { ensureContrast, mix, onColor, rgba } from '../color';
import { clamp } from '../motion';
import type { TextBlock } from '../text';
import type { Scene } from '../types';
import { assetAspect, defaultFields, featureNumber, pad2, sceneDur } from './common';
import { drawBrandMark, drawImageBox, drawLines, fit, roundRectPath, stateAt, withEnter } from './kit';
import { fadeSlide } from './transitions';
import type { RenderEnv, SceneLayout, Template } from './types';

const SERIF = 'NanumMyeongjo';
const SANS = 'Pretendard';

interface Box { x: number; y: number; w: number; h: number }

interface MinimalLayout extends SceneLayout {
  image?: Box;
  imageSide?: 'left' | 'right';
  textX: number;
  align: 'left' | 'center';
  top: number;
  label?: TextBlock;
  title: TextBlock;
  body: TextBlock;
  button?: TextBlock;
  buttonBox?: Box;
}

const overflowOf = (...pairs: Array<[string, TextBlock | undefined]>) => pairs.filter(([, b]) => b?.overflow).map(([k]) => k);

function splitLayout(env: RenderEnv, scene: Scene, index: number, kind: 'intro' | 'feature'): MinimalLayout {
  const { width: W, height: H, marginX: M } = env.format;
  const ar = assetAspect(env, scene.imageId);
  // 핵심 내용 장면은 사진 위치를 번갈아 배치해 리듬을 만든다(텍스트와 겹치지 않음)
  const side: 'left' | 'right' = kind === 'feature' && featureNumber(env.project.scenes, index) % 2 === 1 ? 'left' : 'right';
  const label = kind === 'feature' ? fit(env, pad2(featureNumber(env.project.scenes, index)), { family: SERIF, weight: 800, sizes: [44], lineHeight: 1.2, letterSpacing: 0, maxWidth: 200, maxLines: 1 }) : undefined;
  const splits = ar ? [0.5, 0.42] : [0];
  let best: MinimalLayout | null = null;
  for (const f of splits) {
    const imgW = Math.round(W * f);
    const textW = ar ? W - imgW - M - 104 : 1180;
    const title = fit(env, scene.title, kind === 'intro'
      ? { family: SERIF, weight: 800, sizes: [100, 88, 78], lineHeight: 1.3, letterSpacing: -0.02, maxWidth: textW, maxLines: 4, balance: true }
      : { family: SERIF, weight: 800, sizes: [74, 66, 60], lineHeight: 1.34, letterSpacing: -0.02, maxWidth: textW, maxLines: 3, balance: true });
    const body = fit(env, scene.body, { family: SANS, weight: 400, sizes: kind === 'intro' ? [40, 36] : [38, 35], lineHeight: 1.65, letterSpacing: -0.005, maxWidth: Math.min(textW, 760), maxLines: kind === 'intro' ? 3 : 4 });
    const labelH = label ? label.height + 36 : kind === 'intro' ? 76 : 0;
    const groupH = labelH + title.height + (body.lines.length ? 40 + body.height : 0);
    const textX = !ar ? (W - textW) / 2 : side === 'right' ? M : imgW + 104;
    best = {
      report: { overflow: overflowOf(['title', title], ['body', body]), variant: ar ? `half-${f}` : 'text', imageAspect: ar ? imgW / H : undefined },
      image: ar ? { x: side === 'right' ? W - imgW : 0, y: 0, w: imgW, h: H } : undefined,
      imageSide: side,
      textX,
      align: 'left',
      top: (H - groupH) / 2 + (kind === 'intro' ? 20 : 0),
      label,
      title,
      body,
    };
    if (!best.report.overflow.length) break;
  }
  return best!;
}

function highlightLayout(env: RenderEnv, scene: Scene): MinimalLayout {
  const { width: W, height: H } = env.format;
  const title = fit(env, scene.title, { family: SERIF, weight: 800, sizes: [96, 86, 76], lineHeight: 1.34, letterSpacing: -0.02, maxWidth: 1400, maxLines: 3, balance: true });
  const body = fit(env, scene.body, { family: SANS, weight: 500, sizes: [40, 36], lineHeight: 1.5, letterSpacing: 0, maxWidth: 1200, maxLines: 2 });
  const groupH = 150 + title.height + (body.lines.length ? 70 + body.height : 0);
  return { report: { overflow: overflowOf(['title', title], ['body', body]), variant: 'quote' }, textX: W / 2, align: 'center', top: (H - groupH) / 2, title, body };
}

function ctaLayout(env: RenderEnv, scene: Scene): MinimalLayout {
  const { width: W, height: H, marginY: MY } = env.format;
  const title = fit(env, scene.title, { family: SERIF, weight: 800, sizes: [92, 82, 72], lineHeight: 1.3, letterSpacing: -0.02, maxWidth: 1400, maxLines: 2, balance: true });
  const body = fit(env, scene.body, { family: SANS, weight: 400, sizes: [40, 36], lineHeight: 1.5, letterSpacing: 0, maxWidth: 1300, maxLines: 2 });
  const button = fit(env, scene.button ?? '', { family: SANS, weight: 600, sizes: [38, 34], lineHeight: 1.2, letterSpacing: 0.02, maxWidth: 900, maxLines: 1 });
  const btnH = button.lines.length ? button.height + 56 : 0;
  const btnW = button.width + 112;
  const groupH = title.height + (body.lines.length ? 36 + body.height : 0) + (btnH ? 64 + btnH : 0);
  const top = Math.max(MY + 100, (H - groupH) / 2 - 10);
  return {
    report: { overflow: overflowOf(['title', title], ['body', body], ['button', button]), variant: 'center' },
    textX: W / 2, align: 'center', top, title, body, button,
    buttonBox: btnH ? { x: W / 2 - btnW / 2, y: top + groupH - btnH, w: btnW, h: btnH } : undefined,
  };
}

export const minimalTemplate: Template = {
  id: 'minimal',
  name: '클린 에디토리얼',
  tagline: '밝은 여백과 명조 제목으로 잡지처럼 차분하고 고급스럽게',
  traits: ['카페·뷰티·공예', '명조 제목', '부드러운 겹침 전환'],
  fonts: [SERIF, SANS],
  defaultColors: { primary: '#9A5B3C', accent: '#C9A66B' },
  defaultMotion: { feel: 'calm', speed: 'normal', emphasis: 'low' },
  fields: defaultFields,

  palette(colors) {
    const bg = mix('#F7F4EF', colors.primary, 0.035);
    return {
      bg,
      bgAlt: mix(bg, '#000000', 0.035),
      surface: mix(bg, '#000000', 0.08),
      text: '#1C1B19',
      subtext: '#5F5A54',
      primary: colors.primary,
      onPrimary: onColor(colors.primary),
      accent: colors.accent,
      onAccent: onColor(colors.accent),
      primaryOnBg: ensureContrast(colors.primary, bg, 3.2),
    };
  },

  elementCount(scene) {
    return scene.kind === 'highlight' ? 3 : 4;
  },

  layout(env, scene, index) {
    switch (scene.kind) {
      case 'intro': return splitLayout(env, scene, index, 'intro');
      case 'feature': return splitLayout(env, scene, index, 'feature');
      case 'highlight': return highlightLayout(env, scene);
      case 'cta': return ctaLayout(env, scene);
    }
  },

  drawScene(env, scene, index, localT, raw) {
    const L = raw as MinimalLayout;
    const { ctx, palette: pal, format } = env;
    const W = format.width, H = format.height;
    const delay = env.timeline.scenes[index]?.enterDelay ?? 0.2;
    const st = stateAt(env, localT, delay);
    const dur = sceneDur(env, index);

    ctx.fillStyle = scene.kind === 'highlight' ? pal.bgAlt : pal.bg;
    ctx.fillRect(0, 0, W, H);

    // 사진: 가장자리에서 열리는 와이프 + 느린 확대
    if (L.image) {
      const s = st(0, 'none');
      const box = L.image;
      const w = box.w * clamp(s.p);
      const x = L.imageSide === 'right' ? box.x + box.w - w : box.x;
      drawImageBox(env, env.image(scene.imageId), { x, y: box.y, w, h: box.h }, scene.crop, {
        extraZoom: env.mp.kenBurns * clamp(localT / dur) + (1 - clamp(s.p)) * 0.08,
        placeholder: pal.surface,
      });
    }

    const x = L.textX;
    let y = L.top;
    const fadeUp = (order: number) => (i: number) => st(order + i * 0.45, 'up', 0.6);

    if (scene.kind === 'intro') {
      const s = st(0.3, 'none');
      withEnter(ctx, s, 0, 0, () => {
        drawBrandMark(env, { x, y: y - 24, w: 380, h: 68 }, 'left', pal.primaryOnBg, { family: SANS, weight: 700, size: 26 });
      });
      y += 76;
    }
    if (L.label) {
      const s = st(0.3, 'up', 0.4);
      withEnter(ctx, s, x, y, () => {
        drawLines(ctx, L.label!, x, y, 'left', pal.primaryOnBg);
        ctx.fillStyle = pal.primaryOnBg;
        ctx.fillRect(x + L.label!.width + 22, y + L.label!.height / 2, 72 * clamp(s.p), 2);
      });
      y += L.label.height + 36;
    }

    if (scene.kind === 'highlight') {
      // 큰 따옴표와 가는 선
      const q = st(0, 'up', 0.5);
      withEnter(ctx, q, W / 2, y + 60, () => {
        ctx.font = `800 220px "${SERIF}"`;
        (ctx as CanvasRenderingContext2D).letterSpacing = '0px';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = pal.primaryOnBg;
        ctx.fillText('“', W / 2, y + 190);
      });
      y += 150;
    }

    const titleOrder = scene.kind === 'highlight' ? 0.8 : 1;
    drawLines(ctx, L.title, x, y, L.align, pal.text, { state: fadeUp(titleOrder) });
    y += L.title.height;

    if (scene.kind === 'highlight') {
      const s = st(titleOrder + L.title.lines.length * 0.45, 'none');
      ctx.fillStyle = pal.primaryOnBg;
      const lw = 140 * clamp(s.p);
      ctx.fillRect(W / 2 - lw / 2, y + 34, lw, 2);
      y += 70;
    } else {
      y += scene.kind === 'cta' ? 36 : 40;
    }

    if (L.body.lines.length) {
      const order = titleOrder + L.title.lines.length * 0.45 + 0.3;
      drawLines(ctx, L.body, x, y, L.align, pal.subtext, { state: fadeUp(order) });
    }

    if (L.button && L.buttonBox && L.button.lines.length) {
      const b = L.buttonBox;
      const s = st(3, 'up', 0.6);
      // 테두리만 있던 버튼이 왼쪽부터 브랜드 색으로 채워진다(채워진 부분의 글자는 반전색 → 항상 읽힘)
      const fillStart = delay + 3 * env.mp.stagger + env.mp.enterDur * 0.6;
      const fill = clamp(env.mp.transition(clamp((localT - fillStart) / (env.mp.enterDur * 0.8))));
      const fw = b.w * fill;
      withEnter(ctx, { ...s, scale: 1 }, 0, 0, () => {
        ctx.strokeStyle = pal.primaryOnBg;
        ctx.lineWidth = 2;
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 4);
        ctx.stroke();
        drawLines(ctx, L.button!, b.x + b.w / 2, b.y + 28, 'center', pal.primaryOnBg);
        if (fw > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(b.x - 2, b.y - 2, fw + 2, b.h + 4);
          ctx.clip();
          ctx.fillStyle = pal.primary;
          roundRectPath(ctx, b.x, b.y, b.w, b.h, 4);
          ctx.fill();
          drawLines(ctx, L.button!, b.x + b.w / 2, b.y + 28, 'center', pal.onPrimary);
          ctx.restore();
        }
      });
    }

    if (scene.kind === 'cta') {
      const s = st(3.5, 'none');
      withEnter(ctx, s, 0, 0, () => {
        drawBrandMark(env, { x: W / 2 - 240, y: format.marginY - 24, w: 480, h: 88 }, 'center', pal.text, { family: SANS, weight: 700, size: 28 });
        ctx.fillStyle = rgba(pal.text, 0.15);
        ctx.fillRect(format.marginX, H - format.marginY + 20, W - 2 * format.marginX, 1);
      });
    }

    // 쪽 번호 (잡지 느낌의 공통 요소)
    if (scene.kind !== 'cta') {
      const onImage = L.image && L.imageSide === 'right';
      const px = onImage ? format.marginX : W - format.marginX;
      ctx.save();
      ctx.font = `500 22px "${SANS}"`;
      (ctx as CanvasRenderingContext2D).letterSpacing = '3px';
      ctx.textAlign = onImage ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(pal.text, 0.45);
      ctx.fillText(`${pad2(index + 1)} / ${pad2(env.project.scenes.length)}`, px, H - format.marginY / 2 - 6);
      ctx.restore();
    }
  },

  drawTransition(env, p, drawOut, drawIn) {
    fadeSlide(env, p, drawOut, drawIn);
  },
};
