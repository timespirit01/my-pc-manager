import type { Scene, SceneKind } from '../types';
import type { FieldSpec, RenderEnv } from './types';

export function defaultFields(kind: SceneKind): FieldSpec {
  switch (kind) {
    case 'intro':
      return {
        title: { label: '제목', placeholder: '예) 매일 아침, 갓 볶은 커피' },
        body: { label: '한 줄 소개', placeholder: '예) 동네 로스터리의 핸드드립 원두 세트', multiline: false },
        button: null,
        image: true,
      };
    case 'feature':
      return {
        title: { label: '소제목', placeholder: '예) 주문 후 24시간 안에 로스팅' },
        body: { label: '설명', placeholder: '장점이나 특징을 한두 문장으로 적어 주세요', multiline: true },
        button: null,
        image: true,
      };
    case 'highlight':
      return {
        title: { label: '강조 문구', placeholder: '예) 첫 주문 30% 할인' },
        body: { label: '보조 문구 (선택)', placeholder: '예) 9월 30일까지', multiline: false },
        button: null,
        image: false,
      };
    case 'cta':
      return {
        title: { label: '행동 유도 문구', placeholder: '예) 지금 바로 만나보세요' },
        body: { label: '연락처·주소·링크', placeholder: '예) onggi.coffee · 02-123-4567', multiline: false },
        button: { label: '버튼 문구', placeholder: '예) 주문하기' },
        image: false,
      };
  }
}

/** 레이아웃은 로드된 이미지가 아니라 프로젝트에 기록된 크기로 계산한다 → 로딩 전후 배치가 같다 */
export function assetAspect(env: RenderEnv, id: string | undefined): number | undefined {
  if (!id) return undefined;
  const a = env.project.assets[id];
  if (!a || !a.width || !a.height) return undefined;
  return a.width / a.height;
}

/** 이 장면이 몇 번째 "핵심 내용" 장면인지 (01, 02 …) */
export function featureNumber(scenes: Scene[], index: number): number {
  let n = 0;
  for (let i = 0; i <= index; i++) if (scenes[i]?.kind === 'feature') n++;
  return n;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function sceneDur(env: RenderEnv, index: number): number {
  return env.timeline.scenes[index]?.dur ?? 4;
}
