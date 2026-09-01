import type { Page } from '../router';
import type { MissionId } from '../types';
import { assetUrl, hasAsset } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { writeMissionArtifact } from '../core/missionArtifacts';
import { recordEarthSignals } from '../core/earthSignals';
import { saveRepo } from '../core/SaveRepository';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow } from '../ui/feedback';
import { openModal } from '../ui/modal';
import { showKeyPoint } from '../ui/keyPoint';
import { getLearn, showLearningWrap } from '../ui/learnFrame';
import { enableMapZoom } from '../ui/mapZoom';
import { enableRangeDrag } from '../ui/dnd';

type Hotspot = { id: string; x: number; y: number; label: string };
type Area = { id: string; name: string; short: string; description: string; x: number; y: number; color: string };
type Example = {
  id: string;
  areaId: string;
  country: string;
  place: string;
  scope: string;
  sourceTitle: string;
  sourceUrl: string;
  sceneIds: string[];
};
type Scene = {
  id: string;
  exampleId: string;
  category: string;
  categoryLabel: string;
  title: string;
  assetId: string;
  summary: string;
  detail: string;
  discovery: string;
  hotspots: Hotspot[];
  sourceTitle?: string;
  sourceUrl?: string;
};
type Signal = {
  id: string;
  title: string;
  prompt: string;
  connection: string;
  /** 지구회의 주제(ocean·climate·ecosystem)와의 명시 연결 */
  issueId: string;
  beforeAssetId: string;
  afterAssetId: string;
  sourceTitle: string;
  sourceUrl: string;
};
type Perspective = { id: string; name: string; role: string; line: string; worry: string; assetId: string };
type Action = { id: string; tier: string; label: string; detail: string };

interface RegionalModel {
  id: Extract<MissionId, 'asia' | 'oceania'>;
  /** 배움 카드(learnFrame) 원본 — JSON의 learn 섹션을 그대로 전달한다. */
  learn?: unknown;
  title: string;
  subtitle: string;
  guide: string;
  backgroundId: string;
  mapAssetId: string;
  bgm: 'asia' | 'oceania';
  areaLabel: string;
  areas: Area[];
  examples: Example[];
  scenes: Scene[];
  signals: Signal[];
  perspectives: Perspective[];
  actions: Action[];
  requirements: { minAreas: number; minExamples: number; minDiscoveries: number; minSignals: number };
}

interface RegionalState {
  screen: 'explore' | 'connections';
  activeAreaId: string | null;
  activeExampleId: string | null;
  visitedAreaIds: string[];
  viewedExampleIds: string[];
  viewedSceneIds: string[];
  discoveredSignalIds: string[];
  listenedPerspectiveIds: string[];
  /** 지금까지 한 번이라도 들은 목소리(누적) — 최대 2개만 유지되는 listened와 달리 지우지 않는다 */
  heardPerspectiveIds: string[];
  selectedActionIds: string[];
}

interface AsiaSource {
  intro: { title: string; subtitle: string; guide: string };
  requirements: { minRegions: number; minExamples: number; minDiscoveries: number; minSignals: number };
  regions: Array<{ id: string; nameKo: string; silhouette: string; mapPosition: { xPercent: number; yPercent: number } }>;
  countryExamples: Array<{ id: string; regionId: string; countryNameKo: string; placeNameKo: string; scopeNoteKo: string; sourceTitle: string; sourceUrl: string; sceneIds: string[] }>;
  scenes: Array<{ id: string; exampleId: string; category: string; titleKo: string; imageAssetId: string; summaryKo: string; detailKo: string; discoveryKo: string; hotspots: Array<{ id: string; x: number; y: number; labelKo: string }>; sourceTitle?: string; sourceUrl?: string }>;
  signals: Array<{ id: string; titleKo: string; promptKo: string; connectionTypes: string[]; beforeAssetId: string; afterAssetId: string; sourceTitle: string; sourceUrl: string }>;
  perspectives: Array<{ id: string; nameKo: string; labelKo: string; lineKo: string; worryKo: string; assetId: string }>;
  actions: Array<{ id: string; tier: string; nameKo: string; detailKo: string }>;
}

interface OceaniaSource {
  intro: { title: string; subtitle: string; guide: string };
  requirements: { minZones: number; minExamples: number; minDiscoveries: number; minSignals: number };
  zones: Array<{ id: string; name: string; short: string; x: number; y: number; color: string; description: string }>;
  countryExamples: Array<{ id: string; zoneId: string; country: string; place: string; scopeNote: string; sourceTitle: string; sourceUrl: string }>;
  scenes: Array<{ id: string; zoneId: string; exampleId: string; category: string; categoryLabel: string; title: string; assetId: string; summary: string; detail: string; discovery: string; hotspots: Hotspot[]; sourceTitle?: string; sourceUrl?: string }>;
  signals: Array<{ id: string; title: string; prompt: string; connectionType: string; connectionNote: string; beforeAssetId: string; afterAssetId: string; sourceTitle: string; sourceUrl: string }>;
  perspectives: Array<{ id: string; name: string; role: string; line: string; imageId: string }>;
  actions: Array<{ id: string; tier: string; label: string; metrics: Record<string, number> }>;
}

const COLORS = ['#3979c8', '#16a39b', '#e79b2f', '#8b64c6', '#d85f7b'];

/** 스테이지마다 반드시 읽고 넘어가야 하는 핵심 개념 두 지점(지리 → 세계 공통 문제). */
const KEY_POINTS: Record<string, { geo: string[]; connect: string[] }> = {
  asia: {
    geo: [
      '아시아는 세계에서 가장 넓은 대륙이야. 사막, 초원, 큰 강, 섬이 한 대륙 안에 다 있어.',
      '자연이 다르니 집 짓는 방법도, 먹는 것도, 축제도 지역마다 달라.'
    ],
    connect: [
      '강과 바다와 바람은 국경에서 멈추지 않아. 한 곳의 변화가 이웃 나라의 하루를 바꿔.',
      '그래서 이런 문제는 크기가 다른 행동을 함께 골라야 풀려.'
    ]
  },
  oceania: {
    geo: [
      '오세아니아는 큰 대륙 하나와 수천 개의 섬이 넓은 바다로 이어진 곳이야.',
      '바다는 사람들을 갈라놓는 벽이 아니라, 오래전부터 서로를 이어 준 길이었어.'
    ],
    connect: [
      '바닷물의 온도와 높이가 조금만 달라져도 섬마을의 집과 밭이 가장 먼저 영향을 받아.',
      '멀리 있는 나라의 선택도 이 바다로 이어져 있어서, 함께 정해야 해.'
    ]
  }
};

const PAGE_CSS = `
.regional-mission{background-position:center;background-size:cover;color:var(--c-ink)}
.regional-mission .top-bar{background:linear-gradient(180deg,rgba(10,46,78,.94),rgba(10,46,78,.62))}
.regional-mission .regional-body{min-height:0;padding:14px clamp(12px,2vw,28px);overflow:auto}
.regional-shell{width:min(1500px,100%);min-height:calc(100dvh - var(--top-bar-h) - var(--bottom-bar-h) - 28px);margin:auto;display:grid;grid-template-columns:minmax(520px,1.5fr) minmax(330px,.72fr);gap:14px}
.regional-map,.regional-side,.regional-connections{border:2px solid rgba(255,255,255,.78);border-radius:28px;box-shadow:0 18px 45px rgba(7,31,54,.28);overflow:hidden}
.regional-map{position:relative;min-height:0;aspect-ratio:16/9;background-color:#1689c7;isolation:isolate;touch-action:none}
/* 확대·이동은 이 층에만 — 표식이 지도와 함께 움직여야 위치가 어긋나지 않는다 */
.regional-map-layer{position:absolute;inset:0;background-position:center;background-repeat:no-repeat;background-size:contain;transform-origin:50% 50%;transition:transform .12s ease-out}
.regional-map::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(2,42,70,.05),rgba(2,42,70,.28));pointer-events:none}
.regional-map-note{position:absolute;z-index:2;left:18px;bottom:18px;max-width:min(520px,72%);padding:10px 14px;border-radius:16px;background:rgba(255,253,246,.92);font-weight:800;line-height:1.4}
.regional-pin{position:absolute;z-index:3;left:var(--x);top:var(--y);transform:translate(-50%,-50%);min-width:104px;min-height:62px;padding:7px 12px;border:3px solid #fff;border-radius:22px;background:var(--pin);color:#fff;font:800 18px/1.1 var(--font-head);box-shadow:0 7px 0 rgba(7,38,62,.28),0 12px 25px rgba(5,30,50,.28)}
.regional-pin small{display:block;margin-top:4px;font:700 16px/1.1 var(--font-body)}
.regional-pin.is-active{outline:5px solid rgba(255,203,67,.85);transform:translate(-50%,-54%) scale(1.05)}
.regional-pin.is-visited::after{content:"✓";position:absolute;right:-8px;top:-10px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#1b9b68;border:2px solid #fff}
.regional-country-shortcut{position:absolute;z-index:4;left:84%;top:52%;transform:translate(-50%,-50%);padding:8px 12px;border:3px solid #fff;border-radius:18px;background:#fff8d9;color:#123c5b;font:900 16px/1.15 var(--font-head);box-shadow:0 6px 0 #d49b28,0 12px 22px rgba(5,30,50,.3)}
.regional-country-shortcut small{display:block;margin-top:3px;color:#76531c;font:800 16px/1.1 var(--font-body)}
.regional-country-shortcut.is-active{outline:5px solid rgba(255,203,67,.85);transform:translate(-50%,-54%) scale(1.05)}
.regional-side{padding:18px;background:rgba(255,253,247,.96);display:flex;flex-direction:column;gap:12px;min-height:0}
.regional-side h2,.regional-connections h2{font-family:var(--font-head);font-size:clamp(25px,2.2vw,34px);color:var(--c-navy)}
.regional-side p{line-height:1.5}
.regional-example-list{display:grid;gap:8px;max-height:210px;overflow:auto;padding:2px}
.regional-example{justify-content:flex-start;text-align:left;min-height:58px;padding:9px 13px;border-radius:16px}
.regional-example span{display:block;font:700 clamp(16px,1.1vw,19px)/1.3 var(--font-body);color:var(--c-ink-soft)}
.regional-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch}
.regional-photo{position:relative;min-width:0;height:100%;padding:0;overflow:hidden;display:grid;grid-template-rows:minmax(0,1fr) 66px;border:2px solid transparent;border-radius:18px;background:#d9edf2;box-shadow:var(--shadow-card);cursor:pointer}
.regional-photo img{width:100%;aspect-ratio:4/3;display:block;object-fit:cover}
.regional-photo strong{min-height:66px;padding:8px;display:grid;place-items:center;text-align:center;font-size:clamp(17px,1.25vw,21px);line-height:1.25;word-break:keep-all;overflow-wrap:break-word}
.regional-photo.is-viewed{border-color:var(--c-success)}
.regional-photo.is-viewed::after{content:"✓";position:absolute;right:7px;top:7px;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--c-success);color:#fff;font-weight:900}
.regional-dock{background:rgba(10,42,68,.94);align-items:center}
.regional-dock [data-next]{margin-left:auto}
.regional-connections{grid-column:1/-1;padding:0 18px 18px;background:rgba(255,253,247,.97);overflow:auto;overscroll-behavior:contain}
/* 완료 조건 진행 띠 — 스크롤해도 항상 보인다 */
.regional-progress-strip{position:sticky;top:0;z-index:6;display:flex;flex-wrap:wrap;gap:8px;margin:0 -18px 12px;padding:12px 18px;background:rgba(255,253,247,.97);border-bottom:2px solid rgba(23,59,83,.12);box-shadow:0 6px 14px rgba(10,40,66,.08)}
.regional-progress-goal{display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:999px;border:2px solid #b9cbd6;background:#fff;font-weight:900;font-size:max(16px,var(--fs-small));color:var(--c-ink-soft)}
.regional-progress-goal b{color:inherit}
.regional-progress-goal.is-done{border-color:#277147;background:#dff2df;color:#1d5c39}
.regional-progress-goal.is-done::before{content:'✓';font-weight:900}
.regional-connection-layout{display:grid;grid-template-columns:1.12fr .88fr;gap:16px}
.regional-section{display:grid;gap:10px;align-content:start}
.regional-signal-grid,.regional-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.regional-signal,.regional-choice{text-align:left;padding:12px;min-height:78px;border-radius:18px}
.regional-choice{position:relative;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:10px}
.regional-choice img{width:54px;height:64px;object-fit:contain}
/* 아직 못 들은 목소리(P2-16) — "…" 표시가 재방문 이유가 된다 */
.regional-voice-dots{position:absolute;right:8px;top:6px;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#e8eef2;color:#41627a;font:900 16px/1 var(--font-head);font-style:normal}
.regional-choice.is-unheard{border-style:dashed}
.regional-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.regional-action{text-align:left;padding:10px;border-radius:16px;min-height:66px}
.regional-info{align-self:start;min-height:48px;padding:8px 16px;border-radius:999px;font-size:16px}
.regional-goals{margin-top:auto;display:grid;gap:7px;padding-top:12px;border-top:1px solid var(--c-line)}
.regional-goal{display:grid;grid-template-columns:26px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:42px;font-weight:850;font-size:max(16px,var(--fs-small));color:var(--c-ink-soft)}
.regional-goal .mark{width:24px;height:24px;border-radius:50%;border:3px solid #b9cbd6}
.regional-goal.is-done{color:#277147}
.regional-goal.is-done .mark{border-color:#277147;background:#dff2df}
.regional-goal.is-done .mark::after{content:'✓';display:block;text-align:center;font-size:16px;line-height:18px;color:#277147}
.regional-modal{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(330px,1fr);gap:20px;max-width:none}
.regional-modal-visual{position:relative;overflow:hidden;border-radius:22px;background:#dceff4;min-height:clamp(340px,58vh,660px)}
.regional-modal-visual img{width:100%;height:100%;object-fit:cover}
.regional-modal-visual .regional-after{position:absolute;inset:0}
.regional-wipe-bar{position:absolute;top:0;bottom:0;width:4px;transform:translateX(-50%);background:#fff;box-shadow:0 0 8px #0008;pointer-events:none}
.regional-wipe-bar::after{content:'↔';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40px;height:40px;display:grid;place-items:center;border-radius:50%;background:#fff;color:#173b53;font-size:20px;font-weight:900;box-shadow:0 4px 12px #0006}
.regional-wipe-tag{position:absolute;top:10px;padding:5px 14px;border-radius:999px;font:900 clamp(16px,1.15vw,19px) var(--font-head);color:#fff;background:rgba(10,35,58,.75);pointer-events:none}
.regional-wipe-tag.is-before{left:10px}
.regional-wipe-tag.is-after{right:10px}
.regional-wipe{position:absolute;left:0;right:0;bottom:8px;width:calc(100% - 20px);margin:0 10px;height:44px;opacity:.92;accent-color:#f2c14e}
.regional-wipe-hint{padding:8px 12px;border-radius:12px;background:#fff3cf;border:2px solid #e8bf4e;font-weight:900;color:#5b430a;font-size:max(16px,var(--fs-small))}
/* 노란 원판이 그림을 가려서 속은 비우고 흰 테두리 + 퍼지는 물결만 남긴다 */
.regional-hotspot{position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%);width:56px;height:56px;padding:0;border-radius:50%;border:3px solid rgba(255,255,255,.98);background:rgba(13,53,76,.08);box-shadow:0 0 10px rgba(6,28,45,.5),inset 0 0 10px rgba(6,28,45,.35);cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
.regional-hotspot::after{content:'';position:absolute;inset:-5px;border-radius:50%;border:3px solid rgba(255,255,255,.8);opacity:0;pointer-events:none}
.regional-hotspot:not(.is-found)::after{animation:regional-ping 1.6s ease-out infinite}
@keyframes regional-ping{0%{transform:scale(.8);opacity:.95}100%{transform:scale(1.7);opacity:0}}
.regional-hotspot:hover,.regional-hotspot:focus-visible{transform:translate(-50%,-50%) scale(1.1);outline:none;border-color:#ffe077;background:rgba(255,224,119,.18)}
.regional-hotspot.is-found{border-color:var(--c-success);background:rgba(36,151,100,.35);box-shadow:0 0 10px rgba(6,28,45,.45),inset 0 0 0 3px rgba(255,255,255,.68)}
.regional-hotspot.is-found::before{content:'✓';position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:950 25px/1 var(--font-head);text-shadow:0 2px 4px rgba(3,35,28,.75)}
.regional-hotspot.is-active{transform:translate(-50%,-50%) scale(1.12);border-color:#ffd34f;background:rgba(255,199,54,.5);box-shadow:0 0 0 5px rgba(255,211,79,.32),0 8px 18px rgba(6,28,45,.5)}
@media(prefers-reduced-motion:reduce){.regional-hotspot::after{animation:none!important;opacity:.6}}
/* 오세아니아 '숨은 변화 찾기'(P2-15) — 점이 숨어 있어서 사진을 관찰해야 찾는다 */
.regional-hotspot.is-hunt{opacity:0}
.regional-hotspot.is-hunt::after{animation:none;opacity:0}
.regional-hotspot.is-hunt:focus-visible,.regional-hotspot.is-hunt.is-found,.regional-hotspot.is-hunt.is-revealed{opacity:1}
.regional-hotspot.is-hunt.is-revealed::after{animation:regional-ping 1.6s ease-out infinite;opacity:1}
/* 오세아니아 바다 지킴 게이지 — 선택할 때마다 물이 차오른다 */
.regional-gauge{display:flex;align-items:center;gap:9px;flex:1 1 220px;min-width:200px}
.regional-gauge strong{flex:0 0 auto;font:900 max(16px,calc(var(--fs-small) - 2px))/1.2 var(--font-head);color:#0c4a63}
.regional-gauge .bar{position:relative;flex:1;height:18px;border-radius:999px;background:#dceaf1;border:2px solid #9dc3d4;overflow:hidden}
.regional-gauge .bar i{position:absolute;inset:0;width:var(--fill,0%);border-radius:999px;background:linear-gradient(90deg,#38b6d8,#1188b8);transition:width .5s ease}
.regional-gauge b{flex:0 0 auto;font-size:16px;color:#0c4a63}
.regional-discovery.is-lit{outline:3px solid var(--c-turquoise);outline-offset:2px}
.regional-modal-copy{display:grid;gap:11px;align-content:start;font-size:clamp(19px,1.4vw,24px);line-height:1.5}
.regional-scene-guide{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:11px 13px;border:2px solid #e8bf4e;border-radius:14px;background:#fff3cf;color:#5b430a}
.regional-scene-guide strong{font-size:clamp(17px,1.25vw,21px);line-height:1.25}
.regional-scene-count{min-width:64px;padding:5px 10px;border-radius:999px;background:#173b53;color:#fff;text-align:center;font:900 clamp(16px,1.1vw,19px)/1.2 var(--font-head)}
.regional-spot-detail{min-height:220px;padding:20px;display:grid;align-content:center;gap:10px;border:3px solid #b9d9dc;border-radius:20px;background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(232,248,246,.96));box-shadow:0 10px 24px rgba(18,60,81,.12);transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease}
.regional-spot-detail.is-empty{justify-items:center;text-align:center;border-style:dashed;background:rgba(246,251,250,.84);color:var(--c-ink-soft)}
.regional-spot-detail.is-revealed{border-color:var(--c-turquoise);box-shadow:0 12px 28px rgba(18,128,123,.18);animation:regional-detail-in .28s ease-out}
.regional-spot-icon{width:54px;height:54px;display:grid;place-items:center;border-radius:50%;background:#173b53;color:#ffd34f;font-size:28px;box-shadow:0 7px 16px rgba(12,47,71,.22)}
.regional-spot-detail h4{font-family:var(--font-head);font-size:clamp(24px,1.9vw,31px);line-height:1.2;color:var(--c-navy)}
.regional-spot-detail p{font-size:clamp(18px,1.35vw,23px);line-height:1.55;word-break:keep-all;overflow-wrap:break-word}
@keyframes regional-detail-in{from{opacity:.25;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.regional-discovery{padding:12px 14px;border-left:5px solid var(--c-turquoise);border-radius:14px;background:#eefaf7;font-weight:800}
.modal:has(.regional-modal){width:min(1320px,96vw);border-radius:28px;overflow:hidden}
@media(min-width:941px){.regional-side{overflow:hidden;padding:14px;gap:9px}.regional-example-list{gap:6px}.regional-example{min-height:52px;padding:7px 12px}.regional-photo-grid{flex:1;min-height:0;grid-auto-rows:minmax(0,1fr)}.regional-photo img{height:100%;min-height:0;aspect-ratio:auto}.regional-goals{gap:4px;padding-top:8px}.regional-goal{min-height:36px}}
@media(max-width:940px){.regional-shell,.regional-connection-layout{grid-template-columns:1fr}.regional-map{min-height:520px;aspect-ratio:auto;background-size:cover}.regional-photo-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:auto}.regional-photo{height:auto}.regional-photo img{height:auto;aspect-ratio:4/3}.regional-connections{grid-column:1}.regional-modal{grid-template-columns:1fr}.regional-modal-visual{min-height:clamp(300px,42vh,420px)}}
@media(max-width:620px){.regional-shell{min-height:0}.regional-map{min-height:470px}.regional-pin{min-width:86px;font-size:16px}.regional-signal-grid,.regional-choice-grid,.regional-action-grid{grid-template-columns:1fr}.regional-photo strong{font-size:16px}}
`;

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function uniqueValid(value: unknown, valid: ReadonlySet<string>, max = 60): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && valid.has(item)))].slice(0, max);
}

function normalizeState(model: RegionalModel): RegionalState {
  const saved = saveRepo.get().missions[model.id].data as { regionalExploration?: Partial<RegionalState> };
  const raw = saved.regionalExploration ?? {};
  const areaIds = new Set(model.areas.map((item) => item.id));
  const exampleIds = new Set(model.examples.map((item) => item.id));
  const sceneIds = new Set(model.scenes.map((item) => item.id));
  const signalIds = new Set(model.signals.map((item) => item.id));
  const perspectiveIds = new Set(model.perspectives.map((item) => item.id));
  const actionIds = new Set(model.actions.map((item) => item.id));
  const activeAreaId = typeof raw.activeAreaId === 'string' && areaIds.has(raw.activeAreaId) ? raw.activeAreaId : null;
  const activeExampleId = typeof raw.activeExampleId === 'string' && exampleIds.has(raw.activeExampleId) ? raw.activeExampleId : null;
  return {
    screen: raw.screen === 'connections' ? 'connections' : 'explore',
    activeAreaId,
    activeExampleId,
    visitedAreaIds: uniqueValid(raw.visitedAreaIds, areaIds),
    viewedExampleIds: uniqueValid(raw.viewedExampleIds, exampleIds),
    viewedSceneIds: uniqueValid(raw.viewedSceneIds, sceneIds),
    discoveredSignalIds: uniqueValid(raw.discoveredSignalIds, signalIds),
    listenedPerspectiveIds: uniqueValid(raw.listenedPerspectiveIds, perspectiveIds),
    heardPerspectiveIds: uniqueValid([...(Array.isArray(raw.heardPerspectiveIds) ? raw.heardPerspectiveIds : []), ...(Array.isArray(raw.listenedPerspectiveIds) ? raw.listenedPerspectiveIds : [])], perspectiveIds),
    selectedActionIds: uniqueValid(raw.selectedActionIds, actionIds)
  };
}

/** 연결 유형(ocean·water·climate·ecosystem 등)에서 지구회의 주제 하나를 고른다. */
function issueFromConnections(types: string[]): string {
  if (types.includes('ocean')) return 'ocean';
  if (types.includes('ecosystem')) return 'ecosystem';
  return 'climate';
}

function asiaModel(content: AsiaSource): RegionalModel {
  return {
    learn: (content as { learn?: unknown }).learn,
    id: 'asia', title: content.intro.title, subtitle: content.intro.subtitle, guide: content.intro.guide,
    backgroundId: 'bg.asia', mapAssetId: 'asia.map.regional', bgm: 'asia', areaLabel: '권역',
    requirements: { minAreas: content.requirements.minRegions, minExamples: content.requirements.minExamples, minDiscoveries: content.requirements.minDiscoveries, minSignals: content.requirements.minSignals },
    areas: content.regions.map((item, index) => ({ id: item.id, name: item.nameKo, short: item.silhouette, description: `${item.nameKo}의 자연과 생활 사례를 살펴봐.`, x: item.mapPosition.xPercent, y: item.mapPosition.yPercent, color: COLORS[index % COLORS.length] ?? COLORS[0]! })),
    examples: content.countryExamples.map((item) => ({ id: item.id, areaId: item.regionId, country: item.countryNameKo, place: item.placeNameKo, scope: item.scopeNoteKo, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sceneIds: item.sceneIds })),
    scenes: content.scenes.map((item) => ({ id: item.id, exampleId: item.exampleId, category: item.category, categoryLabel: item.category === 'nature' ? '자연과 공간' : item.category === 'daily' ? '오늘날의 생활' : item.category === 'landmark' ? '대표 장소 관찰' : '문화와 표현', title: item.titleKo, assetId: item.imageAssetId, summary: item.summaryKo, detail: item.detailKo, discovery: item.discoveryKo, hotspots: item.hotspots.map((spot) => ({ id: spot.id, x: spot.x * 100, y: spot.y * 100, label: spot.labelKo })), sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    signals: content.signals.map((item) => ({ id: item.id, title: item.titleKo, prompt: item.promptKo, connection: item.connectionTypes.join(' · '), issueId: issueFromConnections(item.connectionTypes), beforeAssetId: item.beforeAssetId, afterAssetId: item.afterAssetId, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    perspectives: content.perspectives.map((item) => ({ id: item.id, name: item.nameKo, role: item.labelKo, line: item.lineKo, worry: item.worryKo, assetId: item.assetId })),
    actions: content.actions.map((item) => ({ id: item.id, tier: item.tier, label: item.nameKo, detail: item.detailKo }))
  };
}

function oceaniaModel(content: OceaniaSource): RegionalModel {
  const scenesByZone = new Map<string, string[]>();
  for (const scene of content.scenes.filter((item) => item.category !== 'landmark')) scenesByZone.set(scene.zoneId, [...(scenesByZone.get(scene.zoneId) ?? []), scene.id]);
  return {
    learn: (content as { learn?: unknown }).learn,
    id: 'oceania', title: content.intro.title, subtitle: content.intro.subtitle, guide: content.intro.guide,
    backgroundId: 'bg.oceania', mapAssetId: 'oceania.map.regional', bgm: 'oceania', areaLabel: '구역',
    requirements: { minAreas: content.requirements.minZones, minExamples: content.requirements.minExamples, minDiscoveries: content.requirements.minDiscoveries, minSignals: content.requirements.minSignals },
    areas: content.zones.map((item) => ({ id: item.id, name: item.name, short: item.short, description: item.description, x: item.x, y: item.y, color: item.color })),
    examples: content.countryExamples.map((item) => {
      const sameCountryIds = new Set(content.countryExamples.filter((candidate) => candidate.country === item.country).map((candidate) => candidate.id));
      const landmarkIds = content.scenes.filter((scene) => scene.category === 'landmark' && sameCountryIds.has(scene.exampleId)).map((scene) => scene.id);
      return { id: item.id, areaId: item.zoneId, country: item.country, place: item.place, scope: item.scopeNote, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sceneIds: [...(scenesByZone.get(item.zoneId) ?? []), ...landmarkIds] };
    }),
    scenes: content.scenes.map((item) => ({ id: item.id, exampleId: item.exampleId, category: item.category, categoryLabel: item.categoryLabel, title: item.title, assetId: item.assetId, summary: item.summary, detail: item.detail, discovery: item.discovery, hotspots: item.hotspots, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    signals: content.signals.map((item) => ({ id: item.id, title: item.title, prompt: item.prompt, connection: `${item.connectionType} · ${item.connectionNote}`, issueId: issueFromConnections([item.connectionType]), beforeAssetId: item.beforeAssetId, afterAssetId: item.afterAssetId, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    perspectives: content.perspectives.map((item) => ({ id: item.id, name: item.name, role: item.role, line: item.line, worry: '', assetId: item.imageId })),
    actions: content.actions.map((item) => ({ id: item.id, tier: item.tier, label: item.label, detail: '선택의 장단점을 다른 행동과 함께 비교해 봐.' }))
  };
}

function imageFor(model: RegionalModel, assetId: string): string {
  return assetUrl(hasAsset(assetId) ? assetId : model.mapAssetId);
}

function createRegionalPage(load: () => Promise<RegionalModel>): Page {
  let disposed = false;
  let closeModal: (() => void) | null = null;
  let stopMapZoom: (() => void) | null = null;
  return {
    async mount(root) {
      const model = await load();
      if (disposed) return;
      audio.playBgm(model.bgm);
      const state = normalizeState(model);
      const teacherUnlocked = saveRepo.isTeacherUnlocked();
      const page = document.createElement('div');
      page.className = `page regional-mission regional-${model.id}`;
      page.style.backgroundImage = `linear-gradient(rgba(8,40,68,.24),rgba(8,40,68,.38)),url('${assetUrl(model.backgroundId)}')`;
      const style = document.createElement('style');
      style.textContent = PAGE_CSS;
      page.appendChild(style);
      const topBar = buildTopBar({ title: model.title, subtitle: model.subtitle, backTo: '#/map', steps: { total: 2, done: state.screen === 'connections' ? 1 : 0, now: state.screen === 'connections' ? 1 : 0 } });
      const body = document.createElement('main');
      body.className = 'page-body regional-body';
      const dock = document.createElement('footer');
      dock.className = 'bottom-bar regional-dock';
      page.append(topBar, body, dock);
      root.appendChild(page);

      const persist = () => saveRepo.setCheckpoint(model.id, state.screen === 'connections' ? 'regional-connections' : 'regional-explore', { regionalExploration: structuredClone(state) });
      const add = (items: string[], value: string) => { if (!items.includes(value)) items.push(value); };
      const exploreReady = () => teacherUnlocked || (state.visitedAreaIds.length >= model.requirements.minAreas && state.viewedExampleIds.length >= model.requirements.minExamples && state.viewedSceneIds.length >= model.requirements.minDiscoveries);
      /** 남은 할 일을 눈으로 보여 준다 — 빈 패널을 채우고 '언제 끝나는지'를 알게 한다. */
      const goalList = (): string => {
        const rows: Array<[string, number, number]> = [
          [`${model.areaLabel} 살펴보기`, state.visitedAreaIds.length, model.requirements.minAreas],
          ['나라·장소 열어 보기', state.viewedExampleIds.length, model.requirements.minExamples],
          ['장면 자세히 보기', state.viewedSceneIds.length, model.requirements.minDiscoveries]
        ];
        return `<div class="regional-goals" aria-label="탐험 진행">${rows.map(([label, got, need]) =>
          `<div class="regional-goal ${got >= need ? 'is-done' : ''}"><span class="mark" aria-hidden="true"></span><span>${label}</span><b>${Math.min(got, need)} / ${need}</b></div>`
        ).join('')}</div>`;
      };

      const chosenTierCount = () => new Set(model.actions.filter((item) => state.selectedActionIds.includes(item.id)).map((item) => item.tier)).size;
      const finishReady = () => teacherUnlocked || (state.discoveredSignalIds.length >= model.requirements.minSignals && state.listenedPerspectiveIds.length >= 2 && state.selectedActionIds.length >= 3 && chosenTierCount() >= 2);

      const openScene = (scene: Scene) => {
        const example = model.examples.find((item) => item.id === scene.exampleId);
        const modalBody = document.createElement('div');
        modalBody.className = 'regional-modal';
        /** 각 점의 설명을 하나씩 확인한 뒤에만 장면을 '본 것'으로 기록한다. */
        const markViewed = () => {
          if (state.viewedSceneIds.includes(scene.id)) return;
          add(state.viewedSceneIds, scene.id);
          void audio.playSfx('success');
          const hint = modalBody.querySelector<HTMLElement>('[data-scene-hint]');
          if (hint) hint.textContent = '✓ 다 살펴봤어!';
          modalBody.querySelector<HTMLElement>('.regional-discovery')?.classList.add('is-lit');
          persist();
          render();
        };
        if (scene.hotspots.length === 0) markViewed();
        const viewed = state.viewedSceneIds.includes(scene.id);
        const foundHotspotIds = new Set<string>(viewed ? scene.hotspots.map((spot) => spot.id) : []);
        const scopeText = scene.category === 'landmark' && example
          ? `${scene.title}은 ${example.country} 안의 특정 장소 사례이며, 이 한 장면이 나라 전체의 모습을 대표하지는 않아.`
          : example?.scope ?? '';
        const spotCopy = (index: number): string => index === 0
          ? [scene.summary, scene.detail].filter(Boolean).join(' ')
          : [scene.discovery, scopeText].filter(Boolean).join(' ');
        // 오세아니아는 점이 숨어 있는 '숨은 변화 찾기' — 사진을 직접 관찰해야 한다(P2-15). 세 번 빗나가면 점을 보여 준다.
        const huntMode = model.id === 'oceania' && !viewed && scene.hotspots.length > 0;
        modalBody.innerHTML = `
          <div class="regional-modal-visual" data-scene-visual>
            <img src="${imageFor(model, scene.assetId)}" alt="${esc(scene.title)} 학습용 재현 이미지">
            ${scene.hotspots.map((spot) => `<button type="button" class="regional-hotspot${viewed ? ' is-found' : ''}${huntMode ? ' is-hunt' : ''}" style="--x:${spot.x}%;--y:${spot.y}%" data-hotspot="${spot.id}" aria-label="${esc(spot.label)} 설명 보기" aria-pressed="false"></button>`).join('')}
          </div>
          <div class="regional-modal-copy">
            <span class="chip">${esc(scene.categoryLabel)}</span>
            <h3>${esc(scene.title)}</h3>
            ${scene.hotspots.length ? `<div class="regional-scene-guide"><strong data-scene-hint>${viewed ? '점을 누르면 설명을 다시 볼 수 있어!' : huntMode ? '숨은 변화 찾기! 달라진 곳을 사진에서 직접 찾아 눌러 봐.' : '사진 속 반짝이는 점을 하나씩 눌러 봐!'}</strong><span class="regional-scene-count" data-scene-count>${foundHotspotIds.size} / ${scene.hotspots.length}</span></div>` : ''}
            <section class="regional-spot-detail is-empty" data-spot-detail aria-live="polite">
              <span class="regional-spot-icon" aria-hidden="true">✦</span>
              <h4 data-spot-title>${scene.hotspots.length ? '어느 점이 궁금해?' : esc(scene.title)}</h4>
              <p data-spot-copy>${scene.hotspots.length ? '점을 누르면 그곳의 설명이 여기에 한 개씩 나타나.' : esc([scene.detail, scene.discovery, scopeText].filter(Boolean).join(' '))}</p>
            </section>
          </div>`;
        modalBody.querySelectorAll<HTMLButtonElement>('[data-hotspot]').forEach((button) => button.addEventListener('click', () => {
          const hotspot = scene.hotspots.find((item) => item.id === button.dataset.hotspot);
          if (!hotspot) return;
          const index = scene.hotspots.indexOf(hotspot);
          const wasFound = foundHotspotIds.has(hotspot.id);
          foundHotspotIds.add(hotspot.id);
          modalBody.querySelectorAll<HTMLButtonElement>('[data-hotspot]').forEach((item) => {
            const active = item === button;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-pressed', String(active));
          });
          button.classList.add('is-found');
          const detail = modalBody.querySelector<HTMLElement>('[data-spot-detail]');
          const title = modalBody.querySelector<HTMLElement>('[data-spot-title]');
          const copy = modalBody.querySelector<HTMLElement>('[data-spot-copy]');
          const count = modalBody.querySelector<HTMLElement>('[data-scene-count]');
          const hint = modalBody.querySelector<HTMLElement>('[data-scene-hint]');
          if (detail) {
            detail.classList.remove('is-empty', 'is-revealed');
            void detail.offsetWidth;
            detail.classList.add('is-revealed');
          }
          if (title) title.textContent = hotspot.label;
          if (copy) copy.textContent = spotCopy(index);
          if (count) count.textContent = `${foundHotspotIds.size} / ${scene.hotspots.length}`;
          if (hint) hint.textContent = foundHotspotIds.size >= scene.hotspots.length
            ? '✓ 두 점을 다 살펴봤어!'
            : '좋아! 이제 다른 반짝이는 점도 눌러 봐.';
          if (!wasFound) void audio.playSfx('pickup');
          if (foundHotspotIds.size >= scene.hotspots.length) markViewed();
        }));
        if (huntMode) {
          let misses = 0;
          modalBody.querySelector<HTMLElement>('[data-scene-visual]')?.addEventListener('click', (ev) => {
            if ((ev.target as HTMLElement).closest('[data-hotspot]')) return;
            misses += 1;
            void audio.playSfx('partial');
            const hint = modalBody.querySelector<HTMLElement>('[data-scene-hint]');
            if (misses >= 3) {
              // 세 번 빗나가면 실패 대신 점을 보여 준다 — 관찰 유도, 좌절 방지
              modalBody.querySelectorAll('.regional-hotspot.is-hunt').forEach((spot) => spot.classList.add('is-revealed'));
              if (hint) hint.textContent = '좋아, 반짝이는 점을 보여 줄게! 눌러서 확인해 봐.';
            } else if (hint) {
              hint.textContent = misses === 1 ? '가까워! 사진 속 달라진 곳을 자세히 봐.' : '한 번 더! 사람이나 물건이 달라진 곳을 찾아 봐.';
            }
          });
        }
        closeModal?.();
        closeModal = openModal({ id: `${model.id}-scene`, title: `${example ? `${example.country} · ` : ''}${scene.title}`, bodyEl: modalBody, actions: [] });
      };

      const openSignal = (signal: Signal) => {
        const modalBody = document.createElement('div');
        modalBody.className = 'regional-modal';
        const hasBefore = hasAsset(signal.beforeAssetId) && hasAsset(signal.afterAssetId);
        /** 비교 슬라이더를 충분히(누적 70 이상) 밀어야 신호가 기록된다 — 비교 자산이 없는 신호는 열람 즉시. */
        const markDiscovered = () => {
          if (state.discoveredSignalIds.includes(signal.id)) return;
          add(state.discoveredSignalIds, signal.id);
          void audio.playSfx('success');
          const hint = modalBody.querySelector<HTMLElement>('[data-signal-hint]');
          if (hint) hint.textContent = '✓ 신호를 기록했어!';
          persist();
          render();
        };
        if (!hasBefore) markDiscovered();
        const discovered = state.discoveredSignalIds.includes(signal.id);
        modalBody.innerHTML = `
          <div class="regional-modal-visual">
            <img src="${imageFor(model, signal.beforeAssetId)}" alt="">
            ${hasBefore ? `<img class="regional-after" src="${imageFor(model, signal.afterAssetId)}" alt="${esc(signal.title)} 학습용 비교 장면" style="clip-path:inset(0 0 0 50%)">
            <span class="regional-wipe-bar" style="left:50%"></span>
            <span class="regional-wipe-tag is-before">지금</span><span class="regional-wipe-tag is-after">달라진 모습</span>
            <input class="regional-wipe" type="range" min="0" max="100" value="50" aria-label="지금과 달라진 모습을 밀어서 비교하기">` : ''}
          </div>
          <div class="regional-modal-copy"><span class="chip">이어진 환경 신호</span><h3>${esc(signal.title)}</h3>
            ${hasBefore ? `<p class="regional-wipe-hint" data-signal-hint>${discovered ? '✓ 신호를 기록했어!' : '손잡이를 밀어서 두 모습을 비교하면 신호가 기록돼!'}</p>` : ''}
            <p>${esc(signal.prompt)}</p><p class="regional-discovery">${esc(signal.connection)}</p></div>`;
        const wipe = modalBody.querySelector<HTMLInputElement>('.regional-wipe');
        if (wipe) enableRangeDrag(wipe);
        const after = modalBody.querySelector<HTMLElement>('.regional-after');
        const wipeBar = modalBody.querySelector<HTMLElement>('.regional-wipe-bar');
        let traveled = 0;
        let lastValue = wipe ? Number(wipe.value) : 50;
        wipe?.addEventListener('input', () => {
          const v = Number(wipe.value);
          traveled += Math.abs(v - lastValue);
          lastValue = v;
          if (after) after.style.clipPath = `inset(0 0 0 ${v}%)`;
          if (wipeBar) wipeBar.style.left = `${v}%`;
          if (traveled >= 70) markDiscovered();
        });
        closeModal?.();
        closeModal = openModal({ id: `${model.id}-signal`, title: signal.title, bodyEl: modalBody, actions: [] });
      };

      const renderDock = () => {
        if (state.screen === 'explore') {
          dock.innerHTML = `<button class="btn btn-primary" data-next ${exploreReady() ? '' : 'disabled'}>환경 연결 살펴보기 →</button>`;
          dock.querySelector('[data-next]')?.addEventListener('click', () => { state.screen = 'connections'; persist(); render(); });
        } else {
          dock.innerHTML = `<button class="btn btn-ghost" data-back>← ${model.areaLabel} 지도</button><button class="btn btn-primary" data-finish ${finishReady() ? '' : 'disabled'}>${model.title.split(':')[0]} 여행 마치기</button>`;
          dock.querySelector('[data-back]')?.addEventListener('click', () => { state.screen = 'explore'; persist(); render(); });
          dock.querySelector('[data-finish]')?.addEventListener('click', () => {
            if (!finishReady()) return;
            const heard = model.perspectives.filter((item) => state.listenedPerspectiveIds.includes(item.id));
            writeMissionArtifact({ schemaVersion: 1, missionId: model.id, title: `${model.title.split(':')[0]} 권역 탐험 기록`, purpose: '여러 지역의 자연·생활·문화를 한 모습으로 단정하지 않고 비교해.', initialHypothesis: '지도에서 서로 다른 지역의 위치와 생활을 먼저 살펴봤어.', evidenceIds: [...state.viewedSceneIds, ...state.discoveredSignalIds], evidenceLabel: `${state.visitedAreaIds.length}개 ${model.areaLabel}, ${state.viewedExampleIds.length}개 나라·장소, ${state.viewedSceneIds.length}개 장면을 확인했어.`, voiceId: heard[0]?.id ?? `${model.id}-voices`, voiceName: heard.map((item) => item.name).join('·') || '지역의 친구들', voiceLine: heard.map((item) => item.line).join(' ') || '지역마다 필요한 방법이 다르니 먼저 사정을 들어야 해.', firstDecision: '한 장면을 지역 전체의 모습으로 단정하지 않기', observedConsequence: `${state.discoveredSignalIds.length}개의 연결된 환경 신호를 확인했어.`, revisedDecision: `${state.selectedActionIds.length}개의 행동을 여러 주체의 책임으로 골랐어.`, rationale: '생활 속 행동과 지역사회·정부·기업·국가 간 협력을 함께 골라야 오래 이어질 수 있어.', transferPrompt: '우리 동네 문제에서도 당사자의 말을 듣고 여러 주체의 행동을 함께 제안한다면 무엇이 달라질까?', earnedAt: new Date().toISOString() });
            recordEarthSignals(model.id, model.signals.filter((item) => state.discoveredSignalIds.includes(item.id)).map((item) => ({ label: item.title, issueId: item.issueId })));
            const doComplete = (): void => completeMissionFlow(model.id, model.title.split(':')[0] ?? model.title);
            const learn = getLearn({ learn: model.learn });
            if (learn) showLearningWrap(model.id, learn, doComplete);
            else doComplete();
          });
        }
      };

      const renderExplore = () => {
        const area = model.areas.find((item) => item.id === state.activeAreaId) ?? null;
        const examples = area ? model.examples.filter((item) => item.areaId === area.id) : [];
        const example = model.examples.find((item) => item.id === state.activeExampleId && item.areaId === area?.id) ?? examples[0] ?? null;
        const koreaShortcut = model.id === 'asia' ? model.examples.find((item) => item.country === '대한민국') : null;
        if (example && state.activeExampleId !== example.id) state.activeExampleId = example.id;
        const scenes = example ? model.scenes.filter((item) => example.sceneIds.includes(item.id)) : [];
        body.innerHTML = `<section class="regional-shell">
          <div class="regional-map" aria-label="${esc(model.title)} 권역 지도"><div class="regional-map-layer" style="background-image:url('${assetUrl(model.mapAssetId)}')">
            ${model.areas.map((item) => `<button type="button" class="regional-pin ${state.activeAreaId === item.id ? 'is-active' : ''} ${state.visitedAreaIds.includes(item.id) ? 'is-visited' : ''}" style="--x:${item.x}%;--y:${item.y}%;--pin:${item.color}" data-area="${item.id}">${esc(item.name)}<small>${esc(item.short)}</small></button>`).join('')}
            ${koreaShortcut ? `<button type="button" class="regional-country-shortcut ${state.activeExampleId === koreaShortcut.id ? 'is-active' : ''}" data-country-shortcut="${koreaShortcut.id}">대한민국<small>서울 · 바로 보기</small></button>` : ''}
          </div><span class="map-zoom-hint">두 손가락으로 크게 볼 수 있어</span></div>
          <aside class="regional-side">
            ${area ? `<span class="chip">${esc(model.areaLabel)} 탐험</span><h2>${esc(area.name)}</h2><p>${esc(area.description)}</p><div class="regional-example-list">${examples.map((item) => `<button class="btn btn-ghost regional-example" data-example="${item.id}">${state.viewedExampleIds.includes(item.id) ? '✓ ' : ''}${esc(item.country)}<span>${esc(item.place)}</span></button>`).join('')}</div>${example ? `<h3>${model.id === 'oceania' ? `${esc(example.country)} · 지역과 대표 장소` : `${esc(example.country)} · ${esc(example.place)}`}</h3><div class="regional-photo-grid">${scenes.length ? scenes.map((scene) => `<button class="regional-photo ${state.viewedSceneIds.includes(scene.id) ? 'is-viewed' : ''}" data-scene="${scene.id}"><img src="${imageFor(model, scene.assetId)}" alt=""><strong>${esc(scene.title)}</strong></button>`).join('') : '<p>이 장소와 연결된 장면을 준비하고 있어.</p>'}</div>` : ''}` : `<span class="chip">위치부터 살펴보기</span><h2>${model.areaLabel}을 골라 봐</h2><p>지도에서 궁금한 ${model.areaLabel}을 눌러 봐.</p><button type="button" class="btn btn-ghost regional-info" data-map-info>이 지도는 어떤 그림이야?</button>`}
            ${goalList()}
          </aside>
        </section>`;
        body.querySelectorAll<HTMLElement>('[data-area]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.area!; state.activeAreaId = id; state.activeExampleId = model.examples.find((item) => item.areaId === id)?.id ?? null; add(state.visitedAreaIds, id); persist(); render(); }));
        body.querySelector<HTMLElement>('[data-country-shortcut]')?.addEventListener('click', () => { if (!koreaShortcut) return; state.activeAreaId = koreaShortcut.areaId; state.activeExampleId = koreaShortcut.id; add(state.visitedAreaIds, koreaShortcut.areaId); add(state.viewedExampleIds, koreaShortcut.id); persist(); render(); });
        body.querySelectorAll<HTMLElement>('[data-example]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.example!; state.activeExampleId = id; add(state.viewedExampleIds, id); persist(); render(); }));
        body.querySelectorAll<HTMLElement>('[data-scene]').forEach((button) => button.addEventListener('click', () => { const scene = model.scenes.find((item) => item.id === button.dataset.scene); if (scene) openScene(scene); }));
        body.querySelector<HTMLElement>('[data-map-info]')?.addEventListener('click', () => {
          openModal({
            id: `${model.id}-map-info`,
            title: '이 지도와 장면에 대해',
            bodyHtml: `<p style="line-height:1.6">${esc(model.guide)}</p><p style="margin-top:12px;line-height:1.6">이 지도는 상대 위치를 익히는 학습용 그림이며, 실제 축척 지도는 아니야.</p>`,
            actions: [{ label: '알겠어', kind: 'primary', onClick: (close) => close() }]
          });
        });
        const mapEl = body.querySelector<HTMLElement>('.regional-map');
        const layerEl = body.querySelector<HTMLElement>('.regional-map-layer');
        stopMapZoom?.();
        stopMapZoom = mapEl && layerEl ? enableMapZoom(mapEl, layerEl) : null;
        const keys = KEY_POINTS[model.id];
        if (keys) showKeyPoint({ id: `${model.id}.geo`, lines: keys.geo, onDone: () => undefined });
      };

      const renderConnections = () => {
        // 완료 조건을 스크롤 밖(맨 아래)에 두지 않는다 — 항상 보이는 상단 고정 진행 띠로 안내한다.
        const goalChip = (label: string, got: number, need: number) =>
          `<span class="regional-progress-goal ${got >= need ? 'is-done' : ''}">${label} <b>${Math.min(got, need)}/${need}</b></span>`;
        // 오세아니아: 선택할 때마다 바다 지킴 게이지가 차오른다(P2-15 라이트)
        const gaugePercent = Math.round(Math.min(1, state.discoveredSignalIds.length / model.requirements.minSignals) * 40
          + Math.min(1, state.listenedPerspectiveIds.length / 2) * 30
          + Math.min(1, state.selectedActionIds.length / 3) * 30);
        const gauge = model.id === 'oceania'
          ? `<span class="regional-gauge" role="img" aria-label="바다 지킴 게이지 ${gaugePercent}%"><strong>바다 지킴</strong><span class="bar"><i style="--fill:${gaugePercent}%"></i></span><b>${gaugePercent}%</b></span>`
          : '';
        const progressStrip = `<div class="regional-progress-strip" role="status" aria-label="환경 연결 완료 조건 진행">
          ${goalChip('환경 신호', state.discoveredSignalIds.length, model.requirements.minSignals)}
          ${goalChip('친구 목소리', state.listenedPerspectiveIds.length, 2)}
          ${goalChip('행동 고르기', state.selectedActionIds.length, 3)}
          ${goalChip('서로 다른 주체', chosenTierCount(), 2)}
          ${gauge}
        </div>`;
        body.innerHTML = `<section class="regional-shell"><div class="regional-connections">${progressStrip}<div class="regional-connection-layout">
          <section class="regional-section"><span class="chip">1. 바다·물·기후의 연결</span><h2>멀리 떨어진 지역도 이어져 있어</h2><p>신호를 눌러 변화의 근거와 출처를 확인해 봐.</p><div class="regional-signal-grid">${model.signals.map((item) => `<button class="card card-pick regional-signal" data-signal="${item.id}" aria-pressed="${state.discoveredSignalIds.includes(item.id)}" aria-label="환경 신호: ${esc(item.title)}${state.discoveredSignalIds.includes(item.id) ? ', 기록함' : ''}"><strong>${state.discoveredSignalIds.includes(item.id) ? '✓ ' : ''}${esc(item.title)}</strong><br><span>${esc(item.connection.split(' · ')[0] ?? '')}</span></button>`).join('')}</div><span class="chip">2. 지역의 목소리</span><div class="regional-choice-grid">${model.perspectives.map((item) => `<button class="card card-pick regional-choice${state.heardPerspectiveIds.includes(item.id) ? '' : ' is-unheard'}" data-voice="${item.id}" aria-pressed="${state.listenedPerspectiveIds.includes(item.id)}" aria-label="목소리 듣기: ${esc(item.name)} ${esc(item.role)}${state.listenedPerspectiveIds.includes(item.id) ? ', 들음' : state.heardPerspectiveIds.includes(item.id) ? ', 들어 봄' : ', 아직 못 들음'}"><img src="${imageFor(model, item.assetId)}" alt=""><span><strong>${esc(item.name)} · ${esc(item.role)}</strong><br>${esc(item.line)}</span>${state.heardPerspectiveIds.includes(item.id) ? '' : '<i class="regional-voice-dots" aria-hidden="true">…</i>'}</button>`).join('')}</div>${(() => { const unheard = model.perspectives.length - state.heardPerspectiveIds.length; return unheard > 0 ? `<p class="regional-discovery">아직 못 들은 목소리가 ${unheard}개 있어 — 완료 뒤에도 언제든 다시 와서 들을 수 있어.</p>` : ''; })()}</section>
          <section class="regional-section"><span class="chip">3. 책임을 나누는 행동</span><h2>서로 다른 크기의 행동을 함께 골라 봐</h2><p>나·학교와 지역사회·정부와 기업·여러 나라의 행동 중 세 가지 이상을 골라.</p><div class="regional-action-grid">${model.actions.map((item) => `<button class="card card-pick regional-action" data-action="${item.id}" aria-pressed="${state.selectedActionIds.includes(item.id)}" aria-label="행동 고르기: ${esc(item.label)}${state.selectedActionIds.includes(item.id) ? ', 고름' : ''}"><strong>${esc(item.label)}</strong><br><small>${esc(item.detail)}</small></button>`).join('')}</div></section>
        </div></div></section>`;
        const connectKeys = KEY_POINTS[model.id];
        if (connectKeys) showKeyPoint({ id: `${model.id}.connect`, lines: connectKeys.connect, onDone: () => undefined });
        body.querySelectorAll<HTMLElement>('[data-signal]').forEach((button) => button.addEventListener('click', () => { const signal = model.signals.find((item) => item.id === button.dataset.signal); if (signal) openSignal(signal); }));
        body.querySelectorAll<HTMLElement>('[data-voice]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.voice!; add(state.heardPerspectiveIds, id); if (state.listenedPerspectiveIds.includes(id)) state.listenedPerspectiveIds = state.listenedPerspectiveIds.filter((item) => item !== id); else { if (state.listenedPerspectiveIds.length >= 2) state.listenedPerspectiveIds.shift(); state.listenedPerspectiveIds.push(id); } persist(); render(); }));
        body.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.action!; state.selectedActionIds = state.selectedActionIds.includes(id) ? state.selectedActionIds.filter((item) => item !== id) : [...state.selectedActionIds, id].slice(-4); persist(); render(); }));
      };

      const render = () => {
        updateSteps(topBar, 2, state.screen === 'connections' ? 1 : 0, state.screen === 'connections' ? 1 : 0);
        // 카드 선택마다 통재렌더된다 — 스크롤 위치를 보존하지 않으면 매번 맨 위로 튄다(B1)
        const prevScroll = body.querySelector<HTMLElement>('.regional-connections')?.scrollTop ?? 0;
        if (state.screen === 'connections') renderConnections(); else renderExplore();
        const scroller = body.querySelector<HTMLElement>('.regional-connections');
        if (scroller && prevScroll > 0) scroller.scrollTop = prevScroll;
        renderDock();
      };
      render();
    },
    unmount() {
      disposed = true;
      closeModal?.();
      closeModal = null;
      stopMapZoom?.();
      stopMapZoom = null;
    }
  };
}

export function createAsiaPage(): Page {
  return createRegionalPage(async () => asiaModel(await loadContent<AsiaSource>('asia')));
}

export function createOceaniaPage(): Page {
  return createRegionalPage(async () => oceaniaModel(await loadContent<OceaniaSource>('oceania')));
}
