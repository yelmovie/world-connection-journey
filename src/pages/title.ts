import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { confirmDialog } from '../ui/modal';
import { describeSavedRoute, openSettings } from '../ui/chrome';
import { createGuide, type GuideController } from '../ui/guide';

const SVG_SOUND_ON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg>`;
const SVG_SOUND_OFF = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><line x1="15" y1="9" x2="21" y2="15"/><line x1="21" y1="9" x2="15" y2="15"/></svg>`;
const SVG_GEAR = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>`;

const PROLOGUE_LINES = [
  '먼저 그림과 자료를 천천히 관찰해요.',
  '궁금한 점은 물어보고, 친구의 말을 끝까지 들어요.',
  '새로 안 사실로 내 생각을 바꾸며 여행해요.'
];

const TITLE_CSS = `
/* 상단바: 제목 없이 소리·설정만 — 리본 잘림 방지를 위해 높이는 내용에 맞춘다 */
.title-page .top-bar { height: auto; min-height: 0; padding-block: var(--sp-2); justify-content: flex-end; }
.title-body {
  align-items: center; justify-content: center; text-align: center;
  gap: clamp(4px, 1.4vh, 18px);
}
/* 로고는 조연 — 주인공은 마스코트다 */
.title-logo { width: min(clamp(260px, 40vw, 560px), 96%); max-height: 16vh; object-fit: contain; filter: drop-shadow(0 8px 24px rgba(10,25,45,0.45)); }
.title-hero { display: flex; align-items: flex-end; justify-content: center; gap: clamp(6px, 3vw, 56px); width: 100%; }
/* §7 주인공 캐릭터: clamp(200px,24vw,360px) — 낮은 화면에서만 vh로 잘림 방지 */
.title-hero .hero-plane { width: min(clamp(200px, 24vw, 360px), 38vh); filter: drop-shadow(0 12px 26px rgba(10,25,45,0.45)); }
.title-hero .title-deco { width: min(clamp(64px, 9vw, 150px), 18vh); filter: drop-shadow(0 6px 14px rgba(10,25,45,0.35)); }
.title-hero .title-deco.deco-left { animation: bob 3.8s ease-in-out 2; }
.title-hero .title-deco.deco-right { animation: bob 4.4s ease-in-out 2; animation-delay: 0.7s; }
.title-cta { display: flex; gap: clamp(10px, 2vw, 28px); flex-wrap: wrap; justify-content: center; }
.title-cta .btn-big { min-width: clamp(190px, 21vw, 280px); }
/* CTA는 하단 고정 행에 둔다 — 화면이 낮아도 "새 여행"이 항상 보이게 (스크롤에 갇히지 않음) */
.title-page .bottom-bar {
  flex-direction: column; align-items: center; justify-content: center;
  gap: var(--sp-2); min-height: 0; padding-block: var(--sp-2) var(--sp-3);
}
.title-foot-note {
  color: rgba(255,255,255,0.92); font-size: var(--fs-small); font-weight: 700;
  text-shadow: 0 1px 5px rgba(0,0,0,0.55);
}
/* 장식 소품 — 배경 위에 놓이고 클릭을 막지 않는다 */
.title-props { position: absolute; left: clamp(6px, 2vw, 40px); bottom: clamp(4px, 1.4vh, 24px); }
.title-props img { filter: drop-shadow(0 8px 16px rgba(10,25,45,0.35)); }
.title-props .prop-suitcase { width: min(clamp(84px, 11vw, 168px), 20vh); }
.title-props .prop-passport { width: min(clamp(58px, 8vw, 114px), 14vh); margin-left: -34px; margin-bottom: 14px; vertical-align: bottom; }
.title-signpost { position: absolute; right: clamp(6px, 2vw, 40px); bottom: clamp(4px, 1.4vh, 24px); width: min(clamp(70px, 9vw, 150px), 22vh); filter: drop-shadow(0 8px 16px rgba(10,25,45,0.35)); }
.btn-cta-icon { width: 30px; height: 30px; object-fit: contain; }
:root[data-reduced-motion="true"] .title-deco, :root[data-reduced-motion="true"] .prologue-mascot { animation: none; }
@media (prefers-reduced-motion: reduce) { .title-deco, .prologue-mascot { animation: none; } }
/* 프롤로그 오버레이 */
.prologue-overlay {
  position: fixed; inset: 0; z-index: 400;
  background-size: cover; background-position: center;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--sp-5); padding: var(--sp-5); cursor: pointer;
}
.prologue-overlay::before { content: ''; position: absolute; inset: 0; background: rgba(10, 22, 40, 0.72); }
.prologue-mascot { position: relative; width: clamp(140px, 20vw, 260px); filter: drop-shadow(0 10px 24px rgba(0,0,0,0.5)); animation: bob 3.2s ease-in-out 2; }
.prologue-bubble {
  position: relative; background: var(--c-paper); color: var(--c-ink);
  border-radius: var(--radius-l); padding: var(--sp-5) var(--sp-6);
  max-width: min(620px, 88vw); min-height: 90px;
  font-family: var(--font-head); font-size: var(--fs-title);
  box-shadow: var(--shadow-pop); text-align: center;
  display: flex; align-items: center; justify-content: center;
}
.prologue-bubble::before {
  content: ''; position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
  border: 14px solid transparent; border-bottom-color: var(--c-paper); border-top: 0;
}
.prologue-dots { position: relative; display: flex; gap: 10px; }
.prologue-dots span { width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.35); }
.prologue-dots span.is-now { background: var(--c-gold); }
.prologue-next { position: relative; }
.prologue-skip { position: absolute; top: var(--sp-4); right: var(--sp-4); z-index: 2; }
`;

export function createPage(): Page {
  let guide: GuideController | null = null;

  return {
    async mount(root: HTMLElement) {
      await preloadImages([
        'bg.title', 'title.logo', 'plane.main', 'plane.alt1', 'plane.alt2',
        'prop.suitcase', 'prop.passport', 'icon.compass',
        'deco.landmark_eiffel', 'deco.landmark_liberty', 'deco.signpost'
      ]);
      audio.playBgm('main');

      const hasSave = saveRepo.hasValidSave();
      const page = document.createElement('div');
      page.className = 'page title-page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.08), rgba(20,45,80,0.25)), url('${assetUrl('bg.title')}')`;

      const style = document.createElement('style');
      style.textContent = TITLE_CSS;
      page.appendChild(style);

      const soundOn = () => {
        const s = saveRepo.get().settings;
        return s.bgm || s.sfx;
      };

      page.insertAdjacentHTML('beforeend', `
        <header class="top-bar">
          <div class="spacer"></div>
          <button class="btn btn-ghost btn-icon" data-act="sound" aria-label="소리 켜기/끄기">${soundOn() ? SVG_SOUND_ON : SVG_SOUND_OFF}</button>
          <button class="btn btn-ghost btn-icon" data-act="settings" aria-label="설정">${SVG_GEAR}</button>
        </header>
        <div class="page-body title-body">
          <img class="title-logo" src="${assetUrl('title.logo')}" alt="세계를 잇는 여행" data-asset-id="title.logo">
          <div class="title-hero">
            ${hasAsset('deco.landmark_eiffel') ? `<img class="title-deco deco-left" src="${assetUrl('deco.landmark_eiffel')}" data-asset-id="deco.landmark_eiffel" alt="" aria-hidden="true">` : ''}
            ${hasAsset('plane.main') ? `<img class="hero-plane bob" src="${assetUrl('plane.main')}" data-asset-id="plane.main" alt="" aria-hidden="true">` : ''}
            ${hasAsset('deco.landmark_liberty') ? `<img class="title-deco deco-right" src="${assetUrl('deco.landmark_liberty')}" data-asset-id="deco.landmark_liberty" alt="" aria-hidden="true">` : ''}
          </div>
        </div>
        <div class="bottom-bar">
          <div class="title-cta">
            <button class="btn btn-primary btn-big" data-act="new">
              ${hasAsset('icon.compass') ? `<img class="btn-cta-icon" src="${assetUrl('icon.compass')}" data-asset-id="icon.compass" alt="" aria-hidden="true">` : ''}새 여행
            </button>
            <button class="btn btn-big" data-act="continue"
              title="${hasSave ? describeSavedRoute(saveRepo.get().lastRoute) : '저장된 여행이 없어요'}"
              ${hasSave ? '' : 'disabled aria-disabled="true"'}>
              ${hasAsset('plane.alt1') ? `<img class="btn-cta-icon" src="${assetUrl('plane.alt1')}" data-asset-id="plane.alt1" alt="" aria-hidden="true">` : ''}이어하기
            </button>
          </div>
          <p class="title-foot-note">초등학교 6학년 사회 · 지구촌 사람들</p>
        </div>
        <div class="page-deco" aria-hidden="true">
          <div class="title-props">
            ${hasAsset('prop.suitcase') ? `<img class="prop-suitcase" src="${assetUrl('prop.suitcase')}" data-asset-id="prop.suitcase" alt="">` : ''}
            ${hasAsset('prop.passport') ? `<img class="prop-passport" src="${assetUrl('prop.passport')}" data-asset-id="prop.passport" alt="">` : ''}
          </div>
          ${hasAsset('deco.signpost') ? `<img class="title-signpost" src="${assetUrl('deco.signpost')}" data-asset-id="deco.signpost" alt="">` : ''}
        </div>`);

      page.querySelector('[data-act="new"]')?.addEventListener('click', () => {
        void audio.playSfx('tap');
        if (hasSave) {
          confirmDialog(
            '새 여행을 시작할까요?',
            '지금 시작하면 이전 여행 기록(도장, 점수)이 지워져요. 정말 새로 시작할까요?',
            '새로 시작',
            () => {
              saveRepo.reset();
              showPrologue(() => navigate('#/passport'));
            }
          );
        } else {
          showPrologue(() => navigate('#/passport'));
        }
      });
      page.querySelector('[data-act="continue"]')?.addEventListener('click', () => {
        void audio.playSfx('tap');
        const last = saveRepo.get().lastRoute;
        navigate(last && last !== '#/' ? last : '#/map');
      });
      page.querySelector('[data-act="settings"]')?.addEventListener('click', () => openSettings());
      const soundBtn = page.querySelector<HTMLElement>('[data-act="sound"]');
      soundBtn?.addEventListener('click', () => {
        const next = !soundOn();
        audio.setSettings(next, next);
        soundBtn.innerHTML = next ? SVG_SOUND_ON : SVG_SOUND_OFF;
        if (next) void audio.playSfx('tap');
      });

      // 마스코트 가이드 — 중앙 마스코트(plane.main)와 겹치지 않게 돋보기 변형 사용
      guide = createGuide({ assetId: hasAsset('plane.alt2') ? 'plane.alt2' : 'plane.main' });
      page.appendChild(guide.el);
      guide.say(
        hasSave
          ? '세계의 친구들을 만나러 떠나요! 이어하기를 누르면 하던 여행으로 돌아가요.'
          : '세계의 친구들을 만나러 떠나요! 새 여행을 눌러요.',
        { cue: page.querySelector<HTMLElement>(hasSave ? '[data-act="continue"]' : '[data-act="new"]') }
      );

      root.appendChild(page);
    },
    unmount() {
      /* DOM은 라우터가 정리, BGM은 다음 장면에서 crossfade */
      guide?.dispose();
      guide = null;
      document.querySelector('.prologue-overlay')?.remove();
    }
  };
}

/** 프롤로그 3컷 — 순수 UI 오버레이. 끝나면 onDone(여권 이동). */
function showPrologue(onDone: () => void): void {
  const reduced = saveRepo.get().settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const overlay = document.createElement('div');
  overlay.className = 'prologue-overlay';
  overlay.style.backgroundImage = `url('${assetUrl('bg.title')}')`;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'prologue-title');
  overlay.innerHTML = `
    <h2 id="prologue-title" class="visually-hidden">여행 방법 세 가지</h2>
    <button class="btn btn-ghost prologue-skip" data-act="skip">건너뛰기</button>
    ${hasAsset('plane.main') ? `<img class="prologue-mascot" src="${assetUrl('plane.main')}" data-asset-id="plane.main" alt="" aria-hidden="true">` : ''}
    <div class="prologue-bubble" aria-live="polite"><span class="prologue-text"></span></div>
    <div class="prologue-dots">${PROLOGUE_LINES.map((_, i) => `<span class="${i === 0 ? 'is-now' : ''}"></span>`).join('')}</div>
    <button class="btn btn-primary btn-big prologue-next" data-act="next">다음</button>`;

  const textEl = overlay.querySelector('.prologue-text') as HTMLElement;
  const dots = Array.from(overlay.querySelectorAll<HTMLElement>('.prologue-dots span'));
  const nextBtn = overlay.querySelector('[data-act="next"]') as HTMLButtonElement;

  let cut = 0;
  let timer: number | null = null;
  let typingDone = false;
  let finished = false;
  const previousFocus = document.activeElement as HTMLElement | null;

  const stopTimer = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const showCut = (i: number) => {
    cut = i;
    dots.forEach((d, di) => d.classList.toggle('is-now', di === i));
    nextBtn.textContent = i === PROLOGUE_LINES.length - 1 ? '여권 만들러 가기' : '다음';
    const line = PROLOGUE_LINES[i] ?? '';
    stopTimer();
    if (reduced) {
      textEl.textContent = line;
      typingDone = true;
      return;
    }
    typingDone = false;
    textEl.textContent = '';
    let ch = 0;
    timer = window.setInterval(() => {
      ch += 1;
      textEl.textContent = line.slice(0, ch);
      if (ch >= line.length) {
        stopTimer();
        typingDone = true;
      }
    }, 30);
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    stopTimer();
    overlay.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    previousFocus?.focus();
    onDone();
  };

  const advance = () => {
    if (!typingDone) {
      // 타이핑 중 탭 = 전체 문장 즉시 표시
      stopTimer();
      textEl.textContent = PROLOGUE_LINES[cut] ?? '';
      typingDone = true;
      return;
    }
    if (cut >= PROLOGUE_LINES.length - 1) finish();
    else showCut(cut + 1);
  };

  nextBtn.addEventListener('click', () => { void audio.playSfx('tap'); advance(); });
  overlay.querySelector('.prologue-bubble')?.addEventListener('click', () => { void audio.playSfx('tap'); advance(); });
  overlay.querySelector('[data-act="skip"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void audio.playSfx('tap');
    finish();
  });

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  overlay.addEventListener('keydown', onKeyDown);

  document.body.appendChild(overlay);
  showCut(0);
  nextBtn.focus();
}
