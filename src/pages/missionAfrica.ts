import type { Page } from '../router';
import type { AfricaMissionProgress } from '../types';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { fitAspect } from '../ui/aspectBox';
import { recordEarthSignals } from '../core/earthSignals';
import { showKeyPoint } from '../ui/keyPoint';
import { enableMapZoom } from '../ui/mapZoom';
import { getLearn, showLearningWrap } from '../ui/learnFrame';
import { loadContent } from '../core/ContentRepository';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { saveRepo } from '../core/SaveRepository';
import { AFRICA_REGION_IDS, calculateAfricaMetrics, canCompleteAfrica, normalizeAfricaProgress } from '../core/africaMission';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow } from '../ui/feedback';
import { burstConfetti, popBounce } from '../ui/fx';
import { showToast } from '../ui/toast';

type Cell = 0 | 1 | 2;
type Screen = AfricaMissionProgress['screen'];

interface Position { x: number; y: number }
interface Source { title: string; url: string; reviewedAt: string }
interface RegionSceneStop { id: string; label: string; note: string; focusX: number; lensX: number; lensY: number }
interface Region {
  id: string; name: string; short: string; position: Position;
  sceneAssetId: string; sceneAlt: string; sceneStops: RegionSceneStop[];
  interaction: 'climate-slider' | 'panorama' | 'terrain-layers' | 'explorer-lens' | 'weather-board';
  instruction: string; summary: string;
}
interface CountryCase {
  id: string; countryId: string; countryName: string; regionId: string; title: string; mapPosition: Position; scenePosition?: Position;
  geographyClue: string; dailyLifeExample: string; culturalExample: string;
  media: Array<{ type: 'image' | 'audio' | 'shortAnimation'; assetId: string; alt: string }>;
  sources: Source[]; needsReview: boolean; stereotypeRiskNote?: string;
}
interface CountryLandmark { countryCaseId: string; name: string; note: string; assetId: string; alt: string; source: Source }
interface PatternDef { id: string; name: string; bpm: number; steps: number[]; desc: string }
interface EnvironmentSignal {
  id: string; regionId: string; issueId: string; title: string; where: string; nature: string; life: string; world: string;
  interaction: 'before-after' | 'lens' | 'water-path'; source: Source; needsReview: boolean;
}
interface Issue { id: string; name: string; question: string; completion: string }
interface Perspective { id: string; issueIds: string[]; name: string; role: string; line: string }
interface ActionEffect {
  environment?: number; communitySafety?: number; cultureAndHome?: number;
  sustainability?: number; feasibility?: number; fairness?: number;
}
interface Action { id: string; tierId: string; issueIds: string[]; name: string; tradeoff: string; effects: ActionEffect }
interface AfricaContent {
  title: string; subtitle: string;
  intro: { title: string; subtitle: string; guide: string; help: string };
  requirements: { regionCount: number; countryCount: number; signalCount: number; actionCount: number };
  regions: Region[]; countryCases: CountryCase[]; landmarks: CountryLandmark[];
  contextCards: Array<{ id: string; title: string; body: string }>;
  patterns: PatternDef[];
  callResponse: { guide: string; call: { bpm: number; steps: number[] }; rules: Array<{ id: string; text: string; check: string }>; examples: number[][] };
  feedback: { listenAgain: string; close: string; good: string };
  environmentSignals: EnvironmentSignal[]; issues: Issue[]; perspectives: Perspective[];
  actionTiers: Array<{ id: string; name: string }>; actions: Action[];
  proposal: { ideas: string[]; reasonExample: string };
}

const INSTRUMENTS = [
  { id:'africa.instrument1', photoId:'africa.photo.djembe', name:'젬베', place:'가나·말리·기니 등 서아프리카의 여러 연주 맥락', material:'나무 몸통과 동물 가죽 등', how:'두 손으로 북면을 쳐. 가운데는 낮은 쿵, 가장자리는 높은 탁 소리가 나.', clip:'sound/instrument/djembe.mp3', source:'Wikimedia Commons · CC BY 3.0', alt:'여러 젬베가 놓인 실물 사진' },
  { id:'africa.instrument2', photoId:'africa.photo.talkingdrum', name:'토킹드럼', place:'나이지리아·가나 등 서아프리카의 여러 공동체', material:'나무 몸통, 가죽, 장력 줄', how:'팔에 끼우고 줄의 장력을 바꾸며 굽은 채로 북면을 쳐.', clip:'sound/instrument/talkingdrum.mp3', source:'Wikimedia Commons · CC BY-SA 4.0', alt:'나이지리아의 토킹드럼 실물 사진' },
  { id:'africa.instrument3', photoId:'africa.photo.shekere', name:'셰케레', place:'나이지리아를 비롯한 서아프리카의 여러 연주 맥락', material:'말린 박과 구슬 그물', how:'박을 흔들거나 손으로 쳐서 구슬이 표면을 스치게 해.', clip:'sound/instrument/shekere.mp3', source:'Wikimedia Commons · Public domain', alt:'구슬 그물을 두른 셰케레 실물 사진' },
  { id:'africa.instrument4', photoId:'africa.photo.kalimba', name:'칼림바', place:'아프리카 여러 지역에서 변화해 온 라멜라폰 계열', material:'나무 울림통과 금속 건반', how:'두 손으로 들고 엄지손가락으로 금속 건반을 튕겨.', clip:'sound/instrument/kalimba.mp3', source:'Wikimedia Commons · CC0', alt:'금속 건반이 달린 칼림바 실물 사진' },
  { id:'africa.instrument5', photoId:'africa.photo.kora', name:'코라', place:'감비아·세네갈·말리 등 서아프리카의 여러 연주 맥락', material:'큰 박 울림통, 가죽, 여러 줄', how:'양손의 엄지와 집게손가락으로 줄을 뜯어 연주해.', clip:'sound/instrument/kora.mp3', source:'Wikimedia Commons · 재사용 가능 자료', alt:'세네갈 연주자가 코라를 연주하는 실물 사진' }
] as const;
type Instrument = (typeof INSTRUMENTS)[number];

const FLOW: Screen[] = ['intro','map','region','instrument','rhythm','signal','environment','impact','council','solution','proposal'];
const STEP: Record<Screen, number> = { intro:0,map:0,region:1,instrument:2,rhythm:2,signal:3,environment:4,impact:5,council:5,solution:6,proposal:7 };
const safe = (value: string): string => value.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));
const addUnique = (list: string[], value: string): void => { if (!list.includes(value)) list.push(value); };
const cells = (steps: number[]): Cell[] => Array.from({ length: 8 }, (_, i) => steps[i] === 1 ? 1 : steps[i] === 2 ? 2 : 0);
const COUNTRY_SCENE_POSITIONS: Record<string, Position> = {
  'morocco-gnawa': { x: 18, y: 73 },
  'egypt-giza': { x: 82, y: 73 },
  'senegal-ceebu-jen': { x: 18, y: 72 },
  'ghana-kente': { x: 82, y: 72 },
  'ethiopia-gada': { x: 18, y: 72 },
  'kenya-city-highland': { x: 82, y: 72 },
  'cameroon-cities': { x: 18, y: 72 },
  'drc-rumba': { x: 82, y: 72 },
  'namibia-desert-coast': { x: 18, y: 72 },
  'south-africa-cape': { x: 82, y: 72 }
};

const CSS = `
@media (max-height:460px){.map-help,.map-zoom-hint{display:none}}
.africa-mission{--stage-title:clamp(28px,2.2vw,44px);--section-title:clamp(24px,1.8vw,34px);--body-text:clamp(18px,1.25vw,24px);--button-text:clamp(18px,1.35vw,26px);background:#0c5b7d center/cover no-repeat;overflow:hidden}
.africa-mission *{word-break:keep-all;overflow-wrap:break-word}
.africa-mission .top-bar{background:linear-gradient(#174b68e8,#174b68bd)}
.africa-mission .page-body{padding:clamp(8px,1.4vh,16px) clamp(12px,2vw,28px);overflow:auto;display:grid;place-items:center}
.africa-shell{width:100%;height:calc(100dvh - var(--top-bar-h) - 24px);min-height:0;position:relative;display:grid}
/* 배경 지도 일러스트가 비치는 유리 패널 — 본문 카드들이 대비를 책임진다 */
.africa-panel{min-height:0;border:2px solid rgba(255,255,255,.72);border-radius:26px;background:rgba(249,247,236,.72);backdrop-filter:blur(10px) saturate(1.05);box-shadow:0 18px 46px #06243966;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr) auto}
.africa-head{padding:clamp(12px,2vh,22px) clamp(18px,2vw,30px);display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fff9e9;border-bottom:1px solid #d7cba9}
.africa-head h1,.africa-head h2{margin:0;color:var(--c-navy);font:900 var(--stage-title)/1.1 var(--font-head)}
.africa-head p{margin:4px 0 0;font-size:var(--body-text);font-weight:750;color:#31536a}
.africa-main{min-height:0;position:relative;padding:clamp(12px,2vh,24px);overflow:auto}
.africa-actions{display:flex;gap:12px;justify-content:center;align-items:center;flex-wrap:wrap;padding:12px 18px;background:#eef7f8;border-top:1px solid #c8dde1}
.africa-actions .btn{min-height:52px;font-size:var(--button-text)}
.africa-main:has(.africa-map){display:grid;overflow:hidden;min-height:0}
/* 지도는 fitAspect가 원본 비율 상자로 맞춘다 — height:100%로 두면 아래쪽(남부 지역)이 잘려 못 누른다 */
.africa-map{position:relative;min-height:0;overflow:hidden;border-radius:20px;background:#1275a8;touch-action:none;outline:none}
.africa-map__canvas{position:absolute;inset:0;background:url('${assetUrl('africa.map')}') center/contain no-repeat;transition:transform .18s ease;transform-origin:center}
.africa-map__ocean{position:absolute;padding:5px 10px;border-radius:999px;background:#0e405dcc;color:white;font-size:clamp(14px,1vw,18px);font-weight:850;pointer-events:none}
.africa-map__equator{position:absolute;left:20%;right:18%;top:57%;border-top:3px dashed #ffe276;pointer-events:none}.africa-map__equator span{position:absolute;right:0;top:6px;background:#173c55dd;color:white;padding:3px 8px;border-radius:8px}
.region-pin,.country-pin,.signal-pin{position:absolute;z-index:4;transform:translate(-50%,-50%);min-width:78px;min-height:78px;border-radius:50%;border:4px solid #fff;background:#173e5ee8;color:#fff;font:900 clamp(19px,1.45vw,24px)/1.15 var(--font-head);box-shadow:0 7px 18px #051e3280;display:grid;place-items:center;padding:9px;text-align:center;cursor:pointer}
.region-pin::after{content:'탐험';display:block;font:800 16px/1 var(--font-head);color:#ffe273}.region-pin.is-visited{background:#147b63}.region-pin.is-visited::after{content:'✓ 방문'}
.region-pin:focus-visible,.country-pin:focus-visible,.signal-pin:focus-visible{outline:5px solid #ffe052;outline-offset:3px}
.map-plane{position:absolute;width:clamp(64px,6vw,96px);transform:translate(-50%,-112%);filter:drop-shadow(0 8px 8px #001a);transition:left .7s cubic-bezier(.2,.8,.3,1),top .7s cubic-bezier(.2,.8,.3,1);pointer-events:none;z-index:3}
.map-controls{position:absolute;left:14px;bottom:14px;display:flex;gap:8px;z-index:5}.map-controls button{width:52px;height:52px;border-radius:50%;font-size:25px}
.map-help{position:absolute;right:14px;top:14px;max-width:330px;padding:10px 14px;border-radius:14px;background:#fffdf2e8;color:#183b52;font-size:clamp(16px,1.1vw,19px);font-weight:800;box-shadow:0 6px 18px #0a304d44;z-index:5}
.region-layout{height:100%;min-height:0;display:grid;grid-template-columns:minmax(0,.95fr) minmax(460px,1.15fr);gap:16px}
.region-visual{min-height:0;border-radius:20px;overflow:hidden;background:rgba(217,238,240,.92);display:grid;grid-template-rows:minmax(0,1fr) auto;gap:8px;padding:8px;isolation:isolate}
.region-mapstage{position:relative;min-height:clamp(150px,26vh,420px);border-radius:15px;overflow:hidden;background:#0e6580 center/cover no-repeat;transition:background-position 360ms ease,background-size 360ms ease}
.region-mapstage::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#03293a55,transparent 45%,#fff3);pointer-events:none}
.region-instruction{position:absolute;left:16px;top:16px;right:16px;z-index:4;background:#fffdf1e8;border-left:7px solid #f3bf45;border-radius:14px;padding:10px 14px;font-size:var(--body-text);font-weight:850;color:#173b53}
.region-mapstage .country-pin{min-width:0;min-height:46px;padding:6px 14px;border-radius:999px;background:rgba(12,38,58,.34);backdrop-filter:blur(6px) saturate(1.1);color:#fff;border:2px solid rgba(255,255,255,.85);text-shadow:0 2px 6px rgba(4,22,38,.85);box-shadow:0 6px 16px rgba(4,22,38,.35);z-index:5}.country-pin.is-viewed{background:rgba(22,132,103,.44);border-color:#8ff0cd}.country-pin.is-viewed::after{content:' ✓';color:#c8ffe9}
.region-tool{position:relative;z-index:6;padding:11px 14px;border-radius:15px;background:#102f48;color:white;display:grid;gap:7px}.region-tool label{font-size:clamp(18px,1.3vw,22px);font-weight:850}.region-tool input[type=range]{width:100%;height:38px}.region-tool{flex:0 0 auto}.region-tool-copy{margin:0;min-height:2.8em;font-size:clamp(18px,1.3vw,22px);line-height:1.4;color:#eaf7ff;word-break:keep-all}.tool-buttons{display:flex;gap:8px}.tool-buttons button{flex:1;min-height:56px;border-radius:12px;border:2px solid #fff8;background:#fff;color:#173b53;font-weight:900;font-size:clamp(18px,1.3vw,22px)}.tool-buttons button[aria-pressed=true]{background:#ffe071;border-color:#ffc131}.region-tool.is-done{box-shadow:inset 0 0 0 3px #56dfb1}
.lens{position:absolute;width:130px;height:130px;border:6px solid white;border-radius:50%;box-shadow:0 0 0 9999px #09283b70,0 8px 24px #0018;left:40%;top:48%;z-index:3;pointer-events:none}
.country-detail{min-height:0;border-radius:20px;background:#fff;padding:clamp(11px,1.2vw,16px);display:flex;flex-direction:column;gap:8px;overflow:hidden}
.detail-photo{position:relative;flex:0 0 auto;width:100%;aspect-ratio:16/9;max-height:min(38vh,380px);padding:0;border:3px solid #fff;border-radius:16px;background:#d9eef0 center/cover no-repeat;box-shadow:0 8px 20px #0a304d33}
.detail-caption,.detail-facts,.detail-pager,.detail-dots{flex:0 0 auto}
.detail-facts{max-height:24vh;overflow:auto}
.detail-pager{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px}
.detail-pager button{min-width:54px;min-height:54px;border-radius:50%;border:3px solid #cbd7df;background:#fff;color:#173b53;font-size:28px;font-weight:900;cursor:pointer}
.detail-pager button:disabled{opacity:.32;cursor:default}
.detail-pager h3{margin:0;text-align:center;font:900 clamp(23px,1.95vw,33px)/1.15 var(--font-head);color:#173b53;word-break:keep-all}
.detail-pager .sub{display:block;margin-top:3px;font:800 clamp(17px,1.25vw,21px)/1.2 var(--font-body);color:#3f7f6d}
.detail-caption[hidden]{display:none}
.country-detail:has(.detail-caption[hidden]) .detail-photo{max-height:min(52vh,520px)}
.detail-caption{flex:0 0 auto;margin:0;padding:12px 15px;border-radius:14px;background:#eff7f4;border-left:7px solid #1b9a7a;font-size:clamp(19px,1.4vw,24px);line-height:1.45;color:#123f3a;word-break:keep-all}
.detail-facts{flex:1 1 auto;min-height:0;overflow:auto;margin:0;display:grid;gap:8px;align-content:start;font-size:clamp(18px,1.3vw,22px);line-height:1.4;color:#1d3b4a}
.detail-facts p{margin:0;word-break:keep-all}.detail-facts b{color:#155b4c;margin-right:6px}
.detail-dots{display:flex;gap:8px;justify-content:center}
.detail-dots i{width:14px;height:14px;border-radius:50%;background:#cfdde4}.detail-dots i.is-on{background:#1b9a7a;transform:scale(1.2)}
.intro-scene{height:100%;display:grid;place-items:center;background:linear-gradient(#eafaff22,#0a527755),url('${assetUrl('africa.map')}') center/cover no-repeat}.intro-card{width:min(720px,90%);padding:clamp(22px,4vw,46px);text-align:center;border-radius:28px;background:#fffbeaed;border:3px solid #f3c44f;box-shadow:0 20px 60px #0018;animation:mapUnfold .8s ease-out both}.intro-card h1{font:900 var(--stage-title)/1.15 var(--font-head);color:#163b55}.intro-card p{font-size:var(--body-text);font-weight:800;color:#31556a}.intro-card .btn{font-size:var(--button-text);min-height:58px}@keyframes mapUnfold{from{opacity:0;transform:scaleX(.12) rotateY(24deg)}to{opacity:1;transform:none}}
.lab-layout{height:100%;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(350px,.85fr);gap:16px;align-items:stretch}.instrument-gallery{min-height:0;background:#1a2b3be8;color:white;border-radius:20px;padding:14px;display:grid;grid-template-rows:minmax(0,1fr) auto auto;gap:10px}.instrument-photo{position:relative;min-height:0;border-radius:16px;overflow:hidden;background:#eef2ed}.instrument-photo img{width:100%;height:100%;min-height:300px;object-fit:contain}.instrument-photo button{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.instrument-photo .wave{position:absolute;left:18px;right:18px;bottom:14px;height:46px;display:flex;align-items:center;justify-content:center;gap:6px;pointer-events:none}.instrument-photo .wave i{width:6px;height:15px;background:#20c8c7;border-radius:6px}.instrument-photo.is-playing .wave i{animation:wave .7s ease-in-out infinite alternate}.instrument-photo .wave i:nth-child(2n){animation-delay:.15s}.instrument-photo .wave i:nth-child(3n){animation-delay:.3s}@keyframes wave{to{height:42px;background:#ffd34d}}
.instrument-thumbs{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.instrument-thumbs button{min-height:72px;padding:4px;border:3px solid transparent;border-radius:12px;background:#fff;color:#173b53;font-weight:900}.instrument-thumbs button[aria-pressed=true]{border-color:#ffd04c;background:#fff7d9}.instrument-thumbs img{width:100%;height:42px;object-fit:cover;border-radius:8px}.instrument-copy{display:grid;align-content:start;gap:10px;background:#fff;border-radius:20px;padding:18px;overflow:auto}.instrument-copy h2{margin:0;font:900 var(--section-title)/1 var(--font-head);color:#173b53}.instrument-meta{display:grid;grid-template-columns:auto 1fr;gap:8px 12px;font-size:clamp(16px,1.1vw,19px)}.instrument-meta dt{font-weight:900;color:#207862}.instrument-meta dd{margin:0}.instrument-controls{display:flex;gap:8px;flex-wrap:wrap}.instrument-controls .btn{flex:1;min-height:52px}.drum-pad{display:grid;grid-template-columns:1fr 1fr;gap:8px}.drum-pad button{min-height:72px;border:3px solid #fff;border-radius:16px;font:900 22px var(--font-head)}.drum-pad .low{background:#6651cf;color:white}.drum-pad .high{background:#f4c74f;color:#4c3600}
.rhythm-layout{display:grid;grid-template-rows:auto 1fr auto;gap:14px;height:100%}.rhythm-demo{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff7dc;border:2px solid #e0b23c;border-radius:16px;padding:12px 16px}.rhythm-grid{display:grid;grid-template-columns:repeat(8,minmax(58px,1fr));gap:10px;align-items:stretch}.rhythm-cell{min-height:120px;border:3px solid #cbd7df;border-radius:18px;background:#fff;display:grid;place-items:center;font:900 clamp(18px,2vw,28px) var(--font-head);position:relative}.rhythm-cell[data-value='1']{background:#6251d2;color:white}.rhythm-cell[data-value='2']{background:#f2c94e;color:#513800}.rhythm-cell.is-play{outline:6px solid #12bfc2;transform:translateY(-5px)}.rhythm-cell small{position:absolute;top:6px;font-size:14px}.rhythm-key{display:flex;gap:10px;justify-content:center;font-size:18px;font-weight:800}.rhythm-key span{padding:7px 12px;border-radius:999px;background:white}.rhythm-status{display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;font-weight:800}.rhythm-status span{padding:6px 12px;border-radius:999px;background:#ffffffd9;color:#5b430a;font-size:16px}.rhythm-status span.is-ok{background:#e0f6ed;color:#116d5b}.rhythm-status p{margin:0;flex-basis:100%;text-align:center;color:#fff;font-size:17px;font-weight:850}
.signal-scene{height:100%;display:grid;place-items:center;background:url('${assetUrl('africa.map')}') center/cover no-repeat;position:relative;overflow:hidden}.signal-core{width:170px;height:170px;border-radius:50%;display:grid;place-items:center;background:#fff9;border:6px solid #ffd756}.signal-core img{width:120px}.signal-wave{position:absolute;width:160px;height:160px;border:6px solid #ffe05f;border-radius:50%;animation:signalWave 2s ease-out infinite}.signal-wave:nth-child(2){animation-delay:.65s}.signal-wave:nth-child(3){animation-delay:1.3s}@keyframes signalWave{to{width:1000px;height:1000px;opacity:0}}
.env-layout{height:100%;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(330px,.75fr);gap:16px}.env-layout>.aspect-fit{min-width:0;min-height:0}.env-map{position:relative;border-radius:20px;background:url('${assetUrl('africa.map')}') center/contain no-repeat #0e6580;min-height:0}.signal-pin{background:#e15a56;min-width:82px;min-height:82px}.signal-pin::after{content:'소식';font-size:15px}.signal-pin.is-viewed{background:#157e66}.signal-detail{background:#fff;border-radius:20px;padding:18px;overflow:auto;display:grid;align-content:start;gap:12px}.signal-detail h2{font:900 var(--section-title)/1.15 var(--font-head);margin:0;color:#173b53}.signal-detail p{font-size:var(--body-text);line-height:1.45;margin:0}.signal-interaction{min-height:118px;border-radius:16px;background:linear-gradient(90deg,#f2d28b 50%,#78bed7 50%);position:relative;overflow:hidden}.signal-interaction input{position:absolute;inset:auto 10px 6px;width:calc(100% - 20px);height:42px}.signal-interaction .marker{position:absolute;inset:14px;display:grid;place-items:center;font-weight:900;color:#173b53;text-shadow:0 1px white}.signal-interaction.is-done{outline:5px solid #1d9678}
.impact-track{height:100%;display:grid;grid-template-rows:auto 1fr auto;gap:16px}.issue-tabs{display:flex;gap:10px;justify-content:center}.issue-tabs button{min-height:56px;padding:10px 18px;border-radius:16px;border:3px solid #bdd0d8;background:white;font:900 20px var(--font-head)}.issue-tabs button[aria-pressed=true]{background:#ffe070;border-color:#d4a421}.connection-stage{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:center}.connection-node{min-height:220px;border-radius:50% 50% 18px 18px;background:#fff;border:4px solid #2a8aa0;padding:22px;display:grid;align-content:center;text-align:center;gap:8px;position:relative}.connection-node:not(:last-child)::after{content:'→';position:absolute;right:-27px;top:45%;font-size:40px;color:#db9c20;z-index:3}.connection-node strong{font:900 22px var(--font-head);color:#173b53}.connection-node p{font-size:18px;line-height:1.4}.connection-node.is-on{animation:nodePulse .45s ease both}@keyframes nodePulse{50%{transform:scale(1.06);background:#fff4bd}}
.council-layout{height:100%;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.7fr);gap:18px}.council-ring{position:relative;border-radius:50%;background:radial-gradient(circle,#fff8d6 0 28%,#a5dfe7 29% 58%,#eaf6f1 59%);min-height:470px}
.council-ring::before{content:'';position:absolute;left:50%;top:50%;width:clamp(120px,14vw,180px);height:clamp(120px,14vw,180px);transform:translate(-50%,-50%);background:url('${assetUrl('africa.host')}') center/contain no-repeat;filter:drop-shadow(0 8px 14px #0a304d55);pointer-events:none}.person-button{position:absolute;transform:translate(-50%,-50%);width:clamp(122px,12vw,158px);height:clamp(122px,12vw,158px);border-radius:50%;border:4px solid white;background:#173e5ee8;color:white;padding:10px;display:grid;place-items:center;text-align:center}.person-button .p-name{display:block;font:900 clamp(17px,1.3vw,21px)/1.15 var(--font-head)}.person-button .p-role{display:block;margin-top:3px;font:800 clamp(14px,1.1vw,16px)/1.3 var(--font-body);color:#cfe8ff;word-break:keep-all}.person-button.is-heard{background:#157c64}.council-speech{align-self:center;background:white;border:3px solid #e5ba45;border-radius:22px;padding:22px;min-height:250px;display:grid;align-content:center;gap:12px}.council-speech h2{font:900 var(--section-title) var(--font-head);margin:0;color:#173b53}.council-speech p{font-size:var(--body-text);line-height:1.5;margin:0}
.solution-layout{height:100%;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.65fr);gap:18px}.action-board{overflow:auto;display:grid;align-content:start;gap:12px}.action-tier{display:grid;grid-template-columns:180px 1fr;gap:10px;align-items:start}.action-tier h3{margin:0;padding:14px;border-radius:14px;background:#173e5e;color:white;font:900 19px var(--font-head)}.action-list{display:flex;gap:9px;flex-wrap:wrap}.action-list button{min-height:62px;flex:1 1 210px;border:3px solid #cbd7df;border-radius:15px;background:white;text-align:left;padding:10px 12px;font-weight:900;font-size:18px}.action-list button.is-selected{background:#e0f6ed;border-color:#18836a}.action-list button:disabled:not(.is-selected){opacity:.5}.metrics{background:#fff;border-radius:20px;padding:18px;display:grid;align-content:start;gap:10px}.metric{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;font-weight:850}.metric-bar{height:19px;background:#dbe5e9;border-radius:999px;overflow:hidden}.metric-bar i{display:block;height:100%;background:linear-gradient(90deg,#20a67e,#f0c74c);transition:width .45s}.tradeoff{padding:12px;border-radius:14px;background:#fff4cd;font-size:18px;line-height:1.35}
.proposal-layout{height:100%;display:grid;grid-template-columns:minmax(0,.78fr) minmax(0,1.22fr);gap:18px}.idea-picker,.proposal-poster{border-radius:20px;padding:20px;background:#fff;display:grid;align-content:start;gap:12px}.idea-picker button{min-height:58px;border:3px solid #c7d7df;border-radius:14px;background:#fff;text-align:left;font-weight:900;font-size:18px}.idea-picker button[aria-pressed=true]{background:#e0f6ed;border-color:#168369}.idea-picker textarea{width:100%;min-height:90px;border:3px solid #bfcfd8;border-radius:14px;padding:12px;font-size:18px}.proposal-poster{position:relative;background:linear-gradient(145deg,#fff8dc,#e5f6f4);border:5px solid #e8b53e;box-shadow:0 14px 30px #143a5550}
.proposal-poster::after{content:'';position:absolute;right:16px;bottom:16px;width:clamp(90px,9vw,130px);height:clamp(90px,9vw,130px);background:url('${assetUrl('africa.emblem')}') center/contain no-repeat;opacity:.92;pointer-events:none}.proposal-poster h2{font:900 var(--section-title) var(--font-head);color:#173b53;margin:0}.proposal-poster p{font-size:var(--body-text);line-height:1.55;margin:0}.proposal-poster strong{color:#116d5b}
@media(max-width:1050px){.africa-shell{height:auto;min-height:calc(100dvh - var(--top-bar-h) - 16px)}.region-layout,.lab-layout,.env-layout,.council-layout,.solution-layout,.proposal-layout{grid-template-columns:1fr}.region-visual,.env-map,.council-ring{min-height:430px}.country-detail,.instrument-copy,.signal-detail,.metrics{max-height:none}.africa-mission .page-body{place-items:start center}.rhythm-grid{grid-template-columns:repeat(4,1fr)}.action-tier{grid-template-columns:1fr}.connection-stage{grid-template-columns:1fr}.connection-node{min-height:130px;border-radius:18px}.connection-node:not(:last-child)::after{content:'↓';right:48%;top:auto;bottom:-35px}}
@media(max-height:700px) and (min-width:1051px){.detail-pager button{min-width:52px;min-height:52px;font-size:24px}.detail-dots{display:none}.africa-shell{height:calc(100dvh - var(--top-bar-h) - 14px)}.africa-main{padding:10px}.africa-map,.region-visual,.env-map,.council-ring{min-height:380px}.instrument-photo img{min-height:220px}.africa-head{padding:8px 18px}.africa-actions{padding:7px 12px}.rhythm-cell{min-height:84px}}
@media(prefers-reduced-motion:reduce){.intro-card,.signal-wave,.connection-node.is-on,.instrument-photo.is-playing .wave i{animation:none!important}.map-plane{transition:none}}
`;

function button(label: string, className = 'btn btn-primary'): HTMLButtonElement {
  const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = label; return el;
}

export function createPage(): Page {
  let disposed = false;
  const timers = new Set<number>();
  let stopInstrument: (() => void) | null = null;
  let stopMapFit: (() => void) | null = null;
  let stopMapZoom: (() => void) | null = null;
  const later = (fn: () => void, ms: number): number => { const id = window.setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms); timers.add(id); return id; };
  const clearTimers = (): void => { timers.forEach((id) => window.clearTimeout(id)); timers.clear(); };

  return {
    async mount(root: HTMLElement) {
      const content = await loadContent<AfricaContent>('africa');
      await preloadImages(['africa.map','bg.africa','plane.africa','africa.emblem',...content.regions.map((region) => region.sceneAssetId),...content.landmarks.map((item) => item.assetId),...INSTRUMENTS.flatMap((i) => [i.photoId,i.id])]);
      audio.playBgm('africa');
      void audio.prepareBeatSamples();

      const mission = saveRepo.get().missions.africa;
      const legacy = mission.data as Record<string, unknown>;
      const rawProgress = mission.data.africaProgress;
      let P = normalizeAfricaProgress(rawProgress, legacy);
      if (mission.status === 'completed') P.screen = 'map';
      if (mission.checkpointId && rawProgress) showToast('저장한 탐험 지점에서 이어갈게.', 'info');
      let finishing = false;

      const page = document.createElement('div');
      page.className = 'page africa-mission';
      const style = document.createElement('style'); style.textContent = CSS; page.appendChild(style);
      const top = buildTopBar({ title: content.title, subtitle: content.subtitle, backTo: '#/map', steps: { total: 8, done: 0, now: 0 } });
      page.appendChild(top);
      const body = document.createElement('main'); body.className = 'page-body'; page.appendChild(body);
      const shell = document.createElement('section'); shell.className = 'africa-shell'; body.appendChild(shell);
      root.appendChild(page);

      const persist = (): void => {
        P.updatedAt = new Date().toISOString();
        saveRepo.setCheckpoint('africa', P.screen, { africaProgress: structuredClone(P) });
      };
      const go = (screen: Screen): void => { stopInstrument?.(); stopInstrument = null; stopMapFit?.(); stopMapFit = null; stopMapZoom?.(); stopMapZoom = null; clearTimers(); P.screen = screen; persist(); render(); };
      const setStep = (): void => { const now = STEP[P.screen]; updateSteps(top, 8, Math.min(7, now), Math.min(7, now)); };
      const panel = (title: string, subtitle: string, main: HTMLElement, actions?: HTMLElement): void => {
        shell.replaceChildren();
        const wrap = document.createElement('article'); wrap.className = 'africa-panel';
        const head = document.createElement('header'); head.className = 'africa-head';
        head.innerHTML = `<div><h1>${safe(title)}</h1><p>${safe(subtitle)}</p></div>`;
        const mainWrap = document.createElement('div'); mainWrap.className = 'africa-main'; mainWrap.appendChild(main);
        wrap.append(head, mainWrap); if (actions) wrap.appendChild(actions); shell.appendChild(wrap);
      };
      const actionBar = (...buttons: HTMLButtonElement[]): HTMLElement => { const el=document.createElement('footer'); el.className='africa-actions'; el.append(...buttons); return el; };
      const reviewedRegions = (): boolean => AFRICA_REGION_IDS.every((id) => P.visitedRegions.includes(id));

      const renderIntro = (): void => {
        page.style.backgroundImage = `url('${assetUrl('africa.map')}')`;
        shell.replaceChildren();
        const scene=document.createElement('section'); scene.className='intro-scene';
        const card=document.createElement('div'); card.className='intro-card'; card.innerHTML=`<h1>${safe(content.intro.guide)}</h1><p>${safe(content.intro.subtitle)}</p>`;
        const start=button('지도 탐험 시작'); start.addEventListener('click',()=>go('map')); card.appendChild(start);
        scene.appendChild(card); shell.appendChild(scene); start.focus();
      };

      const renderMap = (): void => {
        page.style.backgroundImage = `linear-gradient(#06354e44,#06354e77),url('${assetUrl('africa.map')}')`;
        const map=document.createElement('div'); map.className='africa-map'; map.tabIndex=0; map.setAttribute('aria-label','아프리카 지도. 다섯 지역 표식을 자유로운 순서로 눌러 탐험해.');
        const canvas=document.createElement('div'); canvas.className='africa-map__canvas'; map.appendChild(canvas);
        canvas.insertAdjacentHTML('beforeend','<span class="africa-map__ocean" style="left:7%;top:48%">대서양</span><span class="africa-map__ocean" style="right:5%;top:55%">인도양</span><span class="africa-map__ocean" style="left:48%;top:4%">지중해</span><div class="africa-map__equator"><span>적도</span></div>');
        const plane=document.createElement('img'); plane.className='map-plane'; plane.src=assetUrl('plane.africa'); plane.alt='탐험 비행기'; canvas.appendChild(plane);
        const active=content.regions.find((region)=>region.id===P.activeRegionId) ?? content.regions[0];
        plane.style.left=`${active?.position.x ?? 49}%`; plane.style.top=`${active?.position.y ?? 50}%`;
        content.regions.forEach((region)=>{
          const pin=button(region.short,'region-pin'); pin.classList.toggle('is-visited',P.visitedRegions.includes(region.id)); pin.style.left=`${region.position.x}%`; pin.style.top=`${region.position.y}%`; pin.setAttribute('aria-label',`${region.name}${P.visitedRegions.includes(region.id)?', 방문함':', 탐험하기'}`);
          pin.addEventListener('click',()=>{ P.activeRegionId=region.id; plane.style.left=`${region.position.x}%`; plane.style.top=`${region.position.y}%`; later(()=>go('region'),540); }); canvas.appendChild(pin);
        });
        const help=document.createElement('p'); help.className='map-help'; help.textContent=reviewedRegions()?'다 살펴봤어! 이제 소리를 만나러 가자.':'표식을 눌러 다섯 지역을 탐험해!'; map.appendChild(help);
        // 두 손가락 확대·끌기는 공용 헬퍼가 처리한다 (아메리카·유럽·아시아와 같은 조작)
        stopMapZoom?.(); stopMapZoom = enableMapZoom(map, canvas, { max: 2.2 });
        map.insertAdjacentHTML('beforeend', '<span class="map-zoom-hint">두 손가락으로 크게 볼 수 있어</span>');
        const next=button('여행지에서 만난 소리 듣기'); next.disabled=!reviewedRegions(); next.addEventListener('click',()=>go('instrument'));
        panel('아프리카 지도 펼치기',reviewedRegions()?'다섯 지역을 모두 탐험했어!':'표식을 눌러 지역을 탐험해 봐!',map,reviewedRegions()?actionBar(next):undefined);
        // 지도 상자를 원본 비율로 맞춰야 다섯 표식이 모두 화면 안에 들어온다(남부가 잘려 못 누르던 문제)
        stopMapFit?.(); stopMapFit = fitAspect(map, 1672 / 941);
        showKeyPoint({
          id: 'africa.geo',
          imageId: 'plane.africa',
          lines: [
            '아프리카는 하나의 나라가 아니라, 54개 나라가 모인 아주 넓은 대륙이야.',
            '사막, 초원, 열대우림, 높은 산이 한 대륙 안에 모두 있어.'
          ],
          onDone: () => undefined
        });
      };

      const renderRegionTool = (region: Region, visual: HTMLElement, onProgress: (count: number) => void): HTMLElement => {
        const tool=document.createElement('div'); tool.className='region-tool'; let hits=new Set<string>();
        const mark=(id:string)=>{hits.add(id);if(hits.size>=3)tool.classList.add('is-done');onProgress(hits.size)};
        const stops=region.sceneStops.slice(0,3);
        const stopAt=(index:number)=>stops[Math.max(0,Math.min(stops.length-1,index))] ?? stops[0];
        const copy=()=>tool.querySelector<HTMLElement>('[data-tool-copy]');
        const focus=(stop:RegionSceneStop|undefined,zoom=true)=>{if(!stop)return;visual.style.backgroundSize=zoom?'165% auto':'cover';visual.style.backgroundPosition=zoom?`${stop.focusX}% center`:'center';const out=copy();if(out)out.textContent=`${stop.label} · ${stop.note}`;mark(stop.id)};
        // 그림을 눌러도 다음 장면으로 넘어간다 — 슬라이더가 낯선 아이도 터치만으로 진행할 수 있게.
        const tapAdvance=(input:HTMLInputElement)=>{visual.addEventListener('pointerdown',(event)=>{if((event.target as HTMLElement).closest('button,input'))return;const step=Number(input.step)||1;const max=Number(input.max)||1;let v=Number(input.value)+step;if(v>max)v=0;input.value=String(v);input.dispatchEvent(new Event('input'))})};
        if(region.interaction==='climate-slider'){
          tool.innerHTML=`<label>그림을 누르거나 손잡이를 움직여 봐</label><input type="range" min="0" max="2" step="1" value="0" aria-label="북부 아프리카 풍경 비교"><p class="region-tool-copy" data-tool-copy aria-live="polite">${safe(stops[0]?.label??'첫 풍경')} · ${safe(stops[0]?.note??'')}</p>`;
          const input=tool.querySelector<HTMLInputElement>('input')!;
          input.addEventListener('input',()=>focus(stopAt(Number(input.value))));tapAdvance(input);
        }else if(region.interaction==='panorama'){
          tool.innerHTML=`<label>그림을 누르거나 손잡이를 움직여 봐</label><input type="range" min="0" max="100" step="50" value="0" aria-label="서부 아프리카 생활 파노라마 이동"><p class="region-tool-copy" data-tool-copy aria-live="polite">${safe(stops[0]?.label??'첫 풍경')} · ${safe(stops[0]?.note??'')}</p>`;
          const input=tool.querySelector<HTMLInputElement>('input')!;input.addEventListener('input',()=>focus(stopAt(Math.round(Number(input.value)/50))));tapAdvance(input);
        }else if(region.interaction==='terrain-layers'){
          tool.innerHTML=`<label>버튼을 눌러 하나씩 봐</label><div class="tool-buttons">${stops.map((stop)=>`<button data-tool="${safe(stop.id)}">${safe(stop.label)}</button>`).join('')}</div><p class="region-tool-copy" data-tool-copy aria-live="polite">${safe(stops[0]?.note??'')}</p>`;
          tool.querySelectorAll<HTMLButtonElement>('button').forEach((b)=>b.addEventListener('click',()=>{tool.querySelectorAll('button').forEach((button)=>button.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');focus(stops.find((stop)=>stop.id===b.dataset.tool))}));
        }else if(region.interaction==='explorer-lens'){
          tool.innerHTML=`<label>버튼이나 그림을 눌러 렌즈를 옮겨 봐</label><div class="tool-buttons">${stops.map((stop)=>`<button data-tool="${safe(stop.id)}">${safe(stop.label)}</button>`).join('')}</div><p class="region-tool-copy" data-tool-copy aria-live="polite">${safe(stops[0]?.note??'')}</p>`; const lens=document.createElement('div');lens.className='lens';visual.appendChild(lens);
          const moveLens=(stop:RegionSceneStop|undefined)=>{if(!stop)return;lens.style.left=`${stop.lensX}%`;lens.style.top=`${stop.lensY}%`;const out=copy();if(out)out.textContent=`${stop.label} · ${stop.note}`;mark(stop.id)};
          tool.querySelectorAll<HTMLButtonElement>('button').forEach((b)=>b.addEventListener('click',()=>{tool.querySelectorAll('button').forEach((button)=>button.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');moveLens(stops.find((stop)=>stop.id===b.dataset.tool))}));
          visual.addEventListener('pointerdown',(event)=>{if((event.target as HTMLElement).closest('button'))return;const r=visual.getBoundingClientRect();const x=((event.clientX-r.left)/r.width)*100;const nearest=[...stops].sort((a,b)=>Math.abs(a.lensX-x)-Math.abs(b.lensX-x))[0];moveLens(nearest)});
        }else{
          tool.innerHTML=`<label>버튼을 눌러 하나씩 봐</label><div class="tool-buttons">${stops.map((stop)=>`<button data-tool="${safe(stop.id)}">${safe(stop.label)}</button>`).join('')}</div><p class="region-tool-copy" data-tool-copy aria-live="polite">${safe(stops[0]?.note??'')}</p>`;
          tool.querySelectorAll<HTMLButtonElement>('button').forEach((b)=>b.addEventListener('click',()=>{tool.querySelectorAll('button').forEach((button)=>button.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');focus(stops.find((stop)=>stop.id===b.dataset.tool))}));
        }
        if(stops[0]) mark(stops[0].id);
        return tool;
      };

      const renderRegion = (): void => {
        const region=content.regions.find((item)=>item.id===P.activeRegionId) ?? content.regions[0]; if(!region){go('map');return}
        page.style.backgroundImage=`linear-gradient(#08334e55,#08334eaa),url('${assetUrl('africa.map')}')`;
        const layout=document.createElement('div');layout.className='region-layout';const visual=document.createElement('section');visual.className='region-visual';const mapStage=document.createElement('div');mapStage.className='region-mapstage';mapStage.setAttribute('role','region');mapStage.setAttribute('aria-label',`${region.name} 탐험 지도`);
        mapStage.style.backgroundImage=`url('${assetUrl(region.sceneAssetId)}')`;mapStage.setAttribute('aria-label',region.sceneAlt);
        const detail=document.createElement('aside');detail.className='country-detail';
        const cases=content.countryCases.filter((item)=>item.regionId===region.id);const required=cases.map((item)=>item.id);
        // 오른쪽 패널은 한 번에 사진 한 장 + 그 사진에 딱 맞는 설명만 보여 준다.
        // 0번은 권역 전체 그림, 1번부터 나라별 대표 장소 그림. 화살표나 지도 표식으로 넘긴다.
        interface DetailPage{assetId:string;alt:string;title:string;sub:string;caption:string;facts:Array<[string,string]>;caseId?:string}
        const pages:DetailPage[]=[
          {assetId:region.sceneAssetId,alt:region.sceneAlt,title:region.name,sub:'',caption:'',facts:[]},
          ...cases.map((item)=>{
            const landmark=content.landmarks.find((entry)=>entry.countryCaseId===item.id);
            return {
              assetId:landmark?.assetId??region.sceneAssetId,
              alt:landmark?.alt??`${item.countryName} 대표 장소 학습용 재현 이미지`,
              title:item.countryName,
              sub:landmark?.name??item.title,
              caption:landmark?.note??item.geographyClue,
              facts:[['오늘의 생활',item.dailyLifeExample],['문화',item.culturalExample]] as Array<[string,string]>,
              caseId:item.id
            };
          })
        ];
        let pageIndex=0;
        // 사진은 처음부터 크게 보여 준다 — 눌러서 확대하는 단계를 없애고 화살표로 바로 넘긴다.
        const photo=document.createElement('div');photo.className='detail-photo';photo.setAttribute('role','img');
        const pager=document.createElement('div');pager.className='detail-pager';
        pager.innerHTML='<button type="button" data-prev aria-label="이전 그림 보기">◀</button><h3></h3><button type="button" data-next aria-label="다음 그림 보기">▶</button>';
        const caption=document.createElement('p');caption.className='detail-caption';
        const facts=document.createElement('div');facts.className='detail-facts';
        const dots=document.createElement('div');dots.className='detail-dots';dots.innerHTML=pages.map(()=>'<i></i>').join('');
        detail.append(photo,pager,caption,facts,dots);
        let sceneCount=0;
        const refresh=()=>{
          const countryViewed=required.filter((id)=>P.visitedCountries.includes(id)).length;
          const complete=sceneCount>=3&&countryViewed>=required.length;
          finish.disabled=!complete;
        };
        const show=(index:number)=>{
          pageIndex=Math.max(0,Math.min(pages.length-1,index));
          const current=pages[pageIndex]!;
          photo.style.backgroundImage=`url('${assetUrl(current.assetId)}')`;
          photo.setAttribute('aria-label',`${current.title} · ${current.alt}`);
          const head=pager.querySelector('h3');
          if(head)head.innerHTML=`${safe(current.title)}${current.sub?`<span class="sub">${safe(current.sub)}</span>`:''}`;
          caption.textContent=current.caption;caption.hidden=!current.caption;
          facts.innerHTML=current.facts.map(([label,text])=>`<p><b>${safe(label)}</b>${safe(text)}</p>`).join('');
          dots.querySelectorAll('i').forEach((dot,i)=>dot.classList.toggle('is-on',i===pageIndex));
          const prev=pager.querySelector<HTMLButtonElement>('[data-prev]');if(prev)prev.disabled=pageIndex===0;
          const next=pager.querySelector<HTMLButtonElement>('[data-next]');if(next)next.disabled=pageIndex===pages.length-1;
          if(current.caseId){
            addUnique(P.visitedCountries,current.caseId);addUnique(P.discoveredGeographyClues,current.caseId);addUnique(P.discoveredCultureExamples,current.caseId);
            mapStage.querySelector(`[data-case="${current.caseId}"]`)?.classList.add('is-viewed');
            persist();
          }
          refresh();
        };
        pager.querySelector('[data-prev]')?.addEventListener('click',()=>show(pageIndex-1));
        pager.querySelector('[data-next]')?.addEventListener('click',()=>show(pageIndex+1));
        cases.forEach((item,index)=>{const pin=button(item.countryName,'country-pin');pin.dataset.case=item.id;const scenePosition=COUNTRY_SCENE_POSITIONS[item.id]??item.scenePosition??item.mapPosition;pin.style.left=`${scenePosition.x}%`;pin.style.top=`${scenePosition.y}%`;pin.classList.toggle('is-viewed',P.visitedCountries.includes(item.id));
          pin.addEventListener('click',()=>show(index+1)); mapStage.appendChild(pin);
        });
        const back=button('다른 지역 보기','btn');back.addEventListener('click',()=>go('map'));const finish=button('이 지역을 탐험 지도에 남기기');finish.disabled=true;finish.addEventListener('click',()=>{addUnique(P.visitedRegions,region.id);persist();go('map')});
        visual.append(mapStage,renderRegionTool(region,mapStage,(count)=>{sceneCount=count;refresh()}));layout.append(visual,detail);
        panel(region.name,region.summary,layout,actionBar(back,finish));show(0);
      };

      const renderInstrument = (): void => {
        page.style.backgroundImage=`linear-gradient(#1e1830aa,#1e1830aa),url('${assetUrl('bg.africa')}')`;
        const layout=document.createElement('div');layout.className='lab-layout';const gallery=document.createElement('section');gallery.className='instrument-gallery';const photo=document.createElement('figure');photo.className='instrument-photo';
        const image=document.createElement('img');const hit=button('','');hit.setAttribute('aria-label','악기 사진을 눌러 소리와 진동 보기');const wave=document.createElement('span');wave.className='wave';wave.setAttribute('aria-hidden','true');wave.innerHTML=Array.from({length:18},()=>'<i></i>').join('');photo.append(image,hit,wave);
        const thumbs=document.createElement('div');thumbs.className='instrument-thumbs';const copy=document.createElement('aside');copy.className='instrument-copy';let selected: Instrument=INSTRUMENTS[0];
        const stop=()=>{audio.stopClip();photo.classList.remove('is-playing');listen.textContent=`${selected.name} 계속 듣기`;listen.setAttribute('aria-pressed','false')};stopInstrument=stop;
        const show=()=>{stop();image.src=assetUrl(selected.photoId);image.alt=selected.alt;copy.querySelector('h2')!.textContent=selected.name;(copy.querySelector('[data-place]') as HTMLElement).textContent=selected.place;(copy.querySelector('[data-material]') as HTMLElement).textContent=selected.material;(copy.querySelector('[data-how]') as HTMLElement).textContent=selected.how;(copy.querySelector('[data-source]') as HTMLElement).textContent=selected.source;thumbs.querySelectorAll('button').forEach((b)=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.id===selected.id)));addUnique(P.instrumentLab.exploredInstrumentIds,selected.id);persist();refresh()};
        INSTRUMENTS.forEach((instrument)=>{const b=button(instrument.name,'');b.dataset.id=instrument.id;b.innerHTML=`<img src="${assetUrl(instrument.photoId)}" alt=""><span>${instrument.name}</span>`;b.addEventListener('click',()=>{selected=instrument;show()});thumbs.appendChild(b)});
        gallery.append(photo,thumbs);const listen=button('계속 듣기');const controls=document.createElement('div');controls.className='instrument-controls';listen.addEventListener('click',()=>{if(audio.clipPlaying){stop();return}if(audio.playClip(selected.clip,{loop:true})){photo.classList.add('is-playing');listen.textContent='그만 듣기';listen.setAttribute('aria-pressed','true');popBounce(image)}else{showToast('소리를 켜면 실제 연주를 들을 수 있어. 파형만 보고도 계속할 수 있어.','info')}});controls.append(listen);gallery.appendChild(controls);
        copy.innerHTML='<h2></h2><dl class="instrument-meta"><dt>확인된 지역</dt><dd data-place></dd><dt>재료</dt><dd data-material></dd><dt>연주 방법</dt><dd data-how></dd><dt>사진·음원</dt><dd data-source></dd></dl><p>사진이나 북면을 눌러 소리를 내 봐!</p><div class="drum-pad"><button class="low">가운데<br>쿵</button><button class="high">가장자리<br>탁</button></div>';
        const playBeat=(kind:'low'|'high')=>{audio.playBeat(kind);photo.classList.add('is-playing');later(()=>photo.classList.remove('is-playing'),340);popBounce(image)};hit.addEventListener('click',()=>playBeat('low'));copy.querySelector<HTMLButtonElement>('.low')!.addEventListener('click',()=>playBeat('low'));copy.querySelector<HTMLButtonElement>('.high')!.addEventListener('click',()=>playBeat('high'));
        layout.append(gallery,copy);const back=button('지도 다시 보기','btn');back.addEventListener('click',()=>go('map'));const next=button('여덟 박 리듬 만들기');const refresh=()=>{next.disabled=P.instrumentLab.exploredInstrumentIds.length<3};next.addEventListener('click',()=>go('rhythm'));panel('악기 사진과 소리','악기 3개 이상 눌러 보고 소리를 내 봐!',layout,actionBar(back,next));show();refresh();
      };

      const renderRhythm = (): void => {
        page.style.backgroundImage=`linear-gradient(#1c1730bb,#1c1730bb),url('${assetUrl('bg.africa')}')`;
        const layout=document.createElement('div');layout.className='rhythm-layout';const demo=document.createElement('section');demo.className='rhythm-demo';demo.innerHTML='<div><strong>친구의 여덟 박을 듣고 이어서 대답해 봐.</strong><p>칸을 누르면 쉼 → 쿵 → 탁 순서로 바뀌어.</p></div>';
        const listen=button('호출 리듬 보고 듣기');demo.appendChild(listen);layout.appendChild(demo);const grid=document.createElement('div');grid.className='rhythm-grid';let draft=cells(P.instrumentLab.createdRhythm);
        const buttons:HTMLButtonElement[]=[];const paint=()=>buttons.forEach((b,i)=>{const value=draft[i]??0;b.dataset.value=String(value);b.innerHTML=`<small>${i+1}박</small>${value===1?'쿵':value===2?'탁':'쉼'}`});
        draft.forEach((_,i)=>{const b=button('','rhythm-cell');b.addEventListener('click',()=>{draft[i]=(((draft[i]??0)+1)%3) as Cell;P.instrumentLab.createdRhythm=[...draft];persist();paint();refresh()});buttons.push(b);grid.appendChild(b)});layout.appendChild(grid);
        const key=document.createElement('div');key.className='rhythm-key';key.innerHTML='<span>□ 쉼</span><span>● 가운데 쿵</span><span>▲ 가장자리 탁</span>';layout.appendChild(key);
        const play=(sequence:Cell[],done?:()=>void)=>{sequence.forEach((value,i)=>later(()=>{buttons.forEach((b)=>b.classList.remove('is-play'));buttons[i]?.classList.add('is-play');if(value===1)audio.playBeat('low');if(value===2)audio.playBeat('high')},i*340));later(()=>{buttons.forEach((b)=>b.classList.remove('is-play'));done?.()},sequence.length*340+100)};
        listen.addEventListener('click',()=>play(cells(content.callResponse.call.steps)));const mine=button('내 리듬 보고 듣기','btn');mine.addEventListener('click',()=>play(draft));const next=button('리듬 신호 보내기');
        const status=document.createElement('div');status.className='rhythm-status';layout.appendChild(status);
        // check는 콘텐츠의 규칙 키 — 문자열을 eval하지 않고 의미를 코드로 해석한다
        const CALL=cells(content.callResponse.call.steps);
        const passes=(check:string):boolean=>check==='min_hits'?draft.filter(Boolean).length>=4:check==='echo_last_two'?draft[0]===CALL[CALL.length-2]&&draft[1]===CALL[CALL.length-1]:check==='contrast'?draft.filter((v,i)=>v!==CALL[i]).length>=2:true;
        const refresh=()=>{
          const results=content.callResponse.rules.map((rule)=>({rule,ok:passes(rule.check)}));const passed=results.filter((r)=>r.ok).length;
          const level=passed>=results.length?'good':passed>=results.length-1?'close':'listenAgain';
          status.innerHTML=results.map((r)=>`<span class="${r.ok?'is-ok':''}">${r.ok?'✓':'□'} ${safe(r.rule.text)}</span>`).join('')+`<p>${safe(content.feedback[level])}${level==='listenAgain'?' 먼저 [호출 리듬 보고 듣기]를 다시 눌러 봐.':''}</p>`;
          next.disabled=level==='listenAgain'; // 규칙 대부분을 채워야 신호를 보낼 수 있다
        };
        next.addEventListener('click',()=>{P.instrumentLab.completed=true;P.instrumentLab.createdRhythm=[...draft];persist();go('signal')});paint();refresh();panel('리듬으로 대답하기',content.callResponse.guide,layout,actionBar(mine,next));
      };

      const renderSignal = (): void => {
        page.style.backgroundImage=`linear-gradient(#063a5977,#063a5999),url('${assetUrl('africa.map')}')`;
        const scene=document.createElement('div');scene.className='signal-scene';scene.innerHTML='<div class="signal-wave"></div><div class="signal-wave"></div><div class="signal-wave"></div>';
        const core=document.createElement('div');core.className='signal-core';core.innerHTML=`<img src="${assetUrl('plane.africa')}" alt="리듬 신호를 보내는 여행 비행기">`;scene.appendChild(core);P.instrumentLab.createdRhythm.forEach((value,i)=>later(()=>{if(value===1)audio.playBeat('low');if(value===2)audio.playBeat('high');popBounce(core)},i*330));
        const next=button('도착한 환경 소식 살펴보기');next.addEventListener('click',()=>go('environment'));panel('리듬 신호가 지도로 퍼져 나가','친구들이 알려 준 변화가 도착했어!',scene,actionBar(next));
      };

      const renderEnvironment = (): void => {
        page.style.backgroundImage=`linear-gradient(#063a5966,#063a5999),url('${assetUrl('africa.map')}')`;
        const layout=document.createElement('div');layout.className='env-layout';const map=document.createElement('section');map.className='env-map';const detail=document.createElement('aside');detail.className='signal-detail';detail.innerHTML='<h2>환경 신호를 눌러 봐</h2><p>물음표 3개를 모두 살펴보자!</p>';
        // 신호 표식은 그 신호가 온 권역 위에 선다 — 좌표를 따로 관리하면 지도가 바뀔 때 어긋난다
        const spotOf=(regionId:string)=>content.regions.find((r)=>r.id===regionId)?.position??{x:50,y:50};const viewed=()=>content.environmentSignals.every((s)=>P.environmentInvestigation.inspectedSignalIds.includes(s.id));
        content.environmentSignals.forEach((signal,i)=>{const pin=button(`? ${i+1}`,'signal-pin');const spot=spotOf(signal.regionId);pin.style.left=`${spot.x}%`;pin.style.top=`${spot.y}%`;pin.classList.toggle('is-viewed',P.environmentInvestigation.inspectedSignalIds.includes(signal.id));pin.setAttribute('aria-label',`${signal.title} 살펴보기`);pin.addEventListener('click',()=>{
          addUnique(P.environmentInvestigation.inspectedSignalIds,signal.id);if(!P.environmentInvestigation.selectedIssueId)P.environmentInvestigation.selectedIssueId=signal.issueId;pin.classList.add('is-viewed');persist();const sceneId=content.regions.find((r)=>r.id===signal.regionId)?.sceneAssetId??'africa.map';detail.innerHTML=`<h2>${safe(signal.title)}</h2><div class="detail-photo" style="background-image:url('${assetUrl(sceneId)}')"></div><p><strong>어디에서?</strong> ${safe(signal.where)}</p><p><strong>자연의 변화</strong> ${safe(signal.nature)}</p><p><strong>생활의 영향</strong> ${safe(signal.life)}</p><p><strong>서로 연결된 까닭</strong> ${safe(signal.world)}</p><div class="signal-interaction" style="background:linear-gradient(#0e405d66,#0e405d66),url('${assetUrl(sceneId)}') center/cover"><span class="marker" style="color:#fff;text-shadow:0 1px 4px #000c">${signal.interaction==='water-path'?'손잡이로 도시 → 강 → 바다를 따라가':'손잡이로 변화를 비교해'}</span><input type="range" min="0" max="100" value="0" aria-label="환경 변화 살펴보기"></div>`;const slider=detail.querySelector<HTMLInputElement>('input')!;slider.addEventListener('input',()=>{if(Number(slider.value)>72)slider.parentElement?.classList.add('is-done')});refresh()});map.appendChild(pin)});
        showKeyPoint({
          id: 'africa.connect',
          lines: [
            '한 지역의 물과 숲이 줄면, 이웃 지역 사람들의 하루까지 달라져.',
            '그래서 이런 문제는 한 나라만 노력해서는 풀리지 않아.'
          ],
          onDone: () => undefined
        });
        layout.append(map,detail);stopMapFit?.();stopMapFit=fitAspect(map,1672/941);const next=button('같은 문제의 다른 영향 보기');const refresh=()=>{next.disabled=!viewed()};next.addEventListener('click',()=>go('impact'));panel('여러 지역에서 온 환경 신호','환경 신호 3개를 눌러 살펴봐!',layout,actionBar(next));refresh();
      };

      const renderImpact = (): void => {
        const wrap=document.createElement('div');wrap.className='impact-track';const tabs=document.createElement('div');tabs.className='issue-tabs';let active=content.issues.find((i)=>i.id===P.environmentInvestigation.selectedIssueId)??content.issues[0];const stage=document.createElement('div');stage.className='connection-stage';const note=document.createElement('p');note.className='feedback success';
        const draw=()=>{if(!active)return;P.environmentInvestigation.selectedIssueId=active.id;persist();tabs.querySelectorAll('button').forEach((b)=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.id===active?.id)));const labels=active.id==='water'?[['건조 지역','생활용수와 농업용수'],['도시','공급과 누수 관리'],['강과 농지','생태계와 먹거리']]:active.id==='forest'?[['숲','서식지와 물 순환'],['마을·도시','에너지와 생활'],['다른 나라','소비와 공급망']]:[['도시','제품 사용과 수거'],['강','빗물과 함께 이동'],['해안','어업과 바다 생태계']];stage.innerHTML=labels.map(([a,b])=>`<article class="connection-node"><strong>${a}</strong><p>${b}</p></article>`).join('');stage.querySelectorAll('.connection-node').forEach((n,i)=>later(()=>n.classList.add('is-on'),i*360));note.textContent=active.completion};
        content.issues.forEach((issue)=>{const b=button(issue.name,'');b.dataset.id=issue.id;b.addEventListener('click',()=>{active=issue;draw()});tabs.appendChild(b)});wrap.append(tabs,stage,note);const next=button('환경 협력 회의 열기');next.addEventListener('click',()=>go('council'));panel('같은 문제, 서로 다른 영향',active?.question??'',wrap,actionBar(next));draw();
      };

      const renderCouncil = (): void => {
        const issueId=P.environmentInvestigation.selectedIssueId??content.issues[0]?.id??'water';const people=content.perspectives.filter((p)=>p.issueIds.includes(issueId)).slice(0,4);const layout=document.createElement('div');layout.className='council-layout';const ring=document.createElement('section');ring.className='council-ring';const speech=document.createElement('aside');speech.className='council-speech';speech.innerHTML='<h2>친구들을 눌러 봐</h2><p>서로 다른 입장을 3명 이상 들어 보자!</p>';const heard=new Set<string>();const positions=[{x:50,y:15},{x:82,y:52},{x:50,y:85},{x:18,y:52}];
        const next=button('공동 해결 실험으로');next.disabled=true;people.forEach((person,i)=>{const b=button('','person-button');b.innerHTML=`<span><span class="p-name">${safe(person.name)}</span><span class="p-role">${safe(person.role)}</span></span>`;b.setAttribute('aria-label',`${person.name} · ${person.role} 이야기 듣기`);b.style.left=`${positions[i]?.x??50}%`;b.style.top=`${positions[i]?.y??50}%`;b.addEventListener('click',()=>{heard.add(person.id);b.classList.add('is-heard');speech.innerHTML=`<h2>${safe(person.name)}</h2><strong>${safe(person.role)}</strong><p>${safe(person.line)}</p>`;next.disabled=heard.size<Math.min(3,people.length)});ring.appendChild(b)});layout.append(ring,speech);next.addEventListener('click',()=>go('solution'));panel('아프리카 환경 협력 회의','문제와 관련된 서로 다른 입장을 들어 봐.',layout,actionBar(next));
      };

      const renderSolution = (): void => {
        const issueId=P.environmentInvestigation.selectedIssueId??'water';const relevant=content.actions.filter((a)=>a.issueIds.includes(issueId));let selected=[...P.solutionLab.selectedActions].filter((id)=>relevant.some((action)=>action.id===id)).slice(0,3);const layout=document.createElement('div');layout.className='solution-layout';const board=document.createElement('section');board.className='action-board';const metrics=document.createElement('aside');metrics.className='metrics';const labels:{key:keyof NonNullable<AfricaMissionProgress['solutionLab']['finalMetrics']>;name:string}[]=[{key:'environment',name:'자연환경'},{key:'communitySafety',name:'생활 안전'},{key:'cultureAndHome',name:'문화·터전'},{key:'sustainability',name:'지속 가능성'},{key:'feasibility',name:'실행 가능성'},{key:'fairness',name:'공정성'}];
        content.actionTiers.forEach((tier)=>{const tierActions=relevant.filter((a)=>a.tierId===tier.id);if(!tierActions.length)return;const row=document.createElement('section');row.className='action-tier';row.innerHTML=`<h3>${safe(tier.name)}</h3>`;const list=document.createElement('div');list.className='action-list';tierActions.forEach((action)=>{const b=button(action.name,'');b.classList.toggle('is-selected',selected.includes(action.id));b.addEventListener('click',()=>{if(selected.includes(action.id))return;if(selected.length>=3){showToast('행동 토큰은 세 개야. 서로 다른 수준을 골라 봐.','info');return}selected.push(action.id);P.solutionLab.selectedActions=[...selected];persist();renderSolution()});list.appendChild(b)});row.appendChild(list);board.appendChild(row)});
        const effects=relevant.filter((a)=>selected.includes(a.id)).map((a)=>a.effects);const values=calculateAfricaMetrics(effects);metrics.innerHTML=`<h2>해결 지도</h2>${labels.map(({key,name})=>`<div class="metric"><span>${name}</span><span class="metric-bar"><i style="width:${values[key]}%"></i></span></div>`).join('')}<p class="tradeoff">${selected.length?relevant.find((a)=>a.id===selected.at(-1))?.tradeoff:'행동을 누르면 효과와 현실적인 장단점이 지도에 나타나.'}</p>`;
        layout.append(board,metrics);const reset=button('토큰 다시 놓기','btn');reset.addEventListener('click',()=>{selected=[];P.solutionLab.selectedActions=[];persist();renderSolution()});const next=button('공동 제안 만들기');next.disabled=selected.length<3;next.addEventListener('click',()=>{P.solutionLab.completed=true;P.solutionLab.finalMetrics=values;persist();go('proposal')});panel('공동 해결 실험','행동 3개를 골라 효과를 비교해 봐!',layout,actionBar(reset,next));
      };

      const finishMission = (): void => {
        if(finishing||!canCompleteAfrica(P))return;finishing=true;P.passportStampAwarded=true;P.updatedAt=new Date().toISOString();saveRepo.setCheckpoint('africa','proposal',{africaProgress:structuredClone(P)});const issue=content.issues.find((i)=>i.id===P.environmentInvestigation.selectedIssueId);writeMissionArtifact({schemaVersion:1,missionId:'africa',title:'아프리카 공동 제안',purpose:'다섯 지역의 다양한 지리와 오늘의 생활을 살피고 연결된 환경문제에 협력 방안을 제안해.',initialHypothesis:'아프리카를 하나의 모습으로 묶지 않고 지도에서 직접 확인했어.',evidenceIds:[...P.visitedCountries,...P.environmentInvestigation.inspectedSignalIds],evidenceLabel:`다섯 권역과 ${P.visitedCountries.length}개 국가 사례, 환경 신호 ${P.environmentInvestigation.inspectedSignalIds.length}개를 살폈어.`,voiceId:'africa-regional-voices',voiceName:'여러 지역의 친구들',voiceLine:'지역마다 생활과 변화는 다르지만 물길·숲·도시·바다를 따라 서로 연결돼 있어.',firstDecision:issue?.name??'연결된 환경문제',observedConsequence:P.solutionLab.selectedActions.join(', '),revisedDecision:P.jointProposal.selectedIdeas.join(', '),rationale:P.jointProposal.reason||content.proposal.reasonExample,transferPrompt:'마지막 세계 회의에서 지역의 목소리와 여러 주체의 책임을 함께 제안해 볼까?',earnedAt:new Date().toISOString()});recordEarthSignals('africa',[issue?.name,...content.environmentSignals.filter((s)=>P.environmentInvestigation.inspectedSignalIds.includes(s.id)).map((s)=>s.title)].filter((x): x is string => Boolean(x)));const doComplete=():void=>completeMissionFlow('africa','아프리카');const learn=getLearn(content);if(learn)showLearningWrap('africa',learn,doComplete);else doComplete();
      };

      const renderProposal = (): void => {
        const layout=document.createElement('div');layout.className='proposal-layout';const picker=document.createElement('section');picker.className='idea-picker';picker.innerHTML='<h2>공동 제안에 넣을 생각 두 개</h2>';let ideas=[...P.jointProposal.selectedIdeas];content.proposal.ideas.forEach((idea)=>{const b=button(idea,'');b.setAttribute('aria-pressed',String(ideas.includes(idea)));b.addEventListener('click',()=>{ideas=ideas.includes(idea)?ideas.filter((x)=>x!==idea):ideas.length<2?[...ideas,idea]:ideas;P.jointProposal.selectedIdeas=[...ideas];persist();renderProposal()});picker.appendChild(b)});const label=document.createElement('label');label.textContent='그 이유를 한 문장으로 말해 줘. 비워도 예시로 완성할 수 있어.';const reason=document.createElement('textarea');reason.maxLength=160;reason.placeholder=content.proposal.reasonExample;reason.value=P.jointProposal.reason;reason.addEventListener('input',()=>{P.jointProposal.reason=reason.value;persist();updatePoster()});label.appendChild(reason);picker.appendChild(label);
        const poster=document.createElement('article');poster.className='proposal-poster';const updatePoster=()=>{const issue=content.issues.find((i)=>i.id===P.environmentInvestigation.selectedIssueId);poster.innerHTML=`<h2>우리의 아프리카 공동 제안</h2><p>우리가 탐험한 아프리카의 지역들은 <strong>서로 다른 지리와 생활·문화</strong>를 가지고 있어.</p><p>하지만 <strong>${safe(issue?.name??'환경 변화')}</strong>로 서로 연결되어 있었어.</p><p>그래서 우리는 <strong>${safe(ideas[0]??'지역의 목소리를 듣는 행동')}</strong>과 <strong>${safe(ideas[1]??'여러 주체가 책임을 나누는 행동')}</strong>을 함께 제안해.</p><p>그 이유는 <strong>${safe(P.jointProposal.reason||content.proposal.reasonExample)}</strong></p>`};updatePoster();layout.append(picker,poster);const finish=button('제안 포스터 완성하고 도장 받기');finish.disabled=ideas.length<2;finish.addEventListener('click',()=>{P.jointProposal.completed=true;P.jointProposal.selectedIdeas=[...ideas];persist();finishMission()});panel('우리의 공동 제안','생각 2개를 골라 포스터를 완성해!',layout,actionBar(finish));
      };

      const render = (): void => {
        setStep();stopInstrument?.();stopInstrument=null;
        switch(P.screen){case'intro':renderIntro();break;case'map':renderMap();break;case'region':renderRegion();break;case'instrument':renderInstrument();break;case'rhythm':renderRhythm();break;case'signal':renderSignal();break;case'environment':renderEnvironment();break;case'impact':renderImpact();break;case'council':renderCouncil();break;case'solution':renderSolution();break;case'proposal':renderProposal();break;}
      };
      render();
    },
    unmount(){disposed=true;clearTimers();stopMapFit?.();stopMapFit=null;stopMapZoom?.();stopMapZoom=null;stopInstrument?.();audio.stopClip();audio.stopBgm();}
  };
}
