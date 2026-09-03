import { describe, expect, it } from 'vitest';
import { KOREA_HOME, worldRouteOrigin } from '../src/pages/map';

describe('세계 항로 출발점', () => {
  it('한반도 좌표에서 모든 여행을 시작한다', () => {
    expect(KOREA_HOME).toEqual({ x: 0.493, y: 0.405 });
    expect(worldRouteOrigin()).toBe(KOREA_HOME);
  });
});
