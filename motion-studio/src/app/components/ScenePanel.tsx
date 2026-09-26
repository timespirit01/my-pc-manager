// 선택한 장면 수정 패널: 문구, 사진(잘림 위치), 장면 길이, 배치 경고와 해결 버튼
import { getTemplate } from '../../core/templates';
import type { LayoutReport } from '../../core/templates/types';
import type { SceneTiming } from '../../core/timing';
import type { Asset, Project, Scene, SceneLength } from '../../core/types';
import { CropControl, ImagePicker } from './ImagePicker';
import { KIND_LABEL } from './SceneStrip';
import { Segmented } from './Segmented';

const FIELD_NAME: Record<string, string> = { title: '제목', body: '설명', button: '버튼 문구' };

export function ScenePanel({ project, index, report, timing, canSplit, onChange, onSplit, onAddAsset, onLonger }: {
  project: Project;
  index: number;
  report?: LayoutReport;
  timing?: SceneTiming;
  canSplit: boolean;
  onChange: (patch: Partial<Scene>, coalesce?: string) => void;
  onSplit: () => void;
  onAddAsset: (a: Asset) => void;
  onLonger: () => void;
}) {
  const scene = project.scenes[index];
  if (!scene) return null;
  const f = getTemplate(project.templateId).fields(scene.kind);
  const asset = scene.imageId ? project.assets[scene.imageId] : undefined;

  return (
    <div className="panel-section" data-testid="scene-panel">
      <h3>{index + 1}번 장면 · {KIND_LABEL[scene.kind]}</h3>

      {report && report.overflow.length > 0 && (
        <div className="notice warn" data-testid="overflow-warning">
          <b>{report.overflow.map((k) => FIELD_NAME[k] ?? k).join(', ')}</b>이(가) 길어 화면에 다 들어가지 않아요.
          글자를 무리하게 줄이는 대신 아래 방법을 추천해요.
          <div className="notice-actions">
            {canSplit && <button className="btn small" onClick={onSplit} data-testid="split-scene">장면 두 개로 나누기</button>}
            <span className="muted">또는 문구를 조금 줄여 주세요</span>
          </div>
        </div>
      )}
      {timing?.tooShort && (
        <div className="notice warn" data-testid="short-warning">
          글을 읽기에 이 장면 시간이 조금 짧아요 (필요 {timing.minNeeded.toFixed(1)}초).
          <div className="notice-actions">
            <button className="btn small" onClick={onLonger}>영상 길이 늘리기</button>
            {scene.length !== 'long' && <button className="btn small" onClick={() => onChange({ length: 'long' })}>이 장면 길게</button>}
          </div>
        </div>
      )}

      {f.title && (
        <label className="field">
          <span className="field-label">{f.title.label}</span>
          <textarea
            rows={2}
            data-testid="scene-title"
            value={scene.title}
            placeholder={f.title.placeholder}
            onChange={(e) => onChange({ title: e.target.value }, `title-${scene.id}`)}
          />
          <span className="field-hint">줄을 바꾸고 싶은 곳에서 Enter를 누르면 그대로 줄이 바뀌어요</span>
        </label>
      )}
      {f.body && (
        <label className="field">
          <span className="field-label">{f.body.label}</span>
          <textarea
            rows={f.body.multiline ? 4 : 2}
            data-testid="scene-body"
            value={scene.body}
            placeholder={f.body.placeholder}
            onChange={(e) => onChange({ body: e.target.value }, `body-${scene.id}`)}
          />
        </label>
      )}
      {f.button && (
        <label className="field">
          <span className="field-label">{f.button.label}</span>
          <input
            data-testid="scene-button"
            value={scene.button ?? ''}
            placeholder={f.button.placeholder}
            onChange={(e) => onChange({ button: e.target.value }, `button-${scene.id}`)}
          />
        </label>
      )}

      {f.image && (
        <div className="field">
          <span className="field-label">사진</span>
          <ImagePicker assets={project.assets} value={scene.imageId} logoId={project.logoId} onChange={(id) => onChange({ imageId: id })} onUploaded={onAddAsset} />
          {asset && report?.imageAspect && (
            <CropControl asset={asset} crop={scene.crop} frameAspect={report.imageAspect} onChange={(crop, key) => onChange({ crop }, `${key}-${scene.id}`)} />
          )}
        </div>
      )}

      <div className="field">
        <span className="field-label">장면 길이</span>
        <Segmented<SceneLength>
          value={scene.length}
          onChange={(v) => onChange({ length: v })}
          options={[{ value: 'short', label: '짧게' }, { value: 'normal', label: '보통' }, { value: 'long', label: '길게' }]}
        />
        <span className="field-hint">전체 영상 길이 안에서 이 장면에 시간을 더 주거나 덜 줘요</span>
      </div>
    </div>
  );
}
