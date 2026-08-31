import { describe, expect, it } from 'vitest';
import { parseMissionArtifact } from '../src/core/missionArtifacts';

describe('미션 학습 산출물', () => {
  it('실제 학습 흐름이 있는 산출물을 정리해 읽는다', () => {
    const artifact = parseMissionArtifact({
      schemaVersion: 1,
      missionId: 'oceania',
      title: '섬의 미래 회의',
      purpose: '주민 목소리로 섬의 미래를 함께 결정한다.',
      initialHypothesis: '관광객이 많으면 좋기만 하다.',
      evidenceIds: ['elder_mairi', 'elder_mairi'],
      evidenceLabel: '마이리의 장소 이야기',
      voiceId: 'elder_mairi',
      voiceName: '마이리',
      voiceLine: '주민의 허락이 먼저예요.',
      firstDecision: '관광 보통',
      observedConsequence: '문화와 경제가 다르게 움직였다.',
      revisedDecision: '주민 안내를 근거로 계획을 바꿨다.',
      rationale: '문화와 생활을 함께 지키기 위해서다.',
      transferPrompt: '우리 지역 방문 약속에도 적용한다.',
      earnedAt: '2026-08-26T00:00:00.000Z'
    });
    expect(artifact?.missionId).toBe('oceania');
    expect(artifact?.evidenceIds).toEqual(['elder_mairi']);
  });

  it('목적·근거·결과가 빠진 장식 보상은 산출물로 인정하지 않는다', () => {
    expect(parseMissionArtifact({ schemaVersion: 1, missionId: 'oceania', title: '도장' })).toBeNull();
  });
});
