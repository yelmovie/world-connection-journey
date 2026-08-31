/**
 * 지구회의(최종 단계) 순수 로직 — 콘텐츠 스키마, 진행 상태 검증, 해결안 학습용 모형, 공동약속 조립.
 * DOM 없음. 화면은 pages/earthCouncilScenes.ts 가 맡는다.
 */

export type ConnectionType = 'ocean' | 'air' | 'climate' | 'ecosystem' | 'resource';
export type ActionTierId = 'self' | 'community' | 'institution';
export type EarthScene = 'signals' | 'connect' | 'issue' | 'roundtable' | 'actions' | 'pledge' | 'done';

export interface EarthFriend { id: string; name: string; country: string; continent: string; imageId: string; mapX: number; mapY: number }
export interface EarthLens { id: ConnectionType; name: string; hint: string }
export interface SignalHotspot { id: string; x: number; y: number; label: string }
export interface EnvironmentalSignal {
  id: string;
  friendId: string;
  countryId: string;
  issueId: string;
  titleKo: string;
  observationPromptKo: string;
  narrationKo: string;
  reactionKo: string;
  imageAssetId: string;
  hotspots: SignalHotspot[];
  connectionTypes: ConnectionType[];
  scopeNoteKo: string;
  sourceTitle?: string;
  sourceUrl?: string;
  lastVerifiedAt?: string;
  needsReview: boolean;
}
export interface EarthIssue { id: string; title: string; question: string; heroSignalId: string; connectionLine: string }
export interface ConnectionReason { id: string; text: string; fits: boolean }
export interface Perspective { id: string; key: string; label: string; line: string; worry: string }
export interface RoundtableSeat { friendId: string; perspectiveId: string }
export interface EarthAction {
  id: string; tier: ActionTierId; icon: string; name: string; detail: string;
  effect: number; feasibility: number; participation: number; cooperation: number; issues: string[];
}
export interface EarthTitles {
  mission: string; council: string; councilSub: string; arrival: string; panelTitle: string; panelDesc: string;
  panelButton: string; scopeNote: string; connectionNote: string; connectionFeedback: string; simulationNote: string; coreExpression: string;
}
export interface EarthContent {
  titles: EarthTitles;
  friends: EarthFriend[];
  lenses: EarthLens[];
  signals: EnvironmentalSignal[];
  issues: EarthIssue[];
  connectionReasons: Record<ConnectionType, ConnectionReason[]>;
  perspectives: Perspective[];
  roundtable: Record<string, RoundtableSeat[]>;
  actionTiers: Array<{ id: ActionTierId; name: string }>;
  actions: EarthAction[];
  simulationFeedback: Record<string, string>;
  pledge: { frame: string[]; helperQuestions: string[]; vagueWords: string[] };
}

export interface GlobalEnvironmentProgress {
  scene: EarthScene;
  signalViewedIds: string[];
  signalObservedIds: string[];
  exploredConnectionTypes: ConnectionType[];
  selectedIssueId: string | null;
  listenedPerspectiveIds: string[];
  selectedPerspectiveIds: string[];
  perspectiveReason: string;
  selectedActionIds: string[];
  simulationAttempts: number;
  jointPledgeDraft: string;
  personalActionDraft: string;
  missionCompleted: boolean;
  stampAwarded: boolean;
}

export const CONNECTION_TYPES: readonly ConnectionType[] = ['ocean', 'air', 'climate', 'ecosystem', 'resource'];
const SCENES: readonly EarthScene[] = ['signals', 'connect', 'issue', 'roundtable', 'actions', 'pledge', 'done'];
export const MIN_SIGNALS_TO_CONNECT = 4;
export const MIN_CONNECTIONS = 2;
export const MIN_PERSPECTIVES_LISTENED = 3;

export function defaultEarthProgress(): GlobalEnvironmentProgress {
  return {
    scene: 'signals',
    signalViewedIds: [],
    signalObservedIds: [],
    exploredConnectionTypes: [],
    selectedIssueId: null,
    listenedPerspectiveIds: [],
    selectedPerspectiveIds: [],
    perspectiveReason: '',
    selectedActionIds: [],
    simulationAttempts: 0,
    jointPledgeDraft: '',
    personalActionDraft: '',
    missionCompleted: false,
    stampAwarded: false
  };
}

const uniqStrings = (value: unknown, allowed?: ReadonlySet<string>): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || out.includes(item)) continue;
    if (allowed && !allowed.has(item)) continue;
    out.push(item);
  }
  return out;
};
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

/** 손상·조작된 저장값을 콘텐츠 ID 기준으로 정리한다. 알 수 없는 ID는 버린다. */
export function validateEarthProgress(raw: unknown, content?: EarthContent): GlobalEnvironmentProgress {
  const base = defaultEarthProgress();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;
  const signalIds = content ? new Set(content.signals.map((s) => s.id)) : undefined;
  const perspectiveIds = content ? new Set(content.perspectives.map((p) => p.id)) : undefined;
  const actionIds = content ? new Set(content.actions.map((a) => a.id)) : undefined;
  const issueIds = content ? new Set(content.issues.map((i) => i.id)) : undefined;

  base.signalViewedIds = uniqStrings(r.signalViewedIds, signalIds);
  base.signalObservedIds = uniqStrings(r.signalObservedIds, signalIds).filter((id) => base.signalViewedIds.includes(id) || !content);
  base.exploredConnectionTypes = uniqStrings(r.exploredConnectionTypes, new Set(CONNECTION_TYPES)) as ConnectionType[];
  const issue = typeof r.selectedIssueId === 'string' ? r.selectedIssueId : null;
  base.selectedIssueId = issue && (!issueIds || issueIds.has(issue)) ? issue : null;
  base.listenedPerspectiveIds = uniqStrings(r.listenedPerspectiveIds, perspectiveIds);
  base.selectedPerspectiveIds = uniqStrings(r.selectedPerspectiveIds, perspectiveIds).slice(0, 2);
  base.perspectiveReason = text(r.perspectiveReason, 120);
  base.selectedActionIds = uniqStrings(r.selectedActionIds, actionIds);
  base.simulationAttempts = typeof r.simulationAttempts === 'number' && Number.isFinite(r.simulationAttempts)
    ? Math.max(0, Math.floor(r.simulationAttempts)) : 0;
  base.jointPledgeDraft = text(r.jointPledgeDraft, 600);
  base.personalActionDraft = text(r.personalActionDraft, 120);
  base.missionCompleted = r.missionCompleted === true;
  base.stampAwarded = r.stampAwarded === true;

  // 장면은 실제 진행 근거가 있는 곳까지만 인정한다 (완료 화면 직접 접근 방지).
  const wanted = typeof r.scene === 'string' && SCENES.includes(r.scene as EarthScene) ? (r.scene as EarthScene) : 'signals';
  base.scene = SCENES[Math.min(SCENES.indexOf(wanted), SCENES.indexOf(furthestScene(base)))] ?? 'signals';
  return base;
}

/** 진행 근거로 열 수 있는 가장 먼 장면. */
export function furthestScene(p: GlobalEnvironmentProgress): EarthScene {
  if (p.missionCompleted) return 'done';
  if (p.selectedActionIds.length > 0 && p.simulationAttempts > 0 && p.selectedPerspectiveIds.length === 2) return 'pledge';
  if (p.selectedPerspectiveIds.length === 2 && p.selectedIssueId) return 'actions';
  if (p.selectedIssueId) return 'roundtable';
  if (p.exploredConnectionTypes.length >= MIN_CONNECTIONS) return 'issue';
  if (p.signalObservedIds.length >= MIN_SIGNALS_TO_CONNECT) return 'connect';
  return 'signals';
}

export function canOpenConnect(p: GlobalEnvironmentProgress): boolean {
  return p.signalObservedIds.length >= MIN_SIGNALS_TO_CONNECT;
}
export function canOpenCouncil(p: GlobalEnvironmentProgress): boolean {
  return canOpenConnect(p) && p.exploredConnectionTypes.length >= MIN_CONNECTIONS;
}

/** 렌즈로 이어지는 신호 목록 (선택 신호는 항상 포함). */
export function signalsForLens(content: EarthContent, lens: ConnectionType, anchorId?: string): EnvironmentalSignal[] {
  return content.signals.filter((s) => s.connectionTypes.includes(lens) || s.id === anchorId);
}

/** 문제별 관련 친구 수 — 신호 issueId 기준 + 원탁 참석자. */
export function friendCountForIssue(content: EarthContent, issueId: string): number {
  const ids = new Set<string>();
  content.signals.filter((s) => s.issueId === issueId).forEach((s) => ids.add(s.friendId));
  (content.roundtable[issueId] ?? []).forEach((seat) => ids.add(seat.friendId));
  return ids.size;
}

export type Level = 1 | 2 | 3;
export interface SimulationResult {
  effect: Level; feasibility: Level; participation: Level; cooperation: Level;
  feedback: string[];
  missingTiers: ActionTierId[];
}

const toLevel = (avg: number): Level => (avg >= 2.5 ? 3 : avg >= 1.6 ? 2 : 1);
const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * 학습용 비교 모형. 수치 예측이 아니라 "장단점 비교"만 낸다.
 * - 효과는 가장 강한 행동을 따르되 문제와 무관한 행동은 세지 않는다.
 * - 참여·실천 가능성은 평균, 협력은 최댓값.
 */
export function simulate(content: EarthContent, issueId: string, actionIds: string[]): SimulationResult {
  const picked = content.actions.filter((a) => actionIds.includes(a.id));
  const relevant = picked.filter((a) => a.issues.includes(issueId));
  const tiers = new Set(picked.map((a) => a.tier));
  const missingTiers = content.actionTiers.map((t) => t.id).filter((t) => !tiers.has(t));
  const effect = toLevel(relevant.length ? Math.max(...relevant.map((a) => a.effect)) - (tiers.size < 3 ? 0.6 : 0) : 0);
  const feasibility = toLevel(avg(picked.map((a) => a.feasibility)));
  const participation = toLevel(avg(picked.map((a) => a.participation)));
  const cooperation = toLevel(picked.length ? Math.max(...picked.map((a) => a.cooperation)) : 0);
  const fb = (k: string): string => content.simulationFeedback[k] ?? '';
  const feedback: string[] = [];
  if (picked.length > relevant.length) feedback.push(fb('offIssue'));
  if (tiers.size === 1 && tiers.has('self')) feedback.push(fb('onlySelf'));
  if (effect === 3 && participation === 1) feedback.push(fb('lowParticipation'));
  if (cooperation === 1 && relevant.length) feedback.push(fb('lowCooperation'));
  if (feasibility === 1) feedback.push(fb('lowFeasibility'));
  if (cooperation === 3 && relevant.length) feedback.push(fb('highCooperation'));
  if (participation === 3 && relevant.length) feedback.push(fb('highParticipation'));
  if (feedback.length === 0 && missingTiers.length === 0) feedback.push(fb('balanced'));
  if (feedback.length === 0) feedback.push(fb('onlySelf'));
  return { effect, feasibility, participation, cooperation, feedback, missingTiers };
}

/** 세 수준 모두 고르면 실험할 수 있다. */
export function canRunSimulation(content: EarthContent, actionIds: string[]): boolean {
  const tiers = new Set(content.actions.filter((a) => actionIds.includes(a.id)).map((a) => a.tier));
  return content.actionTiers.every((t) => tiers.has(t.id));
}

/** 학생 실천 문장 검사: 짧거나 뭉뚱그린 표현이면 도움 질문을 돌려준다. */
export function personalActionIssue(content: EarthContent, draft: string): string | null {
  const t = draft.trim();
  if (t.length < 8) return '언제·어디서·무엇을 할지 조금 더 구체적으로 써 봐요.';
  if (content.pledge.vagueWords.some((w) => t.includes(w)) && t.length < 20) {
    return `"${t}"만으로는 무엇을 할지 알기 어려워요. ${content.pledge.helperQuestions[0]}`;
  }
  return null;
}

export function buildPledge(content: EarthContent, p: GlobalEnvironmentProgress): string[] {
  const issue = content.issues.find((i) => i.id === p.selectedIssueId);
  const pick = (tier: ActionTierId) => content.actions.find((a) => a.tier === tier && p.selectedActionIds.includes(a.id))?.name ?? '함께 정한 방법';
  const fill: Record<string, string> = {
    issue: issue?.title ?? '함께 고른 환경문제',
    connection: issue?.connectionLine ?? '바다와 공기',
    self: pick('self'),
    community: pick('community'),
    institution: pick('institution'),
    personal: p.personalActionDraft.trim() || '내가 정한 실천'
  };
  return content.pledge.frame.map((line) => line.replace(/\{(\w+)\}/g, (_, k: string) => fill[k] ?? ''));
}
