/**
 * 최종 단계 "하나의 지구, 여섯 개의 신호" — 장면 렌더러.
 * 신호 클릭 → 지도에서 다시 확인 → 문제 살펴보기 → 친구 약속 읽기 → 내 약속 → 완료 연출.
 * 상태·판정은 core/earthCouncil.ts, 저장은 host.save()가 맡는다.
 */
import { assetUrl, hasAsset } from '../core/assets';
import { reducedMotion } from '../ui/fx';
import { escapeHtml } from '../ui/escape';
import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import {
  buildPledge, canOpenCouncil, canRunSimulation, MIN_CONNECTIONS,
  MIN_SIGNALS_TO_CONNECT, personalActionIssue, simulate,
  type ActionTierId, type EarthContent, type EarthFriend, type EnvironmentalSignal,
  type GlobalEnvironmentProgress, type Level
} from '../core/earthCouncil';
import { burstConfetti, popBounce } from '../ui/fx';
import type { GuideController, GuideSpeaker } from '../ui/guide';
import { showFeedback } from '../ui/feedback';
import { keepFitted } from '../ui/fitText';
import { collectedEarthSignals, continentLabel } from '../core/earthSignals';

export interface EarthSceneHost {
  body: HTMLElement;
  bottom: HTMLElement;
  guide: GuideController | null;
  speaker: GuideSpeaker;
  content: EarthContent;
  progress: GlobalEnvironmentProgress;
  /** 진행 스냅샷 저장 */
  save(): void;
  /** 공동약속 완성 뒤 한 번만 호출 — 기존 도장·점수 흐름으로 이어진다 */
  onFinish(): void;
  isDisposed(): boolean;
}

export function earthPreloadIds(content: EarthContent): string[] {
  return [
    'bg.map', 'bg.spare', 'earth.signal.map', 'earth.council.globe', 'earth.council.finale',
    'prop.globe3d', 'prop.globe', 'reward.globe_puzzle',
    ...content.friends.map((f) => f.imageId),
    ...content.signals.map((s) => signalImageId(content, s)),
    ...content.signals.flatMap((s) => s.hotspots.map((h) => h.zoomAssetId ?? '')),
    ...content.issues.map((issue) => issue.imageAssetId ?? '').filter(hasAsset)
  ].filter(hasAsset);
}

const CONTINENT_BG: Record<string, string> = {
  아시아: 'bg.asia', 아프리카: 'bg.africa', 오세아니아: 'bg.oceania', 남아메리카: 'bg.americas', 유럽: 'bg.europe'
};
/** 현장 사진이 아직 없으면 같은 대륙 배경으로 대체한다 (docs/GLOBAL_ENVIRONMENT_ASSET_PROMPTS.md). */
export function signalImageId(content: EarthContent, s: EnvironmentalSignal): string {
  if (hasAsset(s.imageAssetId)) return s.imageAssetId;
  const friend = content.friends.find((f) => f.id === s.friendId);
  return CONTINENT_BG[friend?.continent ?? ''] ?? 'bg.map';
}

const esc = escapeHtml;

/** 음성 대신 화면에서 한 글자씩 보여 주는 짧은 안내. */
function typeText(target: HTMLElement, text: string, speed = 24): void {
  const runId = `${Date.now()}-${Math.random()}`;
  target.dataset.typeRun = runId;
  target.setAttribute('aria-label', text);
  const reduced = reducedMotion();
  if (reduced || !text) { target.textContent = text; return; }
  target.textContent = '';
  let index = 0;
  const tick = () => {
    if (!target.isConnected || target.dataset.typeRun !== runId) return;
    index += 1;
    target.textContent = text.slice(0, index);
    if (index < text.length) window.setTimeout(tick, speed);
  };
  tick();
}

const ICONS: Record<string, string> = {
  bottle: '<path d="M9 2h6v3l1.5 2v13a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V7L9 5z"/><path d="M8 11h8"/>',
  plug: '<path d="M9 2v5M15 2v5M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hands: '<path d="M3 13l4-4 3 3 4-4 3 3 4-4"/><path d="M3 13v6h18v-8"/>',
  tree: '<path d="M12 2l6 8h-4l5 6H5l5-6H6z"/><path d="M12 16v6"/>',
  leaf: '<path d="M4 20C6 8 14 4 21 4c0 8-4 15-13 16-2 0-3-1-4 0z"/><path d="M4 20l9-9"/>',
  scroll: '<path d="M6 3h12v14H8a2 2 0 0 0-2 2z"/><path d="M6 19a2 2 0 0 0 2 2h12"/><path d="M10 8h5M10 12h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/>',
  wave: '<path d="M2 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 14h14a3 3 0 1 1-3 3"/><path d="M3 11h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  paw: '<circle cx="8" cy="7" r="2"/><circle cx="16" cy="7" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M12 11c-3 0-6 3-6 6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3c0-3-3-6-6-6z"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  camera: '<path d="M4 8h4l2-3h4l2 3h4v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  check: '<path d="M5 12l4 4 10-10"/>'
};
export const icon = (key: string, size = 26): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key] ?? ICONS.globe}</svg>`;

export const EARTH_CSS = `
.ec { flex:1;min-height:0;width:min(1560px,100%);margin:0 auto;display:flex;flex-direction:column;gap:var(--sp-2); }
.ec-head { display:flex;justify-content:center;flex-shrink:0; }
.ec-head .ribbon-sub { display:block;text-align:center; }
.ec-note { font-size:max(18px,var(--fs-small));color:#f3f7ff;text-shadow:0 1px 6px rgba(0,0,0,.6);text-align:center;font-weight:700;margin:0; }
.ec-copy { font-size:max(20px,var(--fs-body));line-height:1.5;font-weight:700; }
.ec-sub { font-size:max(22px,var(--fs-body));line-height:1.45;font-weight:800;color:var(--c-ink);min-height:2.9em; }
.ec-btn-icon { display:inline-flex;align-items:center;gap:8px; }
.ec-visually-hidden { position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap; }

/* 친구 띠 */
.ec-friends { display:flex;gap:8px;justify-content:center;flex-wrap:wrap;flex-shrink:0; }
.ec-friend { position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:var(--hotspot-min);padding:4px 8px;border:2px solid rgba(255,255,255,.75);border-radius:16px;background:rgba(255,252,240,.8);font:800 max(16px,var(--fs-small))/1.1 var(--font-body);color:var(--c-ink);cursor:pointer; }
.ec-friend img { width:clamp(44px,4.6vw,66px);height:clamp(44px,4.6vw,66px);object-fit:contain; }
.ec-friend[aria-pressed="true"] { border-color:var(--c-violet);box-shadow:0 0 0 3px rgba(108,76,232,.25); }
.ec-friend .ec-mark { position:absolute;top:-6px;right:-6px;width:26px;height:26px;border-radius:50%;background:var(--c-success);color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff; }
.ec-friend .ec-mark.is-new { background:var(--c-coral);animation:ec-ping 1.1s ease-out infinite; }
@keyframes ec-ping { 0%{box-shadow:0 0 0 0 rgba(242,109,109,.6)} 100%{box-shadow:0 0 0 14px rgba(242,109,109,0)} }

/* 장면 1 — 사진: 그림을 크게 보고, 설명은 클릭 뒤 바로 아래에서 읽는다. */
.ec-photo-row { flex:1;min-height:0;display:grid;grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto;gap:10px; }
.ec-photo { position:relative;min-height:160px;height:100%;border-radius:var(--radius-l);overflow:hidden;background:#0d2238;box-shadow:var(--shadow-pop);cursor:crosshair;touch-action:manipulation; }
.ec-photo img { width:100%;height:100%;object-fit:cover;display:block; }
.ec-spot { position:absolute;transform:translate(-50%,-50%);width:max(64px,6vw);height:max(64px,6vw);border-radius:50%;border:0;background:transparent;cursor:pointer;padding:0; }
.ec-spot:focus-visible { outline:4px solid var(--c-gold);outline-offset:2px; }
.ec-spot.is-hint::after { content:'';position:absolute;inset:5px;border-radius:50%;border:5px solid #fff;box-shadow:0 0 0 5px rgba(255,203,70,.72),0 0 26px 12px rgba(255,244,156,.82);animation:ec-click-glow 1.15s ease-in-out infinite; }
.ec-spot.is-hint::before { content:'✦';position:absolute;right:-2px;top:-12px;color:#fff3a8;font-size:28px;filter:drop-shadow(0 0 6px #fff);animation:ec-spark 900ms ease-in-out infinite alternate; }
.ec-spot.is-found { cursor:default; }
.ec-spot.is-found::before { content:'✓';position:absolute;inset:0;border-radius:50%;border:5px solid var(--c-gold);background:rgba(20,99,78,.25);box-shadow:0 0 0 4px rgba(0,0,0,.28),inset 0 0 0 3px rgba(255,255,255,.6);display:grid;place-items:center;color:#fff;font:900 30px/1 var(--font-body);text-shadow:0 2px 5px rgba(0,0,0,.6); }
@keyframes ec-click-glow { 0%,100%{transform:scale(.9);opacity:.72} 50%{transform:scale(1.12);opacity:1} }
@keyframes ec-spark { to{transform:scale(1.35) rotate(18deg);opacity:.65} }
.ec-lens { position:absolute;width:min(34%,260px);aspect-ratio:1;border-radius:50%;border:6px solid #fff;box-shadow:var(--shadow-pop);background-repeat:no-repeat;pointer-events:none;right:3%;top:5%;transition:opacity 220ms; }
.ec-ripple { position:absolute;width:40px;height:40px;border-radius:50%;border:3px solid #fff;transform:translate(-50%,-50%);pointer-events:none;animation:ec-ripple .5s ease-out forwards; }
@keyframes ec-ripple { to { transform:translate(-50%,-50%) scale(2.4);opacity:0; } }
.ec-photo-side { min-height:72px;display:flex;align-items:center;justify-content:center;padding:10px 18px;text-align:center;overflow:hidden; }
.ec-photo-side .ec-portrait { width:clamp(96px,10vw,150px);height:clamp(96px,10vw,150px);object-fit:contain;align-self:center; }
.ec-click-copy { margin:0;min-height:1.5em;font:900 clamp(18px,1.35vw,24px)/1.4 var(--font-body);color:var(--c-ink);word-break:keep-all; }
.ec-scope { font-size:max(16px,var(--fs-small));color:var(--c-ink-soft);font-weight:700;line-height:1.35; }
.ec-progress { display:inline-flex;gap:6px;align-items:center;justify-content:center;font:900 max(20px,var(--fs-body)) var(--font-head);color:var(--c-violet-ink); }

/* 장면 2 — 지도 연결: 지도의 반짝이는 신호만 누르는 단순한 흐름. */
.ec-connect { flex:1;min-height:0;display:grid;grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto;gap:10px; }
.ec-map { position:relative;min-height:160px;height:100%;border-radius:var(--radius-l);overflow:hidden;background:#69b9dc center/100% 100% no-repeat;box-shadow:var(--shadow-pop); }
.ec-map svg.ec-flows { position:absolute;inset:0;width:100%;height:100%;pointer-events:none; }
.ec-flow { fill:none;stroke-width:6;stroke-linecap:round;stroke:rgba(255,255,255,.95);stroke-dasharray:14 14;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45));animation:ec-dash 1.6s linear infinite; }
.ec-flow[data-lens="ocean"] { stroke:#7fe3ff; } .ec-flow[data-lens="air"] { stroke:#e6f4ff;stroke-dasharray:4 16; }
.ec-flow[data-lens="climate"] { stroke:#ffd46b; } .ec-flow[data-lens="ecosystem"] { stroke:#9ff59b; } .ec-flow[data-lens="resource"] { stroke:#ffb3a1; }
@keyframes ec-dash { to { stroke-dashoffset:-56; } }
.ec-pin { position:absolute;transform:translate(-50%,-50%);width:clamp(62px,6vw,92px);height:clamp(62px,6vw,92px);min-width:var(--hotspot-min);border-radius:50%;border:5px solid #fff;background:rgba(255,224,83,.14);padding:0;cursor:pointer;box-shadow:0 0 0 6px rgba(255,195,45,.68),0 0 28px 12px rgba(255,247,166,.9),var(--shadow-pop);animation:ec-map-pulse 1.2s ease-in-out infinite; }
.ec-pin::after { content:'✦';position:absolute;right:-8px;top:-18px;color:#fff7bd;font-size:32px;filter:drop-shadow(0 0 7px #fff);animation:ec-spark 800ms ease-in-out infinite alternate; }
.ec-pin:hover,.ec-pin:focus-visible { transform:translate(-50%,-50%) scale(1.12); }
.ec-pin.is-found { animation:none;border-color:#ffe06c;background:rgba(31,143,98,.36);box-shadow:0 0 0 5px rgba(255,224,108,.5),var(--shadow-pop); }
.ec-pin.is-found::before { content:'✓';position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:900 30px/1 var(--font-body);text-shadow:0 2px 5px rgba(0,0,0,.65); }
.ec-pin.is-found::after { display:none; }
@keyframes ec-map-pulse { 0%,100%{box-shadow:0 0 0 3px rgba(255,195,45,.55),0 0 18px 7px rgba(255,247,166,.65),var(--shadow-pop)} 50%{box-shadow:0 0 0 9px rgba(255,195,45,.78),0 0 34px 16px rgba(255,247,166,.95),var(--shadow-pop)} }
.ec-map-copy { min-height:72px;padding:10px 18px;border:3px solid rgba(255,255,255,.9);border-radius:var(--radius-l);background:rgba(255,252,240,.96);box-shadow:var(--shadow-card);display:flex;align-items:center;justify-content:center;text-align:center; }
.ec-side {align-self:start;max-height:100%;overflow:auto; min-height:0;display:flex;flex-direction:column;gap:var(--sp-2);overflow-y:auto; }
.ec-lenses { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px; }
.ec-lens-btn { display:flex;flex-direction:column;align-items:center;gap:4px;min-height:64px;padding:6px 4px;border-radius:var(--radius-m);border:2px solid var(--c-line);background:#fff;font:800 max(16px,var(--fs-small))/1.1 var(--font-body);color:var(--c-ink);cursor:pointer; }
.ec-lens-btn[aria-pressed="true"] { border-color:var(--c-violet);background:#f1ecff;box-shadow:0 0 0 3px rgba(108,76,232,.25); }
.ec-lens-btn.is-done::after { content:'✓';font-weight:900;color:var(--c-success-ink); }
.ec-lens-btn:disabled { opacity:.5;cursor:not-allowed; }
.ec-reasons { display:flex;flex-direction:column;gap:6px; }
.ec-reason { text-align:left;font-size:max(18px,var(--fs-small));line-height:1.35;min-height:52px;padding:8px 12px; }

/* 장면 3 — 네 환경문제를 차례로 지구본에 잇기 */
.ec-orbit { position:relative;flex:1;min-height:0;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.18fr) minmax(210px,.62fr) minmax(0,1.18fr);gap:clamp(10px,1.2vw,18px);align-items:stretch; }
.ec-globe-wrap { position:relative;z-index:2;display:flex;align-items:center;justify-content:center;min-width:0; }
.ec-orbit .ec-globe { width:min(34vh,340px);max-width:100%;filter:drop-shadow(0 16px 30px rgba(0,0,0,.45));animation:ec-float 4s ease-in-out infinite;transition:filter 300ms,transform 300ms; }
.ec-orbit .ec-globe.is-receiving { animation:ec-globe-receive 720ms cubic-bezier(.2,.8,.25,1);filter:drop-shadow(0 0 34px rgba(92,224,255,.95)); }
.ec-globe-count { position:absolute;left:50%;bottom:15%;transform:translateX(-50%);z-index:3;min-width:94px;padding:7px 14px;border:2px solid #fff;border-radius:999px;background:rgba(9,39,70,.9);color:#fff;text-align:center;font:900 clamp(15px,1vw,19px)/1 var(--font-body);box-shadow:var(--shadow-pop);white-space:nowrap; }
@keyframes ec-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
@keyframes ec-globe-receive { 0%{transform:scale(1)} 45%{transform:scale(1.17) rotate(5deg)} 100%{transform:scale(1)} }
.ec-issues { display:grid;grid-auto-rows:minmax(0,1fr);gap:clamp(8px,1vh,12px);min-height:0;overflow:hidden; }
.ec-issues:has(> .ec-issue:only-child) { align-items:center; }
.ec-issue { position:relative;z-index:2;height:100%;min-height:0;display:block;padding:0;overflow:hidden;text-align:left;border-radius:var(--radius-l);border:3px solid rgba(255,255,255,.92);background:#0b2946;box-shadow:0 9px 24px rgba(0,0,0,.3); }
.ec-issues > .ec-issue:only-child { height:min(280px,76%);min-height:190px; }
.ec-issue::after { content:'';position:absolute;inset:38% 0 0;background:linear-gradient(180deg,transparent,rgba(2,14,29,.88));pointer-events:none; }
.ec-issue img { width:100%;height:100%;min-height:0;object-fit:cover;display:block;transition:transform 450ms ease,filter 300ms; }
.ec-issue:hover img,.ec-issue:focus-visible img { transform:scale(1.045); }
.ec-issue-title { position:absolute;z-index:2;left:clamp(14px,1.4vw,24px);right:14px;bottom:clamp(14px,2vh,24px);font:900 clamp(23px,1.7vw,34px)/1.12 var(--font-head);color:#fff;letter-spacing:-.02em;-webkit-text-stroke:clamp(1px,.08vw,2px) rgba(4,25,49,.92);paint-order:stroke fill;text-shadow:0 3px 8px #00152d,0 0 4px #00152d;word-break:keep-all; }
.ec-issue-check { position:absolute;z-index:3;right:12px;top:12px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(9,45,76,.82);border:2px solid #fff;color:#fff;opacity:0;transform:scale(.55);transition:opacity 240ms,transform 320ms; }
.ec-issue.is-inspected { border-color:#79f0bd;box-shadow:0 0 0 4px rgba(34,190,132,.35),0 10px 28px rgba(0,0,0,.32); }
.ec-issue.is-inspected .ec-issue-check { opacity:1;transform:scale(1); }
.ec-orbit-lines { position:absolute;inset:0;z-index:1;width:100%;height:100%;pointer-events:none;overflow:visible; }
.ec-orbit-line { stroke:#65e5ff;stroke-width:4;stroke-linecap:round;stroke-dasharray:12 10;filter:drop-shadow(0 0 6px rgba(65,218,255,.95));animation:ec-line-draw 760ms ease-out both; }
@keyframes ec-line-draw { from{stroke-dashoffset:220;opacity:0} to{stroke-dashoffset:0;opacity:.9} }
.ec-flight-copy { position:fixed;z-index:calc(var(--z-modal) - 1);border-radius:18px;overflow:hidden;border:4px solid #fff;box-shadow:0 16px 38px rgba(0,0,0,.48);pointer-events:none;will-change:transform,opacity; }
.ec-flight-copy img { width:100%;height:100%;object-fit:cover;display:block; }

/* 장면 4 — 원탁 */
.ec-table { position:relative;flex:1;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:var(--sp-2); }
/* 지구회의 장면은 정보가 많다 — 본문·가이드·버튼이 한 화면 안에서 끝나게 한다. */
.dialogue-scene:has(.ec) { --guide-lane-h:clamp(56px,7vh,72px);--bottom-bar-h:clamp(64px,8vh,76px); }
.dialogue-scene:has(.ec) .page-body { padding:clamp(8px,1.2vh,14px) clamp(14px,2.5vw,40px) 4px;overflow:hidden; }
/* 문제 선택 안내는 화면 안에 이미 있으므로 캐릭터가 카드를 가리지 않게 한다. */
.dialogue-scene:has(.ec-issue-screen) { --guide-lane-h:0px; }
.dialogue-scene:has(.ec-issue-screen) > .guide-wrap { display:none; }
.dialogue-scene:has(.ec-council-screen) { --guide-lane-h:0px; }
.dialogue-scene:has(.ec-council-screen) > .guide-wrap { display:none; }
.ec-head-compact { display:flex;align-items:baseline;justify-content:center;gap:12px;padding:2px 0; }
.ec-head-compact strong { font:900 clamp(21px,1.9vw,28px) var(--font-head);color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.65); }
.ec-head-compact span { font:800 max(15px,var(--fs-small)) var(--font-body);color:#ffe9a8;text-shadow:0 1px 6px rgba(0,0,0,.6); }
.ec-seats { position:relative;min-height:0;display:flex;justify-content:center;align-items:flex-end;gap:clamp(4px,1.2vw,22px);padding:0 12px; }
.ec-seat { position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:transparent;padding:4px;cursor:pointer;min-width:var(--hotspot-min); }
.ec-seat img { width:clamp(60px,8.5vh,120px);height:clamp(60px,8.5vh,120px);object-fit:contain;transition:transform 260ms,filter 260ms;filter:drop-shadow(0 8px 14px rgba(0,0,0,.45)); }
.ec-seat .ec-seat-name { background:rgba(255,252,240,.95);border-radius:999px;padding:2px 10px;font:800 max(15px,calc(var(--fs-small) - 2px))/1.2 var(--font-body);box-shadow:var(--shadow-card); }
.ec-seat.is-active img { transform:scale(1.1); }
.ec-seat.is-heard .ec-seat-name::before { content:'✓ ';color:var(--c-success-ink); }
.ec-seat:not(.is-active):not(.is-heard) img { filter:drop-shadow(0 8px 14px rgba(0,0,0,.45)) saturate(.7); }
.ec-bubble { position:relative;background:linear-gradient(180deg,#fff,#f4efff);border:3px solid var(--c-violet);border-radius:var(--radius-l);padding:8px 14px;box-shadow:var(--shadow-pop);display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center; }
.ec-bubble .ec-p-icon { width:44px;height:44px;border-radius:50%;background:var(--c-violet);color:#fff;display:flex;align-items:center;justify-content:center; }
.ec-choices { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px; }
.ec-choice { min-height:56px;font-size:max(18px,var(--fs-small));font-weight:800;padding:8px 10px; }
.ec-choice.is-wrong { opacity:.55; }
.ec-pick2 { display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px; }
.ec-input { width:100%;min-height:56px;font:700 max(18px,var(--fs-small))/1.4 var(--font-body);padding:10px 12px;border:2px solid var(--c-line);border-radius:var(--radius-m);resize:none; }
.ec-input:focus-visible { outline:3px solid var(--c-gold);outline-offset:2px; }

/* 새 공동회의 — 여섯 친구가 한 원을 만들고 문제·해결책·약속을 차례로 말한다. */
.ec.ec-council-screen { padding:0;border:0;box-shadow:none;background:transparent;overflow:hidden; } /* 남색 테두리 창이 겹쳐 보이던 문제 — 무대 하나만 남긴다 */
.ec-council-stage { position:relative;flex:1;min-height:0;overflow:hidden;border-radius:var(--radius-l);background:transparent; }
.ec-council-world { position:absolute;left:50%;top:50%;width:min(26vh,260px);transform:translate(-50%,-50%);filter:drop-shadow(0 12px 28px rgba(56,206,246,.5));opacity:.55;animation:ec-float 4s ease-in-out infinite; }
.ec-council-friend { position:absolute;z-index:3;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;padding:0;border:0;background:transparent;pointer-events:none;animation:ec-friend-arrive 620ms cubic-bezier(.2,.8,.3,1) both; }
/* 캐릭터는 예전의 2배 — 여섯 자리를 육각형으로 벌려 서로 겹치지 않게 */
.ec-council-friend img { width:auto;height:clamp(116px,19vh,220px);max-width:clamp(120px,12vw,220px);object-fit:contain;filter:drop-shadow(0 10px 16px rgba(0,0,0,.55));transition:transform 320ms,filter 320ms; }
.ec-council-friend span { padding:3px 12px;border-radius:999px;background:rgba(255,253,244,.94);font:900 clamp(15px,1.05vw,20px)/1.15 var(--font-body);color:var(--c-navy);box-shadow:var(--shadow-card);white-space:nowrap; }
.ec-council-friend.is-speaking img { transform:scale(1.08) translateY(-6px);filter:drop-shadow(0 0 18px rgba(255,223,92,.95)); }
.ec-council-friend.is-speaking span { background:#fff0a8; }
.ec-council-friend:not(.is-speaking) img { filter:drop-shadow(0 10px 16px rgba(0,0,0,.55)) saturate(.85); }
@keyframes ec-friend-arrive { from{opacity:0;transform:translate(-50%,-50%) scale(.55)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
/* 말풍선은 말하는 친구 바로 옆(안쪽)에 뜨고 꼬리가 그 친구를 가리킨다 */
.ec-council-core { position:absolute;z-index:4;left:50%;top:50%;width:min(560px,36%);transform:translate(-50%,-50%);transition:left 360ms cubic-bezier(.2,.8,.3,1),top 360ms cubic-bezier(.2,.8,.3,1); }
.ec-council-core.is-player { width:min(640px,38%); }
.ec-council-bubble { position:relative;padding:clamp(14px,2vh,22px) clamp(18px,2vw,28px);border:2px solid rgba(255,255,255,.85);border-radius:26px;background:rgba(255,255,255,.72);backdrop-filter:blur(12px) saturate(1.1);box-shadow:0 14px 34px rgba(0,0,0,.28);text-align:center;animation:ec-bubble-in 430ms cubic-bezier(.2,.85,.25,1); }
.ec-council-bubble::after { content:'';position:absolute;width:26px;height:26px;background:rgba(255,255,255,.78);backdrop-filter:blur(12px);border:2px solid rgba(255,255,255,.85);border-top:0;border-left:0;transform:rotate(45deg); }
.ec-council-core[data-dir="left"] .ec-council-bubble::after { left:-15px;top:50%;transform:translateY(-50%) rotate(135deg); }
.ec-council-core[data-dir="right"] .ec-council-bubble::after { right:-15px;top:50%;transform:translateY(-50%) rotate(-45deg); }
.ec-council-core[data-dir="top"] .ec-council-bubble::after { top:-15px;left:50%;transform:translateX(-50%) rotate(-135deg); }
.ec-council-core[data-dir="bottom"] .ec-council-bubble::after,.ec-council-core:not([data-dir]) .ec-council-bubble::after { bottom:-15px;left:50%;transform:translateX(-50%) rotate(45deg); }
.ec-council-bubble h2 { margin:5px 0 7px;font:900 clamp(20px,1.65vw,30px)/1.15 var(--font-head);color:var(--c-navy); }
.ec-council-bubble p { margin:0;font:800 clamp(17px,1.25vw,23px)/1.42 var(--font-body);color:var(--c-ink);word-break:keep-all; }
.ec-council-phase { display:inline-flex;padding:4px 14px;border-radius:999px;background:#e8efff;color:#274f8c;font:900 clamp(14px,1vw,18px)/1.15 var(--font-body); }
.ec-council-phase[data-phase="해결책"] { background:#dcf8e9;color:#17653f; }
.ec-council-phase[data-phase="약속"] { background:#fff1b8;color:#775000; }
@keyframes ec-bubble-in { from{opacity:0;transform:translateY(18px) scale(.92)} to{opacity:1;transform:translateY(0) scale(1)} }
.ec-council-dots { position:absolute;z-index:5;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:8px; }
.ec-council-dot { width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.8); }
.ec-council-dot.is-on { background:var(--c-gold);box-shadow:0 0 10px rgba(255,213,70,.9); }
.ec-player-bubble { text-align:left; }
.ec-player-bubble label { display:block;margin-bottom:8px;font:900 clamp(20px,1.6vw,29px)/1.2 var(--font-head);color:var(--c-navy); }
.ec-player-bubble .ec-input { min-height:84px;background:#fff; }
.ec-player-hint { min-height:1.5em;margin-top:6px!important;font-size:clamp(14px,1vw,17px)!important;color:var(--c-coral-ink)!important; }
.ec-player-preview { min-height:2.7em;margin:6px 0 0!important;padding:7px 10px;border-radius:12px;background:#e8f8ef;color:var(--c-success-ink)!important;font-size:clamp(15px,1.05vw,18px)!important; }

/* 장면 5 — 해결안 궤도 */
.ec-actions { flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);grid-template-rows:minmax(0,1fr);gap:var(--sp-3); }
.ec-rings { position:relative;min-height:0;display:flex;flex-direction:column;gap:6px;justify-content:center; }
.ec-ring { display:grid;grid-template-columns:minmax(120px,.7fr) repeat(4,minmax(0,1fr));gap:6px;align-items:stretch;padding:6px 8px;border-radius:var(--radius-l);background:rgba(255,252,240,.78);border:2px solid rgba(255,255,255,.7); }
.ec-ring-name { display:flex;align-items:center;font:900 max(18px,var(--fs-small))/1.2 var(--font-head);color:var(--c-navy);padding-left:6px; }
.ec-act { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:82px;padding:6px;border-radius:var(--radius-m);border:2px solid var(--c-line);background:#fff;font:800 max(16px,var(--fs-small))/1.15 var(--font-body);color:var(--c-ink);text-align:center;cursor:pointer;word-break:keep-all; }
.ec-act .ec-act-ico { color:var(--c-sky-ink); }
.ec-act[aria-pressed="true"] { border-color:var(--c-success);background:#e9fbf2;box-shadow:0 0 0 3px rgba(46,173,120,.25); }
.ec-act[aria-pressed="true"] .ec-act-ico { color:var(--c-success-ink); }
.ec-gauges { display:grid;gap:8px; }
.ec-gauge { display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center;font-weight:800;font-size:max(17px,var(--fs-small)); }
.ec-gauge .ec-bars { display:flex;gap:4px; }
.ec-gauge .ec-bar { width:26px;height:16px;border-radius:4px;background:#e2e8f0; }
.ec-gauge .ec-bar.on-1 { background:var(--c-coral); } .ec-gauge .ec-bar.on-2 { background:var(--c-gold); } .ec-gauge .ec-bar.on-3 { background:var(--c-success); }
.ec-gauge .ec-level { min-width:3.2em;text-align:right; }

/* 장면 6 — 약속 */
.ec-pledge { flex:1;min-height:0;overflow-y:auto;display:grid;gap:8px;width:min(1100px,calc(100% - var(--guide-size) - var(--scene-safe) * 2));margin:0 auto 0 max(calc((100% - 1100px) / 2), calc(var(--guide-size) + var(--scene-safe))); } /* 캐릭터가 레인 위로 솟아도 왼쪽 라벨을 덮지 않게 */
.ec-line { padding:10px 14px;border-radius:var(--radius-m);background:rgba(255,255,255,.94);font-size:max(19px,var(--fs-body));line-height:1.45;font-weight:700;border-left:8px solid var(--c-turquoise); }
.ec-line em { font-style:normal;color:var(--c-violet-ink);font-weight:900; }

/* 완료 연출 */
.ec-finale { position:absolute;inset:0;z-index:var(--z-panel);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:radial-gradient(circle at 50% 45%,rgba(10,40,80,.9),rgba(5,18,36,.97));text-align:center;padding:16px; }
.ec-finale::before,.ec-finale::after { content:'';position:absolute;left:50%;top:48%;width:min(46vh,460px);aspect-ratio:1;border:5px solid rgba(99,230,255,.55);border-radius:50%;transform:translate(-50%,-50%) scale(.25);opacity:0;animation:ec-finale-wave 2.4s ease-out 700ms infinite;pointer-events:none; }
.ec-finale::after { animation-delay:1.5s;border-color:rgba(255,215,76,.62); }
@keyframes ec-finale-wave { 0%{transform:translate(-50%,-50%) scale(.25);opacity:.9} 80%,100%{transform:translate(-50%,-50%) scale(1.55);opacity:0} }
.ec-finale.has-earth-bg { background-size:cover;background-position:center;background-repeat:no-repeat;justify-content:flex-end;padding:clamp(18px,3vh,34px); }
.ec-finale .ec-f-copy { position:relative;z-index:3;width:min(900px,88%);padding:12px 22px;border:2px solid rgba(255,255,255,.44);border-radius:24px;background:rgba(5,22,48,.78);backdrop-filter:blur(9px);box-shadow:0 16px 38px rgba(0,0,0,.38); }
.ec-finale .ec-f-copy h2 { margin:0 0 5px;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.65); }
.ec-finale .ec-f-copy p { margin:3px auto;color:#f7fbff;font-weight:800; }
.ec-finale .ec-f-globe { width:min(30vh,280px);filter:drop-shadow(0 12px 30px rgba(120,220,255,.5)); }
.ec-finale .ec-f-friends { position:absolute;inset:0;pointer-events:none; }
.ec-finale .ec-f-friend { position:absolute;width:clamp(64px,8vw,120px);transform:translate(-50%,-50%);transition:left 900ms cubic-bezier(.2,.8,.3,1),top 900ms cubic-bezier(.2,.8,.3,1),opacity 600ms; }
.ec-finale .ec-f-piece { position:absolute;left:50%;top:-8px;transform:translateX(-50%);width:26px;height:26px;border-radius:6px;background:var(--c-gold);box-shadow:var(--shadow-card); }
.ec-finale h2 { margin:0 auto;font:900 clamp(26px,3vw,48px)/1.25 var(--font-head);color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6);max-width:22em;word-break:keep-all;text-align:center; }
.ec-finale p { margin:0 auto;font:700 max(20px,var(--fs-body))/1.4 var(--font-body);color:#f5f9ff;max-width:30em;text-align:center;word-break:keep-all; } /* 폭 제한 문단이 왼쪽에 붙어 쏠려 보이던 문제 — 가운데로 */
.ec-finale .ec-f-copy { text-align:center; }
.ec-finale svg { position:absolute;inset:0;width:100%;height:100%;pointer-events:none; }
.ec-finale [data-act="finale-continue"] { margin-top:10px; }
.ec-finale [data-act="finale-continue"][hidden] { display:none; }
.ec-f-topics { position:absolute;z-index:2;left:50%;top:48%;width:min(82vw,1080px);height:min(62vh,620px);transform:translate(-50%,-50%);pointer-events:none; }
.ec-f-topics span { position:absolute;left:50%;top:50%;max-width:230px;padding:7px 13px;border:2px solid #fff;border-radius:999px;background:rgba(7,43,72,.88);color:#fff;font:900 clamp(13px,1vw,18px)/1.15 var(--font-body);box-shadow:0 0 18px rgba(88,221,255,.6);transform:translate(-50%,-50%);opacity:0;animation:ec-topic-join 1.25s cubic-bezier(.2,.82,.25,1) calc(350ms + var(--topic-i) * 180ms) both;white-space:nowrap; }
.ec-f-topics span:nth-child(1) { --tx:-205%;--ty:-185%; }
.ec-f-topics span:nth-child(2) { --tx:120%;--ty:-185%; }
.ec-f-topics span:nth-child(3) { --tx:-205%;--ty:100%; }
.ec-f-topics span:nth-child(4) { --tx:120%;--ty:100%; }
@keyframes ec-topic-join { 0%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(.55)} 55%{opacity:1;transform:translate(-50%,-50%) scale(1.08)} 100%{opacity:0;transform:translate(-50%,-50%) scale(.25)} }

/* 압축 레이아웃은 진짜 낮은 화면(폴드 가로 등)에서만 — 1280×720·1366×768 전자칠판은 기본 레이아웃 유지 */
@media (max-height:640px) {
  .ec { gap:6px; }
  .ec-head .ribbon-sub { display:none; }
  .ec-head .ribbon-title { padding-block:4px; }
  .ec-friend img { width:36px;height:36px; }
  .ec-friend { padding:2px 6px;font-size:16px;gap:0; }
  .ec-photo-side .ec-portrait { display:none; }
  .ec-sub { min-height:0; }
  .ec-note { font-size:16px; }
  /* 해결안 12장이 세 줄로 다 보이게 — 18px·아이콘 30px이면 셋째 줄이 본문 아래로 17px 잘렸다 */
  .ec-rings { gap:4px; } .ec-ring { padding:4px 6px;gap:5px; } .ec-ring-name { font-size:16px; }
  .ec-act { min-height:60px;font-size:16px;line-height:1.1;gap:2px;padding:5px 4px; }
  .ec-act .ec-act-ico svg { width:22px;height:22px; }
  .ec-pledge { gap:6px; } .ec-line { padding:7px 12px; } /* 여섯 줄+입력칸이 5px 넘쳐 안쪽 스크롤이 생기던 것 */
}
@media (max-height:760px) {
  .ec-head .ribbon-sub { display:none; }
  .ec-note { font-size:16px; }
  .ec-orbit .ec-globe { width:min(29vh,250px); }
  .ec-issue-title { font-size:clamp(19px,1.45vw,27px);bottom:12px; }
  .ec-council-core { width:min(610px,57%); }
}
@media (max-height:640px) {
  .ec-actions { grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr); }
  .ec-seat img { width:clamp(70px,9vw,110px);height:clamp(70px,9vw,110px); }
  .ec-orbit .ec-globe { width:min(24vh,200px); }
  .ec-issue-title { font-size:clamp(17px,1.25vw,23px); }
  .ec-act { min-height:64px; }
}
@media (max-width:900px) {
  .ec-photo-row,.ec-connect,.ec-actions { grid-template-columns:1fr;grid-template-rows:minmax(220px,1fr) auto;overflow-y:auto; }
  .ec-orbit { grid-template-columns:1fr;overflow-y:auto; }
  .ec-orbit .ec-globe { display:none; }
  .ec-issues { overflow:visible;grid-auto-rows:auto; }
  .ec-issue,.ec-issues > .ec-issue:only-child { height:auto;min-height:160px; }
  .ec-choices { grid-template-columns:1fr; }
}
/* 모바일 가로(915×412) — 공용 CSS가 캐릭터 가이드를 숨기는 높이. 빈 레인·하단바 캐릭터 자리를 본문에 돌려주고 장면마다 접는다. */
@media (max-height:460px) {
  .dialogue-scene:has(.ec) { --guide-lane-h:0px; --bottom-bar-h:48px; }
  .dialogue-scene:has(.ec) .page-body { padding:6px clamp(10px,2vw,20px) 4px; }
  .ec { gap:4px; } /* 리본 34px 축소는 DIALOGUE_CSS의 같은 미디어 블록이 맡는다 */
  .ec-progress { font-size:16px; }
  /* 장면 1: 리본과 친구 띠를 한 줄에 — 사진이 120px 아래로 눌리지 않게 */
  .ec:has(> .ec-friends) { display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);column-gap:10px;align-items:center; }
  .ec:has(> .ec-friends) .ec-head { grid-column:1;grid-row:1; }
  .ec:has(> .ec-friends) .ec-friends { grid-column:2;grid-row:1;justify-content:flex-end;flex-wrap:nowrap;gap:6px; }
  .ec:has(> .ec-friends) .ec-photo-row { grid-column:1/-1;grid-row:2; }
  .ec-friend img { width:30px;height:30px; }
  .ec-friend { padding:2px 6px;font-size:14px;min-width:48px; }
  .ec-friend .ec-mark { width:20px;height:20px;top:-5px;right:-5px; }
  .ec-photo,.ec-map { min-height:120px; }
  .ec-photo-row,.ec-connect { gap:6px; }
  .ec-photo-side { min-height:0;padding:5px 12px; }
  .ec-click-copy { font-size:16px;line-height:1.3; }
  .ec-map-copy { min-height:0;padding:6px 12px; }
  /* 장면 3 */
  .ec-orbit .ec-globe { width:min(22vh,160px); }
  .ec-issue-title { font-size:clamp(15px,1.2vw,20px);bottom:8px; }
  /* 장면 4 원탁: 위·아래 줄 친구가 무대 밖으로 나가지 않게 */
  .ec-head-compact strong { font-size:19px; } .ec-head-compact span { font-size:14px; }
  .ec-council-friend img { height:clamp(56px,15vh,110px);max-width:clamp(70px,10vw,140px); }
  .ec-council-friend span { font-size:13px;padding:2px 8px; }
  .ec-council-bubble { padding:8px 12px; }
  .ec-council-bubble h2 { font-size:18px;margin:3px 0 4px; }
  .ec-council-bubble p { font-size:15px; }
  /* 말풍선이 위·아래 줄 친구 이름표를 덮거나 무대 밖으로 나가지 않게 — 좁히고, 말하는 친구 줄 반대쪽으로 민다 */
  .ec-council-core { width:min(400px,36%); }
  .ec-council-core.is-player { width:min(460px,46%); }
  .ec-council-stage:has(.ec-council-friend.is-speaking[data-row="top"]) .ec-council-core { transform:translate(-50%,-12%); }
  .ec-council-stage:has(.ec-council-friend.is-speaking[data-row="bottom"]) .ec-council-core { transform:translate(-50%,-88%); }
  .ec-player-bubble label { font-size:17px;margin-bottom:4px; }
  .ec-player-bubble .ec-input { min-height:56px; }
  .ec-player-hint { font-size:13px!important; }
  .ec-seat img { width:clamp(48px,11vh,80px);height:clamp(48px,11vh,80px); }
  /* 장면 5 해결안: 아이콘을 접고 글만 — 12장 세 줄이 한 화면에 */
  .ec-actions { grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr);gap:8px; }
  .ec-rings { gap:4px; }
  .ec-ring { grid-template-columns:minmax(84px,.6fr) repeat(4,minmax(0,1fr));gap:4px;padding:3px 5px; }
  .ec-ring-name { font-size:14px;padding-left:3px; }
  .ec-act { min-height:44px;padding:4px;font-size:14px;line-height:1.15;gap:0; }
  .ec-act .ec-act-ico { display:none; }
  .ec-side { gap:6px; }
  .ec-side .ec-copy { font-size:15px;line-height:1.35; }
  .ec-side > .ec-copy:first-child, .ec-side .ec-scope { display:none; } /* 관점 요약·학습용 모형 안내는 이 높이에서 접는다 */
  .ec-side .ec-click-copy { min-height:0; }
  .ec-gauges { gap:4px; }
  .ec-gauge { font-size:14px;gap:4px; }
  .ec-gauge .ec-bar { width:20px;height:12px; }
  /* 장면 6 약속: 두 열로 — 한 열이면 여섯 줄+입력칸이 248px에 안 들어간다 */
  .ec-pledge { width:100%;margin:0;grid-template-columns:1fr 1fr;gap:6px;align-content:start; }
  .ec-pledge > .ec-line:first-child, .ec-pledge > div.ec-line { grid-column:1/-1; }
  .ec-line { padding:5px 10px;font-size:15px;line-height:1.35;border-left-width:5px; }
  .ec-pledge .ec-input { min-height:40px;padding:5px 8px;font-size:15px; }
}
`;

/* ===== 공통 ===== */
function head(main: string, sub?: string): string {
  return `<div class="ec-head"><div class="ribbon-title"><span class="ribbon-main">${esc(main)}</span>${sub ? `<span class="ribbon-sub">${esc(sub)}</span>` : ''}</div></div>`;
}
function friendOf(content: EarthContent, id: string): EarthFriend {
  return content.friends.find((f) => f.id === id) ?? content.friends[0]!;
}
function img(id: string, alt: string, cls = ''): string {
  return hasAsset(id) ? `<img src="${assetUrl(id)}" data-asset-id="${id}" alt="${esc(alt)}" class="${cls}">` : '';
}
export function renderEarthScene(host: EarthSceneHost): void {
  const p = host.progress;
  switch (p.scene) {
    case 'signals': return renderSignals(host);
    case 'connect': return renderConnect(host);
    case 'issue': return renderIssue(host);
    case 'roundtable': return renderRoundtable(host);
    case 'actions': return renderActions(host);
    case 'pledge': return renderPledge(host);
    case 'done': return renderPledge(host);
  }
}

function goto(host: EarthSceneHost, scene: GlobalEnvironmentProgress['scene']): void {
  host.progress.scene = scene;
  host.save();
  renderEarthScene(host);
}

const SHORT_SIGNAL_COPY: Record<string, string> = {
  sig_nepal_glacier: '빙하가 줄면 계곡을 흐르는 물의 양도 달라져.',
  sig_japan_heat: '기온이 오르면 바닷가의 더위도 더 오래 이어져.',
  sig_morocco_water: '비가 적게 오면 밭과 마을이 쓸 물도 줄어.',
  sig_tanzania_habitat: '물웅덩이가 작아지면 동물의 이동길도 달라져.',
  sig_australia_reef: '바닷물이 너무 따뜻해지면 산호가 하얗게 변할 수 있어.',
  sig_colombia_plastic: '해안 쓰레기는 파도와 해류를 따라 멀리 이동해.'
};

const SIGNAL_MAP_SPOTS: Record<string, { x: number; y: number }> = {
  sig_morocco_water: { x: .105, y: .48 },
  sig_tanzania_habitat: { x: .16, y: .62 },
  sig_nepal_glacier: { x: .34, y: .40 },
  sig_japan_heat: { x: .525, y: .36 },
  sig_australia_reef: { x: .59, y: .80 },
  sig_colombia_plastic: { x: .84, y: .60 }
};

function shortSignalCopy(signal: EnvironmentalSignal): string {
  return SHORT_SIGNAL_COPY[signal.id] ?? signal.titleKo;
}

/* ===== 장면 1 — 여섯 개의 환경 신호 발견 ===== */
function renderSignals(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const t = content.titles;
  const firstUnobserved = content.signals.find((s) => !p.signalObservedIds.includes(s.id));
  let current = firstUnobserved ?? content.signals[0]!;
  const found = new Set<string>();
  let hintTimer: number | null = null;

  body.innerHTML = `
    <div class="ec">
      ${head(t.mission, '반짝이는 동그라미를 눌러 변화를 찾아봐')}
      <div class="ec-friends" role="tablist" aria-label="사진을 보낸 친구"></div>
      <div class="ec-photo-row">
        <div class="ec-photo" id="ec-photo"></div>
        <section class="panel ec-photo-side" id="ec-side"></section>
      </div>
    </div>`;
  const strip = body.querySelector<HTMLElement>('.ec-friends')!;
  const photo = body.querySelector<HTMLElement>('#ec-photo')!;
  const side = body.querySelector<HTMLElement>('#ec-side')!;

  const renderStrip = () => {
    strip.innerHTML = '';
    content.signals.forEach((s) => {
      const f = friendOf(content, s.friendId);
      const observed = p.signalObservedIds.includes(s.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ec-friend';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-pressed', String(s.id === current.id));
      b.setAttribute('aria-label', `${f.country} ${f.name}의 사진${observed ? ', 신호 기록함' : ', 새 사진'}`);
      b.innerHTML = `${img(f.imageId, '')}<span>${esc(f.name)}</span>
        <span class="ec-mark${observed ? '' : ' is-new'}" aria-hidden="true">${observed ? icon('check', 14) : icon('mail', 14)}</span>`;
      b.addEventListener('click', () => { if (host.isDisposed()) return; void audio.playSfx('tap'); current = s; found.clear(); renderPhoto(); });
      strip.appendChild(b);
    });
  };

  const renderPhoto = () => {
    if (hintTimer !== null) window.clearTimeout(hintTimer);
    const s = current;
    const f = friendOf(content, s.friendId);
    const observed = p.signalObservedIds.includes(s.id);
    if (!p.signalViewedIds.includes(s.id)) { p.signalViewedIds.push(s.id); host.save(); }
    const imageId = signalImageId(content, s);
    const allFound = observed || s.hotspots.every((h) => found.has(h.id));
    photo.innerHTML = `
      ${img(imageId, `${f.country} ${f.name}이 보낸 현장 사진`)}
      ${s.hotspots.map((h) => `
        <button type="button" class="ec-spot${observed || found.has(h.id) ? ' is-found' : ' is-hint'}" data-spot="${h.id}"
          style="left:${h.x * 100}%;top:${h.y * 100}%" aria-label="관찰 지점: ${esc(h.label)}">
        </button>`).join('')}
      <div class="ec-lens" id="ec-lens" style="opacity:0" aria-hidden="true"></div>`;
    side.innerHTML = `
      <p class="ec-click-copy" id="ec-click-copy">${allFound ? '' : '그림 속 반짝이는 동그라미를 눌러 봐.'}</p>`;
    renderStrip();
    if (allFound) typeText(side.querySelector<HTMLElement>('#ec-click-copy')!, shortSignalCopy(s));

    const spots = Array.from(photo.querySelectorAll<HTMLButtonElement>('.ec-spot'));
    const lens = photo.querySelector<HTMLElement>('#ec-lens')!;
    const showLens = (h: { x: number; y: number; zoomAssetId?: string }) => {
      if (!hasAsset(imageId)) return;
      const zoomImageId = h.zoomAssetId && hasAsset(h.zoomAssetId) ? h.zoomAssetId : imageId;
      lens.style.backgroundImage = `url('${assetUrl(zoomImageId)}')`;
      lens.style.backgroundSize = zoomImageId === imageId ? '300% 300%' : 'cover';
      lens.style.backgroundPosition = zoomImageId === imageId ? `${h.x * 100}% ${h.y * 100}%` : 'center';
      lens.style.opacity = '1';
      // 확대경이 관찰 지점을 가리지 않게 반대편에 둔다
      lens.style.right = h.x > 0.5 ? 'auto' : '3%';
      lens.style.left = h.x > 0.5 ? '3%' : 'auto';
      lens.style.top = h.y > 0.5 ? '5%' : 'auto';
      lens.style.bottom = h.y > 0.5 ? 'auto' : '5%';
    };
    const armHint = () => {
      if (hintTimer !== null) window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        spots.find((b) => !b.classList.contains('is-found'))?.classList.add('is-hint');
      }, 7000);
    };
    if (!allFound) armHint();

    spots.forEach((b) => {
      const h = s.hotspots.find((x) => x.id === b.dataset.spot)!;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (host.isDisposed() || observed) { showLens(h); return; }
        if (found.has(h.id)) { showLens(h); return; }
        found.add(h.id);
        void audio.playSfx('pickup');
        b.classList.add('is-found');
        b.classList.remove('is-hint');
        b.innerHTML = '';
        popBounce(b);
        showLens(h);
        const remaining = s.hotspots.filter((x) => !found.has(x.id));
        if (remaining.length) {
          const nextSpot = remaining[0]!;
          host.guide?.say(`${h.label}을(를) 찾았어. 이제 ${nextSpot.label}도 살펴봐.`, { speaker: host.speaker, cue: spots.find((x) => x.dataset.spot === nextSpot.id) ?? null });
          armHint();
        } else {
          revealNarration();
        }
      });
    });
    // renderPhoto는 친구 탭마다 다시 불린다 — addEventListener면 리스너가 쌓여 안내가 N번 겹친다
    photo.onclick = (ev) => {
      if (observed || s.hotspots.every((h) => found.has(h.id))) return;
      const rect = photo.getBoundingClientRect();
      const r = document.createElement('span');
      r.className = 'ec-ripple';
      r.style.left = `${ev.clientX - rect.left}px`;
      r.style.top = `${ev.clientY - rect.top}px`;
      photo.appendChild(r);
      window.setTimeout(() => r.remove(), 520);
      const next = s.hotspots.find((x) => !found.has(x.id));
      host.guide?.say(`여기엔 변화가 안 보여. ${next ? `${next.label} 쪽을 자세히 봐.` : ''}`, { speaker: host.speaker });
    };

    const revealNarration = () => {
      const copy = side.querySelector<HTMLElement>('#ec-click-copy');
      if (copy) typeText(copy, shortSignalCopy(s));
      if (!p.signalObservedIds.includes(s.id)) {
        p.signalObservedIds.push(s.id);
        host.save();
        void audio.playSfx('success');
        const tab = strip.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (tab) burstConfetti(tab, 6);
      }
      renderStrip();
      renderBottom();
      host.guide?.say('찾았어! 아래 설명을 보고 다음 사진으로 가자.', { speaker: { assetId: f.imageId, name: f.name }, cue: bottom.querySelector<HTMLElement>('[data-act="next-photo"]') });
    };

    renderBottom();
    if (!allFound) {
      host.guide?.say(s.observationPromptKo, { speaker: { assetId: f.imageId, name: f.name }, cue: photo });
    } else if (!firstUnobserved) {
      host.guide?.say('여섯 신호를 모두 기록했어. 이제 지도에서 연결을 확인하자.', { speaker: host.speaker, cue: bottom.querySelector<HTMLElement>('[data-act="connect"]') });
    }
  };

  const renderBottom = () => {
    const observed = p.signalObservedIds.includes(current.id);
    const n = p.signalObservedIds.length;
    const hasNext = content.signals.some((s) => !p.signalObservedIds.includes(s.id));
    const canConnect = n >= MIN_SIGNALS_TO_CONNECT;
    bottom.innerHTML = `
      <span class="ec-progress" aria-live="polite">${n >= content.signals.length ? '여섯 신호를 모두 찾았어!' : `찾은 신호 ${n}/${content.signals.length}`}</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      ${observed ? `${hasNext ? `<button class="btn btn-primary btn-big" data-act="next-photo">다음 사진</button>` : ''}
        ${canConnect ? `<button class="btn ${hasNext ? 'btn-ghost' : 'btn-primary'} btn-big" data-act="connect">한눈에 보기</button>` : ''}` : ''}
      </span>`;
    bottom.querySelector('[data-act="next-photo"]')?.addEventListener('click', () => {
      const next = content.signals.find((s) => !p.signalObservedIds.includes(s.id));
      if (!next) return;
      current = next; found.clear(); renderPhoto();
    });
    bottom.querySelector('[data-act="connect"]')?.addEventListener('click', () => goto(host, 'connect'));
  };
  renderPhoto();
}

/* ===== 장면 2 — 세계지도에서 연결 발견 ===== */
function renderConnect(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const observed = content.signals.filter((s) => p.signalObservedIds.includes(s.id));
  const clicked = new Set<string>();
  const mapAssetId = hasAsset('earth.signal.map') ? 'earth.signal.map' : 'bg.map';

  body.innerHTML = `
    <div class="ec">
      ${head('국경을 넘는 신호', '반짝이는 동그라미를 눌러 봐')}
      <div class="ec-connect">
        <div class="ec-map" id="ec-map" style="background-image:url('${assetUrl(mapAssetId)}')" aria-label="세계지도에 표시된 여섯 환경 신호"></div>
        <section class="ec-map-copy" aria-live="polite"><p class="ec-click-copy" id="ec-map-copy">지도 속 반짝이는 동그라미를 눌러 봐.</p></section>
      </div>
    </div>`;
  const map = body.querySelector<HTMLElement>('#ec-map')!;
  const copy = body.querySelector<HTMLElement>('#ec-map-copy')!;

  observed.forEach((s) => {
    const f = friendOf(content, s.friendId);
    const spot = SIGNAL_MAP_SPOTS[s.id] ?? { x: f.mapX, y: f.mapY };
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ec-pin';
    b.style.left = `${spot.x * 100}%`;
    b.style.top = `${spot.y * 100}%`;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${f.country}의 환경 신호 살펴보기`);
    b.addEventListener('click', () => {
      if (host.isDisposed()) return;
      clicked.add(s.id);
      b.classList.add('is-found');
      b.setAttribute('aria-pressed', 'true');
      b.setAttribute('aria-label', `${f.country}의 환경 신호, 살펴봄`);
      const nextType = s.connectionTypes.find((type) => !p.exploredConnectionTypes.includes(type)) ?? s.connectionTypes[0];
      if (nextType && !p.exploredConnectionTypes.includes(nextType)) p.exploredConnectionTypes.push(nextType);
      host.save();
      void audio.playSfx('pickup');
      popBounce(b);
      typeText(copy, shortSignalCopy(s));
      renderBottom();
      if (canOpenCouncil(p) && clicked.size >= MIN_CONNECTIONS) burstConfetti(copy, 8);
    });
    map.appendChild(b);
  });

  const renderBottom = () => {
    const ready = canOpenCouncil(p) && (clicked.size >= MIN_CONNECTIONS || p.exploredConnectionTypes.length > MIN_CONNECTIONS);
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="back">사진 다시 보기</button>
      <span class="ec-progress">${ready ? '신호를 찾았어!' : `서로 다른 동그라미 ${Math.min(clicked.size, MIN_CONNECTIONS)}/${MIN_CONNECTIONS}`}</span>
      <button class="btn btn-primary btn-big" data-act="council" ${ready ? '' : 'disabled'}>환경문제 보기</button>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => goto(host, 'signals'));
    bottom.querySelector('[data-act="council"]')?.addEventListener('click', () => { if (ready) goto(host, 'issue'); });
  };

  renderBottom();
  host.guide?.say('지도에서 반짝이는 동그라미를 눌러 봐.', { speaker: host.speaker, cue: map });
}

/* ===== 장면 3 — 탐구할 환경문제 선택 ===== */
/** 대륙에서 모은 신호를 회의 주제와 잇는다 — 명시 issueId가 있으면 그걸 쓰고, 없으면(이전 저장·유럽 등) 키워드로 추정한다. */
function issueIdForSignal(signal: { label: string; issueId?: string }): string {
  if (signal.issueId) return signal.issueId;
  const label = signal.label;
  if (/바다|플라스틱|쓰레기|해안|섬|산호|염분|갯벌|바닷|항구/.test(label)) return 'ocean';
  if (/숲|생물|서식지|나무|분지|초원|동물|습지|사파리|정원/.test(label)) return 'ecosystem';
  return 'climate';
}

function renderIssue(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const globeId = hasAsset('earth.council.globe')
    ? 'earth.council.globe'
    : (hasAsset('prop.globe3d') ? 'prop.globe3d' : 'prop.globe');

  body.innerHTML = `
    <div class="ec ec-issue-screen">
      ${head(content.titles.council, content.titles.councilSub)}
      <div class="ec-orbit" id="ec-orbit">
        <svg class="ec-orbit-lines" id="ec-orbit-lines" aria-hidden="true"></svg>
        <div class="ec-issues" id="ec-issues-left"></div>
        <div class="ec-globe-wrap">
          ${img(globeId, '네 가지 환경문제를 잇는 지구본', 'ec-globe')}
          <span class="ec-globe-count" id="ec-globe-count"></span>
        </div>
        <div class="ec-issues" id="ec-issues-right"></div>
      </div>
    </div>`;

  const orbit = body.querySelector<HTMLElement>('#ec-orbit')!;
  const lines = body.querySelector<SVGSVGElement>('#ec-orbit-lines')!;
  const globe = body.querySelector<HTMLElement>('.ec-globe')!;
  const count = body.querySelector<HTMLElement>('#ec-globe-count')!;
  const left = body.querySelector<HTMLElement>('#ec-issues-left')!;
  const right = body.querySelector<HTMLElement>('#ec-issues-right')!;
  let transitioning = false;

  const inspectedCount = () => p.inspectedIssueIds.filter((id) => content.issues.some((issue) => issue.id === id)).length;
  const drawLinks = () => {
    if (!orbit.isConnected) return;
    const orbitRect = orbit.getBoundingClientRect();
    const globeRect = globe.getBoundingClientRect();
    const globeX = globeRect.left + globeRect.width / 2 - orbitRect.left;
    const globeY = globeRect.top + globeRect.height / 2 - orbitRect.top;
    lines.setAttribute('viewBox', `0 0 ${Math.max(1, orbitRect.width)} ${Math.max(1, orbitRect.height)}`);
    lines.innerHTML = p.inspectedIssueIds.map((id) => {
      const card = orbit.querySelector<HTMLElement>(`[data-issue-id="${id}"]`);
      if (!card) return '';
      const cardRect = card.getBoundingClientRect();
      const cardX = cardRect.left + cardRect.width / 2 - orbitRect.left;
      const cardY = cardRect.top + cardRect.height / 2 - orbitRect.top;
      return `<line class="ec-orbit-line" x1="${cardX}" y1="${cardY}" x2="${globeX}" y2="${globeY}"></line>`;
    }).join('');
  };

  const openCouncil = () => {
    if (transitioning || inspectedCount() < content.issues.length) return;
    transitioning = true;
    p.councilTurnIndex = 0;
    host.save();
    window.setTimeout(() => { if (!host.isDisposed()) goto(host, 'roundtable'); }, 420);
  };

  const renderBottom = () => {
    const total = content.issues.length;
    const done = inspectedCount();
    count.textContent = `${done}/${total} 연결`;
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="back">지도로</button>
      <button class="btn btn-primary btn-big" data-act="go" ${done >= total ? '' : 'disabled'}>
        ${done >= total ? '세계 친구 회의 열기' : `문제를 살펴봐요 ${done}/${total}`}
      </button>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => goto(host, 'connect'));
    bottom.querySelector('[data-act="go"]')?.addEventListener('click', openCouncil);
  };

  const animateToGlobe = async (card: HTMLElement) => {
    const source = card.querySelector<HTMLImageElement>('img');
    if (!source) return;
    const from = card.getBoundingClientRect();
    const to = globe.getBoundingClientRect();
    const width = Math.min(150, Math.max(96, from.width * .38));
    const height = width * Math.max(.62, Math.min(1, from.height / Math.max(1, from.width)));
    const copy = document.createElement('span');
    copy.className = 'ec-flight-copy';
    copy.style.left = `${from.left + from.width / 2 - width / 2}px`;
    copy.style.top = `${from.top + from.height / 2 - height / 2}px`;
    copy.style.width = `${width}px`;
    copy.style.height = `${height}px`;
    copy.innerHTML = `<img src="${source.src}" alt="">`;
    document.body.appendChild(copy);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const animation = copy.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(.22) rotate(10deg)`, opacity: .08 }
    ], { duration: 720, easing: 'cubic-bezier(.22,.82,.28,1)', fill: 'forwards' });
    try { await animation.finished; } catch { /* 장면 전환 중 취소될 수 있음 */ }
    copy.remove();
    if (!globe.isConnected) return;
    globe.classList.remove('is-receiving');
    void globe.offsetWidth;
    globe.classList.add('is-receiving');
    window.setTimeout(() => globe.classList.remove('is-receiving'), 740);
  };

  content.issues.forEach((issue, index) => {
    const hero = content.signals.find((signal) => signal.id === issue.heroSignalId) ?? content.signals[0]!;
    const issueImageId = issue.imageAssetId && hasAsset(issue.imageAssetId)
      ? issue.imageAssetId
      : signalImageId(content, hero);
    const card = document.createElement('button');
    const inspected = p.inspectedIssueIds.includes(issue.id);
    card.type = 'button';
    card.className = `ec-issue${inspected ? ' is-inspected' : ''}`;
    card.dataset.issueId = issue.id;
    card.setAttribute('aria-pressed', String(inspected));
    card.setAttribute('aria-label', `${issue.title}${inspected ? ', 살펴봄' : ', 살펴보기'}`);
    card.innerHTML = `${img(issueImageId, '')}<span class="ec-issue-title">${esc(issue.title)}</span><span class="ec-issue-check">${icon('check', 24)}</span>`;
    card.addEventListener('click', async () => {
      if (host.isDisposed() || transitioning || p.inspectedIssueIds.includes(issue.id)) return;
      void audio.playSfx('tap');
      await animateToGlobe(card);
      if (host.isDisposed()) return;
      p.inspectedIssueIds.push(issue.id);
      card.classList.add('is-inspected');
      card.setAttribute('aria-pressed', 'true');
      card.setAttribute('aria-label', `${issue.title}, 살펴봄`);
      host.save();
      renderBottom();
      drawLinks();
      if (inspectedCount() >= content.issues.length) {
        burstConfetti(globe, 12);
        void audio.playSfx('complete');
        window.setTimeout(openCouncil, 950);
      }
    });
    (index % 2 === 0 ? left : right).appendChild(card);
  });

  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(drawLinks);
  resizeObserver?.observe(orbit);
  requestAnimationFrame(drawLinks);
  renderBottom();
}

function renderRoundtable(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const turns = content.councilTurns;
  const globeId = hasAsset('earth.council.globe')
    ? 'earth.council.globe'
    : (hasAsset('prop.globe3d') ? 'prop.globe3d' : 'prop.globe');

  body.innerHTML = `
    <div class="ec ec-council-screen">
      <div class="ec-head-compact"><strong>세계 친구 지구회의</strong><span>문제에서 해결책과 약속으로 이어 가요</span></div>
      <div class="ec-council-stage" id="ec-council-stage">
        ${img(globeId, '세계 친구 회의의 지구본', 'ec-council-world')}
        <div id="ec-council-friends"></div>
        <div class="ec-council-core" id="ec-council-core"></div>
        <div class="ec-council-dots" id="ec-council-dots" aria-hidden="true"></div>
      </div>
    </div>`;

  const friendsEl = body.querySelector<HTMLElement>('#ec-council-friends')!;
  const core = body.querySelector<HTMLElement>('#ec-council-core')!;
  const dots = body.querySelector<HTMLElement>('#ec-council-dots')!;

  // 육각형 자리(위 2·양옆 2·아래 2). row: 말풍선을 어디에 둘지 — 위·아래 줄은 두 친구 사이, 양옆은 안쪽
  const SEATS = [
    { x: 76, y: 17, row: 'top' }, { x: 92, y: 50, row: 'side' }, { x: 76, y: 80, row: 'bottom' },
    { x: 24, y: 80, row: 'bottom' }, { x: 8, y: 50, row: 'side' }, { x: 24, y: 17, row: 'top' }
  ] as const;
  content.friends.forEach((friend, index) => {
    const pos = SEATS[index % SEATS.length]!;
    const seat = document.createElement('div');
    seat.className = 'ec-council-friend';
    seat.dataset.friendId = friend.id;
    seat.dataset.row = pos.row;
    seat.dataset.x = String(pos.x);
    seat.dataset.y = String(pos.y);
    seat.style.left = `${pos.x}%`;
    seat.style.top = `${pos.y}%`;
    seat.style.animationDelay = `${index * 90}ms`;
    seat.innerHTML = `${img(friend.imageId, '')}<span>${esc(friend.name)} · ${esc(friend.country)}</span>`;
    friendsEl.appendChild(seat);
  });

  /** 말풍선을 말하는 친구의 안쪽 옆자리로 옮기고, 꼬리 방향을 그 친구 쪽으로 둔다 */
  const placeBubbleBy = (friendId: string | null) => {
    const seat = friendId ? friendsEl.querySelector<HTMLElement>(`[data-friend-id="${friendId}"]`) : null;
    core.classList.toggle('is-player', !seat);
    if (!seat) { core.style.left = '50%'; core.style.top = '50%'; core.removeAttribute('data-dir'); return; }
    const x = Number(seat.dataset.x ?? 50), y = Number(seat.dataset.y ?? 50);
    const onRight = x > 50;
    // 위·아래 줄: 두 친구 사이 가운데에서 말하는 친구 쪽으로 꼬리. 양옆: 그 친구 바로 안쪽 옆.
    core.style.left = seat.dataset.row === 'side' ? `${onRight ? 66 : 34}%` : '50%';
    core.style.top = `${seat.dataset.row === 'side' ? 52 : y + (y < 50 ? 3 : -3)}%`;
    core.dataset.dir = onRight ? 'right' : 'left';
  };

  const renderDots = (active: number) => {
    dots.innerHTML = turns.map((_, index) => `<span class="ec-council-dot${index === active ? ' is-on' : ''}"></span>`).join('');
  };

  const showPlayerTurn = () => {
    p.councilTurnIndex = turns.length;
    host.save();
    friendsEl.querySelectorAll('.ec-council-friend').forEach((friend) => friend.classList.remove('is-speaking'));
    renderDots(-1);
    placeBubbleBy(null);
    core.innerHTML = `
      <div class="ec-council-bubble ec-player-bubble">
        <span class="ec-council-phase" data-phase="약속">이제 내 차례</span>
        <label for="ec-player-pledge">친구들에게 내가 할 약속을 말해 봐</label>
        <textarea class="ec-input" id="ec-player-pledge" rows="3" maxlength="120" placeholder="예: 금요일 학교에서 친구와 물병을 쓰고 쓰레기를 줄일래.">${esc(p.personalActionDraft)}</textarea>
        <p class="ec-player-hint" id="ec-player-hint">언제·어디서·누구와 할지 넣으면 더 좋아.</p>
      </div>`;
    const input = core.querySelector<HTMLTextAreaElement>('#ec-player-pledge')!;
    const hint = core.querySelector<HTMLElement>('#ec-player-hint')!;
    // 고칠 점이 있을 때만 알려 주고, 됐으면 조용히 비운다(초록 확인 문구 없음)
    const validate = () => {
      const issue = personalActionIssue(content, input.value);
      hint.textContent = issue ?? '';
      hint.hidden = !issue;
      return issue;
    };
    input.addEventListener('input', () => {
      p.personalActionDraft = input.value.slice(0, 120);
      host.save();
      const issue = validate();
      const finish = bottom.querySelector<HTMLButtonElement>('[data-act="finish"]');
      if (finish) finish.disabled = Boolean(issue);
    });
    bottom.innerHTML = `
      <button class="btn btn-primary btn-big" data-act="finish" ${personalActionIssue(content, input.value) ? 'disabled' : ''}>내 약속으로 회의 마치기</button>`;
    bottom.querySelector('[data-act="finish"]')?.addEventListener('click', () => {
      p.personalActionDraft = input.value.slice(0, 120);
      const issue = validate();
      if (issue) { input.focus(); void audio.playSfx('tap'); return; }
      p.jointPledgeDraft = [...turns.map((turn) => `${friendOf(content, turn.friendId).name}: ${turn.line}`), `나: ${p.personalActionDraft}`].join('\n');
      p.missionCompleted = true;
      p.scene = 'done';
      host.save();
      playFinale(host, () => host.onFinish());
    });
    validate();
    input.focus();
  };

  const showTurn = (index: number) => {
    const turn = turns[index];
    if (!turn) { showPlayerTurn(); return; }
    p.councilTurnIndex = index;
    host.save();
    const friend = friendOf(content, turn.friendId);
    friendsEl.querySelectorAll<HTMLElement>('.ec-council-friend').forEach((el) => el.classList.toggle('is-speaking', el.dataset.friendId === friend.id));
    placeBubbleBy(friend.id);
    core.innerHTML = `
      <div class="ec-council-bubble">
        <span class="ec-council-phase" data-phase="${esc(turn.phase)}">${esc(turn.phase)}</span>
        <h2>${esc(friend.name)} · ${esc(friend.country)}</h2>
        <p id="ec-turn-copy"></p>
      </div>`;
    typeText(core.querySelector<HTMLElement>('#ec-turn-copy')!, turn.line);
    renderDots(index);
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="back">문제 다시 보기</button>
      <button class="btn btn-primary btn-big" data-act="next">${index + 1 < turns.length ? '다음 이야기' : '내 약속 쓰기'}</button>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => goto(host, 'issue'));
    bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      if (index + 1 < turns.length) showTurn(index + 1);
      else showPlayerTurn();
    });
  };

  showTurn(Math.min(Math.max(0, p.councilTurnIndex), turns.length));
}

/* ===== 장면 5 — 해결안 조합 실험 ===== */
const LEVEL_LABEL: Record<Level, string> = { 1: '낮음', 2: '보통', 3: '높음' };
function renderActions(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const t = content.titles;
  const issue = content.issues.find((i) => i.id === p.selectedIssueId);
  if (!issue) { goto(host, 'issue'); return; }
  const chosen = p.selectedPerspectiveIds.map((id) => content.perspectives.find((x) => x.id === id)?.label).filter(Boolean).join(' · ');

  body.innerHTML = `
    <div class="ec">
      ${head('해결안 조합 실험', issue.title)}
      <div class="ec-actions">
        <div class="ec-rings" id="ec-rings" role="group" aria-label="세 수준의 해결 방법"></div>
        <section class="panel ec-side" id="ec-result">
          <p class="ec-copy">반영할 관점: <span style="color:var(--c-violet-ink)">${esc(chosen)}</span></p>
          <p class="ec-copy" style="color:var(--c-ink-soft)">각 수준에서 하나 이상 골라 지구본 주변에 놓고 실험해요.</p>
          <p class="ec-click-copy" id="ec-action-copy" aria-live="polite"></p>
          <div id="ec-gauges" class="ec-gauges"></div>
          <div id="ec-fb" style="display:grid;gap:6px"></div>
          <p class="ec-scope">${esc(t.simulationNote)}</p>
        </section>
      </div>
    </div>`;
  const rings = body.querySelector<HTMLElement>('#ec-rings')!;
  const gauges = body.querySelector<HTMLElement>('#ec-gauges')!;
  const resultPanel = body.querySelector<HTMLElement>('#ec-result');
  if (resultPanel) keepFitted(resultPanel, () => Array.from(resultPanel.querySelectorAll<HTMLElement>('p,span,small,b')), 13);
  const fb = body.querySelector<HTMLElement>('#ec-fb')!;
  let lastRun: string | null = null;

  content.actionTiers.forEach((tier) => {
    const row = document.createElement('div');
    row.className = 'ec-ring';
    row.innerHTML = `<span class="ec-ring-name">${esc(tier.name)}</span>`;
    content.actions.filter((a) => a.tier === tier.id).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ec-act';
      b.dataset.action = a.id;
      b.setAttribute('aria-pressed', String(p.selectedActionIds.includes(a.id)));
      b.setAttribute('aria-label', `${a.name}. ${a.detail}`);
      b.innerHTML = `<span class="ec-act-ico">${icon(a.icon, 30)}</span><span>${esc(a.name)}</span>`;
      b.addEventListener('click', () => {
        if (host.isDisposed()) return;
        const on = p.selectedActionIds.includes(a.id);
        p.selectedActionIds = on ? p.selectedActionIds.filter((x) => x !== a.id) : [...p.selectedActionIds, a.id];
        b.setAttribute('aria-pressed', String(!on));
        void audio.playSfx(on ? 'tap' : 'drop');
        if (!on) {
          popBounce(b);
          const actionCopy = body.querySelector<HTMLElement>('#ec-action-copy');
          if (actionCopy) typeText(actionCopy, a.detail);
          host.guide?.say(a.detail, { speaker: host.speaker });
        }
        host.save();
        renderBottom();
      });
      row.appendChild(b);
    });
    rings.appendChild(row);
  });

  const renderGauges = () => {
    if (!p.selectedActionIds.length || p.simulationAttempts === 0) { gauges.innerHTML = ''; return; }
    const r = simulate(content, issue.id, p.selectedActionIds);
    const rows: Array<[string, Level]> = [['환경 개선 효과', r.effect], ['실천 가능성', r.feasibility], ['여러 사람의 참여', r.participation], ['국가 간 협력', r.cooperation]];
    gauges.innerHTML = rows.map(([label, lv]) => `
      <div class="ec-gauge" role="img" aria-label="${esc(label)} ${LEVEL_LABEL[lv]}">
        <span>${esc(label)}</span>
        <span style="display:flex;gap:8px;align-items:center"><span class="ec-bars">${[1, 2, 3].map((i) => `<span class="ec-bar${i <= lv ? ` on-${lv}` : ''}"></span>`).join('')}</span><span class="ec-level">${LEVEL_LABEL[lv]}</span></span>
      </div>`).join('');
    fb.innerHTML = '';
    r.feedback.forEach((line) => {
      const el = document.createElement('div');
      showFeedback(el, line === content.simulationFeedback.balanced ? 'success' : 'partial', line, 'dialogue');
      fb.appendChild(el);
    });
  };

  const renderBottom = () => {
    const runnable = canRunSimulation(content, p.selectedActionIds);
    const key = [...p.selectedActionIds].sort().join('|');
    const ran = p.simulationAttempts > 0 && lastRun === key;
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="back">관점 다시 보기</button>
      <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn ${ran ? 'btn-ghost' : 'btn-primary'} btn-big" data-act="run" ${runnable ? '' : 'disabled'}>${ran ? '다른 조합 실험하기' : '실험하기'}</button>
        <button class="btn btn-primary btn-big" data-act="pledge" ${ran ? '' : 'disabled'}>이 조합으로 약속 만들기</button>
      </span>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => goto(host, 'roundtable'));
    bottom.querySelector('[data-act="run"]')?.addEventListener('click', () => {
      if (!runnable || host.isDisposed()) return;
      if (ran) { host.guide?.say('행동을 바꾸고 다시 실험해 봐.', { speaker: host.speaker, cue: rings }); return; }
      p.simulationAttempts += 1;
      lastRun = key;
      host.save();
      void audio.playSfx('whoosh');
      renderGauges();
      renderBottom();
      const globe = body.querySelector<HTMLElement>('#ec-gauges');
      if (globe) burstConfetti(globe, 6);
      host.guide?.say('결과를 보고, 다른 조합도 실험해 보거나 약속으로 넘어가.', { speaker: host.speaker, cue: bottom.querySelector<HTMLElement>('[data-act="pledge"]') });
    });
    bottom.querySelector('[data-act="pledge"]')?.addEventListener('click', () => { if (ran) goto(host, 'pledge'); });
  };

  if (p.simulationAttempts > 0 && canRunSimulation(content, p.selectedActionIds)) { lastRun = [...p.selectedActionIds].sort().join('|'); renderGauges(); }
  renderBottom();
  host.guide?.say('세 줄에서 하나씩 골라 봐. 그다음 실험하기.', { speaker: host.speaker, cue: rings });
}

/* ===== 장면 6 — 공동약속 ===== */
function renderPledge(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const lines = buildPledge(content, p);
  const done = p.missionCompleted;
  // 약속의 근거로 학생이 대륙에서 모은 신호 이름을 그대로 인용한다 — 산출물이 마지막 장면까지 쓰인다.
  const bag = collectedEarthSignals();
  const related = bag.filter((signal) => issueIdForSignal(signal) === p.selectedIssueId);
  const cited = (related.length ? related : bag).slice(0, 4);
  body.innerHTML = `
    <div class="ec">
      ${head('세계 친구 공동약속', content.titles.coreExpression)}
      <div class="ec-pledge" id="ec-pledge">
        ${cited.length ? `<p class="ec-line" style="border-left-color:var(--c-turquoise)">이 약속의 근거 — 내가 여행에서 모은 신호: ${cited.map((signal) => `<em>${esc(continentLabel(signal.missionId))} ‘${esc(signal.label)}’</em>`).join(', ')}</p>` : ''}
        ${lines.slice(0, 5).map((l) => `<p class="ec-line">${highlight(l)}</p>`).join('')}
        <div class="ec-line" style="border-left-color:var(--c-coral)">
          <label for="ec-personal" style="display:block;margin-bottom:6px">내가 먼저 시작할 일은 …</label>
          <textarea class="ec-input" id="ec-personal" rows="2" maxlength="120" ${done ? 'disabled' : ''} placeholder="예: 매주 월요일 등굣길에 물병을 챙기고, 한 달 뒤 우리 반 일회용 컵 수를 세어 본다">${esc(p.personalActionDraft)}</textarea>
          <div id="ec-fb" style="margin-top:6px"></div>
        </div>
      </div>
    </div>`;
  const input = body.querySelector<HTMLTextAreaElement>('#ec-personal')!;
  const fb = body.querySelector<HTMLElement>('#ec-fb')!;
  const pledgeBox = body.querySelector<HTMLElement>('#ec-pledge');
  if (pledgeBox) keepFitted(pledgeBox, () => Array.from(pledgeBox.querySelectorAll<HTMLElement>('p,label,em,textarea')), 13);
  input.addEventListener('input', () => { p.personalActionDraft = input.value.slice(0, 120); host.save(); renderBottom(); });

  const renderBottom = () => {
    const problem = personalActionIssue(content, p.personalActionDraft);
    bottom.innerHTML = done
      ? `<button class="btn btn-primary btn-big" data-act="finish">완료 기록 보기</button>`
      : `<button class="btn btn-ghost" data-act="back">해결안 다시 보기</button>
         <button class="btn btn-primary btn-big" data-act="finish" ${problem ? 'disabled' : ''}>공동약속 완성하기</button>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => goto(host, 'actions'));
    bottom.querySelector('[data-act="finish"]')?.addEventListener('click', () => {
      if (host.isDisposed()) return;
      if (done) { host.onFinish(); return; }
      const issue = personalActionIssue(content, p.personalActionDraft);
      if (issue) { showFeedback(fb, 'partial', issue, 'dialogue'); return; }
      p.jointPledgeDraft = buildPledge(content, p).join('\n');
      p.missionCompleted = true;
      p.scene = 'done';
      host.save();
      playFinale(host, () => host.onFinish());
    });
  };
  renderBottom();
  host.guide?.say(done ? '약속은 여권에 남았어. 완료 기록을 확인해.' : '마지막 줄은 네 말로 써 줘. 언제, 어디서, 누구와?', { speaker: host.speaker, cue: input });
}

function highlight(line: string): string {
  // 채워진 부분을 강조 — 콘텐츠 문장 틀의 고정 어미 앞 구간
  const m = line.match(/^(.*?(?:문제는|이 문제는|생활에서는|지역사회에서는|여러 나라는)\s)(.+?)([을를] 통해 여러 지역과 연결되어 있습니다\.|[을를] 실천할 수 있습니다\.|[을를] 함께할 수 있습니다\.|[을를] 위해 협력해야 합니다\.|입니다\.)$/);
  return m ? `${esc(m[1]!)}<em>${esc(m[2]!)}</em>${esc(m[3]!)}` : esc(line);
}

/* ===== 완료 연출 — 조각 모으기 → 연결선 → 핵심 문장 → (호출자) 기존 여권 도장 ===== */
function playFinale(host: EarthSceneHost, onDone: () => void): void {
  const { content, progress: p, body } = host;
  const reduced = reducedMotion();
  const issue = content.issues.find((i) => i.id === p.selectedIssueId);
  const lines = buildPledge(content, p);
  const completedGlobalCouncil = p.inspectedIssueIds.length >= content.issues.length && Boolean(p.personalActionDraft.trim());
  const overlay = document.createElement('div');
  overlay.className = 'ec-finale';
  const finaleBackgroundId = 'earth.council.finale';
  const hasFinaleBackground = hasAsset(finaleBackgroundId);
  if (hasFinaleBackground) {
    overlay.classList.add('has-earth-bg');
    overlay.style.backgroundImage = `linear-gradient(180deg,rgba(2,12,30,.08),rgba(2,12,30,.24) 55%,rgba(2,12,30,.68)),url('${assetUrl(finaleBackgroundId)}')`;
  }
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  const n = content.friends.length;
  const finalePledge = completedGlobalCouncil ? `나의 약속 — ${p.personalActionDraft}` : (lines[5] ?? '');
  const finaleNote = completedGlobalCouncil
    ? '여섯 친구의 문제·해결책·약속이 지구를 한 바퀴 돌고, 나의 약속으로 완성됐어요.'
    : '여섯 친구의 약속이 하나의 지구로 이어졌어요.';
  overlay.innerHTML = `
    <div class="ec-f-friends" aria-hidden="true">
      ${content.friends.map((f, i) => { const a = (i / n) * Math.PI * 2; return `<span class="ec-f-friend" data-i="${i}" style="left:${50 + Math.cos(a) * 42}%;top:${50 + Math.sin(a) * 40}%">${img(f.imageId, '')}</span>`; }).join('')}
    </div>
    ${hasFinaleBackground ? '' : img(hasAsset('reward.globe_puzzle') ? 'reward.globe_puzzle' : 'prop.globe', '완성된 지구본', 'ec-f-globe')}
    ${completedGlobalCouncil ? `<div class="ec-f-topics" aria-hidden="true">${content.issues.map((item, index) => `<span style="--topic-i:${index}">${esc(item.title)}</span>`).join('')}</div>` : ''}
    <div class="ec-f-copy">
      <h2>${esc(completedGlobalCouncil ? '네 가지 환경문제를 하나의 약속으로 이었어요!' : (issue ? `우리는 ${issue.title} 문제를 함께 풀기로 했어요.` : '우리는 지구를 함께 돌보기로 했어요.'))}</h2>
      <p id="ec-finale-pledge"></p>
      <p class="ec-note" id="ec-finale-note"></p>
      <button type="button" class="btn btn-primary btn-big" data-act="finale-continue" hidden>최종 결과 보기</button>
    </div>`;
  body.appendChild(overlay);
  typeText(overlay.querySelector<HTMLElement>('#ec-finale-pledge')!, finalePledge, 28);
  window.setTimeout(() => {
    const note = overlay.querySelector<HTMLElement>('#ec-finale-note');
    if (note) typeText(note, finaleNote, 22);
  }, reduced ? 0 : Math.min(1600, finalePledge.length * 28 + 180));
  void audio.playSfx('complete');
  const celebrationAnchor = overlay.querySelector<HTMLElement>('.ec-f-globe') ?? overlay.querySelector<HTMLElement>('.ec-f-copy');
  if (celebrationAnchor) burstConfetti(celebrationAnchor, 10);
  const total = reduced ? 300 : 2600;
  if (!reduced) {
    window.setTimeout(() => {
      overlay.querySelectorAll<HTMLElement>('.ec-f-friend').forEach((el, i) => {
        const a = (i / n) * Math.PI * 2;
        el.style.left = `${50 + Math.cos(a) * 24}%`;
        el.style.top = `${50 + Math.sin(a) * 26}%`;
      });
    }, 350);
  }
  // 자동 소멸 대신 학생이 자기 약속 문장을 읽고 직접 넘어간다 — 연출이 3.5초 만에 사라져 못 읽는 사고 방지.
  // 연출을 정리한 뒤 다음 모달(배움 카드·도장)을 연다 — 남겨 두면 모달 뒤에 비쳐 겹쳐 보인다.
  const continueBtn = overlay.querySelector<HTMLButtonElement>('[data-act="finale-continue"]')!;
  continueBtn.addEventListener('click', () => {
    overlay.remove();
    if (!host.isDisposed()) onDone();
  });
  window.setTimeout(() => {
    continueBtn.hidden = false;
    continueBtn.focus();
  }, total + (reduced ? 0 : 900));
}

export type { ActionTierId };
