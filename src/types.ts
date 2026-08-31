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

export type EuropeMissionScreen = 'map' | 'window' | 'gallery' | 'reason' | 'question' | 'postcard';

/** 유럽 미션의 선택·글쓰기 진행 상태. 배열에는 화면 순서가 아닌 안정적인 콘텐츠 ID만 저장한다. */
export interface EuropeMissionProgress {
  schemaVersion: 2;
  screen: EuropeMissionScreen;
  activeCountryId: string | null;
  activeVisualId: string | null;
  visitedCountryIds: string[];
  viewedVisualIds: string[];
  savedVisualIds: string[];
  selectedCountryId: string | null;
  selectedEvidenceId: string | null;
  reasonPromptId: string | null;
  reasonDraft: string;
  questionStarterId: string | null;
  questionDraft: string;
  postcardCompleted: boolean;
  stampAwarded: boolean;
  updatedAt: string;
}

export type AsiaMissionScreen =
  | 'map'
  | 'culture'
  | 'compare'
  | 'signals'
  | 'issue'
  | 'council'
  | 'solutions'
  | 'proposal';

/** 아시아 권역 탐험의 복원 가능한 상태. 배열에는 화면 순서가 아닌 안정적인 콘텐츠 ID만 저장한다. */
export interface AsiaMissionProgress {
  schemaVersion: 2;
  screen: AsiaMissionScreen;
  activeRegionId: string | null;
  activeExampleId: string | null;
  activeSceneId: string | null;
  visitedRegionIds: string[];
  viewedCountryExampleIds: string[];
  viewedVisualSceneIds: string[];
  savedDiscoveryIds: string[];
  comparisonSceneIds: string[];
  comparisonSimilarityId: string | null;
  comparisonDifferenceId: string | null;
  comparisonNeedsCheck: boolean;
  observationDrafts: Record<string, string>;
  curiosityQuestionDrafts: Record<string, string>;
  comparisonQuestionDraft: string;
  discoveredSignalIds: string[];
  exploredConnectionTypes: string[];
  selectedIssueId: string | null;
  listenedPerspectiveIds: string[];
  selectedPerspectiveIds: string[];
  perspectiveReasonDraft: string;
  selectedActionIds: string[];
  proposalDraft: string;
  missionCompleted: boolean;
  stampAwarded: boolean;
  updatedAt: string;
}

export type OceaniaMissionScreen =
  | 'map'
  | 'culture'
  | 'compare'
  | 'signals'
  | 'issue'
  | 'council'
  | 'solutions'
  | 'proposal';

/** 오세아니아 대륙·섬 탐험의 복원 가능한 상태. 화면 순서가 아닌 안정적인 콘텐츠 ID만 저장한다. */
export interface OceaniaMissionProgress {
  schemaVersion: 2;
  screen: OceaniaMissionScreen;
  activeZoneId: string | null;
  activeCountryExampleId: string | null;
  activeVisualSceneId: string | null;
  visitedZoneIds: string[];
  viewedCountryExampleIds: string[];
  viewedVisualSceneIds: string[];
  savedDiscoveryIds: string[];
  comparisonSceneIds: string[];
  comparisonNatureId: string | null;
  comparisonCultureId: string | null;
  comparisonNeedsCheck: boolean;
  observationDrafts: Record<string, string>;
  curiosityQuestionDrafts: Record<string, string>;
  comparisonQuestionDraft: string;
  discoveredSignalIds: string[];
  exploredOceanConnectionTypes: string[];
  selectedIssueId: string | null;
  listenedPerspectiveIds: string[];
  selectedPerspectiveIds: string[];
  perspectiveReasonDraft: string;
  selectedActionIds: string[];
  proposalDraft: string;
  missionCompleted: boolean;
  stampAwarded: boolean;
  updatedAt: string;
}

export type AfricaMissionScreen =
  | 'intro'
  | 'map'
  | 'region'
  | 'instrument'
  | 'rhythm'
  | 'signal'
  | 'environment'
  | 'impact'
  | 'council'
  | 'solution'
  | 'proposal';

/** 아프리카 권역·문화·환경 협력 탐험의 복원 가능한 진행 상태. */
export interface AfricaMissionProgress {
  schemaVersion: 2;
  screen: AfricaMissionScreen;
  activeRegionId: string | null;
  visitedRegions: string[];
  visitedCountries: string[];
  discoveredGeographyClues: string[];
  discoveredCultureExamples: string[];
  instrumentLab: {
    completed: boolean;
    exploredInstrumentIds: string[];
    createdRhythm: number[];
  };
  environmentInvestigation: {
    selectedIssueId: string | null;
    inspectedSignalIds: string[];
  };
  solutionLab: {
    completed: boolean;
    selectedActions: string[];
    finalMetrics: {
      environment: number;
      communitySafety: number;
      cultureAndHome: number;
      sustainability: number;
      feasibility: number;
      fairness: number;
    } | null;
  };
  jointProposal: {
    completed: boolean;
    selectedIdeas: string[];
    reason: string;
  };
  passportStampAwarded: boolean;
  updatedAt: string;
}

/**
 * 미션에서 실제로 일어난 학습 과정을 다음 화면까지 운반하는 공통 산출물.
 * 점수·도장과 달리 '무엇을 듣고 어떻게 생각을 고쳤는가'를 저장한다.
 */
export interface MissionArtifact {
  schemaVersion: 1;
  missionId: MissionId;
  title: string;
  purpose: string;
  initialHypothesis: string;
  evidenceIds: string[];
  evidenceLabel: string;
  voiceId: string;
  voiceName: string;
  voiceLine: string;
  firstDecision: string;
  observedConsequence: string;
  revisedDecision: string;
  rationale: string;
  transferPrompt: string;
  earnedAt: string;
}

export interface Profile {
  nickname: string;
  createdAt: string;
  avatarId: string;
  airplaneId: string;
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
      /** 배운 원칙을 미션 밖의 새 상황에 적용한 학생의 답 */
      transferApplication: string;
    };
    actionPrinciples: string[];
    certificateIssued: boolean;
  };
  rewardClaimedById: Record<string, boolean>;
  /** 교사용 전체 해금 — 수업 시연·부분 차시용. 켜져 있으면 선행 조건 잠금을 적용하지 않는다. */
  teacherUnlocked?: boolean;
  lastRoute: string;
  updatedAt: string;
}

/** 평가 가중치 — 설계 문서 확정값 */
export const SCORE_WEIGHTS = {
  evidence: 30,
  perspective: 25,
  communication: 25,
  revision: 15,
  growthBonusCap: 5
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
