import type { EuropeMissionProgress, EuropeMissionScreen } from '../types';

export interface EuropeCountryShape {
  id: string;
  visualIds: string[];
}

export interface EuropeRequirements {
  minCountries: number;
  minVisualsPerVisitedCountry: number;
  minSavedVisuals: number;
  minSavedCountries: number;
}

export interface EuropeExplorationStatus {
  visitedCount: number;
  readyCountryCount: number;
  incompleteVisitedCountryIds: string[];
  savedVisualCount: number;
  savedCountryCount: number;
  complete: boolean;
}

const SCREENS: readonly EuropeMissionScreen[] = ['map', 'window', 'gallery', 'reason', 'question', 'postcard'];

export function defaultEuropeProgress(now = new Date().toISOString()): EuropeMissionProgress {
  return {
    schemaVersion: 2,
    screen: 'map',
    activeCountryId: null,
    activeVisualId: null,
    visitedCountryIds: [],
    viewedVisualIds: [],
    savedVisualIds: [],
    selectedCountryId: null,
    selectedEvidenceId: null,
    reasonPromptId: null,
    reasonDraft: '',
    questionStarterId: null,
    questionDraft: '',
    postcardCompleted: false,
    stampAwarded: false,
    updatedAt: now
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uniqueAllowed(value: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && allowed.has(id)))];
}

function allowedId(value: unknown, allowed: ReadonlySet<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/**
 * v1 프라하 경로 저장값과 손상된 배열을 안전하게 무시하고 v2 진행 상태로 복원한다.
 * 기존 저장에 europeProgress가 없으면 새 탐색의 첫 화면에서 시작한다.
 */
export function normalizeEuropeProgress(
  rawMissionData: unknown,
  countries: readonly EuropeCountryShape[],
  now = new Date().toISOString()
): EuropeMissionProgress {
  const data = object(rawMissionData);
  const raw = object(data?.europeProgress) ?? (data?.schemaVersion === 2 ? data : null);
  const base = defaultEuropeProgress(now);
  if (!raw) return base;

  const countryIds = new Set(countries.map((country) => country.id));
  const visualIds = new Set(countries.flatMap((country) => country.visualIds));
  const screen = typeof raw.screen === 'string' && SCREENS.includes(raw.screen as EuropeMissionScreen)
    ? raw.screen as EuropeMissionScreen
    : 'map';
  const progress: EuropeMissionProgress = {
    ...base,
    screen,
    activeCountryId: allowedId(raw.activeCountryId, countryIds),
    activeVisualId: allowedId(raw.activeVisualId, visualIds),
    visitedCountryIds: uniqueAllowed(raw.visitedCountryIds, countryIds),
    viewedVisualIds: uniqueAllowed(raw.viewedVisualIds, visualIds),
    savedVisualIds: uniqueAllowed(raw.savedVisualIds, visualIds),
    selectedCountryId: allowedId(raw.selectedCountryId, countryIds),
    selectedEvidenceId: allowedId(raw.selectedEvidenceId, visualIds),
    reasonPromptId: typeof raw.reasonPromptId === 'string' ? raw.reasonPromptId.slice(0, 60) : null,
    reasonDraft: text(raw.reasonDraft, 240),
    questionStarterId: typeof raw.questionStarterId === 'string' ? raw.questionStarterId.slice(0, 60) : null,
    questionDraft: text(raw.questionDraft, 180),
    postcardCompleted: raw.postcardCompleted === true,
    stampAwarded: raw.stampAwarded === true,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  };

  const countryByVisual = new Map(countries.flatMap((country) => country.visualIds.map((id) => [id, country.id] as const)));
  if (progress.activeVisualId && countryByVisual.get(progress.activeVisualId) !== progress.activeCountryId) {
    progress.activeVisualId = null;
  }
  if (progress.selectedEvidenceId && !progress.savedVisualIds.includes(progress.selectedEvidenceId)) {
    progress.selectedEvidenceId = null;
  }
  if (progress.selectedEvidenceId && countryByVisual.get(progress.selectedEvidenceId) !== progress.selectedCountryId) {
    progress.selectedEvidenceId = null;
  }
  return progress;
}

export function europeExplorationStatus(
  progress: EuropeMissionProgress,
  countries: readonly EuropeCountryShape[],
  requirements: EuropeRequirements
): EuropeExplorationStatus {
  const countryByVisual = new Map(countries.flatMap((country) => country.visualIds.map((id) => [id, country.id] as const)));
  const viewedByCountry = new Map<string, number>();
  for (const id of progress.viewedVisualIds) {
    const countryId = countryByVisual.get(id);
    if (countryId) viewedByCountry.set(countryId, (viewedByCountry.get(countryId) ?? 0) + 1);
  }
  const incompleteVisitedCountryIds = progress.visitedCountryIds.filter(
    (id) => (viewedByCountry.get(id) ?? 0) < requirements.minVisualsPerVisitedCountry
  );
  const readyCountryCount = progress.visitedCountryIds.filter(
    (id) => (viewedByCountry.get(id) ?? 0) >= requirements.minVisualsPerVisitedCountry
  ).length;
  const savedCountries = new Set(progress.savedVisualIds.map((id) => countryByVisual.get(id)).filter(Boolean));
  const complete = progress.visitedCountryIds.length >= requirements.minCountries
    && incompleteVisitedCountryIds.length === 0
    && progress.savedVisualIds.length >= requirements.minSavedVisuals
    && savedCountries.size >= requirements.minSavedCountries;
  return {
    visitedCount: progress.visitedCountryIds.length,
    readyCountryCount,
    incompleteVisitedCountryIds,
    savedVisualCount: progress.savedVisualIds.length,
    savedCountryCount: savedCountries.size,
    complete
  };
}

export function hasStudentReason(value: string): boolean {
  const compact = value.replace(/\s+/g, ' ').trim();
  const words = compact.match(/[가-힣A-Za-z0-9]+/g) ?? [];
  return compact.length >= 8 && words.length >= 2;
}

export function hasStudentQuestion(value: string): boolean {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length >= 5 && /[가-힣A-Za-z0-9]/.test(compact);
}

/** 저장된 checkpoint 이름만 바꿔 마지막 화면으로 건너뛰지 못하게 한다. */
export function guardEuropeScreen(
  progress: EuropeMissionProgress,
  exploration: EuropeExplorationStatus
): EuropeMissionScreen {
  if (progress.screen === 'window') return progress.activeCountryId && progress.activeVisualId ? 'window' : 'map';
  if (progress.screen === 'gallery') return exploration.complete ? 'gallery' : 'map';
  if (progress.screen === 'reason') {
    return exploration.complete && progress.selectedCountryId && progress.selectedEvidenceId ? 'reason' : 'gallery';
  }
  if (progress.screen === 'question') {
    return progress.selectedCountryId && progress.selectedEvidenceId && progress.reasonPromptId && hasStudentReason(progress.reasonDraft)
      ? 'question'
      : 'reason';
  }
  if (progress.screen === 'postcard') {
    return progress.selectedCountryId
      && progress.selectedEvidenceId
      && progress.reasonPromptId
      && progress.questionStarterId
      && hasStudentReason(progress.reasonDraft)
      && hasStudentQuestion(progress.questionDraft)
      ? 'postcard'
      : 'question';
  }
  return 'map';
}
