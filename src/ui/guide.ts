import { assetUrl, hasAsset } from '../core/assets';
import { saveRepo } from '../core/SaveRepository';

/**
 * 마스코트 가이드 — 화면 글자를 줄이고, 안내는 캐릭터 머리 위 말풍선의
 * 타이핑 애니메이션으로 전달한다. 다음에 눌러야 할 곳은 setCue()로 표시한다.
 *
 * 사용법:
 *   const guide = createGuide({ assetId: 'plane.main' });
 *   page.appendChild(guide.el);
 *   guide.say('생활 카드를 눌러 살펴봐요!', { cue: firstCard });
 *   ...unmount()에서 guide.dispose()
 */
export interface GuideController {
  el: HTMLElement;
  say(text: string, opts?: { cue?: HTMLElement | null }): void;
  setCue(target: HTMLElement | null): void;
  dispose(): void;
}

const TYPE_MS = 28;

function reducedMotion(): boolean {
  return saveRepo.get().settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createGuide(opts: { assetId?: string; side?: 'left' | 'right' } = {}): GuideController {
  const assetId = opts.assetId ?? 'plane.main';
  const wrap = document.createElement('div');
  wrap.className = `guide-wrap ${opts.side === 'right' ? 'guide-right' : 'guide-left'}`;
  wrap.setAttribute('aria-live', 'polite');
  wrap.innerHTML = `
    <div class="guide-bubble" hidden><span class="guide-text"></span><span class="guide-caret" aria-hidden="true"></span></div>
    ${hasAsset(assetId) ? `<img class="guide-mascot bob" src="${assetUrl(assetId)}" alt="" aria-hidden="true">` : ''}`;

  const bubble = wrap.querySelector('.guide-bubble') as HTMLElement;
  const textEl = wrap.querySelector('.guide-text') as HTMLElement;
  const mascot = wrap.querySelector('.guide-mascot') as HTMLElement | null;
  let timer: number | null = null;
  let idleTimer: number | null = null;
  let cueTarget: HTMLElement | null = null;
  let fullText = '';

  // 읽을 시간을 준 뒤 말풍선을 접어 카드·버튼 가림을 없앤다. 마스코트를 탭하면 다시 펼친다.
  const IDLE_AFTER_MS = 4500;
  const scheduleIdle = () => {
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => wrap.classList.add('is-idle'), IDLE_AFTER_MS);
  };
  const wake = () => {
    wrap.classList.remove('is-idle');
    scheduleIdle();
  };
  mascot?.addEventListener('click', wake);

  const stopTyping = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    wrap.classList.remove('is-typing');
    scheduleIdle();
  };

  const showAll = () => {
    stopTyping();
    textEl.textContent = fullText;
  };

  // 탭하면 타이핑 스킵 (기다리기 싫은 학생 배려)
  bubble.addEventListener('click', showAll);

  const setCue = (target: HTMLElement | null) => {
    cueTarget?.classList.remove('tap-cue');
    cueTarget = target;
    if (target) target.classList.add('tap-cue');
  };

  return {
    el: wrap,
    say(text, sayOpts) {
      fullText = text;
      bubble.hidden = false;
      wrap.classList.remove('is-idle');
      stopTyping();
      if (sayOpts && 'cue' in sayOpts) setCue(sayOpts.cue ?? null);
      if (reducedMotion()) {
        textEl.textContent = text;
        scheduleIdle();
        return;
      }
      textEl.textContent = '';
      wrap.classList.add('is-typing');
      let i = 0;
      timer = window.setInterval(() => {
        i += 1;
        textEl.textContent = text.slice(0, i);
        if (i >= text.length) stopTyping();
      }, TYPE_MS);
    },
    setCue,
    dispose() {
      if (timer !== null) window.clearInterval(timer);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      timer = null;
      idleTimer = null;
      setCue(null);
      wrap.remove();
    }
  };
}
