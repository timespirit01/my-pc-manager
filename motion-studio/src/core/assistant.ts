// 문구 작성·장면 구성 도우미의 확장 지점.
// 현재는 규칙 기반(오프라인, 무료)만 있다. 생성형 AI를 붙일 때는 같은 인터페이스를 구현한
// 모듈(예: 서버의 /api/ai/* 를 호출)을 만들고 ASSISTANTS에 추가하면 UI 변경 없이 교체된다.
import { composeScenes } from './compose';
import type { MaterialInput, Scene } from './types';

export interface ContentAssistant {
  id: string;
  label: string;
  /** 입력 자료로 장면 목록 초안 만들기 */
  composeScenes(input: MaterialInput): Promise<Scene[]>;
  /** (선택) 문구 대안 제안 — 규칙 기반에서는 제공하지 않음 */
  suggestCopy?(field: 'title' | 'body' | 'highlight' | 'cta', context: MaterialInput): Promise<string[]>;
}

export const ruleBasedAssistant: ContentAssistant = {
  id: 'rules',
  label: '기본 자동 구성',
  async composeScenes(input) {
    return composeScenes(input);
  },
};

export const ASSISTANTS: ContentAssistant[] = [ruleBasedAssistant];

export const defaultAssistant = () => ASSISTANTS[0];
