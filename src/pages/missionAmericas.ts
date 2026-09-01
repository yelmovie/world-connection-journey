import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { recordEarthSignals } from '../core/earthSignals';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { enablePickPlace, enableRangeDrag, type PickPlaceController } from '../ui/dnd';
import { completeMissionFlow } from '../ui/feedback';
import { burstConfetti, popBounce } from '../ui/fx';
import { openCharacterDialogue } from '../ui/characterDialogue';
import { createGuide, type GuideController } from '../ui/guide';
import { getLearn, readLearnRecord, showFriendIntro, showLearningWrap } from '../ui/learnFrame';
import { showToast } from '../ui/toast';
import { airplaneChoice } from '../ui/airplaneFleet';
import { fitAspect } from '../ui/aspectBox';
import { showKeyPoint } from '../ui/keyPoint';
import { openModal } from '../ui/modal';
import { enableMapZoom } from '../ui/mapZoom';
import { selectedAvatarSpeaker } from '../ui/avatarRoster';

/* ================= 콘텐츠 타입 ================= */

interface StudentDef {
  id: string;
  name: string;
  from: string;
  needs: string[];
  prefs: string[];
  culture: string;
  note: string;
  dialogue?: Array<{ role: 'player' | 'student'; label: string; text: string }>;
}

interface PostcardDef { countryId: string; studentId: string; hint: string; extraHint: string }
interface LensPointDef { id: string; x: number; y: number; label: string; note: string }
interface LensDef { id: string; label: string; desc: string; points: LensPointDef[] }
interface StopDef { id: string; label: string; note: string }
interface BagItemDef { id: string; label: string; line: string; kind?: string; needsReview?: boolean }
interface CountryDef {
  id: string; studentId: string; name: string;
  mode: 'voyage' | 'trail' | 'river' | 'altitude';
  position: { x: number; y: number };
  modeGuide: string;
  stops: StopDef[];
  bag: BagItemDef[];
}
interface DaySlotDef {
  id: string; label: string;
  prompt: string; stickerLabel: string;
  scenes: Array<{ studentId: string; text: string }>;
  pairs: string[][];
  commonLine: string;
}
interface ExploreDef {
  postcards: PostcardDef[];
  lenses: LensDef[];
  countries: CountryDef[];
  day: { guide: string; slots: DaySlotDef[] };
  note: {
    categories: Array<{ id: string; label: string; desc: string }>;
    keywordSlots: number;
    keywords: string[];
    wrongKeywords: string[];
  };
  signals: Array<{ id: string; issueId: string; label: string; line: string }>;
}

interface AmericasContent {
  intro: { title: string; subtitle: string; guide: string };
  students: StudentDef[];
  explore: ExploreDef;
  learn?: unknown;
}

function assertContent(content: AmericasContent): void {
  if (!Array.isArray(content.students) || content.students.length !== 4) {
    throw new Error('아메리카 콘텐츠 오류: students는 네 친구 배열이어야 해요.');
  }
  const e = content.explore;
  if (!e || e.postcards?.length !== 4 || e.countries?.length !== 4 || e.lenses?.length !== 3) {
    throw new Error('아메리카 콘텐츠 오류: explore 섹션(대화창 4·나라 4·렌즈 3)이 필요해요.');
  }
  for (const c of e.countries) {
    if (c.stops.length < 3 || c.bag.length < 3) {
      throw new Error(`아메리카 콘텐츠 오류: ${c.name}의 탐험 지점·문화 가방이 부족해요.`);
    }
  }
  if (!e.day || e.day.slots.length < 3) throw new Error('아메리카 콘텐츠 오류: 하루 비교 장면이 필요해요.');
}

/* ================= 진행 상태 ================= */

const SCREENS = ['landing', 'lens', 'countries', 'day', 'note', 'signal'] as const;
type Screen = (typeof SCREENS)[number];

interface CountryProgress { stopsSeen: string[]; met: boolean; bagSeen: string[]; keep: string | null; done: boolean }
interface ExpState {
  screen: Screen;
  placed: string[];
  lensVisited: string[];
  pointsSeen: string[];
  countries: Record<string, CountryProgress>;
  daySolved: string[];
  notePlaced: Record<string, string>;
  keywords: string[];
}

const emptyCountry = (): CountryProgress => ({ stopsSeen: [], met: false, bagSeen: [], keep: null, done: false });

function restoreState(data: Record<string, unknown>, countryIds: string[]): ExpState {
  const base: ExpState = {
    screen: 'landing', placed: [], lensVisited: [], pointsSeen: [],
    countries: Object.fromEntries(countryIds.map((id) => [id, emptyCountry()])),
    daySolved: [], notePlaced: {}, keywords: []
  };
  const raw = data.exploreProgress;
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  base.screen = SCREENS.includes(r.screen as Screen) ? (r.screen as Screen) : 'landing';
  base.placed = strArr(r.placed).filter((id) => countryIds.includes(id));
  base.lensVisited = strArr(r.lensVisited);
  base.pointsSeen = strArr(r.pointsSeen);
  base.daySolved = strArr(r.daySolved);
  base.keywords = strArr(r.keywords);
  if (r.notePlaced && typeof r.notePlaced === 'object') {
    for (const [k, v] of Object.entries(r.notePlaced as Record<string, unknown>)) {
      if (typeof v === 'string') base.notePlaced[k] = v;
    }
  }
  if (r.countries && typeof r.countries === 'object') {
    for (const id of countryIds) {
      const c = (r.countries as Record<string, unknown>)[id];
      if (c && typeof c === 'object') {
        const cr = c as Record<string, unknown>;
        base.countries[id] = {
          stopsSeen: strArr(cr.stopsSeen), met: cr.met === true,
          bagSeen: strArr(cr.bagSeen), keep: typeof cr.keep === 'string' ? cr.keep : null,
          done: cr.done === true
        };
      }
    }
  }
  return base;
}

/* ================= 스타일 ================= */

const PAGE_CSS = `
.am-scene { --am-copy:clamp(21px,1.32vw,27px); --am-label:clamp(19px,1.12vw,23px); }
.am-scene .page-body { min-height:0; max-width:min(1840px,100%); padding:var(--sp-3) clamp(12px,1.5vw,28px) clamp(10px,1.5vh,18px); display:flex; }
.am-stage { flex:1; min-height:0; width:100%; margin:0 auto; display:flex; flex-direction:column; gap:var(--sp-3); }
.am-scene .panel { background:rgba(255,255,255,.62); backdrop-filter:blur(6px) saturate(1.05); border:2px solid rgba(255,255,255,.72); border-radius:var(--radius-l); box-shadow:var(--shadow-card); padding:clamp(12px,1.2vw,20px); }
.am-scene .btn { color:#0F172A; text-shadow:none; }
.am-scene > .top-bar, .am-scene > .bottom-bar { background:transparent !important; backdrop-filter:none !important; }
.am-scene .bottom-bar { position:relative; z-index:var(--z-panel); flex-wrap:wrap; }
.am-actions { display:flex; gap:10px; margin-left:auto; }
.am-actions .btn { min-height:56px; font-size:max(20px,var(--am-label)); }
.am-scene > .bottom-bar > .chip { font-size:clamp(18px,1.08vw,22px); font-weight:850; }

/* ---- 대륙 지도 ---- */
.exp-wrap { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1.85fr) minmax(340px,.68fr); grid-template-rows:minmax(0,1fr); gap:clamp(12px,1.2vw,20px); }
.exp-map-fit { min-width:0; min-height:0; display:grid; }
.exp-wrap > .exp-map-fit, .am-stage > .exp-map-fit { min-height:0; }
.am-stage > .exp-map-fit { flex:1; }
.exp-map-viewport { position:relative; overflow:hidden; border-radius:24px; border:3px solid rgba(255,255,255,.7); box-shadow:var(--shadow-card); background:#1c72ad; touch-action:none; }
.exp-drop-hint { display:none; position:absolute; z-index:8; left:50%; top:14px; transform:translateX(-50%); padding:8px 18px; border-radius:999px; background:#fff8daf2; border:3px solid #f2c14e; color:#5b430a; box-shadow:var(--shadow-card); font:900 max(17px,var(--am-label)) var(--font-head); white-space:nowrap; pointer-events:none; }
.exp-map { position:absolute; inset:0; background:linear-gradient(180deg,#3f9fd4,#1c72ad); transform-origin:50% 50%; transition:transform .12s ease-out; }
/* 지도 이미지는 16:9다. 상자를 같은 비율로 고정해야 %로 찍은 나라·렌즈 좌표가 그림 위 실제 위치와 일치한다. */
.exp-map::before { content:''; position:absolute; inset:0; z-index:0; pointer-events:none; transition:background var(--t-med) ease; }
.exp-map[data-lens=nature]::before { background:linear-gradient(180deg,rgba(46,150,92,.26),rgba(24,104,74,.34)); }
.exp-map[data-lens=life]::before { background:linear-gradient(180deg,rgba(255,196,86,.24),rgba(206,116,44,.32)); }
.exp-map__land { position:absolute; inset:0; pointer-events:none; }
.exp-map__land i { position:absolute; display:block; background:linear-gradient(160deg,#9ecf7f,#5ea45f); box-shadow:inset 0 -10px 24px #3d7442aa, 0 6px 18px #0a3a5544; }
.exp-map__land .north { left:16%; top:6%; width:52%; height:42%; border-radius:58% 42% 46% 54%/55% 48% 52% 45%; }
.exp-map__land .central { left:33%; top:41%; width:16%; height:14%; border-radius:40% 60% 55% 45%; transform:rotate(24deg); }
.exp-map__land .south { left:39%; top:50%; width:34%; height:44%; border-radius:52% 48% 40% 60%/42% 50% 58% 50%; }
.exp-map__equator { position:absolute; left:6%; right:6%; top:57%; border-top:3px dashed #ffe276; pointer-events:none; }
.exp-map__equator span { position:absolute; right:0; top:6px; background:#173c55dd; color:#fff; padding:3px 10px; border-radius:8px; font-size:15px; font-weight:800; }
.exp-map__ocean { position:absolute; padding:5px 11px; border-radius:999px; background:#0e405dcc; color:#fff; font-size:clamp(14px,1vw,18px); font-weight:850; pointer-events:none; }

/* 나라 자리(놓는 곳)와 놓인 친구 */
.exp-slot { position:absolute; transform:translate(-50%,-50%); width:clamp(96px,9vw,128px); height:clamp(96px,9vw,128px); border-radius:50%; border:4px dashed rgba(255,255,255,.9); background:rgba(255,255,255,.18); display:grid; place-items:center; color:#fff; font:900 clamp(15px,1.1vw,19px) var(--font-head); text-shadow:0 1px 4px #0009; cursor:copy; transition:border-color var(--t-fast),background var(--t-fast),box-shadow var(--t-fast),scale var(--t-fast); }
.exp-slot.is-dnd-ready,.exp-wrap.has-pick .exp-slot:not(.is-filled) { border-color:#ffe276; background:rgba(255,226,118,.3); box-shadow:0 0 0 7px rgba(255,226,118,.2),0 8px 20px rgba(3,29,52,.35); animation:amDropTarget 1.05s ease-in-out infinite; }
.exp-slot.is-over { border-style:solid; border-color:#fff; background:rgba(16,195,200,.62); box-shadow:0 0 0 10px rgba(16,195,200,.24),0 10px 26px rgba(3,29,52,.45); scale:1.08; animation:none; }
@keyframes amDropTarget { 50% { box-shadow:0 0 0 12px rgba(255,226,118,0),0 8px 20px rgba(3,29,52,.35); } }
.exp-slot.is-filled { border-style:solid; border-color:#ffd75e; background:rgba(255,255,255,.92); color:#14559c; text-shadow:none; }
.exp-slot.is-filled img { width:70%; height:70%; object-fit:contain; border-radius:50%; }
.exp-slot .slot-name { position:absolute; bottom:-30px; background:#fff; color:#14559c; border-radius:999px; padding:3px 12px; font-size:16px; box-shadow:var(--shadow-card); white-space:nowrap; }

/* 친구 대화창 */
.exp-cards { min-height:0; overflow:auto; display:flex; flex-direction:column; gap:10px; }
#scene-root .am-scene .exp-cards.panel { align-self:start; max-height:100%; padding:0; border:0; border-radius:0; background:transparent; backdrop-filter:none; box-shadow:none; }
.exp-cards__title { margin:0 0 2px; padding:2px 6px; color:#fff; font:900 var(--fs-title) var(--font-head); text-shadow:0 3px 10px rgba(3,29,52,.88),0 1px 2px rgba(3,29,52,.95); }
.exp-dnd-guide { margin:0 0 4px; padding:8px 10px; border-radius:14px; background:rgba(255,248,218,.94); border:2px solid #f2c14e; color:#5b430a; font:850 clamp(14px,.94vw,18px)/1.2 var(--font-body); display:flex; align-items:center; justify-content:center; gap:6px; text-align:center; white-space:nowrap; }
.exp-dnd-guide b { display:grid; place-items:center; width:26px; height:26px; flex:0 0 auto; border-radius:50%; background:#f2c14e; color:#4c3600; font-family:var(--font-head); }
.exp-dnd-guide i { font-style:normal; color:#8a5a00; font-weight:950; }
.postcard { flex:0 0 auto; position:relative; text-align:left; padding:10px 66px 10px 62px; min-height:76px; border:3px solid rgba(217,201,163,.85); border-radius:16px; background:rgba(255,252,240,.86); backdrop-filter:blur(6px); box-shadow:var(--shadow-card); font-size:var(--am-label); line-height:1.4; touch-action:none; transition:transform var(--t-fast),border-color var(--t-fast),box-shadow var(--t-fast); }
.postcard-grip { position:absolute; right:10px; top:50%; transform:translateY(-50%); width:42px; height:44px; border:2px dashed #c9a86a; border-radius:9px; display:grid; place-items:center; background:rgba(255,255,255,.55); color:#8a5a00; font:900 25px/1 var(--font-head); pointer-events:none; }
.postcard img { position:absolute; left:10px; top:50%; transform:translateY(-50%); width:46px; height:46px; border-radius:50%; object-fit:cover; border:2px solid #fff; box-shadow:var(--shadow-card); }
.postcard.is-selected { border-color:var(--c-gold); background:#fff6cf; transform:translateX(-5px); box-shadow:0 0 0 5px rgba(242,193,78,.25),var(--shadow-card); }
.postcard.is-dragging { opacity:.35; }
.postcard.is-wrong { animation:cardShake .4s; border-color:var(--c-coral); }
.postcard.is-locked { opacity:.55; pointer-events:none; }
.postcard.is-done { opacity:.4; pointer-events:none; border-color:var(--c-success); }
@keyframes cardShake { 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }
.postcard .pc-extra { display:block; margin-top:6px; color:#8a5a00; font-weight:900; }

/* 아메리카 전 화면: 가이드의 빈 행을 접고 비행기 왼쪽 안전 영역 + 확장 본문을 공유한다. */
@media (min-width:1360px) {
  .am-scene[data-screen=landing] .exp-wrap { grid-template-columns:clamp(230px,15vw,290px) minmax(0,1fr) clamp(320px,18vw,350px); }
  .am-scene[data-screen=landing] .exp-map-fit { grid-column:2; }
  .am-scene[data-screen=landing] .exp-cards { grid-column:3; }
  .am-scene:not([data-screen=landing]) > .page-body > .am-stage { padding-left:clamp(230px,15vw,290px); }
  .am-scene:not([data-screen=landing]) > .page-body > .am-stage:has(> .bag-stage) { padding-left:0; }
}
.am-scene { --guide-size:clamp(220px,15vw,280px); --guide-lane-h:0px; --bottom-bar-h:64px; --dock-baseline:8px; }
.am-scene > .page-body { max-width:100%; padding:var(--sp-2) clamp(8px,1vw,16px); overflow:hidden; }
.am-scene > .page-body > .am-stage { width:100%; max-width:none; }
.am-scene .am-stage > .exp-map-fit > .aspect-fit { place-items:start center; }
.am-scene[data-screen=landing] .exp-wrap { gap:clamp(8px,1vw,16px); }
.am-scene[data-screen=landing] .exp-cards { align-self:stretch; height:100%; max-height:none; overflow:hidden; display:grid; grid-template-rows:auto auto repeat(4,minmax(0,1fr)); gap:clamp(5px,.65vh,8px); }
#scene-root .am-scene[data-screen=landing] .exp-cards.panel { align-self:stretch; max-height:none; }
.am-scene[data-screen=landing] .exp-cards__title { font-size:clamp(28px,2vw,40px); line-height:1; margin-bottom:2px; }
.am-scene[data-screen=landing] .postcard { min-height:0; height:100%; padding-block:clamp(6px,.75vh,10px); font-size:clamp(16px,1.03vw,20px); line-height:1.3; overflow:hidden; }
.am-scene[data-screen=landing] .postcard .pc-extra { margin-top:3px; }
.am-scene > .guide-wrap { z-index:calc(var(--z-panel) + 2); }
.am-scene > .guide-wrap .guide-bubble { left:var(--scene-safe); bottom:calc(var(--guide-size) - 18px); width:min(300px,calc(100vw - (var(--scene-safe) * 2))); max-width:300px; border-color:#f2c14e; background:rgba(255,253,241,.97); }
.am-scene > .guide-wrap .guide-bubble::after { left:72px; right:auto; bottom:-13px; border:13px solid transparent; border-top-color:rgba(255,253,241,.97); border-bottom:0; filter:drop-shadow(0 2px 0 #f2c14e); }
.am-scene > .guide-wrap .guide-mascot { filter:drop-shadow(0 12px 18px rgba(5,30,50,.42)); }
.am-scene[data-screen=landing] .exp-wrap.is-dragging .exp-map-viewport,
.am-scene[data-screen=landing] .exp-wrap.has-pick .exp-map-viewport { border-color:#ffe276; box-shadow:0 0 0 7px rgba(255,226,118,.22),var(--shadow-pop); }
.am-scene[data-screen=landing] .exp-wrap.is-dragging .exp-drop-hint,
.am-scene[data-screen=landing] .exp-wrap.has-pick .exp-drop-hint { display:block; }

/* ---- 렌즈 ---- */
.lens-tabs { display:flex; gap:10px; justify-content:center; flex-shrink:0; }
.lens-tabs .btn { min-height:58px; padding:10px 22px; font:900 max(19px,var(--am-label)) var(--font-head); }
.lens-tabs .btn[aria-pressed=true] { background:var(--c-gold); }
.exp-map[data-lens=position] .exp-map__land i { filter:none; }
.exp-map[data-lens=nature] { background:linear-gradient(180deg,#2e86b8,#155f92); }
.exp-map[data-lens=nature] .exp-map__land i { background:linear-gradient(160deg,#c9d98a,#7c9a52); }
.exp-map[data-lens=life] { background:linear-gradient(180deg,#254b70,#122f4c); }
.exp-map[data-lens=life] .exp-map__land i { background:linear-gradient(160deg,#5d7d68,#3c5a49); }
.lens-point { position:absolute; transform:translate(-50%,-50%); min-width:84px; min-height:68px; border-radius:999px; border:3px solid #fff; background:#ffd75ed9; color:#5b430a; font:900 clamp(19px,1.5vw,25px)/1.2 var(--font-head); padding:10px 16px; box-shadow:0 0 0 0 rgba(255,215,94,.6); animation:lensPing 1.6s ease-out infinite; }
.lens-point.is-seen { background:#e0f6ed; border-color:var(--c-success); color:#116d5b; animation:none; }
@keyframes lensPing { 70%{box-shadow:0 0 0 18px rgba(255,215,94,0)} 100%{box-shadow:0 0 0 0 rgba(255,215,94,0)} }

/* ---- 나라 허브 핀 ---- */
.hub-pin { position:absolute; transform:translate(-50%,-50%); width:clamp(88px,8.4vw,120px); border:0; background:transparent; display:grid; justify-items:center; gap:4px; cursor:pointer; }
.hub-pin img { width:clamp(66px,6.2vw,94px); height:clamp(66px,6.2vw,94px); border-radius:50%; object-fit:cover; border:4px solid #fff; box-shadow:0 8px 20px #05203a77; background:#cfe8f4; }
.hub-pin span { background:#fff; color:#14559c; border-radius:999px; padding:4px 13px; font:900 max(16px,var(--am-label)) var(--font-head); box-shadow:var(--shadow-card); white-space:nowrap; }
.hub-pin.is-done img { border-color:var(--c-success); }
.hub-pin.is-done span::after { content:' ✓'; color:#149067; }
.hub-pin:focus-visible { outline:5px solid #ffe052; outline-offset:4px; border-radius:20px; }

/* ---- 나라 탐험 ---- */
.country-stage { flex:1; min-height:0; display:grid; grid-template-columns:minmax(0,1.65fr) minmax(390px,.75fr); gap:clamp(12px,1.1vw,18px); }
.country-scene { position:relative; min-height:0; border-radius:24px; overflow:hidden; border:3px solid rgba(255,255,255,.7); box-shadow:var(--shadow-card); background:#8fc4de; touch-action:none; }
.country-scene .scene-bg { position:absolute; inset:0; background-position:center; background-size:cover; transition:background .5s, background-position .5s; }
.country-guide { position:absolute; left:14px; top:14px; right:14px; z-index:4; background:#fffdf1ee; border-left:7px solid #f3bf45; border-radius:14px; padding:10px 15px; font-size:var(--am-label); font-weight:850; color:#173b53; }
.country-side { min-height:0; overflow:hidden; display:grid; grid-template-rows:auto repeat(4,minmax(0,1fr)); gap:clamp(8px,1vh,12px); }
.country-head { padding:clamp(12px,1.2vw,18px) clamp(16px,1.4vw,22px); background:rgba(255,253,247,.7) !important; backdrop-filter:blur(5px) !important; }
.country-head h2 { margin:0; color:var(--c-navy); font:900 clamp(32px,2.15vw,42px)/1.1 var(--font-head); word-break:keep-all; }
.stop-card { min-height:0; overflow:hidden; display:flex; flex-direction:column; justify-content:center; width:100%; padding:clamp(12px,1.15vw,20px); border:2px solid rgba(255,255,255,.58); border-left:7px solid rgba(205,216,222,.9); border-radius:18px; background:rgba(255,255,255,.55); backdrop-filter:blur(5px) saturate(1.04); box-shadow:0 8px 22px rgba(3,29,52,.12); color:#18384e; font:720 clamp(20px,1.18vw,25px)/1.42 var(--font-body); text-align:left; word-break:keep-all; }
.stop-card.is-seen { border-left-color:var(--c-success); background:rgba(239,251,247,.62); }
.stop-card strong { display:block; margin-bottom:4px; color:#155b4c; font:900 clamp(23px,1.38vw,29px)/1.16 var(--font-head); }
.stop-card.route-card { position:relative; cursor:pointer; touch-action:manipulation; transition:transform .18s ease,opacity .18s ease,box-shadow .18s ease; }
.stop-card.route-card strong { display:flex; align-items:center; gap:10px; margin-bottom:4px; }
.stop-card.route-card > * { pointer-events:none; }
.stop-card.route-card:hover { transform:translateX(-3px); }
.stop-card.route-card:active { transform:translateX(-1px) scale(.99); }
.stop-card.route-card:focus-visible { outline:5px solid #ffe052; outline-offset:2px; }
.stop-card.route-card.is-next { border-color:#f2a13c; border-left-color:#df741e; background:rgba(255,244,207,.9); box-shadow:0 0 0 5px rgba(255,210,80,.28),0 12px 26px rgba(3,29,52,.18); }
.stop-card.route-card.is-locked { opacity:.64; filter:saturate(.7); }
.stop-card-step { flex:0 0 auto; display:inline-grid; place-items:center; width:40px; height:40px; border-radius:50%; background:#aebdc6; color:#fff; font:900 23px/1 var(--font-head); box-shadow:inset 0 -3px 0 rgba(0,0,0,.12); }
.route-card.is-next .stop-card-step { background:#e27823; }
.route-card.is-seen .stop-card-step { background:var(--c-success); }
.route-card.is-seen .stop-card-step::after { content:'✓'; font-size:20px; }
.route-card.is-seen .stop-card-step { font-size:0; }
.country-route-line { position:absolute; inset:0; z-index:1; width:100%; height:100%; pointer-events:none; overflow:visible; transition:opacity .25s ease; }
.country-route-line polyline:first-child { fill:none; stroke:rgba(5,39,61,.44); stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
.country-route-line polyline:last-child { fill:none; stroke:#ffe16b; stroke-width:.72; stroke-dasharray:2.2 2.4; stroke-linecap:round; stroke-linejoin:round; }
.country-route-guide { position:absolute; left:50%; top:12px; transform:translateX(-50%); z-index:7; display:flex; align-items:center; gap:12px; width:max-content; max-width:calc(100% - 28px); min-height:64px; padding:8px 18px 8px 10px; border:3px solid #f2bf45; border-radius:999px; background:rgba(255,253,241,.94); backdrop-filter:blur(6px); box-shadow:0 9px 24px rgba(3,29,52,.22); color:#173b53; pointer-events:none; }
.country-route-guide__icon { flex:0 0 auto; display:grid; place-items:center; width:46px; height:46px; border-radius:50%; background:#e27823; color:#fff; font-size:25px; }
.country-route-guide__copy { display:grid; gap:1px; }
.country-route-guide__copy small { color:#8a560d; font-size:clamp(14px,.82vw,17px); font-weight:900; }
.country-route-guide__copy strong { font:900 clamp(18px,1.12vw,23px)/1.15 var(--font-head); white-space:nowrap; }
.country-route-guide__steps { display:flex; gap:5px; }
.country-route-guide__steps i { display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:#c5d0d6; color:#fff; font:900 16px/1 var(--font-head); font-style:normal; }
.country-route-guide__steps i.is-current { background:#e27823; box-shadow:0 0 0 4px rgba(242,161,60,.2); }
.country-route-guide__steps i.is-done { background:var(--c-success); }
.country-route-guide.is-complete { border-color:var(--c-success); }
.country-route-guide.is-complete .country-route-guide__icon { background:var(--c-success); }
.stop-node { position:absolute; transform:translate(-50%,-50%); display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:9px; min-width:clamp(150px,11vw,210px); min-height:clamp(72px,6.4vw,90px); max-width:230px; border-radius:26px; border:4px solid #fff; background:#173e5edc; backdrop-filter:blur(4px); color:#fff; font:900 clamp(18px,1.28vw,24px)/1.16 var(--font-head); padding:9px 14px 9px 9px; box-shadow:0 9px 22px #051e3270; z-index:3; word-break:keep-all; cursor:pointer; touch-action:manipulation; transition:opacity .22s ease,filter .18s ease,background .18s ease,transform .22s ease; overflow:visible; }
.stop-node > * { pointer-events:none; }
.stop-node .stop-step { display:grid; place-items:center; width:46px; height:46px; border-radius:50%; background:#aebdc6; color:#fff; font:900 25px/1 var(--font-head); box-shadow:inset 0 -3px 0 rgba(0,0,0,.14); }
.stop-node .stop-label { min-width:0; text-align:center; text-wrap:balance; }
.stop-node.is-seen { background:#147b63; }
.stop-node.is-seen .stop-step { background:#0f624e; }
.stop-node.is-seen .stop-step::after { content:'✓'; font-size:23px; }
.stop-node.is-seen .stop-step { font-size:0; }
.stop-node.is-locked { opacity:.62; filter:saturate(.55); }
.stop-node.is-next { z-index:6; animation:routeNext 1.45s ease-in-out infinite; background:#e27823; border-color:#fff8d7; }
.stop-node.is-next .stop-step { background:#fff; color:#b95d14; }
.stop-node.is-next::after { content:'👆 여기를 눌러!'; position:absolute; left:50%; top:calc(100% + 7px); transform:translateX(-50%); padding:5px 12px; border-radius:999px; background:#fff9dd; border:2px solid #e6ad32; color:#754500; font:900 clamp(15px,.9vw,18px)/1.1 var(--font-head); box-shadow:0 6px 14px rgba(3,29,52,.2); white-space:nowrap; }
.country-scene.route-complete .country-route-line { opacity:.12; }
.country-scene.route-complete .stop-node { opacity:0; transform:translate(-50%,-50%) scale(.9); pointer-events:none; }
.country-scene.route-complete .friend-meet { right:28px; bottom:24px; }
@keyframes routeNext { 50%{ box-shadow:0 0 0 10px rgba(255,220,94,.28),0 13px 28px rgba(3,29,52,.34); } }
.voyage-rail { position:absolute; left:10%; right:10%; bottom:14px; z-index:5; display:flex; align-items:center; gap:10px; padding:8px 14px; border-radius:999px; background:#fffdf2ee; box-shadow:var(--shadow-card); }
.voyage-rail span { font:900 clamp(18px,1vw,21px) var(--font-head); color:#17506e; white-space:nowrap; }
.voyage-rail input { flex:1; min-width:0; height:34px; accent-color:#e2842d; }
.voyage-rail::after { content:'끌어서 항해'; position:absolute; left:50%; top:-34px; transform:translateX(-50%); padding:4px 13px; border-radius:999px; background:var(--c-gold); color:#4c3600; font:900 clamp(17px,.95vw,20px) var(--font-head); white-space:nowrap; animation:railHint 1.6s ease-in-out infinite; }
.voyage-rail.is-used::after { display:none; }
/* 친구가 나타나면 항해는 끝났다 — 만나기 버튼과 겹치지 않게 레일을 걷는다 */
.country-scene:has(.friend-meet) .voyage-rail { display:none; }
@keyframes railHint { 50% { transform:translateX(-50%) translateY(-5px); } }
.alt-slider { position:absolute; right:18px; top:12%; bottom:12%; z-index:5; display:flex; flex-direction:column; align-items:center; gap:8px; }
.alt-slider input { writing-mode:vertical-lr; direction:rtl; height:100%; width:46px; }
.alt-slider span { background:rgba(255,255,255,.86); border-radius:999px; padding:4px 11px; font-weight:900; font-size:clamp(17px,.95vw,20px); box-shadow:var(--shadow-card); }
.friend-meet { position:absolute; right:16px; bottom:14px; z-index:6; border:0; background:transparent; display:grid; justify-items:center; gap:4px; cursor:pointer; animation:friendBob 2.2s ease-in-out infinite; }
/* 캐릭터 주변에 노란 안내 박스(tap-cue 아웃라인)를 씌우지 않는다 — 캐릭터 자체가 행동 유도다 */
.friend-meet.tap-cue, .hub-pin.tap-cue { outline:0 !important; animation:friendBob 2.2s ease-in-out infinite; }
.friend-meet img { width:clamp(110px,11vw,160px); filter:drop-shadow(0 8px 14px #05203a66); }
.friend-meet span { background:var(--c-gold); color:#4c3600; border-radius:999px; padding:6px 16px; font:900 max(17px,var(--am-label)) var(--font-head); box-shadow:var(--shadow-card); }
@keyframes friendBob { 50%{transform:translateY(-8px)} }

/* 문화 가방 */
.bag-stage { align-self:center; justify-content:center; width:min(1280px,100%); max-width:1280px; height:100%; padding:clamp(14px,1.25vw,24px); gap:clamp(12px,1.3vh,18px); overflow:hidden; border:2px solid rgba(255,255,255,.58); border-radius:28px; background:rgba(8,71,102,.2); backdrop-filter:blur(3px) saturate(1.08); box-shadow:0 18px 48px rgba(3,29,52,.22); }
.bag-head { flex:0 0 auto; text-align:center; padding:clamp(12px,1.3vh,18px) clamp(20px,2vw,34px); border-radius:22px; background:rgba(255,253,247,.78); border:2px solid rgba(255,255,255,.72); box-shadow:0 10px 28px rgba(3,29,52,.14); backdrop-filter:blur(6px); }
.bag-head h2 { margin:0; color:var(--c-navy); font:900 clamp(32px,2.3vw,44px)/1.1 var(--font-head); word-break:keep-all; }
.bag-head p { margin:8px 0 0; color:var(--c-ink-soft); font-size:clamp(20px,1.25vw,26px); font-weight:850; line-height:1.2; }
.bag-grid { flex:1; min-height:0; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(0,1fr)); gap:clamp(12px,1.1vw,18px); }
.bag-item { min-height:0; overflow:auto; border:3px solid rgba(203,215,223,.82); border-radius:22px; background:rgba(255,255,255,.7); backdrop-filter:blur(7px); padding:clamp(16px,1.45vw,26px); font:900 clamp(24px,1.55vw,31px)/1.25 var(--font-head); color:#173b53; display:grid; place-items:center; text-align:center; cursor:pointer; word-break:keep-all; text-wrap:balance; }
.bag-item.is-open { border-color:var(--c-success); font:750 clamp(21px,1.3vw,27px)/1.45 var(--font-body); place-items:center start; text-align:left; background:rgba(244,251,248,.82); }
.bag-item.is-open strong { display:block; margin-bottom:8px; color:#155b4c; font:900 clamp(23px,1.45vw,30px)/1.2 var(--font-head); }
.bag-item.is-env.is-open { background:rgba(253,246,228,.84); border-color:#e2b13c; }
.bag-item.is-keep { outline:5px solid var(--c-gold); }
.bag-pick-hint { flex:0 0 auto; margin:0; padding:11px 18px; border-radius:14px; background:rgba(255,243,207,.88); border:2px solid #e8bf4e; font-weight:900; color:#5b430a; font-size:clamp(20px,1.25vw,25px); text-align:center; }

@media (max-height:700px) {
  .bag-stage { padding:8px 10px; gap:8px; }
  .bag-head { padding:7px 16px; }
  .bag-head h2 { font-size:clamp(27px,2.3vw,34px); }
  .bag-head p { margin-top:3px; font-size:18px; }
  .bag-grid { gap:8px; }
  .bag-item { padding:10px 14px; font-size:clamp(20px,1.55vw,25px); }
  .bag-item.is-open { font-size:clamp(18px,1.3vw,22px); line-height:1.35; }
  .bag-item.is-open strong { margin-bottom:3px; font-size:clamp(20px,1.45vw,24px); }
}

/* ---- 하루 비교 ---- 시간대는 탭으로 하나씩. 가로 스크롤은 뒤쪽 시간대를 통째로 숨긴다. */
.day-board { flex:1; min-height:0; display:flex; }
.day-slot { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
.day-cards { flex:1; min-height:0; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }
.lens-tabs .btn.is-solved::after { content:' ✓'; color:#149067; }
.day-card { position:relative; border:3px solid rgba(255,255,255,.68); border-radius:22px; background:rgba(255,255,255,.4); backdrop-filter:blur(5px) saturate(1.05); padding:clamp(12px,1.3vw,20px); display:grid; gap:clamp(8px,1.2vh,14px); justify-items:center; align-content:center; text-align:center; cursor:pointer; box-shadow:0 10px 28px rgba(3,29,52,.12); }
.day-card strong { font:900 clamp(26px,1.85vw,34px)/1.1 var(--font-head); color:var(--c-navy); text-shadow:0 1px 3px rgba(255,255,255,.8); }
.day-card span { font-size:clamp(22px,1.42vw,27px); font-weight:800; line-height:1.4; color:#12293d; word-break:keep-all; text-wrap:balance; }
.day-card img { width:clamp(96px,10vw,150px); height:clamp(96px,10vw,150px); border-radius:50%; object-fit:cover; border:3px solid #fff; box-shadow:var(--shadow-card); background:rgba(255,255,255,.7); }
.day-card.is-selected { border-color:var(--c-gold); background:#fff6cf; }
.day-card.is-linked { border-color:var(--c-success); background:#f0fbf6; }
/* 과제 배너 — 지금 해야 할 미션이 화면에서 가장 먼저 읽히게 */
.am-task { display:flex; align-items:center; justify-content:center; gap:12px; margin:0 auto; max-width:min(1040px,94%); padding:12px 24px; border-radius:999px; background:linear-gradient(180deg,rgba(255,248,226,.88),rgba(255,237,189,.88)); backdrop-filter:blur(5px); border:3px solid #f3bf45; box-shadow:var(--shadow-card); color:#5b430a; font:900 clamp(23px,1.8vw,31px)/1.3 var(--font-head); text-align:center; word-break:keep-all; text-wrap:balance; }
.am-task::before { content:'미션'; flex-shrink:0; padding:5px 14px; border-radius:999px; background:#f3bf45; color:#4c3600; font-size:.68em; }
.day-common { min-height:64px; padding:13px 20px; border-radius:16px; background:rgba(224,246,237,.78); backdrop-filter:blur(4px); border:2px solid #18836a; color:#0d5a44; font-weight:900; font-size:clamp(21px,1.4vw,27px); text-align:center; word-break:keep-all; text-wrap:balance; display:none; }
.day-slot.is-solved .day-common { display:block; }

/* ---- 탐험 노트 ---- */
.note-layout { flex:1; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:var(--sp-3); }
.note-pool:empty { display:none; }
.note-pool { display:flex; gap:10px; flex-wrap:wrap; align-content:flex-start; padding:12px; max-height:34vh; overflow:auto; background:rgba(255,255,255,.52) !important; }
.note-zones { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--sp-3); min-height:0; }
.note-zone { min-height:0; overflow:auto; padding:clamp(12px,1.1vw,18px); border-radius:20px; border:3px dashed rgba(255,255,255,.82); background:rgba(255,255,255,.48); backdrop-filter:blur(5px) saturate(1.04); display:flex; flex-direction:column; gap:10px; box-shadow:0 10px 28px rgba(3,29,52,.12); }
.note-zone h3 { margin:0; font:900 clamp(25px,1.55vw,31px)/1.15 var(--font-head); color:var(--c-navy); }
.note-zone small { color:#28475e; font-size:clamp(18px,1.05vw,22px); font-weight:800; line-height:1.35; word-break:keep-all; }
.note-chip { flex:0 0 auto; min-height:58px; padding:10px 16px; border-radius:999px; border:3px solid rgba(203,215,223,.82); background:rgba(255,255,255,.72); font-weight:900; font-size:clamp(19px,1.12vw,23px); line-height:1.25; white-space:nowrap; cursor:pointer; }
.note-zone .note-chip { min-height:48px; padding:7px 13px; white-space:normal; }
.note-chip.is-selected { border-color:var(--c-gold); background:#fff6cf; }
.keyword-row { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
.keyword-row .btn { min-height:58px; font-size:clamp(19px,1.12vw,23px); }
.keyword-row .btn[aria-pressed=true] { background:var(--c-gold); }

/* ---- 지구 신호 ---- */
.signal-final { flex:1; min-height:0; display:grid; place-content:center; gap:clamp(14px,1.5vh,20px); justify-items:center; }
.signal-title { margin:0; color:#fff; font:900 clamp(34px,2.35vw,46px)/1.15 var(--font-head); text-align:center; text-shadow:0 3px 12px rgba(0,0,0,.58); word-break:keep-all; }
.signal-token { display:flex; align-items:center; gap:18px; width:min(920px,92vw); min-height:100px; padding:18px 24px; border-radius:22px; border:3px solid rgba(255,255,255,.66); background:rgba(255,255,255,.68); backdrop-filter:blur(5px); text-align:left; color:#173b53; font-size:clamp(21px,1.3vw,27px); line-height:1.42; cursor:pointer; box-shadow:0 10px 28px rgba(3,29,52,.14); }
.signal-token::before { content:''; width:64px; height:64px; flex-shrink:0; border-radius:50%; background:radial-gradient(circle at 35% 30%,#9fdcff,#2b7fc0); box-shadow:0 4px 10px #0a304d55; }
.signal-token[data-issue=forest]::before { background:radial-gradient(circle at 35% 30%,#bfe8a5,#3e8a4f); }
.signal-token[data-issue=life]::before { background:radial-gradient(circle at 35% 30%,#ffe29f,#d99027); }
.signal-token.is-lit { border-color:var(--c-gold); background:#fffbe8; box-shadow:0 0 0 4px rgba(242,193,78,.35); }
.signal-token strong { display:block; margin-bottom:3px; font:900 clamp(24px,1.48vw,30px)/1.15 var(--font-head); color:#173b53; }

@media (max-height:700px) {
  .country-side { gap:6px; }
  .country-head { padding:8px 14px; }
  .country-head h2 { font-size:clamp(28px,2.15vw,34px); }
  .stop-card { padding:8px 11px; font-size:clamp(17px,1.18vw,21px); line-height:1.3; }
  .stop-card strong { margin-bottom:2px; font-size:clamp(20px,1.38vw,24px); }
  .country-route-guide { min-height:52px; top:7px; padding:5px 14px 5px 7px; gap:8px; }
  .country-route-guide__icon { width:38px; height:38px; font-size:21px; }
  .country-route-guide__copy strong { font-size:17px; }
  .country-route-guide__steps i { width:24px; height:24px; font-size:14px; }
  .stop-node { min-width:138px; min-height:62px; max-width:190px; padding:7px 11px 7px 7px; font-size:clamp(16px,1.28vw,20px); }
  .stop-node .stop-step { width:38px; height:38px; font-size:21px; }
  .stop-node.is-next::after { top:calc(100% + 4px); padding:3px 9px; font-size:14px; }
  .day-card span { font-size:clamp(18px,1.42vw,22px); }
  .note-zone small { font-size:17px; }
  .signal-token { min-height:76px; padding:10px 16px; font-size:clamp(18px,1.3vw,22px); }
  .signal-token::before { width:50px; height:50px; }
}

/* 1024x576(교실 최소 기준)에서도 지도와 대화창이 나란히 있어야 한다 —
   한 줄로 쌓으면 지도가 납작해지고 카드가 지도를 덮는다. */
@media (max-width:1050px) {
  .exp-wrap { grid-template-columns:minmax(0,1.2fr) minmax(258px,.8fr); gap:var(--sp-2); }
  .postcard { padding:8px 56px 8px 54px; min-height:66px; font-size:max(15px,var(--fs-small)); }
  .postcard img { left:8px; width:38px; height:38px; }
  .day-cards { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .note-zones { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media (max-width:900px) {
  .exp-wrap, .country-stage { grid-template-columns:1fr; }
  .country-scene { min-height:420px; }
  .country-side { display:flex; overflow:auto; }
  .note-zones { grid-template-columns:1fr; }
}
@media (prefers-reduced-motion:reduce) {
  .lens-point, .stop-node.is-next, .friend-meet, .postcard.is-wrong, .voyage-rail::after, .exp-slot { animation:none !important; }
}
:root[data-reduced-motion="true"] .lens-point,
:root[data-reduced-motion="true"] .friend-meet { animation:none !important; }
`;

/* 학생 id → 기존 아바타 에셋 (americas.student1~4, students 배열 순서 기준) */
function avatarAsset(content: AmericasContent, studentId: string): string {
  const idx = content.students.findIndex((s) => s.id === studentId);
  return `americas.student${Math.max(0, idx) + 1}`;
}

function el(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

const AMERICAS_SCENE_ASSET_IDS = [
  'americas.scene.canada.west',
  'americas.scene.canada.plains',
  'americas.scene.canada.east',
  'americas.scene.canada.landmark',
  'americas.scene.mexico.coast',
  'americas.scene.mexico.highland',
  'americas.scene.mexico.mountain',
  'americas.scene.mexico.landmark',
  'americas.scene.brazil.upriver',
  'americas.scene.brazil.riverside',
  'americas.scene.brazil.city',
  'americas.scene.brazil.landmark',
  'americas.scene.peru.coast',
  'americas.scene.peru.andes',
  'americas.scene.peru.amazon',
  'americas.scene.peru.landmark'
] as const;

/* 이미지 로딩 실패 시에도 탐험 흐름을 유지하는 색상 배경 */
const SCENE_BG: Record<string, string[]> = {
  canada: ['linear-gradient(180deg,#9fd3e8 55%,#2e7fae 55%)', 'linear-gradient(180deg,#ffe9b8 60%,#c8a35d 60%)', 'linear-gradient(180deg,#bcd9ec 58%,#6b93b8 58%)', 'linear-gradient(180deg,#8ed0ed 55%,#2f86b5 55%)'],
  mexico: ['linear-gradient(180deg,#ffe1a8 55%,#3aa0c9 55%)', 'linear-gradient(180deg,#ffd98f 62%,#b8875a 62%)', 'linear-gradient(180deg,#d8e8c9 55%,#7a9a5c 55%)', 'linear-gradient(180deg,#bde6ed 55%,#b98a55 55%)'],
  brazil: ['linear-gradient(180deg,#bfe8b2 50%,#2e8a5f 50%)', 'linear-gradient(180deg,#cfe8d8 55%,#4f8a9a 55%)', 'linear-gradient(180deg,#cfe3f2 52%,#2f6b99 52%)', 'linear-gradient(180deg,#9ed8ee 48%,#327d66 48%)'],
  peru: ['linear-gradient(180deg,#ffe9c9 58%,#c9b08a 58%)', 'linear-gradient(180deg,#e8e2d2 45%,#8a7a5f 45%)', 'linear-gradient(180deg,#d9ecc9 50%,#5f8a4f 50%)', 'linear-gradient(180deg,#c6e3ee 42%,#789458 42%)']
};

export function createPage(): Page {
  let disposed = false;
  let guide: GuideController | null = null;
  let dnd: PickPlaceController | null = null;
  const mapFits = new Set<() => void>();
  const clearMapFits = (): void => { mapFits.forEach((stop) => stop()); mapFits.clear(); };
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms);
    timers.add(id);
    return id;
  };

  return {
    async mount(root: HTMLElement) {
      const content = await loadContent<AmericasContent>('americas');
      assertContent(content);
      const E = content.explore;
      const playerSpeaker = selectedAvatarSpeaker(saveRepo.get().profile);
      await preloadImages([
        'bg.americas',
        'americas.map',
        playerSpeaker.assetId,
        ...content.students.map((_, i) => `americas.student${i + 1}`),
        ...AMERICAS_SCENE_ASSET_IDS
      ]);
      audio.playBgm('americas');

      const mission = saveRepo.get().missions.americas;
      const countryIds = E.countries.map((c) => c.id);
      let S = restoreState(mission.data, countryIds);
      // 구버전(어울림 학급) 저장은 새 탐험 흐름과 호환되지 않아 처음부터 시작한다(완료 도장은 그대로 유지됨).
      if (mission.data.exploreProgress && S.screen !== 'landing') showToast('저장한 탐험 지점에서 이어갈게.', 'info');
      let finished = false;
      let shakeupDone = false; // 흔들리는 계획 카드(P2-14) — 회당 1회만

      const page = document.createElement('div');
      page.className = 'page am-scene';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,.3),rgba(20,45,80,.45)), url('${assetUrl('bg.americas')}')`;
      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);

      const topBar = buildTopBar({
        title: content.intro.title,
        subtitle: content.intro.subtitle,
        backTo: '#/map',
        steps: { total: SCREENS.length, done: 0, now: 0 }
      });
      page.appendChild(topBar);

      const body = document.createElement('div');
      body.className = 'page-body';
      const stage = document.createElement('div');
      stage.className = 'am-stage';
      body.appendChild(stage);
      page.appendChild(body);
      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      page.appendChild(bottom);
      root.appendChild(page);

      const plane = airplaneChoice(saveRepo.get().profile?.airplaneId);
      guide = createGuide({ assetId: plane.assetId, speakerName: plane.name });
      page.insertBefore(guide.el, bottom);

      const announceGuide = (text: string, cue: HTMLElement | null = null): void => {
        guide?.say(text, { cue, autoStart: true, persist: true });
      };

      const setBottom = (hint: string, ...actions: HTMLElement[]): void => {
        bottom.replaceChildren();
        if (hint) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = hint;
          bottom.appendChild(chip);
        }
        const right = document.createElement('div');
        right.className = 'am-actions';
        for (const a of actions) right.appendChild(a);
        bottom.appendChild(right);
      };

      const persist = (): void => {
        saveRepo.setCheckpoint('americas', S.screen, {
          exploreProgress: structuredClone(S),
          learn: saveRepo.get().missions.americas.data.learn
        });
      };
      const go = (screen: Screen): void => {
        S.screen = screen;
        persist();
        render();
      };
      const nextButton = (label: string, screen: Screen): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-primary';
        b.textContent = label;
        b.addEventListener('click', () => go(screen));
        return b;
      };

      /* ---- 대륙 지도 뼈대 (착륙·렌즈·허브 공용) ----
         지도 이미지는 16:9다. 상자를 같은 비율로 맞춰야 %로 찍은 나라·렌즈 좌표가
         그림 위 실제 위치와 일치한다(contain 레터박스가 생기면 전부 어긋난다). */
      const fitMap = (map: HTMLElement): HTMLElement => {
        clearMapFits();
        const viewport = document.createElement('div');
        viewport.className = 'exp-map-viewport';
        viewport.appendChild(map);
        viewport.insertAdjacentHTML('beforeend', '<span class="exp-drop-hint">지도 속 점선 원에 놓아 줘!</span>');
        viewport.insertAdjacentHTML('beforeend', '<span class="map-zoom-hint">두 손가락으로 크게 볼 수 있어</span>');
        const holder = document.createElement('div');
        holder.className = 'exp-map-fit';
        holder.appendChild(viewport);
        mapFits.add(fitAspect(viewport));
        mapFits.add(enableMapZoom(viewport, map));
        return holder;
      };

      const buildMap = (): HTMLElement => {
        const map = el(`<div class="exp-map" data-lens="position" aria-label="아메리카 대륙 지도">
          <div class="exp-map__land" aria-hidden="true"><i class="north"></i><i class="central"></i><i class="south"></i></div>
          <span class="exp-map__ocean" style="left:4%;top:38%">태평양</span>
          <span class="exp-map__ocean" style="right:4%;top:34%">대서양</span>
          <div class="exp-map__equator"><span>적도</span></div>
        </div>`);
        if (hasAsset('americas.map')) {
          map.style.background = `#1c72ad url('${assetUrl('americas.map')}') center/contain no-repeat`;
          map.querySelector('.exp-map__land')?.remove();
        }
        return map;
      };

      /* ===== 화면 1 — 착륙: 대화창을 지도에 놓기 ===== */
      const renderLanding = (): void => {
        const wrap = el('<div class="exp-wrap"></div>');
        const map = buildMap();
        const side = el('<div class="exp-cards panel"></div>');
        side.appendChild(el('<h2 class="exp-cards__title">친구들의 대화창</h2>'));
        side.appendChild(el('<p class="exp-dnd-guide" id="americas-dnd-guide"><b>1</b><span>대화창 잡기</span><i>→</i><b>2</b><span>지도에 놓기</span></p>'));

        const zones: HTMLElement[] = [];
        const items: HTMLElement[] = [];
        const fillSlot = (slot: HTMLElement, countryId: string): void => {
          const c = E.countries.find((x) => x.id === countryId);
          const pc = E.postcards.find((x) => x.countryId === countryId);
          slot.classList.add('is-filled');
          slot.innerHTML = `<img src="${assetUrl(avatarAsset(content, pc?.studentId ?? ''))}" alt=""><span class="slot-name">${c?.name ?? ''}</span>`;
        };

        E.countries.forEach((c, index) => {
          const slot = el(`<div class="exp-slot drop-zone" data-zone-id="${c.id}" role="button" aria-label="지도 놓기 영역 ${index + 1}" style="left:${c.position.x}%;top:${c.position.y}%">여기?</div>`);
          if (S.placed.includes(c.id)) fillSlot(slot, c.id);
          zones.push(slot);
          map.appendChild(slot);
        });
        E.postcards.forEach((pc) => {
          const student = content.students.find((s) => s.id === pc.studentId);
          const card = el(`<button type="button" class="postcard" data-item-id="${pc.countryId}">
            <img src="${assetUrl(avatarAsset(content, pc.studentId))}" alt="">
            <strong>${student?.name ?? ''}</strong> · ${pc.hint}
            <span class="pc-extra" hidden>힌트: ${pc.extraHint}</span>
            <span class="postcard-grip" aria-hidden="true">⠿</span>
          </button>`);
          card.setAttribute('aria-describedby', 'americas-dnd-guide');
          if (S.placed.includes(pc.countryId)) card.classList.add('is-done');
          items.push(card);
          side.appendChild(card);
        });

        const next = nextButton('탐험 렌즈 꺼내기', 'lens');
        const refresh = (): void => {
          const all = E.countries.every((c) => S.placed.includes(c.id));
          next.disabled = !all;
          setBottom(all ? '' : `놓은 대화창 ${S.placed.length}/${E.countries.length}`, next);
          if (all) guide?.say('네 친구의 나라를 모두 찾았어!', {
            cue: next,
            autoStart: true,
            persist: true
          });
        };

        dnd = enablePickPlace({
          items, zones,
          onSelectionChange: (itemId) => {
            wrap.classList.toggle('has-pick', itemId !== null);
            if (itemId) {
              guide?.say('좋아! 이제 지도 속 점선 원을 눌러서 대화창을 놓아 봐.', {
                autoStart: true,
                persist: true
              });
            }
          },
          onDragStateChange: (active) => wrap.classList.toggle('is-dragging', active),
          onDropMiss: () => guide?.say('지도 안의 반짝이는 점선 원까지 옮겨서 놓아 줘!', {
            autoStart: true,
            persist: true
          }),
          onPlace: (itemId, zoneId) => {
            const card = items.find((i) => i.dataset.itemId === itemId);
            if (!card || S.placed.includes(itemId)) return;
            if (itemId === zoneId) {
              S.placed.push(itemId);
              persist();
              card.classList.add('is-done');
              const slot = zones.find((z) => z.dataset.zoneId === zoneId);
              if (slot) { fillSlot(slot, zoneId); burstConfetti(slot, 6); }
              void audio.playSfx('success');
              refresh();
            } else {
              void audio.playSfx('partial');
              card.classList.add('is-wrong', 'is-locked');
              card.querySelector<HTMLElement>('.pc-extra')?.removeAttribute('hidden');
              later(() => card.classList.remove('is-wrong', 'is-locked'), 1200);
              announceGuide('조금 다른 곳이야. 대화창의 힌트를 다시 읽어 볼까?');
            }
          }
        });

        wrap.append(fitMap(map), side);
        stage.replaceChildren(wrap);
        refresh();
        showKeyPoint({
          id: 'americas.geo',
          imageId: 'americas.student1',
          lines: [
            '아메리카는 북아메리카와 남아메리카, 두 대륙이 길게 이어져 있어.',
            '적도는 남아메리카 북쪽을 지나가서, 그 근처는 일 년 내내 더워.'
          ],
          onDone: () => guide?.say('대화창을 읽고 지도 속 맞는 나라에 끌어 놓아 봐!', {
            cue: items.find((item) => !item.classList.contains('is-done')) ?? null,
            autoStart: true,
            persist: true
          })
        });
      };

      /* ===== 화면 2 — 탐험 렌즈 ===== */
      const renderLens = (): void => {
        const wrap = el('<div class="am-stage" style="gap:12px"></div>');
        const tabs = el('<div class="lens-tabs"></div>');
        const map = buildMap();
        let active = E.lenses.find((l) => l.id === S.lensVisited.at(-1)) ?? E.lenses[0]!;

        const next = nextButton('나라 속으로 들어가기', 'countries');
        const allPoints = E.lenses.flatMap((l) => l.points.map((p) => `${l.id}:${p.id}`));
        const refresh = (): void => {
          const ok = allPoints.every((id) => S.pointsSeen.includes(id));
          next.disabled = !ok;
          setBottom(ok ? '세 렌즈로 대륙을 모두 살펴봤어!' : '렌즈를 바꿔 가며 반짝이는 곳을 모두 눌러 봐', next);
        };

        const draw = (): void => {
          map.dataset.lens = active.id;
          map.querySelectorAll('.lens-point').forEach((p) => p.remove());
          if (!S.lensVisited.includes(active.id)) { S.lensVisited.push(active.id); persist(); }
          tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.id === active.id)));
          active.points.forEach((p) => {
            const key = `${active.id}:${p.id}`;
            const dot = el(`<button type="button" class="lens-point ${S.pointsSeen.includes(key) ? 'is-seen' : ''}" style="left:${p.x}%;top:${p.y}%">${p.label}</button>`);
            dot.addEventListener('click', () => {
              if (!S.pointsSeen.includes(key)) { S.pointsSeen.push(key); persist(); }
              dot.classList.add('is-seen');
              announceGuide(`${p.label} — ${p.note}`, dot);
              popBounce(dot);
              void audio.playSfx('tap');
              refresh();
            });
            map.appendChild(dot);
          });
        };

        E.lenses.forEach((l) => {
          const b = el(`<button type="button" class="btn" data-id="${l.id}">${l.label}</button>`);
          b.addEventListener('click', () => { active = l; void audio.playSfx('whoosh'); draw(); });
          tabs.appendChild(b);
        });

        wrap.append(tabs, fitMap(map));
        stage.replaceChildren(wrap);
        draw();
        refresh();
        announceGuide('렌즈를 바꾸면 같은 대륙이 다르게 보여! 위치·자연·생활 렌즈로 반짝이는 곳을 살펴봐.');
      };

      /* ===== 화면 3 — 나라 허브 + 마이크로 탐험 ===== */
      const renderCountries = (): void => {
        const map = buildMap();
        E.countries.forEach((c) => {
          const p = S.countries[c.id] ?? emptyCountry();
          const pin = el(`<button type="button" class="hub-pin ${p.done ? 'is-done' : ''}" style="left:${c.position.x}%;top:${c.position.y}%" aria-label="${c.name} 탐험${p.done ? ', 완료' : ''}">
            <img src="${assetUrl(avatarAsset(content, c.studentId))}" alt=""><span>${c.name}</span>
          </button>`);
          pin.addEventListener('click', () => renderCountry(c));
          map.appendChild(pin);
        });
        const next = nextButton('친구들의 하루 비교하기', 'day');
        const allDone = E.countries.every((c) => S.countries[c.id]?.done);
        next.disabled = !allDone;
        stage.replaceChildren(fitMap(map));
        setBottom(allDone ? '네 나라를 모두 탐험했어!' : '나라를 눌러 그 속으로 들어가 보자', next);
        announceGuide(allDone
          ? '네 친구를 모두 만났어! 이제 친구들의 하루를 나란히 놓고 비교해 볼까?'
          : '이제 나라 속으로 들어가 보자. 나라마다 탐험하는 방법이 달라!');
      };

      const renderCountry = (c: CountryDef): void => {
        const P = S.countries[c.id] ?? (S.countries[c.id] = emptyCountry());
        const student = content.students.find((s) => s.id === c.studentId);
        const isOrderedRoute = c.mode === 'trail' || c.mode === 'river';
        const layout = el('<div class="country-stage"></div>');
        const scene = el('<div class="country-scene"></div>');
        const bg = el('<div class="scene-bg"></div>');
        scene.appendChild(bg);
        const side = el('<div class="country-side"></div>');
        side.appendChild(el(`<div class="panel country-head"><h2>${c.name}</h2></div>`));
        const stopCards = c.stops.map((stop, index) => {
          const tag = isOrderedRoute ? 'button type="button"' : 'div';
          const card = el(`<${tag} class="stop-card ${isOrderedRoute ? 'route-card' : ''} ${P.stopsSeen.includes(stop.id) ? 'is-seen' : ''}" data-step="${index + 1}">
            <strong>${isOrderedRoute ? `<b class="stop-card-step">${index + 1}</b>` : ''}${stop.label}</strong>
            <span class="stop-card-copy" hidden>${stop.note}</span>
          </${isOrderedRoute ? 'button' : 'div'}>`);
          if (P.stopsSeen.includes(stop.id)) card.querySelector('.stop-card-copy')?.removeAttribute('hidden');
          side.appendChild(card);
          return card;
        });

        const bgFor = (idx: number): void => {
          const g = SCENE_BG[c.id]?.[idx];
          if (g) bg.style.background = g;
          const stopAssetId = `americas.scene.${c.id}.${c.stops[idx]?.id ?? ''}`;
          if (hasAsset(stopAssetId)) {
            bg.style.background = `url('${assetUrl(stopAssetId)}') center/cover no-repeat`;
          } else if (hasAsset(`americas.scene.${c.id}`)) {
            bg.style.background = `url('${assetUrl(`americas.scene.${c.id}`)}') no-repeat`;
            bg.style.backgroundSize = '300% 100%';
            bg.style.backgroundPosition = `${idx * 50}% center`;
          }
        };
        bgFor(Math.max(0, Math.min(c.stops.length - 1, P.stopsSeen.length - 1)));

        // seeStop이 나라별 상호작용 설정 중에 바로 호출되므로, refresh가 쓰는 것들을 먼저 만든다.
        const back = el('<button type="button" class="btn">대륙 지도로</button>') as HTMLButtonElement;
        back.addEventListener('click', () => { if (P.met && P.keep) P.done = true; persist(); renderCountries(); });

        const seeStop = (index: number): void => {
          const stop = c.stops[index];
          if (!stop) return;
          bgFor(index);
          if (!P.stopsSeen.includes(stop.id)) { P.stopsSeen.push(stop.id); persist(); }
          const card = stopCards[index];
          card?.classList.add('is-seen');
          card?.querySelector('.stop-card-copy')?.removeAttribute('hidden');
          void audio.playSfx('tap');
          refresh();
        };

        /* 나라별 상호작용 */
        if (c.mode === 'voyage') {
          // 캐나다 — 가로로 끌어 서→동 항해. 지나친 지점은 모두 들른 것으로 친다(건너뛰기 방지).
          const lastSeenIndex = Math.max(0, ...P.stopsSeen.map((id) => c.stops.findIndex((stop) => stop.id === id)));
          let progress = c.stops.length > 1 ? (lastSeenIndex / (c.stops.length - 1)) * 100 : 0;
          const rail = el(`<div class="voyage-rail"><span>서쪽 바다</span><input type="range" min="0" max="100" step="1" value="${Math.round(progress)}" aria-label="서쪽에서 동쪽으로 항해하기"><span>동쪽 바다</span></div>`);
          const railInput = rail.querySelector('input')!;
          const sail = (next: number): void => {
            progress = Math.max(0, Math.min(100, next));
            railInput.value = String(Math.round(progress));
            const idx = Math.min(c.stops.length - 1, Math.round((progress / 100) * (c.stops.length - 1)));
            // 배가 지나온 지점은 전부 들른 것으로 — 끌다가 중간을 건너뛰어 막히지 않게 한다
            for (let i = 0; i <= idx; i += 1) {
              const stop = c.stops[i];
              if (!stop || P.stopsSeen.includes(stop.id)) continue;
              P.stopsSeen.push(stop.id);
              stopCards[i]?.classList.add('is-seen');
              stopCards[i]?.querySelector('.stop-card-copy')?.removeAttribute('hidden');
            }
            bgFor(idx);
            persist();
            refresh();
          };
          let dragX: number | null = null;
          scene.addEventListener('pointerdown', (ev) => {
            // 친구 만나기·레일 등 조작 요소 위에서는 드래그를 시작하지 않는다 (포인터 캡처가 클릭을 삼킨다)
            if ((ev.target as HTMLElement).closest('button, input')) return;
            dragX = ev.clientX;
            scene.setPointerCapture(ev.pointerId);
            rail.classList.add('is-used');
          });
          scene.addEventListener('pointermove', (ev) => {
            if (dragX === null) return;
            const delta = ev.clientX - dragX;
            dragX = ev.clientX;
            sail(progress + delta / 6);
          });
          scene.addEventListener('pointerup', () => { dragX = null; });
          railInput.addEventListener('input', () => { rail.classList.add('is-used'); sail(Number(railInput.value)); });
          scene.appendChild(rail);
          if (!P.stopsSeen.length) seeStop(0);
        } else if (c.mode === 'trail' || c.mode === 'river') {
          // 멕시코 — 길 지점 / 브라질 — 강 따라 차례로
          const positions = c.mode === 'trail'
            ? [{ x: 18, y: 76 }, { x: 39, y: 57 }, { x: 61, y: 39 }, { x: 82, y: 25 }]
            : [{ x: 18, y: 23 }, { x: 39, y: 42 }, { x: 61, y: 61 }, { x: 82, y: 77 }];
          const routeLine = el(`<svg class="country-route-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="${positions.map((p) => `${p.x},${p.y}`).join(' ')}"></polyline>
            <polyline points="${positions.map((p) => `${p.x},${p.y}`).join(' ')}"></polyline>
          </svg>`);
          const routeGuide = el(`<div class="country-route-guide" role="status" aria-live="polite">
            <span class="country-route-guide__icon">${c.mode === 'river' ? '🚤' : '👣'}</span>
            <span class="country-route-guide__copy"><small>탐험 순서</small><strong></strong></span>
            <span class="country-route-guide__steps">${c.stops.map((_, i) => `<i>${i + 1}</i>`).join('')}</span>
          </div>`);
          scene.append(routeLine, routeGuide);
          const nodes = c.stops.map((stop, i) => {
            const pos = positions[i] ?? { x: 50, y: 50 };
            const node = el(`<button type="button" class="stop-node ${P.stopsSeen.includes(stop.id) ? 'is-seen' : ''}" style="left:${pos.x}%;top:${pos.y}%" data-step="${i + 1}">
              <span class="stop-step">${i + 1}</span><span class="stop-label">${stop.label}</span>
            </button>`);
            scene.appendChild(node);
            return node;
          });
          const activateStop = (index: number): void => {
            const nextIndex = c.stops.findIndex((stop) => !P.stopsSeen.includes(stop.id));
            if (nextIndex >= 0 && index > nextIndex) {
              const nextNode = nodes[nextIndex];
              void audio.playSfx('partial');
              if (nextNode) popBounce(nextNode);
              announceGuide(`지금은 ${nextIndex + 1}번이야! 주황색 ${nextIndex + 1}번 ${c.stops[nextIndex]?.label ?? '지점'}을 먼저 눌러 봐.`, nextNode ?? null);
              return;
            }
            nodes[index]?.classList.add('is-seen');
            seeStop(index);
            markNext();
          };
          const markNext = (): void => {
            const idx = c.stops.findIndex((stop) => !P.stopsSeen.includes(stop.id));
            nodes.forEach((node, i) => {
              const seen = P.stopsSeen.includes(c.stops[i]?.id ?? '');
              const current = i === idx;
              node.classList.toggle('is-seen', seen);
              node.classList.toggle('is-next', current);
              node.classList.toggle('is-locked', !seen && !current);
              node.setAttribute('aria-label', `${i + 1}번 ${c.stops[i]?.label ?? ''}${seen ? ', 탐험 완료' : current ? ', 지금 누를 곳' : ', 아직 잠김'}`);
              const card = stopCards[i];
              card?.classList.toggle('is-seen', seen);
              card?.classList.toggle('is-next', current);
              card?.classList.toggle('is-locked', !seen && !current);
              card?.setAttribute('aria-label', `${i + 1}번 ${c.stops[i]?.label ?? ''}${seen ? ', 다시 보기' : current ? ', 지금 누르기' : ', 앞 지점부터 탐험하기'}`);
            });
            const guideText = routeGuide.querySelector('.country-route-guide__copy strong');
            if (guideText) guideText.textContent = idx >= 0
              ? `주황색 ${idx + 1}번을 눌러 봐!`
              : '모두 탐험했어! 친구를 만나자';
            routeGuide.classList.toggle('is-complete', idx < 0);
            scene.classList.toggle('route-complete', idx < 0);
            routeGuide.querySelectorAll('.country-route-guide__steps i').forEach((step, i) => {
              step.classList.toggle('is-done', idx < 0 || i < idx);
              step.classList.toggle('is-current', i === idx);
              step.textContent = idx < 0 || i < idx ? '✓' : String(i + 1);
            });
          };
          nodes.forEach((node, i) => node.addEventListener('click', () => activateStop(i)));
          stopCards.forEach((card, i) => card.addEventListener('click', () => activateStop(i)));
          markNext();
        } else {
          // 페루 — 해안에서 마추픽추까지 장면 슬라이더
          const slider = el(`<div class="alt-slider"><span>마추픽추</span><input type="range" min="0" max="${Math.max(0, c.stops.length - 1)}" step="1" value="0" aria-label="페루 장면 고르기"><span>해안</span></div>`);
          const input = slider.querySelector('input')!;
          input.value = String(Math.max(0, ...P.stopsSeen.map((id) => c.stops.findIndex((stop) => stop.id === id))));
          input.addEventListener('input', () => seeStop(Number(input.value)));
          enableRangeDrag(input);
          scene.appendChild(slider);
          if (!P.stopsSeen.length) seeStop(0);
        }

        /* 친구 만남 → 대화 → 문화 가방 */
        function showFriend(): void {
          if (scene.querySelector('.friend-meet')) return;
          const meet = el(`<button type="button" class="friend-meet">
            <img src="${assetUrl(avatarAsset(content, c.studentId))}" alt="${student?.name ?? ''}">
            <span>${student?.name ?? '친구'} 만나기</span>
          </button>`);
          meet.addEventListener('click', () => {
            const startDialogue = (): void => {
              openCharacterDialogue({
                id: `am-${c.id}`,
                reactions: true,
                name: student?.name ?? '친구',
                meta: `${c.name}에서 만난 친구`,
                assetId: avatarAsset(content, c.studentId),
                partner: {
                  name: playerSpeaker.name,
                  meta: '나의 탐험가',
                  assetId: playerSpeaker.assetId,
                  imageAlt: `${playerSpeaker.name} 탐험가`
                },
                lines: (student?.dialogue ?? []).slice(0, 6).map((l) => ({
                  label: l.label,
                  text: l.text,
                  role: l.role === 'student' ? 'character' as const : 'partner' as const
                })),
                onComplete: () => { P.met = true; persist(); renderBag(c); }
              });
            };
            const learn = getLearn(content);
            const anyMet = Object.values(S.countries).some((x) => x.met);
            if (!anyMet && learn) showFriendIntro('americas', learn, startDialogue);
            else startDialogue();
          });
          scene.appendChild(meet);
          announceGuide(`저기 ${student?.name ?? '친구'}가 기다리고 있어! 만나러 가 보자.`);
        }

        function refresh(): void {
          const allStops = c.stops.every((stop) => P.stopsSeen.includes(stop.id));
          const nextStopIndex = c.stops.findIndex((stop) => !P.stopsSeen.includes(stop.id));
          setBottom(
            P.done ? `${c.name} 탐험 완료!`
              : allStops ? '친구를 만나러 가 보자!'
              : isOrderedRoute && nextStopIndex >= 0
                ? `다음은 ${nextStopIndex + 1}번 · ${c.stops[nextStopIndex]?.label ?? '지점'}`
                : `탐험한 곳 ${P.stopsSeen.length} / ${c.stops.length}`,
            back
          );
          if (allStops && !P.met) showFriend();
        }
        if (P.met && !P.done) later(() => renderBag(c), 100);

        layout.append(scene, side);
        stage.replaceChildren(layout);
        const nextStopIndex = c.stops.findIndex((stop) => !P.stopsSeen.includes(stop.id));
        announceGuide(isOrderedRoute && nextStopIndex >= 0
          ? `${c.mode === 'river' ? '카누를 타고 강을 내려가자!' : '발자국을 따라 고원으로 올라가자!'} 주황색 ${nextStopIndex + 1}번부터 차례로 눌러 봐.`
          : c.modeGuide);
        refresh();
      };

      const renderBag = (c: CountryDef): void => {
        const P = S.countries[c.id] ?? (S.countries[c.id] = emptyCountry());
        const student = content.students.find((s) => s.id === c.studentId);
        const wrap = el('<div class="am-stage bag-stage"></div>');
        wrap.appendChild(el(`<div class="bag-head"><h2>${student?.name ?? '친구'}의 문화 가방</h2><p>눌러서 하나씩 꺼내 봐!</p></div>`));
        const grid = el('<div class="bag-grid"></div>');
        const pickHint = el('<p class="bag-pick-hint" hidden>다 꺼내 봤어! 지구회의에 가져가고 싶은 이야기 하나를 골라 봐.</p>');

        const done = el('<button type="button" class="btn btn-primary">가방 닫고 탐험 계속하기</button>') as HTMLButtonElement;
        done.addEventListener('click', () => {
          P.done = true;
          persist();
          void audio.playSfx('stamp');
          renderCountries();
        });

        const refresh = (): void => {
          const allSeen = c.bag.every((b) => P.bagSeen.includes(b.id));
          pickHint.hidden = !allSeen || Boolean(P.keep);
          done.disabled = !(allSeen && P.keep);
          setBottom(P.keep ? '이야기를 하나 골랐어!' : allSeen ? '가져갈 이야기 하나를 골라 봐' : '가방 속 이야기를 모두 꺼내 봐', done);
        };

        c.bag.forEach((item) => {
          const card = el(`<button type="button" class="bag-item ${item.kind === 'env' ? 'is-env' : ''}">${item.label}</button>`);
          const open = (): void => {
            card.classList.add('is-open');
            card.innerHTML = `<span><strong>${item.label}</strong>${item.line}</span>`;
          };
          if (P.bagSeen.includes(item.id)) open();
          if (P.keep === item.id) card.classList.add('is-keep');
          card.addEventListener('click', () => {
            if (!P.bagSeen.includes(item.id)) {
              P.bagSeen.push(item.id);
              persist();
              open();
              popBounce(card);
              void audio.playSfx(item.kind === 'env' ? 'beat_low' : 'pickup');
              refresh();
              return;
            }
            // 모두 본 뒤에는 탭 = 가져갈 이야기 선택
            if (c.bag.every((b) => P.bagSeen.includes(b.id))) {
              P.keep = item.id;
              persist();
              grid.querySelectorAll('.bag-item').forEach((b) => b.classList.remove('is-keep'));
              card.classList.add('is-keep');
              void audio.playSfx('success');
              refresh();
            }
          });
          grid.appendChild(card);
        });

        wrap.append(grid, pickHint);
        stage.replaceChildren(wrap);
        refresh();
        announceGuide(`${student?.name ?? '친구'}의 가방을 열고 이야기를 하나씩 살펴봐!`);
      };

      /* ===== 화면 4 — 같은 대륙, 서로 다른 하루 ===== */
      const renderDay = (): void => {
        const wrap = el('<div class="am-stage" style="gap:12px"></div>');
        const tabs = el('<div class="lens-tabs"></div>');
        const task = el('<p class="am-task" role="status"></p>');
        const board = el('<div class="day-board"></div>');
        const next = nextButton('탐험 노트 펼치기', 'note');
        let active = E.day.slots.find((slot) => !S.daySolved.includes(slot.id)) ?? E.day.slots[0]!;

        const refresh = (): void => {
          const done = E.day.slots.filter((slot) => S.daySolved.includes(slot.id)).length;
          next.disabled = done < E.day.slots.length;
          setBottom(
            next.disabled ? `닮은 점 찾기 ${done} / ${E.day.slots.length}` : '네 친구의 하루에서 닮은 점을 모두 찾았어!',
            next
          );
          tabs.querySelectorAll('button').forEach((b) => {
            const id = (b as HTMLElement).dataset.id ?? '';
            b.setAttribute('aria-pressed', String(id === active.id));
            b.classList.toggle('is-solved', S.daySolved.includes(id));
          });
        };

        const drawSlot = (): void => {
          const slot = active;
          task.textContent = S.daySolved.includes(slot.id) ? slot.commonLine : slot.prompt;
          const section = el(`<section class="day-slot ${S.daySolved.includes(slot.id) ? 'is-solved' : ''}"></section>`);
          const cards = el('<div class="day-cards"></div>');
          const common = el(`<p class="day-common">${slot.commonLine}</p>`);
          let picked: string | null = null;
          slot.scenes.forEach((sc) => {
            const st = content.students.find((x) => x.id === sc.studentId);
            const card = el(`<button type="button" class="day-card" data-sid="${sc.studentId}">
              <img src="${assetUrl(avatarAsset(content, sc.studentId))}" alt=""><strong>${st?.name ?? ''}</strong><span>${sc.text}</span>
            </button>`);
            card.addEventListener('click', () => {
              if (S.daySolved.includes(slot.id)) return;
              if (picked === sc.studentId) {
                picked = null;
                card.classList.remove('is-selected');
                return;
              }
              if (!picked) {
                picked = sc.studentId;
                card.classList.add('is-selected');
                void audio.playSfx('tap');
                return;
              }
              const pair = [picked, sc.studentId];
              const ok = slot.pairs.some((p) => p.includes(pair[0] ?? '') && p.includes(pair[1] ?? ''));
              if (ok) {
                S.daySolved.push(slot.id);
                persist();
                section.classList.add('is-solved');
                task.textContent = slot.commonLine;
                cards.querySelectorAll('.day-card').forEach((b) => b.classList.remove('is-selected'));
                cards.querySelectorAll(`[data-sid="${pair[0]}"],[data-sid="${pair[1]}"]`).forEach((b) => b.classList.add('is-linked'));
                burstConfetti(common, 6);
                void audio.playSfx('success');
                refresh();
                // 닮은 점을 읽을 시간을 준 뒤 아직 못 푼 시간대로 넘어간다
                const nextSlot = E.day.slots.find((x) => !S.daySolved.includes(x.id));
                if (nextSlot) later(() => { active = nextSlot; drawSlot(); }, 1800);
              } else {
                void audio.playSfx('partial');
                announceGuide(`그 둘도 닮은 데가 있을 수 있어! 그런데 이번 미션은 이거야 — ${slot.prompt}`);
                cards.querySelectorAll('.day-card').forEach((b) => b.classList.remove('is-selected'));
                picked = null;
              }
            });
            cards.appendChild(card);
          });
          section.append(cards, common);
          board.replaceChildren(section);
          refresh();
        };

        E.day.slots.forEach((slot) => {
          const b = el(`<button type="button" class="btn" data-id="${slot.id}">${slot.label}</button>`);
          b.addEventListener('click', () => { active = slot; void audio.playSfx('whoosh'); drawSlot(); });
          tabs.appendChild(b);
        });

        wrap.append(tabs, task, board);
        stage.replaceChildren(wrap);
        drawSlot();
        showKeyPoint({
          id: 'americas.compare',
          lines: [
            '자연환경이 다르면 먹는 것도, 입는 옷도, 노는 곳도 달라져.',
            '그래도 아침·낮·저녁을 보내는 하루에는 닮은 점이 남아 있어.'
          ],
          onDone: () => announceGuide(E.day.guide)
        });
      };

      /* ===== 화면 5 — 탐험 노트: 분류 + 키워드 ===== */
      interface Sticker { id: string; label: string; cats: string[] }
      const buildStickers = (): Sticker[] => {
        const out: Sticker[] = [];
        E.lenses.forEach((l) => l.points.forEach((p) => {
          if (S.pointsSeen.includes(`${l.id}:${p.id}`)) {
            out.push({ id: `pt-${l.id}-${p.id}`, label: p.label, cats: l.id === 'life' ? ['culture', 'common'] : ['nature'] });
          }
        }));
        E.countries.forEach((c) => {
          const keep = S.countries[c.id]?.keep;
          const item = c.bag.find((b) => b.id === keep);
          if (item) out.push({ id: `keep-${item.id}`, label: item.label, cats: item.kind === 'env' ? ['nature', 'common'] : ['culture', 'common'] });
        });
        E.day.slots.forEach((slot) => {
          if (S.daySolved.includes(slot.id)) out.push({ id: `day-${slot.id}`, label: slot.stickerLabel, cats: ['common'] });
        });
        return out;
      };

      const renderNote = (): void => {
        const stickers = buildStickers();
        const task = el('<p class="am-task" role="status"></p>');
        const layout = el('<div class="note-layout"></div>');
        const pool = el('<div class="note-pool panel"></div>');
        const zonesWrap = el('<div class="note-zones"></div>');
        const zones: HTMLElement[] = [];
        const zoneLists = new Map<string, HTMLElement>();

        E.note.categories.forEach((cat) => {
          const zone = el(`<div class="note-zone" data-zone-id="${cat.id}"><h3>${cat.label}</h3><small>${cat.desc}</small></div>`);
          zones.push(zone);
          zoneLists.set(cat.id, zone);
          zonesWrap.appendChild(zone);
        });

        const next = nextButton('지구 신호로 바꾸기', 'signal');
        const keywordRow = el('<div class="keyword-row panel" hidden></div>');
        const refresh = (): void => {
          const allPlaced = stickers.every((s) => S.notePlaced[s.id]);
          keywordRow.hidden = !allPlaced;
          next.disabled = !(allPlaced && S.keywords.length >= E.note.keywordSlots);
          task.textContent = next.disabled
            ? allPlaced ? `우리 여행을 나타내는 말 ${E.note.keywordSlots}개를 골라 봐!` : '모은 스티커를 어울리는 칸으로 옮겨 봐!'
            : '탐험 노트 완성! 지구 신호로 바꿔 보자.';
          setBottom('', next);
        };

        const items: HTMLElement[] = [];
        stickers.forEach((s) => {
          const chip = el(`<button type="button" class="note-chip" data-item-id="${s.id}">${s.label}</button>`);
          items.push(chip);
          const placedCat = S.notePlaced[s.id];
          if (placedCat && zoneLists.has(placedCat)) zoneLists.get(placedCat)!.appendChild(chip);
          else pool.appendChild(chip);
        });

        dnd = enablePickPlace({
          items, zones,
          onPlace: (itemId, zoneId) => {
            const sticker = stickers.find((s) => s.id === itemId);
            const chip = items.find((i) => i.dataset.itemId === itemId);
            if (!sticker || !chip) return;
            if (!sticker.cats.includes(zoneId)) {
              void audio.playSfx('partial');
              announceGuide('음, 이건 자연 때문일까, 사람들이 만든 모습일까? 다시 생각해 보자.');
              return;
            }
            S.notePlaced[itemId] = zoneId;
            persist();
            zoneLists.get(zoneId)?.appendChild(chip);
            void audio.playSfx('drop');
            refresh();
          }
        });

        const allKeywords = [...E.note.keywords, ...E.note.wrongKeywords]; // 순서 고정(셔플 아님) — 재방문 시 위치가 흔들리지 않게
        allKeywords.forEach((kw) => {
          const good = E.note.keywords.includes(kw);
          const b = el(`<button type="button" class="btn" aria-pressed="${S.keywords.includes(kw)}">${kw}</button>`);
          b.addEventListener('click', () => {
            if (S.keywords.includes(kw)) {
              S.keywords = S.keywords.filter((k) => k !== kw);
            } else if (!good) {
              void audio.playSfx('partial');
              announceGuide('우리가 만난 하루들이 정말 모두 똑같았을까? 노트를 다시 봐 줘.');
              return;
            } else if (S.keywords.length < E.note.keywordSlots) {
              S.keywords.push(kw);
              void audio.playSfx('success');
            }
            persist();
            keywordRow.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(S.keywords.includes(x.textContent ?? ''))));
            refresh();
          });
          keywordRow.appendChild(b);
        });

        layout.append(pool, zonesWrap);
        stage.replaceChildren(task, layout, keywordRow);
        refresh();
        announceGuide('여행에서 모은 이야기야! 자연환경, 생활과 문화, 여러 나라에서 함께 보인 것으로 나눠 보자.');
      };

      /* ===== 화면 6 — 지구 신호 ===== */
      const lit = new Set<string>();
      const renderSignal = (): void => {
        const wrap = el('<div class="signal-final"></div>');
        wrap.appendChild(el('<h2 class="signal-title">탐험 노트가 지구 신호가 되었어!</h2>'));
        const finishBtn = el('<button type="button" class="btn btn-primary btn-big">지구 신호 챙기고 도장 받기</button>') as HTMLButtonElement;

        const refresh = (): void => {
          finishBtn.disabled = lit.size < E.signals.length;
          setBottom(finishBtn.disabled ? '신호를 하나씩 눌러 밝혀 봐' : '신호가 모두 켜졌어! 지구회의에서 다시 만나게 될 거야.', finishBtn);
        };
        E.signals.forEach((sig) => {
          const token = el(`<button type="button" class="signal-token" data-issue="${sig.issueId}"><span><strong>${sig.label}</strong>${sig.line}</span></button>`);
          token.addEventListener('click', () => {
            if (lit.has(sig.id)) return;
            lit.add(sig.id);
            token.classList.add('is-lit');
            popBounce(token);
            void audio.playSfx('stamp');
            refresh();
          });
          wrap.appendChild(token);
        });

        finishBtn.addEventListener('click', () => {
          // 흔들리는 계획 카드(P2-14) — 제출 직전 사건 1장: 노트 한 칸을 다시 확인하고 온다. 실패 없음.
          if (!shakeupDone && !finished) {
            shakeupDone = true;
            openModal({
              id: 'americas-shakeup',
              title: '흔들리는 소식!',
              bodyHtml: `<div style="display:grid;gap:8px;text-align:left">
                <p style="font-weight:800;line-height:1.5">지구회의에서 미리 물어봤어 — <strong>"노트의 낱말들이 정말 네 여행과 맞아?"</strong></p>
                <p style="font-weight:800;color:var(--c-ink-soft)">지금 고른 낱말: ${S.keywords.map((kw) => `<em style="font-style:normal;padding:1px 8px;border-radius:999px;background:#e8f2fb;color:#1c5a8c">${kw}</em>`).join(' ')}</p>
                <p style="font-weight:800">노트로 돌아가 한 번만 다시 살펴보고 오자. 바꿔도 되고, 그대로 확신해도 돼!</p>
              </div>`,
              dismissible: false,
              actions: [{
                label: '노트 확인하고 오기',
                kind: 'primary',
                autofocus: true,
                onClick: (close) => {
                  close();
                  void audio.playSfx('tap');
                  go('note');
                }
              }]
            });
            return;
          }
          finish();
        });
        stage.replaceChildren(wrap);
        refresh();
        announceGuide('네 나라에서 모은 이야기가 물·숲·생활 신호가 되었어. 마지막 지구회의에서 쓰이게 될 거야!');
      };

      const finish = (): void => {
        if (finished) return;
        finished = true;
        const total = E.lenses.flatMap((l) => l.points).length;
        const ratios = {
          evidence: total ? Math.min(1, S.pointsSeen.length / total) : 1,
          perspective: Math.min(1, Object.values(S.countries).filter((c) => c.met).length / E.countries.length),
          communication: Math.min(1, S.daySolved.length / Math.max(1, E.day.slots.length)),
          revision: Math.min(1, S.keywords.length / Math.max(1, E.note.keywordSlots))
        };
        const result = computeScore(ratios, { evidence: 25, perspective: 30, communication: 25, revision: 20 }, 5);
        const keeps = E.countries
          .map((c) => c.bag.find((b) => b.id === S.countries[c.id]?.keep))
          .filter((b): b is BagItemDef => Boolean(b));
        const doComplete = (): void => {
          const learnRec = readLearnRecord('americas');
          writeMissionArtifact({
            schemaVersion: 1,
            missionId: 'americas',
            title: '아메리카 탐험 기록',
            purpose: '아메리카 대륙의 위치·자연환경·생활과 문화를 지도 위에서 직접 탐험하고 공통점과 다양성을 살펴봐요.',
            initialHypothesis: learnRec.initialHypothesis ?? '여행 전에 남긴 첫 생각이 없어요.',
            evidenceIds: [...S.pointsSeen, ...keeps.map((k) => k.id)],
            evidenceLabel: '렌즈로 살핀 대륙의 모습과 네 친구의 가방에서 고른 이야기를 모았어요.',
            voiceId: 'americas-friends',
            voiceName: content.students.map((s) => s.name).join('·'),
            voiceLine: keeps.map((k) => k.label).join(' · ') || '네 친구의 이야기',
            firstDecision: S.keywords[0] ?? '서로 다른 자연환경',
            observedConsequence: '환경은 달라도 하루의 모습에는 닮은 점이 있었어요.',
            revisedDecision: S.keywords.join(' · ') || '다양한 문화 · 함께 사는 지구',
            rationale: '한 장면으로 나라 전체를 단정하지 않고, 여러 지역의 모습을 직접 비교했어요.',
            transferPrompt: '다른 대륙의 친구들에게서도 물·숲·생활 신호를 찾아 이어 볼까?',
            earnedAt: new Date().toISOString()
          });
          // 지구회의로 가져갈 신호 — 지도 화면과 마지막 회의가 이걸 읽는다
          recordEarthSignals('americas', E.signals.map((s) => s.label));
          completeMissionFlow('americas', '아메리카', result, { directToStamp: true });
        };
        const learn = getLearn(content);
        if (learn) showLearningWrap('americas', learn, doComplete);
        else doComplete();
      };

      const render = (): void => {
        dnd?.dispose();
        dnd = null;
        page.dataset.screen = S.screen;
        const idx = Math.max(0, SCREENS.indexOf(S.screen));
        updateSteps(topBar, SCREENS.length, idx, idx);
        switch (S.screen) {
          case 'landing': renderLanding(); break;
          case 'lens': renderLens(); break;
          case 'countries': renderCountries(); break;
          case 'day': renderDay(); break;
          case 'note': renderNote(); break;
          case 'signal': renderSignal(); break;
        }
      };
      render();
    },
    unmount() {
      disposed = true;
      clearMapFits();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      dnd?.dispose();
      dnd = null;
      guide?.dispose?.();
      guide = null;
      audio.stopBgm();
    }
  };
}
