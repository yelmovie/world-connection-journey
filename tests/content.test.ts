import { describe, expect, it } from 'vitest';
import { validateContentDocument, validateContentEnvelope } from '../src/core/ContentRepository';
import common from '../public/content/v1/ko/common.json';
import asia from '../public/content/v1/ko/asia.json';
import europe from '../public/content/v1/ko/europe.json';
import africa from '../public/content/v1/ko/africa.json';
import americas from '../public/content/v1/ko/americas.json';
import oceania from '../public/content/v1/ko/oceania.json';
import dialogue from '../public/content/v1/ko/dialogue.json';

const actualFiles = { common, asia, europe, africa, americas, oceania, dialogue };

describe('콘텐츠 공통 스키마', () => {
  it('v1 콘텐츠의 공통 필드를 확인한다', () => {
    expect(validateContentEnvelope({
      schemaVersion: 1,
      missionId: 'sample',
      needsReview: true,
      rounds: []
    }).missionId).toBe('sample');
  });

  it('객체가 아니거나 필수 필드가 잘못되면 거부한다', () => {
    expect(() => validateContentEnvelope(null)).toThrow();
    expect(() => validateContentEnvelope({ schemaVersion: 2, missionId: 'sample', needsReview: true })).toThrow();
    expect(() => validateContentEnvelope({ schemaVersion: 1, missionId: '', needsReview: true })).toThrow();
    expect(() => validateContentEnvelope({ schemaVersion: 1, missionId: 'sample' })).toThrow();
  });

  it('배포되는 콘텐츠 7종이 공통 스키마와 검토 표시를 갖는다', () => {
    for (const [name, content] of Object.entries(actualFiles)) {
      const validated = validateContentDocument(content, name);
      expect(validated.needsReview, `${name}.needsReview`).toBe(true);
      expect(Array.isArray(validated.standards), `${name}.standards`).toBe(true);
      expect(Array.isArray(validated.learningObjectives), `${name}.learningObjectives`).toBe(true);
      expect((validated.learningObjectives as unknown[]).length, `${name}.learningObjectives`).toBeGreaterThan(0);
    }
  });

  it('파일별 필수 필드 누락과 HTML 삽입을 거부한다', () => {
    expect(() => validateContentDocument({ schemaVersion: 1, missionId: 'common', needsReview: true }, 'common')).toThrow(/객체|배열/);
    expect(() => validateContentDocument({
      schemaVersion: 1,
      missionId: 'common',
      needsReview: true,
      standards: [],
      learningObjectives: ['학습목표'],
      ui: { title: '<img src=x onerror=alert(1)>' },
      nickname: {},
      reflectionFrame: '회고 문장',
      inquiryQuestions: [],
      actionPrinciples: [],
      stamps: []
    }, 'common')).toThrow(/HTML/);
  });

  it('속성 주입용 식별자와 위험한 객체 키를 거부한다', () => {
    const badId = structuredClone(asia);
    badId.round1_timeline.items[0]!.id = 'x" onpointerover="alert(1)';
    expect(() => validateContentDocument(badId, 'asia')).toThrow(/식별자/);

    const badKey = structuredClone(oceania) as typeof oceania & { sim: { controls: Record<string, string[]> } };
    badKey.sim.controls['x" onpointerover="alert(1)'] = ['선택'];
    expect(() => validateContentDocument(badKey, 'oceania')).toThrow(/필드 이름/);
  });

  it('europe 노드는 목표 판정용 tags 배열을 가진다 (코드 하드코딩 제거 근거)', () => {
    const knownTags = new Set(['stairs', 'accessible', 'resident', 'preserve']);
    for (const node of europe.nodes) {
      expect(Array.isArray(node.tags), `${node.id}.tags`).toBe(true);
      expect(node.tags.length, `${node.id}.tags 비어 있음`).toBeGreaterThan(0);
      for (const tag of node.tags) {
        expect(knownTags.has(tag), `${node.id}의 알 수 없는 태그: ${tag}`).toBe(true);
      }
    }
    // 목적별 판정이 성립하려면 각 태그를 가진 노드가 최소 조건만큼 있어야 한다.
    const withTag = (tag: string) => europe.nodes.filter((n) => n.tags.includes(tag));
    expect(withTag('accessible').length).toBeGreaterThanOrEqual(2);
    expect(withTag('resident').length).toBeGreaterThanOrEqual(2);
    expect(withTag('preserve').length).toBeGreaterThanOrEqual(2);
  });

  it('미션에서 즉시 사용하는 중첩 배열의 손상을 거부한다', () => {
    const broken = structuredClone(asia) as unknown as Record<string, unknown>;
    (broken.round1_timeline as Record<string, unknown>).items = null;
    expect(() => validateContentDocument(broken, 'asia')).toThrow(/배열/);
  });
});
