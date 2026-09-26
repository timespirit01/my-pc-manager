// 이미지를 찌그러뜨리지 않고 틀에 채우기(cover). 잘리는 위치는 초점(focus)과 확대(zoom)로 조절.
import type { ImageCrop } from './types';

export interface Rect { x: number; y: number; w: number; h: number }

export interface SourceRect { sx: number; sy: number; sw: number; sh: number }

/**
 * 원본에서 잘라낼 영역을 계산한다. 가로/세로 비율은 항상 틀과 동일 → 왜곡 없음.
 * extraZoom: 켄 번즈 효과처럼 시간에 따라 추가되는 확대.
 */
export function coverSource(imgW: number, imgH: number, box: { w: number; h: number }, crop: ImageCrop, extraZoom = 0): SourceRect {
  const zoom = Math.max(1, crop.zoom) * (1 + extraZoom);
  const scale = Math.max(box.w / imgW, box.h / imgH) * zoom;
  const sw = box.w / scale;
  const sh = box.h / scale;
  const fx = Math.min(1, Math.max(0, crop.focusX));
  const fy = Math.min(1, Math.max(0, crop.focusY));
  // 초점이 화면에서 같은 상대 위치에 오도록 원본 영역을 이동
  const sx = Math.min(Math.max(fx * imgW - fx * sw, 0), imgW - sw);
  const sy = Math.min(Math.max(fy * imgH - fy * sh, 0), imgH - sh);
  return { sx, sy, sw, sh };
}

/** 로고처럼 전체가 보여야 하는 이미지(contain) */
export function containRect(imgW: number, imgH: number, box: Rect, align: 'left' | 'center' | 'right' = 'center'): Rect {
  const scale = Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * scale, h = imgH * scale;
  const x = align === 'left' ? box.x : align === 'right' ? box.x + box.w - w : box.x + (box.w - w) / 2;
  return { x, y: box.y + (box.h - h) / 2, w, h };
}

export const DEFAULT_CROP: ImageCrop = { focusX: 0.5, focusY: 0.5, zoom: 1 };
