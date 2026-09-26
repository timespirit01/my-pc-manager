// 템플릿 3: 팝 컬러 — 브랜드 색 배경, 두꺼운 제목 글꼴, 스티커처럼 붙는 사진, 원형 전환
import { ensureContrast, mix, onColor, rgba } from '../color';
import { clamp } from '../motion';
import type { TextBlock } from '../text';
import type { Scene } from '../types';
import { assetAspect, defaultFields, featureNumber, sceneDur } from './common';
import { drawBrandMark, drawImageBox, drawLines, drift, fit, roundRectPath, stateAt, withEnter } from './kit';
import { circleReveal } from './transitions';
import type { Palette, RenderEnv, SceneLayout, Template } from './types';

const DISPLAY = 'BlackHanSans';
const SANS = 'Pretendard';
const CARD_TEXT = '#17181D';

interface Box { x: number; y: number; w: number; h: number }

interface PopLayout extends SceneLayout {
  sticker?: Box & { angle: number };
  card?: Box;
  textX: number;
  align: 'left' | 'center';
  top: number;
  badge?: string;
  title: TextBlock;
  body: TextBlock;
  button?: TextBlock;
  buttonBox?: Box;
}

const overflowOf = (...pairs: Array<[string, TextBlock | undefined]>) => pairs.filter(([, b]) => b?.overflow).map(([k]) => k);

/** 사진 비율을 유지하는 스티커 틀 (너무 길쭉하면 적당히 잘라낸다) */
function stickerBox(ar: number, maxW: number, maxH: number): { w: number; h: number } {
  const a = clamp(ar, 0.72, 1.5);
  let w = maxW, h = maxW / a;
  if (h > maxH) { h = maxH; w = maxH * a; }
  return { w: Math.round(w), h: Math.round(h) };
}

function introLayout(env: RenderEnv, scene: Scene): PopLayout {
  const { width: W, height: H, marginX: M, marginY: MY } = env.format;
  const ar = assetAspect(env, scene.imageId);
  const maxWs = ar ? [720, 600] : [0];
  let best: PopLayout | null = null;
  for (const mw of maxWs) {
    const sb = ar ? stickerBox(ar, mw, H - 2 * MY - 60) : { w: 0, h: 0 };
    const textW = ar ? W - 2 * M - sb.w - 120 : 1500;
    const title = fit(env, scene.title, { family: DISPLAY, weight: 400, sizes: [132, 116, 102], lineHeight: 1.14, letterSpacing: -0.01, maxWidth: textW, maxLines: 3, balance: true });
    const body = fit(env, scene.body, { family: SANS, weight: 600, sizes: [44, 40], lineHeight: 1.45, letterSpacing: -0.01, maxWidth: Math.min(textW, 900), maxLines: 3 });
    const groupH = title.height + (body.lines.length ? 40 + body.height : 0);
    best = {
      report: { overflow: overflowOf(['title', title], ['body', body]), variant: ar ? `sticker-${mw}` : 'text', imageAspect: ar ? sb.w / sb.h : undefined },
      sticker: ar ? { x: W - M - sb.w, y: (H - sb.h) / 2 + 10, w: sb.w, h: sb.h, angle: -3.5 } : undefined,
      textX: ar ? M : W / 2,
      align: ar ? 'left' : 'center',
      top: Math.max(MY + 90, (H - groupH) / 2 + 20),
      title,
      body,
    };
    if (!best.report.overflow.length) break;
  }
  return best!;
}

function featureLayout(env: RenderEnv, scene: Scene, index: number): PopLayout {
  const { width: W, height: H, marginX: M, marginY: MY } = env.format;
  const ar = assetAspect(env, scene.imageId);
  const n = featureNumber(env.project.scenes, index);
  const maxWs = ar ? [640, 540] : [0];
  let best: PopLayout | null = null;
  for (const mw of maxWs) {
    const sb = ar ? stickerBox(ar, mw, H - 2 * MY - 60) : { w: 0, h: 0 };
    const cardW = ar ? W - 2 * M - sb.w - 100 : 1320;
    const innerW = cardW - 2 * 72;
    const title = fit(env, scene.title, { family: DISPLAY, weight: 400, sizes: [80, 72, 64], lineHeight: 1.2, letterSpacing: -0.005, maxWidth: innerW, maxLines: 3, balance: true });
    const body = fit(env, scene.body, { family: SANS, weight: 500, sizes: [40, 36], lineHeight: 1.55, letterSpacing: -0.01, maxWidth: innerW, maxLines: 4 });
    const badgeH = 76;
    const contentH = badgeH + 36 + title.height + (body.lines.length ? 30 + body.height : 0);
    const cardH = Math.min(H - 2 * MY, contentH + 2 * 68);
    const cardX = ar ? M : (W - cardW) / 2;
    const cardY = (H - cardH) / 2;
    best = {
      report: { overflow: overflowOf(['title', title], ['body', body]), variant: ar ? `card-${mw}` : 'card', imageAspect: ar ? sb.w / sb.h : undefined },
      sticker: ar ? { x: W - M - sb.w, y: (H - sb.h) / 2, w: sb.w, h: sb.h, angle: n % 2 ? 3 : -3 } : undefined,
      card: { x: cardX, y: cardY, w: cardW, h: cardH },
      textX: cardX + 72,
      align: 'left',
      top: cardY + 68,
      badge: String(n),
      title,
      body,
    };
    if (!best.report.overflow.length) break;
  }
  return best!;
}

function highlightLayout(env: RenderEnv, scene: Scene): PopLayout {
  const { width: W, height: H } = env.format;
  const title = fit(env, scene.title, { family: DISPLAY, weight: 400, sizes: [150, 130, 112], lineHeight: 1.14, letterSpacing: -0.01, maxWidth: 1480, maxLines: 3, balance: true });
  const body = fit(env, scene.body, { family: SANS, weight: 700, sizes: [46, 40], lineHeight: 1.4, letterSpacing: -0.01, maxWidth: 1300, maxLines: 2 });
  const groupH = title.height + (body.lines.length ? 48 + body.height + 28 : 0);
  return { report: { overflow: overflowOf(['title', title], ['body', body]), variant: 'burst' }, textX: W / 2, align: 'center', top: (H - groupH) / 2, title, body };
}

function ctaLayout(env: RenderEnv, scene: Scene): PopLayout {
  const { width: W, height: H, marginY: MY } = env.format;
  const title = fit(env, scene.title, { family: DISPLAY, weight: 400, sizes: [120, 106, 94], lineHeight: 1.16, letterSpacing: -0.01, maxWidth: 1500, maxLines: 2, balance: true });
  const body = fit(env, scene.body, { family: SANS, weight: 600, sizes: [44, 40], lineHeight: 1.45, letterSpacing: -0.01, maxWidth: 1300, maxLines: 2 });
  const button = fit(env, scene.button ?? '', { family: SANS, weight: 800, sizes: [48, 42], lineHeight: 1.2, letterSpacing: -0.01, maxWidth: 900, maxLines: 1 });
  const btnH = button.lines.length ? button.height + 64 : 0;
  const btnW = button.width + 140;
  const groupH = title.height + (body.lines.length ? 32 + body.height : 0) + (btnH ? 60 + btnH : 0);
  const top = Math.max(MY, (H - 130 - groupH) / 2 + 10);
  return {
    report: { overflow: overflowOf(['title', title], ['body', body], ['button', button]), variant: 'center' },
    textX: W / 2, align: 'center', top, title, body, button,
    buttonBox: btnH ? { x: W / 2 - btnW / 2, y: top + groupH - btnH, w: btnW, h: btnH } : undefined,
  };
}

function drawDecor(env: RenderEnv, pal: Palette, localT: number, index: number, bg: string, ink: string) {
  const { ctx, format } = env;
  const W = format.width, H = format.height;
  const d = env.mp.drift;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // 큰 원 두 개와 점 격자, 링 — 결정적으로 천천히 떠다닌다
  const flip = index % 2 === 0;
  ctx.fillStyle = rgba(pal.accent === bg ? pal.onAccent : pal.accent, 0.95);
  ctx.beginPath();
  ctx.arc(flip ? W - 40 + drift(localT, 1, d) : 60 + drift(localT, 1, d), flip ? -30 : H + 20, 230, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(ink, 0.18);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(flip ? 90 : W - 120, flip ? H - 80 + drift(localT, 2, d) : 110 + drift(localT, 2, d), 120, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(ink, 0.16);
  const gx = flip ? W * 0.44 : W * 0.5, gy = flip ? H - 150 : 90;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
    ctx.beginPath();
    ctx.arc(gx + i * 34, gy + j * 34 + drift(localT, 3, d * 0.4), 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSticker(env: RenderEnv, scene: Scene, box: Box & { angle: number }, localT: number, delay: number, dur: number) {
  const { ctx } = env;
  const s = stateAt(env, localT, delay)(0, 'up', 0.6);
  if (s.opacity <= 0) return;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  // 강조가 강할수록 더 작게 시작해 튀어나온다
  const popScale = 0.55 + 0.45 * (1 - env.mp.pop * 0.4);
  const scale = popScale + (1 - popScale) * s.p;
  const angle = ((box.angle + drift(localT, 5, 0.6)) * Math.PI) / 180 * (0.4 + 0.6 * clamp(s.p));
  ctx.save();
  ctx.globalAlpha *= s.opacity;
  ctx.translate(cx, cy + s.dy);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  const border = 16;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 22;
  ctx.fillStyle = '#FFFFFF';
  roundRectPath(ctx, box.x - border, box.y - border, box.w + border * 2, box.h + border * 2, 36);
  ctx.fill();
  ctx.restore();
  drawImageBox(env, env.image(scene.imageId), box, scene.crop, { radius: 24, extraZoom: env.mp.kenBurns * clamp(localT / dur), placeholder: '#DDD' });
  ctx.restore();
}

export const popTemplate: Template = {
  id: 'pop',
  name: '팝 컬러',
  tagline: '브랜드 색 배경과 통통 튀는 스티커로 밝고 친근하게',
  traits: ['식음료·행사·키즈', '두꺼운 제목', '원형 전환'],
  fonts: [DISPLAY, SANS],
  defaultColors: { primary: '#5B4CF0', accent: '#FFC53D' },
  defaultMotion: { feel: 'lively', speed: 'normal', emphasis: 'normal' },
  fields: defaultFields,

  palette(colors) {
    const bg = colors.primary;
    const text = onColor(bg, undefined, undefined, true);
    return {
      bg,
      bgAlt: mix(bg, '#FFFFFF', 0.15),
      surface: '#FFFFFF',
      text,
      subtext: mix(text, bg, 0.15),
      primary: colors.primary,
      onPrimary: text,
      accent: colors.accent,
      onAccent: onColor(colors.accent, undefined, undefined, true),
      primaryOnBg: ensureContrast(colors.primary, '#FFFFFF', 3),
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
    const L = raw as PopLayout;
    const { ctx, palette: pal, format } = env;
    const W = format.width, H = format.height;
    const delay = env.timeline.scenes[index]?.enterDelay ?? 0.2;
    const st = stateAt(env, localT, delay);
    const dur = sceneDur(env, index);
    const isHi = scene.kind === 'highlight';
    const bg = isHi ? pal.accent : pal.bg;
    const ink = isHi ? pal.onAccent : pal.text;
    drawDecor(env, pal, localT, index, bg, ink);

    if (isHi) {
      // 회전하는 별 모양
      const s = st(0, 'none');
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(localT * 0.25);
      ctx.scale(clamp(s.p) * 1.0, clamp(s.p) * 1.0);
      ctx.fillStyle = rgba(ink, 0.08);
      ctx.beginPath();
      const spikes = 14;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 ? 360 : 520;
        const a = (i / (spikes * 2)) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (scene.kind === 'intro') {
      withEnter(ctx, st(0, 'none'), 0, 0, () =>
        drawBrandMark(env, { x: format.marginX, y: format.marginY - 24, w: 420, h: 88 }, 'left', ink, { family: SANS, weight: 800, size: 32 }),
      );
    }

    if (L.sticker) drawSticker(env, scene, L.sticker, localT, delay, dur);

    if (L.card) {
      const c = L.card;
      const s = st(0.2, 'up', 0.8);
      withEnter(ctx, s, c.x + c.w / 2, c.y + c.h / 2, () => {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 16;
        ctx.fillStyle = '#FFFFFF';
        roundRectPath(ctx, c.x, c.y, c.w, c.h, 44);
        ctx.fill();
        ctx.restore();
      });
    }

    const x = L.textX;
    let y = L.top;

    if (L.badge) {
      const s = st(0.8, 'none');
      const r = 38;
      const k = s.p;
      if (s.opacity > 0) {
        ctx.save();
        ctx.globalAlpha *= s.opacity;
        ctx.translate(x + r, y + r);
        ctx.scale(k, k);
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `400 40px "${DISPLAY}"`;
        (ctx as CanvasRenderingContext2D).letterSpacing = '0px';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = pal.onAccent;
        ctx.fillText(L.badge, 0, 2);
        ctx.restore();
      }
      y += 76 + 36;
    }

    const titleColor = scene.kind === 'feature' ? CARD_TEXT : ink;
    const bodyColor = scene.kind === 'feature' ? '#4A4D57' : rgba(ink, 0.88);
    const titleOrder = scene.kind === 'feature' ? 1.2 : 0.8;
    drawLines(ctx, L.title, x, y, L.align, titleColor, { state: (i) => st(titleOrder + i * 0.5, 'up', 0.7) });
    y += L.title.height + (scene.kind === 'feature' ? 30 : isHi ? 48 : scene.kind === 'cta' ? 32 : 40);

    if (L.body.lines.length) {
      const order = titleOrder + L.title.lines.length * 0.5 + 0.2;
      if (isHi) {
        // 보조 문구는 알약 모양 띠 위에
        const s = st(order, 'up', 0.6);
        const pw = L.body.width + 72, ph = L.body.height + 28;
        withEnter(ctx, s, x, y + ph / 2, () => {
          ctx.fillStyle = ink;
          roundRectPath(ctx, x - pw / 2, y, pw, ph, ph / 2);
          ctx.fill();
          drawLines(ctx, L.body, x, y + 14, 'center', bg);
        });
      } else {
        drawLines(ctx, L.body, x, y, L.align, bodyColor, { state: (i) => st(order + i * 0.3, 'up', 0.5) });
      }
    }

    if (L.button && L.buttonBox && L.button.lines.length) {
      const b = L.buttonBox;
      const s = st(3, 'up');
      const settled = clamp((localT - (delay + 3 * env.mp.stagger + env.mp.enterDur)) / 0.3);
      const bounce = settled * env.mp.pop * 10 * Math.abs(Math.sin((localT * Math.PI) / 0.8));
      withEnter(ctx, s, b.x + b.w / 2, b.y + b.h / 2, () => {
        ctx.save();
        ctx.translate(0, -bounce);
        ctx.shadowColor = 'rgba(0,0,0,0.22)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 10 + bounce * 0.5;
        ctx.fillStyle = '#FFFFFF';
        roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        drawLines(ctx, L.button!, b.x + b.w / 2, b.y + 32, 'center', pal.primaryOnBg);
        ctx.restore();
      });
    }

    if (scene.kind === 'cta') {
      const s = st(3.5, 'up', 0.4);
      withEnter(ctx, s, W / 2, H - format.marginY, () =>
        drawBrandMark(env, { x: W / 2 - 240, y: H - format.marginY - 84, w: 480, h: 96 }, 'center', ink, { family: SANS, weight: 800, size: 34 }),
      );
    }
  },

  drawTransition(env, p, drawOut, drawIn) {
    const ring = env.palette.accent;
    circleReveal(env, p, drawOut, drawIn, ring, env.format.width / 2, env.format.height / 2);
  },
};
