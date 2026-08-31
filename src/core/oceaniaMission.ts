/**
 * @deprecated — 실제 아시아·오세아니아 로직은 src/pages/connectedRegionMission.ts.
 * 이 파일은 어디서도 import되지 않는 사용되지 않는 코드다(구버전 저장 데이터 asiaProgress/oceaniaProgress 형식의 참고용으로만 보존).
 */
import type { OceaniaMissionProgress, OceaniaMissionScreen } from '../types';

const SCREENS: readonly OceaniaMissionScreen[] = [
  'map', 'culture', 'compare', 'signals', 'issue', 'council', 'solutions', 'proposal'
];

export interface OceaniaProgressIds {
  zoneIds: ReadonlySet<string>;
  exampleIds: ReadonlySet<string>;
  sceneIds: ReadonlySet<string>;
  signalIds: ReadonlySet<string>;
  issueIds: ReadonlySet<string>;
  perspectiveIds: ReadonlySet<string>;
  actionIds: ReadonlySet<string>;
}

export interface OceaniaRequirements {
  minZones: number;
  minExamples: number;
  minDiscoveries: number;
  minSignals: number;
}

export interface OceaniaActionMetric {
  id: string;
  tier: 'self' | 'community' | 'institution' | 'international';
  ecosystem: number;
  safety: number;
  livelihood: number;
  culture: number;
  feasibility: number;
  fairness: number;
}

export interface OceaniaQualitativeMetrics {
  ecosystem: 0 | 1 | 2;
  safety: 0 | 1 | 2;
  livelihood: 0 | 1 | 2;
  culture: 0 | 1 | 2;
  feasibility: 0 | 1 | 2;
  fairness: 0 | 1 | 2;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validList(value: unknown, valid: ReadonlySet<string>, max = 48): string[] {
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

function text(value: unknown, max = 260): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function one(value: unknown, valid: ReadonlySet<string>): string | null {
  return typeof value === 'string' && valid.has(value) ? value : null;
}

export function createDefaultOceaniaProgress(): OceaniaMissionProgress {
  return {
    schemaVersion: 2,
    screen: 'map',
    activeZoneId: null,
    activeCountryExampleId: null,
    activeVisualSceneId: null,
    visitedZoneIds: [],
    viewedCountryExampleIds: [],
    viewedVisualSceneIds: [],
    savedDiscoveryIds: [],
    comparisonSceneIds: [],
    comparisonNatureId: null,
    comparisonCultureId: null,
    comparisonNeedsCheck: false,
    observationDrafts: {},
    curiosityQuestionDrafts: {},
    comparisonQuestionDraft: '',
    discoveredSignalIds: [],
    exploredOceanConnectionTypes: [],
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

/** 예전 비티레부 핫스폿·정책 저장을 피지 탐험 기록으로만 축소해 v2 상태로 옮긴다. */
export function normalizeOceaniaProgress(
  value: unknown,
  checkpointId: string | null,
  ids: OceaniaProgressIds
): OceaniaMissionProgress {
  const base = createDefaultOceaniaProgress();
  const root = record(value);
  const raw = record(root?.oceaniaProgress) ?? root;
  if (!raw) return base;

  if (raw.schemaVersion !== 2) {
    const investigated = Array.isArray(raw.investigated)
      ? raw.investigated.filter((id): id is string => typeof id === 'string')
      : [];
    if (investigated.length > 0 || checkpointId === 'stage2' || checkpointId === 'stage3') {
      base.visitedZoneIds = ids.zoneIds.has('melanesia') ? ['melanesia'] : [];
      base.viewedCountryExampleIds = ids.exampleIds.has('fiji_viti_levu') ? ['fiji_viti_levu'] : [];
      const fijiScenes = ['fiji_nature', 'fiji_daily', 'fiji_culture'].filter((id) => ids.sceneIds.has(id));
      base.viewedVisualSceneIds = fijiScenes.slice(0, Math.min(fijiScenes.length, Math.max(1, investigated.length)));
      base.savedDiscoveryIds = [...base.viewedVisualSceneIds];
      base.activeZoneId = base.visitedZoneIds[0] ?? null;
      base.activeCountryExampleId = base.viewedCountryExampleIds[0] ?? null;
      base.activeVisualSceneId = base.viewedVisualSceneIds[0] ?? null;
    }
    return base;
  }

  const screen = typeof raw.screen === 'string' && SCREENS.includes(raw.screen as OceaniaMissionScreen)
    ? raw.screen as OceaniaMissionScreen
    : 'map';
  return {
    ...base,
    screen,
    activeZoneId: one(raw.activeZoneId, ids.zoneIds),
    activeCountryExampleId: one(raw.activeCountryExampleId, ids.exampleIds),
    activeVisualSceneId: one(raw.activeVisualSceneId, ids.sceneIds),
    visitedZoneIds: validList(raw.visitedZoneIds, ids.zoneIds),
    viewedCountryExampleIds: validList(raw.viewedCountryExampleIds, ids.exampleIds),
    viewedVisualSceneIds: validList(raw.viewedVisualSceneIds, ids.sceneIds),
    savedDiscoveryIds: validList(raw.savedDiscoveryIds, ids.sceneIds),
    comparisonSceneIds: validList(raw.comparisonSceneIds, ids.sceneIds, 2),
    comparisonNatureId: typeof raw.comparisonNatureId === 'string' ? raw.comparisonNatureId.slice(0, 80) : null,
    comparisonCultureId: typeof raw.comparisonCultureId === 'string' ? raw.comparisonCultureId.slice(0, 80) : null,
    comparisonNeedsCheck: raw.comparisonNeedsCheck === true,
    observationDrafts: validTextMap(raw.observationDrafts, ids.sceneIds),
    curiosityQuestionDrafts: validTextMap(raw.curiosityQuestionDrafts, ids.sceneIds),
    comparisonQuestionDraft: text(raw.comparisonQuestionDraft),
    discoveredSignalIds: validList(raw.discoveredSignalIds, ids.signalIds),
    exploredOceanConnectionTypes: Array.isArray(raw.exploredOceanConnectionTypes)
      ? [...new Set(raw.exploredOceanConnectionTypes.filter((item): item is string => typeof item === 'string'))].slice(0, 12)
      : [],
    selectedIssueId: one(raw.selectedIssueId, ids.issueIds),
    listenedPerspectiveIds: validList(raw.listenedPerspectiveIds, ids.perspectiveIds),
    selectedPerspectiveIds: validList(raw.selectedPerspectiveIds, ids.perspectiveIds, 2),
    perspectiveReasonDraft: text(raw.perspectiveReasonDraft),
    selectedActionIds: validList(raw.selectedActionIds, ids.actionIds),
    proposalDraft: text(raw.proposalDraft, 320),
    missionCompleted: raw.missionCompleted === true,
    stampAwarded: raw.stampAwarded === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt
  };
}

export function oceaniaExplorationReady(progress: OceaniaMissionProgress, requirements: OceaniaRequirements): boolean {
  return progress.visitedZoneIds.length >= requirements.minZones
    && progress.viewedCountryExampleIds.length >= requirements.minExamples
    && progress.savedDiscoveryIds.length >= requirements.minDiscoveries;
}

export function allOceaniaRequirementsMet(progress: OceaniaMissionProgress, requirements: OceaniaRequirements): boolean {
  return oceaniaExplorationReady(progress, requirements)
    && progress.discoveredSignalIds.length >= requirements.minSignals;
}

function level(value: number, max: number): 0 | 1 | 2 {
  if (max <= 0 || value <= 0) return 0;
  return value >= max * 0.66 ? 2 : 1;
}

export function calculateOceaniaMetrics(
  selectedIds: string[],
  actions: OceaniaActionMetric[]
): OceaniaQualitativeMetrics {
  const chosen = actions.filter((action) => selectedIds.includes(action.id));
  const total = (key: keyof Omit<OceaniaActionMetric, 'id' | 'tier'>) => chosen.reduce((sum, action) => sum + action[key], 0);
  const tierCount = new Set(chosen.map((action) => action.tier)).size;
  const max = Math.max(1, chosen.length * 3);
  return {
    ecosystem: level(total('ecosystem'), max),
    safety: level(total('safety'), max),
    livelihood: level(total('livelihood'), max),
    culture: level(total('culture'), max),
    feasibility: level(total('feasibility'), max),
    fairness: level(total('fairness') + tierCount, max + 4)
  };
}
