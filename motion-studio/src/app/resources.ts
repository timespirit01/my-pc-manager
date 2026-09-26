// 폰트와 이미지 로딩. 렌더 전에 반드시 로드가 끝나야 미리보기와 출력이 일치한다.
import type { LoadedImage } from '../core/templates/types';
import type { Asset, Project } from '../core/types';

const FONT_FILES: Array<{ family: string; weight: number; file: string }> = [
  { family: 'Pretendard', weight: 400, file: 'Pretendard-Regular.woff2' },
  { family: 'Pretendard', weight: 500, file: 'Pretendard-Medium.woff2' },
  { family: 'Pretendard', weight: 600, file: 'Pretendard-SemiBold.woff2' },
  { family: 'Pretendard', weight: 700, file: 'Pretendard-Bold.woff2' },
  { family: 'Pretendard', weight: 800, file: 'Pretendard-ExtraBold.woff2' },
  { family: 'Pretendard', weight: 900, file: 'Pretendard-Black.woff2' },
  { family: 'NanumMyeongjo', weight: 800, file: 'NanumMyeongjo-ExtraBold.ttf' },
  { family: 'BlackHanSans', weight: 400, file: 'BlackHanSans-Regular.ttf' },
];

let fontsPromise: Promise<void> | null = null;

/** 모든 영상용 폰트를 명시적으로 로드한다(지연 로딩에 기대지 않음) */
export function loadFonts(): Promise<void> {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      FONT_FILES.map(async (f) => {
        const face = new FontFace(f.family, `url(/fonts/${f.file})`, { weight: String(f.weight), style: 'normal' });
        await face.load();
        document.fonts.add(face);
      }),
    ).then(() => undefined);
    fontsPromise.catch(() => { fontsPromise = null; });
  }
  return fontsPromise;
}

type Listener = () => void;

/** 이미지 캐시. 로드 완료 시 구독자에게 알려 미리보기를 다시 그리게 한다 */
export class ImageStore {
  private images = new Map<string, LoadedImage>();
  private pending = new Map<string, Promise<LoadedImage>>();
  private failed = new Map<string, string>();
  private listeners = new Set<Listener>();

  get = (id: string | undefined): LoadedImage | undefined => (id ? this.images.get(id) : undefined);

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  load(asset: Asset): Promise<LoadedImage> {
    const hit = this.images.get(asset.id);
    if (hit) return Promise.resolve(hit);
    const p = this.pending.get(asset.id);
    if (p) return p;
    const promise = loadImage(asset.url).then((img) => {
      const li: LoadedImage = { source: img, width: img.naturalWidth, height: img.naturalHeight };
      this.images.set(asset.id, li);
      this.pending.delete(asset.id);
      this.failed.delete(asset.id);
      this.listeners.forEach((l) => l());
      return li;
    }, (e) => {
      this.pending.delete(asset.id);
      this.failed.set(asset.id, asset.name);
      throw e;
    });
    this.pending.set(asset.id, promise);
    return promise;
  }

  /** 프로젝트가 쓰는 모든 이미지 로드 (실패 목록 반환) */
  async ensure(project: Project): Promise<string[]> {
    const ids = new Set<string>();
    if (project.logoId) ids.add(project.logoId);
    project.scenes.forEach((s) => s.imageId && ids.add(s.imageId));
    const failed: string[] = [];
    await Promise.all(
      [...ids].map(async (id) => {
        const a = project.assets[id];
        if (!a) { failed.push(id); return; }
        try { await this.load(a); } catch { failed.push(a.name || id); }
      }),
    );
    return failed;
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
    img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${url}`));
    img.src = url;
  });
}

/** 로고가 밝은지/어두운지 분석 (받침판 필요 여부 판단용) */
export function analyzeTone(img: CanvasImageSource & { width: number; height: number }): { light: number; dark: number } {
  const size = 96;
  const c = document.createElement('canvas');
  const ratio = img.width / img.height;
  c.width = ratio >= 1 ? size : Math.max(1, Math.round(size * ratio));
  c.height = ratio >= 1 ? Math.max(1, Math.round(size / ratio)) : size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0, light = 0, dark = 0;
  const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    n++;
    const L = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
    if (L > 0.75) light++;
    else if (L < 0.05) dark++;
  }
  return n ? { light: light / n, dark: dark / n } : { light: 0, dark: 0 };
}

/** 에셋 등록 전 크기·톤 정보 채우기 */
export async function describeAsset(asset: Asset, withTone: boolean): Promise<Asset> {
  const img = await loadImage(asset.url);
  const out: Asset = { ...asset, width: img.naturalWidth, height: img.naturalHeight };
  if (withTone) out.tone = analyzeTone(img);
  return out;
}
