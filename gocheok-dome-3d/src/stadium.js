import * as THREE from 'three';
import { SPEC, GRADES, TIERS, buildSections } from './data.js';

const D2R = Math.PI / 180;
const CZ = SPEC.centerZ;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap180 = (p) => ((p + 180) % 360 + 360) % 360 - 180;

// ── 그라운드 경계(펜스·내야 벽) ─────────────────────────────
// 홈플레이트 기준 극좌표: θ=0 중견, ±45° 파울라인
function rhoHome(thDeg) {
  const t = Math.abs(wrap180(thDeg));
  if (t <= 45) return SPEC.foulLine + (SPEC.center - SPEC.foulLine) * Math.pow(Math.cos(2 * t * D2R), 0.85);
  const a = t - 45;                                   // 파울라인에서 벗어난 각
  const w = 6 + 10 * smooth(0, 55, a);                // 파울 지역 폭(추정): 폴 6m → 홈 부근 16m
  return Math.min(SPEC.foulLine + 1, w / Math.sin(a * D2R), SPEC.backstop);
}

const N = 720;
const R0T = new Float32Array(N);
(function buildBoundary() {
  for (let i = 0; i < N; i++) {
    const phi = (i / N) * 360 * D2R, sx = Math.sin(phi), sz = -Math.cos(phi);
    let lo = 5, hi = 160;
    for (let k = 0; k < 40; k++) {
      const R = (lo + hi) / 2, x = R * sx, z = CZ + R * sz;
      const inside = Math.hypot(x, z) < rhoHome(Math.atan2(x, -z) / D2R);
      if (inside) lo = R; else hi = R;
    }
    R0T[i] = lo;
  }
  for (let pass = 0; pass < 3; pass++) {             // 모서리 라운딩
    const src = Float32Array.from(R0T), W = 8;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += src[(i + k + N) % N];
      R0T[i] = s / (2 * W + 1);
    }
  }
})();

export function R0(phiDeg) {
  const f = (((phiDeg % 360) + 360) % 360) / 360 * N, i = Math.floor(f), t = f - i;
  return R0T[i % N] * (1 - t) + R0T[(i + 1) % N] * t;
}
const inW = (phi) => smooth(60, 90, Math.abs(wrap180(phi)));      // 0=외야, 1=내야
const Dout = (phi) => 15.5 + (32 - 15.5) * inW(phi);              // 외벽 위치
const Ywall = (phi) => 23 + (28.5 - 23) * inW(phi);               // 외벽(지붕 시작) 높이

export function P(phi, d, y, out = new THREE.Vector3()) {
  const R = R0(phi) + d, p = phi * D2R;
  return out.set(R * Math.sin(p), y, CZ - R * Math.cos(p));
}

// 단면(profile)을 φ 방향으로 쓸어 만든 리본 메시
const val = (v, phi) => (typeof v === 'function' ? v(phi) : v);
function sweep(pos, a, b, profile, step = 1.5) {
  const n = Math.max(1, Math.ceil((b - a) / step));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p0 = a + ((b - a) * i) / n, p1 = a + ((b - a) * (i + 1)) / n;
    for (let j = 0; j < profile.length - 1; j++) {
      const [d0, y0] = profile[j], [d1, y1] = profile[j + 1];
      P(p0, val(d0, p0), val(y0, p0), A); P(p1, val(d0, p1), val(y0, p1), B);
      P(p1, val(d1, p1), val(y1, p1), C); P(p0, val(d1, p0), val(y1, p0), D);
      pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z);
    }
  }
}
function meshFrom(pos, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ── 그라운드 텍스처 ─────────────────────────────────────
const FIELD = 300;
function fieldTexture(size, polePts) {
  return canvasTex(size, size, (g) => {
    const s = size / FIELD, X = (x) => (x + FIELD / 2) * s, Z = (z) => (z - CZ + FIELD / 2) * s;
    g.fillStyle = '#0b0e14'; g.fillRect(0, 0, size, size);
    const path = () => { g.beginPath(); for (let i = 0; i <= N; i++) { const p = P((i / N) * 360, 0, 0); i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)); } g.closePath(); };
    path(); g.save(); g.clip();
    g.fillStyle = '#3f8a3c'; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 60; i += 2) {                // 잔디 줄무늬
      g.beginPath(); g.arc(X(0), Z(0), (i + 1) * 5 * s, 0, 7); g.arc(X(0), Z(0), i * 5 * s, 0, 7, true);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill('evenodd');
    }
    path(); g.strokeStyle = '#9a6b45'; g.lineWidth = 9 * s; g.stroke();   // 워닝트랙
    const dirt = '#a8744a';
    // 내야 흙
    g.save(); g.beginPath(); g.moveTo(X(0), Z(3)); g.lineTo(X(60), Z(-57)); g.lineTo(X(-60), Z(-57)); g.closePath(); g.clip();
    g.fillStyle = dirt; g.beginPath(); g.arc(X(0), Z(-SPEC.mound), 29 * s, 0, 7); g.fill(); g.restore();
    const b = SPEC.base / Math.SQRT2;
    g.fillStyle = '#42903e'; g.beginPath(); g.moveTo(X(0), Z(-2.4)); g.lineTo(X(b - 1.7), Z(-b)); g.lineTo(X(0), Z(-2 * b + 2.4)); g.lineTo(X(-b + 1.7), Z(-b)); g.closePath(); g.fill();
    g.fillStyle = dirt;
    g.beginPath(); g.arc(X(0), Z(0), 4 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(X(0), Z(-SPEC.mound), 2.74 * s, 0, 7); g.fill();
    // 라인
    g.strokeStyle = '#f4f4f0'; g.lineWidth = Math.max(1.5, 0.12 * s); g.lineCap = 'butt';
    for (const p of polePts) { g.beginPath(); g.moveTo(X(0), Z(0)); g.lineTo(X(p.x), Z(p.z)); g.stroke(); }
    for (const sx of [-1, 1]) g.strokeRect(X(sx * 0.76 - 0.61), Z(-0.9), 1.22 * s, 1.83 * s);
    g.fillStyle = '#f4f4f0';
    g.fillRect(X(-0.3), Z(-SPEC.mound) - 0.08 * s, 0.6 * s, 0.16 * s);
    g.beginPath(); g.moveTo(X(-0.22), Z(-0.43)); g.lineTo(X(0.22), Z(-0.43)); g.lineTo(X(0.22), Z(-0.2)); g.lineTo(X(0), Z(0)); g.lineTo(X(-0.22), Z(-0.2)); g.fill();
    g.restore();
  });
}

function boardTexture(kind) {
  return canvasTex(1024, kind === 'main' ? 352 : 434, (g, w, h) => {
    g.fillStyle = '#05080d'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kind === 'main') {
      g.fillStyle = '#ffd24a'; g.font = 'bold 54px sans-serif'; g.fillText('GOCHEOK SKY DOME', w / 2, 60);
      g.font = 'bold 34px monospace'; g.fillStyle = '#9fd0ff';
      g.fillText('     1 2 3 4 5 6 7 8 9   R  H  E', w / 2, 140);
      g.fillStyle = '#fff'; g.fillText('AWAY 0 1 0 0 2 0 0       3  7  0', w / 2, 200);
      g.fillText('HOME 2 0 0 1 0 3 0       6  9  1', w / 2, 260);
      g.fillStyle = '#7dff8a'; g.font = 'bold 30px monospace'; g.fillText('B ●●○   S ●○   O ●○', w / 2, 318);
    } else {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5e1128'); gr.addColorStop(1, '#14060b');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 96px sans-serif'; g.fillText(kind, w / 2, h / 2 - 30);
      g.font = '40px sans-serif'; g.fillStyle = '#ffd24a'; g.fillText('3D SEAT VIEW SIMULATOR', w / 2, h / 2 + 70);
    }
  });
}

function labelSprite(text, color) {
  const tex = canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = 'rgba(10,12,18,0.82)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill();
    g.strokeStyle = color; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${text.length > 4 ? 40 : 54}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(6.4, 2.4, 1);
  return sp;
}

// ── 경기장 생성 ───────────────────────────────────────
export function buildStadium(scene, { fieldTexSize = 4096 } = {}) {
  const root = new THREE.Group(); scene.add(root);
  const concrete = new THREE.MeshLambertMaterial({ color: 0xa9adb3, side: THREE.DoubleSide });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2f36, side: THREE.DoubleSide });
  const pad = new THREE.MeshLambertMaterial({ color: 0x1f4a8a, side: THREE.DoubleSide });
  const glass = new THREE.MeshBasicMaterial({ color: 0x3e5f86, side: THREE.DoubleSide });

  // 파울 폴 위치: 파울라인과 경계의 교점
  const polePts = [1, -1].map((sx) => {
    let r = 60; const v = new THREE.Vector3();
    for (; r < 130; r += 0.1) { v.set(sx * r * Math.SQRT1_2, 0, -r * Math.SQRT1_2); if (Math.hypot(v.x, v.z - CZ) >= R0(Math.atan2(v.x, -(v.z - CZ)) / D2R)) break; }
    return v.clone();
  });

  // 그라운드
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD, FIELD), new THREE.MeshBasicMaterial({ map: fieldTexture(fieldTexSize, polePts), toneMapped: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, CZ); root.add(ground);

  // 펜스 / 내야 벽
  const fenceH = (phi) => 1.0 + (SPEC.fenceHeight - 1.0) * (1 - smooth(71, 77, Math.abs(wrap180(phi))));
  let pos = []; sweep(pos, 0, 360, [[0, 0], [0, fenceH], [0.3, fenceH]], 1); root.add(meshFrom(pos, pad));
  pos = []; sweep(pos, -70, 70, [[-0.02, 3.85], [-0.02, 4.0]], 1); root.add(meshFrom(pos, new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide })));

  // 스탠드(계단식)
  const cPos = [], dPos = [];
  const tierInfo = {};
  for (const t of TIERS) {
    const front = t.d0 + (t.ground && t.parapet === 0 ? 0 : 0.2), r0 = front + 0.55;
    const prof = [];
    if (t.ground) prof.push([t.d0, t.id === 'IN1' ? 1.0 : t.y0]);
    else prof.push([t.d0, t.y0 - 1.3]);
    if (t.parapet) prof.push([t.d0, t.y0 + t.parapet], [front, t.y0 + t.parapet]);
    prof.push([front, t.y0]);
    for (let k = 0; k < t.rows; k++) {
      const y = t.y0 + k * t.rise, d1 = r0 + (k + 1) * t.depth;
      prof.push([d1, y]); if (k < t.rows - 1) prof.push([d1, y + t.rise]);
    }
    const dEnd = r0 + t.rows * t.depth, yEnd = t.y0 + (t.rows - 1) * t.rise;
    prof.push([dEnd + 1.2, yEnd], [dEnd + 1.2, yEnd + 2.6]);
    sweep(cPos, t.a, t.b, prof);
    if (!t.ground) sweep(dPos, t.a, t.b, [[t.d0, t.y0 - 1.3], [dEnd + 1.2, yEnd - 1.2]]);
    // 양 끝 마감벽
    tierInfo[t.id] = { r0, dEnd, yEnd };
  }
  // 층 사이 벽: 스카이박스 띠(내야 2층 뒤), 콘코스 벽
  const i2 = tierInfo.IN2, i3 = tierInfo.IN3, i4 = tierInfo.IN4, o2 = tierInfo.OF2, o4 = tierInfo.OF4;
  sweep(dPos, 78, 282, [[i2.dEnd + 1.2, i2.yEnd + 2.6], [i2.dEnd + 1.2, 10.9]]);
  sweep(dPos, 78, 282, [[i3.dEnd + 1.2, i3.yEnd + 2.6], [i3.dEnd + 1.2, 15.9]]);
  sweep(dPos, -70, 70, [[o2.dEnd + 1.2, o2.yEnd + 2.6], [o2.dEnd + 1.2, 11.3]]);
  sweep(cPos, 78, 282, [[i4.dEnd + 1.2, i4.yEnd + 2.6], [(p) => Dout(p), i4.yEnd + 2.6]]);
  sweep(cPos, -70, 70, [[o4.dEnd + 1.2, o4.yEnd + 2.6], [(p) => Dout(p), o4.yEnd + 2.6]]);
  // 연결통로(폴 부근) 벽
  for (const [a, b] of [[70, 78], [282, 290]]) sweep(dPos, a, b, [[0.3, fenceH], [0.3, 9], [6, 9], [6, 20], [(p) => Dout(p), 20]]);
  root.add(meshFrom(cPos, concrete), meshFrom(dPos, dark));
  // 스카이박스 유리
  pos = []; sweep(pos, 120, 240, [[i2.dEnd + 1.15, i2.yEnd + 2.8], [i2.dEnd + 1.15, 10.6]]);
  root.add(meshFrom(pos, glass));
  // 더그아웃
  pos = []; for (const [a, b] of [[122, 142], [218, 238]]) sweep(pos, a, b, [[-0.06, 0.02], [-0.06, 0.95]]);
  root.add(meshFrom(pos, new THREE.MeshBasicMaterial({ color: 0x0b0d10, side: THREE.DoubleSide })));

  // 외벽 + 지붕 (안쪽 면만 렌더 → 밖에서는 내부가 들여다보임)
  const shellMat = new THREE.MeshLambertMaterial({ color: 0x7c8088, side: THREE.DoubleSide });
  pos = []; sweep(pos, 0, 360, [[(p) => Dout(p), 0], [(p) => Dout(p), (p) => Ywall(p)]], 2);
  const wall = meshFrom(pos, shellMat); root.add(wall);
  const roofTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#dfe5ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(40, 40, w - 80, h - 80);
    g.strokeStyle = '#59616b'; g.lineWidth = 22; g.strokeRect(0, 0, w, h);
    g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  });
  roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping;
  const rp = [], ruv = [], NA = 96, NT = 16, H = SPEC.roofHeight;
  const rv = (i, j) => {
    const phi = (i / NA) * 360, t = j / NT, R = t * (R0(phi) + Dout(phi)), yw = Ywall(phi);
    rp.push(R * Math.sin(phi * D2R), yw + (H - yw) * (1 - t * t), CZ - R * Math.cos(phi * D2R)); ruv.push(i / 3, j);
  };
  for (let i = 0; i < NA; i++) for (let j = 0; j < NT; j++) { rv(i, j); rv(i + 1, j); rv(i + 1, j + 1); rv(i, j); rv(i + 1, j + 1); rv(i, j + 1); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  const roof = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: roofTex, side: THREE.DoubleSide, color: 0xd8dde2 }));
  root.add(roof);

  // 폴, 베이스, 선수
  const poleMat = new THREE.MeshBasicMaterial({ color: 0xffd400 });
  for (const p of polePts) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 22, 8), poleMat); m.position.set(p.x, 11, p.z); root.add(m); }
  const b = SPEC.base / Math.SQRT2, white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const [x, z] of [[b, -b], [0, -2 * b], [-b, -b]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), white); m.position.set(x, 0.04, z); m.rotation.y = Math.PI / 4; root.add(m); }
  const players = new THREE.Group(); root.add(players);
  const mkP = (x, z, c) => {
    const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color: c });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.75, 3, 8), mat); body.position.y = 1.05;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.8, 8), new THREE.MeshLambertMaterial({ toneMapped: false })); legs.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshLambertMaterial({ color: 0x222222 })); head.position.y = 1.72;
    g.add(body, legs, head); g.position.set(x, 0, z); players.add(g);
  };
  const HOME = 0xf2f2f2, AWAY = 0x6d1530;
  [[0, -SPEC.mound], [0, 1.2], [b + 1.5, -b - 5], [9, -40], [-10, -40], [-b - 1.5, -b - 5], [-48, -62], [0, -92], [48, -62]].forEach(([x, z]) => mkP(x, z, HOME));
  mkP(-0.9, -0.2, AWAY); mkP(b - 2.5, -b - 2.5, AWAY); mkP(0.3, 2.3, 0x1b1b1b);

  // 전광판
  const mkBoard = (phi, d, y, spec, kind) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), new THREE.MeshBasicMaterial({ map: boardTexture(kind) }));
    P(phi, d, y, m.position); m.lookAt(0, y - 6, CZ * 0.6); root.add(m);
    const f = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 1, spec.h + 1, 0.6), dark); f.position.copy(m.position); f.quaternion.copy(m.quaternion); f.translateZ(-0.4); root.add(f);
  };
  mkBoard(0, o4.dEnd + 0.6, 26.5, SPEC.mainBoard, 'main');
  mkBoard(74, 10, 25, SPEC.twinBoard, 'HOME');
  mkBoard(-74, 10, 25, SPEC.twinBoard, 'AWAY');

  // ── 좌석 ──
  const seatGeo = (() => {
    const mk = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g.toNonIndexed(); };
    const parts = [mk(0.46, 0.07, 0.42, 0, 0.42, -0.02), mk(0.46, 0.5, 0.07, 0, 0.66, 0.2), mk(0.3, 0.38, 0.06, 0, 0.19, 0.16)];
    const g = new THREE.BufferGeometry(), p = [], n = [];
    for (const q of parts) { p.push(...q.attributes.position.array); n.push(...q.attributes.normal.array); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    return g;
  })();
  const seatMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const tierById = Object.fromEntries(TIERS.map((t) => [t.id, t]));
  const sections = buildSections();
  const seatGroup = new THREE.Group(), labels = new THREE.Group(); root.add(seatGroup, labels);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
  let total = 0;
  for (const s of sections) {
    const t = tierById[s.tier], info = tierInfo[t.id];
    s.floor = t.floor; s.zone = t.zone; s.g = GRADES[s.grade];
    const rFrom = s.rowFrom || 0, rTo = s.rowTo || t.rows, pitch = s.pitch || 0.53, aisle = 1.3;
    s.seats = []; s.rowCount = rTo - rFrom;
    const dug = t.id === 'IN1' && ((s.a < 142 && s.b > 122) || (s.a < 238 && s.b > 218));
    for (let k = rFrom; k < rTo; k++) {
      if (dug && k < 2) continue;                    // 더그아웃 지붕 위 2열 제외
      const d = info.r0 + k * t.depth + t.depth * 0.55, y = t.y0 + k * t.rise;
      const Rm = R0((s.a + s.b) / 2) + d, arc = Rm * (s.b - s.a) * D2R - aisle;
      const n = Math.max(1, Math.floor(arc / pitch)), dphi = (pitch / Rm) / D2R;
      const row = [];
      for (let i = 0; i < n; i++) {
        const phi = (s.a + s.b) / 2 + (i - (n - 1) / 2) * dphi;
        P(phi, d, y, V);
        row.push({ row: k - rFrom + 1, num: i + 1, x: V.x, y: V.y, z: V.z, phi });
      }
      s.seats.push(...row);
    }
    const mesh = new THREE.InstancedMesh(seatGeo, seatMat, s.seats.length);
    const col = new THREE.Color(s.g.color);
    s.seats.forEach((st, i) => {
      Q.setFromAxisAngle(UP, Math.PI - st.phi * D2R);
      M.compose(V.set(st.x, st.y, st.z), Q, ONE); mesh.setMatrixAt(i, M); mesh.setColorAt(i, col);
    });
    mesh.userData.section = s; s.mesh = mesh; s.color = col; seatGroup.add(mesh);
    mesh.computeBoundingSphere(); mesh.computeBoundingBox();
    // 구역 중심 / 라벨
    const midRow = (rFrom + rTo) / 2, dm = info.r0 + midRow * t.depth, ym = t.y0 + midRow * t.rise;
    s.center = P((s.a + s.b) / 2, dm, ym).clone();
    s.inward = new THREE.Vector3(-Math.sin(((s.a + s.b) / 2) * D2R), 0, Math.cos(((s.a + s.b) / 2) * D2R));
    const lb = labelSprite(s.id, s.g.color); lb.position.copy(s.center).add(new THREE.Vector3(0, 2.6, 0)); lb.userData.section = s;
    s.label = lb; labels.add(lb);
    total += s.seats.length;
  }
  return { root, sections, labels, roof, wall, players, total, polePts };
}
