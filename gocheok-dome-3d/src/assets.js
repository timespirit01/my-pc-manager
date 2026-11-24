// Blender 로 만든 에셋(tools/blender) 불러오기. 하나라도 실패하면 그 부분만 절차적 모델로 대체된다.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

const BASE = './assets/';

export async function loadAssets({ lite = false, maxTex = 4096 } = {}) {
  const loader = new GLTFLoader();
  const soft = (p) => p.catch((e) => { console.warn('[assets]', e?.message || e); return null; });
  const glb = (f) => soft(loader.loadAsync(BASE + f).then((g) => { g.scene.updateMatrixWorld(true); return g.scene; }));
  // 스탠드 그림자는 bake.js 의 구운 조명(라이트맵)에 포함되므로 따로 받지 않는다
  const [hi, lo, truss, players, stands] = await Promise.all([
    glb('seat_hi.glb'), glb('seat_lo.glb'), glb('roof_truss.glb'), glb('players.glb'), glb('stands.glb'),
  ]);

  const meshes = (root) => { const out = []; root?.traverse((o) => o.isMesh && out.push(o)); return out; };
  const geo = (root) => { const m = meshes(root)[0]; if (!m) return null; const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); return g; };
  const out = { seatHi: geo(hi), seatLo: geo(lo), truss: truss || null, players: null, stands: null, ao: null };

  if (players) {
    out.players = {};
    for (const k of ['stand', 'ready', 'catcher', 'batter']) { const o = players.getObjectByName('pose_' + k); if (o) out.players[k] = o; }
  }
  if (stands) {
    const byMat = {};
    for (const m of meshes(stands)) { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); byMat[m.material.name] = g; }
    if (byMat.standsConcrete && byMat.standsDark && byMat.standsConcrete.attributes.uv1) out.stands = { concrete: byMat.standsConcrete, dark: byMat.standsDark };
  }
  return out;
}
