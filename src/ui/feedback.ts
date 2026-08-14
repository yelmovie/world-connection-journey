import { audio } from '../core/AudioManager';
import { bus } from '../core/EventBus';
import { saveRepo } from '../core/SaveRepository';
import { navigate } from '../router';
import { openModal } from './modal';
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
  body.innerHTML = `
    <div style="display:flex;gap:var(--sp-5);align-items:center;flex-wrap:wrap">
      <div class="stamp is-earned is-new" style="width:96px;height:96px;font-size:1rem">${missionTitle}</div>
      <div>
        <p style="font-family:var(--font-head);font-size:var(--fs-title);color:var(--c-navy)">${result.total}점</p>
        <table style="border-collapse:collapse;font-size:var(--fs-small)">${rows}</table>
        ${alreadyDone ? '<p class="chip" style="margin-top:8px">이미 완료한 미션이에요. 최고 점수만 기록돼요.</p>' : ''}
      </div>
    </div>
    <p style="margin-top:var(--sp-4)">여권에 도장이 찍혔어요! 지도에서 다음 지역을 골라 보세요.</p>`;

  openModal({
    id: `complete-${missionId}`,
    title: '미션 완료!',
    bodyEl: body,
    dismissible: false,
    actions: [
      { label: '한 번 더 보기', kind: 'ghost', onClick: (close) => close() },
      { label: '지도로 가기', kind: 'primary', autofocus: true, onClick: (close) => { close(); navigate('#/map'); } }
    ]
  });
  void audio.playSfx('stamp');
}
