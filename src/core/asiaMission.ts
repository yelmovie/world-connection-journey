import type { AsiaMissionProgress, AsiaMissionScreen } from '../types';

const SCREENS: readonly AsiaMissionScreen[] = [
  'map', 'culture', 'compare', 'signals', 'issue', 'council', 'solutions', 'proposal'
];

export interface AsiaProgressIds {
  regionIds: ReadonlySet<string>;
  exampleIds: ReadonlySet<string>;
  sceneIds: ReadonlySet<string>;
  signalIds: ReadonlySet<string>;
  issueIds: ReadonlySet<string>;
  perspectiveIds: ReadonlySet<string>;
  actionIds: ReadonlySet<string>;
}

export interface AsiaRequirements {
  minRegions: number;
  minExamples: number;
  minDiscoveries: number;
  minSignals: number;
}

export interface QualitativeMetrics {
  effect: 0 | 1 | 2;
  feasibility: 0 | 1 | 2;
  participation: 0 | 1 | 2;
  cooperation: 0 | 1 | 2;
  durability: 0 | 1 | 2;
}

export interface AsiaActionMetric {
  id: string;
  tier: 'self' | 'community' | 'institution';
  effect: number;
  feasibility: number;
  participation: number;
  cooperation: number;
  durability: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validList(value: unknown, valid: ReadonlySet<string>, max = 40): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && valid.has(id)))].slice(0, max);
}

function validTextMap(value: unknown, valid: ReadonlySet<string>): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (valid.has(key) && typeof entry === 'string') result[key] = entry.trim().slice(0, 180);
  }
  return result;
}

function text(value: unknown, max = 220): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function one(value: unknown, valid: ReadonlySet<string>): string | null {
  return typeof value === 'string' && valid.has(value) ? value : null;
}

export function createDefaultAsiaProgress(): AsiaMissionProgress {
  return {
    schemaVersion: 2,
    screen: 'map',
    activeRegionId: null,
    activeExampleId: null,
    activeSceneId: null,
    visitedRegionIds: [],
    viewedCountryExampleIds: [],
    viewedVisualSceneIds: [],
    savedDiscoveryIds: [],
    comparisonSceneIds: [],
    comparisonSimilarityId: null,
    comparisonDifferenceId: null,
    comparisonNeedsCheck: false,
    observationDrafts: {},
    curiosityQuestionDrafts: {},
    comparisonQuestionDraft: '',
    discoveredSignalIds: [],
    exploredConnectionTypes: [],
    selectedIssueId: null,
    listenedPerspectiveIds: [],
    selectedPerspectiveIds: [],
    perspectiveReasonDraft: '',
    selectedActionIds: [],
    proposalDraft: '',
    missionCompleted: false,
    stampAwarded: false,
    updatedAt: new Date().toISOString()
  };
}

/** v1 네팔 카드 저장값과 손상된 스냅샷을 안전하게 v2 권역 탐험 상태로 옮긴다. */
export function normalizeAsiaProgress(
  value: unknown,
  checkpointId: string | null,
  ids: AsiaProgressIds
): AsiaMissionProgress {
  const base = createDefaultAsiaProgress();
  const root = record(value);
  const raw = record(root?.asiaProgress) ?? root;
  if (!raw) return base;

  if (raw.schemaVersion !== 2) {
    const legacyObserved = Array.isArray(raw.observed)
      ? raw.observed.filter((id): id is string => typeof id === 'string')
      : [];
    if (legacyObserved.length > 0 || checkpointId === 'round2' || checkpointId === 'round3') {
      base.visitedRegionIds = ids.regionIds.has('south') ? ['south'] : [];
      base.viewedCountryExampleIds = ids.exampleIds.has('nepal_kathmandu') ? ['nepal_kathmandu'] : [];
      const nepalScenes = ['nepal_nature', 'nepal_daily', 'nepal_culture'].filter((id) => ids.sceneIds.has(id));
      base.viewedVisualSceneIds = nepalScenes.slice(0, Math.min(nepalScenes.length, legacyObserved.length || 1));
      base.savedDiscoveryIds = [...base.viewedVisualSceneIds];
      base.activeRegionId = base.visitedRegionIds[0] ?? null;
      base.activeExampleId = base.viewedCountryExampleIds[0] ?? null;
      base.activeSceneId = base.viewedVisualSceneIds[0] ?? null;
      base.screen = 'map';
    }
    return base;
  }

  const screen = typeof raw.screen === 'string' && SCREENS.includes(raw.screen as AsiaMissionScreen)
    ? raw.screen as AsiaMissionScreen
    : 'map';
  return {
    ...base,
    screen,
    activeRegionId: one(raw.activeRegionId, ids.regionIds),
    activeExampleId: one(raw.activeExampleId, ids.exampleIds),
    activeSceneId: one(raw.activeSceneId, ids.sceneIds),
    visitedRegionIds: validList(raw.visitedRegionIds, ids.regionIds),
    viewedCountryExampleIds: validList(raw.viewedCountryExampleIds, ids.exampleIds),
    viewedVisualSceneIds: validList(raw.viewedVisualSceneIds, ids.sceneIds),
    savedDiscoveryIds: validList(raw.savedDiscoveryIds, ids.sceneIds),
    comparisonSceneIds: validList(raw.comparisonSceneIds, ids.sceneIds, 2),
    comparisonSimilarityId: typeof raw.comparisonSimilarityId === 'string' ? raw.comparisonSimilarityId.slice(0, 80) : null,
    comparisonDifferenceId: typeof raw.comparisonDifferenceId === 'string' ? raw.comparisonDifferenceId.slice(0, 80) : null,
    comparisonNeedsCheck: raw.comparisonNeedsCheck === true,
    observationDrafts: validTextMap(raw.observationDrafts, ids.sceneIds),
    curiosityQuestionDrafts: validTextMap(raw.curiosityQuestionDrafts, ids.sceneIds),
    comparisonQuestionDraft: text(raw.comparisonQuestionDraft),
    discoveredSignalIds: validList(raw.discoveredSignalIds, ids.signalIds),
    exploredConnectionTypes: Array.isArray(raw.exploredConnectionTypes)
      ? [...new Set(raw.exploredConnectionTypes.filter((item): item is string => typeof item === 'string'))].slice(0, 12)
      : [],
    selectedIssueId: one(raw.selectedIssueId, ids.issueIds),
    listenedPerspectiveIds: validList(raw.listenedPerspectiveIds, ids.perspectiveIds),
    selectedPerspectiveIds: validList(raw.selectedPerspectiveIds, ids.perspectiveIds, 2),
    perspectiveReasonDraft: text(raw.perspectiveReasonDraft),
    selectedActionIds: validList(raw.selectedActionIds, ids.actionIds),
    proposalDraft: text(raw.proposalDraft, 260),
    missionCompleted: raw.missionCompleted === true,
    stampAwarded: raw.stampAwarded === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt
  };
}

export function explorationRequirementsMet(progress: AsiaMissionProgress, requirements: AsiaRequirements): boolean {
  return progress.visitedRegionIds.length >= requirements.minRegions
    && progress.viewedCountryExampleIds.length >= requirements.minExamples
    && progress.savedDiscoveryIds.length >= requirements.minDiscoveries;
}

export function allAsiaRequirementsMet(progress: AsiaMissionProgress, requirements: AsiaRequirements): boolean {
  return explorationRequirementsMet(progress, requirements)
    && progress.discoveredSignalIds.length >= requirements.minSignals;
}

function level(value: number, max: number): 0 | 1 | 2 {
  if (max <= 0 || value <= 0) return 0;
  if (value >= max * 0.66) return 2;
  return 1;
}

export function calculateQualitativeMetrics(selectedIds: string[], actions: AsiaActionMetric[]): QualitativeMetrics {
  const chosen = actions.filter((action) => selectedIds.includes(action.id));
  const total = (key: keyof Omit<AsiaActionMetric, 'id' | 'tier'>) => chosen.reduce((sum, action) => sum + action[key], 0);
  const tiers = new Set(chosen.map((action) => action.tier)).size;
  const max = Math.max(1, chosen.length * 3);
  return {
    effect: level(total('effect'), max),
    feasibility: level(total('feasibility'), max),
    participation: level(total('participation'), max),
    cooperation: level(total('cooperation'), max),
    durability: level(total('durability') + tiers, max + 3)
  };
}
