// 편집 화면: 큰 미리보기 + 장면 카드 목록 + 수정 패널. 타임라인/키프레임은 노출하지 않는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { makeScene, splitScene } from '../../core/compose';
import { clampDuration, DURATION_MAX, switchTemplate } from '../../core/project';
import { getTemplate } from '../../core/templates';
import { sceneHeroTime } from '../../core/timing';
import type { Asset, Project, Scene, SceneKind } from '../../core/types';
import { saveProject } from '../api';
import { ExportDialog } from '../components/ExportDialog';
import { GlobalPanel } from '../components/GlobalPanel';
import { Player, type SeekRequest } from '../components/Player';
import { ScenePanel } from '../components/ScenePanel';
import { KIND_LABEL, SceneStrip } from '../components/SceneStrip';
import { useHistory } from '../history';
import { useStudio } from '../studio';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

const stripTime = (p: Project) => JSON.stringify({ ...p, updatedAt: '' });

export function Editor({ initial, onExit }: { initial: Project; onExit: () => void }) {
  const { renderer, images } = useStudio();
  const hist = useHistory<Project>(initial);
  const project = hist.state;
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<'scene' | 'global'>('scene');
  const [seek, setSeek] = useState<SeekRequest>(() => ({ t: sceneHeroTime(renderer.timeline(initial), 0), nonce: 0 }));
  const [exporting, setExporting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const lastSaved = useRef(stripTime(initial));

  const timeline = useMemo(() => renderer.timeline(project), [renderer, project]);
  const reports = useMemo(() => renderer.reports(project), [renderer, project]);
  const sel = Math.min(selected, project.scenes.length - 1);

  // 장면을 고르거나 고치면 그 장면의 "모든 요소가 보이는 순간"으로 미리보기를 옮긴다
  const focusScene = useCallback((i: number, p: Project = project) => {
    setSelected(i);
    setSeek((s) => ({ t: sceneHeroTime(renderer.timeline(p), i), nonce: s.nonce + 1 }));
  }, [project, renderer]);

  const [pendingFocus, setPendingFocus] = useState<number | null>(null);

  const update = useCallback((fn: (p: Project) => Project, coalesce?: string, focus?: number) => {
    hist.set(fn, coalesce);
    if (focus !== undefined) setPendingFocus(focus);
  }, [hist]);

  // 편집 후에는 바뀐 프로젝트 기준으로 해당 장면의 대표 시점으로 이동
  useEffect(() => {
    if (pendingFocus === null) return;
    const i = Math.min(pendingFocus, project.scenes.length - 1);
    setSeek((s) => ({ t: sceneHeroTime(renderer.timeline(project), i), nonce: s.nonce + 1 }));
    setPendingFocus(null);
  }, [pendingFocus, project, renderer]);

  const updateScene = (i: number, patch: Partial<Scene>, coalesce?: string) =>
    update((p) => ({ ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }), coalesce, i);

  const addAsset = (a: Asset) => update((p) => ({ ...p, assets: { ...p.assets, [a.id]: a } }));

  // ---------- 자동 저장 ----------
  const doSave = useCallback(async (p: Project) => {
    setSaveState('saving');
    try {
      const r = await saveProject(p);
      lastSaved.current = stripTime(p);
      hist.replace({ ...p, updatedAt: r.updatedAt });
      setSaveState('saved');
      setSaveError(null);
    } catch (e) {
      setSaveState('error');
      setSaveError((e as Error).message);
    }
  }, [hist]);

  useEffect(() => {
    if (stripTime(project) === lastSaved.current) return;
    setSaveState('dirty');
    const t = setTimeout(() => doSave(project), 900);
    return () => clearTimeout(t);
  }, [project, doSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (stripTime(project) !== lastSaved.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [project]);

  // ---------- 단축키 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return; // 한글 조합 중에는 무시
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); hist.undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); hist.redo(); }
      else if (k === 's') { e.preventDefault(); doSave(project); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hist, doSave, project]);

  // ---------- 검증/자동화용 훅 ----------
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__studio = {
      project,
      timeline,
      reports,
      renderFrameDataURL: async (t: number, width = 1920) => {
        await images.ensure(project);
        const c = document.createElement('canvas');
        c.width = width;
        c.height = Math.round((width * 1080) / 1920);
        renderer.renderFrame(c.getContext('2d')!, project, t, images.get, width / 1920);
        return c.toDataURL('image/png');
      },
    };
  }, [project, timeline, reports, renderer, images]);

  const sceneLabels = project.scenes.map((s) => KIND_LABEL[s.kind]);
  const scene = project.scenes[sel];
  const canSplit = !!scene && splitScene(scene) !== null;

  const saveLabel = { saved: '저장됨', dirty: '저장 대기', saving: '저장 중…', error: '저장 실패' }[saveState];

  return (
    <div className="editor">
      <header className="topbar">
        <button className="btn ghost" onClick={onExit} title="처음 화면">← 처음</button>
        <input
          className="project-name"
          value={project.name}
          aria-label="프로젝트 이름"
          onChange={(e) => update((p) => ({ ...p, name: e.target.value }), 'name')}
        />
        <span className={`save-state ${saveState}`} data-testid="save-state" title={saveError ?? ''}>
          {saveLabel}
          {saveState === 'error' && <button className="btn tiny" onClick={() => doSave(project)}>다시 저장</button>}
        </span>
        <div className="spacer" />
        <button className="btn" onClick={hist.undo} disabled={!hist.canUndo} data-testid="undo" title="실행 취소 (Ctrl+Z)">↶ 실행 취소</button>
        <button className="btn" onClick={hist.redo} disabled={!hist.canRedo} data-testid="redo" title="다시 실행 (Ctrl+Shift+Z)">↷ 다시 실행</button>
        <button className="btn" onClick={() => doSave(project)} data-testid="save">저장</button>
        <button className="btn primary" onClick={() => setExporting(true)} data-testid="export">MP4로 저장</button>
      </header>

      <div className="editor-main">
        <section className="stage-col">
          <Player project={project} timeline={timeline} seek={seek} sceneLabels={sceneLabels} />
          <SceneStrip
            project={project}
            timeline={timeline}
            reports={reports}
            selected={sel}
            onSelect={(i) => { setTab('scene'); focusScene(i); }}
            onMove={(from, to) => {
              update((p) => {
                const scenes = [...p.scenes];
                const [s] = scenes.splice(from, 1);
                scenes.splice(to, 0, s);
                return { ...p, scenes };
              }, undefined, to);
              setSelected(to);
            }}
            onAdd={(kind: SceneKind) => {
              const at = kind === 'cta' ? project.scenes.length : kind === 'intro' ? 0 : Math.max(1, project.scenes.length - 1);
              const defaults: Record<SceneKind, Partial<Scene>> = {
                intro: { title: project.brandName || '새 제목' },
                feature: { title: '새 소제목', body: '설명을 적어 주세요', imageId: project.scenes.find((s) => s.imageId)?.imageId },
                highlight: { title: '강조 문구', length: 'short' },
                cta: { title: '지금 만나보세요', button: '자세히 보기' },
              };
              update((p) => {
                const scenes = [...p.scenes];
                scenes.splice(at, 0, makeScene(kind, defaults[kind]));
                return { ...p, scenes };
              }, undefined, at);
              setSelected(at);
              setTab('scene');
            }}
            onDelete={(i) => {
              update((p) => ({ ...p, scenes: p.scenes.filter((_, j) => j !== i) }), undefined, Math.max(0, i - 1));
              setSelected(Math.max(0, i - 1));
            }}
            onDuplicate={(i) => {
              update((p) => {
                const scenes = [...p.scenes];
                scenes.splice(i + 1, 0, { ...scenes[i], id: makeScene(scenes[i].kind).id, crop: { ...scenes[i].crop } });
                return { ...p, scenes };
              }, undefined, i + 1);
              setSelected(i + 1);
            }}
          />
        </section>

        <aside className="side">
          <div className="tabs">
            <button className={tab === 'scene' ? 'on' : ''} onClick={() => setTab('scene')} data-testid="tab-scene">선택한 장면</button>
            <button className={tab === 'global' ? 'on' : ''} onClick={() => setTab('global')} data-testid="tab-global">영상 전체</button>
          </div>
          <div className="side-body">
            {tab === 'scene' ? (
              <ScenePanel
                project={project}
                index={sel}
                report={reports[sel]}
                timing={timeline.scenes[sel]}
                canSplit={canSplit}
                onChange={(patch, key) => updateScene(sel, patch, key)}
                onAddAsset={addAsset}
                onSplit={() => {
                  const parts = splitScene(project.scenes[sel]);
                  if (!parts) return;
                  update((p) => {
                    const scenes = [...p.scenes];
                    scenes.splice(sel, 1, ...parts);
                    // 장면이 늘었으니 읽을 시간을 조금 더 확보
                    return { ...p, scenes, duration: clampDuration(p.duration + 3) };
                  }, undefined, sel);
                }}
                onLonger={() => update((p) => ({ ...p, duration: clampDuration(p.duration + 3) }), undefined, sel)}
              />
            ) : (
              <GlobalPanel
                project={project}
                onTemplate={(id) => update((p) => switchTemplate(p, id, { colors: false, motion: true }), undefined, sel)}
                onColors={(c, key) => update((p) => ({ ...p, colors: c }), key, sel)}
                onMotion={(m) => update((p) => ({ ...p, motion: m }))}
                onDuration={(d) => update((p) => ({ ...p, duration: clampDuration(d) }), 'duration', sel)}
                onBrand={(name) => update((p) => ({ ...p, brandName: name }), 'brand', 0)}
                onLogo={(a) => update((p) => (a ? { ...p, logoId: a.id, assets: { ...p.assets, [a.id]: a } } : { ...p, logoId: undefined }), undefined, 0)}
              />
            )}
            {project.duration >= DURATION_MAX && timeline.scenes.some((s) => s.tooShort) && (
              <div className="notice warn">최대 길이(30초)에서도 시간이 모자라요. 장면 수를 줄이거나 문구를 짧게 해 주세요.</div>
            )}
          </div>
          <div className="side-foot muted">{getTemplate(project.templateId).name} · 1920×1080 · {project.duration}초 · 장면 {project.scenes.length}개</div>
        </aside>
      </div>

      {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} />}
    </div>
  );
}
