import { assetUrl, hasAsset } from '../core/assets';
import { reducedMotion } from './fx';
import { saveRepo } from '../core/SaveRepository';

/**
 * 마스코트 가이드 — 화면 글자를 줄이고, 안내는 캐릭터 머리 위 말풍선의
 * 타이핑 애니메이션으로 전달한다. 다음에 눌러야 할 곳은 setCue()로 표시한다.
 *
 * 사용법:
 *   const guide = createGuide({ assetId: 'plane.main', speakerName: '코리' });
 *   page.appendChild(guide.el);
 *   guide.say('생활 카드를 눌러 살펴봐요!', { cue: firstCard });
 *   guide.say('내 이야기도 들어 볼래?', { speaker: { assetId: 'oceania.youth', name: '라니' } });
 *   ...unmount()에서 guide.dispose()
 */
export interface GuideController {
  el: HTMLElement;
  say(text: string, opts?: GuideSayOptions): void;
  setSpeaker(speaker: GuideSpeaker): void;
  setCue(target: HTMLElement | null): void;
  dispose(): void;
}

export interface GuideSpeaker {
  assetId: string;
  name: string;
}

export interface GuideAction {
  label: string;
  ariaLabel?: string;
  kind?: 'primary' | 'ghost';
  onClick: () => void;
}

export interface GuideSayOptions {
  cue?: HTMLElement | null;
  speaker?: GuideSpeaker;
  /** 캐릭터를 한 번 더 누르지 않아도 바로 타이핑을 시작한다. */
  autoStart?: boolean;
  /** 말풍선을 자동으로 닫지 않는다. 선택지가 있으면 기본값은 true다. */
  persist?: boolean;
  /** 타이핑이 끝난 뒤 말풍선 아래에 표시할 선택지다. */
  actions?: GuideAction[];
}

const TYPE_MS = 28;
const GUIDE_TEXT_WARN_LENGTH = 54;



export function createGuide(opts: { assetId?: string; side?: 'left' | 'right'; speakerName?: string } = {}): GuideController {
  const assetId = opts.assetId ?? 'plane.main';
  let speakerName = opts.speakerName ?? '코리';
  const wrap = document.createElement('div');
  wrap.className = `guide-wrap ${opts.side === 'right' ? 'guide-right' : 'guide-left'}`;
  wrap.innerHTML = `
    <div class="guide-bubble" hidden>
      <button type="button" class="guide-bubble-copy">
        <span class="guide-speaker" aria-hidden="true"></span>
        <span class="guide-line" aria-hidden="true"><span class="guide-text"></span><span class="guide-caret"></span></span>
      </button>
      <div class="guide-actions" role="group" hidden></div>
    </div>
    <span class="visually-hidden guide-announcement" role="status" aria-live="polite" aria-atomic="true"></span>
    <button type="button" class="guide-mascot-button" aria-label="${speakerName}의 안내 듣기" aria-expanded="false" ${hasAsset(assetId) ? '' : 'hidden'}>
      <img class="guide-mascot bob" src="${hasAsset(assetId) ? assetUrl(assetId) : ''}" data-asset-id="${assetId}" alt="" aria-hidden="true">
    </button>`;

  const bubble = wrap.querySelector('.guide-bubble') as HTMLElement;
  const bubbleCopy = wrap.querySelector('.guide-bubble-copy') as HTMLButtonElement;
  const actionsEl = wrap.querySelector('.guide-actions') as HTMLElement;
  const textEl = wrap.querySelector('.guide-text') as HTMLElement;
  const speakerEl = wrap.querySelector('.guide-speaker') as HTMLElement;
  const announcement = wrap.querySelector('.guide-announcement') as HTMLElement;
  const mascot = wrap.querySelector('.guide-mascot-button') as HTMLButtonElement | null;
  const mascotImage = wrap.querySelector('.guide-mascot') as HTMLImageElement | null;
  let timer: number | null = null;
  let hideTimer: number | null = null;
  let cueTarget: HTMLElement | null = null;
  let fullText = '';
  let persistent = false;
  let actions: GuideAction[] = [];
  speakerEl.textContent = speakerName;

  const clearTyping = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    wrap.classList.remove('is-typing');
  };

  const clearHide = () => {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hideSpeech = () => {
    clearTyping();
    clearHide();
    bubble.hidden = true;
    actionsEl.hidden = true;
    wrap.classList.remove('is-speaking');
    wrap.classList.remove('has-actions');
    wrap.classList.add('has-message');
    mascot?.setAttribute('aria-expanded', 'false');
  };

  const scheduleHide = () => {
    clearHide();
    const readMs = Math.min(4500, Math.max(2200, fullText.length * 85));
    hideTimer = window.setTimeout(hideSpeech, readMs);
  };

  const finishTyping = () => {
    clearTyping();
    textEl.textContent = fullText;
    actionsEl.hidden = actions.length === 0;
    if (!persistent) scheduleHide();
  };

  const startSpeech = () => {
    if (!fullText) return;
    clearTyping();
    clearHide();
    bubble.hidden = false;
    actionsEl.hidden = true;
    wrap.classList.add('is-speaking');
    wrap.classList.remove('has-message');
    mascot?.setAttribute('aria-expanded', 'true');
    announcement.textContent = '';
    window.requestAnimationFrame(() => { announcement.textContent = fullText; });
    if (reducedMotion()) {
      textEl.textContent = fullText;
      finishTyping();
      return;
    }
    textEl.textContent = '';
    wrap.classList.add('is-typing');
    let i = 0;
    timer = window.setInterval(() => {
      i += 1;
      textEl.textContent = fullText.slice(0, i);
      if (i >= fullText.length) finishTyping();
    }, TYPE_MS);
  };

  // 별도 힌트 아이콘 없이 캐릭터 자체를 눌러 대사를 연다.
  mascot?.addEventListener('click', () => {
    if (bubble.hidden) startSpeech();
    else finishTyping();
  });
  // 말풍선을 누르면 타이핑을 바로 끝내고 문장을 온전히 보여 준다.
  bubbleCopy.addEventListener('click', finishTyping);

  const setCue = (target: HTMLElement | null) => {
    cueTarget?.classList.remove('tap-cue');
    cueTarget = target;
    if (target) target.classList.add('tap-cue');
  };

  const setSpeaker = (speaker: GuideSpeaker) => {
    speakerName = speaker.name;
    speakerEl.textContent = speakerName;
    if (mascot) mascot.setAttribute('aria-label', `${speakerName}의 안내 듣기`);
    if (!mascot || !mascotImage) return;
    if (!hasAsset(speaker.assetId)) {
      mascot.hidden = true;
      return;
    }
    mascot.hidden = false;
    mascotImage.src = assetUrl(speaker.assetId);
    mascotImage.dataset.assetId = speaker.assetId;
  };

  return {
    el: wrap,
    say(text, sayOpts) {
      if (sayOpts?.speaker) setSpeaker(sayOpts.speaker);
      fullText = text.replace(/\s+/g, ' ').trim();
      if (fullText.length > GUIDE_TEXT_WARN_LENGTH) {
        console.warn(`[guide] 핵심 안내는 ${GUIDE_TEXT_WARN_LENGTH}자 이하를 권장해요: ${fullText}`);
      }
      clearTyping();
      clearHide();
      actions = sayOpts?.actions ?? [];
      persistent = sayOpts?.persist ?? actions.length > 0;
      actionsEl.replaceChildren();
      for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `guide-action ${action.kind === 'ghost' ? 'is-ghost' : 'is-primary'}`;
        button.textContent = action.label;
        if (action.ariaLabel) button.setAttribute('aria-label', action.ariaLabel);
        button.addEventListener('click', () => {
          if (button.disabled) return;
          for (const sibling of actionsEl.querySelectorAll<HTMLButtonElement>('button')) sibling.disabled = true;
          action.onClick();
        });
        actionsEl.appendChild(button);
      }
      bubble.hidden = true;
      actionsEl.hidden = true;
      wrap.classList.toggle('has-actions', actions.length > 0);
      bubbleCopy.setAttribute('aria-label', `${speakerName}의 안내: ${fullText}. 누르면 문장을 바로 표시해요.`);
      announcement.textContent = '';
      textEl.textContent = '';
      wrap.classList.remove('is-speaking');
      wrap.classList.add('has-message');
      mascot?.setAttribute('aria-label', `${speakerName}의 안내 듣기`);
      mascot?.setAttribute('aria-expanded', 'false');
      if (sayOpts && 'cue' in sayOpts) setCue(sayOpts.cue ?? null);
      if (sayOpts?.autoStart) window.requestAnimationFrame(startSpeech);
    },
    setSpeaker,
    setCue,
    dispose() {
      clearTyping();
      clearHide();
      setCue(null);
      wrap.remove();
    }
  };
}
