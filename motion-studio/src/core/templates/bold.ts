// 템플릿 1: 임팩트 다크 — 어두운 배경, 굵은 고딕, 브랜드 색 패널 전환
import { ensureContrast, mix, onColor, rgba } from '../color';
import { clamp, lerp } from '../motion';
import type { TextBlock } from '../text';
import type { Scene } from '../types';
import { assetAspect, defaultFields, featureNumber, pad2, sceneDur } from './common';
import { drawBrandMark, drawImageBox, drawLines, drift, fit, roundRectPath, stateAt, withEnter } from './kit';
import { panelWipe } from './transitions';
import type { Palette, RenderEnv, SceneLayout, Template } from './types';

const SANS = 'Pretendard';

interface Box { x: number; y: number; w: number; h: number }

interface BoldLayout extends SceneLayout {
  image?: Box;
  textX: number;
  textW: number;
  align: 'left' | 'center';
  top: number;
  label?: TextBlock;
  title: TextBlock;
  body: TextBlock;
  button?: TextBlock;
  buttonBox?: Box;
}

const GAP_TITLE_BODY = 36;

function introLayout(env: RenderEnv, scene: Scene): BoldLayout {
  const { width: W, height: H, marginX: M, marginY: MY } = env.format;
  const CW = W - 2 * M;
  const hasImg = !!assetAspect(env, scene.imageId);
  const fractions = hasImg ? [0.44, 0.36] : [0];
  let best: BoldLayout | null = null;
  for (const f of fractions) {
    const imgW = Math.round(CW * f);
    const textW = hasImg ? CW - imgW - 104 : 1400;
    const title = fit(env, scene.title, { family: SANS, weight: 900, sizes: [128, 112, 100], lineHeight: 1.12, letterSpacing: -0.035, maxWidth: textW, maxLines: 3, balance: true });
    const body = fit(env, scene.body, { family: SANS, weight: 500, sizes: [44, 40], lineHeight: 1.45, letterSpacing: -0.01, maxWidth: Math.min(textW, 900), maxLines: 3 });
    const groupH = 10 + 44 + title.height + (body.lines.length ? GAP_TITLE_BODY + body.height : 0);
    const minTop = MY + 88 + 40;
    const top = Math.max(minTop, (H - groupH) / 2 + 20);
    const layout: BoldLayout = {
      report: { overflow: [...(title.overflow ? ['title'] : []), ...(body.overflow ? ['body'] : [])], variant: hasImg ? `split-${f}` : 'text', imageAspect: hasImg ? imgW / (H - 2 * MY) : undefined },
      image: hasImg ? { x: W - M - imgW, y: MY, w: imgW, h: H - 2 * MY } : undefined,
      textX: M,
      textW,
      align: 'left',
      top,
      title,
      body,
    };
    best = layout;
    if (!layout.report.overflow.length) break;
  }
  return best!;
}

function featureLayout(env: RenderEnv, scene: Scene, index: number): BoldLayout {
  const { width: W, height: H, marginX: M, marginY: MY } = env.format;
  const CW = W - 2 * M;
  const CH = H - 2 * MY;
  const ar = assetAspect(env, scene.imageId);
  const label = fit(env, pad2(featureNumber(env.project.scenes, index)), { family: SANS, weight: 900, sizes: [34], lineHeight: 1.2, letterSpacing: 0.02, maxWidth: 200, maxLines: 1 });
  // 이미지 비율에 맞춰 틀 폭을 정하되, 글 영역을 보장하는 범위 안에서만
  const widths = ar ? [clamp(CH * ar, CW * 0.36, CW * 0.5), CW * 0.34] : [0];
  let best: BoldLayout | null = null;
  for (const imgW0 of widths) {
    const imgW = Math.round(imgW0);
    const textW = ar ? CW - imgW - 112 : 1300;
    const title = fit(env, scene.title, { family: SANS, weight: 800, sizes: [80, 72, 64], lineHeight: 1.2, letterSpacing: -0.025, maxWidth: textW, maxLines: 3, balance: true });
    const body = fit(env, scene.body, { family: SANS, weight: 400, sizes: [42, 38], lineHeight: 1.58, letterSpacing: -0.01, maxWidth: Math.min(textW, 820), maxLines: 4 });
    const groupH = label.height + 32 + title.height + (body.lines.length ? GAP_TITLE_BODY + body.height : 0);
    const layout: BoldLayout = {
      report: { overflow: [...(title.overflow ? ['title'] : []), ...(body.overflow ? ['body'] : [])], variant: ar ? `split-${Math.round(imgW)}` : 'text', imageAspect: ar ? imgW / CH : undefined },
      image: ar ? { x: M, y: MY, w: imgW, h: CH } : undefined,
      textX: ar ? M + imgW + 112 : (W - textW) / 2,
      textW,
      align: 'left',
      top: (H - groupH) / 2,
      label,
      title,
      body,
    };
    best = layout;
    if (!layout.report.overflow.length) break;
  }
  return best!;
}

function highlightLayout(env: RenderEnv, scene: Scene): BoldLayout {
  const { width: W, height: H } = env.format;
  const title = fit(env, scene.title, { family: SANS, weight: 900, sizes: [132, 116, 104], lineHeight: 1.3, letterSpacing: -0.035, maxWidth: 1480, maxLines: 3, balance: true });
  const body = fit(env, scene.body, { family: SANS, weight: 500, sizes: [44, 40], lineHeight: 1.45, letterSpacing: -0.01, maxWidth: 1300, maxLines: 2 });
  const groupH = title.height + (body.lines.length ? 56 + body.height : 0);
  return {
    report: { overflow: [...(title.overflow ? ['title'] : []), ...(body.overflow ? ['body'] : [])], variant: 'center' },
    textX: W / 2, textW: 1480, align: 'center', top: (H - groupH) / 2, title, body,
  };
}

function ctaLayout(env: RenderEnv, scene: Scene): BoldLayout {
  const { width: W, height: H, marginY: MY } = env.format;
  const title = fit(env, scene.title, { family: SANS, weight: 900, sizes: [116, 104, 92], lineHeight: 1.14, letterSpacing: -0.035, maxWidth: 1500, maxLines: 2, balance: true });
  const body = fit(env, scene.body, { family: SANS, weight: 500, sizes: [44, 40], lineHeight: 1.45, letterSpacing: -0.01, maxWidth: 1300, maxLines: 2 });
  const button = fit(env, scene.button ?? '', { family: SANS, weight: 700, sizes: [46, 42], lineHeight: 1.2, letterSpacing: -0.01, maxWidth: 900, maxLines: 1 });
  const btnH = button.lines.length ? button.height + 64 : 0;
  const btnW = button.width + 128;
  const groupH = title.height + (body.lines.length ? 32 + body.height : 0) + (btnH ? 64 + btnH : 0);
  const areaBottom = H - MY - 110;
  const top = Math.max(MY, (areaBottom + MY) / 2 - groupH / 2 + 20);
  return {
    report: { overflow: [...(title.overflow ? ['title'] : []), ...(body.overflow ? ['body'] : []), ...(button.overflow ? ['button'] : [])], variant: 'center' },
    textX: W / 2, textW: 1500, align: 'center', top, title, body, button,
    buttonBox: btnH ? { x: W / 2 - btnW / 2, y: top + groupH - btnH, w: btnW, h: btnH } : undefined,
  };
}

function drawBackground(env: RenderEnv, pal: Palette, localT: number, index: number) {
  const { ctx, format } = env;
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, format.width, format.height);
  // 은은한 브랜드 색 빛
  const gx = format.width * (index % 2 ? 0.12 : 0.88) + drift(localT, index, env.mp.drift * 3);
  const gy = format.height * 0.08;
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 980);
  g.addColorStop(0, rgba(pal.primary, 0.32));
  g.addColorStop(1, rgba(pal.primary, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, format.width, format.height);
}

export const boldTemplate: Template = {
  id: 'bold',
  name: '임팩트 다크',
  tagline: '어두운 배경 위 굵은 글씨와 브랜드 색 패널로 강렬하게',
  traits: ['신제품·IT·스포츠', '굵은 고딕', '색 패널 전환'],
  fonts: [SANS],
  defaultColors: { primary: '#FF5A1F', accent: '#FFD23F' },
  defaultMotion: { feel: 'smooth', speed: 'normal', emphasis: 'normal' },
  fields: defaultFields,

  palette(colors) {
    const bg = mix('#0B0C10', colors.primary, 0.06);
    return {
      bg,
      bgAlt: mix(bg, '#FFFFFF', 0.06),
      surface: mix(bg, '#FFFFFF', 0.1),
      text: '#FFFFFF',
      subtext: mix('#FFFFFF', bg, 0.28),
      primary: colors.primary,
      onPrimary: onColor(colors.primary, undefined, undefined, true),
      accent: colors.accent,
      onAccent: onColor(colors.accent),
      primaryOnBg: ensureContrast(colors.primary, bg, 3),
    };
  },

  elementCount(scene) {
    return scene.kind === 'highlight' ? 3 : 4;
  },

  layout(env, scene, index) {
    switch (scene.kind) {
      case 'intro': return introLayout(env, scene);
      case 'feature': return featureLayout(env, scene, index);
      case 'highlight': return highlightLayout(env, scene);
      case 'cta': return ctaLayout(env, scene);
    }
  },

  drawScene(env, scene, index, localT, raw) {
    const L = raw as BoldLayout;
    const { ctx, palette: pal, format } = env;
    const delay = env.timeline.scenes[index]?.enterDelay ?? 0.2;
    const st = stateAt(env, localT, delay);
    const dur = sceneDur(env, index);
    const kb = env.mp.kenBurns * clamp(localT / dur);

    if (scene.kind === 'cta') {
      ctx.fillStyle = pal.primary;
      ctx.fillRect(0, 0, format.width, format.height);
      // 천천히 회전하는 동심원 장식
      ctx.save();
      ctx.strokeStyle = rgba(pal.onPrimary, 0.09);
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const r = 320 + i * 170 + drift(localT, i, env.mp.drift);
        ctx.beginPath();
        ctx.arc(format.width * 0.5, format.height * 1.05, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      drawBackground(env, pal, localT, index);
    }

    // 로고/브랜드명 (도입 장면 상단)
    if (scene.kind === 'intro') {
      withEnter(ctx, st(0, 'none'), 0, 0, () =>
        drawBrandMark(env, { x: format.marginX, y: format.marginY - 12, w: 420, h: 88 }, 'left', pal.text, { family: SANS, weight: 800, size: 32 }),
      );
    }

    // 이미지 카드: 아래에서 위로 열리며 천천히 확대
    if (L.image) {
      const s = st(0, scene.kind === 'feature' ? 'right' : 'left', 0.8);
      const reveal = clamp(s.p);
      const box = L.image;
      const h = box.h * reveal;
      ctx.save();
      ctx.globalAlpha *= s.opacity;
      ctx.translate(s.dx, 0);
      drawImageBox(env, env.image(scene.imageId), { x: box.x, y: box.y + box.h - h, w: box.w, h }, scene.crop, { radius: 28, extraZoom: kb, placeholder: pal.surface });
      ctx.restore();
    }

    const x = L.textX;
    let y = L.top;

    if (scene.kind === 'intro') {
      const s = st(1, 'none');
      ctx.fillStyle = pal.primaryOnBg;
      ctx.fillRect(x, y, 120 * clamp(s.p), 10);
      y += 10 + 44;
    }
    if (L.label) {
      const s = st(0.5, 'up', 0.4);
      withEnter(ctx, s, x, y, () => {
        drawLines(ctx, L.label!, x, y, 'left', pal.primaryOnBg);
        ctx.fillStyle = pal.primaryOnBg;
        ctx.fillRect(x + L.label!.width + 20, y + L.label!.height / 2 - 2, 64 * clamp(s.p), 4);
      });
      y += L.label.height + 32;
    }

    const titleOrder = scene.kind === 'intro' ? 1.2 : 1;
    if (scene.kind === 'highlight') {
      // 줄마다 브랜드 색 상자가 먼저 펼쳐지고, 그 위로 글자가 올라온다
      const T = L.title;
      T.lines.forEach((line, i) => {
        const w = env.measure(line, T.font, T.letterSpacingPx);
        const bs = st(i * 0.8, 'none');
        const padX = 30;
        const bx = L.textX - w / 2 - padX;
        const by = y + i * T.lineHeightPx + T.lineHeightPx * 0.06;
        const bh = T.lineHeightPx * 0.88;
        const pop = 1 + env.mp.pop * 0.06 * Math.sin(Math.PI * clamp(bs.raw));
        ctx.save();
        ctx.translate(L.textX, by + bh / 2);
        ctx.scale(pop, pop);
        ctx.translate(-L.textX, -(by + bh / 2));
        ctx.fillStyle = pal.primary;
        roundRectPath(ctx, bx, by, (w + padX * 2) * clamp(bs.p), bh, 10);
        ctx.fill();
        ctx.restore();
      });
      drawLines(ctx, T, L.textX, y, 'center', pal.onPrimary, { state: (i) => st(i * 0.8 + 0.6), mask: true });
      y += T.height + 56;
    } else {
      const color = scene.kind === 'cta' ? pal.onPrimary : pal.text;
      drawLines(ctx, L.title, x, y, L.align, color, { state: (i) => st(titleOrder + i * 0.55), mask: true });
      y += L.title.height + (scene.kind === 'cta' ? 32 : GAP_TITLE_BODY);
    }

    if (L.body.lines.length) {
      const color = scene.kind === 'cta' ? rgba(pal.onPrimary, 0.82) : pal.subtext;
      const order = scene.kind === 'highlight' ? L.title.lines.length * 0.8 + 0.6 : titleOrder + L.title.lines.length * 0.55 + 0.3;
      const s = st(order);
      withEnter(ctx, { ...s, scale: 1 }, x, y, () => drawLines(ctx, L.body, x, y, L.align, color));
    }

    if (L.button && L.buttonBox && L.button.lines.length) {
      const b = L.buttonBox;
      const s = st(3, 'up');
      const settled = clamp((localT - (delay + 3 * env.mp.stagger + env.mp.enterDur)) / 0.3);
      const pulse = 1 + settled * env.mp.pop * 0.035 * Math.sin((localT * Math.PI * 2) / 1.6);
      withEnter(ctx, { ...s, scale: s.scale * pulse }, b.x + b.w / 2, b.y + b.h / 2, () => {
        ctx.fillStyle = pal.bg;
        roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2);
        ctx.fill();
        drawLines(ctx, L.button!, b.x + b.w / 2, b.y + 32, 'center', ensureContrast(pal.primary, pal.bg, 4.5));
      });
    }

    if (scene.kind === 'cta') {
      const s = st(3.5, 'up', 0.5);
      withEnter(ctx, s, format.width / 2, format.height - format.marginY - 32, () =>
        drawBrandMark(env, { x: format.width / 2 - 240, y: format.height - format.marginY - 84, w: 480, h: 96 }, 'center', pal.onPrimary, { family: SANS, weight: 800, size: 34 }),
      );
    }

    // 하단 진행 표시줄(장면 내 공통 요소)
    if (scene.kind !== 'cta') {
      const total = env.project.scenes.length;
      const barW = 160;
      const bx = format.width - format.marginX - barW;
      const by = format.height - format.marginY / 2;
      ctx.fillStyle = rgba(pal.text, 0.18);
      ctx.fillRect(bx, by, barW, 4);
      ctx.fillStyle = pal.primaryOnBg;
      const prog = lerp(index / total, (index + 1) / total, clamp(localT / dur));
      ctx.fillRect(bx, by, barW * prog, 4);
    }
  },

  drawTransition(env, p, drawOut, drawIn) {
    panelWipe(env, p, drawOut, drawIn, [env.palette.primary, env.palette.accent]);
  },
};
