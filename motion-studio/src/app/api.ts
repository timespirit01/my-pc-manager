import type { Asset, Project } from '../core/types';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  templateId: string;
  duration: number;
  sceneCount: number;
  thumbnail?: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `서버 오류 (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { /* 본문 없음 */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const netError = (e: unknown) =>
  e instanceof TypeError ? new Error('서버에 연결할 수 없습니다. 터미널에서 서버가 실행 중인지 확인해 주세요 (npm run dev).') : (e as Error);

export async function listProjects(): Promise<ProjectSummary[]> {
  try { return await json(await fetch('/api/projects')); } catch (e) { throw netError(e); }
}

export async function loadProject(id: string): Promise<unknown> {
  try { return await json(await fetch(`/api/projects/${id}`)); } catch (e) { throw netError(e); }
}

export async function saveProject(p: Project): Promise<{ updatedAt: string }> {
  try {
    return await json(await fetch(`/api/projects/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    }));
  } catch (e) { throw netError(e); }
}

export async function deleteProject(id: string): Promise<void> {
  try { await json(await fetch(`/api/projects/${id}`, { method: 'DELETE' })); } catch (e) { throw netError(e); }
}

export async function uploadImage(file: File): Promise<Pick<Asset, 'id' | 'url' | 'name'>> {
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) throw new Error('PNG, JPG, WEBP, GIF 이미지만 올릴 수 있어요');
  if (file.size > 30 * 1024 * 1024) throw new Error('30MB 이하 이미지만 올릴 수 있어요');
  try {
    const r = await json<{ id: string; url: string }>(await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    }));
    return { ...r, name: file.name };
  } catch (e) { throw netError(e); }
}
