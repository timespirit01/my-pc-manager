// 장면 카드 목록: 선택, 끌어서 순서 바꾸기, 추가/복제/삭제
import { useState } from 'react';
import type { LayoutReport } from '../../core/templates/types';
import { sceneHeroTime, type Timeline } from '../../core/timing';
import type { Project, SceneKind } from '../../core/types';
import { LiveCanvas } from './LiveCanvas';

export const KIND_LABEL: Record<SceneKind, string> = {
  intro: '도입',
  feature: '핵심 내용',
  highlight: '강조',
  cta: '행동 유도',
};

export function SceneStrip({ project, timeline, reports, selected, onSelect, onMove, onAdd, onDelete, onDuplicate }: {
  project: Project;
  timeline: Timeline;
  reports: LayoutReport[];
  selected: number;
  onSelect: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onAdd: (kind: SceneKind) => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);

  return (
    <div className="strip" data-testid="scene-strip">
      {project.scenes.map((s, i) => {
        const tm = timeline.scenes[i];
        const warn = (reports[i]?.overflow.length ?? 0) > 0 || tm?.tooShort;
        return (
          <div
            key={s.id}
            className={`scene-card ${selected === i ? 'selected' : ''} ${over === i && drag !== null && drag !== i ? 'drop' : ''}`}
            draggable
            onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
            onDragOver={(e) => { e.preventDefault(); setOver(i); }}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onMove(drag, i); setDrag(null); setOver(null); }}
            onDragEnd={() => { setDrag(null); setOver(null); }}
            onClick={() => onSelect(i)}
            data-testid="scene-card"
          >
            <div className="scene-thumb">
              <LiveCanvas project={project} time={sceneHeroTime(timeline, i)} maxPixelWidth={400} />
              {warn && <span className="warn-dot" title="확인이 필요해요">!</span>}
            </div>
            <div className="scene-meta">
              <b>{i + 1}. {KIND_LABEL[s.kind]}</b>
              <span>{tm ? `${(tm.end - tm.start - (i < project.scenes.length - 1 ? timeline.transitionDur / 2 : 0) - (i > 0 ? timeline.transitionDur / 2 : 0)).toFixed(1)}초` : ''}</span>
            </div>
            <div className="scene-title-preview">{s.title || '(문구 없음)'}</div>
            {selected === i && (
              <div className="scene-actions" onClick={(e) => e.stopPropagation()}>
                <button disabled={i === 0} onClick={() => onMove(i, i - 1)} title="앞으로" aria-label="앞으로 이동">◀</button>
                <button disabled={i === project.scenes.length - 1} onClick={() => onMove(i, i + 1)} title="뒤로" aria-label="뒤로 이동">▶</button>
                <button onClick={() => onDuplicate(i)} title="복제">복제</button>
                <button disabled={project.scenes.length <= 2} onClick={() => onDelete(i)} title="삭제">삭제</button>
              </div>
            )}
          </div>
        );
      })}
      <div className="scene-add">
        <button className="add-btn" onClick={() => setMenu((m) => !m)} data-testid="add-scene">＋<span>장면 추가</span></button>
        {menu && (
          <div className="add-menu" onMouseLeave={() => setMenu(false)}>
            {(['feature', 'highlight', 'intro', 'cta'] as SceneKind[]).map((k) => (
              <button key={k} onClick={() => { onAdd(k); setMenu(false); }}>{KIND_LABEL[k]} 장면</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
