// 큰 미리보기 + 재생/일시정지/구간 탐색
import { useEffect, useRef, useState } from 'react';
import type { Timeline } from '../../core/timing';
import type { Project } from '../../core/types';
import { LiveCanvas, type LiveCanvasHandle } from './LiveCanvas';

export interface SeekRequest { t: number; nonce: number }

const fmtTime = (t: number) => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export function Player({ project, timeline, seek, onPlayingChange, sceneLabels }: {
  project: Project;
  timeline: Timeline;
  seek: SeekRequest;
  onPlayingChange?: (playing: boolean) => void;
  sceneLabels: string[];
}) {
  const canvas = useRef<LiveCanvasHandle>(null);
  const [time, setTime] = useState(seek.t);
  const [playing, setPlaying] = useState(false);
  const timeRef = useRef(time);
  timeRef.current = time;

  useEffect(() => {
    setPlaying(false);
    setTime(Math.min(seek.t, project.duration));
  }, [seek.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onPlayingChange?.(playing); }, [playing, onPlayingChange]);

  // 재생: 실제 경과 시간 기준(프레임 드랍이 있어도 속도 유지)
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let t = timeRef.current + dt;
      if (t >= project.duration) {
        t = project.duration;
        setTime(t);
        setPlaying(false);
        return;
      }
      setTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, project.duration]);

  // 스페이스바 재생/정지 (입력 중이 아닐 때)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== 'Space' || el.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggle = () => {
    if (!playing && timeRef.current >= project.duration - 0.05) setTime(0);
    setPlaying((p) => !p);
  };

  const t = Math.min(time, project.duration);
  return (
    <div className="player">
      <div className="player-stage">
        <LiveCanvas ref={canvas} project={project} time={t} className="player-canvas" />
      </div>
      <div className="player-controls">
        <button className="play-btn" onClick={toggle} data-testid="play-toggle" aria-label={playing ? '일시 정지' : '재생'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="scrub">
          <input
            type="range"
            min={0}
            max={project.duration}
            step={1 / project.fps}
            value={t}
            aria-label="재생 위치"
            data-testid="scrubber"
            onChange={(e) => { setPlaying(false); setTime(Number(e.target.value)); }}
          />
          <div className="scene-marks">
            {timeline.scenes.map((s, i) => {
              const next = timeline.scenes[i + 1];
              const end = next ? next.start + timeline.transitionDur / 2 : s.end;
              const start = i === 0 ? 0 : s.start + timeline.transitionDur / 2;
              return (
                <button
                  key={s.sceneId}
                  className={t >= start && t < end ? 'on' : ''}
                  style={{ left: `${(start / project.duration) * 100}%`, width: `${((end - start) / project.duration) * 100}%` }}
                  onClick={() => { setPlaying(false); setTime(start + 0.01); }}
                  title={sceneLabels[i]}
                >
                  <span>{sceneLabels[i]}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="time" data-testid="time-readout">{fmtTime(t)} / {fmtTime(project.duration)}</div>
      </div>
    </div>
  );
}
