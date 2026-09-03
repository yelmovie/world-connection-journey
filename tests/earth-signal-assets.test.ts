import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifestJson from '../src/content/asset-manifest.json';
import environmentJson from '../public/content/v1/ko/environment.json';

interface ImageAsset {
  src: string;
}

describe('최종 지구 신호 관찰 그림', () => {
  it('여섯 신호가 서로 다른 전용 그림과 두 관찰 지점을 사용한다', () => {
    const signals = environmentJson.signals;
    const assetIds = signals.map((signal) => signal.imageAssetId);

    expect(signals).toHaveLength(6);
    expect(new Set(assetIds).size).toBe(6);
    for (const signal of signals) {
      expect(signal.hotspots).toHaveLength(2);
      for (const hotspot of signal.hotspots) {
        expect(hotspot.x).toBeGreaterThanOrEqual(0.1);
        expect(hotspot.x).toBeLessThanOrEqual(0.9);
        expect(hotspot.y).toBeGreaterThanOrEqual(0.1);
        expect(hotspot.y).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it('모든 신호 그림이 넓은 관찰 패널용 1600×304 배너다', async () => {
    const assets = manifestJson.assets as Record<string, ImageAsset>;

    for (const signal of environmentJson.signals) {
      const asset = assets[signal.imageAssetId];
      expect(asset, signal.imageAssetId).toBeDefined();
      const metadata = await sharp(`public/${asset!.src}`).metadata();
      expect(metadata.width, signal.id).toBe(1600);
      expect(metadata.height, signal.id).toBe(304);
    }
  });
});
