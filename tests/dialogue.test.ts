import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface DialogueContent {
  greetings: Array<{ id: string; country: string; caution?: string }>;
  listening: { scenarios: Array<{ options: Array<{ good: boolean; why: string }> }> };
  compass: {
    npcs: Array<{
      id: string;
      turns: Array<{ options: Array<{ empathy: number; leadsTo: number | string }> }>;
      revision: { options: Array<{ better: boolean }> };
    }>;
  };
}

const content = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'content', 'v1', 'ko', 'dialogue.json'), 'utf-8')
) as DialogueContent;

describe('대화 미션 콘텐츠 (분기 도달성·문화 안전성)', () => {
  it('인사 사례 6개국 전부 caution(단정 금지) 문구가 있다', () => {
    expect(content.greetings).toHaveLength(6);
    for (const g of content.greetings) {
      expect(g.caution, `${g.country}에 caution 없음`).toBeTruthy();
    }
  });

  it('경청 시나리오마다 good 선택지가 정확히 1개 이상 있고 모든 선택지에 why가 있다', () => {
    for (const sc of content.listening.scenarios) {
      expect(sc.options.filter((o) => o.good).length).toBeGreaterThanOrEqual(1);
      for (const o of sc.options) expect(o.why).toBeTruthy();
    }
  });

  it('공감 나침반 분기: 모든 leadsTo가 유효한 턴 인덱스 또는 end다', () => {
    for (const npc of content.compass.npcs) {
      npc.turns.forEach((turn, i) => {
        for (const opt of turn.options) {
          if (opt.leadsTo === 'end') return;
          const target = Number(opt.leadsTo);
          expect(Number.isInteger(target), `${npc.id} turn${i} leadsTo=${String(opt.leadsTo)}`).toBe(true);
          expect(target).toBeGreaterThan(i); // 역방향 루프 금지 → 항상 종료 가능
          expect(target).toBeLessThan(npc.turns.length);
        }
      });
      expect(npc.revision.options.some((o) => o.better)).toBe(true);
      // empathy 값 범위
      for (const turn of npc.turns) {
        for (const opt of turn.options) expect([0, 1, 2]).toContain(opt.empathy);
      }
    }
  });
});
