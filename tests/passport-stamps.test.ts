import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() { return store.size; }
    }
  });
});

describe('여행 여권 도장 (6대륙)', () => {
  it('여섯 대륙과 여섯 도장 그림이 정확히 일대일로 연결된다', async () => {
    const { STAMP_SLOTS, STAMP_ASSETS } = await import('../src/core/stamps');
    expect(STAMP_SLOTS).toHaveLength(6);
    expect(Object.keys(STAMP_ASSETS)).toEqual([...STAMP_SLOTS]);
    expect(new Set(Object.values(STAMP_ASSETS)).size).toBe(6);
  });

  it('아시아·유럽·아프리카·오세아니아는 1개, 아메리카는 2개, 지구회의는 0개의 도장을 준다', async () => {
    const { saveRepo } = await import('../src/core/SaveRepository');
    saveRepo.reset();
    expect(saveRepo.get().stamps).toEqual([]);

    saveRepo.completeMission('asia', 0, {});
    expect(saveRepo.get().stamps).toEqual(['asia']);
    saveRepo.completeMission('europe', 0, {});
    saveRepo.completeMission('africa', 0, {});
    saveRepo.completeMission('oceania', 0, {});
    expect(saveRepo.get().stamps).toEqual(['asia', 'europe', 'africa', 'oceania']);

    saveRepo.completeMission('americas', 0, {});
    expect(saveRepo.get().stamps).toEqual(['asia', 'europe', 'africa', 'americas_north', 'americas_south', 'oceania']);

    saveRepo.completeMission('dialogue', 0, {});
    expect(saveRepo.get().stamps).toHaveLength(6);
    saveRepo.completeMission('asia', 0, {});
    expect(saveRepo.get().stamps).toHaveLength(6);
  });

  it('아메리카 나라 그룹을 다 끝내면 미션 도중에도 대륙 도장을 한 번만 준다', async () => {
    const { saveRepo } = await import('../src/core/SaveRepository');
    const { americasGroupDone } = await import('../src/core/stamps');
    saveRepo.reset();
    const countries = { canada: { done: true }, usa: { done: true }, mexico: { done: true }, brazil: { done: false } };
    saveRepo.setCheckpoint('americas', 'explore', { exploreProgress: { countries } });
    expect(americasGroupDone(saveRepo.get(), 'americas_north')).toBe(true);
    expect(americasGroupDone(saveRepo.get(), 'americas_south')).toBe(false);
    expect(saveRepo.awardStamp('americas_north')).toBe(true);
    expect(saveRepo.awardStamp('americas_north')).toBe(false);
    expect(saveRepo.get().stamps).toEqual(['americas_north']);
  });
});
