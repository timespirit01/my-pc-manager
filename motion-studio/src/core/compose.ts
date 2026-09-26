// 입력 자료 → 장면 자동 구성 (규칙 기반).
// AI 없이 동작하며, assistant.ts의 ContentAssistant 인터페이스 뒤에 숨겨져 있어
// 이후 AI 기반 구성으로 교체/병행할 수 있다.
import { DEFAULT_CROP } from './imageFit';
import type { MaterialInput, Purpose, Scene, SceneKind } from './types';

export const newId = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export const PURPOSE_LABEL: Record<Purpose, string> = {
  product: '제품 소개',
  event: '행사 안내',
  service: '서비스 홍보',
};

export const DEFAULT_CTA: Record<Purpose, { title: string; button: string }> = {
  product: { title: '지금 바로 만나보세요', button: '구매하기' },
  event: { title: '많은 참여 바랍니다', button: '사전 신청' },
  service: { title: '지금 상담 받아보세요', button: '문의하기' },
};

/** 문장 단위로 나누기 (한국어 종결 + 일반 문장부호) */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[^.!?。！？\n]+[.!?。！？]*/g;
  for (const m of text.matchAll(re)) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out;
}

const MAX_BODY_CHARS = 70;
const MAX_FEATURES = 3;

export function makeScene(kind: SceneKind, fields: Partial<Scene> = {}): Scene {
  return {
    id: newId('scene'),
    kind,
    title: '',
    body: '',
    crop: { ...DEFAULT_CROP },
    length: 'normal',
    ...fields,
  };
}

/** 설명 문단 하나를 소제목 + 설명으로 */
function pointToFields(point: string): { title: string; body: string } {
  const colon = point.match(/^(.{2,30}?)\s*[:：\-–—]\s+(.+)$/s);
  if (colon) return { title: colon[1].trim(), body: colon[2].trim() };
  const sentences = splitSentences(point);
  if (sentences.length >= 2) return { title: sentences[0], body: sentences.slice(1).join(' ') };
  const one = sentences[0] ?? point.trim();
  if (one.length <= 34) return { title: one, body: '' };
  const comma = one.indexOf(', ') > 0 ? one.indexOf(', ') : one.indexOf(',');
  if (comma > 4 && comma < one.length - 4) return { title: one.slice(0, comma).trim(), body: one.slice(comma + 1).trim() };
  return { title: one, body: '' };
}

/** 글을 둘로 나누기: 문장 → 쉼표 등 구절 → 가운데 띄어쓰기 순으로 시도 */
export function splitText(text: string): [string, string] | null {
  const t = text.trim();
  const sentences = splitSentences(t);
  if (sentences.length >= 2) {
    const half = Math.ceil(sentences.length / 2);
    return [sentences.slice(0, half).join(' '), sentences.slice(half).join(' ')];
  }
  const phrases = t.split(/(?<=[,，·])\s+/).filter(Boolean);
  if (phrases.length >= 2) {
    const half = Math.ceil(phrases.length / 2);
    return [phrases.slice(0, half).join(' '), phrases.slice(half).join(' ')];
  }
  const words = t.split(/\s+/);
  if (words.length >= 4) {
    // 글자 수가 반반에 가까운 띄어쓰기 위치
    let best = 1, bestDiff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const diff = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  return null;
}

/** 너무 긴 장면을 두 장면으로 나눈다(글자를 줄이지 않고 장면을 늘린다). 나눌 수 없으면 null */
export function splitScene(scene: Scene): [Scene, Scene] | null {
  const nextKind = scene.kind === 'intro' || scene.kind === 'cta' ? 'feature' : scene.kind;
  const nextCrop = { ...scene.crop, zoom: Math.min(2.5, scene.crop.zoom + 0.25) };
  // 1) 설명이 길면 설명을 나눈다: 뒷부분의 첫 문장이 새 장면의 제목이 된다
  const body = splitText(scene.body);
  if (body && scene.body.length >= 24) {
    const rest = splitSentences(body[1]);
    const second = rest.length >= 2 ? { title: rest[0], body: rest.slice(1).join(' ') } : { title: body[1], body: '' };
    return [
      { ...scene, body: body[0] },
      makeScene(nextKind, { ...second, imageId: scene.imageId, crop: nextCrop }),
    ];
  }
  // 2) 제목이 길면 제목을 나눈다
  const title = splitText(scene.title);
  if (title) {
    return [
      { ...scene, title: title[0] },
      makeScene(nextKind, { title: title[1], body: '', imageId: scene.imageId, crop: nextCrop }),
    ];
  }
  return null;
}

export function composeScenes(input: MaterialInput): Scene[] {
  const images = input.imageIds;
  const imageAt = (i: number) => (images.length ? images[i % images.length] : undefined);
  // 같은 사진을 다시 쓰면 확대·초점을 달리해 반복 느낌을 줄인다
  const cropAt = (i: number) =>
    images.length && i >= images.length
      ? { focusX: i % 2 ? 0.3 : 0.7, focusY: 0.45, zoom: 1.35 }
      : { ...DEFAULT_CROP };

  const scenes: Scene[] = [];
  scenes.push(makeScene('intro', { title: input.title.trim() || input.brandName, body: input.subtitle.trim(), imageId: imageAt(0), crop: cropAt(0) }));

  // 설명: 줄바꿈 단위로 핵심 내용 장면. 줄바꿈이 없으면 문장 2개씩 묶는다.
  let points = input.description.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (points.length === 1) {
    const sentences = splitSentences(points[0]);
    if (sentences.length > 2) {
      points = [];
      for (let i = 0; i < sentences.length; i += 2) points.push(sentences.slice(i, i + 2).join(' '));
    }
  }
  if (points.length > MAX_FEATURES) {
    points = [...points.slice(0, MAX_FEATURES - 1), points.slice(MAX_FEATURES - 1).join(' ')];
  }
  let imgIdx = 1;
  for (const p of points) {
    const f = pointToFields(p);
    let scene = makeScene('feature', { ...f, imageId: imageAt(imgIdx), crop: cropAt(imgIdx) });
    imgIdx++;
    // 설명이 길면 장면을 나눈다(글자를 줄이지 않는다)
    if (scene.body.length > MAX_BODY_CHARS) {
      const parts = splitScene(scene);
      if (parts) {
        scenes.push(parts[0]);
        scene = { ...parts[1], imageId: imageAt(imgIdx), crop: cropAt(imgIdx) };
        imgIdx++;
      }
    }
    scenes.push(scene);
  }

  if (input.highlight.trim()) {
    const [h, ...rest] = input.highlight.split('\n');
    scenes.push(makeScene('highlight', { title: h.trim(), body: rest.join(' ').trim(), length: 'short' }));
  }

  const cta = DEFAULT_CTA[input.purpose];
  scenes.push(makeScene('cta', {
    title: input.ctaTitle.trim() || cta.title,
    body: input.ctaDetail.trim(),
    button: input.ctaButton.trim() || cta.button,
  }));
  return scenes;
}
