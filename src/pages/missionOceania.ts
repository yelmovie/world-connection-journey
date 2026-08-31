import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { calculatePolicyDelta, type PolicyEvidenceSupport, type PolicyEvent } from '../core/oceaniaPolicy';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { burstConfetti, countUp } from '../ui/fx';
import { createGuide, type GuideController } from '../ui/guide';
import { getLearn, readLearnRecord, showFriendIntro, showLearningWrap } from '../ui/learnFrame';
import { openModal } from '../ui/modal';
import { showToast } from '../ui/toast';
import { avatarMissionInsight, selectedAvatarSpeaker } from '../ui/avatarRoster';
import { selectedTravelKit } from '../ui/airplaneFleet';
import { openCharacterDialogue } from '../ui/characterDialogue';

/* ===== 콘텐츠 스키마 (public/content/v1/ko/oceania.json 기준) ===== */
interface Hotspot {
  id: string;
  name: string;
  x: number;
  y: number;
  issue: string;
  cause: string;
  effect: string;
  community: {
    voices: CommunityChoice[];
    agreements: CommunityChoice[];
  };
}
interface CommunityChoice {
  id: string;
  label: string;
  response: string;
}
interface Perspective {
  id: string;
  role: string;
  name: string;
  imageId: string;
  quote: string;
  concern: string;
  policySupport: PolicyEvidenceSupport;
  dialogue: {
    opening: string;
    responses: ResidentResponse[];
  };
}
type DialogueSkill = 'listen' | 'confirm' | 'empathy' | 'question';
interface ResidentResponse {
  id: string;
  text: string;
  skill: DialogueSkill;
  followUp: string;
  newInfo: string;
}
interface ConversationRecord {
  perspectiveId: string;
  responseId: string;
  skill: DialogueSkill;
}
interface CommunityRecord {
  hotspotId: string;
  voiceId: string;
  agreementId: string;
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
    events: PolicyEvent[];
    thresholds: { good: number; warn: number };
  };
  feedback: { collapse: string; balanced: string; tradeoffNote: string };
}

const DIALOGUE_SKILLS = new Set<DialogueSkill>(['listen', 'confirm', 'empathy', 'question']);
function assertOceaniaDialogueContent(content: OceaniaContent): void {
  for (const hotspot of content.hotspots ?? []) {
    if (
      !hotspot.community || !Array.isArray(hotspot.community.voices) || hotspot.community.voices.length < 2 ||
      !Array.isArray(hotspot.community.agreements) || hotspot.community.agreements.length < 2 ||
      [...hotspot.community.voices, ...hotspot.community.agreements].some((choice) =>
        !choice || typeof choice.id !== 'string' || typeof choice.label !== 'string' || typeof choice.response !== 'string'
      )
    ) {
      throw new Error(`오세아니아 콘텐츠 오류: ${hotspot.id}의 공동체 선택 형식이 올바르지 않아요.`);
    }
  }
  if (!Array.isArray(content.perspectives) || content.perspectives.length !== 4) {
    throw new Error('오세아니아 콘텐츠 오류: 대화할 주민은 네 명이어야 해요.');
  }
  const perspectiveIds = new Set<string>();
  for (const perspective of content.perspectives) {
    if (
      !perspective || typeof perspective.id !== 'string' || typeof perspective.name !== 'string' ||
      typeof perspective.role !== 'string' || typeof perspective.imageId !== 'string' ||
      !perspective.dialogue || typeof perspective.dialogue.opening !== 'string' ||
      !Array.isArray(perspective.dialogue.responses) ||
      perspective.dialogue.responses.length < 2 || perspective.dialogue.responses.length > 3 ||
      !perspective.policySupport || typeof perspective.policySupport.control !== 'string' ||
      !Array.isArray(perspective.policySupport.options) || perspective.policySupport.options.length === 0 ||
      typeof perspective.policySupport.effects !== 'object' || typeof perspective.policySupport.note !== 'string'
    ) {
      throw new Error('오세아니아 콘텐츠 오류: 주민 대화 형식이 올바르지 않아요.');
    }
    if (perspectiveIds.has(perspective.id)) throw new Error(`오세아니아 콘텐츠 오류: 중복 주민 id ${perspective.id}`);
    perspectiveIds.add(perspective.id);
    const responseIds = new Set<string>();
    for (const response of perspective.dialogue.responses) {
      if (
        !response || typeof response.id !== 'string' || typeof response.text !== 'string' ||
        !DIALOGUE_SKILLS.has(response.skill) || typeof response.followUp !== 'string' || typeof response.newInfo !== 'string'
      ) {
        throw new Error(`오세아니아 콘텐츠 오류: ${perspective.id}의 응답 형식이 올바르지 않아요.`);
      }
      if (responseIds.has(response.id)) throw new Error(`오세아니아 콘텐츠 오류: 중복 응답 id ${response.id}`);
      responseIds.add(response.id);
    }
  }
  if (!Array.isArray(content.sim.events) || content.sim.events.length !== content.sim.turns) {
    throw new Error('오세아니아 콘텐츠 오류: 각 결정에는 하나의 상황 사건이 필요해요.');
  }
  for (const event of content.sim.events) {
    if (!event || typeof event.id !== 'string' || typeof event.title !== 'string' ||
      typeof event.description !== 'string' || !event.effects || typeof event.effects !== 'object') {
      throw new Error('오세아니아 콘텐츠 오류: 미래회의 사건 형식이 올바르지 않아요.');
    }
  }
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
const DIALOGUE_SKILL_LABEL: Record<DialogueSkill, string> = {
  listen: '끝까지 듣기',
  confirm: '내가 이해한 것 확인하기',
  empathy: '마음과 처지 공감하기',
  question: '더 알고 싶은 것 묻기'
};
const RESIDENT_IMAGE_FALLBACK: Record<string, string> = {
  'oceania.resident.youth': 'oceania_resident_youth-v2.webp',
  'oceania.resident.researcher': 'oceania_resident_researcher-v2.webp',
  'oceania.resident.fisher': 'oceania_resident_fisher-v2.webp',
  'oceania.resident.elder': 'oceania_resident_elder-v2.webp'
};
const LEGACY_SPEAKER_IMAGE: Record<string, string> = {
  youth_moana: 'oceania.youth',
  researcher_kim: 'oceania.researcher',
  fisher_rau: 'oceania.fisher',
  elder_mairi: 'oceania.visitor'
};
const residentImageUrl = (assetId: string): string => hasAsset(assetId)
  ? assetUrl(assetId)
  : `${import.meta.env.BASE_URL}assets/${RESIDENT_IMAGE_FALLBACK[assetId] ?? 'oceania_residents_lineup.webp'}`;
const RESIDENT_LINEUP_URL = `${import.meta.env.BASE_URL}assets/oceania_residents_lineup.webp`;
const START_VALUE = 50;
const COLLAPSE_LINE = 35;

const OCEANIA_CSS = `
/* 계약 §7 — 섬 배경이 주인공. 패널은 반투명·내용 크기만큼. */
.oc-scene { --oc-copy: max(18px, var(--fs-body)); --oc-label: max(18px, var(--fs-small)); }
.oc-scene .page-body {
  padding:var(--sp-3) clamp(16px,3vw,48px) clamp(54px,7vh,60px);
  font-size: var(--oc-copy); line-height: 1.55;
}
.oc-scene .panel {
  background: var(--glass-panel); backdrop-filter: blur(9px) saturate(1.05);
  border: 2px solid rgba(255,255,255,0.72); border-radius: var(--radius-l);
  box-shadow: var(--shadow-card); padding: clamp(14px, 1.25vw, 22px);
}
.oc-scene .card {
  padding: var(--sp-3); background: rgba(255,255,255,0.97);
  border-radius: var(--radius-m); line-height: 1.5;
}
.oc-stage { flex: 1; min-height: 0; width: min(1500px, 100%); margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-3); }
.oc-head { display: flex; justify-content: center; flex-shrink: 0; }

/* 이 미션이 여는 긴 기록 모달은 넓고 안정적인 읽기 판으로 표시한다. */
.modal-backdrop .modal {
  width: min(780px, 92vw); max-height: min(90dvh, 800px);
  border: 3px solid rgba(16,195,200,0.25); background:linear-gradient(180deg,rgba(255,253,246,.92),rgba(255,249,234,.86));
  font-size: max(18px, var(--fs-body)); line-height: 1.55;
}
.modal-backdrop .modal > div { max-width: 48em; margin-inline: auto; }
.modal-backdrop .modal table { min-width: 100%; font-size: max(18px, var(--fs-small)) !important; line-height: 1.45; }
.modal-backdrop .modal th, .modal-backdrop .modal td { padding: 9px 12px !important; }
.modal-backdrop .modal-actions .btn { min-height: 56px; font-size: max(18px, var(--fs-small)); padding-inline: 22px; }

/* 1단계 — 섬 지도는 끝까지 넓게 유지하고, 조사·목소리·약속 대화는 왼쪽 가이드 말풍선이 맡는다. */
.oc-map-row { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr); gap: var(--sp-3); }
.oc-island {
  position:relative;min-height:0;overflow:hidden;border-radius:clamp(18px,2vw,30px);
  box-shadow:0 18px 46px rgba(4,30,49,.2);outline:1px solid rgba(255,255,255,.28);
}
.oc-island-video { position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#116ca0; }
.oc-spot {
  position: absolute; transform: translate(-50%,-50%);
  width: max(72px, var(--hotspot-min)); height: max(72px, var(--hotspot-min)); border-radius: 50%;
  border: 3px solid #fff; cursor: pointer; color: var(--c-ink);
  font-family: var(--font-head); font-size: var(--oc-copy); box-shadow: var(--shadow-pop);
  transition:transform var(--t-fast),filter var(--t-fast),background var(--t-fast);
}
.oc-spot:hover,.oc-spot:focus-visible { transform:translate(-50%,-50%) scale(1.08);filter:brightness(1.06);outline:4px solid rgba(255,255,255,.55);outline-offset:3px; }
.oc-spot.is-todo { background:var(--c-coral); }
.oc-spot.is-linked { background:var(--c-success); }
.oc-spot.is-waiting { background:rgba(231,244,248,.94);color:#32647a; }
.oc-spot.is-link-target { background:var(--c-gold);color:#4d3600; }
.oc-scene > .bottom-bar { background:transparent!important;backdrop-filter:none!important;border:0!important;box-shadow:none!important; }
.oc-scene > .bottom-bar { justify-content:flex-end; }
.oc-scene .guide-left .guide-mascot-button { transform:scaleX(-1);transform-origin:center bottom; }

/* 같은 해안의 10년 전·현재를 손가락으로 직접 밀어 비교한다. */
.oc-compare-wrap { display:grid;gap:12px; }
.oc-compare {
  --split:50%;position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border-radius:20px;
  background:#1677a0;box-shadow:0 14px 34px rgba(7,35,56,.2);touch-action:none;
}
.oc-compare img { position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none; }
.oc-compare__now { clip-path:inset(0 0 0 var(--split)); }
.oc-compare__line { position:absolute;z-index:3;top:0;bottom:0;left:var(--split);width:4px;transform:translateX(-50%);background:#fff;box-shadow:0 0 0 2px rgba(11,50,78,.28);pointer-events:none; }
.oc-compare__handle { position:absolute;z-index:4;left:var(--split);top:50%;width:58px;height:58px;display:grid;place-items:center;transform:translate(-50%,-50%);border:4px solid #fff;border-radius:50%;background:var(--c-gold);color:#4d3600;font:900 24px/1 var(--font-head);box-shadow:var(--shadow-pop);pointer-events:none; }
.oc-compare input[type="range"] { position:absolute;z-index:5;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;touch-action:none; }
.oc-compare__label { position:absolute;z-index:2;top:12px;padding:7px 12px;border-radius:999px;background:rgba(9,39,62,.82);color:#fff;font-weight:900;box-shadow:0 4px 12px rgba(0,0,0,.18);pointer-events:none; }
.oc-compare__label--past { left:12px; }
.oc-compare__label--now { right:12px; }
.oc-compare-legend { display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:0;text-align:center;font-weight:800; }
.oc-change-chips { display:flex;justify-content:center;gap:8px;flex-wrap:wrap; }
.oc-change-chips span { padding:7px 11px;border-radius:999px;background:#fff3cf;color:#654700;font-weight:850; }

/* 2단계 — 조사에서 만난 주민과 한 명씩 대화하는 섬 회의 */
.oc-dialogue-progress { display:flex;justify-content:center;gap:8px;flex-wrap:wrap; }
.oc-dialogue-progress .chip.is-done { background:rgba(46,173,120,.2);color:#17573d; }
.oc-dialogue-progress .chip.is-now { background:rgba(242,193,78,.3);color:#5f4300;box-shadow:0 0 0 2px var(--c-gold); }
.oc-dialogue-scene {
  flex:1;min-height:0;display:grid;grid-template-columns:minmax(250px,.72fr) minmax(0,1.45fr);
  gap:var(--sp-4);align-items:stretch;
}
.oc-resident-panel {
  min-height:0;display:grid;grid-template-rows:minmax(0,1fr) auto;align-items:stretch;justify-items:center;
  border-radius:var(--radius-l);overflow:hidden;position:relative;
  background:linear-gradient(180deg,rgba(95,184,209,.92),rgba(22,92,122,.9));box-shadow:var(--shadow-card);
}
.oc-resident-panel::before { content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 20%,rgba(255,255,255,.45),transparent 48%); }
.oc-resident-portrait {
  position:relative;align-self:stretch;justify-self:stretch;min-width:0;min-height:0;overflow:hidden;
  display:flex;align-items:flex-start;justify-content:center;padding-top:6px;
}
.oc-resident-portrait img {
  position:relative;flex:none;align-self:flex-start;width:auto;max-width:none;height:170%;max-height:none;
  object-fit:contain;object-position:center top;
  filter:drop-shadow(0 12px 18px rgba(10,35,55,.25));
}
.oc-resident-caption { position:relative;justify-self:stretch;width:100%;padding:10px 14px;text-align:center;background:rgba(10,40,62,.82);color:#fff; }
.oc-resident-caption strong { display:block;font-family:var(--font-head);font-size:var(--oc-copy); }
.oc-conversation-panel { min-height:0;display:flex;flex-direction:column;gap:var(--sp-3);overflow-y:auto; }
.oc-speech { border-left:6px solid var(--c-turquoise);font-size:var(--oc-copy); }
.oc-speech .speaker { display:block;margin-bottom:6px;color:#14559c;font-family:var(--font-head); }
.oc-response-list { display:grid;grid-template-columns:1fr;gap:10px; }
.oc-response-option { min-height:64px;text-align:left;font-size:var(--oc-label);line-height:1.45;padding:12px 15px; }
.oc-response-option::before { content:'말하기';display:inline-flex;margin-right:8px;padding:3px 8px;border-radius:999px;background:rgba(108,76,232,.13);color:#4a30b0;font-size:max(15px,calc(var(--oc-label) - 2px));font-weight:800; }
.oc-chosen-response { border-left:6px solid var(--c-violet); }
.oc-follow-up { border-left:6px solid var(--c-success); }
.oc-new-info { background:#eef9f5!important;border:2px solid rgba(46,173,120,.3); }
.oc-dialogue-note { margin:0;color:rgba(25,50,77,.78);font-weight:800; }
.oc-skill-chip { display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:999px;background:rgba(242,193,78,.25);color:#674800;font-weight:900; }
.oc-dialogue-summary { flex:1;min-height:0;display:grid;grid-template-columns:minmax(280px,.9fr) minmax(0,1.1fr);gap:var(--sp-4); }
.oc-lineup-panel { min-height:0;border-radius:var(--radius-l);overflow:hidden;background:linear-gradient(180deg,#8dd5e5,#246987);box-shadow:var(--shadow-card); }
.oc-lineup-panel img { width:100%;height:100%;min-height:260px;object-fit:contain;object-position:center bottom; }
.oc-record-list { min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px; }
.oc-record-item { display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:start; }
.oc-record-item img { width:58px;height:58px;object-fit:cover;border-radius:50%;background:var(--c-sky); }

/* 3단계 — 게이지 4개 한 줄, 1024에서는 2×2 폴백 */
.oc-gauges { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: var(--sp-3); flex-shrink: 0; }
.oc-gauge { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.oc-gauge .g-top { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.oc-gauge .g-label { font-family: var(--font-head); font-size: var(--oc-copy); }
.oc-gauge .g-num { font-weight: 800; font-size: var(--oc-label); }
.oc-gauge .g-delta { font-weight: 900; font-size: var(--oc-label); }
.oc-controls { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: var(--sp-3); align-content: start; }
.oc-controls .g-title { font-weight: 800; font-size: var(--oc-copy); margin-bottom: 8px; }
.oc-ctrl-row { display: flex; gap: 8px; flex-wrap: wrap; }
.oc-ctrl-row .card-pick { flex: 1; min-width: 104px; min-height: 58px; font-weight: 700; text-align: center; font-size: var(--oc-label); padding: 9px 10px; }
.oc-policy-stage { overflow-y:auto; padding-bottom:4px; }
.oc-decision-context { display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:var(--sp-3); }
.oc-event-card { border-left:6px solid var(--c-coral); }
.oc-support-card { border-left:6px solid var(--c-violet); }
.oc-context-kicker { margin:0 0 4px;font-size:max(15px,calc(var(--oc-label) - 2px));font-weight:900;color:#4b3da4; }
.oc-decision-context h3 { margin:0 0 5px;font-size:var(--oc-copy); }
.oc-decision-context p { margin:0; }
.oc-evidence-panel { display:flex;flex-direction:column;gap:10px; }
.oc-evidence-head { display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap; }
.oc-evidence-grid { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px; }
.oc-evidence-pick { min-height:58px;padding:8px 10px;text-align:left;font-weight:800;line-height:1.3; }
.oc-evidence-pick small { display:block;margin-top:3px;font-weight:650;color:rgba(25,50,77,.75); }
.oc-evidence-detail { min-height:44px;padding:9px 12px;border-radius:var(--radius-s);background:rgba(16,195,200,.09);font-size:var(--oc-label); }
.oc-kit-panel { border:2px dashed rgba(108,76,232,.28);border-radius:var(--radius-s);padding:8px 11px;background:rgba(255,255,255,.62); }
.oc-kit-panel strong { color:#4a30b0; }
.oc-policy-stage :where(.oc-kit-panel,.oc-controls,#decision-hint,#sim-fb) {
  margin-left:calc(var(--guide-size) + var(--sp-2));
}

@media (max-width: 1200px) {
  .oc-gauges { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-height: 760px) and (min-width: 901px) {
  .oc-resident-portrait { padding-top:3px; }
  .oc-resident-portrait img { height:185%; }
}
@media (max-height: 620px) {
  .oc-scene .page-body { padding:6px clamp(10px,2.5vw,28px) 44px; }
  .oc-stage { gap: var(--sp-2); }
  .oc-scene .panel { padding: var(--sp-3); }
  .oc-scene .card { padding: 8px 10px; }
  .ribbon-title .ribbon-sub { display: none; }
  .oc-gauges { gap: 6px; }
  .oc-controls .g-title { margin-bottom: 3px; }
  .oc-dialogue-scene { grid-template-columns:minmax(180px,.55fr) minmax(0,1.45fr);gap:8px; }
  .oc-resident-portrait img { height:185%; }
  .oc-response-option { min-height:52px;padding:8px 11px; }
  .oc-conversation-panel { gap:6px; }
}
@media (max-width: 900px) {
  .oc-controls { grid-template-columns: 1fr; }
  .oc-decision-context,.oc-evidence-grid { grid-template-columns:1fr 1fr; }
  .oc-policy-stage :where(.oc-kit-panel,.oc-controls,#decision-hint,#sim-fb) { margin-left:0; }
  .oc-dialogue-scene,.oc-dialogue-summary { grid-template-columns:1fr;overflow-y:auto; }
  .oc-resident-panel { grid-template-rows:260px auto; }
  .oc-resident-portrait img { height:150%; }
}
@media (max-width: 620px) {
  .oc-decision-context,.oc-evidence-grid { grid-template-columns:1fr; }
  .oc-compare__label { top:8px;padding:5px 8px;font-size:14px; }
  .oc-compare__handle { width:48px;height:48px;font-size:20px; }
}
`;

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
function withObjectParticle(text: string): string {
  const last = text.codePointAt(text.length - 1) ?? 0;
  const hasFinalConsonant = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${text}${hasFinalConsonant ? '을' : '를'}`;
}

interface TurnRecord {
  choices: Record<string, string>;
  delta: Metrics;
  after: Metrics;
  eventId?: string;
  evidencePerspectiveId?: string;
  evidenceApplied?: boolean;
  evidenceNote?: string;
}

function createLegacyPage(): Page {
  let closeActiveModal: (() => void) | null = null;
  let guide: GuideController | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      disposed = false;
      const content = await loadContent<OceaniaContent>('oceania');
      assertOceaniaDialogueContent(content);
      // 배움 루프(친구 소개 → 예상 → 활동 → 배움 확인). learn 없으면 기존 흐름 그대로.
      const learn = getLearn(content);
      const speakerImageId = (p: Perspective): string => hasAsset(p.imageId) ? p.imageId : (LEGACY_SPEAKER_IMAGE[p.id] ?? 'oceania.youth');
      const youthSpeaker = {
        assetId: 'oceania.youth',
        name: '카일라'
      };
      const activeProfile = saveRepo.get().profile;
      const playerSpeaker = selectedAvatarSpeaker(activeProfile);
      const explorerInsight = avatarMissionInsight(activeProfile?.avatarId, 'oceania');
      const travelKit = selectedTravelKit(activeProfile?.airplaneId);
      const perspectiveSpeaker = (p: Perspective) => ({ assetId: speakerImageId(p), name: p.name });
      const firstSentence = (text: string): string => text.split(/(?<=[.!?])\s+/)[0]?.trim() || text.trim();
      const friendlySpeech = (text: string): string => text
        .replace(/저희/g, '우리')
        .replace(/저는/g, '나는')
        .replace(/제가/g, '내가')
        .replace(/그렇습니다/g, '그래')
        .replace(/있습니다/g, '있어')
        .replace(/됩니다/g, '돼')
        .replace(/합니다/g, '해')
        .replace(/입니다/g, '이야')
        .replace(/주세요/g, '줘')
        .replace(/인가요/g, '이야')
        .replace(/나요/g, '니')
        .replace(/까요/g, '까')
        .replace(/군요/g, '구나')
        .replace(/이에요/g, '이야')
        .replace(/예요/g, '야')
        .replace(/해요/g, '해')
        .replace(/돼요/g, '돼')
        .replace(/아요/g, '아')
        .replace(/어요/g, '어')
        .replace(/죠/g, '지');
      await preloadImages([
        'bg.oceania', 'oceania.viti_levu_video_poster', 'oceania.viti_levu_polluted_now', 'reward.turtle_medal',
        ...content.perspectives.map((perspective) => perspective.imageId).filter(hasAsset)
      ]);
      audio.playBgm('oceania');

      /* ===== 진행 상태 ===== */
      const hotspotIds = new Set(content.hotspots.map((h) => h.id));
      const perspectiveIds = new Set(content.perspectives.map((p) => p.id));
      const investigated = new Set<string>();
      const linked = new Set<string>();
      const linkMistakes = new Set<string>();
      const viewed = new Set<string>();
      const conversationRecords: ConversationRecord[] = [];
      const communityRecords: CommunityRecord[] = [];
      let stage: 1 | 2 | 3 = 1;
      let linkPhase: 'cause' | 'effect' = 'cause';
      let firstTryLinks = 0;
      let turnIndex = 0;
      let metrics: Metrics = { eco: START_VALUE, community: START_VALUE, economy: START_VALUE, culture: START_VALUE };
      let history: TurnRecord[] = [];
      let chosen: Record<string, string> = {};
      let selectedEvidenceId = '';
      let lastDelta: Metrics | null = null;
      let turnWarned = false; // 이번 턴에 붕괴 경고를 이미 봤는가
      let warnedChoices = ''; // 경고 시점의 선택(수정 여부 판별용)
      let collapseCount = 0;
      let revisedCount = 0;
      let restartCount = 0;
      let lastBalanced = false;
      let busy = false;
      let finished = false;
      // 표현용 상태(저장 안 함): 게이지 숫자 굴리기 기준값 · 경고 강조 지표
      let shownMetrics: Metrics | null = null;
      const warnKeys = new Set<MetricKey>();

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
      let migratedLegacyConversation = false;
      if (saved.checkpointId) {
        const d = saved.data;
        strArr(d.investigated).filter((id) => hotspotIds.has(id)).forEach((id) => investigated.add(id));
        strArr(d.linked).filter((id) => hotspotIds.has(id)).forEach((id) => linked.add(id));
        strArr(d.linkMistakes).filter((id) => hotspotIds.has(id)).forEach((id) => linkMistakes.add(id));
        strArr(d.viewed).filter((id) => perspectiveIds.has(id)).forEach((id) => viewed.add(id));
        if (Array.isArray(d.communityRecords)) {
          for (const raw of d.communityRecords) {
            if (!raw || typeof raw !== 'object') continue;
            const rec = raw as Record<string, unknown>;
            const hotspot = content.hotspots.find((item) => item.id === rec.hotspotId);
            if (!hotspot || typeof rec.voiceId !== 'string' || typeof rec.agreementId !== 'string') continue;
            if (!hotspot.community.voices.some((item) => item.id === rec.voiceId)) continue;
            if (!hotspot.community.agreements.some((item) => item.id === rec.agreementId)) continue;
            communityRecords.push({ hotspotId: hotspot.id, voiceId: rec.voiceId, agreementId: rec.agreementId });
          }
        }
        if (Array.isArray(d.conversationRecords)) {
          for (const raw of d.conversationRecords) {
            if (!raw || typeof raw !== 'object') continue;
            const rec = raw as Record<string, unknown>;
            if (typeof rec.perspectiveId !== 'string' || typeof rec.responseId !== 'string') continue;
            const perspective = content.perspectives.find((item) => item.id === rec.perspectiveId);
            const response = perspective?.dialogue.responses.find((item) => item.id === rec.responseId);
            if (!perspective || !response || conversationRecords.some((item) => item.perspectiveId === perspective.id)) continue;
            conversationRecords.push({ perspectiveId: perspective.id, responseId: response.id, skill: response.skill });
            viewed.add(perspective.id);
          }
        }
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
          if (typeof sim.selectedEvidenceId === 'string' && perspectiveIds.has(sim.selectedEvidenceId)) {
            selectedEvidenceId = sim.selectedEvidenceId;
          }
          if (!warnedChoices) turnWarned = false;
        }
        // 예전 버전에서 단순 인물 카드를 본 뒤 3단계로 넘어간 기록은
        // 새 주민 대화를 건너뛰지 않도록 대화 단계에서 다시 잇는다.
        if (stage === 3 && conversationRecords.length < content.perspectives.length) {
          stage = 2;
          turnIndex = 0;
          metrics = { eco: START_VALUE, community: START_VALUE, economy: START_VALUE, culture: START_VALUE };
          history = [];
          chosen = {};
          selectedEvidenceId = '';
          lastDelta = null;
          turnWarned = false;
          warnedChoices = '';
          collapseCount = 0;
          revisedCount = 0;
          restartCount = 0;
          lastBalanced = false;
          migratedLegacyConversation = true;
        }
      }

      const checkpoint = (id: 'stage1' | 'stage2' | 'stage3') => {
        saveRepo.setCheckpoint('oceania', id, {
          // setCheckpoint은 data를 스냅샷으로 통째 교체하므로, learnFrame 기록(data.learn)을 함께 실어 보존한다
          learn: saveRepo.get().missions.oceania.data.learn,
          investigated: [...investigated],
          linked: [...linked],
          linkMistakes: [...linkMistakes],
          firstTryLinks,
          viewed: [...viewed],
          communityRecords: [...communityRecords],
          conversationRecords: [...conversationRecords],
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
            chosen,
            selectedEvidenceId
          }
        });
      };
      if (migratedLegacyConversation) checkpoint('stage2');

      /* ===== 페이지 골격 ===== */
      const page = document.createElement('div');
      page.className = 'page oc-scene';
      // 배경이 주인공 — 오버레이는 글자 대비에 필요한 만큼만
      page.style.backgroundImage = `linear-gradient(rgba(8, 39, 61, 0.34), rgba(8, 39, 61, 0.5)), url('${assetUrl('oceania.viti_levu_video_poster')}')`;
      page.style.backgroundPosition = 'center';
      const pageStyle = document.createElement('style');
      pageStyle.textContent = OCEANIA_CSS;
      page.appendChild(pageStyle);
      const topBar = buildTopBar({
        title: content.intro.title,
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
      page.appendChild(bottom);
      root.appendChild(page);

      // 마스코트 가이드 — 단계 안내는 말풍선으로, 화면 글자는 최소로
      guide = createGuide({ assetId: playerSpeaker.assetId, speakerName: playerSpeaker.name });
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

      /** 비티레부 탐험 영상 자리. 지금은 생성한 첫 장면을 포스터로 쓰고, 나중에 video source만 넣으면 된다. */
      const islandHero = (): string => {
        const sceneAsset = 'oceania.viti_levu_video_poster';
        if (!hasAsset(sceneAsset)) return islandSvg();
        return `
          <video class="oc-island-video" poster="${assetUrl(sceneAsset)}" data-asset-id="${sceneAsset}" muted playsinline
            aria-label="피지 비티레부섬의 산호초, 해안 마을, 숲과 도시를 둘러보는 탐험 영상의 첫 장면"></video>
          <div aria-hidden="true" style="position:absolute;inset:0;background:radial-gradient(ellipse at center, transparent 55%, rgba(10,40,62,0.35) 100%)"></div>`;
      };

      const openCoastComparison = (h: Hotspot, onContinue: () => void): void => {
        const cleanAsset = 'oceania.viti_levu_video_poster';
        const changedAsset = 'oceania.viti_levu_polluted_now';
        if (!hasAsset(cleanAsset) || !hasAsset(changedAsset)) {
          onContinue();
          return;
        }
        const comparison = document.createElement('div');
        comparison.className = 'oc-compare-wrap';
        comparison.innerHTML = `
          <p class="oc-compare-legend">가운데 손잡이를 좌우로 밀어서 같은 바다가 어떻게 달라졌는지 찾아봐.</p>
          <div class="oc-compare" style="--split:50%">
            <img src="${assetUrl(cleanAsset)}" data-asset-id="${cleanAsset}" alt="10년 전, 산호와 물고기가 풍부하고 쓰레기가 없는 비티레부 해안">
            <img class="oc-compare__now" src="${assetUrl(changedAsset)}" data-asset-id="${changedAsset}" alt="지금, 하얗게 변한 산호와 줄어든 물고기, 해안 쓰레기가 보이는 같은 비티레부 해안">
            <span class="oc-compare__label oc-compare__label--past">10년 전 · 깨끗한 바다</span>
            <span class="oc-compare__label oc-compare__label--now">지금 · 달라진 바다</span>
            <span class="oc-compare__line" aria-hidden="true"></span>
            <span class="oc-compare__handle" aria-hidden="true">↔</span>
            <input type="range" min="5" max="95" value="50" aria-label="10년 전과 지금의 바다 비교 위치">
          </div>
          <div class="oc-change-chips" aria-label="찾아볼 변화">
            <span>하얗게 변한 산호</span><span>줄어든 물고기</span><span>해안의 플라스틱</span>
          </div>`;
        const slider = comparison.querySelector<HTMLInputElement>('input[type="range"]');
        const canvas = comparison.querySelector<HTMLElement>('.oc-compare');
        slider?.addEventListener('input', () => canvas?.style.setProperty('--split', `${slider.value}%`));
        closeActiveModal = openModal({
          id: `oceania-compare-${h.id}`,
          title: `${h.name}: 10년 전과 지금`,
          bodyEl: comparison,
          actions: [{
            label: '달라진 점 이야기하기',
            kind: 'primary',
            autofocus: true,
            onClick: (close) => {
              close();
              queueMicrotask(onContinue);
            }
          }]
        });
      };

      const openHotspotDialogue = (h: Hotspot) => {
        closeActiveModal = openCharacterDialogue({
          id: `oceania-hotspot-${h.id}`,
          title: `${h.name}에서 들은 이야기`,
          name: '카일라',
          meta: '피지 비티레부섬 탐험 친구',
          assetId: 'oceania.youth',
          partner: { name: playerSpeaker.name, meta: '오세아니아 탐험가', assetId: playerSpeaker.assetId },
          lines: [
            { role: 'partner', label: '변화 묻기', text: `${h.name}에서 무엇이 달라졌어?` },
            { role: 'character', label: '관찰한 변화', text: friendlySpeech(h.issue) },
            { role: 'partner', label: '원인과 영향', text: '왜 생겼고, 사람과 자연에는 어떻게 이어질까?' },
            { role: 'character', label: '이어진 이야기', text: friendlySpeech(`${h.cause} ${h.effect}`) },
            { role: 'partner', label: '조사 약속', text: '한쪽만 보고 정하지 않고, 관련된 사람들의 목소리도 함께 들어 볼게.' }
          ],
          onComplete: () => {
            investigated.add(h.id);
            checkpoint('stage1');
            renderStage1();
          }
        });
      };

      const openHotspot = (h: Hotspot) => {
        if (h.id === 'coral_reef' || h.id === 'trash_beach') {
          openCoastComparison(h, () => openHotspotDialogue(h));
          return;
        }
        openHotspotDialogue(h);
      };

      const openCommunityPrompt = (
        current: Hotspot,
        phase: 'cause' | 'effect' = linkPhase,
        opts: { review?: boolean; lead?: string; voiceId?: string } = {}
      ): void => {
        if ((!opts.review && linked.has(current.id)) || disposed) return;
        const review = opts.review === true;
        const choices = phase === 'cause' ? current.community.voices : current.community.agreements;
        const prompt = phase === 'cause'
          ? `${friendlySpeech(current.issue)} 이 상황을 이해하려면 누구의 목소리부터 들어볼까? 두 목소리 모두 중요해.`
          : `${opts.lead ? `${friendlySpeech(opts.lead)} ` : ''}이제 함께 지킬 약속을 골라 봐. 어느 쪽도 가능한 약속이야.`;
        const options = choices.map((choice) => ({
          label: choice.label,
          ariaLabel: choice.label,
          kind: 'ghost' as const,
          onClick: () => {
            if (busy || disposed) return;
            busy = true;
            void audio.playSfx('tap');
            if (phase === 'cause') {
              if (!review) {
                linkPhase = 'effect';
                checkpoint('stage1');
              }
              busy = false;
              openCommunityPrompt(current, 'effect', { review, lead: choice.response, voiceId: choice.id });
              return;
            }

            if (review) {
              busy = false;
              void audio.playSfx('success');
              guide?.say(`${friendlySpeech(choice.response)} 이 활동에는 하나뿐인 정답이 없어. 다른 목소리와 약속도 다시 골라 볼 수 있어.`, {
                speaker: youthSpeaker,
                cue: null,
                autoStart: true
              });
              return;
            }

            const existingRecord = communityRecords.findIndex((record) => record.hotspotId === current.id);
            const communityRecord: CommunityRecord = {
              hotspotId: current.id,
              voiceId: opts.voiceId ?? current.community.voices[0]?.id ?? '',
              agreementId: choice.id
            };
            if (existingRecord >= 0) communityRecords[existingRecord] = communityRecord;
            else communityRecords.push(communityRecord);
            linked.add(current.id);
            linkMistakes.delete(current.id);
            firstTryLinks = Math.min(content.hotspots.length, firstTryLinks + 1);
            linkPhase = 'cause';
            checkpoint('stage1');
            busy = false;
            void audio.playSfx('success');
            renderStage1();
            const nextSpot = body.querySelector<HTMLElement>('.oc-spot.is-link-target');
            const nextButton = bottom.querySelector<HTMLElement>('[data-act="next"]');
            guide?.say(
              linked.size >= content.hotspots.length
                ? `${friendlySpeech(choice.response)} 네 곳의 목소리와 약속을 모두 기록했어. 이제 섬 사람들을 직접 만나러 가자.`
                : `${friendlySpeech(choice.response)} ${current.name}의 약속을 기록했어. 다음 금빛 약속 핀을 눌러 봐.`,
              {
                speaker: youthSpeaker,
                cue: linked.size >= content.hotspots.length ? nextButton : nextSpot,
                autoStart: true
              }
            );
          }
        }));
        guide?.say(`${review ? '다시 보기' : '약속 만들기'} · ${current.name}. ${prompt}`, {
          speaker: youthSpeaker,
          cue: null,
          autoStart: true,
          persist: true,
          actions: options
        });
      };

      function renderStage1(): void {
        updateSteps(topBar, 3, 0, 0);
        const total = content.hotspots.length;
        const done = investigated.size;
        const linksDone = linked.size;
        const currentLink = content.hotspots.find((h) => !linked.has(h.id));
        const teacherUnlocked = saveRepo.isTeacherUnlocked();
        const readyForPerspectives = teacherUnlocked || (done >= total && linksDone >= total);
        const showLinking = done >= total;
        body.innerHTML = `
          <div class="oc-stage">
            <div class="oc-head">
              <div class="ribbon-title">
                <span class="ribbon-main">${showLinking ? '섬의 목소리와 약속' : '섬을 조사해'}</span>
              </div>
            </div>
            <div class="oc-map-row">
              <div id="island-wrap" class="oc-island">${islandHero()}</div>
            </div>
          </div>`;

        const wrap = body.querySelector<HTMLElement>('#island-wrap');
        let firstTodoSpot: HTMLElement | null = null;
        let currentLinkSpot: HTMLElement | null = null;
        if (wrap) {
          for (const h of content.hotspots) {
            const investigatedSpot = investigated.has(h.id);
            const linkedSpot = linked.has(h.id);
            const isLinkTarget = showLinking && currentLink?.id === h.id;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `oc-spot ${!investigatedSpot ? 'is-todo' : linkedSpot ? 'is-linked' : isLinkTarget ? 'is-link-target' : 'is-waiting'}`;
            btn.style.left = `${h.x * 100}%`;
            btn.style.top = `${h.y * 100}%`;
            btn.textContent = !investigatedSpot ? '?' : linkedSpot ? '✓' : isLinkTarget ? '🤝' : '•';
            btn.setAttribute('aria-label', !investigatedSpot
              ? `${h.name} 조사하기`
              : linkedSpot
                ? `${h.name} 목소리와 약속 다시 살펴보기`
                : isLinkTarget
                  ? `${h.name} 주민 목소리와 약속 살펴보기`
                  : `${h.name} 약속 순서 기다리는 중`);
            btn.addEventListener('click', () => {
              void audio.playSfx('tap');
              if (!investigatedSpot) {
                openHotspot(h);
                return;
              }
              if (isLinkTarget) {
                openCommunityPrompt(h);
                return;
              }
              if (linkedSpot) {
                openCommunityPrompt(h, 'cause', { review: true });
                return;
              }
              guide?.say('금빛 약속 핀부터 차례로 눌러 봐.', {
                speaker: youthSpeaker,
                cue: currentLinkSpot,
                autoStart: true
              });
            });
            if (!investigatedSpot && !firstTodoSpot) firstTodoSpot = btn;
            if (isLinkTarget) currentLinkSpot = btn;
            wrap.appendChild(btn);
          }
        }

        bottom.innerHTML = `<button class="btn btn-primary btn-big" data-act="next" ${readyForPerspectives ? '' : 'disabled'}>섬 사람들 만나기</button>`;
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          if (!readyForPerspectives || busy || disposed) return;
          busy = true;
          if (teacherUnlocked && (investigated.size < total || linked.size < total)) {
            for (const hotspot of content.hotspots) {
              investigated.add(hotspot.id);
              linked.add(hotspot.id);
              if (!communityRecords.some((record) => record.hotspotId === hotspot.id)) {
                communityRecords.push({
                  hotspotId: hotspot.id,
                  voiceId: hotspot.community.voices[0]?.id ?? '',
                  agreementId: hotspot.community.agreements[0]?.id ?? ''
                });
              }
            }
            firstTryLinks = total;
          }
          stage = 2;
          checkpoint('stage2');
          renderStage2();
          busy = false;
        });

        if (readyForPerspectives) {
          guide?.say(teacherUnlocked && done < total ? '교사용 해금으로 섬 사람들을 바로 만날 수 있어.' : '조사가 끝났어. 이제 섬 사람들의 이야기를 들어 보자.', {
            cue: bottom.querySelector<HTMLElement>('[data-act="next"]'), speaker: youthSpeaker
          });
        } else if (done < total) {
          guide?.say('섬의 물음표를 눌러 문제를 조사해.', { cue: firstTodoSpot, speaker: youthSpeaker });
        } else {
          guide?.say(linkPhase === 'cause' ? '금빛 약속 핀을 눌러 누구의 목소리를 들을지 골라 봐.' : '금빛 약속 핀을 눌러 함께 지킬 약속을 골라 봐.', {
            cue: currentLinkSpot, speaker: youthSpeaker
          });
        }
      }

      /* ===== 2단계: 섬 주민과 턴제 대화 ===== */
      const conversationFor = (perspectiveId: string): ConversationRecord | undefined =>
        conversationRecords.find((record) => record.perspectiveId === perspectiveId);
      const responseFor = (perspective: Perspective, record?: ConversationRecord): ResidentResponse | undefined =>
        record ? perspective.dialogue.responses.find((response) => response.id === record.responseId) : undefined;

      const renderConversationSummary = (): void => {
        const skillCounts = new Map<DialogueSkill, number>();
        for (const record of conversationRecords) skillCounts.set(record.skill, (skillCounts.get(record.skill) ?? 0) + 1);
        body.innerHTML = `
          <div class="oc-stage">
            <div class="oc-head"><div class="ribbon-title"><span class="ribbon-main">주민의 목소리를 회의로 가져가요</span></div></div>
            <div class="oc-dialogue-summary">
              <div class="oc-lineup-panel"><img src="${RESIDENT_LINEUP_URL}" alt="청소년, 연구자, 어업 종사자, 문화 안내자가 함께 선 비티레부 공동체 회의"></div>
              <section class="panel oc-record-list" aria-label="주민 대화 기록">
                <p>정답을 고른 게 아니야. 서로 다른 방법으로 듣고 확인한 기록을 미래 회의의 근거로 쓰는 거야.</p>
                <div>${[...skillCounts].map(([skill, count]) => `<span class="oc-skill-chip">${DIALOGUE_SKILL_LABEL[skill]} ${count}번</span>`).join(' ')}</div>
                ${content.perspectives.map((perspective) => {
                  const record = conversationFor(perspective.id);
                  const response = responseFor(perspective, record);
                  return `<article class="card oc-record-item">
                    <img src="${residentImageUrl(perspective.imageId)}" alt="">
                    <div><strong>${perspective.name} · ${perspective.role}</strong>
                      <p>${friendlySpeech(response?.newInfo ?? perspective.concern)}</p>
                      ${record ? `<span class="oc-skill-chip">${DIALOGUE_SKILL_LABEL[record.skill]}</span>` : ''}
                    </div>
                  </article>`;
                }).join('')}
              </section>
            </div>
          </div>`;
        bottom.innerHTML = `
          <span class="chip">${conversationRecords.length >= content.perspectives.length ? '주민 대화 완료' : '주민과 대화해 봐'}</span>
          <div style="display:flex;gap:var(--sp-3)">
            <button class="btn btn-ghost" data-act="back">조사로</button>
            <button class="btn btn-primary btn-big" data-act="next">주민들과 미래회의 시작</button>
          </div>`;
        bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => {
          stage = 1;
          renderStage1();
        });
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          const teacherUnlocked = saveRepo.isTeacherUnlocked();
          if ((!teacherUnlocked && conversationRecords.length < content.perspectives.length) || busy) return;
          busy = true;
          if (teacherUnlocked) {
            for (const perspective of content.perspectives) {
              if (conversationFor(perspective.id)) continue;
              const response = perspective.dialogue.responses[0];
              if (response) conversationRecords.push({ perspectiveId: perspective.id, responseId: response.id, skill: response.skill });
              viewed.add(perspective.id);
            }
          }
          stage = 3;
          checkpoint('stage3');
          renderStage3();
          busy = false;
        });
        guide?.say('네 주민에게 들은 새 정보를 가져가서 미래 선택을 함께 정해 보자.', {
          cue: bottom.querySelector<HTMLElement>('[data-act="next"]'), speaker: youthSpeaker
        });
      };

      function renderStage2(focusPerspectiveId?: string): void {
        updateSteps(topBar, 3, 1, 1);
        const total = content.perspectives.length;
        if (conversationRecords.length >= total && !focusPerspectiveId) {
          renderConversationSummary();
          return;
        }
        const perspective = focusPerspectiveId
          ? content.perspectives.find((item) => item.id === focusPerspectiveId)
          : content.perspectives.find((item) => !conversationFor(item.id));
        if (!perspective) {
          renderConversationSummary();
          return;
        }
        const record = conversationFor(perspective.id);
        const chosenResponse = responseFor(perspective, record);
        const progressHtml = content.perspectives.map((item, index) => {
          const done = Boolean(conversationFor(item.id));
          const now = item.id === perspective.id;
          return `<span class="chip ${done ? 'is-done' : ''} ${now ? 'is-now' : ''}">${done ? '✓ ' : ''}${index + 1}. ${item.name}</span>`;
        }).join('');

        body.innerHTML = `
          <div class="oc-stage">
            <div class="oc-head"><div class="ribbon-title"><span class="ribbon-main">섬 주민들과 이어 말하기</span></div></div>
            <div class="oc-dialogue-progress" aria-label="주민 대화 진행">${progressHtml}</div>
            <div class="oc-dialogue-scene">
              <aside class="oc-resident-panel">
                <div class="oc-resident-portrait"><img src="${residentImageUrl(perspective.imageId)}" data-asset-id="${perspective.imageId}" alt="${perspective.name} ${perspective.role}"></div>
                <div class="oc-resident-caption"><strong>${perspective.name}</strong><span>${perspective.role} · ${perspective.concern}</span></div>
              </aside>
              <section class="oc-conversation-panel" aria-live="polite">
                <p class="chip">섬 조사에서 이어진 걱정 · ${perspective.concern}</p>
                <blockquote class="card oc-speech"><span class="speaker">${perspective.name}</span>${friendlySpeech(perspective.dialogue.opening)}</blockquote>
                ${chosenResponse ? `
                  <div class="card oc-chosen-response"><strong>내가 건넨 말</strong><p>${friendlySpeech(chosenResponse.text)}</p></div>
                  <blockquote class="card oc-follow-up"><span class="speaker">${perspective.name}의 대답</span>${friendlySpeech(chosenResponse.followUp)}</blockquote>
                  <div class="card oc-new-info"><strong>새롭게 들은 정보</strong><p>${friendlySpeech(chosenResponse.newInfo)}</p></div>
                  <div><span class="oc-skill-chip">대화 기록 · ${DIALOGUE_SKILL_LABEL[chosenResponse.skill]}</span></div>` : `
                  <p class="oc-dialogue-note">모두 좋은 마음에서 나온 말이야. 지금 더 중요하다고 생각하는 대화 방법을 골라 봐.</p>
                  <div class="oc-response-list" data-responses></div>`}
              </section>
            </div>
          </div>`;

        const responseList = body.querySelector<HTMLElement>('[data-responses]');
        if (responseList && !record) {
          for (const response of perspective.dialogue.responses) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'card oc-response-option';
            button.textContent = friendlySpeech(response.text);
            button.addEventListener('click', () => {
              if (conversationFor(perspective.id) || busy) return;
              busy = true;
              conversationRecords.push({ perspectiveId: perspective.id, responseId: response.id, skill: response.skill });
              viewed.add(perspective.id);
              checkpoint('stage2');
              void audio.playSfx('tap');
              renderStage2(perspective.id);
              guide?.say(friendlySpeech(firstSentence(response.followUp)), { speaker: perspectiveSpeaker(perspective), cue: body.querySelector<HTMLElement>('.oc-new-info') });
              busy = false;
            });
            responseList.appendChild(button);
          }
        }

        bottom.innerHTML = `
          <span class="chip">${conversationRecords.length >= total ? '주민 대화 완료' : '주민과 대화해 봐'}</span>
          <div style="display:flex;gap:var(--sp-3)">
            <button class="btn btn-ghost" data-act="back">조사로</button>
            ${record ? `<button class="btn btn-primary btn-big" data-act="next">${conversationRecords.length >= total ? '대화 기록 보기' : '다음 주민 만나기'}</button>` : ''}
            ${saveRepo.isTeacherUnlocked() && !record ? '<button class="btn btn-primary btn-big" data-act="teacher-next">미래 회의 바로 가기</button>' : ''}
          </div>`;
        bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => {
          stage = 1;
          renderStage1();
        });
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => renderStage2());
        bottom.querySelector('[data-act="teacher-next"]')?.addEventListener('click', () => {
          if (busy) return;
          busy = true;
          for (const person of content.perspectives) {
            if (conversationFor(person.id)) continue;
            const response = person.dialogue.responses[0];
            if (response) conversationRecords.push({ perspectiveId: person.id, responseId: response.id, skill: response.skill });
            viewed.add(person.id);
          }
          stage = 3;
          checkpoint('stage3');
          renderStage3();
          busy = false;
        });

        if (chosenResponse) {
          guide?.say(`'${DIALOGUE_SKILL_LABEL[chosenResponse.skill]}' 방법을 대화 기록에 남겼어.`, {
            speaker: perspectiveSpeaker(perspective), cue: bottom.querySelector<HTMLElement>('[data-act="next"]')
          });
        } else {
          guide?.say(friendlySpeech(firstSentence(perspective.dialogue.opening)), { speaker: perspectiveSpeaker(perspective), cue: responseList });
        }
      }

      /* ===== 3단계: 3턴 시뮬레이션 ===== */
      /** 게이지 한 칸 — 라벨·숫자·변화량을 위에, 막대를 아래에 (4개가 한 줄에 들어가게) */
      const metricRow = (m: { key: MetricKey; label: string; color: string }): string => {
        const value = metrics[m.key];
        const d = lastDelta ? lastDelta[m.key] : null;
        const deltaHtml =
          d === null
            ? ''
            : `<span class="g-delta" style="color:${d > 0 ? 'var(--c-success)' : d < 0 ? 'var(--c-coral)' : 'rgba(25,50,77,0.5)'}">${d > 0 ? `▲${d}` : d < 0 ? `▼${Math.abs(d)}` : '±0'}</span>`;
        const danger = turnWarned && warnKeys.has(m.key);
        return `
          <div class="oc-gauge">
            <div class="g-top">
              <span class="g-label">${m.label}</span>
              <span><span data-mval="${m.key}" class="g-num">${value}</span>${deltaHtml}</span>
            </div>
            <div class="progress-track" data-mtrack="${m.key}" style="position:relative${danger ? ';box-shadow:0 0 0 3px var(--c-danger)' : ''}">
              <div class="progress-fill" style="width:${value}%;background:${danger ? 'var(--c-danger)' : m.color}"></div>
              <div style="position:absolute;left:${COLLAPSE_LINE}%;top:-2px;bottom:-2px;width:2px;background:rgba(242,109,109,0.85)" aria-hidden="true"></div>
            </div>
          </div>`;
      };
      const metricSpeaker = (key: MetricKey) => {
        const id = key === 'eco'
          ? 'researcher_kim'
          : key === 'economy'
            ? 'fisher_rau'
            : key === 'culture'
              ? 'elder_mairi'
              : 'youth_moana';
        const person = content.perspectives.find((p) => p.id === id);
        return person ? perspectiveSpeaker(person) : youthSpeaker;
      };

      /** 게이지 숫자 굴리기 — 지난번 표시값에서 현재값까지 (첫 렌더는 생략) */
      const animateMetrics = (): void => {
        const from = shownMetrics;
        for (const m of METRICS) {
          const el = body.querySelector<HTMLElement>(`[data-mval="${m.key}"]`);
          if (el && from && from[m.key] !== metrics[m.key]) countUp(el, from[m.key], metrics[m.key]);
        }
        shownMetrics = { ...metrics };
      };

      const evidenceFor = (perspectiveId: string): { perspective: Perspective; response?: ResidentResponse } | null => {
        const perspective = content.perspectives.find((item) => item.id === perspectiveId);
        if (!perspective) return null;
        return { perspective, response: responseFor(perspective, conversationFor(perspective.id)) };
      };
      const currentEvent = (): PolicyEvent | undefined => content.sim.events[turnIndex];
      const decisionSignature = (choices: Record<string, string>, evidenceId: string): string =>
        JSON.stringify({
          choices: Object.keys(content.sim.controls).sort().map((control) => [control, choices[control] ?? '']),
          evidenceId
        });
      const signedDelta = (value: number): string => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0';

      function updateDecisionSupport(): void {
        const detail = body.querySelector<HTMLElement>('#evidence-detail');
        const kitPanel = body.querySelector<HTMLElement>('#travel-kit-panel');
        const evidence = evidenceFor(selectedEvidenceId);
        if (detail) {
          detail.textContent = evidence
            ? `${evidence.perspective.name}의 근거: ${evidence.response?.newInfo ?? evidence.perspective.concern}`
            : '주민 한 명의 기록을 골라 이번 정책의 근거로 가져와요.';
        }
        if (!kitPanel) return;

        let kitLine: string = travelKit.description;
        if (travelKit.id === 'recorder') {
          kitLine = evidence?.response?.newInfo ?? '주민 근거를 고르면 대화에서 새로 들은 정보를 다시 재생해요.';
        } else if (travelKit.id === 'route') {
          const now = currentEvent();
          const next = content.sim.events[turnIndex + 1];
          kitLine = `${now?.title ?? '현재 상황'}${next ? ` → 다음에는 “${next.title}” 상황이 와요.` : ' → 이번이 마지막 결정이에요.'}`;
        } else if (travelKit.id === 'picture') {
          kitLine = evidence
            ? `${evidence.perspective.name}의 근거는 “${CONTROL_LABELS[evidence.perspective.policySupport.control] ?? evidence.perspective.policySupport.control}”을 ${evidence.perspective.policySupport.options.join(' 또는 ')}로 정할 때 힘을 발휘해요.`
            : '근거를 고르면 관련 정책과 영향을 한 문장으로 정리해요.';
        } else if (travelKit.id === 'future') {
          const ready = Object.keys(content.sim.controls).every((control) => typeof chosen[control] === 'string');
          if (ready) {
            const preview = calculatePolicyDelta(
              content.sim.effects,
              chosen,
              currentEvent(),
              evidence?.perspective.policySupport
            );
            kitLine = `예상 변화: ${METRICS.map((metric) => `${metric.label} ${signedDelta(preview.delta[metric.key])}`).join(' · ')}`;
          } else {
            kitLine = '세 정책을 모두 고르면 실행 전 예상 변화를 보여 줘요.';
          }
        }
        kitPanel.innerHTML = `<strong>비행기 도움</strong> · ${kitLine}`;
      }

      function renderStage3(): void {
        updateSteps(topBar, 3, 2, 2);
        const label = content.sim.turnLabels[turnIndex] ?? `${turnIndex + 1}번째`;
        const event = currentEvent();
        body.innerHTML = `
          <div class="oc-stage oc-policy-stage">
            <div class="oc-head"><div class="ribbon-title"><span class="ribbon-main">섬의 미래 회의</span></div></div>
            <section class="panel oc-decision-context" aria-label="이번 결정 상황과 탐험 지원">
              <article class="card oc-event-card">
                <p class="oc-context-kicker">${label}에 생긴 일</p>
                <h3>${event?.title ?? '섬의 새 상황'}</h3>
                <p>${event?.description ?? '주민의 목소리와 네 지표를 함께 살펴요.'}</p>
              </article>
              <article class="card oc-support-card">
                <p class="oc-context-kicker">내 탐험가의 생각</p>
                <p>${explorerInsight.hint}</p>
              </article>
            </section>
            <section class="panel oc-gauges">${METRICS.map(metricRow).join('')}</section>
            <section class="panel oc-evidence-panel" aria-label="주민 근거 선택">
              <div class="oc-evidence-head"><strong>이번 결정에 가져갈 주민 근거</strong><span class="chip">근거에 맞는 정책이면 실제 효과 +</span></div>
              <div class="oc-evidence-grid" role="radiogroup" aria-label="정책 근거로 삼을 주민">
                ${content.perspectives.map((perspective) => {
                  const on = selectedEvidenceId === perspective.id;
                  return `<button type="button" class="card oc-evidence-pick${on ? ' is-selected' : ''}" role="radio" aria-checked="${on}" data-evidence="${perspective.id}">
                    ${perspective.name} · ${perspective.role}<small>${perspective.concern}</small>
                  </button>`;
                }).join('')}
              </div>
              <div class="oc-evidence-detail" id="evidence-detail"></div>
              <div class="oc-kit-panel" id="travel-kit-panel"></div>
            </section>
            <section class="panel oc-controls" id="controls"></section>
            <div id="decision-hint" role="status"></div>
            <div id="sim-fb"></div>
          </div>`;

        body.querySelectorAll<HTMLButtonElement>('[data-evidence]').forEach((button) => {
          button.addEventListener('click', () => {
            selectedEvidenceId = button.dataset.evidence ?? '';
            void audio.playSfx('tap');
            body.querySelectorAll<HTMLButtonElement>('[data-evidence]').forEach((item) => {
              const on = item.dataset.evidence === selectedEvidenceId;
              item.classList.toggle('is-selected', on);
              item.setAttribute('aria-checked', String(on));
            });
            checkpoint('stage3');
            updateDecisionSupport();
            syncRunButton();
          });
        });

        const controlsEl = body.querySelector<HTMLElement>('#controls');
        if (controlsEl) {
          for (const [ctrl, options] of Object.entries(content.sim.controls)) {
            const group = document.createElement('div');
            group.setAttribute('role', 'radiogroup');
            group.setAttribute('aria-label', CONTROL_LABELS[ctrl] ?? ctrl);
            group.innerHTML = `<p class="g-title">${CONTROL_LABELS[ctrl] ?? ctrl}</p>`;
            const row = document.createElement('div');
            row.className = 'oc-ctrl-row';
            for (const opt of options) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'card card-pick';
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
                row.querySelectorAll<HTMLElement>('button').forEach((item) => {
                  item.classList.toggle('is-selected', item.textContent === opt);
                  item.setAttribute('aria-checked', String(item.textContent === opt));
                });
                checkpoint('stage3');
                updateDecisionSupport();
                syncRunButton();
              });
              row.appendChild(btn);
            }
            group.appendChild(row);
            controlsEl.appendChild(group);
          }
        }

        bottom.innerHTML = `
          <span class="chip">결정 ${Math.min(turnIndex + 1, content.sim.turns)}번째 · ${label}</span>
          <button class="btn btn-primary btn-big" data-act="run" disabled>근거로 결정 실행하기</button>`;
        bottom.querySelector('[data-act="run"]')?.addEventListener('click', runTurn);
        updateDecisionSupport();
        syncRunButton();
        animateMetrics();

        if (turnWarned) {
          const fb = body.querySelector<HTMLElement>('#sim-fb');
          if (fb) showFeedback(fb, 'retry', '위험선 아래로 내려가는 지표가 있어요.');
          const key = [...warnKeys][0] ?? 'eco';
          guide?.say('위험 표시가 난 정책이나 근거를 바꿔 봐요.', { speaker: metricSpeaker(key), cue: controlsEl });
        } else if (lastDelta) {
          const deltaSnapshot = lastDelta;
          const fb = body.querySelector<HTMLElement>('#sim-fb');
          const lastRecord = history[history.length - 1];
          if (fb) showFeedback(
            fb,
            lastRecord?.evidenceApplied ? 'success' : 'partial',
            lastRecord?.evidenceApplied
              ? lastRecord.evidenceNote || '주민 근거가 정책에 반영됐어요.'
              : '주민 근거를 들었지만 고른 정책 조건과 맞지 않아 추가 효과는 없었어요.'
          );
          const key = METRICS.reduce(
            (lowest, metric) => deltaSnapshot[metric.key] < deltaSnapshot[lowest] ? metric.key : lowest,
            'eco' as MetricKey
          );
          guide?.say('새 상황을 읽고 지난 결정에서 정책이나 근거를 하나 이상 고쳐요.', { speaker: metricSpeaker(key), cue: controlsEl });
        } else {
          guide?.say('주민 근거 하나와 관광·보호·이동 정책을 골라요.', { speaker: youthSpeaker, cue: body.querySelector<HTMLElement>('.oc-evidence-grid') });
        }
      }

      function syncRunButton(): void {
        const btn = bottom.querySelector<HTMLButtonElement>('[data-act="run"]');
        if (!btn) return;
        const policiesReady = Object.keys(content.sim.controls).every((control) => typeof chosen[control] === 'string');
        const ready = policiesReady && Boolean(selectedEvidenceId);
        const signature = decisionSignature(chosen, selectedEvidenceId);
        const unchangedAfterWarning = turnWarned && signature === warnedChoices;
        const previous = history[history.length - 1];
        const unchangedFromPrevious = Boolean(
          previous && signature === decisionSignature(previous.choices, previous.evidencePerspectiveId ?? '')
        );
        btn.disabled = !ready || unchangedAfterWarning || unchangedFromPrevious;
        const hint = body.querySelector<HTMLElement>('#decision-hint');
        if (hint) {
          hint.textContent = !selectedEvidenceId
            ? '먼저 주민 근거 한 명을 골라요.'
            : !policiesReady
              ? '관광·보호·이동 정책을 모두 골라요.'
              : unchangedFromPrevious
                ? '상황이 달라졌어요. 지난 결정에서 정책이나 주민 근거를 하나 이상 바꿔요.'
                : unchangedAfterWarning
                  ? '위험 결과를 본 뒤 정책이나 주민 근거를 하나 이상 고쳐요.'
                  : '';
        }
        guide?.setCue(!btn.disabled ? btn : body.querySelector<HTMLElement>(!selectedEvidenceId ? '.oc-evidence-grid' : '#controls'));
      }

      function runTurn(): void {
        if (busy || finished) return;
        const ready = Object.keys(content.sim.controls).every((control) => typeof chosen[control] === 'string') && Boolean(selectedEvidenceId);
        if (!ready) return;
        const signature = decisionSignature(chosen, selectedEvidenceId);
        if (turnWarned && signature === warnedChoices) return;
        const previous = history[history.length - 1];
        if (previous && signature === decisionSignature(previous.choices, previous.evidencePerspectiveId ?? '')) return;
        busy = true;

        const evidence = evidenceFor(selectedEvidenceId);
        const policyResult = calculatePolicyDelta(
          content.sim.effects,
          chosen,
          currentEvent(),
          evidence?.perspective.policySupport
        );
        const delta: Metrics = policyResult.delta;
        const after: Metrics = { eco: 0, community: 0, economy: 0, culture: 0 };
        for (const m of METRICS) after[m.key] = clampMetric(metrics[m.key] + delta[m.key]);
        const collapsed = METRICS.filter((m) => after[m.key] < COLLAPSE_LINE);

        if (collapsed.length > 0 && !turnWarned) {
          // 붕괴 경고: 이번 턴을 되돌리고 다시 고를 기회 (전체 리셋 아님)
          turnWarned = true;
          warnedChoices = signature;
          collapseCount += 1;
          // 화면 흔들기 대신 위험 지표 게이지만 danger 색으로 강조
          warnKeys.clear();
          collapsed.forEach((m) => warnKeys.add(m.key));
          for (const m of METRICS) {
            const track = body.querySelector<HTMLElement>(`[data-mtrack="${m.key}"]`);
            if (!track) continue;
            const on = warnKeys.has(m.key);
            track.style.boxShadow = on ? '0 0 0 3px var(--c-danger)' : '';
            const fill = track.querySelector<HTMLElement>('.progress-fill');
            if (fill && on) fill.style.background = 'var(--c-danger)';
          }
          const fb = body.querySelector<HTMLElement>('#sim-fb');
          if (fb) {
            showFeedback(
              fb,
              'retry',
              `${collapsed.map((m) => m.label).join('·')} 지표가 위험선 아래로 내려가요.`,
              'oceania'
            );
          }
          guide?.say(`${collapsed.map((m) => m.label).join('·')}을 지킬 선택으로 바꿔 봐요.`, {
            speaker: metricSpeaker(collapsed[0]?.key ?? 'eco'),
            cue: body.querySelector<HTMLElement>('#controls')
          });
          checkpoint('stage3');
          showToast('선택 하나를 바꿔 다시 결정해요.', 'warn');
          syncRunButton();
          busy = false;
          return;
        }

        if ((turnWarned && signature !== warnedChoices) || previous) revisedCount += 1;
        metrics = after;
        lastDelta = delta;
        history.push({
          choices: { ...chosen },
          delta,
          after,
          eventId: currentEvent()?.id,
          evidencePerspectiveId: selectedEvidenceId,
          evidenceApplied: policyResult.evidenceApplied,
          evidenceNote: policyResult.evidenceNote
        });
        turnIndex += 1;
        turnWarned = false;
        warnedChoices = '';
        warnKeys.clear();
        chosen = {};
        selectedEvidenceId = '';
        checkpoint('stage3');
        void audio.playSfx('whoosh');

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
            compare = `첫 번째 결정 뒤와 세 번째 결정 뒤를 비교하면, <strong>${ups.join('·')}</strong> 지표는 높아지고 <strong>${downs.join('·')}</strong> 지표는 낮아졌어요.`;
          } else if (ups.length) {
            compare = `첫 번째 결정 뒤와 세 번째 결정 뒤를 비교하면, <strong>${ups.join('·')}</strong> 지표가 더 높아졌어요.`;
          } else if (downs.length) {
            compare = `첫 번째 결정 뒤와 세 번째 결정 뒤를 비교하면, <strong>${downs.join('·')}</strong> 지표가 더 낮아졌어요.`;
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
        const decisionRecords = history.map((record, index) => {
          const event = content.sim.events.find((item) => item.id === record.eventId);
          const evidence = evidenceFor(record.evidencePerspectiveId ?? '');
          const choices = Object.entries(record.choices)
            .map(([control, option]) => `${CONTROL_LABELS[control] ?? control} ${option}`)
            .join(' · ');
          return `<article class="card" style="margin-top:10px">
            <strong>${index + 1}차 · ${event?.title ?? content.sim.turnLabels[index] ?? '섬의 상황'}</strong>
            <p style="margin:5px 0">정책: ${choices}</p>
            <p style="margin:5px 0">근거: ${evidence?.perspective.name ?? '주민 기록'} — ${evidence?.response?.newInfo ?? evidence?.perspective.concern ?? '저장된 주민 근거'}</p>
            <p style="margin:5px 0;color:${record.evidenceApplied ? '#17653e' : '#815b00'}">${record.evidenceApplied ? record.evidenceNote || '근거가 정책에 반영됐어요.' : '근거와 정책 조건이 맞지 않아 추가 효과는 적용되지 않았어요.'}</p>
          </article>`;
        }).join('');

        // 표 2개와 긴 설명은 '자세히' 모달로 — 결과 화면에는 게이지와 한 줄 결론만
        body.innerHTML = `
          <div class="oc-stage">
            <div class="oc-head">
              <div class="ribbon-title">
                <span class="ribbon-main">${lastBalanced ? '균형을 지켜냈어요!' : '세 번의 결정 끝'}</span>
              </div>
            </div>
            <section class="panel oc-gauges">${METRICS.map(metricRow).join('')}</section>
            ${lastBalanced && hasAsset('reward.turtle_medal')
              ? `<img src="${assetUrl('reward.turtle_medal')}" data-asset-id="reward.turtle_medal" alt="바다 균형 메달" style="width:clamp(96px,11vw,150px);max-height:150px;object-fit:contain;align-self:center">`
              : ''}
            <div id="result-fb"></div>
          </div>`;

        const detailHtml = `
          <div style="overflow-x:auto">
            <table style="border-collapse:collapse;font-size:max(18px,var(--fs-body))">
              <thead><tr><th style="padding:4px 10px"></th>${tableHead}</tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
          ${compareRows ? `<div class="card" style="overflow-x:auto;margin-top:var(--sp-3)">
            <p style="font-weight:700;margin-bottom:6px">결정에 따른 변화 비교 <span class="chip">결정 전 50 기준</span></p>
            <p style="margin-bottom:8px">비티레부 사례를 바탕으로 선택의 방향을 비교하는 학습판이야. 숫자는 실제 미래 예측값이 아니야.</p>
            <table style="border-collapse:collapse;font-size:max(18px,var(--fs-body))">
              <thead><tr><th style="padding:4px 10px"></th><th style="padding:4px 10px">첫 결정 뒤</th><th style="padding:4px 10px">세 번째 결정 뒤</th></tr></thead>
              <tbody>${compareRows}</tbody>
            </table>
          </div>` : ''}
          ${compare ? `<p style="margin-top:var(--sp-3)">${compare}</p>` : ''}
          <div style="margin-top:var(--sp-3)"><strong>상황·주민 근거·정책 기록</strong>${decisionRecords}</div>
          <p style="margin-top:var(--sp-3)">${lastBalanced ? content.feedback.balanced : content.feedback.collapse}</p>
          <p style="margin-top:var(--sp-3);font-size:max(18px,var(--fs-body));color:rgba(25,50,77,0.82)">${content.feedback.tradeoffNote}</p>`;

        animateMetrics();
        const fb = body.querySelector<HTMLElement>('#result-fb');
        if (fb) {
          if (lastBalanced) {
            showFeedback(fb, 'success', '네 지표의 균형을 지켰어요.', 'oceania');
            const heading = body.querySelector<HTMLElement>('h2');
            if (heading) burstConfetti(heading, 24);
          } else {
            const low = METRICS.filter((m) => metrics[m.key] < warn).map((m) => m.label);
            showFeedback(
              fb,
              'partial',
              `${low.join('·')} 지표가 ${warn} 아래에서 끝났어요.`,
              'oceania'
            );
          }
        }

        bottom.innerHTML = `
          <span class="chip">결정 ${history.length}회 완료</span>
          <div style="display:flex;gap:var(--sp-3);align-items:center">
            <button class="btn btn-ghost" data-act="detail">결정 기록</button>
            <button class="btn btn-ghost" data-act="retry">다른 전략</button>
            <button class="btn btn-success btn-big" data-act="finish">미션 마치기</button>
          </div>`;
        bottom.querySelector('[data-act="detail"]')?.addEventListener('click', () => {
          presentModal({
            id: 'oceania-detail',
            title: '지표가 어떻게 움직였나요?',
            bodyHtml: detailHtml,
            actions: [{ label: '닫기', kind: 'primary', autofocus: true, onClick: (close) => close() }]
          });
        });
        bottom.querySelector('[data-act="retry"]')?.addEventListener('click', () => {
          if (busy || finished) return;
          busy = true;
          restartCount += 1;
          metrics = { eco: START_VALUE, community: START_VALUE, economy: START_VALUE, culture: START_VALUE };
          history = [];
          turnIndex = 0;
          chosen = {};
          selectedEvidenceId = '';
          lastDelta = null;
          turnWarned = false;
          warnedChoices = '';
          checkpoint('stage3');
          renderStage3();
          busy = false;
        });
        bottom.querySelector('[data-act="finish"]')?.addEventListener('click', finish);
        guide?.say(lastBalanced ? '균형을 지켰어요. 미션을 마쳐요.' : '결정 기록을 보거나 다른 전략을 골라요.', {
          cue: bottom.querySelector<HTMLElement>('[data-act="finish"]'), speaker: youthSpeaker
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
        const revisionRatio = Math.min(1, revisedCount / Math.max(1, content.sim.turns - 1));
        const growthBonus = Math.round(5 * revisionRatio);
        const result = computeScore(
          {
            evidence:
              0.55 * (investigated.size / Math.max(1, content.hotspots.length)) +
              0.45 * (linked.size / Math.max(1, content.hotspots.length)),
            perspective: conversationRecords.length / Math.max(1, content.perspectives.length),
            communication: communicationRatio,
            revision: revisionRatio
          },
          { evidence: 30, perspective: 25, communication: 25, revision: 15 },
          growthBonus
        );
        // 배움 확인(③) — 사용자가 '완료'로 결과를 확정한 직후 · 점수 모달 직전 한 곳만.
        // 시뮬 경고·결과 흐름(runTurn/showResult) 중간에는 절대 끼어들지 않는다.
        const conclude = (): void => {
          const learnRec = readLearnRecord('oceania');
          const firstDecision = history[0];
          const revisedDecision = history[history.length - 1];
          const evidence = evidenceFor(revisedDecision?.evidencePerspectiveId ?? '');
          const summarizeDecision = (record?: TurnRecord): string => record
            ? Object.entries(record.choices)
              .map(([control, option]) => `${CONTROL_LABELS[control] ?? control} ${option}`)
              .join(' · ')
            : '정책 기록 없음';
          const metricOutcome = METRICS
            .map((metric) => `${metric.label} ${metrics[metric.key]}(${signedDelta(metrics[metric.key] - START_VALUE)})`)
            .join(' · ');
          writeMissionArtifact({
            schemaVersion: 1,
            missionId: 'oceania',
            title: '섬의 미래회의 정책 기록',
            purpose: '서로 다른 주민의 목소리를 근거로 삼아 관광·생태·생계·문화의 균형을 다시 판단하기',
            initialHypothesis: learnRec.initialHypothesis ?? '',
            evidenceIds: [
              ...communityRecords.map((record) => `${record.hotspotId}:${record.voiceId}:${record.agreementId}`),
              ...conversationRecords.map((record) => `${record.perspectiveId}:${record.responseId}`),
              ...history.map((record) => record.eventId ?? '').filter(Boolean)
            ],
            evidenceLabel: `${evidence?.perspective.name ?? '섬 주민'}의 생활 근거와 세 번의 정책 결과`,
            voiceId: evidence?.perspective.id ?? '',
            voiceName: evidence?.perspective.name ?? '섬 주민',
            voiceLine: evidence?.response?.newInfo ?? evidence?.perspective.concern ?? '',
            firstDecision: summarizeDecision(firstDecision),
            observedConsequence: metricOutcome,
            revisedDecision: summarizeDecision(revisedDecision),
            rationale: revisedDecision?.evidenceApplied
              ? revisedDecision.evidenceNote ?? '주민 근거와 정책 조건을 연결해 마지막 결정을 수정했어요.'
              : '주민 근거가 정책에 반영되려면 관련 조건까지 함께 맞춰야 한다는 점을 발견했어요.',
            transferPrompt: '우리 학교나 동네에서 여러 사람의 필요가 부딪힐 때, 누구의 목소리를 먼저 듣고 어떤 결정을 고쳐 볼까요?',
            earnedAt: new Date().toISOString()
          });
          completeMissionFlow('oceania', '오세아니아', result);
          rememberCompletionModal();
        };
        if (learn) showLearningWrap('oceania', learn, conclude);
        else conclude();
      }

      /* ===== 시작 ===== */
      const renderCurrent = (): void => {
        if (stage === 1) renderStage1();
        else if (stage === 2) renderStage2();
        else if (turnIndex >= content.sim.turns) showResult();
        else renderStage3();
      };
      renderCurrent();

      const openOceaniaOverview = (): void => {
        if (saved.checkpointId || investigated.size > 0) {
          renderCurrent();
          return;
        }
        closeActiveModal = openCharacterDialogue({
          id: 'oceania-continent-overview',
          title: '오세아니아 여러 나라에서 피지로',
          name: '카일라',
          meta: '피지 비티레부섬 탐험 친구',
          assetId: 'oceania.youth',
          partner: { name: playerSpeaker.name, meta: '세계 여행 탐험가', assetId: playerSpeaker.assetId },
          dismissible: false,
          lines: [
            { role: 'partner', label: '여행 질문', text: '바다로 이어진 나라들은 문화도 같을까?' },
            { role: 'character', label: '여러 나라', text: '아니. 호주·뉴질랜드와 피지·사모아 같은 섬나라는 언어와 역사, 생활이 서로 달라.' },
            { role: 'partner', label: '오늘의 탐험', text: '오늘은 어디를 자세히 볼까?' },
            { role: 'character', label: '피지 비티레부', text: '피지에서 가장 큰 비티레부로 가자. 주민 목소리와 변화를 보고 바다를 지킬 방법을 정해 봐.' }
          ],
          onClose: renderCurrent
        });
      };

      if (learn) {
        // 시작 질문 뒤에 오세아니아 여러 나라를 대화로 알고, 실제 피지 탐험으로 좁혀 간다.
        if (!disposed) showFriendIntro('oceania', learn, openOceaniaOverview);
      } else if (stage === 1 && investigated.size === 0) {
        openOceaniaOverview();
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

export { createOceaniaPage as createPage } from './connectedRegionMission';
