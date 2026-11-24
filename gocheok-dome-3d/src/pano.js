// 사진급 360° 좌석 시야: Blender Cycles 로 미리 그린 등장방형 파노라마(tools/blender/render_pano.py)를
// 3D 화면 위에 구(球)로 덮어 보여 준다. 시선(yaw/pitch/fov)은 3D 카메라를 그대로 따른다.
import * as THREE from 'three';

const BASE = './assets/panos/';
const MOUND = new THREE.Vector3(0, 1.0, -18.44);

export async function createPano(renderer) {
  const list = await fetch(BASE + 'index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const bySection = new Map();
  for (const p of list) { (bySection.get(p.id) || bySection.set(p.id, []).get(p.id)).push(p); p.eye = new THREE.Vector3(...p.pos); }

  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const geo = new THREE.SphereGeometry(50, 96, 48); geo.scale(-1, 1, 1);      // 안쪽에서 보는 구: 이미지 가운데 = -x 방향
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
  const loader = new THREE.TextureLoader(), cache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let cur = null, want = null, fade = null;

  const load = (url) => cache.get(url) || cache.set(url, loader.loadAsync(url).then((t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso); t.generateMipmaps = true; return t;
  })).get(url);
  const setTex = (t) => { if (mat.map !== t) { mat.map = t; mat.needsUpdate = true; } };

  return {
    count: list.length,
    // 이 구역에서 좌석에 가장 가까운 파노라마 (없으면 null)
    nearest(sectionId, eye) {
      const c = bySection.get(sectionId); if (!c) return null;
      return c.reduce((a, b) => (a.eye.distanceTo(eye) <= b.eye.distanceTo(eye) ? a : b));
    },
    // 2K 를 먼저 띄우고 4K 로 바꿔 끼운다. 이미지 가운데(마운드 쪽)가 실제 방향과 맞게 구를 돌린다
    async show(p) {
      want = p;
      const d = MOUND.clone().sub(p.eye); mesh.rotation.y = Math.atan2(d.z, -d.x);
      const lo = await load(BASE + '2k/' + p.file).catch(() => null);
      if (want !== p || !lo) return false;
      if (cur !== p || !mat.map) setTex(lo);
      cur = p; fade = { t0: performance.now(), from: mat.opacity, to: 1 };
      load(BASE + '4k/' + p.file).then((hi) => { if (want === p) setTex(hi); }).catch(() => {});
      return true;
    },
    hide() { want = null; if (mat.opacity > 0) fade = { t0: performance.now(), from: mat.opacity, to: 0 }; },
    preload(p) { if (p) load(BASE + '2k/' + p.file).catch(() => {}); },
    get current() { return want; },
    get opaque() { return mat.opacity >= 1 && !!mat.map; },
    get visible() { return mat.opacity > 0 && !!mat.map; },
    // 3D 화면을 그린 뒤 위에 덮어 그린다 (완전히 덮였으면 3D 는 건너뛰어도 됨)
    render(camera, now) {
      if (fade) { const k = Math.min(1, (now - fade.t0) / 450); mat.opacity = fade.from + (fade.to - fade.from) * k; if (k >= 1) fade = null; }
      if (mat.opacity <= 0 || !mat.map) return;
      cam.quaternion.copy(camera.quaternion); cam.fov = camera.fov; cam.aspect = camera.aspect; cam.updateProjectionMatrix();
      const ac = renderer.autoClear; renderer.autoClear = mat.opacity >= 1; renderer.render(scene, cam); renderer.autoClear = ac;
    },
  };
}
