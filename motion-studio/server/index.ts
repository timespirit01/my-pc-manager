// 로컬 서버: 프로젝트 저장/불러오기, 이미지 업로드, MP4 인코딩(ffmpeg).
// 프레임 그리기는 브라우저가 미리보기와 같은 렌더러로 하고, 서버는 받은 프레임을 H.264로 묶기만 한다.
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EncodeJob, probeVideo, FFMPEG_PATH } from './encoder.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(process.env.DATA_DIR ?? join(ROOT, 'data'));
const DIRS = { projects: join(DATA, 'projects'), assets: join(DATA, 'assets'), exports: join(DATA, 'exports') };
Object.values(DIRS).forEach((d) => mkdirSync(d, { recursive: true }));

const PORT = Number(process.env.PORT ?? 5174);
const app = express();
app.use(express.json({ limit: '10mb' }));

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

const fail = (res: Response, status: number, message: string) => res.status(status).json({ error: message });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ffmpeg: existsSync(FFMPEG_PATH) });
});

// ---------- 프로젝트 ----------
app.get('/api/projects', (_req, res) => {
  const list = readdirSync(DIRS.projects)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const p = JSON.parse(readFileSync(join(DIRS.projects, f), 'utf8'));
        const firstImage = p.scenes?.find((s: { imageId?: string }) => s.imageId)?.imageId;
        return {
          id: p.id, name: p.name, updatedAt: p.updatedAt, templateId: p.templateId,
          duration: p.duration, sceneCount: p.scenes?.length ?? 0,
          thumbnail: firstImage ? p.assets?.[firstImage]?.url : undefined,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b!.updatedAt).localeCompare(String(a!.updatedAt)));
  res.json(list);
});

app.get('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  if (!SAFE_ID.test(id)) return fail(res, 400, '잘못된 프로젝트 ID');
  const file = join(DIRS.projects, `${id}.json`);
  if (!existsSync(file)) return fail(res, 404, '프로젝트를 찾을 수 없습니다');
  res.type('json').send(readFileSync(file, 'utf8'));
});

app.put('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  if (!SAFE_ID.test(id)) return fail(res, 400, '잘못된 프로젝트 ID');
  const body = req.body;
  if (!body || body.id !== id || !Array.isArray(body.scenes)) return fail(res, 400, '프로젝트 형식이 올바르지 않습니다');
  body.updatedAt = new Date().toISOString();
  writeFileSync(join(DIRS.projects, `${id}.json`), JSON.stringify(body, null, 2));
  res.json({ ok: true, updatedAt: body.updatedAt });
});

app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  if (!SAFE_ID.test(id)) return fail(res, 400, '잘못된 프로젝트 ID');
  rmSync(join(DIRS.projects, `${id}.json`), { force: true });
  res.json({ ok: true });
});

// ---------- 이미지 업로드 ----------
app.post('/api/assets', express.raw({ type: 'image/*', limit: '30mb' }), (req: Request, res: Response) => {
  const ext = IMAGE_TYPES[String(req.headers['content-type']).split(';')[0]];
  if (!ext) return fail(res, 415, 'PNG, JPG, WEBP, GIF 이미지만 올릴 수 있습니다');
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return fail(res, 400, '빈 파일입니다');
  const id = `a_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const file = `${id}.${ext}`;
  writeFileSync(join(DIRS.assets, file), req.body);
  res.json({ id, url: `/uploads/${file}` });
});

// ---------- MP4 렌더링 ----------
const jobs = new Map<string, EncodeJob>();

app.post('/api/renders', (req, res) => {
  const { width, height, fps, frameCount, name } = req.body ?? {};
  if (![width, height, fps, frameCount].every((v) => Number.isFinite(v) && v > 0)) return fail(res, 400, '렌더 설정이 올바르지 않습니다');
  if (width % 2 || height % 2) return fail(res, 400, '해상도는 짝수여야 합니다');
  if (frameCount > 60 * 120) return fail(res, 400, '영상이 너무 깁니다');
  if (!existsSync(FFMPEG_PATH)) return fail(res, 500, 'ffmpeg를 찾을 수 없습니다. npm install을 다시 실행해 주세요');
  const id = randomUUID();
  const safeName = String(name ?? 'video').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'video';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const fileName = `${safeName}-${stamp}.mp4`;
  const job = new EncodeJob({ width, height, fps, frameCount, output: join(DIRS.exports, fileName) });
  job.fileName = fileName;
  jobs.set(id, job);
  job.onDone = () => setTimeout(() => jobs.delete(id), 60_000);
  res.json({ id });
});

app.post('/api/renders/:id/frames', express.raw({ type: 'application/octet-stream', limit: '200mb' }), async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return fail(res, 404, '렌더 작업이 없습니다(시간 초과로 취소되었을 수 있습니다)');
  const start = Number(req.query.start);
  try {
    // 본문: [4바이트 길이][JPEG] 반복
    const buf = req.body as Buffer;
    const frames: Buffer[] = [];
    let off = 0;
    while (off + 4 <= buf.length) {
      const len = buf.readUInt32BE(off);
      off += 4;
      if (off + len > buf.length) throw new Error('프레임 데이터가 잘렸습니다');
      frames.push(buf.subarray(off, off + len));
      off += len;
    }
    await job.writeFrames(start, frames);
    res.json({ ok: true, received: job.received });
  } catch (e) {
    fail(res, 500, (e as Error).message);
  }
});

app.post('/api/renders/:id/finish', async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return fail(res, 404, '렌더 작업이 없습니다');
  try {
    await job.finish();
    const info = await probeVideo(job.output);
    res.json({ url: `/exports/${encodeURIComponent(job.fileName)}`, fileName: job.fileName, size: statSync(job.output).size, ...info });
  } catch (e) {
    fail(res, 500, (e as Error).message);
  }
});

app.delete('/api/renders/:id', (req, res) => {
  jobs.get(req.params.id)?.cancel('사용자가 취소했습니다');
  jobs.delete(req.params.id);
  res.json({ ok: true });
});

// ---------- 정적 파일 ----------
app.use('/uploads', express.static(DIRS.assets, { maxAge: '7d', immutable: true }));
app.use('/exports', express.static(DIRS.exports, {
  setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment'),
}));
if (process.env.NODE_ENV === 'production') {
  const dist = join(ROOT, 'dist');
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[motion-studio] 서버 실행: http://localhost:${PORT}  (데이터: ${DATA})`);
});
