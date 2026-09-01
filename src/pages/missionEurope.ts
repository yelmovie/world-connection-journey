import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { withJosa } from '../core/josa';
import {
  europeExplorationStatus,
  guardEuropeScreen,
  hasStudentQuestion,
  hasStudentReason,
  normalizeEuropeProgress,
  type EuropeRequirements
} from '../core/europeMission';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { saveRepo } from '../core/SaveRepository';
import type { EuropeMissionProgress, EuropeMissionScreen } from '../types';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow } from '../ui/feedback';
import { getLearn, showLearningWrap } from '../ui/learnFrame';
import { burstConfetti } from '../ui/fx';
import { openCharacterDialogue } from '../ui/characterDialogue';
import { openModal } from '../ui/modal';
import { fitAspect } from '../ui/aspectBox';
import { recordEarthSignals } from '../core/earthSignals';
import { showKeyPoint } from '../ui/keyPoint';
import { enableMapZoom } from '../ui/mapZoom';
import { createGuide, type GuideController } from '../ui/guide';
import { showToast } from '../ui/toast';
import { selectedAvatarSpeaker } from '../ui/avatarRoster';

type VisualCategory = 'environment' | 'daily' | 'heritage';

interface EuropeVisual {
  id: string;
  title: string;
  category: VisualCategory;
  imageId: string;
  caption: string;
  lookFor: string;
  sourceTitle: string;
  sourceUrl: string;
  license: string;
  verifiedAt: string;
  needsReview: boolean;
}

interface EuropeCountry {
  id: string;
  name: string;
  map: { x: number; y: number };
  accent: string;
  hook: string;
  visuals: EuropeVisual[];
}

interface EuropeTraveler {
  name: string;
  bridge: string;
  concern: string;
  assetId?: string;
}

const EUROPE_TRAVELERS: Record<string, EuropeTraveler> = {
  france: {
    name: '카미유',
    bridge: '나도 강가를 걷고 시장에서 이웃을 만나는 시간을 좋아해. 그런데 요즘 여름에는 그 시간이 달라질 때가 있어.',
    concern: '더운 날이 오래 이어져서 강가와 도시에서 그늘과 물을 찾는 사람이 많아졌어.',
    assetId: 'europe.traveler.france'
  },
  germany: {
    name: '리나',
    bridge: '강과 전차, 자전거 길이 이어진 도시 생활이 참 편리해. 그런데 어른들이 예전과 날씨가 다르다고 자주 말해.',
    concern: '갑자기 큰비가 오거나 아주 더운 날이 늘어서 강 주변과 도시의 하루가 바뀌는 게 걱정돼.',
    assetId: 'europe.traveler.germany'
  },
  poland: {
    name: '조피아',
    bridge: '숲길과 광장은 계절마다 모습이 달라서 산책할 때마다 새로워. 그런데 요즘 계절의 느낌이 예전 같지 않아.',
    concern: '겨울은 덜 춥고 여름 더위는 길어져서 숲과 강이 달라질까 봐 걱정돼.',
    assetId: 'europe.traveler.poland'
  },
  czechia: {
    name: '아담',
    bridge: '오래된 다리와 트램을 지금도 함께 쓰는 게 우리 도시의 재미야. 그런데 도시를 지키는 방법도 달라지고 있어.',
    concern: '도시가 더 뜨거워지고 비가 한꺼번에 올 때 광장과 집을 안전하게 지킬 수 있을지 걱정돼.',
    assetId: 'europe.traveler.czechia'
  },
  italy: {
    name: '루카',
    bridge: '광장에서 만나고, 지역에서 난 재료로 음식을 만드는 시간이 좋아. 그런데 더운 날이 길어지면 생활도 달라져.',
    concern: '심한 더위와 비가 오지 않는 날이 이어져서 물과 농사, 도시의 하루가 힘들어질까 걱정돼.',
    assetId: 'europe.traveler.italy'
  },
  spain: {
    name: '소피아',
    bridge: '바닷가 산책길과 시장은 가족과 이웃이 자주 만나는 곳이야. 그런데 요즘은 한낮에 밖에 있기 힘든 날이 많아졌어.',
    concern: '더위가 오래 이어지고 물이 부족해져서 바닷가와 시장의 일상이 달라질까 걱정돼.',
    assetId: 'europe.traveler.spain'
  },
  greece: {
    name: '엘레니',
    bridge: '섬의 항구와 오래된 언덕은 오늘의 생활과 옛이야기가 만나는 곳이야. 그런데 바다와 산의 모습이 조금씩 달라지고 있어.',
    concern: '바닷물이 더 따뜻해지고 산불 위험이 커져서 섬과 항구를 지키기 어려워질까 걱정돼.',
    assetId: 'europe.traveler.greece'
  }
};

const CULTURE_STORIES: Record<string, string> = {
  france_seine: '센강 양쪽에는 걷는 길과 자전거 길, 다리가 이어져 있어. 파리 사람들은 강가를 이동하고 쉬는 생활 공간으로 함께 써.',
  france_market: '프랑스의 지역 시장에서는 제철 채소와 빵, 치즈를 고르고 상인과 이야기를 나눠. 지역마다 자주 먹는 재료와 시장 모습도 달라.',
  france_louvre: '루브르에서는 오래된 궁전 건물과 현대적인 유리 피라미드를 한자리에서 볼 수 있어. 옛 공간에 오늘의 미술관이 이어진 모습이야.',
  germany_rhine: '라인강은 여러 도시와 마을을 이어 주는 큰 물길이야. 강가의 산책길과 포도밭, 배가 지역 생활과 함께 이어져 있어.',
  germany_berlin_tram: '베를린에서는 전차와 자전거, 걷는 사람이 길을 나누어 써. 여러 이동 방법을 연결해 도시를 오가는 생활을 볼 수 있어.',
  germany_castle: '독일 여러 지역의 성은 산과 숲, 마을의 역사와 이어져 있어. 지금은 옛이야기를 배우고 건축을 살펴보는 문화 공간으로도 쓰여.',
  poland_tatras: '타트라산맥에서는 정해진 길을 따라 걷고 산장을 이용하는 문화가 이어져. 산의 자연을 즐기면서 안전 규칙도 함께 지켜.',
  poland_vistula: '비스와강은 바르샤바를 지나는 큰 강이야. 시민들은 강변에서 걷거나 자전거를 타고 공연과 쉼을 즐겨.',
  poland_krakow: '크라쿠프 중앙 광장에서는 오래된 건물과 시장, 거리 공연을 함께 만날 수 있어. 광장은 사람들이 모이고 이야기를 나누는 중심 공간이야.',
  czechia_charles_bridge: '프라하의 카를교는 강 양쪽의 오래된 도시를 이어 줘. 사람들은 다리를 건너며 조각과 거리 음악, 도시 풍경을 함께 살펴봐.',
  czechia_tram: '프라하의 트램은 오래된 거리와 오늘의 동네를 이어 주는 생활 교통이야. 주민과 여행자가 같은 길을 함께 이용해.',
  czechia_old_town: '프라하 구시가 광장에는 시대가 다른 건물과 시계탑이 모여 있어. 광장에서 시장과 축제가 열리며 오늘의 생활도 이어져.',
  italy_dolomites: '돌로미티 지역에서는 산길을 걷고 작은 마을과 산장을 오가는 생활을 만날 수 있어. 지역의 언어와 음식도 마을마다 조금씩 달라.',
  italy_bologna: '볼로냐의 회랑은 건물 앞을 길게 덮어 주는 지붕 있는 길이야. 비나 햇빛을 피하며 걷고 광장에서 이웃을 만나.',
  italy_colosseum: '콜로세움은 고대 로마 시대의 큰 원형 경기장이야. 지금은 남은 건축을 보며 당시 도시와 사람들의 생활을 배우는 장소가 되었어.',
  spain_barcelona: '바르셀로나 바닷가에는 산책길과 자전거 길, 모래사장이 나란히 이어져 있어. 사람들은 바다를 보며 걷고 운동하고 함께 쉬어.',
  spain_madrid_market: '마드리드의 시장에서는 과일과 채소, 치즈 같은 재료를 고르고 상인과 이야기를 나눠. 시장은 장을 보는 곳이면서 이웃이 만나는 생활 공간이야.',
  spain_sagrada: '사그라다 파밀리아는 건축가 안토니 가우디의 생각에서 시작된 성당이야. 2026년에 가장 높은 예수 그리스도 탑의 외관이 완성됐지만, 영광의 파사드와 탑 내부를 포함한 성당 전체 공사는 아직 이어지고 있어.',
  greece_island_harbor: '그리스의 여러 섬에서는 항구가 사람과 물건을 이어 주는 마을의 문 역할을 해. 흰 집과 좁은 길, 작은 배가 섬 생활과 연결돼 있어.',
  greece_thessaloniki: '테살로니키 바닷길은 사람들이 걷고 자전거를 타며 만나는 긴 공공 공간이야. 항구 도시의 오늘 생활을 가까이 볼 수 있어.',
  greece_acropolis: '아크로폴리스는 아테네 높은 언덕에 남은 고대 건축 유적이야. 기둥과 터를 살펴보며 오래전 사람들의 생각과 도시 역사를 배워.'
};

interface EuropePrompt { id: string; label: string; prompt: string }
interface EuropeStarter { id: string; label: string; text: string }

interface EuropeContent {
  intro: { title: string; subtitle: string; guide: string };
  requirements: EuropeRequirements;
  countries: EuropeCountry[];
  reasonPrompts: EuropePrompt[];
  questionStarters: EuropeStarter[];
  postcard: { title: string; finishLabel: string };
  feedback: { reflection: string };
}

const STEP_INDEX: Record<EuropeMissionScreen, number> = {
  map: 0,
  window: 1,
  gallery: 2,
  reason: 3,
  question: 4,
  postcard: 5
};

const CATEGORY_LABEL: Record<VisualCategory, string> = {
  environment: '환경',
  daily: '오늘의 생활',
  heritage: '문화 공간'
};

const ICON = {
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
};

const PAGE_CSS = `
.europe-mission {
  --eu-copy:clamp(18px,1.3vw,22px);
  --eu-small:clamp(16px,1.05vw,19px);
  --eu-title:clamp(25px,2.15vw,35px);
  --guide-lane-h:clamp(92px,10vh,112px);
  background-position:center;background-size:cover;
  --guide-size:clamp(180px,13vw,240px);
}
.europe-mission::before { content:"";position:absolute;inset:0;background:rgba(15,38,63,.2);pointer-events:none; }
.europe-mission .top-bar { background:rgba(18,41,70,.94);backdrop-filter:none; }
.europe-mission .page-body {
  width:min(100%,1560px);margin-inline:auto;padding:clamp(7px,1.4vh,14px) clamp(10px,2vw,30px) 8px;
  display:flex;min-height:0;overflow-y:auto;overflow-x:hidden;
}
.europe-mission .page-body:has(.eu-window-layout) { overflow:hidden; }
.europe-mission .eu-screen { flex:1;min-height:0;display:flex;flex-direction:column;gap:10px; }
.europe-mission .eu-heading { display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff;text-shadow:0 2px 8px rgba(7,24,42,.8); }
.europe-mission .eu-heading h2 { margin:0;font:900 var(--eu-title)/1.08 var(--font-head);text-wrap:balance; }
.europe-mission .eu-heading p { margin:3px 0 0;font-size:var(--eu-small);font-weight:750;line-height:1.3; }
.europe-mission .eu-heading .chip { color:var(--c-ink);text-shadow:none;white-space:nowrap; }
.europe-mission .eu-board {
  min-width:0;min-height:0;border:2px solid rgba(255,255,255,.92);border-radius:24px;
  background:#f7f2df;box-shadow:0 14px 34px rgba(8,25,45,.34);color:var(--c-ink);overflow:hidden;
}
.europe-mission .eu-map-layout { flex:1;min-height:min(390px,58vh);display:grid;grid-template-columns:minmax(0,1fr) clamp(245px,20vw,310px);gap:12px; }
.europe-mission .eu-map { position:relative;min-height:min(390px,58vh);background:#12496e;touch-action:none;overflow:hidden; }
/* 확대·이동은 이 층에만 건다 — 표식이 지도와 함께 움직여야 위치가 어긋나지 않는다 */
.europe-mission .eu-map-layer {
  position:absolute;inset:0;transform-origin:50% 50%;transition:transform .12s ease-out;background:
    linear-gradient(rgba(16,48,72,.12),rgba(16,48,72,.18)),
    url('${assetUrl('europe.map.illustrated')}') center/cover no-repeat;
}
.europe-mission .eu-map::after { content:"";position:absolute;inset:16px;border:2px solid rgba(255,255,255,.58);border-radius:18px;pointer-events:none; }
.europe-mission .eu-country {
  position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%);z-index:2;
  min-width:94px;min-height:54px;padding:8px 11px;border:3px solid #fff;border-radius:18px;
  background:var(--accent);color:#fff;box-shadow:0 6px 15px rgba(8,24,42,.42);
  font:900 var(--eu-small)/1.05 var(--font-head);cursor:pointer;
}
.europe-mission .eu-country::after { content:"";position:absolute;left:50%;bottom:-10px;translate:-50% 0;border:7px solid transparent;border-top-color:#fff;border-bottom:0; }
.europe-mission .eu-country:hover,.europe-mission .eu-country:focus-visible { scale:1.06; }
.europe-mission .eu-country.is-ready { box-shadow:0 0 0 5px #f3c758,0 7px 16px rgba(8,24,42,.44); }
.europe-mission .eu-country small { display:block;margin-top:4px;font:800 15px/1 var(--font-body); }
.europe-mission .eu-bag { padding:14px;display:flex;flex-direction:column;gap:10px;overflow:auto; }
.europe-mission .eu-bag-title { display:flex;align-items:center;gap:9px;font:900 var(--eu-copy)/1.15 var(--font-head); }
.europe-mission svg { width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round; }
.europe-mission .eu-progress-list { display:grid;gap:7px; }
.europe-mission .eu-progress-row { display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:40px;font-size:var(--eu-small);font-weight:800; }
.europe-mission .eu-progress-row .mark { width:27px;height:27px;display:grid;place-items:center;border-radius:50%;background:#dfe8ed;color:#527080; }
.europe-mission .eu-progress-row.is-done .mark { background:#dff2df;color:#277147; }
/* 아직 안 한 항목에 체크 표시를 보여 주면 아이는 '다 했다'고 읽는다 — 빈 동그라미로 둔다 */
.europe-mission .eu-progress-row:not(.is-done) .mark { background:transparent;border:3px solid #b9cbd6; }
.europe-mission .eu-progress-row:not(.is-done) .mark svg { display:none; }
.europe-mission .eu-progress-row .count { font:900 var(--eu-small) var(--font-head);color:#527080; }
.europe-mission .eu-progress-row.is-done .count { color:#277147; }
.europe-mission .eu-progress-row svg { width:18px;height:18px; }
.europe-mission .eu-bag-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:auto; }
.europe-mission .eu-bag-thumb { aspect-ratio:1;border:2px solid #fff;border-radius:12px;overflow:hidden;background:#dce7e9;box-shadow:0 3px 8px rgba(25,50,77,.18); }
.europe-mission .eu-bag-thumb img { width:100%;height:100%;object-fit:cover; }
.europe-mission .eu-empty { padding:13px;border:2px dashed #aab7bd;border-radius:14px;background:#fff;font-size:var(--eu-small);font-weight:750;line-height:1.35;text-align:center; }
.europe-mission .eu-window-layout { flex:1;height:100%;min-height:min(460px,66vh);display:grid;grid-template-columns:minmax(0,1fr) clamp(400px,29vw,470px);border-radius:26px; }
.europe-mission .eu-stage { position:relative;min-height:min(390px,58vh);background:#d9e7e8;border-radius:22px 0 0 22px;overflow:hidden; }
.europe-mission .eu-stage > img { width:100%;height:100%;position:absolute;inset:0;object-fit:cover; }
.europe-mission .eu-stage > img.is-object { object-fit:contain;padding:5%;background:linear-gradient(145deg,#d8f0f1,#b5d5df); }
.europe-mission .eu-stage-shade { position:absolute;inset:auto 0 0;padding:60px 20px 17px;background:linear-gradient(transparent,rgba(7,24,42,.84));color:#fff; }
.europe-mission .eu-stage-shade h2 { margin:0;font:900 var(--eu-title)/1.1 var(--font-head); }
.europe-mission .eu-nav {
  position:absolute;top:50%;translate:0 -50%;width:56px;height:72px;border:2px solid #fff;border-radius:16px;
  display:grid;place-items:center;background:rgba(16,43,68,.82);color:#fff;cursor:pointer;
}
.europe-mission .eu-nav[data-dir="prev"] { left:12px; }.europe-mission .eu-nav[data-dir="next"] { right:12px; }
.europe-mission .eu-window-panel {
  min-width:0;min-height:0;padding:13px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:10px;
  overflow:hidden;background:#f7f2df;border-radius:0 22px 22px 0;
}
.europe-mission .eu-label { align-self:flex-start;padding:5px 11px;border-radius:999px;background:#e0e9f1;font-size:var(--eu-small);font-weight:900; }
.europe-mission .eu-window-panel h3 { margin:0;font:900 var(--eu-title)/1.1 var(--font-head); }
.europe-mission .eu-window-panel p { margin:0;font-size:var(--eu-copy);font-weight:750;line-height:1.42; }
.europe-mission .eu-look { padding:11px 13px;border-left:6px solid #efbd45;border-radius:10px;background:#fff;font-size:var(--eu-small);font-weight:750;line-height:1.35; }
.europe-mission .eu-look strong { display:block;color:#725600;font-weight:900; }
.europe-mission .eu-story-heading { display:flex;align-items:center;justify-content:space-between;gap:8px; }
.europe-mission .eu-story-heading strong { font:900 var(--eu-copy)/1.15 var(--font-head); }
.europe-mission .eu-story-heading span { color:#53677c;font-size:var(--eu-small);font-weight:800;white-space:nowrap; }
.europe-mission .eu-story-detail {
  min-height:0;max-height:100%;padding:clamp(13px,1.25vw,18px);display:flex;flex-direction:column;gap:9px;
  border:3px solid rgba(92,67,195,.42);border-radius:18px;background:rgba(255,255,255,.8);
  box-shadow:0 6px 16px rgba(25,50,77,.12);overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;
  animation:eu-story-in .24s ease both;
}
.europe-mission .eu-story-detail__top { display:flex;align-items:center;gap:9px; }
.europe-mission .eu-story-detail__number { flex:0 0 auto;width:31px;height:31px;display:grid;place-items:center;border-radius:50%;background:#5c43c3;color:#fff;font:900 18px/1 var(--font-head); }
.europe-mission .eu-story-detail__category { margin-left:auto;padding:5px 10px;border-radius:999px;background:#e1ebef;color:#38546b;font-size:var(--eu-small);font-weight:850;white-space:nowrap; }
.europe-mission .eu-story-detail h3 { margin:0;font:900 clamp(24px,1.7vw,31px)/1.15 var(--font-head);word-break:keep-all; }
.europe-mission .eu-story-detail__caption { padding:10px 12px;border-radius:12px;background:#eef4f6;font-size:var(--eu-small)!important;line-height:1.35!important; }
.europe-mission .eu-story-detail__story { font-size:var(--eu-copy)!important;line-height:1.48!important;word-break:keep-all;overflow-wrap:break-word; }
.europe-mission .eu-story-detail .eu-look { margin-top:auto; }
@keyframes eu-story-in { from { opacity:.25;transform:translateX(8px); } to { opacity:1;transform:none; } }
.europe-mission .eu-traveler-meet {
  position:absolute;right:clamp(16px,1.5vw,24px);bottom:12px;z-index:6;width:clamp(126px,10.5vw,178px);min-height:44px;
  padding:0;border:0;background:transparent;display:grid;justify-items:center;gap:4px;color:#173752;cursor:pointer;
  filter:drop-shadow(0 7px 10px rgba(7,24,42,.35));animation:eu-traveler-bob 2.4s ease-in-out infinite;
}
.europe-mission .eu-traveler-meet img { width:clamp(92px,7.5vw,126px);height:clamp(104px,14vh,156px);object-fit:contain;display:block;pointer-events:none; }
.europe-mission .eu-traveler-meet__label { min-height:34px;padding:7px 12px;border:2px solid #fff;border-radius:999px;background:#efbd45;display:flex;align-items:center;justify-content:center;font:900 clamp(14px,1vw,17px)/1.05 var(--font-head);white-space:nowrap;box-shadow:0 4px 0 #9a6d0d; }
.europe-mission .eu-traveler-meet:hover,.europe-mission .eu-traveler-meet:focus-visible { scale:1.04;outline:none; }
.europe-mission .eu-traveler-meet:focus-visible .eu-traveler-meet__label { outline:4px solid #fff;outline-offset:3px; }
@keyframes eu-traveler-bob { 50% { transform:translateY(-6px); } }
/* 마지막 사진에서 여행 친구가 '짠' 하고 등장 — 어디를 눌러야 할지 시선을 모은다 */
.europe-mission .eu-traveler-meet.is-appear { animation:eu-traveler-in .55s cubic-bezier(.2,.9,.3,1.35) backwards,eu-traveler-bob 2.4s .55s ease-in-out infinite; }
@keyframes eu-traveler-in { from { opacity:0;transform:translateY(26px) scale(.6); } to { opacity:1;transform:none; } }
@media (prefers-reduced-motion: reduce) { .europe-mission .eu-traveler-meet,.europe-mission .eu-traveler-meet.is-appear { animation:none; } }
.europe-mission .eu-gallery { flex:1;min-height:min(390px,58vh);padding:14px;display:flex;flex-direction:column;gap:10px; }
.europe-mission .eu-gallery-tabs { display:flex;gap:7px;flex-wrap:wrap; }
.europe-mission .eu-gallery-tab { min-height:48px;padding:8px 15px;border:2px solid #b8c7cf;border-radius:999px;background:#fff;font:850 var(--eu-small)/1 var(--font-body);cursor:pointer; }
.europe-mission .eu-gallery-tab[aria-pressed="true"] { background:#4e3db3;color:#fff;border-color:#4e3db3; }
.europe-mission .eu-gallery-grid { flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr));grid-auto-rows:max-content;gap:11px;align-content:start; }
.europe-mission .eu-gallery-card { min-width:0;padding:0;border:4px solid transparent;border-radius:18px;background:#fff;overflow:hidden;text-align:left;box-shadow:0 5px 13px rgba(25,50,77,.18);cursor:pointer; }
.europe-mission .eu-gallery-card[aria-pressed="true"] { border-color:#efb92f;box-shadow:0 0 0 3px rgba(239,185,47,.28); }
.europe-mission .eu-gallery-card img { width:100%;height:clamp(80px,10.5vh,150px);object-fit:cover;display:block;background:#dbe7e8; }
.europe-mission .eu-gallery-card img.is-object { object-fit:contain;padding:12px; }
.europe-mission .eu-card-copy { padding:9px 12px 12px;display:grid;gap:4px; }
.europe-mission .eu-card-copy strong { font:900 var(--eu-copy)/1.15 var(--font-head); }.europe-mission .eu-card-copy span { font-size:var(--eu-small);font-weight:750;line-height:1.3; }
.europe-mission .eu-form-layout { flex:1;min-height:min(390px,58vh);display:grid;grid-template-columns:minmax(260px,.82fr) minmax(0,1.18fr); }
.europe-mission .eu-evidence { position:relative;min-height:min(390px,58vh);background:#dce8e8;overflow:hidden; }
.europe-mission .eu-evidence img { position:absolute;inset:0;width:100%;height:100%;object-fit:cover; }.europe-mission .eu-evidence img.is-object { object-fit:contain;padding:8%; }
.europe-mission .eu-evidence-caption { position:absolute;inset:auto 0 0;padding:52px 18px 16px;background:linear-gradient(transparent,rgba(7,24,42,.88));color:#fff; }
.europe-mission .eu-evidence-caption strong { font:900 var(--eu-title)/1.1 var(--font-head); }.europe-mission .eu-evidence-caption span { display:block;margin-top:4px;font-size:var(--eu-small);font-weight:800; }
.europe-mission .eu-write { padding:clamp(15px,2vw,26px);display:flex;flex-direction:column;gap:12px;overflow:auto; }
.europe-mission .eu-write h2 { margin:0;font:900 var(--eu-title)/1.1 var(--font-head); }.europe-mission .eu-write > p { margin:0;font-size:var(--eu-copy);font-weight:750;line-height:1.4; }
.europe-mission .eu-prompt-row { display:flex;gap:8px;flex-wrap:wrap; }
.europe-mission .eu-prompt { min-height:50px;padding:9px 15px;border:2px solid #aebfc8;border-radius:15px;background:#fff;font:850 var(--eu-small)/1.1 var(--font-body);cursor:pointer; }
.europe-mission .eu-prompt[aria-pressed="true"] { border-color:#5c43c3;background:#ebe8ff;color:#362898; }
.europe-mission .eu-prompt-question { min-height:54px;padding:12px 15px;border-radius:14px;background:#e8f1f4;font-size:var(--eu-copy);font-weight:900;line-height:1.3; }
.europe-mission textarea { width:100%;min-height:120px;padding:14px 16px;resize:vertical;border:3px solid #a9bac5;border-radius:16px;background:#fff;font:800 var(--eu-copy)/1.5 var(--font-body);color:var(--c-ink); }
.europe-mission textarea:focus { border-color:#5c43c3;outline:4px solid rgba(92,67,195,.2); }
.europe-mission .eu-count { align-self:flex-end;color:#52657e;font-size:var(--eu-small);font-weight:800; }
.europe-mission .eu-question-preview { padding:14px 16px;border:3px solid #efbd45;border-radius:16px;background:#fffaf0;font-size:var(--eu-copy);font-weight:900;line-height:1.45; }
.europe-mission .eu-question-preview span { color:#5c43c3; }
.europe-mission .eu-postcard-wrap { flex:1;min-height:min(390px,58vh);display:grid;place-items:center;padding:12px; }
.europe-mission .eu-postcard { width:min(100%,980px);min-height:370px;display:grid;grid-template-columns:1fr 1fr;border:10px solid #fff;border-radius:28px;background:#fff8df;box-shadow:0 14px 30px rgba(21,41,62,.25);overflow:hidden; }
.europe-mission .eu-postcard-photo { position:relative;min-height:360px;background:#d7e7e8; }.europe-mission .eu-postcard-photo img { width:100%;height:100%;position:absolute;inset:0;object-fit:cover; }.europe-mission .eu-postcard-photo img.is-object { object-fit:contain;padding:8%; }
.europe-mission .eu-postcard-copy { padding:clamp(18px,2.5vw,32px);display:flex;flex-direction:column;gap:12px;background:radial-gradient(circle at 90% 10%,#d9eff0 0 13%,transparent 14%),#fff8df; }
.europe-mission .eu-postcard-copy h2 { margin:0;font:900 var(--eu-title)/1.1 var(--font-head); }.europe-mission .eu-postcard-copy h3 { margin:0;font:900 clamp(30px,3.5vw,52px)/1 var(--font-head);color:#3e329d; }
.europe-mission .eu-postcard-line { padding:11px 0;border-bottom:2px solid #d8c98e;font-size:var(--eu-copy);font-weight:800;line-height:1.42; }.europe-mission .eu-postcard-line strong { display:block;color:#6c5a20;font-size:var(--eu-small); }
.europe-mission .eu-sign { margin-top:auto;text-align:right;font-size:var(--eu-copy);font-weight:900; }
.europe-mission > .bottom-bar { background:#173752;border-top:2px solid rgba(255,255,255,.8);backdrop-filter:none; }
.europe-mission .bottom-bar .eu-status { color:#fff;font-size:var(--eu-small);font-weight:850;line-height:1.25; }
.europe-mission .bottom-bar .eu-actions { display:flex;gap:9px;margin-left:auto; }
.europe-mission .bottom-bar .btn { min-height:50px;font-size:var(--eu-small); }
.europe-mission .guide-wrap .guide-bubble { background:#fffdf4;backdrop-filter:none; }
.europe-mission .guide-wrap .guide-mascot { filter:drop-shadow(0 8px 13px rgba(6,24,42,.42)); }
.europe-mission > .guide-wrap .guide-mascot-button { left:max(8px,env(safe-area-inset-left)); }
@media (max-width:1050px) {
  .europe-mission .eu-map-layout { grid-template-columns:minmax(0,1fr) 235px; }
  .europe-mission .eu-country { min-width:82px;padding-inline:8px; }
  .europe-mission .eu-window-layout { grid-template-columns:minmax(0,1fr) 350px; }
}
@media (max-width:900px) and (min-width:781px) {
}
@media (max-width:780px) {
  .europe-mission .page-body { overflow-y:auto; }
  .europe-mission .eu-screen { min-width:0; }
  .europe-mission .eu-map-layout,.europe-mission .eu-window-layout,.europe-mission .eu-form-layout { grid-template-columns:1fr; }
  .europe-mission .eu-map { min-height:440px; }
  .europe-mission .page-body:has(.eu-window-layout) { overflow-y:auto; }
  .europe-mission .eu-window-layout { height:auto; }
  .europe-mission .eu-window-panel { grid-template-rows:auto auto;overflow:visible; }
  .europe-mission .eu-story-detail { max-height:none;overflow:visible; }
  .europe-mission .eu-stage,.europe-mission .eu-evidence { min-height:320px; }
  .europe-mission .eu-postcard { grid-template-columns:1fr; }
  .europe-mission .eu-postcard-photo { min-height:300px; }
  .europe-mission > .guide-wrap { display:none; }
  .europe-mission .eu-gallery-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media (max-width:520px) {
  .europe-mission .eu-country { min-width:58px;min-height:48px;padding:5px 6px;border-width:2px;border-radius:13px;font-size:14px; }
  .europe-mission .eu-country small { margin-top:2px;font-size:14px; }
  .europe-mission .eu-gallery-grid { grid-template-columns:1fr; }
}
@media (max-height:650px) {
  .europe-mission .page-body { padding-block:5px; }
  .europe-mission .eu-heading p { display:none; }
  .europe-mission .eu-map-layout,.europe-mission .eu-form-layout,.europe-mission .eu-postcard-wrap { min-height:min(390px,58vh); }
  .europe-mission .eu-window-layout { min-height:min(420px,68vh); }
  .europe-mission .eu-gallery { min-height:min(390px,58vh); }
  .europe-mission .eu-window-panel { padding:11px;gap:7px; }
  .europe-mission .eu-story-detail { padding:11px;gap:7px; }
  .europe-mission .eu-story-detail__story { line-height:1.38!important; }
  .europe-mission textarea { min-height:96px; }
}
@media (prefers-reduced-motion:reduce) { .europe-mission * { transition:none!important;scroll-behavior:auto!important; } }
`;

function element<T extends HTMLElement = HTMLElement>(html: string): T {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as T;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function imageClass(visual: EuropeVisual): string {
  return visual.imageId.startsWith('europe.heritage') ? 'is-object' : '';
}

function fullQuestion(starter: EuropeStarter | undefined, draft: string): string {
  const end = draft.trim().replace(/[?？]+$/u, '');
  return starter && end ? `${starter.text} ${end}?` : '';
}

export function createPage(): Page {
  let disposed = false;
  let guide: GuideController | null = null;
  let saveTimer: number | null = null;
  let stopMapFit: (() => void) | null = null;
  let stopMapZoom: (() => void) | null = null;

  return {
    async mount(root: HTMLElement) {
      const content = await loadContent<EuropeContent>('europe');
      if (disposed) return;
      audio.playBgm('europe');

      const countryById = new Map(content.countries.map((country) => [country.id, country]));
      const visualById = new Map(content.countries.flatMap((country) => country.visuals.map((visual) => [visual.id, visual] as const)));
      const countryByVisual = new Map(content.countries.flatMap((country) => country.visuals.map((visual) => [visual.id, country] as const)));
      const shapes = content.countries.map((country) => ({ id: country.id, visualIds: country.visuals.map((visual) => visual.id) }));
      let state = normalizeEuropeProgress(saveRepo.get().missions.europe.data, shapes);
      let finished = saveRepo.get().missions.europe.status === 'completed';
      // '공통점 찾기' 화면이므로 기본은 모아 보기 — 한 나라씩만 보이면 비교가 안 된다
      let galleryFilterId: string = state.selectedCountryId ?? 'all';
      const playerSpeaker = selectedAvatarSpeaker(saveRepo.get().profile);

      void preloadImages([
        'europe.map.illustrated',
        ...Object.values(EUROPE_TRAVELERS).flatMap((traveler) => traveler.assetId ? [traveler.assetId] : []),
        ...new Set(content.countries.flatMap((country) => country.visuals.map((visual) => visual.imageId)))
      ]);

      const page = document.createElement('div');
      page.className = 'page europe-mission';
      page.dataset.assetId = 'bg.europe';
      page.style.backgroundImage = `url('${assetUrl('bg.europe')}')`;
      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);
      const bar = buildTopBar({
        title: content.intro.title,
        subtitle: content.intro.subtitle,
        backTo: '#/map',
        steps: { total: 6, done: STEP_INDEX[state.screen], now: STEP_INDEX[state.screen] }
      });
      const body = document.createElement('div');
      body.className = 'page-body';
      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      page.append(bar, body);
      const gd = createGuide({ side: 'left', assetId: 'europe.guide', speakerName: '레나' });
      guide = gd;
      page.append(gd.el, bottom);
      root.appendChild(page);

      const persist = (): void => {
        state.updatedAt = new Date().toISOString();
        saveRepo.setCheckpoint('europe', state.screen, { europeProgress: state });
      };
      const schedulePersist = (): void => {
        if (saveTimer !== null) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          saveTimer = null;
          persist();
        }, 120);
      };

      const say = (message: string, cue?: HTMLElement | null): void => {
        gd.say(message, { cue, autoStart: true, persist: false });
      };

      const setScreen = (screen: EuropeMissionScreen): void => {
        state.screen = screen;
        persist();
        render();
      };

      const statusNow = () => europeExplorationStatus(state, shapes, content.requirements);

      const setBottom = (status: string, actions: HTMLElement[]): void => {
        bottom.replaceChildren();
        const statusEl = element(`<span class="eu-status" role="status" aria-live="polite">${esc(status)}</span>`);
        const actionWrap = element('<div class="eu-actions"></div>');
        actionWrap.append(...actions);
        bottom.append(statusEl, actionWrap);
      };

      const button = (label: string, kind: 'primary' | 'ghost' = 'primary'): HTMLButtonElement => {
        return element(`<button type="button" class="btn btn-${kind}">${label}</button>`);
      };

      const cultureExplanation = (visual: EuropeVisual): string => CULTURE_STORIES[visual.id] ?? visual.caption;

      const recordConcern = (country: EuropeCountry, visual: EuropeVisual): void => {
        const alreadyRecorded = country.visuals.some((item) => state.savedVisualIds.includes(item.id));
        if (!alreadyRecorded) state.savedVisualIds.push(visual.id);
        state.activeCountryId = country.id;
        state.activeVisualId = visual.id;
        if (!state.viewedVisualIds.includes(visual.id)) state.viewedVisualIds.push(visual.id);
        persist();
        if (!alreadyRecorded) {
          // 이야기를 기록했으면 창에 머물지 않고 지도로 돌아가 다음 나라로 흐름을 잇는다
          showToast(`${country.name} 친구의 이야기를 기록했어!`, 'success');
          setScreen('map');
        } else {
          render();
        }
      };

      const openTravelerDialogue = (country: EuropeCountry, visual: EuropeVisual): void => {
        const traveler = EUROPE_TRAVELERS[country.id] ?? {
          name: '여행 친구',
          bridge: '이 장면은 우리 동네의 생활과 이어져 있어. 그런데 요즘 조금 달라진 점도 보여.',
          concern: '예전과 달라지는 날씨가 사람과 자연에 주는 영향이 걱정돼.'
        };
        openCharacterDialogue({
          id: `europe-traveler-${country.id}-${visual.id}`,
          title: `${country.name} 여행가와 이야기하기`,
          reactions: true,
          name: traveler.name,
          meta: `${country.name} 생활 사례를 들려주는 학습용 가상 친구`,
          assetId: traveler.assetId,
          partner: { name: playerSpeaker.name, meta: '나의 탐험가', assetId: playerSpeaker.assetId },
          lines: [
            { role: 'partner', label: '궁금한 장면', text: `${visual.title}에서 네가 좋아하는 모습은 뭐야?` },
            { role: 'character', label: '우리 동네 이야기', text: cultureExplanation(visual) },
            { role: 'character', label: '요즘 달라진 점', text: traveler.bridge },
            { role: 'character', label: '친구의 걱정', text: traveler.concern },
            { role: 'partner', label: '기억할 이야기', text: '그랬구나. 다른 나라 친구들의 이야기도 잘 듣고, 나중에 함께 방법을 생각해 볼게.' }
          ],
          onComplete: () => recordConcern(country, visual)
        });
      };

      const renderMap = (): void => {
        const progress = statusNow();
        const viewedCount = (country: EuropeCountry) => country.visuals.filter((visual) => state.viewedVisualIds.includes(visual.id)).length;
        const mapButtons = content.countries.map((country) => {
          const count = viewedCount(country);
          const ready = state.visitedCountryIds.includes(country.id) && count >= content.requirements.minVisualsPerVisitedCountry;
          return `<button type="button" class="eu-country ${ready ? 'is-ready' : ''}" data-country="${country.id}" style="--x:${country.map.x}%;--y:${country.map.y}%;--accent:${country.accent}" aria-label="${esc(country.name)} 문화 창 열기">
            ${esc(country.name)}<small>${ready ? '✓' : ''}</small>
          </button>`;
        }).join('');
        const savedThumbs = state.savedVisualIds.slice(-6).map((id) => {
          const visual = visualById.get(id);
          return visual ? `<span class="eu-bag-thumb"><img src="${assetUrl(visual.imageId)}" alt="${esc(visual.title)}" data-asset-id="${visual.imageId}"></span>` : '';
        }).join('');
        const screen = element(`<section class="eu-screen">
          <div class="eu-heading"><h2>나라를 골라 창 열기</h2></div>
          <div class="eu-map-layout">
            <div class="eu-board eu-map" aria-label="유럽 나라 탐색 지도">${mapButtons}</div>
            <aside class="eu-board eu-bag" aria-label="문화 탐험 진행">
              <div class="eu-bag-title">${ICON.eye}<span>문화 탐험 기록</span></div>
              <div class="eu-progress-list">
                <div class="eu-progress-row ${progress.readyCountryCount >= content.requirements.minCountries ? 'is-done' : ''}"><span class="mark">${ICON.check}</span><span>나라 살펴보기</span><span class="count">${Math.min(progress.readyCountryCount, content.requirements.minCountries)} / ${content.requirements.minCountries}</span></div>
                <div class="eu-progress-row ${progress.savedVisualCount >= content.requirements.minSavedVisuals ? 'is-done' : ''}"><span class="mark">${ICON.check}</span><span>여행가 만나기</span><span class="count">${Math.min(progress.savedVisualCount, content.requirements.minSavedVisuals)} / ${content.requirements.minSavedVisuals}</span></div>
                <div class="eu-progress-row ${progress.savedCountryCount >= content.requirements.minSavedCountries ? 'is-done' : ''}"><span class="mark">${ICON.check}</span><span>친구 이야기 듣기</span><span class="count">${Math.min(progress.savedCountryCount, content.requirements.minSavedCountries)} / ${content.requirements.minSavedCountries}</span></div>
              </div>
              ${savedThumbs ? `<div class="eu-bag-grid">${savedThumbs}</div>` : '<div class="eu-empty">사진을 살펴본 뒤 여행가와 이야기해 봐</div>'}
            </aside>
          </div>
        </section>`);
        body.replaceChildren(screen);
        const mapEl = screen.querySelector<HTMLElement>('.eu-map');
        if (mapEl) {
          const layer = document.createElement('div');
          layer.className = 'eu-map-layer';
          layer.append(...mapEl.childNodes);
          mapEl.appendChild(layer);
          mapEl.insertAdjacentHTML('beforeend', '<span class="map-zoom-hint">두 손가락으로 크게 볼 수 있어</span>');
          stopMapFit?.();
          stopMapZoom?.();
          stopMapFit = fitAspect(mapEl);
          stopMapZoom = enableMapZoom(mapEl, layer);
        }
        screen.querySelectorAll<HTMLButtonElement>('[data-country]').forEach((countryButton) => {
          countryButton.addEventListener('click', () => {
            const country = countryById.get(countryButton.dataset.country ?? '');
            if (!country) return;
            const firstUnseen = country.visuals.find((visual) => !state.viewedVisualIds.includes(visual.id)) ?? country.visuals[0];
            if (!firstUnseen) return;
            state.activeCountryId = country.id;
            state.activeVisualId = firstUnseen.id;
            if (!state.visitedCountryIds.includes(country.id)) state.visitedCountryIds.push(country.id);
            if (!state.viewedVisualIds.includes(firstUnseen.id)) state.viewedVisualIds.push(firstUnseen.id);
            void audio.playSfx('tap');
            setScreen('window');
          });
        });
        const next = button('친구들의 이야기 정리하기');
        next.disabled = !progress.complete;
        next.addEventListener('click', () => setScreen('gallery'));
        const hint = progress.incompleteVisitedCountryIds.length
          ? `${progress.incompleteVisitedCountryIds.map((id) => countryById.get(id)?.name ?? id).join('·')}에서 한 장 더 살펴봐.`
          : progress.complete ? '이야기를 모아 보니 친구들의 걱정이 모두 환경과 이어져 있었어. 스테이지 6으로 가져갈 이야기를 정리해 보자.' : `궁금한 나라 ${content.requirements.minCountries}곳을 골라 사진을 살펴보고 여행가와 이야기해 봐.`;
        setBottom(hint, [next]);
        showKeyPoint({
          id: 'europe.geo',
          imageId: 'europe.guide',
          lines: [
            '유럽은 여러 나라가 가까이 붙어 있어서, 기차로 이웃 나라에 갈 수 있어.',
            '쓰는 말과 문화는 달라도 강과 산은 국경을 넘어 이어져 있어.'
          ],
          onDone: () => say('나라를 골라 창을 열어 봐.', screen.querySelector<HTMLElement>('[data-country]'))
        });
      };

      const renderWindow = (): void => {
        const country = countryById.get(state.activeCountryId ?? '');
        const initialVisual = visualById.get(state.activeVisualId ?? '');
        if (!country || !initialVisual || !country.visuals.some((item) => item.id === initialVisual.id)) {
          state.screen = 'map';
          persist();
          renderMap();
          return;
        }
        const visual: EuropeVisual = initialVisual;
        // 현재 큰 사진과 설명을 실제로 본 장면만 진행 기록에 남긴다.
        if (!state.viewedVisualIds.includes(visual.id)) {
          state.viewedVisualIds.push(visual.id);
          persist();
        }
        const currentIndex = country.visuals.findIndex((item) => item.id === visual.id);
        const saved = country.visuals.some((item) => state.savedVisualIds.includes(item.id));
        const traveler = EUROPE_TRAVELERS[country.id];
        const travelerName = traveler?.name ?? '여행 친구';
        const meetLabel = `${withJosa(travelerName, '과', '와')} 대화하기`;
        const travelerAssetId = traveler?.assetId && hasAsset(traveler.assetId) ? traveler.assetId : undefined;
        const isFinalVisual = currentIndex === country.visuals.length - 1;
        const travelerMeet = travelerAssetId && isFinalVisual ? `<button type="button" class="eu-traveler-meet is-appear" data-meet-traveler aria-label="${esc(meetLabel)}">
          <img src="${assetUrl(travelerAssetId)}" alt="" aria-hidden="true">
          <span class="eu-traveler-meet__label">${esc(meetLabel)}</span>
        </button>` : '';
        const screen = element(`<section class="eu-screen">
          <div class="eu-heading"><h2>${esc(country.name)} 문화 창</h2></div>
          <div class="eu-board eu-window-layout">
            <div class="eu-stage">
              <img class="${imageClass(visual)}" src="${assetUrl(visual.imageId)}" alt="${esc(visual.title)}: ${esc(visual.caption)}" data-asset-id="${visual.imageId}">
              <button type="button" class="eu-nav" data-dir="prev" aria-label="이전 장면">${ICON.left}</button>
              <button type="button" class="eu-nav" data-dir="next" aria-label="다음 장면">${ICON.right}</button>
              <div class="eu-stage-shade"><h2>${esc(visual.title)}</h2></div>
              ${travelerMeet}
            </div>
            <aside class="eu-window-panel">
              <div class="eu-story-heading"><strong>사진 이야기</strong><span>${currentIndex + 1} / ${country.visuals.length} · 화살표로 넘겨 봐</span></div>
              <article class="eu-story-detail" aria-live="polite">
                <div class="eu-story-detail__top">
                  <span class="eu-story-detail__number" aria-hidden="true">${currentIndex + 1}</span>
                  <h3>${esc(visual.title)}</h3>
                  <span class="eu-story-detail__category">${CATEGORY_LABEL[visual.category]}</span>
                </div>
                <p class="eu-story-detail__caption">${esc(visual.caption)}</p>
                <p class="eu-story-detail__story">${esc(cultureExplanation(visual))}</p>
                <div class="eu-look"><strong>사진에서 찾아봐</strong>${esc(visual.lookFor)}</div>
              </article>
            </aside>
          </div>
        </section>`);
        body.replaceChildren(screen);
        const showAt = (index: number): void => {
          const nextVisual = country.visuals[(index + country.visuals.length) % country.visuals.length];
          if (!nextVisual) return;
          state.activeVisualId = nextVisual.id;
          if (!state.viewedVisualIds.includes(nextVisual.id)) state.viewedVisualIds.push(nextVisual.id);
          persist();
          void audio.playSfx('tap');
          render();
        };
        screen.querySelector<HTMLButtonElement>('[data-dir="prev"]')?.addEventListener('click', () => showAt(currentIndex - 1));
        screen.querySelector<HTMLButtonElement>('[data-dir="next"]')?.addEventListener('click', () => showAt(currentIndex + 1));
        screen.querySelector<HTMLButtonElement>('[data-meet-traveler]')?.addEventListener('click', () => openTravelerDialogue(country, visual));
        const back = button('지도', 'ghost');
        back.addEventListener('click', () => setScreen('map'));
        // 1·2번째 사진에서 멈춘 학생이 길을 잃지 않게, 하단에 다음 사진 버튼을 항상 둔다.
        if (!isFinalVisual) {
          const nextPhoto = button(`다음 사진 보기 (${currentIndex + 2}/${country.visuals.length})`);
          nextPhoto.addEventListener('click', () => showAt(currentIndex + 1));
          setBottom('사진을 넘기다 보면 마지막 사진에서 여행 친구를 만나!', [back, nextPhoto]);
        } else {
          setBottom(saved ? '친구 이야기 들음' : travelerAssetId ? `${withJosa(travelerName, '이', '가')} 기다리고 있어! 사진 속 친구를 눌러 봐.` : '문화 장면 살펴보기', [back]);
        }
        // 큰 사진을 넘길 때 그 사진에 대응하는 설명 한 개만 함께 바뀐다.
      };

      const renderGallery = (): void => {
        const savedCountries = content.countries.filter((country) => country.visuals.some((visual) => state.savedVisualIds.includes(visual.id)));
        if (galleryFilterId !== 'all' && !savedCountries.some((country) => country.id === galleryFilterId)) galleryFilterId = 'all';
        const tabs = [
          `<button type="button" class="eu-gallery-tab" data-filter="all" aria-pressed="${galleryFilterId === 'all'}">모두 보기</button>`,
          ...savedCountries.map((country) => `<button type="button" class="eu-gallery-tab" data-filter="${country.id}" aria-pressed="${country.id === galleryFilterId}">${esc(country.name)}</button>`)
        ].join('');
        const filtered = (galleryFilterId === 'all' ? savedCountries : savedCountries.filter((country) => country.id === galleryFilterId))
          .flatMap((country) => country.visuals.filter((visual) => state.savedVisualIds.includes(visual.id)));
        const cards = filtered.map((visual) => `<button type="button" class="eu-gallery-card" data-pick="${visual.id}" aria-pressed="${visual.id === state.selectedEvidenceId}">
          <img class="${imageClass(visual)}" src="${assetUrl(visual.imageId)}" alt="${esc(visual.title)}" data-asset-id="${visual.imageId}">
          <span class="eu-card-copy"><strong>${esc(visual.title)}</strong><span>${esc(visual.lookFor)}</span></span>
        </button>`).join('');
        const screen = element(`<section class="eu-screen">
          <div class="eu-heading"><h2>친구들의 걱정에서 찾은 공통점</h2><span class="chip">${state.savedVisualIds.length}개</span></div>
          <div class="eu-board eu-gallery">
            <div class="eu-gallery-tabs" role="group" aria-label="이야기를 들은 나라 선택">${tabs}</div>
            <div class="eu-gallery-grid">${cards}</div>
          </div>
        </section>`);
        body.replaceChildren(screen);
        screen.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((tab) => {
          tab.addEventListener('click', () => {
            galleryFilterId = tab.dataset.filter ?? 'all';
            renderGallery();
          });
        });
        screen.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((card) => {
          card.addEventListener('click', () => {
            const id = card.dataset.pick ?? '';
            const country = countryByVisual.get(id);
            if (!country) return;
            state.selectedEvidenceId = id;
            state.selectedCountryId = country.id;
            persist();
            void audio.playSfx('tap');
            renderGallery();
          });
        });
        const back = button('지도 다시 보기', 'ghost');
        back.addEventListener('click', () => setScreen('map'));
        const next = button('이유 쓰기');
        next.disabled = !state.selectedCountryId || !state.selectedEvidenceId;
        next.addEventListener('click', () => setScreen('reason'));
        setBottom(state.selectedEvidenceId ? '선택한 장면을 보며 내 이유를 써 보자.' : '나라를 고르고 장면 하나를 눌러.', [back, next]);
        showKeyPoint({
          id: 'europe.respect',
          lines: [
            '사진 한 장으로 그 나라 전체를 다 안다고 말할 수는 없어.',
            '그래서 우리는 더 알고 싶은 점을 질문으로 남기는 거야.'
          ],
          onDone: () => say('네 이유와 바로 이어질 장면 하나를 골라 봐.', screen.querySelector<HTMLElement>('[data-pick]'))
        });
      };

      const selectedPair = (): { country: EuropeCountry; visual: EuropeVisual } | null => {
        const country = countryById.get(state.selectedCountryId ?? '');
        const visual = visualById.get(state.selectedEvidenceId ?? '');
        return country && visual && country.visuals.some((item) => item.id === visual.id) ? { country, visual } : null;
      };

      const renderReason = (): void => {
        const pair = selectedPair();
        if (!pair) { setScreen('gallery'); return; }
        const prompts = content.reasonPrompts.map((prompt) => `<button type="button" class="eu-prompt" data-prompt="${prompt.id}" aria-pressed="${prompt.id === state.reasonPromptId}">${esc(prompt.label)}</button>`).join('');
        const activePrompt = content.reasonPrompts.find((prompt) => prompt.id === state.reasonPromptId);
        const screen = element(`<section class="eu-screen">
          <div class="eu-heading"><h2>왜 이 나라가 궁금해?</h2><span class="chip">${esc(pair.country.name)}</span></div>
          <div class="eu-board eu-form-layout">
            <div class="eu-evidence"><img class="${imageClass(pair.visual)}" src="${assetUrl(pair.visual.imageId)}" alt="${esc(pair.visual.title)}" data-asset-id="${pair.visual.imageId}"><div class="eu-evidence-caption"><strong>${esc(pair.visual.title)}</strong><span>${esc(pair.visual.lookFor)}</span></div></div>
            <div class="eu-write">
              <div class="eu-prompt-row" role="group" aria-label="이유 생각 방향">${prompts}</div>
              <div class="eu-prompt-question">${activePrompt ? esc(activePrompt.prompt) : '먼저 생각 방향 하나를 골라 봐.'}</div>
              <label for="eu-reason" style="font-size:var(--eu-copy);font-weight:900">나의 이유</label>
              <textarea id="eu-reason" maxlength="160" placeholder="사진에서 본 것을 넣어 짧게 써 봐.">${esc(state.reasonDraft)}</textarea>
              <span class="eu-count" data-count>${state.reasonDraft.length}/160</span>
            </div>
          </div>
        </section>`);
        body.replaceChildren(screen);
        screen.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach((promptButton) => {
          promptButton.addEventListener('click', () => {
            state.reasonPromptId = promptButton.dataset.prompt ?? null;
            persist();
            renderReason();
          });
        });
        const textarea = screen.querySelector<HTMLTextAreaElement>('#eu-reason')!;
        const count = screen.querySelector<HTMLElement>('[data-count]')!;
        const back = button('장면 다시 고르기', 'ghost');
        const next = button('궁금한 점 만들기');
        const update = () => {
          state.reasonDraft = textarea.value;
          count.textContent = `${state.reasonDraft.length}/160`;
          next.disabled = !state.reasonPromptId || !hasStudentReason(state.reasonDraft);
          const status = bottom.querySelector<HTMLElement>('.eu-status');
          if (status) status.textContent = next.disabled ? '이유를 조금 더 써 봐' : '이유가 준비됐어';
          schedulePersist();
        };
        textarea.addEventListener('input', update);
        back.addEventListener('click', () => setScreen('gallery'));
        next.disabled = !state.reasonPromptId || !hasStudentReason(state.reasonDraft);
        next.addEventListener('click', () => setScreen('question'));
        setBottom(state.reasonDraft.length ? '내 이유를 쓰는 중' : '방향을 고르고 이유를 써 봐', [back, next]);
        say('방향만 고른 뒤, 사진에서 본 것을 네 문장으로 써.', activePrompt ? textarea : screen.querySelector<HTMLElement>('[data-prompt]'));
      };

      const renderQuestion = (): void => {
        const pair = selectedPair();
        if (!pair) { setScreen('gallery'); return; }
        const starters = content.questionStarters.map((starter) => `<button type="button" class="eu-prompt" data-starter="${starter.id}" aria-pressed="${starter.id === state.questionStarterId}">${esc(starter.label)}</button>`).join('');
        const activeStarter = content.questionStarters.find((starter) => starter.id === state.questionStarterId);
        const questionHint = activeStarter?.id === 'change'
          ? '예: 무엇이 달라졌는지'
          : activeStarter?.id === 'why'
            ? '예: 이곳에 모이는지'
            : activeStarter?.id === 'how'
              ? '예: 계절 음식을 고르는지'
              : '앞말을 먼저 골라 봐.';
        const screen = element(`<section class="eu-screen">
          <div class="eu-heading"><h2>더 알아볼 질문</h2><span class="chip">${esc(pair.country.name)}</span></div>
          <div class="eu-board eu-form-layout">
            <div class="eu-evidence"><img class="${imageClass(pair.visual)}" src="${assetUrl(pair.visual.imageId)}" alt="${esc(pair.visual.title)}" data-asset-id="${pair.visual.imageId}"><div class="eu-evidence-caption"><strong>${esc(pair.visual.title)}</strong><span>${esc(state.reasonDraft)}</span></div></div>
            <div class="eu-write">
              <div class="eu-prompt-row" role="group" aria-label="질문 앞말">${starters}</div>
              <div class="eu-question-preview" data-preview>${activeStarter ? `<span>${esc(activeStarter.text)}</span> ${esc(state.questionDraft || '…')}?` : '질문 앞말을 먼저 골라 봐.'}</div>
              <label for="eu-question" style="font-size:var(--eu-copy);font-weight:900">내가 이어 쓸 말</label>
              <textarea id="eu-question" maxlength="120" placeholder="${esc(questionHint)}">${esc(state.questionDraft)}</textarea>
              <span class="eu-count" data-count>${state.questionDraft.length}/120</span>
            </div>
          </div>
        </section>`);
        body.replaceChildren(screen);
        screen.querySelectorAll<HTMLButtonElement>('[data-starter]').forEach((starterButton) => {
          starterButton.addEventListener('click', () => {
            state.questionStarterId = starterButton.dataset.starter ?? null;
            persist();
            renderQuestion();
          });
        });
        const textarea = screen.querySelector<HTMLTextAreaElement>('#eu-question')!;
        const count = screen.querySelector<HTMLElement>('[data-count]')!;
        const preview = screen.querySelector<HTMLElement>('[data-preview]')!;
        const back = button('이유 다시 보기', 'ghost');
        const next = button('환경 대화 기록 만들기');
        const update = () => {
          state.questionDraft = textarea.value;
          count.textContent = `${state.questionDraft.length}/120`;
          const starter = content.questionStarters.find((item) => item.id === state.questionStarterId);
          preview.textContent = fullQuestion(starter, state.questionDraft) || '질문 앞말을 고르고 네 말을 이어 써 봐.';
          next.disabled = !state.questionStarterId || !hasStudentQuestion(state.questionDraft);
          const status = bottom.querySelector<HTMLElement>('.eu-status');
          if (status) status.textContent = next.disabled ? '질문을 조금 더 이어 써 봐' : '질문이 준비됐어';
          schedulePersist();
        };
        textarea.addEventListener('input', update);
        back.addEventListener('click', () => setScreen('reason'));
        next.disabled = !state.questionStarterId || !hasStudentQuestion(state.questionDraft);
        next.addEventListener('click', () => setScreen('postcard'));
        setBottom(state.questionDraft.length ? '내 질문을 만드는 중' : '앞말을 고르고 질문을 이어 써', [back, next]);
        say('앞말 뒤에 네가 정말 궁금한 내용을 이어 써.', activeStarter ? textarea : screen.querySelector<HTMLElement>('[data-starter]'));
      };

      /** 흔들리는 계획 카드(P2-14) — 제출 직전 사건 1장. 실패는 없지만 계획 한 칸을 직접 고쳐야 한다. */
      let shakeupDone = false;
      const showShakeupCard = (buttonEl: HTMLButtonElement): void => {
        const original = state.reasonDraft.trim();
        const cardBody = element(`<div style="display:grid;gap:10px;text-align:left">
          <p style="font-weight:800;line-height:1.5">회의 준비 중 소식이 왔어! 발표 시간이 줄어서, <strong>사진에서 본 것이 담긴 생생한 이유</strong>부터 발표한대.</p>
          <p style="font-weight:800;color:var(--c-ink-soft)">네 이유에 사진에서 본 것을 한 마디만 더해 줘.</p>
          <textarea id="eu-shakeup" maxlength="160" rows="3" style="width:100%;font:inherit;padding:10px;border-radius:12px;border:2px solid var(--c-line)">${esc(original)}</textarea>
          <p id="eu-shakeup-hint" style="margin:0;font-weight:800;color:var(--c-coral)" hidden>이유가 아직 그대로야 — 사진 속 모습 하나만 더 붙여 줘!</p>
        </div>`);
        openModal({
          id: 'europe-shakeup',
          title: '흔들리는 소식!',
          bodyEl: cardBody,
          dismissible: false,
          actions: [{
            label: '이유 고쳐서 제출하기',
            kind: 'primary',
            onClick: (close) => {
              const input = cardBody.querySelector<HTMLTextAreaElement>('#eu-shakeup')!;
              const revised = input.value.replace(/\s+/g, ' ').trim();
              if (revised === original || !hasStudentReason(revised)) {
                const hint = cardBody.querySelector<HTMLElement>('#eu-shakeup-hint');
                if (hint) hint.hidden = false;
                input.focus();
                return;
              }
              state.reasonDraft = revised.slice(0, 160);
              state.updatedAt = new Date().toISOString();
              persist();
              shakeupDone = true;
              void audio.playSfx('success');
              close();
              finishMission(buttonEl);
            }
          }]
        });
      };

      const finishMission = (buttonEl: HTMLButtonElement): void => {
        if (finished) {
          navigate('#/map');
          return;
        }
        const pair = selectedPair();
        const starter = content.questionStarters.find((item) => item.id === state.questionStarterId);
        if (!pair || !state.reasonPromptId || !starter || !hasStudentReason(state.reasonDraft) || !hasStudentQuestion(state.questionDraft)) {
          showToast('세계 회의에 가져갈 이유와 질문을 먼저 완성해 줘.', 'warn');
          return;
        }
        if (!shakeupDone) {
          showShakeupCard(buttonEl);
          return;
        }
        state.postcardCompleted = true;
        state.stampAwarded = true;
        state.updatedAt = new Date().toISOString();
        persist();
        finished = true;
        const traveler = EUROPE_TRAVELERS[pair.country.id];
        writeMissionArtifact({
          schemaVersion: 1,
          missionId: 'europe',
          title: `${pair.country.name} 환경 걱정 기록`,
          purpose: '문화 장면과 여행가의 이야기를 연결해 유럽의 환경 변화 이야기를 세계 회의에 가져가.',
          initialHypothesis: '여행 전에는 유럽 여러 나라의 환경 변화가 서로 어떻게 이어지는지 몰랐어.',
          evidenceIds: [...state.savedVisualIds],
          evidenceLabel: `${pair.visual.title}에서 ${traveler?.name ?? '현지 여행가'}가 들려준 환경 걱정을 기록했어.`,
          voiceId: pair.country.id,
          voiceName: traveler?.name ?? pair.country.name,
          voiceLine: traveler?.concern ?? state.reasonDraft.trim(),
          firstDecision: pair.country.name,
          observedConsequence: traveler?.concern ?? state.reasonDraft.trim(),
          revisedDecision: fullQuestion(starter, state.questionDraft),
          rationale: state.reasonDraft.trim(),
          transferPrompt: '마지막 세계 회의에서 다른 대륙의 환경 걱정과 어떤 공통점이 있는지 연결해 볼까?',
          earnedAt: new Date().toISOString()
        });
        burstConfetti(buttonEl);
        recordEarthSignals('europe', pair ? [`${pair.country.name} · ${pair.visual.title}`] : []);
        // 배움 카드 정리(예상/발견 비교) 뒤에 완료 연출로 넘어간다 — 아메리카 finish와 같은 패턴
        const doComplete = (): void => { completeMissionFlow('europe', '유럽'); };
        const learn = getLearn(content);
        if (learn) showLearningWrap('europe', learn, doComplete);
        else doComplete();
      };

      const renderPostcard = (): void => {
        const pair = selectedPair();
        const starter = content.questionStarters.find((item) => item.id === state.questionStarterId);
        if (!pair || !starter) { setScreen('question'); return; }
        const question = fullQuestion(starter, state.questionDraft);
        const nickname = saveRepo.get().profile?.nickname ?? '탐험가';
        const screen = element(`<section class="eu-screen">
          <div class="eu-heading"><h2>${esc(content.postcard.title)}</h2><span class="chip">미리보기</span></div>
          <div class="eu-board eu-postcard-wrap">
            <article class="eu-postcard" aria-label="${esc(pair.country.name)} 환경 대화 기록">
              <div class="eu-postcard-photo"><img class="${imageClass(pair.visual)}" src="${assetUrl(pair.visual.imageId)}" alt="${esc(pair.visual.title)}" data-asset-id="${pair.visual.imageId}"></div>
              <div class="eu-postcard-copy">
                <h2>세계 회의에 가져갈 나라</h2><h3>${esc(pair.country.name)}</h3>
                <div class="eu-postcard-line"><strong>내가 고른 문화 장면</strong>${esc(pair.visual.title)}</div>
                <div class="eu-postcard-line"><strong>환경 문제가 걱정되는 이유</strong>${esc(state.reasonDraft)}</div>
                <div class="eu-postcard-line"><strong>회의에서 더 물을 점</strong>${esc(question)}</div>
                <div class="eu-sign">${esc(nickname)} 탐험가</div>
              </div>
            </article>
          </div>
        </section>`);
        body.replaceChildren(screen);
        const back = button('질문 다듬기', 'ghost');
        back.addEventListener('click', () => setScreen('question'));
        const finishButton = button(finished ? '세계 지도로 돌아가기' : content.postcard.finishLabel);
        finishButton.addEventListener('click', () => finishMission(finishButton));
        setBottom('세계 회의 준비 완료', [back, finishButton]);
        say(content.feedback.reflection, finishButton);
      };

      const render = (): void => {
        if (state.screen !== 'map') { stopMapFit?.(); stopMapFit = null; stopMapZoom?.(); stopMapZoom = null; }
        const progress = statusNow();
        const guarded = guardEuropeScreen(state, progress);
        if (guarded !== state.screen) {
          state.screen = guarded;
          persist();
        }
        updateSteps(bar, 6, STEP_INDEX[state.screen], STEP_INDEX[state.screen]);
        if (state.screen === 'map') renderMap();
        else if (state.screen === 'window') renderWindow();
        else if (state.screen === 'gallery') renderGallery();
        else if (state.screen === 'reason') renderReason();
        else if (state.screen === 'question') renderQuestion();
        else renderPostcard();
      };

      render();
    },

    unmount() {
      disposed = true;
      stopMapFit?.();
      stopMapFit = null;
      stopMapZoom?.();
      stopMapZoom = null;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      guide?.dispose();
      guide = null;
    }
  };
}
