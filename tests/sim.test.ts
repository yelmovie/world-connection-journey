import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Effects {
  [control: string]: { [option: string]: { eco: number; community: number; economy: number; culture: number } };
}
interface OceaniaContent {
  sim: {
    controls: Record<string, string[]>;
    effects: Effects;
    turns: number;
    thresholds: { good: number; warn: number };
  };
}

const content = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'content', 'v1', 'ko', 'oceania.json'), 'utf-8')
) as OceaniaContent;

type Metrics = { eco: number; community: number; economy: number; culture: number };

function runSim(choices: Record<string, string>, turns: number): Metrics {
  const m: Metrics = { eco: 50, community: 50, economy: 50, culture: 50 };
  for (let t = 0; t < turns; t++) {
    for (const [control, option] of Object.entries(choices)) {
      const eff = content.sim.effects[control]?.[option];
      if (!eff) throw new Error(`계수 없음: ${control}/${option}`);
      m.eco += eff.eco;
      m.community += eff.community;
      m.economy += eff.economy;
      m.culture += eff.culture;
    }
  }
  return m;
}

describe('오세아니아 3턴 시뮬레이션 (콘텐츠 데이터 검증)', () => {
  const controls = Object.keys(content.sim.controls);

  it('모든 컨트롤×옵션에 정수 계수가 존재한다', () => {
    for (const control of controls) {
      for (const option of content.sim.controls[control]!) {
        const eff = content.sim.effects[control]?.[option];
        expect(eff, `${control}/${option}`).toBeDefined();
        for (const v of Object.values(eff!)) expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it('같은 선택 → 항상 같은 결과 (결정론)', () => {
    const pick: Record<string, string> = {};
    for (const c of controls) pick[c] = content.sim.controls[c]![0]!;
    expect(runSim(pick, 3)).toEqual(runSim(pick, 3));
  });

  it('서로 다른 균형 전략이 2개 이상 존재하고, 만능 전략은 없다', () => {
    const warn = content.sim.thresholds.warn;
    const [c1, c2, c3] = controls as [string, string, string];
    const balanced: string[] = [];
    let allUp = 0;
    for (const o1 of content.sim.controls[c1]!) {
      for (const o2 of content.sim.controls[c2]!) {
        for (const o3 of content.sim.controls[c3]!) {
          const m = runSim({ [c1]: o1, [c2]: o2, [c3]: o3 }, 3);
          const values = [m.eco, m.community, m.economy, m.culture];
          if (values.every((v) => v >= warn)) balanced.push(`${o1}/${o2}/${o3}`);
          if (values.every((v) => v > 50)) allUp += 1;
        }
      }
    }
    expect(balanced.length).toBeGreaterThanOrEqual(2);
    expect(allUp).toBe(0);
  });
});
