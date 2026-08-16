import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { burstConfetti, popBounce } from '../ui/fx';
import { createGuide, type GuideController } from '../ui/guide';
import { openModal } from '../ui/modal';
import { showToast } from '../ui/toast';

interface StudentDef {
  id: string;
  name: string;
  from: string;
  needs: string[];
  prefs: string[];
  note: string;
}

interface BlockDef {
  id: string;
  label: string;
  minutes: number;
  cost: number;
  category: string;
  covers: string[];
}

interface AmericasContent {
  intro: { title: string; subtitle: string; guide: string };
  students: StudentDef[];
  blocks: BlockDef[];
  constraints: { budget: number; totalMinutes: number; mustCoverAllNeeds: boolean };
  altCompare: { guide: string; questions: string[] };
  feedback: { overBudget: string; overTime: string; needMissed: string; good: string };
}

/** JSON의 needs/prefs id → 학생용 한글 라벨 (콘텐츠에 라벨이 없어 코드에 둔다) */
const ITEM_LABELS: Record<string, string> = {
  nut_free_meal: '견과류 없는 음식',
  prayer_time: '기도할 조용한 시간',
  wheelchair_access: '휠체어가 다니는 길',
  quiet_break: '조용히 쉬는 시간',
  hearing_support: '눈으로 보는 자막·그림',
  veggie_option: '채소 중심 메뉴',
  language_support: '그림·몸짓 소통 도움',
  movement_break: '몸을 움직이는 시간',
  pref_soccer: '축구',
  pref_drawing: '그림 그리기',
  pref_boardgame: '보드게임',
  pref_music: '음악 듣기',
  pref_reading: '책 읽기',
  pref_gardening: '식물 가꾸기',
  pref_photo: '사진 찍기',
  pref_cooking: '요리'
};
const labelOf = (id: string): string => ITEM_LABELS[id] ?? id;

/** 활동 카드 묶음 탭 — 한 번에 3~4장만 보여 화면을 비우고 선택을 쉽게 한다 */
const CATEGORY_LABEL: Record<string, string> = {
  meal: '식사',
  rest: '쉼',
  activity: '활동',
  learn: '배움'
};

/** 식사류 블록 이미지 헤더 (americas.food1~3, 표현용) */
const FOOD_IMG: Record<string, string> = {
  shared_lunch_table: 'americas.food1',
  food_truck_lunch: 'americas.food2',
  garden_snack_time: 'americas.food3'
};

/** 활동 블록 ↔ 학생 선호 매칭 (보너스 표시용, 콘텐츠에 없어 코드에 둔다) */
const BLOCK_PREFS: Record<string, string[]> = {
  team_mural: ['pref_drawing'],
  board_game_corner: ['pref_boardgame'],
  open_gym_games: ['pref_soccer'],
  garden_snack_time: ['pref_gardening'],
  picture_story_exchange: ['pref_reading', 'pref_photo'],
  subtitle_movie_time: ['pref_music'],
  shared_lunch_table: ['pref_cooking']
};

/** 가상 교류 센터 안의 장소. 실제 지리 정보가 아니라 이동 시간 시뮬레이션용 설정이다. */
const BLOCK_PLACES: Record<string, { id: string; label: string }> = {
  shared_lunch_table: { id: 'dining', label: '식당' },
  food_truck_lunch: { id: 'plaza', label: '광장' },
  quiet_room_time: { id: 'quiet-room', label: '조용한 방' },
  paved_park_walk: { id: 'park', label: '공원' },
  team_mural: { id: 'studio', label: '활동실' },
  picture_story_exchange: { id: 'studio', label: '활동실' },
  subtitle_movie_time: { id: 'studio', label: '활동실' },
  board_game_corner: { id: 'studio', label: '활동실' },
  open_gym_games: { id: 'gym', label: '체육관' },
  garden_snack_time: { id: 'garden', label: '텃밭' }
};
const DEFAULT_PLACE = { id: 'activity-room', label: '활동 공간' };
const TRAVEL_MINUTES = 10;
const MOVEMENT_BLOCKS = new Set(['paved_park_walk', 'open_gym_games']);
const QUIET_BLOCKS = new Set(['quiet_room_time', 'board_game_corner']);
const LOUD_BLOCKS = new Set(['open_gym_games']);
const MAX_SEATED_MINUTES = 120;

interface PlanTotals {
  activityMinutes: number;
  travelMinutes: number;
  minutes: number;
  cost: number;
  covered: Set<string>;
  prefsHit: Set<string>;
  conflicts: string[];
}

const STAGES = ['profiles', 'classify', 'plan', 'alt'] as const;
type Stage = (typeof STAGES)[number];

interface ClassifyResult {
  first: number;
  final: number;
  retries: number;
}

interface AmState {
  stage: Stage;
  viewed: string[];
  classify: ClassifyResult | null;
  classifyPlacements: Record<string, 'need' | 'pref'>;
  submitFails: number;
  firstSubmit: { needsCovered: number; budgetOk: boolean; timeOk: boolean; conflictFree: boolean } | null;
  planA: string[] | null;
  planB: string[] | null;
  draftPlan: string[];
  draftAlt: string[];
  compareChecks: boolean[];
}

function restoreState(data: Record<string, unknown>): AmState | null {
  const s = data.state;
  if (!s || typeof s !== 'object') return null;
  const r = s as Record<string, unknown>;
  const stage = STAGES.includes(r.stage as Stage) ? (r.stage as Stage) : 'profiles';
  const cl = r.classify as Record<string, unknown> | null | undefined;
  const fs = r.firstSubmit as Record<string, unknown> | null | undefined;
  const rawPlacements = r.classifyPlacements && typeof r.classifyPlacements === 'object'
    ? (r.classifyPlacements as Record<string, unknown>)
    : {};
  const classifyPlacements: Record<string, 'need' | 'pref'> = {};
  for (const [id, zone] of Object.entries(rawPlacements)) {
    if (zone === 'need' || zone === 'pref') classifyPlacements[id] = zone;
  }
  return {
    stage,
    viewed: Array.isArray(r.viewed) ? r.viewed.filter((x): x is string => typeof x === 'string') : [],
    classify:
      cl && typeof cl === 'object' && typeof cl.first === 'number' && typeof cl.final === 'number' && typeof cl.retries === 'number'
        ? { first: cl.first, final: cl.final, retries: cl.retries }
        : null,
    classifyPlacements,
    submitFails: typeof r.submitFails === 'number' ? r.submitFails : 0,
    firstSubmit:
      fs && typeof fs === 'object' && typeof fs.needsCovered === 'number'
        ? {
            needsCovered: Math.max(0, Math.floor(fs.needsCovered)),
            budgetOk: fs.budgetOk === true,
            timeOk: fs.timeOk === true,
            conflictFree: fs.conflictFree !== false
          }
        : null,
    planA: Array.isArray(r.planA) ? r.planA.filter((x): x is string => typeof x === 'string') : null,
    planB: Array.isArray(r.planB) ? r.planB.filter((x): x is string => typeof x === 'string') : null,
    draftPlan: Array.isArray(r.draftPlan) ? r.draftPlan.filter((x): x is string => typeof x === 'string') : [],
    draftAlt: Array.isArray(r.draftAlt) ? r.draftAlt.filter((x): x is string => typeof x === 'string') : [],
    compareChecks: Array.isArray(r.compareChecks) ? r.compareChecks.map((x) => x === true) : []
  };
}

const PAGE_CSS = `
/* 계약 §7 — 배경 일러스트가 주인공. 패널은 반투명·내용 크기만큼만. */
.am-scene .page-body { padding: var(--sp-3) clamp(12px, 3vw, 44px); }
.am-scene .panel { background: rgba(255,252,240,0.9); backdrop-filter: blur(6px); padding: var(--sp-4); }
.am-scene .card { padding: var(--sp-3); background: rgba(255,255,255,0.94); }
.am-scene .btn { color: #0F172A; text-shadow: none; }
.am-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
.am-head { display: flex; justify-content: center; flex-shrink: 0; }

/* --- 1단계: 배경 위에 큰 친구들 (계약 §7 캐릭터 최소 120px) --- */
.am-friends {
  flex: 1; min-height: 0; display: flex; flex-wrap: wrap;
  align-items: center; justify-content: center; gap: clamp(10px, 3vw, 48px);
}
.am-friends .round-node { --node-size: clamp(120px, 13vw, 190px); }
.round-node .node-flagchip {
  background: rgba(255,255,255,0.92); color: #14559c; border-radius: 999px;
  padding: 1px 10px; font-size: var(--fs-small); font-weight: 700;
}

/* --- 2단계: 위에 나눌 카드 띠, 아래 두 칸 (1024에서도 스크롤 없이) --- */
.am-classify {
  flex: 1; min-height: 0; display: grid;
  grid-template-columns: 1fr 1fr; grid-template-rows: auto minmax(0, 1fr);
  gap: var(--sp-3);
}
.am-classify > .cl-zone:first-child { grid-column: 1 / -1; }
.cl-zone {
  min-height: 0; overflow: hidden; padding: var(--sp-3);
  display: flex; flex-direction: column; gap: var(--sp-2);
  background: rgba(255,252,240,0.88); backdrop-filter: blur(6px);
}
.cl-zone h3 { font-size: var(--fs-body); color: var(--c-navy); }
.cl-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); flex-shrink: 0; }
.cl-head .btn { padding: 8px 14px; }
.cl-list { display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start; overflow-y: auto; min-height: 0; }
.cl-item { padding: 8px 12px; font-weight: 700; font-size: var(--fs-small); }
.cl-item.is-wrong { border-color: var(--c-coral); box-shadow: 0 0 0 3px rgba(242,109,109,0.35); }
.cl-item.is-right { border-color: var(--c-success); }

/* --- 3단계: 활동 카드 | 시간표 --- */
.am-plan { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.05fr); gap: var(--sp-3); }
.am-col { min-height: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
/* 활동 카드는 묶음 탭으로 3~4장씩만 — 화면을 넘기지 않는다 */
.am-pool { display: flex; flex-direction: column; gap: 6px; }
.am-tabs { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
.am-tabs .btn { padding: 6px 16px; }
.am-tabs .btn[aria-pressed="true"] { background: var(--c-gold); box-shadow: var(--edge) #c69a2e, var(--shadow-card); }
.am-block { text-align: left; width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px 8px; }
.am-block .am-block-name { font-family: var(--font-head); font-size: var(--fs-small); line-height: 1.15; }
.am-block .am-food { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
.am-block .am-block-txt { flex: 1; min-width: 0; }
.am-meta { color: var(--c-ink-soft); font-size: var(--fs-small); }
.am-block:disabled { opacity: 0.45; cursor: not-allowed; }
.am-cover-chip { display: inline-flex; background: rgba(37,136,232,0.12); color: #14559c; border-radius: 999px; padding: 2px 10px; font-size: var(--fs-small); font-weight: 700; margin: 2px 4px 0 0; }
.am-pref-chip { display: inline-flex; background: rgba(242,193,78,0.25); color: #6b4a00; border-radius: 999px; padding: 2px 10px; font-size: var(--fs-small); font-weight: 700; margin: 2px 4px 0 0; }
.am-plan-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.am-gauges-bar { display: flex; gap: var(--sp-4); align-items: center; flex-wrap: wrap; padding: 6px var(--sp-3); flex-shrink: 0; }
.am-gauges-bar .meter-row { flex: 1 1 240px; }
.am-gauges-bar .am-gauge-meta { flex: 0 0 auto; }
.travel-row { display: flex; gap: 8px; align-items: center; padding: 2px 10px; color: var(--c-ink-soft); font-size: var(--fs-small); }
.plan-order-actions { display: flex; gap: 6px; flex-shrink: 0; }
.plan-order-actions .btn { padding: 8px 12px; min-width: 44px; }

/* 친구별 필요 — 하단 바의 그림 진행 표시. 자세한 내용은 탭하면 모달 */
.am-needs { display: flex; gap: var(--sp-2); align-items: center; min-width: 0; }
.am-need-card { display: flex; align-items: center; gap: 6px; padding: 4px 10px; }
.am-need-card img { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: var(--shadow-card); background: var(--c-sky); flex-shrink: 0; }
.am-need-card .n-name { font-family: var(--font-head); font-size: var(--fs-small); }
.am-need-card .n-count { font-size: var(--fs-small); font-weight: 700; color: var(--c-ink-soft); }
.am-need-card.is-done { border-color: var(--c-success); }
.am-need-card.is-done .n-count { color: #17573d; }
.need-chip { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 10px; font-size: var(--fs-small); font-weight: 700; background: rgba(25,50,77,0.1); color: var(--c-ink-soft); margin: 2px 4px 0 0; }
.need-chip.is-ok { background: rgba(46,173,120,0.18); color: #17573d; }
.conflict-card { border-left: 5px solid var(--c-coral); }

/* --- 4단계: 두 계획 비교 --- */
.compare-list { margin: 0; padding-left: 18px; }
.compare-list li { font-size: var(--fs-small); }
.am-q-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; cursor: pointer; min-height: var(--touch-min); }

.am-actions { display: flex; gap: var(--sp-3); align-items: center; }

/* 1024×576 같은 낮은 화면: 여백을 줄여 스크롤 없이 담는다 */
@media (max-height: 620px) {
  .am-scene .page-body { padding: 6px clamp(10px, 2.5vw, 28px); }
  .am-stage { gap: var(--sp-2); }
  .am-classify { gap: var(--sp-2); }
  .cl-zone { padding: var(--sp-2); gap: 6px; }
  .cl-item { padding: 5px 10px; }
  .cl-head .btn { padding: 6px 12px; min-height: 44px; }
  /* 3단계: 활동 카드·시간표를 한 줄씩으로 눌러 담는다 */
  .am-block .am-food { display: none; }
  .am-block .am-block-txt { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .am-block .am-pref-chip { display: none; }
  .am-scene .am-plan-item { padding: 3px 8px; }
  .am-plan-item > div:first-child { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .plan-order-actions .btn { padding: 6px 8px; min-width: 38px; }
  .travel-row { padding: 0 10px; }
  .am-need-card { padding: 2px 8px; }
  .am-need-card img { width: 32px; height: 32px; }
  .am-need-card .n-name { display: none; }
  .ribbon-title .ribbon-sub { display: none; }
  .am-gauge-meta { display: none; }
  /* 4단계: 비교 카드·질문 줄 압축 */
  .am-scene .vs-compare .card { padding: 8px 10px; }
  .am-scene .am-questions { padding: 4px 10px; }
  .am-q-row { padding: 2px 0; min-height: 40px; }
}

@media (max-width: 900px) {
  .am-plan { grid-template-columns: 1fr; }
  .am-needs { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .americas-compare-row { grid-template-columns: 1fr; }
  .americas-compare-row .vs-mark { justify-self: center; }
}
`;

export function createPage(): Page {
  let dnd: PickPlaceController | null = null;
  let guide: GuideController | null = null;

  return {
    async mount(root: HTMLElement) {
      const content = await loadContent<AmericasContent>('americas');
      await preloadImages([
        'bg.americas',
        'americas.student1', 'americas.student2', 'americas.student3', 'americas.student4',
        'americas.food1', 'americas.food2', 'americas.food3'
      ]);
      audio.playBgm('americas');

      const allNeeds: string[] = [];
      for (const st of content.students) for (const n of st.needs) if (!allNeeds.includes(n)) allNeeds.push(n);
      const allPrefs: string[] = [];
      for (const st of content.students) for (const p of st.prefs) if (!allPrefs.includes(p)) allPrefs.push(p);

      // 2단계 분류 대상 8개: 학생마다 필요 1 + 선호 1 (결정론적 선택)
      const classifyItems: Array<{ id: string; isNeed: boolean }> = [];
      for (const st of content.students) {
        const n = st.needs[0];
        const p = st.prefs[0];
        if (n) classifyItems.push({ id: n, isNeed: true });
        if (p) classifyItems.push({ id: p, isNeed: false });
      }

      const studentAvatar = (index: number): string => {
        const key = `americas.student${index + 1}`;
        return hasAsset(key) ? assetUrl(key) : '';
      };

      const blockById = new Map(content.blocks.map((block) => [block.id, block]));
      const validBlockIds = new Set(blockById.keys());
      const cleanPlan = (ids: string[]): string[] => [...new Set(ids.filter((id) => validBlockIds.has(id)))];
      const placeOf = (id: string) => BLOCK_PLACES[id] ?? DEFAULT_PLACE;
      const travelBetween = (fromId: string | null, toId: string): number => {
        if (!fromId) return 0;
        return placeOf(fromId).id === placeOf(toId).id ? 0 : TRAVEL_MINUTES;
      };
      const planTotals = (ids: string[]): PlanTotals => {
        let activityMinutes = 0;
        let travelMinutes = 0;
        let cost = 0;
        let previousId: string | null = null;
        let seatedMinutes = 0;
        let longestSeated = 0;
        const covered = new Set<string>();
        const prefsHit = new Set<string>();

        ids.forEach((id) => {
          const block = blockById.get(id);
          if (!block) return;
          activityMinutes += block.minutes;
          travelMinutes += travelBetween(previousId, id);
          cost += block.cost;
          for (const need of block.covers) covered.add(need);
          for (const pref of BLOCK_PREFS[id] ?? []) if (allPrefs.includes(pref)) prefsHit.add(pref);
          if (MOVEMENT_BLOCKS.has(id)) seatedMinutes = 0;
          else {
            seatedMinutes += block.minutes;
            longestSeated = Math.max(longestSeated, seatedMinutes);
          }
          previousId = id;
        });

        const conflicts: string[] = [];
        if (ids.includes('shared_lunch_table') && ids.includes('food_truck_lunch')) {
          conflicts.push('점심 활동이 두 번 잡혔어요. 두 점심 중 하나를 고르면 시간과 예산을 아낄 수 있어요.');
        }
        const lastLoud = ids.reduce((last, id, index) => (LOUD_BLOCKS.has(id) ? index : last), -1);
        if (lastLoud >= 0 && !ids.some((id, index) => index > lastLoud && QUIET_BLOCKS.has(id))) {
          conflicts.push('소리가 큰 활동 뒤에 발레리아가 쉴 조용한 활동을 놓아 주세요.');
        }
        if (longestSeated > MAX_SEATED_MINUTES) {
          conflicts.push(`앉아서 하는 활동이 ${longestSeated}분 이어져요. ${MAX_SEATED_MINUTES}분 안에 움직이는 활동을 배치해 주세요.`);
        }
        return {
          activityMinutes,
          travelMinutes,
          minutes: activityMinutes + travelMinutes,
          cost,
          covered,
          prefsHit,
          conflicts
        };
      };

      // ---- 상태 (체크포인트 복원) ----
      const mission = saveRepo.get().missions.americas;
      let S: AmState = {
        stage: 'profiles',
        viewed: [],
        classify: null,
        classifyPlacements: {},
        submitFails: 0,
        firstSubmit: null,
        planA: null,
        planB: null,
        draftPlan: [],
        draftAlt: [],
        compareChecks: []
      };
      if (mission.checkpointId && STAGES.includes(mission.checkpointId as Stage)) {
        const restored = restoreState(mission.data);
        if (restored) {
          S = restored;
          S.stage = mission.checkpointId as Stage;
          S.planA = S.planA ? cleanPlan(S.planA) : null;
          S.planB = S.planB ? cleanPlan(S.planB) : null;
          S.draftPlan = cleanPlan(S.draftPlan);
          S.draftAlt = cleanPlan(S.draftAlt);
          showToast('저장된 곳에서 이어서 진행해요.', 'info');
        }
      }
      let finished = false;

      const persist = (): void => {
        saveRepo.setCheckpoint('americas', S.stage, { state: { ...S } });
      };

      // ---- 뼈대 ----
      const page = document.createElement('div');
      page.className = 'page am-scene';
      // 배경이 주인공 — 어두운 오버레이는 글자 대비에 필요한 만큼만
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.28), rgba(20,45,80,0.42)), url('${assetUrl('bg.americas')}')`;

      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);

      const topBar = buildTopBar({
        title: content.intro.title,
        subtitle: content.intro.subtitle,
        backTo: '#/map',
        steps: { total: STAGES.length, done: 0, now: 0 }
      });
      page.appendChild(topBar);

      // 장식 랜드마크 — 흐름 밖(.page-deco)이라 겹침을 만들지 않는다
      const deco = document.createElement('div');
      deco.className = 'page-deco';
      deco.setAttribute('aria-hidden', 'true');
      deco.innerHTML = [
        hasAsset('deco.landmark_liberty')
          ? `<img src="${assetUrl('deco.landmark_liberty')}" alt="" style="position:absolute;left:1.5%;bottom:0;width:clamp(90px,10vw,168px);opacity:0.9">`
          : '',
        hasAsset('deco.landmark_rio')
          ? `<img src="${assetUrl('deco.landmark_rio')}" alt="" style="position:absolute;right:1.5%;bottom:0;width:clamp(90px,10vw,168px);opacity:0.9">`
          : ''
      ].join('');
      page.appendChild(deco);

      const body = document.createElement('div');
      body.className = 'page-body';
      // 계약 §7: 화면 전체를 덮는 패널 대신, 각 단계가 필요한 만큼만 패널을 만든다
      const panel = document.createElement('div');
      panel.className = 'am-stage';
      body.appendChild(panel);
      page.appendChild(body);

      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      page.appendChild(bottom);
      root.appendChild(page);

      // 마스코트 가이드 — 절차 안내는 말풍선으로, 화면 글자는 최소로
      guide = createGuide();
      page.appendChild(guide.el);

      /** 하단 바 = 진행 표시(칩 또는 그림 카드) + 다음 행동 버튼 (계약 §1 행4) */
      const setBottom = (hint: string | HTMLElement, ...actions: HTMLElement[]): void => {
        bottom.replaceChildren();
        if (typeof hint === 'string') {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = hint;
          bottom.appendChild(chip);
        } else {
          bottom.appendChild(hint);
        }
        const right = document.createElement('div');
        right.className = 'am-actions';
        for (const el of actions) right.appendChild(el);
        bottom.appendChild(right);
      };

      // ---- 완료 처리 ----
      const finish = (revisionRatio: number, finalNeedsCovered: number): void => {
        if (finished) return;
        finished = true;
        const fs = S.firstSubmit;
        const firstScore = fs
          ? 0.5 * (fs.needsCovered / Math.max(1, allNeeds.length)) +
            (fs.budgetOk ? 0.2 : 0) +
            (fs.timeOk ? 0.2 : 0) +
            (fs.conflictFree ? 0.1 : 0)
          : 0;
        const ratios = {
          evidence: Math.max(0, S.classify?.final ?? 0),
          perspective:
            0.5 * Math.min(1, S.viewed.length / Math.max(1, content.students.length)) +
            0.5 * (finalNeedsCovered / Math.max(1, allNeeds.length)),
          // 제출까지 왔다면 조정(필요 우선 반영)을 해낸 것 — 첫 시도 점수와 하한 0.7 중 큰 값
          communication: finalNeedsCovered >= allNeeds.length ? Math.max(firstScore, 0.7) : firstScore,
          revision: revisionRatio
        };
        const speedBonus = Math.max(0, 5 - ((S.classify?.retries ?? 0) + S.submitFails));
        const result = computeScore(
          ratios,
          { evidence: 30, perspective: 25, communication: 25, revision: 15 },
          speedBonus
        );
        completeMissionFlow('americas', '아메리카', result);
      };

      const goStage = (next: Stage): void => {
        S.stage = next;
        persist();
        renderStage();
      };

      // ================= 단계 렌더링 =================

      const renderStage = (): void => {
        dnd?.dispose();
        dnd = null;
        const idx = STAGES.indexOf(S.stage);
        updateSteps(topBar, STAGES.length, idx, idx);
        panel.replaceChildren();
        switch (S.stage) {
          case 'profiles':
            renderProfiles();
            break;
          case 'classify':
            renderClassify();
            break;
          case 'plan':
            renderPlan(false);
            break;
          case 'alt':
            if (S.planA && S.planB) renderCompare(S.planA, S.planB);
            else renderPlan(true);
            break;
        }
      };

      // ---- 1단계: 친구 프로필 4명 ----
      const renderProfiles = (): void => {
        const head = document.createElement('div');
        head.className = 'am-head';
        head.innerHTML = `
          <div class="ribbon-title">
            <span class="ribbon-main">어울림 학급 친구들</span>
            <span class="ribbon-sub">카드를 눌러 한 명씩 만나 봐요</span>
          </div>`;
        panel.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'am-friends';
        const nextBtn = document.createElement('button');

        const refreshNext = (): void => {
          const all = content.students.every((st) => S.viewed.includes(st.id));
          nextBtn.disabled = !all;
          setBottom(`친구 ${S.viewed.length}/${content.students.length} 만남`, nextBtn);
          if (all) {
            guide?.say('모두 만났어요! 다음을 눌러요!', { cue: nextBtn });
          } else {
            const idx = content.students.findIndex((st) => !S.viewed.includes(st.id));
            guide?.setCue((grid.children[idx] as HTMLElement | undefined) ?? null);
          }
        };

        content.students.forEach((st, i) => {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'round-node';
          if (S.viewed.includes(st.id)) card.dataset.state = 'completed';
          const avatar = studentAvatar(i);
          card.innerHTML = `
            ${avatar
              ? `<img class="node-img" src="${avatar}" alt="">`
              : `<span class="node-img" aria-hidden="true" style="display:flex;align-items:center;justify-content:center;font-family:var(--font-head);font-size:var(--fs-title);color:#fff">${st.name.charAt(0)}</span>`}
            <span class="node-badge" data-mark ${S.viewed.includes(st.id) ? '' : 'hidden'}>✓</span>
            <span class="node-label">${st.name}</span>
            <span class="node-flagchip">${st.from}</span>`;
          card.addEventListener('click', () => {
            void audio.playSfx('tap');
            const bodyEl = document.createElement('div');
            bodyEl.innerHTML = `
              <div style="display:flex;gap:var(--sp-4);align-items:flex-start">
                ${avatar ? `<img src="${avatar}" alt="" style="width:96px;flex-shrink:0">` : ''}
                <div>
                  <p style="margin-bottom:8px">${st.note}</p>
                  <p style="font-weight:700;margin-bottom:4px">꼭 필요해요</p>
                  <div>${st.needs.map((n) => `<span class="am-cover-chip">${labelOf(n)}</span>`).join('')}</div>
                  <p style="font-weight:700;margin:8px 0 4px">좋아하는 것</p>
                  <div>${st.prefs.map((p) => `<span class="am-pref-chip">★ ${labelOf(p)}</span>`).join('')}</div>
                </div>
              </div>`;
            openModal({
              id: `student-${st.id}`,
              title: `${st.name} (${st.from})`,
              bodyEl,
              actions: [{ label: '알겠어요', kind: 'primary', autofocus: true, onClick: (close) => close() }]
            });
            if (!S.viewed.includes(st.id)) {
              S.viewed.push(st.id);
              persist();
              const mark = card.querySelector<HTMLElement>('[data-mark]');
              if (mark) mark.hidden = false;
              card.dataset.state = 'completed';
              popBounce(card);
              refreshNext();
            }
          });
          grid.appendChild(card);
        });
        panel.appendChild(grid);

        nextBtn.className = 'btn btn-primary btn-big';
        nextBtn.textContent = '다음';
        nextBtn.addEventListener('click', () => {
          if (nextBtn.disabled) return;
          nextBtn.disabled = true;
          goStage('classify');
        });
        if (!content.students.every((st) => S.viewed.includes(st.id))) {
          guide?.say('친구 카드를 눌러 만나 봐요!');
        }
        refreshNext();
      };

      // ---- 2단계: 필요/선호 분류 ----
      const renderClassify = (): void => {
        if (!S.classify) S.classify = { first: -1, final: 0, retries: 0 };
        const cl = S.classify;

        const head = document.createElement('div');
        head.className = 'am-head';
        head.innerHTML = `
          <div class="ribbon-title">
            <span class="ribbon-main">필요 vs 좋아하는 것</span>
            <span class="ribbon-sub">없으면 함께하기 어려운 것이 '필요'예요</span>
          </div>`;
        panel.appendChild(head);

        const zoneWrap = document.createElement('div');
        zoneWrap.className = 'am-classify';

        const mkZone = (id: 'pool' | 'need' | 'pref', title: string, action: string) => {
          const z = document.createElement('div');
          z.className = 'drop-zone cl-zone';
          z.dataset.zoneId = id;
          // 제목과 놓기 버튼을 한 줄로 — 세로 공간 절약(1024×576 대응)
          const zoneHead = document.createElement('div');
          zoneHead.className = 'cl-head';
          zoneHead.innerHTML = `<h3>${title}</h3>`;
          const placeButton = document.createElement('button');
          placeButton.type = 'button';
          placeButton.className = 'btn btn-ghost';
          placeButton.textContent = action;
          placeButton.setAttribute('aria-label', `선택한 카드를 '${title}'에 놓기`);
          zoneHead.appendChild(placeButton);
          z.appendChild(zoneHead);
          const list = document.createElement('div');
          list.className = 'cl-list';
          z.appendChild(list);
          return { z, list };
        };
        const poolZone = mkZone('pool', '나눌 카드', '되돌리기');
        const pool = poolZone.z;
        const poolList = poolZone.list;
        const needZone = mkZone('need', '꼭 필요해요', '여기 놓기');
        const prefZone = mkZone('pref', '좋아하는 것', '여기 놓기');
        zoneWrap.appendChild(pool);
        zoneWrap.appendChild(needZone.z);
        zoneWrap.appendChild(prefZone.z);

        const placements = new Map<string, 'need' | 'pref'>(
          Object.entries(S.classifyPlacements).filter(([id]) => classifyItems.some((item) => item.id === id))
        );
        const itemEls = new Map<string, HTMLElement>();
        const checkBtn = document.createElement('button');
        const nextBtn = document.createElement('button');
        const fb = document.createElement('div');

        // 결정론적 섞기: 필요/선호를 번갈아 배치하지 않도록 고정 순서로 교차
        const shuffled: Array<{ id: string; isNeed: boolean }> = [];
        const needsList = classifyItems.filter((x) => x.isNeed);
        const prefsList = classifyItems.filter((x) => !x.isNeed);
        for (let i = 0; i < Math.max(needsList.length, prefsList.length); i++) {
          const p = prefsList[i];
          const n = needsList[i];
          if (p) shuffled.push(p);
          if (n) shuffled.push(n);
        }

        for (const it of shuffled) {
          const el = document.createElement('div');
          el.className = 'card cl-item';
          el.dataset.itemId = it.id;
          el.textContent = labelOf(it.id);
          // 카드가 놓인 상위 drop-zone까지 click/keydown이 버블링하면 선택 즉시
          // 같은 칸에 재배치되어 선택이 풀린다. 카드에서 전파만 막고 DnD 핸들러는 실행한다.
          el.addEventListener('click', (event) => event.stopPropagation());
          el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
          });
          itemEls.set(it.id, el);
          const restoredZone = placements.get(it.id);
          if (restoredZone === 'need') needZone.list.appendChild(el);
          else if (restoredZone === 'pref') prefZone.list.appendChild(el);
          else poolList.appendChild(el);
        }

        const refreshCheck = (): void => {
          checkBtn.disabled = placements.size < classifyItems.length || cl.final >= 1;
          setBottom(`카드 ${placements.size}/${classifyItems.length} 나눔`, checkBtn, nextBtn);
          if (!checkBtn.disabled) guide?.setCue(checkBtn);
          else if (cl.final < 1) guide?.setCue((poolList.firstElementChild as HTMLElement | null) ?? null);
        };

        dnd = enablePickPlace({
          items: [...itemEls.values()],
          zones: [pool, needZone.z, prefZone.z],
          onPlace: (itemId, zoneId) => {
            const el = itemEls.get(itemId);
            if (!el) return;
            el.classList.remove('is-wrong', 'is-right');
            if (zoneId === 'need') {
              needZone.list.appendChild(el);
              placements.set(itemId, 'need');
            } else if (zoneId === 'pref') {
              prefZone.list.appendChild(el);
              placements.set(itemId, 'pref');
            } else {
              poolList.appendChild(el);
              placements.delete(itemId);
            }
            S.classifyPlacements = Object.fromEntries(placements);
            persist();
            refreshCheck();
          }
        });

        checkBtn.className = 'btn btn-primary btn-big';
        checkBtn.textContent = '확인';
        let checking = false;
        let lastCheckAt = 0;
        checkBtn.addEventListener('click', () => {
          const now = performance.now();
          if (checkBtn.disabled || checking || now - lastCheckAt < 250) return;
          lastCheckAt = now;
          checking = true;
          let correct = 0;
          const wrongIds: string[] = [];
          for (const it of classifyItems) {
            const placed = placements.get(it.id);
            const ok = placed === (it.isNeed ? 'need' : 'pref');
            const el = itemEls.get(it.id);
            if (ok) {
              correct++;
              el?.classList.add('is-right');
              el?.classList.remove('is-wrong');
            } else {
              wrongIds.push(it.id);
              el?.classList.add('is-wrong');
              el?.classList.remove('is-right');
            }
          }
          const acc = correct / Math.max(1, classifyItems.length);
          if (cl.first < 0) cl.first = acc;
          else cl.retries += 1;
          cl.final = acc;
          if (wrongIds.length === 0) {
            showFeedback(fb, 'success', '필요와 좋아하는 것을 정확히 나눴어요! 이 구분이 다음 단계의 열쇠예요.', 'americas');
            checkBtn.disabled = true;
            nextBtn.style.display = '';
            guide?.say('정확해요! 다음을 눌러요!', { cue: nextBtn });
          } else {
            // 잘못 놓인 카드는 다시 나눌 카드로
            for (const id of wrongIds) {
              const el = itemEls.get(id);
              if (el) poolList.appendChild(el);
              placements.delete(id);
            }
            S.classifyPlacements = Object.fromEntries(placements);
            showFeedback(
              fb,
              acc >= 0.75 ? 'partial' : 'retry',
              `${correct}개는 잘 나눴어요! 표시된 카드는 '없으면 함께하기 어려운가?'를 기준으로 다시 생각해 볼까요?`,
              'americas'
            );
            nextBtn.style.display = '';
            refreshCheck();
          }
          persist();
          checking = false;
        });

        nextBtn.className = 'btn btn-success btn-big';
        nextBtn.textContent = '다음';
        nextBtn.style.display = 'none';
        nextBtn.addEventListener('click', () => {
          if (nextBtn.disabled) return;
          nextBtn.disabled = true;
          goStage('plan');
        });

        panel.appendChild(zoneWrap);
        panel.appendChild(fb);
        if (cl.first >= 0) nextBtn.style.display = '';
        refreshCheck();
        if (cl.final >= 1) guide?.say('잘 나눴어요! 다음을 눌러요!', { cue: nextBtn });
        else guide?.say('카드를 눌러 두 칸으로 나눠 봐요!');
      };

      // ---- 3·4단계: 일정 조립 (altMode = 두 번째 계획) ----
      const renderPlan = (altMode: boolean): void => {
        const chosen: string[] = cleanPlan(altMode ? S.draftAlt : S.draftPlan);
        const saveDraft = (): void => {
          if (altMode) S.draftAlt = [...chosen];
          else S.draftPlan = [...chosen];
          persist();
        };

        const head = document.createElement('div');
        head.className = 'am-head';
        head.innerHTML = `
          <div class="ribbon-title">
            <span class="ribbon-main">${altMode ? '두 번째 계획' : '함께 보낼 하루'}</span>
            <span class="ribbon-sub">${altMode ? '첫 계획과 다른 조합으로 만들어 봐요' : '정답 조합은 여러 개예요'}</span>
          </div>`;
        panel.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'am-plan';

        // 왼쪽: 활동 카드 풀
        const poolCol = document.createElement('div');
        poolCol.className = 'am-col';
        const tabBar = document.createElement('div');
        tabBar.className = 'am-tabs';
        tabBar.setAttribute('role', 'group');
        tabBar.setAttribute('aria-label', '활동 묶음 고르기');
        const poolGrid = document.createElement('div');
        poolGrid.className = 'am-pool';
        poolCol.appendChild(tabBar);
        poolCol.appendChild(poolGrid);
        const poolButtons = new Map<string, HTMLButtonElement>();
        const categories = [...new Set(content.blocks.map((b) => b.category))];
        let activeCat = categories[0] ?? '';
        const renderPool = (): void => {
          poolGrid.replaceChildren();
          for (const b of content.blocks) {
            if (b.category !== activeCat) continue;
            const btn = poolButtons.get(b.id);
            if (btn) poolGrid.appendChild(btn);
          }
          tabBar.querySelectorAll<HTMLButtonElement>('button').forEach((t) => {
            t.setAttribute('aria-pressed', String(t.dataset.cat === activeCat));
          });
        };

        // 오른쪽: 게이지 + 시간표 + 친구별 필요(그림 카드)
        const rightCol = document.createElement('div');
        rightCol.className = 'am-col';
        // 게이지는 본문 위 가로 띠로 — 오른쪽 칸은 시간표만 담는다
        const gauges = document.createElement('div');
        gauges.className = 'card am-gauges-bar';
        const planWrap = document.createElement('div');
        const planList = document.createElement('div');
        planList.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-height:56px';
        const planEmpty = document.createElement('p');
        planEmpty.className = 'chip';
        planEmpty.textContent = '왼쪽 카드를 눌러 넣어요';
        planWrap.appendChild(planList);
        const needsCard = document.createElement('div');
        needsCard.className = 'am-needs';
        const conflictCard = document.createElement('div');
        conflictCard.className = 'card conflict-card';
        conflictCard.setAttribute('role', 'status');
        conflictCard.setAttribute('aria-live', 'polite');
        let lastBoardActionAt = 0;
        const acceptBoardAction = (): boolean => {
          const now = performance.now();
          if (now - lastBoardActionAt < 120) return false;
          lastBoardActionAt = now;
          return true;
        };

        const totals = (): PlanTotals => planTotals(chosen);
        let saidReady = false;
        let prevCovered: Set<string> | null = null; // 첫 렌더에서는 팝 연출 생략

        const refreshBoard = (): void => {
          const t = totals();
          const overTime = t.minutes > content.constraints.totalMinutes;
          const overBudget = t.cost > content.constraints.budget;
          const timePct = Math.min(100, Math.round((t.minutes / content.constraints.totalMinutes) * 100));
          const budgetPct =
            content.constraints.budget > 0 ? Math.min(100, Math.round((t.cost / content.constraints.budget) * 100)) : 0;
          gauges.innerHTML = `
            <div class="meter-row ${overTime ? 'is-over' : ''}">
              <span class="meter-label">시간</span>
              <div class="progress-track" role="progressbar" aria-label="사용한 시간 ${t.minutes}분" aria-valuemin="0" aria-valuemax="${content.constraints.totalMinutes}" aria-valuenow="${Math.min(t.minutes, content.constraints.totalMinutes)}"><div class="progress-fill" style="width:${timePct}%"></div></div>
              <span class="meter-value">${t.minutes}/${content.constraints.totalMinutes}분</span>
            </div>
            <div class="meter-row ${overBudget ? 'is-over' : ''}">
              <span class="meter-label">예산</span>
              <div class="progress-track" role="progressbar" aria-label="사용한 예산 ${t.cost}코인" aria-valuemin="0" aria-valuemax="${content.constraints.budget}" aria-valuenow="${Math.min(t.cost, content.constraints.budget)}"><div class="progress-fill" style="width:${budgetPct}%"></div></div>
              <span class="meter-value">${t.cost}/${content.constraints.budget}코인</span>
            </div>
            <p class="am-meta am-gauge-meta">이동 ${t.travelMinutes}분 · ★ 보너스 ${t.prefsHit.size}개</p>`;

          // 시간표
          planList.replaceChildren();
          if (chosen.length === 0) planList.appendChild(planEmpty);
          chosen.forEach((id, index) => {
            const b = blockById.get(id);
            if (!b) return;
            // 이동 시간은 별도 줄 대신 항목 안에 — 세로 줄 수를 줄인다
            const travel = travelBetween(index > 0 ? chosen[index - 1] ?? null : null, id);
            const row = document.createElement('div');
            row.className = 'card am-plan-item';
            row.innerHTML = `
              <div>
                <strong>${b.label}</strong>
                <div class="am-meta">${placeOf(id).label} · ${b.minutes}분 · ${b.cost > 0 ? `${b.cost}코인` : '무료'}${travel > 0 ? ` · 이동 ${travel}분` : ''}</div>
              </div>`;
            const orderActions = document.createElement('div');
            orderActions.className = 'plan-order-actions';
            const makeMoveButton = (delta: -1 | 1, label: string) => {
              const button = document.createElement('button');
              button.className = 'btn btn-ghost';
              button.textContent = label;
              button.disabled = delta < 0 ? index === 0 : index === chosen.length - 1;
              button.setAttribute('aria-label', `${b.label} ${delta < 0 ? '앞 순서로' : '뒤 순서로'} 이동`);
              button.addEventListener('click', () => {
                if (!acceptBoardAction()) return;
                const current = chosen.indexOf(id);
                const target = current + delta;
                if (current < 0 || target < 0 || target >= chosen.length) return;
                [chosen[current], chosen[target]] = [chosen[target]!, chosen[current]!];
                void audio.playSfx('tap');
                saveDraft();
                refreshBoard();
              });
              return button;
            };
            orderActions.appendChild(makeMoveButton(-1, '↑'));
            orderActions.appendChild(makeMoveButton(1, '↓'));
            const rm = document.createElement('button');
            rm.className = 'btn btn-ghost';
            rm.textContent = '빼기';
            rm.setAttribute('aria-label', `${b.label} 시간표에서 빼기`);
            rm.addEventListener('click', () => {
              if (!acceptBoardAction()) return;
              void audio.playSfx('tap');
              const at = chosen.indexOf(id);
              if (at >= 0) chosen.splice(at, 1);
              const pb = poolButtons.get(id);
              if (pb) pb.disabled = false;
              saveDraft();
              refreshBoard();
            });
            orderActions.appendChild(rm);
            row.appendChild(orderActions);
            planList.appendChild(row);
          });

          // 친구별 필요 — 그림 + 한 줄 라벨. 어떤 필요인지는 탭하면 모달로.
          const newlyCovered = new Set<string>();
          if (prevCovered) for (const n of t.covered) if (!prevCovered.has(n)) newlyCovered.add(n);
          needsCard.replaceChildren();
          content.students.forEach((st, i) => {
            const avatar = studentAvatar(i);
            const doneCount = st.needs.filter((n) => t.covered.has(n)).length;
            const allDone = doneCount >= st.needs.length;
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `card am-need-card${allDone ? ' is-done' : ''}`;
            card.innerHTML = `
              ${avatar ? `<img src="${avatar}" alt="">` : ''}
              <span class="n-name">${st.name}</span>
              <span class="n-count">${allDone ? '✓ ' : ''}${doneCount}/${st.needs.length}</span>`;
            card.setAttribute('aria-label', `${st.name} 필요 ${doneCount}/${st.needs.length} 채움 — 자세히 보기`);
            card.addEventListener('click', () => {
              void audio.playSfx('tap');
              const chips = st.needs
                .map((n) => {
                  const ok = t.covered.has(n);
                  return `<span class="need-chip ${ok ? 'is-ok' : ''}">${ok ? '✓' : '■'} ${labelOf(n)}</span>`;
                })
                .join('');
              openModal({
                id: `need-${st.id}`,
                title: `${st.name}의 필요`,
                bodyHtml: `<div>${chips}</div>`,
                actions: [{ label: '닫기', kind: 'primary', autofocus: true, onClick: (close) => close() }]
              });
            });
            if (st.needs.some((n) => newlyCovered.has(n))) popBounce(card);
            needsCard.appendChild(card);
          });
          prevCovered = new Set(t.covered);

          // 충돌은 있을 때만 보여 준다 (없을 때 빈 띠 금지)
          conflictCard.hidden = t.conflicts.length === 0;
          conflictCard.innerHTML = t.conflicts.length
            ? `<ul style="margin:0;padding-left:20px">${t.conflicts.map((message) => `<li>${message}</li>`).join('')}</ul>`
            : '';

          // 친구별 필요 카드를 하단 진행 표시로 — 본문 세로 공간을 비운다
          setBottom(needsCard, submitBtn);

          // 조건을 모두 채우면 큐를 제출 버튼으로 이동
          const ready =
            chosen.length > 0 && !overTime && !overBudget && t.conflicts.length === 0 &&
            allNeeds.every((n) => t.covered.has(n));
          if (ready && !submitBtn.disabled) {
            if (!saidReady) {
              saidReady = true;
              guide?.say('좋아요! 제출을 눌러요!', { cue: submitBtn });
            } else {
              guide?.setCue(submitBtn);
            }
          } else {
            saidReady = false;
            // 지금 보이는 묶음 안의 카드만 큐로 (숨은 탭의 카드를 가리키지 않게)
            guide?.setCue([...poolButtons.values()].find((b) => !b.disabled && b.isConnected) ?? null);
          }
        };

        for (const b of content.blocks) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'card am-block';
          const prefChips = (BLOCK_PREFS[b.id] ?? [])
            .filter((p) => allPrefs.includes(p))
            .map((p) => `<span class="am-pref-chip">★ ${labelOf(p)}</span>`)
            .join('');
          const foodId = FOOD_IMG[b.id];
          const foodImg = foodId && hasAsset(foodId) ? `<img class="am-food" src="${assetUrl(foodId)}" alt="" aria-hidden="true">` : '';
          // 2줄로 압축: 제목 / 정보+필요칩 (1024×576에서도 스크롤 없이 담기게)
          btn.innerHTML = `
            ${foodImg}
            <div class="am-block-txt">
              <strong class="am-block-name">${b.label}</strong>
              <div class="am-meta">${b.minutes}분 · ${b.cost > 0 ? `${b.cost}코인` : '무료'}${b.covers.map((c) => `<span class="am-cover-chip">${labelOf(c)}</span>`).join('')}${prefChips}</div>
            </div>`;
          btn.setAttribute('aria-label', `${b.label} 시간표에 넣기`);
          btn.addEventListener('click', () => {
            if (btn.disabled || !acceptBoardAction()) return;
            void audio.playSfx('drop');
            btn.disabled = true;
            chosen.push(b.id);
            saveDraft();
            refreshBoard();
          });
          btn.disabled = chosen.includes(b.id);
          poolButtons.set(b.id, btn);
        }

        for (const cat of categories) {
          const tab = document.createElement('button');
          tab.type = 'button';
          tab.className = 'btn btn-ghost';
          tab.dataset.cat = cat;
          tab.textContent = CATEGORY_LABEL[cat] ?? cat;
          tab.addEventListener('click', () => {
            if (activeCat === cat) return;
            void audio.playSfx('tap');
            activeCat = cat;
            renderPool();
          });
          tabBar.appendChild(tab);
        }
        renderPool();

        panel.appendChild(gauges);
        rightCol.appendChild(planWrap);
        rightCol.appendChild(conflictCard);
        grid.appendChild(poolCol);
        grid.appendChild(rightCol);
        panel.appendChild(grid);

        const fb = document.createElement('div');
        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary btn-big';
        submitBtn.textContent = '제출';
        let submitting = false;
        let lastSubmitAt = 0;
        submitBtn.addEventListener('click', () => {
          const now = performance.now();
          if (submitting || finished || submitBtn.disabled || now - lastSubmitAt < 300) return;
          lastSubmitAt = now;
          submitting = true;
          const t = totals();
          const budgetOk = t.cost <= content.constraints.budget;
          const timeOk = t.minutes <= content.constraints.totalMinutes;
          const needsCovered = allNeeds.filter((n) => t.covered.has(n)).length;
          const needsOk = needsCovered >= allNeeds.length;
          const conflictFree = t.conflicts.length === 0;

          if (!S.firstSubmit) {
            S.firstSubmit = { needsCovered, budgetOk, timeOk, conflictFree };
            persist();
          }

          const problems: string[] = [];
          if (!budgetOk) problems.push(content.feedback.overBudget);
          if (!timeOk) problems.push(content.feedback.overTime);
          if (!needsOk) {
            const missing = allNeeds.filter((need) => !t.covered.has(need)).map(labelOf);
            problems.push(`${content.feedback.needMissed} 아직 필요한 것: ${missing.join(', ')}.`);
          }
          if (!conflictFree) problems.push(...t.conflicts);

          if (problems.length > 0) {
            const partial = needsCovered >= Math.ceil(allNeeds.length / 2) && problems.length <= 2;
            showFeedback(fb, partial ? 'partial' : 'retry', problems.join(' '), 'americas');
            S.submitFails += 1;
            persist();
          } else if (altMode) {
            const planA = S.planA ?? [];
            const same = planA.length === chosen.length && planA.every((id) => chosen.includes(id));
            if (same) {
              showFeedback(fb, 'partial', '조건은 모두 만족했지만 첫 번째 계획과 같은 활동 조합이에요. 활동을 하나 이상 바꿔 다른 해결 방법을 만들어 볼까요?', 'americas');
              S.submitFails += 1;
              persist();
            } else {
              showFeedback(fb, 'success', content.feedback.good, 'americas');
              burstConfetti(submitBtn);
              submitBtn.disabled = true;
              S.planB = [...chosen];
              S.draftAlt = [...chosen];
              S.compareChecks = [];
              persist();
              renderCompare(planA, S.planB);
            }
          } else {
            showFeedback(fb, 'success', content.feedback.good, 'americas');
            burstConfetti(submitBtn);
            submitBtn.disabled = true;
            S.planA = [...chosen];
            S.planB = null;
            S.draftPlan = [...chosen];
            persist();
            askAlternative(S.planA);
          }
          submitting = false;
        });
        panel.appendChild(fb);
        guide?.say(altMode ? '다른 조합으로 한 번 더 만들어 봐요!' : '활동을 눌러 하루를 채워요!');
        refreshBoard();
      };

      // ---- 첫 계획 성공 후: 대안 만들기 / 건너뛰기 선택 ----
      const askAlternative = (planA: string[]): void => {
        const t = planTotals(planA);
        openModal({
          id: 'americas-alt-choice',
          title: '계획 완성!',
          bodyHtml: `
            <p>네 친구의 필요를 모두 챙겼어요. 그런데 이런 하루는 하나만 있는 게 아니에요.</p>
            <p style="margin-top:8px;color:var(--c-ink-soft)">다른 조합으로 한 번 더 계획을 세워서 두 계획을 비교해 보면, '무엇을 얻고 무엇을 포기했는지' 보이게 돼요.</p>
            <p class="chip" style="margin-top:8px">지금 계획: 활동 ${planA.length}개 · ${t.minutes}분 · ${t.cost}코인</p>`,
          dismissible: false,
          actions: [
            {
              label: '건너뛰고 마치기',
              kind: 'ghost',
              onClick: (close) => {
                close();
                finish(0.25, allNeeds.length);
              }
            },
            {
              label: '다른 계획도 세워보기',
              kind: 'primary',
              autofocus: true,
              onClick: (close) => {
                close();
                S.planA = planA;
                goStage('alt');
              }
            }
          ]
        });
      };

      // ---- 4단계 마무리: 두 계획 비교 ----
      const renderCompare = (planA: string[], planB: string[]): void => {
        panel.replaceChildren();

        const head = document.createElement('div');
        head.className = 'am-head';
        head.innerHTML = `
          <div class="ribbon-title">
            <span class="ribbon-main">두 계획 비교</span>
            <span class="ribbon-sub">무엇을 얻고 무엇을 포기했나요?</span>
          </div>`;
        panel.appendChild(head);

        const mkSummary = (title: string, ids: string[]): string => {
          const t = planTotals(ids);
          const items = ids
            .map((id) => content.blocks.find((x) => x.id === id)?.label ?? id)
            .map((l) => `<li>${l}</li>`)
            .join('');
          return `
            <div class="card" style="flex:1">
              <h3 style="color:var(--c-navy);margin-bottom:6px">${title}</h3>
              <ul class="compare-list">${items}</ul>
              <p class="am-meta" style="margin-top:6px">${t.minutes}분 · ${t.cost}코인 · ★ ${t.prefsHit.size}</p>
            </div>`;
        };
        const compareRow = document.createElement('div');
        compareRow.className = 'vs-compare americas-compare-row';
        compareRow.innerHTML =
          mkSummary('첫 번째 계획', planA) +
          '<div class="vs-mark" aria-hidden="true">VS</div>' +
          mkSummary('두 번째 계획', planB);
        panel.appendChild(compareRow);

        const finishBtn = document.createElement('button');
        let saidDone = false;
        const checks: boolean[] = content.altCompare.questions.map((_, index) => S.compareChecks[index] === true);
        const refreshFinish = (): void => {
          const all = checks.every(Boolean);
          finishBtn.disabled = !all;
          setBottom(`질문 ${checks.filter(Boolean).length}/${checks.length} 확인`, finishBtn);
          if (all) {
            if (!saidDone) {
              saidDone = true;
              guide?.say('완료를 눌러요!', { cue: finishBtn });
            }
          } else {
            saidDone = false;
            guide?.setCue(qWrap);
          }
        };

        const qWrap = document.createElement('div');
        qWrap.className = 'card am-questions';
        content.altCompare.questions.forEach((q, i) => {
          const row = document.createElement('label');
          row.className = 'am-q-row';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = checks[i] ?? false;
          cb.style.cssText = 'width:24px;height:24px;accent-color:var(--c-violet);flex-shrink:0;margin-top:2px';
          cb.addEventListener('change', () => {
            checks[i] = cb.checked;
            S.compareChecks = [...checks];
            persist();
            refreshFinish();
          });
          const span = document.createElement('span');
          span.textContent = q;
          row.appendChild(cb);
          row.appendChild(span);
          qWrap.appendChild(row);
        });
        panel.appendChild(qWrap);

        finishBtn.className = 'btn btn-success btn-big';
        finishBtn.textContent = '완료';
        finishBtn.addEventListener('click', () => {
          if (finishBtn.disabled || finished) return;
          finishBtn.disabled = true;
          finish(1, allNeeds.length);
        });
        guide?.say('질문을 읽고 칸에 표시해요!');
        refreshFinish();
      };

      renderStage();
    },

    unmount() {
      dnd?.dispose();
      dnd = null;
      guide?.dispose();
      guide = null;
    }
  };
}
