import type { Page } from '../router';
import { createEuropePage } from './connectedRegionMission';

/** 유럽도 아시아·오세아니아와 같은 지도 탐험 → 3분할 환경 연결 흐름을 사용한다. */
export function createPage(): Page {
  return createEuropePage();
}
