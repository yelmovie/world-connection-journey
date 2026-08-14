import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { createGuide, type GuideController } from '../ui/guide';
import { openModal } from '../ui/modal';
import { showToast } from '../ui/toast';

/* ===== 콘텐츠 스키마 (public/content/v1/ko/oceania.json 기준) ===== */
interface Hotspot {
  id: string;
  name: string;
  x: number;
  y: number;
  issue: string;
  cause: string;
  effect: string;
}
interface Perspective {
  id: string;
  role: string;
  name: string;
  quote: string;
  concern: string;
}
type MetricKey = 'eco' | 'community' | 'economy' | 'culture';
type Metrics = Record<MetricKey, number>;
interface OceaniaContent {
  intro: { title: string; subtitle: string; guide: string };
  hotspots: Hotspot[];
  perspectives: Perspective[];
  sim: {
    controls: Record<string, string[]>;
    effects: Record<string, Record<string, Partial<Metrics>>>;
    turns: number;
    turnLabels: string[];
    thresholds: { good: number; warn: number };
  };
  feedback: { collapse: string; balanced: string; tradeoffNote: string };
}

const METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: 'eco', label: '환경', color: 'var(--c-success)' },
  { key: 'community', label: '공동체', color: 'var(--c-violet)' },
  { key: 'economy', label: '자원·경제', color: 'var(--c-gold)' },
  { key: 'culture', label: '문화', color: 'var(--c-turquoise)' }
];
const CONTROL_LABELS: Record<string, string> = {
  tourism: '관광객 수',
  protection: '바다 보호구역',
  transport: '섬 안 이동수단'
};
const PERSPECTIVE_IMG: Record<string, string> = {
  youth_moana: 'oceania.youth',
  researcher_kim: 'oceania.researcher',
  fisher_rau: 'oceania.fisher',
  visitor_dana: 'oceania.visitor'
};
const START_VALUE = 50;
const COLLAPSE_LINE = 35;

/* ===== 저장 데이터 복원용 가드 ===== */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function clampMetric(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

interface TurnRecord {
  choices: Record<string, string>;
  delta: Metrics;
  after: Metrics;
}

export function createPage(): Page {
  let closeActiveModal: (() => void) | null = null;
  let guide: GuideController | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      disposed = false;
      const content = await loadContent<OceaniaContent>('oceania');
      await preloadImages(['bg.oceania', ...Object.values(PERSPECTIVE_IMG).filter(hasAsset)]);
      audio.playBgm('oceania');

      /* ===== 진행 상태 ===== */
      const hotspotIds = new Set(content.hotspots.map((h) => h.id));
      const perspectiveIds = new Set(content.perspectives.map((p) => p.id));
      const investigated = new Set<string>();
      const linked = new Set<string>();
      const linkMistakes = new Set<string>();
      const viewed = new Set<string>();
      let stage: 1 | 2 | 3 = 1;
      let linkPhase: 'cause' | 'effect' = 'cause';
      let firstTryLinks = 0;
      let turnIndex = 0;
      let metrics: Metrics = { eco: START_VALUE, community: START_VALUE, economy: START_VALUE, culture: START_VALUE };
      let history: TurnRecord[] = [];
      let chosen: Record<string, string> = {};
      let lastDelta: Metrics | null = null;
      let turnWarned = false; // 이번 턴에 붕괴 경고를 이미 봤는가
      let warnedChoices = ''; // 경고 시점의 선택(수정 여부 판별용)
      let collapseCount = 0;
      let revisedCount = 0;
      let restartCount = 0;
      let lastBalanced = false;
      let busy = false;
      let finished = false;

      const presentModal = (opts: Parameters<typeof openModal>[0]): void => {
        if (disposed) return;
        closeActiveModal = openModal(opts);
      };

      const rememberCompletionModal = (): void => {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#overlay-root .modal-actions button'));
        const reviewButton = buttons.find((button) => button.textContent?.includes('한 번 더 보기'));
        if (reviewButton) closeActiveModal = () => reviewButton.click();
      };

      /* ===== 체크포인트 복원 ===== */
      const saved = saveRepo.get().missions.oceania;
      if (saved.checkpointId) {
        const d = saved.data;
        strArr(d.investigated).filter((id) => hotspotIds.has(id)).forEach((id) => investigated.add(id));
        strArr(d.linked).filter((id) => hotspotIds.has(id)).forEach((id) => linked.add(id));
        strArr(d.linkMistakes).filter((id) => hotspotIds.has(id)).forEach((id) => linkMistakes.add(id));
        strArr(d.viewed).filter((id) => perspectiveIds.has(id)).forEach((id) => viewed.add(id));
        if (d.linkPhase === 'effect') linkPhase = 'effect';
        firstTryLinks = Math.max(
          0,
          Math.min(content.hotspots.length, Math.floor(num(d.firstTryLinks, Math.max(0, linked.size - linkMistakes.size))))
        );
        if (saved.checkpointId === 'stage2') stage = 2;
        if (saved.checkpointId === 'stage3') {
          stage = 3;
          const sim = (d.sim ?? {}) as Record<string, unknown>;
          const m = (sim.metrics ?? {}) as Record<string, unknown>;
          metrics = {
            eco: clampMetric(num(m.eco, START_VALUE)),
            community: clampMetric(num(m.community, START_VALUE)),
            economy: clampMetric(num(m.economy, START_VALUE)),
            culture: clampMetric(num(m.culture, START_VALUE))
          };
          turnIndex = Math.max(0, Math.min(content.sim.turns, Math.floor(num(sim.turnIndex, 0))));
          if (Array.isArray(sim.history)) {
            history = sim.history.filter((h): h is TurnRecord => {
              if (typeof h !== 'object' || h === null) return false;
              const after = (h as Record<string, unknown>).after as Record<string, unknown> | undefined;
              return !!after && METRICS.every((m) => typeof after[m.key] === 'number');
            });
          }
          if (history.length !== turnIndex) {
            // 기록과 턴 수가 어긋나면 시뮬레이션만 처음부터 (조사·관점 진행은 유지)
            turnIndex = 0;
            history = [];
            metrics = { eco: START_VALUE, community: START_VALUE, economy: START_VALUE, culture: START_VALUE };
          }
          collapseCount = Math.max(0, Math.floor(num(sim.collapseCount, 0)));
          revisedCount = Math.max(0, Math.floor(num(sim.revisedCount, 0)));
          restartCount = Math.max(0, Math.floor(num(sim.restartCount, 0)));
          turnWarned = sim.turnWarned === true;
          warnedChoices = typeof sim.warnedChoices === 'string' ? sim.warnedChoices : '';
          const restoredChoices = sim.chosen as Record<string, unknown> | undefined;
          if (restoredChoices && typeof restoredChoices === 'object') {
            for (const [control, options] of Object.entries(content.sim.controls)) {
              const choice = restoredChoices[control];
              if (typeof choice === 'string' && options.includes(choice)) chosen[control] = choice;
            }
          }
          if (!warnedChoices) turnWarned = false;
        }
      }

      const checkpoint = (id: 'stage1' | 'stage2' | 'stage3') => {
        saveRepo.setCheckpoint('oceania', id, {
          investigated: [...investigated],
          linked: [...linked],
          linkMistakes: [...linkMistakes],
          firstTryLinks,
          viewed: [...viewed],
          linkPhase,
          sim: {
            turnIndex,
            metrics,
            history,
            collapseCount,
            revisedCount,
            restartCount,
            turnWarned,
            warnedChoices,
            chosen
          }
        });
      };

      /* ===== 페이지 골격 ===== */
      const page = document.createElement('div');
      page.className = 'page';
      page.style.backgroundImage = `linear-gradient(rgba(10, 40, 62, 0.42), rgba(10, 40, 62, 0.55)), url('${assetUrl('bg.oceania')}')`;
      const topBar = buildTopBar({
        title: '오세아니아: 섬과 바다',
        subtitle: content.intro.subtitle,
        backTo: '#/map',
        steps: { total: 3, done: stage - 1, now: stage - 1 }
      });
      page.appendChild(topBar);
      const body = document.createElement('div');
      body.className = 'page-body';
      page.appendChild(body);
      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      bottom.style.flexWrap = 'wrap';
      page.appendChild(bottom);
      root.appendChild(page);

      // 마스코트 가이드 — 단계 안내는 말풍선으로, 화면 글자는 최소로
      guide = createGuide();
      page.appendChild(guide.el);

      /* ===== 1단계: 섬 조사 ===== */
      const islandSvg = (): string => `
        <svg viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true"
          style="position:absolute;inset:0;width:100%;height:100%;display:block">
          <defs>
            <linearGradient id="oc-sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#2588e8"/>
              <stop offset="1" stop-color="#15507a"/>
            </linearGradient>
          </defs>
          <rect width="1000" height="620" fill="url(#oc-sea)"/>
          <ellipse cx="500" cy="350" rx="360" ry="230" fill="#e8d9a8" opacity="0.95"/>
          <ellipse cx="500" cy="345" rx="290" ry="175" fill="#5fae6a"/>
          <ellipse cx="430" cy="300" rx="120" ry="70" fill="#4c9a58"/>
          <ellipse cx="620" cy="400" rx="100" ry="60" fill="#4c9a58"/>
          <circle cx="500" cy="345" r="34" fill="#10c3c8" opacity="0.7"/>
          <ellipse cx="270" cy="400" rx="70" ry="40" fill="#f8b6c8" opacity="0.75"/>
          <ellipse cx="560" cy="130" rx="110" ry="34" fill="#f2e6b8" opacity="0.9"/>
          <path d="M120 520 q40 -18 80 0 t80 0 t80 0" stroke="#ffffff" stroke-width="5" fill="none" opacity="0.5"/>
          <path d="M640 545 q40 -18 80 0 t80 0" stroke="#ffffff" stroke-width="5" fill="none" opacity="0.5"/>
          <path d="M700 80 q40 -18 80 0 t80 0" stroke="#ffffff" stroke-width="5" fill="none" opacity="0.4"/>
        </svg>`;

      const openHotspot = (h: Hotspot) => {
        const bodyEl = document.createElement('div');
        bodyEl.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:var(--sp-3)">
            <div class="card"><strong style="color:var(--c-coral-ink)">무슨 일이?</strong><p>${h.issue}</p></div>
            <div class="card"><strong style="color:var(--c-sky-ink)">왜 그럴까?</strong><p>${h.cause}</p></div>
            <div class="card"><strong style="color:var(--c-violet-ink)">이어지는 영향</strong><p>${h.effect}</p></div>
          </div>`;
        presentModal({
          id: `hotspot-${h.id}`,
          title: h.name,
          bodyEl,
          actions: [
            {
              label: '조사 완료',
              kind: 'primary',
              autofocus: true,
              onClick: (close) => {
                close();
                if (!investigated.has(h.id)) {
                  investigated.add(h.id);
                  checkpoint('stage1');
                }
                renderStage1();
              }
            }
          ]
        });
      };

      function renderStage1(): void {
        updateSteps(topBar, 3, 0, 0);
        const total = content.hotspots.length;
        const done = investigated.size;
        const linksDone = linked.size;
        const currentLink = content.hotspots.find((h) => !linked.has(h.id));
        const readyForPerspectives = done >= total && linksDone >= total;
        body.innerHTML = `
          <div class="mission-frame grid-2col">
            <section class="panel" style="padding:var(--sp-3);display:flex;min-height:320px">
              <div id="island-wrap" style="position:relative;flex:1;min-height:0;border-radius:var(--radius-m);overflow:hidden">
                ${islandSvg()}
              </div>
            </section>
            <section class="panel" style="display:flex;flex-direction:column;gap:var(--sp-3);overflow-y:auto;min-height:0">
              <h2 style="color:var(--c-navy)">1단계 — 조사하고 원인·영향 연결</h2>
              <div id="spot-list" style="display:flex;flex-direction:column;gap:var(--sp-2)">
                ${content.hotspots
                  .map(
                    (h) => `<div class="card" style="display:flex;align-items:center;gap:8px;padding:10px 14px">
                      <span aria-hidden="true" style="font-weight:900;color:${investigated.has(h.id) ? 'var(--c-success)' : 'rgba(25,50,77,0.35)'}">${investigated.has(h.id) ? '✓' : '◐'}</span>
                      <span style="font-weight:700">${h.name}</span>
                      <span class="chip" style="margin-left:auto">${investigated.has(h.id) ? '조사 완료' : '조사 전'}</span>
                    </div>`
                  )
                  .join('')}
              </div>
              <div id="link-task" style="display:flex;flex-direction:column;gap:var(--sp-2)"></div>
              <div id="stage1-fb" style="min-height:52px"></div>
            </section>
          </div>`;

        const wrap = body.querySelector<HTMLElement>('#island-wrap');
        let firstTodoSpot: HTMLElement | null = null;
        if (wrap) {
          for (const h of content.hotspots) {
            const doneSpot = investigated.has(h.id);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = `
              position:absolute;left:${h.x * 100}%;top:${h.y * 100}%;transform:translate(-50%,-50%);
              width:56px;height:56px;border-radius:50%;border:3px solid #fff;cursor:pointer;
              background:${doneSpot ? 'var(--c-success)' : 'var(--c-coral)'};color:var(--c-ink);
              font-family:var(--font-head);font-size:1.3rem;box-shadow:var(--shadow-pop);`;
            btn.textContent = doneSpot ? '✓' : '?';
            btn.setAttribute('aria-label', `${h.name} ${doneSpot ? '조사 완료' : '조사하기'}`);
            btn.addEventListener('click', () => {
              void audio.playSfx('tap');
              openHotspot(h);
            });
            if (!doneSpot && !firstTodoSpot) firstTodoSpot = btn;
            wrap.appendChild(btn);
          }
        }

        const linkTask = body.querySelector<HTMLElement>('#link-task');
        if (linkTask && done >= total && currentLink && total > 0) {
          const currentIndex = content.hotspots.indexOf(currentLink);
          const shift = (currentIndex + 1) % total;
          const ordered = content.hotspots.slice(shift).concat(content.hotspots.slice(0, shift));
          const field: 'cause' | 'effect' = linkPhase;
          const prompt = linkPhase === 'cause' ? '이 문제의 원인은 무엇일까요?' : '이 문제에서 이어지는 영향은 무엇일까요?';
          linkTask.innerHTML = `
            <div class="card" style="border-width:2px;border-color:var(--c-violet)">
              <p style="font-size:var(--fs-small);font-weight:700;margin-bottom:4px">연결 ${linksDone + 1}/${total} · ${currentLink.name}</p>
              <p>${currentLink.issue}</p>
            </div>
            <p style="font-weight:700">${prompt}</p>
            <div id="link-options" role="group" aria-label="${currentLink.name}의 ${linkPhase === 'cause' ? '원인' : '영향'} 선택" style="display:flex;flex-direction:column;gap:var(--sp-2)"></div>`;

          const options = linkTask.querySelector<HTMLElement>('#link-options');
          if (options) {
            for (const candidate of ordered) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'card card-pick';
              btn.style.cssText = 'text-align:left;min-height:var(--touch-min);font-size:var(--fs-small)';
              btn.textContent = candidate[field];
              btn.addEventListener('click', () => {
                if (busy || disposed) return;
                busy = true;
                void audio.playSfx('tap');
                const correct = candidate.id === currentLink.id;
                if (!correct) {
                  linkMistakes.add(currentLink.id);
                  checkpoint('stage1');
                  const feedback = body.querySelector<HTMLElement>('#stage1-fb');
                  if (feedback) {
                    showFeedback(
                      feedback,
                      'partial',
                      `${linkPhase === 'cause' ? '원인' : '영향'}의 연결이 조금 달라요. 조사 기록의 장소와 이어지는 변화를 다시 비교해 보세요.`,
                      'oceania'
                    );
                  }
                  busy = false;
                  return;
                }

                if (linkPhase === 'cause') {
                  linkPhase = 'effect';
                  checkpoint('stage1');
                  renderStage1();
                  const feedback = body.querySelector<HTMLElement>('#stage1-fb');
                  if (feedback) showFeedback(feedback, 'success', '원인을 잘 연결했어요. 이제 어떤 영향으로 이어지는지 찾아봐요.');
                } else {
                  linked.add(currentLink.id);
                  if (!linkMistakes.has(currentLink.id)) firstTryLinks += 1;
                  linkPhase = 'cause';
                  checkpoint('stage1');
                  renderStage1();
                  const feedback = body.querySelector<HTMLElement>('#stage1-fb');
                  if (feedback && linked.size < total) showFeedback(feedback, 'success', '원인과 영향을 모두 연결했어요. 다음 조사 기록도 이어 볼까요?');
                }
                busy = false;
              });
              options.appendChild(btn);
            }
          }
        }

        const fb = body.querySelector<HTMLElement>('#stage1-fb');
        if (fb && readyForPerspectives) {
          showFeedback(fb, 'success', '네 곳의 조사와 원인·영향 연결을 마쳤어요! 이제 섬에 사는 네 사람의 이야기를 들어 볼까요?', 'oceania');
        } else if (fb && done >= total) {
          showFeedback(fb, 'partial', `조사를 모두 마쳤어요. 원인·영향 연결이 ${total - linksDone}곳 남았어요.`);
        } else if (fb && done > 0) {
          showFeedback(fb, 'partial', `잘하고 있어요. 아직 조사하지 않은 곳이 ${total - done}곳 남았어요.`);
        }

        bottom.innerHTML = `
          <span class="chip">조사 ${done}/${total} · 연결 ${linksDone}/${total}</span>
          <button class="btn btn-primary btn-big" data-act="next" ${readyForPerspectives ? '' : 'disabled'}>관점 듣기로</button>`;
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          if (!readyForPerspectives || busy || disposed) return;
          busy = true;
          stage = 2;
          checkpoint('stage2');
          renderStage2();
          busy = false;
        });

        if (readyForPerspectives) {
          guide?.say('다 됐어요! 관점 듣기를 눌러요!', { cue: bottom.querySelector<HTMLElement>('[data-act="next"]') });
        } else if (done < total) {
          guide?.say('지도의 반짝이는 곳을 눌러 조사해요!', { cue: firstTodoSpot });
        } else {
          guide?.say(linkPhase === 'cause' ? '문제의 원인을 골라 봐요!' : '이어지는 영향을 골라 봐요!', {
            cue: body.querySelector<HTMLElement>('#link-options')
          });
        }
      }

      /* ===== 2단계: 관점 듣기 ===== */
      const openPerspective = (p: Perspective) => {
        const imgId = PERSPECTIVE_IMG[p.id];
        const bodyEl = document.createElement('div');
        bodyEl.innerHTML = `
          <div style="display:flex;gap:var(--sp-4);align-items:flex-start;flex-wrap:wrap">
            ${imgId && hasAsset(imgId) ? `<img src="${assetUrl(imgId)}" alt="" style="width:96px;flex-shrink:0">` : ''}
            <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:var(--sp-3)">
              <blockquote class="card" style="font-size:var(--fs-body)">${p.quote}</blockquote>
              <p><span class="chip">이 사람의 걱정</span> ${p.concern}</p>
            </div>
          </div>`;
        presentModal({
          id: `persp-${p.id}`,
          title: `${p.name} — ${p.role}`,
          bodyEl,
          actions: [
            {
              label: '잘 들었어요',
              kind: 'primary',
              autofocus: true,
              onClick: (close) => {
                close();
                if (!viewed.has(p.id)) {
                  viewed.add(p.id);
                  checkpoint('stage2');
                }
                renderStage2();
              }
            }
          ]
        });
      };

      function renderStage2(): void {
        updateSteps(topBar, 3, 1, 1);
        const total = content.perspectives.length;
        const done = viewed.size;
        body.innerHTML = `
          <div class="panel" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:var(--sp-3);overflow-y:auto;padding-bottom:96px">
            <h2 style="color:var(--c-navy)">2단계 — 네 사람의 이야기 듣기</h2>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--sp-3)" id="persp-grid"></div>
            <div id="stage2-fb" style="min-height:52px"></div>
          </div>`;

        const grid = body.querySelector<HTMLElement>('#persp-grid');
        let firstUnheard: HTMLElement | null = null;
        if (grid) {
          for (const p of content.perspectives) {
            const heard = viewed.has(p.id);
            const imgId = PERSPECTIVE_IMG[p.id];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'card card-pick';
            card.style.cssText = 'display:flex;align-items:center;gap:var(--sp-3);text-align:left;min-height:72px';
            card.innerHTML = `
              ${imgId && hasAsset(imgId) ? `<img src="${assetUrl(imgId)}" alt="" style="width:56px;flex-shrink:0">` : ''}
              <div style="flex:1;min-width:0">
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                  <strong style="font-family:var(--font-head)">${p.name}</strong>
                  <span class="chip">${p.role}</span>
                </div>
                <p style="font-size:var(--fs-small);color:rgba(25,50,77,0.75)">${p.concern}</p>
              </div>
              <span aria-hidden="true" style="font-weight:900;font-size:1.2rem;color:${heard ? 'var(--c-success)' : 'rgba(25,50,77,0.3)'}">${heard ? '✓' : '◐'}</span>`;
            card.setAttribute('aria-label', `${p.name} ${p.role} 이야기 ${heard ? '들었어요' : '듣기'}`);
            card.addEventListener('click', () => openPerspective(p));
            if (!heard && !firstUnheard) firstUnheard = card;
            grid.appendChild(card);
          }
        }

        const fb = body.querySelector<HTMLElement>('#stage2-fb');
        if (fb && done >= total) {
          showFeedback(fb, 'success', '네 사람의 이야기를 모두 들었어요. 이제 세 번의 결정으로 섬의 미래를 이끌어 볼까요?', 'oceania');
        }

        bottom.innerHTML = `
          <span class="chip">이야기 ${done}/${total} 듣기</span>
          <div style="display:flex;gap:var(--sp-3)">
            <button class="btn btn-ghost" data-act="back">조사 다시 보기</button>
            <button class="btn btn-primary btn-big" data-act="next" ${done >= total ? '' : 'disabled'}>미래 회의 시작</button>
          </div>`;
        bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => {
          stage = 1;
          renderStage1();
        });
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          if (viewed.size < total || busy) return;
          busy = true;
          stage = 3;
          checkpoint('stage3');
          renderStage3();
          busy = false;
        });

        if (done >= total) {
          guide?.say('다 들었어요! 미래 회의를 시작해요!', { cue: bottom.querySelector<HTMLElement>('[data-act="next"]') });
        } else {
          guide?.say('네 사람의 이야기를 들어 봐요!', { cue: firstUnheard });
        }
      }

      /* ===== 3단계: 3턴 시뮬레이션 ===== */
      const metricRow = (m: { key: MetricKey; label: string; color: string }): string => {
        const value = metrics[m.key];
        const d = lastDelta ? lastDelta[m.key] : null;
        const deltaHtml =
          d === null
            ? ''
            : `<span style="width:44px;font-weight:900;text-align:right;color:${d > 0 ? 'var(--c-success)' : d < 0 ? 'var(--c-coral)' : 'rgba(25,50,77,0.5)'}">${d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '±0'}</span>`;
        return `
          <div style="display:flex;align-items:center;gap:8px">
            <span style="width:60px;font-weight:700">${m.label}</span>
            <div class="progress-track" style="flex:1;position:relative">
              <div class="progress-fill" style="width:${value}%;background:${m.color}"></div>
              <div style="position:absolute;left:${COLLAPSE_LINE}%;top:-2px;bottom:-2px;width:2px;background:rgba(242,109,109,0.85)" aria-hidden="true"></div>
            </div>
            <span style="width:32px;text-align:right;font-weight:700">${value}</span>
            ${deltaHtml}
          </div>`;
      };

      function renderStage3(): void {
        updateSteps(topBar, 3, 2, 2);
        const label = content.sim.turnLabels[turnIndex] ?? `${turnIndex + 1}번째`;
        body.innerHTML = `
          <div class="mission-frame grid-2col">
            <section class="panel" style="display:flex;flex-direction:column;gap:var(--sp-3);overflow-y:auto;min-height:0;padding-bottom:96px">
              <h2 style="color:var(--c-navy)">3단계 — 섬의 미래 회의</h2>
              <p><span class="chip">${turnIndex + 1}번째 결정 · ${label}</span></p>
              <div style="display:flex;flex-direction:column;gap:var(--sp-2)">
                ${METRICS.map(metricRow).join('')}
              </div>
              <p style="font-size:var(--fs-small);color:rgba(25,50,77,0.7)">빨간 선(${COLLAPSE_LINE}) 아래로 내려가는 지표가 생기면 위험 신호예요.</p>
              <div id="sim-fb" style="min-height:64px"></div>
            </section>
            <section class="panel" style="display:flex;flex-direction:column;gap:var(--sp-3);overflow-y:auto;min-height:0">
              <div id="controls" style="display:flex;flex-direction:column;gap:var(--sp-3)"></div>
            </section>
          </div>`;

        const controlsEl = body.querySelector<HTMLElement>('#controls');
        if (controlsEl) {
          for (const [ctrl, options] of Object.entries(content.sim.controls)) {
            const group = document.createElement('div');
            group.setAttribute('role', 'radiogroup');
            group.setAttribute('aria-label', CONTROL_LABELS[ctrl] ?? ctrl);
            group.innerHTML = `<p style="font-weight:700;margin-bottom:6px">${CONTROL_LABELS[ctrl] ?? ctrl}</p>`;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:var(--sp-2);flex-wrap:wrap';
            for (const opt of options) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'card card-pick';
              btn.style.cssText = 'flex:1;min-width:96px;min-height:var(--touch-min);font-weight:700;text-align:center';
              btn.textContent = opt;
              btn.setAttribute('role', 'radio');
              const sync = () => {
                const on = chosen[ctrl] === opt;
                btn.classList.toggle('is-selected', on);
                btn.setAttribute('aria-checked', String(on));
              };
              sync();
              btn.addEventListener('click', () => {
                void audio.playSfx('tap');
                chosen[ctrl] = opt;
                row.querySelectorAll<HTMLElement>('button').forEach((b) => {
                  b.classList.toggle('is-selected', b.textContent === opt);
                  b.setAttribute('aria-checked', String(b.textContent === opt));
                });
                checkpoint('stage3');
                syncRunButton();
              });
              row.appendChild(btn);
            }
            group.appendChild(row);
            controlsEl.appendChild(group);
          }
        }

        bottom.innerHTML = `
          <span class="chip">결정 ${Math.min(turnIndex + 1, content.sim.turns)}/${content.sim.turns} · ${label}</span>
          <button class="btn btn-primary btn-big" data-act="run" disabled>턴 진행</button>`;
        bottom.querySelector('[data-act="run"]')?.addEventListener('click', runTurn);
        syncRunButton();

        if (turnWarned) {
          const fb = body.querySelector<HTMLElement>('#sim-fb');
          if (fb) showFeedback(fb, 'retry', content.feedback.collapse);
          guide?.say('지표가 떨어졌어요! 다시 골라 봐요!');
        } else if (lastDelta) {
          const fb = body.querySelector<HTMLElement>('#sim-fb');
          if (fb) showFeedback(fb, 'partial', '지난 결정의 변화가 지표 옆에 표시돼 있어요. 다음 결정을 골라 보세요.');
          guide?.say('변화를 보고 다음 결정을 골라요!');
        } else {
          guide?.say('세 가지를 고르고 턴 진행을 눌러요!');
        }
      }

      function syncRunButton(): void {
        const btn = bottom.querySelector<HTMLButtonElement>('[data-act="run"]');
        if (!btn) return;
        const ready = Object.keys(content.sim.controls).every((k) => typeof chosen[k] === 'string');
        const unchangedAfterWarning = turnWarned && JSON.stringify(chosen) === warnedChoices;
        btn.disabled = !ready || unchangedAfterWarning;
        // 세 가지를 모두 고르면 큐를 턴 진행 버튼으로
        guide?.setCue(!btn.disabled ? btn : body.querySelector<HTMLElement>('#controls'));
      }

      function computeDelta(): Metrics {
        const delta: Metrics = { eco: 0, community: 0, economy: 0, culture: 0 };
        for (const ctrl of Object.keys(content.sim.controls)) {
          const choice = chosen[ctrl];
          if (!choice) continue;
          const eff = content.sim.effects[ctrl]?.[choice] ?? {};
          for (const m of METRICS) delta[m.key] += eff[m.key] ?? 0;
        }
        return delta;
      }

      function runTurn(): void {
        if (busy || finished) return;
        const ready = Object.keys(content.sim.controls).every((k) => typeof chosen[k] === 'string');
        if (!ready) return;
        if (turnWarned && JSON.stringify(chosen) === warnedChoices) return;
        busy = true;

        // 같은 선택이면 항상 같은 결과 — JSON 계수 합산만 사용(무작위 없음)
        const delta = computeDelta();
        const after: Metrics = { eco: 0, community: 0, economy: 0, culture: 0 };
        for (const m of METRICS) after[m.key] = clampMetric(metrics[m.key] + delta[m.key]);
        const collapsed = METRICS.filter((m) => after[m.key] < COLLAPSE_LINE);

        if (collapsed.length > 0 && !turnWarned) {
          // 붕괴 경고: 이번 턴을 되돌리고 다시 고를 기회 (전체 리셋 아님)
          turnWarned = true;
          warnedChoices = JSON.stringify(chosen);
          collapseCount += 1;
          const fb = body.querySelector<HTMLElement>('#sim-fb');
          if (fb) {
            showFeedback(
              fb,
              'retry',
              `이대로 가면 ${collapsed.map((m) => m.label).join('·')} 지표가 ${COLLAPSE_LINE} 아래로 떨어져요. ${content.feedback.collapse}`,
              'oceania'
            );
          }
          checkpoint('stage3');
          showToast('이번 턴의 선택을 바꿔서 다시 진행해 볼 수 있어요.', 'warn');
          syncRunButton();
          busy = false;
          return;
        }

        if (turnWarned && JSON.stringify(chosen) !== warnedChoices) revisedCount += 1;
        metrics = after;
        lastDelta = delta;
        history.push({ choices: { ...chosen }, delta, after });
        turnIndex += 1;
        turnWarned = false;
        warnedChoices = '';
        chosen = {};
        checkpoint('stage3');
        void audio.playSfx('success');

        if (turnIndex >= content.sim.turns) {
          showResult();
        } else {
          renderStage3();
        }
        busy = false;
      }

      function showResult(): void {
        updateSteps(topBar, 3, 3, 2);
        const warn = content.sim.thresholds.warn;
        lastBalanced = METRICS.every((m) => metrics[m.key] >= warn);
        lastDelta = null;

        const first = history[0];
        const last = history[history.length - 1];
        let compare = '';
        if (first && last) {
          const ups = METRICS.filter((m) => last.after[m.key] > first.after[m.key]).map((m) => m.label);
          const downs = METRICS.filter((m) => last.after[m.key] < first.after[m.key]).map((m) => m.label);
          if (ups.length && downs.length) {
            compare = `단기 효과(1턴)와 장기 효과(${history.length}턴)를 비교하면, <strong>${ups.join('·')}</strong> 지표는 높아지고 <strong>${downs.join('·')}</strong> 지표는 낮아졌어요.`;
          } else if (ups.length) {
            compare = `단기 효과(1턴)와 장기 효과(${history.length}턴)를 비교하면, <strong>${ups.join('·')}</strong> 지표가 더 높아졌어요.`;
          } else if (downs.length) {
            compare = `단기 효과(1턴)와 장기 효과(${history.length}턴)를 비교하면, <strong>${downs.join('·')}</strong> 지표가 더 낮아졌어요.`;
          } else {
            compare = '세 번의 결정 동안 지표가 큰 변화 없이 유지됐어요.';
          }
        }

        const signed = (value: number): string => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0');
        const compareRows = first && last
          ? METRICS.map((m) => `<tr>
              <td style="padding:4px 10px;font-weight:700">${m.label}</td>
              <td style="text-align:center;padding:4px 10px">${signed(first.after[m.key] - START_VALUE)}</td>
              <td style="text-align:center;padding:4px 10px">${signed(last.after[m.key] - START_VALUE)}</td>
            </tr>`).join('')
          : '';

        const tableRows = METRICS.map((m) => {
          const cells = history.map((h) => `<td style="text-align:center;padding:4px 10px">${h.after[m.key]}</td>`).join('');
          return `<tr><td style="padding:4px 10px;font-weight:700">${m.label}</td><td style="text-align:center;padding:4px 10px">${START_VALUE}</td>${cells}</tr>`;
        }).join('');
        const tableHead = `<th style="padding:4px 10px;font-weight:700">결정 전</th>` + history
          .map((_, i) => `<th style="padding:4px 10px;font-weight:700">${content.sim.turnLabels[i] ?? `${i + 1}턴`}</th>`)
          .join('');

        body.innerHTML = `
          <div class="panel" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:var(--sp-3);overflow-y:auto;padding-bottom:96px">
            <h2 style="color:var(--c-navy)">${lastBalanced ? '균형을 지켜냈어요!' : '세 번의 결정이 끝났어요'}</h2>
            <div style="display:flex;flex-direction:column;gap:var(--sp-2)">${METRICS.map(metricRow).join('')}</div>
            <div style="overflow-x:auto">
              <table style="border-collapse:collapse;font-size:var(--fs-small);background:rgba(255,255,255,0.6);border-radius:var(--radius-s)">
                <thead><tr><th style="padding:4px 10px"></th>${tableHead}</tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
            ${compareRows ? `<div class="card" style="overflow-x:auto">
              <p style="font-weight:700;margin-bottom:6px">단기·장기 효과 비교 <span class="chip">결정 전 50 기준</span></p>
              <table style="border-collapse:collapse;font-size:var(--fs-small)">
                <thead><tr><th style="padding:4px 10px"></th><th style="padding:4px 10px">단기(1턴)</th><th style="padding:4px 10px">장기(${history.length}턴)</th></tr></thead>
                <tbody>${compareRows}</tbody>
              </table>
            </div>` : ''}
            ${compare ? `<p>${compare}</p>` : ''}
            <div id="result-fb"></div>
            <p style="font-size:var(--fs-small);color:rgba(25,50,77,0.75)">${content.feedback.tradeoffNote}</p>
          </div>`;

        const fb = body.querySelector<HTMLElement>('#result-fb');
        if (fb) {
          if (lastBalanced) {
            showFeedback(fb, 'success', content.feedback.balanced, 'oceania');
          } else {
            const low = METRICS.filter((m) => metrics[m.key] < warn).map((m) => m.label);
            showFeedback(
              fb,
              'partial',
              `${low.join('·')} 지표가 ${warn} 아래에서 끝났어요. 실패가 아니라 발견이에요. 다른 전략으로 다시 해 보거나, 이대로 미션을 마칠 수도 있어요.`,
              'oceania'
            );
          }
        }

        bottom.innerHTML = `
          <button class="btn btn-ghost" data-act="retry">다른 전략으로 다시</button>
          <button class="btn btn-success btn-big" data-act="finish">미션 완료!</button>`;
        bottom.querySelector('[data-act="retry"]')?.addEventListener('click', () => {
          if (busy || finished) return;
          busy = true;
          restartCount += 1;
          metrics = { eco: START_VALUE, community: START_VALUE, economy: START_VALUE, culture: START_VALUE };
          history = [];
          turnIndex = 0;
          chosen = {};
          lastDelta = null;
          turnWarned = false;
          warnedChoices = '';
          checkpoint('stage3');
          renderStage3();
          busy = false;
        });
        bottom.querySelector('[data-act="finish"]')?.addEventListener('click', finish);
        guide?.say(lastBalanced ? '균형을 지켰어요! 미션 완료를 눌러요!' : '결과를 살펴보고 어떻게 할지 골라요!', {
          cue: bottom.querySelector<HTMLElement>('[data-act="finish"]')
        });
      }

      function finish(): void {
        if (finished) return;
        finished = true;
        const good = content.sim.thresholds.good;
        const warn = content.sim.thresholds.warn;
        const community = metrics.community;
        const communicationRatio =
          community >= good ? 1 : community >= warn ? 0.85 : community >= COLLAPSE_LINE ? 0.6 : 0.35;
        const revisionRatio =
          collapseCount === 0 && restartCount === 0 ? 1 : revisedCount > 0 || restartCount > 0 ? 1 : 0.4;
        const speedBonus = lastBalanced ? (collapseCount === 0 && restartCount === 0 ? 5 : 3) : 0;
        const result = computeScore(
          {
            evidence:
              0.55 * (investigated.size / Math.max(1, content.hotspots.length)) +
              0.45 * (firstTryLinks / Math.max(1, content.hotspots.length)),
            perspective: viewed.size / Math.max(1, content.perspectives.length),
            communication: communicationRatio,
            revision: revisionRatio
          },
          { evidence: 30, perspective: 25, communication: 25, revision: 15 },
          speedBonus
        );
        completeMissionFlow('oceania', '오세아니아', result);
        rememberCompletionModal();
      }

      /* ===== 시작 ===== */
      if (stage === 1) renderStage1();
      else if (stage === 2) renderStage2();
      else if (turnIndex >= content.sim.turns) showResult();
      else renderStage3();

      if (stage === 1 && investigated.size === 0) {
        presentModal({
          id: 'oceania-intro',
          title: content.intro.title,
          bodyHtml: `<p>${content.intro.guide}</p>`,
          actions: [{ label: '조사 시작!', kind: 'primary', autofocus: true, onClick: (close) => close() }]
        });
      }
    },
    unmount() {
      disposed = true;
      closeActiveModal?.();
      closeActiveModal = null;
      guide?.dispose();
      guide = null;
    }
  };
}
