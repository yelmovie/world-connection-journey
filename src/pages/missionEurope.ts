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
import { openModal, type ModalOptions } from '../ui/modal';
import { showToast } from '../ui/toast';

interface EuropeSource {
  id: string;
  type: string;
  title: string;
  body: string;
  clues: string[];
}
/** tags: 목표·목적 판정용 판단 태그 — europe.json nodeTagLegend 참고 (stairs/accessible/resident/preserve) */
interface EuropeNode {
  id: string;
  name: string;
  desc: string;
  x: number;
  y: number;
  visitMinutes: number;
  tags: string[];
}
interface EuropeEdge {
  from: string;
  to: string;
  minutes: number;
  mode: string;
}
interface EuropeContent {
  intro: { title: string; subtitle: string; guide: string };
  city: { name: string; note: string };
  sources: EuropeSource[];
  nodes: EuropeNode[];
  edges: EuropeEdge[];
  goals: Array<{ id: string; label: string; check: string }>;
  constraints: { maxMinutes: number; mustVisitCount: number };
  exampleRoutes: Array<{ nodeIds: string[]; strengths: string; tradeoffs: string }>;
  feedback: { overTime: string; goalMissed: string; good: string };
}

const WEIGHTS = { evidence: 30, perspective: 25, communication: 25, revision: 15 };
const SVG_NS = 'http://www.w3.org/2000/svg';
const VB_W = 960;
const VB_H = 540;

const TYPE_LABEL: Record<string, string> = {
  official: '공식 안내',
  resident: '주민 목소리',
  access: '접근성 정보',
  preserve: '보존 규칙'
};

const SOURCE_LENS: Record<string, { side: 'heritage' | 'today'; label: string }> = {
  official: { side: 'heritage', label: '역사·방문 안내' },
  preserve: { side: 'heritage', label: '문화유산 보존' },
  resident: { side: 'today', label: '주민의 오늘' },
  access: { side: 'today', label: '오늘의 이동 접근' }
};

type PurposeId = 'balanced' | 'access' | 'heritage' | 'community';

const PURPOSES: ReadonlyArray<{ id: PurposeId; label: string; help: string }> = [
  { id: 'balanced', label: '균형 탐방', help: '접근성·주민 생활·보존 목표를 모두 챙겨요.' },
  { id: 'access', label: '함께 이동', help: '계단 많은 다리를 피하고 접근하기 쉬운 지점을 두 곳 이상 골라요.' },
  { id: 'heritage', label: '흔적 보기', help: '보존 규칙이 있는 역사 지점을 두 곳 이상 연결해요.' },
  { id: 'community', label: '생활 만나기', help: '주민 생활·교류 지점을 두 곳 이상 연결해요.' }
];

const PAGE_CSS = `
.europe-mission .top-bar { background:linear-gradient(180deg,rgba(31,43,74,.8),rgba(31,43,74,0)); }
/* 기준 해상도(1024x576+)에서는 한 화면에 들어가지만, 더 낮은 창에서는 잘리는 대신 스크롤한다 */
.europe-mission .page-body { padding:var(--sp-3) clamp(12px,2.5vw,32px);overflow-y:auto; }
/* 배경이 주인공 — 큰 패널은 최대 2개(보드 + 조작 레일), 캐릭터는 배경 위에 크게 선다 */
.europe-mission .mission-scene { flex:1;min-height:0;display:grid;gap:var(--sp-4);align-items:stretch; }
.europe-mission .scene-read { grid-template-columns:minmax(0,1fr) clamp(132px,14vw,240px); }
.europe-mission .scene-route { grid-template-columns:clamp(120px,11vw,190px) minmax(0,1fr) clamp(200px,19vw,280px); }
.europe-mission .scene-board,
.europe-mission .control-rail {
  min-width:0;min-height:0;position:relative;overflow:hidden;
  padding:var(--sp-4);border-radius:var(--radius-l);
  background:rgba(255,252,240,.9);backdrop-filter:blur(6px);
  border:2px solid rgba(212,191,138,.9);box-shadow:var(--shadow-card);
  display:flex;flex-direction:column;gap:var(--sp-3);
}
.europe-mission .control-rail { overflow-y:auto;gap:var(--sp-2);color:var(--c-navy); }
.europe-mission .scene-cast {
  display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
  gap:var(--sp-2);min-width:0;overflow:hidden;
}
.europe-mission .cast-hero { width:clamp(120px,14vw,240px);max-height:54%;object-fit:contain;filter:drop-shadow(0 10px 18px rgba(8,18,33,.5)); }
.europe-mission .cast-props { display:flex;gap:var(--sp-2);justify-content:center;flex-wrap:wrap; }
.europe-mission .cast-props img { width:clamp(40px,4.6vw,72px);height:clamp(40px,4.6vw,72px);object-fit:contain;filter:drop-shadow(0 5px 10px rgba(8,18,33,.45)); }
.europe-mission .cast-note { font-size:var(--fs-small);line-height:1.35;color:#fff;text-align:center;text-shadow:0 2px 6px rgba(10,22,40,.95); }
.europe-mission .board-title { display:flex;justify-content:space-between;align-items:center;gap:var(--sp-2); }
.europe-mission .board-title h2 { color:var(--c-navy);font-size:var(--fs-title); }
.europe-mission .source-row { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sp-2); }
.europe-mission .source-row .card { min-height:56px;padding:var(--sp-2);font-size:var(--fs-small);text-align:left; }
.europe-mission .source-viewer {
  flex:1;min-height:0;overflow:auto;padding:var(--sp-3);border-radius:var(--radius-m);
  background:rgba(255,253,244,.92);border:2px solid #d8c798;
}
.europe-mission .source-viewer p,.europe-mission .source-viewer li { font-size:var(--fs-small);line-height:1.45; }
.europe-mission .source-lens { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-2); }
.europe-mission .source-lens .card { padding:var(--sp-3);font-size:var(--fs-small);text-align:left; }
.europe-mission .compare-result { flex:1;min-height:0;overflow:auto; }
.europe-mission .city-map { width:100%;height:100%;min-height:0;display:block;border-radius:var(--radius-m);background:#9ed4d0; }
.europe-mission .map-surface { flex:1;min-height:0;display:flex;position:relative; }
.europe-mission .map-caption { position:absolute;left:8px;bottom:8px;padding:5px 12px;border-radius:999px;background:rgba(15,30,50,.84);color:#fff;font-size:var(--fs-small);pointer-events:none; }
.europe-mission .purpose-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-2); }
.europe-mission .purpose-grid .card { min-height:48px;padding:var(--sp-2);font-size:var(--fs-small);line-height:1.2;text-align:center; }
.europe-mission .gauge-card { padding:var(--sp-2);border-radius:var(--radius-s);background:rgba(255,255,255,.86);font-size:var(--fs-small);font-weight:700; }
.europe-mission .goal-list { display:flex;flex-direction:column;gap:2px;font-size:var(--fs-small);line-height:1.35; }
.europe-mission .mission-dock { background:linear-gradient(0deg,rgba(15,30,50,.82),rgba(15,30,50,.28)); }
.europe-mission .mission-dock .chip { max-width:60%; }
.europe-mission .compact-feedback .feedback { padding:var(--sp-2) var(--sp-3);font-size:var(--fs-small); }
.europe-mission .route-tools { padding:var(--sp-2);font-size:var(--fs-small); }
.europe-mission .route-tools summary { min-height:44px;display:flex;align-items:center;font-weight:700; }
@media (max-width:900px) {
  .europe-mission .scene-route { grid-template-columns:120px minmax(0,1fr) 200px;gap:var(--sp-3); }
  .europe-mission .scene-board,.europe-mission .control-rail { padding:var(--sp-3); }
}
@media (max-height:620px) {
  .europe-mission .cast-hero { max-height:42%; }
  .europe-mission .cast-props img { width:40px;height:40px; }
  /* 낮은 화면에서도 레일이 스크롤 없이 들어오게 */
  .europe-mission .control-rail { padding:var(--sp-3);gap:6px; }
  .europe-mission .goal-list { line-height:1.25; }
}
@media (prefers-reduced-motion:reduce) { .europe-mission * { scroll-behavior:auto!important; } }
`;

function isPurposeId(value: unknown): value is PurposeId {
  return typeof value === 'string' && PURPOSES.some((purpose) => purpose.id === value);
}

function purposeLabel(id: PurposeId): string {
  return PURPOSES.find((purpose) => purpose.id === id)?.label ?? id;
}

/** 판단 태그별 노드 집합 — 콘텐츠 JSON의 nodes[].tags에서 만든다. */
interface NodeTagSets {
  stairs: Set<string>;
  accessible: Set<string>;
  resident: Set<string>;
  preserve: Set<string>;
}

function buildTagSets(nodes: EuropeNode[]): NodeTagSets {
  const byTag = (tag: string) => new Set(nodes.filter((n) => Array.isArray(n.tags) && n.tags.includes(tag)).map((n) => n.id));
  return { stairs: byTag('stairs'), accessible: byTag('accessible'), resident: byTag('resident'), preserve: byTag('preserve') };
}

interface RouteSnap {
  nodes: string[];
  minutes: number;
  distanceIndex: number;
  purpose: PurposeId;
  met: Record<string, boolean>;
  metCount: number;
}

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function imageHtml(id: string, alt = '', className = ''): string {
  if (!hasAsset(id)) return '';
  return `<img src="${assetUrl(id)}" alt="${alt}" ${alt ? '' : 'aria-hidden="true"'} data-asset-id="${id}" class="${className}">`;
}

function stickerImages(ids: readonly string[]): string {
  return ids.filter((id) => hasAsset(id)).map((id) => imageHtml(id)).join('');
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function goalsMetFor(route: string[], tags: NodeTagSets): Record<string, boolean> {
  return {
    goal_access: route.some((id) => tags.accessible.has(id)),
    goal_resident: route.some((id) => tags.resident.has(id)),
    goal_preserve: route.some((id) => tags.preserve.has(id))
  };
}

function purposeMetFor(route: string[], purpose: PurposeId, met: Record<string, boolean>, tags: NodeTagSets): boolean {
  if (purpose === 'balanced') return Object.values(met).every(Boolean);
  if (purpose === 'access') {
    return route.every((id) => !tags.stairs.has(id)) && route.filter((id) => tags.accessible.has(id)).length >= 2;
  }
  if (purpose === 'heritage') return route.filter((id) => tags.preserve.has(id)).length >= 2;
  return route.filter((id) => tags.resident.has(id)).length >= 2;
}

export function createPage(): Page {
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
      const c = await loadContent<EuropeContent>('europe');
      if (disposed) return;
      audio.playBgm('europe');

      const nodeById = new Map(c.nodes.map((n) => [n.id, n]));
      const tagSets = buildTagSets(c.nodes);
      const edgeMin = new Map<string, number>();
      for (const e of c.edges) edgeMin.set(edgeKey(e.from, e.to), e.minutes);

      const routeMinutes = (route: string[]): number => {
        let t = 0;
        route.forEach((id, i) => {
          t += nodeById.get(id)?.visitMinutes ?? 0;
          const prev = route[i - 1];
          if (i > 0 && prev) t += edgeMin.get(edgeKey(prev, id)) ?? 0;
        });
        return t;
      };

      /** 실제 km가 아닌 SVG 좌표 기반 비교용 거리 지수다. */
      const routeDistanceIndex = (route: string[]): number => {
        let distance = 0;
        route.forEach((id, i) => {
          const current = nodeById.get(id);
          const previousId = route[i - 1];
          const previous = previousId ? nodeById.get(previousId) : undefined;
          if (current && previous) distance += Math.hypot((current.x - previous.x) * VB_W, (current.y - previous.y) * VB_H);
        });
        return Math.round(distance / 10);
      };

      const snapFor = (nodes: string[], purpose: PurposeId): RouteSnap => {
        const met = goalsMetFor(nodes, tagSets);
        return {
          nodes,
          minutes: routeMinutes(nodes),
          distanceIndex: routeDistanceIndex(nodes),
          purpose,
          met,
          metCount: Object.values(met).filter(Boolean).length
        };
      };

      // ---- 미션 진행 상태 ----
      let stage: 1 | 2 = 1;
      let secondMode = false;
      const readSet = new Set<string>();
      const comparedSourceIds = new Set<string>();
      let comparisonDone = false;
      let route: string[] = [];
      let purpose: PurposeId | null = null;
      let firstSnap: RouteSnap | null = null;
      let failedAttempts = 0; // 시간 초과·목표 미달 재도전 횟수
      let busy = false;
      let finished = false;

      // ---- 체크포인트 복원 ----
      const saved = saveRepo.get().missions.europe;
      const d = saved.data as Partial<{
        read: string[];
        comparedSourceIds: string[];
        comparisonDone: boolean;
        route: string[];
        purpose: string | null;
        firstRoute: string[];
        firstPurpose: string;
        failedAttempts: number;
      }>;
      const knownSourceIds = new Set(c.sources.map((source) => source.id));
      if (saved.checkpointId === 'sources' || saved.checkpointId === 'route' || saved.checkpointId === 'second_route') {
        if (typeof d.failedAttempts === 'number') failedAttempts = Math.max(0, Math.trunc(d.failedAttempts));
        (Array.isArray(d.read) ? d.read : []).filter((id): id is string => typeof id === 'string' && knownSourceIds.has(id)).forEach((id) => readSet.add(id));
        if (Array.isArray(d.comparedSourceIds)) {
          d.comparedSourceIds
            .filter((id): id is string => typeof id === 'string' && knownSourceIds.has(id))
            .slice(0, 2)
            .forEach((id) => comparedSourceIds.add(id));
        }
        comparisonDone = d.comparisonDone === true && comparedSourceIds.size === 2;
        if (saved.checkpointId === 'sources') showToast('저장된 자료 읽기 지점부터 이어서 해요.', 'info');
      }
      if (saved.checkpointId === 'route' || saved.checkpointId === 'second_route') {
        stage = 2;
        c.sources.forEach((source) => readSet.add(source.id));
        comparisonDone = true; // 이전 구현의 경로 체크포인트도 안전하게 이어 간다.
        if (saved.checkpointId === 'second_route' && Array.isArray(d.firstRoute)) {
          const nodes = d.firstRoute.filter((id): id is string => typeof id === 'string' && nodeById.has(id));
          if (nodes.length > 0) {
            const firstPurpose = isPurposeId(d.firstPurpose) ? d.firstPurpose : 'balanced';
            firstSnap = snapFor(nodes, firstPurpose);
            secondMode = true;
          }
        }
        const savedPurpose = isPurposeId(d.purpose) ? d.purpose : null;
        if (!secondMode || savedPurpose !== firstSnap?.purpose) purpose = savedPurpose;
        if (Array.isArray(d.route)) {
          const candidate = d.route;
          const validRoute =
            candidate.every((id): id is string => typeof id === 'string' && nodeById.has(id)) &&
            new Set(candidate).size === candidate.length &&
            candidate.every((id, index) => index === 0 || edgeMin.has(edgeKey(candidate[index - 1] as string, id)));
          if (validRoute) route = [...candidate];
        }
        showToast('저장된 지점부터 이어서 해요.', 'info');
      }

      // ---- 페이지 뼈대 ----
      const page = document.createElement('div');
      page.className = 'page europe-mission';
      page.dataset.assetId = 'bg.europe';
      // 배경 일러스트가 주인공이라 어둡게 덮지 않는다(가독성 최소한만).
      page.style.backgroundImage = `linear-gradient(rgba(15,30,50,0.34), rgba(15,30,50,0.44)), url('${assetUrl('bg.europe')}')`;
      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);
      const stepNow = stage === 1 ? 0 : secondMode ? 2 : 1;
      const bar = buildTopBar({
        title: c.intro.title,
        subtitle: c.intro.subtitle,
        backTo: '#/map',
        steps: { total: 3, done: stepNow, now: stepNow }
      });
      page.appendChild(bar);
      // 제목은 상단바 리본 한 곳에만. 단계 목표는 그 리본의 부제로 바꿔 쓴다.
      const ribbonSub = bar.querySelector('.ribbon-sub') as HTMLElement;
      const setRibbon = (text: string): void => { ribbonSub.textContent = text; };
      const body = document.createElement('div');
      body.className = 'page-body';
      page.appendChild(body);
      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar mission-dock';
      page.appendChild(bottom);
      root.appendChild(page);

      // ---- 마스코트 가이드 (말풍선 안내 + 탭 큐) ----
      // 2단계에서 왼쪽이 지도라서 가이드는 오른쪽에 세운다.
      const gd = createGuide({ side: 'right' });
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

      const finish = (bestGoals: number, didSecond: boolean) => {
        if (finished) return;
        finished = true;
        const ratios = {
          evidence: 0.4 * (readSet.size / c.sources.length) + 0.6 * (bestGoals / c.goals.length), // 자료 읽기 + 단서를 경로에 반영
          perspective: bestGoals / c.goals.length, // 접근성·주민·보존 관점 충족
          communication: bestGoals >= c.goals.length ? 1 : 0.85, // 목표 3개 = 우수, 2개 = 성공
          revision: didSecond ? 1 : 0.35 // 다른 전략으로 한 번 더 설계했는가
        };
        const result = computeScore(ratios, WEIGHTS, 5 - failedAttempts);
        completeMissionFlow('europe', '유럽', result);
      };

      // ================= 1단계: 자료 읽기·관점 비교 =================
      function renderStage1(): void {
        updateSteps(bar, 3, 0, 0);
        body.replaceChildren();
        let activeSourceId = c.sources.find((source) => !readSet.has(source.id))?.id ?? c.sources[0]?.id ?? '';
        // 읽기 → 비교 두 국면을 한 보드에서 갈아 끼운다(한 화면에 쌓지 않는다).
        const scene = el(`<section class="mission-scene scene-read" aria-label="벨라리바 자료 조사 장면">
          <main class="scene-board">
            <div class="board-title"><h2 data-phase-title>자료 서랍</h2><span class="chip">가상 도시</span></div>
            <div class="source-row" data-source-grid></div>
            <article class="source-viewer" data-source-viewer role="status" aria-live="polite"></article>
            <div class="source-lens" data-compare-buttons role="group" aria-label="비교할 자료 두 개 선택" hidden></div>
            <div class="compare-result" data-compare-result role="status" aria-live="polite" hidden></div>
          </main>
          <aside class="scene-cast" aria-hidden="true">
            ${imageHtml('europe.guide', '', 'cast-hero bob')}
            <div class="cast-props">${stickerImages(['deco.landmark_eiffel', 'europe.heritage', 'deco.accordion'])}</div>
            <p class="cast-note">벨라리바는 학습용 가상 도시예요. 그림은 실제 유럽 사례를 떠올리는 장식이에요.</p>
          </aside>
        </section>`);
        body.appendChild(scene);
        const grid = scene.querySelector('[data-source-grid]') as HTMLElement;
        const sourceViewer = scene.querySelector('[data-source-viewer]') as HTMLElement;
        const phaseTitle = scene.querySelector('[data-phase-title]') as HTMLElement;
        const compareButtons = scene.querySelector('[data-compare-buttons]') as HTMLElement;
        const compareResult = scene.querySelector('[data-compare-result]') as HTMLElement;
        const compareSelection = [...comparedSourceIds].slice(0, 2);

        bottom.replaceChildren();
        const status = el(
          `<span class="chip mission-status" role="status" aria-live="polite">자료 ${readSet.size}/${c.sources.length} · 관점 비교 ${comparisonDone ? '✓' : '○'}</span>`
        );
        const startBtn = el(`<button class="btn btn-primary btn-big">경로 설계</button>`) as HTMLButtonElement;
        bottom.append(status, startBtn);

        const persistSources = () => {
          saveRepo.setCheckpoint('europe', 'sources', {
            read: [...readSet],
            comparedSourceIds: [...comparedSourceIds],
            comparisonDone,
            failedAttempts
          });
        };

        const selectedSources = (): EuropeSource[] =>
          compareSelection.map((id) => c.sources.find((source) => source.id === id)).filter((source): source is EuropeSource => Boolean(source));

        const validComparison = (): boolean => {
          const selected = selectedSources();
          const first = selected[0];
          const second = selected[1];
          if (!first || !second) return false;
          return SOURCE_LENS[first.type]?.side !== SOURCE_LENS[second.type]?.side;
        };

        const paintComparison = () => {
          const allRead = readSet.size === c.sources.length;
          compareButtons.replaceChildren();
          for (const source of c.sources) {
            const selected = compareSelection.includes(source.id);
            const lens = SOURCE_LENS[source.type];
            const button = el(`<button class="card card-pick" aria-pressed="${selected}" ${allRead ? '' : 'disabled'} style="font:inherit">
              <strong>${selected ? '✓ ' : ''}${source.title}</strong><br>
              <span style="color:var(--c-ink-soft)">${lens?.label ?? TYPE_LABEL[source.type] ?? source.type}</span>
            </button>`) as HTMLButtonElement;
            button.addEventListener('click', () => {
              const existing = compareSelection.indexOf(source.id);
              if (existing >= 0) compareSelection.splice(existing, 1);
              else {
                if (compareSelection.length === 2) compareSelection.shift();
                compareSelection.push(source.id);
              }
              if (validComparison()) {
                comparedSourceIds.clear();
                compareSelection.forEach((id) => comparedSourceIds.add(id));
                comparisonDone = true;
                persistSources();
                void audio.playSfx('success');
              }
              paint();
              if (validComparison()) {
                popBounce(compareResult);
                burstConfetti(button);
              }
            });
            compareButtons.appendChild(button);
          }

          if (!allRead) return;
          const selected = selectedSources();
          if (selected.length < 2) {
            compareResult.innerHTML = '<div class="feedback partial"><span aria-hidden="true">◐</span><span>서로 다른 관점의 자료 두 장을 골라 보세요.</span></div>';
            return;
          }
          if (!validComparison()) {
            compareResult.innerHTML = '<div class="feedback retry"><span aria-hidden="true">↻</span><span>비슷한 쪽의 자료를 골랐어요. 역사·보존 자료와 오늘의 생활·이동 자료를 하나씩 비교해 보세요.</span></div>';
            return;
          }
          const [first, second] = selected;
          if (!first || !second) return;
          compareResult.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--sp-3)">
            ${[first, second]
              .map(
                (source) => `<div class="card" style="padding:var(--sp-3)">
                  <p class="chip" style="margin-bottom:6px">${SOURCE_LENS[source.type]?.label ?? TYPE_LABEL[source.type] ?? source.type}</p>
                  <strong>${source.title}</strong>
                  <ul style="padding-left:20px;font-size:var(--fs-small);line-height:1.5">${source.clues.map((clue) => `<li>${clue}</li>`).join('')}</ul>
                </div>`
              )
              .join('')}
          </div>
          <div class="feedback success" style="margin-top:var(--sp-3)"><span aria-hidden="true">✓</span><span>같은 도시도 자료의 관점에 따라 보이는 문제가 달라요.</span></div>`;
        };

        const paint = () => {
          const allRead = readSet.size === c.sources.length;
          status.textContent = `자료 ${readSet.size}/${c.sources.length} · 비교 ${comparisonDone ? '✓' : '○'}`;
          startBtn.disabled = !allRead || !comparisonDone;
          // 국면 전환: 다 읽기 전에는 자료 서랍, 다 읽으면 관점 비교만 보인다.
          phaseTitle.textContent = allRead ? '관점 비교' : '자료 서랍';
          grid.hidden = allRead;
          sourceViewer.hidden = allRead;
          compareButtons.hidden = !allRead;
          compareResult.hidden = !allRead;
          grid.replaceChildren();
          let firstUnread: HTMLElement | null = null;
          for (const s of c.sources) {
            const read = readSet.has(s.id);
            const card = el(`<button class="card card-pick" aria-pressed="${activeSourceId === s.id}">
              <strong>${read ? '✓ ' : ''}${TYPE_LABEL[s.type] ?? s.type}</strong><br><span>${s.title}</span>
            </button>`);
            card.addEventListener('click', () => {
              const wasRead = readSet.has(s.id);
              activeSourceId = s.id;
              readSet.add(s.id);
              persistSources();
              void audio.playSfx(wasRead ? 'tap' : 'pickup');
              paint();
              const activeCard = grid.querySelector<HTMLElement>(`[data-source-id="${s.id}"]`);
              if (!wasRead && activeCard) popBounce(activeCard);
            });
            card.dataset.sourceId = s.id;
            grid.appendChild(card);
            if (!read && !firstUnread) firstUnread = card;
          }
          const activeSource = c.sources.find((source) => source.id === activeSourceId) ?? c.sources[0];
          sourceViewer.innerHTML = activeSource
            ? `<div class="row-between" style="gap:8px"><strong>${activeSource.title}</strong><span class="chip">${TYPE_LABEL[activeSource.type] ?? activeSource.type}</span></div>
               <p style="margin-top:5px">${activeSource.body}</p>
               <p style="margin-top:5px;font-weight:700">핵심 단서 · ${activeSource.clues.join(' · ')}</p>`
            : '<p>위의 자료를 골라 단서를 살펴봐요.</p>';
          paintComparison();
          setRibbon(allRead ? '관점이 다른 자료 두 장을 골라 비교해요' : '자료 네 장을 눌러 단서를 읽어요');
          if (readSet.size < c.sources.length) say('자료 네 장을 모두 읽어야 출발!', firstUnread);
          else if (!comparisonDone) say('관점이 다른 자료 두 장을 골라 비교해요!', compareButtons.querySelector<HTMLElement>('button'));
          else say('비교 완료! 경로 설계를 시작해요!', startBtn);
        };

        startBtn.addEventListener('click', () => {
          if (busy || stage !== 1 || readSet.size < c.sources.length || !comparisonDone) return;
          busy = true;
          try {
            stage = 2;
            saveRepo.setCheckpoint('europe', 'route', {
              read: [...readSet],
              comparedSourceIds: [...comparedSourceIds],
              comparisonDone,
              route: [],
              purpose: null,
              failedAttempts
            });
            renderStage2();
          } finally {
            busy = false;
          }
        });

        paint();
      }

      function openSource(s: EuropeSource, onRead: () => void): void {
        const bodyEl = el(`<div style="display:flex;flex-direction:column;gap:var(--sp-3)">
          <p style="line-height:1.6">${s.body}</p>
          <div>
            <p style="font-weight:700;margin-bottom:6px">단서 메모</p>
            <ul style="padding-left:20px;display:flex;flex-direction:column;gap:4px;font-size:var(--fs-small);line-height:1.5">
              ${s.clues.map((cl) => `<li>${cl}</li>`).join('')}
            </ul>
          </div>
        </div>`);
        openOwnedModal({
          id: `src-${s.id}`,
          title: s.title,
          bodyEl,
          actions: [
            {
              label: '다 읽었어요',
              kind: 'primary',
              autofocus: true,
              onClick: (close) => {
                readSet.add(s.id);
                saveRepo.setCheckpoint('europe', 'sources', {
                  read: [...readSet],
                  comparedSourceIds: [...comparedSourceIds],
                  comparisonDone,
                  failedAttempts
                });
                close();
                onRead();
              }
            }
          ]
        });
      }

      // ================= 2단계: 경로 설계 (+3단계 제출·비교) =================
      function renderStage2(): void {
        updateSteps(bar, 3, secondMode ? 2 : 1, secondMode ? 2 : 1);
        body.replaceChildren();
        setRibbon(secondMode ? '다른 목적으로 두 번째 노선을 설계해요' : '목적을 고르고 세 지점을 이어요');

        let lastSubmittedSignature: string | null = null;
        const routeSignature = (): string => `${secondMode ? 'second' : 'first'}\u0000${purpose ?? ''}\u0000${route.join('\u0000')}`;
        const writeRouteCheckpoint = () => {
          saveRepo.setCheckpoint('europe', secondMode ? 'second_route' : 'route', {
            read: [...readSet],
            comparedSourceIds: [...comparedSourceIds],
            comparisonDone,
            route: [...route],
            purpose,
            failedAttempts,
            ...(firstSnap ? { firstRoute: firstSnap.nodes, firstPurpose: firstSnap.purpose } : {})
          });
        };
        const persistRoute = () => {
          lastSubmittedSignature = null;
          writeRouteCheckpoint();
        };

        const scene = el(`<section class="mission-scene scene-route" aria-label="벨라리바 경로 설계 장면">
          <aside class="scene-cast" aria-hidden="true">
            ${imageHtml('europe.guide', '', 'cast-hero bob')}
            <div class="cast-props">${stickerImages(['deco.landmark_eiffel', 'deco.tulip'])}</div>
            <p class="cast-note">가상 도시예요</p>
          </aside>
          <main class="scene-board map-wrap">
            <div class="board-title"><h2>${c.city.name} 노선판</h2><span class="chip">도보 ━ · 트램 ┅</span></div>
            <div class="map-surface"></div>
          </main>
          <aside class="control-rail" aria-label="경로 목표와 게이지"></aside>
        </section>`);
        body.appendChild(scene);
        const mapWrap = scene.querySelector('.map-wrap') as HTMLElement;
        const mapSurface = scene.querySelector('.map-surface') as HTMLElement;
        const aside = scene.querySelector('.control-rail') as HTMLElement;

        // ---- SVG 지도 ----
        const svg = svgEl('svg', {
          viewBox: `0 0 ${VB_W} ${VB_H}`,
          role: 'group',
          'aria-label': `${c.city.name} 탐방 지도. 지점은 Enter 또는 Space로 연결할 수 있고, 아래에 같은 기능의 글자 버튼도 있어요.`
        });
        svg.classList.add('city-map');
        svg.appendChild(svgEl('rect', { x: '0', y: '0', width: String(VB_W), height: String(VB_H), rx: '26', fill: '#91cdbf' }));
        svg.appendChild(svgEl('path', { d: 'M -20 430 C 180 350, 310 470, 500 390 S 790 300, 990 360', fill: 'none', stroke: '#57a9cf', 'stroke-width': '92', opacity: '.95' }));
        svg.appendChild(svgEl('path', { d: 'M -20 430 C 180 350, 310 470, 500 390 S 790 300, 990 360', fill: 'none', stroke: 'rgba(255,255,255,.45)', 'stroke-width': '7', 'stroke-dasharray': '18 18' }));
        const buildingData: Array<[number, number, number, number, string]> = [
          [90, 70, 115, 78, '#e9c88e'], [690, 72, 120, 88, '#e6a97f'], [740, 405, 124, 72, '#e9d4aa'],
          [85, 330, 100, 72, '#d6b178'], [405, 72, 104, 66, '#e8bf94'], [570, 235, 92, 62, '#d9a783']
        ];
        buildingData.forEach(([x, y, w, h, fill]) => {
          svg.appendChild(svgEl('rect', { x: String(x), y: String(y), width: String(w), height: String(h), rx: '12', fill: String(fill), stroke: '#795f4c', 'stroke-width': '4' }));
          svg.appendChild(svgEl('path', { d: `M ${x - 8} ${y + 8} L ${x + w / 2} ${y - 28} L ${x + w + 8} ${y + 8} Z`, fill: '#a55446', stroke: '#795f4c', 'stroke-width': '4' }));
        });
        const treeSpots: Array<[number, number]> = [[220,110],[850,210],[610,470],[330,465],[895,455]];
        treeSpots.forEach(([x, y]) => {
          svg.appendChild(svgEl('circle', { cx:String(x),cy:String(y),r:'22',fill:'#4d9360',stroke:'#fff','stroke-width':'4' }));
          svg.appendChild(svgEl('rect', { x:String(x-4),y:String(y+18),width:'8',height:'20',fill:'#76543c' }));
        });
        // 이동 가능한 길 + 소요 시간
        for (const e of c.edges) {
          const a = nodeById.get(e.from);
          const b = nodeById.get(e.to);
          if (!a || !b) continue;
          const line = svgEl('line', {
            x1: String(a.x * VB_W), y1: String(a.y * VB_H),
            x2: String(b.x * VB_W), y2: String(b.y * VB_H),
            stroke: 'rgba(255,255,255,0.4)', 'stroke-width': '4',
            'stroke-dasharray': e.mode === 'tram' ? '12 8' : 'none'
          });
          svg.appendChild(line);
          const label = svgEl('text', {
            x: String(((a.x + b.x) / 2) * VB_W),
            y: String(((a.y + b.y) / 2) * VB_H - 8),
            'text-anchor': 'middle', 'font-size': '17', fill: 'rgba(255,255,255,0.85)'
          });
          label.textContent = `${e.minutes}분${e.mode === 'tram' ? '·트램' : ''}`;
          svg.appendChild(label);
        }
        const routeLine = svgEl('polyline', {
          points: '', fill: 'none', stroke: '#F2C14E', 'stroke-width': '8',
          'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: '0.9'
        });
        svg.appendChild(routeLine);

        const nodeRefs = new Map<string, { group: SVGGElement; circle: SVGCircleElement; center: SVGTextElement }>();
        for (const n of c.nodes) {
          const cx = n.x * VB_W;
          const cy = n.y * VB_H;
          const g = svgEl('g', {
            role: 'button',
            tabindex: '0',
            'aria-pressed': 'false',
            'aria-label': `${n.name}, 머무는 시간 ${n.visitMinutes}분. ${n.desc}. Enter 또는 Space로 경로에 추가`
          });
          g.style.cursor = 'pointer';
          const circle = svgEl('circle', { cx: String(cx), cy: String(cy), r: '36', fill: '#FFFDF4', stroke: '#19324D', 'stroke-width': '4' });
          const center = svgEl('text', {
            x: String(cx), y: String(cy + 7), 'text-anchor': 'middle',
            'font-size': '18', 'font-weight': '700', fill: '#19324D', 'pointer-events': 'none'
          });
          center.textContent = `${n.visitMinutes}분`;
          const name = svgEl('text', {
            x: String(cx), y: String(cy + 62), 'text-anchor': 'middle',
            'font-size': '21', 'font-weight': '700', fill: '#fff',
            stroke: 'rgba(15,30,50,0.75)', 'stroke-width': '4', 'paint-order': 'stroke', 'pointer-events': 'none'
          });
          name.textContent = n.name;
          g.append(circle, center, name);
          const tap = () => tapNode(n.id);
          g.addEventListener('click', tap);
          g.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              tap();
            }
          });
          svg.appendChild(g);
          nodeRefs.set(n.id, { group: g, circle, center });
        }
        mapSurface.appendChild(svg);
        mapSurface.appendChild(el(`<span class="map-caption">핀을 순서대로 눌러 노선을 이어요</span>`));

        // ---- 사이드 패널 ----
        const fb = el(`<div></div>`);
        // 탐방 목적은 한 번 고르는 결정이라 레일에 4장을 늘어놓지 않고 모달에서 고른다.
        const purposePanel = el(`<div class="gauge-card row-between">
          <span data-purpose-now>목적 없음</span>
          <button class="btn btn-ghost" data-purpose-open style="min-height:44px;padding:6px 14px">고르기</button>
        </div>`);
        const purposeNow = purposePanel.querySelector('[data-purpose-now]') as HTMLElement;
        const openPurposePicker = (): void => {
          const grid = el(`<div class="purpose-grid" role="group" aria-label="탐방 목적 선택"></div>`);
          for (const option of PURPOSES) {
            const unavailable = secondMode && firstSnap?.purpose === option.id;
            const button = el(`<button class="card card-pick" aria-pressed="${purpose === option.id}" ${unavailable ? 'disabled' : ''} style="font:inherit;text-align:left">
              <strong>${option.label}</strong>
              <p style="font-size:var(--fs-small);color:var(--c-ink-soft);margin-top:4px">${unavailable ? '첫 경로에서 고른 목적이에요.' : option.help}</p>
            </button>`) as HTMLButtonElement;
            button.addEventListener('click', () => {
              if (finished || unavailable) return;
              purpose = option.id;
              fb.replaceChildren();
              void audio.playSfx('tap');
              persistRoute();
              activeModalClose?.();
              updateView();
            });
            grid.appendChild(button);
          }
          const bodyEl = el(`<div></div>`);
          bodyEl.appendChild(grid);
          openOwnedModal({
            id: 'eu-purpose',
            title: secondMode ? '두 번째 탐방 목적' : '이번 탐방 목적',
            bodyEl,
            actions: [{ label: '닫기', kind: 'ghost', onClick: (close) => close() }]
          });
        };
        (purposePanel.querySelector('[data-purpose-open]') as HTMLButtonElement).addEventListener('click', openPurposePicker);
        // 거리 지수는 결과 모달의 비교표에서만 보여 준다(화면 정보 최소화).
        const gauge = el(`<div class="gauge-card">
          <div class="row-between"><span>시간</span><span id="eu-time"></span></div>
          <div class="progress-track" style="margin-top:6px"><div class="progress-fill" id="eu-fill" role="progressbar" aria-label="사용한 탐방 시간" aria-valuemin="0" aria-valuemax="${c.constraints.maxMinutes}" aria-valuenow="0" style="width:0%"></div></div>
          <span id="eu-distance" class="visually-hidden"></span>
        </div>`);
        const timeText = gauge.querySelector('#eu-time') as HTMLElement;
        const gaugeFill = gauge.querySelector('#eu-fill') as HTMLElement;
        const distanceText = gauge.querySelector('#eu-distance') as HTMLElement;

        const checks = el(`<div class="goal-list" role="status" aria-live="polite"></div>`);
        const visitRow = el(`<div></div>`);
        const timeRow = el(`<div></div>`);
        const purposeRow = el(`<div></div>`);
        checks.append(visitRow, timeRow, purposeRow);
        const goalMarks = new Map<string, HTMLElement>();
        for (const g of c.goals) {
          const rowEl = el(`<div>
            <span style="font-weight:700"><span data-mark>◐</span> ${g.label}</span>
            <span class="visually-hidden">${g.check}</span>
          </div>`);
          goalMarks.set(g.id, rowEl.querySelector('[data-mark]') as HTMLElement);
          checks.appendChild(rowEl);
        }
        const routeText = el(`<p class="text-oneline" style="font-size:var(--fs-small);line-height:1.4"></p>`);
        const nodeButtons = el(
          `<div role="group" aria-label="지도 지점 대체 선택" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px"></div>`
        );
        const nodeButtonRefs = new Map<string, HTMLButtonElement>();
        for (const node of c.nodes) {
          const button = el(`<button class="card card-pick" aria-pressed="false" style="text-align:left;font:inherit;font-size:var(--fs-small);padding:var(--sp-2);min-height:var(--touch-min)">
            <strong>${node.name}</strong><br><span style="color:var(--c-ink-soft)">머무름 ${node.visitMinutes}분</span>
          </button>`) as HTMLButtonElement;
          button.addEventListener('click', () => tapNode(node.id));
          nodeButtons.appendChild(button);
          nodeButtonRefs.set(node.id, button);
        }
        // 지점 글자 버튼 · 길 목록 · 자료 단서는 레일에 쌓지 않고 '자료' 버튼 → 모달 한 곳으로 모은다.
        const toolsBtn = el(`<button class="btn btn-ghost" style="align-self:stretch">자료</button>`);
        toolsBtn.addEventListener('click', () => {
          const bodyEl = el(`<div style="display:flex;flex-direction:column;gap:var(--sp-4)">
            <section>
              <h3 style="margin-bottom:var(--sp-2)">지점 고르기</h3>
              <div data-node-slot></div>
            </section>
            <section>
              <h3 style="margin-bottom:var(--sp-2)">길과 이동 시간</h3>
              <ul style="padding-left:20px;font-size:var(--fs-small);line-height:1.6">
                ${c.edges
                  .map((edge) => {
                    const from = nodeById.get(edge.from)?.name ?? edge.from;
                    const to = nodeById.get(edge.to)?.name ?? edge.to;
                    return `<li>${from} ↔ ${to}: ${edge.minutes}분${edge.mode === 'tram' ? ' (트램)' : ' (도보)'}</li>`;
                  })
                  .join('')}
              </ul>
            </section>
            <section>
              <h3 style="margin-bottom:var(--sp-2)">단서 메모</h3>
              ${c.sources
                .map(
                  (s) => `<div class="card" style="padding:var(--sp-3);margin-bottom:var(--sp-2)">
                    <strong>${s.title}</strong>
                    <ul style="padding-left:18px;font-size:var(--fs-small);line-height:1.5;margin-top:4px">${s.clues.map((cl) => `<li>${cl}</li>`).join('')}</ul>
                  </div>`
                )
                .join('')}
            </section>
          </div>`);
          (bodyEl.querySelector('[data-node-slot]') as HTMLElement).appendChild(nodeButtons);
          openOwnedModal({
            id: 'eu-tools',
            title: '지점 · 길 · 단서',
            bodyEl,
            actions: [{ label: '닫기', kind: 'primary', autofocus: true, onClick: (close) => close() }]
          });
        });
        aside.append(purposePanel, gauge, checks, fb, routeText, toolsBtn);

        // ---- 하단 바 ----
        bottom.replaceChildren();
        const status = el(
          `<span class="chip mission-status">${secondMode ? '다른 목적으로 두 번째 경로' : `${c.constraints.maxMinutes}분 안에 ${c.constraints.mustVisitCount}곳 이상`}</span>`
        );
        const btns = el(`<div style="display:flex;gap:var(--sp-3)"></div>`);
        const resetBtn = el(`<button class="btn btn-ghost">처음부터</button>`) as HTMLButtonElement;
        const submitBtn = el(`<button class="btn btn-primary btn-big" disabled>경로 제출</button>`) as HTMLButtonElement;
        btns.append(resetBtn, submitBtn);
        bottom.append(status, btns);

        const updateView = () => {
          purposeNow.textContent = purpose ? `목적 · ${purposeLabel(purpose)}` : '목적 없음';
          for (const n of c.nodes) {
            const ref = nodeRefs.get(n.id);
            if (!ref) continue;
            const idx = route.indexOf(n.id);
            ref.circle.setAttribute('fill', idx >= 0 ? '#F2C14E' : '#FFFDF4');
            ref.circle.setAttribute('stroke', idx >= 0 ? '#C69A2E' : '#19324D');
            ref.center.textContent = idx >= 0 ? String(idx + 1) : `${n.visitMinutes}분`;
            ref.center.setAttribute('font-size', idx >= 0 ? '30' : '18');
            ref.group.setAttribute('aria-pressed', String(idx >= 0));
            ref.group.setAttribute(
              'aria-label',
              `${n.name}, 머무는 시간 ${n.visitMinutes}분. ${n.desc}. ${idx >= 0 ? `경로 ${idx + 1}번째, 다시 누르면 취소` : '경로에 추가'}`
            );
            const nodeButton = nodeButtonRefs.get(n.id);
            if (nodeButton) {
              nodeButton.classList.toggle('is-selected', idx >= 0);
              nodeButton.setAttribute('aria-pressed', String(idx >= 0));
              nodeButton.innerHTML = `<strong>${idx >= 0 ? `✓ ${idx + 1}. ` : ''}${n.name}</strong><br><span style="color:var(--c-ink-soft)">머무름 ${n.visitMinutes}분</span>`;
            }
          }
          routeLine.setAttribute(
            'points',
            route
              .map((id) => {
                const n = nodeById.get(id);
                return n ? `${n.x * VB_W},${n.y * VB_H}` : '';
              })
              .filter(Boolean)
              .join(' ')
          );
          const total = routeMinutes(route);
          const distance = routeDistanceIndex(route);
          const over = total > c.constraints.maxMinutes;
          timeText.textContent = `${total}분 / ${c.constraints.maxMinutes}분`;
          distanceText.textContent = `${distance}`;
          timeText.style.color = over ? 'var(--c-coral)' : '';
          gaugeFill.style.width = `${Math.min(100, (total / c.constraints.maxMinutes) * 100)}%`;
          gaugeFill.style.background = over ? 'var(--c-coral)' : '';
          gaugeFill.setAttribute('aria-valuenow', String(Math.min(total, c.constraints.maxMinutes)));
          gaugeFill.setAttribute('aria-valuetext', `${total}분 사용, 제한 ${c.constraints.maxMinutes}분`);
          const enough = route.length >= c.constraints.mustVisitCount;
          visitRow.textContent = `${enough ? '✓' : '◐'} 지점 ${route.length}/${c.constraints.mustVisitCount}`;
          visitRow.style.color = enough ? '#17573d' : '#6b4a00';
          timeRow.textContent = `${over ? '◐' : '✓'} ${c.constraints.maxMinutes}분 이내`;
          timeRow.style.color = over ? '#6b4a00' : '#17573d';
          const met = goalsMetFor(route, tagSets);
          const purposeOkay = purpose ? purposeMetFor(route, purpose, met, tagSets) : false;
          purposeRow.textContent = purpose ? `${purposeOkay ? '✓' : '◐'} 목적 조건` : '○ 목적 먼저';
          purposeRow.style.color = purposeOkay ? '#17573d' : '#6b4a00';
          for (const g of c.goals) {
            const mark = goalMarks.get(g.id);
            if (!mark) continue;
            const ok = met[g.id] === true;
            mark.textContent = ok ? '✓' : '◐';
            mark.style.color = ok ? '#17573d' : '#6b4a00';
          }
          routeText.textContent = route.length
            ? `${route.map((id) => nodeById.get(id)?.name ?? '').join(' → ')}`
            : '지도의 동그라미를 눌러 보세요.';
          // 마지막 지점 설명은 핀의 aria-label 과 '지점 버튼' 목록에 이미 있어 화면에서는 뺀다.
          status.textContent = `${route.length}/${c.constraints.mustVisitCount}곳 · ${c.constraints.maxMinutes}분 안`;
          submitBtn.disabled =
            !purpose || route.length < c.constraints.mustVisitCount || lastSubmittedSignature === routeSignature();
          if (!purpose) {
            say(secondMode ? '다른 목적으로 한 번 더 가 볼까요?' : '이번 탐방 목적을 먼저 골라요!', purposePanel.querySelector<HTMLElement>('[data-purpose-open]'));
          } else if (!submitBtn.disabled) {
            say('경로가 다 되면 제출을 눌러요!', submitBtn);
          } else {
            say('지도의 동그라미를 눌러 길을 이어요!', mapWrap);
          }
        };

        function tapNode(id: string): void {
          if (finished) return;
          if (!purpose) {
            showToast('먼저 탐방 목적을 골라 주세요.', 'warn');
            return;
          }
          const last = route[route.length - 1];
          if (last === id) {
            route.pop(); // 마지막 지점 취소
            void audio.playSfx('pickup');
          } else if (route.includes(id)) {
            showToast('이미 지나간 곳이에요. 마지막 지점부터 취소할 수 있어요.', 'warn');
            return;
          } else if (route.length > 0 && last && !edgeMin.has(edgeKey(last, id))) {
            showToast('두 곳을 잇는 길이 없어요. 이어진 곳을 골라 보세요.', 'warn');
            return;
          } else {
            route.push(id);
            void audio.playSfx('drop');
          }
          persistRoute();
          updateView();
          const nodeFx = nodeRefs.get(id)?.group as unknown as HTMLElement | undefined;
          if (nodeFx && route.includes(id)) popBounce(nodeFx);
        }

        resetBtn.addEventListener('click', () => {
          if (finished) return;
          void audio.playSfx('tap');
          route = [];
          fb.replaceChildren();
          persistRoute();
          updateView();
        });

        const goalTable = (snap: RouteSnap): string => `
          <p style="font-weight:700;margin-bottom:4px">${snap.nodes.map((id) => nodeById.get(id)?.name ?? '').join(' → ')}</p>
          <p style="font-size:var(--fs-small);margin-bottom:6px">목적 ‘${purposeLabel(snap.purpose)}’ · 총 ${snap.minutes}분 · 지도상 거리 지수 ${snap.distanceIndex} · 목표 ${snap.metCount}/${c.goals.length}개 충족</p>
          <table style="border-collapse:collapse;font-size:var(--fs-small)">
            ${c.goals
              .map(
                (g) => `<tr>
                  <td style="padding:2px 10px 2px 0">${g.label}</td>
                  <td style="font-weight:700;color:${snap.met[g.id] ? '#17573d' : '#6b4a00'}">${snap.met[g.id] ? '✓ 충족' : '◐ 아직'}</td>
                </tr>`
              )
              .join('')}
          </table>`;

        const showFirstResult = (snap: RouteSnap) => {
          const bodyEl = el(`<div style="display:flex;flex-direction:column;gap:var(--sp-3)">
            <div class="feedback success"><span aria-hidden="true" style="font-size:1.4em">✓</span><span>${
              snap.metCount >= c.goals.length ? '우수 경로예요! ' : ''
            }${c.feedback.good}</span></div>
            <div class="card" style="padding:12px">${goalTable(snap)}</div>
            <p style="font-size:var(--fs-small)">이제 다른 목적을 골라 두 번째 경로를 만든 뒤, 시간·거리·충족 목표를 비교해 보세요.</p>
          </div>`);
          openOwnedModal({
            id: 'eu-first-result',
            title: '첫 번째 경로 완성!',
            bodyEl,
            dismissible: false,
            actions: [
              {
                label: '두 번째 경로',
                kind: 'primary',
                autofocus: true,
                onClick: (close) => {
                  close();
                  firstSnap = snap;
                  secondMode = true;
                  route = [];
                  purpose = null;
                  saveRepo.setCheckpoint('europe', 'second_route', {
                    firstRoute: snap.nodes,
                    firstPurpose: snap.purpose,
                    read: [...readSet],
                    comparedSourceIds: [...comparedSourceIds],
                    comparisonDone,
                    route: [],
                    purpose: null,
                    failedAttempts
                  });
                  renderStage2();
                }
              }
            ]
          });
        };

        const showComparison = (second: RouteSnap) => {
          const first = firstSnap;
          if (!first) return;
          const bestGoals = Math.max(first.metCount, second.metCount);
          const timeDelta = second.minutes - first.minutes;
          const distanceDelta = second.distanceIndex - first.distanceIndex;
          const deltaText = (value: number, unit: string): string =>
            value === 0 ? `같음` : `${Math.abs(value)}${unit} ${value < 0 ? '줄어듦' : '늘어남'}`;
          const bodyEl = el(`<div style="display:flex;flex-direction:column;gap:var(--sp-3)">
            <p>같은 도시에서도 무엇을 중요하게 보느냐에 따라 좋은 경로가 달라져요. 두 경로를 비교해 볼까요?</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--sp-3)">
              <div class="card" style="padding:12px"><p class="chip" style="margin-bottom:6px">첫 번째 경로</p>${goalTable(first)}</div>
              <div class="card" style="padding:12px"><p class="chip" style="margin-bottom:6px">두 번째 경로</p>${goalTable(second)}</div>
            </div>
            <div class="panel" role="status" style="padding:12px">
              <strong>바뀐 점</strong>
              <p style="margin-top:4px">목적: ${purposeLabel(first.purpose)} → ${purposeLabel(second.purpose)} · 시간: ${deltaText(timeDelta, '분')} · 지도상 거리 지수: ${deltaText(distanceDelta, '')}</p>
            </div>
            <div class="feedback success"><span aria-hidden="true" style="font-size:1.4em">✓</span><span>전략을 바꿔 경로를 다시 설계해 봤어요. 이게 바로 '전략 수정'이에요!</span></div>
          </div>`);
          openOwnedModal({
            id: 'eu-compare',
            title: '두 경로 비교',
            bodyEl,
            dismissible: false,
            actions: [
              {
                label: '미션 완료',
                kind: 'primary',
                autofocus: true,
                onClick: (close) => {
                  close();
                  finish(bestGoals, true);
                }
              }
            ]
          });
        };

        submitBtn.addEventListener('click', () => {
          if (busy || finished || submitBtn.disabled) return;
          const submissionSignature = routeSignature();
          if (lastSubmittedSignature === submissionSignature) return;
          lastSubmittedSignature = submissionSignature;
          busy = true;
          submitBtn.disabled = true;
          try {
            if (!purpose) {
              showToast('탐방 목적을 먼저 골라 주세요.', 'warn');
              return;
            }
            if (route.length < c.constraints.mustVisitCount) {
              showToast(`${c.constraints.mustVisitCount}곳 이상 방문하는 경로를 만들어 주세요.`, 'warn');
              return;
            }
            const total = routeMinutes(route);
            if (total > c.constraints.maxMinutes) {
              failedAttempts++;
              writeRouteCheckpoint();
              showFeedback(fb, 'retry', c.feedback.overTime, 'europe');
              return;
            }
            const snap = snapFor([...route], purpose);
            if (snap.metCount < 2) {
              failedAttempts++;
              writeRouteCheckpoint();
              showFeedback(fb, 'partial', c.feedback.goalMissed, 'europe');
              return;
            }
            if (!purposeMetFor(snap.nodes, snap.purpose, snap.met, tagSets)) {
              failedAttempts++;
              writeRouteCheckpoint();
              const selectedPurpose = PURPOSES.find((option) => option.id === snap.purpose);
              showFeedback(
                fb,
                'partial',
                `시간 안에는 들어왔지만 ‘${purposeLabel(snap.purpose)}’ 목적의 조건이 아직 부족해요. ${selectedPurpose?.help ?? '지점을 다시 살펴보세요.'}`,
                'europe'
              );
              return;
            }
            if (secondMode) {
              if (firstSnap && firstSnap.purpose === snap.purpose) {
                showToast('첫 번째와 다른 탐방 목적을 골라 주세요.', 'warn');
                return;
              }
              if (firstSnap && firstSnap.nodes.join('|') === snap.nodes.join('|')) {
                showToast('첫 번째 경로와 똑같아요. 지점이나 순서를 바꿔 볼까요?', 'warn');
                return;
              }
              showComparison(snap);
            } else {
              showFirstResult(snap);
            }
            popBounce(gauge);
            burstConfetti(submitBtn);
            void audio.playSfx('success');
          } finally {
            busy = false;
            updateView();
          }
        });

        updateView();
        if (!purpose) openPurposePicker(); // 목적을 고르기 전에는 지도를 눌러도 진행되지 않으므로 먼저 띄운다
      }

      if (stage === 1) renderStage1();
      else renderStage2();
    },

    unmount() {
      disposed = true;
      guide?.dispose();
      guide = null;
      activeModalClose?.();
      activeModalClose = null;
    }
  };
}
