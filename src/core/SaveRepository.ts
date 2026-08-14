import { bus } from './EventBus';
import type { GameSaveV1, MissionId, MissionSave } from '../types';
import { CONTINENT_IDS, MISSION_IDS } from '../types';

export const SAVE_KEY = 'world_connection_journey.save.v1';
const BACKUP_KEY = 'world_connection_journey.save.v1.corrupt-backup';

function defaultMission(status: MissionSave['status']): MissionSave {
  return { status, checkpointId: null, bestScore: 0, attempts: 0, completedAt: null, scoreDimensions: {}, data: {} };
}

export function defaultSave(): GameSaveV1 {
  const missions = {} as Record<MissionId, MissionSave>;
  for (const id of CONTINENT_IDS) missions[id] = defaultMission('available');
  missions.dialogue = defaultMission('locked');
  return {
    schemaVersion: 1,
    profile: null,
    missions,
    stamps: [],
    settings: { bgm: true, sfx: true, reducedMotion: false },
    completion: { unlocked: false, reflection: '', actionPrinciples: [], certificateIssued: false },
    rewardClaimedById: {},
    lastRoute: '#/',
    updatedAt: new Date().toISOString()
  };
}

/** 손상 데이터를 기본값으로 복구하되 살릴 수 있는 필드는 최대한 살린다. */
export function validateSave(raw: unknown): GameSaveV1 {
  const base = defaultSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== 1) return base; // 미래 버전은 migrate에서 처리

  const p = r.profile as Record<string, unknown> | null | undefined;
  if (p && typeof p === 'object' && typeof p.nickname === 'string' && p.nickname.length >= 1 && p.nickname.length <= 10) {
    base.profile = {
      nickname: p.nickname,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
      avatarId: typeof p.avatarId === 'string' ? p.avatarId : 'a1',
      airplaneId: typeof p.airplaneId === 'string' ? p.airplaneId : 'plane1',
      inquiryQuestionId: typeof p.inquiryQuestionId === 'string' ? p.inquiryQuestionId : 'q1'
    };
  }

  const missions = r.missions as Record<string, unknown> | undefined;
  if (missions && typeof missions === 'object') {
    for (const id of MISSION_IDS) {
      const m = missions[id] as Record<string, unknown> | undefined;
      if (!m || typeof m !== 'object') continue;
      const target = base.missions[id];
      const status = m.status;
      if (status === 'locked' || status === 'available' || status === 'in_progress' || status === 'completed') {
        target.status = status;
      }
      if (typeof m.checkpointId === 'string') target.checkpointId = m.checkpointId;
      if (typeof m.bestScore === 'number' && Number.isFinite(m.bestScore)) target.bestScore = Math.max(0, Math.min(100, m.bestScore));
      if (typeof m.attempts === 'number' && Number.isFinite(m.attempts)) target.attempts = Math.max(0, Math.floor(m.attempts));
      if (typeof m.completedAt === 'string') target.completedAt = m.completedAt;
      if (m.scoreDimensions && typeof m.scoreDimensions === 'object') target.scoreDimensions = m.scoreDimensions as Record<string, number>;
      if (m.data && typeof m.data === 'object') target.data = m.data as Record<string, unknown>;
    }
  }

  if (Array.isArray(r.stamps)) base.stamps = r.stamps.filter((s): s is string => typeof s === 'string');
  const s = r.settings as Record<string, unknown> | undefined;
  if (s && typeof s === 'object') {
    if (typeof s.bgm === 'boolean') base.settings.bgm = s.bgm;
    if (typeof s.sfx === 'boolean') base.settings.sfx = s.sfx;
    if (typeof s.reducedMotion === 'boolean') base.settings.reducedMotion = s.reducedMotion;
  }
  const c = r.completion as Record<string, unknown> | undefined;
  if (c && typeof c === 'object') {
    if (typeof c.unlocked === 'boolean') base.completion.unlocked = c.unlocked;
    if (typeof c.reflection === 'string') base.completion.reflection = c.reflection.slice(0, 2000);
    if (Array.isArray(c.actionPrinciples)) base.completion.actionPrinciples = c.actionPrinciples.filter((x): x is string => typeof x === 'string');
    if (typeof c.certificateIssued === 'boolean') base.completion.certificateIssued = c.certificateIssued;
  }
  if (r.rewardClaimedById && typeof r.rewardClaimedById === 'object') {
    for (const [k, v] of Object.entries(r.rewardClaimedById as Record<string, unknown>)) {
      if (typeof v === 'boolean') base.rewardClaimedById[k] = v;
    }
  }
  if (typeof r.lastRoute === 'string' && r.lastRoute.startsWith('#/')) base.lastRoute = r.lastRoute;
  if (typeof r.updatedAt === 'string') base.updatedAt = r.updatedAt;

  // 파생 상태 재계산: 대화 해금·완료 해금은 저장값을 그대로 믿지 않는다.
  recomputeUnlocks(base);
  return base;
}

/** 해금 규칙 단일 소스: 대화는 5대륙 완료 시, 완료 화면은 대화까지 완료 시. */
export function recomputeUnlocks(save: GameSaveV1): void {
  const continentsDone = CONTINENT_IDS.every((id) => save.missions[id].status === 'completed');
  const d = save.missions.dialogue;
  if (d.status === 'locked' && continentsDone) d.status = 'available';
  if (!continentsDone && d.status !== 'completed') d.status = 'locked';
  save.completion.unlocked = continentsDone && d.status === 'completed';
}

/** 버전 마이그레이션 자리 — v2 도입 시 migrateSaveV1ToV2 추가 */
function migrate(raw: unknown): unknown {
  return raw;
}

class SaveRepository {
  private state: GameSaveV1;
  private saveQueued = false;

  constructor() {
    this.state = this.load();
  }

  get(): GameSaveV1 {
    return this.state;
  }

  hasValidSave(): boolean {
    try {
      return localStorage.getItem(SAVE_KEY) !== null && this.state.profile !== null;
    } catch {
      return false;
    }
  }

  private load(): GameSaveV1 {
    let text: string | null = null;
    try {
      text = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      console.warn('[Save] localStorage 접근 불가 — 메모리 저장으로 진행', err);
      return defaultSave();
    }
    if (text === null) return defaultSave();
    try {
      const raw = migrate(JSON.parse(text));
      return validateSave(raw);
    } catch (err) {
      console.warn('[Save] 손상된 저장 데이터 — 백업 후 기본값 복구', err);
      try {
        localStorage.setItem(BACKUP_KEY, text);
      } catch {
        /* 백업 실패해도 진행 */
      }
      return defaultSave();
    }
  }

  /** 같은 프레임의 연속 변경을 1회 저장으로 합침. 저장 실패는 게임을 멈추지 않는다. */
  persist(): void {
    if (this.saveQueued) return;
    this.saveQueued = true;
    queueMicrotask(() => {
      this.saveQueued = false;
      this.state.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
        bus.emit('SAVE_COMPLETED', { at: this.state.updatedAt });
      } catch (err) {
        console.error('[Save] 저장 실패', err);
        bus.emit('SAVE_FAILED', { message: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  update(fn: (save: GameSaveV1) => void): void {
    fn(this.state);
    recomputeUnlocks(this.state);
    this.persist();
  }

  setCheckpoint(missionId: MissionId, checkpointId: string, data?: Record<string, unknown>): void {
    this.update((s) => {
      const m = s.missions[missionId];
      if (m.status === 'available') m.status = 'in_progress';
      m.checkpointId = checkpointId;
      if (data) m.data = { ...m.data, ...data };
    });
    bus.emit('MISSION_CHECKPOINT', { missionId, checkpointId });
  }

  /** 미션 완료 처리 — 스탬프·보상은 1회만 지급(중복 방지). */
  completeMission(missionId: MissionId, score: number, dimensions: Record<string, number>): void {
    const rewardKey = `mission.${missionId}`;
    this.update((s) => {
      const m = s.missions[missionId];
      m.attempts += 1;
      m.bestScore = Math.max(m.bestScore, Math.round(score));
      m.scoreDimensions = dimensions;
      if (m.status !== 'completed') {
        m.status = 'completed';
        m.completedAt = new Date().toISOString();
      }
      m.checkpointId = null;
      if (!s.rewardClaimedById[rewardKey]) {
        s.rewardClaimedById[rewardKey] = true;
        if (!s.stamps.includes(missionId)) s.stamps.push(missionId);
      }
    });
    bus.emit('MISSION_COMPLETE', { missionId, score });
  }

  /** 새 여행 시작 — 호출 전 반드시 확인 모달을 거칠 것. */
  reset(): void {
    this.state = defaultSave();
    this.persist();
  }
}

export const saveRepo = new SaveRepository();
