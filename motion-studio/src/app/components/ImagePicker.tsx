// 장면 사진 고르기 + 잘리는 위치 조절(초점·확대). 찌그러짐 없이 cover 방식으로만 자른다.
import { useRef } from 'react';
import { coverSource, DEFAULT_CROP } from '../../core/imageFit';
import { SAMPLE_ASSETS } from '../../core/samples';
import type { Asset, ImageCrop } from '../../core/types';
import { UploadButton } from './UploadButton';

export function ImagePicker({ assets, value, logoId, onChange, onUploaded }: {
  assets: Record<string, Asset>;
  value?: string;
  logoId?: string;
  onChange: (id: string | undefined) => void;
  onUploaded: (a: Asset) => void;
}) {
  const own = Object.values(assets).filter((a) => a.id !== logoId && !a.id.startsWith('s_logo'));
  const samples = Object.values(SAMPLE_ASSETS).filter((a) => !a.id.startsWith('s_logo') && !assets[a.id]);
  return (
    <div className="image-picker">
      <div className="thumb-grid small">
        <button className={`thumb none ${!value ? 'selected' : ''}`} onClick={() => onChange(undefined)}>사진 없음</button>
        {own.map((a) => (
          <button key={a.id} className={`thumb ${value === a.id ? 'selected' : ''}`} style={{ backgroundImage: `url(${a.url})` }} title={a.name} onClick={() => onChange(a.id)} />
        ))}
        <UploadButton label="＋ 올리기" onUploaded={([a]) => { onUploaded(a); onChange(a.id); }} className="thumb-upload" />
      </div>
      {samples.length > 0 && (
        <details className="sample-images">
          <summary>샘플 사진에서 고르기</summary>
          <div className="thumb-grid small">
            {samples.map((a) => (
              <button key={a.id} className="thumb" style={{ backgroundImage: `url(${a.url})` }} title={a.name} onClick={() => { onUploaded(a); onChange(a.id); }} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function CropControl({ asset, crop, frameAspect, onChange }: {
  asset: Asset;
  crop: ImageCrop;
  frameAspect: number;
  onChange: (c: ImageCrop, coalesce: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const maxW = 300, maxH = 200;
  const ar = asset.width / asset.height;
  const w = ar > maxW / maxH ? maxW : maxH * ar;
  const h = w / ar;
  // 실제 렌더러와 같은 함수로 보이는 영역 계산
  const src = coverSource(asset.width, asset.height, { w: frameAspect * 1000, h: 1000 }, crop);
  const rect = { x: (src.sx / asset.width) * w, y: (src.sy / asset.height) * h, w: (src.sw / asset.width) * w, h: (src.sh / asset.height) * h };

  const setFocus = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange({ ...crop, focusX: Math.round(fx * 100) / 100, focusY: Math.round(fy * 100) / 100 }, 'crop-focus');
  };

  return (
    <div className="crop">
      <div
        ref={boxRef}
        className="crop-box"
        style={{ width: w, height: h, backgroundImage: `url(${asset.url})` }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setFocus(e); }}
        onPointerMove={(e) => { if (e.buttons & 1) setFocus(e); }}
        data-testid="crop-box"
      >
        <div className="crop-window" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      </div>
      <div className="crop-help">사진에서 가장 중요한 부분을 누르거나 끌어 주세요. 밝은 영역이 영상에 보여요.</div>
      <label className="slider-row">
        <span>확대</span>
        <input type="range" min={1} max={2.5} step={0.05} value={crop.zoom} onChange={(e) => onChange({ ...crop, zoom: Number(e.target.value) }, 'crop-zoom')} />
        <span className="val">{Math.round(crop.zoom * 100)}%</span>
        <button className="btn tiny" onClick={() => onChange({ ...DEFAULT_CROP }, 'crop-reset')}>처음대로</button>
      </label>
    </div>
  );
}
