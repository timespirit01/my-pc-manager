// MP4 내보내기: 미리보기와 같은 렌더러로 원본 해상도 프레임을 그려 서버의 ffmpeg로 보낸다.
import { getFormat } from '../core/formats';
import type { Renderer } from '../core/renderer';
import type { Project } from '../core/types';
import { loadFonts, type ImageStore } from './resources';

export type ExportStage = 'prepare' | 'render' | 'encode' | 'done';

export interface ExportProgress {
  stage: ExportStage;
  done: number;
  total: number;
}

export interface ExportResult {
  url: string;
  fileName: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  fps: number;
  frames: number;
  codec: string;
}

const BATCH = 10;
const JPEG_QUALITY = 0.93;

export class ExportCancelled extends Error {
  constructor() { super('내보내기를 취소했습니다'); }
}

export async function exportMp4(
  project: Project,
  renderer: Renderer,
  images: ImageStore,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const fmt = getFormat(project.format);
  const total = Math.round(project.duration * project.fps);
  onProgress({ stage: 'prepare', done: 0, total });

  // 1) 폰트·이미지가 모두 준비된 뒤에만 그린다
  await loadFonts();
  await document.fonts.ready;
  const failed = await images.ensure(project);
  if (failed.length) throw new Error(`이미지를 불러오지 못했습니다: ${failed.join(', ')}. 이미지를 다시 선택해 주세요.`);

  const canvas = document.createElement('canvas');
  canvas.width = fmt.width;
  canvas.height = fmt.height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다');

  let jobId: string | null = null;
  const post = async (url: string, body?: BodyInit, type = 'application/json') => {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body, signal });
    } catch (e) {
      if (signal.aborted) throw new ExportCancelled();
      throw new Error('서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.', { cause: e });
    }
    if (!res.ok) {
      let msg = `서버 오류 (${res.status})`;
      try { msg = (await res.json()).error ?? msg; } catch { /* 없음 */ }
      throw new Error(msg);
    }
    return res.json();
  };

  try {
    const job = await post('/api/renders', JSON.stringify({ width: fmt.width, height: fmt.height, fps: project.fps, frameCount: total, name: project.name }));
    jobId = job.id as string;

    // 2) 프레임 그리기 → JPEG → 묶음 전송 (전송 중에 다음 묶음을 그린다)
    let inflight: Promise<unknown> = Promise.resolve();
    let batch: Uint8Array[] = [];
    let batchStart = 0;
    const flush = async () => {
      if (!batch.length) return;
      const size = batch.reduce((a, b) => a + 4 + b.length, 0);
      const body = new Uint8Array(size);
      const view = new DataView(body.buffer);
      let off = 0;
      for (const f of batch) {
        view.setUint32(off, f.length);
        body.set(f, off + 4);
        off += 4 + f.length;
      }
      const start = batchStart;
      batch = [];
      await inflight;
      inflight = post(`/api/renders/${jobId}/frames?start=${start}`, body, 'application/octet-stream');
      // 다음 묶음을 그리는 동안 실패해도 '처리되지 않은 오류'가 되지 않게 표시(실제 오류는 다음 await에서 던져진다)
      inflight.catch(() => undefined);
    };

    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw new ExportCancelled();
      renderer.renderFrame(ctx, project, i / project.fps, images.get, 1);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('프레임 이미지를 만들지 못했습니다');
      if (!batch.length) batchStart = i;
      batch.push(new Uint8Array(await blob.arrayBuffer()));
      if (batch.length >= BATCH) await flush();
      if (i % 3 === 0 || i === total - 1) onProgress({ stage: 'render', done: i + 1, total });
    }
    await flush();
    await inflight;

    // 3) 인코딩 마무리 + 결과 검사
    onProgress({ stage: 'encode', done: total, total });
    const result = (await post(`/api/renders/${jobId}/finish`)) as ExportResult;
    if (result.width !== fmt.width || result.height !== fmt.height) throw new Error(`해상도가 예상과 다릅니다 (${result.width}×${result.height})`);
    onProgress({ stage: 'done', done: total, total });
    return result;
  } catch (e) {
    if (jobId) fetch(`/api/renders/${jobId}`, { method: 'DELETE' }).catch(() => undefined);
    if (signal.aborted) throw new ExportCancelled();
    throw e;
  }
}
