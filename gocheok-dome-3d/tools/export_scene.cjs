// 브라우저에서 절차적으로 만든 경기장 형상을 Blender 입력용으로 내보낸다.
// 사용: (gocheok-dome-3d 폴더를 정적 서버로 띄운 뒤) node tools/export_scene.cjs http://localhost:8765/ <출력폴더>
// 출력: stands.glb (스탠드 콘크리트·어두운 면), scene.json (좌석 위치, 경계 반지름 표, 지붕 상수)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(url + '?export=1'); await p.waitForFunction(() => window.__app, null, { timeout: 180000 });
  const r = await p.evaluate(async () => {
    const THREE = await import('three');
    const { GLTFExporter } = await import('./tools/vendor/GLTFExporter.js');
    const { R0, Dout } = await import('./src/stadium.js');
    const { SPEC } = await import('./src/data.js');
    const { st, sections } = window.__app;
    const sc = new THREE.Scene();
    for (const m of [st.standC, st.standD]) { const c = new THREE.Mesh(m.geometry, new THREE.MeshStandardMaterial({ name: m.name })); c.name = m.name; sc.add(c); }
    const glb = await new GLTFExporter().parseAsync(sc, { binary: true });
    let bin = ''; const u8 = new Uint8Array(glb); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    const seats = []; for (const s of sections) for (const q of s.seats) seats.push([+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.phi.toFixed(4)]);
    const r0 = [], dout = []; for (let i = 0; i < 720; i++) { r0.push(+R0(i / 2).toFixed(4)); dout.push(+Dout(i / 2).toFixed(4)); }
    return { glb: btoa(bin), json: { seats, r0, dout, centerZ: SPEC.centerZ, roofHeight: SPEC.roofHeight, ywall: 33, tm: 0.64, lampRings: [[0.78, 9, 0], [0.68, 12, 5]] } };
  });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'stands.glb'), Buffer.from(r.glb, 'base64'));
  fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(r.json));
  console.log('seats', r.json.seats.length, 'stands.glb', fs.statSync(path.join(out, 'stands.glb')).size);
  await b.close();
})();
