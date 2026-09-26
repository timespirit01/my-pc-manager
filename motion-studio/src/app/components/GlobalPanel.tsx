// 영상 전체 설정: 스타일, 브랜드 색, 움직임/속도/강조, 영상 길이, 로고
import { DURATION_MAX, DURATION_MIN } from '../../core/project';
import { TEMPLATES } from '../../core/templates';
import type { Asset, BrandColors, Emphasis, Feel, MotionSettings, Project, Speed } from '../../core/types';
import { ColorField, PALETTE_PRESETS } from './ColorField';
import { MotionDemo } from './MotionDemo';
import { Segmented } from './Segmented';
import { UploadButton } from './UploadButton';

export function GlobalPanel({ project, onTemplate, onColors, onMotion, onDuration, onBrand, onLogo }: {
  project: Project;
  onTemplate: (id: string) => void;
  onColors: (c: BrandColors, coalesce?: string) => void;
  onMotion: (m: MotionSettings) => void;
  onDuration: (d: number) => void;
  onBrand: (name: string) => void;
  onLogo: (a: Asset | undefined) => void;
}) {
  const logo = project.logoId ? project.assets[project.logoId] : undefined;
  return (
    <div className="panel-section" data-testid="global-panel">
      <h3>영상 전체 설정</h3>

      <div className="field">
        <span className="field-label">스타일</span>
        <div className="template-list">
          {TEMPLATES.map((t) => (
            <button key={t.id} className={`template-item ${project.templateId === t.id ? 'selected' : ''}`} onClick={() => onTemplate(t.id)} data-testid={`template-${t.id}`}>
              <b>{t.name}</b>
              <span>{t.tagline}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">브랜드 색</span>
        <div className="preset-row">
          {PALETTE_PRESETS.map((p) => (
            <button key={p.name} className="preset" title={p.name} onClick={() => onColors({ primary: p.primary, accent: p.accent })}>
              <span style={{ background: p.primary }} /><span style={{ background: p.accent }} />
            </button>
          ))}
        </div>
        <div className="field-row">
          <ColorField label="메인 색" testId="color-primary" value={project.colors.primary} onChange={(v) => onColors({ ...project.colors, primary: v }, 'color-primary')} />
          <ColorField label="강조 색" testId="color-accent" value={project.colors.accent} onChange={(v) => onColors({ ...project.colors, accent: v }, 'color-accent')} />
        </div>
        <span className="field-hint">어떤 색을 골라도 글자가 잘 읽히도록 밝기를 자동으로 맞춰요</span>
      </div>

      <div className="field">
        <span className="field-label">움직임</span>
        <Segmented<Feel> testId="motion-feel" value={project.motion.feel} onChange={(feel) => onMotion({ ...project.motion, feel })}
          options={[{ value: 'calm', label: '차분하게', hint: '천천히 감속하며 튀지 않게' }, { value: 'smooth', label: '부드럽게', hint: '빠르게 나와 부드럽게 멈춤' }, { value: 'lively', label: '경쾌하게', hint: '살짝 튕기며 멈춤' }]} />
        <span className="field-label sub">속도</span>
        <Segmented<Speed> testId="motion-speed" value={project.motion.speed} onChange={(speed) => onMotion({ ...project.motion, speed })}
          options={[{ value: 'slow', label: '느리게' }, { value: 'normal', label: '보통' }, { value: 'fast', label: '빠르게' }]} />
        <span className="field-label sub">강조</span>
        <Segmented<Emphasis> testId="motion-emphasis" value={project.motion.emphasis} onChange={(emphasis) => onMotion({ ...project.motion, emphasis })}
          options={[{ value: 'low', label: '약하게', hint: '짧은 이동, 작은 변화' }, { value: 'normal', label: '보통' }, { value: 'high', label: '강하게', hint: '긴 이동, 큰 확대' }]} />
        <div className="motion-demo-wrap">
          <MotionDemo motion={project.motion} color={project.colors.primary} />
          <span className="field-hint">선택한 움직임 예시</span>
        </div>
      </div>

      <div className="field">
        <span className="field-label">영상 길이 <b className="val" data-testid="duration-value">{project.duration}초</b></span>
        <input type="range" min={DURATION_MIN} max={DURATION_MAX} step={1} value={project.duration} data-testid="duration" onChange={(e) => onDuration(Number(e.target.value))} />
        <span className="field-hint">길이를 바꿔도 글자가 나오는 움직임은 그대로이고, 머무는 시간만 달라져요</span>
      </div>

      <div className="field">
        <span className="field-label">브랜드 이름</span>
        <input value={project.brandName} onChange={(e) => onBrand(e.target.value)} placeholder="로고가 없을 때 표시돼요" />
      </div>

      <div className="field">
        <span className="field-label">로고</span>
        <div className="thumb-grid small">
          {logo && (
            <div className="thumb logo" style={{ backgroundImage: `url(${logo.url})` }}>
              <button onClick={() => onLogo(undefined)} title="로고 빼기">×</button>
            </div>
          )}
          <UploadButton label={logo ? '바꾸기' : '＋ 로고'} analyzeTone onUploaded={([a]) => onLogo(a)} className="thumb-upload" />
        </div>
      </div>
    </div>
  );
}
