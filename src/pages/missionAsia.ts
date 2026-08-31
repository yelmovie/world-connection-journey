import type { Page } from '../router';
import { assetUrl, hasAsset } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { burstConfetti, popBounce } from '../ui/fx';
import { createGuide, type GuideController } from '../ui/guide';
import { getLearn, readLearnRecord, showFriendIntro, showLearningWrap } from '../ui/learnFrame';
import { openModal } from '../ui/modal';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { showToast } from '../ui/toast';
import { selectedAvatarSpeaker } from '../ui/avatarRoster';
import { airplaneChoice } from '../ui/airplaneFleet';

interface TimelineItem {
  id: string;
  label: string;
  timeHint: string;
  correctSlot: number;
  desc: string;
}
interface Statement {
  id: string;
  text: string;
  answer: string;
  why: string;
}
interface AsiaContent {
  intro: { title: string; subtitle: string; guide: string };
  round1_timeline: {
    guide: string;
    slots: string[];
    items: TimelineItem[];
    feedback: { perfect: string; partial: string; retry: string };
  };
  round2_classification: {
    guide: string;
    categories: Array<{ id: string; label: string }>;
    statements: Statement[];
  };
  round3_question: {
    guide: string;
    fragments: { openers: string[]; topics: string[]; closers: string[] };
    goodCombos: Array<{ opener: string; topic: string; closer: string; why: string }>;
    badPatterns: Array<{ pattern: string; why: string }>;
    feedback: { good: string; retry: string };
  };
}

const WEIGHTS = { evidence: 30, perspective: 25, communication: 25, revision: 15 };

/* 분류 존 배지 색·기호 — 콘텐츠 categories.id 기준, 미지정 id 는 기본색 */
const CAT_STYLE: Record<string, { color: string; fg: string; mark: string }> = {
  fact: { color: 'var(--c-success)', fg: '#fff', mark: '✓' },
  inference: { color: 'var(--c-violet)', fg: '#fff', mark: '◆' },
  needs_check: { color: 'var(--c-gold)', fg: '#5a3c00', mark: '?' }
};

/* 표현 전용 스타일 — 로직과 무관한 페이지 내 연출 부품 */
const PAGE_CSS = `
.asia-mission {
  --mission-body:clamp(18px,1.45vw,22px);
  --mission-small:clamp(18px,1.2vw,20px);
  --mission-title:clamp(27px,2.3vw,36px);
}
.asia-mission .top-bar { background: linear-gradient(180deg,rgba(31,43,74,.78),rgba(31,43,74,0)); }
/* 기준 해상도(1024x576+)에서는 한 화면에 들어가지만, 더 낮은 창에서는 잘리는 대신 스크롤한다 */
.asia-mission .page-body { padding:var(--sp-3) clamp(12px,2.5vw,32px) clamp(54px,7vh,60px);overflow-y:auto; }
/* 배경 일러스트가 주인공 — 패널은 하나, 반투명. 오른쪽은 배경 위에 선 캐릭터 열 */
.asia-mission .mission-scene {
  flex: 1; min-height: 0; width: 100%; display: grid;
  grid-template-columns: minmax(0,1fr) clamp(180px,18vw,270px);
  gap: var(--sp-4); align-items: stretch;
}
.asia-mission .scene-board {
  min-width: 0; min-height: 0; overflow: auto; position: relative;
  display: flex; flex-direction: column; gap: var(--sp-3);
  padding:var(--sp-3);border-radius:var(--radius-l);
  background: var(--glass-panel); backdrop-filter: blur(9px) saturate(1.05);
  border: 2px solid rgba(216,189,125,.85); box-shadow: var(--shadow-card);
}
.asia-mission .scene-cast {
  display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
  gap:var(--sp-2);min-width:0;min-height:0;overflow:visible;
}
.asia-mission .cast-props { display: flex; gap: var(--sp-2); justify-content: center; flex-wrap: wrap; }
.asia-mission .cast-props img {
  width: clamp(40px,4.6vw,72px); height: clamp(40px,4.6vw,72px); object-fit: contain;
  filter: drop-shadow(0 5px 10px rgba(8,18,33,.45));
}
.asia-mission .cast-note {
  font-size: var(--mission-small); line-height: 1.4; color: #fff; text-align: center;
  text-shadow: 0 2px 6px rgba(10,22,40,.95);
}
.asia-mission .board-title { display:flex;align-items:center;justify-content:space-between;gap:var(--sp-2); }
.asia-mission .board-title h2 { color: var(--c-navy); font-size: var(--mission-title); }
.asia-mission .record-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:0;flex:1;align-content:stretch; }
.asia-mission .record-card {
  position:relative;min-height:72px;padding:var(--sp-2);display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:6px;text-align:center;font-size:var(--mission-small);
}
.asia-mission .record-card.is-seen::after {
  content:'✓';position:absolute;top:7px;right:8px;width:26px;height:26px;border-radius:50%;
  display:grid;place-items:center;background:var(--c-success);color:#fff;font-weight:900;
}
.asia-mission .record-visual { position:relative;width:64px;height:58px;display:grid;place-items:center; }
.asia-mission .record-visual img { width:56px;height:56px;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(25,50,77,.2)); }
.asia-mission .record-visual .time-badge { position:absolute;right:-8px;bottom:-2px;width:22px;height:22px; }
.asia-mission .record-card strong { color:var(--c-navy);font-family:var(--font-head);font-size:var(--mission-body); }
.asia-mission .record-detail {
  padding:var(--sp-3);border-left:5px solid var(--c-turquoise);
  background:rgba(238,250,247,.94);border-radius:var(--radius-s);
}
.asia-mission .record-detail p { font-size:var(--mission-body);line-height:1.5; }
.asia-mission .record-detail .btn { min-height:52px;margin-left:auto;font-size:var(--mission-small); }
.asia-mission .evidence-layout { display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:var(--sp-2);min-height:0;flex:1; }
.asia-mission .evidence-zones { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:0; }
.asia-mission .evidence-zone { padding:var(--sp-2);min-height:96px;display:flex;flex-direction:column;gap:6px;background:rgba(255,254,248,.92); }
.asia-mission .evidence-zone .card { padding:var(--sp-2);font-size:var(--mission-small);line-height:1.35; }
.asia-mission .evidence-tray { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:62px;padding:5px; }
.asia-mission .evidence-tray .card { padding:var(--sp-2);font-size:var(--mission-small);line-height:1.4; }
.asia-mission .batch-nav { display:flex;align-items:center;justify-content:center;gap:var(--sp-2); }
.asia-mission .batch-nav .btn { min-height:48px;padding:6px 14px; }
.asia-mission .question-scene { display:grid;grid-template-rows:auto minmax(0,1fr);gap:var(--sp-2);min-height:0;flex:1; }
.asia-mission .q-bubble { padding:var(--sp-3);text-align:center;background:rgba(255,253,244,.95);border:2px solid #d8bd7d;border-radius:var(--radius-m);font-size:var(--mission-body); }
.asia-mission .fragment-cols { display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-2);min-height:0;width:min(100%,760px);margin:0 auto; }
.asia-mission .fragment-col { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-2);min-height:0;overflow-y:auto;padding:2px; }
.asia-mission .fragment-col[hidden] { display:none; }
.asia-mission .fragment-col > .chip { grid-column:1 / -1; }
.asia-mission .fragment-col .card { min-height:56px;padding:var(--sp-3);font-size:var(--mission-body);line-height:1.35;text-align:left; }
.asia-mission .mission-dock { background:linear-gradient(0deg,rgba(15,30,50,.8),rgba(15,30,50,.28)); }
.asia-mission .mission-dock .chip { max-width:60%; }
.asia-mission .compact-feedback .feedback { padding:var(--sp-3);font-size:var(--mission-body);line-height:1.45; }
.asia-mission .mission-status,.asia-mission .btn { font-size:var(--mission-small); }
.asia-modal-body { --mission-body:clamp(18px,1.45vw,22px);--mission-small:clamp(18px,1.2vw,20px);font-size:var(--mission-body);line-height:1.6;max-width:760px; }
.asia-modal-body details { padding:var(--sp-3);border:2px solid var(--c-line);border-radius:var(--radius-m);background:#fffdf7; }
.asia-modal-body summary { min-height:52px;display:flex;align-items:center;font-family:var(--font-head);font-size:var(--mission-body);cursor:pointer; }
.time-badge { width: 34px; height: 34px; border-radius: 50%; border: 2px solid #fff; box-shadow: var(--shadow-card); flex-shrink: 0; }
.tb-0 { background: linear-gradient(#2b3f6b, #f2a65a); }
.tb-1 { background: linear-gradient(#8fd0f5, #fdf3c9); }
.tb-2 { background: linear-gradient(#58b7f2, #d8f1ff); }
.tb-3 { background: linear-gradient(#f2c14e, #f9e6b8); }
.tb-4 { background: linear-gradient(#e8734a, #6b4a8f); }
.tb-5 { background: linear-gradient(#17203f, #3b4a8f); }
.cat-badge { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-head); color: var(--c-navy); }
.cat-mark { width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; border: 2px solid #fff; box-shadow: var(--shadow-card); }
.asia-mission .q-bubble { position: relative; }
.modal-backdrop .modal:has(.asia-flight-intro) { width:min(880px,94vw);max-height:min(94dvh,760px); }
.modal:has(.asia-flight-intro) .modal-body { padding:clamp(12px,2vw,24px);overflow-y:auto; }
.asia-flight-intro { display:grid;gap:var(--sp-3);text-align:center; }
.asia-flight-stage {
  position:relative;width:100%;aspect-ratio:16/6;overflow:hidden;border-radius:var(--radius-l);
  background:#dff4ff;box-shadow:var(--shadow-pop);isolation:isolate;
}
.asia-flight-stage video { width:100%;height:100%;object-fit:cover;display:block; }
.asia-flight-stage > img:first-child { width:100%;height:100%;object-fit:cover;display:block; }
.asia-flight-plane {
  position:absolute;z-index:3;right:8%;top:12%;width:clamp(80px,12vw,170px);height:auto;object-fit:contain;
  filter:drop-shadow(0 10px 14px rgba(7,35,62,.36));animation:asiaPlaneCruise 2.4s ease-in-out infinite;
}
@keyframes asiaPlaneCruise { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-10px) rotate(2deg)} }
.asia-flight-stage::after { content:none; }
.asia-flight-copy { position:absolute;z-index:2;left:clamp(14px,3vw,34px);top:clamp(14px,3vw,34px);width:min(43%,420px);text-align:left;color:#fff;text-shadow:0 2px 8px rgba(6,25,44,.85); }
.asia-flight-copy h3 { font-family:var(--font-head);font-size:clamp(25px,2.5vw,38px);line-height:1.15;margin-bottom:8px; }
.asia-flight-copy p { font-size:clamp(17px,1.4vw,22px);line-height:1.45;font-weight:750; }
.asia-country-list { display:flex;justify-content:center;gap:8px;flex-wrap:wrap; }
.asia-country-list .chip { background:#edf8ff;box-shadow:none;border:1px solid rgba(20,85,156,.18); }
.asia-flight-actions { display:flex;justify-content:center;gap:10px;flex-wrap:wrap; }
.asia-flight-quiz { display:grid;gap:10px;padding:0; }
.asia-route-line { margin:0;color:var(--c-ink-soft);font-size:max(17px,var(--fs-small));font-weight:800; }
.asia-flight-quiz h3 { font-family:var(--font-head);font-size:clamp(24px,2.3vw,36px);color:var(--c-navy); }
.asia-flight-answers { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px; }
.asia-flight-answers .btn { min-height:64px;font-size:var(--mission-body); }
.asia-flight-feedback { min-height:1.6em;color:var(--c-ink-soft);font-weight:800; }
@media (max-width: 900px) {
  .asia-mission .mission-scene { grid-template-columns:minmax(0,1fr) 180px;gap:var(--sp-3); }
  .asia-mission .scene-board { padding:var(--sp-3); }
  .asia-flight-copy { width:55%; }
  .asia-flight-answers { grid-template-columns:1fr; }
}
@media (max-height: 620px) {
  .asia-mission .mission-scene { flex:none;min-height:500px; }
  .asia-mission .scene-board { overflow:visible; }
  .asia-mission .cast-props img { width:40px;height:40px; }
  /* 낮은 화면에서는 조각 목록이 스크롤 없이 들어오도록 미리보기를 줄인다 */
  .asia-mission .q-bubble { padding:var(--sp-2); }
  .asia-mission .q-bubble .q-caption { display:none; }
  .asia-mission #q-preview { font-size:var(--mission-body)!important; }
  .asia-mission .fragment-col { gap:4px; }
  .asia-mission .fragment-col .card { min-height:52px;padding:8px; }
  .asia-mission .record-card { min-height:64px; }
}
@media (prefers-reduced-motion: reduce) {
  .asia-mission * { scroll-behavior:auto!important; }
}
`;

/* round2 는 콘텐츠 JSON 에 feedback 블록이 없어 페이지에서 문구를 보완한다. */
const R2_MSG = {
  perfect: '아홉 문장을 모두 알맞게 나눴어요! 기록에 있는 것과 내 생각을 구분할 줄 알게 된 거예요.',
  partial: '문장 몇 개는 알맞게 나눴어요. 근거 설명을 읽고, 남은 문장을 다시 나눠 볼까요?',
  retry: '아직 헷갈리는 문장이 많아요. 근거 설명을 읽고, 기록에 직접 나온 말인지부터 확인해 볼까요?'
} as const;

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function shortSentence(text: string, max = 44): string {
  const first = text.match(/^.*?[.!?。！？](?:\s|$)/)?.[0]?.trim() ?? text.trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

function createLegacyPage(): Page {
  let ctrl: PickPlaceController | null = null;
  let disposed = false;
  let guide: GuideController | null = null;

  return {
    async mount(root: HTMLElement) {
      const c = await loadContent<AsiaContent>('asia');
      if (disposed) return;
      const playerSpeaker = selectedAvatarSpeaker(saveRepo.get().profile);
      const sourceLearn = getLearn(c);
      // 특정 민족 복식을 나라 전체의 대표처럼 쓰지 않는 중립적인 여행 친구 이미지.
      const learn = sourceLearn
        ? { ...sourceLearn, friend: { ...sourceLearn.friend, imageId: 'asia.mina' } }
        : null;
      audio.playBgm('asia');

      // ---- 미션 진행 상태 ----
      let round: 1 | 2 | 3 = 1;
      let r1First: number | null = null; // 1라운드 첫 확인 정답률
      let r2First: number | null = null; // 2라운드 첫 확인 정답률
      let imperfect = 0; // 만점이 아니었던 확인 횟수(재도전 기회)
      let improved = 0; // 재도전으로 성적이 오른 횟수
      let r1LastCorrect: number | null = null;
      let r2LastCorrect: number | null = null;
      let r3HadPartial = false;
      let r3Quality = 0;
      let busy = false;
      let finished = false;
      const observed = new Set<string>();

      const persistAsiaCheckpoint = (checkpointId: 'observe' | 'round2' | 'round3'): void => {
        saveRepo.setCheckpoint('asia', checkpointId, {
          // setCheckpoint는 data를 통째로 교체하므로 배움 기록(예상)을 함께 실어 보존한다
          learn: saveRepo.get().missions.asia.data.learn,
          observed: [...observed],
          r1First,
          r2First,
          imperfect,
          improved,
          r1LastCorrect,
          r2LastCorrect,
          r3HadPartial,
          r3Quality
        });
      };

      // ---- 체크포인트 복원 ----
      const saved = saveRepo.get().missions.asia;
      const d = saved.data as Partial<{
        observed: string[];
        r1First: number | null;
        r2First: number | null;
        imperfect: number;
        improved: number;
        r1LastCorrect: number | null;
        r2LastCorrect: number | null;
        r3HadPartial: boolean;
        r3Quality: number;
      }>;
      if (saved.checkpointId === 'observe' || saved.checkpointId === 'round2' || saved.checkpointId === 'round3') {
        if (typeof d.r1First === 'number') r1First = d.r1First;
        if (typeof d.r2First === 'number') r2First = d.r2First;
        if (typeof d.imperfect === 'number') imperfect = Math.max(0, Math.trunc(d.imperfect));
        if (typeof d.improved === 'number') improved = Math.max(0, Math.trunc(d.improved));
        if (typeof d.r1LastCorrect === 'number') r1LastCorrect = Math.max(0, Math.trunc(d.r1LastCorrect));
        if (typeof d.r2LastCorrect === 'number') r2LastCorrect = Math.max(0, Math.trunc(d.r2LastCorrect));
        if (typeof d.r3HadPartial === 'boolean') r3HadPartial = d.r3HadPartial;
        if (typeof d.r3Quality === 'number') r3Quality = Math.max(0, Math.min(1, d.r3Quality));
      }
      if (saved.checkpointId === 'observe' && Array.isArray(d.observed)) {
        const validIds = new Set(c.round1_timeline.items.map((item) => item.id));
        d.observed.filter((id): id is string => typeof id === 'string' && validIds.has(id)).forEach((id) => observed.add(id));
        showToast('저장된 관찰 지점부터 이어서 해요.', 'info');
      }
      if (saved.checkpointId === 'round2' || saved.checkpointId === 'round3') {
        round = saved.checkpointId === 'round3' ? 3 : 2;
        showToast('저장된 지점부터 이어서 해요.', 'info');
      }

      // ---- 페이지 뼈대 ----
      const page = document.createElement('div');
      page.className = 'page asia-mission';
      page.dataset.assetId = 'bg.asia';
      // 배경 일러스트가 주인공이라 어둡게 덮지 않는다(가독성 최소한만).
      page.style.backgroundImage = `linear-gradient(rgba(15,30,50,0.34), rgba(15,30,50,0.44)), url('${assetUrl('bg.asia')}')`;
      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);
      // 제목은 상단바 리본 한 곳에만. 라운드 목표는 그 리본의 부제로 바꿔 쓴다.
      const bar = buildTopBar({
        title: c.intro.title,
        subtitle: c.intro.subtitle,
        backTo: '#/map',
        steps: { total: 3, done: round - 1, now: round - 1 }
      });
      page.appendChild(bar);
      const ribbonSub = bar.querySelector('.ribbon-sub') as HTMLElement;
      // 부제 = 학습 목표 고정. 단계별 조작 안내는 말풍선이, 진행은 상단 진행 점이 맡는다.
      const setRibbon = (text: string): void => {
        ribbonSub.textContent = learn?.goal ?? text;
      };
      const body = document.createElement('div');
      body.className = 'page-body';
      page.appendChild(body);
      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar mission-dock';
      page.appendChild(bottom);
      root.appendChild(page);

      // ---- 마스코트 가이드 (말풍선 안내 + 탭 큐) ----
      // 캐릭터는 화면에 한 명만 — 안내 캐릭터를 오른쪽에 세운다(장면 속 중복 캐스트 제거).
      const gd = createGuide({ assetId: playerSpeaker.assetId, speakerName: playerSpeaker.name, side: 'right' });
      guide = gd;
      page.appendChild(gd.el);
      const mascotButton = gd.el.querySelector<HTMLButtonElement>('.guide-mascot-button');
      let characterHelp: (() => void) | null = null;
      mascotButton?.addEventListener('click', () => characterHelp?.());
      let lastSaid = '';
      // 친구 소개 모달이 떠 있는 동안에는 말풍선 타이핑을 미뤄 뒀다가, 모달을 닫으면 시작한다.
      let introGate = learn !== null;
      let pendingSay: { text: string; cue: HTMLElement | null } | null = null;
      const say = (text: string, cue: HTMLElement | null): void => {
        if (introGate) {
          pendingSay = { text, cue };
          return;
        }
        if (text !== lastSaid) {
          lastSaid = text;
          gd.say(text, { cue, speaker: playerSpeaker });
        } else {
          gd.setCue(cue); // 같은 문구면 타이핑 재시작 없이 큐만 이동
        }
      };

      const releaseIntro = (): void => {
        introGate = false;
        if (pendingSay) {
          const p = pendingSay;
          pendingSay = null;
          say(p.text, p.cue);
        }
      };

      const openAsiaFlightQuiz = (): void => {
        const plane = airplaneChoice(saveRepo.get().profile?.airplaneId);
        const quiz = el(`<div class="asia-flight-intro asia-flight-quiz">
          <div class="asia-flight-stage">
            <img src="${assetUrl('asia.flight_overview')}" data-asset-id="asia.flight_overview" alt="아시아 여러 나라를 둘러보고 네팔로 향하는 비행 항로">
            ${hasAsset(plane.flightAssetId) ? `<img class="asia-flight-plane" src="${assetUrl(plane.flightAssetId)}" data-asset-id="${plane.flightAssetId}" alt="${plane.name} 비행기">` : ''}
          </div>
          <p class="asia-route-line">대한민국 · 중국 · 일본 · 인도 · 태국 · 네팔</p>
          <h3>오늘 자세히 볼 나라는?</h3>
          <div class="asia-flight-answers"></div>
          <p class="asia-flight-feedback" role="status" aria-live="polite"></p>
        </div>`);
        const answers = quiz.querySelector('.asia-flight-answers') as HTMLElement;
        const feedback = quiz.querySelector('.asia-flight-feedback') as HTMLElement;
        let closeQuiz = (): void => undefined;
        ['일본', '네팔', '태국'].forEach((country) => {
          const button = el(`<button type="button" class="btn btn-ghost">${country}</button>`) as HTMLButtonElement;
          button.addEventListener('click', () => {
            if (country !== '네팔') {
              feedback.textContent = '비행기가 히말라야산맥 가까이 착륙한 장면을 다시 떠올려 봐.';
              button.disabled = true;
              return;
            }
            feedback.textContent = '맞아! 오늘의 목적지는 네팔이야.';
            burstConfetti(button);
            window.setTimeout(() => {
              closeQuiz();
              releaseIntro();
              say('미나의 기록은 한 가족의 하루야. 네팔 모두라고 단정하지 말자.', null);
            }, 500);
          });
          answers.appendChild(button);
        });
        closeQuiz = openModal({ id: 'asia-flight-quiz', title: '아시아 항로', bodyEl: quiz, dismissible: false });
      };

      const castImg = (id: string, cls: string): string =>
        hasAsset(id) ? `<img class="${cls}" src="${assetUrl(id)}" alt="" aria-hidden="true" data-asset-id="${id}">` : '';

      /**
       * 장면 = 반투명 보드 1개 + 오른쪽 소품 열.
       * 캐릭터는 오른쪽 가이드 한 명뿐이고, propIds 소품으로 화면 에셋을 3종 이상 유지한다.
       */
      const makeScene = (goal: string, propIds: string[], note: string): HTMLElement => {
        body.replaceChildren();
        setRibbon(goal);
        const scene = el(`<section class="mission-scene" aria-label="아시아 여행 기록 게임 장면">
          <main class="scene-board"></main>
          <aside class="scene-cast" aria-hidden="true">
            <div class="cast-props">${propIds.map((id) => castImg(id, '')).join('')}</div>
            <p class="cast-note">${note}</p>
          </aside>
        </section>`);
        body.appendChild(scene);
        return scene.querySelector('.scene-board') as HTMLElement;
      };

      const startRound = () => {
        characterHelp = null;
        updateSteps(bar, 3, round - 1, round - 1);
        ctrl?.dispose();
        ctrl = null;
        if (round === 1) renderRound1();
        else if (round === 2) renderRound2();
        else renderRound3();
      };

      const finish = (communication: number) => {
        if (finished) return;
        finished = true;
        const ratios = {
          evidence: 0.3 + 0.7 * (r2First ?? 0), // 근거 = 2라운드(증거 분류) 첫 정답률 + 완주 기본점
          perspective: 0.3 + 0.7 * Math.min(1, observed.size / c.round1_timeline.items.length), // 관점 = 하루 기록을 얼마나 살펴봤는가
          communication, // 소통 = 3라운드 질문 품질
          revision: imperfect === 0 ? 1 : improved / imperfect // 수정 = 재도전 시 실제로 나아졌는가
        };
        const result = computeScore(ratios, WEIGHTS, Math.round(5 * ratios.revision));
        // 점수 모달 전에 배움 확인(처음 생각 vs 발견) — learn 없으면 기존 흐름 그대로
        const done = (): void => {
          const learnRec = readLearnRecord('asia');
          writeMissionArtifact({
            schemaVersion: 1,
            missionId: 'asia',
            title: '미나의 하루 비교 기록',
            purpose: '생활 기록을 근거로 문화권이 달라도 하루의 비슷함과 차이를 구분해요.',
            initialHypothesis: learnRec.initialHypothesis ?? '여행 전에 남긴 첫 생각이 없어요.',
            evidenceIds: [...observed],
            evidenceLabel: learnRec.cardLine ?? `하루 생활 기록 ${observed.size}개를 직접 살펴봤어요.`,
            voiceId: 'mina',
            voiceName: learnRec.friendName ?? '미나',
            voiceLine: learnRec.cardLine ?? '생활 모습은 하나의 기준으로 단정할 수 없어요.',
            firstDecision: `첫 분류 정확도 ${Math.round((r2First ?? 0) * 100)}%에서 시작했어요.`,
            observedConsequence: `생활 기록을 살펴보고 질문의 소통 점수 ${Math.round(communication * 100)}%를 만들었어요.`,
            revisedDecision: learnRec.revisedThought ?? '보이는 차이만 말하지 않고 생활 기록을 근거로 다시 설명해요.',
            rationale: imperfect === 0
              ? '첫 시도에서도 근거를 잘 연결했어요.'
              : `${imperfect}번의 부족한 선택 뒤 ${improved}번 더 나은 선택으로 고쳤어요.`,
            transferPrompt: '우리 반 친구의 하루도 먼저 묻고 기록한 뒤 비슷함과 차이를 설명한다면 무엇이 달라질까요?',
            earnedAt: new Date().toISOString()
          });
          completeMissionFlow('asia', '아시아', result);
        };
        if (learn) showLearningWrap('asia', learn, done);
        else done();
      };

      // ================= 1라운드: 하루 기록 살펴보기 =================
      function renderRound1(): void {
        const r1 = c.round1_timeline;
        updateSteps(bar, 3, 0, 0);
        const board = makeScene(
          '기록 카드 6장을 눌러 하루를 살펴봐요',
          ['prop.journal', 'deco.map_kit'],
          '여행 기록을 한 장씩 열어 봐요.'
        );
        const observationGrid = el(`<div class="record-grid" role="list" aria-label="미나네 가족의 하루 기록"></div>`);
        const detail = el(`<div class="record-detail" role="status" aria-live="polite"></div>`);
        board.append(observationGrid, detail);
        let activeRecordId = '';

        bottom.replaceChildren();
        const observationStatus = el(
          `<span class="chip mission-status" role="status" aria-live="polite">생활 기록 살펴보기</span>`
        );
        const nextRoundBtn = el(`<button class="btn btn-primary btn-big" disabled>다음</button>`) as HTMLButtonElement;
        bottom.append(observationStatus, nextRoundBtn);

        const paintObservation = () => {
          observationStatus.textContent = observed.size >= r1.items.length ? '모두 살펴봤어!' : '기록을 눌러 살펴봐';
          nextRoundBtn.disabled = observed.size < r1.items.length;
          observationGrid.replaceChildren();
          let firstTodo: HTMLElement | null = null;
          for (const item of r1.items) {
            const seen = observed.has(item.id);
            const active = activeRecordId === item.id;
            const card = el(`<button class="card card-pick record-card ${seen ? 'is-seen' : ''}" role="listitem" aria-pressed="${active}">
              <span class="record-visual" aria-hidden="true">
                <img src="${assetUrl('prop.journal')}" alt="" data-asset-id="prop.journal">
                <span class="time-badge tb-${item.correctSlot}"></span>
              </span>
              <strong>${item.label}</strong>
              <span class="text-oneline" style="color:var(--c-ink-soft)">${item.timeHint}</span>
            </button>`);
            card.addEventListener('click', () => {
              if (finished) return;
              const wasSeen = observed.has(item.id);
              activeRecordId = item.id;
              observed.add(item.id);
              persistAsiaCheckpoint('observe');
              void audio.playSfx(wasSeen ? 'tap' : 'pickup');
              paintObservation();
              const activeCard = observationGrid.querySelector<HTMLElement>(`[data-record-id="${item.id}"]`);
              if (!wasSeen && activeCard) popBounce(activeCard);
            });
            card.dataset.recordId = item.id;
            observationGrid.appendChild(card);
            if (!seen && !firstTodo) firstTodo = card;
          }
          const activeItem = r1.items.find((item) => item.id === activeRecordId);
          detail.replaceChildren();
          if (activeItem) {
            // 팝업 없이 카드 내용을 바로 보여 준다.
            detail.appendChild(el(`<div class="row-between" style="gap:8px"><strong>${activeItem.label}</strong><span class="chip">${activeItem.timeHint}</span></div>`));
            detail.appendChild(el(`<p>${activeItem.desc}</p>`));
          } else {
            detail.appendChild(el('<p>기록 한 장을 골라 봐요.</p>'));
          }
          if (observed.size >= r1.items.length) say('다 봤어요! 다음을 눌러요!', nextRoundBtn);
          else if (activeItem) say(shortSentence(activeItem.desc, 40), firstTodo);
          else say('카드를 눌러 하루 자료를 살펴봐요!', firstTodo);
        };

        nextRoundBtn.addEventListener('click', () => {
          if (busy || round !== 1 || observed.size < r1.items.length) return; // 원샷: 연타로 인한 이중 렌더 방지
          busy = true;
          try {
            round = 2;
            persistAsiaCheckpoint('round2');
            startRound();
          } finally {
            busy = false;
          }
        });

        paintObservation();
      }

      // ================= 2라운드: 증거 분류 =================
      function renderRound2(): void {
        const r2 = c.round2_classification;
        const placed = new Map<string, string>(); // statementId -> categoryId
        const locked = new Set<string>();
        let lastCorrect: number | null = r2LastCorrect;
        let solvedRound = false;
        const batchSize = 3;
        const batchCount = Math.ceil(r2.statements.length / batchSize);
        let batchIndex = 0;

        const board = makeScene(
          '미나의 하루 문장을 세 가지로 나눠 봐요',
          ['prop.journal', 'prop.book3d', 'icon.listening'],
          '기록에 직접 나온 말인지 먼저 확인해요.'
        );
        board.appendChild(el(`<div class="board-title"><h2>미나의 하루 정리</h2><span class="chip" data-batch-status></span></div>`));
        const batchStatus = board.querySelector('[data-batch-status]') as HTMLElement;
        const batchNav = el(`<div class="batch-nav" aria-label="증거 카드 묶음 이동"></div>`);
        const catWrap = el(`<div class="evidence-zones"></div>`);
        const tray = el(`<div class="drop-zone evidence-tray" aria-label="현재 문장 보관함"></div>`);
        const evidenceLayout = el(`<div class="evidence-layout"></div>`);
        evidenceLayout.append(batchNav, catWrap, tray);
        board.appendChild(evidenceLayout);
        const fb = el(`<div class="compact-feedback"></div>`);
        board.appendChild(fb);

        bottom.replaceChildren();
        const status = el(`<span class="chip mission-status">증거 배치하기</span>`);
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const reviewBtn = el(`<button class="btn btn-ghost" style="display:none">근거</button>`) as HTMLButtonElement;
        const checkBtn = el(`<button class="btn btn-primary btn-big" disabled>확인</button>`) as HTMLButtonElement;
        const nextBtn = el(`<button class="btn btn-success btn-big" style="display:none">다음</button>`) as HTMLButtonElement;
        btns.append(reviewBtn, checkBtn, nextBtn);
        bottom.append(status, btns);

        const stCard = (st: Statement, isLocked: boolean): HTMLElement =>
          el(`<div class="card" data-item-id="${st.id}" style="${
            isLocked ? 'border-color:var(--c-success);cursor:default;' : ''
          }">${isLocked ? '✓ ' : ''}${st.text}</div>`);

        const onPlace = (itemId: string, zoneId: string) => {
          if (solvedRound || locked.has(itemId)) return;
          if (placed.get(itemId) === zoneId) placed.delete(itemId); // 놓인 카드를 다시 탭 → 보관함으로
          else placed.set(itemId, zoneId);
          paint();
          const placedEl = catWrap.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`);
          if (placedEl && placed.get(itemId) === zoneId) popBounce(placedEl);
        };

        const paint = () => {
          const currentStatements = r2.statements.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize);
          batchStatus.textContent = `묶음 ${batchIndex + 1}`;
          status.textContent = placed.size >= r2.statements.length ? '모두 배치했어!' : '증거 배치하기';
          batchNav.replaceChildren();
          const prevBatch = el(`<button class="btn btn-ghost" ${batchIndex === 0 ? 'disabled' : ''} aria-label="이전 세 장">◀ 이전</button>`) as HTMLButtonElement;
          const currentPlaced = currentStatements.filter((st) => placed.has(st.id)).length;
          const navState = el(`<span class="chip">${currentPlaced >= currentStatements.length ? '모두 배치!' : '카드를 배치해 봐'}</span>`);
          const nextBatch = el(`<button class="btn btn-ghost" ${batchIndex >= batchCount - 1 ? 'disabled' : ''} aria-label="다음 세 장">다음 ▶</button>`) as HTMLButtonElement;
          prevBatch.addEventListener('click', () => {
            if (batchIndex <= 0) return;
            batchIndex--;
            paint();
          });
          nextBatch.addEventListener('click', () => {
            if (batchIndex >= batchCount - 1) return;
            batchIndex++;
            paint();
          });
          batchNav.append(prevBatch, navState, nextBatch);
          catWrap.replaceChildren();
          const zoneEls: HTMLElement[] = [];
          const itemEls: HTMLElement[] = [];
          for (const cat of r2.categories) {
            const meta = CAT_STYLE[cat.id] ?? { color: 'var(--c-sky)', fg: '#fff', mark: '●' };
            const categoryBoard = el(`<div class="panel-board evidence-zone">
              <span class="cat-badge" style="align-self:center">
                <span class="cat-mark" style="background:${meta.color};color:${meta.fg}" aria-hidden="true">${meta.mark}</span>
                <strong>${cat.label}</strong>
              </span>
            </div>`);
            const zone = el(
              `<div class="drop-zone" data-zone-id="${cat.id}" style="display:flex;flex-direction:column;gap:4px;flex:1" aria-label="${cat.label}"></div>`
            );
            for (const st of currentStatements) {
              if (placed.get(st.id) !== cat.id) continue;
              const isLocked = locked.has(st.id);
              const cardEl = stCard(st, isLocked);
              zone.appendChild(cardEl);
              if (!isLocked && !solvedRound) itemEls.push(cardEl);
            }
            categoryBoard.appendChild(zone);
            catWrap.appendChild(categoryBoard);
            zoneEls.push(zone);
          }
          tray.replaceChildren();
          for (const st of currentStatements) {
            if (placed.has(st.id)) continue;
            const cardEl = stCard(st, false);
            tray.appendChild(cardEl);
            itemEls.push(cardEl);
          }
          if (!ctrl) ctrl = enablePickPlace({ items: itemEls, zones: zoneEls, canPlace: (id) => !locked.has(id), onPlace });
          else ctrl.refresh(itemEls, zoneEls);
          checkBtn.disabled = solvedRound || placed.size < r2.statements.length;
          if (solvedRound) say('완벽해요! 다음을 눌러요!', nextBtn);
          else if (!checkBtn.disabled) say('다 나눴으면 확인을 눌러요!', checkBtn);
          else say('문장을 세 바구니로 나눠 봐요!', tray.querySelector<HTMLElement>('.card'));
        };

        // 분류 근거는 화면에 쌓지 않고 '근거' 버튼 → 모달로 (화면 텍스트 최소화)
        const openReview = () => {
          const reviewItems = r2.statements.filter((st) => !locked.has(st.id)).slice(0, batchSize);
          const bodyEl = el(`<div class="asia-modal-body" style="display:flex;flex-direction:column;gap:var(--sp-3)">
            ${reviewItems.length ? reviewItems
              .map((st) => {
                return `<details>
                  <summary>다시 볼 문장 · ${st.text}</summary>
                  <p style="color:var(--c-ink-soft);margin-top:var(--sp-2)">${st.why}</p>
                </details>`;
              })
              .join('') : '<div class="feedback success"><span aria-hidden="true">✓</span><span>모든 문장을 알맞게 분류했어요.</span></div>'}
          </div>`);
          openModal({
            id: 'asia-review',
            title: '분류 근거',
            bodyEl,
            actions: [{ label: '닫기', kind: 'primary', autofocus: true, onClick: (close) => close() }]
          });
        };
        reviewBtn.addEventListener('click', openReview);

        checkBtn.addEventListener('click', () => {
          if (busy || solvedRound || checkBtn.disabled) return;
          busy = true;
          checkBtn.disabled = true;
          try {
            let correct = 0;
            for (const st of r2.statements) {
              if (placed.get(st.id) === st.answer) {
                correct++;
                locked.add(st.id);
              }
            }
            const total = r2.statements.length;
            if (r2First === null) r2First = correct / total;
            if (lastCorrect !== null && correct > lastCorrect) improved++;
            lastCorrect = correct;
            r2LastCorrect = correct;
            reviewBtn.style.display = '';
            if (correct === total) {
              solvedRound = true;
              burstConfetti(checkBtn); // 숨기기 전에 위치 기준으로 터뜨린다
              showFeedback(fb, 'success', R2_MSG.perfect, 'asia');
              checkBtn.style.display = 'none';
              nextBtn.style.display = '';
            } else {
              imperfect++;
              // 오분류 카드만 트레이로 되돌린다
              for (const st of r2.statements) if (!locked.has(st.id)) placed.delete(st.id);
              const retryIndex = r2.statements.findIndex((st) => !locked.has(st.id));
              if (retryIndex >= 0) batchIndex = Math.floor(retryIndex / batchSize);
              showFeedback(fb, correct >= total / 2 ? 'partial' : 'retry', correct >= total / 2 ? R2_MSG.partial : R2_MSG.retry, 'asia');
            }
            persistAsiaCheckpoint('round2');
            paint();
          } finally {
            busy = false;
          }
        });

        nextBtn.addEventListener('click', () => {
          if (busy || round !== 2) return;
          round = 3;
          persistAsiaCheckpoint('round3');
          startRound();
        });

        paint();
      }

      // ================= 3라운드: 존중 질문 조립 =================
      function renderRound3(): void {
        const r3 = c.round3_question;
        const sel: { opener: string | null; topic: string | null; closer: string | null } = { opener: null, topic: null, closer: null };
        let quality = r3Quality;
        let hadPartial = r3HadPartial;
        let lastSubmissionKey: string | null = null;

        const board = makeScene(
          '조각 세 개를 이어 존중하는 질문을 만들어요',
          ['prop.journal', 'icon.heart_speech', 'icon.listening'],
          '한 사람의 이야기를 열린 질문으로 들어 봐요.'
        );
        board.appendChild(el(`<div class="board-title"><h2>존중 질문 조립대</h2><span class="chip">첫마디 + 주제 + 물음</span></div>`));
        const questionScene = el(`<div class="question-scene"></div>`);
        const preview = el(`<div class="q-bubble" role="status" aria-live="polite">
          <p class="q-caption" style="font-size:var(--mission-small);color:var(--c-ink-soft);margin-bottom:3px">미나에게 건넬 질문</p>
          <p id="q-preview" style="font-family:var(--font-head);font-size:var(--mission-title);color:var(--c-navy);min-height:1.4em"></p>
        </div>`);
        questionScene.appendChild(preview);
        const previewText = preview.querySelector('#q-preview') as HTMLElement;

        const cols = el(`<div class="fragment-cols"></div>`);
        questionScene.appendChild(cols);
        board.appendChild(questionScene);
        const fb = el(`<div class="compact-feedback"></div>`);
        board.appendChild(fb);
        bottom.replaceChildren();
        const status = el(`<span class="chip mission-status">조각 3개 연결</span>`);
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const submitBtn = el(`<button class="btn btn-primary btn-big" disabled>완성</button>`) as HTMLButtonElement;
        const finishBtn = el(`<button class="btn btn-success btn-big" style="display:none">미션 완료</button>`) as HTMLButtonElement;
        btns.append(submitBtn, finishBtn);
        bottom.append(status, btns);

        const groups: Array<{ key: 'opener' | 'topic' | 'closer'; label: string; list: string[] }> = [
          { key: 'opener', label: '첫마디', list: r3.fragments.openers },
          { key: 'topic', label: '무엇에 대해', list: r3.fragments.topics },
          { key: 'closer', label: '어떻게 물을까', list: r3.fragments.closers }
        ];

        let firstFragment: HTMLElement | null = null;
        const colByKey = new Map<'opener' | 'topic' | 'closer', HTMLElement>();
        const firstByKey = new Map<'opener' | 'topic' | 'closer', HTMLElement>();

        const syncFragmentUi = () => {
          const topicCol = colByKey.get('topic');
          const closerCol = colByKey.get('closer');
          if (topicCol) topicCol.hidden = !sel.opener;
          if (closerCol) closerCol.hidden = !sel.opener || !sel.topic;
          cols.querySelectorAll<HTMLElement>('[data-fragment-key]').forEach((fragment) => {
            const key = fragment.dataset.fragmentKey as 'opener' | 'topic' | 'closer';
            const on = sel[key] === fragment.dataset.fragmentValue;
            fragment.classList.toggle('is-selected', on);
            fragment.setAttribute('aria-pressed', String(on));
          });
        };

        const updatePreview = () => {
          syncFragmentUi();
          previewText.textContent =
            sel.opener || sel.topic || sel.closer
              ? `${sel.opener ?? '…'} ${sel.topic ?? '…'}${sel.closer ?? '…'}`
              : '아래에서 조각을 하나씩 골라 보세요.';
          submitBtn.disabled = !(sel.opener && sel.topic && sel.closer) || finishBtn.style.display !== 'none';
          const picked = Number(!!sel.opener) + Number(!!sel.topic) + Number(!!sel.closer);
          status.textContent = picked >= 3 ? '질문 완성!' : '질문 조각을 골라 봐';
          if (finishBtn.style.display !== 'none') say('멋진 질문이에요! 미션 완료를 눌러요!', finishBtn);
          else if (!submitBtn.disabled && lastSubmissionKey === null) say('질문이 되면 완성을 눌러요!', submitBtn);
          else if (lastSubmissionKey !== null) say('조각을 바꿔 질문을 다듬어 봐요!', firstFragment);
          else if (!sel.opener) say('먼저 부드러운 첫마디를 골라요.', firstByKey.get('opener') ?? firstFragment);
          else if (!sel.topic) say('이제 궁금한 주제를 골라요.', firstByKey.get('topic') ?? firstFragment);
          else if (!sel.closer) say('마지막 물음말을 골라요.', firstByKey.get('closer') ?? firstFragment);
        };

        for (const g of groups) {
          const col = el(`<div class="fragment-col" aria-label="${g.label} 조각"></div>`);
          colByKey.set(g.key, col);
          col.appendChild(el(`<span class="chip" style="align-self:center">${g.label}</span>`));
          for (const text of g.list) {
            const b = el(
              `<button class="card card-pick" aria-pressed="false" style="text-align:left;font:inherit">${text}</button>`
            ) as HTMLButtonElement;
            if (!firstFragment) firstFragment = b;
            if (!firstByKey.has(g.key)) firstByKey.set(g.key, b);
            b.dataset.fragmentKey = g.key;
            b.dataset.fragmentValue = text;
            b.addEventListener('click', () => {
              if (finishBtn.style.display !== 'none') return; // 완성 후 변경 금지
              void audio.playSfx('tap');
              sel[g.key] = sel[g.key] === text ? null : text;
              if (g.key === 'opener' && !sel.opener) {
                sel.topic = null;
                sel.closer = null;
              }
              if (g.key === 'topic' && !sel.topic) sel.closer = null;
              lastSubmissionKey = null;
              updatePreview();
            });
            col.appendChild(b);
          }
          cols.appendChild(col);
        }

        submitBtn.addEventListener('click', () => {
          if (busy || submitBtn.disabled) return;
          if (!sel.opener || !sel.topic || !sel.closer) {
            showToast('세 조각을 모두 골라 주세요.', 'warn');
            return;
          }
          const submissionKey = `${sel.opener}\u0000${sel.topic}\u0000${sel.closer}`;
          if (submissionKey === lastSubmissionKey) return;
          lastSubmissionKey = submissionKey;
          busy = true;
          submitBtn.disabled = true;
          try {
            // 화면에 놓인 모든 조각은 상대를 단정하지 않는 열린 표현이다.
            // 특정 문장 조합을 숨은 정답으로 두지 않고, 아이가 만든 질문 자체를 인정한다.
            if (hadPartial) improved++;
            quality = 1;
            showFeedback(
              fb,
              'success',
              `${r3.feedback.good} 허락을 구하고, 미나가 자기 경험을 직접 말할 수 있게 열어 둔 질문이에요.`,
              'asia'
            );
            characterHelp = null;
            submitBtn.style.display = 'none';
            finishBtn.style.display = '';
            popBounce(preview);
            burstConfetti(finishBtn);
            r3HadPartial = hadPartial;
            r3Quality = quality;
            persistAsiaCheckpoint('round3');
          } finally {
            busy = false;
            updatePreview();
          }
        });

        finishBtn.addEventListener('click', () => finish(quality));

        if (quality >= 1) {
          submitBtn.style.display = 'none';
          finishBtn.style.display = '';
        } else if (hadPartial) {
          characterHelp = () => {
            const hint = r3.badPatterns[0]?.why ?? '한 사람의 삶을 단정하지 않는 열린 물음을 골라 봐요.';
            gd.say(shortSentence(`힌트: ${hint}`, 50), {
              cue: firstFragment,
              speaker: playerSpeaker
            });
          };
        }
        updatePreview();
      }

      startRound();
      const continueAfterQuestion = (): void => {
        if (!saved.checkpointId) openAsiaFlightQuiz();
        else releaseIntro();
      };
      // 시작 예상 → 비행 항로에서 목적지 확인 → 기록 조사 순서.
      if (learn) {
        showFriendIntro('asia', learn, continueAfterQuestion);
      } else continueAfterQuestion();
    },

    unmount() {
      disposed = true;
      ctrl?.dispose();
      ctrl = null;
      guide?.dispose();
      guide = null;
    }
  };
}

export { createAsiaPage as createPage } from './connectedRegionMission';
