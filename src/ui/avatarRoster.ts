import type { MissionId, Profile } from '../types';

export type AvatarLensId = 'observe' | 'listen' | 'question' | 'plan' | 'compare' | 'future';

interface AvatarSupport {
  id: AvatarLensId;
  description: string;
  missionHints: Partial<Record<MissionId, string>>;
}

/**
 * 여권에서 고르는 탐험가 목록.
 * 같은 제작 묶음의 현대 탐험복 캐릭터만 사용해 화면의 그림체를 통일한다.
 */
export const AVATAR_CHOICES = [
  {
    saveId: 'a1', assetId: 'oceania.visitor', name: '마이아', role: '꼼꼼히 관찰하는 탐험가', label: '꼼꼼히 관찰하는 마이아 모습', short: '마이아',
    sampleLine: '안녕! 나는 마이아야. 작은 것도 놓치지 않고 꼼꼼히 살펴봐.',
    support: { id: 'observe', description: '문제·원인·영향에서 놓친 부분을 다시 짚어 줘요.', missionHints: { oceania: '지표 숫자만 보지 말고, 어떤 선택이 누구의 생활까지 바꾸는지 함께 살펴봐요.' } }
  },
  {
    saveId: 'a2', assetId: 'greeting.australia', name: '올리버', role: '먼저 인사하는 탐험가', label: '먼저 인사하는 올리버 모습', short: '올리버',
    sampleLine: '반가워! 나는 올리버야. 먼저 인사하고 친구 이야기를 끝까지 들어.',
    support: { id: 'listen', description: '방금 들은 사람의 핵심 바람을 다시 들려줘요.', missionHints: { oceania: '결정을 누르기 전, 고른 주민이 실제로 바란 말을 한 번 더 확인해요.' } }
  },
  {
    saveId: 'a3', assetId: 'greeting.japan', name: '하나', role: '질문을 잘하는 탐험가', label: '질문을 잘하는 하나 모습', short: '하나',
    sampleLine: '안녕, 나는 하나야! 궁금한 건 왜 그럴까 질문하며 알아가.',
    support: { id: 'question', description: '확실하지 않은 부분을 확인할 질문으로 바꿔 줘요.', missionHints: { oceania: '“누가 좋아지고 누가 어려워질까?”라고 물으며 선택의 빈틈을 찾아봐요.' } }
  },
  {
    saveId: 'a4', assetId: 'greeting.morocco', name: '유세프', role: '지도를 잘 보는 탐험가', label: '지도를 잘 보는 유세프 모습', short: '유세프',
    sampleLine: '살람! 나는 유세프야. 지도를 보며 다음 길을 차근차근 계획해.',
    support: { id: 'plan', description: '이번 선택과 다음에 생길 제약을 이어 보여 줘요.', missionHints: { oceania: '이번 사건의 조건을 먼저 읽고, 지난 결정과 같은 계획이 여전히 맞는지 확인해요.' } }
  },
  {
    saveId: 'a5', assetId: 'oceania.fisher', name: '살로테', role: '함께 생각하는 탐험가', label: '함께 생각하는 살로테 모습', short: '살로테',
    sampleLine: '불라! 나는 살로테야. 서로 다른 생각을 모아 함께 답을 찾아.',
    support: { id: 'compare', description: '서로 다른 두 사람과 지표를 나란히 비교해 줘요.', missionHints: { oceania: '가장 많이 오른 지표와 내려간 지표를 함께 보고, 한쪽 목소리가 빠지지 않았는지 살펴봐요.' } }
  },
  {
    saveId: 'a6', assetId: 'oceania.youth', name: '테비타', role: '바다를 아끼는 탐험가', label: '바다를 아끼는 테비타 모습', short: '테비타',
    sampleLine: '말로! 나는 테비타야. 오늘의 선택이 바다의 내일에 남을 변화를 생각해.',
    support: { id: 'future', description: '지금의 선택이 먼 미래에 남길 변화를 짚어 줘요.', missionHints: { oceania: '지금 편한 선택이 먼 미래의 환경·문화에도 괜찮을지 한 번 더 확인해요.' } }
  }
] as const;

export function avatarChoice(saveId: string | null | undefined) {
  return AVATAR_CHOICES.find((avatar) => avatar.saveId === saveId) ?? AVATAR_CHOICES[0];
}

export function selectedAvatarAssetId(saveId: string | null | undefined): string {
  return avatarChoice(saveId).assetId;
}

/** 선택한 탐험 방식이 미션에서 실제로 제공하는 도움. 점수 우위가 아니라 사고 경로만 달라진다. */
export function avatarMissionInsight(saveId: string | null | undefined, missionId: MissionId): AvatarSupport & { hint: string } {
  const support: AvatarSupport = avatarChoice(saveId).support;
  return {
    ...support,
    missionHints: { ...support.missionHints },
    hint: support.missionHints[missionId] ?? support.description
  };
}

/** 저장된 여권과 모든 화면의 '내 탐험가' 표시를 잇는 단일 조회 함수. */
export function selectedAvatarSpeaker(profile: Pick<Profile, 'avatarId' | 'nickname'> | null | undefined) {
  const avatar = avatarChoice(profile?.avatarId);
  return {
    assetId: avatar.assetId,
    name: profile?.nickname.trim() || avatar.name,
    avatar
  };
}
