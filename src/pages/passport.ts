import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { buildTopBar } from '../ui/chrome';
import { createGuide, type GuideController } from '../ui/guide';
import { burstConfetti, popBounce } from '../ui/fx';
import { cancelJourneyTransition, playJourneyTransition } from '../ui/journeyTransition';
import { showToast } from '../ui/toast';
import { CONTINENT_IDS } from '../types';

interface CommonContent {
  nickname?: { minLen: number; maxLen: number; banned: string[] };
  inquiryQuestions?: string[];
}

const FALLBACK_QUESTIONS = [
  '친구들의 하루는 무엇이 같고 다를까?',
  '문화와 자연을 어떻게 지킬까?',
  '서로 다를 때 어떻게 이야기할까?'
];

const STAMP_LABELS: Record<string, string> = {
  asia: '아시아', europe: '유럽', africa: '아프리카',
  americas: '아메리카', oceania: '오세아니아', dialogue: '존중 대화'
};

/** label = 스크린리더용 전체 설명, short = 화면에 보이는 한 줄 라벨(2~4자) */
const AVATARS = [
  { saveId: 'a1', assetId: 'char.boy3d', label: '호기심 많은 탐험가', short: '탐험가' },
  { saveId: 'a2', assetId: 'deco.explorer1', label: '지도를 든 탐험가', short: '지도' },
  { saveId: 'a3', assetId: 'deco.explorer2', label: '나침반을 든 탐험가', short: '나침반' },
  { saveId: 'a4', assetId: 'asia.child1', label: '자료를 살피는 어린이', short: '관찰' },
  { saveId: 'a5', assetId: 'americas.student1', label: '함께 계획하는 학생', short: '계획' },
  { saveId: 'a6', assetId: 'oceania.youth', label: '바다를 지키는 청소년', short: '바다' }
] as const;

const PLANES = [
  { saveId: 'plane1', assetId: 'plane.main', label: '코리 탐험 비행기', short: '코리' },
  { saveId: 'plane2', assetId: 'plane.explorer', label: '프로펠러 탐험 비행기', short: '프로펠러' },
  { saveId: 'plane3', assetId: 'plane.jet', label: '빠른 세계 여행 비행기', short: '제트' }
] as const;

const PASSPORT_CSS = `
.passport-page { background-position:center;background-size:cover; }
/* 리본 제목이 화면 위로 잘리지 않게 상단바 높이를 내용에 맞춘다 */
.passport-page .top-bar { height:auto;min-height:var(--top-bar-h);padding-block:var(--sp-2); }
.passport-body { padding-block:var(--sp-2); }
/* 셸은 배경이 그대로 보이도록 투명. 패널은 두 개만(§7) */
.passport-shell {
  width:min(1180px,100%);margin:0 auto;
  display:grid;grid-template-columns:minmax(0,1.32fr) minmax(220px,.68fr);
  gap:var(--scene-gap);align-items:start;
}
/* §7 반투명 패널 — 배경 일러스트가 비쳐 보이게 */
.passport-shell .scene-board {
  background:rgba(255,252,240,.9);backdrop-filter:blur(6px);
  border-color:rgba(227,211,166,.9);
}
.passport-form { min-width:0;display:grid;gap:var(--sp-2);padding:var(--sp-3);align-content:start; }
.passport-section { min-width:0; }
.passport-label { display:block;margin-bottom:4px;font-weight:900;color:var(--c-navy);font-size:var(--fs-small);font-family:var(--font-head); }
.passport-nickname { width:100%;min-height:48px;padding:8px 12px;border:2px solid var(--c-line);border-radius:var(--radius-s);font-size:var(--fs-body);background:#fff; }
/* 별명은 라벨을 같은 줄에 둬서 한 행을 아낀다 */
.passport-nick-row { display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--sp-2);align-items:center; }
.passport-nick-row .passport-label { margin-bottom:0;white-space:nowrap; }
.passport-nick-row #nick-msg { grid-column:1/-1; }
/* 빈 상태에서 테두리만 남은 빨간 박스가 보이지 않게 */
.passport-form #nick-msg[hidden] { display:none !important; }
.passport-form #nick-msg { padding:var(--sp-2) var(--sp-3);margin-top:6px;font-size:var(--fs-small); }
.passport-choice-row { display:grid;gap:var(--sp-2); }
.passport-avatars { grid-template-columns:repeat(6,minmax(0,1fr)); }
.passport-planes { grid-template-columns:repeat(3,minmax(0,1fr)); }
/* 그림이 주인공, 라벨은 한 줄 (.card-visual 규격) */
.passport-choice {
  position:relative;min-width:48px;padding:5px 4px;border:3px solid transparent;border-radius:14px;
  background:#fff;box-shadow:var(--shadow-card);overflow:hidden;
}
.passport-choice img { width:100%;object-fit:contain;aspect-ratio:auto; }
.passport-avatar img { height:min(clamp(56px,7.2vw,104px),11vh);object-fit:cover;border-radius:10px; }
.passport-plane img { height:min(clamp(48px,6vw,88px),9vh); }
.passport-choice .label { font-size:var(--fs-small);color:var(--c-navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%; }
.passport-choice[aria-checked="true"] { border-color:var(--c-violet);box-shadow:0 0 0 3px rgba(108,76,232,.2),var(--shadow-card); }
.passport-choice[aria-checked="true"]::after {
  content:'✓';position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:50%;
  display:grid;place-items:center;background:var(--c-violet);color:#fff;font-size:15px;font-weight:900;
}
.passport-inquiries { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2); }
.passport-inquiry { min-height:52px;display:flex;align-items:center;gap:7px;padding:6px 8px;border:2px solid var(--c-line);border-radius:12px;background:#fff;font-size:var(--fs-small);font-weight:700;cursor:pointer; }
.passport-inquiry input { width:24px;height:24px;flex:0 0 auto;accent-color:var(--c-violet); }
/* 미리보기 — 고른 캐릭터를 크게 보여 준다(§7 최소 clamp(120px,14vw,240px)) */
.passport-preview { position:relative;display:flex;flex-direction:column;align-items:center;gap:var(--sp-2);padding:var(--sp-3); }
.passport-hero { width:min(clamp(120px,14vw,240px),26vh);aspect-ratio:1;object-fit:contain;filter:drop-shadow(0 8px 18px rgba(25,50,77,.3)); }
.passport-cover { width:min(120px,44%);object-fit:contain;filter:drop-shadow(0 6px 14px rgba(25,50,77,.25)); }
.passport-emblem { position:absolute;right:6px;top:6px;width:min(56px,22%);filter:drop-shadow(0 5px 12px rgba(25,50,77,.25)); }
.passport-stamps { grid-template-columns:repeat(6,minmax(0,1fr));width:100%; }
.passport-stamps .stamp-collection__slot { min-width:0; }
.passport-dock { grid-template-columns:minmax(0,1fr) auto; }
.passport-dock .btn-primary { min-width:200px; }
.passport-privacy { color:#fff;font-size:var(--fs-small);font-weight:800;text-shadow:0 1px 4px rgba(0,0,0,.55); }
@media (max-width:1100px), (max-height:620px) {
  .passport-shell { grid-template-columns:minmax(0,1.4fr) minmax(190px,.6fr);gap:var(--sp-2); }
  .passport-body { padding-block:4px; }
  .passport-form { gap:4px;padding:6px; }
  .passport-label { margin-bottom:2px;line-height:1.15; }
  .passport-nickname { min-height:44px;padding:6px 10px; }
  .passport-choice { padding:3px; }
  .passport-avatar img { height:min(clamp(42px,5.4vw,64px),7.4vh); }
  .passport-plane img { height:min(clamp(38px,4.8vw,58px),6.4vh); }
  .passport-inquiry { font-size:15px;line-height:1.2; }
  .passport-inquiry { min-height:44px;padding:3px 6px; }
  .passport-preview { padding:var(--sp-2);gap:6px; }
  .passport-cover { width:min(76px,34%); }
  .passport-dock { padding-block:4px; }
  .passport-dock .btn-primary { min-width:170px; }
}
/* 좁은 화면: 여권·도장 영역을 아래로 접는다(단일 컬럼) */
@media (max-width:900px) {
  .passport-shell { grid-template-columns:1fr; }
  .passport-preview { flex-direction:row;flex-wrap:wrap;justify-content:center; }
  .passport-stamps { grid-template-columns:repeat(6,minmax(0,1fr));flex:1 1 240px; }
}
@media (max-width:600px) {
  .passport-avatars { grid-template-columns:repeat(3,1fr); }
  .passport-inquiries { grid-template-columns:1fr; }
  .passport-privacy { display:none; }
  .passport-dock { grid-template-columns:1fr; }
  .passport-dock .btn-primary { width:100%;min-width:0; }
}
`;

export function createPage(): Page {
  let guide: GuideController | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      let common: CommonContent = {};
      try { common = await loadContent<CommonContent>('common'); }
      catch { console.warn('[passport] common.json 없음 — 기본값 사용'); }

      const assetIds = [
        'bg.title', 'prop.passport', 'prop.stamp', 'deco.emblem_stamp',
        ...AVATARS.map((item) => item.assetId), ...PLANES.map((item) => item.assetId)
      ];
      await preloadImages(assetIds);

      const save = saveRepo.get();
      const profile = save.profile;
      const questions = (common.inquiryQuestions ?? FALLBACK_QUESTIONS).slice(0, 3);
      const banned = common.nickname?.banned ?? [];
      const maxLen = common.nickname?.maxLen ?? 10;
      let avatarId = profile?.avatarId ?? 'a1';
      let airplaneId = profile?.airplaneId ?? 'plane1';

      const page = document.createElement('div');
      page.className = 'page passport-page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,.28),rgba(20,45,80,.48)),url('${assetUrl('bg.title')}')`;
      const style = document.createElement('style');
      style.textContent = PASSPORT_CSS;
      page.appendChild(style);
      page.appendChild(buildTopBar({
        title: '나의 여행 여권',
        subtitle: '별명과 세 가지 선택만 하면 바로 출발해요',
        backTo: profile ? '#/map' : undefined
      }));

      const body = document.createElement('div');
      body.className = 'page-body passport-body';
      body.innerHTML = `
        <div class="passport-shell">
          <section class="scene-board passport-form" aria-label="여행자 정보">
            <div class="passport-section passport-nick-row">
              <label class="passport-label" for="nickname">1. 별명</label>
              <input class="passport-nickname" id="nickname" type="text" maxlength="${maxLen}" autocomplete="off" placeholder="여행에서 쓸 별명 (예: 씩씩한여행자)">
              <p id="nick-msg" class="feedback retry" role="alert" hidden></p>
            </div>
            <fieldset class="passport-section" style="border:0;padding:0;margin:0">
              <legend class="passport-label">2. 나를 나타낼 탐험가</legend>
              <div class="passport-choice-row passport-avatars" role="radiogroup" aria-label="탐험가 아바타">
                ${AVATARS.map((item) => choiceHtml('avatar', item.saveId, item.assetId, item.label, item.short)).join('')}
              </div>
            </fieldset>
            <fieldset class="passport-section" style="border:0;padding:0;margin:0">
              <legend class="passport-label">3. 함께 갈 비행기</legend>
              <div class="passport-choice-row passport-planes" role="radiogroup" aria-label="여행 비행기">
                ${PLANES.map((item) => choiceHtml('plane', item.saveId, item.assetId, item.label, item.short)).join('')}
              </div>
            </fieldset>
            <fieldset class="passport-section" style="border:0;padding:0;margin:0">
              <legend class="passport-label">4. 가장 궁금한 질문</legend>
              <div class="passport-inquiries">
                ${questions.map((question, index) => `<label class="passport-inquiry"><input type="radio" name="inquiry" value="q${index + 1}" ${(profile?.inquiryQuestionId ?? 'q1') === `q${index + 1}` ? 'checked' : ''}><span>${question}</span></label>`).join('')}
              </div>
            </fieldset>
          </section>
          <aside class="scene-board passport-preview" aria-label="완성될 여행 여권 미리보기">
            ${assetImg('deco.emblem_stamp', 'passport-emblem', '', true)}
            <img class="passport-hero" id="passport-hero" src="${assetUrl(AVATARS[0].assetId)}" data-asset-id="${AVATARS[0].assetId}" alt="" aria-hidden="true">
            ${assetImg('prop.passport', 'passport-cover', '남색 세계 여행 여권')}
            <div class="stamp-collection passport-stamps">
              ${[...CONTINENT_IDS, 'dialogue' as const].map((id) => {
                const earned = save.stamps.includes(id);
                return `<div class="stamp-collection__slot ${earned ? 'is-earned' : ''}" role="img" aria-label="${STAMP_LABELS[id]} ${earned ? '도장 획득' : '도장 빈자리'}">${earned && hasAsset('prop.stamp') ? `<img src="${assetUrl('prop.stamp')}" data-asset-id="prop.stamp" alt="">` : ''}</div>`;
              }).join('')}
            </div>
          </aside>
        </div>`;
      page.appendChild(body);

      const dock = document.createElement('div');
      dock.className = 'bottom-bar mission-dock passport-dock';
      dock.innerHTML = `<p class="passport-privacy">별명과 선택은 이 기기에만 저장돼요.</p><button class="btn btn-primary btn-big" data-act="save">${profile ? '저장하기' : '출발하기'}</button>`;
      page.appendChild(dock);
      root.appendChild(page);

      const input = page.querySelector<HTMLInputElement>('#nickname');
      if (input) input.value = profile?.nickname ?? '';
      const msg = page.querySelector<HTMLElement>('#nick-msg');

      const bindRadioButtons = (selector: string, getValue: (el: HTMLElement) => string, setValue: (value: string) => void, initial: string) => {
        const buttons = Array.from(page.querySelectorAll<HTMLButtonElement>(selector));
        const mark = (value: string) => buttons.forEach((button) => {
          const selected = getValue(button) === value;
          button.setAttribute('aria-checked', String(selected));
          button.tabIndex = selected ? 0 : -1;
        });
        const choose = (button: HTMLButtonElement) => {
          const value = getValue(button);
          setValue(value);
          mark(value);
          void audio.playSfx('tap');
          popBounce(button);
        };
        buttons.forEach((button, index) => {
          button.addEventListener('click', () => choose(button));
          button.addEventListener('keydown', (event) => {
            if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
              : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % buttons.length
                : (index - 1 + buttons.length) % buttons.length;
            const next = buttons[nextIndex];
            if (next) { choose(next); next.focus(); }
          });
        });
        mark(initial);
      };
      // 고른 탐험가를 오른쪽에 크게 비춰 준다(표현 전용)
      const hero = page.querySelector<HTMLImageElement>('#passport-hero');
      const showHero = (value: string) => {
        const picked = AVATARS.find((item) => item.saveId === value) ?? AVATARS[0];
        if (hero && hasAsset(picked.assetId)) {
          hero.src = assetUrl(picked.assetId);
          hero.dataset.assetId = picked.assetId;
        }
      };
      bindRadioButtons('.passport-avatar', (el) => el.dataset.avatar ?? 'a1', (value) => { avatarId = value; showHero(value); }, avatarId);
      bindRadioButtons('.passport-plane', (el) => el.dataset.plane ?? 'plane1', (value) => { airplaneId = value; }, airplaneId);
      showHero(avatarId);

      const validate = (): string | null => {
        const value = input?.value.trim() ?? '';
        if (value.length < 1) return '별명을 한 글자 이상 적어 주세요.';
        if (value.length > maxLen) return `별명은 ${maxLen}자까지예요.`;
        if (banned.some((word) => word && value.includes(word))) return '다른 친구도 편안한 별명을 골라 주세요.';
        return null;
      };

      const saveButton = dock.querySelector<HTMLButtonElement>('[data-act="save"]');
      saveButton?.addEventListener('click', () => {
        const error = validate();
        if (error) {
          if (msg) { msg.hidden = false; msg.innerHTML = `<span aria-hidden="true">×</span><span>${error}</span>`; }
          input?.focus();
          return;
        }
        if (msg) msg.hidden = true;
        const inquiryQuestionId = page.querySelector<HTMLInputElement>('input[name="inquiry"]:checked')?.value ?? 'q1';
        saveRepo.update((state) => {
          state.profile = {
            nickname: input?.value.trim() ?? '',
            createdAt: state.profile?.createdAt ?? new Date().toISOString(),
            avatarId,
            airplaneId,
            inquiryQuestionId
          };
        });
        saveButton.disabled = true;
        const stamp = page.querySelector<HTMLElement>('.passport-hero') ?? saveButton;
        burstConfetti(stamp, 8);
        void audio.playSfx('stamp');
        showToast('여권이 준비됐어요. 세계 지도로 떠나요!', 'success');
        const transition = playJourneyTransition({ kind: 'stamp', label: '여권 준비 완료!', assetId: 'prop.stamp' });
        void transition.finished.then(() => { if (!disposed) navigate('#/map'); });
      });

      guide = createGuide({ assetId: hasAsset('plane.explorer') ? 'plane.explorer' : 'plane.main' });
      page.appendChild(guide.el);
      guide.say(profile ? '바꿀 내용을 고르고 여권을 저장해요!' : '별명부터 적으면 금방 출발할 수 있어요!', {
        cue: profile ? saveButton : input
      });
    },

    unmount() {
      disposed = true;
      cancelJourneyTransition();
      guide?.dispose();
      guide = null;
    }
  };
}

/** 그림 크게 + 한 줄 라벨. 전체 설명은 aria-label로만 전달한다. */
function choiceHtml(kind: 'avatar' | 'plane', saveId: string, assetId: string, label: string, short: string): string {
  return `<button type="button" class="passport-choice card-visual passport-${kind}" data-${kind}="${saveId}" data-asset-src="${assetId}" role="radio" aria-checked="false" aria-label="${label}">
    ${hasAsset(assetId) ? `<img src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="" aria-hidden="true">` : ''}
    <span class="label">${short}</span>
  </button>`;
}

function assetImg(assetId: string, className: string, alt: string, decorative = false): string {
  if (!hasAsset(assetId)) return '';
  return `<img${className ? ` class="${className}"` : ''} src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="${alt}"${decorative ? ' aria-hidden="true"' : ''}>`;
}
