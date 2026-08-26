/**
 * 스테이지 스케일러
 * 1920x1080 고정 좌표계로 제작하고, 실제 모니터 해상도에 맞춰 통째로 스케일한다.
 * 세로형 모니터나 4K에서도 좌표 계산 없이 그대로 동작한다.
 */
export class Stage {
  /**
   * @param {HTMLElement} node   스테이지 요소
   * @param {{width:number,height:number,fit?:'contain'|'cover',container?:HTMLElement}} opts
   *        container 를 주면 창 대신 그 요소의 크기에 맞춘다.
   *        (한 화면에 터치·대형 모니터를 나란히 띄우는 미리보기용)
   */
  constructor(node, opts = {}) {
    this.node = node;
    this.width = opts.width || 1920;
    this.height = opts.height || 1080;
    this.fit = opts.fit || 'contain';
    this.container = opts.container || null;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.node.style.width = this.width + 'px';
    this.node.style.height = this.height + 'px';
    // 스케일 후 위치를 직접 계산하므로 기준점을 좌상단에 고정한다.
    // (레이아웃 정렬에 맡기면 스테이지가 뷰포트보다 클 때 중앙이 어긋난다)
    this.node.style.transformOrigin = '0 0';

    this._onResize = () => this.layout();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    if (this.container && window.ResizeObserver) {
      this._observer = new ResizeObserver(this._onResize);
      this._observer.observe(this.container);
    }
    this.layout();
  }

  layout() {
    const box = this.container ? this.container.getBoundingClientRect() : null;
    const vw = box ? box.width : window.innerWidth;
    const vh = box ? box.height : window.innerHeight;
    if (vw <= 0 || vh <= 0) return;
    const sx = vw / this.width;
    const sy = vh / this.height;
    this.scale = this.fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    this.offsetX = Math.round((vw - this.width * this.scale) / 2);
    this.offsetY = Math.round((vh - this.height * this.scale) / 2);
    this.node.style.transform =
      `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
  }

  /** 화면 좌표를 스테이지 좌표로 변환 (터치 히트 계산용) */
  toStage(clientX, clientY) {
    const r = this.node.getBoundingClientRect();
    return {
      x: (clientX - r.left) / this.scale,
      y: (clientY - r.top) / this.scale,
    };
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    if (this._observer) this._observer.disconnect();
  }
}
