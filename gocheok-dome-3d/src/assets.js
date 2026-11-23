// Blender 로 만든 에셋(tools/blender) 불러오기. 하나라도 실패하면 그 부분만 절차적 모델로 대체된다.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

const BASE = './assets/';

export async function loadAssets({ lite = false, maxTex = 4096 } = {}) {
  const loader = new GLTFLoader();
  const soft = (p) => p.catch((e) => { console.warn('[assets]', e?.message || e); return null; });
  const glb = (f) => soft(loader.loadAsync(BASE + f).then((g) => { g.scene.updateMatrixWorld(true); return g.scene; }));
  const aoFile = lite || maxTex < 4096 ? 'stands_ao_2k.jpg' : 'stands_ao.jpg';
  const [hi, lo, truss, players, stands, ao] = await Promise.all([
    glb('seat_hi.glb'), glb('seat_lo.glb'), glb('roof_truss.glb'), glb('players.glb'), glb('stands.glb'),
    soft(new THREE.TextureLoader().loadAsync(BASE + aoFile)),
  ]);

  const meshes = (root) => { const out = []; root?.traverse((o) => o.isMesh && out.push(o)); return out; };
  const geo = (root) => { const m = meshes(root)[0]; if (!m) return null; const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); return g; };
  const out = { seatHi: geo(hi), seatLo: geo(lo), truss: truss || null, players: null, stands: null, ao: null };

  if (players) {
    out.players = {};
    for (const k of ['stand', 'ready', 'catcher', 'batter']) { const o = players.getObjectByName('pose_' + k); if (o) out.players[k] = o; }
  }
  if (stands && ao) {
    const byMat = {};
    for (const m of meshes(stands)) { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); byMat[m.material.name] = g; }
    if (byMat.standsConcrete && byMat.standsDark && byMat.standsConcrete.attributes.uv1) {
      ao.flipY = false;                      // glTF UV 규약
      ao.channel = 1;                        // 두 번째 UV(라이트맵)
      ao.anisotropy = 4;
      out.stands = { concrete: byMat.standsConcrete, dark: byMat.standsDark };
      out.ao = ao;
    }
  }
  return out;
}
