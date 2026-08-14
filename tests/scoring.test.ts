import { describe, expect, it } from 'vitest';
import { computeScore, ratioOf } from '../src/core/scoring';

const W = { evidence: 30, perspective: 25, communication: 25, revision: 15 };

describe('점수 계산 (결정론)', () => {
  it('같은 입력은 항상 같은 결과', () => {
    const a = computeScore({ evidence: 0.8, perspective: 0.6, communication: 1, revision: 0.5 }, W, 3);
    const b = computeScore({ evidence: 0.8, perspective: 0.6, communication: 1, revision: 0.5 }, W, 3);
    expect(a).toEqual(b);
  });

  it('만점 + 보너스는 100을 넘지 않는다', () => {
    const r = computeScore({ evidence: 1, perspective: 1, communication: 1, revision: 1 }, W, 5);
    expect(r.total).toBe(100);
    expect(r.passed).toBe(true);
  });

  it('속도 보너스는 5로 캡', () => {
    const r = computeScore({ evidence: 0.5, perspective: 0.5, communication: 0.5, revision: 0.5 }, W, 99);
    expect(r.byDimension.speedBonus).toBe(5);
  });

  it('비율 범위 밖 값(NaN, 음수, 2.0)은 0~1로 클램프', () => {
    const r = computeScore({ evidence: Number.NaN, perspective: -1, communication: 2, revision: 0 }, W, 0);
    expect(r.byDimension.evidence).toBe(0);
    expect(r.byDimension.perspective).toBe(0);
    expect(r.byDimension.communication).toBe(25);
  });

  it('통과선 70', () => {
    expect(computeScore({ evidence: 1, perspective: 1, communication: 0.6, revision: 0 }, W, 0).passed).toBe(true);
    expect(computeScore({ evidence: 0.5, perspective: 0.5, communication: 0.5, revision: 0.5 }, W, 0).passed).toBe(false);
  });

  it('ratioOf 방어', () => {
    expect(ratioOf(3, 0)).toBe(0);
    expect(ratioOf(5, 4)).toBe(1);
    expect(ratioOf(2, 4)).toBe(0.5);
  });
});
