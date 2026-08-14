import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { createGuide, type GuideController } from '../ui/guide';
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

const STAGE_LABEL: Record<Stage, string> = {
  context: '1단계 · 리듬 알아보기',
  r1: '2단계 · 리듬 다시 만들기',
  r2: '3단계 · 다른 칸 찾기',
  r3: '4단계 · 리듬으로 대답하기'
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
.seq { display: flex; flex-direction: column; gap: 6px; }
.seq-row { display: flex; gap: 8px; align-items: center; }
.seq-label { width: 108px; flex-shrink: 0; font-weight: 700; font-size: var(--fs-small); text-align: right; padding-right: 4px; }
.seq-num { width: clamp(44px, 5.4vw, 60px); text-align: center; font-size: var(--fs-small); color: var(--c-ink-soft); font-weight: 700; }
.seq-cell {
  width: clamp(44px, 5.4vw, 60px); height: clamp(44px, 5.4vw, 60px);
  border-radius: 12px; border: 2px solid var(--c-line); background: #fff;
  font-size: 1.15em; transition: background var(--t-fast), border-color var(--t-fast);
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
}
.seq-cell.is-on-low { background: var(--c-violet); color: #fff; border-color: #4a30b0; }
.seq-cell.is-on-high { background: var(--c-gold); color: #5a3c00; border-color: #c69a2e; }
.seq-cell.is-play { outline: 4px solid var(--c-turquoise); outline-offset: -1px; }
.seq-cell.is-wrong { border-color: var(--c-coral); box-shadow: 0 0 0 3px rgba(242,109,109,0.35); animation: seq-blink 700ms ease-in-out 3; }
@keyframes seq-blink { 50% { background: #fdeeee; } }
:root[data-reduced-motion="true"] .seq-cell.is-wrong { animation: none; }
@media (prefers-reduced-motion: reduce) { .seq-cell.is-wrong { animation: none; } }
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
.rule-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--c-line); }
.rule-mark { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; background: rgba(25,50,77,0.12); color: var(--c-ink-soft); }
.rule-mark.is-ok { background: var(--c-success); color: #0F172A; }
.page .btn { color: #0F172A; text-shadow: none; }
.seq-scroll { max-width: 100%; overflow-x: auto; padding: 4px 4px 10px; }
.seq-cell, .seq-num { flex-shrink: 0; }
.rhythm-legend { display: flex; gap: 8px; flex-wrap: wrap; color: var(--c-ink-soft); font-size: var(--fs-small); }
@media (max-width: 760px), (min-resolution: 1.8dppx) {
  .africa-context-grid { grid-template-columns: 1fr !important; }
  .seq-label { width: 94px; }
}
`;

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
      await preloadImages(['bg.africa', 'africa.host', 'africa.instrument1']);
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
      page.className = 'page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.45), rgba(20,45,80,0.6)), url('${assetUrl('bg.africa')}')`;

      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);

      const topBar = buildTopBar({
        title: content.intro.title,
        subtitle: '서아프리카 사례',
        backTo: '#/map',
        steps: { total: STAGES.length, done: 0, now: 0 }
      });
      page.appendChild(topBar);

      const body = document.createElement('div');
      body.className = 'page-body';
      const panel = document.createElement('div');
      panel.className = 'panel';
      panel.style.cssText = 'flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:var(--sp-4)';
      body.appendChild(panel);
      page.appendChild(body);

      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      page.appendChild(bottom);
      root.appendChild(page);

      // ---- 마스코트 가이드 (말풍선 안내 + 탭 큐) ----
      const gd = createGuide();
      guide = gd;
      page.appendChild(gd.el);
      panel.style.paddingBottom = '150px'; // 가이드가 하단 콘텐츠를 가려도 스크롤로 피할 수 있게
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
        bottom.innerHTML = `<span class="chip">${hint}</span>`;
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
        el.className = 'seq seq-scroll';
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
          lab.textContent = kind === 'high' ? '높은 소리 ★' : '낮은 소리 ■';
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
        const hostImg = hasAsset('africa.host')
          ? `<img src="${assetUrl('africa.host')}" alt="" aria-hidden="true" style="width:96px;flex-shrink:0" class="bob">`
          : '';
        const intro = document.createElement('div');
        intro.innerHTML = `
          <div style="display:flex;gap:var(--sp-4);align-items:flex-start">
            ${hostImg}
            <div>
              <h2 style="color:var(--c-navy)">${content.intro.subtitle}</h2>
              <p class="chip" style="margin:8px 0">이번 미션은 아프리카 전체가 아니라 서아프리카 말리·기니 지역의 사례를 다뤄요</p>
              <p style="color:var(--c-ink-soft)">젬베 리듬으로 '리듬 대화'를 직접 만들어 볼 거예요.</p>
            </div>
          </div>`;
        panel.appendChild(intro);

        const cardsWrap = document.createElement('div');
        cardsWrap.className = 'africa-context-grid';
        cardsWrap.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-4)';
        const nextBtn = document.createElement('button');
        const cardBtns: Array<{ id: string; el: HTMLElement }> = [];

        const refreshNext = (): void => {
          const all = content.contextCards.every((c) => S.viewed.includes(c.id));
          nextBtn.disabled = !all;
          nextBtn.textContent = all
            ? '리듬 만들러 가기 ▶'
            : `카드 ${S.viewed.length}/${content.contextCards.length} 읽는 중`;
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
        panel.appendChild(nextBtn);
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
        head.innerHTML = `
          <h2 style="color:var(--c-navy)">들은 리듬을 여덟 칸에 다시 만들어요</h2>
          <p class="rhythm-legend"><span>■ 낮은 소리</span><span>★ 높은 소리</span><span>같은 버튼을 다시 누르면 쉼</span></p>`;
        panel.appendChild(head);

        const tabWrap = document.createElement('div');
        tabWrap.style.cssText = 'display:flex;gap:var(--sp-3);flex-wrap:wrap';
        const desc = document.createElement('p');
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
          checkBtn.textContent = S.r1Heard.includes(chosen.id) ? '확인하기' : '먼저 리듬 재생하기';
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
        listenBtn.textContent = '▶ 리듬 듣기';
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
        actions.style.cssText = 'display:flex;gap:var(--sp-3);align-items:center;flex-wrap:wrap';
        const myPlayBtn = document.createElement('button');
        myPlayBtn.className = 'btn btn-ghost';
        myPlayBtn.textContent = '▶ 내 리듬 들어보기';
        myPlayBtn.addEventListener('click', () => {
          const ok = playSteps(seq.get(), chosen?.bpm ?? 88, (i) => seq.setPlayhead(i), () => seq.setPlayhead(null));
          if (!ok) return;
        });
        checkBtn.className = 'btn btn-primary';
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-success';
        nextBtn.textContent = '다음 단계 ▶';
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
          } else {
            seq.markWrong(wrong);
            const msg = wrong.length <= 2 ? content.feedback.close : content.feedback.listenAgain;
            showFeedback(fb, wrong.length <= 2 ? 'partial' : 'retry', msg, 'africa');
            nextBtn.style.display = '';
            nextBtn.textContent = '이대로 다음 단계 ▶';
          }
        });
        if (r1.first >= 0) {
          nextBtn.style.display = '';
          if (r1.final < 1) nextBtn.textContent = '이대로 다음 단계 ▶';
          else seq.setDisabled(true);
        }
        refreshCheckAvailability();
        actions.appendChild(myPlayBtn);
        actions.appendChild(checkBtn);
        actions.appendChild(nextBtn);
        panel.appendChild(actions);
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
          <h2 style="color:var(--c-navy)">두 물결 리듬, 어디가 다를까요?</h2>
          <p style="color:var(--c-ink-soft)">${pb.desc}</p>
          <p class="rhythm-legend"><span>■ 낮은 소리</span><span>★ 높은 소리</span><span>빛이 켜진 칸의 모양만 보고도 비교할 수 있어요</span></p>`;
        panel.appendChild(head);

        const checkBtn = document.createElement('button');
        const listenBtns: Array<{ key: string; el: HTMLElement }> = [];
        const refreshCheckAvailability = (): void => {
          const heardBoth = listened.has(pa.id) && listened.has(pb.id);
          checkBtn.disabled = !heardBoth || S.r2Selected.length === 0 || r2.final >= 1;
          checkBtn.textContent = heardBoth ? '확인하기' : `두 리듬 듣기 ${listened.size}/2`;
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
          btn.textContent = `▶ ${p.name} 듣기`;
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
        pickWrap.innerHTML = `<p style="font-weight:700;margin-bottom:8px">다르게 들린 칸을 모두 골라 주세요 (여러 개 가능)</p>`;
        const pickRow = document.createElement('div');
        pickRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
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
        pickWrap.appendChild(pickRow);
        panel.appendChild(pickWrap);

        const fb = document.createElement('div');
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:var(--sp-3);flex-wrap:wrap';
        checkBtn.className = 'btn btn-primary';
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-success';
        nextBtn.textContent = '다음 단계 ▶';
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
          } else {
            pickBtns.forEach((b, i) => b.classList.toggle('is-wrong', selected.has(i) !== diffs.includes(i)));
            showFeedback(fb, acc >= 0.5 ? 'partial' : 'retry', content.feedback.close, 'africa');
            nextBtn.style.display = '';
            nextBtn.textContent = '이대로 다음 단계 ▶';
          }
          refreshCheckAvailability();
        });
        if (r2.first >= 0) {
          nextBtn.style.display = '';
          if (r2.final < 1) nextBtn.textContent = '이대로 다음 단계 ▶';
        }
        refreshCheckAvailability();
        actions.appendChild(checkBtn);
        actions.appendChild(nextBtn);
        panel.appendChild(actions);
        panel.appendChild(fb);
      };

      // ---- 4단계: 콜 앤 리스폰스 (R3) ----
      const renderR3 = (): void => {
        setBottom(`${STAGE_LABEL.r3} — 정답은 하나가 아니에요`);
        const cr = content.callResponse;
        const call = toCells(cr.call.steps);
        if (!S.r3) S.r3 = { first: -1, final: 0, retries: 0 };
        const r3 = S.r3;

        const head = document.createElement('div');
        head.innerHTML = `
          <h2 style="color:var(--c-navy)">리듬으로 대답해요</h2>
          <p class="rhythm-legend"><span>■ 낮은 소리</span><span>★ 높은 소리</span><span>같은 버튼을 다시 누르면 쉼</span></p>`;
        panel.appendChild(head);

        const strip = buildDemoStrip();
        const callRow = document.createElement('div');
        callRow.style.cssText = 'display:flex;gap:var(--sp-4);align-items:center;flex-wrap:wrap';
        const callBtn = document.createElement('button');
        callBtn.className = 'btn';
        callBtn.textContent = '▶ 호출 리듬 듣기';
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
        panel.appendChild(ruleList);

        let seq!: ReturnType<typeof buildSequencer>;
        seq = buildSequencer(() => {
          S.r3Draft = seq.get();
          persist();
        });
        seq.set(S.r3Draft);
        panel.appendChild(seq.el);

        const fb = document.createElement('div');
        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:var(--sp-3);flex-wrap:wrap;align-items:center';
        const myPlayBtn = document.createElement('button');
        myPlayBtn.className = 'btn btn-ghost';
        myPlayBtn.textContent = '▶ 내 응답 들어보기';
        myPlayBtn.addEventListener('click', () => {
          playSteps(seq.get(), cr.call.bpm, (i) => seq.setPlayhead(i), () => seq.setPlayhead(null));
        });
        const exampleBtn = document.createElement('button');
        exampleBtn.className = 'btn btn-ghost';
        exampleBtn.textContent = '▶ 예시 응답 듣기';
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
          checkBtn.textContent = callListened ? '응답 보내기' : '먼저 호출 리듬 재생하기';
          if (r3.final >= 1) say('리듬 대화 성공! 미션 완료를 눌러요!', finishBtn);
          else if (callListened) say('규칙 세 개를 지켜 나만의 대답을 만들어요!', seq.el);
          else say('호출 리듬을 먼저 들어 봐요!', callBtn);
        };
        const finishBtn = document.createElement('button');
        finishBtn.className = 'btn btn-success btn-big';
        finishBtn.textContent = '미션 완료하기';
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
          const acc = met / Math.max(1, cr.rules.length);
          if (r3.first < 0) r3.first = acc;
          else r3.retries += 1;
          r3.final = acc;
          persist();
          if (met >= cr.rules.length) {
            showFeedback(fb, 'success', content.feedback.good, 'africa');
            seq.setDisabled(true);
            refreshCheckAvailability();
            finishBtn.style.display = '';
          } else {
            showFeedback(
              fb,
              met >= 2 ? 'partial' : 'retry',
              `규칙 ${met}/${cr.rules.length}개를 지켰어요. 체크리스트에서 ■ 표시된 규칙을 다시 살펴볼까요? 응답을 고쳐서 다시 보내도 좋아요.`,
              'africa'
            );
            exampleBtn.style.display = '';
            finishBtn.style.display = '';
            finishBtn.textContent = '이대로 마치기';
          }
        });

        if (r3.first >= 0) {
          finishBtn.style.display = '';
          if (r3.final >= 1) seq.setDisabled(true);
          else {
            exampleBtn.style.display = '';
            finishBtn.textContent = '이대로 마치기';
          }
        }
        refreshCheckAvailability();

        actions.appendChild(myPlayBtn);
        actions.appendChild(exampleBtn);
        actions.appendChild(checkBtn);
        actions.appendChild(finishBtn);
        panel.appendChild(actions);
        panel.appendChild(exampleStrip.el);
        panel.appendChild(fb);
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
