// 종단 간(E2E) 검증: 실제 앱을 브라우저로 조작해 완료 기준을 하나씩 확인한다.
// 사용: (다른 터미널에서 npm run dev 실행 중) npm run verify [-- --template=bold|minimal|pop|all]
// 결과: test-output/<템플릿>/ 에 MP4, 비교 이미지, report.json
import { chromium } from 'playwright-core';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium.mjs';

const require = createRequire(import.meta.url);
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path;
const FFPROBE = require('@ffprobe-installer/ffprobe').path;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const templates = arg('template', 'all') === 'all' ? ['bold', 'minimal', 'pop'] : [arg('template')];

const results = [];
const check = (tpl, name, ok, detail = '') => {
  results.push({ template: tpl, name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} [${tpl}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const png = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64');
/** 두 이미지의 PSNR(dB). 높을수록 같다 (40dB 이상이면 사실상 동일) */
function psnrOf(a, b) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', a, '-i', b, '-lavfi', '[0]format=yuv444p[x];[1]format=yuv444p[y];[x][y]psnr', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = r.stderr.match(/average:([\d.]+|inf)/);
  return m ? (m[1] === 'inf' ? 99 : Number(m[1])) : NaN;
}
/** 키 순서와 무관하게 두 값의 다른 경로 목록 (undefined 값은 저장되지 않으므로 없는 것으로 취급) */
function diffPaths(a, b, path = '') {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [path || '(root)'];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => a[k] !== undefined || b[k] !== undefined));
  return [...keys].flatMap((k) => diffPaths(a[k], b[k], `${path}.${k}`));
}
function extractFrame(mp4, n, out) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-vf', `select=eq(n\\,${n})`, '-vsync', '0', '-frames:v', '1', out]);
}
function sideBySide(a, b, out) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', a, '-i', b, '-filter_complex', '[0]scale=960:-1[l];[1]scale=960:-1[r];[l][r]hstack', out]);
}

async function run(tpl) {
  const out = join(root, 'test-output', tpl);
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: findChromium() });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    // 1) 샘플로 바로 체험 → 스타일 선택(움직이는 예시) → 영상 만들기
    await page.goto(BASE);
    await page.getByTestId('try-sample').click();
    await page.getByTestId(`style-${tpl}`).click();
    const styleCanvases = await page.locator('.style-preview canvas').count();
    check(tpl, '스타일 선택 화면에 움직이는 예시 3개 표시', styleCanvases === 3, `${styleCanvases}개`);
    await page.screenshot({ path: join(out, '01-style.png') });
    await page.getByTestId('create-video').click();
    await page.waitForSelector('[data-testid=scene-strip]');
    await page.waitForTimeout(800);
    const original = await page.evaluate(() => window.__studio.project);
    await page.screenshot({ path: join(out, '02-editor.png') });

    // 2) 문구 수정 (한글 + 수동 줄바꿈) + IME 조합 입력
    await page.locator('[data-testid=scene-card]').nth(0).click();
    const titleBox = page.getByTestId('scene-title');
    await titleBox.fill('우리 동네 로스터리의\n신선한 원두');
    await titleBox.press('End');
    let imeOk = true;
    try {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.imeSetComposition', { text: ' ㅋ', selectionStart: 2, selectionEnd: 2 });
      await cdp.send('Input.imeSetComposition', { text: ' 커', selectionStart: 2, selectionEnd: 2 });
      await cdp.send('Input.imeSetComposition', { text: ' 커피', selectionStart: 3, selectionEnd: 3 });
      await cdp.send('Input.insertText', { text: ' 커피' });
    } catch (e) {
      imeOk = false;
      console.log('   (IME 시뮬레이션을 지원하지 않는 브라우저: ' + e.message + ')');
    }
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => window.__studio.project.scenes[0].title);
    check(tpl, '한글 문구 입력(조합 입력 포함)이 프로젝트에 반영', t1.startsWith('우리 동네 로스터리의\n신선한 원두') && (!imeOk || t1.endsWith('커피')), JSON.stringify(t1));

    // 3) 실행 취소 / 다시 실행
    await page.waitForTimeout(1300); // 입력 묶음 구간(1.2초) 경과
    await page.getByTestId('tab-global').click();
    // 현재 값과 다른 선택지를 눌러야 실제 변경이 생긴다
    const target = original.motion.feel === 'lively' ? { v: 'calm', label: '차분하게' } : { v: 'lively', label: '경쾌하게' };
    await page.locator('[data-testid=motion-feel] button', { hasText: target.label }).click();
    const feelAfter = await page.evaluate(() => window.__studio.project.motion.feel);
    await page.getByTestId('undo').click();
    const feelUndo = await page.evaluate(() => window.__studio.project.motion.feel);
    await page.getByTestId('redo').click();
    const feelRedo = await page.evaluate(() => window.__studio.project.motion.feel);
    check(tpl, '실행 취소/다시 실행', feelAfter === target.v && feelUndo === original.motion.feel && feelRedo === target.v, `${feelAfter} → ${feelUndo} → ${feelRedo}`);
    await page.keyboard.press('Control+z');
    const feelKey = await page.evaluate(() => window.__studio.project.motion.feel);
    await page.keyboard.press('Control+Shift+z');
    check(tpl, '단축키 Ctrl+Z / Ctrl+Shift+Z', feelKey === original.motion.feel && (await page.evaluate(() => window.__studio.project.motion.feel)) === target.v);

    // 4) 브랜드 색 변경
    await page.getByTestId('color-primary').fill('#1F6FEB');
    await page.waitForTimeout(200);
    const color = await page.evaluate(() => window.__studio.project.colors.primary);
    check(tpl, '브랜드 색 변경', color === '#1F6FEB', color);

    // 5) 영상 길이 변경
    const dur = page.getByTestId('duration');
    await dur.fill('26');
    const d = await page.evaluate(() => window.__studio.project.duration);
    check(tpl, '전체 영상 길이 조정', d === 26, `${d}초`);

    // 6) 사진 업로드: 세로형(1:2)·가로형(3:1)
    await page.getByTestId('tab-scene').click();
    await page.locator('[data-testid=scene-card]').nth(1).click();
    await page.locator('[data-testid=scene-panel] [data-testid=file-input]').setInputFiles(join(root, 'tests/fixtures/tall-900x1800.jpg'));
    await page.waitForFunction(() => window.__studio.project.scenes[1].imageId?.startsWith('a_'), null, { timeout: 15000 });
    await page.locator('[data-testid=scene-card]').nth(2).click();
    await page.locator('[data-testid=scene-panel] [data-testid=file-input]').setInputFiles(join(root, 'tests/fixtures/panorama-3000x1000.jpg'));
    await page.waitForFunction(() => window.__studio.project.scenes[2].imageId?.startsWith('a_'), null, { timeout: 15000 });
    const assets = await page.evaluate(() => { const p = window.__studio.project; return [p.assets[p.scenes[1].imageId], p.assets[p.scenes[2].imageId]]; });
    check(tpl, '이미지 업로드(세로형·가로형)', assets[0].width === 900 && assets[0].height === 1800 && assets[1].width === 3000, assets.map((a) => `${a.width}x${a.height}`).join(', '));

    // 7) 잘리는 위치 조절 (가로형 사진의 오른쪽을 보이게)
    const box = await page.getByTestId('crop-box').boundingBox();
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    const crop = await page.evaluate(() => window.__studio.project.scenes[2].crop);
    check(tpl, '이미지 잘림 위치 조절', crop.focusX > 0.8, JSON.stringify(crop));

    // 8) 긴 한글 제목: 줄바꿈/배치 변경으로 수용, 넘치면 장면 나누기 제안 → 해결
    await page.locator('[data-testid=scene-card]').nth(3).click();
    await page.getByTestId('scene-title').fill('우리 동네에서 가장 신선한 원두를 매일 아침 직접 볶아서 문 앞까지 보내드리는 정기 배송 서비스');
    await page.waitForTimeout(300);
    const longTitle = await page.evaluate(() => ({ r: window.__studio.reports[3], s: window.__studio.project.scenes[3] }));
    check(tpl, '긴 한글 제목: 글자를 과하게 줄이지 않고 줄바꿈·배치 변경으로 수용', longTitle.r.overflow.length === 0, `배치 ${longTitle.r.variant}`);
    await page.screenshot({ path: join(out, '02b-long-title.png') });

    // 설명이 아주 길면 → 넘침 경고 → '장면 두 개로 나누기'
    await page.getByTestId('scene-body').fill('첫 주문 고객에게는 원두 샘플 세 가지를 함께 보내드립니다. 원두는 주문을 받은 뒤에 소량씩 볶기 때문에 향이 가장 좋을 때 도착합니다. 포장은 재활용이 가능한 종이로 바꿨습니다. 정기 배송을 신청하면 매달 다른 산지의 원두를 맛볼 수 있습니다. 언제든 해지할 수 있습니다.');
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ n: window.__studio.project.scenes.length, r: window.__studio.reports[3] }));
    const warned = await page.getByTestId('overflow-warning').count();
    if (before.r.overflow.length) {
      await page.getByTestId('split-scene').click();
      await page.waitForTimeout(300);
    }
    const after = await page.evaluate(() => ({ n: window.__studio.project.scenes.length, reports: window.__studio.reports, d: window.__studio.project.duration }));
    check(tpl, '긴 설명: 넘침 경고 → 장면 나누기로 해결', before.r.overflow.length > 0 && warned === 1 && after.n === before.n + 1 && after.reports.every((r) => r.overflow.length === 0),
      `넘친 필드 ${JSON.stringify(before.r.overflow)}, 장면 ${before.n}→${after.n}개, 영상 ${after.d}초, 배치: ${after.reports.map((r) => r.variant).join(' | ')}`);

    // 9) 저장 → 새로 열기 → 복원 확인
    await page.waitForSelector('[data-testid=save-state].saved', { timeout: 10000 });
    const saved = await page.evaluate(() => window.__studio.project);
    const page2 = await ctx.newPage();
    await page2.goto(`${BASE}/#/edit/${saved.id}`);
    await page2.waitForSelector('[data-testid=scene-strip]');
    const reopened = await page2.evaluate(() => window.__studio.project);
    const diffs0 = diffPaths({ ...saved, updatedAt: '' }, { ...reopened, updatedAt: '' });
    check(tpl, '저장한 프로젝트를 다시 열면 편집 상태 복원', diffs0.length === 0,
      diffs0.length ? `차이: ${diffs0.slice(0, 5).join(', ')}` : `id=${saved.id}, 장면 ${reopened.scenes.length}개·문구·사진·잘림 위치·색·길이 동일`);
    await page2.close();
    await page.bringToFront();

    // 10) 배치 확인용 프레임(세로형·가로형 사진, 긴 제목)
    const tl = await page.evaluate(() => window.__studio.timeline);
    const hero = tl.scenes.map((s, i) => Math.min(s.start + s.readyAt + 0.35, i < tl.scenes.length - 1 ? s.end - tl.transitionDur - 0.05 : s.end - 0.05));

    // 11) MP4 내보내기
    // 첫 시도는 서버 오류를 강제로 일으켜 실패 안내·재시도를 확인한다
    let failOnce = true;
    await page.route('**/api/renders/*/frames**', (route) => {
      if (failOnce) {
        failOnce = false;
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '테스트용 강제 오류' }) });
      }
      return route.continue();
    });
    await page.getByTestId('export').click();
    await page.waitForSelector('[data-testid=export-error]', { timeout: 60000 });
    const errText = await page.getByTestId('export-error').innerText();
    await page.screenshot({ path: join(out, '03a-export-error.png') });
    check(tpl, '렌더링 실패 시 원인·해결 안내와 재시도 버튼 표시', errText.includes('테스트용 강제 오류') && (await page.getByTestId('export-retry').count()) === 1);
    const t0 = Date.now();
    await page.getByTestId('export-retry').click();
    await page.waitForSelector('[data-testid=export-progress]', { timeout: 10000 });
    await page.waitForTimeout(3000);
    const progressText = await page.getByTestId('export-progress').innerText().catch(() => '');
    check(tpl, '렌더링 진행 상태 표시', /프레임/.test(progressText), progressText);
    await page.waitForSelector('[data-testid=export-done], [data-testid=export-error]', { timeout: 10 * 60 * 1000 });
    await page.unroute('**/api/renders/*/frames**');
    const failed = await page.locator('[data-testid=export-error]').count();
    if (failed) throw new Error('내보내기 실패: ' + (await page.getByTestId('export-error').innerText()));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    await page.screenshot({ path: join(out, '03-export-done.png') });
    const href = await page.getByTestId('download-link').getAttribute('href');
    const resp = await page.request.get(BASE + href);
    const mp4 = join(out, `output-${tpl}.mp4`);
    writeFileSync(mp4, await resp.body());
    check(tpl, '재시도 후 MP4 내보내기 완료', resp.ok(), `${secs}초 소요`);

    // 12) 결과 파일 검사 (해상도, 길이, 프레임 수, 코덱)
    const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', mp4]).toString());
    const st = probe.streams[0];
    const expectFrames = Math.round(saved.duration * saved.fps);
    check(tpl, 'MP4 해상도 1920×1080', st.width === 1920 && st.height === 1080, `${st.width}×${st.height}`);
    check(tpl, `MP4 길이 ${saved.duration}초 / 프레임 ${expectFrames}개`, Math.abs(Number(probe.format.duration) - saved.duration) < 0.05 && Number(st.nb_read_frames) === expectFrames, `${Number(probe.format.duration).toFixed(3)}초, ${st.nb_read_frames}프레임`);
    check(tpl, 'MP4 재생 호환 형식(H.264 / yuv420p)', st.codec_name === 'h264' && st.pix_fmt === 'yuv420p', `${st.codec_name}/${st.pix_fmt}`);
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', mp4, '-f', 'null', '-']);
    check(tpl, 'MP4 전체 디코딩 오류 없음', true);

    // 13) 미리보기 vs 출력 프레임 비교 + 수정 사항 반영 확인
    const times = [...hero, tl.scenes[1].start + tl.transitionDur * 0.5];
    const psnrs = [];
    for (const [i, t] of times.entries()) {
      const n = Math.round(t * saved.fps);
      const tq = n / saved.fps;
      const prev = join(out, `cmp-${i}-preview.png`);
      const vid = join(out, `cmp-${i}-mp4.png`);
      writeFileSync(prev, png(await page.evaluate((t) => window.__studio.renderFrameDataURL(t, 1920), tq)));
      extractFrame(mp4, n, vid);
      sideBySide(prev, vid, join(out, `cmp-${i}.jpg`));
      psnrs.push(psnrOf(prev, vid));
    }
    check(tpl, '미리보기와 출력 영상의 주요 장면 일치 (PSNR ≥ 32dB)', psnrs.every((p) => p >= 32), psnrs.map((p) => p.toFixed(1)).join(', ') + ' dB');

    // 수정 전 프로젝트로 그린 같은 시점 프레임과는 달라야 한다(문구·사진·색 변경이 출력에 반영)
    const changedScenes = [0, 1, saved.scenes.length - 1];
    const diffs = [];
    for (const i of changedScenes) {
      const n = Math.round(hero[i] * saved.fps);
      const tq = n / saved.fps;
      const before = join(out, `changed-${i}-before.png`);
      const vid = join(out, `changed-${i}-mp4.png`);
      const originalFixed = { ...original, duration: saved.duration };
      writeFileSync(before, png(await page.evaluate(([p, t]) => window.__studio.renderProjectFrame(p, t, 1920), [originalFixed, tq])));
      extractFrame(mp4, n, vid);
      diffs.push(psnrOf(before, vid));
    }
    // 같은 장면이면 43dB 이상, 수정이 반영되어 달라졌다면 30dB 미만 (색만 바뀐 장면은 바뀐 면적이 작아 25~30dB)
    check(tpl, '바꾼 문구·사진·색상이 출력 영상에 반영 (수정 전 프레임과 확연히 다름: PSNR < 30dB)', diffs.every((p) => p < 30), diffs.map((p) => p.toFixed(1)).join(', ') + ' dB');

    check(tpl, '브라우저 오류 없음', errors.length === 0, errors.join(' / '));
  } catch (e) {
    check(tpl, '검증 진행', false, e.message);
    await page.screenshot({ path: join(out, 'error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
}

try {
  const r = await fetch(`${BASE}/api/health`);
  if (!r.ok) throw new Error();
} catch {
  console.error(`앱 서버(${BASE})에 연결할 수 없습니다. 다른 터미널에서 'npm run dev'를 먼저 실행해 주세요.`);
  process.exit(2);
}
for (const t of templates) await run(t);
mkdirSync(join(root, 'test-output'), { recursive: true });
writeFileSync(join(root, 'test-output/report.json'), JSON.stringify(results, null, 2));
const failedCount = results.filter((r) => !r.ok).length;
console.log(`\n총 ${results.length}개 확인, 실패 ${failedCount}개. 결과: test-output/`);
process.exit(failedCount ? 1 : 0);
