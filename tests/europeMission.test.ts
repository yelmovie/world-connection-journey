import { describe, expect, it } from 'vitest';
import {
  europeExplorationStatus,
  guardEuropeScreen,
  hasStudentQuestion,
  hasStudentReason,
  normalizeEuropeProgress
} from '../src/core/europeMission';

const countries = [
  { id: 'a', visualIds: ['a1', 'a2', 'a3'] },
  { id: 'b', visualIds: ['b1', 'b2', 'b3'] },
  { id: 'c', visualIds: ['c1', 'c2', 'c3'] },
  { id: 'd', visualIds: ['d1', 'd2', 'd3'] }
];
const requirements = { minCountries: 4, minVisualsPerVisitedCountry: 2, minSavedVisuals: 3, minSavedCountries: 2 };

describe('유럽 관심 창 진행 상태', () => {
  it('프라하 경로 형식의 옛 저장은 새 첫 화면으로 안전하게 옮긴다', () => {
    const state = normalizeEuropeProgress({ route: ['old_square'], purpose: 'heritage' }, countries, 'now');
    expect(state.screen).toBe('map');
    expect(state.visitedCountryIds).toEqual([]);
    expect(state.schemaVersion).toBe(2);
  });

  it('ID 배열을 중복 제거하고 알 수 없는 ID를 버린다', () => {
    const state = normalizeEuropeProgress({
      europeProgress: {
        schemaVersion: 2,
        screen: 'window',
        activeCountryId: 'a',
        activeVisualId: 'a1',
        visitedCountryIds: ['a', 'a', 'x'],
        viewedVisualIds: ['a1', 'a1', 'x1'],
        savedVisualIds: ['a1', 'b1', 'b1']
      }
    }, countries, 'now');
    expect(state.visitedCountryIds).toEqual(['a']);
    expect(state.viewedVisualIds).toEqual(['a1']);
    expect(state.savedVisualIds).toEqual(['a1', 'b1']);
  });

  it('네 나라에서 두 장씩 보고 두 나라의 세 장을 담아야 탐색이 끝난다', () => {
    const state = normalizeEuropeProgress({
      europeProgress: {
        schemaVersion: 2,
        screen: 'map',
        visitedCountryIds: ['a', 'b', 'c', 'd'],
        viewedVisualIds: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'],
        savedVisualIds: ['a1', 'a2', 'b1']
      }
    }, countries, 'now');
    expect(europeExplorationStatus(state, countries, requirements).complete).toBe(true);
    state.viewedVisualIds = state.viewedVisualIds.filter((id) => id !== 'd2');
    expect(europeExplorationStatus(state, countries, requirements).complete).toBe(false);
  });

  it('근거·자기 문장·질문 없이 checkpoint만 바꿔 마지막 화면으로 갈 수 없다', () => {
    const state = normalizeEuropeProgress({
      europeProgress: {
        schemaVersion: 2,
        screen: 'postcard',
        visitedCountryIds: ['a', 'b', 'c', 'd'],
        viewedVisualIds: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'],
        savedVisualIds: ['a1', 'a2', 'b1']
      }
    }, countries, 'now');
    const exploration = europeExplorationStatus(state, countries, requirements);
    expect(guardEuropeScreen(state, exploration)).not.toBe('postcard');
  });

  it('난타 대신 학생의 의미 있는 이유와 질문을 요구한다', () => {
    expect(hasStudentReason('좋아서')).toBe(false);
    expect(hasStudentReason('강가의 자전거 길이 눈에 남았어.')).toBe(true);
    expect(hasStudentQuestion('왜')).toBe(false);
    expect(hasStudentQuestion('자전거 길을 함께 쓰는지')).toBe(true);
  });
});
