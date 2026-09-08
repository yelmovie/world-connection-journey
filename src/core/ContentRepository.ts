import commonFallback from '../../public/content/v1/ko/common.json';
import asiaFallback from '../../public/content/v1/ko/asia.json';
import europeFallback from '../../public/content/v1/ko/europe.json';
import africaFallback from '../../public/content/v1/ko/africa.json';
import americasFallback from '../../public/content/v1/ko/americas.json';
import oceaniaFallback from '../../public/content/v1/ko/oceania.json';
import dialogueFallback from '../../public/content/v1/ko/dialogue.json';
import environmentFallback from '../../public/content/v1/ko/environment.json';

const FALLBACK_CONTENTS: Record<string, unknown> = {
  common: commonFallback,
  asia: asiaFallback,
  europe: europeFallback,
  africa: africaFallback,
  americas: americasFallback,
  oceania: oceaniaFallback,
  dialogue: dialogueFallback,
  environment: environmentFallback
};

/** 콘텐츠 JSON 로더 — public/content/v1/ko/*.json, 페이지별 lazy + 캐시 */
const cache = new Map<string, unknown>();
const CONTENT_CACHE_VERSION = '0.1.12';

export interface ContentEnvelope {
  schemaVersion: 1 | 2;
  missionId: string;
  needsReview: boolean;
}

const CONTENT_SHAPES: Record<string, { missionId: string; objects: string[]; arrays: string[]; strings?: string[] }> = {
  common: { missionId: 'common', objects: ['ui', 'nickname'], arrays: ['actionPrinciples', 'stamps'], strings: ['reflectionFrame'] },
  asia: { missionId: 'asia_connected_regions', objects: ['intro', 'requirements', 'proposal'], arrays: ['regions', 'countryExamples', 'scenes', 'comparisonLenses', 'signals', 'issues', 'perspectives', 'actionTiers', 'actions'] },
  europe: { missionId: 'europe_interest_window', objects: ['intro', 'requirements'], arrays: ['countries', 'signals', 'perspectives', 'actions'] },
  africa: { missionId: 'africa_sound_dialogue', objects: ['intro', 'requirements', 'callResponse', 'feedback', 'proposal'], arrays: ['regions', 'countryCases', 'contextCards', 'patterns', 'environmentSignals', 'issues', 'perspectives', 'actionTiers', 'actions', 'sources'] },
  americas: { missionId: 'americas_shared_day', objects: ['intro', 'constraints', 'altCompare', 'feedback'], arrays: ['students', 'blocks'] },
  oceania: { missionId: 'oceania_one_ocean', objects: ['intro', 'requirements', 'proposal'], arrays: ['zones', 'countryExamples', 'scenes', 'comparisonLenses', 'signals', 'issues', 'perspectives', 'actionTiers', 'actions', 'sources'] },
  dialogue: { missionId: 'respect_dialogue', objects: ['intro', 'listening', 'compass', 'feedback'], arrays: ['greetings'] },
  environment: { missionId: 'earth_council', objects: ['titles', 'connectionReasons', 'roundtable', 'simulationFeedback', 'pledge'], arrays: ['friends', 'lenses', 'signals', 'issues', 'councilTurns', 'perspectives', 'actionTiers', 'actions'] }
};

const NESTED_SHAPES: Record<string, { objects?: string[]; arrays?: string[]; objectArrays?: string[] }> = {
  asia: {
    objectArrays: ['regions', 'countryExamples', 'scenes', 'comparisonLenses', 'signals', 'issues', 'perspectives', 'actionTiers', 'actions']
  },
  europe: {
    objectArrays: [
      'countries', 'signals', 'perspectives', 'actions',
      'countries.0.visuals', 'countries.1.visuals', 'countries.2.visuals', 'countries.3.visuals',
      'countries.4.visuals', 'countries.5.visuals', 'countries.6.visuals'
    ]
  },
  africa: {
    arrays: ['callResponse.rules', 'callResponse.examples'],
    objectArrays: ['contextCards', 'patterns']
  },
  americas: { objectArrays: ['students', 'blocks'] },
  oceania: {
    objectArrays: ['zones', 'countryExamples', 'scenes', 'comparisonLenses', 'signals', 'issues', 'perspectives', 'actionTiers', 'actions', 'sources']
  },
  dialogue: {
    arrays: ['listening.scenarios', 'compass.npcs'],
    objectArrays: ['greetings', 'listening.scenarios', 'compass.npcs']
  },
  environment: {
    arrays: ['pledge.frame', 'pledge.helperQuestions'],
    objectArrays: ['friends', 'lenses', 'signals', 'issues', 'councilTurns', 'perspectives', 'actionTiers', 'actions']
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
    if (Array.isArray(value)) {
      const index = Number(key);
      return Number.isInteger(index) && index >= 0 ? value[index] : undefined;
    }
    if (typeof value !== 'object' || value === null) return undefined;
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
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) {
    throw new Error(`콘텐츠 버전 오류: ${name}의 schemaVersion은 1 또는 2여야 해요.`);
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
  try {
    const baseUrl = (import.meta.env.BASE_URL ?? './').replace(/\/+$/, '') + '/';
    const res = await fetch(`${baseUrl}content/v1/ko/${name}.json?v=${CONTENT_CACHE_VERSION}`, { cache: 'no-cache' });
    if (res.ok) {
      const json = validateContentDocument(await res.json(), name);
      cache.set(name, json);
      return json as T;
    }
  } catch (err) {
    console.warn(`[Content] 네트워크/동적 로드 경고 (${name}), 번들 내장 데이터로 자동 복구:`, err);
  }
  const fallback = FALLBACK_CONTENTS[name];
  if (fallback) {
    const json = validateContentDocument(fallback, name);
    cache.set(name, json);
    return json as T;
  }
  throw new Error(`콘텐츠 로드 실패: ${name}`);
}
