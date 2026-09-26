// 프로젝트 데이터 모델.
// 템플릿(디자인 규칙)과 사용자 데이터(문구·이미지·색상·선택값)를 분리한다.
// 프로젝트 JSON에는 템플릿 "id"만 저장되고, 실제 레이아웃/모션 규칙은 코드의 템플릿 모듈이 가진다.

export const PROJECT_VERSION = 1;

export type Purpose = 'product' | 'event' | 'service';
export type Feel = 'calm' | 'smooth' | 'lively';
export type Speed = 'slow' | 'normal' | 'fast';
export type Emphasis = 'low' | 'normal' | 'high';
export type SceneKind = 'intro' | 'feature' | 'highlight' | 'cta';
export type SceneLength = 'short' | 'normal' | 'long';
export type FormatId = 'landscape'; // 이후 'portrait' | 'square' 추가 예정

export interface MotionSettings {
  feel: Feel;
  speed: Speed;
  emphasis: Emphasis;
}

export interface BrandColors {
  primary: string; // 메인 브랜드 색
  accent: string; // 보조 강조 색
}

export interface Asset {
  id: string;
  url: string;
  name: string;
  width: number;
  height: number;
  /** 불투명 픽셀 중 아주 밝은/아주 어두운 픽셀의 비율(0~1). 로고가 배경에 묻히는지 판단 */
  tone?: { light: number; dark: number };
}

/** 이미지가 장면 틀 안에서 어떻게 잘릴지. 찌그러뜨리지 않고 cover + 초점 이동 + 확대로만 조절 */
export interface ImageCrop {
  focusX: number; // 0(왼쪽) ~ 1(오른쪽)
  focusY: number; // 0(위) ~ 1(아래)
  zoom: number; // 1 ~ 2.5
}

export interface Scene {
  id: string;
  kind: SceneKind;
  /** intro: 제목, feature: 소제목, highlight: 강조 문구, cta: 행동 유도 문구 */
  title: string;
  /** intro: 한 줄 소개, feature: 설명, highlight: 보조 문구, cta: 연락처·링크 */
  body: string;
  /** cta 전용: 버튼 문구 */
  button?: string;
  imageId?: string;
  crop: ImageCrop;
  length: SceneLength;
}

export interface Project {
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  purpose: Purpose;
  templateId: string;
  format: FormatId;
  fps: number;
  /** 전체 영상 길이(초) */
  duration: number;
  brandName: string;
  colors: BrandColors;
  motion: MotionSettings;
  logoId?: string;
  assets: Record<string, Asset>;
  scenes: Scene[];
}

/** 자료 입력 단계에서 받는 원자료. 자동 구성(compose)이 이것을 장면으로 바꾼다. */
export interface MaterialInput {
  purpose: Purpose;
  brandName: string;
  title: string;
  subtitle: string;
  description: string;
  highlight: string;
  ctaTitle: string;
  ctaDetail: string;
  ctaButton: string;
  imageIds: string[];
  logoId?: string;
  assets: Record<string, Asset>;
  colors: BrandColors;
}
