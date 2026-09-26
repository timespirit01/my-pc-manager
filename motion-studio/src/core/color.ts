// 브랜드 색에서 템플릿 팔레트를 만들고, 어떤 색을 골라도 글자 대비가 유지되도록 보정한다.

export interface RGB { r: number; g: number; b: number }

export function parseHex(hex: string): RGB {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

export const toHex = ({ r, g, b }: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

export const isHex = (s: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim());

export function mix(a: string, b: string, t: number): string {
  const A = parseHex(a), B = parseHex(b);
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 배경 위에서 읽히는 글자색(흰색 또는 짙은 색) */
export function onColor(bg: string, dark = '#111216', light = '#FFFFFF'): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/** fg를 bg 위에서 최소 대비(ratio) 이상이 되도록 밝게/어둡게 조정 */
export function ensureContrast(fg: string, bg: string, ratio = 3): string {
  if (contrast(fg, bg) >= ratio) return fg;
  const target = luminance(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0.08; t <= 1; t += 0.08) {
    const c = mix(fg, target, t);
    if (contrast(c, bg) >= ratio) return c;
  }
  return target;
}
