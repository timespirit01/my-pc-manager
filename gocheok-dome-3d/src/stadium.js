import * as THREE from 'three';
import { SPEC, GRADES, TIERS, buildSections } from './data.js';

const D2R = Math.PI / 180;
const CZ = SPEC.centerZ;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap180 = (p) => ((p + 180) % 360 + 360) % 360 - 180;
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

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
const inW = (phi) => smooth(62, 76, Math.abs(wrap180(phi)));      // 0=외야, 1=내야
const Dout = (phi) => 21 + (32 - 21) * inW(phi);                  // 외벽 위치
const Ywall = () => 31;                                           // 외벽(지붕 시작) 높이

export function P(phi, d, y, out = new THREE.Vector3()) {
  const R = R0(phi) + d, p = phi * D2R;
  return out.set(R * Math.sin(p), y, CZ - R * Math.cos(p));
}

// 단면(profile)을 φ 방향으로 쓸어 만든 리본 메시. uv: u=둘레 길이(m), v=단면 길이(m)/vScale
const val = (v, phi) => (typeof v === 'function' ? v(phi) : v);
const buf = () => ({ pos: [], uv: [] });
function sweep(b, a, e, profile, { step = 1.5, vScale = 1, uScale = 1 } = {}) {
  const n = Math.max(1, Math.ceil((e - a) / step));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p0 = a + ((e - a) * i) / n, p1 = a + ((e - a) * (i + 1)) / n, u0 = (p0 * 1.27) / uScale, u1 = (p1 * 1.27) / uScale;
    let v0 = 0;
    for (let j = 0; j < profile.length - 1; j++) {
      const [d0, y0] = profile[j], [d1, y1] = profile[j + 1];
      const v1 = v0 + Math.hypot(val(d1, p0) - val(d0, p0), val(y1, p0) - val(y0, p0)) / vScale;
      P(p0, val(d0, p0), val(y0, p0), A); P(p1, val(d0, p1), val(y0, p1), B);
      P(p1, val(d1, p1), val(y1, p1), C); P(p0, val(d1, p0), val(y1, p0), D);
      b.pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z);
      b.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      v0 = v1;
    }
  }
}
function meshFrom(b, mat, { cast = false, receive = true } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
// 여러 지오메트리를 정점 색과 함께 하나로 합침
function merge(parts) {
  const p = [], n = [], c = [];
  for (const [geo, col] of parts) {
    const q = geo.index ? geo.toNonIndexed() : geo, k = new THREE.Color(col);
    p.push(...q.attributes.position.array); n.push(...q.attributes.normal.array);
    for (let i = 0; i < q.attributes.position.count; i++) c.push(k.r, k.g, k.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}
const box = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return g; };

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(g, w, h, amt, seed = 7) {
  const img = g.getImageData(0, 0, w, h), d = img.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) { const k = 1 + (r() - 0.5) * amt; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  g.putImageData(img, 0, 0);
}

// ── 그라운드 텍스처 ─────────────────────────────────────
const FIELD = 300;
function fieldTexture(size, polePts) {
  return canvasTex(size, size, (g) => {
    const s = size / FIELD, X = (x) => (x + FIELD / 2) * s, Z = (z) => (z - CZ + FIELD / 2) * s;
    g.fillStyle = '#356f33'; g.fillRect(0, 0, size, size);
    // 잔디 결(교차 줄무늬)
    g.save(); g.translate(X(0), Z(0)); g.rotate(Math.PI / 4);
    for (let i = -40; i < 40; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.04)'; g.fillRect(i * 5 * s, -220 * s, 5 * s, 440 * s);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'; g.fillRect(-220 * s, i * 5 * s, 440 * s, 5 * s);
    }
    g.restore();
    const path = () => { g.beginPath(); for (let i = 0; i <= N; i++) { const p = P((i / N) * 360, 0, 0); i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z)); } g.closePath(); };
    const dirt = '#9c6a44';
    path(); g.strokeStyle = dirt; g.lineWidth = 9 * s; g.stroke();   // 워닝트랙
    g.save(); g.beginPath(); g.moveTo(X(0), Z(3)); g.lineTo(X(60), Z(-57)); g.lineTo(X(-60), Z(-57)); g.closePath(); g.clip();
    g.fillStyle = dirt; g.beginPath(); g.arc(X(0), Z(-SPEC.mound), 29 * s, 0, 7); g.fill(); g.restore();
    const b = SPEC.base / Math.SQRT2;
    g.fillStyle = '#3a7a37'; g.beginPath(); g.moveTo(X(0), Z(-2.4)); g.lineTo(X(b - 1.7), Z(-b)); g.lineTo(X(0), Z(-2 * b + 2.4)); g.lineTo(X(-b + 1.7), Z(-b)); g.closePath(); g.fill();
    g.fillStyle = dirt;
    g.beginPath(); g.arc(X(0), Z(0), 4 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(X(0), Z(-SPEC.mound), 2.74 * s, 0, 7); g.fill();
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(X(sx * 11), Z(4), 0.9 * s, 0, 7); g.fill(); }   // 대기 타석
    noise(g, size, size, 0.22);
    // 라인
    g.strokeStyle = '#f2f2ee'; g.lineWidth = Math.max(1.5, 0.12 * s); g.lineCap = 'butt';
    for (const p of polePts) { g.beginPath(); g.moveTo(X(0), Z(0)); g.lineTo(X(p.x), Z(p.z)); g.stroke(); }
    for (const sx of [-1, 1]) g.strokeRect(X(sx * 0.76 - 0.61), Z(-0.9), 1.22 * s, 1.83 * s);
    g.strokeRect(X(-0.55), Z(0.2), 1.1 * s, 2.0 * s);
    for (const sx of [-1, 1]) g.strokeRect(X(sx * 14 - 1.5), Z(-12), 3 * s, 6 * s);                    // 코치 박스
    g.fillStyle = '#f2f2ee';
    g.fillRect(X(-0.3), Z(-SPEC.mound) - 0.08 * s, 0.6 * s, 0.16 * s);
    g.beginPath(); g.moveTo(X(-0.22), Z(-0.43)); g.lineTo(X(0.22), Z(-0.43)); g.lineTo(X(0.22), Z(-0.2)); g.lineTo(X(0), Z(0)); g.lineTo(X(-0.22), Z(-0.2)); g.fill();
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
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#7a1634'); gr.addColorStop(1, '#1b070e');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 110px sans-serif'; g.fillText(kind === 'HOME' ? '7회말 · 2사 1루' : 'HOME 6 : 3 AWAY', w / 2, h / 2 - 40);
      g.font = '46px sans-serif'; g.fillStyle = '#ffd24a'; g.fillText(kind === 'HOME' ? '타자 4번 · 타율 0.312' : '투구수 87 · 148km/h', w / 2, h / 2 + 80);
    }
  });
}
// 펜스·벽 광고판 (가상의 문구)
function adTexture(base, words, pxH = 128) {
  return canvasTex(2048, pxH, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const n = words.length, cw = w / n;
    words.forEach(([txt, bg, fg], i) => {
      g.fillStyle = bg; g.fillRect(i * cw + 6, h * 0.12, cw - 12, h * 0.76);
      g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.42)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, i * cw + cw / 2, h / 2 + 2, cw - 30);
    });
    noise(g, w, h, 0.08, 3);
  }, [1, 1]);
}

function labelSprite(text, color) {
  const tex = canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = 'rgba(10,12,18,0.82)'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 26); g.fill();
    g.strokeStyle = color; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff'; g.font = `bold ${text.length > 4 ? 40 : 54}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
  sp.scale.set(6.4, 2.4, 1);
  return sp;
}

// ── 선수 모델 ─────────────────────────────────────────
function makePlayer(jersey, pants, { crouch = 0, bat = false, cap = 0x7a1634 } = {}) {
  const g = new THREE.Group(), M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
  const leg = new THREE.CylinderGeometry(0.085, 0.07, 0.86, 8), mp = M(pants), mj = M(jersey), skin = M(0xd9a47c), dark = M(0x16181c);
  const hip = 0.88 - crouch * 0.3;
  for (const sx of [-1, 1]) {
    add(leg, mp, sx * (0.13 + crouch * 0.12), hip / 2, 0, 0, sx * (0.06 + crouch * 0.25));
    add(new THREE.BoxGeometry(0.11, 0.07, 0.27), dark, sx * (0.16 + crouch * 0.2), 0.035, -0.05);
    add(new THREE.CylinderGeometry(0.05, 0.045, 0.62, 6), mj, sx * 0.25, hip + 0.33, -0.05 - crouch * 0.1, -0.25 - crouch * 0.5, sx * 0.18);
  }
  const torso = add(new THREE.CylinderGeometry(0.21, 0.17, 0.62, 10), mj, 0, hip + 0.3, -crouch * 0.08, -crouch * 0.35); torso.scale.z = 0.7;
  add(new THREE.SphereGeometry(0.11, 12, 10), skin, 0, hip + 0.74, -crouch * 0.2);
  add(new THREE.SphereGeometry(0.118, 12, 8, 0, 7, 0, 1.5), M(cap), 0, hip + 0.76, -crouch * 0.2);
  add(new THREE.BoxGeometry(0.16, 0.02, 0.13), M(cap), 0, hip + 0.78, -0.12 - crouch * 0.2);
  if (bat) add(new THREE.CylinderGeometry(0.032, 0.018, 0.86, 8), M(0xb98952, 0.5), 0.2, hip + 0.82, 0.12, 0.5, -0.5);
  return g;
}

// ── 경기장 생성 ───────────────────────────────────────
export function buildStadium(scene, { fieldTexSize = 4096, lite = false } = {}) {
  const root = new THREE.Group(); scene.add(root);
  const concTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c4c6c8'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.16, 11); }, [0.4, 0.4]);
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb4b7ba, map: concTex, roughness: 0.95, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.9, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x20364f, roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide });

  // 파울 폴 위치: 파울라인과 경계의 교점
  const polePts = [1, -1].map((sx) => {
    let r = 60; const v = new THREE.Vector3();
    for (; r < 130; r += 0.1) { v.set(sx * r * Math.SQRT1_2, 0, -r * Math.SQRT1_2); if (Math.hypot(v.x, v.z - CZ) >= R0(Math.atan2(v.x, -(v.z - CZ)) / D2R)) break; }
    return v.clone();
  });

  // 그라운드 (경계 모양 그대로)
  {
    const p = [], uv = [], put = (x, z) => { p.push(x, 0, z); uv.push((x + FIELD / 2) / FIELD, 1 - (z - CZ + FIELD / 2) / FIELD); };
    for (let i = 0; i < N; i++) { const a = P((i / N) * 360, 0.4, 0), c = P(((i + 1) / N) * 360, 0.4, 0); put(0, CZ); put(c.x, c.z); put(a.x, a.z); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: fieldTexture(fieldTexSize, polePts), roughness: 1 }));
    ground.receiveShadow = true; root.add(ground);
    const b0 = buf(); sweep(b0, 0, 360, [[0.3, -0.05], [(q) => Dout(q) + 1, -0.05]], { step: 3 });
    root.add(meshFrom(b0, dark));
  }

  // 펜스 / 내야 벽 + 광고
  const fenceH = (phi) => 1.0 + (SPEC.fenceHeight - 1.0) * (1 - smooth(71, 77, Math.abs(wrap180(phi))));
  const G = '#17402a', NV = '#14254a';
  const ofAds = adTexture(G, [['SKY DOME', G, '#fff'], ['SEOUL', '#fff', '#17402a'], ['BASEBALL', G, '#ffd24a'], ['GOCHEOK', '#c8102e', '#fff'], ['PLAY BALL', G, '#fff'], ['DOME', '#0b3d91', '#fff']], 256);
  const inAds = adTexture(NV, [['GOCHEOK SKY DOME', NV, '#fff'], ['SEOUL', '#fff', '#14254a'], ['PLAY BALL', NV, '#ffd24a'], ['BASEBALL', '#c8102e', '#fff']], 96);
  const padM = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, side: THREE.DoubleSide });
  let b = buf(); sweep(b, -71, 71, [[0, 0], [0, 4]], { step: 1, vScale: 4, uScale: 60 }); root.add(meshFrom(b, padM(ofAds)));
  b = buf(); sweep(b, 77, 283, [[0, 0], [0, 1]], { step: 1, vScale: 1, uScale: 36 }); root.add(meshFrom(b, padM(inAds)));
  b = buf(); for (const [a, e] of [[71, 77], [283, 289]]) sweep(b, a, e, [[0, 0], [0, fenceH]], { step: 1 });
  sweep(b, 0, 360, [[0, fenceH], [0.3, fenceH]], { step: 1 });
  root.add(meshFrom(b, new THREE.MeshStandardMaterial({ color: 0x14254a, roughness: 0.8, side: THREE.DoubleSide })));
  b = buf(); sweep(b, -71, 71, [[-0.02, 3.82], [-0.02, 4.0]], { step: 1 });
  root.add(meshFrom(b, new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6, side: THREE.DoubleSide })));

  // 스탠드(계단식)
  const cB = buf(), dB = buf(), rail = buf(), led = buf();
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
    sweep(cB, t.a, t.b, prof);
    if (!t.ground) {
      sweep(dB, t.a, t.b, [[t.d0, t.y0 - 1.3], [dEnd + 1.2, yEnd - 1.2]]);
      sweep(led, t.a, t.b, [[t.d0 - 0.04, t.y0 - 1.15], [t.d0 - 0.04, t.y0 - 0.25]], { vScale: 0.9, uScale: 48 });   // 띠 전광판
    }
    if (t.parapet) sweep(rail, t.a, t.b, [[t.d0 + 0.06, t.y0 + t.parapet + 0.28], [t.d0 + 0.06, t.y0 + t.parapet + 0.33], [t.d0 + 0.12, t.y0 + t.parapet + 0.33]]);   // 난간 손잡이
    sweep(rail, t.a, t.b, [[dEnd + 0.25, yEnd + 1.0], [dEnd + 0.25, yEnd + 1.05], [dEnd + 0.31, yEnd + 1.05]]);
    tierInfo[t.id] = { r0, dEnd, yEnd };
  }
  // 층 사이 벽: 스카이박스 띠(내야 2층 뒤), 콘코스 벽
  const i2 = tierInfo.IN2, i3 = tierInfo.IN3, i4 = tierInfo.IN4, o2 = tierInfo.OF2, o4 = tierInfo.OF4;
  sweep(dB, 78, 282, [[i2.dEnd + 1.2, i2.yEnd + 2.6], [i2.dEnd + 1.2, 10.9]]);
  sweep(dB, 78, 282, [[i3.dEnd + 1.2, i3.yEnd + 2.6], [i3.dEnd + 1.2, 15.9]]);
  sweep(dB, -70, 70, [[o2.dEnd + 1.2, o2.yEnd + 2.6], [o2.dEnd + 1.2, 11.3]]);
  sweep(cB, 78, 282, [[i4.dEnd + 1.2, i4.yEnd + 2.6], [(p) => Dout(p), i4.yEnd + 2.6]]);
  sweep(cB, -70, 70, [[o4.dEnd + 1.2, o4.yEnd + 2.6], [(p) => Dout(p), o4.yEnd + 2.6]]);
  for (const [a, e] of [[70, 78], [282, 290]]) sweep(dB, a, e, [[0.3, fenceH], [0.3, 9], [6, 9], [6, 20], [(p) => Dout(p), 20]]);
  root.add(meshFrom(cB, concrete, { cast: true }), meshFrom(dB, dark, { cast: true }), meshFrom(rail, steel));
  const ledTex = canvasTex(2048, 64, (g, w, h) => {
    g.fillStyle = '#080a10'; g.fillRect(0, 0, w, h); g.font = 'bold 40px sans-serif'; g.textBaseline = 'middle';
    const items = [['GOCHEOK SKY DOME', '#ffd24a'], ['HOME 6 : 3 AWAY', '#ffffff'], ['PLAY BALL', '#ff5c7a'], ['SEOUL', '#7ec8ff'], ['7회말', '#9dff9d']];
    let x = 30; for (let i = 0; i < 9; i++) { const [t, c] = items[i % items.length]; g.fillStyle = c; g.fillText(t, x, h / 2 + 2); x += g.measureText(t).width + 70; }
  }, [1, 1]);
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.DoubleSide }); ledMat.color.setScalar(1.7);
  root.add(meshFrom(led, ledMat, { receive: false }));
  // 스카이박스 유리
  b = buf(); sweep(b, 120, 240, [[i2.dEnd + 1.15, i2.yEnd + 2.8], [i2.dEnd + 1.15, 10.6]]);
  root.add(meshFrom(b, glass));
  // 더그아웃 (어두운 개구부 + 지붕)
  b = buf(); for (const [a, e] of [[122, 142], [218, 238]]) sweep(b, a, e, [[-0.06, 0.02], [-0.06, 0.95]]);
  root.add(meshFrom(b, new THREE.MeshBasicMaterial({ color: 0x050607, side: THREE.DoubleSide }), { receive: false }));
  b = buf(); for (const [a, e] of [[122, 142], [218, 238]]) sweep(b, a, e, [[-1.4, 1.25], [0.05, 1.05], [0.05, 0.98], [-1.4, 1.18]]);
  root.add(meshFrom(b, dark, { cast: true }));

  // 그물망(백스톱~더그아웃 끝) : 미세 격자 텍스처
  const netTex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(20,22,24,1)'; g.lineWidth = 5; g.strokeRect(0, 0, w, h); }, [1, 1]);
  netTex.colorSpace = THREE.SRGBColorSpace;
  b = buf(); sweep(b, 112, 248, [[0.12, 1.0], [0.12, 11]], { step: 1, vScale: 0.06, uScale: 0.06 });
  const net = meshFrom(b, new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }), { receive: false });
  net.renderOrder = 5; root.add(net);
  const postG = new THREE.CylinderGeometry(0.07, 0.07, 10, 8);
  for (let a = 112; a <= 248; a += 17) { const m = new THREE.Mesh(postG, steel); P(a, 0.12, 6, m.position); root.add(m); }
  b = buf(); sweep(b, 112, 248, [[0.1, 10.95], [0.1, 11.05], [0.16, 11.05]]); root.add(meshFrom(b, steel));

  // 외벽 + 지붕
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x6f747b, roughness: 0.9, side: THREE.DoubleSide });
  b = buf(); sweep(b, 0, 360, [[(p) => Dout(p), 0], [(p) => Dout(p), (p) => Ywall(p)]], { step: 2 });
  const wall = meshFrom(b, shellMat); root.add(wall);
  const roofTex = canvasTex(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.7); gr.addColorStop(0, '#f6f8fa'); gr.addColorStop(1, '#cfd6dc');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7b848d'; g.lineWidth = 26; g.strokeRect(0, 0, w, h);          // 주 트러스
    g.strokeStyle = '#e9edf0'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110,120,130,0.55)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    noise(g, w, h, 0.05, 5);
  }, [1, 1]);
  const rp = [], ruv = [], rc = [], NA = 96, NT = 18, H = SPEC.roofHeight;
  const rv = (i, j) => {
    const phi = (i / NA) * 360, t = j / NT, R = t * (R0(phi) + Dout(phi)), yw = Ywall(phi);
    rp.push(R * Math.sin(phi * D2R), yw + (H - yw) * (1 - t * t), CZ - R * Math.cos(phi * D2R)); ruv.push(i / 3, j);
    const k = 0.72 + 0.42 * (1 - t * t); rc.push(k, k, k * 1.02);                    // 중앙이 더 밝게 비치는 막
  };
  for (let i = 0; i < NA; i++) for (let j = 0; j < NT; j++) { rv(i, j); rv(i + 1, j); rv(i + 1, j + 1); rv(i, j); rv(i + 1, j + 1); rv(i, j + 1); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  const roof = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: roofTex, side: THREE.DoubleSide, vertexColors: true, fog: false }));
  root.add(roof);

  // 조명 뱅크(지붕 아래 링) — 발광체, 블룸으로 번짐
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }); lampMat.color.setRGB(7, 6.8, 6.2);
  const rigMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6, metalness: 0.5 });
  const lamps = [], rigs = [], Mx = new THREE.Matrix4(), O = new THREE.Object3D();
  for (const [t, stepA, off] of [[0.74, 9, 0], [0.5, 15, 7]]) for (let a = off; a < 360; a += stepA) {
    const R = t * (R0(a) + Dout(a)), y = 31 + (H - 31) * (1 - t * t) - 2.2;
    O.position.set(R * Math.sin(a * D2R), y, CZ - R * Math.cos(a * D2R)); O.lookAt(0, 0, CZ * 0.9); O.updateMatrix();
    lamps.push(O.matrix.clone()); rigs.push(O.matrix.clone());
  }
  const lampI = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 0.9).translate(0, 0, 0.26), lampMat, lamps.length);
  const rigI = new THREE.InstancedMesh(new THREE.BoxGeometry(3.8, 1.3, 0.5), rigMat, rigs.length);
  lamps.forEach((m, i) => { lampI.setMatrixAt(i, m); rigI.setMatrixAt(i, m); });
  const shell = new THREE.Group(); shell.add(lampI, rigI); root.add(shell);

  // 폴, 베이스, 선수
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 });
  for (const p of polePts) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 22, 8), poleMat); m.position.set(p.x, 11, p.z); m.castShadow = true; root.add(m); }
  const bs = SPEC.base / Math.SQRT2, white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 });
  for (const [x, z] of [[bs, -bs], [0, -2 * bs], [-bs, -bs]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), white); m.position.set(x, 0.04, z); m.rotation.y = Math.PI / 4; m.receiveShadow = true; root.add(m); }
  const players = new THREE.Group(); root.add(players);
  const put = (x, z, look, pl) => { pl.position.set(x, 0, z); pl.lookAt(look[0], 0, look[1]); pl.rotateY(Math.PI); players.add(pl); };
  const HW = 0xf3f3f0, AW = 0x6d1530, HC = 0x7a1634, AC = 0x1b2a55, home = [0, 0];
  put(0, -SPEC.mound, home, makePlayer(HW, HW, { cap: HC }));
  put(0, 1.3, [0, -18], makePlayer(HW, HW, { crouch: 1, cap: HC }));
  [[bs + 1.5, -bs - 5], [9, -40], [-10, -40], [-bs - 1.5, -bs - 5], [-48, -62], [0, -92], [48, -62]].forEach(([x, z]) => put(x, z, home, makePlayer(HW, HW, { crouch: 0.45, cap: HC })));
  put(-0.95, -0.15, [3, -0.15], makePlayer(AW, 0xbfc3c8, { bat: true, cap: AC, crouch: 0.25 }));
  put(bs - 2.6, -bs - 2.4, [0, -40], makePlayer(AW, 0xbfc3c8, { cap: AC, crouch: 0.3 }));
  put(0.2, 2.5, [0, -18], makePlayer(0x15171b, 0x3a3d44, { crouch: 0.5, cap: 0x15171b }));
  for (const [x, z] of [[bs + 3, -bs + 3], [-bs - 3, -bs + 3], [2, -2 * bs - 4]]) put(x, z, home, makePlayer(0x15171b, 0x3a3d44, { cap: 0x15171b }));
  for (const [x, z] of [[14, -9], [-14, -9]]) put(x, z, home, makePlayer(AW, 0xbfc3c8, { cap: AC }));
  put(-11, 4, home, makePlayer(AW, 0xbfc3c8, { bat: true, cap: AC }));

  // 전광판
  const mkBoard = (phi, d, y, spec, kind) => {
    const mat = new THREE.MeshBasicMaterial({ map: boardTexture(kind), fog: false }); mat.color.setScalar(kind === 'main' ? 1.15 : 1.4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), mat);
    P(phi, d, y, m.position); m.lookAt(0, y - 6, CZ * 0.6); root.add(m);
    const f = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 1, spec.h + 1, 0.6), dark); f.position.copy(m.position); f.quaternion.copy(m.quaternion); f.translateZ(-0.4); root.add(f);
  };
  mkBoard(0, o4.dEnd + 0.6, 26.2, SPEC.mainBoard, 'main');
  mkBoard(74, 10, 25, SPEC.twinBoard, 'HOME');
  mkBoard(-74, 10, 25, SPEC.twinBoard, 'AWAY');

  // ── 좌석 (접이식: 등받이 + 접힌 좌판 + 브래킷) ──
  const seatGeo = merge([
    [box(0.45, 0.44, 0.045, 0, 0.66, 0.2, -0.14), '#ffffff'],
    [box(0.45, 0.4, 0.05, 0, 0.47, 0.1, -0.24), '#e9e9e9'],
    [box(0.035, 0.5, 0.26, -0.245, 0.4, 0.13), '#2b2b2b'],
    [box(0.035, 0.5, 0.26, 0.245, 0.4, 0.13), '#2b2b2b'],
    [box(0.05, 0.035, 0.3, -0.245, 0.66, 0.08), '#1c1c1c'],
    [box(0.05, 0.035, 0.3, 0.245, 0.66, 0.08), '#1c1c1c'],
  ]);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.0, vertexColors: true, envMapIntensity: 0.6 });
  // 관중
  const bodyGeo = (() => {
    const torso = new THREE.CylinderGeometry(0.175, 0.15, 0.52, 8); torso.scale(1.2, 1, 0.78); torso.translate(0, 0.74, 0.06);
    const arms = [-1, 1].map((sx) => { const a = new THREE.CylinderGeometry(0.05, 0.045, 0.5, 5); a.rotateX(-0.5); a.translate(sx * 0.24, 0.72, -0.06); return a; });
    return merge([[torso, '#ffffff'], [arms[0], '#f2f2f2'], [arms[1], '#f2f2f2'], [box(0.36, 0.14, 0.44, 0, 0.5, -0.16), '#3a3a40'], [box(0.32, 0.46, 0.13, 0, 0.26, -0.38), '#34343a']]);
  })();
  const headGeo = (() => {
    const h = new THREE.SphereGeometry(0.1, 9, 7); h.translate(0, 1.11, 0.03);
    const hair = new THREE.SphereGeometry(0.107, 10, 6, 0, 7, 0, 1.75); hair.rotateX(0.85); hair.translate(0, 1.112, 0.036);   // 뒤통수까지 덮는 머리
    return merge([[h, '#ffffff'], [hair, '#2a211c']]);
  })();
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
  const headMat = new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true });
  const SHIRTS = ['#f2f2f2', '#f2f2f2', '#e8e8e8', '#7a1634', '#7a1634', '#8c1c3c', '#1b1d22', '#2a2d35', '#44506b', '#7d8693', '#b9b3a6', '#31506f', '#a33b2e', '#d7c9a0', '#56705a'];
  const SKIN = ['#e8b998', '#dba882', '#cf9a74', '#f0c8aa'];

  const tierById = Object.fromEntries(TIERS.map((t) => [t.id, t]));
  const sections = buildSections();
  const seatGroup = new THREE.Group(), labels = new THREE.Group(), crowd = new THREE.Group(); root.add(seatGroup, labels, crowd);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), SC = new THREE.Vector3();
  const rnd = rng(20261123), col = new THREE.Color();
  let total = 0, people = 0;
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
      for (let i = 0; i < n; i++) {
        const phi = (s.a + s.b) / 2 + (i - (n - 1) / 2) * dphi;
        P(phi, d, y, V);
        s.seats.push({ row: k - rFrom + 1, num: i + 1, x: V.x, y: V.y, z: V.z, phi, pi: -1 });
      }
    }
    const mesh = new THREE.InstancedMesh(seatGeo, seatMat, s.seats.length);
    s.color = new THREE.Color(s.g.color);
    const occ = (lite ? 0.38 : 0.62) * (t.floor <= 2 && t.zone === '내야' ? 1.2 : t.floor === 4 ? 0.8 : 1);
    const pm = [], pc = [], hc = [];
    s.seats.forEach((st, i) => {
      Q.setFromAxisAngle(UP, Math.PI - st.phi * D2R);
      M.compose(V.set(st.x, st.y, st.z), Q, ONE); mesh.setMatrixAt(i, M); mesh.setColorAt(i, s.color);
      if (rnd() < occ) {
        const k = 0.93 + rnd() * 0.13; Q.setFromAxisAngle(UP, Math.PI - st.phi * D2R + (rnd() - 0.5) * 0.3);
        st.pi = pm.length; pm.push(new THREE.Matrix4().compose(V, Q, SC.set(k, k, k)));
        pc.push(SHIRTS[Math.floor(rnd() * SHIRTS.length)]); hc.push(SKIN[Math.floor(rnd() * SKIN.length)]);
      }
    });
    mesh.castShadow = !lite; mesh.receiveShadow = true;
    mesh.userData.section = s; s.mesh = mesh; seatGroup.add(mesh);
    mesh.computeBoundingSphere(); mesh.computeBoundingBox();
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, pm.length), heads = new THREE.InstancedMesh(headGeo, headMat, pm.length);
    pm.forEach((m, i) => { bodies.setMatrixAt(i, m); heads.setMatrixAt(i, m); bodies.setColorAt(i, col.set(pc[i])); heads.setColorAt(i, col.set(hc[i])); });
    bodies.receiveShadow = heads.receiveShadow = true; bodies.computeBoundingSphere(); heads.computeBoundingSphere();
    s.people = { bodies, heads, mats: pm }; crowd.add(bodies, heads); people += pm.length;
    // 구역 중심 / 라벨
    const midRow = (rFrom + rTo) / 2, dm = info.r0 + midRow * t.depth, ym = t.y0 + midRow * t.rise;
    s.center = P((s.a + s.b) / 2, dm, ym).clone();
    s.inward = new THREE.Vector3(-Math.sin(((s.a + s.b) / 2) * D2R), 0, Math.cos(((s.a + s.b) / 2) * D2R));
    const lb = labelSprite(s.id, s.g.color); lb.position.copy(s.center).add(new THREE.Vector3(0, 2.6, 0)); lb.userData.section = s;
    s.label = lb; labels.add(lb);
    total += s.seats.length;
  }
  shell.add(roof, wall);
  return { root, sections, labels, roof, wall, shell, net, crowd, players, total, people, polePts, ledTex };
}
