import { useEffect, useState } from 'react';
import { getTemplate } from '../../core/templates';
import { deleteProject, listProjects, type ProjectSummary } from '../api';
import type { WizardStart } from './Wizard';

export function Home({ onStart, onOpen }: { onStart: (s: WizardStart) => void; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    listProjects().then(setProjects, (e) => { setError(e.message); setProjects([]); });
  useEffect(() => { refresh(); }, []);

  return (
    <div className="home">
      <header className="home-hero">
        <div className="brand-badge">모션 스튜디오</div>
        <h1>홍보 영상, <em>몇 분이면</em> 완성돼요</h1>
        <p>문구와 사진만 넣으면 전문가가 만든 것 같은 15~30초 영상이 자동으로 만들어집니다.<br />편집 경험이 없어도 괜찮아요.</p>
        <div className="hero-actions">
          <button className="btn primary xl" data-testid="try-sample" onClick={() => onStart({ sample: true })}>
            ▶ 샘플로 바로 체험하기
          </button>
          <button className="btn xl" data-testid="new-project" onClick={() => onStart({ sample: false })}>
            ＋ 내 자료로 새로 만들기
          </button>
        </div>
        <ol className="steps-inline">
          <li><b>1</b> 목적 고르기</li>
          <li><b>2</b> 문구·사진 넣기</li>
          <li><b>3</b> 스타일 고르기</li>
          <li><b>4</b> 다듬고 MP4 저장</li>
        </ol>
      </header>

      <section className="recent">
        <h2>최근 프로젝트</h2>
        {error && <div className="notice warn">{error}</div>}
        {projects === null && <div className="muted">불러오는 중…</div>}
        {projects && projects.length === 0 && !error && <div className="muted">아직 저장된 프로젝트가 없어요. 샘플로 먼저 체험해 보세요!</div>}
        <div className="recent-grid">
          {projects?.map((p) => (
            <div key={p.id} className="recent-card" data-testid="recent-card">
              <button className="recent-open" onClick={() => onOpen(p.id)}>
                <div className="recent-thumb" style={p.thumbnail ? { backgroundImage: `url(${p.thumbnail})` } : undefined} />
                <div className="recent-name">{p.name}</div>
                <div className="recent-meta">
                  {getTemplate(p.templateId).name} · {p.duration}초 · 장면 {p.sceneCount}개<br />
                  {new Date(p.updatedAt).toLocaleString('ko-KR')}
                </div>
              </button>
              <button
                className="recent-del"
                title="삭제"
                onClick={async () => {
                  if (!confirm(`'${p.name}' 프로젝트를 삭제할까요?`)) return;
                  await deleteProject(p.id).catch((e) => alert(e.message));
                  refresh();
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
