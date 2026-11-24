// Blender Cycles 로 구운 조명(tools/blender/bake_lighting.py)을 경기장에 입힌다.
// 굽기 결과가 있으면 실시간 조명·그림자 대신 구운 빛을 쓰므로 화면이 '렌더링된' 느낌이 되고 더 가볍다.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { collectBake } from './stadium.js';

const BASE = './assets/bake/';
// 경기장 안을 360°로 한 번 찍어 반사 환경으로 쓴다 (광택 재질에 더하기 방식으로 반사)
export function applyGloss(renderer, scene, baked, at = new THREE.Vector3(0, 14, -42), size = 256) {
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cam = new THREE.CubeCamera(1, 600, rt); cam.position.copy(at); scene.add(cam);
  cam.update(renderer, scene); scene.remove(cam);
  for (const [m, r] of baked.glossy) {
    m.envMap = rt.texture; m.combine = THREE.AddOperation; m.reflectivity = r;
    if (m.vertexColors) {                                // 정점 색(밝기)에 비례: 어두운 금속·그늘엔 반사가 거의 없게
      const chunk = THREE.ShaderChunk.envmap_fragment.replace('outgoingLight += envColor.xyz * specularStrength * reflectivity;',
        'outgoingLight += envColor.xyz * specularStrength * reflectivity * clamp(dot(vColor.rgb, vec3(0.333)) * 1.4, 0.0, 1.0);');
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <envmap_fragment>', chunk); };
      m.customProgramCacheKey = () => 'gloss-vc';
    }
    m.needsUpdate = true;
  }
  return rt;
}

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

// 재질별 광택(환경 반사 세기). 구운 조명 위에 경기장 내부를 찍은 반사를 더한다
export const GLOSS = { seat: 0.1, stands: 0.05, field: 0.025, pad: 0.12, steel: 0.2, wall: 0.04 };

export function applyBake(st, sections, bake) {
  const glossy = [];                                    // [material, 세기]
  st.root.updateMatrixWorld(true);
  const L = collectBake(st), K = R_ENC * Math.PI, inv = new THREE.Matrix4();
  const basic = (old, extra) => new THREE.MeshBasicMaterial({ name: old.name, color: old.color.clone(), map: old.map || null, side: old.side, transparent: old.transparent, ...extra });

  bake.stands.channel = 1;
  for (const m of L.stands) { m.material = basic(m.material, { lightMap: bake.stands, lightMapIntensity: K }); glossy.push([m.material, GLOSS.stands]); }
  bake.field.channel = 0;
  L.ground.material = basic(L.ground.material, { lightMap: bake.field, lightMapIntensity: K }); glossy.push([L.ground.material, GLOSS.field]);

  let n = 0;
  L.vertex.forEach((m, i) => {
    const g = bake.vertex['v' + i]; if (!g || !g.attributes.color) return;
    const geo = g.clone(); geo.applyMatrix4(inv.copy(m.matrixWorld).invert());
    if (!geo.attributes.normal) geo.computeVertexNormals();
    m.geometry = geo;
    const wasMetal = m.material.metalness > 0.3, hasMap = !!m.material.map;
    m.material = basic(m.material, { vertexColors: true });
    m.material.color.multiplyScalar(R_ENC);
    glossy.push([m.material, wasMetal ? GLOSS.steel : hasMap ? GLOSS.pad : GLOSS.wall]);
    m.castShadow = m.receiveShadow = false; n++;
  });

  // 좌석: 구운 정점 색(흰 플라스틱/검은 금속) × 구역 색 × 좌석별 밝기
  let k = 0, seatMat = null;
  for (const s of sections) {
    s.light = new Float32Array(s.seats.length);
    for (let i = 0; i < s.seats.length; i++) s.light[i] = SEAT_K * (bake.seatLight[k++] ?? 1);
    const old = s.mesh.material;
    if (!old.isMeshBasicMaterial) { s.mesh.material = seatMat ||= new THREE.MeshBasicMaterial({ vertexColors: true }); }
    s.mesh.castShadow = s.mesh.receiveShadow = false;
  }
  for (const m of [st.standC, st.standD, L.ground]) m.castShadow = m.receiveShadow = false;
  if (seatMat) glossy.push([seatMat, GLOSS.seat]);
  return { vertex: n, seats: k, glossy };
}
