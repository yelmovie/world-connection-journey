import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { withJosa } from '../core/josa';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { saveRepo } from '../core/SaveRepository';
import { buildTopBar } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { burstConfetti, popBounce } from '../ui/fx';
import { openCharacterDialogue, splitDialogueSentences } from '../ui/characterDialogue';
import { createGuide, type GuideController } from '../ui/guide';
import { getLearn, readLearnRecord, showFriendIntro, showLearningWrap } from '../ui/learnFrame';
import { openModal } from '../ui/modal';
import { collectedEarthSignals, continentLabel } from '../core/earthSignals';
import { selectedAvatarSpeaker } from '../ui/avatarRoster';
import { keepFitted } from '../ui/fitText';
import { queueMissionReturn } from '../ui/journeyTransition';
import { validateEarthProgress, type EarthContent, type GlobalEnvironmentProgress } from '../core/earthCouncil';
import { EARTH_CSS, earthPreloadIds, renderEarthScene } from './earthCouncilScenes';
import type { MissionId } from '../types';

/* ===== 콘텐츠 스키마 (public/content/v1/ko/dialogue.json 기준) ===== */
interface Greeting {
  id: string;
  country: string;
  continent: string;
  location: string;
  introduction: string;
  example: string;
  context: string;
  caution: string;
}
interface ListenOption {
  id: string;
  text: string;
  good: boolean;
  why: string;
}
interface Scenario {
  id: string;
  situation: string;
  cues: string[];
  options: ListenOption[];
}
interface TurnOption {
  id: string;
  text: string;
  empathy: number;
  reply: string;
  leadsTo: number | 'end';
}
interface NpcTurn {
  prompt: string;
  options: TurnOption[];
}
interface RevisionOption {
  text: string;
  better: boolean;
  why: string;
}
interface Npc {
  id: string;
  name: string;
  from: string;
  situation: string;
  firstImpression: string;
  turns: NpcTurn[];
  revision: { question: string; options: RevisionOption[] };
}
interface DialogueContent {
  intro: { title: string; subtitle: string; guide: string };
  greetings: Greeting[];
  listening: { guide: string; scenarios: Scenario[] };
  compass: { guide: string; npcs: Npc[] };
  feedback: { good: string; retry: string; stereotypeWarning: string };
}

interface VisualCompareScene {
  id: string;
  name: string;
  from: string;
  beforeAssetId: string;
  afterAssetId: string;
  mission: string;
  discovery: string;
  /** 찾은 뒤 보여 주는 설명 — 무엇이 달라졌고, 그것이 왜 다른 문화의 친구를 배려하는 일인지 잇는다 */
  insight: string;
  hotspot: { x: number; y: number; label: string };
}

/** 긴 말 선택을 대신하는 6단계 사진 탐정 장면. 한 장면당 비교 1회 + 변화 지점 1회만 수행한다. */
const VISUAL_COMPARE_SCENES: VisualCompareScene[] = [
  {
    id: 'yusra', name: '유스라', from: '모로코',
    beforeAssetId: 'stage6.yusra.before', afterAssetId: 'stage6.yusra.after',
    mission: '말할 기회가 생긴 곳을 찾아!', discovery: '말할 차례 나누기',
    insight: '전에는 친구들이 먼저 말해 버려 유스라가 끼어들 틈이 없었어. 후에는 발표 카드를 들면 차례가 오도록 정했지. 아직 우리말이 서툰 친구도 기다려 주면 자기 생각을 말할 수 있어. 말할 차례를 나누는 건 다른 나라에서 온 친구를 존중하는 첫걸음이야.',
    hotspot: { x: 84, y: 51, label: '유스라의 발표 카드' }
  },
  {
    id: 'kenji', name: '켄지', from: '일본',
    beforeAssetId: 'stage6.kenji.before', afterAssetId: 'stage6.kenji.after',
    mission: '억지 권유가 사라진 곳을 찾아!', discovery: '거절과 선택 존중하기',
    insight: '전에는 켄지가 손을 저어도 계속 음식을 권했어. 후에는 접시를 내밀며 켄지가 직접 고르게 했지. 나라·종교·건강에 따라 먹지 않는 음식이 있을 수 있어. "싫으면 안 먹어도 돼"라고 선택을 존중하는 것이 배려야.',
    hotspot: { x: 63, y: 73, label: '함께 고르는 간식' }
  },
  {
    id: 'amara', name: '아마라', from: '탄자니아',
    beforeAssetId: 'stage6.amara.before', afterAssetId: 'stage6.amara.after',
    mission: '발표를 도와준 변화를 찾아!', discovery: '끝까지 듣고 응원하기',
    insight: '전에는 아마라가 탄자니아 동물 이야기를 하는데 아무도 눈을 맞추지 않았어. 후에는 친구들이 끝까지 듣고 손을 들어 질문했지. 발음이 조금 달라도 끝까지 들어 주고 궁금한 걸 물어보면, 친구는 자기 나라 이야기를 자랑스럽게 할 수 있어.',
    hotspot: { x: 79, y: 61, label: '질문하는 손과 응원 카드' }
  }
];

/** 인사 사례와 같은 지역의 가상 대화 인물 이미지. 실제 개인·지역 전체를 대표하지 않는다. */
const NPC_COLOR: Record<string, string> = {
  npc_yusra: 'var(--c-violet)',
  npc_kenji: 'var(--c-sky)',
  npc_amara: 'var(--c-turquoise)'
};
const NPC_IMG: Record<string, string> = {
  npc_yusra: 'greeting.morocco',
  npc_kenji: 'greeting.japan',
  npc_amara: 'greeting.tanzania'
};
const npcAvatar = (npc: { id: string; name: string }, size: number): string => `
  <span aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;
    background:${NPC_COLOR[npc.id] ?? 'var(--c-sky)'};color:#fff;font-family:var(--font-head);
    font-size:${Math.round(size * 0.42)}px;border:3px solid #fff;box-shadow:var(--shadow-pop)">${npc.name.charAt(0)}</span>`;

const greetingImg = (g: Greeting): string => `greeting.${g.id.replace(/^greet_/, '')}`;

const DIALOGUE_CSS = `
/* 계약 §7 — 배경이 주인공. 패널은 반투명·내용 크기만큼. */
.dialogue-scene {
  --dl-copy: max(18px, var(--fs-body)); --dl-label: max(18px, var(--fs-small));
  --guide-size:clamp(260px,20vw,380px);
}
.dialogue-scene .page-body {
  padding:var(--sp-3) clamp(16px,3vw,48px) clamp(54px,7vh,60px);
  font-size: var(--dl-copy); line-height: 1.55;
}
/* 6단계 전체: 안내 캐릭터 레인(156px)과 아래 바가 본문을 잡아먹어 패널이 잘리고 스크롤이 생기던 문제.
   레인·아래 바를 지구회의 화면과 같은 크기로 줄이고, 캐릭터가 서는 왼쪽 폭만큼 무대를 비켜 세운다. */
.dialogue-scene { --guide-lane-h:clamp(56px,7vh,72px); --bottom-bar-h:clamp(64px,8vh,76px); }
.dialogue-scene .page-body { padding-bottom:8px; }
.dialogue-scene:not(:has(.ec)) .dl-stage { width:calc(100% - var(--guide-size) * .68); margin-left:auto; margin-right:0; } /* 캐릭터 그림의 실제 폭만큼만 비킨다 */
.dialogue-scene .panel {
  background: rgba(255,255,255,.58); backdrop-filter: blur(16px) saturate(1.15);
  border: 1.5px solid rgba(255,255,255,.85); border-radius: var(--radius-l);
  box-shadow: 0 14px 34px rgba(8,30,55,.16), inset 0 1px 0 rgba(255,255,255,.7); padding: clamp(14px, 1.25vw, 22px);
}
.dialogue-scene .card {
  padding: var(--sp-3); background: rgba(255,255,255,0.97);
  border-radius: var(--radius-m); line-height: 1.5;
}
.dialogue-scene .page-body { display:flex; flex-direction:column; } /* 자식 flex:1 이 실제로 남는 높이를 채우게 */
.dl-stage { flex: 1; min-height: 0; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: var(--sp-3); }
.dl-head { display: flex; justify-content: center; flex-shrink: 0; }

/* 대화·사례 모달도 본문과 같은 글자 위계를 사용한다. */
.modal-backdrop .modal {
  width: min(700px, 92vw); max-height: min(90dvh, 800px);
  border: 3px solid rgba(108,76,232,0.22); background:linear-gradient(180deg,rgba(255,253,246,.92),rgba(255,249,234,.86));
  font-size: max(18px, var(--fs-body)); line-height: 1.55;
}
.modal-backdrop .modal > div { max-width: 46em; margin-inline: auto; }
.modal-backdrop .modal p { font-size: max(18px, var(--fs-body)); line-height: 1.55; }
.modal-backdrop .modal-actions .btn { min-height: 56px; font-size: max(18px, var(--fs-small)); padding-inline: 22px; }

/* 1단계 — 인사 사진(크게) + 오른쪽 질문 패널 */
.dl-greet-row { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1.32fr) minmax(340px,0.68fr); gap: var(--sp-4); align-items: start; }
/* 여섯 친구가 한 화면에 다 보여야 한다 — 스크롤 아래로 밀리면 절반은 만나지 못한다 */
.dl-greet-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; align-content: start; min-height: 0; overflow-y: auto; }
.dl-greet-card { min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 7px; }
.dl-greet-card img { width: 100%; height: clamp(84px, 8.4vw, 126px); object-fit: contain; }
/* 넓은 화면에서는 여섯 친구를 한 줄로 — 두 줄이면 아래 세 명이 스크롤 밖으로 사라진다 */
@media (min-width: 1100px) {
  .dl-greet-grid { grid-template-columns: repeat(6, minmax(0,1fr)); align-content: center; }
  .dl-greet-card img { height: clamp(104px, 13vh, 158px); }
}
.dl-greet-card .g-name { font-family: var(--font-head); font-size: var(--dl-copy); }
.dl-greet-card .g-location {
  padding:3px 10px;border-radius:999px;background:#e7f6ff;color:#175888;
  font-size:var(--dl-label);font-weight:850;line-height:1.15;
}
.dl-task { width: 100%; min-height: 0; max-height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-2); align-self: start; }
.dl-ox { display: flex; gap: var(--sp-2); }
.dl-ox .btn { flex: 1; min-height: 58px; font-size: var(--dl-copy); }

/* 2단계 — 상황 + 단서 + 반응 */
.dl-listen { flex: 0 1 auto; align-self: stretch; margin: auto 0; max-height: 100%; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-3); overflow-y: auto; } /* 패널은 내용만큼, 무대 안에서 세로 가운데 */
.dl-listen > * { flex: 0 0 auto; }
.dl-cues { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: var(--sp-2); }
.dl-opt { text-align: left; min-height: 72px; font-size: max(20px, var(--dl-copy)); padding: 14px 18px; }
.dl-scenario { display: grid; grid-template-columns: clamp(96px,9vw,150px) minmax(0,1fr); gap: var(--sp-4); align-items: center; font-size: max(20px, var(--dl-copy)); }
.dl-scenario img { width: clamp(96px,9vw,150px); height: clamp(96px,9vw,150px); object-fit: contain; }
.dl-option-head { display: flex; align-items: center; gap: var(--sp-3); font-weight: 800; font-size: var(--dl-copy); }
.dl-option-head img { width: 64px; height: 64px; object-fit: contain; }

/* 새 2단계 — 긴 말 선택 대신 전·후 사진을 직접 밀고 변화 지점을 찾는다. */
.dl-visual-compare{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(340px,.85fr);gap:14px} /* 설명이 들어갈 옆 패널을 넓힌다 */
.dl-compare-card{min-height:0;display:flex;flex-direction:column;gap:10px;padding:12px!important}
.dl-compare-photo{position:relative;flex:1;min-height:clamp(220px,34vh,420px);overflow:hidden;border-radius:24px;background:#cde8ee;box-shadow:inset 0 0 0 3px rgba(255,255,255,.82),var(--shadow-card)}
.dl-compare-photo img{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover}
.dl-compare-after{clip-path:inset(0 0 0 50%)}
.dl-compare-divider{position:absolute;z-index:3;top:0;bottom:0;left:50%;width:5px;transform:translateX(-50%);background:#fff;box-shadow:0 0 9px rgba(4,31,51,.65);pointer-events:none} /* 드래그는 사진 전체가 받는다 */
.dl-compare-divider::after{content:'↔';position:absolute;left:50%;top:50%;width:52px;height:52px;display:grid;place-items:center;transform:translate(-50%,-50%);border:4px solid #fff;border-radius:50%;background:var(--c-navy);color:#fff;font:950 25px/1 var(--font-head);box-shadow:0 7px 18px rgba(5,34,55,.35)}
.dl-compare-tag{position:absolute;z-index:4;top:14px;padding:6px 16px;border:3px solid #fff;border-radius:999px;color:#fff;font:950 clamp(17px,1.3vw,21px)/1 var(--font-head);text-shadow:0 2px 5px rgba(0,0,0,.55);box-shadow:0 5px 12px rgba(5,34,55,.25);pointer-events:none}
.dl-compare-tag.is-before{left:14px;background:#d65b68}.dl-compare-tag.is-after{right:14px;background:#178b74}
.dl-compare-range{width:100%;height:52px;appearance:none;-webkit-appearance:none;border:3px solid #fff;border-radius:999px;background:linear-gradient(90deg,#f2c344,#ffe58b);box-shadow:inset 0 2px 5px rgba(55,44,12,.2),0 5px 12px rgba(5,34,55,.14);cursor:ew-resize;touch-action:pan-x}
.dl-compare-range::-webkit-slider-thumb{-webkit-appearance:none;width:44px;height:44px;border:4px solid #fff;border-radius:50%;background:var(--c-navy);box-shadow:0 4px 12px rgba(4,31,51,.42);cursor:grab}
.dl-compare-range::-moz-range-thumb{width:38px;height:38px;border:4px solid #fff;border-radius:50%;background:var(--c-navy);box-shadow:0 4px 12px rgba(4,31,51,.42);cursor:grab}
.dl-compare-range:focus-visible{outline:5px solid rgba(255,207,62,.5);outline-offset:3px}
.dl-change-hotspot{position:absolute;z-index:5;left:var(--x);top:var(--y);width:68px;height:68px;transform:translate(-50%,-50%) scale(.84);padding:0;border:5px solid #fff;border-radius:50%;background:rgba(255,207,62,.25);box-shadow:0 0 0 7px rgba(255,207,62,.24),0 8px 20px rgba(4,30,50,.4);opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;cursor:pointer}
.dl-change-hotspot.is-ready{opacity:1;pointer-events:auto;transform:translate(-50%,-50%) scale(1);animation:dl-hotspot-pulse 1.45s ease-out infinite}
.dl-change-hotspot.is-found{background:var(--c-success);animation:none}
.dl-change-hotspot.is-found::after{content:'✓';display:grid;place-items:center;color:#fff;font:950 32px/1 var(--font-head)}
@keyframes dl-hotspot-pulse{0%{box-shadow:0 0 0 0 rgba(255,207,62,.82),0 8px 20px rgba(4,30,50,.4)}100%{box-shadow:0 0 0 18px rgba(255,207,62,0),0 8px 20px rgba(4,30,50,.4)}}
.dl-compare-side{align-self:start;max-height:100%;overflow:auto;min-height:0;display:flex;flex-direction:column;gap:12px;align-items:stretch;text-align:center}
.dl-compare-person{display:grid;grid-template-columns:58px 1fr;align-items:center;gap:10px;padding:10px 13px;border-radius:18px;background:#eef8fb;text-align:left}
.dl-compare-person span:first-child{width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:var(--c-navy);color:#fff;font:950 28px/1 var(--font-head)}
.dl-compare-person strong{display:block;font:950 clamp(22px,1.8vw,29px)/1.15 var(--font-head)}
.dl-compare-person small{font-size:clamp(15px,1vw,18px);font-weight:800;color:var(--c-ink-soft)}
.dl-compare-mission{padding:14px;border:3px dashed #e4b633;border-radius:18px;background:#fff7d8;font:950 clamp(21px,1.6vw,27px)/1.35 var(--font-head);word-break:keep-all}
.dl-compare-result{min-height:clamp(80px,11vh,126px);padding:14px 16px;display:grid;gap:8px;align-content:start;text-align:left;border-radius:18px;background:#e9f8f4;color:#176249;font:950 clamp(21px,1.55vw,26px)/1.35 var(--font-head)}
.dl-compare-result[hidden]{display:none}
.dl-compare-result b{font:950 clamp(20px,1.5vw,25px)/1.25 var(--font-head)}
.dl-compare-result span{font:700 clamp(16px,1.15vw,20px)/1.45 var(--font-body);color:#1f4d42;word-break:keep-all}
.dl-compare-photo{cursor:ew-resize;touch-action:pan-y}
.dl-photo-progress{margin-top:4px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.dl-photo-progress span{height:12px;border-radius:999px;background:#c8d6dc;box-shadow:inset 0 2px 4px rgba(0,0,0,.12)}
.dl-photo-progress span.is-done{background:var(--c-success)}.dl-photo-progress span.is-now{background:var(--c-gold)}
@media(max-width:940px){.dl-visual-compare{grid-template-columns:1fr}.dl-compare-photo{min-height:330px}.dl-compare-side{display:grid;grid-template-columns:1fr 1fr}.dl-photo-progress{grid-column:1/-1}.dl-compare-result{min-height:100px}}
@media(max-height:720px) and (min-width:941px){.dl-compare-photo{min-height:300px}.dl-compare-person span:first-child{width:48px;height:48px}.dl-compare-person{grid-template-columns:48px 1fr}.dl-compare-result{min-height:96px}}

/* 3단계 — 왼쪽 인물·나침반 / 오른쪽 대화 */
.dl-talk { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(320px,0.72fr) minmax(0,1.55fr); gap: var(--sp-4); }
.dl-who { min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); overflow: hidden; }
.dl-portrait { width: clamp(120px, min(15vw, 26vh), 240px); height: clamp(120px, min(15vw, 26vh), 240px); border-radius: 50%; object-fit: cover; border: 5px solid #fff; box-shadow: var(--shadow-pop); }
.dl-chat { align-self: stretch; min-height: 0; display: flex; flex-direction: column; justify-content: center; gap: clamp(10px, 2.4cqh, 22px); overflow: hidden; container-type: size; } /* 양쪽 패널이 같은 높이 — 넘치면 스크롤 대신 글자를 줄인다 */
/* 패널이 클수록 말풍선·선택지도 커져 빈 곳이 남지 않는다 */
.dl-chat #dlg-area { gap: clamp(8px, 2cqh, 18px) !important; }
.dl-chat .dl-opt { min-height: clamp(64px, 25cqh, 150px); font-size: clamp(18px, 4.3cqh, 28px); padding: clamp(10px, 2.4cqh, 20px) clamp(14px, 2.8cqh, 26px); }
.dl-chat .npc-bubble { font-size: clamp(18px, 4cqh, 27px); padding: clamp(12px, 2.4cqh, 22px) clamp(16px, 2.8cqh, 26px); }
.dl-chat #stage3-fb .feedback { font-size: clamp(17px, 3cqh, 23px); }
.dl-council { width:min(1180px,100%);margin:auto;display:grid;gap:var(--sp-3);align-content:center; }
.dl-council__intro { padding:14px 18px;border-radius:18px;background:rgba(245,251,255,.72);backdrop-filter:blur(6px); }
.dl-council__issues { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-3); }
.dl-council__issue { min-height:220px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;background:rgba(255,255,255,.82)!important; }
.dl-council__issue img { width:96px;height:96px;object-fit:contain;border-radius:50%;background:#e8f7ff; }
.dl-council__evidence { font-size:max(15px,var(--fs-small));line-height:1.35;color:var(--c-ink-soft);font-weight:700; }
.dl-council__issue.is-viewed { border-color:var(--c-success);box-shadow:0 0 0 3px rgba(39,145,92,.2); }
.dl-council__promises { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px;border-radius:18px;background:rgba(248,245,236,.74);backdrop-filter:blur(6px); }
.dl-council__promise { min-height:78px;text-align:left;font:inherit;font-weight:800;line-height:1.4;background:rgba(255,255,255,.86); }
.dl-council__promise[aria-pressed="true"] { border-color:var(--c-turquoise);background:#e6fbfa;box-shadow:0 0 0 3px rgba(16,195,200,.2); }

/* NPC 말풍선 — 가이드 스트립(하단 흰 말풍선)과 확실히 다르게 보이도록
   본문 안, 보라 테두리 + 연보라 배경 + 왼쪽 꼬리 + 인물 아바타 */
.npc-bubble {
  position: relative; display: flex; align-items: flex-start; gap: var(--sp-2);
  background: linear-gradient(180deg, #f3efff, #e9e2ff);
  border: 2px solid var(--c-violet); border-radius: var(--radius-l);
  padding: var(--sp-3) var(--sp-4); margin-left: 12px;
  box-shadow: var(--shadow-card); font-size: var(--dl-copy); line-height: 1.55; font-weight: 700; color: var(--c-ink);
}
.npc-bubble::before {
  content: ''; position: absolute; left: -12px; top: 22px;
  border: 10px solid transparent; border-right-color: var(--c-violet); border-left: 0;
}
.npc-bubble .npc-say { flex: 1; min-width: 0; }

/* 공감 나침반 — 숫자 + 바늘 하나로 단순화 */
.dl-compass { display: flex; align-items: center; gap: var(--sp-2); }
.dl-compass .c-dial { position: relative; width: 78px; height: 78px; flex-shrink: 0; }
.dl-compass .c-num { font-family: var(--font-head); font-size: var(--fs-title); }
.dl-side-btn { display: inline-flex; min-height: 52px; font-size: var(--dl-label); }
.dl-bag-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }
.dl-bag-list li { display: flex; gap: 9px; align-items: baseline; font-size: var(--dl-copy); font-weight: 800; }
.dl-bag-list em { flex: 0 0 auto; padding: 2px 10px; border-radius: 999px; background: #e8f2fb; color: #1c5a8c; font-style: normal; font-size: 15px; font-weight: 900; }

/* 안내선·진행 띠보다 캐릭터와 활동이 먼저 보이게 한다. */
.dialogue-scene > .bottom-bar {
  /* 배경 그림은 살리되 안내와 다음 버튼은 반드시 읽혀야 한다 — 아래로 갈수록 짙어지는 그림자만 깐다 */
  background:linear-gradient(to top,rgba(10,30,52,.92) 0%,rgba(10,30,52,.8) 62%,rgba(10,30,52,0) 100%)!important;
  backdrop-filter:none!important;border:0!important;box-shadow:none!important;
  justify-content:flex-end;gap:var(--sp-3);
}
.dialogue-scene > .bottom-bar .ec-progress {
  margin-right:auto;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.8);
}
.dialogue-scene > .bottom-bar .btn:disabled {
  background:rgba(255,253,246,.34);color:#fff;border:2px solid rgba(255,255,255,.6);
  text-shadow:0 2px 6px rgba(0,0,0,.6);opacity:1;
}
.dialogue-scene :where(.dl-greet-grid,.dl-task,.dl-cues,.dl-chat).tap-cue {
  outline:0!important;animation:none!important;
}

@media (max-height: 620px) {
  .dialogue-scene .page-body { padding:6px clamp(10px,2.5vw,28px) 44px;overflow-y:auto; }
  .dl-stage { flex:none;min-height:430px;gap:var(--sp-2); }
  .dialogue-scene .panel { padding: var(--sp-3); }
  .dialogue-scene .card { padding: 8px 10px; }
  .ribbon-title .ribbon-sub { display: none; }
  /* 낮은 화면(1024×576): 사진 6장을 한 줄로 올리고 질문 패널을 아래로 */
  .dl-greet-row { grid-template-columns: 1fr; grid-template-rows: auto minmax(0,1fr); }
  .dl-greet-grid { grid-template-columns: repeat(6, minmax(0,1fr)); overflow: visible; }
  .dl-greet-card { min-height:98px;padding:3px; }
  .dl-greet-card img { height:clamp(64px,18vh,82px); }
  .dl-task { min-height:108px;overflow:visible; }
  .dl-opt { padding: 8px 11px; min-height: 52px; }
  .npc-bubble { padding: 8px 12px; }
  /* 3단계: 왼쪽 칸이 넘치지 않게 상황 카드를 버튼+모달로 */
  .dl-who .dl-side-card { display: none; }
  .dl-side-btn { display: inline-flex; }
  .dl-compass .c-dial { width: 48px; height: 48px; }
}
@media (min-height:621px) and (max-height:760px) {
  .dl-greet-card { min-height:146px; }
  .dl-greet-card img { height:clamp(98px,15vh,118px); }
}
/* 모바일 가로 — 여섯 인사 카드가 화면을 넘기지 않게 낮춘다 */
@media (max-height: 460px) {
  .dialogue-scene .page-body { padding:4px 8px 34px; }
  .dl-stage { gap:6px; }
  .dl-greet-row { grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);gap:6px; }
  .dl-greet-grid { grid-template-columns:repeat(6,minmax(0,1fr));overflow:visible; }
  .dl-greet-card { min-height:64px;padding:2px; }
  .dl-greet-card img { height:clamp(34px,9vh,48px); }
  .dl-greet-card .g-name { font-size:16px; }
  .dl-greet-card .g-location { display:none; }
  .dl-task { min-height:0; }
  .dl-opt { min-height:44px;padding:6px 10px; }
  .dl-ox .btn { min-height:44px; }
}
@media (max-width: 900px) {
  .dl-greet-row, .dl-talk { grid-template-columns: 1fr; }
  .dl-council__issues,.dl-council__promises { grid-template-columns:1fr; }
  .dialogue-scene { --guide-size:clamp(190px,30vw,260px); }
}
`;

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function createPage(): Page {
  let closeActiveModal: (() => void) | null = null;
  let guide: GuideController | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      disposed = false;
      const content = await loadContent<DialogueContent>('dialogue');
      const earth = await loadContent<EarthContent>('environment');
      // 배움 루프(친구 소개 → 예상 → 활동 → 배움 확인). learn 없으면 기존 흐름 그대로.
      const learn = getLearn(content);
      const hostSpeaker = selectedAvatarSpeaker(saveRepo.get().profile);
      const npcSpeaker = (npc: Npc) => ({ assetId: NPC_IMG[npc.id] ?? hostSpeaker.assetId, name: npc.name });
      const firstSentence = (text: string): string => text.split(/(?<=[.!?])\s+/)[0]?.trim() || text.trim();
      const openGreetingDialogue = (greeting: Greeting, onComplete?: () => void): void => {
        closeActiveModal = openCharacterDialogue({
          id: `greet-story-${greeting.id}`,
          title: `${greeting.country} 친구와 이야기하기`,
          name: `${greeting.country} 사례 친구`,
          meta: `학습용 가상 인물 · ${greeting.continent} · ${greeting.country}`,
          assetId: greetingImg(greeting),
          imageAlt: `${greeting.country}에서 만난 학생 캐릭터`,
          partner: {
            name: hostSpeaker.name,
            meta: '나의 탐험가',
            assetId: hostSpeaker.assetId,
            imageAlt: `${hostSpeaker.name} 탐험가`
          },
          lines: [
            { role: 'partner', label: '먼저 묻기', speaker: hostSpeaker.name, text: `안녕! 넌 어느 나라에서 왔어?` },
            { role: 'character', label: '나라 위치', text: `안녕! 나는 ${greeting.country}에서 왔어. ${greeting.location}` },
            { role: 'character', label: '나라 소개', text: greeting.introduction },
            { role: 'partner', label: '인사 묻기', speaker: hostSpeaker.name, text: `친구를 만날 때는 어떻게 인사해?` },
            { role: 'character', label: '인사 이야기', text: greeting.example },
            { role: 'character', label: '기억할 점', text: greeting.caution }
          ],
          onComplete
        });
      };
      const openListeningSituation = (scenario: Scenario, index: number): void => {
        closeActiveModal = openCharacterDialogue({
          id: `listening-situation-${scenario.id}`,
          name: hostSpeaker.name,
          meta: `상황 ${index + 1} 안내`,
          assetId: hostSpeaker.assetId,
          imageAlt: '경청 상황을 안내하는 대화 탐험가',
          lines: splitDialogueSentences(scenario.situation).map((text, lineIndex) => ({
            label: lineIndex === 0 ? '상황 시작' : '상황 이어보기',
            text
          }))
        });
      };
      await preloadImages([
        'bg.dialogue',
        'icon.compass',
        'icon.listening',
        'icon.heart_speech',
        hostSpeaker.assetId,
        ...content.greetings.map(greetingImg).filter(hasAsset),
        ...VISUAL_COMPARE_SCENES.flatMap((scene) => [scene.beforeAssetId, scene.afterAssetId]),
        ...earthPreloadIds(earth)
      ]);
      audio.playBgm('main');

      /* ===== 진행 상태 ===== */
      const greetingIds = new Set(content.greetings.map((g) => g.id));
      const scenarioIds = new Set(content.listening.scenarios.map((scenario) => scenario.id));
      let stage: 1 | 2 | 3 | 4 = 1;
      const matched = new Set<string>();
      const greetingMistakes = new Set<string>();
      const scenarioMistakes = new Set<string>();
      let firstTryMatches = 0;
      let oxDone = false;
      let oxFirstCorrect = false;
      let oxAttempted = false;
      let scenarioIndex = 0;
      let scenarioFirstGood = 0;
      let visualCompareIndex = 0;
      const visualCompareDone = new Set<string>();
      let npcIndex = 0;
      let empathySum = 0;
      let betterCount = 0;
      let npcTurnIndex = 0;
      let npcPhase: 'turn' | 'revision' = 'turn';
      let earthProgress: GlobalEnvironmentProgress = validateEarthProgress(undefined, earth);
      let busy = false;
      let finished = false;
      const empathyMax = content.compass.npcs.reduce((acc, n) => acc + n.turns.length * 2, 0);

      const presentModal = (opts: Parameters<typeof openModal>[0]): void => {
        if (disposed) return;
        closeActiveModal = openModal(opts);
      };

      const rememberCompletionModal = (): void => {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#overlay-root .modal-actions button'));
        const reviewButton = buttons.find((button) => button.textContent?.includes('한 번 더 보기'));
        if (reviewButton) closeActiveModal = () => reviewButton.click();
      };

      /* ===== 체크포인트 복원 ===== */
      const saved = saveRepo.get().missions.dialogue;
      if (saved.checkpointId) {
        const d = saved.data;
        strArr(d.matched).filter((id) => greetingIds.has(id)).forEach((id) => matched.add(id));
        strArr(d.greetingMistakes).filter((id) => greetingIds.has(id)).forEach((id) => greetingMistakes.add(id));
        strArr(d.scenarioMistakes).filter((id) => scenarioIds.has(id)).forEach((id) => scenarioMistakes.add(id));
        firstTryMatches = Math.max(
          0,
          Math.min(content.greetings.length, Math.floor(num(d.firstTryMatches, Math.max(0, matched.size - greetingMistakes.size))))
        );
        oxDone = d.oxDone === true;
        oxFirstCorrect = d.oxFirstCorrect === true;
        oxAttempted = d.oxAttempted === true;
        scenarioIndex = Math.max(0, Math.min(content.listening.scenarios.length, Math.floor(num(d.scenarioIndex, 0))));
        scenarioFirstGood = Math.max(0, Math.min(content.listening.scenarios.length, Math.floor(num(d.scenarioFirstGood, 0))));
        strArr(d.visualCompareDone).filter((id) => VISUAL_COMPARE_SCENES.some((scene) => scene.id === id)).forEach((id) => visualCompareDone.add(id));
        visualCompareIndex = Math.max(0, Math.min(VISUAL_COMPARE_SCENES.length, Math.floor(num(d.visualCompareIndex, visualCompareDone.size))));
        npcIndex = Math.max(0, Math.min(content.compass.npcs.length, Math.floor(num(d.npcIndex, 0))));
        empathySum = Math.max(0, Math.min(empathyMax, Math.floor(num(d.empathySum, 0))));
        betterCount = Math.max(0, Math.min(content.compass.npcs.length, Math.floor(num(d.betterCount, 0))));
        earthProgress = validateEarthProgress(d.earth, earth);
        npcTurnIndex = Math.max(0, Math.floor(num(d.npcTurnIndex, 0)));
        npcPhase = d.npcPhase === 'revision' ? 'revision' : 'turn';
        const restoredNpc = content.compass.npcs[npcIndex];
        if (!restoredNpc || npcTurnIndex >= restoredNpc.turns.length) npcPhase = 'revision';
        if (saved.checkpointId === 'stage2') stage = 2;
        if (saved.checkpointId === 'stage3') stage = 3;
        if (saved.checkpointId === 'stage4') stage = 4;
      }
      // 완주한 학생이 다시 들어오면 여섯 친구 인사부터 반복하지 않고, 지구회의를 다른 문제로 다시 연다.
      // 학생이 직접 쓴 약속(jointPledgeDraft·personalActionDraft)은 지우지 않는다 — 다시 쓰는 게 아니라 고쳐 쓰는 경험이 되게.
      if (saved.status === 'completed' && saved.data.earth) {
        earthProgress = validateEarthProgress(saved.data.earth, earth);
        earthProgress = {
          ...earthProgress,
          scene: 'issue', missionCompleted: false, inspectedIssueIds: [], councilTurnIndex: 0,
          selectedIssueId: null, listenedPerspectiveIds: [], selectedPerspectiveIds: [],
          perspectiveReason: '', selectedActionIds: [], simulationAttempts: 0
        };
        stage = 4;
      }

      const checkpoint = (id: 'stage1' | 'stage2' | 'stage3' | 'stage4') => {
        saveRepo.setCheckpoint('dialogue', id, {
          // setCheckpoint은 data를 스냅샷으로 통째 교체하므로, learnFrame 기록(data.learn)을 함께 실어 보존한다
          learn: saveRepo.get().missions.dialogue.data.learn,
          matched: [...matched],
          greetingMistakes: [...greetingMistakes],
          scenarioMistakes: [...scenarioMistakes],
          firstTryMatches,
          oxDone,
          oxFirstCorrect,
          oxAttempted,
          scenarioIndex,
          scenarioFirstGood,
          visualCompareIndex,
          visualCompareDone: [...visualCompareDone],
          npcIndex,
          npcTurnIndex,
          npcPhase,
          empathySum,
          betterCount,
          earth: earthProgress
        });
      };

      /* ===== 페이지 골격 ===== */
      const page = document.createElement('div');
      page.className = 'page dialogue-scene';
      page.dataset.assetId = 'bg.dialogue';
      // 배경이 주인공 — 오버레이는 글자 대비에 필요한 만큼만
      page.style.backgroundImage = `linear-gradient(rgba(22, 34, 60, 0.28), rgba(22, 34, 60, 0.42)), url('${assetUrl('bg.dialogue')}')`;
      const pageStyle = document.createElement('style');
      pageStyle.textContent = DIALOGUE_CSS + EARTH_CSS;
      page.appendChild(pageStyle);
      const topBar = buildTopBar({
        title: stage === 4 ? earth.titles.mission : content.intro.title,
        subtitle: stage === 4 ? earth.titles.councilSub : content.intro.subtitle,
        backTo: '#/map'
      });
      page.appendChild(topBar);
      const body = document.createElement('div');
      body.className = 'page-body dialogue-body';
      page.appendChild(body);
      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      page.appendChild(bottom);
      root.appendChild(page);

      // 마스코트 가이드 — NPC 말풍선과 헷갈리지 않게 화면 구석 고정, 조작 안내만 말한다
      guide = createGuide({ assetId: hostSpeaker.assetId, speakerName: hostSpeaker.name, side: 'left' });
      page.appendChild(guide.el);

      /* ===== 1단계: 인사 사례 자유 탐색 ===== */
      const openGreetingInfo = (g: Greeting, onComplete?: () => void) => {
        openGreetingDialogue(g, onComplete);
      };

      function renderStage1(): void {
        const total = content.greetings.length;
        const current = content.greetings.find((g) => !matched.has(g.id));

        body.innerHTML = `
          <div class="dl-stage">
            <div class="dl-head">
              <div class="ribbon-title">
                <span class="ribbon-main">여섯 친구의 인사</span>
              </div>
            </div>
            <div class="dl-greet-row">
              <div id="greet-grid" class="dl-greet-grid"></div>
              <section class="panel dl-task">
                <div id="stage1-task" style="display:flex;flex-direction:column;gap:var(--sp-2)"></div>
                <div id="stage1-fb"></div>
              </section>
            </div>
          </div>`;

        // 다섯 대륙에서 모아 온 것을 먼저 펼쳐 보인다 — 마지막 단계가 갑자기 등장한 별개 게임으로 보이지 않게.
        // renderStage1은 친구를 만날 때마다 다시 불리므로, 14줄 목록은 첫 입장(연결 0개)에서 딱 한 번만 연다.
        const bag = collectedEarthSignals();
        if (bag.length > 0 && matched.size === 0 && !oxDone) {
          openModal({
            id: 'dialogue-bag',
            title: '여섯 대륙에서 모아 온 이야기',
            bodyHtml: `<ul class="dl-bag-list">${bag
              .map((item) => `<li><em>${continentLabel(item.missionId)}</em>${item.label}</li>`)
              .join('')}</ul><p style="margin-top:12px;font-weight:800">이제 이 이야기들을 들고 세계 친구들을 만나러 가자.</p>`,
            dismissible: false,
            actions: [{ label: '가방 챙겼어!', kind: 'primary', autofocus: true, onClick: (close) => close() }]
          });
        }
        const grid = body.querySelector<HTMLElement>('#greet-grid');
        const fb = body.querySelector<HTMLElement>('#stage1-fb');
        if (grid) {
          for (const [index, g] of content.greetings.entries()) {
            const isMatched = matched.has(g.id);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'card card-pick dl-greet-card';
            card.innerHTML = `
              ${hasAsset(greetingImg(g)) ? `<img src="${assetUrl(greetingImg(g))}" data-asset-id="${greetingImg(g)}" alt="${g.country}에서 만난 학생의 인사 사례"${isMatched ? ' style="opacity:0.85"' : ''}>` : `<span style="font-size:var(--fs-title)" aria-hidden="true">?</span>`}
              <span class="g-name" style="color:${isMatched ? 'var(--c-success-ink)' : 'var(--c-ink-soft)'}">${isMatched ? '✓ ' : ''}${g.country}</span>
              <span class="g-location">${g.continent}</span>`;
            card.setAttribute('aria-label', isMatched ? `${g.country}의 인사 사례 — 살펴봄, 다시 보기` : `${g.country}의 인사 사례 살펴보기`);
            card.addEventListener('click', () => {
              if (busy || disposed) return;
              void audio.playSfx('tap');
              if (matched.has(g.id)) {
                openGreetingInfo(g);
                return;
              }
              openGreetingInfo(g, () => {
                if (disposed || matched.has(g.id)) return;
                matched.add(g.id);
                firstTryMatches += 1;
                checkpoint('stage1');
                popBounce(card);
                renderStage1();
              });
            });
            grid.appendChild(card);
          }
        }

        const task = body.querySelector<HTMLElement>('#stage1-task');
        if (task) {
          if (current) {
            task.innerHTML = `
              <div class="card" style="border-width:2px;border-color:var(--c-violet);text-align:center">
                <strong style="font:900 var(--fs-title)/1 var(--font-head);color:var(--c-violet-ink)">${matched.size === total ? '완성!' : `${matched.size}개 연결`}</strong>
                <p style="font-weight:800">친구를 만났어</p>
              </div>`;
          } else if (!oxDone) {
            // 고정관념 점검 확인 질문 — X가 정답
            task.innerHTML = `
              <div class="card" style="border-width:2px;border-color:var(--c-gold)">
                <p style="font-weight:700;margin-bottom:6px">확인 질문</p>
              <p>"한 나라 사람은 <strong>모두 같은 방법</strong>으로 인사한다."</p>
              </div>
              <div class="dl-ox">
                <button class="btn btn-ghost btn-big" data-ox="o">O 맞아요</button>
                <button class="btn btn-ghost btn-big" data-ox="x">X 아니에요</button>
              </div>`;
            task.querySelector('[data-ox="o"]')?.addEventListener('click', () => {
              if (busy || oxDone || disposed) return;
              oxAttempted = true;
              checkpoint('stage1');
              if (fb) showFeedback(fb, 'partial', '나라만 보고 모든 사람을 같다고 할 수 없어요.', 'dialogue');
              guide?.say('같은 나라여도 사람과 상황에 따라 달라요.', { speaker: hostSpeaker, cue: task });
            });
            task.querySelector('[data-ox="x"]')?.addEventListener('click', () => {
              if (busy || oxDone || disposed) return;
              busy = true;
              oxDone = true;
              oxFirstCorrect = !oxAttempted;
              checkpoint('stage1');
              renderStage1();
              busy = false;
            });
          } else {
            task.innerHTML = '';
            if (fb) showFeedback(fb, 'success', '맞아요. 인사 방법은 사람마다 달라요.', 'dialogue');
          }
        }

        bottom.innerHTML = `<button class="btn btn-primary btn-big" data-act="next" ${oxDone ? '' : 'disabled'}>사진 변화 탐정 시작</button>`;
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          if (!oxDone || busy || disposed) return;
          busy = true;
          stage = 2;
          checkpoint('stage2');
          renderStage2();
          busy = false;
        });

        if (current) {
          guide?.say(`${current.country} 친구를 눌러 나라와 인사 이야기를 들어 봐.`, { cue: grid, speaker: hostSpeaker });
        } else if (!oxDone) {
          guide?.say('정말 모두 같은 방법으로 인사할지 생각해요.', { cue: task, speaker: hostSpeaker });
        } else {
          guide?.say('사람마다 다르다는 걸 기억하며 전과 후 사진을 비교해 봐.', {
            cue: bottom.querySelector<HTMLElement>('[data-act="next"]'), speaker: hostSpeaker
          });
        }
      }

      /* ===== 2단계: 전·후 사진 변화 탐정 ===== */
      function renderStage2(): void {
        // 사진 비교가 끝나면 만점 대입 없이 경청 렌즈(선택지 게임)로 이어 간다.
        if (visualCompareDone.size >= VISUAL_COMPARE_SCENES.length) {
          renderListening();
          return;
        }

        const firstUndone = VISUAL_COMPARE_SCENES.findIndex((scene, index) => (
          index >= visualCompareIndex && !visualCompareDone.has(scene.id)
        ));
        const fallbackUndone = VISUAL_COMPARE_SCENES.findIndex((scene) => !visualCompareDone.has(scene.id));
        const index = firstUndone >= 0 ? firstUndone : fallbackUndone;
        const scene = VISUAL_COMPARE_SCENES[index];
        if (!scene) {
          renderListening();
          return;
        }
        visualCompareIndex = index;
        let traveled = 0;
        let lastValue = 50;
        let ready = false;
        let resolved = false;

        const progress = VISUAL_COMPARE_SCENES.map((item, itemIndex) => {
          const state = visualCompareDone.has(item.id) ? 'is-done' : itemIndex === index ? 'is-now' : '';
          return `<span class="${state}" aria-hidden="true"></span>`;
        }).join('');

        body.innerHTML = `
          <div class="dl-stage">
            <div class="dl-head">
              <div class="ribbon-title"><span class="ribbon-main">사진 변화 탐정</span></div>
            </div>
            <section class="dl-visual-compare">
              <div class="panel dl-compare-card">
                <div class="dl-compare-photo">
                  <img src="${assetUrl(scene.beforeAssetId)}" data-asset-id="${scene.beforeAssetId}" alt="${scene.name} 친구 교실의 바뀌기 전 모습">
                  <img class="dl-compare-after" data-after src="${assetUrl(scene.afterAssetId)}" data-asset-id="${scene.afterAssetId}" alt="${scene.name} 친구 교실의 바뀐 뒤 모습">
                  <span class="dl-compare-tag is-before">전</span>
                  <span class="dl-compare-tag is-after">후</span>
                  <span class="dl-compare-divider" data-divider aria-hidden="true"></span>
                  <button type="button" class="dl-change-hotspot" data-change
                    style="--x:${scene.hotspot.x}%;--y:${scene.hotspot.y}%" aria-label="달라진 곳: ${scene.hotspot.label}" disabled></button>
                </div>
                <input class="dl-compare-range" data-range type="range" min="0" max="100" value="50"
                  aria-label="전과 후 사진 비교 손잡이">
              </div>
              <aside class="panel dl-compare-side">
                <div class="dl-compare-person">
                  <span aria-hidden="true">${scene.name.charAt(0)}</span>
                  <div><strong>${scene.name}</strong><small>${scene.from} 친구</small></div>
                </div>
                <div class="dl-compare-mission" data-mission>${scene.mission}</div>
                <div class="dl-compare-result" data-result hidden></div>
                <div class="dl-photo-progress" aria-label="사진 ${index + 1} / ${VISUAL_COMPARE_SCENES.length}">${progress}</div>
              </aside>
            </section>
          </div>`;

        bottom.innerHTML = '<button class="btn btn-primary btn-big" data-act="next" disabled>손잡이를 먼저 밀어 봐</button>';
        const range = body.querySelector<HTMLInputElement>('[data-range]');
        const after = body.querySelector<HTMLElement>('[data-after]');
        const divider = body.querySelector<HTMLElement>('[data-divider]');
        const hotspot = body.querySelector<HTMLButtonElement>('[data-change]');
        const mission = body.querySelector<HTMLElement>('[data-mission]');
        const result = body.querySelector<HTMLElement>('[data-result]');
        const nextBtn = bottom.querySelector<HTMLButtonElement>('[data-act="next"]');

        // 사진 위 가운데 손잡이나 사진 아무 곳이나 눌러 끌어도 아래 슬라이더와 똑같이 움직인다
        const photo = body.querySelector<HTMLElement>('.dl-compare-photo');
        if (photo && range) {
          let dragging = false;
          const setFromPointer = (event: PointerEvent) => {
            const rect = photo.getBoundingClientRect();
            const pct = Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100)));
            range.value = String(pct);
            range.dispatchEvent(new Event('input', { bubbles: true }));
          };
          photo.addEventListener('pointerdown', (event) => {
            if ((event.target as HTMLElement).closest('[data-change]')) return; // 반짝이는 점은 그대로 누른다
            dragging = true;
            photo.setPointerCapture(event.pointerId);
            setFromPointer(event);
          });
          photo.addEventListener('pointermove', (event) => { if (dragging) setFromPointer(event); });
          const stop = () => { dragging = false; };
          photo.addEventListener('pointerup', stop);
          photo.addEventListener('pointercancel', stop);
        }
        range?.addEventListener('input', () => {
          if (resolved || disposed) return;
          const value = Number(range.value);
          traveled += Math.abs(value - lastValue);
          lastValue = value;
          if (after) after.style.clipPath = `inset(0 0 0 ${value}%)`;
          if (divider) divider.style.left = `${value}%`;
          if (!ready && traveled >= 65) {
            ready = true;
            if (hotspot) {
              hotspot.disabled = false;
              hotspot.classList.add('is-ready');
            }
            if (mission) mission.textContent = '반짝이는 곳을 눌러 봐!';
            if (nextBtn) nextBtn.textContent = '달라진 곳 찾기';
            void audio.playSfx('pickup');
            guide?.say(scene.mission, { cue: hotspot, speaker: hostSpeaker });
          }
        });

        hotspot?.addEventListener('click', () => {
          if (!ready || resolved || disposed) return;
          resolved = true;
          visualCompareDone.add(scene.id);
          visualCompareIndex = index + 1;
          hotspot.disabled = true;
          hotspot.classList.add('is-found');
          if (mission) mission.textContent = `찾았다! ${scene.hotspot.label}`;
          if (result) {
            result.hidden = false;
            result.innerHTML = `<b>✓ ${scene.discovery}</b><span>${scene.insight}</span>`;
            const side = result.closest<HTMLElement>('.dl-compare-side');
            if (side) keepFitted(side, () => Array.from(result.querySelectorAll<HTMLElement>('b,span')), 13); // 설명이 패널을 넘치면 글자를 줄인다
          }
          if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.textContent = visualCompareDone.size >= VISUAL_COMPARE_SCENES.length ? '경청 렌즈 시작' : '다음 사진';
          }
          checkpoint('stage2');
          void audio.playSfx('success');
          popBounce(hotspot);
          guide?.say(scene.insight.split('. ')[0] + '.', { cue: nextBtn, speaker: hostSpeaker });
        });

        nextBtn?.addEventListener('click', () => {
          if (!resolved || busy || disposed) return;
          busy = true;
          renderStage2();
          busy = false;
        });

        guide?.say('손잡이를 좌우로 밀어서 전과 후를 비교해 봐.', { cue: range, speaker: hostSpeaker });
      }

      /* ===== 2단계 후반: 경청 렌즈 — 상황 단서 확인 뒤 존중하는 반응 고르기 ===== */
      function renderListening(): void {
        const scenarios = content.listening.scenarios;
        if (scenarioIndex >= scenarios.length) {
          goStage3();
          return;
        }
        const sc = scenarios[scenarioIndex];
        if (!sc) {
          goStage3();
          return;
        }
        const revealed = new Set<number>();
        let resolved = false;

        // 화면 안내 문장('관찰 단서'·'어떻게 할까요?')은 가이드 말풍선이 대신한다
        body.innerHTML = `
          <div class="dl-stage">
            <div class="dl-head">
              <div class="ribbon-title">
                <span class="ribbon-main">경청 렌즈</span>
              </div>
            </div>
            <section class="panel dl-listen">
              <div class="card dl-scenario">
                ${hasAsset('icon.listening') ? `<img src="${assetUrl('icon.listening')}" data-asset-id="icon.listening" alt="" aria-hidden="true">` : ''}
                <div>
                  <strong>상황 ${scenarioIndex + 1}</strong>
                  <p>${firstSentence(sc.situation)}</p>
                  <button type="button" class="btn btn-ghost" data-act="scenario-story" style="margin-top:var(--sp-2)">상황을 대화로 보기</button>
                </div>
              </div>
              <div id="cue-row" class="dl-cues"></div>
              <p id="cue-summary" class="chip" hidden>이야기를 모두 확인했어요</p>
              <div id="opt-col" style="display:flex;flex-direction:column;gap:6px" hidden>
                <div class="dl-option-head">
                  ${hasAsset('icon.heart_speech') ? `<img src="${assetUrl('icon.heart_speech')}" data-asset-id="icon.heart_speech" alt="" aria-hidden="true">` : ''}
                  <span>어떻게 반응할까요?</span>
                </div>
              </div>
              <div id="stage2-fb"></div>
            </section>
          </div>`;

        const fb = body.querySelector<HTMLElement>('#stage2-fb');
        const optCol = body.querySelector<HTMLElement>('#opt-col');
        const cueRow = body.querySelector<HTMLElement>('#cue-row');
        const cueSummary = body.querySelector<HTMLElement>('#cue-summary');
        body.querySelector<HTMLButtonElement>('[data-act="scenario-story"]')?.addEventListener('click', () => {
          if (disposed) return;
          openListeningSituation(sc, scenarioIndex);
        });

        const optionButtons: HTMLButtonElement[] = [];
        const syncOptions = () => {
          const open = revealed.size >= sc.cues.length;
          optionButtons.forEach((b) => {
            if (!b.dataset.locked) b.disabled = !open;
          });
          if (open && !resolved) {
            if (cueRow) cueRow.hidden = true;
            if (cueSummary) cueSummary.hidden = false;
            if (optCol) optCol.hidden = false;
            guide?.say('친구의 말과 표정을 생각하며 존중하는 반응을 골라요.', { cue: optCol, speaker: hostSpeaker });
          } else if (!open) {
            if (optCol) optCol.hidden = true;
            guide?.setCue((cueRow?.querySelector<HTMLElement>('button:not(:disabled)')) ?? null);
          }
        };

        if (cueRow) {
          sc.cues.forEach((cue, i) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'card card-pick dl-opt';
            card.style.textAlign = 'center';
            card.style.fontWeight = '700';
            card.textContent = `이야기 ${i + 1}`;
            card.addEventListener('click', () => {
              if (revealed.has(i) || resolved || disposed) return;
              void audio.playSfx('pickup');
              revealed.add(i);
              card.classList.remove('card-pick');
              card.style.textAlign = 'left';
              card.style.fontWeight = '400';
              card.innerHTML = `<span aria-hidden="true" style="font-weight:900;color:var(--c-turquoise)">✓</span> ${cue}`;
              card.disabled = true;
              syncOptions();
            });
            cueRow.appendChild(card);
          });
        }

        if (optCol) {
          for (const opt of sc.options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'card card-pick dl-opt';
            btn.textContent = opt.text;
            btn.disabled = true;
            btn.addEventListener('click', () => {
              if (resolved || btn.dataset.locked || busy || disposed) return;
              if (opt.good) {
                resolved = true;
                const first = !scenarioMistakes.has(sc.id);
                if (first) scenarioFirstGood += 1;
                optionButtons.forEach((b) => {
                  b.dataset.locked = '1';
                  b.disabled = true;
                });
                btn.classList.add('is-selected');
                if (fb) showFeedback(fb, 'success', '상대를 존중하는 반응을 골랐어요.', 'dialogue');
                // 피드백을 본 뒤 새로고침해도 같은 답을 다시 골라 점수를 바꾸지 못하도록
                // 다음 상황 위치까지 즉시 체크포인트로 확정한다.
                scenarioIndex += 1;
                checkpoint('stage2');
                const nextBtn = bottom.querySelector<HTMLButtonElement>('[data-act="next"]');
                if (nextBtn) {
                  nextBtn.disabled = false;
                  nextBtn.textContent = scenarioIndex >= scenarios.length ? '공감 대화 시작' : '다음 상황 보기';
                  guide?.say(firstSentence(opt.why), { cue: nextBtn, speaker: hostSpeaker });
                }
              } else {
                scenarioMistakes.add(sc.id);
                checkpoint('stage2');
                btn.dataset.locked = '1';
                btn.disabled = true;
                btn.style.opacity = '0.6';
                if (fb) showFeedback(fb, 'partial', '다른 반응을 다시 골라 봐요.', 'dialogue');
                guide?.say(firstSentence(opt.why), { speaker: hostSpeaker, cue: optCol });
              }
            });
            optionButtons.push(btn);
            optCol.appendChild(btn);
          }
        }

        bottom.innerHTML = `<button class="btn btn-primary btn-big" data-act="next" disabled>다음 상황 보기</button>`;
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          if (!resolved || busy || disposed) return;
          busy = true;
          if (scenarioIndex >= scenarios.length) {
            goStage3();
          } else {
            renderListening();
          }
          busy = false;
        });

        guide?.say('친구 이야기를 모두 확인한 뒤 반응을 골라요.', { speaker: hostSpeaker, cue: cueRow });
        syncOptions();
      }

      function goStage3(): void {
        stage = 3;
        npcTurnIndex = 0;
        npcPhase = 'turn';
        checkpoint('stage3');
        renderStage3();
      }

      /* ===== 3단계: 대화 단서 나침반 ===== */
      const compassAngle = (sum: number): number =>
        empathyMax > 0 ? Math.round(-90 + (sum / empathyMax) * 180) : -90;
      /** 대화 단서 나침반 — 점수 경쟁이 아니라 관찰·질문·경청 단서가 모이는 과정 */
      const compassHtml = (): string => `
        <div class="dl-compass" role="img" aria-label="나눈 마음 ${empathySum}개">
          <span class="c-dial" aria-hidden="true">
            ${hasAsset('icon.compass') ? `<img src="${assetUrl('icon.compass')}" data-asset-id="icon.compass" alt="" style="width:100%;height:100%;object-fit:contain">` : ''}
            <span id="compass-needle" style="position:absolute;left:50%;bottom:50%;width:5px;height:26px;margin-left:-2.5px;
              border-radius:4px 4px 0 0;background:var(--c-coral);box-shadow:0 0 0 1px rgba(255,255,255,0.7);
              transform-origin:50% 100%;transform:rotate(${compassAngle(empathySum)}deg);
              transition:transform 220ms cubic-bezier(0.2,0.8,0.4,1)"></span>
          </span>
          <span id="compass-num" class="c-num">마음 ${empathySum}개</span>
        </div>`;
      /** 단서가 늘어날 때 바늘을 움직인다. */
      const updateCompass = (prevSum: number): void => {
        const needle = body.querySelector<HTMLElement>('#compass-needle');
        if (needle) needle.style.transform = `rotate(${compassAngle(empathySum)}deg)`;
        const numEl = body.querySelector<HTMLElement>('#compass-num');
        if (numEl && prevSum !== empathySum) numEl.textContent = `마음 ${empathySum}개`;
        const dial = body.querySelector<HTMLElement>('.dl-compass');
        if (dial) dial.setAttribute('aria-label', `나눈 마음 ${empathySum}개`);
      };

      function renderStage3(): void {
        const npcs = content.compass.npcs;
        const npc = npcs[npcIndex];
        if (!npc) {
          goStage4();
          return;
        }
        const imgId = NPC_IMG[npc.id];

        // 왼쪽: 누구와 이야기하는지(그림 크게) + 나침반 / 오른쪽: 대화만
        // 단계에 따라 카드 1장만 — 대화 중엔 상황, 되돌아볼 땐 '처음 든 생각'
        const sideTitle = npcPhase === 'revision' ? '처음 든 생각' : '어떤 상황인가요?';
        const sideText = npcPhase === 'revision' ? npc.firstImpression : npc.situation;
        // 긴 상황 문장은 항상 선택형 상세로 둔다. 기본 화면에는 대화와 선택지만 남긴다.
        const sideCard = `
          <button type="button" class="btn btn-ghost dl-side-btn">${npcPhase === 'revision' ? '생각 보기' : '상황 보기'}</button>`;
        body.innerHTML = `
          <div class="dl-stage">
            <div class="dl-head">
              <div class="ribbon-title">
                <span class="ribbon-main">${withJosa(npc.name, '과', '와')} 대화</span>
              </div>
            </div>
            <div class="dl-talk">
              <section class="panel dl-who">
                ${imgId && hasAsset(imgId)
                  ? `<img class="dl-portrait" src="${assetUrl(imgId)}" data-asset-id="${imgId}" alt="${npc.name} 학생의 대화 사례">`
                  : npcAvatar(npc, 150)}
                <span class="chip">${npc.name} · ${npc.from}</span>
                ${compassHtml()}
                ${sideCard}
              </section>
              <section class="panel dl-chat">
                <div id="dlg-area" style="display:flex;flex-direction:column;gap:var(--sp-2)"></div>
                <div id="stage3-fb"></div>
              </section>
            </div>
          </div>`;

        const area = body.querySelector<HTMLElement>('#dlg-area');
        const fb = body.querySelector<HTMLElement>('#stage3-fb');
        for (const sel of ['.dl-who', '.dl-chat']) {
          const box = body.querySelector<HTMLElement>(sel);
          if (box) keepFitted(box, () => Array.from(box.querySelectorAll<HTMLElement>('p,button,strong,span,small,b,li')), 13);
        }
        body.querySelector<HTMLElement>('.dl-side-btn')?.addEventListener('click', () => {
          closeActiveModal = openCharacterDialogue({
            id: `npc-side-${npc.id}-${npcPhase}`,
            name: npc.name,
            meta: npc.from,
            assetId: imgId,
            imageAlt: `${npc.name} 학생 캐릭터`,
            partner: {
              name: hostSpeaker.name,
              meta: '나의 탐험가',
              assetId: hostSpeaker.assetId,
              imageAlt: `${hostSpeaker.name} 탐험가`
            },
            lines: splitDialogueSentences(sideText).map((text, lineIndex) => ({
              label: lineIndex === 0 ? sideTitle : '이야기 계속',
              speaker: npcPhase === 'revision' ? hostSpeaker.name : npc.name,
              role: npcPhase === 'revision' ? 'partner' as const : 'character' as const,
              text
            }))
          });
        });

        bottom.innerHTML = `<button class="btn btn-primary btn-big" data-act="next" disabled>대화 이어가기</button>`;
        const nextBtn = bottom.querySelector<HTMLButtonElement>('[data-act="next"]');

        if (npcPhase === 'turn') {
          const turn = npc.turns[npcTurnIndex];
          if (!turn) {
            npcPhase = 'revision';
            checkpoint('stage3');
            renderStage3();
            return;
          }
          let answered = false;
          if (area) {
            const btns: HTMLButtonElement[] = [];
            for (const opt of turn.options) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'card card-pick dl-opt';
              btn.textContent = opt.text;
              btn.addEventListener('click', () => {
                if (answered || busy || disposed) return;
                answered = true;
                void audio.playSfx('tap');
                const prevSum = empathySum;
                empathySum = Math.min(empathyMax, empathySum + Math.max(0, opt.empathy));
                btns.forEach((b) => (b.disabled = true));
                btn.classList.add('is-selected');
                if (fb) {
                  const message = opt.empathy >= 2
                    ? '상대의 신호를 살펴보고 직접 물어본 말이에요.'
                    : opt.empathy === 1
                      ? '좋은 시작이에요. 상대의 생각을 더 물어봐도 좋아요.'
                      : '내 판단보다 상대의 말을 먼저 들을 방법을 다시 생각해 봐요.';
                  showFeedback(fb, opt.empathy >= 2 ? 'success' : 'partial', message, 'dialogue');
                }
                updateCompass(prevSum);
                if (opt.leadsTo === 'end' || typeof opt.leadsTo !== 'number' || !npc.turns[opt.leadsTo]) {
                  npcPhase = 'revision';
                } else {
                  npcTurnIndex = opt.leadsTo;
                }
                checkpoint('stage3');
                if (nextBtn) {
                  nextBtn.disabled = false;
                  nextBtn.textContent = '대화 이어가기';
                  guide?.say(firstSentence(opt.reply), { cue: nextBtn, speaker: npcSpeaker(npc) });
                }
              });
              btns.push(btn);
              area.appendChild(btn);
            }
            guide?.say(firstSentence(turn.prompt), { cue: area, speaker: hostSpeaker });
          }
          nextBtn?.addEventListener('click', () => {
            if (!answered || busy || disposed) return;
            busy = true;
            renderStage3();
            busy = false;
          });
        } else {
          // 첫인상 수정 질문
          let answered = false;
          if (area) {
            const btns: HTMLButtonElement[] = [];
            for (const opt of npc.revision.options) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'card card-pick dl-opt';
              btn.textContent = opt.text;
              btn.addEventListener('click', () => {
                if (answered || busy || disposed) return;
                answered = true;
                const isLastNpc = npcIndex + 1 >= content.compass.npcs.length;
                void audio.playSfx('tap');
                if (opt.better) betterCount += 1;
                btns.forEach((b) => (b.disabled = true));
                btn.classList.add('is-selected');
                if (fb) showFeedback(fb, opt.better ? 'success' : 'partial', opt.better ? '첫인상을 다시 살폈어요.' : '한 번 더 생각해 봐요.', 'dialogue');
                npcIndex += 1;
                npcTurnIndex = 0;
                npcPhase = 'turn';
                checkpoint('stage3');
                if (nextBtn) {
                  nextBtn.disabled = false;
                  nextBtn.textContent = isLastNpc ? '대화 마치기' : '다음 친구에게';
                  guide?.say(firstSentence(opt.why), { cue: nextBtn, speaker: hostSpeaker });
                }
              });
              btns.push(btn);
              area.appendChild(btn);
            }
            guide?.say(npc.revision.question, { cue: area, speaker: hostSpeaker });
          }
          nextBtn?.addEventListener('click', () => {
            if (!answered || busy || disposed) return;
            busy = true;
            if (npcIndex >= content.compass.npcs.length) {
              goStage4();
            } else {
              renderStage3();
            }
            busy = false;
          });
        }
      }

      /* ===== 4단계: 하나의 지구, 여섯 개의 신호 =====
         3단계가 끝나면 바로 회의로 넘어가지 않는다. 지도로 돌아가 '친구들의 마지막 사진' 도착 연출을 본 뒤
         지도 안내판의 '환경 신호 확인하기'로 다시 들어오면 신호 발견 → 연결 → 회의 → 실험 → 약속 순서로 진행한다. */
      function goStage4(): void {
        stage = 4;
        checkpoint('stage4');
        if (earthProgress.signalViewedIds.length === 0 && !earthProgress.missionCompleted) {
          queueMissionReturn({ missionId: 'dialogue', missionTitle: earth.titles.panelTitle, kind: 'photos' });
          // 마운트 도중(복원 직후)에도 동작하도록 navigate() 대신 해시를 바꾼다 — 라우터가 전환 끝에 재동기화한다.
          location.hash = '#/map';
          return;
        }
        renderStage4();
      }

      function renderStage4(): void {
        const titleEl = topBar.querySelector<HTMLElement>('.top-bar-title');
        if (titleEl && !titleEl.dataset.earth) {
          titleEl.dataset.earth = '1';
          titleEl.textContent = earth.titles.mission;
        }
        renderEarthScene({
          body,
          bottom,
          guide,
          speaker: hostSpeaker,
          content: earth,
          progress: earthProgress,
          save: () => checkpoint('stage4'),
          onFinish: finish,
          isDisposed: () => disposed
        });
      }

      /* ===== 완료 처리 ===== */
      function finish(): void {
        if (finished) return;
        finished = true;
        const nGreet = Math.max(1, content.greetings.length);
        const nScen = Math.max(1, content.listening.scenarios.length);
        const nNpc = Math.max(1, content.compass.npcs.length);
        // 단서 활용: 인사 첫 시도 연결 + 단서 확인 후 좋은 선택(첫 시도)
        const listeningEvidence = (scenarioFirstGood + 0.5 * (nScen - scenarioFirstGood)) / nScen;
        const connections = Math.min(1, earthProgress.exploredConnectionTypes.length / 3);
        const evidence = 0.3 * (firstTryMatches / nGreet) + 0.4 * listeningEvidence + 0.3 * connections;
        // 관점: 고정관념 점검 정답 + 첫인상 수정
        const perspective = 0.5 * (oxFirstCorrect ? 1 : 0.4) + 0.5 * (betterCount / nNpc);
        // 수정: 경청 재선택으로 좋은 선택 도달(기본) + 첫인상 수정 선택
        const revision = 0.4 + 0.3 * (betterCount / nNpc) + (earthProgress.simulationAttempts > 1 ? 0.3 : 0.15);
        // 배움 확인(③) — 마지막 대화 확정 직후 · 점수 모달 직전 한 곳만
        const conclude = (): void => {
          const learnRec = readLearnRecord('dialogue');
          writeMissionArtifact({
            schemaVersion: 1,
            missionId: 'dialogue',
            title: earth.titles.council,
            purpose: '여섯 친구의 환경 신호를 그림과 지도에서 찾고, 친구들의 약속을 읽은 뒤 내가 지킬 약속을 만들어요.',
            initialHypothesis: learnRec.initialHypothesis ?? learn?.prediction.question ?? '여행을 시작하며 질문을 떠올렸어요.',
            evidenceIds: [...matched, ...scenarioIds, ...content.compass.npcs.map((npc) => npc.id), ...earthProgress.signalObservedIds, ...earthProgress.exploredConnectionTypes, ...earthProgress.selectedPerspectiveIds, ...earthProgress.selectedActionIds],
            evidenceLabel: `환경 신호 ${earthProgress.signalObservedIds.length}개를 관찰하고 지도에서 ${earthProgress.exploredConnectionTypes.length}개 연결 단서를 확인했어.`,
            voiceId: content.compass.npcs[0]?.id ?? 'dialogue-friends',
            voiceName: learnRec.friendName ?? content.compass.npcs[0]?.name ?? '대화 친구들',
            voiceLine: learnRec.cardLine ?? '첫인상으로 단정하지 말고 상대의 말과 상황을 다시 확인해요.',
            firstDecision: '처음에는 나라별 인사와 행동을 하나의 규칙처럼 생각할 수도 있었어.',
            observedConsequence: '친구의 표정과 말을 살펴보고 직접 물으면서, 첫인상을 고치고 모두가 참여할 해결 방법을 찾았어.',
            revisedDecision: earthProgress.jointPledgeDraft || learnRec.revisedThought || '여러 관점을 반영한 공동약속을 만들었어.',
            rationale: `근거 ${Math.round(evidence * 100)}%, 관점 ${Math.round(perspective * 100)}%, 수정 성장 ${Math.round(revision * 100)}%를 대화 기록으로 설명할 수 있어요.`,
            transferPrompt: '우리 동네에서 환경 변화의 신호를 하나 찾는다면, 누구의 이야기를 먼저 듣고 어떤 수준의 해결 방법부터 시작할까요?',
            earnedAt: new Date().toISOString()
          });
          earthProgress.stampAwarded = true;
          checkpoint('stage4');
          completeMissionFlow('dialogue', earth.titles.council);
          rememberCompletionModal();
        };
        if (learn) showLearningWrap('dialogue', learn, conclude);
        else conclude();
      }

      /* ===== 시작 ===== */
      const renderCurrent = (): void => {
        if (stage === 1) renderStage1();
        else if (stage === 2) renderStage2();
        else if (stage === 3) renderStage3();
        else renderStage4();
      };
      renderCurrent();

      if (learn && stage < 4) {
        // ①친구 만나기+②예상이 기존 인트로 모달을 대체 — 닫힌 뒤 재렌더로 첫 guide.say
        // 4단계(사진 도착 뒤 재입장)에서는 예상 질문을 다시 묻지 않는다.
        if (!disposed) showFriendIntro('dialogue', learn, renderCurrent);
      } else if (stage === 1 && matched.size === 0) {
        presentModal({
          id: 'dialogue-intro',
          title: content.intro.title,
          bodyHtml: '<p class="chip">사진을 보고 인사 설명을 연결해요.</p>',
          actions: [{
            label: '인사 연결 시작',
            kind: 'primary',
            autofocus: true,
            onClick: (close) => {
              close();
              guide?.say(firstSentence(content.intro.guide), { speaker: hostSpeaker });
            }
          }]
        });
      }
    },
    unmount() {
      disposed = true;
      closeActiveModal?.();
      closeActiveModal = null;
      guide?.dispose();
      guide = null;
    }
  };
}
