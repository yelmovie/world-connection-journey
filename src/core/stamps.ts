import type { MissionId, GameSaveV1 as SaveData } from '../types';

/**
 * 여권 도장 = 6대륙. 지구회의(6단계)는 도장 대신 마무리 화면·FINAL 영상·인증서로 끝난다.
 * 아메리카 미션은 북아메리카(캐나다·미국·멕시코)·남아메리카(브라질·페루) 두 도장을 준다.
 * 저장 `stamps` 배열에는 이 StampId 만 들어간다(예전 저장의 미션 id 는 computeStamps 로 다시 계산).
 */
export const STAMP_SLOTS = ['asia', 'europe', 'africa', 'americas_north', 'americas_south', 'oceania'] as const;
export type StampId = (typeof STAMP_SLOTS)[number];

export const STAMP_LABELS: Record<StampId, string> = {
  asia: '아시아', europe: '유럽', africa: '아프리카', americas_north: '북아메리카', americas_south: '남아메리카', oceania: '오세아니아'
};

/** 도장 그림 — 북아메리카는 자유의 여신상, 남아메리카는 마추픽추(사진 준비 중 자리) */
export const STAMP_ASSETS: Record<StampId, string> = {
  asia: 'deco.landmark_taj',
  europe: 'deco.landmark_eiffel',
  africa: 'deco.landmark_pyramid',
  americas_north: 'deco.landmark_liberty',
  americas_south: 'stamp.americas_south',
  oceania: 'deco.landmark_sydney'
};

export const NORTH_AMERICA_COUNTRY_IDS = ['canada', 'usa', 'mexico'] as const;
export const SOUTH_AMERICA_COUNTRY_IDS = ['brazil', 'peru'] as const;

/** 미션 하나가 곧바로 주는 도장(아메리카·지구회의는 없음 — 아메리카는 나라 그룹 완료로, 지구회의는 인증서로). */
export function stampForMission(missionId: MissionId): StampId | null {
  switch (missionId) {
    case 'asia': return 'asia';
    case 'europe': return 'europe';
    case 'africa': return 'africa';
    case 'oceania': return 'oceania';
    default: return null;
  }
}

type CountryDoneMap = Record<string, { done?: unknown } | undefined>;

function americasCountryDone(save: SaveData, countryId: string): boolean {
  const data = save.missions.americas?.data as { exploreProgress?: { countries?: CountryDoneMap } } | undefined;
  return data?.exploreProgress?.countries?.[countryId]?.done === true;
}

/** 아메리카 나라 그룹(북/남)이 다 끝났는가. 미션 자체가 완료면 둘 다 참. */
export function americasGroupDone(save: SaveData, stamp: 'americas_north' | 'americas_south'): boolean {
  if (save.missions.americas?.status === 'completed') return true;
  const ids = stamp === 'americas_north' ? NORTH_AMERICA_COUNTRY_IDS : SOUTH_AMERICA_COUNTRY_IDS;
  return ids.every((id) => americasCountryDone(save, id));
}

/** 저장 상태로부터 받은 도장을 다시 계산한다(순서는 STAMP_SLOTS). 교사용 전체 해금은 미션 상태에 이미 반영돼 있다. */
export function computeStamps(save: SaveData): StampId[] {
  return STAMP_SLOTS.filter((stamp) => {
    if (stamp === 'americas_north' || stamp === 'americas_south') return americasGroupDone(save, stamp);
    return save.missions[stamp]?.status === 'completed';
  });
}

export const isStampId = (value: unknown): value is StampId => typeof value === 'string' && (STAMP_SLOTS as readonly string[]).includes(value);
