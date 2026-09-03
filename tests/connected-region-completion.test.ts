import { describe, expect, it } from 'vitest';
import { completedAreaIdsForScenes, completedExampleIdsForScenes } from '../src/pages/connectedRegionMission';
import { isCountryJourneyComplete } from '../src/pages/missionAmericas';

const areas = [{ id: 'east' }, { id: 'central' }];
const examples = [
  { id: 'east-country', areaId: 'east', sceneIds: ['east-1', 'east-2', 'east-3', 'east-4'] },
  { id: 'central-country', areaId: 'central', sceneIds: ['central-1', 'central-2', 'central-3', 'central-4'] }
];

describe('아시아 권역 관찰 완료', () => {
  it('지역을 선택했거나 일부 장면만 관찰한 상태에는 완료 체크를 만들지 않는다', () => {
    expect(completedAreaIdsForScenes(areas, examples, [])).toEqual([]);
    expect(completedAreaIdsForScenes(areas, examples, ['central-1', 'central-2', 'central-3'])).toEqual([]);
  });

  it('한 권역의 모든 장면을 관찰한 뒤에만 그 권역을 완료한다', () => {
    expect(completedAreaIdsForScenes(areas, examples, ['central-1', 'central-2', 'central-3', 'central-4']))
      .toEqual(['central']);
  });

  it('나라·장소 완료도 사진 전체를 본 뒤에만 기록한다', () => {
    expect(completedExampleIdsForScenes(examples, ['east-1', 'east-2', 'east-3'])).toEqual([]);
    expect(completedExampleIdsForScenes(examples, ['east-1', 'east-2', 'east-3', 'east-4']))
      .toEqual(['east-country']);
  });
});

describe('아메리카 나라 탐험 완료', () => {
  const country = {
    stops: [{ id: 'nature' }, { id: 'daily' }, { id: 'culture' }, { id: 'landmark' }],
    bag: [{ id: 'story' }, { id: 'promise' }]
  };

  it('지도 장면이나 가방 이야기가 하나라도 남으면 완료하지 않는다', () => {
    expect(isCountryJourneyComplete(country, {
      stopsSeen: ['nature', 'daily', 'culture'], met: true,
      bagSeen: ['story', 'promise'], keep: 'story'
    })).toBe(false);
    expect(isCountryJourneyComplete(country, {
      stopsSeen: ['nature', 'daily', 'culture', 'landmark'], met: true,
      bagSeen: ['story'], keep: 'story'
    })).toBe(false);
  });

  it('모든 장면과 가방 이야기를 본 뒤 하나를 고른 경우에만 완료한다', () => {
    expect(isCountryJourneyComplete(country, {
      stopsSeen: ['nature', 'daily', 'culture', 'landmark'], met: true,
      bagSeen: ['story', 'promise'], keep: 'story'
    })).toBe(true);
  });
});
