import { saveRepo } from './SaveRepository';
import { MISSION_IDS, type MissionArtifact, type MissionId } from '../types';

const TEXT_LIMIT = 240;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, limit = TEXT_LIMIT): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/** 저장 손상이나 이전 버전의 불완전한 값을 최종 화면으로 흘려보내지 않는다. */
export function parseMissionArtifact(value: unknown): MissionArtifact | null {
  const raw = recordOf(value);
  if (!raw || raw.schemaVersion !== 1 || !MISSION_IDS.includes(raw.missionId as MissionId)) return null;
  const missionId = raw.missionId as MissionId;
  const artifact: MissionArtifact = {
    schemaVersion: 1,
    missionId,
    title: text(raw.title, 60),
    purpose: text(raw.purpose),
    initialHypothesis: text(raw.initialHypothesis),
    evidenceIds: Array.isArray(raw.evidenceIds)
      ? [...new Set(raw.evidenceIds.filter((id): id is string => typeof id === 'string').map((id) => id.slice(0, 80)))].slice(0, 12)
      : [],
    evidenceLabel: text(raw.evidenceLabel),
    voiceId: text(raw.voiceId, 80),
    voiceName: text(raw.voiceName, 60),
    voiceLine: text(raw.voiceLine),
    firstDecision: text(raw.firstDecision),
    observedConsequence: text(raw.observedConsequence),
    revisedDecision: text(raw.revisedDecision),
    rationale: text(raw.rationale),
    transferPrompt: text(raw.transferPrompt),
    earnedAt: text(raw.earnedAt, 40)
  };
  if (!artifact.title || !artifact.purpose || !artifact.evidenceLabel || !artifact.observedConsequence) return null;
  return artifact;
}

export function readMissionArtifact(missionId: MissionId): MissionArtifact | null {
  return parseMissionArtifact(saveRepo.get().missions[missionId].data.artifact);
}

export function writeMissionArtifact(artifact: MissionArtifact): void {
  const safe = parseMissionArtifact(artifact);
  if (!safe) throw new Error(`학습 산출물 형식 오류: ${artifact.missionId}`);
  saveRepo.update((save) => {
    save.missions[safe.missionId].data.artifact = safe;
  });
}
