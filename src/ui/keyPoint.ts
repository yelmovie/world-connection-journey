import { audio } from '../core/AudioManager';
import { assetUrl, hasAsset } from '../core/assets';
import { saveRepo } from '../core/SaveRepository';
import { openModal } from './modal';

export interface KeyPointOptions {
  /** 한 번 읽으면 다시 막지 않기 위한 고유 키 (예: 'americas.geo') */
  id: string;
  /** 상단 라벨 — 기본 '꼭 알아둘 것' */
  eyebrow?: string;
  /** 한 문장씩 타이핑된다. 두 문장을 넘기지 않는다. */
  lines: string[];
  /** 곁들일 그림 자산 id (없으면 생략) */
  imageId?: string;
  confirmLabel?: string;
  onDone: () => void;
}

const READ_PREFIX = 'keypoint.';
const TYPE_MS = 26;

/** 이미 읽은 핵심 카드인지 — 저장 데이터의 1회성 원장을 재사용한다. */
export function hasReadKeyPoint(id: string): boolean {
  return saveRepo.get().rewardClaimedById[`${READ_PREFIX}${id}`] === true;
}

function markRead(id: string): void {
  saveRepo.update((save) => {
    save.rewardClaimedById[`${READ_PREFIX}${id}`] = true;
  });
}

function reducedMotion(): boolean {
  return saveRepo.get().settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 스테이지의 핵심 학습 내용을 "반드시 읽고 넘어가게" 하는 카드.
 *
 * - 문장이 한 글자씩 나타나고, 다 나오기 전에는 확인 버튼이 잠긴다.
 * - 카드를 누르면 현재 문장이 즉시 완성된다(빨리 읽는 학생을 벌주지 않는다).
 * - 두 번째 방문부터는 막지 않고 바로 통과시킨다.
 *
 * 남발하면 그냥 '넘기는 창'이 된다. 스테이지당 두 번을 넘기지 않는다.
 */
export function showKeyPoint(opts: KeyPointOptions): void {
  const lines = opts.lines.map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || hasReadKeyPoint(opts.id)) {
    opts.onDone();
    return;
  }

  const body = document.createElement('div');
  body.className = 'keypoint';
  body.innerHTML = `
    <div class="keypoint__hero">
      ${opts.imageId && hasAsset(opts.imageId)
        ? `<img src="${assetUrl(opts.imageId)}" data-asset-id="${opts.imageId}" alt="" aria-hidden="true">`
        : ''}
      <span class="keypoint__eyebrow">${opts.eyebrow ?? '꼭 알아둘 것'}</span>
    </div>
    <p class="keypoint__text" data-kp-text aria-hidden="true"></p>
    <span class="visually-hidden" role="status" data-kp-live></span>
    <div class="keypoint__dots" aria-hidden="true">${lines.map(() => '<i></i>').join('')}</div>
    <p class="keypoint__hint" data-kp-hint aria-hidden="true">글이 다 나오면 눌러서 넘어가</p>`;

  const textEl = body.querySelector<HTMLElement>('[data-kp-text]')!;
  const liveEl = body.querySelector<HTMLElement>('[data-kp-live]')!;
  const hintEl = body.querySelector<HTMLElement>('[data-kp-hint]')!;
  const dots = [...body.querySelectorAll<HTMLElement>('.keypoint__dots i')];

  let index = 0;
  let timer: number | undefined;
  let confirm: HTMLButtonElement | null = null;

  const stopTyping = (): void => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };

  const settle = (): void => {
    stopTyping();
    const isLast = index >= lines.length - 1;
    if (confirm) confirm.disabled = false;
    hintEl.textContent = isLast ? '다 읽었으면 눌러 줘' : '카드를 눌러 다음 문장 보기';
  };

  const typeLine = (): void => {
    const line = lines[index] ?? '';
    textEl.textContent = '';
    liveEl.textContent = line;
    dots.forEach((dot, i) => dot.classList.toggle('is-now', i <= index));
    if (confirm) confirm.disabled = true;
    hintEl.textContent = '읽는 중…';
    if (reducedMotion()) {
      textEl.textContent = line;
      settle();
      return;
    }
    let cursor = 0;
    stopTyping();
    timer = window.setInterval(() => {
      cursor += 1;
      textEl.textContent = line.slice(0, cursor);
      if (cursor >= line.length) settle();
    }, TYPE_MS);
  };

  /** 카드 탭: 타이핑 중이면 즉시 완성, 끝났으면 다음 문장으로. */
  const advance = (): void => {
    if (timer !== undefined) {
      textEl.textContent = lines[index] ?? '';
      settle();
      return;
    }
    if (index >= lines.length - 1) return;
    index += 1;
    void audio.playSfx('tap');
    typeLine();
  };

  body.addEventListener('click', advance);

  openModal({
    id: `keypoint-${opts.id}`,
    bodyEl: body,
    dismissible: false,
    actions: [
      {
        label: opts.confirmLabel ?? '알겠어!',
        kind: 'primary',
        autofocus: true,
        onClick: (close) => {
          // 아직 안 읽은 문장이 남아 있으면 넘어가지 않고 다음 문장을 보여 준다
          if (index < lines.length - 1) {
            advance();
            return;
          }
          stopTyping();
          markRead(opts.id);
          void audio.playSfx('success');
          close();
          opts.onDone();
        }
      }
    ]
  });

  confirm = document.querySelector<HTMLButtonElement>(`.modal[data-modal-id="keypoint-${opts.id}"] .modal-actions button`);
  typeLine();
}
