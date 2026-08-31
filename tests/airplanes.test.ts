import { describe, expect, it } from 'vitest';
import { hasAsset } from '../src/core/assets';
import {
  AIRPLANE_CHOICES,
  airplaneWingmen,
  missionCompanionAssetId,
  selectedAirplaneAssetId,
  selectedAirplanePortraitAssetId,
  selectedTravelKit,
  TRAVEL_KITS
} from '../src/ui/airplaneFleet';
import { MISSION_IDS } from '../src/types';

describe('비행기 편대 매핑', () => {
  it('여권에서 서로 다른 비행기 아이콘 10종을 고를 수 있다', () => {
    expect(AIRPLANE_CHOICES).toHaveLength(10);
    expect(new Set(AIRPLANE_CHOICES.map((plane) => plane.saveId)).size).toBe(10);
    expect(new Set(AIRPLANE_CHOICES.map((plane) => plane.assetId)).size).toBe(10);
    expect(new Set(AIRPLANE_CHOICES.map((plane) => plane.name)).size).toBe(10);
    AIRPLANE_CHOICES.forEach((plane) => {
      expect(hasAsset(plane.assetId)).toBe(true);
      expect(hasAsset(plane.flightAssetId)).toBe(true);
      expect(plane.label).toContain(plane.name);
      expect(TRAVEL_KITS[plane.kitId].description.length).toBeGreaterThan(12);
    });
  });

  it('기존 저장값은 유지하고 알 수 없는 값은 기본 코리로 복구한다', () => {
    expect(selectedAirplaneAssetId('plane3')).toBe('plane.jet');
    expect(selectedAirplaneAssetId('plane6')).toBe('plane.alt2');
    expect(selectedAirplaneAssetId('plane10')).toBe('plane.green');
    expect(selectedAirplaneAssetId('unknown')).toBe('plane.main');
  });

  it('여권에서 고른 정확한 기체 초상을 화면에 전달한다', () => {
    expect(selectedAirplanePortraitAssetId('plane3')).toBe('plane.portrait.violet.transparent');
    expect(selectedAirplanePortraitAssetId('plane8')).toBe('plane.portrait.rose.transparent');
    expect(selectedAirplanePortraitAssetId('unknown')).toBe('plane.portrait.classic.transparent');
  });

  it('선택한 비행기는 실제 여행 지원 장비를 제공한다', () => {
    expect(selectedTravelKit('plane1').id).toBe('recorder');
    expect(selectedTravelKit('plane3').id).toBe('future');
    expect(selectedTravelKit('plane4').id).toBe('route');
  });

  it('대륙별 길잡이는 내 비행기와 겹치지 않고 모두 실제 에셋이다', () => {
    for (const missionId of MISSION_IDS) {
      const companion = missionCompanionAssetId(missionId, 'plane.alt2');
      expect(companion).not.toBe('plane.alt2');
      expect(hasAsset(companion)).toBe(true);
    }
    expect(missionCompanionAssetId('africa', 'plane.main')).toBe('plane.africa');
  });

  it('완주 편대도 주인공 기체와 겹치지 않는다', () => {
    const wingmen = airplaneWingmen('plane.explorer', 3);
    expect(wingmen).toHaveLength(3);
    expect(wingmen).not.toContain('plane.explorer');
  });
});
