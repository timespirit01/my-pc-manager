// 프로젝트 생성·불러오기(검증/이전 버전 변환)·편집 도우미
import { isHex } from './color';
import { newId } from './compose';
import { DEFAULT_CROP } from './imageFit';
import { motionProfile } from './motion';
import { getTemplate } from './templates';
import { recommendedDuration } from './timing';
import { PROJECT_VERSION, type MaterialInput, type Project, type Scene } from './types';

export const DURATION_MIN = 15;
export const DURATION_MAX = 30;

export function createProject(input: MaterialInput, scenes: Scene[], templateId: string, name?: string): Project {
  const t = getTemplate(templateId);
  const now = new Date().toISOString();
  return {
    version: PROJECT_VERSION,
    id: newId('prj'),
    name: name || input.title || '새 영상',
    createdAt: now,
    updatedAt: now,
    purpose: input.purpose,
    templateId: t.id,
    format: 'landscape',
    fps: 30,
    duration: clampDuration(recommendedDuration(scenes, motionProfile(t.defaultMotion), (s) => t.elementCount(s))),
    brandName: input.brandName,
    colors: { ...input.colors },
    motion: { ...t.defaultMotion },
    logoId: input.logoId,
    assets: { ...input.assets },
    scenes,
  };
}

/** 저장된 JSON을 안전하게 프로젝트로 복원(누락 값 보충, 범위 보정) */
export function normalizeProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new Error('프로젝트 파일 형식이 올바르지 않습니다');
  const p = raw as Partial<Project>;
  if (!Array.isArray(p.scenes)) throw new Error('장면 정보가 없습니다');
  const t = getTemplate(p.templateId ?? '');
  const scenes: Scene[] = p.scenes.map((s) => ({
    id: s.id || newId('scene'),
    kind: (['intro', 'feature', 'highlight', 'cta'] as const).includes(s.kind) ? s.kind : 'feature',
    title: String(s.title ?? ''),
    body: String(s.body ?? ''),
    button: s.button !== undefined ? String(s.button) : undefined,
    imageId: s.imageId,
    crop: { ...DEFAULT_CROP, ...(s.crop ?? {}) },
    length: (['short', 'normal', 'long'] as const).includes(s.length) ? s.length : 'normal',
  }));
  return {
    version: PROJECT_VERSION,
    id: p.id || newId('prj'),
    name: p.name || '제목 없는 영상',
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
    purpose: p.purpose ?? 'product',
    templateId: t.id,
    format: 'landscape',
    fps: p.fps && p.fps > 0 && p.fps <= 60 ? p.fps : 30,
    duration: clampDuration(p.duration ?? 20),
    brandName: p.brandName ?? '',
    colors: {
      primary: isHex(p.colors?.primary ?? '') ? p.colors!.primary : t.defaultColors.primary,
      accent: isHex(p.colors?.accent ?? '') ? p.colors!.accent : t.defaultColors.accent,
    },
    motion: { ...t.defaultMotion, ...(p.motion ?? {}) },
    logoId: p.logoId,
    assets: p.assets ?? {},
    scenes,
  };
}

export const clampDuration = (d: number) => Math.round(Math.min(DURATION_MAX, Math.max(DURATION_MIN, d)));

/** 템플릿을 바꿀 때: 사용자 데이터는 유지하고 디자인만 교체 */
export function switchTemplate(p: Project, templateId: string, adoptDefaults: { colors: boolean; motion: boolean }): Project {
  const t = getTemplate(templateId);
  return {
    ...p,
    templateId: t.id,
    colors: adoptDefaults.colors ? { ...t.defaultColors } : p.colors,
    motion: adoptDefaults.motion ? { ...t.defaultMotion } : p.motion,
  };
}

/** 사용하지 않는 에셋 참조 정리 (저장 전) */
export function usedAssetIds(p: Project): Set<string> {
  const ids = new Set<string>();
  if (p.logoId) ids.add(p.logoId);
  p.scenes.forEach((s) => s.imageId && ids.add(s.imageId));
  return ids;
}
