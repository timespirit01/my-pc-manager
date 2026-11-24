// Blender Cycles 로 구운 조명(tools/blender/bake_lighting.py)을 경기장에 입힌다.
// 굽기 결과가 있으면 실시간 조명·그림자 대신 구운 빛을 쓰므로 화면이 '렌더링된' 느낌이 되고 더 가볍다.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { collectBake } from './stadium.js';

const BASE = './assets/bake/';
export const R_ENC = 4;                               // 저장 범위 (bake_lighting.py 와 같아야 함)
const SEAT_K = 0.62;                                  // 위·앞을 향한 측정판보다 실제 좌석 면이 받는 빛이 적다

export async function loadBake({ lite = false, maxTex = 4096 } = {}) {
  const tl = new THREE.TextureLoader();
  const tex = (f) => tl.loadAsync(BASE + f).then((t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
  const [field, stands, vglb, seat] = await Promise.all([
    tex('field_lm.jpg'), tex('stands_lm.jpg'),   // 2048px 한 장 (PC·모바일 공용)
    new GLTFLoader().loadAsync(BASE + 'bake_vertex.glb'), fetch(BASE + 'seat_light.json').then((r) => r.json()),
  ]);
  const vertex = {};
  vglb.scene.updateMatrixWorld(true);
  vglb.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); vertex[o.name] = g; } });
  return { field, stands, vertex, seatLight: seat.light };
}

export function applyBake(st, sections, bake) {
  st.root.updateMatrixWorld(true);
  const L = collectBake(st), K = R_ENC * Math.PI, inv = new THREE.Matrix4();
  const basic = (old, extra) => new THREE.MeshBasicMaterial({ name: old.name, color: old.color.clone(), map: old.map || null, side: old.side, transparent: old.transparent, ...extra });

  bake.stands.channel = 1;
  for (const m of L.stands) m.material = basic(m.material, { lightMap: bake.stands, lightMapIntensity: K });
  bake.field.channel = 0;
  L.ground.material = basic(L.ground.material, { lightMap: bake.field, lightMapIntensity: K });

  let n = 0;
  L.vertex.forEach((m, i) => {
    const g = bake.vertex['v' + i]; if (!g || !g.attributes.color) return;
    const geo = g.clone(); geo.applyMatrix4(inv.copy(m.matrixWorld).invert());
    m.geometry = geo;
    m.material = basic(m.material, { vertexColors: true });
    m.material.color.multiplyScalar(R_ENC);
    m.castShadow = m.receiveShadow = false; n++;
  });

  // 좌석: 구운 정점 색(흰 플라스틱/검은 금속) × 구역 색 × 좌석별 밝기
  let k = 0;
  for (const s of sections) {
    s.light = new Float32Array(s.seats.length);
    for (let i = 0; i < s.seats.length; i++) s.light[i] = SEAT_K * (bake.seatLight[k++] ?? 1);
    const old = s.mesh.material;
    if (!old.isMeshBasicMaterial) s.mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true });
    s.mesh.castShadow = s.mesh.receiveShadow = false;
  }
  for (const m of [st.standC, st.standD, L.ground]) m.castShadow = m.receiveShadow = false;
  return { vertex: n, seats: k };
}
