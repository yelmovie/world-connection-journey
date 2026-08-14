import { describe, expect, it } from 'vitest';
import { defaultSave, validateSave } from '../src/core/SaveRepository';

describe('저장 데이터 검증·복구', () => {
  it('완전한 저장 데이터는 그대로 살아남는다', () => {
    const save = defaultSave();
    save.profile = { nickname: '테스트', createdAt: '2026-08-14T00:00:00Z', avatarId: 'a2', airplaneId: 'plane2', inquiryQuestionId: 'q2' };
    save.missions.asia.status = 'completed';
    save.missions.asia.bestScore = 88;
    save.stamps = ['asia'];
    const restored = validateSave(JSON.parse(JSON.stringify(save)));
    expect(restored.profile?.nickname).toBe('테스트');
    expect(restored.missions.asia.status).toBe('completed');
    expect(restored.missions.asia.bestScore).toBe(88);
    expect(restored.stamps).toEqual(['asia']);
  });

  it('null·문자열·이상한 타입은 기본값으로 복구된다', () => {
    for (const junk of [null, 'garbage', 42, [], { schemaVersion: 99 }]) {
      const restored = validateSave(junk);
      expect(restored.schemaVersion).toBe(1);
      expect(restored.profile).toBeNull();
      expect(restored.missions.asia.status).toBe('available');
      expect(restored.missions.dialogue.status).toBe('locked');
    }
  });

  it('부분 손상(닉네임 초과, 점수 음수)은 필드 단위로 정리된다', () => {
    const restored = validateSave({
      schemaVersion: 1,
      profile: { nickname: '열글자를넘는아주긴별명이다' },
      missions: { asia: { status: 'completed', bestScore: -50, attempts: 2.7 } }
    });
    expect(restored.profile).toBeNull(); // 닉네임 규칙 위반 → 프로필 무효
    expect(restored.missions.asia.bestScore).toBe(0);
    expect(restored.missions.asia.attempts).toBe(2);
  });

  it('저장값의 completion.unlocked를 믿지 않는다 (직접 URL 해금 방지)', () => {
    const restored = validateSave({
      schemaVersion: 1,
      completion: { unlocked: true, reflection: '', actionPrinciples: [], certificateIssued: false }
    });
    expect(restored.completion.unlocked).toBe(false);
  });
});
