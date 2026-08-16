import { audio } from '../core/AudioManager';
import { bus } from '../core/EventBus';
import { saveRepo } from '../core/SaveRepository';
import { navigate } from '../router';
import { openModal } from './modal';
import { assetUrl, hasAsset } from '../core/assets';
import { playJourneyTransition, queueMissionReturn } from './journeyTransition';
import { burstConfetti, stampSlam } from './fx';
import type { MissionId } from '../types';

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
  el.innerHTML = `<span aria-hidden="true" style="font-size:1.4em">${KIND_ICON[kind]}</span><span>${message}</span>`;
  container.appendChild(el);
  void audio.playSfx(kind === 'success' ? 'success' : 'partial');
  if (missionId) bus.emit('MISSION_FEEDBACK', { missionId, kind, message });
}

const DIMENSION_LABELS: Record<string, string> = {
  evidence: '근거 활용',
  perspective: '관점 이해',
  communication: '존중하는 의사소통',
  revision: '전략 수정',
  speedBonus: '속도 보너스'
};

const LEARNING_LINES: Record<MissionId, string> = {
  asia: '자료에서 본 사실과 내가 붙인 해석을 나누면 더 정확히 이해할 수 있어요.',
  europe: '문화유산은 오늘의 생활과 이어서 볼 때 의미가 더 선명해져요.',
  africa: '서로의 소리를 듣고 차례를 지키면 리듬으로도 대화할 수 있어요.',
  americas: '친구마다 필요한 것이 다르니 근거를 보고 함께 계획해야 해요.',
  oceania: '한 가지 선택도 주민·자연·일자리·방문객에게 서로 다르게 작용해요.',
  dialogue: '관찰하고 물어본 뒤 새 사실에 맞춰 생각을 바꾸는 것이 존중이에요.'
};

/** 미션 완료 공통 처리: 점수 저장 + 스탬프 + 결과 모달 */
export function completeMissionFlow(
  missionId: MissionId,
  missionTitle: string,
  result: { total: number; byDimension: Record<string, number> }
): void {
  const alreadyDone = saveRepo.get().missions[missionId].status === 'completed';
  saveRepo.completeMission(missionId, result.total, result.byDimension);
  void audio.playSfx('complete');

  const rows = Object.entries(result.byDimension)
    .map(([dim, pts]) => `<tr><td style="padding:4px 12px 4px 0">${DIMENSION_LABELS[dim] ?? dim}</td><td style="text-align:right;font-weight:700">${pts}점</td></tr>`)
    .join('');
  const body = document.createElement('div');
  const stars = result.total >= 90 ? 3 : result.total >= 70 ? 2 : 1;
  body.innerHTML = `
    <div class="reward-rail" style="align-items:center;flex-wrap:wrap">
      ${hasAsset('prop.stamp') ? `<img src="${assetUrl('prop.stamp')}" data-asset-id="prop.stamp" alt="${missionTitle} 완료 도장" style="width:96px;height:96px;object-fit:contain">` : `<div class="stamp is-earned" style="width:96px;height:96px;font-size:1rem">${missionTitle}</div>`}
      <div>
        <p style="font-family:var(--font-head);font-size:var(--fs-title);color:var(--c-navy)">${result.total}점</p>
        <p role="img" aria-label="별 ${stars}개" style="font-family:var(--font-head);font-size:1.45rem;color:#8a5b00">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</p>
        <table style="border-collapse:collapse;font-size:var(--fs-small)">${rows}</table>
        ${alreadyDone ? '<p class="chip" style="margin-top:8px">이미 완료한 미션이에요. 최고 점수만 기록돼요.</p>' : ''}
      </div>
    </div>
    <p class="feedback success" style="margin-top:var(--sp-4)"><span aria-hidden="true">✓</span><span>${LEARNING_LINES[missionId]}</span></p>`;

  openModal({
    id: `complete-${missionId}`,
    title: '미션 완료!',
    bodyEl: body,
    dismissible: false,
    actions: [
      { label: '미션 다시 보기', kind: 'ghost', onClick: (close) => close() },
      {
        label: '도장 찍고 지도 보기',
        kind: 'primary',
        autofocus: true,
        onClick: (close) => {
          queueMissionReturn({ missionId, missionTitle });
          close();
          void audio.playSfx('stamp');
          const transition = playJourneyTransition({ kind: 'stamp', label: `${missionTitle} 도장을 받았어요!`, assetId: 'prop.stamp' });
          void transition.finished.then(() => navigate('#/map'));
        }
      }
    ]
  });
  const earnedStamp = body.querySelector<HTMLElement>('[data-asset-id="prop.stamp"], .stamp');
  if (earnedStamp) {
    stampSlam(earnedStamp);
    burstConfetti(earnedStamp, 10);
  }
}
