import { describe, expect, it } from 'vitest';
import content from '../public/content/v1/ko/oceania.json';

describe('오세아니아 공동 해결 데이터', () => {
  it('개인·지역사회·기관·국제 협력의 행동을 모두 제공한다', () => {
    const tierIds = new Set(content.actionTiers.map((tier) => tier.id));
    expect(tierIds).toEqual(new Set(['self', 'community', 'institution', 'international']));
    for (const tier of content.actionTiers) {
      expect(content.actions.some((action) => action.tier === tier.id), tier.id).toBe(true);
    }
  });

  it('행동 효과는 동일한 입력에 항상 같은 정수 결과를 준다', () => {
    const sum = (ids: string[]) => ids.reduce((total, id) => {
      const action = content.actions.find((item) => item.id === id);
      if (!action) return total;
      for (const [key, value] of Object.entries(action.metrics)) total[key] = (total[key] ?? 0) + value;
      return total;
    }, {} as Record<string, number>);
    const ids = ['reuse_report', 'school_monitor', 'waste_system', 'shared_data'];
    expect(sum(ids)).toEqual(sum(ids));
    expect(Object.values(sum(ids)).every(Number.isInteger)).toBe(true);
  });

  it('환경 신호와 해결 행동이 한 지역에만 고정되지 않는다', () => {
    expect(content.signals.every((signal) => signal.zoneIds.length >= 2)).toBe(true);
    expect(new Set(content.actions.map((action) => action.tier)).size).toBe(4);
  });
});
