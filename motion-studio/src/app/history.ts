// 실행 취소/다시 실행. 같은 입력칸에서 연속으로 타이핑한 변경은 하나로 묶는다.
import { useCallback, useRef, useState } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 150;
const COALESCE_MS = 1200;

export function useHistory<T>(initial: T) {
  const [h, setH] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });
  const last = useRef<{ key?: string; at: number }>({ at: 0 });

  /** coalesce: 같은 키로 짧은 시간 안에 반복되면 기록을 새로 만들지 않고 덮어쓴다 */
  const set = useCallback((updater: T | ((prev: T) => T), coalesce?: string) => {
    // 병합 여부는 업데이트 함수 밖에서 결정한다(업데이트 함수는 순수해야 함)
    const now = Date.now();
    const merge = !!coalesce && last.current.key === coalesce && now - last.current.at < COALESCE_MS;
    last.current = { key: coalesce, at: now };
    setH((cur) => {
      const next = typeof updater === 'function' ? (updater as (p: T) => T)(cur.present) : updater;
      if (Object.is(next, cur.present)) return cur;
      if (merge) return { ...cur, present: next, future: [] };
      return { past: [...cur.past, cur.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { at: 0 };
    setH((cur) => {
      if (!cur.past.length) return cur;
      const prev = cur.past[cur.past.length - 1];
      return { past: cur.past.slice(0, -1), present: prev, future: [cur.present, ...cur.future] };
    });
  }, []);

  const redo = useCallback(() => {
    last.current = { at: 0 };
    setH((cur) => {
      if (!cur.future.length) return cur;
      const [next, ...rest] = cur.future;
      return { past: [...cur.past, cur.present], present: next, future: rest };
    });
  }, []);

  /** 기록 없이 교체(불러오기, 저장 시각 갱신 등) */
  const replace = useCallback((value: T, clear = false) => {
    setH((cur) => (clear ? { past: [], present: value, future: [] } : { ...cur, present: value }));
  }, []);

  return { state: h.present, set, undo, redo, replace, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
