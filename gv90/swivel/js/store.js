/**
 * SWIVEL 상태 저장소.
 *
 * 터치모니터와 대형모니터는 이 상태 하나를 함께 본다.
 * 터치모니터가 상태를 바꾸면 대형모니터가 따라 그린다.
 */
export const VIEW = { MENU: 'menu', SELECT: 'select', PLAYING: 'playing' };

export class Store {
  /** @param {object} config config.json */
  constructor(config) {
    this.config = config;
    this.subs = new Set();
    this.state = {
      view: VIEW.MENU,
      categoryId: null,
      sceneId: null,
      stepIndex: 0,
      rev: 0,
    };
  }

  subscribe(fn) {
    this.subs.add(fn);
    fn(this.state, null);
    return () => this.subs.delete(fn);
  }

  /** 상태를 갈아끼운다. local=false 면 동기화로 들어온 것이라 되돌려 보내지 않는다. */
  set(patch, { local = true } = {}) {
    const prev = this.state;
    const next = { ...prev, ...patch };
    if (local) next.rev = prev.rev + 1;
    if (shallowEqual(prev, next)) return;
    this.state = next;
    this.subs.forEach((fn) => fn(next, prev, { local }));
  }

  // --- 조회 -----------------------------------------------------------------

  get categories() { return this.config.categories; }

  category(id = this.state.categoryId) {
    return this.categories.find((c) => c.id === id) || null;
  }

  scene(id = this.state.sceneId) {
    for (const c of this.categories) {
      const s = c.scenes.find((x) => x.id === id);
      if (s) return s;
    }
    return null;
  }

  /** 현재 시나리오의 현재 단계 */
  step() {
    const sc = this.scene();
    if (!sc) return null;
    return sc.steps[Math.min(this.state.stepIndex, sc.steps.length - 1)] || null;
  }

  // --- 조작 -----------------------------------------------------------------

  openMenu() {
    this.set({ view: VIEW.MENU, categoryId: null, sceneId: null, stepIndex: 0 });
  }

  openCategory(categoryId) {
    this.set({ view: VIEW.SELECT, categoryId, sceneId: null, stepIndex: 0 });
  }

  playScene(sceneId) {
    const cat = this.categories.find((c) => c.scenes.some((s) => s.id === sceneId));
    this.set({
      view: VIEW.PLAYING,
      categoryId: cat ? cat.id : this.state.categoryId,
      sceneId,
      stepIndex: 0,
    });
  }

  /** 현재 카테고리 안에서 앞뒤 시나리오로 이동 */
  siblingScene(delta) {
    const cat = this.category();
    if (!cat) return null;
    const i = cat.scenes.findIndex((s) => s.id === this.state.sceneId);
    if (i < 0) return null;
    const n = cat.scenes.length;
    return cat.scenes[(i + delta + n) % n];
  }

  moveScene(delta) {
    const next = this.siblingScene(delta);
    if (next) this.playScene(next.id);
  }

  /** 단계 진행. 마지막 단계에서는 멈춘다. */
  nextStep() {
    const sc = this.scene();
    if (!sc) return false;
    if (this.state.stepIndex >= sc.steps.length - 1) return false;
    this.set({ stepIndex: this.state.stepIndex + 1 });
    return true;
  }

  atLastStep() {
    const sc = this.scene();
    return !sc || this.state.stepIndex >= sc.steps.length - 1;
  }
}

function shallowEqual(a, b) {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}
