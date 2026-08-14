import manifestJson from '../content/asset-manifest.json';
import type { AssetManifest } from '../types';

const manifest = manifestJson as AssetManifest;

/** semantic id → URL. 누락 시 투명 1px + 경고 (게임 중단 금지). */
export function assetUrl(id: string): string {
  const rec = manifest.assets[id];
  if (!rec) {
    console.warn(`[Assets] 매니페스트에 없는 id: ${id}`);
    return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  }
  return rec.src;
}

export function hasAsset(id: string): boolean {
  return id in manifest.assets;
}

/** 이미지 사전 로드 — 실패해도 resolve (fallback은 css 배경색). */
export function preloadImages(ids: string[]): Promise<void> {
  return Promise.all(
    ids.filter(hasAsset).map(
      (id) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => {
            console.warn(`[Assets] 로드 실패: ${id}`);
            resolve();
          };
          img.src = assetUrl(id);
        })
    )
  ).then(() => undefined);
}
