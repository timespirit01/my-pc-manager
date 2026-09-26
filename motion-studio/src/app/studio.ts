import { createContext, useContext, useEffect, useReducer } from 'react';
import { Renderer } from '../core/renderer';
import { ImageStore } from './resources';

export interface Studio {
  renderer: Renderer;
  images: ImageStore;
}

export const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const s = useContext(StudioContext);
  if (!s) throw new Error('StudioContext 없음');
  return s;
}

/** 이미지가 새로 로드될 때마다 다시 그리도록 버전 번호를 돌려준다 */
export function useImageVersion(): number {
  const { images } = useStudio();
  const [v, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => images.subscribe(bump) as () => void, [images]);
  return v;
}
