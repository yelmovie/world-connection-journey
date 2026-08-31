import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { confirmDialog } from '../ui/modal';
import { buildTopBar, describeSavedRoute } from '../ui/chrome';
import { openCharacterDialogue } from '../ui/characterDialogue';
import { playVideoOverlay } from '../ui/videoOverlay';

const TITLE_LEFT_PLANE = 'title.plane.green.transparent';
const TITLE_RIGHT_PLANE = 'title.plane.pink.transparent';

type TitleSpeaker = 'left' | 'right';

const TITLE_CONVERSATIONS: Record<TitleSpeaker, { name: string; lines: string[] }> = {
  left: {
    name: '초록꼬리',
    lines: [
      '안녕! 나는 지도 속 재미있는 이야기를 잘 찾는 초록꼬리야.',
      '여행지마다 친구들의 생활과 문화가 다르대. 네 눈으로 천천히 찾아봐.',
      '준비됐으면 시작하기를 눌러 줘. 내가 옆에서 길을 찾아줄게!'
    ]
  },
  right: {
    name: '장미몽실',
    lines: [
      '안녕! 다섯 대륙 친구들이 너를 기다리고 있어.',
      '정답만 찾는 여행이 아니야. 친구의 말을 듣고 네 생각을 바꿔도 괜찮아.',
      '우리 같이 여행하면서 모두가 지킬 약속을 만들어 보자!'
    ]
  }
};


const TITLE_CSS = `
/* 첫 화면에서도 지도 선택 아이콘은 찾을 수 있게 남긴다. */
#scene-root .title-page .top-bar {
  height: auto; min-height: var(--top-bar-h); padding-block: var(--sp-2);
  position: relative; z-index: var(--z-controls);
  background: transparent !important; border: 0 !important; box-shadow: none !important;
  backdrop-filter: none !important;
}
.title-page .top-bar-title,
.title-page .journey-ticket { display: none !important; }
.title-page .top-bar-nav [data-act="back"],
.title-page .top-bar-nav [data-act="home"] { display:none !important; }
.title-page .top-bar-nav .btn-icon {
  background: rgba(255,255,255,.88);
  color: var(--c-navy);
  box-shadow: 0 8px 22px rgba(18,45,76,.2);
}
.title-page .top-bar-actions { margin-left: auto; }
.title-page .top-bar-actions .btn-icon {
  background: rgba(255,255,255,.88);
  color: var(--c-navy);
  box-shadow: 0 8px 22px rgba(18,45,76,.2);
  backdrop-filter: blur(8px);
}
.title-page { grid-template-rows:auto minmax(0,1fr) minmax(270px,36vh); }
.title-page > .page-body { grid-row:2; }
.title-page > .bottom-bar { grid-row:3; }
.title-body {
  display: flex; align-items: flex-start; justify-content: center;
  text-align: center; padding: clamp(28px, 5.5vh, 60px) var(--scene-safe) 0;
  overflow: hidden !important;
}
.title-stage {
  display:flex;align-items:center;justify-content:center;
  width:100%;max-width:1200px;
}
.title-copy {
  justify-self: center;
  display: flex; flex-direction: column; align-items: center;
  /* 소제목은 로고와 떨어뜨려 배경의 한국 지도 아래에 오게 하고, 한반도 지도가 중심에 오도록 우측으로 이동 */
  width:min(1120px,92vw);gap:clamp(14px,2.2vh,26px);min-width:0;
  position: relative; z-index: 2;
  transform: translateX(clamp(70px, 8.2vw, 160px));
  transition: opacity var(--t-fast);
}
/* 친구가 말하는 동안에는 제목을 비워 준다 — 말풍선이 로고에 묻히던 문제 */
.title-page:has(.title-speech:not([hidden])) .title-copy { opacity: 0; pointer-events: none; }
.title-logo {
  width:min(clamp(585px,64.5vw,975px),100%);max-height:30vh;object-fit:contain;
  filter: drop-shadow(0 9px 24px rgba(10,25,45,.42));
}
.title-subtitle {
  margin:0;max-width:36em;color:#fff;
  font-family:var(--font-head);font-size:clamp(26px,2.25vw,38px);font-weight:800;line-height:1.22;
  text-wrap: balance; word-break: keep-all; text-shadow: 0 3px 12px rgba(9,34,63,.82);
  white-space: nowrap;
}
.title-launch {
  position:relative;display:flex;align-items:flex-end;justify-content:center;
  width:100%;height:100%;
}
.title-character {
  position:absolute;bottom:clamp(8px,1.8vh,18px);
  width:min(clamp(285px,27vw,450px),51vh);max-height:51vh;padding:0;border:0;background:transparent;
  filter: drop-shadow(0 14px 28px rgba(10,25,45,.42));
  z-index:2;cursor:pointer;
}
.title-character img { display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom; }
.title-character:hover,.title-character:focus-visible { filter:drop-shadow(0 18px 34px rgba(10,25,45,.52)) brightness(1.05);outline:4px solid rgba(255,255,255,.72);outline-offset:5px;border-radius:40%; }
.title-character--left { left:clamp(20px,5vw,104px);animation:bob 3.8s ease-in-out 2; }
.title-character--right { right:clamp(20px,5vw,104px);animation:bob 4.4s ease-in-out 2;animation-delay:.65s; }
.title-speech {
  position:absolute;left:clamp(22px,5.5vw,108px);bottom:min(47vh,430px);z-index:5;
  width:min(430px,31vw);min-height:126px;padding:18px 58px 16px 22px;
  color:var(--c-navy);text-align:left;background:rgba(255,252,242,.97);
  border:3px solid var(--c-gold);border-radius:26px;
  box-shadow:0 16px 38px rgba(8,34,61,.28);
  animation:title-speech-in .24s ease-out;cursor:pointer;
}
.title-speech[data-side="right"] { left:auto;right:clamp(22px,5.5vw,108px); }
.title-speech[hidden] { display:none; }
.title-speech::after {
  content:'';position:absolute;bottom:-22px;border:12px solid transparent;border-top-color:var(--c-gold);
}
.title-speech[data-side="left"]::after { left:20%;transform:rotate(13deg); }
.title-speech[data-side="right"]::after { right:20%;transform:rotate(-13deg); }
.title-speech__name { display:block;margin-bottom:5px;color:#15745b;font-family:var(--font-head);font-size:22px;line-height:1.1; }
.title-speech[data-side="right"] .title-speech__name { color:#a54379; }
.title-speech__text { margin:0;min-height:2.8em;font-size:20px;font-weight:800;line-height:1.4;word-break:keep-all; }
.title-speech__close {
  position:absolute;top:9px;right:10px;width:38px;height:38px;padding:0;border:0;border-radius:50%;
  color:var(--c-navy);background:rgba(23,58,91,.09);font-size:25px;line-height:1;cursor:pointer;
}
.title-speech__hint { display:block;margin-top:8px;color:#6f5514;font-size:15px;font-weight:850; }
.title-speech__hint::before { content:'↗ '; }
.title-speech:focus-visible { outline:5px solid #fff;outline-offset:4px; }
@keyframes title-speech-in {
  from { opacity:0;transform:translateY(12px) scale(.96); }
  to { opacity:1;transform:translateY(0) scale(1); }
}
.title-cta {
  position:relative;z-index:3;display:flex;width:min(650px,42vw);gap:clamp(10px,1.4vw,18px);
  justify-content:center;margin-bottom:clamp(28px,5vh,50px);
}
.title-cta .btn-big {
  flex:1 1 0;min-width:0;min-height:64px;padding:12px 24px;
  border:2px solid rgba(255,255,255,.74);color:#fff;font-size:clamp(22px,1.7vw,28px);line-height:1.1;
  background:rgba(255,255,255,.22);box-shadow:0 5px 0 rgba(13,54,90,.32),0 12px 28px rgba(9,34,63,.2);
  text-shadow:0 2px 8px rgba(9,34,63,.72);backdrop-filter:blur(10px) saturate(1.08);
}
.title-cta .btn-primary { background:rgba(242,193,78,.58);color:#fff;box-shadow:0 5px 0 rgba(151,105,18,.42),0 12px 28px rgba(9,34,63,.2); }
.title-cta .btn-big:disabled { background:rgba(255,255,255,.16);color:rgba(255,255,255,.82);opacity:.76; }
#scene-root .title-page > .bottom-bar {
  align-items:flex-end;justify-content:center;min-height:270px;
  padding:0 var(--scene-safe);
  background:transparent !important;border:0 !important;box-shadow:none !important;
  backdrop-filter:none !important;
}
:root[data-reduced-motion="true"] .title-character { animation: none; }
@media (prefers-reduced-motion: reduce) { .title-character { animation: none; } }
@media (max-width: 720px) {
  #scene-root .title-page .top-bar { min-height: 56px; padding-block: 4px; }
  .title-page { grid-template-rows:auto minmax(0,1fr) minmax(170px,32vh); }
  .title-body { padding:clamp(12px,4vh,28px) 14px 0; }
  .title-copy { width:94vw;gap:clamp(42px,6vh,64px); transform: translateX(clamp(16px, 4vw, 36px)); }
  .title-logo { width:min(91vw,590px);max-height:25vh; }
  .title-subtitle { font-size:clamp(20px,5vw,28px); white-space: normal; }
  #scene-root .title-page > .bottom-bar { min-height:170px;padding:0 8px; }
  .title-character { width:min(27vw,172px,28.5vh);max-height:28.5vh;bottom:8px; }
  .title-character--left { left:4px; }
  .title-character--right { right:4px; }
  .title-speech { left:8px;width:min(43vw,220px);bottom:calc(28.5vh + 18px);min-height:106px;padding:14px 42px 12px 14px;border-radius:20px; }
  .title-speech[data-side="right"] { right:8px; }
  .title-speech__name { font-size:18px; }
  .title-speech__text { font-size:16px; }
  .title-speech__hint { margin-top:6px;font-size:13px; }
  .title-cta { width:min(62vw,390px);gap:7px;margin-bottom:20px; }
  .title-cta .btn-big { min-height:54px;padding-inline:8px;font-size:18px; }
}
@media (max-height: 640px) and (min-width: 721px) {
  #scene-root .title-page .top-bar { position:absolute;inset:0 0 auto 0; }
  .title-page { grid-template-rows:minmax(0,1fr) minmax(170px,40vh); }
  .title-page > .page-body { grid-row:1; }
  .title-page > .bottom-bar { grid-row:2; }
  .title-body { padding-top:clamp(8px,2vh,18px); }
  .title-copy { gap:clamp(16px,5vh,28px); }
  .title-logo { width:min(60vw,700px);max-height:27vh; }
  .title-subtitle { font-size:clamp(27px,3.3vw,38px); }
  #scene-root .title-page > .bottom-bar { min-height:170px; }
  .title-character { width:min(45vw,495px,55vh);max-height:55vh;bottom:4px; }
  .title-character--left { left:4px; }
  .title-character--right { right:4px; }
  .title-speech { left:14px;width:min(330px,33vw);bottom:calc(55vh + 10px);min-height:104px;padding:13px 44px 11px 16px;border-radius:20px; }
  .title-speech[data-side="right"] { right:14px; }
  .title-speech__name { font-size:18px; }
  .title-speech__text { min-height:2.6em;font-size:17px;line-height:1.3; }
  .title-speech__hint { margin-top:5px;font-size:13px; }
  .title-cta { width:min(560px,44vw);margin-bottom:18px; }
  .title-cta .btn-big { min-height:52px;font-size:20px; }
}
.prologue-overlay {
  position: fixed; inset: 0; z-index: var(--z-loading);
  background-size: cover; background-position: center;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--sp-5); padding: var(--sp-5); cursor: pointer;
}
.prologue-overlay::before { content: ''; position: absolute; inset: 0; background: rgba(10, 22, 40, 0.72); }
.prologue-mascot { position: relative; width: clamp(190px, 22vw, 330px); filter: drop-shadow(0 10px 24px rgba(0,0,0,0.5)); animation: bob 3.2s ease-in-out 2; }
.prologue-bubble {
  position: relative; background: var(--c-paper); color: var(--c-ink);
  border-radius: var(--radius-l); padding: var(--sp-5) var(--sp-6);
  max-width: min(760px, 88vw); min-height: 112px;
  font-family: var(--font-head); font-size: clamp(26px, 2.5vw, 38px); line-height: 1.45;
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
  return {
    async mount(root: HTMLElement) {
      const hasSave = saveRepo.hasValidSave();
      await preloadImages([
        'bg.title', 'title.logo', TITLE_LEFT_PLANE, TITLE_RIGHT_PLANE
      ]);
      audio.playBgm('main');

      const page = document.createElement('div');
      page.className = 'page title-page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.08), rgba(20,45,80,0.25)), url('${assetUrl('bg.title')}')`;

      const style = document.createElement('style');
      style.textContent = TITLE_CSS;
      page.appendChild(style);

      page.appendChild(buildTopBar({ title: '세계를 잇는 여행' }));
      page.insertAdjacentHTML('beforeend', `
        <div class="page-body title-body">
          <div class="title-stage">
            <div class="title-copy">
              <img class="title-logo" src="${assetUrl('title.logo')}" alt="세계를 잇는 여행" data-asset-id="title.logo">
              <p class="title-subtitle">다섯 대륙 친구들의 목소리로 공동 약속을 완성하는 여행</p>
            </div>
          </div>
        </div>
        <div class="bottom-bar">
          <div class="title-launch">
            ${hasAsset(TITLE_LEFT_PLANE) ? `<button type="button" class="title-character title-character--left" data-act="talk-left" aria-label="초록꼬리와 이야기하기"><img src="${assetUrl(TITLE_LEFT_PLANE)}" data-asset-id="${TITLE_LEFT_PLANE}" alt="초록 생태 비행기 초록꼬리"></button>` : ''}
            <aside class="title-speech" data-side="left" role="button" tabindex="0" aria-label="말풍선을 눌러 다음 대화 듣기" hidden>
              <button type="button" class="title-speech__close" data-act="speech-close" aria-label="말풍선 닫기">×</button>
              <strong class="title-speech__name" data-speech-name></strong>
              <p class="title-speech__text" data-speech-text aria-hidden="true"></p>
              <span class="visually-hidden" data-speech-live role="status" aria-live="polite" aria-atomic="true"></span>
              <span class="title-speech__hint" aria-hidden="true">말풍선을 눌러 계속</span>
            </aside>
            <div class="title-cta">
              <button class="btn btn-primary btn-big" data-act="new">시작하기</button>
              <button class="btn btn-big" data-act="continue"
                title="${hasSave ? describeSavedRoute(saveRepo.get().lastRoute) : '저장된 여행이 없어요'}"
                ${hasSave ? '' : 'disabled aria-disabled="true"'}>
                이어하기
              </button>
            </div>
            ${hasAsset(TITLE_RIGHT_PLANE) ? `<button type="button" class="title-character title-character--right" data-act="talk-right" aria-label="장미몽실과 이야기하기"><img src="${assetUrl(TITLE_RIGHT_PLANE)}" data-asset-id="${TITLE_RIGHT_PLANE}" alt="핑크 축제 비행기 장미몽실"></button>` : ''}
          </div>
        </div>`);

      page.querySelector('[data-act="new"]')?.addEventListener('click', () => {
        void audio.playSfx('tap');
        if (hasSave) {
          confirmDialog(
            '새 여행을 시작할까요?',
            '지금 시작하면 이전 도장과 여행 기록이 지워져요. 정말 새로 시작할까요?',
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
      const speech = page.querySelector<HTMLElement>('.title-speech');
      const speechName = page.querySelector<HTMLElement>('[data-speech-name]');
      const speechText = page.querySelector<HTMLElement>('[data-speech-text]');
      const speechLive = page.querySelector<HTMLElement>('[data-speech-live]');
      let activeSpeaker: TitleSpeaker = 'left';
      let speechIndex = 0;
      let typingTimer: number | undefined;

      const stopTyping = () => {
        if (typingTimer !== undefined) window.clearInterval(typingTimer);
        typingTimer = undefined;
      };

      const closeSpeech = () => {
        stopTyping();
        if (speech) speech.hidden = true;
      };
      const renderSpeech = () => {
        if (!speech || !speechName || !speechText) return;
        const conversation = TITLE_CONVERSATIONS[activeSpeaker];
        const line = conversation.lines[speechIndex] ?? '';
        speech.dataset.side = activeSpeaker;
        speechName.textContent = conversation.name;
        speechText.textContent = '';
        if (speechLive) speechLive.textContent = `${conversation.name}: ${line}`;
        speech.hidden = false;
        speech.style.animation = 'none';
        void speech.offsetHeight;
        speech.style.animation = '';
        stopTyping();
        let cursor = 0;
        typingTimer = window.setInterval(() => {
          cursor = Math.min(line.length, cursor + 1);
          speechText.textContent = line.slice(0, cursor);
          if (cursor >= line.length) stopTyping();
        }, 28);
      };
      const openSpeech = (speaker: TitleSpeaker) => {
        void audio.playSfx('tap');
        activeSpeaker = speaker;
        speechIndex = 0;
        renderSpeech();
        speech?.focus({ preventScroll: true });
      };

      const advanceSpeech = () => {
        if (!speech || speech.hidden) return;
        const line = TITLE_CONVERSATIONS[activeSpeaker].lines[speechIndex] ?? '';
        if (typingTimer !== undefined) {
          stopTyping();
          if (speechText) speechText.textContent = line;
          return;
        }
        void audio.playSfx('tap');
        const lastIndex = TITLE_CONVERSATIONS[activeSpeaker].lines.length - 1;
        if (speechIndex >= lastIndex) {
          closeSpeech();
          page.querySelector<HTMLButtonElement>('[data-act="new"]')?.focus({ preventScroll: true });
          return;
        }
        speechIndex += 1;
        renderSpeech();
      };

      page.querySelector('[data-act="talk-left"]')?.addEventListener('click', () => openSpeech('left'));
      page.querySelector('[data-act="talk-right"]')?.addEventListener('click', () => openSpeech('right'));
      page.querySelector('[data-act="speech-close"]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        closeSpeech();
      });
      speech?.addEventListener('click', advanceSpeech);
      speech?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        advanceSpeech();
      });
      root.appendChild(page);
    },
    unmount() {
      /* DOM은 라우터가 정리, BGM은 다음 장면에서 crossfade */
      document.querySelector('.video-overlay')?.remove();
    }
  };
}

/** 인트로 자막 — 영상 장면 순서: 구름 위 만남 → 세계지도 위 비행 → 친구들 탄 비행기 → 창밖 지도 → 지구 위 항로 */
const INTRO_CUES = [
  { start: 0, end: 3.2, text: '안녕! 나는 세계를 잇는 비행기, 코리야.' },
  { start: 3.2, end: 6.4, text: '오늘은 너와 함께 다섯 대륙 친구들을 만나러 갈 거야.' },
  { start: 6.4, end: 9.8, text: '보고, 묻고, 들으면서 친구들의 하루를 탐험해 보자.' },
  { start: 9.8, end: 13.2, text: '여행이 끝나면 친구들이 보낸 특별한 신호가 도착할 거야.' },
  { start: 13.2, end: 16.5, text: '자, 여권을 만들고 출발하자!' }
];

/** 프롤로그 — 인트로 영상(intro/intro.mp4 원본 → public/video/intro.mp4). 건너뛰기·로드 실패 시에도 onDone으로 이어진다. */
export function showPrologue(onDone: () => void, finalLabel = '여권 만들러 가기'): void {
  playVideoOverlay({
    id: 'intro',
    src: 'video/intro.mp4',
    poster: 'video/intro_poster.jpg',
    title: '세계를 잇는 여행 인트로 영상',
    skipLabel: `건너뛰고 ${finalLabel}`,
    cues: INTRO_CUES,
    onDone
  });
}
