import type { MissionId } from '../types';

export const TRAVEL_KITS = {
  recorder: { id: 'recorder', description: '주민에게 들은 새 정보를 다시 재생해요.' },
  route: { id: 'route', description: '이번 사건과 다음 제약을 이어 보여 줘요.' },
  picture: { id: 'picture', description: '고른 근거와 영향을 짧은 문장으로 정리해요.' },
  future: { id: 'future', description: '선택을 실행하기 전에 예상 변화를 미리 보여 줘요.' }
} as const;
export type TravelKitId = keyof typeof TRAVEL_KITS;

/**
 * 여권에 저장하는 값과 실제 에셋을 잇는 단일 목록.
 * 외형은 점수 차이가 없지만 각 기체는 서로 다른 학습 지원 장비를 싣는다.
 * 기존 plane1~4 저장값도 그대로 유지한다.
 */
export const AIRPLANE_CHOICES = [
  { saveId: 'plane1', assetId: 'plane.portrait.classic.transparent', flightAssetId: 'plane.main', name: '몽실이', label: '구름을 닮은 비행기 몽실이', short: '몽실이', kitId: 'recorder' },
  { saveId: 'plane2', assetId: 'plane.portrait.flower.transparent', flightAssetId: 'plane.explorer', name: '꽃구름이', label: '꽃길을 나는 비행기 꽃구름이', short: '꽃구름이', kitId: 'picture' },
  { saveId: 'plane3', assetId: 'plane.portrait.violet.transparent', flightAssetId: 'plane.jet', name: '보라별이', label: '별을 찾는 비행기 보라별이', short: '보라별이', kitId: 'future' },
  { saveId: 'plane4', assetId: 'plane.portrait.coral.transparent', flightAssetId: 'plane.alt1', name: '산호방울', label: '바다를 지키는 비행기 산호방울', short: '산호방울', kitId: 'route' },
  { saveId: 'plane5', assetId: 'plane.portrait.mint.transparent', flightAssetId: 'plane.green', name: '민트콩', label: '숲길을 나는 비행기 민트콩', short: '민트콩', kitId: 'picture' },
  { saveId: 'plane6', assetId: 'plane.portrait.peach.transparent', flightAssetId: 'plane.alt2', name: '복숭아퐁', label: '궁금한 것을 찾는 비행기 복숭아퐁', short: '복숭아퐁', kitId: 'recorder' },
  { saveId: 'plane7', assetId: 'plane.portrait.navy.transparent', flightAssetId: 'plane.jet', name: '별밤슝슝', label: '밤하늘을 가르는 비행기 별밤슝슝', short: '별밤슝슝', kitId: 'future' },
  { saveId: 'plane8', assetId: 'plane.portrait.rose.transparent', flightAssetId: 'plane.alt1', name: '장미몽실', label: '축제를 좋아하는 비행기 장미몽실', short: '장미몽실', kitId: 'route' },
  { saveId: 'plane9', assetId: 'plane.portrait.ice.transparent', flightAssetId: 'plane.main', name: '빙하별', label: '차가운 바람을 나는 비행기 빙하별', short: '빙하별', kitId: 'recorder' },
  { saveId: 'plane10', assetId: 'plane.portrait.forest.transparent', flightAssetId: 'plane.green', name: '초록꼬리', label: '초록 섬을 찾는 비행기 초록꼬리', short: '초록꼬리', kitId: 'picture' }
] as const;

export type AirplaneSaveId = typeof AIRPLANE_CHOICES[number]['saveId'];

export function airplaneChoice(saveId: string | null | undefined) {
  return AIRPLANE_CHOICES.find((plane) => plane.saveId === saveId) ?? AIRPLANE_CHOICES[0];
}

export function selectedAirplaneAssetId(saveId: string | null | undefined): string {
  return airplaneChoice(saveId).flightAssetId;
}

/** 여권에서 고른 기체의 정확한 색과 장식을 보여 주는 초상 에셋. */
export function selectedAirplanePortraitAssetId(saveId: string | null | undefined): string {
  return airplaneChoice(saveId).assetId;
}

export function selectedTravelKit(saveId: string | null | undefined) {
  return TRAVEL_KITS[airplaneChoice(saveId).kitId];
}

/** 주인공 비행기와 겹치지 않는 편대 동료를 안정적인 순서로 고른다. */
export function airplaneWingmen(primaryAssetId: string, count = 2): string[] {
  const fleet = [
    'plane.explorer',
    'plane.jet',
    'plane.alt1',
    'plane.alt2',
    'plane.green',
    'plane.main'
  ];
  return fleet.filter((assetId) => assetId !== primaryAssetId).slice(0, Math.max(0, count));
}

/** 대륙별 학습 행동과 연결된 길잡이 비행기. 문화 맥락 에셋은 해당 미션에서만 쓴다. */
export function missionCompanionAssetId(missionId: MissionId, primaryAssetId: string): string {
  const preferred: Record<MissionId, string> = {
    asia: 'plane.alt2',       // 관찰·질문: 돋보기
    europe: 'plane.alt1',     // 자료·유산 기록: 카메라
    africa: 'plane.africa',   // 젬베 리듬 미션에서만 사용
    americas: 'plane.jet',    // 여러 지역을 잇는 공동 계획
    oceania: 'plane.explorer',// 섬과 바다 탐사
    dialogue: 'plane.alt2'    // 단서를 자세히 살피는 대화
  };
  const candidate = preferred[missionId];
  return candidate === primaryAssetId
    ? (airplaneWingmen(primaryAssetId, 1)[0] ?? 'plane.main')
    : candidate;
}
