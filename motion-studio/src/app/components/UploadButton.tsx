import { useRef, useState } from 'react';
import type { Asset } from '../../core/types';
import { uploadImage } from '../api';
import { describeAsset } from '../resources';

/** 이미지 업로드 → 서버 저장 → 크기(필요 시 밝기) 분석까지 끝난 에셋을 돌려준다 */
export function UploadButton({ label, multiple, analyzeTone, onUploaded, className }: {
  label: string;
  multiple?: boolean;
  analyzeTone?: boolean;
  onUploaded: (assets: Asset[]) => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const out: Asset[] = [];
      for (const f of Array.from(files)) {
        const up = await uploadImage(f);
        out.push(await describeAsset({ ...up, width: 0, height: 0 }, !!analyzeTone));
      }
      onUploaded(out);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div className={`upload ${className ?? ''}`}>
      <button type="button" className="upload-btn" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? '올리는 중…' : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple={multiple}
        hidden
        data-testid="file-input"
        onChange={(e) => handle(e.target.files)}
      />
      {error && <div className="upload-error">{error}</div>}
    </div>
  );
}
