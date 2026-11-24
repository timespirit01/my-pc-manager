// 청라돔: Blender 에서 내보낸 경기장(assets/stadium.glb)과 좌석 데이터(seats.bin, sections.json)를 불러와 장면을 만든다.
// 형상의 원천은 tools/blender/cheongna_geom.py · cheongna_mesh.py 이다 (이 파일은 불러와서 배치만 함).
// 좌표: three.js y-up, 홈플레이트 = 원점, 중견 = -z.  Blender (x, y, z) → three (x, z, -y)
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

const BASE = './assets/';
const D2R = Math.PI / 180;

function labelSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,12,18,0.82)'; g.beginPath(); g.roundRect(4, 4, 248, 88, 26); g.fill();
  g.strokeStyle = color; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#fff'; g.font = `bold ${text.length > 4 ? 40 : 54}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 51);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
  sp.scale.set(6.4, 2.4, 1);
  return sp;
}

export async function buildStadium(scene, { lite = false } = {}) {
  const loader = new GLTFLoader();
  const soft = (p) => p.catch((e) => { console.warn('[assets]', e?.message || e); return null; });
  const [gltf, meta, bin, hi, lo, pl] = await Promise.all([
    loader.loadAsync(BASE + 'stadium.glb'),
    fetch(BASE + 'sections.json').then((r) => r.json()),
    fetch(BASE + 'seats.bin').then((r) => r.arrayBuffer()),
    soft(loader.loadAsync(BASE + 'seat_hi.glb')), soft(loader.loadAsync(BASE + 'seat_lo.glb')), soft(loader.loadAsync(BASE + 'players.glb')),
  ]);
  const root = new THREE.Group(); scene.add(root);
  const shell = new THREE.Group(), concert = new THREE.Group(), net = new THREE.Group(), detail = new THREE.Group(), ball = new THREE.Group(), common = new THREE.Group();
  root.add(common, shell, concert, net, detail, ball);
  const mats = {};
  gltf.scene.updateMatrixWorld(true);
  for (const o of [...gltf.scene.children]) {
    const grp = o.userData.group || 'common', n = o.name;
    const dst = n.startsWith('roof_') || n.startsWith('shell_') ? shell : n.startsWith('net') ? net : grp === 'concert' ? concert : grp === 'detail' ? detail : grp === 'baseball' ? ball : common;
    dst.add(o);
    o.traverse((m) => {
      if (!m.isMesh) return;
      const mt = m.material; mats[mt.name] = mt;
      mt.flatShading = !m.geometry.attributes.normal; mt.side = THREE.DoubleSide;       // 법선 없이 내보냄 → 면 단위 음영
      if (mt.name === 'glass_rail' || mt.name === 'net') { mt.transparent = true; mt.depthWrite = false; }
      if (m.geometry.attributes.color) mt.vertexColors = true;                          // 구운 정점 조명이 있으면 사용
      m.matrixAutoUpdate = false; m.updateMatrix();
    });
  }
  if (mats.field?.map) { mats.field.map.anisotropy = 8; }
  if (lite) detail.visible = false;

  // ── 좌석 ──
  const meshes = (r) => { const out = []; r?.scene.traverse((o) => o.isMesh && out.push(o)); return out; };
  const geoOf = (r) => { const m = meshes(r)[0]; if (!m) return null; r.scene.updateMatrixWorld(true); const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); return g; };
  const seatHi = geoOf(hi), seatLo = geoOf(lo) || new THREE.BoxGeometry(0.45, 0.8, 0.45).translate(0, 0.4, 0);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, vertexColors: !!seatLo.attributes.color, envMapIntensity: 0.6 });
  const F = new Float32Array(bin), seatGroup = new THREE.Group(), labels = new THREE.Group(); root.add(seatGroup, labels);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  const sections = []; let k = 0;
  for (const s of meta.sections) {
    s.g = meta.grades[s.grade]; s.seats = []; s.rowCount = s.rows.length;
    const face = new THREE.Vector3();
    for (const [row, n] of s.rows) {
      for (let i = 0; i < n; i++, k++) {
        const x = F[k * 4], y = F[k * 4 + 1], z = F[k * 4 + 2], yaw = F[k * 4 + 3];
        s.seats.push({ row, num: i + 1, x, y: z, z: -y, rot: Math.atan2(-Math.cos(yaw), Math.sin(yaw)), pi: -1 });
        face.x += Math.cos(yaw); face.z -= Math.sin(yaw);
      }
    }
    const mesh = new THREE.InstancedMesh(seatLo, seatMat, s.seats.length);
    s.color = new THREE.Color(s.g.color); s.realColor = new THREE.Color(meta.seatReal[s.grade] || '#8a1c24');
    s.seats.forEach((q, i) => { Q.setFromAxisAngle(UP, q.rot); M.compose(V.set(q.x, q.y, q.z), Q, ONE); mesh.setMatrixAt(i, M); mesh.setColorAt(i, s.color); });
    mesh.userData.section = s; mesh.frustumCulled = true; mesh.computeBoundingSphere(); s.mesh = mesh; seatGroup.add(mesh);
    const c = new THREE.Vector3(); for (const q of s.seats) c.add(V.set(q.x, q.y, q.z)); c.multiplyScalar(1 / s.seats.length);
    s.center = c; s.inward = face.normalize();
    s.left = new THREE.Vector3(s.inward.z, 0, -s.inward.x);            // 관중 기준 왼쪽
    const lb = labelSprite(s.id, s.g.color); lb.position.copy(c).add(new THREE.Vector3(0, 2.8, 0)); lb.userData.section = s; s.label = lb; labels.add(lb);
    sections.push(s);
  }

  // ── 선수 (고척돔과 같은 모델: 자세 4종) ──
  const players = new THREE.Group(); root.add(players);
  if (pl) {
    const POSES = {}; for (const key of ['stand', 'ready', 'catcher', 'batter']) { const o = pl.scene.getObjectByName('pose_' + key); if (o) POSES[key] = o; }
    const pm = {}; const pmat = (hex, rough) => (pm[hex + '/' + rough] ||= new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
    const make = (jersey, pants, { crouch = 0, bat = false, cap = 0x8a1c24 } = {}) => {
      const pose = bat && crouch > 0.2 ? 'batter' : crouch >= 1 ? 'catcher' : crouch >= 0.3 ? 'ready' : 'stand';
      const o = (POSES[pose] || POSES.stand).clone(true);
      const col = { jersey, pants, cap, skin: 0xc89070, shoes: 0x111214, glove: 0x6b3a1a, bat: 0xb98952 };
      o.traverse((m) => { if (m.isMesh) { const n = m.material.name; m.material = pmat(col[n] ?? jersey, n === 'shoes' || n === 'bat' ? 0.45 : 0.75); } });
      return o;
    };
    const put = (x, z, look, p) => { p.position.set(x, 0, z); p.lookAt(look[0], 0, look[1]); p.rotateY(Math.PI); players.add(p); };
    const bs = meta.spec.base / Math.SQRT2, home = [0, 0], HW = 0xf2f2f2, HC = 0xb0122a, AW = 0x2a3a66, AC = 0x1b2748;
    put(0, -meta.spec.mound, home, make(HW, HW, { cap: HC }));
    put(0, 1.3, [0, -18], make(HW, HW, { crouch: 1, cap: HC }));
    [[bs + 1.5, -bs - 5], [9, -40], [-10, -40], [-bs - 1.5, -bs - 5], [-46, -60], [0, -90], [46, -60]].forEach(([x, z]) => put(x, z, home, make(HW, HW, { crouch: 0.45, cap: HC })));
    put(-0.95, -0.15, [3, -0.15], make(AW, 0xbfc3c8, { bat: true, cap: AC, crouch: 0.25 }));
    put(0.2, 2.5, [0, -18], make(0x15171b, 0x3a3d44, { crouch: 0.5, cap: 0x15171b }));
    for (const [x, z] of [[bs + 3, -bs + 3], [-bs - 3, -bs + 3], [2, -2 * bs - 4]]) put(x, z, home, make(0x15171b, 0x3a3d44, { cap: 0x15171b }));
  }
  concert.visible = false;
  const pt = ([x, y]) => ({ x, z: -y });
  return {
    meta, root, sections, labels, shell, net, detail, ball, concert, players, crowd: new THREE.Group(), mats, seatGroup,
    seatHi, seatLo, total: sections.reduce((a, s) => a + s.seats.length, 0),
    polePts: [pt(meta.fence[0]), pt(meta.fence.at(-1))],
    fieldPoly: [...meta.wall.map(pt), ...meta.fence.map(pt)],          // 그라운드 경계 (평면도·미니맵용)
    fencePoly: meta.fence.map(pt),
  };
}
