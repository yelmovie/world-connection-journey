/**
 * 최종 단계 "하나의 지구, 여섯 개의 신호" — 장면 렌더러.
 * 신호 발견 → 지도 연결 → 문제 선택 → 원탁회의 → 해결안 실험 → 공동약속 → 완료 연출.
 * 상태·판정은 core/earthCouncil.ts, 저장은 host.save()가 맡는다.
 */
import { assetUrl, hasAsset } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import {
  buildPledge, canOpenCouncil, canRunSimulation, friendCountForIssue, MIN_CONNECTIONS, MIN_PERSPECTIVES_LISTENED,
  MIN_SIGNALS_TO_CONNECT, personalActionIssue, signalsForLens, simulate,
  type ActionTierId, type ConnectionType, type EarthContent, type EarthFriend, type EnvironmentalSignal,
  type GlobalEnvironmentProgress, type Level
} from '../core/earthCouncil';
import { burstConfetti, popBounce } from '../ui/fx';
import type { GuideController, GuideSpeaker } from '../ui/guide';
import { showFeedback } from '../ui/feedback';
import { collectedEarthSignals, continentLabel } from '../core/earthSignals';
import { withJosa } from '../core/josa';

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
    'bg.map', 'bg.spare', 'earth.council.globe', 'earth.council.finale',
    'prop.globe3d', 'prop.globe', 'reward.globe_puzzle',
    ...content.friends.map((f) => f.imageId),
    ...content.signals.map((s) => signalImageId(content, s)),
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

/* ===== 음성 — 기기 내장 합성. 없으면 자막만. ===== */
let speakingUtterance: SpeechSynthesisUtterance | null = null;
export function speak(text: string): boolean {
  if (typeof speechSynthesis === 'undefined' || !saveRepo.get().settings.sfx) return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.95;
    speakingUtterance = u;
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
export function stopSpeaking(): void {
  if (typeof speechSynthesis === 'undefined') return;
  try { speechSynthesis.cancel(); } catch { /* 무시 */ }
  speakingUtterance = null;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));

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
const LENS_ICON: Record<ConnectionType, string> = { ocean: 'wave', air: 'wind', climate: 'sun', ecosystem: 'paw', resource: 'box' };

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

/* 장면 1 — 사진 */
.ec-photo-row { flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.9fr) minmax(300px,1fr);grid-template-rows:minmax(0,1fr);gap:var(--sp-3); }
.ec-photo { position:relative;min-height:160px;height:100%;border-radius:var(--radius-l);overflow:hidden;background:#0d2238;box-shadow:var(--shadow-pop);cursor:crosshair;touch-action:manipulation; }
.ec-photo img { width:100%;height:100%;object-fit:cover;display:block; }
.ec-spot { position:absolute;transform:translate(-50%,-50%);width:max(64px,6vw);height:max(64px,6vw);border-radius:50%;border:0;background:transparent;cursor:pointer;padding:0; }
.ec-spot:focus-visible { outline:4px solid var(--c-gold);outline-offset:2px; }
.ec-spot.is-hint::after { content:'';position:absolute;inset:6px;border-radius:50%;border:3px solid rgba(255,255,255,.9);animation:ec-ping 1.4s ease-out infinite; }
.ec-spot.is-found { cursor:default; }
.ec-spot.is-found::before { content:'';position:absolute;inset:0;border-radius:50%;border:5px solid var(--c-gold);box-shadow:0 0 0 4px rgba(0,0,0,.35),inset 0 0 0 3px rgba(0,0,0,.25); }
.ec-spot-label { position:absolute;left:50%;top:100%;transform:translate(-50%,6px);white-space:nowrap;background:rgba(255,252,240,.95);color:var(--c-ink);border-radius:999px;padding:4px 12px;font:800 max(16px,var(--fs-small))/1.2 var(--font-body);box-shadow:var(--shadow-card);pointer-events:none; }
.ec-lens { position:absolute;width:min(34%,260px);aspect-ratio:1;border-radius:50%;border:6px solid #fff;box-shadow:var(--shadow-pop);background-repeat:no-repeat;pointer-events:none;right:3%;top:5%;transition:opacity 220ms; }
.ec-ripple { position:absolute;width:40px;height:40px;border-radius:50%;border:3px solid #fff;transform:translate(-50%,-50%);pointer-events:none;animation:ec-ripple .5s ease-out forwards; }
@keyframes ec-ripple { to { transform:translate(-50%,-50%) scale(2.4);opacity:0; } }
.ec-photo-side {align-self:start;max-height:100%;overflow:auto; min-height:0;display:flex;flex-direction:column;gap:var(--sp-2);overflow-y:auto; }
.ec-photo-side .ec-portrait { width:clamp(96px,10vw,150px);height:clamp(96px,10vw,150px);object-fit:contain;align-self:center; }
.ec-scope { font-size:max(16px,var(--fs-small));color:var(--c-ink-soft);font-weight:700;line-height:1.35; }
.ec-progress { display:inline-flex;gap:6px;align-items:center;justify-content:center;font:900 max(20px,var(--fs-body)) var(--font-head);color:var(--c-violet-ink); }

/* 장면 2 — 지도 연결 */
.ec-connect { flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);grid-template-rows:minmax(0,1fr);gap:var(--sp-3); }
.ec-map { position:relative;min-height:160px;height:100%;border-radius:var(--radius-l);overflow:hidden;background:#69b9dc center/cover no-repeat;box-shadow:var(--shadow-pop); }
.ec-map svg.ec-flows { position:absolute;inset:0;width:100%;height:100%;pointer-events:none; }
.ec-flow { fill:none;stroke-width:6;stroke-linecap:round;stroke:rgba(255,255,255,.95);stroke-dasharray:14 14;filter:drop-shadow(0 2px 6px rgba(0,0,0,.45));animation:ec-dash 1.6s linear infinite; }
.ec-flow[data-lens="ocean"] { stroke:#7fe3ff; } .ec-flow[data-lens="air"] { stroke:#e6f4ff;stroke-dasharray:4 16; }
.ec-flow[data-lens="climate"] { stroke:#ffd46b; } .ec-flow[data-lens="ecosystem"] { stroke:#9ff59b; } .ec-flow[data-lens="resource"] { stroke:#ffb3a1; }
@keyframes ec-dash { to { stroke-dashoffset:-56; } }
.ec-pin { position:absolute;transform:translate(-50%,-50%);width:var(--hotspot-min);height:var(--hotspot-min);min-width:var(--hotspot-min);border-radius:50%;border:4px solid #fff;background:rgba(255,252,240,.95);padding:0;cursor:pointer;box-shadow:var(--shadow-pop);display:flex;align-items:center;justify-content:center;transition:transform 200ms,opacity 200ms; }
.ec-pin img { width:88%;height:88%;object-fit:contain;border-radius:50%; }
.ec-pin .ec-pin-name { position:absolute;top:100%;left:50%;transform:translate(-50%,4px);white-space:nowrap;background:rgba(255,252,240,.95);border-radius:999px;padding:2px 10px;font:800 max(16px,var(--fs-small))/1.2 var(--font-body);color:var(--c-ink);box-shadow:var(--shadow-card);pointer-events:none; }
.ec-pin.is-dim { opacity:.42;transform:translate(-50%,-50%) scale(.9); }
.ec-pin.is-lit { transform:translate(-50%,-50%) scale(1.14);border-color:var(--c-gold);box-shadow:0 0 0 6px rgba(242,193,78,.45),var(--shadow-pop); }
.ec-pin[aria-pressed="true"] { border-color:var(--c-violet);box-shadow:0 0 0 6px rgba(108,76,232,.4),var(--shadow-pop); }
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
.ec-starters { display:flex;flex-wrap:wrap;gap:6px; }
.ec-starters .btn { min-height:44px;font-size:max(16px,var(--fs-small)); }

/* 새 공동회의 — 여섯 친구가 한 원을 만들고 문제·해결책·약속을 차례로 말한다. */
.ec-council-screen { padding:6px;border-radius:var(--radius-l);background:linear-gradient(rgba(5,24,46,.3),rgba(4,19,38,.55));overflow:hidden; }
.ec-council-stage { position:relative;flex:1;min-height:0;overflow:hidden;border-radius:var(--radius-l);background:radial-gradient(circle at 50% 48%,rgba(43,161,192,.28),rgba(4,26,50,.18) 43%,rgba(2,15,33,.5) 100%); }
.ec-council-world { position:absolute;left:50%;top:50%;width:min(24vh,230px);transform:translate(-50%,-50%);filter:drop-shadow(0 12px 28px rgba(56,206,246,.5));opacity:.88;animation:ec-float 4s ease-in-out infinite; }
.ec-council-friend { position:absolute;z-index:3;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px;border:0;background:transparent;pointer-events:none;animation:ec-friend-arrive 620ms cubic-bezier(.2,.8,.3,1) both; }
.ec-council-friend img { width:clamp(58px,8.5vh,108px);height:clamp(58px,8.5vh,108px);object-fit:contain;filter:drop-shadow(0 8px 12px rgba(0,0,0,.52));transition:transform 320ms,filter 320ms; }
.ec-council-friend span { padding:2px 9px;border-radius:999px;background:rgba(255,253,244,.94);font:900 clamp(13px,.9vw,17px)/1.15 var(--font-body);color:var(--c-navy);box-shadow:var(--shadow-card);white-space:nowrap; }
.ec-council-friend.is-speaking img { transform:scale(1.2) translateY(-4px);filter:drop-shadow(0 0 16px rgba(255,223,92,.95)); }
.ec-council-friend.is-speaking span { background:#fff0a8; }
@keyframes ec-friend-arrive { from{opacity:0;transform:translate(-50%,-50%) scale(.55)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
.ec-council-core { position:absolute;z-index:4;left:50%;top:50%;width:min(650px,58%);transform:translate(-50%,-50%); }
.ec-council-bubble { position:relative;padding:clamp(14px,2vh,22px) clamp(18px,2vw,28px);border:4px solid #fff;border-radius:30px;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(242,249,255,.96));box-shadow:0 18px 42px rgba(0,0,0,.38),0 0 0 6px rgba(75,208,242,.22);text-align:center;animation:ec-bubble-in 430ms cubic-bezier(.2,.85,.25,1); }
.ec-council-bubble::after { content:'';position:absolute;left:50%;bottom:-18px;transform:translateX(-50%) rotate(45deg);width:30px;height:30px;background:#f2f9ff;border-right:4px solid #fff;border-bottom:4px solid #fff; }
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
.ec-finale .ec-f-copy p { margin:3px 0;color:#f7fbff;font-weight:800; }
.ec-finale .ec-f-globe { width:min(30vh,280px);filter:drop-shadow(0 12px 30px rgba(120,220,255,.5)); }
.ec-finale .ec-f-friends { position:absolute;inset:0;pointer-events:none; }
.ec-finale .ec-f-friend { position:absolute;width:clamp(64px,8vw,120px);transform:translate(-50%,-50%);transition:left 900ms cubic-bezier(.2,.8,.3,1),top 900ms cubic-bezier(.2,.8,.3,1),opacity 600ms; }
.ec-finale .ec-f-piece { position:absolute;left:50%;top:-8px;transform:translateX(-50%);width:26px;height:26px;border-radius:6px;background:var(--c-gold);box-shadow:var(--shadow-card); }
.ec-finale h2 { margin:0;font:900 clamp(26px,3vw,48px)/1.25 var(--font-head);color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6);max-width:22em;word-break:keep-all; }
.ec-finale p { margin:0;font:700 max(20px,var(--fs-body))/1.4 var(--font-body);color:#f5f9ff;max-width:30em; }
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
  .ec-rings { gap:4px; } .ec-ring { padding:4px 6px; } .ec-act { min-height:60px;font-size:max(16px,var(--fs-small)); }
}
@media (max-height:760px) {
  .ec-head .ribbon-sub { display:none; }
  .ec-note { font-size:16px; }
  .ec-orbit .ec-globe { width:min(29vh,250px); }
  .ec-issue-title { font-size:clamp(19px,1.45vw,27px);bottom:12px; }
  .ec-council-core { width:min(610px,57%); }
}
@media (max-height:640px) {
  .ec-photo-row,.ec-connect,.ec-actions { grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr); }
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
function listenButton(text: string): string {
  return `<button type="button" class="btn btn-ghost ec-btn-icon" data-speak="${esc(text)}">${icon('mail', 22)} 듣기</button>`;
}
function bindSpeak(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-speak]').forEach((b) => {
    b.addEventListener('click', () => {
      if (!speak(b.dataset.speak ?? '')) b.textContent = '이 기기에서는 음성을 지원하지 않아요. 자막을 읽어 주세요.';
    });
  });
}

export function renderEarthScene(host: EarthSceneHost): void {
  stopSpeaking();
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
      ${head(t.mission, '친구들의 마지막 사진')}
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
        <button type="button" class="ec-spot${observed || found.has(h.id) ? ' is-found' : ''}" data-spot="${h.id}"
          style="left:${h.x * 100}%;top:${h.y * 100}%" aria-label="관찰 지점: ${esc(h.label)}">
          ${observed || found.has(h.id) ? `<span class="ec-spot-label">${esc(h.label)}</span>` : ''}
        </button>`).join('')}
      <div class="ec-lens" id="ec-lens" style="opacity:0" aria-hidden="true"></div>`;
    side.innerHTML = `
      ${img(f.imageId, `${f.name} 캐릭터`, 'ec-portrait')}
      <div style="text-align:center"><span class="chip">${esc(f.country)} · ${esc(f.name)}</span></div>
      <p class="ec-copy" id="ec-prompt">${esc(allFound ? s.titleKo : s.observationPromptKo)}</p>
      <p class="ec-sub" id="ec-sub" ${allFound ? '' : 'hidden'}>${esc(s.narrationKo)}</p>
      <div id="ec-react" ${allFound ? '' : 'hidden'} style="display:${allFound ? 'grid' : 'none'};gap:6px">
        <p class="ec-copy" style="color:var(--c-sky-ink)">${esc(s.reactionKo)}</p>
        ${listenButton(`${s.narrationKo} ${s.reactionKo}`)}
      </div>
      <div id="ec-fb"></div>`;
    bindSpeak(side);
    renderStrip();

    const spots = Array.from(photo.querySelectorAll<HTMLButtonElement>('.ec-spot'));
    const lens = photo.querySelector<HTMLElement>('#ec-lens')!;
    const showLens = (h: { x: number; y: number }) => {
      if (!hasAsset(imageId)) return;
      lens.style.backgroundImage = `url('${assetUrl(imageId)}')`;
      lens.style.backgroundSize = '300% 300%';
      lens.style.backgroundPosition = `${h.x * 100}% ${h.y * 100}%`;
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
        b.innerHTML = `<span class="ec-spot-label">${esc(h.label)}</span>`;
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
      if (allFound || observed) return;
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
      const sub = side.querySelector<HTMLElement>('#ec-sub');
      const react = side.querySelector<HTMLElement>('#ec-react');
      const prompt = side.querySelector<HTMLElement>('#ec-prompt');
      if (prompt) prompt.textContent = s.titleKo;
      if (sub) sub.hidden = false;
      if (react) { react.hidden = false; react.style.display = 'grid'; }
      speak(s.narrationKo);
      host.guide?.say(`${f.name}의 설명을 보고 지도에 신호를 남겨.`, { speaker: { assetId: f.imageId, name: f.name }, cue: bottom.querySelector<HTMLElement>('[data-act="record"]') });
      renderBottom(true);
    };

    renderBottom(allFound);
    if (!allFound) {
      host.guide?.say(s.observationPromptKo, { speaker: { assetId: f.imageId, name: f.name }, cue: photo });
    } else if (!firstUnobserved) {
      host.guide?.say('여섯 신호를 모두 기록했어. 이제 지도에서 연결을 확인하자.', { speaker: host.speaker, cue: bottom.querySelector<HTMLElement>('[data-act="connect"]') });
    }
  };

  const renderBottom = (recordable: boolean) => {
    const observed = p.signalObservedIds.includes(current.id);
    const n = p.signalObservedIds.length;
    const hasNext = content.signals.some((s) => !p.signalObservedIds.includes(s.id));
    const canConnect = n >= MIN_SIGNALS_TO_CONNECT;
    bottom.innerHTML = `
      <span class="ec-progress" aria-live="polite">${n >= content.signals.length ? '신호를 모두 기록했어!' : '신호를 눌러 기록해 봐'}</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      ${observed
        ? `${hasNext ? `<button class="btn btn-primary btn-big" data-act="next-photo">다음 사진 보기</button>` : ''}
           ${canConnect ? `<button class="btn ${hasNext ? 'btn-ghost' : 'btn-primary'} btn-big" data-act="connect">지도에서 연결 확인하기</button>` : ''}`
        : `<button class="btn btn-primary btn-big" data-act="record" ${recordable ? '' : 'disabled'}>지도에 신호 남기기</button>`}
      </span>`;
    bottom.querySelector('[data-act="record"]')?.addEventListener('click', () => {
      if (host.isDisposed() || p.signalObservedIds.includes(current.id)) return;
      p.signalObservedIds.push(current.id);
      host.save();
      void audio.playSfx('success');
      const fb = side.querySelector<HTMLElement>('#ec-fb');
      if (fb) showFeedback(fb, 'success', '지도에 신호를 남겼어요.', 'dialogue');
      const tab = strip.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (tab) burstConfetti(tab, 6);
      renderStrip();
      renderBottom(true);
    });
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
  const t = content.titles;
  let anchor: EnvironmentalSignal | null = null;
  let lens: ConnectionType | null = null;
  const observed = content.signals.filter((s) => p.signalObservedIds.includes(s.id));

  body.innerHTML = `
    <div class="ec">
      ${head('국경을 넘는 신호', '지구 연결 렌즈로 보기')}
      <div class="ec-connect">
        <div class="ec-map" id="ec-map" style="background-image:url('${assetUrl('bg.map')}')" aria-label="세계지도 위 환경 신호">
          <svg class="ec-flows" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
        </div>
        <section class="panel ec-side" id="ec-side"></section>
      </div>
      <p class="ec-note">${esc(t.connectionNote)}</p>
    </div>`;
  const map = body.querySelector<HTMLElement>('#ec-map')!;
  const flows = map.querySelector<SVGSVGElement>('svg')!;
  const side = body.querySelector<HTMLElement>('#ec-side')!;
  const pins = new Map<string, HTMLButtonElement>();

  observed.forEach((s) => {
    const f = friendOf(content, s.friendId);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ec-pin';
    b.style.left = `${f.mapX * 100}%`;
    b.style.top = `${f.mapY * 100}%`;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${f.country} ${f.name}의 신호: ${s.titleKo}`);
    b.innerHTML = `${img(f.imageId, '')}<span class="ec-pin-name">${esc(s.titleKo)}</span>`;
    b.addEventListener('click', () => { if (host.isDisposed()) return; void audio.playSfx('tap'); anchor = s; lens = null; sync(); });
    pins.set(s.id, b);
    map.appendChild(b);
  });

  const drawFlows = () => {
    flows.innerHTML = '';
    if (!anchor || !lens) return;
    const a = friendOf(content, anchor.friendId);
    signalsForLens(content, lens, anchor.id).filter((s) => s.id !== anchor!.id && p.signalObservedIds.includes(s.id)).forEach((s) => {
      const f = friendOf(content, s.friendId);
      const x1 = a.mapX * 100, y1 = a.mapY * 100, x2 = f.mapX * 100, y2 = f.mapY * 100;
      const cx = (x1 + x2) / 2, cy = Math.max(6, Math.min(y1, y2) - 14);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
      path.setAttribute('class', 'ec-flow');
      path.dataset.lens = lens!;
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      flows.appendChild(path);
    });
  };

  const sync = () => {
    const lit = anchor && lens ? new Set(signalsForLens(content, lens, anchor.id).map((s) => s.id)) : null;
    pins.forEach((b, id) => {
      b.setAttribute('aria-pressed', String(anchor?.id === id));
      b.classList.toggle('is-lit', !!lit && lit.has(id) && anchor?.id !== id);
      b.classList.toggle('is-dim', !!lit && !lit.has(id));
    });
    drawFlows();
    renderSide();
    renderBottom();
  };

  const renderSide = () => {
    const done = p.exploredConnectionTypes;
    side.innerHTML = `
      <p class="ec-copy" id="ec-step">${anchor ? `${esc(anchor.titleKo)} — 어떤 렌즈로 볼까?` : '지도에서 신호 하나를 골라요.'}</p>
      <div class="ec-lenses" role="group" aria-label="지구 연결 렌즈">
        ${content.lenses.map((l) => `
          <button type="button" class="ec-lens-btn${done.includes(l.id) ? ' is-done' : ''}" data-lens="${l.id}"
            aria-pressed="${String(lens === l.id)}" ${anchor ? '' : 'disabled'} aria-label="${esc(l.name)} 렌즈${done.includes(l.id) ? ', 확인함' : ''}">
            ${icon(LENS_ICON[l.id], 28)}<span>${esc(l.name)}</span></button>`).join('')}
      </div>
      <div id="ec-reasons" class="ec-reasons"></div>
      <div id="ec-fb"></div>
      <p class="ec-progress">${done.length >= MIN_CONNECTIONS ? '국경을 넘는 신호 연결 완료 ✓' : '국경을 넘는 신호를 이어 봐'}</p>`;
    side.querySelectorAll<HTMLButtonElement>('[data-lens]').forEach((b) => {
      b.addEventListener('click', () => {
        if (host.isDisposed() || !anchor) return;
        void audio.playSfx('whoosh');
        lens = b.dataset.lens as ConnectionType;
        sync();
      });
    });
    if (anchor && lens) {
      const l = content.lenses.find((x) => x.id === lens)!;
      const linked = signalsForLens(content, lens, anchor.id).filter((s) => s.id !== anchor!.id && p.signalObservedIds.includes(s.id));
      const reasonsEl = side.querySelector<HTMLElement>('#ec-reasons')!;
      const fb = side.querySelector<HTMLElement>('#ec-fb')!;
      const explored = p.exploredConnectionTypes.includes(lens);
      if (!anchor.connectionTypes.includes(lens)) {
        reasonsEl.innerHTML = `<p class="ec-copy" style="color:var(--c-ink-soft)">${esc(anchor.titleKo)}은(는) ${esc(l.name)} 렌즈로는 잘 이어지지 않아요. 다른 렌즈나 다른 신호를 골라 봐요.</p>`;
        host.guide?.say(`이 신호는 ${l.name}보다 다른 렌즈가 맞아.`, { speaker: host.speaker, cue: side.querySelector<HTMLElement>('.ec-lenses') });
        return;
      }
      const linkedNames = linked.map((s) => friendOf(content, s.friendId).name).join(', ');
      reasonsEl.innerHTML = `
        <p class="ec-copy">${esc(l.name)} 렌즈: ${linked.length ? `${esc(linkedNames)}의 신호와 이어져요.` : '다른 신호가 더 기록되면 연결이 보여요.'}</p>
        <p class="ec-copy" style="color:var(--c-ink-soft)">왜 이어질까?</p>
        ${content.connectionReasons[lens].map((r) => `<button type="button" class="card card-pick ec-reason" data-reason="${r.id}" ${explored ? 'disabled' : ''}>${esc(r.text)}</button>`).join('')}`;
      if (explored) showFeedback(fb, 'success', l.hint, 'dialogue');
      const options = Array.from(reasonsEl.querySelectorAll<HTMLButtonElement>('[data-reason]'));
      const shuffled = options.slice().sort(() => (hashSeed(lens!) % 2 === 0 ? 1 : -1));
      shuffled.forEach((b) => reasonsEl.appendChild(b));
      options.forEach((b) => {
        b.addEventListener('click', () => {
          if (host.isDisposed() || !lens) return;
          const r = content.connectionReasons[lens].find((x) => x.id === b.dataset.reason);
          if (!r) return;
          if (r.fits) {
            options.forEach((o) => (o.disabled = true));
            b.classList.add('is-selected');
            if (!p.exploredConnectionTypes.includes(lens)) p.exploredConnectionTypes.push(lens);
            host.save();
            showFeedback(fb, 'success', t.connectionFeedback, 'dialogue');
            burstConfetti(b, 8);
            host.guide?.say(l.hint, { speaker: host.speaker });
            renderSide();
            renderBottom();
          } else {
            b.disabled = true;
            b.classList.add('is-wrong');
            showFeedback(fb, 'partial', '지도의 흐름을 다시 봐요. 어디로 이어지고 있나요?', 'dialogue');
            host.guide?.say(l.hint, { speaker: host.speaker, cue: map });
          }
        });
      });
      host.guide?.say(`${l.name} 렌즈로 보면 어떤 신호가 함께 빛나는지 봐.`, { speaker: host.speaker, cue: reasonsEl });
    } else if (anchor) {
      host.guide?.say('렌즈 하나를 골라 어떤 지역과 이어지는지 확인해.', { speaker: host.speaker, cue: side.querySelector<HTMLElement>('.ec-lenses') });
    } else {
      host.guide?.say('지도의 친구 신호를 하나 눌러 봐.', { speaker: host.speaker, cue: map });
    }
  };

  const renderBottom = () => {
    const ready = canOpenCouncil(p);
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="back">사진 다시 보기</button>
      <button class="btn btn-primary btn-big" data-act="council" ${ready ? '' : 'disabled'}>${esc(t.council)} 열기</button>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => goto(host, 'signals'));
    bottom.querySelector('[data-act="council"]')?.addEventListener('click', () => { if (ready) goto(host, 'issue'); });
  };

  sync();
}

function hashSeed(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
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
      speak(issue.title);
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
  let timer: number | null = null;

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

  const stage = body.querySelector<HTMLElement>('#ec-council-stage')!;
  const friendsEl = body.querySelector<HTMLElement>('#ec-council-friends')!;
  const core = body.querySelector<HTMLElement>('#ec-council-core')!;
  const dots = body.querySelector<HTMLElement>('#ec-council-dots')!;
  const clearTimer = () => { if (timer !== null) window.clearTimeout(timer); timer = null; };

  content.friends.forEach((friend, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, content.friends.length);
    const seat = document.createElement('div');
    seat.className = 'ec-council-friend';
    seat.dataset.friendId = friend.id;
    seat.style.left = `${50 + Math.cos(angle) * 42}%`;
    seat.style.top = `${50 + Math.sin(angle) * 35}%`;
    seat.style.animationDelay = `${index * 90}ms`;
    seat.innerHTML = `${img(friend.imageId, '')}<span>${esc(friend.name)} · ${esc(friend.country)}</span>`;
    friendsEl.appendChild(seat);
  });

  const renderDots = (active: number) => {
    dots.innerHTML = turns.map((_, index) => `<span class="ec-council-dot${index === active ? ' is-on' : ''}"></span>`).join('');
  };

  const showPlayerTurn = () => {
    clearTimer();
    p.councilTurnIndex = turns.length;
    host.save();
    friendsEl.querySelectorAll('.ec-council-friend').forEach((friend) => friend.classList.remove('is-speaking'));
    renderDots(-1);
    core.innerHTML = `
      <div class="ec-council-bubble ec-player-bubble">
        <span class="ec-council-phase" data-phase="약속">이제 내 차례</span>
        <label for="ec-player-pledge">친구들에게 내가 할 약속을 말해 봐</label>
        <textarea class="ec-input" id="ec-player-pledge" rows="3" maxlength="120" placeholder="예: 금요일 학교에서 친구와 물병을 쓰고 쓰레기를 줄일래.">${esc(p.personalActionDraft)}</textarea>
        <p class="ec-player-hint" id="ec-player-hint">언제·어디서·누구와 할지 넣으면 더 좋아.</p>
      </div>`;
    const input = core.querySelector<HTMLTextAreaElement>('#ec-player-pledge')!;
    const hint = core.querySelector<HTMLElement>('#ec-player-hint')!;
    const validate = () => {
      const issue = personalActionIssue(content, input.value);
      hint.textContent = issue ?? '좋아! 친구들과 지킬 수 있는 약속이 되었어.';
      hint.style.color = issue ? '' : 'var(--c-success-ink)';
      return issue;
    };
    input.addEventListener('input', () => {
      p.personalActionDraft = input.value.slice(0, 120);
      host.save();
      validate();
    });
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="replay">친구 이야기 다시 듣기</button>
      <button class="btn btn-primary btn-big" data-act="finish">내 약속으로 회의 마치기</button>`;
    bottom.querySelector('[data-act="replay"]')?.addEventListener('click', () => { p.councilTurnIndex = 0; host.save(); showTurn(0); });
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
    input.focus();
  };

  const scheduleNext = (index: number) => {
    clearTimer();
    timer = window.setTimeout(() => {
      if (!stage.isConnected || host.isDisposed()) return;
      if (index + 1 < turns.length) showTurn(index + 1);
      else showPlayerTurn();
    }, 6500);
  };

  const showTurn = (index: number) => {
    clearTimer();
    const turn = turns[index];
    if (!turn) { showPlayerTurn(); return; }
    p.councilTurnIndex = index;
    host.save();
    const friend = friendOf(content, turn.friendId);
    friendsEl.querySelectorAll<HTMLElement>('.ec-council-friend').forEach((el) => el.classList.toggle('is-speaking', el.dataset.friendId === friend.id));
    core.innerHTML = `
      <div class="ec-council-bubble">
        <span class="ec-council-phase" data-phase="${esc(turn.phase)}">${esc(turn.phase)}</span>
        <h2>${esc(friend.name)} · ${esc(friend.country)}</h2>
        <p>${esc(turn.line)}</p>
      </div>`;
    renderDots(index);
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="back">문제 다시 보기</button>
      <button class="btn btn-primary btn-big" data-act="next">${index + 1 < turns.length ? '다음 이야기' : '내 약속 말하기'}</button>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => { clearTimer(); goto(host, 'issue'); });
    bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      if (index + 1 < turns.length) showTurn(index + 1);
      else showPlayerTurn();
    });
    speak(turn.line);
    scheduleNext(index);
  };

  showTurn(Math.min(Math.max(0, p.councilTurnIndex), turns.length));
}

void renderIssueLegacy;
void renderRoundtableLegacy;

function renderIssueLegacy(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const t = content.titles;
  const bag = collectedEarthSignals();
  body.innerHTML = `
    <div class="ec ec-issue-screen">
      ${head(t.council, t.councilSub)}
      <p class="ec-note">더 알아보고 싶은 환경문제 하나를 골라요. 정답은 없어요. 나중에 다른 문제로 다시 열 수 있어요.</p>
      <div class="ec-orbit">
        <div class="ec-issues" id="ec-issues-left"></div>
        ${img(hasAsset('earth.council.globe') ? 'earth.council.globe' : (hasAsset('prop.globe3d') ? 'prop.globe3d' : 'prop.globe'), '환경 신호가 이어진 지구본', 'ec-globe')}
        <div class="ec-issues" id="ec-issues-right"></div>
      </div>
    </div>`;
  const left = body.querySelector<HTMLElement>('#ec-issues-left')!;
  const right = body.querySelector<HTMLElement>('#ec-issues-right')!;
  content.issues.forEach((issue, i) => {
    const hero = content.signals.find((s) => s.id === issue.heroSignalId) ?? content.signals[0]!;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card card-pick ec-issue';
    b.setAttribute('aria-pressed', String(p.selectedIssueId === issue.id));
    const mySignals = bag.filter((item) => issueIdForSignal(item) === issue.id);
    // 모은 신호는 다 보여 준다 — "내가 모은 게 여기 쓰인다"가 이 장면의 핵심이라 2개로 자르지 않는다.
    const issueImageId = issue.imageAssetId && hasAsset(issue.imageAssetId) ? issue.imageAssetId : signalImageId(content, hero);
    b.innerHTML = `${img(issueImageId, '')}
      <div class="ec-issue-body"><strong>${esc(issue.title)}</strong>
        <span class="chip">${icon('mail', 18)} 관련 친구 ${friendCountForIssue(content, issue.id)}명${mySignals.length ? ` · 내 신호 ${mySignals.length}개` : ''}</span>
        ${mySignals.length ? `<span class="ec-issue-mine">${mySignals.map((item) => `<em>${esc(continentLabel(item.missionId))}</em>${esc(item.label)}`).join('<br>')}</span>` : ''}
        <span class="ec-issue-q">${esc(issue.question)}</span></div>`;
    b.addEventListener('click', () => {
      if (host.isDisposed()) return;
      void audio.playSfx('tap');
      body.querySelectorAll('.ec-issue').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      if (p.selectedIssueId !== issue.id) {
        p.selectedIssueId = issue.id;
        p.listenedPerspectiveIds = [];
        p.selectedPerspectiveIds = [];
        p.perspectiveReason = '';
        p.selectedActionIds = [];
        p.simulationAttempts = 0;
        host.save();
      }
      speak(issue.question);
      renderBottom();
      host.guide?.say(issue.question, { speaker: host.speaker, cue: bottom.querySelector<HTMLElement>('[data-act="go"]') });
    });
    (i % 2 === 0 ? left : right).appendChild(b);
  });
  const renderBottom = () => {
    const issue = content.issues.find((i) => i.id === p.selectedIssueId);
    bottom.innerHTML = `
      <button class="btn btn-ghost" data-act="back">지도로</button>
      <button class="btn btn-primary btn-big" data-act="go" ${issue ? '' : 'disabled'}>${issue ? `“${esc(issue.title)}” 회의 열기` : '문제를 골라요'}</button>`;
    bottom.querySelector('[data-act="back"]')?.addEventListener('click', () => goto(host, 'connect'));
    bottom.querySelector('[data-act="go"]')?.addEventListener('click', () => { if (p.selectedIssueId) goto(host, 'roundtable'); });
  };
  renderBottom();
  host.guide?.say(
    bag.length
      ? '네가 여행에서 모은 신호가 어느 문제와 이어지는지 보여. 더 알아보고 싶은 문제를 골라!'
      : '지구본 옆의 문제 중 하나를 골라.',
    { speaker: host.speaker, cue: left }
  );
}

/* ===== 장면 4 — 세계 친구 원탁회의 ===== */
function renderRoundtableLegacy(host: EarthSceneHost): void {
  const { content, progress: p, body, bottom } = host;
  const t = content.titles;
  const issue = content.issues.find((i) => i.id === p.selectedIssueId);
  if (!issue) { goto(host, 'issue'); return; }
  const seats = content.roundtable[issue.id] ?? [];
  const perspectiveOf = (id: string) => content.perspectives.find((x) => x.id === id)!;
  let active = seats.find((s) => !p.listenedPerspectiveIds.includes(s.perspectiveId)) ?? seats[0]!;
  let phase: 'listen' | 'pick' = p.listenedPerspectiveIds.length >= MIN_PERSPECTIVES_LISTENED && p.selectedPerspectiveIds.length === 2 ? 'pick'
    : p.listenedPerspectiveIds.length >= seats.length ? 'pick' : 'listen';
  let starterTexts: string[] = [];

  body.innerHTML = `
    <div class="ec" style="background:linear-gradient(rgba(10,25,45,.25),rgba(10,25,45,.45))${hasAsset('bg.spare') ? `,url('${assetUrl('bg.spare')}') center/cover` : ''};border-radius:var(--radius-l);padding:8px">
      <div class="ec-head-compact"><strong>${esc(t.council)}</strong><span>${esc(issue.title)}</span></div>
      <div class="ec-table">
        <div class="ec-seats" id="ec-seats" role="group" aria-label="회의에 모인 친구들"></div>
        <section class="panel" id="ec-talk" style="display:grid;gap:6px;min-height:0;overflow-y:auto;padding:10px 14px"></section>
      </div>
    </div>`;
  const seatsEl = body.querySelector<HTMLElement>('#ec-seats')!;
  const talk = body.querySelector<HTMLElement>('#ec-talk')!;

  const renderSeats = () => {
    seatsEl.innerHTML = '';
    seats.forEach((seat) => {
      const f = friendOf(content, seat.friendId);
      const heard = p.listenedPerspectiveIds.includes(seat.perspectiveId);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ec-seat${seat === active && phase === 'listen' ? ' is-active' : ''}${heard ? ' is-heard' : ''}`;
      b.setAttribute('aria-label', `${f.country} ${f.name}${heard ? ', 들었음' : ''}`);
      b.innerHTML = `${img(f.imageId, '')}<span class="ec-seat-name">${esc(f.name)}</span>`;
      b.addEventListener('click', () => { if (host.isDisposed()) return; void audio.playSfx('tap'); active = seat; phase = 'listen'; renderSeats(); renderTalk(); });
      seatsEl.appendChild(b);
    });
  };

  const renderTalk = () => {
    if (phase === 'pick') { renderPick(); return; }
    const f = friendOf(content, active.friendId);
    const persp = perspectiveOf(active.perspectiveId);
    const heard = p.listenedPerspectiveIds.includes(persp.id);
    const distractors = content.perspectives.filter((x) => x.id !== persp.id).sort((a, b) => hashSeed(a.id + f.id) - hashSeed(b.id + f.id)).slice(0, 2);
    const choices = [persp, ...distractors].sort((a, b) => hashSeed(a.id + issue.id) - hashSeed(b.id + issue.id));
    talk.innerHTML = `
      <div class="ec-bubble">
        <span class="ec-p-icon" aria-hidden="true">${icon('mail', 28)}</span>
        <div><strong>${esc(f.name)} (${esc(f.country)})</strong><p class="ec-sub" style="min-height:0">${esc(persp.line)}</p></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${listenButton(persp.line)}
        <button type="button" class="btn btn-ghost" data-act="worry">무엇이 걱정돼?</button>
      </div>
      <p class="ec-copy" id="ec-worry" hidden style="color:var(--c-sky-ink)">${esc(persp.worry)}</p>
      <p class="ec-copy">${esc(f.name)}이(가) 가장 중요하게 생각하는 것은?</p>
      <div class="ec-choices">${choices.map((c) => `<button type="button" class="card card-pick ec-choice" data-choice="${c.id}" ${heard ? 'disabled' : ''} aria-pressed="${String(heard && c.id === persp.id)}">${esc(c.label)}</button>`).join('')}</div>
      <div id="ec-fb"></div>`;
    bindSpeak(talk);
    speak(persp.line);
    talk.querySelector('[data-act="worry"]')?.addEventListener('click', () => {
      const w = talk.querySelector<HTMLElement>('#ec-worry');
      if (w) { w.hidden = false; speak(persp.worry); }
    });
    const fb = talk.querySelector<HTMLElement>('#ec-fb')!;
    talk.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b) => {
      b.addEventListener('click', () => {
        if (host.isDisposed()) return;
        if (b.dataset.choice === persp.id) {
          talk.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((x) => (x.disabled = true));
          b.setAttribute('aria-pressed', 'true');
          if (!p.listenedPerspectiveIds.includes(persp.id)) p.listenedPerspectiveIds.push(persp.id);
          host.save();
          showFeedback(fb, 'success', `${f.name}의 관점: ${persp.label}`, 'dialogue');
          burstConfetti(b, 6);
          renderSeats();
          renderBottom();
          const next = seats.find((s) => !p.listenedPerspectiveIds.includes(s.perspectiveId));
          host.guide?.say(next ? `${friendOf(content, next.friendId).name}의 말도 들어 보자.` : '이제 해결안에 꼭 넣을 관점 두 개를 고르자.', {
            speaker: host.speaker, cue: next ? seatsEl : bottom.querySelector<HTMLElement>('[data-act="pick"]')
          });
        } else {
          b.disabled = true;
          b.classList.add('is-wrong');
          showFeedback(fb, 'partial', '다시 들어 봐요. 무엇을 걱정한다고 했나요?', 'dialogue');
          speak(persp.line);
        }
      });
    });
    renderBottom();
  };

  const renderPick = () => {
    const listened = content.perspectives.filter((x) => p.listenedPerspectiveIds.includes(x.id));
    talk.innerHTML = `
      <p class="ec-copy">해결안에 꼭 반영할 관점 두 개를 골라요.</p>
      <div class="ec-pick2">${listened.map((x) => `<button type="button" class="card card-pick ec-choice" data-pick="${x.id}" aria-pressed="${String(p.selectedPerspectiveIds.includes(x.id))}">${esc(x.label)}</button>`).join('')}</div>
      <p class="ec-copy">왜 이 두 관점이 함께 필요할까?</p>
      <div class="ec-starters" id="ec-starters"></div>
      <textarea class="ec-input" id="ec-reason" rows="2" maxlength="120" placeholder="예: 효과도 크고 모두가 참여할 수 있어야 오래 가니까">${esc(p.perspectiveReason)}</textarea>
      <p class="ec-scope" id="ec-reason-hint" hidden>시작 문장 뒤에 네 생각을 한 마디만 더 붙여 줘.</p>`;
    const reason = talk.querySelector<HTMLTextAreaElement>('#ec-reason')!;
    const starters = talk.querySelector<HTMLElement>('#ec-starters')!;
    const syncStarters = () => {
      const [a, b] = p.selectedPerspectiveIds.map((id) => perspectiveOf(id)?.label ?? '');
      const options = a && b ? [
        `${a}도 중요하고 ${b}도 함께 봐야 하니까`,
        `${a}만 생각하면 ${withJosa(b, '이', '가')} 빠질 수 있으니까`
      ] : [];
      starterTexts = options;
      starters.innerHTML = options.map((s) => `<button type="button" class="btn btn-ghost" data-starter="${esc(s)}">${esc(s)}</button>`).join('');
      starters.querySelectorAll<HTMLButtonElement>('[data-starter]').forEach((s) => s.addEventListener('click', () => {
        // 스타터는 시작일 뿐 — 그대로는 통과되지 않고 학생이 이어 써야 한다(renderBottom에서 검사).
        reason.value = `${s.dataset.starter ?? ''} `;
        p.perspectiveReason = reason.value;
        host.save();
        reason.focus();
        renderBottom();
      }));
    };
    syncStarters();
    reason.addEventListener('input', () => { p.perspectiveReason = reason.value.slice(0, 120); host.save(); renderBottom(); });
    talk.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.pick ?? '';
        if (p.selectedPerspectiveIds.includes(id)) p.selectedPerspectiveIds = p.selectedPerspectiveIds.filter((x) => x !== id);
        else if (p.selectedPerspectiveIds.length < 2) p.selectedPerspectiveIds.push(id);
        else { host.guide?.say('두 개만 고를 수 있어. 하나를 풀고 다시 골라.', { speaker: host.speaker }); return; }
        void audio.playSfx('tap');
        talk.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach((x) => x.setAttribute('aria-pressed', String(p.selectedPerspectiveIds.includes(x.dataset.pick ?? ''))));
        host.save();
        syncStarters();
        renderBottom();
      });
    });
    renderBottom();
    host.guide?.say('서로 다른 관점 두 개를 고르고 이유를 짧게 써 봐.', { speaker: host.speaker, cue: talk });
  };

  const renderBottom = () => {
    const canPick = p.listenedPerspectiveIds.length >= MIN_PERSPECTIVES_LISTENED;
    // 스타터를 탭만 하고 넘어갈 수 없다 — 스타터 문구 그대로면 학생 말이 최소 한 어절 더 필요하다.
    const reasonText = p.perspectiveReason.trim();
    const isStarterOnly = starterTexts.some((s) => reasonText === s.trim());
    const ready = p.selectedPerspectiveIds.length === 2 && reasonText.length >= 6 && !isStarterOnly;
    const hint = talk.querySelector<HTMLElement>('#ec-reason-hint');
    if (hint) hint.hidden = !isStarterOnly;
    bottom.innerHTML = phase === 'listen'
      ? `<span class="ec-progress">${p.listenedPerspectiveIds.length >= seats.length ? '모두 들었어!' : '친구들의 이야기를 들어 봐'}</span>
         <button class="btn btn-primary btn-big" data-act="pick" ${canPick ? '' : 'disabled'}>관점 두 개 고르기</button>`
      : `<button class="btn btn-ghost" data-act="relisten">친구 말 다시 듣기</button>
         <button class="btn btn-primary btn-big" data-act="actions" ${ready ? '' : 'disabled'}>해결안 조합하기</button>`;
    bottom.querySelector('[data-act="pick"]')?.addEventListener('click', () => { if (canPick) { phase = 'pick'; renderSeats(); renderTalk(); } });
    bottom.querySelector('[data-act="relisten"]')?.addEventListener('click', () => { phase = 'listen'; renderSeats(); renderTalk(); });
    bottom.querySelector('[data-act="actions"]')?.addEventListener('click', () => { if (ready) goto(host, 'actions'); });
  };

  renderSeats();
  renderTalk();
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
          <div id="ec-gauges" class="ec-gauges"></div>
          <div id="ec-fb" style="display:grid;gap:6px"></div>
          <p class="ec-scope">${esc(t.simulationNote)}</p>
        </section>
      </div>
    </div>`;
  const rings = body.querySelector<HTMLElement>('#ec-rings')!;
  const gauges = body.querySelector<HTMLElement>('#ec-gauges')!;
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
        if (!on) { popBounce(b); speak(a.detail); host.guide?.say(a.detail, { speaker: host.speaker }); }
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
          <div class="ec-starters" style="margin-top:6px">${content.pledge.helperQuestions.map((q) => `<span class="chip">${esc(q)}</span>`).join('')}</div>
          <div id="ec-fb" style="margin-top:6px"></div>
        </div>
      </div>
    </div>`;
  const input = body.querySelector<HTMLTextAreaElement>('#ec-personal')!;
  const fb = body.querySelector<HTMLElement>('#ec-fb')!;
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
  const reduced = saveRepo.get().settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  overlay.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${content.friends.map((_, i) => { const a = (i / n) * Math.PI * 2; return `<path class="ec-flow" data-lens="${(['ocean', 'air', 'climate', 'ecosystem', 'resource'] as const)[i % 5]}" d="M 50 50 Q ${50 + Math.cos(a) * 20} ${50 + Math.sin(a) * 30} ${50 + Math.cos(a) * 42} ${50 + Math.sin(a) * 40}" vector-effect="non-scaling-stroke" style="opacity:0;transition:opacity 500ms ${900 + i * 120}ms"/>`; }).join('')}
    </svg>
    <div class="ec-f-friends" aria-hidden="true">
      ${content.friends.map((f, i) => { const a = (i / n) * Math.PI * 2; return `<span class="ec-f-friend" data-i="${i}" style="left:${50 + Math.cos(a) * 42}%;top:${50 + Math.sin(a) * 40}%"><span class="ec-f-piece"></span>${img(f.imageId, '')}</span>`; }).join('')}
    </div>
    ${hasFinaleBackground ? '' : img(hasAsset('reward.globe_puzzle') ? 'reward.globe_puzzle' : 'prop.globe', '완성된 지구본', 'ec-f-globe')}
    ${completedGlobalCouncil ? `<div class="ec-f-topics" aria-hidden="true">${content.issues.map((item, index) => `<span style="--topic-i:${index}">${esc(item.title)}</span>`).join('')}</div>` : ''}
    <div class="ec-f-copy">
      <h2>${esc(completedGlobalCouncil ? '네 가지 환경문제를 하나의 약속으로 이었어요!' : (issue ? `우리는 ${issue.title} 문제를 함께 풀기로 했어요.` : '우리는 지구를 함께 돌보기로 했어요.'))}</h2>
      <p>${esc(completedGlobalCouncil ? `나의 약속 — ${p.personalActionDraft}` : (lines[5] ?? ''))}</p>
      <p class="ec-note">${completedGlobalCouncil ? '여섯 친구의 문제·해결책·약속이 지구를 한 바퀴 돌고, 나의 약속으로 완성됐어요.' : '여섯 친구의 약속이 하나의 지구로 이어졌어요 — 이제 여권에 도장이 찍혀요.'}</p>
      <button type="button" class="btn btn-primary btn-big" data-act="finale-continue" hidden>도장 받으러 가기</button>
    </div>`;
  body.appendChild(overlay);
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
      overlay.querySelectorAll<SVGPathElement>('path').forEach((path) => { path.style.opacity = '1'; });
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
