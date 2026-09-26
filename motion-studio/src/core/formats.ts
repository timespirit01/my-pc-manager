import type { FormatId } from './types';

export interface VideoFormat {
  id: FormatId;
  label: string;
  width: number;
  height: number;
  /** 안전 여백(px). 모든 템플릿이 이 값을 기준으로 정렬한다 */
  marginX: number;
  marginY: number;
  /** 가로형/세로형/정사각형 — 템플릿이 레이아웃 분기에 사용 */
  orientation: 'landscape' | 'portrait' | 'square';
}

// 첫 버전은 1920x1080 가로형만 제공한다.
// 세로형(1080x1920)·정사각형(1080x1080)은 여기에 항목을 추가하고
// 각 템플릿의 layout 함수에서 orientation 분기를 채우면 된다.
export const FORMATS: Record<FormatId, VideoFormat> = {
  landscape: {
    id: 'landscape',
    label: '가로형 16:9 (1920×1080)',
    width: 1920,
    height: 1080,
    marginX: 128,
    marginY: 104,
    orientation: 'landscape',
  },
};

export function getFormat(id: FormatId): VideoFormat {
  return FORMATS[id] ?? FORMATS.landscape;
}
