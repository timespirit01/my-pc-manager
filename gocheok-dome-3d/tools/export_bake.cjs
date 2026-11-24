// 조명 굽기용 경기장 전체 내보내기 (Blender 에셋을 불러온 정상 화면 기준)
// 사용: node tools/export_bake.cjs http://localhost:8765/ <출력폴더>
// 출력: bake_scene.glb (ground, v0..vN 정점 굽기 대상, e0..eM 발광면), bake.json (좌석 색·위치, 조명등 위치·방향)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto(url + '?nobake=1'); await p.waitForFunction(() => window.__app, null, { timeout: 180000 });
  const r = await p.evaluate(async () => {
    const THREE = await import('three');
    const { GLTFExporter } = await import('./tools/vendor/GLTFExporter.js');
    const { collectBake, R0, Dout } = await import('./src/stadium.js');
    const { TIERS, SPEC } = await import('./src/data.js');
    const { st, sections } = window.__app;
    st.root.updateMatrixWorld(true);
    const L = collectBake(st), sc = new THREE.Scene();
    const add = (m, name) => {
      const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      const src = m.material, mat = new THREE.MeshStandardMaterial({ name, color: src.color.clone(), map: src.map || null, roughness: 0.9 });
      if (src.isMeshBasicMaterial) mat.emissive.copy(src.color), mat.emissiveMap = src.map || null;
      const c = new THREE.Mesh(g, mat); c.name = name; sc.add(c);
    };
    add(L.ground, 'ground');
    L.vertex.forEach((m, i) => add(m, 'v' + i));
    L.emit.forEach((m, i) => add(m, 'e' + i));
    const glb = await new GLTFExporter().parseAsync(sc, { binary: true, maxTextureSize: 2048 });
    let bin = ''; const u8 = new Uint8Array(glb); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    const pal = [], seats = [];
    for (const s of sections) { let ci = pal.indexOf(s.real); if (ci < 0) { ci = pal.length; pal.push(s.real); } for (const q of s.seats) seats.push([+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(3), +q.phi.toFixed(3), ci]); }
    const lamps = [], M = new THREE.Matrix4(), P = new THREE.Vector3(), Z = new THREE.Vector3();
    for (let i = 0; i < st.lampI.count; i++) { st.lampI.getMatrixAt(i, M); P.setFromMatrixPosition(M); Z.setFromMatrixColumn(M, 2).normalize(); lamps.push([P.x, P.y, P.z, Z.x, Z.y, Z.z].map((v) => +v.toFixed(3))); }
    // 렌더 전용 세부 요소(난간·계단·그물·둘레 철골)를 Blender 에서 만들 기준 형상
    const r0 = [], dout = []; for (let i = 0; i < 720; i++) { r0.push(+R0(i / 2).toFixed(4)); dout.push(+Dout(i / 2).toFixed(4)); }
    const tiers = TIERS.map((t) => ({ ...t, ...(({ r0, dEnd, yEnd }) => ({ r0, dEnd, yEnd }))(st.tierInfo[t.id]) }));
    const aisles = {}; for (const s of sections) (aisles[s.tier] ||= new Set()).add(+s.a.toFixed(3)), aisles[s.tier].add(+s.b.toFixed(3));
    for (const k in aisles) aisles[k] = [...aisles[k]].sort((a, b) => a - b);
    const names = L.vertex.map((m) => m.name || '');
    // 구역별 대표 좌석(가운데 열·가운데 자리) 시점 — 360° 파노라마 렌더 목록
    // 구역마다 가운데 열 가운데 좌석(pNNN), 6열 이상이면 맨 앞 열(pNNNf)·맨 뒤 열(pNNNb)도
    const panos = sections.flatMap((s, i) => {
      const rows = [...new Set(s.seats.map((q) => q.row))].sort((x, y) => x - y);
      const at = (r, suf) => { const row = s.seats.filter((q) => q.row === r), q = row[Math.floor(row.length / 2)];
        return { name: 'p' + String(i).padStart(3, '0') + suf, id: s.id, row: q.row, num: q.num, pos: [+q.x.toFixed(3), +(q.y + 1.14).toFixed(3), +q.z.toFixed(3)] }; };
      const out = [at(rows[Math.floor(rows.length / 2)], '')];
      if (rows.length >= 6) out.push(at(rows[0], 'f'), at(rows.at(-1), 'b'));
      return out;
    });
    return { glb: btoa(bin), json: { panos, seats, palette: pal, lamps, names, anchors: { r0, dout, centerZ: SPEC.centerZ, roofHeight: SPEC.roofHeight, ywall: 33, tiers, aisles, net: { a: 112, b: 248, d: 0.12, y0: 1.0, y1: 11 } }, counts: { vertex: L.vertex.length, emit: L.emit.length } } };
  });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'bake_scene.glb'), Buffer.from(r.glb, 'base64'));
  fs.writeFileSync(path.join(out, 'bake.json'), JSON.stringify(r.json));
  fs.writeFileSync(path.join(out, 'panos.json'), JSON.stringify(r.json.panos));
  console.log('counts', r.json.counts, 'seats', r.json.seats.length, 'lamps', r.json.lamps.length, 'palette', r.json.palette, 'glb', fs.statSync(path.join(out, 'bake_scene.glb')).size);
  await b.close();
})();
