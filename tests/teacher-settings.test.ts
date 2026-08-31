import { describe, expect, it } from 'vitest';
import {
  defaultSave,
  markAllMissionsCompletedForTeacher,
  matchesTeacherPassword
} from '../src/core/SaveRepository';
import { MISSION_IDS } from '../src/types';

describe('교사용 보호 기능', () => {
  it('비밀번호 yelsam을 대소문자 구분 없이 확인한다', () => {
    expect(matchesTeacherPassword('yelsam')).toBe(true);
    expect(matchesTeacherPassword('YELSAM')).toBe(true);
    expect(matchesTeacherPassword('  YeLsAm  ')).toBe(true);
    expect(matchesTeacherPassword('yelsam1')).toBe(false);
    expect(matchesTeacherPassword('')).toBe(false);
  });

  it('전체 정답 처리는 기존 학습 기록을 보존하고 완료·도장·완료 화면을 맞춘다', () => {
    const save = defaultSave();
    const completedAt = '2026-08-21T12:00:00.000Z';
    save.teacherUnlocked = true;
    save.missions.asia.status = 'in_progress';
    save.missions.asia.checkpointId = 'compare';
    save.missions.asia.bestScore = 72;
    save.missions.asia.data = { learn: { thought: '자료를 비교했어요.' }, choice: 'rice' };
    save.missions.europe.status = 'completed';
    save.missions.europe.completedAt = '2026-08-20T09:00:00.000Z';

    markAllMissionsCompletedForTeacher(save, completedAt);

    for (const id of MISSION_IDS) {
      expect(save.missions[id].status).toBe('completed');
      expect(save.missions[id].checkpointId).toBeNull();
      expect(save.rewardClaimedById[`mission.${id}`]).toBe(true);
    }
    expect(save.stamps).toEqual(MISSION_IDS);
    expect(save.completion.unlocked).toBe(true);
    expect(save.teacherUnlocked).toBe(false);
    expect(save.missions.asia.bestScore).toBe(72);
    expect(save.missions.asia.data).toEqual({ learn: { thought: '자료를 비교했어요.' }, choice: 'rice' });
    expect(save.missions.asia.completedAt).toBe(completedAt);
    expect(save.missions.europe.completedAt).toBe('2026-08-20T09:00:00.000Z');
  });
});
