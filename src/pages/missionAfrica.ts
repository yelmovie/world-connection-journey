import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { burstConfetti, popBounce } from '../ui/fx';
import { createGuide, type GuideController } from '../ui/guide';
import { openModal } from '../ui/modal';
import { showToast } from '../ui/toast';

/** 셀 값: 0=쉼, 1=저음, 2=고음 (africa.json patterns.steps 규격) */
type Cell = 0 | 1 | 2;

interface PatternDef {
  id: string;
  name: string;
  bpm: number;
  steps: number[];
  desc: string;
}

interface AfricaContent {
  intro: { title: string; subtitle: string; guide: string };
  contextCards: Array<{ id: string; title: string; body: string }>;
  patterns: PatternDef[];
  callResponse: {
    guide: string;
    call: { bpm: number; steps: number[] };
    rules: Array<{ id: string; text: string; check: string }>;
    examples: number[][];
  };
  feedback: { listenAgain: string; close: string; good: string };
}

const STAGES = ['context', 'r1', 'r2', 'r3'] as const;
type Stage = (typeof STAGES)[number];

/* 하단 상태 칩 문구 — 단계 번호는 상단바 진행 점이 보여 주므로 넣지 않는다 */
const STAGE_LABEL: Record<Stage, string> = {
  context: '리듬 알아보기',
  r1: '리듬 다시 만들기',
  r2: '다른 칸 찾기',
  r3: '리듬으로 대답하기'
};

/* 리본 부제로 쓰는 한 줄 목표 */
const STAGE_GOAL: Record<Stage, string> = {
  context: '카드 세 장을 눌러 리듬을 알아봐요',
  r1: '들은 리듬을 여덟 칸에 다시 만들어요',
  r2: '두 리듬에서 다르게 들린 칸을 찾아요',
  r3: '규칙을 지켜 리듬으로 대답해요'
};

interface StageResult {
  first: number; // 첫 확인 정확도 0~1 (-1 = 아직 확인 전)
  final: number; // 마지막 확인 정확도 0~1
  retries: number;
}

interface AfricaState {
  stage: Stage;
  viewed: string[];
  listens: number;
  r1: StageResult | null;
  r2: StageResult | null;
  r3: StageResult | null;
  r1PatternId: string | null;
  r1Draft: Cell[];
  r1Heard: string[];
  r2Selected: number[];
  r2Heard: string[];
  r3Draft: Cell[];
  callHeard: boolean;
}

const STEP_COUNT = 8;

const AFRICA_INSTRUMENTS = [
  { id: 'africa.instrument1', name: '젬베', alt: '손으로 연주하는 젬베 북 그림' },
  { id: 'africa.instrument2', name: '토킹드럼', alt: '팔에 끼고 연주하는 토킹드럼 그림' },
  { id: 'africa.instrument3', name: '셰케레', alt: '구슬망을 두른 셰케레 악기 그림' },
  { id: 'africa.instrument4', name: '칼림바', alt: '손가락으로 금속 건반을 튕기는 칼림바 그림' },
  { id: 'africa.instrument5', name: '코라', alt: '여러 줄을 뜯어 연주하는 코라 현악기 그림' }
] as const;

function toCells(arr: number[] | undefined): Cell[] {
  return Array.from({ length: STEP_COUNT }, (_, i) => {
    const v = arr?.[i];
    return v === 1 || v === 2 ? v : 0;
  });
}

function readResult(raw: unknown): StageResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.first !== 'number' || typeof r.final !== 'number' || typeof r.retries !== 'number') return null;
  return {
    first: Math.max(-1, Math.min(1, r.first)),
    final: Math.max(0, Math.min(1, r.final)),
    retries: Math.max(0, Math.floor(r.retries))
  };
}

function restoreState(data: Record<string, unknown>): AfricaState | null {
  const s = data.state;
  if (!s || typeof s !== 'object') return null;
  const r = s as Record<string, unknown>;
  const stage = STAGES.includes(r.stage as Stage) ? (r.stage as Stage) : 'context';
  return {
    stage,
    viewed: Array.isArray(r.viewed) ? r.viewed.filter((x): x is string => typeof x === 'string') : [],
    listens: typeof r.listens === 'number' ? Math.max(0, Math.floor(r.listens)) : 0,
    r1: readResult(r.r1),
    r2: readResult(r.r2),
    r3: readResult(r.r3),
    r1PatternId: typeof r.r1PatternId === 'string' ? r.r1PatternId : null,
    r1Draft: toCells(Array.isArray(r.r1Draft) ? r.r1Draft.filter((x): x is number => typeof x === 'number') : []),
    r1Heard: Array.isArray(r.r1Heard) ? r.r1Heard.filter((x): x is string => typeof x === 'string') : [],
    r2Selected: Array.isArray(r.r2Selected)
      ? [...new Set(r.r2Selected.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < STEP_COUNT))]
      : [],
    r2Heard: Array.isArray(r.r2Heard) ? r.r2Heard.filter((x): x is string => typeof x === 'string') : [],
    r3Draft: toCells(Array.isArray(r.r3Draft) ? r.r3Draft.filter((x): x is number => typeof x === 'number') : []),
    callHeard: r.callHeard === true
  };
}

const PAGE_CSS = `
/* 8칸이 1024폭에서도 잘리지 않도록 라벨 1열 + 8열 그리드로 늘린다 */
.seq { display: grid; grid-template-columns: minmax(40px, auto) repeat(8, minmax(0, 62px)); gap: 6px; align-items: center; justify-content: start; }
.seq-row { display: contents; }
.seq-label { font-weight: 700; font-size: var(--fs-small); text-align: right; padding-right: 4px; white-space: nowrap; }
.seq-num { text-align: center; font-size: var(--fs-small); color: var(--c-ink-soft); font-weight: 700; }
.seq-cell {
  width: 100%; height: clamp(44px, 7vh, 60px);
  border-radius: 12px; border: 2px solid var(--c-line); background: #fff;
  font-size: 1.15em; transition: background var(--t-fast), border-color var(--t-fast);
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
}
.seq-cell.is-on-low { background: var(--c-violet); color: #fff; border-color: #4a30b0; }
.seq-cell.is-on-high { background: var(--c-gold); color: #5a3c00; border-color: #c69a2e; }
.seq-cell.is-play { outline: 4px solid var(--c-turquoise); outline-offset: -1px; }
.seq-cell.is-wrong { border-color: var(--c-coral); box-shadow: 0 0 0 3px rgba(242,109,109,0.35); background:#fff4ec; }
.demo-strip { display: flex; gap: 6px; max-width: 100%; overflow-x: auto; padding: 3px; }
.demo-cell {
  width: clamp(36px, 4.6vw, 52px); height: clamp(36px, 4.6vw, 52px);
  border-radius: 10px; border: 2px solid var(--c-line); background: rgba(255,255,255,0.85);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--fs-small); font-weight: 700; color: var(--c-ink-soft);
}
.demo-cell.is-now { outline: 3px solid var(--c-turquoise); outline-offset: -1px; }
.demo-cell.flash-low { background: var(--c-violet); color: #fff; border-color: #4a30b0; }
.demo-cell.flash-high { background: var(--c-gold); color: #5a3c00; border-color: #c69a2e; }
.pick-col {
  width: clamp(44px, 5.4vw, 60px); height: 44px; border-radius: 10px;
  border: 2px solid var(--c-line); background: #fff; font-weight: 700; padding: 0;
}
.pick-col[aria-pressed="true"] { background: var(--c-turquoise); color: #0F172A; border-color: #0b9296; }
.pick-col.is-wrong { border-color: var(--c-coral); box-shadow: 0 0 0 3px rgba(242,109,109,0.3); }
.ctx-card { text-align: left; width: 100%; }
.ctx-card .ctx-body { display: none; margin-top: 8px; color: var(--c-ink-soft); }
.ctx-card.is-open .ctx-body { display: block; }
.rule-row { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid var(--c-line); }
.rule-mark { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; background: rgba(25,50,77,0.12); color: var(--c-ink-soft); }
.rule-mark.is-ok { background: var(--c-success); color: #0F172A; }
.page .btn { color: #0F172A; text-shadow: none; }
.demo-strip { flex-shrink: 1; }
.rhythm-legend { display: flex; gap: 8px; flex-wrap: wrap; color: var(--c-ink-soft); font-size: var(--fs-small); }
.africa-mission .top-bar { background:linear-gradient(180deg,rgba(42,30,53,.8),rgba(42,30,53,0)); }
.africa-mission .page-body { padding:var(--sp-3) clamp(12px,2.5vw,32px);overflow:hidden; }
/* 배경이 주인공 — 패널은 보드 하나, 진행자는 배경 위에 크게 선다 */
.africa-mission .mission-scene {
  flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) clamp(132px,14vw,240px);
  gap:var(--sp-4);align-items:stretch;
}
.africa-mission .scene-board {
  min-width:0;min-height:0;overflow-y:auto;position:relative;
  padding:var(--sp-4);border-radius:var(--radius-l);
  background:rgba(255,252,240,.9);backdrop-filter:blur(6px);
  border:2px solid rgba(210,169,94,.9);box-shadow:var(--shadow-card);
  display:flex;flex-direction:column;gap:var(--sp-3);
}
.africa-mission .stage-backdrop { position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.16;border-radius:var(--radius-l);pointer-events:none; }
.africa-mission .scene-board > :not(.stage-backdrop) { position:relative;z-index:1; }
.africa-mission .scene-board h2 { color:var(--c-navy);font-size:var(--fs-title); }
.africa-mission .scene-cast {
  display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
  gap:var(--sp-2);min-width:0;overflow:hidden;
}
.africa-mission .cast-hero { width:clamp(120px,14vw,240px);max-height:46%;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(8,18,33,.5)); }
.africa-mission .cast-note { font-size:var(--fs-small);line-height:1.35;color:#fff;text-align:center;text-shadow:0 2px 6px rgba(10,22,40,.95); }
.africa-mission .instrument-gallery { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;width:100%; }
.africa-mission .instrument-pick {
  min-height:48px;padding:2px;border:2px solid rgba(255,255,255,.5);border-radius:11px;
  background:rgba(255,255,255,.16);color:#fff;
}
.africa-mission .instrument-pick img { width:100%;height:clamp(30px,3.4vw,44px);object-fit:contain; }
.africa-mission .instrument-pick[aria-pressed="true"] { border-color:var(--c-gold);background:rgba(242,193,78,.32);box-shadow:0 0 0 2px rgba(242,193,78,.35); }
.africa-mission .instrument-pick span { display:block;font-size:var(--fs-small);font-weight:700;text-shadow:0 1px 3px rgba(10,22,40,.9); }
.africa-mission .emblem-reward { width:clamp(48px,5vw,72px);height:clamp(48px,5vw,72px);object-fit:contain;filter:grayscale(1) opacity(.58); }
.africa-mission .emblem-reward.is-earned { filter:drop-shadow(0 5px 8px rgba(242,193,78,.45)); }
.africa-mission .seq { padding:var(--sp-2);border-radius:var(--radius-m);background:rgba(255,253,244,.9);border:2px solid rgba(90,57,35,.18); }
.africa-mission .seq-cell { border-bottom-width:5px;box-shadow:0 3px 0 rgba(38,44,52,.2); }
.africa-mission .demo-strip { background:rgba(255,253,244,.82);border-radius:12px; }
.africa-mission .africa-context-grid { gap:var(--sp-3)!important; }
.africa-mission .ctx-card { min-height:64px;padding:var(--sp-3);font-size:var(--fs-small); }
.africa-mission .mission-dock { background:linear-gradient(0deg,rgba(37,25,40,.84),rgba(37,25,40,.3)); }
.africa-mission .mission-dock .chip { max-width:48%; }
.africa-mission .mission-dock-actions { margin-left:auto;display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap; }
.africa-mission .compact-feedback .feedback { padding:var(--sp-2) var(--sp-3);font-size:var(--fs-small); }
@media (max-width: 760px), (min-resolution: 1.8dppx) {
  .africa-context-grid { grid-template-columns: 1fr !important; }
}
@media (max-width:900px) {
  .africa-mission .mission-scene { grid-template-columns:minmax(0,1fr) 132px;gap:var(--sp-3); }
  .africa-mission .scene-board { padding:var(--sp-3); }
}
@media (max-height:620px) {
  .africa-mission .cast-hero { max-height:36%; }
  .africa-mission .seq-cell { height:44px; }
  .africa-mission .seq { gap:4px; }
  /* 범례는 행 라벨(★ 고 / ■ 저)이 대신하므로 낮은 화면에서는 접는다 */
  .africa-mission .rhythm-legend { display:none; }
  .africa-mission .demo-cell { width:36px;height:36px; }
  .africa-mission .scene-board { gap:var(--sp-2);padding:var(--sp-3); }
  .africa-mission .feedback { padding:var(--sp-2) var(--sp-3);font-size:var(--fs-small); }
}
`;

function africaImage(id: string, alt = '', className = ''): string {
  if (!hasAsset(id)) return '';
  return `<img src="${assetUrl(id)}" alt="${alt}" ${alt ? '' : 'aria-hidden="true"'} data-asset-id="${id}" class="${className}">`;
}

export function createPage(): Page {
  // 재생 타이머 관리 — unmount 시 전부 정리
  const timers = new Set<number>();
  let playing = false;
  let disposed = false;
  let guide: GuideController | null = null;

  const later = (fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
  };

  const stopAllTimers = (): void => {
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    playing = false;
  };

  /**
   * 8칸 패턴 재생. 소리는 AudioContext 시계에 미리 예약(playBeat when),
   * 시각(칸 점멸)은 타이머로 진행 — 소리가 꺼져 있어도 시각 재생은 항상 동작.
   * 재생 중 재호출은 무시(중복 재생 가드). 반환값: 시작 여부.
   */
  const playSteps = (
    steps: Cell[],
    bpm: number,
    onStep: (i: number, v: Cell) => void,
    onDone?: () => void
  ): boolean => {
    if (playing) return false;
    playing = true;
    const stepMs = (30 / bpm) * 1000; // 8칸 = 여덟 개의 8분음표
    const leadMs = 120;
    steps.forEach((v, i) =>
      later(() => {
        // 오디오도 타이머 시점에 시작해야 장면을 나갈 때 예약된 소리가 남지 않는다.
        if (v === 1) audio.playBeat('low');
        else if (v === 2) audio.playBeat('high');
        onStep(i, v);
      }, leadMs + i * stepMs)
    );
    later(() => {
      playing = false;
      onDone?.();
    }, leadMs + steps.length * stepMs + 150);
    return true;
  };

  return {
    async mount(root: HTMLElement) {
      const content = await loadContent<AfricaContent>('africa');
      await preloadImages([
        'bg.africa',
        'africa.host',
        'africa.stage',
        'africa.emblem',
        'plane.africa',
        ...AFRICA_INSTRUMENTS.map((instrument) => instrument.id)
      ]);
      audio.playBgm('africa');

      // ---- 상태 (체크포인트 복원) ----
      const mission = saveRepo.get().missions.africa;
      let S: AfricaState = {
        stage: 'context',
        viewed: [],
        listens: 0,
        r1: null,
        r2: null,
        r3: null,
        r1PatternId: null,
        r1Draft: toCells([]),
        r1Heard: [],
        r2Selected: [],
        r2Heard: [],
        r3Draft: toCells([]),
        callHeard: false
      };
      if (mission.checkpointId && STAGES.includes(mission.checkpointId as Stage)) {
        const restored = restoreState(mission.data);
        if (restored) {
          S = restored;
          S.stage = mission.checkpointId as Stage;
          showToast('저장된 곳에서 이어서 진행해요.', 'info');
        }
      }
      let finished = false;

      const persist = (): void => {
        saveRepo.setCheckpoint('africa', S.stage, { state: { ...S } });
      };

      // ---- 뼈대 ----
      const page = document.createElement('div');
      page.className = 'page africa-mission';
      page.dataset.assetId = 'bg.africa';
      // 배경 일러스트가 주인공이라 어둡게 덮지 않는다(가독성 최소한만).
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.3), rgba(20,45,80,0.42)), url('${assetUrl('bg.africa')}')`;

      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);

      // 제목은 상단바 리본 한 곳에만. 단계 목표는 그 리본의 부제로 바꿔 쓴다.
      const topBar = buildTopBar({
        title: content.intro.title,
        subtitle: '서아프리카 사례',
        backTo: '#/map',
        steps: { total: STAGES.length, done: 0, now: 0 }
      });
      page.appendChild(topBar);
      const ribbonSub = topBar.querySelector('.ribbon-sub') as HTMLElement;

      const body = document.createElement('div');
      body.className = 'page-body';
      const scene = document.createElement('section');
      scene.className = 'mission-scene';
      scene.setAttribute('aria-label', '아프리카 리듬 공연 장면');
      const panel = document.createElement('div');
      panel.className = 'scene-board africa-board';
      // 진행자·악기·엠블럼은 패널이 아니라 배경 위에 세운다(배경 노출 확보).
      const cast = document.createElement('aside');
      cast.className = 'scene-cast';
      cast.innerHTML = `
        ${africaImage('africa.host', '', 'cast-hero bob')}
        <div class="instrument-gallery" role="group" aria-label="악기 그림 선택">
          ${AFRICA_INSTRUMENTS.map(
            (instrument, index) => `<button class="instrument-pick" data-instrument="${instrument.id}" aria-pressed="${index === 0}">
              ${africaImage(instrument.id, instrument.alt)}<span>${instrument.name}</span>
            </button>`
          ).join('')}
          ${africaImage('africa.emblem', '', 'emblem-reward')}
        </div>
        <p class="cast-note" data-instrument-note>리듬 연습은 젬베 사례로 해요.</p>`;
      scene.append(panel, cast);
      body.appendChild(scene);
      page.appendChild(body);

      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar mission-dock';
      page.appendChild(bottom);
      root.appendChild(page);

      const instrumentNote = cast.querySelector('[data-instrument-note]') as HTMLElement;
      cast.querySelectorAll<HTMLButtonElement>('[data-instrument]').forEach((button) => {
        button.addEventListener('click', () => {
          const id = button.dataset.instrument ?? '';
          const picked = AFRICA_INSTRUMENTS.find((instrument) => instrument.id === id);
          cast.querySelectorAll<HTMLButtonElement>('[data-instrument]').forEach((candidate) =>
            candidate.setAttribute('aria-pressed', String(candidate === button))
          );
          instrumentNote.textContent = picked?.id === 'africa.instrument1'
            ? '젬베로 낮은 소리·높은 소리를 연주해요.'
            : `${picked?.name ?? '악기'} 그림이에요. 연습은 젬베 사례로 해요.`;
          const image = button.querySelector('img');
          if (image) popBounce(image);
          void audio.playSfx('pickup');
        });
      });

      // ---- 마스코트 가이드 (말풍선 안내 + 탭 큐) ----
      const gd = createGuide();
      guide = gd;
      page.appendChild(gd.el);
      let lastSaid = '';
      const say = (text: string, cue: HTMLElement | null): void => {
        if (text !== lastSaid) {
          lastSaid = text;
          gd.say(text, { cue });
        } else {
          gd.setCue(cue); // 같은 문구면 타이핑 재시작 없이 큐만 이동
        }
      };

      const stageIndex = (stage: Stage): number => STAGES.indexOf(stage);

      const setBottom = (hint: string): void => {
        bottom.innerHTML = `<span class="chip mission-status">${hint}</span>`;
      };

      // 단계 진행은 상단바 진행 점이 보여 주므로, 여기서는 엠블럼 획득만 표시한다.
      const updateRewardRail = (): void => {
        cast.querySelector('.emblem-reward')?.classList.toggle('is-earned', (S.r3?.final ?? 0) >= 1);
      };

      // ---- 완료 처리 ----
      const stageRevision = (r: StageResult | null): number => {
        if (!r || r.first < 0) return 0;
        if (r.first >= 1) return 1; // 한 번에 성공
        if (r.final > r.first) return 1; // 재도전으로 개선
        return Math.max(0, r.final); // 개선 없이 마무리 — 부분 인정
      };

      const finish = (): void => {
        if (finished) return;
        finished = true;
        const cardsRatio = Math.min(1, S.viewed.length / Math.max(1, content.contextCards.length));
        const listenRatio = Math.min(1, S.listens / 3);
        const ratios = {
          evidence: 0.5 * cardsRatio + 0.5 * listenRatio,
          perspective: Math.max(0, S.r2?.final ?? 0),
          communication: Math.max(0, S.r3?.final ?? 0),
          revision: (stageRevision(S.r1) + stageRevision(S.r2) + stageRevision(S.r3)) / 3
        };
        const totalRetries = (S.r1?.retries ?? 0) + (S.r2?.retries ?? 0) + (S.r3?.retries ?? 0);
        const speedBonus = Math.max(0, 5 - totalRetries);
        const result = computeScore(
          ratios,
          { evidence: 30, perspective: 25, communication: 25, revision: 15 },
          speedBonus
        );
        completeMissionFlow('africa', '아프리카', result);
      };

      const goStage = (next: Stage): void => {
        S.stage = next;
        persist();
        renderStage();
      };

      // ---- 시퀀서 위젯 ----
      const buildSequencer = (onChange?: () => void) => {
        const cells: Cell[] = [0, 0, 0, 0, 0, 0, 0, 0];
        const el = document.createElement('div');
        el.className = 'seq';
        el.tabIndex = 0;
        el.setAttribute('aria-label', '여덟 칸 리듬 연주판. 숫자키 1부터 8로 각 칸을 쉼, 낮은 소리, 높은 소리 순서로 바꿀 수 있어요.');
        const head = document.createElement('div');
        head.className = 'seq-row';
        head.innerHTML =
          '<span class="seq-label"></span>' +
          Array.from({ length: STEP_COUNT }, (_, i) => `<span class="seq-num">${i + 1}</span>`).join('');
        el.appendChild(head);

        const highBtns: HTMLButtonElement[] = [];
        const lowBtns: HTMLButtonElement[] = [];
        let lastPreviewAt = 0;
        for (const kind of ['high', 'low'] as const) {
          const row = document.createElement('div');
          row.className = 'seq-row';
          const lab = document.createElement('span');
          lab.className = 'seq-label';
          lab.textContent = kind === 'high' ? '★ 고' : '■ 저';
          row.appendChild(lab);
          for (let i = 0; i < STEP_COUNT; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'seq-cell';
            b.setAttribute('aria-label', `${i + 1}번 칸 ${kind === 'high' ? '높은' : '낮은'} 소리`);
            b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', () => {
              const v: Cell = kind === 'high' ? 2 : 1;
              cells[i] = cells[i] === v ? 0 : v;
              clearWrong();
              paint();
              const now = performance.now();
              if (cells[i] === v && now - lastPreviewAt >= 80) {
                lastPreviewAt = now;
                audio.playBeat(kind);
              }
              else void audio.playSfx('tap');
              onChange?.();
            });
            row.appendChild(b);
            (kind === 'high' ? highBtns : lowBtns).push(b);
          }
          el.appendChild(row);
        }

        const paint = (): void => {
          for (let i = 0; i < STEP_COUNT; i++) {
            const v = cells[i] ?? 0;
            const hi = highBtns[i];
            const lo = lowBtns[i];
            if (hi) {
              hi.classList.toggle('is-on-high', v === 2);
              hi.textContent = v === 2 ? '★' : '';
              hi.setAttribute('aria-pressed', String(v === 2));
            }
            if (lo) {
              lo.classList.toggle('is-on-low', v === 1);
              lo.textContent = v === 1 ? '■' : '';
              lo.setAttribute('aria-pressed', String(v === 1));
            }
          }
        };

        const setPlayhead = (i: number | null): void => {
          for (let c = 0; c < STEP_COUNT; c++) {
            highBtns[c]?.classList.toggle('is-play', c === i);
            lowBtns[c]?.classList.toggle('is-play', c === i);
          }
        };

        const setDisabled = (disabled: boolean): void => {
          [...highBtns, ...lowBtns].forEach((button) => (button.disabled = disabled));
        };

        const markWrong = (idx: number[]): void => {
          for (const i of idx) {
            highBtns[i]?.classList.add('is-wrong');
            lowBtns[i]?.classList.add('is-wrong');
          }
        };
        const clearWrong = (): void => {
          [...highBtns, ...lowBtns].forEach((b) => b.classList.remove('is-wrong'));
        };

        el.addEventListener('keydown', (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || highBtns.every((button) => button.disabled)) return;
          const index = Number(event.key) - 1;
          if (!Number.isInteger(index) || index < 0 || index >= STEP_COUNT) return;
          event.preventDefault();
          const current = cells[index] ?? 0;
          const next: Cell = current === 0 ? 1 : current === 1 ? 2 : 0;
          cells[index] = next;
          clearWrong();
          paint();
          if (next === 1) audio.playBeat('low');
          else if (next === 2) audio.playBeat('high');
          else void audio.playSfx('tap');
          onChange?.();
        });

        paint();
        return {
          el,
          get: (): Cell[] => [...cells],
          set: (next: Cell[]): void => {
            for (let i = 0; i < STEP_COUNT; i++) cells[i] = next[i] ?? 0;
            paint();
          },
          setPlayhead,
          setDisabled,
          markWrong,
          clearWrong
        };
      };

      // ---- 듣기 전용 표시줄 (재생 순간에만 칸이 켜져서 박자를 시각화) ----
      const buildDemoStrip = () => {
        const el = document.createElement('div');
        el.className = 'demo-strip';
        el.setAttribute('aria-label', '여덟 칸 시각 박자 표시');
        for (let i = 0; i < STEP_COUNT; i++) {
          const c = document.createElement('span');
          c.className = 'demo-cell';
          c.textContent = String(i + 1);
          el.appendChild(c);
        }
        const cells = Array.from(el.children) as HTMLElement[];
        return {
          el,
          flash(i: number, v: Cell): void {
            cells.forEach((x, index) => {
              x.classList.remove('is-now', 'flash-low', 'flash-high');
              x.textContent = String(index + 1);
              x.removeAttribute('aria-label');
            });
            const c = cells[i];
            if (!c) return;
            c.classList.add('is-now');
            c.textContent = v === 1 ? '■' : v === 2 ? '★' : '쉼';
            c.setAttribute('aria-label', `${i + 1}번 박자: ${v === 1 ? '낮은 소리' : v === 2 ? '높은 소리' : '쉼'}`);
            if (v === 1) c.classList.add('flash-low');
            else if (v === 2) c.classList.add('flash-high');
          },
          reset(): void {
            cells.forEach((x, index) => {
              x.classList.remove('is-now', 'flash-low', 'flash-high');
              x.textContent = String(index + 1);
              x.removeAttribute('aria-label');
            });
          }
        };
      };

      const diffCount = (a: Cell[], b: Cell[]): number => {
        let n = 0;
        for (let i = 0; i < STEP_COUNT; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) n++;
        return n;
      };

      // ================= 단계 렌더링 =================

      const renderStage = (): void => {
        stopAllTimers();
        const idx = stageIndex(S.stage);
        updateSteps(topBar, STAGES.length, idx, idx);
        panel.replaceChildren();
        panel.insertAdjacentHTML('afterbegin', africaImage('africa.stage', '', 'stage-backdrop'));
        ribbonSub.textContent = STAGE_GOAL[S.stage];
        updateRewardRail();
        switch (S.stage) {
          case 'context':
            renderContext();
            break;
          case 'r1':
            renderR1();
            break;
          case 'r2':
            renderR2();
            break;
          case 'r3':
            renderR3();
            break;
        }
      };

      // ---- 1단계: 지역 맥락 + 카드 3장 ----
      const renderContext = (): void => {
        setBottom(STAGE_LABEL.context);
        const intro = document.createElement('div');
        intro.innerHTML = `
          <h2>${content.intro.subtitle}</h2>
          <p class="chip" style="margin-top:var(--sp-2)">아프리카 전체가 아니라 서아프리카 말리·기니 사례예요</p>`;
        panel.appendChild(intro);

        const cardsWrap = document.createElement('div');
        cardsWrap.className = 'africa-context-grid';
        cardsWrap.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-4)';
        const nextBtn = document.createElement('button');
        const cardBtns: Array<{ id: string; el: HTMLElement }> = [];

        const refreshNext = (): void => {
          const all = content.contextCards.every((c) => S.viewed.includes(c.id));
          nextBtn.disabled = !all;
          nextBtn.textContent = all ? '리듬 만들기' : `카드 ${S.viewed.length}/${content.contextCards.length}`;
          const todo = cardBtns.find((cb) => !S.viewed.includes(cb.id));
          if (todo) say('카드 세 장을 먼저 읽어요!', todo.el);
          else say('좋아요! 리듬 만들러 가요!', nextBtn);
        };

        for (const card of content.contextCards) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'card ctx-card';
          const viewed = S.viewed.includes(card.id);
          if (viewed) b.classList.add('is-open');
          b.innerHTML = `
            <div class="row-between">
              <strong style="font-family:var(--font-head);color:var(--c-navy)">${card.title}</strong>
              <span class="rule-mark ${viewed ? 'is-ok' : ''}" data-mark aria-hidden="true">${viewed ? '✓' : '?'}</span>
            </div>
            <p class="ctx-body">${card.body}</p>`;
          b.addEventListener('click', () => {
            void audio.playSfx('tap');
            b.classList.toggle('is-open');
            if (!S.viewed.includes(card.id)) {
              S.viewed.push(card.id);
              const mark = b.querySelector('[data-mark]');
              if (mark) {
                mark.classList.add('is-ok');
                mark.textContent = '✓';
              }
              persist();
              refreshNext();
            }
          });
          cardsWrap.appendChild(b);
          cardBtns.push({ id: card.id, el: b });
        }
        panel.appendChild(cardsWrap);

        nextBtn.className = 'btn btn-primary btn-big';
        nextBtn.style.alignSelf = 'center';
        nextBtn.addEventListener('click', () => {
          if (nextBtn.disabled) return;
          nextBtn.disabled = true;
          goStage('r1');
        });
        refreshNext();
        const dockActions = document.createElement('div');
        dockActions.className = 'mission-dock-actions';
        dockActions.appendChild(nextBtn);
        bottom.appendChild(dockActions);
      };

      // ---- 2단계: 패턴 재구성 (R1) ----
      const renderR1 = (): void => {
        setBottom(STAGE_LABEL.r1);
        const candidates = content.patterns.slice(0, 2);
        const firstPattern = candidates[0];
        if (!firstPattern) return;
        if (!S.r1) S.r1 = { first: -1, final: 0, retries: 0 };
        const r1 = S.r1;
        let chosen: PatternDef = candidates.find((p) => p.id === S.r1PatternId) ?? firstPattern;
        S.r1PatternId = chosen.id;
        let locked = r1.first >= 0; // 첫 확인 후에는 패턴 변경 금지(채점 일관성)

        const head = document.createElement('div');
        head.innerHTML = `<p class="rhythm-legend"><span>■ 낮은 소리</span><span>★ 높은 소리</span><span>다시 누르면 쉼</span></p>`;
        panel.appendChild(head);

        const tabWrap = document.createElement('div');
        tabWrap.style.cssText = 'display:flex;gap:var(--sp-3);flex-wrap:wrap';
        const desc = document.createElement('p');
        desc.className = 'text-lead';
        desc.style.color = 'var(--c-ink-soft)';

        const strip = buildDemoStrip();
        let seq!: ReturnType<typeof buildSequencer>;
        seq = buildSequencer(() => {
          S.r1Draft = seq.get();
          persist();
        });
        seq.set(S.r1Draft);
        const fb = document.createElement('div');
        const checkBtn = document.createElement('button');
        const refreshCheckAvailability = (): void => {
          checkBtn.disabled = !S.r1Heard.includes(chosen.id) || r1.final >= 1;
          checkBtn.textContent = S.r1Heard.includes(chosen.id) ? '확인' : '먼저 듣기';
          if (r1.final >= 1) say('완벽해요! 다음 단계로 가요!', nextBtn);
          else if (S.r1Heard.includes(chosen.id)) say('들은 대로 칸을 눌러 만들고 확인해요!', seq.el);
          else say('듣기를 누르고 똑같이 만들어 봐요!', listenBtn);
        };

        const tabBtns: HTMLButtonElement[] = [];
        candidates.forEach((p, i) => {
          const t = document.createElement('button');
          t.type = 'button';
          t.className = 'btn btn-ghost';
          t.textContent = `${p.name} (${p.bpm} BPM)`;
          t.addEventListener('click', () => {
            if (locked || playing) return;
            void audio.playSfx('tap');
            chosen = candidates[i] ?? chosen;
            S.r1PatternId = chosen.id;
            tabBtns.forEach((x, xi) => x.classList.toggle('is-selected', xi === i));
            desc.textContent = chosen.desc;
            strip.reset();
            persist();
            refreshCheckAvailability();
          });
          if (p.id === chosen.id) t.classList.add('is-selected');
          t.disabled = locked;
          tabBtns.push(t);
          tabWrap.appendChild(t);
        });
        desc.textContent = chosen.desc;
        panel.appendChild(tabWrap);
        panel.appendChild(desc);

        const listenRow = document.createElement('div');
        listenRow.style.cssText = 'display:flex;gap:var(--sp-4);align-items:center;flex-wrap:wrap';
        const listenBtn = document.createElement('button');
        listenBtn.className = 'btn';
        listenBtn.textContent = '▶ 듣기';
        listenBtn.addEventListener('click', () => {
          if (!chosen) return;
          const ok = playSteps(
            toCells(chosen.steps),
            chosen.bpm,
            (i, v) => strip.flash(i, v),
            () => {
              strip.reset();
              listenBtn.disabled = false;
              refreshCheckAvailability();
            }
          );
          if (ok) {
            listenBtn.disabled = true;
            S.listens += 1;
            if (!S.r1Heard.includes(chosen.id)) S.r1Heard.push(chosen.id);
            persist();
            refreshCheckAvailability();
          }
        });
        listenRow.appendChild(listenBtn);
        listenRow.appendChild(strip.el);
        panel.appendChild(listenRow);
        panel.appendChild(seq.el);

        const actions = document.createElement('div');
        actions.className = 'mission-dock-actions';
        const myPlayBtn = document.createElement('button');
        myPlayBtn.className = 'btn btn-ghost';
        myPlayBtn.textContent = '▶ 내 리듬';
        myPlayBtn.addEventListener('click', () => {
          const ok = playSteps(seq.get(), chosen?.bpm ?? 88, (i) => seq.setPlayhead(i), () => seq.setPlayhead(null));
          if (!ok) return;
        });
        actions.appendChild(myPlayBtn);
        checkBtn.className = 'btn btn-primary';
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-success';
        nextBtn.textContent = '다음';
        nextBtn.style.display = 'none';
        nextBtn.addEventListener('click', () => {
          if (nextBtn.disabled) return;
          nextBtn.disabled = true;
          goStage('r2');
        });

        let lastCheckAt = 0;
        checkBtn.addEventListener('click', () => {
          const now = performance.now();
          if (playing || !chosen || checkBtn.disabled || now - lastCheckAt < 250) return;
          lastCheckAt = now;
          locked = true;
          tabBtns.forEach((x) => (x.disabled = true));
          const target = toCells(chosen.steps);
          const mine = seq.get();
          const wrong: number[] = [];
          for (let i = 0; i < STEP_COUNT; i++) if ((mine[i] ?? 0) !== (target[i] ?? 0)) wrong.push(i);
          const acc = (STEP_COUNT - wrong.length) / STEP_COUNT;
          if (r1.first < 0) r1.first = acc;
          else r1.retries += 1;
          r1.final = acc;
          persist();
          if (wrong.length === 0) {
            showFeedback(fb, 'success', '리듬을 똑같이 다시 만들었어요! 잘 듣는 귀가 열렸네요.', 'africa');
            nextBtn.style.display = '';
            seq.setDisabled(true);
            refreshCheckAvailability();
            popBounce(seq.el);
            burstConfetti(nextBtn);
          } else {
            seq.markWrong(wrong);
            const msg = wrong.length <= 2 ? content.feedback.close : content.feedback.listenAgain;
            showFeedback(fb, wrong.length <= 2 ? 'partial' : 'retry', msg, 'africa');
            nextBtn.style.display = '';
            nextBtn.textContent = '이대로 다음';
          }
        });
        if (r1.first >= 0) {
          nextBtn.style.display = '';
          if (r1.final < 1) nextBtn.textContent = '이대로 다음';
          else seq.setDisabled(true);
        }
        refreshCheckAvailability();
        actions.appendChild(checkBtn);
        actions.appendChild(nextBtn);
        bottom.appendChild(actions);
        panel.appendChild(fb);
      };

      // ---- 3단계: 패턴 비교 (R2) ----
      const renderR2 = (): void => {
        setBottom(STAGE_LABEL.r2);
        const pa = content.patterns[2];
        const pb = content.patterns[3];
        if (!pa || !pb) {
          goStage('r3');
          return;
        }
        if (!S.r2) S.r2 = { first: -1, final: 0, retries: 0 };
        const r2 = S.r2;
        const cellsA = toCells(pa.steps);
        const cellsB = toCells(pb.steps);
        const diffs: number[] = [];
        for (let i = 0; i < STEP_COUNT; i++) if ((cellsA[i] ?? 0) !== (cellsB[i] ?? 0)) diffs.push(i);
        const listened = new Set<string>(S.r2Heard.filter((id) => id === pa.id || id === pb.id));

        const head = document.createElement('div');
        head.innerHTML = `
          <p class="text-lead" style="color:var(--c-ink-soft)">${pb.desc}</p>
          <p class="rhythm-legend"><span>■ 낮은 소리</span><span>★ 높은 소리</span><span>칸 모양만 보고도 비교돼요</span></p>`;
        panel.appendChild(head);

        const checkBtn = document.createElement('button');
        const listenBtns: Array<{ key: string; el: HTMLElement }> = [];
        const refreshCheckAvailability = (): void => {
          const heardBoth = listened.has(pa.id) && listened.has(pb.id);
          checkBtn.disabled = !heardBoth || S.r2Selected.length === 0 || r2.final >= 1;
          checkBtn.textContent = heardBoth ? '확인' : `듣기 ${listened.size}/2`;
          if (r2.final >= 1) say('잘 찾았어요! 다음 단계로 가요!', nextBtn);
          else if (heardBoth) say('다르게 들린 칸을 골라 확인을 눌러요!', pickRow);
          else say('두 리듬을 모두 들어 봐요!', (listenBtns.find((lb) => !listened.has(lb.key)) ?? listenBtns[0])?.el ?? null);
        };

        const makeRow = (p: PatternDef, cells: Cell[], key: string) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:var(--sp-4);align-items:center;flex-wrap:wrap';
          const strip = buildDemoStrip();
          const btn = document.createElement('button');
          btn.className = 'btn';
          btn.textContent = `▶ ${p.name}`;
          btn.addEventListener('click', () => {
            const ok = playSteps(cells, p.bpm, (i, v) => strip.flash(i, v), () => {
              strip.reset();
              btn.disabled = false;
            });
            if (ok) {
              btn.disabled = true;
              if (!listened.has(key)) {
                listened.add(key);
                S.r2Heard = [...listened];
                S.listens += 1;
                persist();
              }
              refreshCheckAvailability();
            }
          });
          row.appendChild(btn);
          row.appendChild(strip.el);
          listenBtns.push({ key, el: btn });
          return row;
        };
        panel.appendChild(makeRow(pa, cellsA, pa.id));
        panel.appendChild(makeRow(pb, cellsB, pb.id));

        const pickWrap = document.createElement('div');
        pickWrap.innerHTML = `<p style="font-weight:700;margin-bottom:8px;font-size:var(--fs-small)">다르게 들린 칸을 모두 골라요</p>`;
        const pickRow = document.createElement('div');
        pickRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        pickRow.tabIndex = 0;
        pickRow.setAttribute('aria-label', '다르게 들린 칸 선택. 숫자키 1부터 8로 해당 칸을 선택하거나 취소할 수 있어요.');
        const selected = new Set<number>(S.r2Selected);
        const pickBtns: HTMLButtonElement[] = [];
        for (let i = 0; i < STEP_COUNT; i++) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'pick-col';
          b.textContent = String(i + 1);
          b.setAttribute('aria-label', `${i + 1}번 칸을 다른 박자로 선택`);
          b.setAttribute('aria-pressed', String(selected.has(i)));
          b.addEventListener('click', () => {
            void audio.playSfx('tap');
            b.classList.remove('is-wrong');
            if (selected.has(i)) selected.delete(i);
            else selected.add(i);
            S.r2Selected = [...selected];
            b.setAttribute('aria-pressed', String(selected.has(i)));
            persist();
            refreshCheckAvailability();
          });
          pickBtns.push(b);
          pickRow.appendChild(b);
        }
        pickRow.addEventListener('keydown', (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const index = Number(event.key) - 1;
          if (!Number.isInteger(index) || index < 0 || index >= STEP_COUNT) return;
          event.preventDefault();
          pickBtns[index]?.click();
        });
        pickWrap.appendChild(pickRow);
        panel.appendChild(pickWrap);

        const fb = document.createElement('div');
        const actions = document.createElement('div');
        actions.className = 'mission-dock-actions';
        checkBtn.className = 'btn btn-primary';
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-success';
        nextBtn.textContent = '다음';
        nextBtn.style.display = 'none';
        nextBtn.addEventListener('click', () => {
          if (nextBtn.disabled) return;
          nextBtn.disabled = true;
          goStage('r3');
        });
        let lastCheckAt = 0;
        checkBtn.addEventListener('click', () => {
          const now = performance.now();
          if (playing || checkBtn.disabled || now - lastCheckAt < 250) return;
          lastCheckAt = now;
          let tp = 0;
          let fp = 0;
          selected.forEach((i) => (diffs.includes(i) ? tp++ : fp++));
          const acc = Math.max(0, tp - fp) / Math.max(1, diffs.length);
          if (r2.first < 0) r2.first = acc;
          else r2.retries += 1;
          r2.final = acc;
          persist();
          if (acc >= 1 && selected.size === diffs.length) {
            showFeedback(fb, 'success', '다른 칸을 정확히 찾았어요! 같은 리듬도 두 칸만 바뀌면 느낌이 달라져요.', 'africa');
            checkBtn.disabled = true;
            nextBtn.style.display = '';
            popBounce(pickRow);
            burstConfetti(nextBtn);
          } else {
            pickBtns.forEach((b, i) => b.classList.toggle('is-wrong', selected.has(i) !== diffs.includes(i)));
            showFeedback(fb, acc >= 0.5 ? 'partial' : 'retry', content.feedback.close, 'africa');
            nextBtn.style.display = '';
            nextBtn.textContent = '이대로 다음';
          }
          refreshCheckAvailability();
        });
        if (r2.first >= 0) {
          nextBtn.style.display = '';
          if (r2.final < 1) nextBtn.textContent = '이대로 다음';
        }
        refreshCheckAvailability();
        actions.appendChild(checkBtn);
        actions.appendChild(nextBtn);
        bottom.appendChild(actions);
        panel.appendChild(fb);
      };

      // ---- 4단계: 콜 앤 리스폰스 (R3) ----
      const renderR3 = (): void => {
        setBottom(`${STAGE_LABEL.r3} · 정답은 하나가 아니에요`);
        const cr = content.callResponse;
        const call = toCells(cr.call.steps);
        if (!S.r3) S.r3 = { first: -1, final: 0, retries: 0 };
        const r3 = S.r3;

        const head = document.createElement('div');
        head.innerHTML = `<p class="rhythm-legend"><span>■ 낮은 소리</span><span>★ 높은 소리</span><span>다시 누르면 쉼</span></p>`;
        panel.appendChild(head);

        const strip = buildDemoStrip();
        const callRow = document.createElement('div');
        callRow.style.cssText = 'display:flex;gap:var(--sp-4);align-items:center;flex-wrap:wrap';
        const callBtn = document.createElement('button');
        callBtn.className = 'btn';
        callBtn.textContent = '▶ 호출 듣기';
        let callListened = S.callHeard;
        callBtn.addEventListener('click', () => {
          const ok = playSteps(call, cr.call.bpm, (i, v) => strip.flash(i, v), () => {
            strip.reset();
            callBtn.disabled = false;
          });
          if (ok) {
            callBtn.disabled = true;
            if (!callListened) {
              callListened = true;
              S.callHeard = true;
              S.listens += 1;
              persist();
            }
            refreshCheckAvailability();
          }
        });
        callRow.appendChild(callBtn);
        callRow.appendChild(strip.el);
        panel.appendChild(callRow);

        const ruleList = document.createElement('div');
        ruleList.className = 'card';
        ruleList.innerHTML = cr.rules
          .map(
            (r) => `
          <div class="rule-row" data-rule="${r.check}">
            <span class="rule-mark" aria-hidden="true">■</span>
            <span>${r.text}</span>
          </div>`
          )
          .join('');
        const ruleChip = document.createElement('span');
        ruleChip.className = 'chip';
        ruleChip.textContent = `지킨 규칙 0/${cr.rules.length}`;
        const ruleBtn = document.createElement('button');
        ruleBtn.className = 'btn btn-ghost';
        ruleBtn.textContent = '규칙';
        ruleBtn.addEventListener('click', () => {
          const bodyEl = document.createElement('div');
          bodyEl.appendChild(ruleList);
          openModal({
            id: 'africa-rules',
            title: '리듬 대답 규칙',
            bodyEl,
            actions: [{ label: '닫기', kind: 'primary', autofocus: true, onClick: (close) => close() }]
          });
        });
        const ruleRow = document.createElement('div');
        ruleRow.style.cssText = 'display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap';
        ruleRow.append(ruleChip, ruleBtn);
        panel.appendChild(ruleRow);

        let seq!: ReturnType<typeof buildSequencer>;
        seq = buildSequencer(() => {
          S.r3Draft = seq.get();
          persist();
        });
        seq.set(S.r3Draft);
        panel.appendChild(seq.el);

        const fb = document.createElement('div');
        const actions = document.createElement('div');
        actions.className = 'mission-dock-actions';
        const myPlayBtn = document.createElement('button');
        myPlayBtn.className = 'btn btn-ghost';
        myPlayBtn.textContent = '▶ 내 응답';
        myPlayBtn.addEventListener('click', () => {
          playSteps(seq.get(), cr.call.bpm, (i) => seq.setPlayhead(i), () => seq.setPlayhead(null));
        });
        const exampleBtn = document.createElement('button');
        exampleBtn.className = 'btn btn-ghost';
        exampleBtn.textContent = '▶ 예시';
        exampleBtn.style.display = 'none';
        const exampleStrip = buildDemoStrip();
        exampleStrip.el.style.display = 'none';
        exampleBtn.addEventListener('click', () => {
          const ex = toCells(cr.examples[0]);
          exampleStrip.el.style.display = '';
          playSteps(ex, cr.call.bpm, (i, v) => exampleStrip.flash(i, v), () => exampleStrip.reset());
        });

        const checkBtn = document.createElement('button');
        checkBtn.className = 'btn btn-primary';
        const refreshCheckAvailability = (): void => {
          checkBtn.disabled = !callListened || r3.final >= 1;
          checkBtn.textContent = callListened ? '응답 보내기' : '먼저 듣기';
          if (r3.final >= 1) say('리듬 대화 성공! 미션 완료를 눌러요!', finishBtn);
          else if (callListened) say('규칙 세 개를 지켜 나만의 대답을 만들어요!', seq.el);
          else say('호출 리듬을 먼저 들어 봐요!', callBtn);
        };
        const finishBtn = document.createElement('button');
        finishBtn.className = 'btn btn-success btn-big';
        finishBtn.textContent = '미션 완료';
        finishBtn.style.display = 'none';
        finishBtn.addEventListener('click', () => {
          if (finishBtn.disabled) return;
          finishBtn.disabled = true;
          finish();
        });

        const evalRules = (resp: Cell[]): Record<string, boolean> => {
          const hits = resp.filter((v) => v !== 0).length;
          return {
            min_hits: hits >= 4,
            echo_last_two: (resp[0] ?? 0) === (call[6] ?? 0) && (resp[1] ?? 0) === (call[7] ?? 0),
            contrast: diffCount(resp, call) >= 2
          };
        };

        let lastCheckAt = 0;
        checkBtn.addEventListener('click', () => {
          const now = performance.now();
          if (playing || checkBtn.disabled || now - lastCheckAt < 250) return;
          lastCheckAt = now;
          const resp = seq.get();
          const results = evalRules(resp);
          let met = 0;
          ruleList.querySelectorAll<HTMLElement>('[data-rule]').forEach((row) => {
            const key = row.dataset.rule ?? '';
            const ok = results[key] === true;
            if (ok) met++;
            const mark = row.querySelector('.rule-mark');
            if (mark) {
              mark.classList.toggle('is-ok', ok);
              mark.textContent = ok ? '✓' : '■';
            }
          });
          ruleChip.textContent = `지킨 규칙 ${met}/${cr.rules.length}`;
          const acc = met / Math.max(1, cr.rules.length);
          if (r3.first < 0) r3.first = acc;
          else r3.retries += 1;
          r3.final = acc;
          persist();
          if (met >= cr.rules.length) {
            showFeedback(fb, 'success', content.feedback.good, 'africa');
            seq.setDisabled(true);
            finishBtn.style.display = '';
            refreshCheckAvailability();
            updateRewardRail();
            popBounce(ruleList);
            burstConfetti(finishBtn);
          } else {
            showFeedback(
              fb,
              met >= 2 ? 'partial' : 'retry',
              `규칙 ${met}/${cr.rules.length}개를 지켰어요. 체크리스트에서 ■ 표시된 규칙을 다시 살펴볼까요? 응답을 고쳐서 다시 보내도 좋아요.`,
              'africa'
            );
            exampleBtn.style.display = '';
            finishBtn.style.display = '';
            finishBtn.textContent = '이대로';
          }
        });

        if (r3.first >= 0) {
          finishBtn.style.display = '';
          if (r3.final >= 1) seq.setDisabled(true);
          else {
            exampleBtn.style.display = '';
            finishBtn.textContent = '이대로';
          }
        }
        refreshCheckAvailability();

        actions.appendChild(myPlayBtn);
        actions.appendChild(exampleBtn);
        actions.appendChild(checkBtn);
        actions.appendChild(finishBtn);
        panel.appendChild(exampleStrip.el);
        panel.appendChild(fb);
        bottom.appendChild(actions);
      };

      renderStage();
    },

    unmount() {
      disposed = true;
      stopAllTimers(); // 재생 예약 타이머 전부 정리
      guide?.dispose();
      guide = null;
    }
  };
}
