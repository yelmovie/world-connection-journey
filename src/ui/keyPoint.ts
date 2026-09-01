import { audio } from '../core/AudioManager';
import { assetUrl, hasAsset } from '../core/assets';
import { saveRepo } from '../core/SaveRepository';
import { openModal } from './modal';

export interface KeyPointOptions {
  /** 한 번 읽으면 다시 막지 않기 위한 고유 키 (예: 'americas.geo') */
  id: string;
  /** 상단 라벨 — 기본 '꼭 알아둘 것' */
  eyebrow?: string;
  /** 한 문장씩 보여 준다. 두 문장을 넘기지 않는다. */
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

function hashId(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** 문장을 짝 맞추기용 앞·뒤 두 토막으로 나눈다 — 쉼표 우선, 없으면 가운데에 가까운 어절 경계. */
function splitLine(line: string): [string, string] | null {
  const comma = line.indexOf(', ');
  if (comma > 4 && line.length - comma > 8) return [line.slice(0, comma + 1), line.slice(comma + 2)];
  const mid = Math.floor(line.length / 2);
  let best = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best < 5 || line.length - best < 7) return null;
  return [line.slice(0, best), line.slice(best + 1)];
}

/**
 * 스테이지의 핵심 학습 내용을 "반드시 읽고 넘어가게" 하는 카드.
 *
 * 매번 같은 노란 카드 낭독이 되지 않게, id 해시로 세 포맷을 순환한다(계획 P1-8).
 * - 낭독: 문장이 한 글자씩 나타나고 다 나와야 통과 (기존)
 * - 뒤집기: 엎어진 카드를 직접 뒤집어야 문장이 보인다
 * - 짝 맞추기: 문장의 앞토막과 뒷토막을 이어야 완성된다
 * 어느 포맷이든 두 번째 방문부터는 막지 않고 바로 통과시킨다.
 *
 * 남발하면 그냥 '넘기는 창'이 된다. 스테이지당 두 번을 넘기지 않는다.
 */
export function showKeyPoint(opts: KeyPointOptions): void {
  const lines = opts.lines.map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0 || hasReadKeyPoint(opts.id)) {
    opts.onDone();
    return;
  }

  const pairs = lines.map(splitLine);
  const canMatch = lines.length >= 2 && pairs.every((pair) => pair !== null);
  const seed = hashId(opts.id) % 3;
  const variant: 'read' | 'flip' | 'match' = seed === 2 && canMatch ? 'match' : seed >= 1 ? 'flip' : 'read';

  const body = document.createElement('div');
  body.className = 'keypoint';
  const heroHtml = `
    <div class="keypoint__hero">
      ${opts.imageId && hasAsset(opts.imageId)
        ? `<img src="${assetUrl(opts.imageId)}" data-asset-id="${opts.imageId}" alt="" aria-hidden="true">`
        : ''}
      <span class="keypoint__eyebrow">${opts.eyebrow ?? '꼭 알아둘 것'}</span>
    </div>`;

  let confirm: HTMLButtonElement | null = null;
  let ready = false;
  let stopTyping: () => void = () => undefined;
  /** 낭독 포맷에서만: 확인 버튼이 다음 문장 넘기기를 대신한다 */
  let advanceOnConfirm: (() => boolean) | null = null;

  const setReady = (isReady: boolean, hintText: string) => {
    ready = isReady;
    // 낭독 포맷은 settle/typeLine이 확인 버튼을 직접 잠갔다 푼다
    if (confirm && variant !== 'read') confirm.disabled = !isReady;
    const hintEl = body.querySelector<HTMLElement>('[data-kp-hint]');
    if (hintEl) hintEl.textContent = hintText;
  };

  if (variant === 'flip') {
    body.innerHTML = `${heroHtml}
      <div class="keypoint__cards">
        ${lines.map((_, i) => `<button type="button" class="keypoint-card" data-card="${i}" aria-label="카드 ${i + 1} 뒤집기">
          <span class="keypoint-card__front" aria-hidden="true">?</span>
          <span class="keypoint-card__back"></span>
        </button>`).join('')}
      </div>
      <span class="visually-hidden" role="status" data-kp-live></span>
      <p class="keypoint__hint" data-kp-hint>카드를 뒤집어서 오늘의 핵심을 확인해!</p>`;
    const opened = new Set<number>();
    body.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((card) => card.addEventListener('click', () => {
      const index = Number(card.dataset.card);
      if (opened.has(index)) return;
      opened.add(index);
      const back = card.querySelector<HTMLElement>('.keypoint-card__back');
      if (back) back.textContent = lines[index] ?? '';
      card.classList.add('is-open');
      const live = body.querySelector<HTMLElement>('[data-kp-live]');
      if (live) live.textContent = lines[index] ?? '';
      void audio.playSfx('pickup');
      if (opened.size >= lines.length) setReady(true, '다 읽었으면 눌러 줘');
      else setReady(false, '남은 카드도 뒤집어 봐!');
    }));
  } else if (variant === 'match') {
    const fronts = pairs.map((pair) => pair![0]);
    const backs = pairs.map((pair, i) => ({ text: pair![1], line: i }));
    if (hashId(opts.id) % 2 === 0) backs.reverse();
    body.innerHTML = `${heroHtml}
      <p class="keypoint__hint" data-kp-hint>앞 문장을 고르고, 이어지는 뒷 문장을 찾아 줘!</p>
      <div class="keypoint__match">
        <div class="keypoint__match-col">${fronts.map((text, i) => `<button type="button" class="keypoint-piece" data-front="${i}">${text}</button>`).join('')}</div>
        <div class="keypoint__match-col">${backs.map((back) => `<button type="button" class="keypoint-piece" data-back="${back.line}">${back.text}</button>`).join('')}</div>
      </div>
      <div class="keypoint__done" data-kp-done></div>
      <span class="visually-hidden" role="status" data-kp-live></span>`;
    const doneEl = body.querySelector<HTMLElement>('[data-kp-done]')!;
    const matched = new Set<number>();
    let picked: number | null = null;
    const frontsEls = [...body.querySelectorAll<HTMLButtonElement>('[data-front]')];
    frontsEls.forEach((front) => front.addEventListener('click', () => {
      const index = Number(front.dataset.front);
      if (matched.has(index)) return;
      picked = index;
      frontsEls.forEach((el) => el.classList.toggle('is-picked', el === front));
      void audio.playSfx('tap');
    }));
    body.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((back) => back.addEventListener('click', () => {
      const line = Number(back.dataset.back);
      if (matched.has(line)) return;
      if (picked === null) {
        setReady(false, '먼저 왼쪽에서 앞 문장을 골라 줘.');
        return;
      }
      if (picked === line) {
        matched.add(line);
        back.disabled = true;
        back.classList.add('is-matched');
        const front = frontsEls[frontsEls.findIndex((el) => Number(el.dataset.front) === line)];
        if (front) { front.disabled = true; front.classList.add('is-matched'); front.classList.remove('is-picked'); }
        const full = lines[line] ?? '';
        doneEl.insertAdjacentHTML('beforeend', `<p class="keypoint__done-line">✓ ${full}</p>`);
        const live = body.querySelector<HTMLElement>('[data-kp-live]');
        if (live) live.textContent = full;
        picked = null;
        void audio.playSfx('success');
        if (matched.size >= lines.length) setReady(true, '문장을 다 이었어! 눌러서 넘어가');
        else setReady(false, '좋아! 남은 짝도 이어 봐.');
      } else {
        back.classList.remove('is-shake');
        void back.offsetWidth;
        back.classList.add('is-shake');
        void audio.playSfx('partial');
        setReady(false, '음, 뜻이 이어지게 다시 골라 봐.');
      }
    }));
  } else {
    // 기존 낭독 포맷 — 문장이 다 나오기 전에는 확인이 잠긴다.
    body.innerHTML = `${heroHtml}
      <p class="keypoint__text" data-kp-text aria-hidden="true"></p>
      <span class="visually-hidden" role="status" data-kp-live></span>
      <div class="keypoint__dots" aria-hidden="true">${lines.map(() => '<i></i>').join('')}</div>
      <p class="keypoint__hint" data-kp-hint aria-hidden="true">글이 다 나오면 눌러서 넘어가</p>`;
    const textEl = body.querySelector<HTMLElement>('[data-kp-text]')!;
    const liveEl = body.querySelector<HTMLElement>('[data-kp-live]')!;
    const dots = [...body.querySelectorAll<HTMLElement>('.keypoint__dots i')];
    let index = 0;
    let timer: number | undefined;
    stopTyping = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const settle = (): void => {
      stopTyping();
      if (confirm) confirm.disabled = false;
      setReady(index >= lines.length - 1, index >= lines.length - 1 ? '다 읽었으면 눌러 줘' : '카드를 눌러 다음 문장 보기');
    };
    const typeLine = (): void => {
      const line = lines[index] ?? '';
      textEl.textContent = '';
      liveEl.textContent = line;
      dots.forEach((dot, i) => dot.classList.toggle('is-now', i <= index));
      if (confirm) confirm.disabled = true;
      setReady(false, '읽는 중…');
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
    advanceOnConfirm = () => {
      if (index < lines.length - 1) {
        advance();
        return true;
      }
      return false;
    };
    window.setTimeout(typeLine, 0);
    ready = false;
  }

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
          if (advanceOnConfirm?.()) return;
          if (variant !== 'read' && !ready) return;
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
  if (confirm && variant !== 'read') confirm.disabled = true;
}
