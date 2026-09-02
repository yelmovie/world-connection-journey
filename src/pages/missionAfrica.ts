import type { Page } from '../router';
import type { AfricaMissionProgress } from '../types';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { fitAspect } from '../ui/aspectBox';
import { recordEarthSignals } from '../core/earthSignals';
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
import { createGateNote, updateGate, type GateRequirement } from '../ui/gateNote';
import { AFRICA_INSTRUMENTS, type AfricaInstrument } from '../content/africaInstruments';

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
  environmentSignals: EnvironmentSignal[]; issues: Issue[]; perspectives: Perspective[];
  actionTiers: Array<{ id: string; name: string }>; actions: Action[];
  proposal: { ideas: string[]; reasonExample: string };
}
const FLOW: Screen[] = ['intro','map','region','instrument','signal','environment','council']; // 영향·해결 실험·공동 제안 화면은 뺐다 — 회의가 끝나면 정리 모달 → 도장
const STEP: Record<Screen, number> = { intro:0,map:0,region:1,instrument:2,signal:3,environment:4,impact:5,council:5,solution:6,proposal:7 };
const safe = (value: string): string => value.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char));
const addUnique = (list: string[], value: string): void => { if (!list.includes(value)) list.push(value); };
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
@media (max-height:460px){.map-help{display:none}}
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
.country-detail{min-height:0;border-radius:20px;background:#fff;padding:clamp(11px,1.2vw,16px);display:flex;flex-direction:column;gap:8px;overflow:hidden;container-type:size}
/* 사진은 16:9를 지킨다 — 글 아래 남는 높이(약 250px 제외)에 맞춰 폭을 정하고 가운데 둔다 */
.country-detail .detail-photo{flex:0 0 auto;align-self:center;width:min(100%,calc((100cqh - 250px) * 16 / 9));min-width:min(100%,360px);aspect-ratio:16/9;min-height:0}
.country-detail:has(.detail-caption[hidden]) .detail-photo{width:min(100%,calc((100cqh - 70px) * 16 / 9));min-height:0}
.detail-photo{position:relative;flex:1 1 auto;width:100%;min-height:clamp(150px,20vh,300px);padding:0;border:3px solid #fff;border-radius:16px;background:#d9eef0 center/cover no-repeat;box-shadow:0 8px 20px #0a304d33;overflow:hidden;touch-action:pan-y;user-select:none;cursor:grab}
.detail-photo:active{cursor:grabbing}
.detail-photo:focus-visible{outline:5px solid #ffe052;outline-offset:3px}
.detail-photo-nav{position:absolute;z-index:2;top:50%;width:clamp(56px,5vw,74px);height:clamp(84px,11vh,124px);transform:translateY(-50%);border:0;background:rgba(9,47,71,.7);color:#fff;font-size:clamp(30px,2.6vw,44px);font-weight:950;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;transition:background .16s ease,transform .16s ease}
.detail-photo-nav>span{pointer-events:none}.detail-photo-nav[data-photo-prev]{left:0;border-radius:0 24px 24px 0}.detail-photo-nav[data-photo-next]{right:0;border-radius:24px 0 0 24px}.detail-photo-nav:hover,.detail-photo-nav:focus-visible{background:#0c6f91;outline:4px solid #ffe052;outline-offset:-4px}.detail-photo-nav:active{transform:translateY(-50%) scale(.94)}
.detail-caption,.detail-facts,.detail-pager{flex:0 0 auto}
.detail-facts{max-height:24vh;overflow:auto}
.detail-pager{min-height:52px;display:grid;place-items:center;padding:1px 12px}
.detail-pager h3{margin:0;text-align:center;font:900 clamp(23px,1.95vw,33px)/1.15 var(--font-head);color:#173b53;word-break:keep-all}
.detail-pager .sub{display:block;margin-top:3px;font:800 clamp(17px,1.25vw,21px)/1.2 var(--font-body);color:#3f7f6d}
.detail-caption[hidden]{display:none}
.detail-caption{flex:0 0 auto}
.country-detail:has(.detail-caption[hidden]) .detail-photo{min-height:clamp(200px,30vh,520px)}
.detail-caption{flex:0 0 auto;margin:0;padding:12px 15px;border-radius:14px;background:#eff7f4;border-left:7px solid #1b9a7a;font-size:clamp(19px,1.4vw,24px);line-height:1.45;color:#123f3a;word-break:keep-all}
.detail-facts{flex:0 1 auto;min-height:0;max-height:30vh;overflow:auto;margin:0;display:grid;gap:8px;align-content:start;font-size:clamp(18px,1.3vw,22px);line-height:1.4;color:#1d3b4a}
.detail-facts p{margin:0;word-break:keep-all}.detail-facts b{color:#155b4c;margin-right:6px}
.intro-scene{height:100%;display:grid;place-items:center;background:linear-gradient(#eafaff22,#0a527755),url('${assetUrl('africa.map')}') center/cover no-repeat}.intro-card{width:min(720px,90%);padding:clamp(22px,4vw,46px);text-align:center;border-radius:28px;background:#fffbeaed;border:3px solid #f3c44f;box-shadow:0 20px 60px #0018;animation:mapUnfold .8s ease-out both}.intro-card h1{font:900 var(--stage-title)/1.15 var(--font-head);color:#163b55}.intro-card p{font-size:var(--body-text);font-weight:800;color:#31556a}.intro-card .btn{font-size:var(--button-text);min-height:58px}@keyframes mapUnfold{from{opacity:0;transform:scaleX(.12) rotateY(24deg)}to{opacity:1;transform:none}}
.lab-layout{height:100%;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(390px,1fr);gap:16px;align-items:stretch}.instrument-gallery{min-height:0;background:#1a2b3be8;color:white;border-radius:20px;padding:14px;display:grid;grid-template-rows:minmax(0,1fr) auto auto;gap:10px}.instrument-photo{position:relative;min-height:0;border-radius:16px;overflow:hidden;background:#12202e}.instrument-photo img{width:100%;height:100%;min-height:300px;object-fit:contain}.instrument-photo button{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.instrument-photo .wave{position:absolute;left:18px;right:18px;bottom:14px;height:46px;display:flex;align-items:center;justify-content:center;gap:6px;pointer-events:none}.instrument-photo .wave i{width:6px;height:15px;background:#20c8c7;border-radius:6px}.instrument-photo.is-playing .wave i{animation:wave .7s ease-in-out infinite alternate}.instrument-photo .wave i:nth-child(2n){animation-delay:.15s}.instrument-photo .wave i:nth-child(3n){animation-delay:.3s}@keyframes wave{to{height:42px;background:#ffd34d}}
.instrument-thumbs{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.instrument-thumbs button{min-height:clamp(78px,10vh,104px);padding:5px;border:3px solid transparent;border-radius:12px;background:#fff;color:#173b53;font:900 clamp(16px,1.1vw,20px) var(--font-head)}.instrument-thumbs button[aria-pressed=true]{border-color:#ffd04c;background:#fff7d9}.instrument-thumbs img{width:100%;height:clamp(44px,5.6vh,64px);object-fit:cover;border-radius:8px}
.instrument-copy{display:grid;grid-template-rows:auto auto 1fr auto;gap:clamp(12px,1.8vh,24px);background:#fff;border-radius:20px;padding:clamp(18px,2.2vw,32px);overflow:auto}.instrument-copy h2{margin:0;font:900 clamp(30px,2.6vw,46px)/1.1 var(--font-head);color:#173b53}.instrument-intro{margin:0;font:800 clamp(19px,1.45vw,27px)/1.5 var(--font-body);color:#31556a;word-break:keep-all}.instrument-meta{display:grid;align-content:start;grid-template-columns:auto 1fr;gap:clamp(10px,1.5vh,20px) clamp(14px,1.2vw,24px);font-size:clamp(17px,1.25vw,23px);line-height:1.45}.instrument-meta dt{font-weight:900;color:#207862;white-space:nowrap}.instrument-meta dd{margin:0;word-break:keep-all}.instrument-hint{margin:0;padding:clamp(11px,1.5vh,18px) 16px;border-radius:14px;background:#fff7d9;border:2px solid #f0cf72;color:#5b430a;font:900 clamp(17px,1.25vw,23px)/1.4 var(--font-head);text-align:center;word-break:keep-all}
.instrument-controls{display:flex;gap:8px;flex-wrap:wrap}.instrument-controls .btn{flex:1;min-height:clamp(56px,7.5vh,74px);font-size:clamp(18px,1.3vw,24px)}
.signal-scene{height:100%;display:grid;place-items:center;background:url('${assetUrl('africa.map')}') center/cover no-repeat;position:relative;overflow:hidden}.signal-core{width:170px;height:170px;border-radius:50%;display:grid;place-items:center;background:#fff9;border:6px solid #ffd756}.signal-core img{width:120px}.signal-wave{position:absolute;width:160px;height:160px;border:6px solid #ffe05f;border-radius:50%;animation:signalWave 2s ease-out infinite}.signal-wave:nth-child(2){animation-delay:.65s}.signal-wave:nth-child(3){animation-delay:1.3s}@keyframes signalWave{to{width:1000px;height:1000px;opacity:0}}
.env-layout{height:100%;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(330px,.75fr);gap:16px}.env-layout>.aspect-fit{min-width:0;min-height:0}.env-map{position:relative;border-radius:20px;background:url('${assetUrl('africa.map')}') center/contain no-repeat #0e6580;min-height:0}/* 환경 신호 핀 — 번호가 큰 원형 배지, 안 본 것은 퍼지는 링으로 눈길을 끌고 본 것은 초록 체크 */
.signal-pin{min-width:88px;min-height:88px;padding:0;gap:0;border:3px solid rgba(255,255,255,.95);background:radial-gradient(circle at 35% 30%,#ff8a7a,#d8443f 70%);box-shadow:0 0 0 7px rgba(255,255,255,.28),0 12px 26px rgba(5,30,50,.45);isolation:isolate}
.signal-pin::before{content:'';position:absolute;inset:-14px;border-radius:50%;border:3px solid rgba(255,255,255,.6);animation:sig-halo 1.8s ease-out infinite;z-index:-1}
.signal-pin .sp-num{font:900 clamp(26px,2vw,34px)/1 var(--font-head);text-shadow:0 2px 4px rgba(0,0,0,.28)}
.signal-pin .sp-tag{margin-top:3px;font:800 13px/1 var(--font-body);letter-spacing:.08em;opacity:.92}
.signal-pin.is-viewed{background:radial-gradient(circle at 35% 30%,#3fd3a6,#128a6a 70%)}.signal-pin.is-viewed::before{animation:none;opacity:0}.signal-pin.is-viewed .sp-num::before{content:'✓ ';font-size:.75em}
@keyframes sig-halo{0%{transform:scale(.72);opacity:.9}100%{transform:scale(1.28);opacity:0}}:root[data-reduced-motion="true"] .signal-pin::before{animation:none}.signal-detail{background:#fff;border-radius:20px;padding:18px;overflow:auto;display:grid;align-content:start;gap:12px}.signal-detail h2{font:900 var(--section-title)/1.15 var(--font-head);margin:0;color:#173b53}.signal-detail p{font-size:var(--body-text);line-height:1.45;margin:0}.signal-detail{display:flex;flex-direction:column;gap:12px}.signal-detail .detail-photo{flex:none;aspect-ratio:16/9;min-height:0;height:auto} /* 그리드 행이 사진 비율 높이를 못 따라와 글을 덮던 문제 */
.council-layout{height:100%;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.7fr);gap:18px}.council-ring{position:relative;border-radius:50%;background:radial-gradient(circle,#fff8d6 0 28%,#a5dfe7 29% 58%,#eaf6f1 59%);min-height:470px}
.council-ring::before{content:'';position:absolute;left:50%;top:50%;width:clamp(120px,14vw,180px);height:clamp(120px,14vw,180px);transform:translate(-50%,-50%);background:url('${assetUrl('africa.host')}') center/contain no-repeat;filter:drop-shadow(0 8px 14px #0a304d55);pointer-events:none}.person-button{position:absolute;transform:translate(-50%,-50%);width:clamp(122px,12vw,158px);height:clamp(122px,12vw,158px);border-radius:50%;border:4px solid white;background:#173e5ee8;color:white;padding:10px;display:grid;place-items:center;text-align:center}.person-button .p-name{display:block;font:900 clamp(17px,1.3vw,21px)/1.15 var(--font-head)}.person-button .p-role{display:block;margin-top:3px;font:800 clamp(14px,1.1vw,16px)/1.3 var(--font-body);color:#cfe8ff;word-break:keep-all}.person-button.is-heard{background:#157c64}.council-speech{align-self:center;background:white;border:3px solid #e5ba45;border-radius:22px;padding:22px;min-height:250px;display:grid;align-content:center;gap:12px}.council-speech h2{font:900 var(--section-title) var(--font-head);margin:0;color:#173b53}.council-speech p{font-size:var(--body-text);line-height:1.5;margin:0}
@media(max-width:1050px){.africa-shell{height:auto;min-height:calc(100dvh - var(--top-bar-h) - 16px)}.region-layout,.lab-layout,.env-layout,.council-layout{grid-template-columns:1fr}.region-visual,.env-map,.council-ring{min-height:430px}.country-detail,.instrument-copy,.signal-detail{max-height:none}.africa-mission .page-body{place-items:start center}}
@media(max-height:700px) and (min-width:1051px){.africa-shell{height:calc(100dvh - var(--top-bar-h) - 14px)}.africa-main{padding:10px}.africa-map,.region-visual,.env-map,.council-ring{min-height:380px}.instrument-photo img{min-height:220px}.africa-head{padding:8px 18px}.africa-actions{padding:7px 12px}}
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
      await preloadImages(['africa.map','bg.africa','plane.africa','africa.emblem',...content.regions.map((region) => region.sceneAssetId),...content.landmarks.map((item) => item.assetId),...AFRICA_INSTRUMENTS.flatMap((i) => [i.photoId,i.id])]);
      audio.playBgm('africa');

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
      const actionBar = (...items: HTMLElement[]): HTMLElement => { const el=document.createElement('footer'); el.className='africa-actions'; el.append(...items); return el; };
      /** 비활성 버튼 옆에 남은 조건을 붙여 준다 — 왜 못 넘어가는지 아이가 알 수 있게. */
      const gated = (btn: HTMLButtonElement, reqs: GateRequirement[]): HTMLElement[] => { const note=createGateNote(); updateGate(btn,note,reqs); return [note,btn]; };
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
        const next=button('여행지에서 만난 소리 듣기'); next.addEventListener('click',()=>go('instrument'));
        // 조건 표시줄은 항상 띄워 둔다 — 예전처럼 버튼째 숨기면 무엇이 남았는지 알 수 없다.
        panel('아프리카 지도 펼치기',reviewedRegions()?'다섯 지역을 모두 탐험했어!':'표식을 눌러 지역을 탐험해 봐!',map,
          actionBar(...gated(next,[{ label:'지역 탐험', got:P.visitedRegions.length, need:AFRICA_REGION_IDS.length }])));
        // 지도 상자를 원본 비율로 맞춰야 다섯 표식이 모두 화면 안에 들어온다(남부가 잘려 못 누르던 문제)
        stopMapFit?.(); stopMapFit = fitAspect(map, 1672 / 941);
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
        const photo=document.createElement('div');photo.className='detail-photo';photo.setAttribute('role','group');photo.tabIndex=0;
        photo.innerHTML='<button type="button" class="detail-photo-nav" data-photo-prev aria-label="이전 그림 보기"><span aria-hidden="true">&#9664;</span></button><button type="button" class="detail-photo-nav" data-photo-next aria-label="다음 그림 보기"><span aria-hidden="true">&#9654;</span></button>';
        const pager=document.createElement('div');pager.className='detail-pager';
        pager.innerHTML='<h3></h3>';
        const caption=document.createElement('p');caption.className='detail-caption';
        const facts=document.createElement('div');facts.className='detail-facts';
        detail.append(photo,pager,caption,facts);
        let sceneCount=0;
        const refresh=()=>{
          const countryViewed=required.filter((id)=>P.visitedCountries.includes(id)).length;
          const complete=sceneCount>=3&&countryViewed>=required.length;
          if(complete&&!P.visitedRegions.includes(region.id)){
            addUnique(P.visitedRegions,region.id);
            persist();
          }
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
          if(current.caseId){
            const firstLook=!P.visitedCountries.includes(current.caseId);
            addUnique(P.visitedCountries,current.caseId);addUnique(P.discoveredGeographyClues,current.caseId);addUnique(P.discoveredCultureExamples,current.caseId);
            mapStage.querySelector(`[data-case="${current.caseId}"]`)?.classList.add('is-viewed');
            persist();
          }
          refresh();
        };
        // 처음과 끝에서도 멈추지 않고 이어지는 순환형 탐색으로 통일한다.
        const move=(delta:number)=>show((pageIndex+delta+pages.length)%pages.length);
        photo.querySelector('[data-photo-prev]')?.addEventListener('click',(event)=>{event.stopPropagation();move(-1)});
        photo.querySelector('[data-photo-next]')?.addEventListener('click',(event)=>{event.stopPropagation();move(1)});
        photo.addEventListener('keydown',(event)=>{if(event.key==='ArrowLeft'){event.preventDefault();move(-1)}else if(event.key==='ArrowRight'){event.preventDefault();move(1)}});
        let dragStartX:number|null=null;let suppressPhotoClick=false;
        photo.addEventListener('pointerdown',(event)=>{if((event.target as HTMLElement).closest('button'))return;dragStartX=event.clientX;suppressPhotoClick=false;photo.setPointerCapture?.(event.pointerId)});
        photo.addEventListener('pointerup',(event)=>{if(dragStartX===null)return;const distance=event.clientX-dragStartX;dragStartX=null;if(Math.abs(distance)>=36){suppressPhotoClick=true;move(distance>0?-1:1)}});
        photo.addEventListener('pointercancel',()=>{dragStartX=null});
        // 그림의 왼쪽/오른쪽 절반을 누르는 것만으로도 같은 방향으로 이동한다.
        photo.addEventListener('click',(event)=>{if((event.target as HTMLElement).closest('button'))return;if(suppressPhotoClick){suppressPhotoClick=false;return}const rect=photo.getBoundingClientRect();move(event.clientX<rect.left+rect.width/2?-1:1)});
        cases.forEach((item,index)=>{const pin=button(item.countryName,'country-pin');pin.dataset.case=item.id;const scenePosition=COUNTRY_SCENE_POSITIONS[item.id]??item.scenePosition??item.mapPosition;pin.style.left=`${scenePosition.x}%`;pin.style.top=`${scenePosition.y}%`;pin.classList.toggle('is-viewed',P.visitedCountries.includes(item.id));
          pin.addEventListener('click',()=>show(index+1)); mapStage.appendChild(pin);
        });
        const back=button('다른 지역 보기','btn');back.addEventListener('click',()=>go('map'));
        visual.append(mapStage,renderRegionTool(region,mapStage,(count)=>{sceneCount=count;refresh()}));layout.append(visual,detail);
        panel(region.name,region.summary,layout,actionBar(back));show(0);
      };

      const renderInstrument = (): void => {
        page.style.backgroundImage=`linear-gradient(#1e1830aa,#1e1830aa),url('${assetUrl('bg.africa')}')`;
        const layout=document.createElement('div');layout.className='lab-layout';const gallery=document.createElement('section');gallery.className='instrument-gallery';const photo=document.createElement('figure');photo.className='instrument-photo';
        const image=document.createElement('img');const hit=button('','');hit.setAttribute('aria-label','악기 사진을 눌러 소리 듣기');const wave=document.createElement('span');wave.className='wave';wave.setAttribute('aria-hidden','true');wave.innerHTML=Array.from({length:18},()=>'<i></i>').join('');photo.append(image,hit,wave);
        const thumbs=document.createElement('div');thumbs.className='instrument-thumbs';const copy=document.createElement('aside');copy.className='instrument-copy';let selected: AfricaInstrument=AFRICA_INSTRUMENTS[0]!;
        const stop=()=>{audio.stopClip();photo.classList.remove('is-playing');listen.textContent=`${selected.name} 소리 듣기`;listen.setAttribute('aria-pressed','false')};stopInstrument=stop;
        const show=()=>{stop();image.src=assetUrl(selected.photoId);image.alt=selected.alt;copy.querySelector('h2')!.textContent=selected.name;(copy.querySelector('[data-intro]') as HTMLElement).textContent=selected.intro;(copy.querySelector('[data-place]') as HTMLElement).textContent=selected.place;(copy.querySelector('[data-material]') as HTMLElement).textContent=selected.material;(copy.querySelector('[data-how]') as HTMLElement).textContent=selected.how;thumbs.querySelectorAll('button').forEach((b)=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.id===selected.id)));addUnique(P.instrumentLab.exploredInstrumentIds,selected.id);persist();refresh()};
        AFRICA_INSTRUMENTS.forEach((instrument)=>{const b=button(instrument.name,'');b.dataset.id=instrument.id;b.innerHTML=`<img src="${assetUrl(instrument.photoId)}" alt=""><span>${instrument.name}</span>`;b.addEventListener('click',()=>{selected=instrument;show()});thumbs.appendChild(b)});
        // 사진과 [소리 듣기] 버튼이 같은 재생을 토글한다 — 아이가 어느 쪽을 눌러도 같게 동작한다.
        const toggleClip=()=>{if(audio.clipPlaying){stop();return}if(audio.playClip(selected.clip,{loop:true,onEnd:()=>stop()})){photo.classList.add('is-playing');listen.textContent='그만 듣기';listen.setAttribute('aria-pressed','true');popBounce(image)}else{showToast('소리를 켜면 실제 연주를 들을 수 있어. 파형만 보고도 계속할 수 있어.','info')}};
        gallery.append(photo,thumbs);const listen=button('소리 듣기');const controls=document.createElement('div');controls.className='instrument-controls';listen.addEventListener('click',toggleClip);hit.addEventListener('click',toggleClip);controls.append(listen);gallery.appendChild(controls);
        copy.innerHTML='<h2></h2><p class="instrument-intro" data-intro></p><dl class="instrument-meta"><dt>확인된 지역</dt><dd data-place></dd><dt>재료</dt><dd data-material></dd><dt>연주 방법</dt><dd data-how></dd></dl><p class="instrument-hint">사진이나 [소리 듣기]를 눌러 실제 연주를 들어 봐!</p>';
        layout.append(gallery,copy);const back=button('지도 다시 보기','btn');back.addEventListener('click',()=>go('map'));const next=button('소리 신호 보내기');const gate=gated(next,[{ label:'악기 소리 듣기', got:P.instrumentLab.exploredInstrumentIds.length, need:3 }]);const refresh=()=>updateGate(next,gate[0]!,[{ label:'악기 소리 듣기', got:P.instrumentLab.exploredInstrumentIds.length, need:3 }]);next.addEventListener('click',()=>{P.instrumentLab.completed=true;persist();go('signal')});panel('악기 사진과 소리','악기 3개 이상 눌러 소리를 들어 봐!',layout,actionBar(back,...gate));show();refresh();
      };

      const renderSignal = (): void => {
        page.style.backgroundImage=`linear-gradient(#063a5977,#063a5999),url('${assetUrl('africa.map')}')`;
        const scene=document.createElement('div');scene.className='signal-scene';scene.innerHTML='<div class="signal-wave"></div><div class="signal-wave"></div><div class="signal-wave"></div>';
        const core=document.createElement('div');core.className='signal-core';core.innerHTML=`<img src="${assetUrl('plane.africa')}" alt="소리 신호를 보내는 여행 비행기">`;scene.appendChild(core);
        // 마지막으로 들어 본 악기 소리가 그대로 신호가 된다 — 비행기가 한 번 더 튕기며 함께 퍼진다.
        const lastId=P.instrumentLab.exploredInstrumentIds[P.instrumentLab.exploredInstrumentIds.length-1];
        const heard=AFRICA_INSTRUMENTS.find((i)=>i.id===lastId)??AFRICA_INSTRUMENTS[0]!;
        audio.playClip(heard.clip);stopInstrument=()=>audio.stopClip();popBounce(core);
        const next=button('도착한 환경 소식 살펴보기');next.addEventListener('click',()=>go('environment'));panel('소리 신호가 지도로 퍼져 나가',`${heard.name} 소리를 실어 보냈어. 친구들이 알려 준 변화가 도착했어!`,scene,actionBar(next));
      };

      const renderEnvironment = (): void => {
        page.style.backgroundImage=`linear-gradient(#063a5966,#063a5999),url('${assetUrl('africa.map')}')`;
        const layout=document.createElement('div');layout.className='env-layout';const map=document.createElement('section');map.className='env-map';const detail=document.createElement('aside');detail.className='signal-detail';detail.innerHTML='<h2>환경 신호를 눌러 봐</h2><p>물음표 3개를 모두 살펴보자!</p>';
        // 신호 표식은 그 신호가 온 권역 위에 선다 — 좌표를 따로 관리하면 지도가 바뀔 때 어긋난다
        const spotOf=(regionId:string)=>content.regions.find((r)=>r.id===regionId)?.position??{x:50,y:50};const viewed=()=>content.environmentSignals.every((s)=>P.environmentInvestigation.inspectedSignalIds.includes(s.id));
        content.environmentSignals.forEach((signal,i)=>{const pin=button('','signal-pin');pin.innerHTML=`<span class="sp-num">${i+1}</span><span class="sp-tag">신호</span>`;const spot=spotOf(signal.regionId);pin.style.left=`${spot.x}%`;pin.style.top=`${spot.y}%`;pin.classList.toggle('is-viewed',P.environmentInvestigation.inspectedSignalIds.includes(signal.id));pin.setAttribute('aria-label',`${signal.title} 살펴보기`);pin.addEventListener('click',()=>{
          addUnique(P.environmentInvestigation.inspectedSignalIds,signal.id);if(!P.environmentInvestigation.selectedIssueId)P.environmentInvestigation.selectedIssueId=signal.issueId;pin.classList.add('is-viewed');persist();const sceneId=content.regions.find((r)=>r.id===signal.regionId)?.sceneAssetId??'africa.map';detail.innerHTML=`<h2>${safe(signal.title)}</h2><div class="detail-photo" style="background-image:url('${assetUrl(sceneId)}')"></div><p><strong>어디에서?</strong> ${safe(signal.where)}</p><p><strong>자연의 변화</strong> ${safe(signal.nature)}</p><p><strong>생활의 영향</strong> ${safe(signal.life)}</p><p><strong>서로 연결된 까닭</strong> ${safe(signal.world)}</p>`;refresh()});map.appendChild(pin)});
        layout.append(map,detail);stopMapFit?.();stopMapFit=fitAspect(map,1672/941);const next=button('환경 협력 회의 열기');const signalReqs=()=>[{ label:'환경 신호', got:P.environmentInvestigation.inspectedSignalIds.length, need:content.environmentSignals.length }];const gate=gated(next,signalReqs());const refresh=()=>updateGate(next,gate[0]!,signalReqs());next.addEventListener('click',()=>go('council'));panel('여러 지역에서 온 환경 신호','환경 신호 3개를 눌러 살펴봐!',layout,actionBar(...gate));refresh();
      };

      const renderCouncil = (): void => {
        const issueId=P.environmentInvestigation.selectedIssueId??content.issues[0]?.id??'water';const people=content.perspectives.filter((p)=>p.issueIds.includes(issueId)).slice(0,4);const layout=document.createElement('div');layout.className='council-layout';const ring=document.createElement('section');ring.className='council-ring';const speech=document.createElement('aside');speech.className='council-speech';speech.innerHTML='<h2>친구들을 눌러 봐</h2><p>서로 다른 입장을 3명 이상 들어 보자!</p>';const heard=new Set<string>();const positions=[{x:50,y:18},{x:82,y:50},{x:50,y:82},{x:18,y:50}]; // 위아래 원이 링 밖으로 나가 잘리지 않게
        const next=button('아프리카 여행 마치기');const councilNeed=Math.min(3,people.length);const councilGate=gated(next,[{ label:'입장 듣기', got:0, need:councilNeed }]);people.forEach((person,i)=>{const b=button('','person-button');b.innerHTML=`<span><span class="p-name">${safe(person.name)}</span><span class="p-role">${safe(person.role)}</span></span>`;b.setAttribute('aria-label',`${person.name} · ${person.role} 이야기 듣기`);b.style.left=`${positions[i]?.x??50}%`;b.style.top=`${positions[i]?.y??50}%`;b.addEventListener('click',()=>{heard.add(person.id);b.classList.add('is-heard');speech.innerHTML=`<h2>${safe(person.name)}</h2><strong>${safe(person.role)}</strong><p>${safe(person.line)}</p>`;updateGate(next,councilGate[0]!,[{ label:'입장 듣기', got:heard.size, need:councilNeed }])});ring.appendChild(b)});layout.append(ring,speech);next.addEventListener('click',()=>finishMission());panel('아프리카 환경 협력 회의','문제와 관련된 서로 다른 입장을 들어 봐.',layout,actionBar(...councilGate));
      };

      const finishMission = (): void => {
        if(finishing||!canCompleteAfrica(P))return;finishing=true;P.passportStampAwarded=true;P.updatedAt=new Date().toISOString();saveRepo.setCheckpoint('africa','council',{africaProgress:structuredClone(P)});const issue=content.issues.find((i)=>i.id===P.environmentInvestigation.selectedIssueId);writeMissionArtifact({schemaVersion:1,missionId:'africa',title:'아프리카 공동 제안',purpose:'다섯 지역의 다양한 지리와 오늘의 생활을 살피고 연결된 환경문제에 협력 방안을 제안해.',initialHypothesis:'아프리카를 하나의 모습으로 묶지 않고 지도에서 직접 확인했어.',evidenceIds:[...P.visitedCountries,...P.environmentInvestigation.inspectedSignalIds],evidenceLabel:`다섯 권역과 ${P.visitedCountries.length}개 국가 사례, 환경 신호 ${P.environmentInvestigation.inspectedSignalIds.length}개를 살폈어.`,voiceId:'africa-regional-voices',voiceName:'여러 지역의 친구들',voiceLine:'지역마다 생활과 변화는 다르지만 물길·숲·도시·바다를 따라 서로 연결돼 있어.',firstDecision:issue?.name??'연결된 환경문제',observedConsequence:issue?.question??'',revisedDecision:'서로 다른 입장을 듣고 함께 풀기',rationale:content.proposal.reasonExample,transferPrompt:'마지막 세계 회의에서 지역의 목소리와 여러 주체의 책임을 함께 제안해 볼까?',earnedAt:new Date().toISOString()});recordEarthSignals('africa',[issue?.name,...content.environmentSignals.filter((s)=>P.environmentInvestigation.inspectedSignalIds.includes(s.id)).map((s)=>s.title)].filter((x): x is string => Boolean(x)));const doComplete=():void=>completeMissionFlow('africa','아프리카');const learn=getLearn(content);if(learn)showLearningWrap('africa',learn,doComplete);else doComplete();
      };

      const render = (): void => {
        if(!FLOW.includes(P.screen)){P.screen='council';persist();} // 예전 저장(영향·실험·제안 화면)은 회의로 보낸다
        setStep();stopInstrument?.();stopInstrument=null;
        switch(P.screen){case'intro':renderIntro();break;case'map':renderMap();break;case'region':renderRegion();break;case'instrument':renderInstrument();break;case'signal':renderSignal();break;case'environment':renderEnvironment();break;case'council':renderCouncil();break;}
      };
      render();
    },
    unmount(){disposed=true;clearTimers();stopMapFit?.();stopMapFit=null;stopMapZoom?.();stopMapZoom=null;stopInstrument?.();audio.stopClip();audio.stopBgm();}
  };
}
