import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifestJson from '../src/content/asset-manifest.json';

const PORTRAIT_IDS = [
  'plane.portrait.classic.transparent',
  'plane.portrait.flower.transparent',
  'plane.portrait.violet.transparent',
  'plane.portrait.coral.transparent',
  'plane.portrait.mint.transparent',
  'plane.portrait.peach.transparent',
  'plane.portrait.navy.transparent',
  'plane.portrait.rose.transparent',
  'plane.portrait.ice.transparent',
  'plane.portrait.forest.transparent'
] as const;

describe('비행기 투명 이미지 무결성', () => {
  it('선택 비행기 10종이 복원된 v2 이미지로 연결된다', () => {
    for (const id of PORTRAIT_IDS) {
      const asset = manifestJson.assets[id];
      expect(asset.alpha).toBe(true);
      expect(asset.src).toMatch(/^assets\/plane_portrait_.+_transparent_v2\.webp$/);
    }
  });

  it('실제 파일에 투명 배경과 충분한 불투명 기체 영역이 함께 있다', async () => {
    for (const id of PORTRAIT_IDS) {
      const asset = manifestJson.assets[id];
      const file = `public/${asset.src}`;
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let transparent = 0;
      let opaque = 0;

      for (let index = 3; index < data.length; index += info.channels) {
        if (data[index] === 0) transparent += 1;
        if (data[index] >= 250) opaque += 1;
      }

      const pixels = info.width * info.height;
      expect(info.width).toBe(512);
      expect(info.height).toBe(512);
      expect(transparent / pixels).toBeGreaterThan(0.25);
      expect(opaque / pixels).toBeGreaterThan(0.18);
    }
  });
});
