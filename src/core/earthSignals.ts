import { saveRepo } from './SaveRepository';
import { CONTINENT_IDS, type MissionId } from '../types';

export interface CollectedSignal {
  missionId: MissionId;
  label: string;
  /** 지구회의 주제(ocean·climate·ecosystem)와의 명시 연결 — 없으면 화면 쪽 키워드 추정을 쓴다. */
  issueId?: string;
}

export type EarthSignalInput = string | { label: string; issueId?: string };

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
export function recordEarthSignals(missionId: MissionId, signals: EarthSignalInput[]): void {
  const seen = new Set<string>();
  const clean: Array<{ label: string; issueId?: string }> = [];
  for (const item of signals) {
    const label = (typeof item === 'string' ? item : item.label).trim().slice(0, 40);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const issueId = typeof item === 'string' ? undefined : item.issueId;
    clean.push(issueId ? { label, issueId } : { label });
    if (clean.length >= 4) break;
  }
  if (clean.length === 0) return;
  saveRepo.update((save) => {
    save.missions[missionId].data.earthSignals = clean;
  });
}

/** 이전 버전 저장(문자열 배열)과 새 저장(객체 배열)을 모두 읽는다. */
function readEntries(value: unknown): Array<{ label: string; issueId?: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ label: string; issueId?: string }> = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) out.push({ label: item });
    else if (item && typeof item === 'object' && typeof (item as { label?: unknown }).label === 'string') {
      const entry = item as { label: string; issueId?: unknown };
      out.push({ label: entry.label, issueId: typeof entry.issueId === 'string' ? entry.issueId : undefined });
    }
  }
  return out;
}

/** 지금까지 다섯 대륙에서 모은 신호 — 대륙 순서를 지켜 돌려준다. */
export function collectedEarthSignals(): CollectedSignal[] {
  const save = saveRepo.get();
  const out: CollectedSignal[] = [];
  for (const id of CONTINENT_IDS) {
    for (const entry of readEntries(save.missions[id].data.earthSignals)) {
      out.push({ missionId: id, ...entry });
    }
  }
  return out;
}
