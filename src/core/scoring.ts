import { PASS_SCORE } from '../types';

/**
 * 결정론적 점수 계산.
 * dimensions: 차원별 획득 비율 0~1 (예: evidence 0.8)
 * weights: 차원별 배점 합계 95 + 속도 보너스 최대 5 = 100
 */
export function computeScore(
  ratios: Record<string, number>,
  weights: Record<string, number>,
  speedBonus = 0
): { total: number; byDimension: Record<string, number>; passed: boolean } {
  const byDimension: Record<string, number> = {};
  let total = 0;
  for (const [dim, weight] of Object.entries(weights)) {
    const ratio = clamp01(ratios[dim] ?? 0);
    const pts = Math.round(weight * ratio);
    byDimension[dim] = pts;
    total += pts;
  }
  const bonus = Math.max(0, Math.min(5, Math.round(speedBonus)));
  byDimension.speedBonus = bonus;
  total = Math.min(100, total + bonus);
  return { total, byDimension, passed: total >= PASS_SCORE };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** 부분 점수 비율: 맞은 수/전체 에 재시도 감점 없이 상한만 적용 */
export function ratioOf(correct: number, total: number): number {
  if (total <= 0) return 0;
  return clamp01(correct / total);
}
