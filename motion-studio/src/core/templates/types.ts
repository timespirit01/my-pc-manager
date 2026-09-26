import type { VideoFormat } from '../formats';
import type { MotionProfile } from '../motion';
import type { Measure } from '../text';
import type { Timeline } from '../timing';
import type { BrandColors, MotionSettings, Project, Scene, SceneKind } from '../types';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface Palette {
  bg: string;
  bgAlt: string;
  surface: string;
  text: string;
  subtext: string;
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  /** 배경 위에서 읽히도록 보정된 브랜드 색 (글자·선에 사용) */
  primaryOnBg: string;
}

export interface RenderEnv {
  ctx: Ctx;
  project: Project;
  format: VideoFormat;
  palette: Palette;
  mp: MotionProfile;
  measure: Measure;
  timeline: Timeline;
  /** 영상 전체 기준 현재 시간(초) — 배경 장식처럼 장면과 무관하게 흐르는 요소용 */
  globalT: number;
  image(id: string | undefined): LoadedImage | undefined;
}

/** 편집 화면에 보여줄 배치 점검 결과 */
export interface LayoutReport {
  overflow: string[]; // 넘친 필드 이름: 'title' | 'body' | 'button'
  variant: string; // 선택된 배치 이름
  /** 이미지 틀의 가로/세로 비율 — 편집 화면에서 잘리는 영역을 보여줄 때 사용 */
  imageAspect?: number;
}

export interface SceneLayout {
  report: LayoutReport;
  [key: string]: unknown;
}

export interface FieldSpec {
  title: { label: string; placeholder: string } | null;
  body: { label: string; placeholder: string; multiline: boolean } | null;
  button: { label: string; placeholder: string } | null;
  image: boolean;
}

export interface Template {
  id: string;
  name: string;
  tagline: string;
  /** 스타일 선택 화면 설명(짧게) */
  traits: string[];
  /** 렌더 전에 반드시 로드되어야 하는 폰트 패밀리 */
  fonts: string[];
  defaultColors: BrandColors;
  defaultMotion: MotionSettings;
  /** 장면 종류별 입력 필드와 이미지 지원 여부 */
  fields(kind: SceneKind): FieldSpec;
  palette(colors: BrandColors): Palette;
  /** 장면의 등장 요소 개수 — 타이밍 계산에 사용 */
  elementCount(scene: Scene): number;
  /** 결정적(deterministic) 배치 계산. 같은 입력 → 같은 결과 */
  layout(env: RenderEnv, scene: Scene, index: number): SceneLayout;
  drawScene(env: RenderEnv, scene: Scene, index: number, localT: number, layout: SceneLayout): void;
  /** p: 곡선 적용 전 전환 진행도(0~1). drawOut/drawIn은 각 장면을 그린다 */
  drawTransition(env: RenderEnv, p: number, drawOut: () => void, drawIn: () => void): void;
}
