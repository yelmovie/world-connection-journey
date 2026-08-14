/** 미션 식별자 — 배열 index 대신 항상 이 ID를 사용한다. */
export type MissionId = 'asia' | 'europe' | 'africa' | 'americas' | 'oceania' | 'dialogue';

export const MISSION_IDS: readonly MissionId[] = ['asia', 'europe', 'africa', 'americas', 'oceania', 'dialogue'];
export const CONTINENT_IDS: readonly MissionId[] = ['asia', 'europe', 'africa', 'americas', 'oceania'];

export type MissionStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface MissionSave {
  status: MissionStatus;
  checkpointId: string | null;
  bestScore: number;
  attempts: number;
  completedAt: string | null;
  /** 평가 차원별 점수 (근거/관점/소통/수정) */
  scoreDimensions: Record<string, number>;
  /** 미션별 체크포인트 복원용 데이터 */
  data: Record<string, unknown>;
}

export interface Profile {
  nickname: string;
  createdAt: string;
  avatarId: string;
  airplaneId: string;
  inquiryQuestionId: string;
}

export interface GameSaveV1 {
  schemaVersion: 1;
  profile: Profile | null;
  missions: Record<MissionId, MissionSave>;
  stamps: string[];
  settings: {
    bgm: boolean;
    sfx: boolean;
    reducedMotion: boolean;
    /** 마스터 볼륨 0~1 (기본 0.8) — BGM·SFX 모두에 곱해진다 */
    volume: number;
  };
  completion: {
    unlocked: boolean;
    reflection: string;
    placedPuzzlePieceIds: MissionId[];
    reflectionDrafts: {
      initialThought: string;
      evidenceLearned: string;
      revisedThought: string;
    };
    actionPrinciples: string[];
    certificateIssued: boolean;
  };
  rewardClaimedById: Record<string, boolean>;
  lastRoute: string;
  updatedAt: string;
}

/** 평가 가중치 — 설계 문서 확정값 */
export const SCORE_WEIGHTS = {
  evidence: 30,
  perspective: 25,
  communication: 25,
  revision: 15,
  speedBonusCap: 5
} as const;

export const PASS_SCORE = 70;

export interface AssetRecord {
  type: 'image';
  src: string;
  original?: string;
  pages?: string[];
  preload?: 'core' | 'page';
  alpha?: boolean;
  license?: string;
  note?: string;
}

export interface AssetManifest {
  schemaVersion: number;
  assets: Record<string, AssetRecord>;
}
