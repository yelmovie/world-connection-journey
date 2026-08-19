import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo, recomputeUnlocks } from '../core/SaveRepository';
import { createPhaserHost, GAME_H, GAME_W, type PhaserHost } from '../core/phaserHost';
import { buildTopBar } from '../ui/chrome';
import { createGuide, type GuideController } from '../ui/guide';
import { burstConfetti, stampSlam } from '../ui/fx';
import {
  cancelJourneyTransition,
  consumeMissionReturn,
  playJourneyTransition
} from '../ui/journeyTransition';
import { readLearnCard } from '../ui/learnFrame';
import { CONTINENT_IDS, type MissionId, type MissionStatus } from '../types';

interface Spot {
  id: MissionId;
  name: string;
  route: string;
  /** 학습 주제 2~6자 — 지도가 "무엇을 배우는 지도"로 읽히게 노드·안내판에 표시 */
  topic: string;
  objective: string;
  steps: [string, string, string];
  minutes: number;
  x: number;
  y: number;
  assetId: string;
  assetAlt: string;
}

/** 화살표키 탐색 순서와 지도 번호가 같다. */
const SPOTS: Spot[] = [
  {
    id: 'americas', name: '아메리카', route: '#/mission/americas', topic: '함께 정하기', minutes: 8,
    objective: '친구들의 필요를 살펴 함께할 하루를 계획해요.',
    steps: ['친구 자료 관찰', '두 계획 비교', '근거로 일정 완성'],
    x: 0.15, y: 0.44, assetId: 'deco.landmark_liberty', assetAlt: '아메리카 미션의 자유의 여신상'
  },
  {
    id: 'europe', name: '유럽', route: '#/mission/europe', topic: '유산과 오늘', minutes: 8,
    objective: '문화유산과 오늘의 생활을 잇는 여행 경로를 만들어요.',
    steps: ['자료 살펴보기', '경로 이어 보기', '선택 근거 말하기'],
    x: 0.49, y: 0.24, assetId: 'deco.landmark_eiffel', assetAlt: '유럽 미션의 에펠탑'
  },
  {
    id: 'africa', name: '아프리카', route: '#/mission/africa', topic: '소리로 대화', minutes: 7,
    objective: '서로의 소리를 듣고 리듬 대화를 완성해요.',
    steps: ['악기 소리 듣기', '리듬 차례 맞추기', '주고받는 연주 완성'],
    x: 0.51, y: 0.53, assetId: 'deco.landmark_pyramid', assetAlt: '아프리카 미션의 피라미드'
  },
  {
    id: 'asia', name: '아시아', route: '#/mission/asia', topic: '하루와 생활', minutes: 8,
    objective: '하루 자료에서 사실과 나의 해석을 구분해요.',
    steps: ['생활 장면 관찰', '사실과 해석 분류', '새 근거로 생각 수정'],
    x: 0.73, y: 0.36, assetId: 'deco.landmark_taj', assetAlt: '아시아 미션의 타지마할'
  },
  {
    id: 'oceania', name: '오세아니아', route: '#/mission/oceania', topic: '환경과 공동체', minutes: 9,
    objective: '여러 관점으로 섬과 바다를 지키는 선택을 해요.',
    steps: ['네 관점 듣기', '3턴 선택하기', '지표 변화 돌아보기'],
    x: 0.84, y: 0.71, assetId: 'deco.landmark_sydney', assetAlt: '오세아니아 미션의 시드니 오페라하우스'
  },
  {
    id: 'dialogue', name: '다름을 잇는 대화', route: '#/mission/respect-dialogue', topic: '존중 대화', minutes: 7,
    objective: '관찰하고 물어보며 존중하는 대화를 완성해요.',
    steps: ['상황 관찰', '공감 질문 선택', '생각을 고쳐 말하기'],
    x: 0.51, y: 0.85, assetId: 'deco.portal_globe', assetAlt: '마지막 존중 대화 미션으로 가는 지구본 문'
  }
];

/** 배움 카드 칩 아이콘 (이모지 금지 — §6) */
const SVG_CARD = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 9h6M9 13h6"/></svg>`;

const STATUS_LABEL: Record<MissionStatus, string> = {
  locked: '다섯 대륙 완료 후 열림',
  available: '지금 도전 가능',
  in_progress: '이어서 할 수 있음',
  completed: '완료'
};

const MAP_CSS = `
.map-page { background: linear-gradient(#0e2440, #19324d); }
/* 리본 제목이 화면 위로 잘리지 않게 */
.map-page .top-bar { height:auto;min-height:var(--top-bar-h);padding-block:var(--sp-2); }
.map-layout {
  min-height: 0; width: 100%; max-width: 1440px; margin: 0 auto;
  display: grid; grid-template-columns: var(--map-progress-w) minmax(0, 1fr) var(--map-brief-w);
  gap: var(--scene-gap); padding: var(--sp-2) var(--scene-safe);
  overflow: hidden;
}
/* §7 반투명 패널 — 배경 지도가 비쳐 보이게 */
.map-layout .scene-board, .map-layout .mission-brief {
  background: rgba(255,252,240,.9); backdrop-filter: blur(6px);
}
.map-progress { display:flex;flex-direction:column;gap:var(--sp-2);padding:var(--sp-3);overflow:hidden; }
.map-progress h2 { color:var(--c-navy);font-size:var(--fs-title);line-height:1.05; }
.map-progress__count { display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-small);font-weight:700; }
/* progress-track은 flex:1이 기본이라 세로 배치에서 빈 큰 박스로 늘어난다 — 높이를 고정한다 */
.map-progress .progress-track { flex:0 0 12px;width:100%; }
.map-progress__reward { margin-top:auto;display:grid;grid-template-columns:48px 1fr;gap:var(--sp-2);align-items:center;padding:var(--sp-2);background:rgba(255,255,255,.92);border-radius:14px;border:2px solid var(--c-line); }
.map-progress__reward img { width:48px;height:48px;object-fit:contain; }
.map-progress__reward p { font-size:var(--fs-small);font-weight:800;color:var(--c-navy); }
.map-progress__reward .btn { grid-column:1/-1;width:100%;padding:7px 9px; }
/* 지도는 "패널"이 아니라 배경 일러스트 자체다 — 창처럼 덮지 않고 테두리만 둔다 */
.map-world {
  position:relative;isolation:isolate;background:#12395e;min-width:0;min-height:0;
  border:2px solid rgba(227,211,166,.55);border-radius:var(--radius-l);overflow:hidden;
  box-shadow:var(--shadow-card);
}
.map-canvas,.map-overlay { position:absolute;inset:0; }
.map-canvas { z-index:var(--z-canvas);touch-action:none; }
.map-overlay { z-index:var(--z-overlay);pointer-events:none; }
.map-route-layer { position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none; }
.map-route-shadow { fill:none;stroke:rgba(25,50,77,.45);stroke-width:1.3; }
.map-route-focus { fill:none;stroke:#f2c14e;stroke-width:.75;stroke-linecap:round;stroke-dasharray:2.2 1.5;opacity:0;filter:drop-shadow(0 0 3px rgba(242,193,78,.9)); }
.map-route-focus.is-lit { opacity:1;animation:map-route-dash 650ms linear 1; }
@keyframes map-route-dash { from{stroke-dashoffset:10}to{stroke-dashoffset:0} }
.map-hotspot { position:absolute!important;transform:translate(-50%,-50%);pointer-events:auto!important;--node-size:84px; }
.map-hotspot .node-img { background:#d7ecfb; }
.map-hotspot[data-state="locked"] { filter:grayscale(.8) brightness(.75); }
.map-hotspot[data-state="available"] .node-label { border-color:var(--c-coral); }
.map-hotspot[data-state="in_progress"] .node-label { border-color:var(--c-violet); }
.map-hotspot[data-state="completed"] .node-label { background:var(--c-success);color:#fff;border-color:#17633f; }
/* 라벨 겹침 원천 차단: 고른 대륙만 이름표를 보여 주고, 나머지는 그림+번호로 안내한다.
   대륙 이름은 오른쪽 안내판과 aria-label에 그대로 남는다. */
.map-hotspot .node-label { display:none; }
.map-hotspot.is-selected .node-label { display:block;font-size:var(--fs-small); }
.map-node-check { position:absolute;right:-4px;top:0;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--c-success);color:#fff;border:2px solid #fff;font-weight:900; }
/* 노드 라벨 2행: 대륙명 + 학습 주제 — "무엇을 배우는 지도"로 읽히게 */
.map-hotspot .node-topic { display:block;font-size:calc(var(--fs-small)*.85);font-weight:700;color:var(--c-ink-soft);line-height:1.15;white-space:nowrap; }
.map-hotspot[data-state="completed"] .node-topic { color:#eaf7ef; }
/* 완료 노드의 배움 카드 획득 칩 */
.map-node-learn { position:absolute;left:-4px;top:0;display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:var(--c-gold);color:#5b430a;border:2px solid #fff;box-shadow:var(--shadow-card); }
.map-world-deco { position:absolute;z-index:3;pointer-events:none;filter:drop-shadow(0 8px 18px rgba(0,0,0,.3)); }
.map-world-deco.globe { right:2%;bottom:2%;width:clamp(58px,8vw,105px);opacity:.88; }
.map-world-deco.jet { left:3%;top:4%;width:clamp(52px,7vw,90px); }
.map-brief { height:100%;overflow:hidden; }
.map-brief__head { display:grid;grid-template-columns:64px 1fr;gap:9px;align-items:center; }
.map-brief__head .mission-brief__hero { width:64px;height:64px;aspect-ratio:1;border-radius:50%;border:3px solid #fff;box-shadow:var(--shadow-card); }
.map-brief__head h2 { color:var(--c-navy);font-size:var(--fs-title);line-height:1.05; }
.map-brief__meta { font-size:var(--fs-small);color:var(--c-ink-soft);font-weight:700; }
.map-brief__topic {
  display:inline-block;vertical-align:middle;margin-left:6px;padding:1px 10px;border-radius:999px;
  background:rgba(242,193,78,.24);border:2px solid rgba(242,193,78,.75);color:#6f5514;
  font-size:var(--fs-small);font-family:var(--font-head);white-space:nowrap;
}
.map-brief__learned { display:flex;align-items:center;gap:6px;font-size:var(--fs-small);font-weight:800;color:#6f5514; }
.map-brief__learned .map-node-learn { position:static;flex:0 0 auto; }
.map-brief__status { display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:3px 9px;border-radius:999px;background:#fff;border:2px solid var(--c-line);font-size:16px;font-weight:800; }
.map-brief__status::before { content:'●';color:var(--c-violet); }
.map-brief__stamp img { width:44px;height:44px;object-fit:contain; }
.map-brief__stamp { display:flex;align-items:center;gap:8px;font-size:var(--fs-small);font-weight:800; }
.map-live { position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%); }
@media (max-width:1100px), (max-height:620px) {
  .map-layout { padding-block:6px 8px; }
  .map-progress { padding:9px;gap:6px; }
  .stamp-collection { gap:4px; }
  .stamp-collection__slot { min-width:42px;border-radius:10px; }
  .map-progress__reward { grid-template-columns:42px 1fr;padding:5px; }
  .map-progress__reward img { width:42px;height:42px; }
  .map-progress__reward p { font-size:16px; }
  .map-hotspot { --node-size:64px; }
  .map-hotspot.is-selected .node-label { padding:3px 9px; }
  .map-hotspot .node-badge { width:26px;height:26px;font-size:16px; }
  .map-brief__head { grid-template-columns:52px 1fr; }
  .map-brief__head .mission-brief__hero { width:52px;height:52px; }
  .map-brief__status { min-height:34px;padding:2px 7px;font-size:16px; }
  .map-brief__stamp img { width:34px;height:34px; }
}
@media (max-width:900px) {
  /* 지도가 주인공이다 — 아래로 접힌 안내판이 지도 높이를 뺏지 않게 지도에 최소 높이를 준다 */
  .map-layout { grid-template-columns:176px minmax(0,1fr);grid-template-rows:minmax(180px,1fr) auto; }
  .map-brief { grid-column:1/-1;height:auto;display:grid;grid-template-columns:1fr 1.45fr auto;align-items:center;gap:10px; }
  .map-brief__steps,.map-brief__stamp { display:none; }
  .map-brief .btn-primary { width:auto;min-width:190px; }
}
@media (max-width:600px) {
  .map-layout { grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto;padding:6px 10px; }
  .map-progress { display:none; }
  .map-world { min-height:0;background-position:center;background-size:cover; }
  .map-canvas,.map-route-layer,.map-world-deco { display:none; }
  .map-overlay { position:relative!important;inset:auto!important;width:100%!important;height:100%!important;padding:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-content:start;overflow-y:auto;pointer-events:auto; }
  .map-hotspot { position:relative!important;left:auto!important;top:auto!important;transform:none!important;width:100%;min-height:56px;--node-size:50px;display:grid;grid-template-columns:50px 1fr; }
  .map-hotspot .node-img { width:50px;height:50px;grid-row:1/3; }
  .map-hotspot .node-badge { display:none; }
  /* 목록 모드에서는 이름표가 유일한 단서다 — 전부 다시 보여 준다 */
  .map-hotspot .node-label { display:block;white-space:normal;width:100%; }
  .map-brief { grid-template-columns:1fr auto;padding:8px; }
  .map-brief__head { display:none; }
  .map-brief__objective { font-size:16px; }
  .map-brief .btn-primary { min-width:168px; }
}
@media (prefers-reduced-motion:reduce) { .map-route-focus.is-lit { animation:none; } }
:root[data-reduced-motion="true"] .map-route-focus.is-lit { animation:none; }
`;

export function createPage(): Page {
  let host: PhaserHost | null = null;
  let flyTo: ((x: number, y: number) => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let compactMedia: MediaQueryList | null = null;
  let compactListener: ((event: MediaQueryListEvent) => void) | null = null;
  let guide: GuideController | null = null;
  let celebrateTimer: number | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      compactMedia = window.matchMedia('(max-width:600px)');
      const compact = compactMedia.matches;
      const preloadIds = [
        'bg.map', 'plane.explorer', 'plane.jet', 'prop.globe_glow', 'deco.portal_globe',
        'prop.stamp', ...SPOTS.map((spot) => spot.assetId)
      ];
      await preloadImages(preloadIds);
      audio.playBgm('main');

      const save = saveRepo.get();
      recomputeUnlocks(save);
      const doneContinents = CONTINENT_IDS.filter((id) => save.missions[id].status === 'completed');
      const doneMissions = SPOTS.filter((spot) => save.missions[spot.id].status === 'completed');
      const availableSpots = SPOTS.filter((spot) => save.missions[spot.id].status !== 'locked');
      const recommended = availableSpots.find((spot) => ['in_progress', 'available'].includes(save.missions[spot.id].status))
        ?? availableSpots[availableSpots.length - 1]
        ?? SPOTS[0]!;

      const page = document.createElement('div');
      page.className = 'page map-page';
      const style = document.createElement('style');
      style.textContent = MAP_CSS;
      page.appendChild(style);
      page.appendChild(buildTopBar({
        title: '세계 항로 지도',
        subtitle: '대륙을 고르고 오른쪽 출발 버튼을 눌러요',
        backTo: '#/',
        showPassport: true
      }));

      const layout = document.createElement('main');
      layout.className = 'page-body map-layout';
      layout.innerHTML = `
        <aside class="scene-board map-progress" aria-label="탐험 진행판">
          <h2>나의 여행</h2>
          <div class="map-progress__count"><span>대륙 도장</span><strong>${doneContinents.length} / 5</strong></div>
          <div class="progress-track" role="progressbar" aria-label="대륙 여행 진행" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${doneContinents.length}"><div class="progress-fill" style="width:${doneContinents.length * 20}%"></div></div>
          <p style="font-size:var(--fs-small);font-weight:800;color:var(--c-ink-soft)">스탬프 컬렉션</p>
          <div class="stamp-collection">
            ${SPOTS.map((spot) => stampSlotHtml(spot, save.missions[spot.id].status === 'completed')).join('')}
          </div>
          <div class="map-progress__reward">
            ${hasAsset(save.completion.unlocked ? 'deco.portal_globe' : 'prop.globe_glow') ? `<img src="${assetUrl(save.completion.unlocked ? 'deco.portal_globe' : 'prop.globe_glow')}" data-asset-id="${save.completion.unlocked ? 'deco.portal_globe' : 'prop.globe_glow'}" alt="">` : ''}
            <p>${save.completion.unlocked ? '최종 세계 연결 보드가 열렸어요!' : `다음 지구본 조각까지 ${Math.max(0, 5 - doneContinents.length)}개 남았어요.`}</p>
            ${save.completion.unlocked ? '<button class="btn btn-success" data-act="completion">완주 기록 보기</button>' : ''}
          </div>
        </aside>
        <section class="map-world" aria-label="세계 대륙 미션 지도">
          <div class="map-canvas"></div>
          <div class="map-overlay" role="radiogroup" aria-label="여행할 대륙 선택">
            <svg class="map-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path class="map-route-shadow"></path><path class="map-route-focus"></path>
            </svg>
          </div>
          ${hasAsset('plane.jet') ? `<img class="map-world-deco jet" src="${assetUrl('plane.jet')}" data-asset-id="plane.jet" alt="" aria-hidden="true">` : ''}
          ${hasAsset('prop.globe_glow') ? `<img class="map-world-deco globe" src="${assetUrl('prop.globe_glow')}" data-asset-id="prop.globe_glow" alt="" aria-hidden="true">` : ''}
        </section>
        <aside class="mission-brief map-brief" aria-label="선택한 미션 안내"></aside>
        <p class="map-live" aria-live="polite"></p>`;
      page.appendChild(layout);
      root.appendChild(page);

      const progressPanel = layout.querySelector('.map-progress') as HTMLElement;
      const world = layout.querySelector('.map-world') as HTMLElement;
      const canvasWrap = layout.querySelector('.map-canvas') as HTMLElement;
      const overlay = layout.querySelector('.map-overlay') as HTMLElement;
      const brief = layout.querySelector('.map-brief') as HTMLElement;
      const live = layout.querySelector('.map-live') as HTMLElement;
      const routeShadow = overlay.querySelector('.map-route-shadow') as SVGPathElement;
      const routeFocus = overlay.querySelector('.map-route-focus') as SVGPathElement;
      const nodeById = new Map<MissionId, HTMLButtonElement>();
      let selectedId = recommended.id;

      layout.querySelector('[data-act="completion"]')?.addEventListener('click', () => navigate('#/completion'));
      guide = createGuide({ assetId: hasAsset('plane.explorer') ? 'plane.explorer' : 'plane.main' });
      page.appendChild(guide.el);

      const lastDone = [...SPOTS].reverse().find((spot) => save.missions[spot.id].status === 'completed');
      const routeStart = lastDone ?? { x: 0.5, y: 0.88 };

      const updateRoute = (spot: Spot) => {
        const cx = (routeStart.x + spot.x) / 2;
        const cy = Math.max(8, Math.min(routeStart.y, spot.y) - 12);
        const d = `M ${routeStart.x * 100} ${routeStart.y * 100} Q ${cx * 100} ${cy} ${spot.x * 100} ${spot.y * 100}`;
        routeShadow.setAttribute('d', d);
        routeFocus.setAttribute('d', d);
        routeFocus.classList.remove('is-lit');
        void routeFocus.getBoundingClientRect();
        routeFocus.classList.add('is-lit');
      };

      const renderBrief = (spot: Spot) => {
        const mission = saveRepo.get().missions[spot.id];
        const learn = readLearnCard(spot.id);
        brief.innerHTML = `
          <div class="map-brief__head">
            ${hasAsset(spot.assetId) ? `<img class="mission-brief__hero" src="${assetUrl(spot.assetId)}" data-asset-id="${spot.assetId}" alt="${spot.assetAlt}">` : ''}
            <div><h2>${spot.name}<span class="map-brief__topic">${spot.topic}</span></h2><p class="map-brief__meta">약 ${spot.minutes}분 · ${mission.bestScore > 0 ? `최고 ${mission.bestScore}점` : '첫 도전'}</p></div>
          </div>
          <span class="map-brief__status">${STATUS_LABEL[mission.status]}</span>
          <p class="mission-brief__objective">${spot.objective}</p>
          <ol class="mission-brief__steps">${spot.steps.map((step) => `<li>${step}</li>`).join('')}</ol>
          ${learn.earned ? `<p class="map-brief__learned"><span class="map-node-learn" aria-hidden="true">${SVG_CARD}</span>배움 카드 획득 완료</p>` : ''}
          <div class="mission-brief__stamp map-brief__stamp">
            ${hasAsset('prop.stamp') ? `<img src="${assetUrl('prop.stamp')}" data-asset-id="prop.stamp" alt="${spot.name} 완료 때 받는 도장">` : ''}
            <span>완료 보상: ${spot.name} 도장 + 배움 카드</span>
          </div>
          <button class="btn btn-primary btn-big" data-act="depart">이 미션으로 출발</button>`;
        const depart = brief.querySelector<HTMLButtonElement>('[data-act="depart"]');
        depart?.addEventListener('click', () => {
          if (disposed || depart.disabled) return;
          depart.disabled = true;
          nodeById.forEach((node) => { node.disabled = true; });
          updateRoute(spot);
          flyTo?.(spot.x, spot.y);
          const transition = playJourneyTransition({
            kind: 'flight',
            label: `${spot.name}로 날아가요!`,
            assetId: hasAsset('plane.explorer') ? 'plane.explorer' : 'plane.main'
          });
          void transition.finished.then(() => {
            if (!disposed) navigate(spot.route);
          });
        });
      };

      const selectSpot = (spot: Spot, announce = true) => {
        if (saveRepo.get().missions[spot.id].status === 'locked') return;
        selectedId = spot.id;
        nodeById.forEach((node, id) => {
          const selected = id === selectedId;
          node.classList.toggle('is-selected', selected);
          node.setAttribute('aria-checked', String(selected));
          node.tabIndex = selected ? 0 : -1;
        });
        updateRoute(spot);
        renderBrief(spot);
        if (announce) {
          live.textContent = `${spot.name} 선택. ${spot.objective} 오른쪽 출발 버튼을 눌러요.`;
          void audio.playSfx('tap');
        }
        guide?.say(`${spot.name} 미션을 확인했어요. 출발 버튼을 눌러요!`, {
          cue: brief.querySelector<HTMLElement>('[data-act="depart"]')
        });
      };

      SPOTS.forEach((spot, index) => {
        const mission = saveRepo.get().missions[spot.id];
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'map-hotspot round-node';
        node.dataset.state = mission.status;
        node.dataset.missionId = spot.id;
        node.setAttribute('role', 'radio');
        node.setAttribute('aria-checked', 'false');
        const hasLearnCard = mission.status === 'completed' && readLearnCard(spot.id).earned;
        node.setAttribute('aria-label', `${spot.name}, ${spot.topic}, ${STATUS_LABEL[mission.status]}${hasLearnCard ? ', 배움 카드 획득' : ''}`);
        node.disabled = mission.status === 'locked';
        node.style.left = `${spot.x * 100}%`;
        node.style.top = `${spot.y * 100}%`;
        node.innerHTML = `
          ${hasAsset(spot.assetId) ? `<img class="node-img" src="${assetUrl(spot.assetId)}" data-asset-id="${spot.assetId}" alt="${spot.assetAlt}">` : ''}
          <span class="node-badge" aria-hidden="true">${index + 1}</span>
          ${mission.status === 'completed' ? '<span class="map-node-check" aria-hidden="true">✓</span>' : ''}
          ${hasLearnCard ? `<span class="map-node-learn" aria-hidden="true">${SVG_CARD}</span>` : ''}
          <span class="node-label">${spot.name}<span class="node-topic">${spot.topic}</span></span>`;
        node.addEventListener('click', () => selectSpot(spot));
        node.addEventListener('keydown', (event) => {
          if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const enabled = SPOTS.filter((candidate) => saveRepo.get().missions[candidate.id].status !== 'locked');
          const current = enabled.findIndex((candidate) => candidate.id === selectedId);
          const nextIndex = event.key === 'Home' ? 0
            : event.key === 'End' ? enabled.length - 1
              : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (current + 1) % enabled.length
                : (current - 1 + enabled.length) % enabled.length;
          const next = enabled[nextIndex];
          if (next) { selectSpot(next); nodeById.get(next.id)?.focus(); }
        });
        nodeById.set(spot.id, node);
        overlay.appendChild(node);
      });

      selectSpot(recommended, false);

      if (!compact) {
        const backgroundUrl = assetUrl('bg.map');
        const planeId = hasAsset('plane.explorer') ? 'plane.explorer' : 'plane.main';
        const planeUrl = assetUrl(planeId);
        host = await createPhaserHost(canvasWrap, (Phaser) => {
          class MapScene extends Phaser.Scene {
            private plane?: Phaser.GameObjects.Image;
            constructor() { super('map'); }
            preload() { this.load.image('bg', backgroundUrl); this.load.image('plane', planeUrl); }
            create() {
              const bg = this.add.image(GAME_W / 2, GAME_H / 2, 'bg');
              bg.setScale(Math.max(GAME_W / bg.width, GAME_H / bg.height)).setAlpha(.97);
              const plane = this.add.image(routeStart.x * GAME_W, routeStart.y * GAME_H - 34, 'plane');
              this.plane = plane;
              plane.setScale(Math.min(1, 118 / plane.width));
              if (!isReducedMotion()) {
                this.tweens.add({ targets: plane, y: plane.y - 8, duration: 1200, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
              }
              flyTo = (x, y) => {
                this.tweens.killTweensOf(plane);
                if (isReducedMotion()) { plane.setPosition(x * GAME_W, y * GAME_H - 34); return; }
                this.tweens.add({ targets: plane, x: x * GAME_W, y: y * GAME_H - 34, duration: 650, ease: 'Cubic.easeInOut' });
              };
            }
          }
          return new MapScene();
        });
        if (disposed) { host.destroy(); host = null; return; }

        const syncOverlay = () => {
          const canvas = canvasWrap.querySelector('canvas');
          if (!canvas) return;
          const worldRect = world.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          overlay.style.left = `${canvasRect.left - worldRect.left}px`;
          overlay.style.top = `${canvasRect.top - worldRect.top}px`;
          overlay.style.width = `${canvasRect.width}px`;
          overlay.style.height = `${canvasRect.height}px`;
        };
        resizeObserver = new ResizeObserver(syncOverlay);
        resizeObserver.observe(world);
        window.setTimeout(syncOverlay, 40);
      } else {
        world.style.backgroundImage = `linear-gradient(rgba(12,40,70,.12),rgba(12,40,70,.28)),url('${assetUrl('bg.map')}')`;
      }

      const returnCue = consumeMissionReturn();
      if (returnCue) {
        celebrateTimer = window.setTimeout(() => {
          if (disposed) return;
          const node = nodeById.get(returnCue.missionId);
          const stamp = progressPanel.querySelector<HTMLElement>(`[data-stamp-id="${returnCue.missionId}"]`);
          if (node) burstConfetti(node, 8);
          if (stamp) { stamp.classList.add('is-new'); stampSlam(stamp); }
          live.textContent = `${returnCue.missionTitle} 도장이 여권에 찍혔어요. 다음 추천 미션을 확인해 보세요.`;
          guide?.say(`${returnCue.missionTitle} 도장을 받았어요! 다음 미션도 오른쪽에서 확인해요.`, {
            cue: brief.querySelector<HTMLElement>('[data-act="depart"]')
          });
        }, isReducedMotion() ? 0 : 180);
      }

      compactListener = () => { if (!disposed) window.dispatchEvent(new Event('hashchange')); };
      compactMedia.addEventListener('change', compactListener);
    },

    unmount() {
      disposed = true;
      if (celebrateTimer !== null) window.clearTimeout(celebrateTimer);
      celebrateTimer = null;
      cancelJourneyTransition();
      guide?.dispose();
      guide = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (compactMedia && compactListener) compactMedia.removeEventListener('change', compactListener);
      compactMedia = null;
      compactListener = null;
      flyTo = null;
      host?.destroy();
      host = null;
    }
  };
}

function stampSlotHtml(spot: Spot, earned: boolean): string {
  return `<div class="stamp-collection__slot ${earned ? 'is-earned' : ''}" data-stamp-id="${spot.id}" role="img" aria-label="${spot.name} ${earned ? '도장 획득' : '도장 빈자리'}">
    ${earned && hasAsset(spot.assetId) ? `<img src="${assetUrl(spot.assetId)}" data-asset-id="${spot.assetId}" alt="">` : ''}
  </div>`;
}

function isReducedMotion(): boolean {
  return saveRepo.get().settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
