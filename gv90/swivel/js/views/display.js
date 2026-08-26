/**
 * 대형모니터 — 관람객이 바라보는 화면.
 *
 *   메뉴        차량 외관 실루엣과 SWIVELING SEAT 워드마크
 *   시나리오 선택  시트가 비쳐 보이는 차량으로 전환
 *   재생        시나리오 스틸이 크로스페이드되고, 아래에 단계 설명이 붙는다
 *
 * 크로스페이드는 두 장의 레이어를 번갈아 쓰는 방식이다. 새 스틸을 뒤 레이어에
 * 올려 두고 앞뒤를 교대하면, 이미지가 아직 안 떴을 때 화면이 깜빡이지 않는다.
 */
import { el, $ } from '../../../shared/js/util.js';
import { VIEW } from '../store.js';

export class DisplayView {
  /** @param {HTMLElement} root  @param {import('../store.js').Store} store */
  constructor(root, store) {
    this.root = root;
    this.store = store;
    this.front = 0;          // 지금 보이는 레이어 번호
    this._build();
    store.subscribe((state, prev) => this._render(state, prev));
  }

  _build() {
    const c = this.store.config;
    const plates = c.copy.display.plates;
    this.root.append(
      el('div', { class: 'dp-plate', 'data-plate': 'menu' },
        el('img', { src: plates.menu, alt: '' })),
      el('div', { class: 'dp-plate', 'data-plate': 'select' },
        el('img', { src: plates.select, alt: '' })),

      el('div', { class: 'dp-still' },
        el('img', { class: 'dp-layer is-front', alt: '' }),
        el('img', { class: 'dp-layer', alt: '' })),

      el('div', { class: 'dp-wordmark', text: c.copy.display.wordmark }),

      el('header', { class: 'sw-head' },
        el('span', { text: c.chrome.left }),
        el('span', { text: c.chrome.rightScene })),

      el('div', { class: 'dp-caption' },
        el('h2', { class: 'dp-caption-title' }),
        el('p', { class: 'dp-caption-body' })),
    );

    this.plates = {
      menu: $('[data-plate="menu"]', this.root),
      select: $('[data-plate="select"]', this.root),
    };
    this.layers = Array.from(this.root.querySelectorAll('.dp-layer'));
    this.stillEl = $('.dp-still', this.root);
    this.wordmarkEl = $('.dp-wordmark', this.root);
    this.captionEl = $('.dp-caption', this.root);
    this.titleEl = $('.dp-caption-title', this.root);
    this.bodyEl = $('.dp-caption-body', this.root);
  }

  _render(state, prev) {
    const playing = state.view === VIEW.PLAYING;

    this.plates.menu.classList.toggle('is-on', state.view === VIEW.MENU);
    this.plates.select.classList.toggle('is-on', state.view === VIEW.SELECT);
    this.stillEl.classList.toggle('is-on', playing);
    this.wordmarkEl.classList.toggle('is-on', !playing);
    this.captionEl.classList.toggle('is-on', playing);

    if (!playing) return;

    const step = this.store.step();
    if (!step) return;

    const changed = !prev
      || prev.view !== state.view
      || prev.sceneId !== state.sceneId
      || prev.stepIndex !== state.stepIndex;
    if (!changed) return;

    this._crossfade(step.image);
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;

    // 카피가 바뀔 때마다 살짝 떠오르게 한다
    this.captionEl.classList.remove('is-in');
    void this.captionEl.offsetWidth;   // 애니메이션 재시작
    this.captionEl.classList.add('is-in');
  }

  _crossfade(src) {
    const back = this.layers[1 - this.front];
    const front = this.layers[this.front];
    const swap = () => {
      back.classList.add('is-front');
      front.classList.remove('is-front');
      this.front = 1 - this.front;
    };
    if (back.getAttribute('src') === src) { swap(); return; }
    back.onload = swap;
    back.onerror = swap;
    back.src = src;
  }
}
