// 결정적(deterministic) 프레임 렌더러.
// 미리보기와 MP4 출력이 모두 이 함수 하나로 프레임을 그린다 → 레이아웃과 움직임이 일치한다.
// 입력: 프로젝트 + 시간(t, 초). 난수·현재 시각·재생 상태에 의존하지 않는다.
import { getFormat, type VideoFormat } from './formats';
import { motionProfile, type MotionProfile } from './motion';
import { createCanvasMeasure, type Measure } from './text';
import { computeTimeline, frameState, type Timeline } from './timing';
import { getTemplate } from './templates';
import type { Ctx, LayoutReport, LoadedImage, Palette, RenderEnv, SceneLayout, Template } from './templates/types';
import type { Project } from './types';

export type ImageLookup = (id: string | undefined) => LoadedImage | undefined;

interface Computed {
  template: Template;
  format: VideoFormat;
  palette: Palette;
  mp: MotionProfile;
  timeline: Timeline;
  layouts: SceneLayout[];
}

export class Renderer {
  private measure: Measure;
  private cache = new WeakMap<Project, Computed>();

  constructor(measureCtx?: Ctx) {
    const ctx = measureCtx ?? createMeasureContext();
    this.measure = createCanvasMeasure(ctx);
  }

  /** 폰트가 새로 로드되면 측정 캐시를 비워야 한다 */
  resetMeasure(measureCtx?: Ctx) {
    this.measure = createCanvasMeasure(measureCtx ?? createMeasureContext());
    this.cache = new WeakMap();
  }

  compute(project: Project): Computed {
    const hit = this.cache.get(project);
    if (hit) return hit;
    const template = getTemplate(project.templateId);
    const format = getFormat(project.format);
    const palette = template.palette(project.colors);
    const mp = motionProfile(project.motion);
    const timeline = computeTimeline(project.scenes, project.duration, mp, (s) => template.elementCount(s));
    const env = this.env(null, project, { template, format, palette, mp, timeline, layouts: [] }, 0, () => undefined);
    const layouts = project.scenes.map((s, i) => template.layout(env, s, i));
    const computed = { template, format, palette, mp, timeline, layouts };
    this.cache.set(project, computed);
    return computed;
  }

  private env(ctx: Ctx | null, project: Project, c: Computed, t: number, image: ImageLookup): RenderEnv {
    return {
      ctx: ctx as Ctx,
      project,
      format: c.format,
      palette: c.palette,
      mp: c.mp,
      measure: this.measure,
      timeline: c.timeline,
      globalT: t,
      image,
    };
  }

  timeline(project: Project): Timeline {
    return this.compute(project).timeline;
  }

  reports(project: Project): LayoutReport[] {
    return this.compute(project).layouts.map((l) => l.report);
  }

  /**
   * t초의 프레임을 그린다. scale: 출력 해상도 대비 캔버스 배율(미리보기 축소용).
   */
  renderFrame(ctx: Ctx, project: Project, t: number, image: ImageLookup, scale = 1) {
    const c = this.compute(project);
    const env = this.env(ctx, project, c, t, image);
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = c.palette.bg;
    ctx.fillRect(0, 0, c.format.width, c.format.height);
    if (project.scenes.length === 0) {
      ctx.restore();
      return;
    }
    const fs = frameState(c.timeline, t);
    const drawScene = (i: number, localT: number) => {
      ctx.save();
      c.template.drawScene(env, project.scenes[i], i, localT, c.layouts[i]);
      ctx.restore();
    };
    if (fs.incoming) {
      const out = fs.current, inn = fs.incoming;
      ctx.save();
      c.template.drawTransition(
        env,
        fs.transition,
        () => drawScene(out.timing.index, out.localT),
        () => drawScene(inn.timing.index, inn.localT),
      );
      ctx.restore();
    } else {
      drawScene(fs.current.timing.index, fs.current.localT);
    }
    ctx.restore();
  }
}

function createMeasureContext(): Ctx {
  // 문서에 등록된 웹폰트를 확실히 쓰도록 일반 canvas 요소로 측정한다
  const c = document.createElement('canvas').getContext('2d');
  if (!c) throw new Error('캔버스를 만들 수 없습니다');
  return c;
}
