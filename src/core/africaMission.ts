import type { AfricaMissionProgress } from '../types';

export const AFRICA_REGION_IDS = ['north', 'west', 'east', 'central', 'south'] as const;

export function createDefaultAfricaProgress(): AfricaMissionProgress {
  return {
    schemaVersion: 2,
    screen: 'intro',
    activeRegionId: null,
    visitedRegions: [],
    visitedCountries: [],
    discoveredGeographyClues: [],
    discoveredCultureExamples: [],
    instrumentLab: { completed: false, exploredInstrumentIds: [], createdRhythm: Array(8).fill(0) },
    environmentInvestigation: { selectedIssueId: null, inspectedSignalIds: [] },
    solutionLab: { completed: false, selectedActions: [], finalMetrics: null },
    jointProposal: { completed: false, selectedIdeas: [], reason: '' },
    passportStampAwarded: false,
    updatedAt: new Date().toISOString()
  };
}

const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
  : [];
const rhythm = (value: unknown): number[] => Array.from({ length: 8 }, (_, index) => {
  const cell = Array.isArray(value) ? value[index] : 0;
  return cell === 1 || cell === 2 ? cell : 0;
});

export function normalizeAfricaProgress(raw: unknown, legacy?: Record<string, unknown>): AfricaMissionProgress {
  const base = createDefaultAfricaProgress();
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const instrument = data.instrumentLab && typeof data.instrumentLab === 'object'
    ? data.instrumentLab as Record<string, unknown> : {};
  const environment = data.environmentInvestigation && typeof data.environmentInvestigation === 'object'
    ? data.environmentInvestigation as Record<string, unknown> : {};
  const solution = data.solutionLab && typeof data.solutionLab === 'object'
    ? data.solutionLab as Record<string, unknown> : {};
  const proposal = data.jointProposal && typeof data.jointProposal === 'object'
    ? data.jointProposal as Record<string, unknown> : {};
  const metrics = solution.finalMetrics && typeof solution.finalMetrics === 'object'
    ? solution.finalMetrics as Record<string, unknown> : null;
  const oldState = legacy?.state && typeof legacy.state === 'object' ? legacy.state as Record<string, unknown> : {};
  const legacyInstruments = strings(oldState.viewed);
  const legacyRhythm = rhythm(oldState.r3Draft);
  const validScreen = new Set(['intro','map','region','instrument','rhythm','signal','environment','impact','council','solution','proposal']);
  const n = (key: string): number => Math.max(0, Math.min(100, Number(metrics?.[key] ?? 0)));
  return {
    ...base,
    screen: validScreen.has(String(data.screen)) ? data.screen as AfricaMissionProgress['screen'] : base.screen,
    activeRegionId: typeof data.activeRegionId === 'string' ? data.activeRegionId : null,
    visitedRegions: strings(data.visitedRegions).filter((id) => AFRICA_REGION_IDS.includes(id as typeof AFRICA_REGION_IDS[number])),
    visitedCountries: strings(data.visitedCountries),
    discoveredGeographyClues: strings(data.discoveredGeographyClues),
    discoveredCultureExamples: strings(data.discoveredCultureExamples),
    instrumentLab: {
      completed: instrument.completed === true || Number((oldState.r3 as Record<string, unknown> | undefined)?.final ?? 0) >= 1,
      exploredInstrumentIds: strings(instrument.exploredInstrumentIds).length
        ? strings(instrument.exploredInstrumentIds) : legacyInstruments,
      createdRhythm: rhythm(instrument.createdRhythm).some(Boolean)
        ? rhythm(instrument.createdRhythm) : legacyRhythm
    },
    environmentInvestigation: {
      selectedIssueId: typeof environment.selectedIssueId === 'string' ? environment.selectedIssueId : null,
      inspectedSignalIds: strings(environment.inspectedSignalIds)
    },
    solutionLab: {
      completed: solution.completed === true,
      selectedActions: strings(solution.selectedActions),
      finalMetrics: metrics ? {
        environment: n('environment'), communitySafety: n('communitySafety'), cultureAndHome: n('cultureAndHome'),
        sustainability: n('sustainability'), feasibility: n('feasibility'), fairness: n('fairness')
      } : null
    },
    jointProposal: {
      completed: proposal.completed === true,
      selectedIdeas: strings(proposal.selectedIdeas),
      reason: typeof proposal.reason === 'string' ? proposal.reason.slice(0, 160) : ''
    },
    passportStampAwarded: data.passportStampAwarded === true,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : base.updatedAt
  };
}

export function calculateAfricaMetrics(actionEffects: Array<Partial<NonNullable<AfricaMissionProgress['solutionLab']['finalMetrics']>>>): NonNullable<AfricaMissionProgress['solutionLab']['finalMetrics']> {
  const keys = ['environment','communitySafety','cultureAndHome','sustainability','feasibility','fairness'] as const;
  const base = 35;
  return Object.fromEntries(keys.map((key) => [key, Math.max(0, Math.min(100,
    base + actionEffects.reduce((sum, effect) => sum + Number(effect[key] ?? 0), 0)
  ))])) as NonNullable<AfricaMissionProgress['solutionLab']['finalMetrics']>;
}

export function canCompleteAfrica(progress: AfricaMissionProgress): boolean {
  return AFRICA_REGION_IDS.every((id) => progress.visitedRegions.includes(id))
    && progress.instrumentLab.completed
    && progress.environmentInvestigation.inspectedSignalIds.length >= 3
    && progress.solutionLab.completed
    && progress.jointProposal.completed;
}
