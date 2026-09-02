import { describe, expect, it } from 'vitest';
import { defaultSave, isRestorableSaveDocument, migrateSave, validateSave } from '../src/core/SaveRepository';

describe('저장 데이터 검증·복구', () => {
  it('완전한 저장 데이터는 그대로 살아남는다', () => {
    const save = defaultSave();
    save.profile = { nickname: '테스트', createdAt: '2026-08-14T00:00:00Z', avatarId: 'a2', airplaneId: 'plane2' };
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

  it('schemaVersion 도입 전 저장을 v1으로 마이그레이션한다', () => {
    const migrated = migrateSave({
      profile: { nickname: '예전기록', avatarId: 'a1', airplaneId: 'plane1', inquiryQuestionId: 'q1' },
      missions: {}
    });
    expect(migrated).toMatchObject({ schemaVersion: 1, profile: { nickname: '예전기록' } });
    const restored = validateSave(migrated);
    expect(restored.profile?.nickname).toBe('예전기록');
    expect(restored.profile).not.toHaveProperty('inquiryQuestionId');
  });

  it('완료 상태와 도장·미션 보상 불변식을 복구한다', () => {
    const restored = validateSave({
      schemaVersion: 1,
      missions: { asia: { status: 'completed' }, europe: { status: 'available' } },
      stamps: ['europe'],
      rewardClaimedById: { 'mission.asia': true, 'mission.europe': true }
    });
    expect(restored.stamps).toEqual(['asia']);
    expect(restored.rewardClaimedById['mission.asia']).toBe(true);
    expect(restored.rewardClaimedById['mission.europe']).toBeUndefined();
  });

  it('예전 저장의 미션 id 도장은 6대륙 도장으로 이관된다', () => {
    const restored = validateSave({
      schemaVersion: 1,
      missions: { americas: { status: 'completed' } },
      stamps: ['americas', 'dialogue']
    });
    expect(restored.stamps).toEqual(['americas_north', 'americas_south']);
  });

  it('volume 하위호환: 구 저장에 volume이 없으면 0.8, 범위 밖은 클램프된다', () => {
    // volume 필드가 없던 구 v1 저장
    const legacy = validateSave({
      schemaVersion: 1,
      settings: { bgm: false, sfx: true, reducedMotion: false }
    });
    expect(legacy.settings.volume).toBe(0.8);
    expect(legacy.settings.bgm).toBe(false);

    // 정상 범위 값은 유지
    expect(validateSave({ schemaVersion: 1, settings: { volume: 0.3 } }).settings.volume).toBe(0.3);
    // 범위 밖·비정상 값은 클램프 또는 기본값
    expect(validateSave({ schemaVersion: 1, settings: { volume: 5 } }).settings.volume).toBe(1);
    expect(validateSave({ schemaVersion: 1, settings: { volume: -1 } }).settings.volume).toBe(0);
    expect(validateSave({ schemaVersion: 1, settings: { volume: Number.NaN } }).settings.volume).toBe(0.8);
    expect(validateSave({ schemaVersion: 1, settings: { volume: '크게' } }).settings.volume).toBe(0.8);
  });

  it('전이 적용 답을 저장하고, 필드가 없는 구 v1 저장도 안전하게 연다', () => {
    const legacy = validateSave({
      schemaVersion: 1,
      completion: {
        reflectionDrafts: {
          initialThought: '처음 생각',
          evidenceLearned: '확인한 자료',
          revisedThought: '바뀐 생각'
        }
      }
    });
    expect(legacy.completion.reflectionDrafts.transferApplication).toBe('');

    const restored = validateSave({
      schemaVersion: 1,
      completion: {
        reflectionDrafts: {
          transferApplication: '새 친구에게 먼저 원하는 도움을 물어본다.'
        }
      }
    });
    expect(restored.completion.reflectionDrafts.transferApplication).toBe('새 친구에게 먼저 원하는 도움을 물어본다.');
  });

  it('parse 가능한 v1이라도 핵심 컨테이너가 손상되면 원본 백업 대상으로 본다', () => {
    expect(isRestorableSaveDocument(defaultSave())).toBe(true);
    expect(isRestorableSaveDocument({
      schemaVersion: 1,
      profile: { nickname: '너무긴닉네임으로손상' },
      missions: 'broken'
    })).toBe(false);
  });
});
