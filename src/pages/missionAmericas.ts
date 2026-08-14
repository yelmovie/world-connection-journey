import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
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
  prayer_time: '조용히 기도할 짧은 시간',
  wheelchair_access: '휠체어로 다닐 수 있는 길',
  quiet_break: '조용히 쉬는 시간',
  hearing_support: '자막·그림처럼 눈으로 보는 자료',
  veggie_option: '채소 중심 메뉴',
  language_support: '그림·몸짓으로 소통할 도움',
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

const STAGE_LABEL: Record<Stage, string> = {
  profiles: '1단계 · 친구 알아보기',
  classify: '2단계 · 필요와 좋아하는 것 나누기',
  plan: '3단계 · 하루 일정 만들기',
  alt: '4단계 · 다른 계획과 비교하기'
};

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
.am-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: var(--sp-4); flex: 1; min-height: 0; }
.am-col { min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-3); }
.am-block { text-align: left; width: 100%; padding: 10px 12px; }
.am-block .am-meta { color: var(--c-ink-soft); font-size: var(--fs-small); }
.am-block:disabled { opacity: 0.45; cursor: not-allowed; }
.am-cover-chip { display: inline-flex; background: rgba(37,136,232,0.12); color: #14559c; border-radius: 999px; padding: 2px 10px; font-size: var(--fs-small); font-weight: 700; margin: 2px 4px 0 0; }
.am-pref-chip { display: inline-flex; background: rgba(242,193,78,0.25); color: #6b4a00; border-radius: 999px; padding: 2px 10px; font-size: var(--fs-small); font-weight: 700; margin: 2px 4px 0 0; }
.am-plan-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.am-gauge-row { display: flex; align-items: center; gap: var(--sp-3); }
.am-gauge-row .g-label { width: 44px; font-weight: 700; flex-shrink: 0; }
.am-gauge-row .g-value { min-width: 110px; text-align: right; font-weight: 700; }
.am-gauge-row.is-over .g-value { color: var(--c-danger); }
.am-gauge-row.is-over .progress-fill { background: var(--c-danger); }
.need-chip { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 10px; font-size: var(--fs-small); font-weight: 700; background: rgba(25,50,77,0.1); color: var(--c-ink-soft); margin: 2px 4px 0 0; }
.need-chip.is-ok { background: rgba(46,173,120,0.18); color: #17573d; }
.cl-item { padding: 8px 12px; font-weight: 700; }
.cl-item.is-wrong { border-color: var(--c-coral); box-shadow: 0 0 0 3px rgba(242,109,109,0.35); }
.cl-item.is-right { border-color: var(--c-success); }
.cl-zone { flex: 1; min-height: 120px; padding: var(--sp-3); display: flex; flex-direction: column; gap: 8px; align-content: flex-start; }
.cl-zone h3 { font-size: var(--fs-body); color: var(--c-navy); }
.profile-card { text-align: center; }
.profile-card img { width: 88px; height: 88px; object-fit: contain; }
.compare-list { margin: 0; padding-left: 18px; }
.compare-list li { font-size: var(--fs-small); }
.travel-row { display: flex; gap: 8px; align-items: center; padding: 3px 10px; color: var(--c-ink-soft); font-size: var(--fs-small); }
.conflict-card { border-left: 5px solid var(--c-success); }
.conflict-card.has-conflict { border-left-color: var(--c-coral); }
.plan-order-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.page .btn { color: #0F172A; text-shadow: none; }
/* 좌하단 가이드 말풍선이 컨트롤을 가리지 않게 스크롤 여백 확보 */
.page-body > .panel { padding-bottom: 110px; }
@media (max-width: 820px), (min-resolution: 1.8dppx) {
  .am-grid { grid-template-columns: 1fr; overflow-y: visible; }
  .am-col { overflow-y: visible; }
  .americas-profile-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .americas-compare-row { flex-direction: column; }
}
@media (max-width: 520px) {
  .americas-profile-grid { grid-template-columns: 1fr !important; }
}
`;

export function createPage(): Page {
  let dnd: PickPlaceController | null = null;
  let guide: GuideController | null = null;

  return {
    async mount(root: HTMLElement) {
      const content = await loadContent<AmericasContent>('americas');
      await preloadImages(['bg.americas', 'americas.student1', 'americas.student2', 'americas.student3', 'americas.student4']);
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
      page.className = 'page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.45), rgba(20,45,80,0.6)), url('${assetUrl('bg.americas')}')`;

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

      // 마스코트 가이드 — 절차 안내는 말풍선으로, 화면 글자는 최소로
      guide = createGuide();
      page.appendChild(guide.el);

      const setBottom = (hint: string): void => {
        bottom.innerHTML = `<span class="chip">${hint}</span>`;
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
        setBottom(STAGE_LABEL.profiles);
        const head = document.createElement('div');
        head.innerHTML = `
          <h2 style="color:var(--c-navy)">어울림 학급 친구들을 만나요</h2>
          <p style="color:var(--c-ink-soft)">친구들의 '필요'는 나라가 아니라 저마다의 사정 때문이에요.</p>`;
        panel.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'americas-profile-grid';
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-4)';
        const nextBtn = document.createElement('button');

        const refreshNext = (): void => {
          const all = content.students.every((st) => S.viewed.includes(st.id));
          nextBtn.disabled = !all;
          nextBtn.textContent = all ? '다음 단계 ▶' : `친구 카드 ${S.viewed.length}/${content.students.length} 읽는 중`;
          if (all) {
            guide?.say('모두 만났어요! 다음 단계를 눌러요!', { cue: nextBtn });
          } else {
            const idx = content.students.findIndex((st) => !S.viewed.includes(st.id));
            guide?.setCue((grid.children[idx] as HTMLElement | undefined) ?? null);
          }
        };

        content.students.forEach((st, i) => {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'card profile-card';
          const avatar = studentAvatar(i);
          const renderMark = () =>
            `<span class="chip" data-mark>${S.viewed.includes(st.id) ? '✓ 읽었어요' : '눌러서 알아보기'}</span>`;
          card.innerHTML = `
            ${avatar ? `<img src="${avatar}" alt="">` : ''}
            <p style="font-family:var(--font-head);color:var(--c-navy);font-size:var(--fs-body)">${st.name}</p>
            <p class="am-meta" style="color:var(--c-ink-soft);font-size:var(--fs-small)">${st.from}에서 왔어요</p>
            ${renderMark()}`;
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
              const mark = card.querySelector('[data-mark]');
              if (mark) mark.textContent = '✓ 읽었어요';
              refreshNext();
            }
          });
          grid.appendChild(card);
        });
        panel.appendChild(grid);

        nextBtn.className = 'btn btn-primary btn-big';
        nextBtn.style.alignSelf = 'center';
        nextBtn.addEventListener('click', () => {
          if (nextBtn.disabled) return;
          nextBtn.disabled = true;
          goStage('classify');
        });
        if (!content.students.every((st) => S.viewed.includes(st.id))) {
          guide?.say('친구 네 명을 모두 만나 봐요!');
        }
        refreshNext();
        panel.appendChild(nextBtn);
      };

      // ---- 2단계: 필요/선호 분류 ----
      const renderClassify = (): void => {
        setBottom(`${STAGE_LABEL.classify} — 끌어다 놓거나, 누른 뒤 놓을 곳을 눌러도 돼요`);
        if (!S.classify) S.classify = { first: -1, final: 0, retries: 0 };
        const cl = S.classify;

        const head = document.createElement('div');
        head.innerHTML = `
          <h2 style="color:var(--c-navy)">'꼭 필요한 것'과 '좋아하는 것'은 달라요</h2>
          <p style="color:var(--c-ink-soft)">필요: 없으면 함께하기 어려워요 · 좋아하는 것: 있으면 더 즐거워요</p>`;
        panel.appendChild(head);

        const pool = document.createElement('div');
        pool.className = 'drop-zone cl-zone';
        pool.dataset.zoneId = 'pool';
        pool.innerHTML = `<h3>나눌 카드</h3>`;
        const poolPlaceButton = document.createElement('button');
        poolPlaceButton.type = 'button';
        poolPlaceButton.className = 'btn btn-ghost';
        poolPlaceButton.textContent = '선택한 카드를 나눌 카드로 되돌리기';
        pool.appendChild(poolPlaceButton);
        const poolList = document.createElement('div');
        poolList.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
        pool.appendChild(poolList);

        const zoneWrap = document.createElement('div');
        zoneWrap.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)';
        const mkZone = (id: 'need' | 'pref', title: string) => {
          const z = document.createElement('div');
          z.className = 'drop-zone cl-zone';
          z.dataset.zoneId = id;
          z.innerHTML = `<h3>${title}</h3>`;
          const placeButton = document.createElement('button');
          placeButton.type = 'button';
          placeButton.className = 'btn btn-ghost';
          placeButton.textContent = `선택한 카드를 '${title}'에 놓기`;
          z.appendChild(placeButton);
          const list = document.createElement('div');
          list.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start';
          z.appendChild(list);
          return { z, list };
        };
        const needZone = mkZone('need', '꼭 필요해요');
        const prefZone = mkZone('pref', '좋아하는 것');
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
          checkBtn.textContent =
            placements.size < classifyItems.length
              ? `카드 ${placements.size}/${classifyItems.length} 나누는 중`
              : '확인하기';
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

        checkBtn.className = 'btn btn-primary';
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
            guide?.say('정확해요! 다음 단계를 눌러요!', { cue: nextBtn });
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
            nextBtn.textContent = '이대로 다음 단계 ▶';
            refreshCheck();
          }
          persist();
          checking = false;
        });

        nextBtn.className = 'btn btn-success';
        nextBtn.textContent = '다음 단계 ▶';
        nextBtn.style.display = 'none';
        nextBtn.addEventListener('click', () => {
          if (nextBtn.disabled) return;
          nextBtn.disabled = true;
          goStage('plan');
        });

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:var(--sp-3);flex-wrap:wrap';
        actions.appendChild(checkBtn);
        actions.appendChild(nextBtn);

        panel.appendChild(pool);
        panel.appendChild(zoneWrap);
        panel.appendChild(actions);
        panel.appendChild(fb);
        refreshCheck();
        if (cl.first >= 0) {
          nextBtn.style.display = '';
          if (cl.final < 1) nextBtn.textContent = '이대로 다음 단계 ▶';
        }
        if (cl.final >= 1) guide?.say('잘 나눴어요! 다음 단계를 눌러요!', { cue: nextBtn });
        else guide?.say('꼭 필요한 것부터 나눠 봐요!');
      };

      // ---- 3·4단계: 일정 조립 (altMode = 두 번째 계획) ----
      const renderPlan = (altMode: boolean): void => {
        setBottom(
          altMode
            ? STAGE_LABEL.alt
            : `${STAGE_LABEL.plan} — 예산 ${content.constraints.budget}코인 · ${content.constraints.totalMinutes}분`
        );
        const chosen: string[] = cleanPlan(altMode ? S.draftAlt : S.draftPlan);
        const saveDraft = (): void => {
          if (altMode) S.draftAlt = [...chosen];
          else S.draftPlan = [...chosen];
          persist();
        };

        const head = document.createElement('div');
        head.innerHTML = `
          <h2 style="color:var(--c-navy)">${altMode ? '두 번째 계획 세우기' : '함께 보낼 하루를 계획해요'}</h2>
          <p style="color:var(--c-ink-soft)">${
            altMode ? '첫 계획과 다른 조합으로 만들어 봐요.' : '정답 조합은 여러 개예요!'
          }</p>
          <p class="chip">장소가 바뀌면 이동 10분 · ↑ 앞·↓ 뒤 버튼으로 순서 조정</p>`;
        panel.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'am-grid';

        // 왼쪽: 활동 카드 풀
        const poolCol = document.createElement('div');
        poolCol.className = 'am-col';
        poolCol.innerHTML = `<h3 style="color:var(--c-navy)">활동 카드</h3>`;
        const poolButtons = new Map<string, HTMLButtonElement>();

        // 오른쪽: 게이지 + 시간표 + 필요 체크리스트
        const rightCol = document.createElement('div');
        rightCol.className = 'am-col';
        const gauges = document.createElement('div');
        gauges.className = 'card';
        gauges.style.cssText = 'display:flex;flex-direction:column;gap:8px';
        const planWrap = document.createElement('div');
        planWrap.innerHTML = `<h3 style="color:var(--c-navy)">오늘의 시간표</h3>`;
        const planList = document.createElement('div');
        planList.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:56px';
        const planEmpty = document.createElement('p');
        planEmpty.className = 'chip';
        planEmpty.textContent = '아직 비어 있어요. 왼쪽 카드를 눌러 넣어 보세요.';
        planWrap.appendChild(planList);
        const needsCard = document.createElement('div');
        needsCard.className = 'card';
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

        const refreshBoard = (): void => {
          const t = totals();
          const overTime = t.minutes > content.constraints.totalMinutes;
          const overBudget = t.cost > content.constraints.budget;
          const timePct = Math.min(100, Math.round((t.minutes / content.constraints.totalMinutes) * 100));
          const budgetPct =
            content.constraints.budget > 0 ? Math.min(100, Math.round((t.cost / content.constraints.budget) * 100)) : 0;
          gauges.innerHTML = `
            <div class="am-gauge-row ${overTime ? 'is-over' : ''}">
              <span class="g-label">시간</span>
              <div class="progress-track" role="progressbar" aria-label="사용한 시간 ${t.minutes}분" aria-valuemin="0" aria-valuemax="${content.constraints.totalMinutes}" aria-valuenow="${Math.min(t.minutes, content.constraints.totalMinutes)}"><div class="progress-fill" style="width:${timePct}%"></div></div>
              <span class="g-value">${t.minutes}/${content.constraints.totalMinutes}분${overTime ? ' · 넘쳤어요' : ''}</span>
            </div>
            <div class="am-gauge-row ${overBudget ? 'is-over' : ''}">
              <span class="g-label">예산</span>
              <div class="progress-track" role="progressbar" aria-label="사용한 예산 ${t.cost}코인" aria-valuemin="0" aria-valuemax="${content.constraints.budget}" aria-valuenow="${Math.min(t.cost, content.constraints.budget)}"><div class="progress-fill" style="width:${budgetPct}%"></div></div>
              <span class="g-value">${t.cost}/${content.constraints.budget}코인${overBudget ? ' · 넘쳤어요' : ''}</span>
            </div>
            <p class="chip">활동 ${t.activityMinutes}분 + 장소 이동 ${t.travelMinutes}분</p>
            <div><span class="am-pref-chip">★ 좋아하는 것 보너스 ${t.prefsHit.size}개</span></div>`;

          // 시간표
          planList.replaceChildren();
          if (chosen.length === 0) planList.appendChild(planEmpty);
          chosen.forEach((id, index) => {
            const b = blockById.get(id);
            if (!b) return;
            const travel = travelBetween(index > 0 ? chosen[index - 1] ?? null : null, id);
            if (travel > 0) {
              const travelRow = document.createElement('div');
              travelRow.className = 'travel-row';
              travelRow.textContent = `↳ ${placeOf(id).label}(으)로 이동 ${travel}분`;
              planList.appendChild(travelRow);
            }
            const row = document.createElement('div');
            row.className = 'card am-plan-item';
            row.innerHTML = `
              <div>
                <strong>${b.label}</strong>
                <div class="am-meta">${placeOf(id).label} · ${b.minutes}분 · ${b.cost > 0 ? `${b.cost}코인` : '무료'}</div>
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
            orderActions.appendChild(makeMoveButton(-1, '↑ 앞'));
            orderActions.appendChild(makeMoveButton(1, '↓ 뒤'));
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

          // 학생별 필요 체크리스트
          needsCard.innerHTML =
            `<h3 style="color:var(--c-navy);margin-bottom:8px">친구들의 필요 채우기</h3>` +
            content.students
              .map((st, i) => {
                const avatar = studentAvatar(i);
                const chips = st.needs
                  .map((n) => {
                    const ok = t.covered.has(n);
                    return `<span class="need-chip ${ok ? 'is-ok' : ''}">${ok ? '✓' : '■'} ${labelOf(n)}</span>`;
                  })
                  .join('');
                return `
                  <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                    ${avatar ? `<img src="${avatar}" alt="" style="width:32px;height:32px;object-fit:contain;flex-shrink:0">` : ''}
                    <span style="font-weight:700;width:64px;flex-shrink:0">${st.name}</span>
                    <span>${chips}</span>
                  </div>`;
              })
              .join('');

          conflictCard.classList.toggle('has-conflict', t.conflicts.length > 0);
          conflictCard.innerHTML = t.conflicts.length
            ? `<h3 style="color:var(--c-navy);margin-bottom:6px">조정할 충돌 ${t.conflicts.length}개</h3><ul style="margin:0;padding-left:20px">${t.conflicts.map((message) => `<li>${message}</li>`).join('')}</ul>`
            : '<strong>✓ 일정 순서 충돌이 없어요</strong><p class="am-meta">이동 시간과 활동 순서까지 확인했어요.</p>';

          // 조건을 모두 채우면 큐를 제출 버튼으로 이동
          const ready =
            chosen.length > 0 && !overTime && !overBudget && t.conflicts.length === 0 &&
            allNeeds.every((n) => t.covered.has(n));
          if (ready && !submitBtn.disabled) {
            if (!saidReady) {
              saidReady = true;
              guide?.say(altMode ? '좋아요! 두 번째 계획을 제출해요!' : '좋아요! 계획 제출하기를 눌러요!', { cue: submitBtn });
            } else {
              guide?.setCue(submitBtn);
            }
          } else {
            saidReady = false;
            guide?.setCue([...poolButtons.values()].find((b) => !b.disabled) ?? null);
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
          btn.innerHTML = `
            <strong>${b.label}</strong>
            <div class="am-meta">${placeOf(b.id).label} · ${b.minutes}분 · ${b.cost > 0 ? `${b.cost}코인` : '무료'}</div>
            <div>${b.covers.map((c) => `<span class="am-cover-chip">${labelOf(c)}</span>`).join('')}${prefChips}</div>`;
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
          poolCol.appendChild(btn);
        }

        rightCol.appendChild(gauges);
        rightCol.appendChild(planWrap);
        rightCol.appendChild(needsCard);
        rightCol.appendChild(conflictCard);
        grid.appendChild(poolCol);
        grid.appendChild(rightCol);
        panel.appendChild(grid);

        const fb = document.createElement('div');
        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary btn-big';
        submitBtn.textContent = altMode ? '두 번째 계획 제출' : '계획 제출하기';
        submitBtn.style.alignSelf = 'center';
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
              submitBtn.disabled = true;
              S.planB = [...chosen];
              S.draftAlt = [...chosen];
              S.compareChecks = [];
              persist();
              renderCompare(planA, S.planB);
            }
          } else {
            showFeedback(fb, 'success', content.feedback.good, 'americas');
            submitBtn.disabled = true;
            S.planA = [...chosen];
            S.planB = null;
            S.draftPlan = [...chosen];
            persist();
            askAlternative(S.planA);
          }
          submitting = false;
        });
        panel.appendChild(submitBtn);
        panel.appendChild(fb);
        guide?.say(altMode ? '다른 조합으로 한 번 더 만들어 봐요!' : '블록을 눌러 하루를 채워요! 게이지를 봐요!');
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
        setBottom(STAGE_LABEL.alt);

        const head = document.createElement('div');
        head.innerHTML = `
          <h2 style="color:var(--c-navy)">두 계획, 무엇이 달랐을까요?</h2>
          <p style="color:var(--c-ink-soft)">무엇을 얻고 무엇을 포기했는지 살펴봐요.</p>`;
        panel.appendChild(head);

        const mkSummary = (title: string, ids: string[]): string => {
          const t = planTotals(ids);
          const items = ids
            .map((id) => content.blocks.find((x) => x.id === id)?.label ?? id)
            .map((l) => `<li>${l}</li>`)
            .join('');
          return `
            <div class="card" style="flex:1">
              <h3 style="color:var(--c-navy);margin-bottom:8px">${title}</h3>
              <ul class="compare-list">${items}</ul>
              <p style="margin-top:8px;font-weight:700">${t.minutes}분(활동 ${t.activityMinutes} + 이동 ${t.travelMinutes}) · ${t.cost}코인</p>
              <p><span class="need-chip is-ok">✓ 필요 ${allNeeds.length}개 모두 채움</span></p>
              <p><span class="am-pref-chip">★ 좋아하는 것 보너스 ${t.prefsHit.size}개</span></p>
            </div>`;
        };
        const compareRow = document.createElement('div');
        compareRow.className = 'americas-compare-row';
        compareRow.style.cssText = 'display:flex;gap:var(--sp-4);align-items:stretch';
        compareRow.innerHTML = mkSummary('첫 번째 계획', planA) + mkSummary('두 번째 계획', planB);
        panel.appendChild(compareRow);

        const finishBtn = document.createElement('button');
        let saidDone = false;
        const checks: boolean[] = content.altCompare.questions.map((_, index) => S.compareChecks[index] === true);
        const refreshFinish = (): void => {
          const all = checks.every(Boolean);
          finishBtn.disabled = !all;
          finishBtn.textContent = all ? '미션 완료하기' : `질문 ${checks.filter(Boolean).length}/${checks.length} 생각하는 중`;
          if (all) {
            if (!saidDone) {
              saidDone = true;
              guide?.say('미션 완료를 눌러요!', { cue: finishBtn });
            }
          } else {
            saidDone = false;
            guide?.setCue(qWrap);
          }
        };

        const qWrap = document.createElement('div');
        qWrap.className = 'card';
        content.altCompare.questions.forEach((q, i) => {
          const row = document.createElement('label');
          row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:8px 0;cursor:pointer;min-height:var(--touch-min)';
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
        const hint = document.createElement('p');
        hint.className = 'chip';
        hint.textContent = '질문을 읽고 내 생각을 정리했으면 칸에 표시해 주세요';
        qWrap.prepend(hint);
        panel.appendChild(qWrap);

        finishBtn.className = 'btn btn-success btn-big';
        finishBtn.style.alignSelf = 'center';
        finishBtn.addEventListener('click', () => {
          if (finishBtn.disabled || finished) return;
          finishBtn.disabled = true;
          finish(1, allNeeds.length);
        });
        guide?.say('다른 계획과 비교해 볼까요?');
        refreshFinish();
        panel.appendChild(finishBtn);
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
