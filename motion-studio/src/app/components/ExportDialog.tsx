// MP4 내보내기 창: 진행 상태, 완료 후 재생/저장, 실패 시 원인과 재시도
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../core/types';
import { ExportCancelled, exportMp4, type ExportProgress, type ExportResult } from '../exporter';
import { useStudio } from '../studio';

const STAGE_LABEL = {
  prepare: '글꼴과 사진을 준비하는 중',
  render: '장면을 한 장씩 그리는 중',
  encode: 'MP4 파일로 묶는 중',
  done: '완료',
};

export function ExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { renderer, images } = useStudio();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const started = useRef(performance.now());

  useEffect(() => {
    const ac = new AbortController();
    abort.current = ac;
    setError(null);
    setResult(null);
    started.current = performance.now();
    exportMp4(project, renderer, images, setProgress, ac.signal).then(setResult, (e) => {
      if (e instanceof ExportCancelled) return;
      setError((e as Error).message);
    });
    return () => ac.abort();
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = progress ? Math.round((progress.stage === 'render' ? progress.done / progress.total * 0.92 : progress.stage === 'encode' ? 0.95 : progress.stage === 'done' ? 1 : 0.01) * 100) : 0;
  const elapsed = (performance.now() - started.current) / 1000;
  const eta = progress?.stage === 'render' && progress.done > 10 ? (elapsed / progress.done) * (progress.total - progress.done) : null;

  return (
    <div className="modal-back">
      <div className="modal" data-testid="export-dialog">
        <h3>MP4로 저장하기</h3>
        {!result && !error && (
          <>
            <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            <div className="progress-text" data-testid="export-progress">
              {progress ? STAGE_LABEL[progress.stage] : '시작하는 중'}
              {progress?.stage === 'render' && ` · ${progress.done} / ${progress.total} 프레임`}
              {eta !== null && ` · 약 ${Math.ceil(eta)}초 남음`}
            </div>
            <p className="muted">1920×1080, {project.duration}초, 초당 {project.fps}프레임으로 만들어요. 창을 닫지 말고 잠시 기다려 주세요.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => { abort.current?.abort(); onClose(); }}>취소</button>
            </div>
          </>
        )}
        {error && (
          <div data-testid="export-error">
            <div className="notice warn"><b>저장하지 못했어요.</b><br />{error}</div>
            <ul className="tips">
              <li>서버 터미널 창(npm run dev)이 켜져 있는지 확인해 주세요.</li>
              <li>사진을 다시 선택하거나, 디스크 공간이 충분한지 확인해 주세요.</li>
              <li>문제가 계속되면 페이지를 새로고침한 뒤 다시 시도해 주세요. 편집 내용은 자동 저장되어 있어요.</li>
            </ul>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>닫기</button>
              <button className="btn primary" data-testid="export-retry" onClick={() => setAttempt((a) => a + 1)}>다시 시도</button>
            </div>
          </div>
        )}
        {result && (
          <div data-testid="export-done">
            <video src={result.url} controls className="result-video" />
            <div className="result-info" data-testid="export-info">
              {result.width}×{result.height} · {result.duration.toFixed(2)}초 · {Math.round(result.fps)}fps · {result.codec.toUpperCase()} · {(result.size / 1024 / 1024).toFixed(1)}MB
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>닫기</button>
              <a className="btn primary" href={result.url} download={result.fileName} data-testid="download-link">⬇ 내 컴퓨터에 저장</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
