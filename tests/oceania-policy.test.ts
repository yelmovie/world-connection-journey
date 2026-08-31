import { describe, expect, it } from 'vitest';
import { calculatePolicyDelta, type PolicyEvent, type PolicyEvidenceSupport } from '../src/core/oceaniaPolicy';

const base = {
  tourism: {
    보통: { eco: 0, community: 0, economy: 2, culture: 1 },
    많이: { eco: -4, community: -2, economy: 5, culture: -1 }
  },
  protection: {
    보통: { eco: 1, community: 0, economy: 0, culture: 1 }
  }
};
const event: PolicyEvent = {
  id: 'festival',
  title: '축제',
  description: '주민 행사가 열려요.',
  effects: { tourism: { 보통: { community: 1 }, 많이: { community: -2, culture: -3 } } }
};
const evidence: PolicyEvidenceSupport = {
  control: 'tourism',
  options: ['보통'],
  effects: { community: 1, culture: 2 },
  note: '주민이 정한 방문 약속을 적용했어요.'
};

describe('오세아니아 정책 결과', () => {
  it('기본 선택·사건·주민 근거를 결정론적으로 합산한다', () => {
    const choices = { tourism: '보통', protection: '보통' };
    const a = calculatePolicyDelta(base, choices, event, evidence);
    const b = calculatePolicyDelta(base, choices, event, evidence);
    expect(a).toEqual(b);
    expect(a.delta).toEqual({ eco: 1, community: 2, economy: 2, culture: 4 });
    expect(a.eventApplied).toBe(true);
    expect(a.evidenceApplied).toBe(true);
  });

  it('주민 근거와 맞지 않는 정책에는 근거 효과를 억지로 더하지 않는다', () => {
    const result = calculatePolicyDelta(base, { tourism: '많이', protection: '보통' }, event, evidence);
    expect(result.evidenceApplied).toBe(false);
    expect(result.evidenceNote).toBe('');
    expect(result.delta).toEqual({ eco: -3, community: -4, economy: 5, culture: -3 });
  });
});
