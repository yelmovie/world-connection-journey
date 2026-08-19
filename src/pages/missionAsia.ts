import type { Page } from '../router';
import { assetUrl, hasAsset } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { burstConfetti, popBounce } from '../ui/fx';
import { createGuide, type GuideController } from '../ui/guide';
import { getLearn, showFriendIntro, showLearningWrap } from '../ui/learnFrame';
import { openModal } from '../ui/modal';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { showToast } from '../ui/toast';

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
.asia-mission .top-bar { background: linear-gradient(180deg,rgba(31,43,74,.78),rgba(31,43,74,0)); }
/* 기준 해상도(1024x576+)에서는 한 화면에 들어가지만, 더 낮은 창에서는 잘리는 대신 스크롤한다 */
.asia-mission .page-body { padding: var(--sp-3) clamp(12px,2.5vw,32px); overflow-y: auto; }
/* 배경 일러스트가 주인공 — 패널은 하나, 반투명. 오른쪽은 배경 위에 선 캐릭터 열 */
.asia-mission .mission-scene {
  flex: 1; min-height: 0; width: 100%; display: grid;
  grid-template-columns: minmax(0,1fr) clamp(132px,14vw,240px);
  gap: var(--sp-4); align-items: stretch;
}
.asia-mission .scene-board {
  min-width: 0; min-height: 0; overflow: hidden; position: relative;
  display: flex; flex-direction: column; gap: var(--sp-3);
  padding: var(--sp-4); border-radius: var(--radius-l);
  background: rgba(255,252,240,.9); backdrop-filter: blur(6px);
  border: 2px solid rgba(216,189,125,.85); box-shadow: var(--shadow-card);
}
.asia-mission .scene-cast {
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
  gap: var(--sp-2); min-width: 0; overflow: hidden;
}
.asia-mission .cast-hero {
  width: clamp(120px,14vw,240px); max-height: 54%; object-fit: contain;
  filter: drop-shadow(0 10px 18px rgba(8,18,33,.5));
}
.asia-mission .cast-props { display: flex; gap: var(--sp-2); justify-content: center; flex-wrap: wrap; }
.asia-mission .cast-props img {
  width: clamp(40px,4.6vw,72px); height: clamp(40px,4.6vw,72px); object-fit: contain;
  filter: drop-shadow(0 5px 10px rgba(8,18,33,.45));
}
.asia-mission .cast-note {
  font-size: var(--fs-small); line-height: 1.35; color: #fff; text-align: center;
  text-shadow: 0 2px 6px rgba(10,22,40,.95);
}
.asia-mission .board-title { display:flex;align-items:center;justify-content:space-between;gap:var(--sp-2); }
.asia-mission .board-title h2 { color: var(--c-navy); font-size: var(--fs-title); }
.asia-mission .record-grid,
.asia-mission .timeline-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:0; }
.asia-mission .record-grid { flex:1;align-content:stretch; }
.asia-mission .record-card {
  min-height:72px;padding:var(--sp-2);display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:4px;text-align:center;font-size:var(--fs-small);
}
.asia-mission .record-card strong { color:var(--c-navy);font-family:var(--font-head);font-size:var(--fs-body); }
.asia-mission .record-detail {
  padding:var(--sp-3);border-left:5px solid var(--c-turquoise);
  background:rgba(238,250,247,.94);border-radius:var(--radius-s);
}
.asia-mission .record-detail p { font-size:var(--fs-small);line-height:1.4; }
.asia-mission .timeline-grid { flex:1; }
.asia-mission .timeline-grid .drop-zone { flex:1;min-height:56px;padding:3px; }
.asia-mission .timeline-grid .card { padding:var(--sp-2);font-size:var(--fs-small);line-height:1.25; }
.asia-mission .timeline-label { display:flex;align-items:center;gap:5px;font-size:var(--fs-small);font-weight:700;color:var(--c-navy); }
.asia-mission .timeline-tray { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:0;padding:4px; }
.asia-mission .timeline-tray .card { padding:var(--sp-2);font-size:var(--fs-small);min-height:48px; }
.asia-mission .evidence-layout { display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:var(--sp-2);min-height:0;flex:1; }
.asia-mission .evidence-zones { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:0; }
.asia-mission .evidence-zone { padding:var(--sp-2);min-height:84px;display:flex;flex-direction:column;gap:4px;background:rgba(255,254,248,.92); }
.asia-mission .evidence-zone .card { padding:var(--sp-2);font-size:var(--fs-small);line-height:1.25; }
.asia-mission .evidence-tray { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:62px;padding:5px; }
.asia-mission .evidence-tray .card { padding:var(--sp-2);font-size:var(--fs-small);line-height:1.3; }
.asia-mission .batch-nav { display:flex;align-items:center;justify-content:center;gap:var(--sp-2); }
.asia-mission .batch-nav .btn { min-height:48px;padding:6px 14px; }
.asia-mission .question-scene { display:grid;grid-template-rows:auto minmax(0,1fr);gap:var(--sp-2);min-height:0;flex:1; }
.asia-mission .q-bubble { padding:var(--sp-3);text-align:center;background:rgba(255,253,244,.95);border:2px solid #d8bd7d;border-radius:var(--radius-m); }
.asia-mission .fragment-cols { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2);min-height:0; }
.asia-mission .fragment-col { display:flex;flex-direction:column;gap:5px;min-height:0;overflow-y:auto;padding:2px; }
.asia-mission .fragment-col .card { min-height:48px;padding:var(--sp-2);font-size:var(--fs-small);line-height:1.25;text-align:left; }
.asia-mission .mission-dock { background:linear-gradient(0deg,rgba(15,30,50,.8),rgba(15,30,50,.28)); }
.asia-mission .mission-dock .chip { max-width:60%; }
.asia-mission .compact-feedback .feedback { padding:var(--sp-2) var(--sp-3);font-size:var(--fs-small); }
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
@media (max-width: 900px) {
  .asia-mission .mission-scene { grid-template-columns:minmax(0,1fr) 132px;gap:var(--sp-3); }
  .asia-mission .scene-board { padding:var(--sp-3); }
}
@media (max-height: 620px) {
  .asia-mission .cast-hero { max-height: 42%; }
  .asia-mission .cast-props img { width:40px;height:40px; }
  /* 낮은 화면에서는 조각 목록이 스크롤 없이 들어오도록 미리보기를 줄인다 */
  .asia-mission .q-bubble { padding:var(--sp-2); }
  .asia-mission .q-bubble .q-caption { display:none; }
  .asia-mission #q-preview { font-size:var(--fs-body)!important; }
  .asia-mission .fragment-col { gap:4px; }
  .asia-mission .fragment-col .card { min-height:44px;padding:6px; }
  .asia-mission .record-card { min-height:64px; }
}
@media (prefers-reduced-motion: reduce) {
  .asia-mission * { scroll-behavior:auto!important; }
}
`;

/* round2 는 콘텐츠 JSON 에 feedback 블록이 없어 페이지에서 문구를 보완한다. */
const R2_MSG = {
  perfect: '아홉 문장을 모두 알맞게 나눴어요! 자료에 나온 사실과 내 해석을 구분할 줄 알게 된 거예요.',
  partial: '문장 몇 개는 알맞게 나눴어요. 결과 리뷰를 읽고, 남은 문장을 다시 나눠 볼까요?',
  retry: '아직 헷갈리는 문장이 많아요. 결과 리뷰의 설명을 읽고, 자료에 직접 나온 말인지부터 확인해 볼까요?'
} as const;

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export function createPage(): Page {
  let ctrl: PickPlaceController | null = null;
  let disposed = false;
  let guide: GuideController | null = null;

  return {
    async mount(root: HTMLElement) {
      const c = await loadContent<AsiaContent>('asia');
      if (disposed) return;
      const learn = getLearn(c); // 배움 루프(친구 소개→예상→배움 확인) — null이면 기존 흐름 그대로
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
      let observationDone = false;

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
        observationDone = observed.size === c.round1_timeline.items.length;
        showToast('저장된 관찰 지점부터 이어서 해요.', 'info');
      }
      if (saved.checkpointId === 'round2' || saved.checkpointId === 'round3') {
        round = saved.checkpointId === 'round3' ? 3 : 2;
        observationDone = true;
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
      const gd = createGuide();
      guide = gd;
      page.appendChild(gd.el);
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
          gd.say(text, { cue });
        } else {
          gd.setCue(cue); // 같은 문구면 타이핑 재시작 없이 큐만 이동
        }
      };

      const castImg = (id: string, cls: string): string =>
        hasAsset(id) ? `<img class="${cls}" src="${assetUrl(id)}" alt="" aria-hidden="true" data-asset-id="${id}">` : '';

      /**
       * 장면 = 반투명 보드 1개 + 배경 위에 선 캐릭터 열.
       * heroId 는 크게(캐릭터), propIds 는 소품·랜드마크로 화면 에셋을 3종 이상 유지한다.
       */
      const makeScene = (goal: string, heroId: string, propIds: string[], note: string): HTMLElement => {
        body.replaceChildren();
        setRibbon(goal);
        const scene = el(`<section class="mission-scene" aria-label="아시아 여행 기록 게임 장면">
          <main class="scene-board"></main>
          <aside class="scene-cast" aria-hidden="true">
            ${castImg(heroId, 'cast-hero bob')}
            <div class="cast-props">${propIds.map((id) => castImg(id, '')).join('')}</div>
            <p class="cast-note">${note}</p>
          </aside>
        </section>`);
        body.appendChild(scene);
        return scene.querySelector('.scene-board') as HTMLElement;
      };

      const startRound = () => {
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
          perspective: 0.3 + 0.7 * (r1First ?? 0), // 관점 = 1라운드(하루 읽기) 첫 정답률 + 완주 기본점
          communication, // 소통 = 3라운드 질문 품질
          revision: imperfect === 0 ? 1 : improved / imperfect // 수정 = 재도전 시 실제로 나아졌는가
        };
        const result = computeScore(ratios, WEIGHTS, 5 - imperfect);
        // 점수 모달 전에 배움 확인(처음 생각 vs 발견) — learn 없으면 기존 흐름 그대로
        const done = (): void => {
          const learnRec = saveRepo.get().missions.asia.data.learn;
          completeMissionFlow('asia', '아시아', result);
          // completeMission이 data를 비우므로 배움 카드 기록을 되살린다(여권·수료증에서 읽음)
          if (learnRec) saveRepo.update((s) => { s.missions.asia.data.learn = learnRec; });
        };
        if (learn) showLearningWrap('asia', learn, done);
        else done();
      };

      // ================= 1라운드: 타임라인 =================
      function renderRound1(): void {
        const r1 = c.round1_timeline;
        if (!observationDone) {
          updateSteps(bar, 3, 0, 0);
          const board = makeScene(
            '기록 카드 6장을 눌러 하루를 살펴봐요',
            'asia.child1',
            ['prop.journal', 'deco.landmark_taj'],
            '옷차림은 일지를 꾸미는 그림이에요. 옷으로 나라를 맞히지 않아요.'
          );
          const observationGrid = el(`<div class="record-grid" role="list" aria-label="미나네 가족의 하루 기록"></div>`);
          const detail = el(`<div class="record-detail" role="status" aria-live="polite"></div>`);
          board.append(observationGrid, detail);
          let activeRecordId = r1.items.find((item) => !observed.has(item.id))?.id ?? r1.items[0]?.id ?? '';

          bottom.replaceChildren();
          const observationStatus = el(
            `<span class="chip mission-status" role="status" aria-live="polite">생활 기록 ${observed.size}/${r1.items.length}</span>`
          );
          const timelineBtn = el(`<button class="btn btn-primary btn-big" disabled>순서 맞추기</button>`) as HTMLButtonElement;
          bottom.append(observationStatus, timelineBtn);

          const paintObservation = () => {
            observationStatus.textContent = `기록 ${observed.size}/${r1.items.length}`;
            timelineBtn.disabled = observed.size < r1.items.length;
            observationGrid.replaceChildren();
            let firstTodo: HTMLElement | null = null;
            for (const item of r1.items) {
              const seen = observed.has(item.id);
              const active = activeRecordId === item.id;
              const card = el(`<button class="card card-pick record-card" role="listitem" aria-pressed="${active}">
                <span class="time-badge tb-${item.correctSlot}" aria-hidden="true"></span>
                <strong>${item.label}</strong>
                <span class="text-oneline" style="color:var(--c-ink-soft)">${seen ? '✓ 확인함' : '○ 눌러 보기'}</span>
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
            const activeItem = r1.items.find((item) => item.id === activeRecordId) ?? r1.items[0];
            detail.innerHTML = activeItem
              ? `<div class="row-between" style="gap:8px"><strong>${activeItem.label}</strong><span class="chip">${activeItem.timeHint}</span></div>
                 <p>${activeItem.desc}</p>
                 <p style="color:var(--c-ink-soft)">한 가족의 사례이며, 나라 전체의 하루로 일반화하지 않아요.</p>`
              : '<p>기록 카드를 골라 단서를 확인해요.</p>';
            if (observed.size >= r1.items.length) say('다 봤어요! 순서 맞추기를 눌러요!', timelineBtn);
            else say('카드를 눌러 하루 자료를 살펴봐요!', firstTodo);
          };

          timelineBtn.addEventListener('click', () => {
            if (busy || observationDone || observed.size < r1.items.length) return; // 원샷: 연타로 인한 이중 렌더 방지
            busy = true;
            try {
              observationDone = true;
              persistAsiaCheckpoint('observe');
              renderRound1();
            } finally {
              busy = false;
            }
          });

          paintObservation();
          return;
        }

        const slots: Array<string | null> = new Array<string | null>(r1.slots.length).fill(null);
        const locked = new Set<string>();
        let lastCorrect: number | null = r1LastCorrect;
        let solvedRound = false;
        const itemById = new Map(r1.items.map((i) => [i.id, i]));

        const board = makeScene(
          '기록 카드를 시간 순서대로 놓아요',
          'asia.child2',
          ['prop.scrapbook', 'asia.costume1', 'asia.costume2'],
          '옷과 장신구는 정답 단서가 아니라 일지를 꾸미는 그림이에요.'
        );
        const slotsWrap = el(`<div class="timeline-grid"></div>`);
        const tray = el(`<div class="drop-zone timeline-tray" aria-label="카드 보관함"></div>`);
        const fb = el(`<div class="compact-feedback"></div>`);
        board.append(slotsWrap, tray, fb);

        bottom.replaceChildren();
        const status = el(`<span class="chip mission-status">기록 6장 · 시간순</span>`);
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const checkBtn = el(`<button class="btn btn-primary btn-big" disabled>확인</button>`) as HTMLButtonElement;
        const nextBtn = el(`<button class="btn btn-success btn-big" style="display:none">다음</button>`) as HTMLButtonElement;
        btns.append(checkBtn, nextBtn);
        bottom.append(status, btns);

        const cardOf = (it: TimelineItem, isLocked: boolean): HTMLElement =>
          el(`<div class="card" data-item-id="${it.id}" style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;${
            isLocked ? 'border-color:var(--c-success);cursor:default;' : ''
          }">
            <strong style="font-size:var(--fs-small)">${isLocked ? '✓ ' : ''}${it.label}</strong>
            <span style="font-size:var(--fs-small);color:var(--c-ink-soft)">${it.timeHint}</span>
          </div>`);

        const onPlace = (itemId: string, zoneId: string) => {
          if (solvedRound || locked.has(itemId)) return;
          const i = Number(zoneId.slice('slot-'.length));
          if (!Number.isInteger(i) || i < 0 || i >= slots.length) return;
          const occupant = slots[i];
          if (occupant && locked.has(occupant)) return;
          const cur = slots.indexOf(itemId);
          if (cur === i) {
            slots[i] = null; // 놓인 카드를 다시 탭 → 트레이로 돌아감
          } else {
            if (cur >= 0) slots[cur] = null;
            slots[i] = itemId; // 자리에 있던 카드는 트레이로 밀려남
          }
          const placedNow = slots[i] === itemId;
          paint();
          if (placedNow) {
            // 배치 성공 순간의 팝 바운스 — 새로 그려진 카드를 찾아 튕긴다
            const placedEl = slotsWrap.querySelector<HTMLElement>(`[data-item-id="${itemId}"]`);
            if (placedEl) popBounce(placedEl);
          }
        };

        const paint = () => {
          slotsWrap.replaceChildren();
          const zoneEls: HTMLElement[] = [];
          const itemEls: HTMLElement[] = [];
          r1.slots.forEach((slotLabel, i) => {
            const wrap = el(`<div style="display:flex;flex-direction:column;gap:3px;min-width:0"></div>`);
            wrap.appendChild(el(`<span class="timeline-label"><span class="time-badge tb-${i}" aria-hidden="true"></span>${slotLabel}</span>`));
            const zone = el(
              `<div class="drop-zone" data-zone-id="slot-${i}" style="display:flex" aria-label="${slotLabel} 자리"></div>`
            );
            const itemId = slots[i];
            if (itemId) {
              const it = itemById.get(itemId);
              if (it) {
                const isLocked = locked.has(itemId);
                const cardEl = cardOf(it, isLocked);
                zone.appendChild(cardEl);
                zone.classList.add('is-filled');
                if (!isLocked && !solvedRound) itemEls.push(cardEl);
              }
            }
            wrap.appendChild(zone);
            slotsWrap.appendChild(wrap);
            zoneEls.push(zone);
          });
          tray.replaceChildren();
          for (const it of r1.items) {
            if (slots.includes(it.id)) continue;
            const cardEl = cardOf(it, false);
            tray.appendChild(cardEl);
            itemEls.push(cardEl);
          }
          if (!ctrl) ctrl = enablePickPlace({ items: itemEls, zones: zoneEls, canPlace: (id) => !locked.has(id), onPlace });
          else ctrl.refresh(itemEls, zoneEls);
          checkBtn.disabled = solvedRound || slots.some((s) => s === null);
          status.textContent = `놓은 카드 ${slots.filter(Boolean).length}/${r1.items.length}`;
          if (solvedRound) say('완벽해요! 다음을 눌러요!', nextBtn);
          else if (!checkBtn.disabled) say('다 놓았으면 확인을 눌러요!', checkBtn);
          else say('카드를 시간 순서대로 놓아 봐요!', tray.querySelector<HTMLElement>('.card'));
        };

        checkBtn.addEventListener('click', () => {
          if (busy || solvedRound || checkBtn.disabled) return;
          busy = true;
          checkBtn.disabled = true;
          try {
            let correct = 0;
            for (const it of r1.items) if (slots[it.correctSlot] === it.id) correct++;
            const total = r1.items.length;
            if (r1First === null) r1First = correct / total;
            if (lastCorrect !== null && correct > lastCorrect) improved++;
            lastCorrect = correct;
            r1LastCorrect = correct;
            if (correct === total) {
              solvedRound = true;
              for (const it of r1.items) locked.add(it.id);
              burstConfetti(checkBtn); // 숨기기 전에 위치 기준으로 터뜨린다
              showFeedback(fb, 'success', r1.feedback.perfect, 'asia');
              checkBtn.style.display = 'none';
              nextBtn.style.display = '';
            } else {
              imperfect++;
              // 맞은 카드만 제자리에 잠그고, 틀린 카드만 트레이로 되돌린다(전체 리셋 없음)
              for (const it of r1.items) if (slots[it.correctSlot] === it.id) locked.add(it.id);
              for (let i = 0; i < slots.length; i++) {
                const id = slots[i];
                if (id && !locked.has(id)) slots[i] = null;
              }
              const kind = correct >= total / 2 ? 'partial' : 'retry';
              showFeedback(fb, kind, kind === 'partial' ? r1.feedback.partial : r1.feedback.retry, 'asia');
            }
            persistAsiaCheckpoint('observe');
            paint();
          } finally {
            busy = false;
          }
        });

        nextBtn.addEventListener('click', () => {
          if (busy || round !== 1) return;
          round = 2;
          persistAsiaCheckpoint('round2');
          startRound();
        });

        paint();
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
          '문장을 사실·해석·더 확인할 것으로 나눠요',
          'asia.child3',
          ['deco.necklace', 'deco.norigae', 'prop.journal'],
          '장신구 그림은 장식이에요. 사실 여부는 문장 근거로 판단해요.'
        );
        board.appendChild(el(`<div class="board-title"><h2>증거 렌즈</h2><span class="chip" data-batch-status></span></div>`));
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
        const status = el(`<span class="chip mission-status">증거 ${placed.size}/${r2.statements.length}</span>`);
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
          batchStatus.textContent = `${batchIndex + 1}/${batchCount} 묶음`;
          status.textContent = `증거 ${placed.size}/${r2.statements.length}`;
          batchNav.replaceChildren();
          const prevBatch = el(`<button class="btn btn-ghost" ${batchIndex === 0 ? 'disabled' : ''} aria-label="이전 세 장">◀ 이전</button>`) as HTMLButtonElement;
          const currentPlaced = currentStatements.filter((st) => placed.has(st.id)).length;
          const navState = el(`<span class="chip">${currentPlaced}/${currentStatements.length} 배치</span>`);
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
          const bodyEl = el(`<div style="display:flex;flex-direction:column;gap:var(--sp-3)">
            ${r2.statements
              .map((st) => {
                const ok = locked.has(st.id);
                return `<div style="border-left:5px solid ${ok ? 'var(--c-success)' : 'var(--c-warning)'};padding:var(--sp-2) var(--sp-3);background:${
                  ok ? '#e8f7f0' : '#fdf3e0'
                };border-radius:var(--radius-s)">
                  <strong>${ok ? '✓ 맞음' : '◐ 다시 생각'}</strong>
                  <p style="margin:2px 0 0">${st.text}</p>
                  <p style="font-size:var(--fs-small);color:var(--c-ink-soft);margin:2px 0 0">${st.why}</p>
                </div>`;
              })
              .join('')}
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
          'asia.child1',
          ['asia.child3', 'deco.norigae', 'deco.landmark_taj'],
          '한 친구가 대륙 전체를 대표하지 않아요.'
        );
        board.appendChild(el(`<div class="board-title"><h2>존중 질문 조립대</h2><span class="chip">첫마디 + 주제 + 물음</span></div>`));
        const questionScene = el(`<div class="question-scene"></div>`);
        const preview = el(`<div class="q-bubble" role="status" aria-live="polite">
          <p class="q-caption" style="font-size:var(--fs-small);color:var(--c-ink-soft);margin-bottom:3px">미나에게 건넬 질문</p>
          <p id="q-preview" style="font-family:var(--font-head);font-size:var(--fs-title);color:var(--c-navy);min-height:1.4em"></p>
        </div>`);
        questionScene.appendChild(preview);
        const previewText = preview.querySelector('#q-preview') as HTMLElement;

        const cols = el(`<div class="fragment-cols"></div>`);
        questionScene.appendChild(cols);
        board.appendChild(questionScene);
        const fb = el(`<div class="compact-feedback"></div>`);
        board.appendChild(fb);
        // 다듬기 힌트는 화면에 펼쳐 두지 않고 '힌트' 버튼 → 모달로
        const openHints = () => {
          const bodyEl = el(`<div style="display:flex;flex-direction:column;gap:var(--sp-3)">
            ${r3.badPatterns
              .map(
                (b) => `<div style="border-left:5px solid var(--c-coral);padding:var(--sp-2) var(--sp-3);background:#fdeeee;border-radius:var(--radius-s)">
                  <p style="font-weight:700">${b.pattern}</p>
                  <p style="font-size:var(--fs-small);color:var(--c-ink-soft);margin-top:2px">${b.why}</p>
                </div>`
              )
              .join('')}
          </div>`);
          openModal({
            id: 'asia-hint',
            title: '질문을 다듬는 힌트',
            bodyEl,
            actions: [{ label: '닫기', kind: 'primary', autofocus: true, onClick: (close) => close() }]
          });
        };

        bottom.replaceChildren();
        const status = el(`<span class="chip mission-status">조각 3개 연결</span>`);
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const hintBtn = el(`<button class="btn btn-ghost" style="display:none">힌트</button>`) as HTMLButtonElement;
        const submitBtn = el(`<button class="btn btn-primary btn-big" disabled>완성</button>`) as HTMLButtonElement;
        const partialBtn = el(`<button class="btn btn-ghost" style="display:none">이대로</button>`) as HTMLButtonElement;
        const finishBtn = el(`<button class="btn btn-success btn-big" style="display:none">미션 완료</button>`) as HTMLButtonElement;
        hintBtn.addEventListener('click', openHints);
        btns.append(hintBtn, partialBtn, submitBtn, finishBtn);
        bottom.append(status, btns);

        const groups: Array<{ key: 'opener' | 'topic' | 'closer'; label: string; list: string[] }> = [
          { key: 'opener', label: '첫마디', list: r3.fragments.openers },
          { key: 'topic', label: '무엇에 대해', list: r3.fragments.topics },
          { key: 'closer', label: '어떻게 물을까', list: r3.fragments.closers }
        ];

        let firstFragment: HTMLElement | null = null;

        const updatePreview = () => {
          previewText.textContent =
            sel.opener || sel.topic || sel.closer
              ? `${sel.opener ?? '…'} ${sel.topic ?? '…'}${sel.closer ?? '…'}`
              : '아래에서 조각을 하나씩 골라 보세요.';
          submitBtn.disabled = !(sel.opener && sel.topic && sel.closer) || finishBtn.style.display !== 'none';
          if (finishBtn.style.display !== 'none') say('멋진 질문이에요! 미션 완료를 눌러요!', finishBtn);
          else if (!submitBtn.disabled && lastSubmissionKey === null) say('질문이 되면 완성을 눌러요!', submitBtn);
          else if (lastSubmissionKey !== null) say('조각을 바꿔 질문을 다듬어 봐요!', firstFragment);
          else say('조각을 골라 존중하는 질문을 만들어요!', firstFragment);
        };

        for (const g of groups) {
          const col = el(`<div class="fragment-col"></div>`);
          col.appendChild(el(`<span class="chip" style="align-self:center">${g.label}</span>`));
          for (const text of g.list) {
            const b = el(
              `<button class="card card-pick" aria-pressed="false" style="text-align:left;font:inherit">${text}</button>`
            ) as HTMLButtonElement;
            if (!firstFragment) firstFragment = b;
            b.addEventListener('click', () => {
              if (finishBtn.style.display !== 'none') return; // 완성 후 변경 금지
              void audio.playSfx('tap');
              sel[g.key] = sel[g.key] === text ? null : text;
              lastSubmissionKey = null;
              col.querySelectorAll<HTMLElement>('.card-pick').forEach((e2) => {
                const on = e2 === b && sel[g.key] === text;
                e2.classList.toggle('is-selected', on);
                e2.setAttribute('aria-pressed', String(on));
              });
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
            const good = r3.goodCombos.find((g) => g.opener === sel.opener && g.topic === sel.topic && g.closer === sel.closer);
            if (good) {
              if (hadPartial) improved++; // 수정해서 더 좋은 질문 완성 → revision 반영
              quality = 1;
              showFeedback(fb, 'success', `${r3.feedback.good} ${good.why}`, 'asia');
              hintBtn.style.display = 'none';
              submitBtn.style.display = 'none';
              partialBtn.style.display = 'none';
              finishBtn.style.display = '';
              popBounce(preview);
              burstConfetti(finishBtn);
            } else {
              // 조각 자체는 존중 표현이라 badPatterns 미포함 → 부분 인정 + 다듬을 기회
              if (!hadPartial) {
                hadPartial = true;
                imperfect++;
              }
              quality = Math.max(quality, 0.75);
              showFeedback(fb, 'partial', r3.feedback.retry, 'asia');
              hintBtn.style.display = '';
              partialBtn.style.display = '';
            }
            r3HadPartial = hadPartial;
            r3Quality = quality;
            persistAsiaCheckpoint('round3');
          } finally {
            busy = false;
            updatePreview();
          }
        });

        partialBtn.addEventListener('click', () => finish(quality));
        finishBtn.addEventListener('click', () => finish(quality));

        if (quality >= 1) {
          submitBtn.style.display = 'none';
          partialBtn.style.display = 'none';
          finishBtn.style.display = '';
        } else if (hadPartial) {
          hintBtn.style.display = '';
          partialBtn.style.display = '';
        }
        updatePreview();
      }

      startRound();
      // 화면을 다 그린 뒤 친구 소개 + 예상하기. 닫으면 미뤄 둔 첫 말풍선이 시작된다.
      if (learn) {
        showFriendIntro('asia', learn, () => {
          introGate = false;
          if (pendingSay) {
            const p = pendingSay;
            pendingSay = null;
            say(p.text, p.cue);
          }
        });
      }
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
