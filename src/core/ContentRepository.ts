/** 콘텐츠 JSON 로더 — public/content/v1/ko/*.json, 페이지별 lazy + 캐시 */
const cache = new Map<string, unknown>();

export interface ContentEnvelope {
  schemaVersion: 1;
  missionId: string;
  needsReview: boolean;
}

const CONTENT_SHAPES: Record<string, { missionId: string; objects: string[]; arrays: string[]; strings?: string[] }> = {
  common: { missionId: 'common', objects: ['ui', 'nickname'], arrays: ['inquiryQuestions', 'actionPrinciples', 'stamps'], strings: ['reflectionFrame'] },
  asia: { missionId: 'asia_daily_life_evidence', objects: ['intro', 'round1_timeline', 'round2_classification', 'round3_question'], arrays: [] },
  europe: { missionId: 'europe_city_route', objects: ['intro', 'city', 'constraints', 'feedback'], arrays: ['sources', 'nodes', 'edges', 'goals'] },
  africa: { missionId: 'africa_sound_dialogue', objects: ['intro', 'callResponse', 'feedback'], arrays: ['contextCards', 'patterns'] },
  americas: { missionId: 'americas_shared_day', objects: ['intro', 'constraints', 'altCompare', 'feedback'], arrays: ['students', 'blocks'] },
  oceania: { missionId: 'oceania_shared_future', objects: ['intro', 'sim', 'feedback'], arrays: ['hotspots', 'perspectives'] },
  dialogue: { missionId: 'respect_dialogue', objects: ['intro', 'listening', 'compass', 'feedback'], arrays: ['greetings'] }
};

const NESTED_SHAPES: Record<string, { objects?: string[]; arrays?: string[]; objectArrays?: string[] }> = {
  asia: {
    objects: ['round3_question.fragments'],
    arrays: [
      'round1_timeline.slots', 'round1_timeline.items',
      'round2_classification.categories', 'round2_classification.statements',
      'round3_question.fragments.openers', 'round3_question.fragments.topics', 'round3_question.fragments.closers',
      'round3_question.goodCombos', 'round3_question.badPatterns'
    ],
    objectArrays: [
      'round1_timeline.items', 'round2_classification.categories', 'round2_classification.statements',
      'round3_question.goodCombos', 'round3_question.badPatterns'
    ]
  },
  europe: { objectArrays: ['sources', 'nodes', 'edges', 'goals'] },
  africa: {
    arrays: ['callResponse.rules', 'callResponse.examples'],
    objectArrays: ['contextCards', 'patterns']
  },
  americas: { objectArrays: ['students', 'blocks'] },
  oceania: {
    objects: ['sim.controls', 'sim.effects', 'sim.thresholds'],
    arrays: ['sim.turnLabels'],
    objectArrays: ['hotspots', 'perspectives']
  },
  dialogue: {
    arrays: ['listening.scenarios', 'compass.npcs'],
    objectArrays: ['greetings', 'listening.scenarios', 'compass.npcs']
  }
};

const IDENTIFIER_FIELDS = new Set(['id', 'missionId', 'from', 'to', 'answer', 'mode', 'type']);
const SAFE_IDENTIFIER = /^[\p{L}\p{N}_.:-]+$/u;
const UNSAFE_KEY = /[&<>"'=`\u0000-\u001f\u007f]/u;

function assertPlainTextTree(value: unknown, path: string, depth = 0, fieldName?: string): void {
  if (depth > 24) throw new Error(`콘텐츠 형식 오류: ${path}가 너무 깊어요.`);
  if (typeof value === 'string') {
    if (value.includes('<') || value.includes('>')) {
      throw new Error(`콘텐츠 안전 오류: ${path}에는 HTML 표식을 넣을 수 없어요.`);
    }
    if (fieldName && IDENTIFIER_FIELDS.has(fieldName) && !SAFE_IDENTIFIER.test(value)) {
      throw new Error(`콘텐츠 안전 오류: ${path} 식별자에 허용되지 않은 문자가 있어요.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPlainTextTree(item, `${path}[${index}]`, depth + 1, fieldName));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (UNSAFE_KEY.test(key)) {
        throw new Error(`콘텐츠 안전 오류: ${path}의 필드 이름에 허용되지 않은 문자가 있어요.`);
      }
      assertPlainTextTree(child, `${path}.${key}`, depth + 1, key);
    }
  }
}

function valueAt(record: Record<string, unknown>, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[key];
  }, record);
}

function assertNestedShapes(record: Record<string, unknown>, name: string): void {
  const nested = NESTED_SHAPES[name];
  if (!nested) return;
  for (const path of nested.objects ?? []) {
    const value = valueAt(record, path);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`콘텐츠 형식 오류: ${name}.${path}는 객체여야 해요.`);
    }
  }
  for (const path of nested.arrays ?? []) {
    if (!Array.isArray(valueAt(record, path))) {
      throw new Error(`콘텐츠 형식 오류: ${name}.${path}는 배열이어야 해요.`);
    }
  }
  for (const path of nested.objectArrays ?? []) {
    const value = valueAt(record, path);
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))) {
      throw new Error(`콘텐츠 형식 오류: ${name}.${path}의 항목은 객체여야 해요.`);
    }
  }
}

/** 모든 콘텐츠 파일이 공유하는 최소 스키마를 런타임에서 확인한다. */
export function validateContentEnvelope(value: unknown, name = 'unknown'): ContentEnvelope & Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`콘텐츠 형식 오류: ${name}은 객체여야 해요.`);
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error(`콘텐츠 버전 오류: ${name}의 schemaVersion은 1이어야 해요.`);
  }
  if (typeof record.missionId !== 'string' || record.missionId.length === 0) {
    throw new Error(`콘텐츠 형식 오류: ${name}에 missionId가 없어요.`);
  }
  if (typeof record.needsReview !== 'boolean') {
    throw new Error(`콘텐츠 형식 오류: ${name}에 needsReview 표시가 없어요.`);
  }
  return record as ContentEnvelope & Record<string, unknown>;
}

/** 파일별 필수 최상위 필드와 plain-text 계약까지 확인한다. */
export function validateContentDocument(value: unknown, name: string): ContentEnvelope & Record<string, unknown> {
  const record = validateContentEnvelope(value, name);
  const shape = CONTENT_SHAPES[name];
  if (shape) {
    if (record.missionId !== shape.missionId) {
      throw new Error(`콘텐츠 형식 오류: ${name}의 missionId가 예상값과 달라요.`);
    }
    for (const key of shape.objects) {
      if (typeof record[key] !== 'object' || record[key] === null || Array.isArray(record[key])) {
        throw new Error(`콘텐츠 형식 오류: ${name}.${key}는 객체여야 해요.`);
      }
    }
    for (const key of shape.arrays) {
      if (!Array.isArray(record[key])) throw new Error(`콘텐츠 형식 오류: ${name}.${key}는 배열이어야 해요.`);
    }
    for (const key of shape.strings ?? []) {
      if (typeof record[key] !== 'string') throw new Error(`콘텐츠 형식 오류: ${name}.${key}는 문자열이어야 해요.`);
    }
  }
  if (!Array.isArray(record.standards)
    || record.standards.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))) {
    throw new Error(`콘텐츠 형식 오류: ${name}.standards는 객체 배열이어야 해요.`);
  }
  if (!Array.isArray(record.learningObjectives)
    || record.learningObjectives.length === 0
    || record.learningObjectives.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`콘텐츠 형식 오류: ${name}.learningObjectives는 비어 있지 않은 문자열 배열이어야 해요.`);
  }
  assertNestedShapes(record, name);
  assertPlainTextTree(record, name);
  return record;
}

export async function loadContent<T>(name: string): Promise<T> {
  const hit = cache.get(name);
  if (hit) return hit as T;
  const res = await fetch(`content/v1/ko/${name}.json`);
  if (!res.ok) throw new Error(`콘텐츠 로드 실패: ${name} (HTTP ${res.status})`);
  const json = validateContentDocument(await res.json(), name);
  cache.set(name, json);
  return json as T;
}
