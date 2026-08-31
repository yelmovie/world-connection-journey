import { bus } from './EventBus';
import type { GameSaveV1, MissionId, MissionSave } from '../types';
import { CONTINENT_IDS, MISSION_IDS } from '../types';

export const SAVE_KEY = 'world_connection_journey.save.v1';
const BACKUP_KEY = 'world_connection_journey.save.v1.corrupt-backup';
const TEACHER_PASSWORD = 'yelsam';

/** 교사용 비밀번호는 저장 데이터와 분리하고 입력값만 대소문자 구분 없이 비교한다. */
export function matchesTeacherPassword(value: string): boolean {
  return value.trim().toLowerCase() === TEACHER_PASSWORD;
}

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
    settings: { bgm: true, sfx: true, reducedMotion: false, volume: 0.8 },
    completion: {
      unlocked: false,
      reflection: '',
      placedPuzzlePieceIds: [],
      reflectionDrafts: {
        initialThought: '',
        evidenceLearned: '',
        revisedThought: '',
        transferApplication: ''
      },
      actionPrinciples: [],
      certificateIssued: false
    },
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
      airplaneId: typeof p.airplaneId === 'string' ? p.airplaneId : 'plane1'
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
    // volume이 없는 구 저장은 기본값 0.8 유지, 범위 밖 값은 0~1로 클램프
    if (typeof s.volume === 'number' && Number.isFinite(s.volume)) {
      base.settings.volume = Math.max(0, Math.min(1, s.volume));
    }
  }
  const c = r.completion as Record<string, unknown> | undefined;
  if (c && typeof c === 'object') {
    if (typeof c.unlocked === 'boolean') base.completion.unlocked = c.unlocked;
    if (typeof c.reflection === 'string') base.completion.reflection = c.reflection.slice(0, 2000);
    if (Array.isArray(c.placedPuzzlePieceIds)) {
      base.completion.placedPuzzlePieceIds = [...new Set(c.placedPuzzlePieceIds.filter(
        (id): id is MissionId => typeof id === 'string' && MISSION_IDS.includes(id as MissionId)
      ))];
    }
    const drafts = c.reflectionDrafts as Record<string, unknown> | undefined;
    if (drafts && typeof drafts === 'object' && !Array.isArray(drafts)) {
      if (typeof drafts.initialThought === 'string') base.completion.reflectionDrafts.initialThought = drafts.initialThought.slice(0, 60);
      if (typeof drafts.evidenceLearned === 'string') base.completion.reflectionDrafts.evidenceLearned = drafts.evidenceLearned.slice(0, 60);
      if (typeof drafts.revisedThought === 'string') base.completion.reflectionDrafts.revisedThought = drafts.revisedThought.slice(0, 60);
      if (typeof drafts.transferApplication === 'string') base.completion.reflectionDrafts.transferApplication = drafts.transferApplication.slice(0, 100);
    }
    if (Array.isArray(c.actionPrinciples)) {
      base.completion.actionPrinciples = [...new Set(c.actionPrinciples
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.slice(0, 60))
        .filter(Boolean))].slice(0, 2);
    }
    if (typeof c.certificateIssued === 'boolean') base.completion.certificateIssued = c.certificateIssued;
    // Older v1 saves did not persist puzzle/draft progress. A previously issued
    // certificate is authoritative proof that the puzzle had been completed.
    if (base.completion.certificateIssued) base.completion.placedPuzzlePieceIds = [...MISSION_IDS];
  }
  if (r.rewardClaimedById && typeof r.rewardClaimedById === 'object') {
    for (const [k, v] of Object.entries(r.rewardClaimedById as Record<string, unknown>)) {
      if (typeof v === 'boolean') base.rewardClaimedById[k] = v;
    }
  }
  if (r.teacherUnlocked === true) base.teacherUnlocked = true;
  if (typeof r.lastRoute === 'string' && r.lastRoute.startsWith('#/')) base.lastRoute = r.lastRoute;
  if (typeof r.updatedAt === 'string') base.updatedAt = r.updatedAt;

  // 파생 상태 재계산: 대화 해금·완료 해금은 저장값을 그대로 믿지 않는다.
  recomputeUnlocks(base);
  normalizeMissionRewards(base);
  return base;
}

function normalizeMissionRewards(save: GameSaveV1): void {
  save.stamps = MISSION_IDS.filter((id) => save.missions[id].status === 'completed');
  for (const id of MISSION_IDS) {
    const key = `mission.${id}`;
    if (save.missions[id].status === 'completed') save.rewardClaimedById[key] = true;
    else delete save.rewardClaimedById[key];
  }
}

/**
 * 교사용 전체 정답 처리의 단일 상태 변환.
 *
 * 학생이 이미 만든 점수·배움 기록은 덮어쓰지 않고, 미션 완료 여부와 보상만
 * 일관되게 맞춘다. 비밀번호 검증은 UI 세션에서만 맡고 저장 데이터에는 남기지 않는다.
 */
export function markAllMissionsCompletedForTeacher(
  save: GameSaveV1,
  completedAt = new Date().toISOString()
): void {
  for (const id of MISSION_IDS) {
    const mission = save.missions[id];
    mission.status = 'completed';
    mission.checkpointId = null;
    mission.completedAt ??= completedAt;
  }
  // 모든 미션이 실제 완료 상태가 되므로 임시 해금 플래그는 더 이상 필요하지 않다.
  save.teacherUnlocked = false;
  recomputeUnlocks(save);
  normalizeMissionRewards(save);
}

/**
 * 교사용 해금 상태를 적용하는 단일 변환.
 *
 * 다섯 대륙은 원래부터 열려 있으므로 실제 변화는 마지막 대화와 완주 화면에
 * 집중된다. 기존 진행/완료 상태는 건드리지 않고 잠긴 항목만 연다.
 */
export function applyTeacherUnlock(save: GameSaveV1): void {
  save.teacherUnlocked = true;
  for (const id of MISSION_IDS) {
    if (save.missions[id].status === 'locked') save.missions[id].status = 'available';
  }
  recomputeUnlocks(save);
}

/** 해금 규칙 단일 소스: 대화는 5대륙 완료 시, 완료 화면은 대화까지 완료 시. */
export function recomputeUnlocks(save: GameSaveV1): void {
  const continentsDone = CONTINENT_IDS.every((id) => save.missions[id].status === 'completed');
  const d = save.missions.dialogue;
  // 교사가 수업용으로 전체 해금한 경우에는 선행 조건 잠금을 적용하지 않는다.
  if (save.teacherUnlocked === true) {
    for (const id of MISSION_IDS) {
      if (save.missions[id].status === 'locked') save.missions[id].status = 'available';
    }
    save.completion.unlocked = true;
    return;
  }
  if (!continentsDone) {
    // 완료/해금 값을 직접 주입한 저장 데이터도 선행 미션 없이는 인정하지 않는다.
    d.status = 'locked';
  } else if (d.status === 'locked') {
    d.status = 'available';
  }
  save.completion.unlocked = continentsDone && d.status === 'completed';
}

/** schemaVersion 도입 전 저장(v0)을 v1 envelope로 올린다. */
export function migrateSave(raw: unknown): unknown {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const looksLikeLegacySave = record.schemaVersion === undefined
      && ('profile' in record || 'missions' in record || 'settings' in record);
    if (looksLikeLegacySave) return validateSave({ ...record, schemaVersion: 1 });
  }
  return raw;
}

function isSupportedSave(raw: unknown): boolean {
  return typeof raw === 'object'
    && raw !== null
    && !Array.isArray(raw)
    && (raw as Record<string, unknown>).schemaVersion === 1;
}

/** 필드 단위 정리 전에 원본 보존이 필요한 구조 손상인지 판별한다. */
export function isRestorableSaveDocument(raw: unknown): boolean {
  if (!isSupportedSave(raw)) return false;
  const record = raw as Record<string, unknown>;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!(record.profile === null || isRecord(record.profile))) return false;
  if (!isRecord(record.missions) || !isRecord(record.settings) || !isRecord(record.completion)) return false;
  if (!Array.isArray(record.stamps) || !isRecord(record.rewardClaimedById)) return false;
  if (typeof record.lastRoute !== 'string' || typeof record.updatedAt !== 'string') return false;
  const missions = record.missions;
  return MISSION_IDS.every((id) => {
    const mission = missions[id];
    if (!isRecord(mission)) return false;
    return mission.status === 'locked'
      || mission.status === 'available'
      || mission.status === 'in_progress'
      || mission.status === 'completed';
  });
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
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem(SAVE_KEY) !== null && this.state.profile !== null;
    } catch {
      return false;
    }
  }

  private load(): GameSaveV1 {
    if (typeof localStorage === 'undefined') return defaultSave();
    let text: string | null = null;
    try {
      text = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      console.warn('[Save] localStorage 접근 불가 — 메모리 저장으로 진행', err);
      return defaultSave();
    }
    if (text === null) return defaultSave();
    try {
      const raw = migrateSave(JSON.parse(text));
      if (!isSupportedSave(raw)) throw new Error('지원하지 않는 저장 형식');
      if (!isRestorableSaveDocument(raw)) {
        // parse 가능한 v1은 원문을 백업한 뒤, 유효한 필드만 최대한 살린다.
        console.warn('[Save] 일부 구조가 손상된 저장 데이터 — 원본 백업 후 복구');
        try {
          localStorage.setItem(BACKUP_KEY, text);
        } catch {
          /* 백업 실패해도 필드 단위 복구는 계속 */
        }
      }
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
      // 체크포인트는 스냅샷이다. 이전 회차의 필드가 새 회차에 섞이지 않도록 교체하되,
      // 배움 기록과 완성된 학습 산출물은 회차와 무관하므로 항상 보존한다.
      const learn = m.data.learn;
      const artifact = m.data.artifact;
      m.data = data ? { ...data } : {};
      if (learn !== undefined && m.data.learn === undefined) m.data.learn = learn;
      if (artifact !== undefined && m.data.artifact === undefined) m.data.artifact = artifact;
    });
    bus.emit('MISSION_CHECKPOINT', { missionId, checkpointId });
  }

  /** 미션 완료 처리 — 스탬프·보상은 1회만 지급(중복 방지). */
  completeMission(missionId: MissionId, score: number, dimensions: Record<string, number>): void {
    const rewardKey = `mission.${missionId}`;
    this.update((s) => {
      const m = s.missions[missionId];
      m.attempts += 1;
      const roundedScore = Math.round(score);
      if (roundedScore >= m.bestScore) {
        m.bestScore = roundedScore;
        m.scoreDimensions = { ...dimensions };
      }
      if (m.status !== 'completed') {
        m.status = 'completed';
        m.completedAt = new Date().toISOString();
      }
      m.checkpointId = null;
      // 진행 스냅샷은 비우되 배움 기록과 미션 산출물은 남긴다 — 여권·세계 협의가 이걸 읽는다.
      const persistentData: Record<string, unknown> = {};
      if (m.data.learn !== undefined) persistentData.learn = m.data.learn;
      if (m.data.artifact !== undefined) persistentData.artifact = m.data.artifact;
      // 유럽 관심 엽서는 완료 뒤 다시 열어 볼 수 있어야 하므로 진행 산출물도 보존한다.
      if (m.data.europeProgress !== undefined) persistentData.europeProgress = m.data.europeProgress;
      // 아시아 공동 제안은 완료 뒤 세계회의·재방문에서 다시 읽을 수 있어야 한다.
      if (m.data.asiaProgress !== undefined) persistentData.asiaProgress = m.data.asiaProgress;
      // 오세아니아 바다 공동 제안도 완료 뒤 세계회의·재방문에서 다시 읽을 수 있어야 한다.
      if (m.data.oceaniaProgress !== undefined) persistentData.oceaniaProgress = m.data.oceaniaProgress;
      // 아프리카 공동 제안과 해결 실험도 재방문·세계회의에서 다시 읽을 수 있어야 한다.
      if (m.data.africaProgress !== undefined) persistentData.africaProgress = m.data.africaProgress;
      // 지구회의 공동약속은 완료 뒤에도 다시 볼 수 있어야 한다.
      if (m.data.earth !== undefined) persistentData.earth = m.data.earth;
      // 아메리카 탐험 진행과 지구 신호 — 재방문·지구회의(Stage 6)가 읽는다.
      if (m.data.exploreProgress !== undefined) persistentData.exploreProgress = m.data.exploreProgress;
      if (m.data.earthSignals !== undefined) persistentData.earthSignals = m.data.earthSignals;
      m.data = persistentData;
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

  /**
   * 교사용 전체 해금 — 수업 시연·특정 미션만 다루는 차시를 위해 모든 미션을 열어 둔다.
   * 학생 진행 기록(점수·도장·회고)은 지우지 않고, 아직 못 연 미션만 '도전 가능'으로 바꾼다.
   * recomputeUnlocks가 선행 조건을 다시 잠그지 못하도록 teacherUnlocked 플래그로 표시한다.
   */
  unlockAllForTeacher(): void {
    this.update((s) => {
      applyTeacherUnlock(s);
    });
  }

  /**
   * 교사용 전체 정답 처리 — 명시 확인 뒤에만 UI에서 호출한다.
   * 모든 미션을 완료 상태로 바꾸고 도장·보상·완료 화면 접근을 한 번에 맞춘다.
   */
  completeAllForTeacher(): void {
    this.update((s) => {
      markAllMissionsCompletedForTeacher(s);
    });
  }

  /** 교사용 전체 해금을 끝내고 학생의 실제 완료 기록에 맞는 순서 잠금으로 돌아간다. */
  restoreProgressionAfterTeacherUnlock(): void {
    this.update((s) => {
      s.teacherUnlocked = false;
    });
  }

  isTeacherUnlocked(): boolean {
    return this.state.teacherUnlocked === true;
  }
}

export const saveRepo = new SaveRepository();
