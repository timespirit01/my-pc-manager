/**
 * 터치모니터 — 관람객이 만지는 화면.
 *
 *   메뉴        4가지 상황을 2x2 로 고른다
 *   시나리오 선택  고른 상황 안의 시나리오를 사진 카드로 고른다
 *   재생        차량 환경이 바뀌는 동안 시나리오 이름과 앞뒤 이동만 남는다
 */
import { el, $, $$ } from '../../../shared/js/util.js';
import { VIEW } from '../store.js';

export class TouchView {
  /** @param {HTMLElement} root  @param {import('../store.js').Store} store */
  constructor(root, store) {
    this.root = root;
    this.store = store;
    this.copy = store.config.copy;
    this._build();
    store.subscribe((state, prev) => this._render(state, prev));
  }

  _build() {
    const c = this.store.config;

    this.root.append(
      el('header', { class: 'sw-head' },
        el('span', { text: c.chrome.left }),
        el('span', { class: 'sw-head-right' })),

      // --- 메뉴 ---------------------------------------------------------
      el('section', { class: 'sw-screen', 'data-screen': 'menu' },
        el('div', { class: 'menu-grid' },
          ...c.categories.map((cat) =>
            el('button', {
              class: 'cat-tile',
              type: 'button',
              onclick: () => this.store.openCategory(cat.id),
            },
              el('span', { class: 'cat-no', text: cat.no }),
              el('span', { class: 'cat-body' },
                el('span', { class: 'cat-title', text: cat.title }),
                el('span', { class: 'cat-en',
                  text: `${cat.en} · ${cat.scenes.length} ${this.copy.sceneUnit}` })))))),

      // --- 시나리오 선택 -------------------------------------------------
      el('section', { class: 'sw-screen', 'data-screen': 'select' },
        el('div', { class: 'sw-title' },
          el('h1', { text: this.copy.select.headline }),
          el('p', { text: this.copy.select.sub })),
        el('button', {
          class: 'home-btn', type: 'button', 'aria-label': '처음으로',
          onclick: () => this.store.openMenu(),
        }, homeIcon()),
        el('div', { class: 'scene-cards' })),

      // --- 재생 ----------------------------------------------------------
      el('section', { class: 'sw-screen', 'data-screen': 'playing' },
        el('div', { class: 'sw-title' },
          el('h1', { text: this.copy.playing.headline }),
          el('p', { text: this.copy.playing.sub })),
        el('button', {
          class: 'home-btn', type: 'button', 'aria-label': '처음으로',
          onclick: () => this.store.openMenu(),
        }, homeIcon()),
        el('div', { class: 'now-playing' },
          el('button', {
            class: 'arrow arrow--prev', type: 'button', 'aria-label': '이전 시나리오',
            onclick: () => this.store.moveScene(-1),
          }, '‹'),
          el('div', { class: 'now-body' },
            el('p', { class: 'now-cat' }),
            el('h2', { class: 'now-title' })),
          el('button', {
            class: 'arrow arrow--next', type: 'button', 'aria-label': '다음 시나리오',
            onclick: () => this.store.moveScene(1),
          }, '›'))),
    );

    this.screens = {};
    $$('.sw-screen', this.root).forEach((n) => { this.screens[n.dataset.screen] = n; });
    this.cardsEl = $('.scene-cards', this.root);
    this.headRight = $('.sw-head-right', this.root);
  }

  _render(state, prev) {
    const c = this.store.config;

    Object.entries(this.screens).forEach(([name, node]) =>
      node.classList.toggle('is-active', name === state.view));

    this.headRight.textContent =
      state.view === VIEW.MENU ? c.chrome.right : c.chrome.rightScene;

    if (state.view === VIEW.SELECT && (!prev || prev.categoryId !== state.categoryId)) {
      this._buildCards(this.store.category());
    }

    if (state.view === VIEW.PLAYING) {
      const cat = this.store.category();
      const sc = this.store.scene();
      $('.now-cat', this.root).textContent = cat ? cat.title : '';
      $('.now-title', this.root).textContent = sc ? sc.title : '';
      // 시나리오가 하나뿐인 상황에서는 앞뒤 화살표를 감춘다
      const many = cat && cat.scenes.length > 1;
      $$('.arrow', this.root).forEach((a) => { a.hidden = !many; });
    }
  }

  _buildCards(cat) {
    this.cardsEl.replaceChildren();
    if (!cat) return;
    this.cardsEl.dataset.count = String(cat.scenes.length);
    this.cardsEl.append(...cat.scenes.map((sc) =>
      el('button', {
        class: 'scene-card', type: 'button',
        onclick: () => this.store.playScene(sc.id),
      },
        el('img', { src: sc.poster, alt: '' }),
        el('span', { class: 'scene-card-body' },
          el('span', { class: 'scene-card-title', text: sc.title }),
          el('span', { class: 'scene-card-want', text: sc.want })))));
  }
}

function homeIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '11');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M7 12.2 12 8l5 4.2V17h-3.4v-3.1h-3.2V17H7z');
  svg.append(circle, path);
  return svg;
}
