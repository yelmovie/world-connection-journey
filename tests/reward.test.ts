import { beforeAll, describe, expect, it } from 'vitest';

// saveRepo 싱글턴이 import 시 localStorage를 읽으므로 먼저 모킹한다.
beforeAll(() => {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    }
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true });
});

describe('보상 중복 지급 방지', () => {
  it('같은 미션을 두 번 완료해도 스탬프는 1개, 최고 점수만 갱신', async () => {
    const { saveRepo } = await import('../src/core/SaveRepository');
    saveRepo.reset();
    saveRepo.completeMission('asia', 72, { evidence: 20 });
    saveRepo.completeMission('asia', 90, { evidence: 28 });
    saveRepo.completeMission('asia', 60, { evidence: 15 });

    const s = saveRepo.get();
    expect(s.stamps.filter((x) => x === 'asia')).toHaveLength(1);
    expect(s.missions.asia.bestScore).toBe(90); // 낮은 재도전 점수가 최고 기록을 깎지 않음
    expect(s.missions.asia.attempts).toBe(3);
    expect(s.rewardClaimedById['mission.asia']).toBe(true);
  });

  it('배움 기록(learn)은 체크포인트 교체·미션 완료에도 보존된다', async () => {
    const { saveRepo } = await import('../src/core/SaveRepository');
    saveRepo.reset();
    // 친구 소개에서 첫 생각 기록
    saveRepo.update((s) => {
      s.missions.asia.data.learn = { prediction: '많이 다를 거야' };
    });
    // 라운드 진행 체크포인트가 스냅샷으로 data를 교체해도 learn은 남는다
    saveRepo.setCheckpoint('asia', 'round2', { placed: ['t1'] });
    expect((saveRepo.get().missions.asia.data.learn as { prediction: string }).prediction).toBe('많이 다를 거야');
    expect(saveRepo.get().missions.asia.data.placed).toEqual(['t1']);
    // 완료가 진행 스냅샷을 비워도 learn(배움 카드)은 남는다 — 여권·수료증이 읽는다
    saveRepo.update((s) => {
      s.missions.asia.data.learn = { prediction: '많이 다를 거야', confirmedAt: 'x', cardLine: '발견', friendName: '미나' };
    });
    saveRepo.completeMission('asia', 90, { evidence: 28 });
    const data = saveRepo.get().missions.asia.data;
    expect((data.learn as { cardLine: string }).cardLine).toBe('발견');
    expect(data.placed).toBeUndefined();
  });

  it('체크포인트 저장은 상태를 in_progress로 만든다', async () => {
    const { saveRepo } = await import('../src/core/SaveRepository');
    saveRepo.reset();
    saveRepo.setCheckpoint('europe', 'stage2', { visited: ['n1'] });
    const m = saveRepo.get().missions.europe;
    expect(m.status).toBe('in_progress');
    expect(m.checkpointId).toBe('stage2');
    expect(m.data.visited).toEqual(['n1']);
  });
});
