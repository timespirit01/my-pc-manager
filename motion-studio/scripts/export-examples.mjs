// 샘플 자료로 템플릿별 예시 영상을 만든다: examples/<템플릿>-<목적>.mp4 (+ 대표 장면 이미지)
// 사용: (npm run dev 실행 중) npm run examples
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium.mjs';

const require = createRequire(import.meta.url);
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const out = join(root, 'examples');
mkdirSync(out, { recursive: true });

const jobs = [
  { template: 'bold', purpose: 'product' },
  { template: 'minimal', purpose: 'event' },
  { template: 'pop', purpose: 'service' },
];

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
for (const j of jobs) {
  await page.goto(BASE);
  await page.getByTestId('new-project').click();
  await page.getByTestId(`purpose-${j.purpose}`).click();
  await page.getByText('다음 →').click();
  await page.getByTestId('fill-sample').click();
  await page.getByTestId('to-style').click();
  await page.getByTestId(`style-${j.template}`).click();
  await page.getByTestId('create-video').click();
  await page.waitForSelector('[data-testid=scene-strip]');
  await page.getByTestId('export').click();
  await page.waitForSelector('[data-testid=export-done], [data-testid=export-error]', { timeout: 10 * 60 * 1000 });
  const href = await page.getByTestId('download-link').getAttribute('href');
  const name = `${j.template}-${j.purpose}`;
  const mp4 = join(out, `${name}.mp4`);
  writeFileSync(mp4, await (await page.request.get(BASE + href)).body());
  // 장면별 대표 프레임을 한 장으로 (README용)
  const tl = await page.evaluate(() => window.__studio.timeline);
  const times = tl.scenes.map((s, i) => Math.min(s.start + s.readyAt + 0.35, i < tl.scenes.length - 1 ? s.end - tl.transitionDur - 0.05 : s.end - 0.05));
  const picks = times.slice(0, 6).map((t) => Math.round(t * 30));
  const sel = picks.map((n) => `eq(n\\,${n})`).join('+');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-vf', `select='${sel}',scale=640:-1,tile=3x2:padding=8:color=white`, '-frames:v', '1', '-q:v', '3', join(out, `${name}-scenes.jpg`)]);
  console.log('저장:', mp4);
}
await browser.close();
