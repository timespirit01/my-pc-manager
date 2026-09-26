// 프로젝트의 한 순간(또는 반복 재생)을 그리는 캔버스. 미리보기·스타일 예시·장면 썸네일에 공통 사용.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { getFormat } from '../../core/formats';
import type { Project } from '../../core/types';
import { useImageVersion, useStudio } from '../studio';

export interface LiveCanvasHandle {
  canvas: HTMLCanvasElement | null;
  draw(t: number): void;
}

interface Props {
  project: Project;
  /** 고정 시간(초). loop가 true면 무시 */
  time?: number;
  /** 처음부터 끝까지 반복 재생 */
  loop?: boolean;
  className?: string;
  /** 캔버스 해상도 배율 상한 (썸네일은 낮게) */
  maxPixelWidth?: number;
}

export const LiveCanvas = forwardRef<LiveCanvasHandle, Props>(function LiveCanvas({ project, time = 0, loop, className, maxPixelWidth = 1920 }, ref) {
  const { renderer, images } = useStudio();
  const imgV = useImageVersion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fmt = getFormat(project.format);
  const projectRef = useRef(project);
  projectRef.current = project;

  const sizeCanvas = () => {
    const c = canvasRef.current;
    if (!c) return 1;
    const cssW = c.clientWidth || 320;
    const pxW = Math.min(maxPixelWidth, Math.round(cssW * (window.devicePixelRatio || 1)));
    const pxH = Math.round((pxW * fmt.height) / fmt.width);
    if (c.width !== pxW || c.height !== pxH) {
      c.width = pxW;
      c.height = pxH;
    }
    return pxW / fmt.width;
  };

  const draw = (t: number) => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const scale = sizeCanvas();
    renderer.renderFrame(ctx, projectRef.current, t, images.get, scale);
  };

  useImperativeHandle(ref, () => ({ canvas: canvasRef.current, draw }));

  useEffect(() => {
    images.ensure(project);
  }, [project, images]);

  useEffect(() => {
    if (loop) return;
    draw(time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, time, loop, imgV]);

  useEffect(() => {
    if (!loop) return;
    let raf = 0;
    const t0 = performance.now();
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    if (canvasRef.current) io.observe(canvasRef.current);
    const tick = (now: number) => {
      if (visible) draw(((now - t0) / 1000) % projectRef.current.duration);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => { if (!loop) draw(time); });
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop, time]);

  return <canvas ref={canvasRef} className={className} style={{ aspectRatio: `${fmt.width} / ${fmt.height}` }} />;
});
