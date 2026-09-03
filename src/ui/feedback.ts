import { audio } from '../core/AudioManager';
import { bus } from '../core/EventBus';
import { saveRepo } from '../core/SaveRepository';
import { navigate } from '../router';
import { playJourneyTransition, queueMissionReturn } from './journeyTransition';
import { STAMP_ASSETS, stampForMission } from '../core/stamps';
import { MISSION_IDS, type MissionId } from '../types';
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
    if (allDone) playEndingVideo(() => navigate('#/certificate')); // 여섯 도장 완성 → 엔딩 영상 → 인증서
    else navigate('#/map');
  };
  queueMissionReturn({ missionId, missionTitle });
  // 지구회의는 도장이 없다 — 곧바로 엔딩 영상·인증서로.
  if (missionId === 'dialogue') {
    goHome();
    return;
  }
  // 결과 모달 없이 바로 "도장 쾅" 전환. 아메리카는 미션 도중 북·남 도장을 이미 받았으니 완료 연출만.
  const stamp = stampForMission(missionId);
  void audio.playSfx('stamp');
  const transition = playJourneyTransition({
    kind: 'stamp',
    label: stamp ? `${missionTitle} 여행 완료! 여행 도장이 여권에 쾅!` : '북·남아메리카 여행 완료!',
    assetId: 'prop.stamp',
    ...(stamp ? { companionAssetId: STAMP_ASSETS[stamp] } : {})
  });
  void transition.finished.then(goHome);
}
