import { describe, expect, it } from 'vitest';
import { defaultSave, recomputeUnlocks } from '../src/core/SaveRepository';
import { CONTINENT_IDS } from '../src/types';

describe('미션 해금 규칙', () => {
  it('시작 시 5대륙은 열려 있고 대화는 잠김', () => {
    const s = defaultSave();
    recomputeUnlocks(s);
    for (const id of CONTINENT_IDS) expect(s.missions[id].status).toBe('available');
    expect(s.missions.dialogue.status).toBe('locked');
    expect(s.completion.unlocked).toBe(false);
  });

  it('4대륙 완료로는 대화가 열리지 않는다', () => {
    const s = defaultSave();
    for (const id of CONTINENT_IDS.slice(0, 4)) s.missions[id].status = 'completed';
    recomputeUnlocks(s);
    expect(s.missions.dialogue.status).toBe('locked');
  });

  it('5대륙 완료 → 대화 해금, 대화 완료 → 수료 해금', () => {
    const s = defaultSave();
    for (const id of CONTINENT_IDS) s.missions[id].status = 'completed';
    recomputeUnlocks(s);
    expect(s.missions.dialogue.status).toBe('available');
    expect(s.completion.unlocked).toBe(false);

    s.missions.dialogue.status = 'completed';
    recomputeUnlocks(s);
    expect(s.completion.unlocked).toBe(true);
  });

  it('저장 조작으로 대화만 available이어도 5대륙 미완이면 다시 잠긴다', () => {
    const s = defaultSave();
    s.missions.dialogue.status = 'available';
    recomputeUnlocks(s);
    expect(s.missions.dialogue.status).toBe('locked');
  });

  it('저장 조작으로 대화를 completed로 바꿔도 5대륙 미완이면 다시 잠긴다', () => {
    const s = defaultSave();
    s.missions.dialogue.status = 'completed';
    s.completion.unlocked = true;
    recomputeUnlocks(s);
    expect(s.missions.dialogue.status).toBe('locked');
    expect(s.completion.unlocked).toBe(false);
  });
});
