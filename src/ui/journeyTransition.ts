import { assetUrl, hasAsset } from '../core/assets';
import { reducedMotion } from './fx';
import { escapeHtml } from './escape';
import { saveRepo } from '../core/SaveRepository';
import { STAMP_ASSETS, STAMP_LABELS, STAMP_SLOTS } from '../core/stamps';
import type { MissionId } from '../types';
import { selectedAirplanePortraitAssetId } from './airplaneFleet';
import { avatarChoice } from './avatarRoster';

export interface MissionReturnCue {
  missionId: MissionId;
  missionTitle: string;
  /** 'photos' — 문화 탐험이 끝나 친구들의 마지막 사진이 도착하는 전환 연출 */
  kind?: 'stamp' | 'photos';
}

export interface JourneyTransitionHandle {
  finished: Promise<void>;
  cancel(): void;
}

let pendingReturn: MissionReturnCue | null = null;
let activeCancel: (() => void) | null = null;

/** @deprecated core/stamps.ts STAMP_ASSETS 사용 — 도장은 미션이 아니라 6대륙 단위다. */
export const PASSPORT_STAMP_ASSETS: Record<MissionId, string> = {
  asia: 'deco.landmark_taj',
  europe: 'deco.landmark_eiffel',
  africa: 'deco.landmark_pyramid',
  americas: 'deco.landmark_liberty',
  oceania: 'deco.landmark_sydney',
  dialogue: 'deco.emblem_stamp'
};

export function queueMissionReturn(cue: MissionReturnCue): void {
  pendingReturn = cue;
}

export function consumeMissionReturn(): MissionReturnCue | null {
  const cue = pendingReturn;
  pendingReturn = null;
  return cue;
}

export function cancelJourneyTransition(): void {
  activeCancel?.();
  activeCancel = null;
}



/** 비행·도장처럼 페이지 사이에 필요한 짧은 연출. 모든 timer와 DOM을 handle이 소유한다. */
export function playJourneyTransition(opts: {
  kind: 'flight' | 'stamp';
  label: string;
  assetId?: string;
  companionAssetId?: string;
  /** 도장 연출의 확인 버튼 문구 — 기본 '확인' */
  confirmLabel?: string;
}): JourneyTransitionHandle {
  cancelJourneyTransition();

  const reduced = reducedMotion();
  // 비행 연출은 짧게 자동 진행. 도장(여권) 연출은 자동으로 넘기지 않고 사용자가 확인 버튼을 눌러 넘어간다.
  const hold = opts.kind === 'stamp';
  const duration = reduced ? 120 : hold ? 360 : 650;
  const assetId = opts.assetId
    ?? (opts.kind === 'flight' ? selectedAirplanePortraitAssetId(saveRepo.get().profile?.airplaneId) : 'prop.stamp');
  const companionAssetId = opts.companionAssetId !== assetId
    ? opts.companionAssetId
    : undefined;
  const save = saveRepo.get();
  const avatar = avatarChoice(save.profile?.avatarId);
  const passportOwner = avatar.name;
  // 방금 받은 도장 = companionAssetId 와 같은 그림을 쓰는 대륙 슬롯
  const newestStampId = companionAssetId
    ? STAMP_SLOTS.find((stampId) => STAMP_ASSETS[stampId] === companionAssetId)
    : undefined;
  const stampSlots = STAMP_SLOTS.map((stampId, index) => {
    const earned = save.stamps.includes(stampId);
    const isNew = stampId === newestStampId;
    const stampAssetId = STAMP_ASSETS[stampId];
    const stampTool = isNew && hasAsset(assetId)
      ? `<img class="journey-transition__stamp-tool" src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="">`
      : '';
    return `<span class="journey-transition__stamp-slot${earned ? ' is-earned' : ''}${isNew ? ' is-new' : ''}" data-stamp-slot="${index + 1}" aria-label="${STAMP_LABELS[stampId]} 도장 ${earned ? '받음' : '아직'}">
      ${earned && hasAsset(stampAssetId) ? `<img src="${assetUrl(stampAssetId)}" data-asset-id="${stampAssetId}" alt="">` : ''}
      ${stampTool}
    </span>`;
  }).join('');
  const passportAssetId = hasAsset('prop.passport_stampbook') ? 'prop.passport_stampbook' : 'prop.passport';
  const transitionLabel = opts.kind === 'stamp' && save.stamps.length === 0 && !newestStampId
    ? '여행을 시작해 여섯 도장을 완성해 줘!'
    : opts.label;
  const overlay = document.createElement('div');
  overlay.className = `journey-transition journey-transition--${opts.kind}${hold ? ' journey-transition--hold' : ''}`;
  overlay.style.setProperty('--journey-duration', `${duration}ms`);
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    ${opts.kind === 'flight'
      ? `<div class="journey-transition__fleet" aria-hidden="true">
          ${hasAsset(assetId) ? `<img class="journey-transition__plane" src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="">` : ''}
          ${companionAssetId && hasAsset(companionAssetId) ? `<img class="journey-transition__wingmate" src="${assetUrl(companionAssetId)}" data-asset-id="${companionAssetId}" alt="">` : ''}
        </div>`
      : `<div class="journey-transition__passport-stage" aria-hidden="true">
          <strong class="journey-transition__passport-owner">${escapeHtml(passportOwner)}의 여행 여권</strong>
          ${hasAsset(passportAssetId) ? `<img class="journey-transition__passport" src="${assetUrl(passportAssetId)}" data-asset-id="${passportAssetId}" alt="">` : ''}
          <div class="journey-transition__stamp-grid">${stampSlots}</div>
        </div>`}
    ${hold
      ? `<div class="journey-transition__footer">
          <p class="journey-transition__label">${escapeHtml(transitionLabel)}</p>
          <button type="button" class="btn btn-primary btn-big journey-transition__confirm" data-act="confirm">${escapeHtml(opts.confirmLabel ?? '확인')}</button>
        </div>`
      : `<p class="journey-transition__label">${escapeHtml(transitionLabel)}</p>`}`;
  (document.getElementById('overlay-root') ?? document.body).appendChild(overlay);

  let settled = false;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  // 여권 연출은 타이머 없음 — 확인 버튼으로만 닫힌다(라우터 취소는 finish 직접 호출)
  let timer: number | null = hold ? null : window.setTimeout(() => finish(), duration);
  if (hold) {
    const confirm = overlay.querySelector<HTMLButtonElement>('[data-act="confirm"]');
    confirm?.addEventListener('click', () => {
      if (settled || overlay.classList.contains('is-leaving')) return;
      overlay.classList.add('is-leaving');
      timer = window.setTimeout(() => finish(), reduced ? 0 : 220);
    });
    window.setTimeout(() => confirm?.focus({ preventScroll: true }), 50);
  }

  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    overlay.getAnimations().forEach((animation) => animation.cancel());
    overlay.querySelectorAll<HTMLElement>('*').forEach((el) => el.getAnimations().forEach((animation) => animation.cancel()));
    overlay.remove();
    if (activeCancel === finish) activeCancel = null;
    resolveFinished();
  };

  activeCancel = finish;
  return { finished, cancel: finish };
}


