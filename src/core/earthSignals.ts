import { saveRepo } from './SaveRepository';
import { CONTINENT_IDS, type MissionId } from '../types';

export interface CollectedSignal {
  missionId: MissionId;
  label: string;
}

const CONTINENT_LABEL: Record<string, string> = {
  asia: '아시아',
  europe: '유럽',
  africa: '아프리카',
  americas: '아메리카',
  oceania: '오세아니아'
};

export function continentLabel(missionId: MissionId): string {
  return CONTINENT_LABEL[missionId] ?? '대륙';
}

/**
 * 대륙 탐험에서 알아낸 것을 "지구회의에 가져갈 신호"로 남긴다.
 *
 * 스테이지마다 활동이 달라도 마지막 회의로 이어지는 통로는 하나여야 한다.
 * 학생이 지도 화면에서 이게 쌓이는 걸 보고 "내가 모은 게 마지막에 쓰인다"를 느낀다.
 */
export function recordEarthSignals(missionId: MissionId, labels: string[]): void {
  const clean = [...new Set(labels.map((label) => label.trim()).filter(Boolean))]
    .map((label) => label.slice(0, 40))
    .slice(0, 4);
  if (clean.length === 0) return;
  saveRepo.update((save) => {
    save.missions[missionId].data.earthSignals = clean;
  });
}

function readLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/** 지금까지 다섯 대륙에서 모은 신호 — 대륙 순서를 지켜 돌려준다. */
export function collectedEarthSignals(): CollectedSignal[] {
  const save = saveRepo.get();
  const out: CollectedSignal[] = [];
  for (const id of CONTINENT_IDS) {
    for (const label of readLabels(save.missions[id].data.earthSignals)) {
      out.push({ missionId: id, label });
    }
  }
  return out;
}
