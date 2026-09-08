import { assetUrl, hasAsset } from '../core/assets';
import { reducedMotion } from './fx';
import { audio } from '../core/AudioManager';
import { bus } from '../core/EventBus';
import { saveRepo } from '../core/SaveRepository';
import { selectedAvatarSpeaker } from './avatarRoster';
import { bindDialogueSpeedControl, dialogueSpeedControlHtml, scaledDialogueDelay } from './dialogueSpeed';
import { openModal } from './modal';

export interface CharacterDialogueLine {
  label: string;
  speaker?: string;
  text: string;
  role?: 'character' | 'partner';
}

export interface CharacterDialogueFact {
  label: string;
  values: string[];
  tone?: 'need' | 'like' | 'note';
}

export interface CharacterDialogueOptions {
  id: string;
  name: string;
  title?: string;
  meta?: string;
  assetId?: string;
  imageAlt?: string;
  flipX?: boolean;
  partner?: {
    name: string;
    meta?: string;
    assetId?: string;
    imageAlt?: string;
    flipX?: boolean;
  };
  lines: CharacterDialogueLine[];
  facts?: CharacterDialogueFact[];
  /** 타이핑이 끝나면 다음 말로 자동 전환한다. 처음 한 번만 열고 대화를 감상하는 흐름에 쓴다. */
  autoAdvance?: boolean;
  autoAdvanceDelayMs?: number;
  /** 마지막 미션의 대화 속도 선택 버튼을 보여 주고, 선택값을 다음 대화창에도 유지한다. */
  speedControl?: boolean;
  dismissible?: boolean;
  onComplete?: () => void;
  onClose?: () => void;
}

// 기존 자동 대화보다 약 1.2배 빠른 속도.
const TYPE_MS = 21;

/** 대사 속 {player}를 학생이 정한 여행 이름으로 바꾼다. 여권 전이면 '나'로 읽힌다. */
function fillPlayerName(text: string): string {
  if (!text.includes('{player}')) return text;
  const player = selectedAvatarSpeaker(saveRepo.get().profile).name;
  return text.replaceAll('{player}', player || '나');
}



/** 긴 설명을 대화 한 차례씩 읽기 좋은 문장 단위로 나눈다. */
export function splitDialogueSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  return clean.split(/(?<=[.!?。！？])\s+/).map((part) => part.trim()).filter(Boolean);
}

/**
 * 캐릭터를 크게 보여 주고 상황·대사를 한 문장씩 타이핑하는 공통 대화 모달.
 * 말풍선이나 주 버튼을 누르면 현재 문장을 즉시 완성한다.
 */
export function openCharacterDialogue(opts: CharacterDialogueOptions): () => void {
  const lines = opts.lines
    .map((line) => ({ ...line, text: fillPlayerName(line.text.replace(/\s+/g, ' ').trim()) }))
    .filter((line) => line.text.length > 0);
  if (lines.length === 0) {
    queueMicrotask(() => opts.onComplete?.());
    return () => undefined;
  }
  const savedPlayer = selectedAvatarSpeaker(saveRepo.get().profile);
  const partner = opts.partner ?? (lines.some((line) => line.role === 'partner') ? {
    name: savedPlayer.name,
    meta: '나의 탐험가',
    assetId: savedPlayer.assetId,
    imageAlt: `${savedPlayer.name} 탐험가`
  } : undefined);

  const portraitHtml = (
    role: 'character' | 'partner',
    name: string,
    assetId?: string,
    imageAlt?: string,
    meta?: string,
    flipX?: boolean
  ): string => `
    <section class="character-dialogue__portrait character-dialogue__portrait--${role}${flipX ? ' is-flipped' : ''}" data-dialogue-role="${role}" aria-label="${name} 캐릭터">
      ${assetId && hasAsset(assetId)
        ? `<img src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="${imageAlt ?? `${name} 캐릭터`}">`
        : `<span class="character-dialogue__fallback" aria-hidden="true">${name.charAt(0)}</span>`}
      <span class="character-dialogue__meta"${meta ? ` title="${meta}"` : ''}>${name}</span>
    </section>`;

  const wrap = document.createElement('div');
  wrap.className = `character-dialogue${partner ? ' has-partner' : ''}${opts.autoAdvance ? ' is-auto' : ''}`;
  wrap.innerHTML = `
    ${portraitHtml('character', opts.name, opts.assetId, opts.imageAlt, opts.meta, opts.flipX)}
    <section class="character-dialogue__conversation">
      ${opts.facts?.length ? `<div class="character-dialogue__facts"></div>` : ''}
      <div class="character-dialogue__history" aria-live="off" aria-label="지금까지 나눈 대화"></div>
      <button type="button" class="character-dialogue__bubble" aria-label="현재 문장을 바로 표시해요">
        <span class="character-dialogue__label"></span>
        <strong class="character-dialogue__speaker"></strong>
        <span class="character-dialogue__line" aria-hidden="true"><span class="character-dialogue__text"></span><span class="character-dialogue__caret"></span></span>
      </button>
      <span class="visually-hidden character-dialogue__announcement" role="status" aria-live="polite" aria-atomic="true"></span>
      <div class="character-dialogue__footer">
        <span class="character-dialogue__progress" aria-hidden="true"></span>
        ${opts.speedControl ? dialogueSpeedControlHtml() : ''}
        <span class="character-dialogue__auto-hint"${opts.autoAdvance ? '' : ' hidden'}>다음 말이 자동으로 이어져요</span>
        <button type="button" class="btn btn-ghost character-dialogue__skip">대화 건너뛰기</button>
        <button type="button" class="btn btn-primary character-dialogue__next"${opts.autoAdvance ? ' hidden' : ''}></button>
      </div>
    </section>
    ${partner ? portraitHtml('partner', partner.name, partner.assetId, partner.imageAlt, partner.meta, partner.flipX) : ''}`;

  const facts = wrap.querySelector<HTMLElement>('.character-dialogue__facts');
  opts.facts?.forEach((fact) => {
    const group = document.createElement('div');
    group.className = `character-dialogue__fact is-${fact.tone ?? 'note'}`;
    const label = document.createElement('strong');
    label.textContent = fact.label;
    group.appendChild(label);
    fact.values.forEach((value) => {
      const chip = document.createElement('span');
      chip.textContent = value;
      group.appendChild(chip);
    });
    facts?.appendChild(group);
  });

  const bubble = wrap.querySelector<HTMLButtonElement>('.character-dialogue__bubble')!;
  const history = wrap.querySelector<HTMLElement>('.character-dialogue__history')!;
  const label = wrap.querySelector<HTMLElement>('.character-dialogue__label')!;
  const speaker = wrap.querySelector<HTMLElement>('.character-dialogue__speaker')!;
  const text = wrap.querySelector<HTMLElement>('.character-dialogue__text')!;
  const announcement = wrap.querySelector<HTMLElement>('.character-dialogue__announcement')!;
  const progress = wrap.querySelector<HTMLElement>('.character-dialogue__progress')!;
  const next = wrap.querySelector<HTMLButtonElement>('.character-dialogue__next')!;
  const skip = wrap.querySelector<HTMLButtonElement>('.character-dialogue__skip')!;
  const portraits = Array.from(wrap.querySelectorAll<HTMLElement>('[data-dialogue-role]'));
  let lineIndex = 0;
  let timer: number | null = null;
  let advanceTimer: number | null = null;
  let typing = false;
  let typedIndex = 0;
  let closeModal: () => void = () => undefined;
  let offClosed: () => void = () => undefined;
  let completed = false;
  let closeNotified = false;

  const clearTypingTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    typing = false;
    wrap.classList.remove('is-typing');
  };

  const clearAdvanceTimer = () => {
    if (advanceTimer !== null) window.clearTimeout(advanceTimer);
    advanceTimer = null;
  };

  const clearTimers = () => {
    clearTypingTimer();
    clearAdvanceTimer();
  };

  const lineSpeaker = (line: CharacterDialogueLine): string => line.speaker
    ?? (line.role === 'partner' ? partner?.name : opts.name)
    ?? opts.name;

  const syncHistory = () => {
    history.replaceChildren();
    lines.slice(0, lineIndex).forEach((line) => {
      const item = document.createElement('div');
      item.className = `character-dialogue__history-item is-${line.role === 'partner' ? 'partner' : 'character'}`;
      const who = document.createElement('strong');
      who.textContent = lineSpeaker(line);
      const copy = document.createElement('span');
      copy.textContent = line.text;
      item.append(who, copy);
      history.appendChild(item);
    });
    history.hidden = lineIndex === 0;
    history.scrollTop = history.scrollHeight;
  };

  const syncNextLabel = () => {
    if (typing) {
      next.textContent = '한 번에 보기';
      return;
    }
    const upcoming = lines[lineIndex + 1];
    if (!upcoming) {
      next.textContent = '대화 마치기';
      return;
    }
    next.textContent = '다음';
  };

  const finishDialogue = () => {
    completed = true;
    closeModal();
  };

  const advanceLine = () => {
    clearAdvanceTimer();
    if (lineIndex + 1 < lines.length) {
      lineIndex += 1;
      startLine();
      return;
    }
    finishDialogue();
  };

  const scheduleAdvance = () => {
    if (!opts.autoAdvance || advanceTimer !== null) return;
    const line = lines[lineIndex];
    const basePause = opts.autoAdvanceDelayMs ?? Math.max(1850, Math.min(4350, (line?.text.length ?? 0) * 58));
    const readingPause = opts.speedControl ? scaledDialogueDelay(basePause) : basePause;
    advanceTimer = window.setTimeout(advanceLine, readingPause);
  };

  const scheduleTypingTick = (line: CharacterDialogueLine): void => {
    timer = window.setTimeout(() => {
      typedIndex += 1;
      text.textContent = line.text.slice(0, typedIndex);
      if (typedIndex >= line.text.length) finishLine();
      else scheduleTypingTick(line);
    }, opts.speedControl ? scaledDialogueDelay(TYPE_MS) : TYPE_MS);
  };

  const finishLine = () => {
    const line = lines[lineIndex];
    if (!line) return;
    clearTypingTimer();
    text.textContent = line.text;
    bubble.setAttribute('aria-label', `${lineSpeaker(line)}의 말: ${line.text}`);
    syncNextLabel();
    scheduleAdvance();
  };

  function startLine(): void {
    const line = lines[lineIndex];
    if (!line) return;
    clearTimers();
    syncHistory();
    const activeRole = line.role ?? 'character';
    const activeSpeaker = lineSpeaker(line);
    portraits.forEach((portrait) => portrait.classList.toggle('is-speaking', portrait.dataset.dialogueRole === activeRole));
    bubble.classList.toggle('is-partner', activeRole === 'partner');
    bubble.classList.remove('is-turning');
    window.requestAnimationFrame(() => bubble.classList.add('is-turning'));
    label.textContent = line.label;
    speaker.textContent = activeSpeaker;
    progress.textContent = `${lineIndex + 1} / ${lines.length}`;
    announcement.textContent = '';
    window.requestAnimationFrame(() => { announcement.textContent = `${activeSpeaker}. ${line.text}`; });
    bubble.setAttribute('aria-label', `${activeSpeaker}의 말이 나오는 중이야. 누르면 바로 표시돼.`);
    if (reducedMotion()) {
      text.textContent = line.text;
      syncNextLabel();
      scheduleAdvance();
      return;
    }
    text.textContent = '';
    typing = true;
    typedIndex = 0;
    wrap.classList.add('is-typing');
    syncNextLabel();
    scheduleTypingTick(line);
  }

  const cleanup = () => {
    clearTimers();
    offClosed();
    offClosed = () => undefined;
  };

  bubble.addEventListener('click', () => {
    if (typing) finishLine();
    else if (opts.autoAdvance) advanceLine();
  });
  next.addEventListener('click', () => {
    void audio.playSfx('tap');
    if (typing) {
      finishLine();
      return;
    }
    if (lineIndex + 1 < lines.length) {
      lineIndex += 1;
      startLine();
      return;
    }
    finishDialogue();
  });
  skip.addEventListener('click', () => {
    void audio.playSfx('tap');
    clearTimers();
    finishDialogue();
  });
  if (opts.speedControl) {
    bindDialogueSpeedControl(wrap, () => {
      void audio.playSfx('tap');
      if (typing) {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        const line = lines[lineIndex];
        if (line) scheduleTypingTick(line);
      } else if (advanceTimer !== null) {
        clearAdvanceTimer();
        scheduleAdvance();
      }
    });
  }

  offClosed = bus.on('MODAL_CLOSED', ({ id }) => {
    if (id !== opts.id) return;
    cleanup();
    if (closeNotified) return;
    closeNotified = true;
    opts.onClose?.();
    if (completed) opts.onComplete?.();
  });
  closeModal = openModal({
    id: opts.id,
    title: opts.title ?? opts.name,
    bodyEl: wrap,
    dismissible: opts.dismissible
  });
  window.requestAnimationFrame(startLine);

  return () => {
    closeModal();
  };
}
