// 고척스카이돔 공개 제원 + 좌석 구역 데이터
// 확인된 값: 서울시 보도자료·서울시설공단(펜스 거리/높이, 지붕 높이, 전광판 규격, 구역 번호 범위)
// 추정 값: 관람석 깊이·경사·층 높이·파울 지역 폭 (실시설 도면 비공개 → 사진/좌석수 기준 보정)

export const SPEC = {
  foulLine: 99,          // 좌·우 폴까지 (m) — 확인
  center: 122,           // 중앙 펜스까지 (m) — 확인
  fenceHeight: 4,        // 외야 펜스 높이 (m) — 확인
  roofHeight: 67.59,     // 그라운드~지붕 최고점 (m) — 확인
  mainBoard: { w: 22.4, h: 7.68 },   // 중앙 전광판 — 확인
  twinBoard: { w: 28.32, h: 12 },    // 쌍둥이 전광판(2017) — 확인
  officialSeats: 16744,  // 구단 공식 좌석수
  base: 27.432,          // 루간 거리
  mound: 18.44,          // 투수판 거리
  backstop: 19,          // 추정
  centerZ: -50,          // 관람석 배치 기준 중심(홈에서 중견 방향 50m) — 모델링용
};

export const GRADES = {
  RD: { name: 'R.d-club', color: '#d4a93c', price: [60000, 99000], note: '포수 뒤 최하단' },
  T1: { name: '1층 테이블석', color: '#e2733a', price: [55000, 88000] },
  T2: { name: '2층 테이블석', color: '#c9552f', price: null },
  DB: { name: '다크버건디석', color: '#5e1128', price: [20000, 28000] },
  BG: { name: '버건디석', color: '#a02445', price: [18000, 25000] },
  F3: { name: '3층 지정석', color: '#2f73c0', price: [14000, 21000], unverified: true },
  F4: { name: '4층 지정석', color: '#2f9e8f', price: [9000, 13000], unverified: true },
  OF: { name: '외야 지정석', color: '#5f9a3a', price: [9000, 13000], unverified: true },
};

// 각도 φ: 기준 중심에서 본 방위. 0°=중견, 90°=1루측, 180°=포수 뒤, 270°=3루측 (평면도 시계방향)
const IN_A = 78, IN_B = 282;      // 내야 스탠드 범위 (폴 부근 연결통로 제외)
const OF_A = -70, OF_B = 70;      // 외야 스탠드 범위

// d0: 그라운드 경계에서 바깥쪽 거리, y0: 첫 열 바닥 높이, rows/depth/rise: 열 수/열 깊이/단 높이
export const TIERS = [
  { id: 'IN1', floor: 1, zone: '내야', d0: 0, y0: 1.0, rows: 10, depth: 0.85, rise: 0.36, a: IN_A, b: IN_B, ground: true, parapet: 0.15 },
  { id: 'IN2', floor: 2, zone: '내야', d0: 10.5, y0: 5.0, rows: 6, depth: 0.85, rise: 0.45, a: IN_A, b: IN_B, ground: true, parapet: 0 },
  { id: 'IN3', floor: 3, zone: '내야', d0: 14.2, y0: 12.2, rows: 5, depth: 0.8, rise: 0.55, a: IN_A, b: IN_B, parapet: 0.7 },
  { id: 'IN4', floor: 4, zone: '내야', d0: 20, y0: 17.2, rows: 12, depth: 0.8, rise: 0.62, a: IN_A, b: IN_B, parapet: 0.7 },
  { id: 'OF1', floor: 1, zone: '외야', d0: 0.3, y0: 4.2, rows: 6, depth: 0.8, rise: 0.4, a: OF_A, b: OF_B, ground: true, parapet: 0 },
  { id: 'OF2', floor: 2, zone: '외야', d0: 7.0, y0: 7.2, rows: 3, depth: 0.8, rise: 0.5, a: OF_A, b: OF_B, ground: true, parapet: 0.6 },
  { id: 'OF3', floor: 3, zone: '외야', d0: 8.6, y0: 12.6, rows: 4, depth: 0.8, rise: 0.55, a: -30, b: 30, parapet: 0.7 },   // 상단 외야는 쌍둥이 전광판 사이 중앙부만 (가상투어 확인)
  { id: 'OF4', floor: 4, zone: '외야', d0: 13.2, y0: 17.2, rows: 7, depth: 0.8, rise: 0.62, a: -30, b: 30, parapet: 0.7 },
];

// 실제 좌석 색 (공개 가상투어 화면 참고): 내야 하단 버건디, 테이블석 주황 계열, 2층 이상·외야는 밝은 회색
const REAL = { IN1: '#7d2330', premium: '#b4572a', IN2: '#c3c9d1', upper: '#b7bfca' };

function range(tier, first, count, a, b, gradeOf, extra = {}) {
  const out = [];
  const step = (b - a) / count;
  for (let i = 0; i < count; i++) {
    const id = String(first + i);
    out.push({ id, tier, a: a + i * step, b: a + (i + 1) * step, grade: gradeOf(first + i), ...extra });
  }
  return out;
}

const side = (phi) => {
  const p = ((phi % 360) + 360) % 360;
  if (p > 150 && p < 210) return '중앙(포수 뒤)';
  if (p >= 78 && p <= 150) return '1루측';
  if (p >= 210 && p <= 282) return '3루측';
  if (p < 25 || p > 335) return '중견';
  return p < 180 ? '우익' : '좌익';
};

export function buildSections() {
  const S = [];
  // 1층 내야 101~114 (1루 → 포수 뒤 → 3루, 시계방향)
  const s1 = range('IN1', 101, 14, IN_A, IN_B, (n) => (n >= 106 && n <= 109 ? 'DB' : 'BG'));
  // 106~109 앞쪽 4열은 프리미엄(R.d-club / 1층 테이블석)
  for (const s of s1) if (+s.id >= 106 && +s.id <= 109) s.rowFrom = 4;
  S.push(...s1);
  const pa = s1[5].a, pb = s1[8].b;
  S.push({ id: 'T1-1루', tier: 'IN1', a: pa, b: 168, grade: 'T1', rowTo: 4, pitch: 0.8 });
  S.push({ id: 'R.d', tier: 'IN1', a: 168, b: 192, grade: 'RD', rowTo: 4, pitch: 0.7 });
  S.push({ id: 'T1-3루', tier: 'IN1', a: 192, b: pb, grade: 'T1', rowTo: 4, pitch: 0.8 });
  // 2층 내야 201~210, 205·206 사이 테이블석 T01~07 / T11~17
  S.push(...range('IN2', 201, 5, IN_A, 164, (n) => (n >= 204 ? 'DB' : 'BG')));
  S.push({ id: 'T01~07', tier: 'IN2', a: 164, b: 180, grade: 'T2', pitch: 0.8 });
  S.push({ id: 'T11~17', tier: 'IN2', a: 180, b: 196, grade: 'T2', pitch: 0.8 });
  S.push(...range('IN2', 206, 5, 196, IN_B, (n) => (n <= 207 ? 'DB' : 'BG')));
  // 3층·4층 내야
  S.push(...range('IN3', 301, 22, IN_A, IN_B, () => 'F3'));
  S.push(...range('IN4', 401, 24, IN_A, IN_B, () => 'F4'));
  // 외야 (좌익 폴 쪽에서 시작해 시계방향)
  S.push(...range('OF1', 115, 18, OF_A, OF_B, () => 'OF'));
  S.push(...range('OF2', 211, 12, OF_A, OF_B, () => 'OF'));
  S.push(...range('OF3', 323, 12, -30, 30, () => 'OF'));
  S.push(...range('OF4', 425, 11, -30, 30, () => 'OF'));
  for (const s of S) { s.side = side((s.a + s.b) / 2); s.real = REAL[s.grade === 'RD' || s.grade === 'T1' ? 'premium' : s.tier] || REAL.upper; }
  return S;
}
