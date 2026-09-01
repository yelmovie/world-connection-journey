import type { Page } from '../router';
import { navigate } from '../router';
import { collectedEarthSignals, continentLabel } from '../core/earthSignals';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo, recomputeUnlocks } from '../core/SaveRepository';
import { createPhaserHost, GAME_H, GAME_W, type PhaserHost } from '../core/phaserHost';
import { buildTopBar } from '../ui/chrome';
import { createGuide, type GuideController } from '../ui/guide';
import { burstConfetti } from '../ui/fx';
import {
  cancelJourneyTransition,
  consumeMissionReturn,
  playJourneyTransition
} from '../ui/journeyTransition';
import { cancelJourneyBridge, playDepartureBridge } from '../ui/journeyBridge';
import { readLearnCard } from '../ui/learnFrame';
import { reactionCounts } from '../ui/characterDialogue';
import {
  missionCompanionAssetId,
  selectedAirplaneAssetId,
  selectedAirplanePortraitAssetId
} from '../ui/airplaneFleet';
import { selectedAvatarSpeaker } from '../ui/avatarRoster';
import type { MissionId, MissionStatus } from '../types';

interface Spot {
  id: MissionId;
  name: string;
  route: string;
  /** 학습 주제 2~6자 — 지도가 "무엇을 배우는 지도"로 읽히게 노드·안내판에 표시 */
  topic: string;
  objective: string;
  steps: [string, string, string];
  minutes: number;
  x: number;
  y: number;
  assetId: string;
  assetAlt: string;
}

/** 화살표키 탐색 순서와 지도 번호가 같다. */
const SPOTS: Spot[] = [
  {
    id: 'americas', name: '아메리카', route: '#/mission/americas', topic: '대륙 탐험과 생활', minutes: 12,
    objective: '지도를 직접 움직여 네 나라를 탐험하고, 그곳에 사는 친구들을 만나 봐.',
    steps: ['지도에서 네 나라 찾기', '나라 속 탐험과 친구의 문화 가방', '하루 비교로 닮은 점 찾기'],
    x: 0.70, y: 0.34, assetId: 'americas.student1', assetAlt: '아메리카 미션에서 만날 친구'
  },
  {
    id: 'europe', name: '유럽', route: '#/mission/europe', topic: '여러 나라와 도시', minutes: 8,
    objective: '유럽 여러 나라의 모습을 비교하고, 가장 궁금한 나라를 사진 근거와 질문으로 남겨.',
    steps: ['일곱 나라 문화 장면 탐색', '사진과 여행가 이야기 듣기', '여행에서 알게 된 것 연결하기'],
    x: 0.18, y: 0.32, assetId: 'europe.guide', assetAlt: '유럽 미션에서 만날 여행 가이드'
  },
  {
    id: 'africa', name: '아프리카', route: '#/mission/africa', topic: '다섯 지역과 연결', minutes: 12,
    objective: '다섯 지역의 열 나라 사례를 살피고, 소리와 환경 신호를 이어 공동 해결안을 만들어.',
    steps: ['다섯 지역과 열 나라 탐험', '실제 악기·여덟 박 신호 체험', '환경 영향과 공동 해결안 연결'],
    x: 0.24, y: 0.58, assetId: 'africa.host', assetAlt: '아프리카 미션에서 만날 리듬 안내 친구'
  },
  {
    id: 'asia', name: '아시아', route: '#/mission/asia', topic: '여러 지역과 이어진 지구', minutes: 8,
    objective: '비행기로 아시아 여러 나라를 둘러보고 네팔 친구의 하루를 탐험해.',
    steps: ['아시아 항로 둘러보기', '네팔에 착륙해 대화', '이야기 나누며 퀴즈 풀기'],
    x: 0.39, y: 0.46, assetId: 'asia.mina', assetAlt: '아시아 여러 지역을 함께 살펴볼 여행 친구'
  },
  {
    id: 'oceania', name: '오세아니아', route: '#/mission/oceania', topic: '섬·대륙과 하나의 바다', minutes: 11,
    objective: '다섯 탐험 구역의 자연·오늘날 생활·살아 있는 문화를 비교하고 바다로 이어진 공동 제안을 만들어.',
    steps: ['다섯 탐험 구역 지도 비교', '지역 사례와 환경 신호 관찰', '여러 주체의 공동 제안 만들기'],
    x: 0.51, y: 0.75, assetId: 'oceania.youth', assetAlt: '오세아니아 미션에서 만날 섬 탐험 친구'
  },
  {
    id: 'dialogue', name: '하나의 지구, 여섯 개의 신호', route: '#/mission/respect-dialogue', topic: '세계 친구와 환경', minutes: 14,
    objective: '여섯 나라 친구를 만나고, 전·후 사진에서 달라진 배려와 환경 신호를 찾아 세계 친구 지구회의에서 공동약속을 만들어.',
    steps: ['여섯 친구 만나기', '전·후 사진 변화 찾기', '환경 신호와 공동약속'],
    x: 0.69, y: 0.70, assetId: 'greeting.colombia', assetAlt: '마지막 존중 대화를 함께할 인사 친구'
  }
];

if (new Set(SPOTS.map((spot) => spot.route)).size !== SPOTS.length) {
  throw new Error('세계 지도 설정 오류: 서로 다른 단계가 같은 경로를 사용하고 있어요.');
}

/** 새 태평양 중심 배경에서 한국의 위치. 첫 항로와 비행기는 여기서 출발한다. */
const KOREA_HOME = { x: 0.505, y: 0.43 } as const;
const PLANE_Y_OFFSET = 132;

function planePosition(x: number, y: number): { x: number; y: number } {
  return { x: x * GAME_W, y: Math.max(92, y * GAME_H - PLANE_Y_OFFSET) };
}

/** 배움 카드 칩 아이콘 (이모지 금지 — §6) */
const SVG_CARD = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 9h6M9 13h6"/></svg>`;

/** 새 사진 도착 신호 아이콘 */
const SVG_MAIL = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`;

/** 완료했지만 배움 카드는 못 받은 미션 — 재탐험 이유가 된다. */
function hasLearnCardFor(missionId: MissionId): boolean {
  return readLearnCard(missionId).earned;
}

/** 2회차 상황 덱(P2-16) — 완주한 대륙을 다시 열 이유. 목표는 전부 학습 행동이다. */
const REPLAY_DECK: Record<MissionId, string> = {
  americas: '2회차 도전 — 이번엔 네 나라의 장면에서 "물"과 관련된 모습만 찾아보며 탐험해 봐.',
  europe: '2회차 도전 — 지난번과 다른 나라를 골라 새 회의 기록을 만들어 봐. 기록이 갱신돼!',
  africa: '2회차 도전 — 리듬 규칙 3개를 전부 첫 시도에 통과하는 무결점 연주에 도전해 봐.',
  asia: '2회차 도전 — 지난번에 못 들은 목소리를 모두 듣고 와 봐.',
  oceania: '2회차 도전 — 숨은 변화를 한 번도 빗나가지 않고 찾아봐.',
  dialogue: '2회차 도전 — 다른 환경 문제를 골라 회의를 다시 열어 봐. 이전 약속은 남아 있어.'
};

/** 완료한 미션의 2회차 도전 문구. 아시아는 저장된 heardPerspectiveIds로 완청 여부를 반영한다. */
function replayDeckText(missionId: MissionId, missionData: unknown): string {
  if (missionId === 'asia') {
    const heard = (missionData as { regionalExploration?: { heardPerspectiveIds?: unknown } } | undefined)
      ?.regionalExploration?.heardPerspectiveIds;
    if (Array.isArray(heard) && heard.length >= 4) {
      return '2회차 도전 — 목소리를 모두 들었어! 이번엔 장면 속 연결을 다시 살펴봐.';
    }
  }
  return REPLAY_DECK[missionId];
}

/** 대화 반응 배지 4종(P2-16) — 빈 칸이 보여야 다시 하고 싶어진다. */
function badgeShelf(): string {
  const counts = reactionCounts();
  const badges = [
    { label: '질문 탐험가', hint: '친구에게 더 물어보기 3번', earned: (counts.ask ?? 0) >= 3 },
    { label: '마음 통역가', hint: '공감으로 반응하기 3번', earned: (counts.empathy ?? 0) >= 3 },
    { label: '이야기 다리', hint: '내 이야기 들려주기 3번', earned: (counts.share ?? 0) >= 3 },
    { label: '골고루 대화가', hint: '세 반응 모두 써 보기', earned: ['ask', 'empathy', 'share'].every((key) => (counts[key] ?? 0) >= 1) }
  ];
  // 금테 비밀 도장 — 조건을 밝히지 않는다. 여섯 배움 카드를 모두 받으면 열린다.
  const secretEarned = SPOTS.every((spot) => hasLearnCardFor(spot.id));
  const slots = badges.map((badge) => `<span class="map-badge${badge.earned ? ' is-earned' : ''}" title="${badge.hint}">
    <i aria-hidden="true">${badge.earned ? '★' : ''}</i>${badge.label}</span>`).join('');
  const secret = `<span class="map-badge map-badge--secret${secretEarned ? ' is-earned' : ''}" title="${secretEarned ? '여섯 배움 카드의 주인' : '숨은 조건이 있어!'}">
    <i aria-hidden="true">${secretEarned ? '◉' : '?'}</i>${secretEarned ? '금테 비밀 도장' : '비밀 도장'}</span>`;
  const earnedCount = badges.filter((badge) => badge.earned).length + (secretEarned ? 1 : 0);
  return `<div class="map-badges" aria-label="대화 배지 진열장, ${earnedCount}/5 획득">
    <strong>대화 배지 진열장 · ${earnedCount}/5</strong>
    <div class="map-badges__row">${slots}${secret}</div>
  </div>`;
}

const STATUS_LABEL: Record<MissionStatus, string> = {
  locked: '아직 잠겨 있음',
  available: '지금 도전 가능',
  in_progress: '이어서 할 수 있음',
  completed: '완료'
};

const MAP_CSS = `
.map-node-mail {
  position:absolute;top:-4px;right:-4px;width:34px;height:34px;border-radius:50%;background:var(--c-coral);color:#fff;
  display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:var(--shadow-card);z-index:3;
  animation:map-mail-ping 1.3s ease-out infinite;
}
.map-node-mail.is-arriving { animation:map-mail-pop .45s cubic-bezier(.2,1.4,.4,1) both, map-mail-ping 1.3s ease-out .45s infinite; }
@keyframes map-mail-ping { 0%{box-shadow:0 0 0 0 rgba(242,109,109,.65)} 100%{box-shadow:0 0 0 16px rgba(242,109,109,0)} }
@keyframes map-mail-pop { from{transform:scale(0)} to{transform:scale(1)} }
:root[data-reduced-motion="true"] .map-node-mail { animation:none; }
/* 지도 원화가 화면 전체를 채우고 상단바·안내판·캐릭터만 그 위에 뜬다. */
.map-page {
  --guide-size:clamp(140px,15vw,220px);
  grid-template-rows:auto minmax(0,1fr);background:#69b9dc;isolation:isolate;overflow:hidden;
}
.map-page::before {
  content:'';position:absolute;inset:-3%;z-index:-1;pointer-events:none;
  background-image:linear-gradient(rgba(14,46,76,.16),rgba(14,46,76,.26)),var(--map-bg);
  background-position:center;background-size:cover;opacity:.28;filter:blur(12px) saturate(.8);transform:scale(1.04);
}
.map-page .top-bar {
  position:relative;z-index:calc(var(--z-panel) + 2);height:auto;min-height:var(--top-bar-h);padding-block:var(--sp-2);
  background:linear-gradient(180deg,rgba(12,43,73,.64) 0%,rgba(12,43,73,.36) 72%,rgba(12,43,73,.14) 100%);
  box-shadow:0 18px 28px rgba(10,38,68,.14);backdrop-filter:blur(3px) saturate(1.08);
}
.map-page > .guide-wrap {
  position:absolute;left:clamp(4px,2vw,34px);bottom:clamp(4px,1.5vh,18px);grid-row:auto;height:calc(var(--guide-size) + var(--scene-safe));
  z-index:calc(var(--z-panel) + 1);pointer-events:none;
}
.map-page > .guide-wrap .guide-mascot-button { bottom:var(--scene-safe);pointer-events:auto; }
.map-page > .guide-wrap .guide-bubble { bottom:var(--scene-safe);pointer-events:auto; }
/* 왼쪽 안내 캐릭터가 지도 안쪽을 바라보도록 좌우 반전한다. */
.map-page > .guide-wrap .guide-mascot { transform:scaleX(-1);animation-name:map-guide-bob; }
@keyframes map-guide-bob {
  0%,100% { transform:scaleX(-1) translateY(0); }
  50% { transform:scaleX(-1) translateY(-12px); }
}
.map-layout {
  position:relative;min-height:0;width:100%;max-width:none;margin:0;padding:0;display:block;overflow:hidden;
}
/* §7 반투명 패널 — 배경 지도가 비쳐 보이게 */
.map-layout .scene-board, .map-layout .mission-brief {
  background: var(--glass-panel); backdrop-filter: blur(9px) saturate(1.05);
}
/* 지도는 "패널"이 아니라 배경 일러스트 자체다 — 창처럼 덮지 않고 테두리만 둔다 */
.map-world {
  position:absolute;inset:0;isolation:isolate;width:100%;height:100%;max-width:none;aspect-ratio:auto;
  background:transparent;min-width:0;min-height:0;border:0;border-radius:0;overflow:hidden;box-shadow:none;
}
.map-canvas,.map-overlay { position:absolute;inset:0; }
.map-canvas { z-index:var(--z-canvas);touch-action:none; }
.map-canvas canvas { display:block; }
.map-overlay { z-index:var(--z-overlay);pointer-events:none; }
.map-route-layer { position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none; }
.map-route-shadow { fill:none;stroke:rgba(25,50,77,.45);stroke-width:1.3; }
.map-route-focus { fill:none;stroke:#f2c14e;stroke-width:.75;stroke-linecap:round;stroke-dasharray:2.2 1.5;opacity:0;filter:drop-shadow(0 0 3px rgba(242,193,78,.9)); }
.map-route-focus.is-lit { opacity:1;animation:map-route-dash 650ms linear 1; }
@keyframes map-route-dash { from{stroke-dashoffset:10}to{stroke-dashoffset:0} }
.map-hotspot { position:absolute!important;z-index:2;transform:translate(-50%,-50%);pointer-events:auto!important;--node-size:clamp(84px,7vw,116px); }
.map-hotspot.is-selected { z-index:4; }
.map-home {
  position:absolute;z-index:1;transform:translate(-50%,-50%);display:grid;place-items:center;
  width:18px;height:18px;border:3px solid #fff;border-radius:50%;background:var(--c-coral);
  box-shadow:0 0 0 6px rgba(242,193,78,.45),0 4px 12px rgba(13,38,66,.38);
}
.map-home::after {
  content:'한국 출발점';position:absolute;top:20px;left:50%;transform:translateX(-50%);
  padding:3px 8px;border-radius:999px;background:rgba(14,36,64,.88);color:#fff;
  font-size:16px;font-weight:800;line-height:1.2;white-space:nowrap;
}
.map-hotspot .node-img,
.map-brief__head .mission-brief__hero {
  object-fit:contain;object-position:center bottom;padding:6px 7px 0;
  background:radial-gradient(circle at 50% 38%,rgba(224,250,255,.46),rgba(34,126,161,.18) 68%,transparent 72%);
}
.map-hotspot[data-state="locked"] { filter:grayscale(.8) brightness(.75);cursor:pointer; }
.map-hotspot[data-state="locked"].is-selected { filter:grayscale(.2) brightness(.94); }
/* 색이 차오르는 지도(P2-12) — 아직 안 간 대륙은 옅고, 완료하면 온전한 색이 된다 */
.map-hotspot[data-state="available"] .node-img,
.map-hotspot[data-state="in_progress"] .node-img { filter:saturate(.32) brightness(.97); }
.map-hotspot[data-state="available"].is-selected .node-img,
.map-hotspot[data-state="in_progress"].is-selected .node-img { filter:none; }
/* 완료 대륙에 모은 환경 신호 개수 뱃지 */
.map-node-signals { position:absolute;left:50%;top:-16px;transform:translateX(-50%);padding:2px 10px;border-radius:999px;background:var(--c-turquoise);color:#063c3e;border:2px solid #fff;font:900 16px/1.3 var(--font-head);white-space:nowrap;box-shadow:var(--shadow-card);z-index:4; }
.map-hotspot[data-state="available"] .node-label { border-color:var(--c-coral); }
.map-hotspot[data-state="in_progress"] .node-label { border-color:var(--c-violet); }
.map-hotspot[data-state="completed"] .node-label { background:var(--c-success);color:#fff;border-color:#17633f; }
/* 라벨 겹침 원천 차단: 고른 대륙만 이름표를 보여 주고, 나머지는 그림+번호로 안내한다.
   대륙 이름은 오른쪽 안내판과 aria-label에 그대로 남는다. */
.map-hotspot .node-label { display:none; }
.map-hotspot.is-selected .node-label { display:none; }
.map-node-check { position:absolute;right:-4px;top:0;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--c-success);color:#fff;border:3px solid #fff;font-size:24px;font-weight:900;box-shadow:var(--shadow-card); }
/* 완료 스테이지는 멀리서도 구분되게 — 초록 링 + 완료 리본 */
.map-hotspot[data-state="completed"] .node-img { box-shadow:0 0 0 5px rgba(46,173,120,.85),0 0 0 9px rgba(46,173,120,.28),var(--shadow-card); }
.map-hotspot[data-state="completed"]::after { content:'완료!'; position:absolute;left:50%;bottom:-14px;transform:translateX(-50%);padding:3px 14px;border-radius:999px;background:var(--c-success);color:#fff;font:900 16px/1.2 var(--font-head);border:2px solid #fff;box-shadow:var(--shadow-card);white-space:nowrap;z-index:4; }
/* 노드 라벨 2행: 대륙명 + 학습 주제 — "무엇을 배우는 지도"로 읽히게 */
.map-hotspot .node-topic { display:block;font-size:max(18px,var(--fs-small));font-weight:700;color:var(--c-ink-soft);line-height:1.25;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis; }
.map-hotspot[data-state="completed"] .node-topic { color:#eaf7ef; }
/* 완료 노드의 배움 카드 획득 칩 */
.map-node-learn { position:absolute;left:-4px;top:0;display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:var(--c-gold);color:#5b430a;border:2px solid #fff;box-shadow:var(--shadow-card); }
.map-world-deco { position:absolute;z-index:3;pointer-events:none;filter:drop-shadow(0 8px 18px rgba(0,0,0,.3)); }
/* 대륙에서 모은 것이 마지막 회의로 이어진다는 걸 매 화면에서 보이게 한다 */
.map-brief__replay { margin:var(--sp-1) 0 0;padding:8px 12px;border-radius:12px;background:#fff3cf;border:2px solid #e8bf4e;color:#5b430a;font-size:max(16px,var(--fs-small));font-weight:850;line-height:1.4; }
.map-bag { margin-top:var(--sp-2);padding:10px 12px;border-radius:14px;background:rgba(255,253,246,.9);border:2px solid rgba(255,255,255,.8); }
.map-bag strong { display:block;font-family:var(--font-head);font-size:max(17px,var(--fs-small));color:var(--c-navy); }
.map-bag ul { margin:6px 0 0;padding:0;list-style:none;display:grid;gap:4px; }
.map-bag li { display:flex;gap:7px;align-items:baseline;font-size:max(16px,var(--fs-small));font-weight:800;color:var(--c-ink); }
.map-bag em { flex:0 0 auto;padding:1px 8px;border-radius:999px;background:#e8f2fb;color:#1c5a8c;font-style:normal;font-size:16px;font-weight:900;white-space:nowrap; }
.map-bag__more { color:var(--c-ink-soft);font-size:16px;font-weight:750; }
/* 대화 배지 진열장(P2-16) — 빈 칸이 재플레이 이유가 된다 */
.map-badges { margin-top:var(--sp-2);padding:9px 12px;border-radius:14px;background:rgba(255,253,246,.9);border:2px solid rgba(255,255,255,.8); }
.map-badges strong { display:block;font-family:var(--font-head);font-size:max(16px,var(--fs-small));color:var(--c-navy); }
.map-badges__row { margin-top:6px;display:flex;flex-wrap:wrap;gap:5px; }
.map-badge { display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;border:2px dashed #b9cbd6;background:#fff;color:var(--c-ink-soft);font-size:16px;font-weight:850;white-space:nowrap; }
.map-badge i { display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#e8eef2;font-style:normal;font-size:16px; }
.map-badge.is-earned { border-style:solid;border-color:var(--c-violet);background:#f3efff;color:var(--c-violet-ink); }
.map-badge.is-earned i { background:var(--c-violet);color:#fff; }
.map-badge--secret.is-earned { border-color:#c79a2c;background:linear-gradient(160deg,#fff6dc,#ffe9a8);color:#6f5514;box-shadow:0 0 0 2px rgba(242,193,78,.35); }
.map-badge--secret.is-earned i { background:var(--c-gold);color:#5b430a; }
.map-brief {
  position:absolute;right:var(--scene-safe);top:var(--sp-3);z-index:var(--z-panel);width:clamp(280px,20vw,360px);
  height:auto;max-height:calc(100% - var(--sp-5));overflow-y:auto;overflow-x:hidden;
  padding:clamp(12px,1.5vw,20px);gap:10px;border:2px solid rgba(255,255,255,.72);box-shadow:var(--shadow-pop);
}
.map-brief__head { display:grid;grid-template-columns:88px 1fr;gap:var(--sp-3);align-items:center; }
.map-brief__head .mission-brief__hero { width:88px;height:88px;aspect-ratio:1;border-radius:50%;border:4px solid #fff;box-shadow:var(--shadow-card); }
.map-brief__head h2 { color:var(--c-navy);font-size:var(--fs-title);line-height:1.05; }
.map-brief__topic {
  display:inline-block;vertical-align:middle;margin-top:var(--sp-2);padding:4px 12px;border-radius:999px;
  background:rgba(242,193,78,.24);border:2px solid rgba(242,193,78,.75);color:#6f5514;
  font-size:max(18px,var(--fs-small));font-family:var(--font-head);white-space:nowrap;
}
.map-brief__status { display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:6px 12px;border-radius:999px;background:#fff;border:2px solid var(--c-line);font-size:max(18px,var(--fs-small));font-weight:800; }
.map-brief__status::before { content:'●';color:var(--c-violet); }
.map-brief__objective { display:none;max-width:32ch;line-height:1.4; }
.map-brief__flow { display:grid;gap:5px;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.58);border:1px solid rgba(25,50,77,.14); }
.map-brief__flow strong { font-size:max(16px,var(--fs-small)); }
.map-brief__flow .mission-brief__steps { font-size:max(16px,var(--fs-small));line-height:1.35; }
.map-brief__locked { margin:0;padding:9px 11px;border-radius:12px;background:rgba(242,193,78,.2);border:2px solid rgba(199,166,77,.55);font-weight:850;line-height:1.35; }
.map-brief .btn-primary { min-height:60px; }
.map-brief__actions { display:grid;gap:var(--sp-2);margin-top:auto; }
.map-teacher-mode {
  display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:12px;
  color:#4d3510;background:rgba(242,193,78,.24);border:2px solid rgba(199,166,77,.7);
  font-size:max(16px,var(--fs-small));font-weight:900;line-height:1.3;
}
.map-teacher-mode::before { content:'✓';display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--c-gold);color:#4d3510; }
.map-page:has(.map-teacher-mode) .map-brief__status { display:none; }
.map-live { position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%); }
@media (max-width:1100px), (max-height:620px) {
  .map-layout { padding:0; }
  .map-brief { top:6px;right:8px;width:270px;max-height:calc(100% - 12px); }
  .map-hotspot { --node-size:74px; }
  .map-home::after { font-size:16px; }
  .map-hotspot.is-selected .node-label { padding:3px 9px; }
  .map-hotspot .node-badge { width:32px;height:32px;font-size:18px; }
  .map-brief { padding:12px;gap:9px; }
  .map-brief__head { grid-template-columns:68px 1fr; }
  .map-brief__head .mission-brief__hero { width:68px;height:68px; }
  .map-brief__status { min-height:48px;padding:4px 9px;font-size:18px; }
}
@media (max-height:760px) and (min-width:901px) {
  .map-layout { padding:0; }
  .map-brief { padding:9px;gap:6px; }
  .map-brief__head { grid-template-columns:60px 1fr;gap:8px; }
  .map-brief__head .mission-brief__hero { width:60px;height:60px;border-width:3px; }
  .map-brief__head h2 { font-size:clamp(26px,2.2vw,34px); }
  .map-brief__topic { margin-top:2px;padding:2px 8px;font-size:16px; }
  .map-brief__status { min-height:40px;padding:3px 8px;font-size:16px; }
  .map-brief__objective { font-size:18px;line-height:1.3; }
  .map-brief__flow { padding:6px 9px;gap:2px; }
  .map-brief__flow strong,.map-brief__flow .mission-brief__steps { font-size:16px; }
  .map-brief__flow .mission-brief__steps { gap:1px; }
  .map-brief__locked { padding:6px 8px;font-size:16px; }
  .map-brief .btn-primary { min-height:50px;font-size:18px; }
}
@media (max-width:1100px) {
  .map-page > .guide-wrap { display:none; }
  .map-layout { display:grid;grid-template-rows:minmax(0,1fr) auto;padding:0;overflow:hidden; }
  .map-world { position:relative;inset:auto;width:100%;height:100%;min-height:0; }
  .map-brief {
    position:relative;inset:auto;width:auto;height:auto;max-height:none;margin:0 8px 8px;
    display:grid;grid-template-columns:minmax(0,1fr) minmax(190px,32vw);align-items:center;gap:8px;padding:9px 11px;
  }
  .map-brief__head,.map-brief__status,.map-brief__flow { display:none; }
  .map-brief__objective { display:block;max-width:none;font-size:18px;line-height:1.3; }
  .map-brief__locked,.map-teacher-mode { grid-column:1/-1; }
  .map-brief__actions { margin-top:0; }
  .map-brief .btn-primary { width:100%;min-width:0; }
}
@media (max-width:600px) {
  .map-layout { display:grid;grid-template-columns:1fr;grid-template-rows:auto auto;gap:6px;padding:6px 10px;overflow-y:auto; }
  .map-world { position:relative;inset:auto;width:100%;height:auto;min-height:300px;aspect-ratio:auto;background-position:center;background-size:cover;border:2px solid rgba(255,255,255,.72);border-radius:var(--radius-m); }
  .map-canvas,.map-route-layer,.map-world-deco,.map-home { display:none; }
  .map-overlay { position:relative!important;inset:auto!important;width:100%!important;height:auto!important;min-height:100%;padding:8px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-content:start;overflow:visible;pointer-events:auto; }
  .map-hotspot { position:relative!important;left:auto!important;top:auto!important;transform:none!important;width:100%;min-height:72px;--node-size:64px;display:grid;grid-template-columns:64px 1fr; }
  .map-hotspot .node-img { width:64px;height:64px;grid-row:1/3; }
  .map-hotspot .node-badge { display:none; }
  /* 목록 모드에서는 이름표가 유일한 단서다 — 전부 다시 보여 준다 */
  .map-hotspot .node-label { display:block;white-space:normal;width:100%; }
  .map-brief { position:relative;inset:auto;width:100%;max-height:none;margin:0;display:grid;grid-template-columns:1fr auto;padding:8px;overflow:visible; }
  .map-brief { min-height:136px;align-self:start; }
  .map-brief__head { display:none; }
  .map-teacher-mode { grid-column:1/-1; }
  .map-brief__objective { font-size:18px; }
  .map-brief .btn-primary { min-width:168px; }
}
@media (prefers-reduced-motion:reduce) { .map-route-focus.is-lit { animation:none; } }
:root[data-reduced-motion="true"] .map-route-focus.is-lit { animation:none; }
`;

export function createPage(): Page {
  let host: PhaserHost | null = null;
  let flyTo: ((x: number, y: number) => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let compactMedia: MediaQueryList | null = null;
  let compactListener: ((event: MediaQueryListEvent) => void) | null = null;
  let guide: GuideController | null = null;
  let celebrateTimer: number | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      compactMedia = window.matchMedia('(max-width:600px)');
      const compact = compactMedia.matches;
      const save = saveRepo.get();
      recomputeUnlocks(save);
      const selectedPlaneFlight = selectedAirplaneAssetId(save.profile?.airplaneId);
      const selectedPlanePortrait = selectedAirplanePortraitAssetId(save.profile?.airplaneId);
      const playerSpeaker = selectedAvatarSpeaker(save.profile);
      const missionCompanions = SPOTS.map((spot) => missionCompanionAssetId(spot.id, selectedPlaneFlight));
      const preloadIds = [
        'bg.map', selectedPlanePortrait, selectedPlaneFlight, playerSpeaker.assetId, ...missionCompanions,
        'prop.globe_glow', 'prop.passport', 'deco.portal_globe',
        'prop.stamp', ...SPOTS.map((spot) => spot.assetId)
      ];
      await preloadImages(preloadIds);
      audio.playBgm('main');

      const availableSpots = SPOTS.filter((spot) => save.missions[spot.id].status !== 'locked');
      const photosPending = save.missions.dialogue.status !== 'completed' && save.missions.dialogue.checkpointId === 'stage4';
      const recommended = (photosPending || save.teacherUnlocked ? availableSpots.find((spot) => spot.id === 'dialogue') : undefined)
        ?? availableSpots.find((spot) => ['in_progress', 'available'].includes(save.missions[spot.id].status))
        ?? availableSpots[availableSpots.length - 1]
        ?? SPOTS[0]!;

      const page = document.createElement('div');
      page.className = 'page map-page';
      page.style.setProperty('--map-bg', `url('${assetUrl('bg.map')}')`);
      const style = document.createElement('style');
      style.textContent = MAP_CSS;
      page.appendChild(style);
      page.appendChild(buildTopBar({
        title: '세계 항로 지도',
        backTo: '#/'
      }));

      const layout = document.createElement('main');
      layout.className = 'page-body map-layout';
      layout.innerHTML = `
        <section class="map-world" aria-label="세계 대륙 미션 지도">
          <div class="map-canvas"></div>
          <div class="map-overlay" role="radiogroup" aria-label="여행할 대륙 선택">
            <span class="map-home" style="left:${KOREA_HOME.x * 100}%;top:${KOREA_HOME.y * 100}%" aria-hidden="true"></span>
            <svg class="map-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path class="map-route-shadow"></path><path class="map-route-focus"></path>
            </svg>
          </div>
        </section>
        <aside class="mission-brief map-brief" aria-label="선택한 미션 안내"></aside>
        <p class="map-live" aria-live="polite"></p>`;
      page.appendChild(layout);
      root.appendChild(page);

      const world = layout.querySelector('.map-world') as HTMLElement;
      const canvasWrap = layout.querySelector('.map-canvas') as HTMLElement;
      const overlay = layout.querySelector('.map-overlay') as HTMLElement;
      const brief = layout.querySelector('.map-brief') as HTMLElement;
      const live = layout.querySelector('.map-live') as HTMLElement;
      const routeShadow = overlay.querySelector('.map-route-shadow') as SVGPathElement;
      const routeFocus = overlay.querySelector('.map-route-focus') as SVGPathElement;
      const nodeById = new Map<MissionId, HTMLButtonElement>();
      const returnCuePeek = consumeMissionReturn();
      const returnCueIsPhotos = returnCuePeek?.kind === 'photos';
      let selectedId = recommended.id;

      guide = createGuide({
        assetId: playerSpeaker.assetId,
        speakerName: playerSpeaker.name
      });
      page.appendChild(guide.el);

      const lastDone = [...SPOTS].reverse().find((spot) => save.missions[spot.id].status === 'completed');
      const routeStart = lastDone ?? KOREA_HOME;

      const updateRoute = (spot: Spot) => {
        const startX = routeStart.x * 100;
        const startY = routeStart.y * 100;
        const endX = spot.x * 100;
        const endY = spot.y * 100;
        const cx = (startX + endX) / 2;
        const cy = Math.max(8, Math.min(startY, endY) - 12);
        const d = `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;
        routeShadow.setAttribute('d', d);
        routeFocus.setAttribute('d', d);
        routeFocus.classList.remove('is-lit');
        void routeFocus.getBoundingClientRect();
        routeFocus.classList.add('is-lit');
      };

      const renderBrief = (spot: Spot) => {
        const currentSave = saveRepo.get();
        const mission = currentSave.missions[spot.id];
        const isLocked = mission.status === 'locked' && !currentSave.teacherUnlocked;
        const lockMessage = spot.id === 'dialogue'
          ? '1~5번 대륙 미션을 모두 완료하면 마지막 단계가 열려요.'
          : '앞선 여행을 완료하면 열려요.';
        const photosArrived = spot.id === 'dialogue' && mission.status !== 'completed' && mission.checkpointId === 'stage4';
        const statusLabel = currentSave.teacherUnlocked && mission.status !== 'completed'
          ? '교사용 해금 · 바로 체험 가능'
          : isLocked ? '마지막 단계 · 미리보기 가능' : STATUS_LABEL[mission.status];
        brief.innerHTML = `
          <div class="map-brief__head">
            ${hasAsset(spot.assetId) ? `<img class="mission-brief__hero" src="${assetUrl(spot.assetId)}" data-asset-id="${spot.assetId}" alt="${spot.assetAlt}">` : ''}
            <div><h2>${photosArrived ? '친구들의 마지막 사진' : spot.name}</h2><span class="map-brief__topic">${photosArrived ? '새 사진 6장 도착' : spot.topic}</span></div>
          </div>
          ${currentSave.teacherUnlocked ? '<p class="map-teacher-mode">교사용 전체 해금 중 · 마지막 단계와 완주 화면까지 열림</p>' : ''}
          <span class="map-brief__status">${photosArrived ? '여행이 끝난 뒤 도착한 사진' : statusLabel}</span>
          <p class="mission-brief__objective">${photosArrived ? '사진 속에서 친구들이 걱정하는 변화를 찾아보세요.' : spot.objective}</p>
          ${photosArrived ? '' : `<div class="map-brief__flow"><ol class="mission-brief__steps">${spot.steps.map((step) => `<li>${step}</li>`).join('')}</ol></div>`}
          ${isLocked ? `<p class="map-brief__locked">${lockMessage}</p>` : ''}
          ${mission.status === 'completed' && spot.id !== 'dialogue' && !hasLearnCardFor(spot.id) ? '<p class="map-brief__replay">아직 이 여행의 배움 카드를 받지 못했어. 다시 탐험하면 받을 수 있어!</p>' : ''}
          ${mission.status === 'completed' ? `<p class="map-brief__replay">${replayDeckText(spot.id, mission.data)}</p>` : ''}
          ${(() => {
            const bag = collectedEarthSignals();
            if (bag.length === 0) return '';
            const shown = bag.slice(-4);
            return `<div class="map-bag"><strong>지구회의 가방 · ${bag.length}개</strong><ul>${shown
              .map((item) => `<li><em>${continentLabel(item.missionId)}</em>${item.label}</li>`)
              .join('')}${bag.length > shown.length ? `<li class="map-bag__more">…앞서 모은 ${bag.length - shown.length}개도 들어 있어</li>` : ''}</ul></div>`;
          })()}
          ${badgeShelf()}
          <div class="map-brief__actions">
            <button class="btn btn-primary btn-big" data-act="depart" ${isLocked ? 'disabled' : ''}>${isLocked ? '1~5번 완료 후 시작하기' : photosArrived ? '환경 신호 확인하기' : mission.status === 'completed' ? (spot.id === 'dialogue' ? '지구회의 다시 열기' : `${spot.name} 다시 탐험하기`) : spot.id === 'dialogue' ? '세계 친구 만나러 가기' : `${spot.name}로 출발하기`}</button>
            ${currentSave.completion.unlocked ? '<button class="btn btn-ghost" data-act="completion">완주 기록 보기</button>' : ''}
          </div>`;
        const depart = brief.querySelector<HTMLButtonElement>('[data-act="depart"]');
        brief.querySelector('[data-act="completion"]')?.addEventListener('click', () => navigate('#/completion'));
        depart?.addEventListener('click', () => {
          if (disposed || depart.disabled) return;
          depart.disabled = true;
          nodeById.forEach((node) => { node.disabled = true; });
          updateRoute(spot);
          // 사진 도착(스토리 긴박) 때는 브릿지를 건너뛴다 — 흐름을 끊지 않는다
          const bridge = photosArrived ? Promise.resolve() : playDepartureBridge(spot.name);
          void bridge.then(() => {
            if (disposed) return;
            flyTo?.(spot.x, spot.y);
            try {
              const transition = playJourneyTransition({
                kind: 'flight',
                label: `${spot.name}로 날아가요!`,
                assetId: selectedPlanePortrait,
                companionAssetId: missionCompanionAssetId(spot.id, selectedPlaneFlight)
              });
              void transition.finished.then(() => {
                if (!disposed) navigate(spot.route);
              });
            } catch (err) {
              console.warn('[Map] 전환 연출 예외, 직접 이동합니다:', err);
              if (!disposed) navigate(spot.route);
            }
          });
        });
      };

      const selectSpot = (spot: Spot, announce = true) => {
        const mission = saveRepo.get().missions[spot.id];
        const isLocked = mission.status === 'locked';
        selectedId = spot.id;
        nodeById.forEach((node, id) => {
          const selected = id === selectedId;
          node.classList.toggle('is-selected', selected);
          node.setAttribute('aria-checked', String(selected));
          node.tabIndex = selected ? 0 : -1;
        });
        updateRoute(spot);
        renderBrief(spot);
        if (announce) {
          live.textContent = isLocked
            ? `${spot.name} 미리보기. ${spot.objective} 1번부터 5번까지 완료하면 시작할 수 있어요.`
            : `${spot.name} 선택. ${spot.objective} 오른쪽 출발 버튼을 눌러요.`;
          void audio.playSfx('tap');
        }
        guide?.say(isLocked
          ? `${spot.name}은 1~5번을 마치면 열려요. 지금은 다른 활동 내용을 미리 볼 수 있어요.`
          : `${spot.name}를 골랐어요. 준비되면 출발해요.`, {
          cue: brief.querySelector<HTMLElement>('[data-act="depart"]'),
          speaker: playerSpeaker
        });
      };

      SPOTS.forEach((spot, index) => {
        const mission = saveRepo.get().missions[spot.id];
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'map-hotspot round-node';
        node.dataset.state = mission.status;
        node.dataset.missionId = spot.id;
        node.setAttribute('role', 'radio');
        node.setAttribute('aria-checked', 'false');
        const hasLearnCard = mission.status === 'completed' && readLearnCard(spot.id).earned;
        node.setAttribute('aria-label', `${spot.name}, ${spot.topic}, ${STATUS_LABEL[mission.status]}${mission.status === 'locked' ? ', 활동 미리보기 가능' : ''}${hasLearnCard ? ', 배움 카드 획득' : ''}`);
        node.style.left = `${spot.x * 100}%`;
        node.style.top = `${spot.y * 100}%`;
        node.innerHTML = `
          ${hasAsset(spot.assetId) ? `<img class="node-img" src="${assetUrl(spot.assetId)}" data-asset-id="${spot.assetId}" alt="${spot.assetAlt}">` : ''}
          <span class="node-badge" aria-hidden="true">${index + 1}</span>
          ${mission.status === 'completed' ? '<span class="map-node-check" aria-hidden="true">✓</span>' : ''}
          ${(() => {
            if (mission.status !== 'completed') return '';
            const signalCount = collectedEarthSignals().filter((item) => item.missionId === spot.id).length;
            return signalCount > 0 ? `<span class="map-node-signals" aria-hidden="true">신호 ${signalCount}</span>` : '';
          })()}
          ${photosPending && !returnCueIsPhotos ? `<span class="map-node-mail" aria-hidden="true">${SVG_MAIL}</span>` : ''}
          ${hasLearnCard ? `<span class="map-node-learn" aria-hidden="true">${SVG_CARD}</span>` : ''}
          <span class="node-label">${spot.name}<span class="node-topic">${spot.topic}</span></span>`;
        node.addEventListener('click', () => {
          selectSpot(spot);
          // 원형 캐릭터를 누르면 바로 그 나라로 출발한다(잠금 상태는 미리보기만).
          const save = saveRepo.get();
          if (save.missions[spot.id].status === 'locked' && !save.teacherUnlocked) return;
          brief.querySelector<HTMLButtonElement>('[data-act="depart"]')?.click();
        });
        node.addEventListener('keydown', (event) => {
          if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const current = SPOTS.findIndex((candidate) => candidate.id === selectedId);
          const nextIndex = event.key === 'Home' ? 0
            : event.key === 'End' ? SPOTS.length - 1
              : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (current + 1) % SPOTS.length
                : (current - 1 + SPOTS.length) % SPOTS.length;
          const next = SPOTS[nextIndex];
          if (next) { selectSpot(next); nodeById.get(next.id)?.focus(); }
        });
        nodeById.set(spot.id, node);
        overlay.appendChild(node);
      });

      selectSpot(recommended, false);

      if (!compact) {
        const backgroundUrl = assetUrl('bg.map');
        const planeId = hasAsset(selectedPlanePortrait) ? selectedPlanePortrait : 'plane.portrait.classic';
        const planeUrl = assetUrl(planeId);
        host = await createPhaserHost(canvasWrap, (Phaser) => {
          class MapScene extends Phaser.Scene {
            private plane?: Phaser.GameObjects.Image;
            constructor() { super('map'); }
            preload() { this.load.image('bg', backgroundUrl); this.load.image('planeSource', planeUrl); }
            create() {
              const bg = this.add.image(GAME_W / 2, GAME_H / 2, 'bg');
              bg.setScale(Math.max(GAME_W / bg.width, GAME_H / bg.height)).setAlpha(1);
              const source = this.textures.get('planeSource').getSourceImage() as CanvasImageSource;
              const badgeTexture = this.textures.createCanvas('selectedPlaneBadge', 160, 160);
              if (badgeTexture) {
                const context = badgeTexture.context;
                context.clearRect(0, 0, 160, 160);
                context.save();
                context.beginPath();
                context.arc(80, 80, 72, 0, Math.PI * 2);
                context.clip();
                context.drawImage(source, 0, 0, 160, 160);
                context.restore();
                context.beginPath();
                context.arc(80, 80, 73, 0, Math.PI * 2);
                context.lineWidth = 8;
                context.strokeStyle = 'rgba(255,255,255,.96)';
                context.stroke();
                badgeTexture.refresh();
              }
              const initialPlanePosition = planePosition(routeStart.x, routeStart.y);
              const plane = this.add.image(
                initialPlanePosition.x,
                initialPlanePosition.y,
                badgeTexture ? 'selectedPlaneBadge' : 'planeSource'
              );
              this.plane = plane;
              plane.setDisplaySize(110, 110);
              if (!isReducedMotion()) {
                this.tweens.add({ targets: plane, y: plane.y - 8, duration: 1200, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
              }
              flyTo = (x, y) => {
                this.tweens.killTweensOf(plane);
                const destination = planePosition(x, y);
                if (isReducedMotion()) { plane.setPosition(destination.x, destination.y); return; }
                this.tweens.add({ targets: plane, x: destination.x, y: destination.y, duration: 650, ease: 'Cubic.easeInOut' });
              };
            }
          }
          return new MapScene();
        }, { scaleMode: 'envelop' });
        if (disposed) { host.destroy(); host = null; return; }

        const syncOverlay = () => {
          const canvas = canvasWrap.querySelector('canvas');
          if (!canvas) return;
          const worldRect = world.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          overlay.style.left = `${canvasRect.left - worldRect.left}px`;
          overlay.style.top = `${canvasRect.top - worldRect.top}px`;
          overlay.style.width = `${canvasRect.width}px`;
          overlay.style.height = `${canvasRect.height}px`;
        };
        resizeObserver = new ResizeObserver(syncOverlay);
        resizeObserver.observe(world);
        window.setTimeout(syncOverlay, 40);
      } else {
        world.style.backgroundImage = `linear-gradient(rgba(12,40,70,.12),rgba(12,40,70,.28)),url('${assetUrl('bg.map')}')`;
      }

      const returnCue = returnCuePeek;
      if (returnCue?.kind === 'photos') {
        // 친구들의 마지막 사진 도착 — 노드마다 메시지 신호가 차례로 켜지고, BGM이 잠깐 잦아든다.
        audio.duck(2200);
        void audio.playSfx('pickup');
        SPOTS.forEach((spot, index) => {
          const node = nodeById.get(spot.id);
          if (!node) return;
          window.setTimeout(() => {
            if (disposed) return;
            const badge = document.createElement('span');
            badge.className = 'map-node-mail is-arriving';
            badge.setAttribute('aria-hidden', 'true');
            badge.innerHTML = SVG_MAIL;
            node.appendChild(badge);
            void audio.playSfx('tap');
          }, isReducedMotion() ? 0 : 260 + index * 220);
        });
        celebrateTimer = window.setTimeout(() => {
          if (disposed) return;
          const dialogueSpot = SPOTS.find((spot) => spot.id === 'dialogue');
          if (dialogueSpot) selectSpot(dialogueSpot, false);
          live.textContent = '여행이 끝난 뒤, 여섯 친구에게 새로운 사진이 도착했어요. 오른쪽의 환경 신호 확인하기를 눌러요.';
          guide?.say('여행이 끝난 뒤, 여섯 친구에게 새로운 사진이 도착했어요.', {
            cue: brief.querySelector<HTMLElement>('[data-act="depart"]'),
            speaker: playerSpeaker,
            autoStart: true
          });
        }, isReducedMotion() ? 0 : 260 + SPOTS.length * 220 + 200);
      } else if (returnCue) {
        celebrateTimer = window.setTimeout(() => {
          if (disposed) return;
          const node = nodeById.get(returnCue.missionId);
          const passportTicket = page.querySelector<HTMLElement>('.journey-ticket');
          if (node) burstConfetti(node, 8);
          if (passportTicket) {
            passportTicket.classList.add('is-new-stamp');
            burstConfetti(passportTicket, 8);
          }
          live.textContent = `${returnCue.missionTitle} 도장이 여권에 찍혔어요. 다음 추천 미션을 확인해 보세요.`;
          guide?.say(`${returnCue.missionTitle} 도장을 받았어요. 다음 여행을 골라요.`, {
            cue: brief.querySelector<HTMLElement>('[data-act="depart"]'),
            speaker: playerSpeaker
          });
        }, isReducedMotion() ? 0 : 180);
      }

      compactListener = () => { if (!disposed) window.dispatchEvent(new Event('hashchange')); };
      compactMedia.addEventListener('change', compactListener);
    },

    unmount() {
      disposed = true;
      if (celebrateTimer !== null) window.clearTimeout(celebrateTimer);
      celebrateTimer = null;
      cancelJourneyTransition();
      cancelJourneyBridge();
      guide?.dispose();
      guide = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (compactMedia && compactListener) compactMedia.removeEventListener('change', compactListener);
      compactMedia = null;
      compactListener = null;
      flyTo = null;
      host?.destroy();
      host = null;
    }
  };
}

function isReducedMotion(): boolean {
  return saveRepo.get().settings.reducedMotion
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
