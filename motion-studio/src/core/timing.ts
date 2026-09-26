// 장면별 타이밍 계산.
// - 요소 등장 애니메이션은 "초" 단위로 고정되어 영상 길이가 바뀌어도 늘어나거나 빨라지지 않는다.
// - 영상 길이 변화는 "머무는 시간(읽는 시간)"에만 반영된다.
// - 글자 수로 최소 노출 시간을 계산해, 모자라면 경고한다.
import { entranceEnd, type MotionProfile } from './motion';
import type { Scene, SceneKind, SceneLength } from './types';

const KIND_WEIGHT: Record<SceneKind, number> = { intro: 1.0, feature: 1.15, highlight: 0.85, cta: 1.05 };
const LENGTH_WEIGHT: Record<SceneLength, number> = { short: 0.7, normal: 1, long: 1.45 };

/** 템플릿이 장면별 요소 개수(등장 순서 수)를 알려주지 않을 때의 기본값 */
export const DEFAULT_ELEMENT_COUNT: Record<SceneKind, number> = { intro: 4, feature: 4, highlight: 3, cta: 4 };

export interface SceneTiming {
  sceneId: string;
  index: number;
  start: number; // 영상 기준 시작(초) — 들어오는 전환 포함
  end: number; // 영상 기준 끝(초) — 나가는 전환 포함
  dur: number;
  enterDelay: number; // 장면 기준, 요소 등장 시작
  readyAt: number; // 장면 기준, 모든 요소가 등장 완료된 시점
  minNeeded: number; // 읽기에 필요한 최소 길이
  tooShort: boolean;
}

export interface Timeline {
  duration: number;
  transitionDur: number;
  scenes: SceneTiming[];
}

export function readingTime(scene: Scene): number {
  const text = `${scene.title} ${scene.body} ${scene.kind === 'cta' ? scene.button ?? '' : ''}`;
  const chars = text.replace(/\s+/g, '').length;
  // 한국어 자막 권장 읽기 속도(초당 약 12자) + 인지 여유
  return Math.max(1.2, 0.5 + chars / 12);
}

export function computeTimeline(
  scenes: Scene[],
  duration: number,
  mp: MotionProfile,
  elementCount: (s: Scene) => number = (s) => DEFAULT_ELEMENT_COUNT[s.kind],
): Timeline {
  const n = scenes.length;
  if (n === 0) return { duration, transitionDur: 0, scenes: [] };
  const T = n > 1 ? Math.min(mp.transitionDur, duration / n / 3) : 0;
  const totalWindows = duration + (n - 1) * T;

  const delays = scenes.map((_, i) => (i === 0 ? 0.25 : T * 0.6));
  const readyAts = scenes.map((s, i) => entranceEnd(mp, delays[i], elementCount(s)));
  // 글은 등장하는 동안에도 읽기 시작하므로, 등장 시간과 읽기 시간 중 긴 쪽 + 여유를 확보한다
  const mins = scenes.map((s, i) => delays[i] + Math.max(readyAts[i] - delays[i], readingTime(s)) + 0.4 + (i < n - 1 ? T : 0.3));
  const weights = scenes.map((s) => KIND_WEIGHT[s.kind] * LENGTH_WEIGHT[s.length]);

  // 워터필링: 최소 시간을 보장하면서 남는 시간을 가중치대로 분배
  const durs = new Array<number>(n).fill(0);
  const fixed = new Array<boolean>(n).fill(false);
  const sumMin = mins.reduce((a, b) => a + b, 0);
  if (sumMin >= totalWindows) {
    const k = totalWindows / sumMin;
    for (let i = 0; i < n; i++) durs[i] = mins[i] * k;
  } else {
    for (let iter = 0; iter < n + 1; iter++) {
      const freeW = weights.reduce((a, w, i) => a + (fixed[i] ? 0 : w), 0);
      const used = durs.reduce((a, d, i) => a + (fixed[i] ? d : 0), 0);
      const remain = totalWindows - used;
      let changed = false;
      for (let i = 0; i < n; i++) {
        if (fixed[i]) continue;
        const d = (remain * weights[i]) / freeW;
        if (d < mins[i]) {
          durs[i] = mins[i];
          fixed[i] = true;
          changed = true;
        } else durs[i] = d;
      }
      if (!changed) break;
    }
  }

  const out: SceneTiming[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const start = cursor;
    const end = start + durs[i];
    out.push({
      sceneId: scenes[i].id,
      index: i,
      start,
      end,
      dur: durs[i],
      enterDelay: delays[i],
      readyAt: readyAts[i],
      minNeeded: mins[i],
      tooShort: durs[i] + 1e-6 < mins[i] * 0.98,
    });
    cursor = end - T;
  }
  // 누적 오차 보정: 마지막 장면을 정확히 duration에 맞춘다
  const last = out[n - 1];
  last.end = duration;
  last.dur = last.end - last.start;
  return { duration, transitionDur: T, scenes: out };
}

export interface ActiveScene {
  timing: SceneTiming;
  localT: number;
}

export interface FrameState {
  /** 현재 장면(전환 중이면 나가는 장면) */
  current: ActiveScene;
  /** 전환 중일 때 들어오는 장면 */
  incoming?: ActiveScene;
  /** 전환 진행도 0~1 (곡선 적용 전) */
  transition: number;
}

export function frameState(tl: Timeline, t: number): FrameState {
  const s = tl.scenes;
  const tt = Math.min(Math.max(t, 0), tl.duration - 1e-6);
  for (let i = 0; i < s.length; i++) {
    const cur = s[i];
    const next = s[i + 1];
    if (next && tt >= next.start && tt < cur.end) {
      return {
        current: { timing: cur, localT: tt - cur.start },
        incoming: { timing: next, localT: tt - next.start },
        transition: (tt - next.start) / (cur.end - next.start),
      };
    }
    if (tt >= cur.start && tt < cur.end) {
      return { current: { timing: cur, localT: tt - cur.start }, transition: 0 };
    }
  }
  const lastT = s[s.length - 1];
  return { current: { timing: lastT, localT: tt - lastT.start }, transition: 0 };
}

/** 장면 편집 시 미리보기를 멈춰 둘 "대표 시점" — 모든 요소가 보이는 순간 */
export function sceneHeroTime(tl: Timeline, index: number): number {
  const s = tl.scenes[index];
  if (!s) return 0;
  const exitStart = index < tl.scenes.length - 1 ? s.dur - tl.transitionDur : s.dur;
  const local = Math.min(s.readyAt + 0.35, Math.max(exitStart - 0.05, 0));
  return s.start + local;
}

/** 모든 장면을 읽기에 충분한 권장 영상 길이(초, 정수) */
export function recommendedDuration(scenes: Scene[], mp: MotionProfile, elementCount?: (s: Scene) => number): number {
  const probe = computeTimeline(scenes, 600, mp, elementCount);
  const n = scenes.length;
  const T = Math.min(mp.transitionDur, 600 / Math.max(1, n) / 3);
  const sumMin = probe.scenes.reduce((a, s) => a + s.minNeeded, 0);
  return Math.ceil(sumMin - (n - 1) * T + n * 0.35);
}
