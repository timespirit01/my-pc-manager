// 템플릿 등록부. 새 템플릿은 Template 인터페이스를 구현한 모듈을 만들고 여기에 한 줄 추가하면 된다.
import { boldTemplate } from './bold';
import type { Template } from './types';

export const TEMPLATES: Template[] = [boldTemplate];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
