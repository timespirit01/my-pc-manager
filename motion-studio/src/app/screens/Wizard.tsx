import { useEffect, useMemo, useState } from 'react';
import { defaultAssistant } from '../../core/assistant';
import { PURPOSE_LABEL } from '../../core/compose';
import { createProject } from '../../core/project';
import { emptyMaterial, sampleMaterial } from '../../core/samples';
import { TEMPLATES } from '../../core/templates';
import type { MaterialInput, Project, Purpose, Scene } from '../../core/types';
import { saveProject } from '../api';
import { ColorField, PALETTE_PRESETS } from '../components/ColorField';
import { LiveCanvas } from '../components/LiveCanvas';
import { UploadButton } from '../components/UploadButton';
import { describeAsset } from '../resources';

export interface WizardStart {
  sample: boolean;
}

const PURPOSES: Array<{ id: Purpose; icon: string; desc: string }> = [
  { id: 'product', icon: '🛍️', desc: '새 제품이나 대표 상품의 장점을 소개해요' },
  { id: 'event', icon: '🎪', desc: '행사·팝업·세일 일정과 참여 방법을 알려요' },
  { id: 'service', icon: '🤝', desc: '서비스의 편리함과 예약·문의 방법을 알려요' },
];

async function withLogoTone(m: MaterialInput): Promise<MaterialInput> {
  if (!m.logoId) return m;
  const a = m.assets[m.logoId];
  if (!a || a.tone) return m;
  try {
    const d = await describeAsset(a, true);
    return { ...m, assets: { ...m.assets, [a.id]: d } };
  } catch {
    return m;
  }
}

export function Wizard({ start, onCancel, onCreated }: { start: WizardStart; onCancel: () => void; onCreated: (p: Project) => void }) {
  const [step, setStep] = useState(start.sample ? 3 : 1);
  const [material, setMaterial] = useState<MaterialInput>(() => (start.sample ? sampleMaterial('product') : emptyMaterial('product')));
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    withLogoTone(material).then((m) => m !== material && setMaterial(m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.logoId]);

  // 스타일 단계에서 자동 구성 결과로 움직이는 예시를 보여준다
  useEffect(() => {
    if (step !== 3) return;
    let alive = true;
    defaultAssistant().composeScenes(material).then((s) => alive && setScenes(s));
    return () => { alive = false; };
  }, [step, material]);

  const set = <K extends keyof MaterialInput>(k: K, v: MaterialInput[K]) => setMaterial((m) => ({ ...m, [k]: v }));

  const canNext2 = material.title.trim().length > 0;

  const create = async () => {
    if (!scenes) return;
    setBusy(true);
    setError(null);
    try {
      const p = createProject(material, scenes, templateId, material.title.trim() || material.brandName || '새 영상');
      await saveProject(p);
      onCreated(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wizard">
      <header className="wizard-top">
        <button className="btn ghost" onClick={onCancel}>← 처음으로</button>
        <ol className="stepper">
          {['목적', '자료 입력', '스타일'].map((label, i) => (
            <li key={label} className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}>
              <b>{i + 1}</b> {label}
            </li>
          ))}
        </ol>
        <div style={{ width: 120 }} />
      </header>

      {step === 1 && (
        <section className="wizard-body">
          <h2>어떤 영상을 만들까요?</h2>
          <div className="purpose-grid">
            {PURPOSES.map((p) => (
              <button
                key={p.id}
                className={`purpose-card ${material.purpose === p.id ? 'selected' : ''}`}
                data-testid={`purpose-${p.id}`}
                onClick={() => setMaterial((m) => ({ ...(m.title ? m : emptyMaterial(p.id)), purpose: p.id }))}
              >
                <span className="purpose-icon">{p.icon}</span>
                <b>{PURPOSE_LABEL[p.id]}</b>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>
          <div className="wizard-actions">
            <span />
            <button className="btn primary lg" onClick={() => setStep(2)}>다음 →</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wizard-body material">
          <div className="material-head">
            <h2>문구와 사진을 넣어 주세요</h2>
            <button className="btn" data-testid="fill-sample" onClick={() => setMaterial(sampleMaterial(material.purpose))}>샘플 자료 채우기</button>
          </div>
          <div className="material-grid">
            <div className="form-col">
              <Field label="브랜드·상호 이름" hint="로고가 없을 때 영상에 표시돼요">
                <input value={material.brandName} onChange={(e) => set('brandName', e.target.value)} placeholder="예) 온기 로스터리" />
              </Field>
              <Field label="제목 *" hint="첫 장면의 큰 글씨예요. 20자 안팎이 가장 보기 좋아요" count={material.title.length} max={30}>
                <input data-testid="input-title" value={material.title} onChange={(e) => set('title', e.target.value)} placeholder="예) 매일 아침, 갓 볶은 커피 한 잔" />
              </Field>
              <Field label="한 줄 소개" hint="제목 아래 작은 글씨">
                <input value={material.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="예) 동네 로스터리의 핸드드립 원두 세트" />
              </Field>
              <Field label="설명" hint="한 줄에 하나씩 쓰면 한 장면이 돼요. '소제목: 설명' 형식을 쓰면 더 깔끔해요 (최대 3장면)">
                <textarea rows={5} value={material.description} onChange={(e) => set('description', e.target.value)} placeholder={'주문 후 24시간 안에 로스팅: 가장 향이 좋을 때 받아보세요.\n세 가지 원두 샘플러: 취향에 맞게 골라 드세요.'} />
              </Field>
              <Field label="강조 문구" hint="할인·혜택·일정처럼 꼭 기억해야 할 한마디. 두 번째 줄은 작은 글씨로 나와요">
                <textarea rows={2} value={material.highlight} onChange={(e) => set('highlight', e.target.value)} placeholder={'첫 주문 30% 할인\n9월 30일까지'} />
              </Field>
              <div className="field-row">
                <Field label="마지막 장면 문구" hint="행동을 유도하는 말">
                  <input value={material.ctaTitle} onChange={(e) => set('ctaTitle', e.target.value)} placeholder="예) 지금 바로 만나보세요" />
                </Field>
                <Field label="버튼 문구">
                  <input value={material.ctaButton} onChange={(e) => set('ctaButton', e.target.value)} placeholder="예) 주문하기" />
                </Field>
              </div>
              <Field label="연락처·주소·링크">
                <input value={material.ctaDetail} onChange={(e) => set('ctaDetail', e.target.value)} placeholder="예) onggi.coffee · 02-123-4567" />
              </Field>
            </div>
            <div className="form-col">
              <Field label="사진 (1~4장 권장)" hint="가로·세로 사진 모두 괜찮아요. 찌그러지지 않고 알맞게 잘려요">
                <div className="thumb-grid">
                  {material.imageIds.map((id) => (
                    <div key={id} className="thumb" style={{ backgroundImage: `url(${material.assets[id]?.url})` }}>
                      <button onClick={() => set('imageIds', material.imageIds.filter((x) => x !== id))} title="빼기">×</button>
                    </div>
                  ))}
                  <UploadButton
                    multiple
                    label="＋ 사진 추가"
                    onUploaded={(assets) => setMaterial((m) => ({
                      ...m,
                      assets: { ...m.assets, ...Object.fromEntries(assets.map((a) => [a.id, a])) },
                      imageIds: [...m.imageIds, ...assets.map((a) => a.id)],
                    }))}
                  />
                </div>
              </Field>
              <Field label="로고 (선택)" hint="투명 배경 PNG가 가장 좋아요">
                <div className="thumb-grid">
                  {material.logoId && (
                    <div className="thumb logo" style={{ backgroundImage: `url(${material.assets[material.logoId]?.url})` }}>
                      <button onClick={() => set('logoId', undefined)} title="빼기">×</button>
                    </div>
                  )}
                  <UploadButton
                    label={material.logoId ? '로고 바꾸기' : '＋ 로고 올리기'}
                    analyzeTone
                    onUploaded={([a]) => setMaterial((m) => ({ ...m, assets: { ...m.assets, [a.id]: a }, logoId: a.id }))}
                  />
                </div>
              </Field>
              <Field label="브랜드 색">
                <div className="preset-row">
                  {PALETTE_PRESETS.map((p) => (
                    <button key={p.name} className="preset" title={p.name} onClick={() => set('colors', { primary: p.primary, accent: p.accent })}>
                      <span style={{ background: p.primary }} /><span style={{ background: p.accent }} />
                    </button>
                  ))}
                </div>
                <div className="field-row">
                  <ColorField label="메인 색" value={material.colors.primary} onChange={(v) => set('colors', { ...material.colors, primary: v })} />
                  <ColorField label="강조 색" value={material.colors.accent} onChange={(v) => set('colors', { ...material.colors, accent: v })} />
                </div>
              </Field>
            </div>
          </div>
          <div className="wizard-actions">
            <button className="btn lg" onClick={() => setStep(1)}>← 이전</button>
            <button className="btn primary lg" disabled={!canNext2} onClick={() => setStep(3)} data-testid="to-style">
              {canNext2 ? '다음: 스타일 고르기 →' : '제목을 입력해 주세요'}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="wizard-body">
          <h2>마음에 드는 스타일을 골라 주세요</h2>
          <p className="muted">입력한 자료로 미리 만들어 본 영상이에요. 나중에 언제든 바꿀 수 있어요.</p>
          {start.sample && <div className="notice">샘플 자료(온기 로스터리)가 채워져 있어요. ‘이전’을 눌러 문구와 사진을 바꿀 수도 있어요.</div>}
          <div className="style-grid">
            {TEMPLATES.map((t) => (
              <StyleCard key={t.id} templateId={t.id} material={material} scenes={scenes} selected={templateId === t.id} onSelect={() => setTemplateId(t.id)} />
            ))}
          </div>
          {error && <div className="notice warn">저장하지 못했어요: {error}</div>}
          <div className="wizard-actions">
            <button className="btn lg" onClick={() => setStep(2)}>← 이전</button>
            <button className="btn primary lg" disabled={!scenes || busy} onClick={create} data-testid="create-video">
              {busy ? '만드는 중…' : '이 스타일로 영상 만들기 →'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function StyleCard({ templateId, material, scenes, selected, onSelect }: { templateId: string; material: MaterialInput; scenes: Scene[] | null; selected: boolean; onSelect: () => void }) {
  const t = TEMPLATES.find((x) => x.id === templateId)!;
  const project = useMemo(() => (scenes ? { ...createProject(material, scenes, templateId), id: `preview_${templateId}` } : null), [material, scenes, templateId]);
  return (
    <button className={`style-card ${selected ? 'selected' : ''}`} onClick={onSelect} data-testid={`style-${t.id}`}>
      <div className="style-preview">{project ? <LiveCanvas project={project} loop maxPixelWidth={720} /> : <div className="spinner" />}</div>
      <div className="style-info">
        <b>{t.name}</b>
        <span>{t.tagline}</span>
        <div className="chips">{t.traits.map((x) => <i key={x}>{x}</i>)}</div>
      </div>
      {selected && <div className="check">✓ 선택됨</div>}
    </button>
  );
}

function Field({ label, hint, children, count, max }: { label: string; hint?: string; children: React.ReactNode; count?: number; max?: number }) {
  return (
    <div className="field">
      <span className="field-label">
        {label}
        {count !== undefined && max !== undefined && <span className={`count ${count > max ? 'over' : ''}`}>{count}/{max}</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
