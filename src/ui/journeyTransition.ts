import { assetUrl, hasAsset } from '../core/assets';
import { saveRepo } from '../core/SaveRepository';
import type { MissionId } from '../types';

export interface MissionReturnCue {
  missionId: MissionId;
  missionTitle: string;
}

export interface JourneyTransitionHandle {
  finished: Promise<void>;
  cancel(): void;
}

let pendingReturn: MissionReturnCue | null = null;
let activeCancel: (() => void) | null = null;

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
}): JourneyTransitionHandle {
  cancelJourneyTransition();

  const reduced = reducedMotion();
  const duration = reduced ? 120 : opts.kind === 'flight' ? 650 : 460;
  const assetId = opts.assetId
    ?? (opts.kind === 'flight' && hasAsset('plane.explorer') ? 'plane.explorer' : opts.kind === 'flight' ? 'plane.main' : 'prop.stamp');
  const overlay = document.createElement('div');
  overlay.className = `journey-transition journey-transition--${opts.kind}`;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    ${hasAsset(assetId) ? `<img class="journey-transition__plane" src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="">` : ''}
    <p class="journey-transition__label">${escapeHtml(opts.label)}</p>`;
  (document.getElementById('overlay-root') ?? document.body).appendChild(overlay);

  let settled = false;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  let timer: number | null = window.setTimeout(() => finish(), duration);

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
