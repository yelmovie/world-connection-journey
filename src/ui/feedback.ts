import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { bus } from '../core/EventBus';
import { saveRepo } from '../core/SaveRepository';
import { navigate } from '../router';
import { openModal } from './modal';
import { assetUrl, hasAsset } from '../core/assets';
import { PASSPORT_STAMP_ASSETS, playJourneyTransition, queueMissionReturn } from './journeyTransition';
import { burstConfetti, stampSlam } from './fx';
import { MISSION_IDS, type MissionId } from '../types';
import { selectedAvatarSpeaker } from './avatarRoster';
import { playEndingVideo } from './endingVideo';

const KIND_ICON = { success: '✓', partial: '◐', retry: '↻' } as const;

/** 컨테이너에 피드백 패널 렌더 (색+아이콘+텍스트, 색상만으로 구분하지 않음) */
export function showFeedback(
  container: HTMLElement,
  kind: 'success' | 'partial' | 'retry',
  message: string,
  missionId?: MissionId
): void {
  container.replaceChildren();
  const el = document.createElement('div');
  el.className = `feedback ${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="feedback__icon" aria-hidden="true">${KIND_ICON[kind]}</span><span>${message}</span>`;
  container.appendChild(el);
  void audio.playSfx(kind === 'success' ? 'success' : 'partial');
  if (missionId) bus.emit('MISSION_FEEDBACK', { missionId, kind, message });
}

const FALLBACK_LEARNING_LINES: Record<MissionId, string> = {
  asia: '사실과 해석을 나누면 더 정확히 볼 수 있어요.',
  europe: '장면을 자세히 보고, 관심을 질문으로 이어 봐요.',
  africa: '서로 다른 지역의 삶을 살피고, 연결된 문제는 책임을 나눠 함께 풀 수 있어.',
  americas: '같은 대륙 안에서도 자연과 생활이 달라요. 그래도 하루에는 닮은 점이 있어요.',
  oceania: '한 선택도 사람과 자연에 다르게 닿아요.',
  dialogue: '보고 묻고 생각을 고치면 존중이 돼요.'
};

// 문구 교체가 코드 수정 없이 되도록 common.json에서 덮어쓴다. 실패하면 폴백 유지.
let learningLines: Record<MissionId, string> = { ...FALLBACK_LEARNING_LINES };

export async function preloadCommonText(): Promise<void> {
  try {
    const common = await loadContent<{ learningLines?: Partial<Record<MissionId, string>> }>('common');
    if (common.learningLines) {
      learningLines = { ...FALLBACK_LEARNING_LINES, ...common.learningLines };
    }
  } catch {
    // 로드 실패 — TS 폴백 문구 그대로 쓴다.
  }
}

const RESULT_SPEAKERS: Record<Exclude<MissionId, 'dialogue'>, { assetId: string; name: string }> = {
  asia: { assetId: 'asia.mina', name: '미나' },
  europe: { assetId: 'europe.guide', name: '레나' },
  africa: { assetId: 'plane.africa', name: '리듬 우편기' },
  americas: { assetId: 'americas.student1', name: '노아' },
  oceania: { assetId: 'oceania.youth', name: '카일라' }
};

/** 미션 완료 공통 처리: 점수 경쟁 없이 완료·도장·핵심 배움만 남긴다. */
export function completeMissionFlow(
  missionId: MissionId,
  missionTitle: string
): void {
  // 저장 형식의 하위 호환을 위해 0점/빈 차원을 넘기되 학생 UI와 보상에는 점수를 쓰지 않는다.
  saveRepo.completeMission(missionId, 0, {});
  void audio.playSfx('complete');
  // 여섯 미션을 모두 실제로 끝낸 순간만 완주 — 지도로 돌아가기 전에 엔딩 영상을 보여 준다.
  // completion.unlocked는 교사용 전체 해금으로도 켜지므로 여기서는 쓰지 않는다.
  const goHome = (): void => {
    const save = saveRepo.get();
    const allDone = MISSION_IDS.every((id) => save.missions[id].status === 'completed');
    if (allDone) playEndingVideo(() => navigate('#/map'));
    else navigate('#/map');
  };
  // 모든 미션 공통: 결과 모달 없이 바로 "도장 쾅" 전환으로 마무리한다(아메리카 방식으로 통일).
  queueMissionReturn({ missionId, missionTitle });
  void audio.playSfx('stamp');
  const transition = playJourneyTransition({
    kind: 'stamp',
    label: `${missionTitle} 여행 완료! 여행 도장이 여권에 쾅!`,
    assetId: 'prop.stamp',
    companionAssetId: PASSPORT_STAMP_ASSETS[missionId]
  });
  void transition.finished.then(goHome);
}

function typeResultLine(target: HTMLElement | null, text: string): () => void {
  if (!target) return () => undefined;
  const reduced = saveRepo.get().settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    target.textContent = text;
    return () => undefined;
  }
  let index = 0;
  const timer = window.setInterval(() => {
    index += 1;
    target.textContent = text.slice(0, index);
    if (index >= text.length) window.clearInterval(timer);
  }, 28);
  return () => window.clearInterval(timer);
}

// 모듈 로드 시점에 미리 받아 둔다 — 실패해도 폴백 문구가 있어 안전.
void preloadCommonText();
