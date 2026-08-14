import type { Page } from '../router';
import { assetUrl } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { createGuide, type GuideController } from '../ui/guide';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { openModal, type ModalOptions } from '../ui/modal';
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
  let activeModalClose: (() => void) | null = null;
  let guide: GuideController | null = null;

  /** 이 페이지가 연 모달만 추적해 화면 전환 때 남지 않게 한다. */
  const openOwnedModal = (options: ModalOptions): void => {
    if (activeModalClose) return;
    const actions = options.actions?.map((action) => ({
      ...action,
      onClick: (rawClose: () => void) => {
        const close = () => {
          rawClose();
          activeModalClose = null;
        };
        action.onClick(close);
      }
    }));
    const rawClose = openModal({ ...options, actions, dismissible: false });
    activeModalClose = () => {
      rawClose();
      activeModalClose = null;
    };
  };

  return {
    async mount(root: HTMLElement) {
      const c = await loadContent<AsiaContent>('asia');
      if (disposed) return;
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
      page.className = 'page';
      page.style.setProperty('--fs-small', '1rem');
      page.style.backgroundImage = `linear-gradient(rgba(15,30,50,0.55), rgba(15,30,50,0.62)), url('${assetUrl('bg.asia')}')`;
      const bar = buildTopBar({
        title: c.intro.title,
        subtitle: c.intro.subtitle,
        backTo: '#/map',
        steps: { total: 3, done: round - 1, now: round - 1 }
      });
      page.appendChild(bar);
      const body = document.createElement('div');
      body.className = 'page-body';
      body.style.overflowY = 'auto';
      page.appendChild(body);
      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      bottom.style.flexWrap = 'wrap';
      page.appendChild(bottom);
      root.appendChild(page);

      // ---- 마스코트 가이드 (말풍선 안내 + 탭 큐) ----
      const gd = createGuide();
      guide = gd;
      page.appendChild(gd.el);
      body.style.paddingBottom = '150px'; // 가이드가 하단 콘텐츠를 가려도 스크롤로 피할 수 있게
      let lastSaid = '';
      const say = (text: string, cue: HTMLElement | null): void => {
        if (text !== lastSaid) {
          lastSaid = text;
          gd.say(text, { cue });
        } else {
          gd.setCue(cue); // 같은 문구면 타이핑 재시작 없이 큐만 이동
        }
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
        completeMissionFlow('asia', '아시아', result);
      };

      // ================= 1라운드: 타임라인 =================
      function renderRound1(): void {
        const r1 = c.round1_timeline;
        if (!observationDone) {
          updateSteps(bar, 3, 0, 0);
          body.replaceChildren();
          body.appendChild(
            el(`<div class="panel" style="padding:var(--sp-3) var(--sp-4);font-size:1rem">
              <strong style="color:var(--c-navy)">미나네 가족의 하루 기록 여섯 개를 하나씩 관찰해요</strong>
            </div>`)
          );
          const observationGrid = el(
            `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--sp-3);margin-top:var(--sp-3)"></div>`
          );
          body.appendChild(observationGrid);

          bottom.replaceChildren();
          const observationStatus = el(
            `<span class="chip" role="status" aria-live="polite">1단계 · 생활 자료 관찰 (${observed.size}/${r1.items.length})</span>`
          );
          const timelineBtn = el(`<button class="btn btn-primary btn-big" disabled>타임라인 만들기</button>`) as HTMLButtonElement;
          bottom.append(observationStatus, timelineBtn);

          const paintObservation = () => {
            observationStatus.textContent = `1단계 · 생활 자료 관찰 (${observed.size}/${r1.items.length})`;
            timelineBtn.disabled = observed.size < r1.items.length;
            observationGrid.replaceChildren();
            let firstTodo: HTMLElement | null = null;
            for (const item of r1.items) {
              const seen = observed.has(item.id);
              const card = el(`<button class="card card-pick" aria-pressed="${seen}" style="text-align:left;font:inherit;display:flex;flex-direction:column;gap:6px;padding:var(--sp-4);min-height:var(--touch-min)">
                <span class="row-between" style="flex-wrap:wrap">
                  <strong style="color:var(--c-navy)">${item.label}</strong>
                  <span class="chip">${seen ? '✓ 관찰함' : '○ 관찰 전'}</span>
                </span>
                <span style="font-size:1rem;color:var(--c-ink-soft)">시간 단서: ${item.timeHint}</span>
                <span style="font-size:1rem;color:var(--c-ink-soft)">눌러서 생활 기록을 자세히 읽어 보세요.</span>
              </button>`);
              card.addEventListener('click', () => {
                if (finished) return;
                const detail = el(`<div style="display:flex;flex-direction:column;gap:var(--sp-3)">
                  <p class="chip" style="align-self:flex-start;font-size:1rem">시간 단서 · ${item.timeHint}</p>
                  <p style="line-height:1.65">${item.desc}</p>
                  <p style="font-size:1rem;color:var(--c-ink-soft)">이 기록은 미나네 가족의 한 사례예요. 네팔의 모든 어린이가 같은 하루를 보낸다고 단정하지 않아요.</p>
                </div>`);
                openOwnedModal({
                  id: `asia-observe-${item.id}`,
                  title: item.label,
                  bodyEl: detail,
                  actions: [
                    {
                      label: seen ? '다시 확인했어요' : '관찰했어요',
                      kind: 'primary',
                      autofocus: true,
                      onClick: (close) => {
                        observed.add(item.id);
                        persistAsiaCheckpoint('observe');
                        close();
                        paintObservation();
                      }
                    }
                  ]
                });
              });
              observationGrid.appendChild(card);
              if (!seen && !firstTodo) firstTodo = card;
            }
            if (observed.size >= r1.items.length) say('모두 관찰했어요! 타임라인 만들기를 눌러요!', timelineBtn);
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

        body.replaceChildren();
        body.appendChild(
          el(`<div class="panel" style="padding:var(--sp-3) var(--sp-4);font-size:1rem">
            <strong style="color:var(--c-navy)">관찰한 기록 카드를 시간 순서대로 놓아요</strong>
          </div>`)
        );
        const slotsWrap = el(
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:var(--sp-2);margin-top:var(--sp-3)"></div>`
        );
        body.appendChild(slotsWrap);
        const trayLabel = el(
          `<p class="chip" style="margin-top:var(--sp-3)">카드를 끌거나, 고른 뒤 자리를 눌러요. 다시 누르면 돌아와요.</p>`
        );
        body.appendChild(trayLabel);
        const tray = el(
          `<div class="drop-zone" style="margin-top:var(--sp-2);padding:8px;display:flex;gap:8px;flex-wrap:wrap;min-height:96px" aria-label="카드 보관함"></div>`
        );
        body.appendChild(tray);
        const fb = el(`<div style="margin-top:var(--sp-3)"></div>`);
        body.appendChild(fb);

        bottom.replaceChildren();
        const status = el(`<span class="chip">1단계 · 관찰한 하루를 시간 순서로 놓기</span>`);
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const checkBtn = el(`<button class="btn btn-primary btn-big" disabled>확인</button>`) as HTMLButtonElement;
        const nextBtn = el(`<button class="btn btn-success btn-big" style="display:none">다음 단계로</button>`) as HTMLButtonElement;
        btns.append(checkBtn, nextBtn);
        bottom.append(status, btns);

        const cardOf = (it: TimelineItem, isLocked: boolean): HTMLElement =>
          el(`<div class="card" data-item-id="${it.id}" style="padding:8px;display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;${
            isLocked ? 'border-color:var(--c-success);cursor:default;' : ''
          }">
            <strong style="font-size:1rem">${isLocked ? '✓ ' : ''}${it.label}</strong>
            <span style="font-size:1rem;color:var(--c-ink-soft)">${it.timeHint}</span>
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
          paint();
        };

        const paint = () => {
          slotsWrap.replaceChildren();
          const zoneEls: HTMLElement[] = [];
          const itemEls: HTMLElement[] = [];
          r1.slots.forEach((slotLabel, i) => {
            const wrap = el(`<div style="display:flex;flex-direction:column;gap:4px;min-width:0"></div>`);
            wrap.appendChild(el(`<span class="chip" style="justify-content:center">${slotLabel}</span>`));
            const zone = el(
              `<div class="drop-zone" data-zone-id="slot-${i}" style="min-height:88px;padding:4px;display:flex" aria-label="${slotLabel} 자리"></div>`
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
            cardEl.style.flex = '0 1 150px';
            tray.appendChild(cardEl);
            itemEls.push(cardEl);
          }
          if (!ctrl) ctrl = enablePickPlace({ items: itemEls, zones: zoneEls, canPlace: (id) => !locked.has(id), onPlace });
          else ctrl.refresh(itemEls, zoneEls);
          checkBtn.disabled = solvedRound || slots.some((s) => s === null);
          if (solvedRound) say('완벽해요! 다음 단계로 가요!', nextBtn);
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

        body.replaceChildren();
        body.appendChild(
          el(`<div class="panel" style="padding:var(--sp-3) var(--sp-4);font-size:1rem"><strong style="color:var(--c-navy)">문장 카드가 사실인지, 해석인지 나눠요</strong></div>`)
        );
        const catWrap = el(
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:var(--sp-2);margin-top:var(--sp-3)"></div>`
        );
        body.appendChild(catWrap);
        body.appendChild(
          el(`<p class="chip" style="margin-top:var(--sp-3)">카드를 끌거나, 고른 뒤 칸을 눌러요. 다시 누르면 돌아와요.</p>`)
        );
        const tray = el(
          `<div class="drop-zone" style="margin-top:var(--sp-2);padding:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;min-height:80px" aria-label="문장 보관함"></div>`
        );
        body.appendChild(tray);
        const fb = el(`<div style="margin-top:var(--sp-3)"></div>`);
        body.appendChild(fb);
        const review = el(`<div></div>`);
        body.appendChild(review);

        bottom.replaceChildren();
        const status = el(`<span class="chip">2단계 · 사실 · 해석 · 확인 필요 나누기</span>`);
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const checkBtn = el(`<button class="btn btn-primary btn-big" disabled>확인</button>`) as HTMLButtonElement;
        const nextBtn = el(`<button class="btn btn-success btn-big" style="display:none">다음 단계로</button>`) as HTMLButtonElement;
        btns.append(checkBtn, nextBtn);
        bottom.append(status, btns);

        const stCard = (st: Statement, isLocked: boolean): HTMLElement =>
          el(`<div class="card" data-item-id="${st.id}" style="padding:8px;font-size:1rem;line-height:1.5;${
            isLocked ? 'border-color:var(--c-success);cursor:default;' : ''
          }">${isLocked ? '✓ ' : ''}${st.text}</div>`);

        const onPlace = (itemId: string, zoneId: string) => {
          if (solvedRound || locked.has(itemId)) return;
          if (placed.get(itemId) === zoneId) placed.delete(itemId); // 놓인 카드를 다시 탭 → 보관함으로
          else placed.set(itemId, zoneId);
          paint();
        };

        const paint = () => {
          catWrap.replaceChildren();
          const zoneEls: HTMLElement[] = [];
          const itemEls: HTMLElement[] = [];
          for (const cat of r2.categories) {
            const zone = el(
              `<div class="drop-zone" data-zone-id="${cat.id}" style="padding:8px;display:flex;flex-direction:column;gap:6px;min-height:150px" aria-label="${cat.label}"></div>`
            );
            zone.appendChild(el(`<span class="chip" style="align-self:center">${cat.label}</span>`));
            for (const st of r2.statements) {
              if (placed.get(st.id) !== cat.id) continue;
              const isLocked = locked.has(st.id);
              const cardEl = stCard(st, isLocked);
              zone.appendChild(cardEl);
              if (!isLocked && !solvedRound) itemEls.push(cardEl);
            }
            catWrap.appendChild(zone);
            zoneEls.push(zone);
          }
          tray.replaceChildren();
          for (const st of r2.statements) {
            if (placed.has(st.id)) continue;
            const cardEl = stCard(st, false);
            tray.appendChild(cardEl);
            itemEls.push(cardEl);
          }
          if (!ctrl) ctrl = enablePickPlace({ items: itemEls, zones: zoneEls, canPlace: (id) => !locked.has(id), onPlace });
          else ctrl.refresh(itemEls, zoneEls);
          checkBtn.disabled = solvedRound || placed.size < r2.statements.length;
          if (solvedRound) say('완벽해요! 다음 단계로 가요!', nextBtn);
          else if (!checkBtn.disabled) say('다 나눴으면 확인을 눌러요!', checkBtn);
          else say('문장을 세 바구니로 나눠 봐요!', tray.querySelector<HTMLElement>('.card'));
        };

        const renderReview = () => {
          const rows = r2.statements
            .map((st) => {
              const ok = locked.has(st.id);
              return `<div style="border-left:4px solid ${ok ? 'var(--c-success)' : 'var(--c-warning)'};padding:6px 10px;background:${
                ok ? '#e8f7f0' : '#fdf3e0'
              };border-radius:6px">
                <strong style="font-size:1rem">${ok ? '✓ 맞음' : '◐ 다시 생각'}</strong>
                <p style="font-size:1rem;margin:2px 0 0">${st.text}</p>
                <p style="font-size:1rem;color:var(--c-ink-soft);margin:2px 0 0">${st.why}</p>
              </div>`;
            })
            .join('');
          review.innerHTML = `<div class="panel" role="status" aria-live="polite" style="display:flex;flex-direction:column;gap:8px;margin-top:var(--sp-3)">
            <h3 style="color:var(--c-navy)">결과 리뷰</h3>${rows}
          </div>`;
        };

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
            renderReview();
            if (correct === total) {
              solvedRound = true;
              showFeedback(fb, 'success', R2_MSG.perfect, 'asia');
              checkBtn.style.display = 'none';
              nextBtn.style.display = '';
            } else {
              imperfect++;
              // 오분류 카드만 트레이로 되돌린다
              for (const st of r2.statements) if (!locked.has(st.id)) placed.delete(st.id);
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

        body.replaceChildren();
        body.appendChild(
          el(`<div class="panel" style="padding:var(--sp-3) var(--sp-4);font-size:1rem"><strong style="color:var(--c-navy)">조각 세 개를 골라 미나에게 물어볼 질문을 만들어요</strong></div>`)
        );
        const preview = el(`<div class="panel" role="status" aria-live="polite" style="margin-top:var(--sp-3);padding:var(--sp-4);text-align:center">
          <p style="font-size:1rem;color:var(--c-ink-soft);margin-bottom:6px">내가 만드는 질문</p>
          <p id="q-preview" style="font-family:var(--font-head);font-size:var(--fs-title);color:var(--c-navy);min-height:1.4em"></p>
        </div>`);
        body.appendChild(preview);
        const previewText = preview.querySelector('#q-preview') as HTMLElement;

        const cols = el(
          `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:var(--sp-3);margin-top:var(--sp-3)"></div>`
        );
        body.appendChild(cols);
        const fb = el(`<div style="margin-top:var(--sp-3)"></div>`);
        body.appendChild(fb);
        const badPanel = el(`<div style="display:none;margin-top:var(--sp-3)"></div>`);
        badPanel.innerHTML = `<div class="panel" style="display:flex;flex-direction:column;gap:8px">
          <h3 style="color:var(--c-navy)">이런 질문은 조심해요</h3>
          ${r3.badPatterns
            .map(
              (b) => `<div style="border-left:4px solid var(--c-coral);padding:6px 10px;background:#fdeeee;border-radius:6px">
                <p style="font-size:1rem;font-weight:700">${b.pattern}</p>
                <p style="font-size:1rem;color:var(--c-ink-soft);margin-top:2px">${b.why}</p>
              </div>`
            )
            .join('')}
        </div>`;
        body.appendChild(badPanel);

        bottom.replaceChildren();
        const status = el(`<span class="chip">3단계 · 미나에게 물어볼 질문 만들기</span>`);
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const submitBtn = el(`<button class="btn btn-primary btn-big" disabled>질문 완성</button>`) as HTMLButtonElement;
        const partialBtn = el(`<button class="btn btn-ghost" style="display:none">이대로 완성</button>`) as HTMLButtonElement;
        const finishBtn = el(`<button class="btn btn-success btn-big" style="display:none">미션 완료</button>`) as HTMLButtonElement;
        btns.append(partialBtn, submitBtn, finishBtn);
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
          else if (!submitBtn.disabled && lastSubmissionKey === null) say('질문이 되면 완성 버튼을 눌러요!', submitBtn);
          else if (lastSubmissionKey !== null) say('조각을 바꿔 질문을 다듬어 봐요!', firstFragment);
          else say('조각을 골라 존중하는 질문을 만들어요!', firstFragment);
        };

        for (const g of groups) {
          const col = el(`<div style="display:flex;flex-direction:column;gap:8px;min-width:0"></div>`);
          col.appendChild(el(`<span class="chip" style="align-self:center">${g.label}</span>`));
          for (const text of g.list) {
            const b = el(
              `<button class="card card-pick" aria-pressed="false" style="text-align:left;font:inherit;font-size:1rem;padding:10px;min-height:var(--touch-min)">${text}</button>`
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
              badPanel.style.display = 'none';
              submitBtn.style.display = 'none';
              partialBtn.style.display = 'none';
              finishBtn.style.display = '';
            } else {
              // 조각 자체는 존중 표현이라 badPatterns 미포함 → 부분 인정 + 다듬을 기회
              if (!hadPartial) {
                hadPartial = true;
                imperfect++;
              }
              quality = Math.max(quality, 0.75);
              showFeedback(fb, 'partial', r3.feedback.retry, 'asia');
              badPanel.style.display = '';
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
          badPanel.style.display = '';
          partialBtn.style.display = '';
        }
        updatePreview();
      }

      startRound();
    },

    unmount() {
      disposed = true;
      ctrl?.dispose();
      ctrl = null;
      guide?.dispose();
      guide = null;
      activeModalClose?.();
      activeModalClose = null;
    }
  };
}
