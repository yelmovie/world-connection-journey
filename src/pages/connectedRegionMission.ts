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
import { createGateNote, updateGate } from '../ui/gateNote';
import { openModal } from '../ui/modal';
import { getLearn, showLearningWrap } from '../ui/learnFrame';
import { enableMapZoom } from '../ui/mapZoom';
import { enableRangeDrag } from '../ui/dnd';
import { showToast } from '../ui/toast';

type Hotspot = { id: string; x: number; y: number; label: string };
/** 사진 속 점(핫스팟)은 지형·건물을 짚어 주는 '자연·명소' 장면에만 둔다 — 생활·문화 장면은 점 없이 설명과 발견 문장을 바로 보여 준다(클릭 피로 방지). */
const HOTSPOT_CATEGORIES = new Set(['nature', 'landmark']);
const keepHotspots = <T,>(category: string, spots: T[]): T[] => (HOTSPOT_CATEGORIES.has(category) ? spots : []);
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
  id: Extract<MissionId, 'asia' | 'europe' | 'oceania'>;
  /** 배움 카드(learnFrame) 원본 — JSON의 learn 섹션을 그대로 전달한다. */
  learn?: unknown;
  title: string;
  subtitle: string;
  guide: string;
  backgroundId: string;
  mapAssetId: string;
  bgm: 'asia' | 'europe' | 'oceania';
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

interface EuropeSource {
  intro: { title: string; subtitle: string; guide: string };
  learn?: unknown;
  requirements: { minCountries: number; minSignals: number };
  countries: Array<{
    id: string;
    name: string;
    map: { x: number; y: number };
    accent: string;
    hook: string;
    visuals: Array<{
      id: string;
      title: string;
      category: 'environment' | 'daily' | 'heritage';
      imageId: string;
      caption: string;
      lookFor: string;
      sourceTitle: string;
      sourceUrl: string;
    }>;
  }>;
  signals: Array<{
    id: string;
    title: string;
    prompt: string;
    connection: string;
    issueId: string;
    beforeAssetId: string;
    afterAssetId: string;
    sourceTitle: string;
    sourceUrl: string;
  }>;
  perspectives: Array<{ id: string; name: string; role: string; line: string; assetId: string }>;
  actions: Array<{ id: string; tier: string; label: string; detail: string }>;
}

const COLORS = ['#3979c8', '#16a39b', '#e79b2f', '#8b64c6', '#d85f7b'];

const PAGE_CSS = `
.regional-mission{background-position:center;background-size:cover;color:var(--c-ink)}
.regional-mission .top-bar{background:linear-gradient(180deg,rgba(10,46,78,.94),rgba(10,46,78,.62))}
.regional-mission .regional-body{min-height:0;padding:14px clamp(12px,2vw,28px);overflow:auto}
.regional-shell{width:min(1800px,100%);height:calc(100dvh - var(--top-bar-h) - var(--bottom-bar-h) - 28px);margin:auto;display:grid;grid-template-columns:minmax(430px,1.3fr) minmax(400px,.7fr);gap:14px;align-items:stretch}
.regional-map,.regional-side,.regional-connections{border:2px solid rgba(255,255,255,.78);border-radius:28px;box-shadow:0 18px 45px rgba(7,31,54,.28);overflow:hidden}
.regional-map{position:relative;min-height:0;height:100%;display:grid;place-items:center;background:transparent;isolation:isolate;touch-action:none;container-type:size}
/* 확대·이동은 이 층에만 — 표식이 지도와 함께 움직여야 위치가 어긋나지 않는다 */
/* 지도 프레임은 칸의 폭·높이 중 더 빡빡한 쪽에 맞춘다 — 세로가 넉넉해도 칸 밖으로 넓어지지 않는다 */
.regional-map-frame{position:absolute;left:50%;top:50%;width:min(100%,calc(100cqh * 16 / 9));max-height:100%;aspect-ratio:16/9;transform:translate(-50%,-50%)}
.regional-map-layer{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background-color:#1689c7;background-position:center;background-repeat:no-repeat;background-size:cover;transform-origin:50% 50%;transition:transform .12s ease-out}
.regional-map-layer::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(2,42,70,.05),rgba(2,42,70,.28));pointer-events:none}
.regional-map-note{position:absolute;z-index:2;left:18px;bottom:18px;max-width:min(520px,72%);padding:10px 14px;border-radius:16px;background:rgba(255,253,246,.92);font-weight:800;line-height:1.4}
.regional-pin{position:absolute;z-index:3;left:var(--x);top:var(--y);transform:translate(-50%,-50%);min-width:104px;min-height:62px;padding:7px 12px;border:3px solid #fff;border-radius:22px;background:var(--pin);color:#fff;font:800 18px/1.1 var(--font-head);word-break:keep-all;text-wrap:balance;box-shadow:0 7px 0 rgba(7,38,62,.28),0 12px 25px rgba(5,30,50,.28)}
.regional-pin small{display:block;margin-top:4px;font:700 16px/1.1 var(--font-body)}
.regional-pin.is-active{outline:5px solid rgba(255,203,67,.85);transform:translate(-50%,-54%) scale(1.05)}
.regional-pin.is-visited::after{content:"✓";position:absolute;right:-8px;top:-10px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#1b9b68;border:2px solid #fff}
.regional-country-shortcut{position:absolute;z-index:4;left:84%;top:52%;transform:translate(-50%,-50%);padding:8px 12px;border:3px solid #fff;border-radius:18px;background:#fff8d9;color:#123c5b;font:900 16px/1.15 var(--font-head);box-shadow:0 6px 0 #d49b28,0 12px 22px rgba(5,30,50,.3)}
.regional-country-shortcut small{display:block;margin-top:3px;color:#76531c;font:800 16px/1.1 var(--font-body)}
.regional-country-shortcut.is-active{outline:5px solid rgba(255,203,67,.85);transform:translate(-50%,-54%) scale(1.05)}
.regional-side{padding:14px 16px;background:rgba(255,253,247,.96);display:flex;flex-direction:column;gap:9px;min-height:0}
.regional-side>h3{margin:0;font:900 clamp(19px,1.35vw,24px)/1.2 var(--font-head);color:var(--c-navy)}
.regional-side h2,.regional-connections h2{font-family:var(--font-head);font-size:clamp(25px,2.2vw,34px);color:var(--c-navy)}
.regional-side p{line-height:1.5}
.regional-photo-grid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(clamp(118px,17vh,190px),1fr);gap:9px;align-items:stretch;overflow:auto;overscroll-behavior:contain}
.regional-photo{position:relative;min-width:0;min-height:0;height:100%;padding:0;overflow:hidden;display:grid;grid-template-rows:minmax(0,1fr) auto;border:2px solid transparent;border-radius:18px;background:#d9edf2;box-shadow:var(--shadow-card);cursor:pointer}
.regional-photo img{width:100%;height:100%;min-height:clamp(80px,12vh,138px);display:block;object-fit:cover}
.regional-photo strong{padding:7px 8px;display:grid;place-items:center;text-align:center;font-size:max(16px,clamp(16px,1.1vw,19px));line-height:1.2;word-break:keep-all;overflow-wrap:break-word;background:rgba(255,255,255,.92)}
.regional-photo.is-viewed{border-color:var(--c-success)}
.regional-photo.is-viewed::after{content:"✓";position:absolute;right:7px;top:7px;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--c-success);color:#fff;font-weight:900}
.regional-dock{background:rgba(10,42,68,.94);align-items:center}
.regional-dock [data-next]{margin-left:auto}
.regional-connections{grid-column:1/-1;min-height:0;padding:0 14px 14px;display:flex;flex-direction:column;background:rgba(255,253,247,.97);overflow:hidden}
/* 완료 조건 진행 띠 — 스크롤해도 항상 보인다 */
.regional-progress-strip{position:sticky;top:0;z-index:6;display:flex;flex-wrap:nowrap;align-items:center;gap:7px;margin:0 -14px 9px;padding:9px 14px;background:rgba(255,253,247,.97);border-bottom:2px solid rgba(23,59,83,.12);box-shadow:0 6px 14px rgba(10,40,66,.08)}
.regional-progress-strip.is-gauge-only{padding-block:11px}
.regional-progress-goal{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:4px 10px;border-radius:999px;border:2px solid #b9cbd6;background:#fff;font-weight:900;font-size:clamp(14px,1vw,17px);color:var(--c-ink-soft);white-space:nowrap}
.regional-progress-goal b{color:inherit}
.regional-progress-goal.is-done{border-color:#277147;background:#dff2df;color:#1d5c39}
.regional-progress-goal.is-done::before{content:'✓';font-weight:900}
.regional-connection-layout{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.regional-section{min-width:0;min-height:0;padding:11px;display:flex;flex-direction:column;gap:7px;overflow:hidden;border:2px solid #d7e4e8;border-radius:20px;background:rgba(255,255,255,.58);box-shadow:0 8px 18px rgba(21,61,82,.08)}
.regional-section>.chip{flex:0 0 auto;min-height:34px;padding:5px 11px;font-size:clamp(15px,1vw,18px)}
.regional-section>h2{flex:0 0 auto;margin:0;font-size:clamp(21px,1.55vw,28px);line-height:1.15;word-break:keep-all}
.regional-section>p{flex:0 0 auto;margin:0;font-size:clamp(15px,1vw,18px);line-height:1.3;word-break:keep-all}
.regional-signal-grid,.regional-choice-grid{min-height:0;display:grid;gap:7px}
.regional-signal-grid{flex:1 1 auto;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(0,1fr)}
.regional-choice-grid{flex:1 1 auto;grid-template-columns:1fr;grid-auto-rows:minmax(0,1fr)}
.regional-signal,.regional-choice{text-align:left;padding:10px 11px;min-height:0;border-radius:14px;font-size:clamp(15px,1vw,18px);line-height:1.2}
.regional-signal strong{font-size:clamp(18px,1.15vw,21px);line-height:1.18}
/* 전·후 비교를 마친 신호: 왼쪽에 초록 체크 배지 */
.regional-signal{position:relative}
.regional-signal[aria-pressed="true"]{padding-left:46px}
.regional-signal[aria-pressed="true"]::before{content:'✓';position:absolute;left:12px;top:50%;width:26px;height:26px;transform:translateY(-50%);display:grid;place-items:center;border-radius:50%;background:var(--c-success);color:#fff;font:900 16px/1 var(--font-head);box-shadow:0 2px 6px rgba(0,0,0,.18)}
.regional-spot-discovery{margin:8px 0 0;padding:10px 12px;border-radius:12px;background:#eef8f4;border-left:6px solid #1b9a7a;font-weight:800;color:#123f3a}
.regional-signal span{font-size:clamp(15px,.95vw,17px)}
.regional-oceania .regional-signal-grid{grid-template-columns:1fr}
.regional-oceania .regional-signal{display:flex;align-items:center;justify-content:center;text-align:center;padding:9px 12px}
.regional-oceania .regional-signal strong{font-size:clamp(18px,1.18vw,22px);line-height:1;letter-spacing:-.025em;white-space:nowrap}
.regional-choice{position:relative;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px;padding:6px 10px}
.regional-choice img{width:44px;height:48px;object-fit:contain}
.regional-choice span{min-width:0;font-size:clamp(15px,.95vw,17px);line-height:1.22;word-break:keep-all;overflow-wrap:break-word}
/* 이름+역할은 두 줄이 카드 높이(1fr로 나눈 행) 안에 들어가게 작게 — 역할 줄이 잘리지 않게 */
.regional-choice-identity{display:grid;gap:1px;min-width:0}
.regional-choice-identity strong{font-size:clamp(16px,1.05vw,19px);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.regional-choice-identity span{font-size:clamp(13px,.85vw,15px);line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.regional-choice span strong{font-size:clamp(17px,1.08vw,20px);line-height:1.15}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice{display:block;padding:0;overflow:hidden;background:transparent;perspective:1000px}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-inner{position:relative;display:block;width:100%;height:100%;min-height:0;transform-style:preserve-3d;transition:transform .45s cubic-bezier(.2,.7,.2,1)}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice.is-flipped .regional-choice-inner{transform:rotateY(180deg)}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-face{position:absolute;inset:0;display:grid;align-items:center;min-width:0;padding:10px 14px;border-radius:13px;background:#fffdf9;backface-visibility:hidden;-webkit-backface-visibility:hidden}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-front{grid-template-columns:58px minmax(0,1fr);gap:12px;text-align:left}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-front img{width:58px;height:68px;object-fit:contain}
/* 이름·역할 글자는 카드 높이에 비례(cqh) — 창이 작거나 확대해도 두 줄이 카드 안에 들어간다 */
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice{container-type:size}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-face{padding:clamp(4px,7cqh,10px) 14px}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice img{height:min(48px,72cqh);width:auto}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-identity{display:flex;flex-direction:column;gap:2px;min-width:0}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-identity strong{font-size:clamp(14px,21cqh,20px);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-identity span{font-size:clamp(12px,17cqh,16px);font-weight:800;line-height:1.15;color:#436073;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-back{place-items:center;padding:13px 18px;transform:rotateY(180deg);background:#eaf8f7;text-align:center}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-line{font-size:clamp(16px,1vw,18px);font-weight:800;line-height:1.35;word-break:keep-all;overflow-wrap:break-word}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice:focus-visible{outline:4px solid #f5bd32;outline-offset:2px}
@media(prefers-reduced-motion:reduce){:is(.regional-oceania,.regional-asia,.regional-europe) .regional-choice-inner{transition:none}}
/* 아직 못 들은 목소리(P2-16) — "…" 표시가 재방문 이유가 된다 */
.regional-voice-dots{position:absolute;right:8px;top:6px;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#e8eef2;color:#41627a;font:900 16px/1 var(--font-head);font-style:normal}
.regional-choice.is-unheard{border-style:dashed}
.regional-action-grid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:7px}
.regional-action{text-align:left;padding:9px 11px;border-radius:14px;min-height:0;font-size:clamp(15px,.95vw,18px);line-height:1.16;word-break:keep-all;overflow-wrap:break-word}
.regional-action strong{font-size:clamp(17px,1.08vw,20px);line-height:1.16}
.regional-action small{font-size:clamp(13px,.82vw,15px);line-height:1.15}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-action-notebook{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:8px;padding:10px 10px 10px 24px;overflow:hidden;border:2px solid #d8cba8;border-radius:16px;background:repeating-linear-gradient(#fffdf5 0,#fffdf5 37px,#dcebf0 38px,#fffdf5 39px);box-shadow:0 5px 12px rgba(56,74,79,.12)}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-action-notebook::before{content:"";position:absolute;top:0;bottom:0;left:15px;width:2px;background:#ef9b9b}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-group{position:relative;z-index:1;display:flex;flex-direction:column;gap:5px;min-height:0}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-group.is-together{flex:1 1 auto}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 7px;min-height:0}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-group.is-together .regional-note-list{flex:1 1 auto;grid-auto-rows:minmax(0,1fr)}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-item{display:grid;grid-template-columns:25px minmax(0,1fr);align-items:center;gap:7px;min-height:48px;padding:5px 4px;border:0;border-bottom:2px solid rgba(92,133,151,.22);border-radius:6px;background:rgba(255,255,255,.58);color:#102f45;text-align:left;box-shadow:none;font:900 clamp(14px,.88vw,16px)/1.2 var(--font-body);word-break:keep-all;overflow-wrap:break-word;cursor:pointer;touch-action:manipulation}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-item:hover{background:rgba(225,248,242,.82)}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-item:focus-visible{outline:3px solid #f5bd32;outline-offset:1px}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-check-box{display:grid;place-items:center;width:24px;height:24px;border:2px solid #2b7180;border-radius:6px;background:#fff;color:#fff;font:1000 17px/1 var(--font-head);transition:background .16s ease,transform .16s ease}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-item[aria-pressed="true"]{background:rgba(221,246,237,.9);color:#0c563d}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-item[aria-pressed="true"] .regional-check-box{border-color:#19885f;background:#19885f;transform:rotate(-4deg) scale(1.05)}
:is(.regional-oceania,.regional-asia,.regional-europe) .regional-note-copy{min-width:0}
.regional-europe .regional-choice-line{font-size:clamp(15px,.92vw,17px);line-height:1.3;text-wrap:balance}
.regional-europe .regional-note-copy{font-size:clamp(13px,.84vw,15px);line-height:1.2;word-break:keep-all;text-wrap:balance}
.regional-europe .regional-section>h2,.regional-europe .regional-section>p{text-wrap:balance}
.regional-asia .regional-signal{display:flex;align-items:center;justify-content:center;text-align:center;padding:9px}
.regional-asia .regional-signal strong{font-size:clamp(16px,1.02vw,19px);line-height:1.18;word-break:keep-all}
.regional-asia .regional-note-group:first-child .regional-note-list{grid-template-columns:repeat(2,minmax(0,1fr))}
.regional-info{align-self:start;min-height:48px;padding:8px 16px;border-radius:999px;font-size:max(16px,var(--fs-small))}
/* 구역을 고르기 전에도 사이드가 비어 보이지 않게 — 권역을 바로 고를 수 있는 목록 */
.regional-area-picks{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;align-content:start;overflow:auto} /* 나라가 8개여도 두 열로 스크롤 없이 */
.regional-area-pick{justify-content:flex-start;text-align:left;min-height:56px;padding:9px 14px;border-radius:16px;font-size:max(17px,var(--fs-small))}
.regional-area-pick span{display:block;margin-top:2px;font:700 max(15px,calc(var(--fs-small) - 1px))/1.25 var(--font-body);color:var(--c-ink-soft)}
/* 장면 모달은 그림이 주인공 — 기본 모달 폭(680px)으로는 사진이 작아져 넓힌다 */
#overlay-root .modal:has(.regional-modal){width:min(1340px,96vw);max-height:min(92dvh,940px)}
#overlay-root .modal:has(.regional-modal) > div{max-width:none}
.regional-modal{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(300px,.9fr);gap:16px;max-width:none;align-items:start}
/* 사진은 세로로 세우지 않고 가로(16:9)로 크게 — 아프리카 지역 화면과 같은 눈높이 */
.regional-modal-visual{position:relative;overflow:hidden;border-radius:20px;background:#dceff4;width:100%;aspect-ratio:16/9;max-height:72vh}
.regional-modal-visual img{width:100%;height:100%;object-fit:cover}
.regional-modal-visual .regional-after{position:absolute;inset:0}
.regional-scene-nav{position:absolute;z-index:7;top:50%;transform:translateY(-50%);width:clamp(50px,3.4vw,64px);height:clamp(58px,4.2vw,76px);padding:0;display:grid;place-items:center;border:3px solid rgba(255,255,255,.94);border-radius:999px;background:rgba(8,48,76,.76);color:#fff;font:950 clamp(35px,2.7vw,50px)/1 var(--font-head);box-shadow:0 8px 22px rgba(1,22,38,.4);backdrop-filter:blur(5px);cursor:pointer;touch-action:manipulation;transition:transform .15s ease,background .15s ease}
.regional-scene-nav:hover,.regional-scene-nav:focus-visible{background:rgba(14,111,134,.94);outline:4px solid #ffe06b;outline-offset:2px;transform:translateY(-50%) scale(1.06)}
.regional-scene-nav:active{transform:translateY(-50%) scale(.96)}
.regional-scene-nav.is-prev{left:10px}.regional-scene-nav.is-next{right:10px}
.regional-scene-position{position:absolute;z-index:6;left:50%;bottom:10px;transform:translateX(-50%);padding:5px 13px;border:2px solid rgba(255,255,255,.9);border-radius:999px;background:rgba(7,42,66,.78);color:#fff;font:900 max(16px,var(--fs-small))/1 var(--font-head);box-shadow:0 5px 14px rgba(1,22,38,.35);pointer-events:none}
.regional-wipe-bar{position:absolute;z-index:5;top:0;bottom:0;width:56px;padding:0;transform:translateX(-50%);border:0;background:transparent;box-shadow:none;cursor:ew-resize;touch-action:none}
.regional-wipe-bar::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:4px;transform:translateX(-50%);background:#fff;box-shadow:0 0 8px #0008;pointer-events:none}
.regional-wipe-bar>span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:46px;display:grid;place-items:center;border:3px solid rgba(255,255,255,.94);border-radius:50%;background:#fff;color:#173b53;font-size:22px;font-weight:950;box-shadow:0 5px 14px #0007;pointer-events:none}
.regional-wipe-bar:hover>span,.regional-wipe-bar:focus-visible>span{background:#fff3bd;border-color:#f2c14e;transform:translate(-50%,-50%) scale(1.08)}
.regional-wipe-bar:focus-visible{outline:0}
.regional-wipe-bar:active>span{transform:translate(-50%,-50%) scale(.96)}
.regional-wipe-tag{position:absolute;top:10px;padding:5px 14px;border-radius:999px;font:900 clamp(16px,1.15vw,19px) var(--font-head);color:#fff;background:rgba(10,35,58,.75);pointer-events:none}
.regional-wipe-tag.is-before{left:10px}
.regional-wipe-tag.is-after{right:10px}
.regional-wipe{position:absolute;left:0;right:0;bottom:8px;width:calc(100% - 20px);margin:0 10px;height:44px;opacity:.92;accent-color:#f2c14e}
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
/* 오세아니아 바다 지킴 게이지 — 선택할 때마다 물이 차오른다 */
.regional-gauge{display:flex;align-items:center;gap:9px;flex:1 1 220px;min-width:200px}
.regional-gauge strong{flex:0 0 auto;font:900 max(16px,calc(var(--fs-small) - 2px))/1.2 var(--font-head);color:#0c4a63}
.regional-gauge .bar{position:relative;flex:1;height:18px;border-radius:999px;background:#dceaf1;border:2px solid #9dc3d4;overflow:hidden}
.regional-gauge .bar i{position:absolute;inset:0;width:var(--fill,0%);border-radius:999px;background:linear-gradient(90deg,#38b6d8,#1188b8);transition:width .5s ease}
.regional-gauge b{flex:0 0 auto;font-size:16px;color:#0c4a63}
.regional-progress-strip.is-gauge-only .regional-gauge{gap:12px}
.regional-progress-strip.is-gauge-only .regional-gauge strong{font-size:clamp(17px,1.15vw,20px)}
.regional-progress-strip.is-gauge-only .regional-gauge .bar{height:22px}
.regional-progress-strip.is-gauge-only .regional-gauge b{font-size:clamp(17px,1.1vw,19px)}
.regional-discovery.is-lit{outline:3px solid var(--c-turquoise);outline-offset:2px}
.regional-modal-copy{min-width:0;display:grid;gap:10px;align-content:start;max-height:72vh;padding-right:4px;overflow:auto;overscroll-behavior:contain;font-size:clamp(17px,1.2vw,21px);line-height:1.4;word-break:keep-all;overflow-wrap:break-word}
.regional-modal-copy p{margin:0;max-width:100%}
.regional-modal-copy.is-culture{align-self:stretch;height:100%;max-height:72vh;padding-right:0;grid-template-rows:auto auto 1fr;overflow:visible}
.regional-modal-copy.is-culture .regional-spot-detail{align-content:center}
.regional-scene-guide{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;padding:11px 13px;border:2px solid #e8bf4e;border-radius:14px;background:#fff3cf;color:#5b430a}
.regional-scene-guide strong{font-size:clamp(17px,1.25vw,21px);line-height:1.25}
.regional-scene-count{min-width:64px;padding:5px 10px;border-radius:999px;background:#173b53;color:#fff;text-align:center;font:900 clamp(16px,1.1vw,19px)/1.2 var(--font-head)}
.regional-spot-detail{min-height:0;padding:14px 16px;display:grid;align-content:start;gap:8px;border:3px solid #b9d9dc;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 8px 20px rgba(18,60,81,.1);transition:border-color .2s ease,box-shadow .2s ease}
.regional-spot-detail.is-empty{justify-items:center;text-align:center;border-style:dashed;background:rgba(246,251,250,.84);color:var(--c-ink-soft)}
.regional-spot-detail.is-revealed{border-color:var(--c-turquoise);box-shadow:0 12px 28px rgba(18,128,123,.18);animation:regional-detail-in .28s ease-out}
.regional-spot-detail h4{font-family:var(--font-head);font-size:clamp(24px,1.9vw,31px);line-height:1.2;color:var(--c-navy)}
.regional-spot-detail p{font-size:clamp(18px,1.35vw,23px);line-height:1.55;word-break:keep-all;overflow-wrap:break-word}
@keyframes regional-detail-in{from{opacity:.25;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.regional-discovery{padding:12px 14px;border-left:5px solid var(--c-turquoise);border-radius:14px;background:#eefaf7;font-weight:800}
.modal:has(.regional-modal){width:min(1320px,96vw);border-radius:28px;overflow:hidden}
@media(min-width:941px){.regional-side{overflow:hidden;padding:13px 14px;gap:7px}.regional-side p{font-size:max(16px,var(--fs-small));line-height:1.35}.regional-photo-grid{flex:1 1 auto;min-height:0;gap:9px;grid-auto-rows:minmax(clamp(132px,18vh,210px),1fr)}.regional-photo img{height:100%;min-height:clamp(90px,13vh,154px);aspect-ratio:auto}}
@media(max-width:940px){.regional-shell,.regional-connection-layout{grid-template-columns:1fr}.regional-shell{height:auto;min-height:calc(100dvh - var(--top-bar-h) - var(--bottom-bar-h) - 28px)}.regional-map{height:auto;min-height:clamp(190px,44vh,520px)}}
@media(max-height:460px){.regional-map{min-height:clamp(150px,52vh,300px)}.regional-pin{min-width:0;min-height:38px;padding:4px 9px;font-size:14px}.regional-pin small{display:none}.regional-photo-grid{grid-template-columns:repeat(2,1fr);grid-auto-rows:auto}.regional-photo{height:auto}.regional-photo img{height:auto;aspect-ratio:4/3}.regional-connections{grid-column:1}.regional-modal{grid-template-columns:1fr}.regional-modal-visual{aspect-ratio:16/9;max-height:46vh}}
@media(max-width:620px){.regional-shell{min-height:0}.regional-map{min-height:470px}.regional-pin{min-width:86px;font-size:16px}.regional-signal-grid,.regional-choice-grid,.regional-action-grid{grid-template-columns:1fr}.regional-photo strong{font-size:16px}}
`;

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function uniqueValid(value: unknown, valid: ReadonlySet<string>, max = 60): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && valid.has(item)))].slice(0, max);
}

/** 한 나라·장소의 사진을 빠짐없이 관찰한 경우에만 완료로 돌려준다. */
export function completedExampleIdsForScenes(
  examples: ReadonlyArray<{ id: string; sceneIds: string[] }>,
  viewedSceneIds: readonly string[]
): string[] {
  const viewed = new Set(viewedSceneIds);
  return examples
    .filter((example) => example.sceneIds.length > 0 && example.sceneIds.every((sceneId) => viewed.has(sceneId)))
    .map((example) => example.id);
}

/** 한 권역에서 실제로 보여 주는 나라·장소의 사진을 모두 본 경우에만 지도 완료 체크를 돌려준다. */
export function completedAreaIdsForScenes(
  areas: ReadonlyArray<{ id: string }>,
  examples: ReadonlyArray<{ id?: string; areaId: string; sceneIds: string[] }>,
  viewedSceneIds: readonly string[]
): string[] {
  const viewed = new Set(viewedSceneIds);
  return areas
    .filter((area) => examples.some((example) => example.areaId === area.id
      && example.sceneIds.length > 0
      && example.sceneIds.every((sceneId) => viewed.has(sceneId))))
    .map((area) => area.id);
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
  const viewedSceneIds = uniqueValid(raw.viewedSceneIds, sceneIds);
  const completedExampleIds = completedExampleIdsForScenes(model.examples, viewedSceneIds);
  return {
    screen: raw.screen === 'connections' ? 'connections' : 'explore',
    activeAreaId,
    activeExampleId,
    // 예전 저장값에는 지도 표식을 누르기만 해도 완료된 기록이 있으므로 모든 대륙을 사진 근거로 다시 계산한다.
    visitedAreaIds: completedAreaIdsForScenes(model.areas, model.examples, viewedSceneIds),
    viewedExampleIds: completedExampleIds.filter((id) => exampleIds.has(id)),
    viewedSceneIds,
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

const ASIA_CONNECTION_LABELS: Record<string, string> = {
  climate: '날씨',
  water: '물',
  ecosystem: '동식물',
  city: '도시 생활',
  ocean: '바다',
  heritage: '옛사람의 지혜'
};

function asiaConnectionSummary(types: string[]): string {
  const labels = [...new Set(types.map((type) => ASIA_CONNECTION_LABELS[type] ?? type))];
  return `함께 이어져 있어: ${labels.join(' · ')}`;
}

function asiaModel(content: AsiaSource): RegionalModel {
  const signalVisuals: Record<string, { before: string; after: string }> = {
    signal_mongolia_dry_steppe: { before: 'asia.signal.mongolia.before', after: 'asia.signal.mongolia.after' },
    signal_japan_heat: { before: 'asia.signal.japan.before', after: 'asia.signal.japan.after' },
    signal_vietnam_saltwater: { before: 'asia.signal.vietnam.before', after: 'asia.signal.vietnam.after' },
    signal_nepal_glacier: { before: 'asia.signal.nepal.before', after: 'asia.signal.nepal.after' },
    signal_kazakhstan_glacier: { before: 'asia.signal.kazakhstan.before', after: 'asia.signal.kazakhstan.after' },
    signal_jordan_water: { before: 'asia.signal.jordan.before', after: 'asia.signal.jordan.after' }
  };
  const signalLessons: Record<string, { title: string; prompt: string; chain: string }> = {
    signal_mongolia_dry_steppe: {
      title: '초원의 가뭄과 물 부족',
      prompt: '비가 적게 온 뒤 풀과 우물물이 어떻게 달라졌는지 비교해 봐.',
      chain: '비가 줄어듦 → 풀과 우물물이 줄어듦 → 사람과 가축이 물을 구하기 어려워짐'
    },
    signal_japan_heat: {
      title: '도시의 폭염과 그늘 부족',
      prompt: '기온이 오른 뒤 공원과 사람들의 모습이 어떻게 달라졌는지 비교해 봐.',
      chain: '기온이 오름 → 도시가 더 뜨거워짐 → 그늘과 쉼터가 더 필요해짐'
    },
    signal_vietnam_saltwater: {
      title: '바닷물 때문에 짜진 삼각주',
      prompt: '바닷물이 들어온 뒤 논과 물길이 어떻게 달라졌는지 비교해 봐.',
      chain: '바닷물이 강으로 들어옴 → 논물이 짜짐 → 농사와 식수가 어려워짐'
    },
    signal_nepal_glacier: {
      title: '줄어드는 빙하와 계곡물',
      prompt: '기온이 오른 뒤 산의 얼음과 계곡물이 어떻게 달라졌는지 비교해 봐.',
      chain: '기온이 오름 → 빙하가 줄어듦 → 계곡물의 양이 달라짐'
    },
    signal_kazakhstan_glacier: {
      title: '도시가 넓어지며 줄어든 초원',
      prompt: '도시가 넓어진 뒤 초원과 습지가 어떻게 달라졌는지 비교해 봐.',
      chain: '도시가 넓어짐 → 초원과 습지가 줄어듦 → 동식물의 터전이 좁아짐'
    },
    signal_jordan_water: {
      title: '사막의 가뭄과 물 부족',
      prompt: '더 오래 덥고 비가 적게 온 뒤 물웅덩이가 어떻게 달라졌는지 비교해 봐.',
      chain: '비가 적고 더워짐 → 물이 빨리 마름 → 생활에 쓸 물이 부족해짐'
    }
  };
  return {
    learn: (content as { learn?: unknown }).learn,
    id: 'asia', title: content.intro.title, subtitle: content.intro.subtitle, guide: content.intro.guide,
    backgroundId: 'bg.asia', mapAssetId: 'asia.map.regional', bgm: 'asia', areaLabel: '권역',
    requirements: { minAreas: content.requirements.minRegions, minExamples: content.requirements.minExamples, minDiscoveries: content.requirements.minDiscoveries, minSignals: content.requirements.minSignals },
    areas: content.regions.map((item, index) => ({ id: item.id, name: item.nameKo, short: item.silhouette, description: `${item.nameKo}의 자연과 생활 사례를 살펴봐.`, x: item.mapPosition.xPercent, y: item.mapPosition.yPercent, color: COLORS[index % COLORS.length] ?? COLORS[0]! })),
    examples: content.countryExamples.map((item) => ({ id: item.id, areaId: item.regionId, country: item.countryNameKo, place: item.placeNameKo, scope: item.scopeNoteKo, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl, sceneIds: item.sceneIds })),
    scenes: content.scenes.map((item) => ({ id: item.id, exampleId: item.exampleId, category: item.category, categoryLabel: item.category === 'nature' ? '자연과 공간' : item.category === 'daily' ? '오늘날의 생활' : item.category === 'landmark' ? '대표 장소 관찰' : '이어 온 생활과 지혜', title: item.titleKo, assetId: item.imageAssetId, summary: item.summaryKo, detail: item.detailKo, discovery: item.discoveryKo, hotspots: keepHotspots(item.category, item.hotspots.map((spot) => ({ id: spot.id, x: spot.x * 100, y: spot.y * 100, label: spot.labelKo }))), sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    signals: content.signals.map((item) => {
      const visual = signalVisuals[item.id];
      const lesson = signalLessons[item.id];
      return { id: item.id, title: lesson?.title ?? item.titleKo, prompt: lesson?.prompt ?? item.promptKo, connection: lesson?.chain ?? asiaConnectionSummary(item.connectionTypes), issueId: issueFromConnections(item.connectionTypes), beforeAssetId: visual?.before ?? item.beforeAssetId, afterAssetId: visual?.after ?? item.afterAssetId, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl };
    }),
    perspectives: content.perspectives.map((item) => ({ id: item.id, name: item.nameKo, role: item.labelKo, line: item.lineKo, worry: item.worryKo, assetId: item.assetId })),
    actions: content.actions.filter((item) => item.id !== 'action_school_map').map((item) => ({ id: item.id, tier: item.tier, label: item.nameKo, detail: item.detailKo }))
  };
}

function oceaniaModel(content: OceaniaSource): RegionalModel {
  const scenesByZone = new Map<string, string[]>();
  const signalVisuals: Record<string, { before: string; after: string }> = {
    coral_change: { before: 'oceania.signal.coral.before', after: 'oceania.signal.coral.after' },
    marine_debris: { before: 'oceania.signal.debris.before', after: 'oceania.signal.debris.after' },
    coastal_water: { before: 'oceania.signal.water.before', after: 'oceania.signal.water.after' },
    weather_route: { before: 'oceania.signal.weather.before', after: 'oceania.signal.weather.after' }
  };
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
    scenes: content.scenes.map((item) => ({ id: item.id, exampleId: item.exampleId, category: item.category, categoryLabel: item.categoryLabel, title: item.title, assetId: item.assetId, summary: item.summary, detail: item.detail, discovery: item.discovery, hotspots: keepHotspots(item.category, item.hotspots), sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl })),
    signals: content.signals.filter((item) => item.id !== 'water_energy').map((item) => {
      const visual = signalVisuals[item.id];
      return { id: item.id, title: item.title, prompt: item.prompt, connection: `${item.connectionType} · ${item.connectionNote}`, issueId: issueFromConnections([item.connectionType]), beforeAssetId: visual?.before ?? item.beforeAssetId, afterAssetId: visual?.after ?? item.afterAssetId, sourceTitle: item.sourceTitle, sourceUrl: item.sourceUrl };
    }),
    perspectives: content.perspectives.map((item) => ({ id: item.id, name: item.name, role: item.role, line: item.line, worry: '', assetId: item.imageId })),
    actions: content.actions.filter((item) => item.id !== 'safe_infrastructure').map((item) => ({ id: item.id, tier: item.tier, label: item.label, detail: '선택의 장단점을 다른 행동과 함께 비교해 봐.' }))
  };
}

function europeModel(content: EuropeSource): RegionalModel {
  return {
    learn: content.learn,
    id: 'europe',
    title: content.intro.title,
    subtitle: content.intro.subtitle,
    guide: content.intro.guide,
    backgroundId: 'bg.europe',
    mapAssetId: 'europe.map.illustrated',
    bgm: 'europe',
    areaLabel: '나라',
    requirements: {
      minAreas: content.requirements.minCountries,
      minExamples: content.requirements.minCountries,
      minDiscoveries: content.requirements.minCountries,
      minSignals: content.requirements.minSignals
    },
    areas: content.countries.map((country) => ({
      id: country.id,
      name: country.name,
      short: country.hook.split(/[,.]/u)[0]?.trim() || '생활과 환경',
      description: country.hook,
      x: country.map.x,
      y: country.map.y,
      color: country.accent
    })),
    examples: content.countries.map((country) => ({
      id: `${country.id}_places`,
      areaId: country.id,
      country: country.name,
      place: '자연·생활·문화 장면',
      scope: `${country.name}의 몇 가지 사례를 비교해 봐.`,
      sourceTitle: country.visuals[0]?.sourceTitle ?? '프로젝트 생성 관찰 그림',
      sourceUrl: country.visuals[0]?.sourceUrl ?? 'project:europe-learning-scenes',
      sceneIds: country.visuals.map((visual) => visual.id)
    })),
    scenes: content.countries.flatMap((country) => country.visuals.map((visual) => ({
      id: visual.id,
      exampleId: `${country.id}_places`,
      category: visual.category,
      categoryLabel: visual.category === 'environment' ? '자연과 공간' : visual.category === 'daily' ? '오늘날의 생활' : '이어 온 문화 공간',
      title: visual.title,
      assetId: visual.imageId,
      summary: visual.caption,
      detail: `사진에서 ${visual.lookFor}을 찾아봐.`,
      discovery: `${country.name}의 한 장면을 다른 나라의 모습과 비교해 봐.`,
      hotspots: [],
      sourceTitle: visual.sourceTitle,
      sourceUrl: visual.sourceUrl
    }))),
    signals: content.signals.map((signal) => ({ ...signal })),
    perspectives: content.perspectives.map((perspective) => ({ ...perspective, worry: '' })),
    actions: content.actions.map((action) => ({ ...action }))
  };
}

function imageFor(model: RegionalModel, assetId: string): string {
  return assetUrl(hasAsset(assetId) ? assetId : model.mapAssetId);
}

function createRegionalPage(load: () => Promise<RegionalModel>): Page {
  let disposed = false;
  let closeModal: (() => void) | null = null;
  let stopMapZoom: (() => void) | null = null;
  let voiceRenderTimer: number | null = null;
  return {
    async mount(root) {
      const model = await load();
      if (disposed) return;
      audio.playBgm(model.bgm);
      const state = normalizeState(model);
      const flippedVoiceIds = new Set<string>();
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
      const syncAreaCompletion = () => {
        state.visitedAreaIds = completedAreaIdsForScenes(model.areas, model.examples, state.viewedSceneIds);
        state.viewedExampleIds = completedExampleIdsForScenes(model.examples, state.viewedSceneIds);
      };
      // 나라·장소 선택 버튼을 없앴으므로 탐험 완료 조건은 화면에서 직접 수행할 수 있는
      // 구역 방문과 장면 관찰만으로 판단한다.
      const chosenTierCount = () => new Set(model.actions.filter((item) => state.selectedActionIds.includes(item.id)).map((item) => item.tier)).size;
      const finishReady = () => teacherUnlocked || (state.discoveredSignalIds.length >= model.requirements.minSignals && state.listenedPerspectiveIds.length >= 2 && state.selectedActionIds.length >= 3 && chosenTierCount() >= 2);

      const openScene = (scene: Scene) => {
        const example = model.examples.find((item) => item.id === scene.exampleId);
        const galleryExample = model.examples.find((item) => item.id === state.activeExampleId) ?? example;
        const sceneSequence = [...new Set(galleryExample?.sceneIds ?? [scene.id])]
          .map((id) => model.scenes.find((item) => item.id === id))
          .filter((item): item is Scene => Boolean(item));
        const sequenceIndex = Math.max(0, sceneSequence.findIndex((item) => item.id === scene.id));
        const previousScene = sceneSequence[(sequenceIndex - 1 + sceneSequence.length) % sceneSequence.length];
        const nextScene = sceneSequence[(sequenceIndex + 1) % sceneSequence.length];
        const sceneNavigation = sceneSequence.length > 1 && previousScene && nextScene
          ? `<button type="button" class="regional-scene-nav is-prev" data-scene-nav="${previousScene.id}" aria-label="이전 그림: ${esc(previousScene.title)}">‹</button>
             <button type="button" class="regional-scene-nav is-next" data-scene-nav="${nextScene.id}" aria-label="다음 그림: ${esc(nextScene.title)}">›</button>
             <span class="regional-scene-position" aria-label="전체 ${sceneSequence.length}장 중 ${sequenceIndex + 1}번째">${sequenceIndex + 1} / ${sceneSequence.length}</span>`
          : '';
        const modalBody = document.createElement('div');
        modalBody.className = 'regional-modal';
        /** 각 점의 설명을 하나씩 확인한 뒤에만 장면을 '본 것'으로 기록한다. */
        const markViewed = () => {
          if (state.viewedSceneIds.includes(scene.id)) {
            return;
          }
          const wasExampleComplete = galleryExample
            ? galleryExample.sceneIds.every((sceneId) => state.viewedSceneIds.includes(sceneId))
            : false;
          add(state.viewedSceneIds, scene.id);
          syncAreaCompletion();
          void audio.playSfx('success');
          const hint = modalBody.querySelector<HTMLElement>('[data-scene-hint]');
          if (hint) hint.textContent = '✓ 다 살펴봤어!';
          modalBody.querySelector<HTMLElement>('.regional-discovery')?.classList.add('is-lit');
          persist();
          render();
          const isExampleComplete = galleryExample
            ? galleryExample.sceneIds.every((sceneId) => state.viewedSceneIds.includes(sceneId))
            : false;
          if (!wasExampleComplete && isExampleComplete && galleryExample) {
            showToast(`${galleryExample.country} 사진을 모두 살펴봤어! 다른 나라도 둘러볼까?`, 'success');
          }
        };
        if (scene.hotspots.length === 0) markViewed();
        const viewed = state.viewedSceneIds.includes(scene.id);
        const foundHotspotIds = new Set<string>(viewed ? scene.hotspots.map((spot) => spot.id) : []);
        // "한 모습으로 설명하지 않는다"류의 범위 안내(scope)는 팝업마다 반복하지 않는다.
        // 설정 > 학생용 가이드에 한 번만 두고, 여기서는 관찰한 내용만 보여 준다.
        const spotCopy = (index: number): string => index === 0
          ? [scene.summary, scene.detail].filter(Boolean).join(' ')
          : scene.discovery;
        modalBody.innerHTML = `
          <div class="regional-modal-visual" data-scene-visual>
            <img src="${imageFor(model, scene.assetId)}" alt="${esc(scene.title)} 학습용 재현 이미지">
            ${scene.hotspots.map((spot) => `<button type="button" class="regional-hotspot${viewed ? ' is-found' : ''}" style="--x:${spot.x}%;--y:${spot.y}%" data-hotspot="${spot.id}" aria-label="${esc(spot.label)} 설명 보기" aria-pressed="false"></button>`).join('')}
            ${sceneNavigation}
          </div>
          <div class="regional-modal-copy${scene.category === 'culture' ? ' is-culture' : ''}">
            <span class="chip">${esc(scene.categoryLabel)}</span>
            ${scene.category === 'culture' ? '' : `<h3>${esc(scene.title)}</h3>`}
            ${scene.hotspots.length ? `<div class="regional-scene-guide"><strong data-scene-hint>${viewed ? '점을 누르면 설명을 다시 볼 수 있어!' : '사진 속 반짝이는 점을 눌러 자세히 살펴봐!'}</strong><span class="regional-scene-count" data-scene-count>${foundHotspotIds.size} / ${scene.hotspots.length}</span></div>` : ''}
            <section class="regional-spot-detail" data-spot-detail aria-live="polite">
              ${scene.category === 'culture' ? '' : `<h4 data-spot-title>${esc(scene.title)}</h4>`}
              <p data-spot-copy>${esc([scene.summary, scene.detail].filter(Boolean).join(' '))}</p>
              ${scene.hotspots.length === 0 && scene.discovery ? `<p class="regional-spot-discovery">${esc(scene.discovery)}</p>` : ''}
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
        modalBody.querySelectorAll<HTMLButtonElement>('[data-scene-nav]').forEach((button) => button.addEventListener('click', () => {
          const target = model.scenes.find((item) => item.id === button.dataset.sceneNav);
          if (target) openScene(target);
        }));
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
          persist();
          render();
        };
        if (!hasBefore) markDiscovered();
        modalBody.innerHTML = `
          <div class="regional-modal-visual">
            <img src="${imageFor(model, signal.beforeAssetId)}" alt="">
            ${hasBefore ? `<img class="regional-after" src="${imageFor(model, signal.afterAssetId)}" alt="${esc(signal.title)} 학습용 비교 장면" style="clip-path:inset(0 0 0 50%)">
            <button type="button" class="regional-wipe-bar" data-wipe-handle style="left:50%" aria-label="가운데 손잡이를 좌우로 움직여 비교하기" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span aria-hidden="true">↔</span></button>
            <span class="regional-wipe-tag is-before">변화 전</span><span class="regional-wipe-tag is-after">변화 후</span>
            <input class="regional-wipe" type="range" min="0" max="100" value="50" aria-label="변화 전과 변화 후 모습을 밀어서 비교하기">` : ''}
          </div>
          <div class="regional-modal-copy"><span class="chip">${model.id === 'oceania' ? '이어진 환경 신호' : '원인 → 변화 → 영향'}</span>
            <p>${esc(signal.prompt)}</p><p class="regional-discovery">${esc(signal.connection)}</p></div>`;
        const wipe = modalBody.querySelector<HTMLInputElement>('.regional-wipe');
        if (wipe) enableRangeDrag(wipe);
        const after = modalBody.querySelector<HTMLElement>('.regional-after');
        const wipeBar = modalBody.querySelector<HTMLButtonElement>('[data-wipe-handle]');
        const visual = modalBody.querySelector<HTMLElement>('.regional-modal-visual');
        let traveled = 0;
        let lastValue = wipe ? Number(wipe.value) : 50;
        const setWipeValue = (nextValue: number): void => {
          const v = Math.max(0, Math.min(100, Math.round(nextValue)));
          traveled += Math.abs(v - lastValue);
          lastValue = v;
          if (wipe) wipe.value = String(v);
          if (after) after.style.clipPath = `inset(0 0 0 ${v}%)`;
          if (wipeBar) {
            wipeBar.style.left = `${v}%`;
            wipeBar.setAttribute('aria-valuenow', String(v));
          }
          if (traveled >= 70) markDiscovered();
        };
        wipe?.addEventListener('input', () => setWipeValue(Number(wipe.value)));
        if (wipeBar && visual) {
          let draggingPointer: number | null = null;
          const moveHandle = (ev: PointerEvent): void => {
            const rect = visual.getBoundingClientRect();
            if (rect.width <= 0) return;
            setWipeValue(((ev.clientX - rect.left) / rect.width) * 100);
          };
          wipeBar.addEventListener('pointerdown', (ev) => {
            draggingPointer = ev.pointerId;
            wipeBar.setPointerCapture(ev.pointerId);
            moveHandle(ev);
          });
          wipeBar.addEventListener('pointermove', (ev) => { if (draggingPointer === ev.pointerId) moveHandle(ev); });
          const endDrag = (ev: PointerEvent): void => {
            if (draggingPointer !== ev.pointerId) return;
            if (wipeBar.hasPointerCapture(ev.pointerId)) wipeBar.releasePointerCapture(ev.pointerId);
            draggingPointer = null;
          };
          wipeBar.addEventListener('pointerup', endDrag);
          wipeBar.addEventListener('pointercancel', endDrag);
          wipeBar.addEventListener('keydown', (ev) => {
            const step = ev.shiftKey ? 10 : 5;
            if (ev.key === 'ArrowLeft') setWipeValue(lastValue - step);
            else if (ev.key === 'ArrowRight') setWipeValue(lastValue + step);
            else if (ev.key === 'Home') setWipeValue(0);
            else if (ev.key === 'End') setWipeValue(100);
            else return;
            ev.preventDefault();
          });
        }
        closeModal?.();
        closeModal = openModal({ id: `${model.id}-signal`, title: signal.title, bodyEl: modalBody, actions: [] });
      };

      const renderDock = () => {
        if (state.screen === 'explore') {
          dock.innerHTML = `<button class="btn btn-primary" data-next>환경 연결 살펴보기 →</button>`;
          const nextBtn = dock.querySelector<HTMLButtonElement>('[data-next]')!;
          const note = createGateNote();
          dock.insertBefore(note, nextBtn);
          updateGate(nextBtn, note, [
            { label: `${model.areaLabel} 탐험`, got: state.visitedAreaIds.length, need: model.requirements.minAreas },
            { label: '나라·장소 장면', got: state.viewedSceneIds.length, need: model.requirements.minDiscoveries }
          ], { bypass: teacherUnlocked });
          nextBtn.addEventListener('click', () => { state.screen = 'connections'; persist(); render(); });
        } else {
          dock.innerHTML = `<button class="btn btn-ghost" data-back>← ${model.areaLabel} 지도</button><button class="btn btn-primary" data-finish ${finishReady() ? '' : 'disabled'}>${model.title.split(':')[0]} 여행 마치기</button>`;
          const finishBtn = dock.querySelector<HTMLButtonElement>('[data-finish]')!;
          const note = createGateNote();
          dock.insertBefore(note, finishBtn);
          updateGate(finishBtn, note, [
            { label: '환경 신호', got: state.discoveredSignalIds.length, need: model.requirements.minSignals },
            { label: '친구 목소리', got: state.listenedPerspectiveIds.length, need: 2 },
            { label: '함께할 일', got: state.selectedActionIds.length, need: 3 },
            { label: '서로 다른 주체', got: chosenTierCount(), need: 2 }
          ], { bypass: teacherUnlocked });
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
        const galleryTitle = area
          ? `${esc(area.name)} · ${model.id === 'oceania' ? '지역과 대표 장소' : '나라와 대표 장면'}`
          : '';
        body.innerHTML = `<section class="regional-shell">
          <div class="regional-map" aria-label="${esc(model.title)} 권역 지도"><div class="regional-map-frame"><div class="regional-map-layer" style="background-image:url('${assetUrl(model.mapAssetId)}')">
            ${model.areas.map((item) => `<button type="button" class="regional-pin ${state.activeAreaId === item.id ? 'is-active' : ''} ${state.visitedAreaIds.includes(item.id) ? 'is-visited' : ''}" style="--x:${item.x}%;--y:${item.y}%;--pin:${item.color}" data-area="${item.id}">${esc(item.name)}<small>${esc(item.short)}</small></button>`).join('')}
            ${koreaShortcut ? `<button type="button" class="regional-country-shortcut ${state.activeExampleId === koreaShortcut.id ? 'is-active' : ''}" data-country-shortcut="${koreaShortcut.id}">대한민국<small>서울 · 바로 보기</small></button>` : ''}
          </div></div></div>
          <aside class="regional-side">
            ${area ? `<span class="chip">${esc(model.areaLabel)} 탐험</span><h2>${esc(area.name)}</h2><p>${esc(area.description)}</p><h3>${galleryTitle}</h3><div class="regional-photo-grid">${scenes.length ? scenes.map((scene) => `<button class="regional-photo ${state.viewedSceneIds.includes(scene.id) ? 'is-viewed' : ''}" data-scene="${scene.id}"><img src="${imageFor(model, scene.assetId)}" alt=""><strong>${esc(scene.title)}</strong></button>`).join('') : `<p>이 ${esc(model.areaLabel)}과 연결된 장면을 준비하고 있어.</p>`}</div>` : `<span class="chip">위치부터 살펴보기</span><h2>${model.areaLabel}을 골라 봐</h2><p>지도에서 눌러도 되고, 아래 목록에서 골라도 돼.</p><div class="regional-area-picks">${model.areas.map((item) => `<button type="button" class="btn btn-ghost regional-area-pick" data-area="${item.id}">${state.visitedAreaIds.includes(item.id) ? '✓ ' : ''}${esc(item.name)}<span>${esc(item.short)}</span></button>`).join('')}</div><button type="button" class="btn btn-ghost regional-info" data-map-info>이 지도는 어떤 그림이야?</button>`}
          </aside>
        </section>`;
        body.querySelectorAll<HTMLElement>('[data-area]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.area!; state.activeAreaId = id; state.activeExampleId = model.examples.find((item) => item.areaId === id)?.id ?? null; persist(); render(); }));
        body.querySelector<HTMLElement>('[data-country-shortcut]')?.addEventListener('click', () => { if (!koreaShortcut) return; state.activeAreaId = koreaShortcut.areaId; state.activeExampleId = koreaShortcut.id; persist(); render(); });
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
      };

      const renderConnections = () => {
        const usesOceaniaInteractions = model.id === 'oceania' || model.id === 'asia' || model.id === 'europe';
        // 완료 조건을 스크롤 밖(맨 아래)에 두지 않는다 — 항상 보이는 상단 고정 진행 띠로 안내한다.
        const goalChip = (label: string, got: number, need: number) =>
          `<span class="regional-progress-goal ${got >= need ? 'is-done' : ''}">${label} <b>${Math.min(got, need)}/${need}</b></span>`;
        // 오세아니아: 선택할 때마다 바다 지킴 게이지가 차오른다(P2-15 라이트)
        const gaugePercent = Math.round(Math.min(1, state.discoveredSignalIds.length / model.requirements.minSignals) * 40
          + Math.min(1, state.listenedPerspectiveIds.length / 2) * 30
          + Math.min(1, state.selectedActionIds.length / 3) * 30);
        const gaugeLabel = model.id === 'oceania' ? '바다 지킴' : '지구 잇기';
        const gauge = usesOceaniaInteractions
          ? `<span class="regional-gauge" role="img" aria-label="${gaugeLabel} 게이지 ${gaugePercent}%"><strong>${gaugeLabel}</strong><span class="bar"><i style="--fill:${gaugePercent}%"></i></span><b>${gaugePercent}%</b></span>`
          : '';
        // 여러 카드가 같은 설명을 쓸 때는 영역 안내에 한 번만 두고 카드에서는 반복하지 않는다.
        const actionDetailCounts = new Map<string, number>();
        model.actions.forEach((item) => actionDetailCounts.set(item.detail, (actionDetailCounts.get(item.detail) ?? 0) + 1));
        const perspectiveCards = model.perspectives.map((item) => {
          const heard = state.heardPerspectiveIds.includes(item.id);
          const listened = state.listenedPerspectiveIds.includes(item.id);
          if (!usesOceaniaInteractions) {
            return `<button class="card card-pick regional-choice${heard ? '' : ' is-unheard'}" data-voice="${item.id}" aria-pressed="${listened}" aria-label="목소리 듣기: ${esc(item.name)} ${esc(item.role)}${listened ? ', 들음' : heard ? ', 들어 봄' : ', 아직 못 들음'}"><img src="${imageFor(model, item.assetId)}" alt=""><span><strong>${esc(item.name)} · ${esc(item.role)}</strong><br>${esc(item.line)}</span>${heard ? '' : '<i class="regional-voice-dots" aria-hidden="true">…</i>'}</button>`;
          }
          const flipped = flippedVoiceIds.has(item.id);
          return `<button class="card card-pick regional-choice${heard ? '' : ' is-unheard'}${flipped ? ' is-flipped' : ''}" data-voice="${item.id}" aria-pressed="${listened}" aria-expanded="${flipped}" aria-label="${esc(item.name)} ${esc(item.role)}, ${flipped ? '앞면 보기' : '대화 보기'}">
            <span class="regional-choice-inner">
              <span class="regional-choice-face regional-choice-front" aria-hidden="${flipped}">
                <img src="${imageFor(model, item.assetId)}" alt="">
                <span class="regional-choice-identity"><strong>${esc(item.name)}</strong><span>${esc(item.role)}</span></span>
              </span>
              <span class="regional-choice-face regional-choice-back" aria-hidden="${!flipped}"><span class="regional-choice-line">“${esc(item.line)}”</span></span>
            </span>
            ${heard ? '' : '<i class="regional-voice-dots" aria-hidden="true">…</i>'}
          </button>`;
        }).join('');
        const repeatedActionDetails = [...actionDetailCounts.entries()].filter(([, count]) => count > 1).map(([detail]) => detail);
        const actionGuide = ['나·학교와 지역사회·정부와 기업·여러 나라의 행동 중 세 가지 이상을 골라.', ...repeatedActionDetails].join(' ');
        const actionChoice = (item: Action) => {
          const selected = state.selectedActionIds.includes(item.id);
          return `<button type="button" class="regional-note-item" data-action="${item.id}" aria-pressed="${selected}" aria-label="${esc(item.label)}${selected ? ', 체크함' : ', 체크하지 않음'}"><span class="regional-check-box" aria-hidden="true">✓</span><span class="regional-note-copy">${esc(item.label)}</span></button>`;
        };
        const actionPanel = usesOceaniaInteractions
          ? `<div class="regional-action-notebook" aria-label="나, 우리가 할 수 있는 일 체크리스트">
              <section class="regional-note-group"><div class="regional-note-list">${model.actions.filter((item) => item.tier === 'self' && item.id !== 'action_observe').map(actionChoice).join('')}</div></section>
              <section class="regional-note-group is-together"><div class="regional-note-list">${model.actions.filter((item) => item.tier !== 'self' || item.id === 'action_observe').map(actionChoice).join('')}</div></section>
            </div>`
          : `<div class="regional-action-grid">${model.actions.map((item) => { const repeated = (actionDetailCounts.get(item.detail) ?? 0) > 1; return `<button class="card card-pick regional-action" data-action="${item.id}" aria-pressed="${state.selectedActionIds.includes(item.id)}" aria-label="행동 고르기: ${esc(item.label)}${state.selectedActionIds.includes(item.id) ? ', 고름' : ''}"><strong>${esc(item.label)}</strong>${repeated ? '' : `<br><small>${esc(item.detail)}</small>`}</button>`; }).join('')}</div>`;
        const progressGoals = usesOceaniaInteractions ? '' : `
          ${goalChip('환경 신호', state.discoveredSignalIds.length, model.requirements.minSignals)}
          ${goalChip('친구 목소리', state.listenedPerspectiveIds.length, 2)}
          ${goalChip('행동 고르기', state.selectedActionIds.length, 3)}
          ${goalChip('서로 다른 주체', chosenTierCount(), 2)}`;
        const progressStrip = `<div class="regional-progress-strip${usesOceaniaInteractions ? ' is-gauge-only' : ''}" role="status" aria-label="환경 연결 완료 조건 진행">${progressGoals}${gauge}</div>`;
        body.innerHTML = `<section class="regional-shell"><div class="regional-connections">${progressStrip}<div class="regional-connection-layout">
          <section class="regional-section"><span class="chip">${model.id === 'asia' ? '1. 아시아의 환경문제' : model.id === 'europe' ? '1. 유럽의 환경문제' : '1. 바다·물·기후의 연결'}</span><h2>${model.id === 'oceania' ? '멀리 떨어진 지역도 이어져 있어' : '무엇이 달라지고, 어떤 어려움이 생길까?'}</h2><p>${model.id === 'oceania' ? '신호를 눌러 그림의 변화를 비교해 봐.' : '그림을 밀어 원인과 영향을 이어 봐.'}</p><div class="regional-signal-grid">${model.signals.map((item) => `<button class="card card-pick regional-signal" data-signal="${item.id}" aria-pressed="${state.discoveredSignalIds.includes(item.id)}" aria-label="환경 신호: ${esc(item.title)}${state.discoveredSignalIds.includes(item.id) ? ', 기록함' : ''}"><strong>${esc(item.title)}</strong>${usesOceaniaInteractions ? '' : `<br><span>${esc(item.connection.split(' · ')[0] ?? '')}</span>`}</button>`).join('')}</div></section>
          <section class="regional-section"><span class="chip">2. 지역의 목소리</span><h2>서로 다른 목소리를 들어 봐</h2><p>친구들의 생각을 눌러 비교해 봐.</p><div class="regional-choice-grid">${perspectiveCards}</div>${(() => { const unheard = model.perspectives.length - state.heardPerspectiveIds.length; return unheard > 0 ? `<p class="regional-discovery">아직 못 들은 목소리가 ${unheard}개 있어 — 완료 뒤에도 언제든 다시 와서 들을 수 있어.</p>` : ''; })()}</section>
          <section class="regional-section"><span class="chip">${usesOceaniaInteractions ? '3. 함께할 일' : '3. 책임을 나누는 행동'}</span><h2>${usesOceaniaInteractions ? '나, 우리가 할 수 있는 일' : '서로 다른 크기의 행동을 함께 골라 봐'}</h2><p>${usesOceaniaInteractions ? '할 수 있는 일에 자유롭게 체크해 봐.' : esc(actionGuide)}</p>${actionPanel}</section>
        </div></div></section>`;
        body.querySelectorAll<HTMLElement>('[data-signal]').forEach((button) => button.addEventListener('click', () => { const signal = model.signals.find((item) => item.id === button.dataset.signal); if (signal) openSignal(signal); }));
        body.querySelectorAll<HTMLElement>('[data-voice]').forEach((button) => button.addEventListener('click', () => {
          const id = button.dataset.voice!;
          if (model.id === 'oceania' || model.id === 'asia' || model.id === 'europe') {
            const reveal = !flippedVoiceIds.has(id);
            if (reveal) flippedVoiceIds.add(id); else flippedVoiceIds.delete(id);
            button.classList.toggle('is-flipped', reveal);
            button.setAttribute('aria-expanded', String(reveal));
            const voice = model.perspectives.find((item) => item.id === id);
            button.setAttribute('aria-label', `${voice?.name ?? ''} ${voice?.role ?? ''}, ${reveal ? '앞면 보기' : '대화 보기'}`);
            button.querySelector<HTMLElement>('.regional-choice-front')?.setAttribute('aria-hidden', String(reveal));
            button.querySelector<HTMLElement>('.regional-choice-back')?.setAttribute('aria-hidden', String(!reveal));
            if (reveal) {
              add(state.heardPerspectiveIds, id);
              if (!state.listenedPerspectiveIds.includes(id)) {
                if (state.listenedPerspectiveIds.length >= 2) state.listenedPerspectiveIds.shift();
                state.listenedPerspectiveIds.push(id);
              }
              persist();
            }
            if (voiceRenderTimer !== null) window.clearTimeout(voiceRenderTimer);
            voiceRenderTimer = window.setTimeout(() => { voiceRenderTimer = null; if (!disposed) render(); }, 460);
            return;
          }
          add(state.heardPerspectiveIds, id);
          if (state.listenedPerspectiveIds.includes(id)) state.listenedPerspectiveIds = state.listenedPerspectiveIds.filter((item) => item !== id);
          else { if (state.listenedPerspectiveIds.length >= 2) state.listenedPerspectiveIds.shift(); state.listenedPerspectiveIds.push(id); }
          persist();
          render();
        }));
        body.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.action!; state.selectedActionIds = state.selectedActionIds.includes(id) ? state.selectedActionIds.filter((item) => item !== id) : [...state.selectedActionIds, id]; persist(); render(); }));
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
      if (voiceRenderTimer !== null) window.clearTimeout(voiceRenderTimer);
      voiceRenderTimer = null;
    }
  };
}

export function createAsiaPage(): Page {
  return createRegionalPage(async () => asiaModel(await loadContent<AsiaSource>('asia')));
}

export function createOceaniaPage(): Page {
  return createRegionalPage(async () => oceaniaModel(await loadContent<OceaniaSource>('oceania')));
}

export function createEuropePage(): Page {
  return createRegionalPage(async () => europeModel(await loadContent<EuropeSource>('europe')));
}
