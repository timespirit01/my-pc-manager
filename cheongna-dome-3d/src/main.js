import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';
import { buildStadium } from './stadium.js';
import { createPlan } from './plan.js';
import { createPano } from './pano.js';

const $ = (q) => document.querySelector(q);
const canvas = $('#scene');
const isMobile = matchMedia('(max-width: 760px)').matches;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e14);
const hemi = new THREE.HemisphereLight(0xf4f7ff, 0x6b6f66, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6e8, 1.5); sun.position.set(25, 150, -30); sun.target.position.set(0, 0, -50);
scene.add(sun, sun.target);
{ const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.3; pm.dispose(); }
const HAZE = new THREE.FogExp2(0xc9d2da, 0.0016);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
const orbit = new OrbitControls(camera, canvas);
orbit.target.set(0, 4, -50); orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.46;
orbit.minDistance = 40; orbit.maxDistance = 480; orbit.enablePan = false;

const qs = new URLSearchParams(location.search);
const st = await buildStadium(scene, { lite: isMobile });
const SPEC = { ...st.meta.spec, centerZ: -50 }, GRADES = st.meta.grades;
const baked = Object.values(st.mats).some((mt) => mt.vertexColors) && !qs.has('nobake');   // Cycles 로 구운 정점 조명이 들어 있으면 실시간 조명을 줄인다
if (baked) { renderer.toneMapping = THREE.AgXToneMapping; hemi.intensity = 0.0; sun.intensity = 0.0; }
for (const mt of Object.values(st.mats)) { if (baked && mt.vertexColors) { mt.envMapIntensity = 0.25; } }
const { sections } = st;
const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
const HOME_VIEW = new THREE.Vector3(0, 215, 150);
camera.position.copy(HOME_VIEW);

// ── 후처리: 블룸 + 톤매핑 + 비네트/그레인 ──
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isMobile ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(Math.min(devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.7, 1.35));
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, amt: { value: 0 }, look: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, amt, look; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 q = vUv - 0.5;
      // 구운 조명일 때: Blender AgX 'Medium High Contrast' 에 가깝게 대비·채도를 올림
      vec3 l = (c.rgb - 0.5) * (1.0 + 0.22 * look) + 0.5; float y = dot(l, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(c.rgb, clamp(mix(vec3(y), l, 1.0 + 0.12 * look), 0.0, 1.0), look);
      float v = smoothstep(0.95, 0.25, length(q * vec2(1.0, 0.85)));
      c.rgb *= mix(1.0, 0.72 + 0.28 * v, amt);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.96), amt);
      c.rgb += (h(gl_FragCoord.xy) - 0.5) * 0.035 * amt; gl_FragColor = c; }`,
});
composer.addPass(grade);
let lightMean = 1;
if (baked) grade.uniforms.look.value = 0.6;

// ── 상태 ─────────────────────────────────────────────
let pano = null;                        // 사진급 360° 좌석 시야 (assets/panos)
const RU = (s) => (s?.view ? '층' : '열');      // 행 단위: 좌석은 열, 건물 시점은 층
const state = { roof: 'closed', event: 'baseball', photo: true, auto: false, crowd: false, mode: 'overview', section: null, seat: null, seatIdx: -1, hover: null, hoverSeat: -1, filter: null, weekend: false };
const tmpL = new THREE.Color();
const WHITE = new THREE.Color(0xffffff), YELLOW = new THREE.Color(0xffd400), GRAY = new THREE.Color(0x4a4d55), tmpC = new THREE.Color();

function paint(s) {
  const dim = state.filter && state.filter !== s.grade;
  const hot = state.hover === s || (state.section === s && state.mode === 'section');
  tmpC.copy(dim ? GRAY : state.mode === 'seat' ? s.realColor : s.color); if (hot && !dim) tmpC.lerp(new THREE.Color(0xffffff), 0.22);
  if (s.light) { const k = state.mode === 'seat' ? 1 : 1 / lightMean; for (let i = 0; i < s.seats.length; i++) s.mesh.setColorAt(i, tmpL.copy(tmpC).multiplyScalar(s.light[i] * k)); }   // 구운 좌석별 밝기 (배치도·전체 보기는 평균 1로 맞춰 등급 색이 보이게)
  else for (let i = 0; i < s.seats.length; i++) s.mesh.setColorAt(i, tmpC);
  if (state.section === s && state.mode === 'section' && state.hoverSeat >= 0) s.mesh.setColorAt(state.hoverSeat, WHITE);
  if (state.section === s && state.seatIdx >= 0) s.mesh.setColorAt(state.seatIdx, YELLOW);
  s.mesh.instanceColor.needsUpdate = true;
  s.label.material.opacity = dim ? 0.15 : 1;
}

// ── 카메라 이동 ───────────────────────────────────────
let tween = null;
const pov = { yaw: 0, pitch: 0, fov: 62 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function flyTo(pos, look, fov, dur = 1400, done) {
  if (reduceMotion) dur = 1;
  const q0 = camera.quaternion.clone(), p0 = camera.position.clone(), f0 = camera.fov;
  const m = new THREE.Matrix4().lookAt(pos, look, camera.up), q1 = new THREE.Quaternion().setFromRotationMatrix(m);
  const lift = Math.min(40, p0.distanceTo(pos) * 0.12);
  tween = { t0: performance.now(), dur, p0, pos: pos.clone(), q0, q1, f0, fov, lift, done };
  orbit.enabled = false;
}
function stepTween(now) {
  if (!tween) return;
  let t = Math.min(1, (now - tween.t0) / tween.dur); const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  camera.position.lerpVectors(tween.p0, tween.pos, e); camera.position.y += Math.sin(Math.PI * e) * tween.lift;
  camera.quaternion.slerpQuaternions(tween.q0, tween.q1, e);
  camera.fov = tween.f0 + (tween.fov - tween.f0) * e; camera.updateProjectionMatrix();
  if (t >= 1) { const d = tween.done; tween = null; d && d(); }
}

function clearHover() { const o = state.hover; state.hover = null; state.hoverSeat = -1; if (o) paint(o); $('#tip').hidden = true; }
function setHash(h) { history.replaceState(null, '', h || location.pathname + location.search); }
function setOffset() {            // 구역 화면: 카드가 가리는 만큼 화면을 밀어 좌석이 빈 영역 가운데 오게
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (state.mode === 'section') camera.setViewOffset(w, h, isMobile ? 0 : w * 0.1, isMobile ? h * 0.13 : -h * 0.03, w, h); else camera.clearViewOffset();
}
function shell(on) { st.shell.visible = on; scene.fog = on ? HAZE : null; if (typeof applyRoof === 'function' && roofReady) applyRoof(); }
let roofReady = false;
let hiddenP = null;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function hideOwnPerson(s, seat) {
  if (hiddenP) { const { p, i } = hiddenP; for (const m of [p.bodies, p.heads]) { m.setMatrixAt(i, p.mats[i]); m.instanceMatrix.needsUpdate = true; } hiddenP = null; }
  if (s && seat.pi >= 0) { const p = s.people; for (const m of [p.bodies, p.heads]) { m.setMatrixAt(seat.pi, ZERO); m.instanceMatrix.needsUpdate = true; } hiddenP = { p, i: seat.pi }; }
}

function goOverview() {
  setAuto(false);
  state.mode = 'overview'; const prev = state.section; state.section = null; state.seat = null; state.seatIdx = -1;
  if (prev) paint(prev); clearHover(); setHash(''); hideOwnPerson(null);
  shell(false); st.labels.visible = true;
  flyTo(HOME_VIEW, orbit.target, 50, 1300, () => { orbit.enabled = true; });
  syncUI();
}

// 구역 보기: 좌석이 격자로 보이는 정면 배치도 시점 + 열 번호 라벨
const rowLabels = new THREE.Group(); scene.add(rowLabels);
let secView = null;
function applySecZoom() { camera.position.copy(secView.center).addScaledVector(secView.dir, secView.dist * secView.k); }
function buildRowLabels(s) {
  for (const o of rowLabels.children) { o.material.map.dispose(); o.material.dispose(); } rowLabels.clear();
  for (const r of rowsOf(s)) {
    const row = s.seats.filter((x) => x.row === r), a = row[0], b = row[row.length - 1];
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,12,18,.85)'; g.beginPath(); g.roundRect(2, 2, 124, 60, 18); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${r}${RU(s)}`, 64, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    for (const [p, q] of [[a, b], [b, a]]) {            // 양쪽 끝에 표시
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false, fog: false })); sp.scale.set(1.1, 0.55, 1); sp.renderOrder = 9;
      const d = new THREE.Vector3(p.x - q.x, 0, p.z - q.z); if (d.lengthSq() < 0.01) d.set(1, 0, 0); d.normalize();
      sp.position.set(p.x + d.x * 1.0, p.y + 0.75, p.z + d.z * 1.0); rowLabels.add(sp);
      if (row.length < 2) break;
    }
  }
}
function goSection(s, keepPanel = false) {
  if (!keepPanel) closePanel();       // 3D·미니맵·옆 구역 이동으로 들어오면 패널을 접어 배치도를 가리지 않게
  const prev = state.section; state.mode = 'section'; state.section = s; state.seat = null; state.seatIdx = -1;
  if (prev && prev !== s) paint(prev); clearHover(); paint(s); setHash('');
  shell(true); st.labels.visible = false; hideOwnPerson(null);
  buildRowLabels(s);
  const ys = s.seats.map((x) => x.y), vH = Math.max(...ys) - Math.min(...ys);
  const first = s.seats.filter((x) => x.row === s.seats[0].row), W = Math.hypot(first[0].x - first.at(-1).x, first[0].z - first.at(-1).z) + 4, Hh = s.view ? vH + 8 : s.rowCount * 0.75 + 3;
  const th = Math.tan((50 * Math.PI) / 360), dist = Math.max(9, 1.08 * Math.max(W / (2 * th * camera.aspect), Hh / (2 * th)));
  const el = ((s.view ? 10 : 52) * Math.PI) / 180, dir = s.inward.clone().multiplyScalar(Math.cos(el)).add(new THREE.Vector3(0, Math.sin(el), 0));
  const cen = s.center.clone(); if (s.view) cen.y -= vH / 2;      // 건물은 정면에서 층 전체가 보이게
  secView = { center: cen, dir, dist: dist * (isMobile ? 1.12 : 1.3), k: 1 };
  flyTo(cen.clone().addScaledVector(dir, secView.dist), cen, 50, 1300);
  syncUI();
}

const LOOKS = {
  home: new THREE.Vector3(0, 1, -6), mound: new THREE.Vector3(0, 1, -SPEC.mound),
  board: new THREE.Vector3(-20, 39, -135), field: new THREE.Vector3(0, 0, -60), stage: new THREE.Vector3(0, 7, -96),
};
const defLook = () => (state.event === 'concert' ? 'stage' : 'mound');
function seatEye(seat) { return new THREE.Vector3(seat.x, seat.y + 1.14, seat.z); }
function goSeat(s, idx, lookKey = defLook()) {
  const prev = state.section; state.mode = 'seat'; state.section = s; state.seatIdx = idx; state.seat = s.seats[idx];
  if (prev && prev !== s) paint(prev); clearHover(); paint(s);
  shell(true); st.labels.visible = false;
  hideOwnPerson(s, state.seat);
  const eye = seatEye(state.seat), look = LOOKS[lookKey];
  const dir = look.clone().sub(eye).normalize();
  pov.yaw = Math.atan2(-dir.x, -dir.z); pov.pitch = Math.asin(dir.y); pov.fov = innerHeight > innerWidth * 1.2 ? 78 : 62;   // 세로 화면은 좌우가 좁아 넓게
  const p = photoFor(); if (!p || p !== pano.current) pano?.hide(); pano?.preload(p);   // 같은 사진이면 그대로 두고, 다른 구역이면 3D 로 날아간 뒤 바꿔 끼움
  flyTo(eye, look, pov.fov, p && p === pano.current ? 500 : 1700, updatePano);
  setHash(`#seat=${encodeURIComponent(s.id)}/${state.seat.row}/${state.seat.num}` + (state.roof === 'open' ? '&roof=open' : ''));
  syncUI();
}
function lookAtKey(k) {
  if (state.mode !== 'seat') return;
  const eye = seatEye(state.seat), dir = LOOKS[k].clone().sub(eye).normalize();
  pov.yaw = Math.atan2(-dir.x, -dir.z); pov.pitch = Math.asin(dir.y);
  flyTo(eye, LOOKS[k], pov.fov, 600);
}
function applyPov() {
  camera.rotation.set(pov.pitch, pov.yaw, 0, 'YXZ');
  camera.fov = pov.fov; camera.updateProjectionMatrix();
}
// 사진급 360°: 야구 모드의 좌석 시야에서, 고른 좌석과 가장 가까운 렌더 지점의 파노라마를 덮어 보여 준다
function photoFor() {
  if (!pano || !state.photo || state.mode !== 'seat' || state.event === 'concert' || state.roof === 'open' || !state.seat) return null;   // 사진은 지붕 닫힌 야구 장면만
  return pano.nearest(state.section.id, seatEye(state.seat));
}
function updatePano() {
  const p = photoFor();
  if (!p) { pano?.hide(); syncPhoto(); return; }
  pano.show(p).then(() => syncPhoto());
}
function syncPhoto() {
  const p = photoFor(), b = $('#photoBadge'), btn = $('#btnPhoto');
  btn.hidden = !pano || !pano.count || state.event === 'concert' || state.roof === 'open';
  btn.textContent = state.photo ? '3D 모델로 보기' : '사진급 360° 보기'; btn.setAttribute('aria-pressed', state.photo);
  $('#btnCrowd').disabled = !!p;
  b.hidden = btn.hidden || state.mode !== 'seat';
  if (p) {
    const same = state.seat.row === p.row && state.seat.num === p.num;
    b.textContent = (same ? '사진급 렌더' : `사진급 렌더 · ${p.row}${RU(state.section)} ${p.num}번 시점`) + ' — 눌러서 3D 모델로';
  } else b.textContent = '3D 모델 — 눌러서 사진급 360°로';
}

// ── 입력 ─────────────────────────────────────────────
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const objs = sections.map((s) => s.mesh); if (st.labels.visible) objs.push(...st.labels.children);
  const h = ray.intersectObjects(objs, false)[0]; if (!h) return null;
  return { s: h.object.userData.section, idx: h.object.isInstancedMesh ? h.instanceId : -1 };
}
const ptrs = new Map(); let down = null, pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => {
  ptrs.set(e.pointerId, e); down = { x: e.clientX, y: e.clientY, moved: false };
  if (state.mode !== 'overview') canvas.setPointerCapture(e.pointerId);
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
});
canvas.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId) && e.pointerType === 'mouse' && e.buttons === 0) ptrs.delete(e.pointerId);
  if (ptrs.has(e.pointerId)) {
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, e);
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
    if (state.mode === 'section' && !tween && ptrs.size === 2 && secView) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      secView.k = THREE.MathUtils.clamp(secView.k * (pinch0 / d), 0.3, 1.5); pinch0 = d; down.moved = true; applySecZoom();
    }
    if (state.mode === 'seat' && !tween) {
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pov.fov = THREE.MathUtils.clamp(pov.fov * (pinch0 / d), 12, 80); pinch0 = d;
      } else {
        const k = (pov.fov * Math.PI / 180) / canvas.clientHeight;
        setAuto(false); pov.yaw += (e.clientX - prev.clientX) * k; pov.pitch = THREE.MathUtils.clamp(pov.pitch + (e.clientY - prev.clientY) * k, -1.3, 1.3);
      }
      applyPov();
    }
    return;
  }
  if (e.pointerType !== 'mouse' || state.mode === 'seat' || tween) return;
  const h = pick(e), s = h ? h.s : null, hs = state.mode === 'section' && s === state.section && h.idx >= 0 ? h.idx : -1;
  if (s !== state.hover || hs !== state.hoverSeat) { const o = state.hover; state.hover = s; state.hoverSeat = hs; if (o) paint(o); if (s && s !== o) paint(s); }
  canvas.style.cursor = s ? 'pointer' : 'grab';
  const tip = $('#tip');
  if (!s) { tip.hidden = true; return; }
  if (hs >= 0) { const q = s.seats[hs]; $('#tipImg').hidden = true; $('#tipTxt').textContent = `${q.row}${RU(s)} ${q.num}번 · 누르면 이 자리 시야`; }
  else { $('#tipImg').hidden = false; $('#tipImg').src = thumb(s); $('#tipTxt').textContent = s.view ? `${s.id} · ${s.note}` : `${s.id}구역 · ${s.g.name} · ${priceText(s.g)}`; }
  tip.hidden = false;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 250) + 'px'; tip.style.top = Math.min(e.clientY + 14, innerHeight - (hs >= 0 ? 40 : 180)) + 'px';
});
const up = (e) => {
  ptrs.delete(e.pointerId);
  if (!down || down.moved || tween || e.type === 'pointercancel') { down = null; return; }
  down = null;
  const h = pick(e); if (!h) return;
  if (state.mode === 'overview' || h.s !== state.section || h.idx < 0) goSection(h.s);
  else goSeat(h.s, h.idx);
};
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('pointerleave', (e) => { if (!ptrs.has(e.pointerId)) clearHover(); });
canvas.addEventListener('wheel', (e) => {
  if (state.mode === 'section' && secView && !tween) { e.preventDefault(); secView.k = THREE.MathUtils.clamp(secView.k * (e.deltaY > 0 ? 1.1 : 0.9), 0.3, 1.5); applySecZoom(); return; }
  if (state.mode !== 'seat') return; e.preventDefault(); if (tween) return;
  pov.fov = THREE.MathUtils.clamp(pov.fov * (e.deltaY > 0 ? 1.08 : 0.92), 12, 80); applyPov();
}, { passive: false });

// ── 구역 시야 미리보기(썸네일): 작은 화면으로 한 번 그려 캐시 ──
const TW = 320, TH = 180, thumbRT = new THREE.WebGLRenderTarget(TW, TH), thumbCam = new THREE.PerspectiveCamera(62, TW / TH, 0.1, 900);
const tcv = document.createElement('canvas'); tcv.width = TW; tcv.height = TH; const tctx = tcv.getContext('2d'), tbuf = new Uint8Array(TW * TH * 4);
function midSeat(s) { const rows = rowsOf(s), r = rows[Math.floor(rows.length / 2)], row = s.seats.filter((x) => x.row === r); return row[Math.floor(row.length / 2)]; }
function thumb(s) {
  if (s.thumb) return s.thumb;
  thumbCam.position.copy(seatEye(midSeat(s))); thumbCam.lookAt(LOOKS[defLook()]);
  const sv = [st.shell.visible, st.labels.visible, st.crowd.visible, st.net.visible, rowLabels.visible, scene.fog];
  st.shell.visible = true; st.labels.visible = false; st.crowd.visible = false; st.net.visible = true; rowLabels.visible = false; scene.fog = HAZE;
  renderer.setRenderTarget(thumbRT); renderer.render(scene, thumbCam); renderer.readRenderTargetPixels(thumbRT, 0, 0, TW, TH, tbuf); renderer.setRenderTarget(null);
  [st.shell.visible, st.labels.visible, st.crowd.visible, st.net.visible, rowLabels.visible, scene.fog] = sv;
  const img = tctx.createImageData(TW, TH), d = img.data;
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const i = ((TH - 1 - y) * TW + x) * 4, o = (y * TW + x) * 4;
    for (let c = 0; c < 3; c++) { const v = tbuf[i + c] / 255; d[o + c] = 255 * Math.pow(Math.min(1, v * 1.25 / (1 + v * 0.25)), 1 / 2.2); }   // 선형 → 화면 밝기
    d[o + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  return (s.thumb = tcv.toDataURL('image/jpeg', 0.82));
}

// ── 옆 구역: 같은 층·같은 등급 띠에서 그쪽으로 가장 가까운 구역 (dir=+1 이면 관중 기준 왼쪽) ──
const tmpN = new THREE.Vector3();
function neighbor(s, dir) {
  let best = null, bd = 30;
  for (const pass of [1, 0]) {
    for (const c of sections) {
      if (c === s || c.tier !== s.tier || (pass && c.grade !== s.grade)) continue;
      tmpN.subVectors(c.center, s.center); const side = tmpN.dot(s.left) * dir, d = tmpN.length();
      if (side > 2 && d < bd) { bd = d; best = c; }
    }
    if (best) break;
  }
  return best;
}
function goNeighbor(side) {           // side: -1 화면 왼쪽, +1 화면 오른쪽
  const s = state.section; if (!s || tween) return;
  const n = neighbor(s, state.mode === 'seat' ? -side : side); if (!n) return;   // 구역 보기는 그라운드 쪽에서 바라보므로 좌우가 반대
  if (state.mode !== 'seat') return goSection(n);
  const rows = rowsOf(n), r = rows.includes(state.seat.row) ? state.seat.row : rows[Math.min(rows.length - 1, Math.floor(rows.length / 2))];
  const row = n.seats.filter((x) => x.row === r), q = row[Math.floor(row.length / 2)];
  goSeat(n, n.seats.indexOf(q));
}
function syncCrumb() {
  const s = state.section; if (!s) return;
  const seatMode = state.mode === 'seat', L = neighbor(s, seatMode ? 1 : -1), R = neighbor(s, seatMode ? -1 : 1);
  $('#navL').textContent = L ? `◀ ${L.id}` : '◀'; $('#navL').disabled = !L; $('#navL').setAttribute('aria-label', L ? `왼쪽 옆 구역 ${L.id}` : '왼쪽 옆 구역 없음');
  $('#navR').textContent = R ? `${R.id} ▶` : '▶'; $('#navR').disabled = !R; $('#navR').setAttribute('aria-label', R ? `오른쪽 옆 구역 ${R.id}` : '오른쪽 옆 구역 없음');
  const el = $('#crumbPath'); el.innerHTML = '';
  const link = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; el.append(b); const i = document.createElement('i'); i.textContent = '›'; el.append(i); };
  link('전체', goOverview);
  const sn = s.view ? s.id : `${s.id}구역`;
  if (seatMode) { link(sn, () => goSection(s)); const b = document.createElement('b'); b.textContent = `${state.seat.row}${RU(s)} ${state.seat.num}번`; el.append(b); }
  else { const b = document.createElement('b'); b.textContent = sn; el.append(b); }
}

// ── UI ───────────────────────────────────────────────
const won = (n) => n.toLocaleString('ko-KR') + '원';
function priceText(g) { return g.price ? won(g.price[state.weekend ? 1 : 0]) + (g.unverified ? '*' : '') : '요금 미정'; }

function buildLegend() {
  const el = $('#legend'); el.innerHTML = '';
  for (const [k, g] of Object.entries(GRADES)) {
    const n = sections.filter((s) => s.grade === k).reduce((a, s) => a + s.seats.length, 0);
    const b = document.createElement('button'); b.className = 'grade' + (state.filter === k ? ' on' : '');
    b.innerHTML = `<i style="background:${g.color}"></i><span>${g.name}</span><em>${priceText(g)}</em>`;
    b.title = `${n.toLocaleString()}석`; b.setAttribute('aria-pressed', state.filter === k);
    b.onclick = () => { state.filter = state.filter === k ? null : k; sections.forEach(paint); buildLegend(); };
    el.append(b);
  }
}
function fillSelect(sel, items, value) {
  sel.innerHTML = items.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); if (value != null) sel.value = value;
}
function buildPicker() {
  const groups = {};
  for (const s of sections) (groups[s.view ? '맞닿은 건물' : `${s.zone} ${s.floor}층`] ||= []).push(s);
  $('#selSection').innerHTML = '<option value="">구역 선택</option>' + Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${g}">${list.map((s) => `<option value="${s.id}">${s.id} · ${s.view ? s.note.split(' (')[0] : s.g.name}</option>`).join('')}</optgroup>`).join('');
}
function rowsOf(s) { return [...new Set(s.seats.map((x) => x.row))]; }
function syncPicker() {
  const s = state.section; $('#selSection').value = s ? s.id : '';
  const rs = $('#selRow'), ns = $('#selNum');
  if (!s) { rs.innerHTML = ns.innerHTML = ''; rs.disabled = ns.disabled = true; return; }
  rs.disabled = ns.disabled = false;
  const row = state.seat ? state.seat.row : rs.dataset.sec === s.id ? +rs.value : 0; rs.dataset.sec = s.id; if (!row) ns.innerHTML = '';
  const rows = rowsOf(s); const r = rows.includes(row) ? row : rows[0];
  fillSelect(rs, rows.map((x) => [x, `${x}${RU(s)}`]), r);
  const nums = s.seats.filter((x) => x.row === r).map((x) => x.num);
  fillSelect(ns, nums.map((x) => [x, `${x}번`]), state.seat ? state.seat.num : nums.includes(+ns.value) ? +ns.value : Math.ceil(nums.length / 2));
}
// 좌석 LOD: 보고 있는 구역 주변(38m)만 고품질 좌석
function updateLOD() {
  if (!st.seatHi) return;
  const f = state.mode === 'overview' || !state.section ? null : state.section.center;
  for (const s of sections) { if (s.view) continue; const g = f && s.center.distanceTo(f) < 38 ? st.seatHi : st.seatLo; if (s.mesh.geometry !== g) s.mesh.geometry = g; }
}
function syncUI() {
  updateLOD();
  document.body.dataset.mode = state.mode; $('#tip').hidden = true;
  if (state.mode !== 'seat') pano?.hide();
  syncPhoto();
  setOffset();
  st.crowd.visible = state.mode === 'seat' && state.crowd; st.net.visible = state.mode === 'seat' && state.event !== 'concert'; rowLabels.visible = state.mode === 'section';
  if ((state.mode === 'seat') !== syncUI.wasSeat) { syncUI.wasSeat = state.mode === 'seat'; sections.forEach(paint); }   // 시야 화면에서는 실제 좌석 색
  const s = state.section, card = $('#card');
  syncPicker();
  if (!s) { card.hidden = true; $('#hint').textContent = '구역을 눌러 좌석을 선택하세요 · 드래그로 회전, 휠/핀치로 확대'; return; }
  card.hidden = false; syncCrumb(); drawMini();
  $('#cGrade').textContent = s.g.name; $('#cGrade').style.setProperty('--g', s.g.color);
  $('#cTitle').textContent = (s.view ? s.id : `${s.id}구역`) + (state.seat ? ` ${state.seat.row}${RU(s)} ${state.seat.num}번` : '');
  const behind = state.event === 'concert' && s.zone === '외야';
  $('#cSub').textContent = s.view ? `${s.note} · 좌석이 아닌 건물 시점` : `${s.zone} ${s.floor}층 · ${s.side}` + (s.g.note ? ` · ${s.g.note}` : '') + (behind ? ' · 무대 뒤(시야 제한)' : '');
  $('#cPrice').textContent = s.view ? '건물 시야' : priceText(s.g);
  if (state.seat) {
    const e = seatEye(state.seat), dH = Math.hypot(e.x, e.z), dM = Math.hypot(e.x, e.z + SPEC.mound);
    $('#cStats').innerHTML = `<div><b>${dH.toFixed(0)}m</b>홈플레이트</div><div><b>${dM.toFixed(0)}m</b>마운드</div><div><b>${e.y.toFixed(1)}m</b>눈높이</div>`;
    $('#hint').textContent = '드래그로 둘러보기 · 휠/핀치로 확대';
  } else {
    $('#cStats').innerHTML = `<div><b>${s.seats.length}</b>${s.view ? '시점' : '좌석'}</div><div><b>${rowsOf(s).length}</b>${RU(s)}</div><div><b>${Math.hypot(s.center.x, s.center.z).toFixed(0)}m</b>홈까지</div>`;
    $('#hint').textContent = (s.view ? '공 표시를 누르면 그 창가에서 보는 시야로 이동합니다' : '좌석을 누르면 그 자리에서 보는 시야로 이동합니다') + ' · 휠/핀치로 확대';
    $('#cThumb').src = thumb(s);
  }
}
const MINI = 240;                       // 미니맵에 담는 범위(m)
function drawMini() {
  const c = $('#mini'), g = c.getContext('2d'), W = c.width, k = W / MINI, X = (x) => W / 2 + x * k, Z = (z) => W / 2 + (z - SPEC.centerZ) * k;
  g.clearRect(0, 0, W, W);
  g.beginPath(); st.fieldPoly.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)))); g.closePath(); g.fillStyle = '#3f8a3c'; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath();
  for (const p of st.polePts) { g.moveTo(X(0), Z(0)); g.lineTo(X(p.x), Z(p.z)); } g.stroke();
  for (const s of sections) {
    if (!s.quad) { const r0 = s.seats.filter((x) => x.row === s.seats[0].row), r1 = s.seats.filter((x) => x.row === s.seats.at(-1).row); s.quad = [r0[0], r0.at(-1), r1.at(-1), r1[0]]; }
    g.beginPath(); s.quad.forEach((q, i) => (i ? g.lineTo(X(q.x), Z(q.z)) : g.moveTo(X(q.x), Z(q.z)))); g.closePath();
    const cur = s === state.section;
    g.globalAlpha = cur ? 1 : 0.5; g.fillStyle = cur ? '#ffd400' : s.g.color; g.fill(); g.globalAlpha = 1;
    g.lineWidth = cur ? 2 : 0.5; g.strokeStyle = cur ? '#fff' : 'rgba(0,0,0,.5)'; g.stroke();
  }
  const q = state.seat; if (q) { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(q.x), Z(q.z), 4.5, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); }
}
$('#mini').onclick = (e) => {
  if (tween) return;
  const r = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width - 0.5) * MINI, z = ((e.clientY - r.top) / r.height - 0.5) * MINI + SPEC.centerZ;
  let best = null, bd = 18;
  for (const s of sections) { const d = Math.hypot(s.center.x - x, s.center.z - z); if (d < bd) { bd = d; best = s; } }
  if (best && best !== state.section) goSection(best);
};
$('#navL').onclick = () => goNeighbor(-1); $('#navR').onclick = () => goNeighbor(1);
$('#btnHome').onclick = goOverview;
if (document.documentElement.requestFullscreen) $('#btnFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
else $('#btnFull').hidden = true;

$('#selSection').onchange = (e) => {   // 패널에서 고르는 중이면 열·번호를 이어서 고를 수 있게 패널을 열어 둔다
  const s = byId[e.target.value]; if (!s) return goOverview();
  document.body.classList.add('panel-open'); $('#panelToggle').setAttribute('aria-expanded', true); goSection(s, true);
};
$('#selRow').onchange = () => { syncPickerRow(); if (state.mode === 'seat') viewPicked(); };
function syncPickerRow() {
  const s = state.section, r = +$('#selRow').value, nums = s.seats.filter((x) => x.row === r).map((x) => x.num);
  fillSelect($('#selNum'), nums.map((x) => [x, `${x}번`]), Math.ceil(nums.length / 2));
}
function seatFromPicker() {
  const s = state.section; if (!s) return -1;
  const r = +$('#selRow').value, n = +$('#selNum').value;
  return s.seats.findIndex((x) => x.row === r && x.num === n);
}
function closePanel() { document.body.classList.remove('panel-open'); $('#panelToggle').setAttribute('aria-expanded', false); }
function viewPicked() { const i = seatFromPicker(); if (i >= 0) goSeat(state.section, i); return i >= 0; }
$('#btnView').onclick = () => { if (viewPicked()) closePanel(); };   // 시야로 이동하면 패널을 닫아 화면을 가리지 않게
$('#selNum').onchange = () => { if (state.mode === 'seat') viewPicked(); };
$('#btnBack').onclick = () => (state.mode === 'seat' ? goSection(state.section) : goOverview());
$('#btnAll').onclick = goOverview;
$('#btnCrowd').onclick = () => { state.crowd = !state.crowd; $('#btnCrowd').textContent = state.crowd ? '관중 숨기기' : '관중 보이기'; $('#btnCrowd').setAttribute('aria-pressed', state.crowd); syncUI(); };
$('#btnPhoto').onclick = $('#photoBadge').onclick = () => { state.photo = !state.photo; updatePano(); };
document.querySelectorAll('[data-look]').forEach((b) => (b.onclick = () => lookAtKey(b.dataset.look)));
$('#dayToggle').onclick = () => { state.weekend = !state.weekend; $('#dayToggle').textContent = state.weekend ? '주말 요금' : '평일 요금'; $('#dayToggle').setAttribute('aria-pressed', state.weekend); buildLegend(); syncUI(); };
$('#btnShare').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); $('#btnShare').textContent = '링크 복사됨'; }
  catch { $('#btnShare').textContent = '주소창 링크 복사'; }
  setTimeout(() => ($('#btnShare').textContent = '시야 링크 공유'), 1600);
};
$('#cardToggle').onclick = () => { const on = $('#card').classList.toggle('open'); $('#cardToggle').textContent = on ? '접기' : '자세히'; $('#cardToggle').setAttribute('aria-expanded', on); };
$('#panelToggle').onclick = () => { const on = document.body.classList.toggle('panel-open'); $('#panelToggle').setAttribute('aria-expanded', on); if (on) $('#selSection').focus(); };
// ── 행사 모드(야구/콘서트) ──
function setEvent(ev) {
  if (state.event === ev) return; state.event = ev; const c = ev === 'concert';
  st.concert.visible = c; st.players.visible = !c; st.ball.visible = !c;
  hemi.intensity = baked ? 0 : c ? 0.4 : 1.25; sun.intensity = baked ? 0 : c ? 0.35 : 1.5; scene.environmentIntensity = c ? 0.1 : 0.3;
  renderer.toneMappingExposure = c ? (baked ? 0.3 : 0.42) : 1.0;     // 조명은 야구 기준이라 콘서트는 노출로 어둡게
  for (const [n, k] of [['lamp', 0.02], ['led_board', 0], ['led_ad', 0.3], ['roof_led', 3]]) {       // 경기 조명·전광판은 끄고 지붕 미디어 천장은 밝게
    const mt = st.mats[n]; if (!mt) continue; mt.userData.e0 ??= mt.emissiveIntensity; mt.emissiveIntensity = mt.userData.e0 * (c ? k : 1);
  }
  HAZE.color.set(c ? 0x191b25 : 0xc9d2da); HAZE.density = c ? 0.0024 : 0.0016;
  sections.forEach((s) => (s.thumb = null));
  document.body.dataset.event = ev;
  document.querySelectorAll('#eventSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ev === ev));
  applyRoof(); syncUI(); if (state.mode === 'seat') { lookAtKey(defLook()); updatePano(); }
}
document.querySelectorAll('#eventSeg button').forEach((b) => (b.onclick = () => setEvent(b.dataset.ev)));

// ── 지붕 열기/닫기 (개폐 방식은 가정: 가운데 두 장이 동·서로 열림) ──
const SKY = new THREE.Color(0x9cc6ee), NIGHT = new THREE.Color(0x0b0e14);
let roofT = 0, roofTween = null;
function applyRoof() {
  st.setRoof(roofT);
  const c = state.event === 'concert', day = roofT * (c ? 0.25 : 1);
  scene.background.copy(state.mode === 'overview' ? NIGHT : NIGHT.clone().lerp(SKY, roofT));      // 전체 보기는 지붕을 떼고 보므로 배경을 그대로 둠
  if (!baked) { hemi.intensity = (c ? 0.4 : 1.25) + 0.9 * day; sun.intensity = (c ? 0.35 : 1.5) + 2.2 * day; }
}
function setRoof(v, instant = false) {
  if (state.roof === v && !instant) return; state.roof = v;
  document.querySelectorAll('#roofSeg button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.roof === v));
  const to = v === 'open' ? 1 : 0;
  if (instant || reduceMotion) { roofT = to; roofTween = null; applyRoof(); } else roofTween = { t0: performance.now(), from: roofT, to, dur: 2600 };
  sections.forEach((s) => (s.thumb = null));
  if (state.mode === 'seat') { setHash(`#seat=${encodeURIComponent(state.section.id)}/${state.seat.row}/${state.seat.num}` + (v === 'open' ? '&roof=open' : '')); updatePano(); }
  syncPhoto();
}
function stepRoof(now) {
  if (!roofTween) return;
  const k = Math.min(1, (now - roofTween.t0) / roofTween.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  roofT = roofTween.from + (roofTween.to - roofTween.from) * e; if (k >= 1) roofTween = null; applyRoof();
}
document.querySelectorAll('#roofSeg button').forEach((b) => (b.onclick = () => setRoof(b.dataset.roof)));

// ── 옆자리·앞뒤 열 이동 ──
function stepSeat(dNum, dRow) {
  if (state.mode !== 'seat' || tween) return; const s = state.section, cur = state.seat; let q = null;
  if (dNum) q = s.seats.find((x) => x.row === cur.row && x.num === cur.num + dNum);
  else { const row = s.seats.filter((x) => x.row === cur.row + dRow), dd = (x) => Math.hypot(x.x - cur.x, x.z - cur.z); for (const x of row) if (!q || dd(x) < dd(q)) q = x; }
  if (q) goSeat(s, s.seats.indexOf(q));
}
$('#stL').onclick = () => stepSeat(1, 0); $('#stR').onclick = () => stepSeat(-1, 0);      // 번호는 관중 기준 왼쪽으로 증가
$('#stF').onclick = () => stepSeat(0, -1); $('#stB').onclick = () => stepSeat(0, 1);

// ── 자동 둘러보기 ──
function setAuto(on) { if (state.auto === on) return; state.auto = on; $('#btnAuto').setAttribute('aria-pressed', on); }
$('#btnAuto').onclick = () => setAuto(!state.auto);

// ── 좌석 배치도 / 정보 ──
const plan = createPlan({ onSection: (s) => { plan.close(); closePanel(); goSection(s); }, sections, fieldPoly: st.fieldPoly, fencePoly: st.fencePoly, polePts: st.polePts, centerZ: SPEC.centerZ, current: () => ({ section: state.section, seat: state.seat }), onPick: (s, i) => { plan.close(); closePanel(); goSeat(s, i); } });
$('#btnPlan').onclick = () => plan.open(); $('#btnPick').onclick = () => plan.open();
$('#btnInfo').onclick = () => $('#infoDlg').showModal();
$('#infoClose').onclick = () => $('#infoDlg').close();
$('#infoDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

addEventListener('keydown', (e) => {
  if (/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') $('#btnBack').click();
  if (state.mode === 'seat' && !tween && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const s = state.section, cur = state.seat, n = cur.num + (e.key === 'ArrowRight' ? -1 : 1);   // 번호는 관중 기준 왼쪽으로 증가
    const i = s.seats.findIndex((x) => x.row === cur.row && x.num === n); if (i >= 0) goSeat(s, i);
  }
});

function fromHash() {
  const m = location.hash.match(/seat=([^/]+)\/(\d+)\/(\d+)/); if (!m) return false;
  let id; try { id = decodeURIComponent(m[1]); } catch { return false; }
  const s = byId[id]; if (!s) return false;
  const i = s.seats.findIndex((x) => x.row === +m[2] && x.num === +m[3]); if (i < 0) return false;
  setRoof(/roof=open/.test(location.hash) ? 'open' : 'closed', true);
  goSeat(s, i); return true;
}
let lastT = 0;

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  HOME_VIEW.set(0, 215, 150).multiplyScalar(camera.aspect < 0.8 ? 1.75 : 1); setOffset();
}
addEventListener('resize', resize);
addEventListener('hashchange', () => { if (!fromHash() && state.mode === 'seat') goOverview(); });

roofReady = true; buildLegend(); buildPicker(); resize(); camera.position.copy(HOME_VIEW); camera.lookAt(orbit.target);
shell(false); syncUI();
$('#seatTotal').textContent = st.total.toLocaleString();
if (!fromHash()) { camera.position.set(0, 360, 300); flyTo(HOME_VIEW, orbit.target, 50, 1800, () => { orbit.enabled = true; }); }
$('#loading').remove();
pano = await createPano(renderer).catch(() => null);
if (state.mode === 'seat') updatePano(); else syncPhoto();
window.__app = { pano, baked, setEvent, setRoof, plan, state, sections, goSection, goSeat, goOverview, goNeighbor, neighbor, thumb, st, camera };

renderer.setAnimationLoop((now) => {
  stepTween(now); stepRoof(now);
  if (orbit.enabled && state.mode !== 'seat' && !tween) orbit.update();
  if (state.auto && state.mode === 'seat' && !tween && !reduceMotion) { pov.yaw -= Math.min(0.05, (now - lastT) / 1000) * 0.14; applyPov(); }
  lastT = now;
  grade.uniforms.time.value = (now % 1000) / 1000; grade.uniforms.amt.value = state.mode === 'seat' ? 1 : 0.35;
  if (pano && pano.opaque && state.mode === 'seat' && !tween) pano.render(camera, now);   // 사진이 화면을 다 덮으면 3D 는 그리지 않음 (모바일 부담 ↓)
  else { composer.render(); pano?.render(camera, now); }
});
