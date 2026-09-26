// 한글 줄바꿈과 글자 크기 결정.
// 원칙: 글이 길면 (1) 줄바꿈 → (2) 한 단계만 작게(가독 최소 크기 이상) → (3) 템플릿이 배치 변경
//       → (4) 그래도 넘치면 overflow 표시(편집 화면에서 장면 나누기를 안내). 무한정 줄이지 않는다.

export type Measure = (text: string, font: string, letterSpacingPx: number) => number;

export interface FitSpec {
  family: string;
  weight: number;
  /** 시도할 글자 크기(px, 큰 것부터). 마지막 값이 읽을 수 있는 최소 크기 */
  sizes: number[];
  lineHeight: number; // 배수
  letterSpacing: number; // em
  maxWidth: number;
  maxLines: number;
  /** 제목처럼 줄 길이를 고르게 맞출지 */
  balance?: boolean;
}

export interface TextBlock {
  lines: string[];
  font: string;
  size: number;
  letterSpacingPx: number;
  lineHeightPx: number;
  width: number;
  height: number;
  overflow: boolean;
}

export const fontString = (weight: number, size: number, family: string) =>
  `${weight} ${Math.round(size * 100) / 100}px "${family}"`;

// 줄 첫머리에 오면 어색한 문자(금칙 문자)
const NO_LINE_START = new Set([...',.!?)]}」』》〉%…·:;~、。，！？）']);

function breakLongWord(word: string, maxWidth: number, m: (s: string) => number): string[] {
  const chars = [...word];
  const out: string[] = [];
  let cur = '';
  for (const ch of chars) {
    const next = cur + ch;
    if (cur && m(next) > maxWidth) {
      if (NO_LINE_START.has(ch) && cur.length > 1) {
        // 금칙 문자는 앞 글자와 함께 다음 줄로
        const prev = [...cur];
        const moved = prev.pop()!;
        out.push(prev.join(''));
        cur = moved + ch;
      } else {
        out.push(cur);
        cur = ch;
      }
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/** 띄어쓰기 단위(keep-all)로 줄바꿈. 한 단어가 너무 길면 글자 단위로 나눈다 */
export function wrapText(text: string, maxWidth: number, m: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      if (para.length > 0 || text.includes('\n')) lines.push('');
      continue;
    }
    let cur = '';
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (m(candidate) <= maxWidth) {
        cur = candidate;
        continue;
      }
      if (cur) lines.push(cur);
      if (m(w) <= maxWidth) cur = w;
      else {
        const parts = breakLongWord(w, maxWidth, m);
        lines.push(...parts.slice(0, -1));
        cur = parts[parts.length - 1];
      }
    }
    if (cur) lines.push(cur);
  }
  // 앞뒤 빈 줄 제거
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * 구절 우선 줄바꿈: 쉼표·가운뎃점 등 의미 경계에서 먼저 끊는다.
 * "매일 아침, 갓 볶은 커피" → "매일 아침," / "갓 볶은 커피" (단순 폭 기준이면 "갓"이 윗줄에 남는다)
 */
function phraseWrap(text: string, maxWidth: number, m: (s: string) => number): string[] | null {
  if (text.includes('\n')) return null;
  const phrases = text.split(/(?<=[,，·:;])\s+/).filter(Boolean);
  if (phrases.length < 2) return null;
  const lines: string[] = [];
  for (const ph of phrases) lines.push(...balancedWrapPlain(ph, maxWidth, m));
  return lines;
}

function balancedWrap(text: string, maxWidth: number, m: (s: string) => number, maxLines: number): string[] {
  const plain = balancedWrapPlain(text, maxWidth, m);
  const phrase = phraseWrap(text, maxWidth, m);
  // 구절 단위 줄바꿈은 최대 줄 수 안에서 한 줄까지 늘어나는 것을 허용한다(의미 단위가 더 읽기 쉽다)
  return phrase && phrase.length <= Math.min(maxLines, plain.length + 1) ? phrase : plain;
}

/** 같은 줄 수를 유지하는 가장 좁은 폭을 찾아 줄 길이를 고르게 만든다 (마지막 줄에 한 단어만 남는 현상 방지) */
function balancedWrapPlain(text: string, maxWidth: number, m: (s: string) => number): string[] {
  const base = wrapText(text, maxWidth, m);
  if (base.length < 2) return base;
  let lo = maxWidth * 0.5, hi = maxWidth;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (wrapText(text, mid, m).length <= base.length) hi = mid;
    else lo = mid;
  }
  return wrapText(text, hi, m);
}

export function fitText(text: string, spec: FitSpec, measure: Measure): TextBlock {
  const clean = text.replace(/\r/g, '').trim();
  let last: TextBlock | null = null;
  for (const size of spec.sizes) {
    const font = fontString(spec.weight, size, spec.family);
    const ls = spec.letterSpacing * size;
    const m = (s: string) => measure(s, font, ls);
    const lines = clean ? (spec.balance ? balancedWrap(clean, spec.maxWidth, m, spec.maxLines) : wrapText(clean, spec.maxWidth, m)) : [];
    const lineHeightPx = size * spec.lineHeight;
    const width = lines.reduce((a, l) => Math.max(a, m(l)), 0);
    const block: TextBlock = {
      lines,
      font,
      size,
      letterSpacingPx: ls,
      lineHeightPx,
      width,
      height: lines.length === 0 ? 0 : lineHeightPx * lines.length,
      overflow: lines.length > spec.maxLines,
    };
    if (!block.overflow) return block;
    last = block;
  }
  // 최소 크기에서도 넘침 → 최대 줄 수까지만 쓰고 말줄임. overflow=true 로 편집 화면에 경고.
  const b = last!;
  const m = (s: string) => measure(s, b.font, b.letterSpacingPx);
  const kept = b.lines.slice(0, spec.maxLines);
  let tail = kept[kept.length - 1] ?? '';
  while (tail.length > 1 && m(`${tail}…`) > spec.maxWidth) tail = [...tail].slice(0, -1).join('');
  kept[kept.length - 1] = `${tail.trimEnd()}…`;
  return {
    ...b,
    lines: kept,
    height: b.lineHeightPx * kept.length,
    width: kept.reduce((a, l) => Math.max(a, m(l)), 0),
    overflow: true,
  };
}

/** 캔버스 기반 측정기 (결과 캐시) */
export function createCanvasMeasure(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): Measure {
  const cache = new Map<string, number>();
  return (text, font, ls) => {
    const key = `${font}|${ls}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    ctx.font = font;
    (ctx as CanvasRenderingContext2D).letterSpacing = `${ls}px`;
    // letterSpacing은 마지막 글자 뒤에도 더해지므로 제거
    const w = ctx.measureText(text).width - (text.length > 0 ? ls : 0);
    if (cache.size > 20000) cache.clear();
    cache.set(key, w);
    return w;
  };
}
