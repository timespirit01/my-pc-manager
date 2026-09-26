// 초보자용 선택지(움직임/속도/강조)를 실제 애니메이션 수치로 바꾸는 단일 지점.
// 모든 템플릿은 이 프로필만 사용하므로 영상 전체의 움직임이 일관된다.
import type { Emphasis, Feel, MotionSettings, Speed } from './types';

export type Ease = (t: number) => number;

export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** CSS cubic-bezier와 동일한 곡선 (Newton-Raphson 근사) */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // 수렴 실패 대비 이분법 보정
    let lo = 0, hi = 1;
    for (let i = 0; i < 12 && Math.abs(sx(t) - x) > 1e-5; i++) {
      if (sx(t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

export const easeOutBack = (overshoot: number): Ease => (t) => {
  const c3 = overshoot + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + overshoot * u * u;
};

export const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export interface MotionProfile {
  /** 요소가 들어올 때의 가속·감속 곡선 */
  enter: Ease;
  /** 장면 전환(패널·마스크 이동)의 곡선 */
  transition: Ease;
  /** 요소 등장 시간(초) */
  enterDur: number;
  /** 요소 사이 등장 간격(초) */
  stagger: number;
  /** 장면 전환 시간(초) */
  transitionDur: number;
  /** 등장 시 이동 거리(px, 1080p 기준) */
  distance: number;
  /** 등장 시작 배율 (1보다 작으면 커지며 등장) */
  scaleFrom: number;
  /** 사진이 장면 동안 천천히 확대되는 정도 */
  kenBurns: number;
  /** 강조 문구의 팝 강도 (0~1) */
  pop: number;
  /** 배경 장식 요소의 흔들림 폭(px) */
  drift: number;
}

const FEEL: Record<Feel, { enter: Ease; transition: Ease; enterDur: number; stagger: number; transitionDur: number }> = {
  // 차분하게: 긴 감속, 튀지 않음
  calm: { enter: cubicBezier(0.25, 0.1, 0.25, 1), transition: easeInOutSine, enterDur: 1.0, stagger: 0.18, transitionDur: 0.9 },
  // 부드럽게: 빠르게 출발해 길게 감속(expo-out)
  smooth: { enter: cubicBezier(0.16, 1, 0.3, 1), transition: cubicBezier(0.65, 0, 0.35, 1), enterDur: 0.85, stagger: 0.13, transitionDur: 0.75 },
  // 경쾌하게: 살짝 튕기는 오버슈트
  lively: { enter: easeOutBack(1.5), transition: cubicBezier(0.7, 0, 0.2, 1), enterDur: 0.65, stagger: 0.09, transitionDur: 0.6 },
};

/** 속도: 모든 시간 값에 곱해진다 */
export const SPEED_FACTOR: Record<Speed, number> = { slow: 1.35, normal: 1, fast: 0.72 };

const EMPHASIS: Record<Emphasis, { distance: number; scaleFrom: number; kenBurns: number; pop: number; drift: number }> = {
  low: { distance: 28, scaleFrom: 0.985, kenBurns: 0.035, pop: 0.3, drift: 8 },
  normal: { distance: 64, scaleFrom: 0.95, kenBurns: 0.07, pop: 0.6, drift: 16 },
  high: { distance: 130, scaleFrom: 0.88, kenBurns: 0.12, pop: 1, drift: 28 },
};

export function motionProfile(m: MotionSettings): MotionProfile {
  const f = FEEL[m.feel];
  const s = SPEED_FACTOR[m.speed];
  const e = EMPHASIS[m.emphasis];
  return {
    enter: f.enter,
    transition: f.transition,
    enterDur: f.enterDur * s,
    stagger: f.stagger * s,
    transitionDur: f.transitionDur * s,
    distance: e.distance,
    scaleFrom: e.scaleFrom,
    kenBurns: e.kenBurns,
    pop: e.pop,
    drift: e.drift,
  };
}

export interface EnterState {
  /** 곡선이 적용된 진행도 (lively일 때 1을 넘을 수 있음) */
  p: number;
  /** 0~1 선형 진행도 */
  raw: number;
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

/**
 * 요소 등장 상태. localT: 장면 시작 기준 시간(초), order: 등장 순서(0,1,2…)
 * 모든 템플릿의 모든 요소가 이 함수 하나로 움직인다.
 */
export function enter(
  mp: MotionProfile,
  localT: number,
  startDelay: number,
  order: number,
  dir: Direction = 'up',
  distanceScale = 1,
): EnterState {
  const t0 = startDelay + order * mp.stagger;
  const raw = clamp((localT - t0) / mp.enterDur);
  const p = mp.enter(raw);
  // 투명도는 곡선과 무관하게 앞부분에서 빠르게 올라온다(오버슈트 시 음수 방지)
  const opacity = clamp(raw * 2.2);
  const d = mp.distance * distanceScale * (1 - p);
  let dx = 0, dy = 0;
  if (dir === 'up') dy = d;
  else if (dir === 'down') dy = -d;
  else if (dir === 'left') dx = d;
  else if (dir === 'right') dx = -d;
  const scale = lerp(mp.scaleFrom, 1, p);
  return { p, raw, opacity, dx, dy, scale };
}

/** 등장 순서 n개가 모두 끝나는 시점(초) */
export function entranceEnd(mp: MotionProfile, startDelay: number, count: number): number {
  return startDelay + Math.max(0, count - 1) * mp.stagger + mp.enterDur;
}
