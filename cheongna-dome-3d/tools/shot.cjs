// 웹앱 화면 확인용 캡처 (Playwright). 서버를 띄우지 않고, 요청을 가로채 이 폴더의 파일을 그대로 돌려준다.
//   node tools/shot.cjs <출력 접두어> <단계,단계,...> [mobile]
//   단계: overview | sec:<구역> | seat:<구역>/<열>/<번호> | plan | concert | photo | look:<home|mound|field|board>
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.cjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
(async () => {
  const out = process.argv[2]; const steps = (process.argv[3] || 'overview').split(',');
  const mobile = process.argv.includes('mobile');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 400)));
  await p.route('http://app.local/**', (route) => {
    let rel = decodeURIComponent(new URL(route.request().url()).pathname); if (rel.endsWith('/')) rel += 'index.html';
    const f = path.join(ROOT, rel);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await p.goto('http://app.local/' + (process.env.HASH || ''), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__app, null, { timeout: 180000 }).catch((e) => errs.push('no __app: ' + e.message.slice(0, 100)));
  await p.waitForTimeout(3500);
  for (const s of steps) {
    if (s.startsWith('sec:')) { await p.evaluate((id) => { const a = window.__app; a.goSection(a.sections.find((x) => x.id === id)); }, s.slice(4)); await p.waitForTimeout(2500); }
    else if (s.startsWith('seat:')) {
      const [id, row, num] = s.slice(5).split('/');
      await p.evaluate(([id, row, num]) => { const a = window.__app; const sec = a.sections.find((x) => x.id === id); const i = sec.seats.findIndex((q) => q.row === +row && q.num === +num); a.goSeat(sec, i < 0 ? Math.floor(sec.seats.length / 2) : i); }, [id, row, num]);
      await p.waitForTimeout(3200);
    } else if (s === 'plan') { await p.evaluate(() => window.__app.plan.open()); await p.waitForTimeout(800); }
    else if (s === 'concert') { await p.evaluate(() => window.__app.setEvent('concert')); await p.waitForTimeout(1500); }
    else if (s === 'photo') { await p.evaluate(() => document.querySelector('#btnPhoto').click()); await p.waitForTimeout(2500); }   // 사진급 360° ↔ 3D 전환
    else if (s.startsWith('look:')) { await p.click(`[data-look="${s.slice(5)}"]`).catch(() => {}); await p.waitForTimeout(1200); }
    await p.screenshot({ path: `${out}_${s.replace(/[:\/]/g, '-')}.png` });
  }
  const info = await p.evaluate(() => (window.__app ? { sections: window.__app.sections.length, total: window.__app.st.total, baked: window.__app.baked, hash: location.hash } : null));
  console.log(JSON.stringify(info)); console.log(errs.slice(0, 12).join('\n'));
  await b.close();
})();
