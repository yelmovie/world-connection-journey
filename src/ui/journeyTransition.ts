import { assetUrl, hasAsset } from '../core/assets';
import { saveRepo } from '../core/SaveRepository';
import { MISSION_IDS, type MissionId } from '../types';
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

/** 여권의 여섯 도장 슬롯과 지도 노드가 같은 상징을 사용하게 하는 단일 매핑. */
export const PASSPORT_STAMP_ASSETS: Record<MissionId, string> = {
  asia: 'deco.landmark_taj',
  europe: 'deco.landmark_eiffel',
  africa: 'deco.landmark_pyramid',
  americas: 'deco.landmark_liberty',
  oceania: 'deco.landmark_sydney',
  dialogue: 'deco.portal_globe'
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

function reducedMotion(): boolean {
  return saveRepo.get().settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 비행·도장처럼 페이지 사이에 필요한 짧은 연출. 모든 timer와 DOM을 handle이 소유한다. */
export function playJourneyTransition(opts: {
  kind: 'flight' | 'stamp';
  label: string;
  assetId?: string;
  companionAssetId?: string;
}): JourneyTransitionHandle {
  cancelJourneyTransition();

  const reduced = reducedMotion();
  // 도장 연출은 아이들이 '쾅' 찍히는 순간과 찍힌 여권을 충분히 볼 수 있게 길게 유지한다.
  const duration = reduced ? 120 : opts.kind === 'flight' ? 650 : 4500;
  const assetId = opts.assetId
    ?? (opts.kind === 'flight' ? selectedAirplanePortraitAssetId(saveRepo.get().profile?.airplaneId) : 'prop.stamp');
  const companionAssetId = opts.companionAssetId !== assetId
    ? opts.companionAssetId
    : undefined;
  const save = saveRepo.get();
  const avatar = avatarChoice(save.profile?.avatarId);
  const passportOwner = avatar.name;
  const newestMissionId = companionAssetId
    ? MISSION_IDS.find((missionId) => PASSPORT_STAMP_ASSETS[missionId] === companionAssetId)
    : undefined;
  const stampSlots = MISSION_IDS.map((missionId, index) => {
    const earned = save.stamps.includes(missionId);
    const stampAssetId = missionId === newestMissionId && companionAssetId
      ? companionAssetId
      : PASSPORT_STAMP_ASSETS[missionId];
    const stampTool = missionId === newestMissionId && hasAsset(assetId)
      ? `<img class="journey-transition__stamp-tool" src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="">`
      : '';
    return `<span class="journey-transition__stamp-slot${earned ? ' is-earned' : ''}${missionId === newestMissionId ? ' is-new' : ''}" data-stamp-slot="${index + 1}">
      ${earned && hasAsset(stampAssetId) ? `<img src="${assetUrl(stampAssetId)}" data-asset-id="${stampAssetId}" alt="">` : ''}
      ${stampTool}
    </span>`;
  }).join('');
  const passportAssetId = hasAsset('prop.passport_stampbook') ? 'prop.passport_stampbook' : 'prop.passport';
  const transitionLabel = opts.kind === 'stamp' && save.stamps.length === 0 && !newestMissionId
    ? '여행을 시작해 여섯 도장을 완성해 줘!'
    : opts.label;
  const overlay = document.createElement('div');
  overlay.className = `journey-transition journey-transition--${opts.kind}`;
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
    <p class="journey-transition__label">${escapeHtml(transitionLabel)}</p>`;
  (document.getElementById('overlay-root') ?? document.body).appendChild(overlay);

  let settled = false;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  let timer: number | null = window.setTimeout(() => finish(), duration);
  // 기다리기 싫으면 화면을 탭해서 바로 넘어갈 수 있다 (도장 연출만)
  if (opts.kind === 'stamp') overlay.addEventListener('pointerdown', () => finish(), { once: true });

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char] ?? char);
}
