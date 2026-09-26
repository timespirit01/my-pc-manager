// 샘플 이미지 생성기. 외부 사진 대신 직접 그린 SVG 일러스트를 래스터화한다(라이선스: 이 저장소와 동일, 자유 사용).
// 사용: npm run samples  → public/samples/*.jpg|png, tests/fixtures/*.jpg
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium } from './chromium.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontUrl = (f) => f;

const shadow = (id, dy = 18, blur = 22, op = 0.28) => `
  <filter id="${id}" x="-30%" y="-30%" width="160%" height="170%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${blur}"/>
    <feOffset dy="${dy}" result="b"/>
    <feComponentTransfer><feFuncA type="linear" slope="${op}"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;

function bean(x, y, s, r, c1 = '#5B3622', c2 = '#3A2114') {
  return `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">
    <ellipse cx="0" cy="0" rx="34" ry="24" fill="${c1}"/>
    <ellipse cx="-6" cy="-6" rx="22" ry="12" fill="#ffffff" opacity="0.08"/>
    <path d="M-30 4 C -10 -10, 10 14, 30 -2" stroke="${c2}" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>`;
}

// 결정적 의사난수
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function coffeeHero(W, H) {
  const r = rng(7);
  let beans = '';
  for (let i = 0; i < 26; i++) beans += bean(r() * W, H * 0.78 + r() * H * 0.25, 0.9 + r() * 0.8, r() * 360);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3E3CF"/><stop offset="1" stop-color="#E2C3A0"/></linearGradient>
    <linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B98457"/><stop offset="1" stop-color="#8A5B36"/></linearGradient>
    <linearGradient id="bag" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C79A68"/><stop offset="0.5" stop-color="#DDB483"/><stop offset="1" stop-color="#B8885A"/></linearGradient>
    <linearGradient id="cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F7F4EF"/><stop offset="0.6" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCD5CB"/></linearGradient>
    <radialGradient id="light" cx="0.75" cy="0.1" r="0.8"><stop offset="0" stop-color="#FFF6E6" stop-opacity="0.9"/><stop offset="1" stop-color="#FFF6E6" stop-opacity="0"/></radialGradient>
    ${shadow('sh')}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#light)"/>
  <rect x="0" y="${H * 0.72}" width="${W}" height="${H * 0.28}" fill="url(#table)"/>
  <rect x="0" y="${H * 0.72}" width="${W}" height="6" fill="#ffffff" opacity="0.25"/>
  <!-- 원두 봉투 -->
  <g filter="url(#sh)">
    <path d="M ${W * 0.2} ${H * 0.2} L ${W * 0.44} ${H * 0.2} L ${W * 0.46} ${H * 0.8} L ${W * 0.18} ${H * 0.8} Z" fill="url(#bag)"/>
    <path d="M ${W * 0.2} ${H * 0.2} L ${W * 0.44} ${H * 0.2} L ${W * 0.44} ${H * 0.25} L ${W * 0.2} ${H * 0.25} Z" fill="#A87A4C"/>
    <rect x="${W * 0.235}" y="${H * 0.38}" width="${W * 0.19}" height="${H * 0.26}" rx="10" fill="#FBF6EE"/>
    <circle cx="${W * 0.33}" cy="${H * 0.45}" r="${H * 0.045}" fill="none" stroke="#C0502A" stroke-width="8"/>
    <path d="M ${W * 0.315} ${H * 0.45} q ${W * 0.015} -${H * 0.03} ${W * 0.03} 0" stroke="#C0502A" stroke-width="7" fill="none" stroke-linecap="round"/>
    <text x="${W * 0.33}" y="${H * 0.545}" text-anchor="middle" font-family="P" font-weight="800" font-size="${H * 0.042}" fill="#3A2114">온기 블렌드</text>
    <text x="${W * 0.33}" y="${H * 0.59}" text-anchor="middle" font-family="P" font-weight="500" font-size="${H * 0.022}" fill="#7A5A40" letter-spacing="4">HAND DRIP · 200g</text>
  </g>
  <!-- 컵 -->
  <g filter="url(#sh)">
    <ellipse cx="${W * 0.66}" cy="${H * 0.8}" rx="${W * 0.13}" ry="${H * 0.035}" fill="#E9E1D6"/>
    <path d="M ${W * 0.56} ${H * 0.5} L ${W * 0.76} ${H * 0.5} L ${W * 0.74} ${H * 0.77} Q ${W * 0.66} ${H * 0.8} ${W * 0.58} ${H * 0.77} Z" fill="url(#cup)"/>
    <path d="M ${W * 0.76} ${H * 0.55} q ${W * 0.07} 0 ${W * 0.06} ${H * 0.08} q -${W * 0.01} ${H * 0.07} -${W * 0.075} ${H * 0.06}" stroke="#EDE7DE" stroke-width="${H * 0.025}" fill="none"/>
    <ellipse cx="${W * 0.66}" cy="${H * 0.5}" rx="${W * 0.1}" ry="${H * 0.03}" fill="#4A2A18"/>
    <ellipse cx="${W * 0.645}" cy="${H * 0.495}" rx="${W * 0.05}" ry="${H * 0.012}" fill="#8C5A3A" opacity="0.7"/>
  </g>
  <!-- 김 -->
  <g stroke="#FFFFFF" stroke-width="10" fill="none" opacity="0.7" stroke-linecap="round">
    <path d="M ${W * 0.63} ${H * 0.44} c -30 -40 30 -70 0 -120 c -20 -40 20 -60 10 -90"/>
    <path d="M ${W * 0.68} ${H * 0.43} c -25 -35 25 -60 0 -100 c -15 -30 15 -50 8 -70"/>
  </g>
  ${beans}
</svg>`;
}

function coffeePour(W, H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2D3A33"/><stop offset="1" stop-color="#16201B"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0.25"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.2"/></linearGradient>
    <linearGradient id="coffee" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A4524"/><stop offset="1" stop-color="#3B1D0E"/></linearGradient>
    <linearGradient id="dripper" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E8E3DA"/><stop offset="0.5" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CFC7BB"/></linearGradient>
    <radialGradient id="spot" cx="0.5" cy="0.35" r="0.6"><stop offset="0" stop-color="#F5D7A8" stop-opacity="0.35"/><stop offset="1" stop-color="#F5D7A8" stop-opacity="0"/></radialGradient>
    ${shadow('sh', 24, 30, 0.45)}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#spot)"/>
  <rect x="0" y="${H * 0.84}" width="${W}" height="${H * 0.16}" fill="#0E1512"/>
  <!-- 주전자 물줄기 -->
  <path d="M ${W * 0.2} ${H * 0.05} q ${W * 0.2} ${H * 0.02} ${W * 0.3} ${H * 0.15}" stroke="#D9E8E4" stroke-width="10" fill="none" opacity="0.7"/>
  <rect x="${W * 0.495}" y="${H * 0.19}" width="6" height="${H * 0.12}" fill="#D9E8E4" opacity="0.6"/>
  <!-- 드리퍼 -->
  <g filter="url(#sh)">
    <path d="M ${W * 0.28} ${H * 0.3} L ${W * 0.72} ${H * 0.3} L ${W * 0.58} ${H * 0.47} L ${W * 0.42} ${H * 0.47} Z" fill="url(#dripper)"/>
    <rect x="${W * 0.26}" y="${H * 0.29}" width="${W * 0.48}" height="${H * 0.02}" rx="8" fill="#F4F0E9"/>
    <rect x="${W * 0.36}" y="${H * 0.47}" width="${W * 0.28}" height="${H * 0.02}" rx="6" fill="#DDD6CB"/>
  </g>
  <rect x="${W * 0.497}" y="${H * 0.49}" width="5" height="${H * 0.12}" fill="#6B3A1E"/>
  <!-- 서버(유리) -->
  <g filter="url(#sh)">
    <path d="M ${W * 0.32} ${H * 0.52} L ${W * 0.68} ${H * 0.52} Q ${W * 0.74} ${H * 0.7} ${W * 0.66} ${H * 0.84} L ${W * 0.34} ${H * 0.84} Q ${W * 0.26} ${H * 0.7} ${W * 0.32} ${H * 0.52} Z" fill="#ffffff" opacity="0.12"/>
    <path d="M ${W * 0.295} ${H * 0.66} L ${W * 0.705} ${H * 0.66} Q ${W * 0.72} ${H * 0.75} ${W * 0.66} ${H * 0.84} L ${W * 0.34} ${H * 0.84} Q ${W * 0.28} ${H * 0.75} ${W * 0.295} ${H * 0.66} Z" fill="url(#coffee)"/>
    <path d="M ${W * 0.32} ${H * 0.52} L ${W * 0.68} ${H * 0.52} Q ${W * 0.74} ${H * 0.7} ${W * 0.66} ${H * 0.84} L ${W * 0.34} ${H * 0.84} Q ${W * 0.26} ${H * 0.7} ${W * 0.32} ${H * 0.52} Z" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.35" stroke-width="4"/>
    <rect x="${W * 0.36}" y="${H * 0.56}" width="${W * 0.03}" height="${H * 0.2}" rx="10" fill="#ffffff" opacity="0.25"/>
  </g>
</svg>`;
}

function beansSquare(W, H) {
  const r = rng(42);
  let beans = '';
  for (let i = 0; i < 150; i++) {
    const shade = 0.75 + r() * 0.5;
    const c = `rgb(${Math.round(92 * shade)},${Math.round(55 * shade)},${Math.round(34 * shade)})`;
    beans += bean(r() * W, r() * H, 1.4 + r() * 1.2, r() * 360, c, '#2A160B');
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="v" cx="0.5" cy="0.5" r="0.75"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="#3A2114"/>${beans}<rect width="${W}" height="${H}" fill="url(#v)"/></svg>`;
}

function market(W, H) {
  const r = rng(3);
  const tents = [0.08, 0.36, 0.64].map((x, i) => {
    const colors = [['#E4572E', '#F3E9DC'], ['#2E86AB', '#F3E9DC'], ['#F2A541', '#F3E9DC']][i];
    const tx = W * x, tw = W * 0.28, ty = H * 0.34;
    let stripes = '';
    for (let k = 0; k < 7; k++) stripes += `<path d="M ${tx + (tw / 7) * k} ${ty} l ${tw / 7} 0 l 0 ${H * 0.08} q -${tw / 14} ${H * 0.03} -${tw / 7} 0 Z" fill="${colors[k % 2]}"/>`;
    return `<g filter="url(#sh)"><path d="M ${tx - 10} ${ty} L ${tx + tw / 2} ${H * 0.2} L ${tx + tw + 10} ${ty} Z" fill="${colors[0]}"/>${stripes}
      <rect x="${tx + 12}" y="${ty + H * 0.08}" width="10" height="${H * 0.36}" fill="#6B4E3D"/><rect x="${tx + tw - 22}" y="${ty + H * 0.08}" width="10" height="${H * 0.36}" fill="#6B4E3D"/>
      <rect x="${tx + 20}" y="${H * 0.62}" width="${tw - 40}" height="${H * 0.06}" rx="6" fill="#8B5E3C"/>
      ${[0, 1, 2, 3].map((j) => `<circle cx="${tx + 60 + j * (tw - 120) / 3}" cy="${H * 0.6}" r="${H * 0.025}" fill="${['#FFD166', '#EF476F', '#06D6A0', '#FFFFFF'][(j + i) % 4]}"/>`).join('')}</g>`;
  }).join('');
  let lights = '';
  for (let i = 0; i < 40; i++) {
    const x = (W / 39) * i;
    const y = H * 0.1 + Math.sin((i / 39) * Math.PI) * H * 0.06;
    lights += `<circle cx="${x}" cy="${y}" r="9" fill="#FFE8A3"/><circle cx="${x}" cy="${y}" r="26" fill="#FFE8A3" opacity="0.18"/>`;
  }
  let leaves = '';
  for (let i = 0; i < 30; i++) leaves += `<ellipse cx="${r() * W}" cy="${H * 0.8 + r() * H * 0.2}" rx="16" ry="8" transform="rotate(${r() * 180} ${r() * W} ${H * 0.9})" fill="${['#D1495B', '#EDAE49', '#C3582E'][i % 3]}" opacity="0.8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDE2C4"/><stop offset="1" stop-color="#F7B38A"/></linearGradient>${shadow('sh', 14, 16, 0.25)}</defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${W * 0.82}" cy="${H * 0.3}" r="${H * 0.12}" fill="#FFF3D6" opacity="0.8"/>
  <path d="M 0 ${H * 0.1} Q ${W / 2} ${H * 0.22} ${W} ${H * 0.1}" stroke="#5B4636" stroke-width="3" fill="none"/>
  ${lights}
  <rect x="0" y="${H * 0.78}" width="${W}" height="${H * 0.22}" fill="#C9A27E"/>
  ${tents}${leaves}
</svg>`;
}

function cleaning(W, H) {
  let sparkles = '';
  const r = rng(11);
  for (let i = 0; i < 12; i++) {
    const x = r() * W, y = r() * H * 0.6, s = 10 + r() * 22;
    sparkles += `<path d="M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z" fill="#FFFFFF" opacity="0.9"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DDF1F4"/><stop offset="1" stop-color="#BFE3E8"/></linearGradient>
  <linearGradient id="win" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CBEAF3"/></linearGradient>${shadow('sh', 16, 18, 0.22)}</defs>
  <rect width="${W}" height="${H}" fill="url(#wall)"/>
  <rect x="${W * 0.14}" y="${H * 0.1}" width="${W * 0.44}" height="${H * 0.36}" rx="12" fill="url(#win)" stroke="#FFFFFF" stroke-width="18"/>
  <line x1="${W * 0.36}" y1="${H * 0.1}" x2="${W * 0.36}" y2="${H * 0.46}" stroke="#FFFFFF" stroke-width="14"/>
  <rect x="0" y="${H * 0.72}" width="${W}" height="${H * 0.28}" fill="#E9D8C2"/>
  <rect x="0" y="${H * 0.72}" width="${W}" height="10" fill="#FFFFFF" opacity="0.5"/>
  <!-- 소파 -->
  <g filter="url(#sh)">
    <rect x="${W * 0.08}" y="${H * 0.52}" width="${W * 0.62}" height="${H * 0.14}" rx="30" fill="#5AA9A0"/>
    <rect x="${W * 0.1}" y="${H * 0.6}" width="${W * 0.58}" height="${H * 0.12}" rx="24" fill="#6CBFB5"/>
    <rect x="${W * 0.14}" y="${H * 0.72}" width="16" height="${H * 0.04}" fill="#6B4E3D"/><rect x="${W * 0.62}" y="${H * 0.72}" width="16" height="${H * 0.04}" fill="#6B4E3D"/>
    <rect x="${W * 0.18}" y="${H * 0.54}" width="${W * 0.14}" height="${H * 0.08}" rx="18" fill="#F6D365"/>
  </g>
  <!-- 화분 -->
  <g filter="url(#sh)">
    <path d="M ${W * 0.76} ${H * 0.62} L ${W * 0.9} ${H * 0.62} L ${W * 0.88} ${H * 0.76} L ${W * 0.78} ${H * 0.76} Z" fill="#E07A5F"/>
    ${[-40, -15, 10, 35, 60].map((a, i) => `<ellipse cx="${W * 0.83}" cy="${H * 0.5}" rx="${W * 0.025}" ry="${H * 0.1}" transform="rotate(${a} ${W * 0.83} ${H * 0.61})" fill="${i % 2 ? '#3D9970' : '#2E7D5B'}"/>`).join('')}
  </g>
  <!-- 청소 스프레이 -->
  <g filter="url(#sh)" transform="translate(${W * 0.42} ${H * 0.76})">
    <rect x="0" y="${H * 0.04}" width="${W * 0.1}" height="${H * 0.16}" rx="18" fill="#3A86FF"/>
    <rect x="${W * 0.02}" y="0" width="${W * 0.06}" height="${H * 0.05}" rx="6" fill="#FFFFFF"/>
    <rect x="${W * 0.06}" y="-${H * 0.015}" width="${W * 0.07}" height="${H * 0.025}" rx="6" fill="#FFFFFF"/>
    <rect x="${W * 0.015}" y="${H * 0.09}" width="${W * 0.07}" height="${H * 0.05}" rx="6" fill="#FFFFFF" opacity="0.85"/>
  </g>
  ${sparkles}
</svg>`;
}

function logo(W, H, { mark, text, color, sub }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <circle cx="${H / 2}" cy="${H / 2}" r="${H * 0.42}" fill="${color}"/>
  ${mark}
  <text x="${H * 1.08}" y="${H * 0.58}" font-family="P" font-weight="900" font-size="${H * 0.36}" fill="#FFFFFF" letter-spacing="-2">${text}</text>
  <text x="${H * 1.1}" y="${H * 0.82}" font-family="P" font-weight="600" font-size="${H * 0.12}" fill="#FFFFFF" opacity="0.8" letter-spacing="6">${sub}</text>
</svg>`;
}

function testPattern(W, H, label) {
  // 비율 검증용: 격자 + 원(찌그러지면 타원이 됨) + 중앙 표시
  let grid = '';
  for (let x = 0; x <= W; x += 100) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>`;
  for (let y = 0; y <= H; y += 100) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3F37C9"/><stop offset="1" stop-color="#F72585"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>${grid}
  <circle cx="${W / 2}" cy="${H / 2}" r="${Math.min(W, H) * 0.3}" fill="none" stroke="#FFFFFF" stroke-width="16"/>
  <text x="${W / 2}" y="${H / 2 + 30}" text-anchor="middle" font-family="P" font-weight="900" font-size="${Math.min(W, H) * 0.08}" fill="#FFFFFF">${label}</text>
  <text x="40" y="90" font-family="P" font-weight="800" font-size="60" fill="#FFFFFF">왼쪽 위</text>
  <text x="${W - 40}" y="${H - 40}" text-anchor="end" font-family="P" font-weight="800" font-size="60" fill="#FFFFFF">오른쪽 아래</text>
</svg>`;
}

const cupMark = (H) => `<path d="M ${H * 0.3} ${H * 0.4} h ${H * 0.34} v ${H * 0.16} a ${H * 0.17} ${H * 0.14} 0 0 1 -${H * 0.34} 0 Z" fill="#FFFFFF"/><path d="M ${H * 0.64} ${H * 0.44} q ${H * 0.1} 0 ${H * 0.08} ${H * 0.08} q -${H * 0.02} ${H * 0.05} -${H * 0.08} ${H * 0.04}" stroke="#FFFFFF" stroke-width="${H * 0.035}" fill="none"/>`;
const leafMark = (H) => `<path d="M ${H * 0.5} ${H * 0.22} C ${H * 0.78} ${H * 0.4}, ${H * 0.66} ${H * 0.72}, ${H * 0.5} ${H * 0.78} C ${H * 0.34} ${H * 0.72}, ${H * 0.22} ${H * 0.4}, ${H * 0.5} ${H * 0.22} Z" fill="#FFFFFF"/>`;
const sparkleMark = (H) => { const x = H / 2, y = H / 2, s = H * 0.28; return `<path d="M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z" fill="#FFFFFF"/>`; };

const jobs = [
  { out: 'public/samples/coffee-hero.jpg', w: 1800, h: 1200, svg: coffeeHero(1800, 1200) },
  { out: 'public/samples/coffee-pour.jpg', w: 1080, h: 1440, svg: coffeePour(1080, 1440) },
  { out: 'public/samples/coffee-beans.jpg', w: 1400, h: 1400, svg: beansSquare(1400, 1400) },
  { out: 'public/samples/market.jpg', w: 1800, h: 1200, svg: market(1800, 1200) },
  { out: 'public/samples/cleaning.jpg', w: 1200, h: 1500, svg: cleaning(1200, 1500) },
  { out: 'public/samples/logo-onggi.png', w: 900, h: 260, svg: logo(900, 260, { mark: cupMark(260), text: '온기 로스터리', color: '#C0502A', sub: 'ONGGI ROASTERY' }), png: true },
  { out: 'public/samples/logo-market.png', w: 900, h: 260, svg: logo(900, 260, { mark: leafMark(260), text: '성수 가을장터', color: '#2E7D5B', sub: 'SEONGSU MARKET' }), png: true },
  { out: 'public/samples/logo-clean.png', w: 900, h: 260, svg: logo(900, 260, { mark: sparkleMark(260), text: '반짝 홈케어', color: '#3A86FF', sub: 'BANJJAK HOME CARE' }), png: true },
  { out: 'tests/fixtures/panorama-3000x1000.jpg', w: 3000, h: 1000, svg: testPattern(3000, 1000, '가로형 3:1') },
  { out: 'tests/fixtures/tall-900x1800.jpg', w: 900, h: 1800, svg: testPattern(900, 1800, '세로형 1:2') },
];

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage();
for (const j of jobs) {
  await page.setViewportSize({ width: j.w, height: j.h });
  const html = `<!doctype html><html><head><style>
    @font-face { font-family: P; src: url('${fontUrl('Pretendard-Black.woff2')}'); font-weight: 900; }
    @font-face { font-family: P; src: url('${fontUrl('Pretendard-ExtraBold.woff2')}'); font-weight: 800; }
    @font-face { font-family: P; src: url('${fontUrl('Pretendard-SemiBold.woff2')}'); font-weight: 600; }
    @font-face { font-family: P; src: url('${fontUrl('Pretendard-Medium.woff2')}'); font-weight: 500; }
    html,body{margin:0;background:transparent} svg{display:block}
  </style></head><body>${j.svg}</body></html>`;
  // file:// 폰트를 읽기 위해 파일로 저장 후 연다
  const tmp = join(root, 'public/fonts/.render.html');
  writeFileSync(tmp, html);
  await page.goto('file://' + tmp);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.fonts].map((f) => f.load())); });
  mkdirSync(dirname(join(root, j.out)), { recursive: true });
  const buf = await page.screenshot({ type: j.png ? 'png' : 'jpeg', quality: j.png ? undefined : 90, omitBackground: !!j.png, clip: { x: 0, y: 0, width: j.w, height: j.h } });
  writeFileSync(join(root, j.out), buf);
  console.log('생성:', j.out);
}
await browser.close();
rmSync(join(root, 'public/fonts/.render.html'), { force: true });
