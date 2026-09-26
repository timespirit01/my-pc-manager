import { useEffect, useMemo, useState } from 'react';
import { normalizeProject } from '../core/project';
import { Renderer } from '../core/renderer';
import type { Project } from '../core/types';
import { loadProject } from './api';
import { ImageStore, loadFonts } from './resources';
import { Editor } from './screens/Editor';
import { Home } from './screens/Home';
import { Wizard, type WizardStart } from './screens/Wizard';
import { StudioContext } from './studio';

type Screen =
  | { name: 'home' }
  | { name: 'wizard'; start: WizardStart }
  | { name: 'editor'; project: Project };

export function App() {
  const studio = useMemo(() => ({ renderer: new Renderer(), images: new ImageStore() }), []);
  const [fontsReady, setFontsReady] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);

  useEffect(() => {
    loadFonts()
      .then(() => {
        studio.renderer.resetMeasure(); // 폰트 로드 후 글자 폭을 다시 잰다
        setFontsReady(true);
      })
      .catch((e) => setFontError(String(e?.message ?? e)));
  }, [studio]);

  // 주소(#/edit/<id>)로 프로젝트 다시 열기
  useEffect(() => {
    if (!fontsReady) return;
    const open = async () => {
      const m = location.hash.match(/^#\/edit\/([\w-]+)/);
      if (!m) {
        if (location.hash.startsWith('#/new')) return;
        setScreen((s) => (s.name === 'editor' ? { name: 'home' } : s));
        return;
      }
      setLoadingMsg('프로젝트를 여는 중…');
      try {
        const p = normalizeProject(await loadProject(m[1]));
        setScreen({ name: 'editor', project: p });
      } catch (e) {
        alert(`프로젝트를 열 수 없습니다: ${(e as Error).message}`);
        location.hash = '#/';
      } finally {
        setLoadingMsg(null);
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [fontsReady]);

  if (fontError) {
    return <div className="fullscreen-msg">글꼴을 불러오지 못했습니다: {fontError}<br />새로고침해 주세요.</div>;
  }
  if (!fontsReady || loadingMsg) {
    return <div className="fullscreen-msg"><div className="spinner" />{loadingMsg ?? '글꼴을 준비하는 중…'}</div>;
  }

  return (
    <StudioContext.Provider value={studio}>
      {screen.name === 'home' && (
        <Home
          onStart={(start) => { setScreen({ name: 'wizard', start }); history.replaceState(null, '', '#/new'); }}
          onOpen={(id) => { location.hash = `#/edit/${id}`; }}
        />
      )}
      {screen.name === 'wizard' && (
        <Wizard
          start={screen.start}
          onCancel={() => { setScreen({ name: 'home' }); history.replaceState(null, '', '#/'); }}
          onCreated={(p) => { setScreen({ name: 'editor', project: p }); history.replaceState(null, '', `#/edit/${p.id}`); }}
        />
      )}
      {screen.name === 'editor' && (
        <Editor key={screen.project.id} initial={screen.project} onExit={() => { location.hash = '#/'; setScreen({ name: 'home' }); }} />
      )}
    </StudioContext.Provider>
  );
}
