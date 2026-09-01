import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo, recomputeUnlocks } from '../core/SaveRepository';
import { readMissionArtifact } from '../core/missionArtifacts';
import { buildTopBar } from '../ui/chrome';
import { showToast } from '../ui/toast';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { threeSlot } from '../ui/threeSlot';
import { createGuide, type GuideController } from '../ui/guide';
import { burstConfetti, popBounce } from '../ui/fx';
import { readLearnCard } from '../ui/learnFrame';
import { airplaneWingmen, selectedAirplaneAssetId, selectedAirplanePortraitAssetId } from '../ui/airplaneFleet';
import { selectedAvatarAssetId } from '../ui/avatarRoster';
import { closeActiveVideoOverlay, playVideoOverlay } from '../ui/videoOverlay';

/** 엔딩 자막 — 장면 순서: 지구 위 비행 → 도시·자연 → 원탁 지구본 → 해변 청소·나무 심기 → 마무리 */
const FINAL_CUES = [
  { start: 0, end: 3.4, text: '여섯 친구의 신호를 모아 세계 친구 지구회의를 열었어.' },
  { start: 3.4, end: 7, text: '바다와 공기, 기후와 생태계는 국경을 넘어 이어져 있었지.' },
  { start: 7, end: 10.6, text: '서로 다른 생각을 듣고, 함께 지킬 약속을 만들었어.' },
  { start: 10.6, end: 14.2, text: '나부터, 학교와 마을이, 그리고 여러 나라가 함께.' },
  { start: 14.2, end: 17.6, text: '세계를 잇는 여행은 이제 네 생활에서 이어질 거야. 고마워, 탐험가!' }
];
import { MISSION_IDS, type MissionArtifact, type MissionId } from '../types';

interface CommonContent {
  reflectionFrame?: string;
  actionPrinciples?: string[];
  stamps?: Array<{ id: string; label: string }>;
}

const PIECES: Array<{ id: MissionId; label: string }> = [
  { id: 'asia', label: '아시아' },
  { id: 'europe', label: '유럽' },
  { id: 'africa', label: '아프리카' },
  { id: 'americas', label: '아메리카' },
  { id: 'oceania', label: '오세아니아' },
  { id: 'dialogue', label: '지구회의' }
];
const PIECE_COLORS: Record<MissionId, string> = {
  asia: 'var(--c-coral)', europe: 'var(--c-violet)', africa: 'var(--c-gold)',
  americas: 'var(--c-turquoise)', oceania: 'var(--c-sky)', dialogue: 'var(--c-success)'
};
const PIECE_TEXT_COLORS: Record<MissionId, string> = {
  asia: 'var(--c-ink)', europe: '#fff', africa: 'var(--c-ink)',
  americas: 'var(--c-ink)', oceania: 'var(--c-ink)', dialogue: 'var(--c-ink)'
};

/** 하단 보상 선반 — 회고 저장 시 차례로 채워진다 */
const REWARD_ITEMS: Array<{ id: string; label: string }> = [
  { id: 'reward.trophy', label: '지구본 트로피' },
  { id: 'prop.stamp', label: '여행 도장' },
  { id: 'reward.badge', label: '지구 메달' },
  { id: 'reward.globe_puzzle', label: '퍼즐 지구본' },
  { id: 'prop.suitcase', label: '여행 가방' },
  { id: 'reward.medal2', label: '보라 지구 메달' },
  { id: 'prop.treasure', label: '탐험 보물상자' },
  { id: 'prop.puzzle3d', label: '3D 퍼즐 지구본' },
  { id: 'deco.ring_frame', label: '세계 연결 고리' }
];

const COMPLETION_CSS = `
.completion-page { grid-template-rows:auto minmax(0,1fr) 0; }
.completion-page > .guide-wrap { position:absolute;left:0;bottom:0;height:var(--guide-lane-h); }
.completion-page:not(.is-final):not(.is-ending) .page-body > .panel {
  margin-left:calc(var(--guide-size) + var(--sp-2));
  width:calc(100% - var(--guide-size) - var(--sp-2));
}
.completion-page .top-bar { height: auto; min-height: var(--top-bar-h); padding-block: var(--sp-2); }
/* 장식은 배경과 패널 사이에 깔아 둔다 — 패널을 가리지 않는다 */
.completion-page > .page-deco { z-index: -1; }
.completion-deco { position: absolute; opacity: .85; filter: drop-shadow(0 8px 18px rgba(0,0,0,.35)); }
.completion-deco.deco-left { left: clamp(4px, 1.5vw, 28px); bottom: clamp(4px, 1.5vh, 24px); width: min(clamp(64px, 8vw, 130px), 16vh); }
.completion-deco.deco-right { right: clamp(4px, 1.5vw, 28px); bottom: clamp(4px, 1.5vh, 24px); width: min(clamp(64px, 8vw, 130px), 16vh); }
.completion-deco.deco-top { left: 50%; top: 7vh; transform: translateX(-50%); width: min(clamp(180px, 18vw, 320px), 30vh); opacity: .84; }
.completion-page .page-body { gap: var(--sp-3); max-width: 1600px; padding-inline: var(--scene-safe); }
/* 리본과 주인공 캐릭터를 한 줄에 둬서 세로 공간을 아끼고 캐릭터는 크게 (§7) */
.completion-header { gap: clamp(10px, 3vw, 48px); align-items: flex-end; justify-content: center; flex-wrap: nowrap; min-height:0; }
.completion-header .header-side { display: flex; align-items: flex-end; gap: var(--sp-2); flex-shrink: 1; min-width: 0; }
.completion-wreath { width: min(clamp(48px, 6vw, 104px), 14vh); pointer-events: none; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.35)); }
.completion-wreath.is-left { transform: scaleX(-1); }
/* §7 완료 화면 주인공 — 낮은 화면에서만 vh로 잘림을 막는다 */
.completion-mascot { width: min(clamp(200px, 24vw, 360px), 26vh); filter: drop-shadow(0 8px 18px rgba(0,0,0,0.4)); }
.completion-mascot.is-selected { aspect-ratio:1;border-radius:50%;object-fit:cover;border:4px solid rgba(255,255,255,.9);background:#eef8fb; }
@media (max-height: 620px) { .completion-mascot { width: min(clamp(200px, 24vw, 360px), 23vh); } }
.completion-mascot.is-small { width: min(clamp(130px, 16vw, 240px), 18vh); animation-delay: 0.9s; }
.completion-trophy { width: min(clamp(90px, 11vw, 150px), 20vh); filter: drop-shadow(0 8px 18px rgba(0,0,0,0.35)); }
/* §7 반투명 패널 — 축하 배경이 비쳐 보이게 */
.completion-page .panel { background:var(--glass-panel);backdrop-filter:blur(9px) saturate(1.05);padding:clamp(12px,1.4vw,18px); }
.completion-page .panel h2 { font-size: var(--fs-title); line-height: 1.1; }
.puzzle-row { display: flex; gap: clamp(24px,4vw,64px); flex-wrap: wrap; align-items: center; justify-content: center; margin-top: var(--sp-3); }
#piece-tray { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
#piece-tray .card-pick { min-width: 104px; min-height: 72px; padding: var(--sp-3); text-align: center; font-family: var(--font-head); font-size: max(18px,var(--fs-small)); line-height:1.35; }
#globe-zone {
  position: relative; width: min(360px, 46vw, 36vh); min-width:220px; aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #bfe6ff, #2588E8 70%); box-shadow: var(--shadow-pop);
  display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; overflow: hidden;
}
/* 바깥쪽 칸은 원에 잘리므로 글자를 안쪽으로 당긴다 */
.globe-slice {
  display: flex; align-items: center; justify-content: center; text-align: center;
  font-family: var(--font-head); font-size: max(15px, var(--fs-small)); line-height: 1.25;
  padding: 4px; word-break: keep-all;
}
.globe-slice:nth-child(3n+1) { padding-left: 20%; }
.globe-slice:nth-child(3n) { padding-right: 20%; }
.puzzle-trophy-row { display: flex; justify-content: center; align-items: center; gap: var(--sp-4); flex-wrap: wrap; margin-top: var(--sp-2); }
/* 축하 연출이 끝난 뒤(회고·수료증)에는 헤더를 줄여 본문이 한 화면에 들어오게 한다 */
.completion-page.is-writing .completion-wreath,
.completion-page.is-final .completion-wreath { display: none; }
.completion-page.is-writing .completion-mascot,
.completion-page.is-final .completion-mascot { width: min(clamp(80px, 9vw, 130px), 11vh); }
.completion-page.is-writing .completion-mascot.is-small,
.completion-page.is-final .completion-mascot.is-small { display: none; }
.completion-page.is-final .page-body {
  display: block; width: min(1180px, 100%); margin-inline: auto;
}
.completion-page.is-final .scene-header,
.completion-page.is-final #sec-rewards { display: none !important; }
.completion-page.is-final #sec-cert {
  display: grid !important;
  grid-template-columns: minmax(320px, .82fr) minmax(430px, 1.18fr);
  grid-template-areas:
    "title preview"
    "note preview"
    "fields preview"
    "actions preview";
  align-items: start; column-gap: clamp(20px, 3vw, 44px); row-gap: var(--sp-2);
  width: 100%; min-height: 0; overflow: visible;
}
.completion-page.is-final #sec-cert > h2 { grid-area: title; margin: 0; align-self: end; }
.completion-page.is-final #sec-cert > .cert-form-note { grid-area: note; text-align: left; }
.completion-page.is-final #sec-cert > .cert-fields {
  grid-area: fields; grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%; max-width: none; margin: var(--sp-2) 0;
}
.completion-page.is-final #cert-preview { grid-area: preview; min-width: 0; align-self: center; }
.completion-page.is-final .certificate-actions {
  grid-area: actions; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  align-self: end; margin-top: var(--sp-2);
}
.completion-page.is-final .certificate-actions .btn { min-width: 0; width: 100%; }
/* 3D 지구본 슬롯은 아래 스티커의 "퍼즐 지구본"과 같은 보상이라 마지막 화면에서는 접는다 */
.completion-page.is-final #globe-3d-slot { display: none; }
.completion-page.is-final .completion-trophy { width: min(clamp(70px, 8vw, 130px), 15vh); }
.completion-page.is-final .cert-frame { width: min(100%, 470px); margin-inline: auto; }
@media (max-height: 620px) {
  .completion-page.is-final .cert-frame { width: min(100%, 430px); }
}
@media (max-width: 900px) {
  .completion-page.is-final #sec-cert {
    grid-template-columns: 1fr;
    grid-template-areas: "title" "note" "fields" "preview" "actions";
    max-height: calc(100dvh - var(--top-bar-h) - 24px); overflow: auto;
  }
  .completion-page.is-final #sec-cert > .cert-form-note { text-align: center; }
  .completion-page.is-final .certificate-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.completion-rewards { justify-content: center; }
.completion-rewards .sticker { width: min(84px, 10vh); height: min(84px, 10vh); }
.completion-rewards .sticker-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.completion-rewards .sticker-name { font-size: max(18px,var(--fs-small)); font-weight: 700; color: var(--c-ink-soft); }
.cert-frame { position: relative; max-width: min(720px, 100%); margin: var(--sp-2) auto; }
.cert-frame-img { width: 100%; display: block; }
.cert-frame .cert-text {
  position: absolute; inset: 20% 15% 17%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; overflow: hidden; text-align: center; color: #19324D;
  font-size: clamp(18px,1.35vw,24px); line-height:1.4;
}
.cert-frame .cert-text .cert-eyebrow { letter-spacing: 0.24em; color: #6f5514; font-size: max(18px,var(--fs-small)); }
.cert-frame .cert-text h2 { font-family: var(--font-head); font-size: 1.7em; margin: 0; color: #19324D; }
.cert-fields {
  display: grid; grid-template-columns: minmax(180px, 1.5fr) minmax(110px, .75fr) minmax(110px, .75fr) minmax(150px, 1fr);
  gap: var(--sp-2); margin: var(--sp-2) auto var(--sp-3); max-width: 780px;
}
.cert-fields label { display: grid; gap: 6px; color: var(--c-navy); font-weight: 900; font-size: max(18px,var(--fs-small)); }
.cert-fields input {
  width: 100%; min-height: 54px; border: 3px solid var(--c-line); border-radius: var(--radius-s);
  background: #fff; padding: 8px 12px; color: var(--c-ink); font: 800 var(--fs-body)/1.2 var(--font-body);
}
.cert-fields input:focus { outline: 4px solid color-mix(in srgb, var(--c-sky) 38%, transparent); border-color: var(--c-sky); }
.cert-form-note { margin: 0; text-align: center; color: var(--c-ink-soft); font-size: max(18px,var(--fs-small)); font-weight: 700; }
.cert-student-grid { display: grid; grid-template-columns: 1.6fr .8fr .8fr 1.15fr; gap: 8px; width: 100%; margin: 6px 0; }
.cert-student-cell { min-width: 0; }
.cert-student-cell small { display: block; color: #6f5514; font-weight: 900; font-size: .72em; }
.cert-student-value {
  display: block; min-height: 1.55em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  border-bottom: 2px solid #8b6f31; font-weight: 900;
}
.cert-frame .cert-text .cert-statement,
.cert-frame .cert-text .cert-date {
  width: 74%; align-self: flex-start; text-align: center;
}
.cert-frame .cert-text .cert-statement { margin: 2px 0; font-weight: 700; font-size: .9em; }
.cert-frame .cert-text .cert-date { margin: 0; color: #6b7a8d; font-size: .8em; }
.certificate-actions { display: flex; justify-content: center; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-3); }
.certificate-actions .btn { min-width: min(240px, 100%); }

/* 인증서 이후에는 별도 엔딩 장면으로 전환해 축하 한 문장과 두 갈래 이동만 남긴다. */
.completion-page.is-ending .page-body { display: grid; place-items: center; min-height: 0; }
.completion-page.is-ending .scene-header,
.completion-page.is-ending #sec-puzzle,
.completion-page.is-ending #sec-reflect,
.completion-page.is-ending #sec-rewards,
.completion-page.is-ending #sec-cert { display: none !important; }
.completion-page.is-ending > .page-deco { display: none; }
.ending-scene {
  position: relative; isolation: isolate; overflow: hidden; width: min(1180px, 100%); min-height: min(610px, calc(100vh - var(--top-bar-h) - 36px));
  display: grid; grid-template-columns: minmax(320px, .9fr) minmax(420px, 1.25fr); align-items: center;
  gap: clamp(18px, 3vw, 52px); padding: clamp(28px, 4vw, 62px); border: 4px solid rgba(255,255,255,.84);
  border-radius: clamp(28px, 4vw, 54px); background: linear-gradient(135deg, rgba(255,251,226,.97), rgba(213,243,255,.95));
  box-shadow: 0 24px 70px rgba(10,34,61,.32);
}
.ending-scene::before { content: ''; position: absolute; z-index: -1; inset: 0; background: radial-gradient(circle at 82% 18%, rgba(255,205,86,.48), transparent 32%), radial-gradient(circle at 14% 88%, rgba(83,204,229,.3), transparent 36%); }
.ending-copy { position: relative; z-index: 2; display: grid; align-content: center; gap: var(--sp-3); }
.ending-eyebrow { margin: 0; color: #705414; font-weight: 1000; letter-spacing: .18em; font-size: var(--fs-body); }
.ending-copy h1 { margin: 0; color: var(--c-navy); font-family: var(--font-head); font-size: clamp(46px, 5.8vw, 78px); line-height: 1.04; text-wrap: balance; }
.ending-message { margin: 0; max-width: 18em; color: var(--c-ink); font-size: clamp(25px, 2.3vw, 34px); line-height: 1.35; font-weight: 900; text-wrap: balance; }
.ending-actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-2); }
.ending-actions .btn { min-width: 168px; }
.ending-fleet { position: relative; min-height: min(470px, 55vh); }
.ending-flight-kids { position: absolute; inset: 1% 0 auto; width: min(100%, 540px); margin-inline: auto; opacity: .82; filter: drop-shadow(0 14px 24px rgba(15,42,69,.22)); }
.ending-plane { position: absolute; object-fit: contain; filter: drop-shadow(0 16px 24px rgba(15,42,69,.35)); }
.ending-plane.is-main { z-index:3;width:min(58%,330px);aspect-ratio:1;right:8%;bottom:4%;border-radius:50%;object-fit:cover;border:5px solid rgba(255,255,255,.92);background:#eef8fb;animation:ending-plane-float 3.2s ease-in-out infinite; }
.ending-plane.is-wing-left { z-index: 2; width: min(36%, 190px); left: 0; top: 35%; transform: rotate(-8deg); animation: ending-wing-float 3.8s ease-in-out infinite; }
.ending-plane.is-wing-right { z-index: 2; width: min(32%, 170px); right: 0; top: 20%; transform: rotate(8deg); animation: ending-wing-float 3.4s .45s ease-in-out infinite; }
@keyframes ending-plane-float { 50% { transform: translateY(-14px) rotate(1deg); } }
@keyframes ending-wing-float { 50% { translate: 0 -10px; } }
@media (max-width: 900px) {
  .cert-fields { grid-template-columns: 1.5fr .8fr .8fr; }
  .cert-fields label:last-child { grid-column: 1 / -1; }
  .ending-scene { grid-template-columns: minmax(280px, .95fr) minmax(340px, 1.05fr); min-height: min(590px, calc(100vh - var(--top-bar-h) - 28px)); padding: 28px; }
  .ending-copy h1 { font-size: clamp(43px, 6vw, 62px); }
  .ending-message { font-size: clamp(23px, 3vw, 30px); }
}
@media (max-width: 700px) {
  .cert-fields { grid-template-columns: 1fr 1fr; }
  .cert-fields label:first-child, .cert-fields label:last-child { grid-column: 1 / -1; }
  .cert-student-grid { grid-template-columns: 1fr 1fr; }
  .ending-scene { grid-template-columns: 1fr; text-align: center; min-height: auto; padding: 24px; }
  .ending-copy { justify-items: center; }
  .ending-fleet { min-height: 300px; width: min(480px, 100%); }
  .ending-actions { justify-content: center; }
}
@media (prefers-reduced-motion: reduce) {
  .ending-plane { animation: none !important; }
}

/* 전역 인쇄 규칙보다 구체도를 높여 인증서 한 장만 A4 가로로 출력한다. */
@media print {
  @page { size: A4 landscape; margin: 0; }
  html, body { width: 297mm; height: 210mm; margin: 0 !important; background: #fff !important; }
  body.printing-certificate #scene-root > * { display: none !important; }
  body.printing-certificate #scene-root > .certificate-print {
    display: flex !important; position: fixed !important; inset: 0 !important; width: 297mm !important; height: 210mm !important;
    margin: 0 !important; padding: 10mm !important; box-sizing: border-box; background: #fff !important;
  }
  .certificate-sheet {
    position: relative; overflow: hidden; width: 100%; height: 100%; box-sizing: border-box;
    display: grid; place-items: center; align-content: center; gap: 5mm; padding: 14mm 18mm;
    border: 3mm double #d6a62d; color: #19324d; text-align: center; font-family: var(--font-body, sans-serif);
    background: radial-gradient(circle at 50% 8%, #fff7d5 0, #fff 34%);
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  .certificate-sheet::before, .certificate-sheet::after { content: ''; position: absolute; width: 42mm; height: 42mm; border: 1.8mm solid #66bfd7; border-radius: 50%; opacity: .2; }
  .certificate-sheet::before { left: -18mm; top: -18mm; }
  .certificate-sheet::after { right: -18mm; bottom: -18mm; }
  .certificate-sheet__eyebrow { margin: 0; color: #705414; font-size: 5mm; font-weight: 900; letter-spacing: .32em; }
  .certificate-sheet h1 { margin: 0; color: #19324d; font-family: var(--font-head, sans-serif); font-size: 16mm; line-height: 1.05; }
  .certificate-sheet__lead { margin: 0; max-width: 235mm; font-size: 6mm; line-height: 1.55; font-weight: 700; }
  .certificate-sheet__identity { display: grid; grid-template-columns: 2fr .8fr .8fr 1.25fr; gap: 5mm; width: min(235mm, 100%); margin: 2mm 0; }
  .certificate-sheet__field { display: grid; grid-template-columns: auto minmax(22mm, 1fr); align-items: end; gap: 2mm; font-size: 5.5mm; font-weight: 900; }
  .certificate-sheet__line { display: block; min-height: 8mm; padding: 0 2mm 1mm; border-bottom: .6mm solid #19324d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .certificate-sheet__promise { margin: 0; width: min(220mm, 100%); padding: 4mm 8mm; border-radius: 5mm; background: #fff6d9; font-size: 5mm; line-height: 1.5; }
  .certificate-sheet__footer { display: flex; align-items: center; justify-content: center; gap: 7mm; margin-top: 1mm; color: #55697c; font-size: 4.5mm; }
  .certificate-sheet__seal { display: inline-grid; place-items: center; width: 17mm; height: 17mm; border-radius: 50%; border: 1mm solid #d45c51; color: #a83731; font-weight: 1000; transform: rotate(-7deg); }
  .certificate-sheet__plane { position: absolute; right: 13mm; top: 12mm; width: 30mm; max-height: 25mm; object-fit: contain; }
  #overlay-root, .top-bar, button, .guide-widget { display: none !important; }
}
/* 회고 위 배움 카드 6장 요약 — 미션에서 만난 친구와 발견을 다시 본다 */
.completion-learn { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--sp-2); margin: var(--sp-2) 0 var(--sp-3); }
.learn-card-row .learn-card-main { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.learn-card-row .learn-card-title { font-family: var(--font-head); color: var(--c-navy); line-height: 1.15; }
.learn-card-row .learn-card-line {
  color: var(--c-ink-soft); font-weight: 600; font-size: max(18px,var(--fs-small)); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.council-records { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-2);margin:var(--sp-2) 0; }
.council-record {
  min-height:112px;padding:12px 14px;text-align:left;border:2px solid rgba(39,91,124,.2);
  border-radius:var(--radius-m);background:rgba(255,255,255,.82);color:var(--c-ink);cursor:pointer;
}
.council-record:hover,.council-record:focus-visible { border-color:var(--c-turquoise);transform:translateY(-1px); }
.council-record.is-selected { border-color:var(--c-violet);box-shadow:0 0 0 3px rgba(108,76,232,.16);background:#f5f1ff; }
.council-record strong,.council-record span { display:block; }
.council-record strong { color:var(--c-navy);font-family:var(--font-head);font-size:var(--fs-body); }
.council-record .record-evidence { margin-top:5px;font-size:max(17px,var(--fs-small));font-weight:800;color:#23616b; }
.council-record .record-change { margin-top:5px;font-size:max(16px,calc(var(--fs-small) - 1px));line-height:1.35;color:var(--c-ink-soft); }
.council-empty { margin:var(--sp-2) 0;padding:10px 12px;border-radius:var(--radius-s);background:rgba(255,248,218,.78);font-weight:750; }
.completion-details { border:2px solid var(--c-line);border-radius:var(--radius-m);background:rgba(255,255,255,.76);padding:var(--sp-2) var(--sp-3); }
.completion-details > summary { min-height:56px;display:flex;align-items:center;font-size:var(--fs-body);font-weight:900;color:var(--c-navy);cursor:pointer; }
.reflection-progress { display:flex;justify-content:center;gap:var(--sp-2);margin-bottom:var(--sp-2); }
.reflection-progress span { width:14px;height:14px;border-radius:50%;border:2px solid var(--c-line);background:#fff; }
.reflection-progress span.is-done { background:var(--c-success);border-color:var(--c-success); }
.reflection-progress span.is-now { background:var(--c-gold);border-color:#8a5b00;transform:scale(1.18); }
.reflection-step { min-height:180px;display:grid;align-content:center;gap:var(--sp-3); }
.reflection-step[hidden] { display:none!important; }
.reflection-step label { display:grid;gap:var(--sp-2);font-family:var(--font-head);color:var(--c-navy);font-size:var(--fs-title); }
.reflection-step .ref-input { width:100%;min-height:64px;padding:10px 14px;font-family:var(--font-body);font-size:var(--fs-body);line-height:1.4; }
.transfer-prompt { margin:0;padding:10px 14px;border-left:5px solid var(--c-turquoise);border-radius:var(--radius-s);background:#edfafa;color:var(--c-ink);font-family:var(--font-body);font-size:var(--fs-body);font-weight:750;line-height:1.5; }
.ref-hint { margin:0;padding:8px 12px;border-left:5px solid var(--c-gold);border-radius:var(--radius-s);background:#fff8e4;color:var(--c-ink);font-family:var(--font-body);font-size:var(--fs-body);font-weight:750;line-height:1.4; }
.reflection-actions { display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:var(--sp-2);margin-top:var(--sp-3); }
.reflection-step-count { justify-self:center;color:var(--c-ink-soft);font-size:var(--fs-body);font-weight:800; }
@media (max-width: 700px) { .completion-learn { grid-template-columns: 1fr; } }
/* 낮은 화면(1024×576 교실 태블릿)에서 회고 단계가 스크롤 없이 들어오도록 밀도를 올린다 */
@media (max-height: 620px) {
  .completion-page .page-body { gap: var(--sp-2); padding-block: 4px; }
  .completion-page .panel { padding: var(--sp-3) var(--sp-4); }
  .completion-header .completion-wreath,
  .completion-header .completion-mascot.is-small { display:none; }
  .completion-mascot { width:min(160px,20vh); }
  .completion-trophy { width:min(112px,15vh); }
  .completion-learn { grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; margin: 6px 0 8px; }
  .completion-learn .learn-card-row { padding: 6px 8px; }
  .completion-learn .learn-card-row img { width: 40px; height: 40px; }
  .completion-learn .learn-card-line { -webkit-line-clamp: 1; }
  .reflection-step { min-height:132px; }
  .reflection-step .ref-input { min-height:56px; }
  #sec-reflect h3 { font-size: var(--fs-body); margin-top: var(--sp-2) !important; }
  #principles .btn { min-height: 48px; padding: 6px 14px; }
  #sec-reflect .modal-actions { margin-top: var(--sp-2) !important; }
}
@media (max-width: 700px) { .council-records { grid-template-columns:1fr; } }
`;

export function createPage(): Page {
  let dnd: PickPlaceController | null = null;
  let guide: GuideController | null = null;
  const timers: number[] = [];

  return {
    async mount(root: HTMLElement) {
      // 직접 URL 접근 차단: 저장값을 믿지 않고 재계산 (라우터 가드의 2차 방어)
      const save = saveRepo.get();
      recomputeUnlocks(save);
      if (!save.completion.unlocked) {
        navigate('#/map');
        return;
      }

      let common: CommonContent = {};
      try {
        common = await loadContent<CommonContent>('common');
      } catch {
        /* 기본값 사용 */
      }
      const reflectionSpeakerId = selectedAvatarAssetId(save.profile?.avatarId);
      const reflectionSpeakerName = save.profile?.nickname ?? '여행자';
      const selectedPlaneFlight = selectedAirplaneAssetId(save.profile?.airplaneId);
      const selectedPlane = selectedAirplanePortraitAssetId(save.profile?.airplaneId);
      const [celebrationWing = 'plane.alt1', completionGuidePlane = 'plane.alt2'] = airplaneWingmen(selectedPlaneFlight, 2);
      await preloadImages([
        'bg.completion', 'earth.completion.globe', 'reward.globe_puzzle', 'reward.badge', 'reward.trophy',
        'reward.certificate', 'reward.wreath', selectedPlane, celebrationWing, completionGuidePlane,
        'prop.stamp', 'prop.suitcase',
        'deco.emblem_unity', 'prop.globe_glow', 'deco.flight_kids', reflectionSpeakerId,
        ...REWARD_ITEMS.map((item) => item.id)
      ]);
      audio.playBgm('main');

      const principles = common.actionPrinciples ?? ['관찰하기', '물어보기', '끝까지 듣기', '잘못 알았으면 수정하기'];
      const placed = new Set<MissionId>(save.completion.placedPuzzlePieceIds);

      // 미션(배움 카드) → 수료증(내 답)으로 학습 고리를 닫는다
      const learnCards = MISSION_IDS.map((id) => ({ id, ...readLearnCard(id) }));
      const earnedCards = learnCards.filter((card) => card.earned && card.friendName);
      const missionArtifacts = MISSION_IDS
        .map((id) => readMissionArtifact(id))
        .filter((artifact): artifact is MissionArtifact => artifact !== null);
      let selectedArtifact: MissionArtifact | null = missionArtifacts[0] ?? null;

      const page = document.createElement('div');
      page.className = 'page completion-page';
      page.style.backgroundImage = `linear-gradient(rgba(15,28,45,0.45), rgba(15,28,45,0.6)), url('${assetUrl('bg.completion')}')`;
      const style = document.createElement('style');
      style.textContent = COMPLETION_CSS;
      page.appendChild(style);
      page.appendChild(buildTopBar({ title: '세계 연결 완주', backTo: '#/map' }));

      // 배경 위 장식 — 패널 뒤(z-index:-1)에 깔려 레이아웃에 영향을 주지 않는다 (§7 에셋 다양성)
      const deco = document.createElement('div');
      deco.className = 'page-deco';
      deco.setAttribute('aria-hidden', 'true');
      deco.innerHTML = `
        ${hasAsset('deco.emblem_unity') ? `<img class="completion-deco deco-left" src="${assetUrl('deco.emblem_unity')}" data-asset-id="deco.emblem_unity" alt="">` : ''}
        ${hasAsset('prop.globe_glow') ? `<img class="completion-deco deco-right" src="${assetUrl('prop.globe_glow')}" data-asset-id="prop.globe_glow" alt="">` : ''}
        ${hasAsset('deco.flight_kids') ? `<img class="completion-deco deco-top" src="${assetUrl('deco.flight_kids')}" data-asset-id="deco.flight_kids" alt="">` : ''}`;
      page.appendChild(deco);

      const wreathHtml = hasAsset('reward.wreath')
        ? `<img class="completion-wreath is-left" src="${assetUrl('reward.wreath')}" data-asset-id="reward.wreath" alt="" aria-hidden="true">`
        : '';
      const wreathHtmlR = hasAsset('reward.wreath')
        ? `<img class="completion-wreath" src="${assetUrl('reward.wreath')}" data-asset-id="reward.wreath" alt="" aria-hidden="true">`
        : '';

      const body = document.createElement('div');
      body.className = 'page-body';
      body.innerHTML = `
        <div class="scene-header completion-header" aria-hidden="true">
          ${wreathHtml}
          ${hasAsset(selectedPlane) ? `<img class="bob completion-mascot is-selected" src="${assetUrl(selectedPlane)}" data-asset-id="${selectedPlane}" alt="">` : ''}
          ${hasAsset('reward.trophy') ? `<img class="completion-trophy" src="${assetUrl('reward.trophy')}" data-asset-id="reward.trophy" alt="">` : ''}
          ${hasAsset(celebrationWing) ? `<img class="bob completion-mascot is-small" src="${assetUrl(celebrationWing)}" data-asset-id="${celebrationWing}" alt="">` : ''}
          ${wreathHtmlR}
        </div>

        <section class="panel" id="sec-puzzle">
          <h2 style="color:var(--c-navy)">지구본 퍼즐</h2>
          <div class="puzzle-row" id="puzzle-play">
            <div id="piece-tray"></div>
            <div id="globe-zone"></div>
          </div>
        </section>

        <section class="panel" id="sec-reflect" style="display:none">
          <h2 style="color:var(--c-navy)">세계 연결 회의: 여행 근거로 공동 약속 만들기</h2>
          <p>회의에 가져갈 여행 기록 하나를 골라 보세요.</p>
          ${missionArtifacts.length > 0
            ? `<div class="council-records" role="radiogroup" aria-label="세계 연결 회의에 가져갈 미션 기록">
                ${missionArtifacts.map((artifact) => {
                  const label = PIECES.find((piece) => piece.id === artifact.missionId)?.label ?? artifact.missionId;
                  const selected = selectedArtifact?.missionId === artifact.missionId;
                  return `<button type="button" class="council-record${selected ? ' is-selected' : ''}" role="radio" aria-checked="${String(selected)}" data-artifact-id="${artifact.missionId}">
                    <strong>${escapeHtml(label)} · ${escapeHtml(artifact.title)}</strong>
                    <span class="record-evidence">${escapeHtml(artifact.evidenceLabel)}</span>
                    <span class="record-change">수정한 결정 · ${escapeHtml(artifact.revisedDecision)}</span>
                  </button>`;
                }).join('')}
              </div>`
            : '<p class="council-empty">아래 배움 카드를 열어 여행에서 알게 된 것을 다시 보고 써 보세요.</p>'}
          <details class="completion-details">
            <summary>배움 카드 보기</summary>
            <div class="completion-learn" aria-label="여행에서 받은 배움 카드">
              ${learnCards.map((card) => {
                const label = PIECES.find((piece) => piece.id === card.id)?.label ?? card.id;
                return card.earned && card.friendName
                  ? `<div class="learn-card-row">${card.friendImageId && hasAsset(card.friendImageId) ? `<img src="${assetUrl(card.friendImageId)}" data-asset-id="${card.friendImageId}" alt="" aria-hidden="true">` : ''}<div class="learn-card-main"><span class="learn-card-title">${escapeHtml(card.friendName)} · ${label}</span><span class="learn-card-line">${escapeHtml(card.line)}</span></div></div>`
                  : `<div class="learn-card-row is-empty"><div class="learn-card-main"><span class="learn-card-title">${label}</span></div></div>`;
              }).join('')}
            </div>
          </details>
          <div class="reflection-progress" aria-label="회고 1 / 5 단계">
            ${Array.from({ length: 5 }, (_, index) => `<span class="${index === 0 ? 'is-now' : ''}" aria-hidden="true"></span>`).join('')}
          </div>
          <div class="reflection-step" data-reflection-step="1">
            <label for="ref-1">처음 생각
              <input id="ref-1" type="text" maxlength="60" class="ref-input" placeholder="예: 다른 나라 친구들은 우리와 아주 다를 거야">
            </label>
          </div>
          <div class="reflection-step" data-reflection-step="2" hidden>
            <label for="ref-2">생각을 바꾼 자료
              <input id="ref-2" type="text" maxlength="60" class="ref-input" placeholder="예: 아시아 친구의 하루">
            </label>
          </div>
          <div class="reflection-step" data-reflection-step="3" hidden>
            <label for="ref-3">지금 생각
              <input id="ref-3" type="text" maxlength="60" class="ref-input" placeholder="예: 비슷한 점도 많고 저마다 다른 이유가 있구나">
            </label>
          </div>
          <div class="reflection-step" data-reflection-step="4" hidden>
            <label for="ref-4">새 상황에 적용하기
              <p class="transfer-prompt" id="transfer-prompt">${escapeHtml(selectedArtifact?.transferPrompt ?? '우리 반에서 문화가 다른 친구와 함께 결정해야 한다면, 무엇을 먼저 확인할까요?')}</p>
              <input id="ref-4" type="text" maxlength="100" class="ref-input" placeholder="내가 실제로 할 행동을 적어 봐요">
            </label>
          </div>
          <div class="reflection-step" data-reflection-step="5" hidden>
            <h3 style="color:var(--c-navy)">지킬 약속 두 가지</h3>
            <div id="principles" style="display:flex;gap:var(--sp-2);flex-wrap:wrap">
              ${principles.map((p) => `<button type="button" class="btn btn-ghost principle-pick" data-p="${p}" aria-pressed="false">${p}</button>`).join('')}
            </div>
          </div>
          <div class="reflection-actions">
            <button class="btn btn-ghost" id="btn-reflect-prev" hidden>이전 생각</button>
            <span class="reflection-step-count" aria-live="polite">1 / 5</span>
            <button class="btn btn-primary btn-big" id="btn-reflect-next">다음 생각 쓰기</button>
          </div>
        </section>

        <section class="panel" id="sec-rewards" style="display:none">
          <details class="completion-details">
            <summary>받은 보상 ${REWARD_ITEMS.length}개 보기</summary>
            <div class="puzzle-trophy-row">
              <div id="globe-3d-slot"></div>
              ${hasAsset('reward.trophy') ? `<img id="trophy-img" class="completion-trophy" src="${assetUrl('reward.trophy')}" data-asset-id="reward.trophy" alt="" aria-hidden="true">` : ''}
            </div>
            <div class="sticker-row completion-rewards" style="margin-top:var(--sp-2)">
              ${REWARD_ITEMS.map((r) => `
                <div class="sticker-slot">
                  <div class="sticker" data-reward="${r.id}" role="img" aria-label="${r.label}"></div>
                  <span class="sticker-name">${r.label}</span>
                </div>`).join('')}
            </div>
          </details>
        </section>

        <section class="panel" id="sec-cert" style="display:none">
          <h2 style="color:var(--c-navy)">나의 세계 연결 수료증</h2>
          <p class="cert-form-note">빈칸은 인쇄한 뒤 손으로 쓸 수 있게 밑줄로 남아요.</p>
          <form class="cert-fields" id="cert-fields" autocomplete="off" aria-label="수료증 학생 정보">
            <label for="cert-school">학교
              <input id="cert-school" name="school" type="text" maxlength="30" placeholder="예: 세계초등학교">
            </label>
            <label for="cert-class">반
              <input id="cert-class" name="className" type="text" maxlength="12" inputmode="numeric" placeholder="예: 3반">
            </label>
            <label for="cert-number">번호
              <input id="cert-number" name="number" type="text" maxlength="12" inputmode="numeric" placeholder="예: 12번">
            </label>
            <label for="cert-name">이름
              <input id="cert-name" name="studentName" type="text" maxlength="20" placeholder="이름">
            </label>
          </form>
          <div id="cert-preview"></div>
          <div class="certificate-actions">
            <button class="btn btn-success btn-big" id="btn-print">수료증 인쇄하기</button>
            <button class="btn btn-primary btn-big" id="btn-ending">엔딩 보기 →</button>
          </div>
        </section>

        <section id="sec-ending" style="display:none" aria-labelledby="ending-title">
          <div class="ending-scene">
            <div class="ending-copy">
              <p class="ending-eyebrow">JOURNEY COMPLETE</p>
              <h1 id="ending-title">세계를 잇는 여행, 완주!</h1>
              <p class="ending-message">다름을 이해하는 질문이 우리를 연결해요.</p>
              <div class="ending-actions">
                <button class="btn btn-primary btn-big" id="btn-ending-home">처음 화면</button>
                <button class="btn btn-success btn-big" id="btn-ending-map">세계지도</button>
              </div>
            </div>
            <div class="ending-fleet" role="img" aria-label="선택한 비행기와 친구들이 함께 날며 완주를 축하합니다">
              ${hasAsset('deco.flight_kids') ? `<img class="ending-flight-kids" src="${assetUrl('deco.flight_kids')}" data-asset-id="deco.flight_kids" alt="" aria-hidden="true">` : ''}
              ${hasAsset(selectedPlane) ? `<img class="ending-plane is-main" src="${assetUrl(selectedPlane)}" data-asset-id="${selectedPlane}" alt="" aria-hidden="true">` : ''}
              ${hasAsset(celebrationWing) ? `<img class="ending-plane is-wing-left" src="${assetUrl(celebrationWing)}" data-asset-id="${celebrationWing}" alt="" aria-hidden="true">` : ''}
              ${hasAsset(completionGuidePlane) ? `<img class="ending-plane is-wing-right" src="${assetUrl(completionGuidePlane)}" data-asset-id="${completionGuidePlane}" alt="" aria-hidden="true">` : ''}
            </div>
          </div>
        </section>`;
      page.appendChild(body);
      root.appendChild(page);

      // 마스코트 가이드 — 퍼즐 → 회고 → 인쇄 순으로 다음 행동 안내
      guide = createGuide({ assetId: reflectionSpeakerId, speakerName: reflectionSpeakerName });
      page.appendChild(guide.el);

      // Three.js 예약 슬롯 — 완성 지구본 (GLB 준비 시 회전 지구본으로 교체)
      body.querySelector('#globe-3d-slot')?.appendChild(
        threeSlot({ slotId: 'completion-globe', assetId: 'reward.globe_puzzle', label: '완성된 퍼즐 지구본', width: 'min(220px,44vw)' })
      );

      // ---- 보상 바 채우기 (표현 전용) ----
      const fillRewards = (animate: boolean) => {
        const slots = Array.from(body.querySelectorAll<HTMLElement>('[data-reward]'));
        slots.forEach((slot, i) => {
          if (slot.classList.contains('is-filled')) return;
          const id = slot.dataset.reward ?? '';
          const fill = () => {
            slot.classList.add('is-filled');
            if (hasAsset(id)) {
              const img = document.createElement('img');
              img.src = assetUrl(id);
              img.dataset.assetId = id;
              img.alt = '';
              img.setAttribute('aria-hidden', 'true');
              slot.appendChild(img);
            }
            popBounce(slot);
          };
          if (animate) timers.push(window.setTimeout(fill, 250 + i * 200));
          else fill();
        });
      };

      // ---- 퍼즐 지구본 ----
      const tray = body.querySelector('#piece-tray') as HTMLElement;
      const globe = body.querySelector('#globe-zone') as HTMLElement;
      const hasCompletionGlobe = hasAsset('earth.completion.globe');
      if (hasCompletionGlobe) {
        globe.style.backgroundImage = `radial-gradient(circle,rgba(8,45,85,.05),rgba(8,45,85,.18)),url('${assetUrl('earth.completion.globe')}')`;
        globe.style.backgroundSize = 'cover';
        globe.style.backgroundPosition = 'center';
      }
      const alreadyIssued = save.completion.certificateIssued;

      const appendPlacedPiece = (id: MissionId) => {
        const seg = document.createElement('div');
        seg.dataset.pieceId = id;
        seg.className = 'globe-slice';
        seg.style.background = hasCompletionGlobe
          ? `color-mix(in srgb, ${PIECE_COLORS[id]} 38%, transparent)`
          : PIECE_COLORS[id];
        seg.style.color = hasCompletionGlobe ? '#fff' : PIECE_TEXT_COLORS[id];
        if (hasCompletionGlobe) {
          seg.style.border = '1px solid rgba(255,255,255,.62)';
          seg.style.textShadow = '0 2px 5px rgba(0,0,0,.7)';
        }
        seg.textContent = PIECES.find((p) => p.id === id)?.label ?? '';
        globe.appendChild(seg);
      };

      for (const id of placed) appendPlacedPiece(id);

      for (const piece of PIECES) {
        if (placed.has(piece.id)) continue;
        const el = document.createElement('div');
        el.className = 'card card-pick';
        el.dataset.itemId = piece.id;
        el.style.cssText = `min-width:104px;min-height:72px;text-align:center;font-family:var(--font-head);border-top:6px solid ${PIECE_COLORS[piece.id]}`;
        el.innerHTML = `<span aria-hidden="true">◆</span><br>${piece.label}`;
        el.setAttribute('aria-label', `퍼즐 조각: ${piece.label}`);
        tray.appendChild(el);
      }
      globe.dataset.zoneId = 'globe';
      globe.setAttribute('aria-label', '지구본 — 조각을 놓는 곳');

      // 단계가 끝나면 그 단계 패널은 접는다 — 한 화면에 큰 패널 2개 이하(§7), 스크롤 없이 순서대로.
      const puzzleDone = (announce = true) => {
        if (announce) {
          void audio.playSfx('complete');
          burstConfetti(globe, 10); // 파티클은 overlay-root에 fixed로 붙으므로 패널을 접어도 남는다
        }
        page.classList.add('is-writing');
        (body.querySelector('#sec-puzzle') as HTMLElement).style.display = 'none';
        (body.querySelector('#sec-reflect') as HTMLElement).style.display = 'block';
        showReflectionStep(1);
        if (alreadyIssued) {
          fillRewards(false); // 이미 발급했던 경우 보상 바 즉시 채움
          revealCertificate(); // 회고 스킵 가능
        }
      };

      dnd = enablePickPlace({
        items: Array.from(tray.querySelectorAll<HTMLElement>('.card-pick')),
        zones: [globe],
        onPlace: (itemId) => {
          if (!MISSION_IDS.includes(itemId as MissionId)) return;
          const id = itemId as MissionId;
          if (placed.has(id)) return;
          placed.add(id);
          const src = tray.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
          src?.remove();
          appendPlacedPiece(id);
          saveRepo.update((s) => {
            s.completion.placedPuzzlePieceIds = PIECES
              .map((piece) => piece.id)
              .filter((pieceId) => placed.has(pieceId));
          });
          void audio.playSfx('stamp');
          if (placed.size === PIECES.length) puzzleDone();
          else guide?.setCue(tray.querySelector<HTMLElement>('.card-pick')); // 다음 조각으로 큐 이동
        }
      });
      if (placed.size < PIECES.length) {
        guide.say('조각을 지구본으로 옮겨 봐요.', {
          cue: tray.querySelector<HTMLElement>('.card-pick'),
          speaker: { assetId: reflectionSpeakerId, name: reflectionSpeakerName }
        });
      }

      // ---- 회고 + 실천 약속 ----
      const chosen = new Set<string>(
        save.completion.actionPrinciples.filter((principle) => principles.includes(principle)).slice(0, 2)
      );
      const persistChosen = () => {
        saveRepo.update((s) => {
          s.completion.actionPrinciples = [...chosen];
        });
      };
      body.querySelectorAll<HTMLElement>('.principle-pick').forEach((btn) => {
        if (chosen.has(btn.dataset.p ?? '')) {
          btn.classList.add('is-selected');
          btn.setAttribute('aria-pressed', 'true');
        }
        btn.addEventListener('click', () => {
          const p = btn.dataset.p ?? '';
          if (chosen.has(p)) {
            chosen.delete(p);
            btn.classList.remove('is-selected');
            btn.setAttribute('aria-pressed', 'false');
            persistChosen();
          } else if (chosen.size < 2) {
            chosen.add(p);
            btn.classList.add('is-selected');
            btn.setAttribute('aria-pressed', 'true');
            persistChosen();
            void audio.playSfx('tap');
          } else {
            showToast('실천 약속은 두 가지만 고를 수 있어요.');
          }
        });
      });

      const draftInputs = [
        ['#ref-1', 'initialThought'],
        ['#ref-2', 'evidenceLearned'],
        ['#ref-3', 'revisedThought'],
        ['#ref-4', 'transferApplication']
      ] as const;
      for (const [selector, key] of draftInputs) {
        const input = body.querySelector<HTMLInputElement>(selector);
        if (!input) continue;
        input.value = save.completion.reflectionDrafts[key];
        input.addEventListener('input', () => {
          const limit = key === 'transferApplication' ? 100 : 60;
          const value = input.value.slice(0, limit);
          if (input.value !== value) input.value = value;
          saveRepo.update((s) => {
            s.completion.reflectionDrafts[key] = value;
          });
        });
      }

      const applyArtifactToReflection = (artifact: MissionArtifact): void => {
        selectedArtifact = artifact;
        const values = {
          initialThought: artifact.initialHypothesis || artifact.firstDecision,
          evidenceLearned: artifact.voiceName
            ? `${artifact.voiceName}: ${artifact.evidenceLabel}`
            : artifact.evidenceLabel,
          revisedThought: artifact.revisedDecision || artifact.rationale
        };
        // 자동 대입하면 회고가 복사가 된다 — 참고 문구로만 보여 주고 학생이 직접 타이핑하게 한다
        const hintByInput = {
          '#ref-1': values.initialThought.slice(0, 60),
          '#ref-2': values.evidenceLearned.slice(0, 60),
          '#ref-3': values.revisedThought.slice(0, 60)
        };
        for (const [selector, hint] of Object.entries(hintByInput)) {
          const input = body.querySelector<HTMLInputElement>(selector);
          if (!input) continue;
          input.placeholder = hint;
          let quote = input.parentElement?.querySelector<HTMLElement>('.ref-hint') ?? null;
          if (!quote) {
            quote = document.createElement('p');
            quote.className = 'ref-hint';
            input.before(quote);
          }
          quote.textContent = `참고: ${hint}`;
        }
        const transferPrompt = body.querySelector<HTMLElement>('#transfer-prompt');
        if (transferPrompt) transferPrompt.textContent = artifact.transferPrompt;
        body.querySelectorAll<HTMLButtonElement>('[data-artifact-id]').forEach((button) => {
          const on = button.dataset.artifactId === artifact.missionId;
          button.classList.toggle('is-selected', on);
          button.setAttribute('aria-checked', String(on));
        });
        showToast(`${artifact.title} 기록을 참고 문구로 띄웠어요. 내 말로 직접 적어 봐요.`);
      };
      body.querySelectorAll<HTMLButtonElement>('[data-artifact-id]').forEach((button) => {
        button.addEventListener('click', () => {
          const artifact = missionArtifacts.find((item) => item.missionId === button.dataset.artifactId);
          if (!artifact) return;
          void audio.playSfx('tap');
          applyArtifactToReflection(artifact);
          showReflectionStep(1);
        });
      });

      const reflectionPanels = Array.from(body.querySelectorAll<HTMLElement>('[data-reflection-step]'));
      const reflectionDots = Array.from(body.querySelectorAll<HTMLElement>('.reflection-progress span'));
      const reflectionProgress = body.querySelector<HTMLElement>('.reflection-progress');
      const reflectionCount = body.querySelector<HTMLElement>('.reflection-step-count');
      const reflectionPrevious = body.querySelector<HTMLButtonElement>('#btn-reflect-prev');
      const reflectionNext = body.querySelector<HTMLButtonElement>('#btn-reflect-next');
      const reflectionMessages = [
        '여행 전의 생각부터 적어 봐요.',
        '생각을 바꾼 자료를 하나 떠올려요.',
        '자료를 본 뒤 생각이 어떻게 바뀌었나요?',
        '배운 판단을 새 상황에서 어떻게 쓸지 적어 봐요.',
        '앞으로 지킬 약속 두 가지를 골라요.'
      ];
      let reflectionStep = 1;
      const reflectionSpeaker = { assetId: reflectionSpeakerId, name: reflectionSpeakerName };
      const reflectionCue = (step: number): HTMLElement | null => {
        if (step <= 4) return body.querySelector<HTMLElement>(`#ref-${step}`);
        return body.querySelector<HTMLElement>('.principle-pick');
      };
      const showReflectionStep = (step: number, announce = true) => {
        reflectionStep = Math.max(1, Math.min(5, step));
        reflectionPanels.forEach((panel) => {
          panel.hidden = Number(panel.dataset.reflectionStep) !== reflectionStep;
        });
        reflectionDots.forEach((dot, index) => {
          dot.classList.toggle('is-done', index + 1 < reflectionStep);
          dot.classList.toggle('is-now', index + 1 === reflectionStep);
        });
        reflectionProgress?.setAttribute('aria-label', '회고 진행 중');
        if (reflectionCount) reflectionCount.textContent = '';
        if (reflectionPrevious) reflectionPrevious.hidden = reflectionStep === 1;
        if (reflectionNext) {
          reflectionNext.textContent = reflectionStep === 5
            ? '생각 기록하고 수료증 보기'
            : reflectionStep === 4 ? '지킬 약속 고르기'
              : reflectionStep === 3 ? '새 상황에 적용하기' : '다음 생각 쓰기';
        }
        if (announce) {
          guide?.say(reflectionMessages[reflectionStep - 1] ?? '', {
            cue: reflectionCue(reflectionStep),
            speaker: reflectionSpeaker
          });
        }
      };

      const finishReflection = () => {
        const r1 = (body.querySelector('#ref-1') as HTMLInputElement).value.trim();
        const r2 = (body.querySelector('#ref-2') as HTMLInputElement).value.trim();
        const r3 = (body.querySelector('#ref-3') as HTMLInputElement).value.trim();
        const r4 = (body.querySelector('#ref-4') as HTMLInputElement).value.trim();
        // 1~2자 입력만으로 수료증이 발급되지 않게, 각 생각은 최소 6자를 요구한다
        const tooShort = [r1, r2, r3, r4].findIndex((value) => value.length < 6);
        if (tooShort >= 0) {
          const missingStep = tooShort + 1;
          showToast('여섯 글자 이상, 한 문장으로 적어 주세요.', 'warn');
          showReflectionStep(missingStep);
          reflectionCue(missingStep)?.focus();
          return;
        }
        if (chosen.size < 2) {
          showToast('지킬 약속 두 가지를 골라 주세요.', 'warn');
          showReflectionStep(5);
          return;
        }
        saveRepo.update((s) => {
          s.completion.reflection = `처음에는 ${r1}라고 생각했지만, ${r2} 자료를 보고 ${r3}라고 생각을 바꾸었다. 새 상황에서는 ${r4}라고 적용하겠다.`;
          s.completion.reflectionDrafts = {
            initialThought: r1.slice(0, 60),
            evidenceLearned: r2.slice(0, 60),
            revisedThought: r3.slice(0, 60),
            transferApplication: r4.slice(0, 100)
          };
          s.completion.actionPrinciples = [...chosen];
          if (!s.rewardClaimedById['completion']) {
            s.rewardClaimedById['completion'] = true;
          }
          s.completion.certificateIssued = true;
        });
        void audio.playSfx('complete');
        fillRewards(true);
        revealCertificate();
      };

      reflectionPrevious?.addEventListener('click', () => {
        void audio.playSfx('tap');
        showReflectionStep(reflectionStep - 1);
      });
      reflectionNext?.addEventListener('click', () => {
        if (reflectionStep <= 4) {
          const current = body.querySelector<HTMLInputElement>(`#ref-${reflectionStep}`);
          if ((current?.value.trim().length ?? 0) < 6) {
            showToast('여섯 글자 이상, 한 문장으로 적어 주세요.', 'warn');
            current?.focus();
            return;
          }
          void audio.playSfx('tap');
          showReflectionStep(reflectionStep + 1);
          return;
        }
        finishReflection();
      });

      const certSchool = body.querySelector<HTMLInputElement>('#cert-school');
      const certClass = body.querySelector<HTMLInputElement>('#cert-class');
      const certNumber = body.querySelector<HTMLInputElement>('#cert-number');
      const certName = body.querySelector<HTMLInputElement>('#cert-name');
      body.querySelector<HTMLFormElement>('#cert-fields')?.addEventListener('submit', (event) => event.preventDefault());
      const readCertificateIdentity = (): CertificateIdentity => ({
        school: certSchool?.value.trim() ?? '',
        className: certClass?.value.trim() ?? '',
        number: certNumber?.value.trim() ?? '',
        studentName: certName?.value.trim() ?? ''
      });
      const renderStudentCell = (label: string, value: string) => `
        <span class="cert-student-cell">
          <small>${label}</small>
          <span class="cert-student-value">${value ? escapeHtml(value) : '&nbsp;'}</span>
        </span>`;
      const renderCertificatePreview = () => {
        const cert = body.querySelector('#cert-preview') as HTMLElement;
        const identity = readCertificateIdentity();
        const dateStr = new Date().toLocaleDateString('ko-KR');
        const learningEvidence = selectedArtifact?.evidenceLabel
          ?? saveRepo.get().completion.reflectionDrafts.evidenceLearned
          ?? '';
        const transferApplication = saveRepo.get().completion.reflectionDrafts.transferApplication;
        if (hasAsset('reward.certificate')) {
          cert.className = 'cert-frame';
          cert.innerHTML = `
            <img class="cert-frame-img" src="${assetUrl('reward.certificate')}" data-asset-id="reward.certificate" alt="" aria-hidden="true">
            <div class="cert-text">
              <p class="cert-eyebrow">CERTIFICATE</p>
              <h2>세계 연결 수료증</h2>
              <div class="cert-student-grid" aria-label="학생 정보">
                ${renderStudentCell('학교', identity.school)}
                ${renderStudentCell('반', identity.className)}
                ${renderStudentCell('번호', identity.number)}
                ${renderStudentCell('이름', identity.studentName)}
              </div>
              <p class="cert-statement">다섯 대륙과 세계 친구 지구회의를 모두 완주했어요.${learningEvidence ? `<br>나의 여행 근거 · ${escapeHtml(learningEvidence)}` : ''}${transferApplication ? `<br>새 상황 실천 · ${escapeHtml(transferApplication)}` : ''}</p>
            </div>`;
        } else {
          cert.className = 'cert-frame';
          cert.style.cssText = 'background:#fff;border:6px double var(--c-gold);border-radius:var(--radius-s);padding:var(--sp-5);text-align:center;max-width:720px;margin:var(--sp-3) auto';
          cert.innerHTML = `
            <p class="cert-eyebrow">CERTIFICATE</p><h2>세계 연결 수료증</h2>
            <div class="cert-student-grid">
              ${renderStudentCell('학교', identity.school)}${renderStudentCell('반', identity.className)}
              ${renderStudentCell('번호', identity.number)}${renderStudentCell('이름', identity.studentName)}
            </div>
            <p>다섯 대륙과 세계 친구 지구회의를 모두 완주했어요.</p>${learningEvidence ? `<p>나의 여행 근거 · ${escapeHtml(learningEvidence)}</p>` : ''}${transferApplication ? `<p>새 상황 실천 · ${escapeHtml(transferApplication)}</p>` : ''}<p>${dateStr}</p>`;
        }
      };
      [certSchool, certClass, certNumber, certName].forEach((input) => {
        input?.addEventListener('input', renderCertificatePreview);
      });

      const revealCertificate = () => {
        const s = saveRepo.get();
        if (!s.completion.certificateIssued) {
          saveRepo.update((next) => { next.completion.certificateIssued = true; });
        }
        renderCertificatePreview();
        // 마지막 단계: 보상 스트립 + 수료증만 남긴다(헤더는 축소해 둘 다 스크롤 없이 보이게)
        page.classList.add('is-final');
        (body.querySelector('#sec-puzzle') as HTMLElement).style.display = 'none';
        (body.querySelector('#sec-reflect') as HTMLElement).style.display = 'none';
        (body.querySelector('#sec-rewards') as HTMLElement).style.display = 'block';
        (body.querySelector('#sec-cert') as HTMLElement).style.display = 'block';
        const trophy = body.querySelector<HTMLElement>('#trophy-img');
        if (trophy) popBounce(trophy);
        guide?.say('학생 정보를 쓰고 인쇄하거나, 엔딩을 봐요.', {
          cue: body.querySelector<HTMLElement>('#btn-print'),
          speaker: { assetId: reflectionSpeakerId, name: reflectionSpeakerName }
        });
      };

      body.querySelector('#btn-print')?.addEventListener('click', () => {
        const s = saveRepo.get();
        saveRepo.update((next) => { next.completion.certificateIssued = true; });
        let printBox = document.querySelector('.certificate-print') as HTMLElement | null;
        if (!printBox) {
          printBox = document.createElement('div');
          printBox.className = 'certificate-print';
          document.getElementById('scene-root')?.appendChild(printBox);
        }
        printBox.innerHTML = certificateHtml(
          readCertificateIdentity(),
          new Date().toLocaleDateString('ko-KR'),
          s.completion.actionPrinciples,
          selectedPlane,
          selectedArtifact?.evidenceLabel ?? s.completion.reflectionDrafts.evidenceLearned,
          s.completion.reflectionDrafts.transferApplication
        );
        document.body.classList.add('printing-certificate');
        const clearPrintMode = () => document.body.classList.remove('printing-certificate');
        window.addEventListener('afterprint', clearPrintMode, { once: true });
        window.print();
        window.setTimeout(clearPrintMode, 1000);
      });

      let endingBusy = false;
      const showEndingScene = () => {
        saveRepo.update((s) => { s.completion.certificateIssued = true; });
        page.classList.remove('is-writing', 'is-final');
        page.classList.add('is-ending');
        (body.querySelector('#sec-ending') as HTMLElement).style.display = 'block';
        const endingMessage = body.querySelector<HTMLElement>('.ending-message');
        const completionDrafts = saveRepo.get().completion.reflectionDrafts;
        if (endingMessage && completionDrafts.transferApplication) {
          endingMessage.textContent = `“${completionDrafts.transferApplication}”라는 실천을 다음 여행과 우리 생활에서 이어 가요.`;
        } else if (endingMessage && completionDrafts.revisedThought) {
          endingMessage.textContent = `“${completionDrafts.revisedThought}”라는 생각을 다음 여행과 우리 생활에서도 실천해요.`;
        }
        guide?.el.setAttribute('hidden', '');
        void audio.playSfx('complete');
        const endingScene = body.querySelector<HTMLElement>('.ending-scene');
        if (endingScene) burstConfetti(endingScene, 18);
        const mainPlane = body.querySelector<HTMLElement>('.ending-plane.is-main');
        if (mainPlane) popBounce(mainPlane);
      };
      body.querySelector('#btn-ending')?.addEventListener('click', () => {
        if (endingBusy) return;
        endingBusy = true;
        // 엔딩 영상(final/final.mp4 원본 → public/video/final.mp4) 뒤에 엔딩 장면. BGM은 오버레이가 멈췄다 되돌린다.
        playVideoOverlay({
          id: 'final',
          src: 'video/final.mp4',
          poster: 'video/final_poster.jpg',
          title: '세계를 잇는 여행 엔딩 영상',
          skipLabel: '건너뛰고 엔딩 보기',
          cues: FINAL_CUES,
          onDone: () => { endingBusy = false; showEndingScene(); }
        });
      });
      body.querySelector('#btn-ending-home')?.addEventListener('click', () => navigate('#/'));
      body.querySelector('#btn-ending-map')?.addEventListener('click', () => navigate('#/map'));

      // 기존 발급자는 회고 섹션 즉시 노출
      if (placed.size === PIECES.length) puzzleDone(false);
    },

    unmount() {
      // 엔딩 영상 도중 이탈해도 BGM이 되살아나게 finish 경유로 닫는다
      closeActiveVideoOverlay();
      for (const t of timers) window.clearTimeout(t);
      timers.length = 0;
      dnd?.dispose();
      dnd = null;
      guide?.dispose();
      guide = null;
    }
  };
}

interface CertificateIdentity {
  school: string;
  className: string;
  number: string;
  studentName: string;
}

function certificateHtml(
  identity: CertificateIdentity,
  date: string,
  principles: string[],
  planeAssetId: string,
  learningEvidence = '',
  transferApplication = ''
): string {
  const field = (label: string, value: string) => `
    <span class="certificate-sheet__field">
      <span>${label}</span><span class="certificate-sheet__line">${value ? escapeHtml(value) : '&nbsp;'}</span>
    </span>`;
  const promise = principles.length
    ? `나의 실천 약속 · ${principles.map(escapeHtml).join(' · ')}`
    : '나의 실천 약속 · ____________________________________';
  return `
    <article class="certificate-sheet" aria-label="세계 연결 수료증">
      ${hasAsset(planeAssetId) ? `<img class="certificate-sheet__plane" src="${assetUrl(planeAssetId)}" data-asset-id="${planeAssetId}" alt="">` : ''}
      <p class="certificate-sheet__eyebrow">CERTIFICATE</p>
      <h1>세계 연결 수료증</h1>
      <p class="certificate-sheet__lead">다섯 대륙의 생활을 탐구하고 세계 친구 지구회의를 완주하여<br>세계를 연결하는 여행을 마쳤음을 인증합니다.</p>
      <div class="certificate-sheet__identity">
        ${field('학교', identity.school)}
        ${field('반', identity.className)}
        ${field('번호', identity.number)}
        ${field('이름', identity.studentName)}
      </div>
      ${learningEvidence ? `<p class="certificate-sheet__promise">나의 여행 근거 · ${escapeHtml(learningEvidence)}</p>` : ''}
      ${transferApplication ? `<p class="certificate-sheet__promise">새 상황 실천 · ${escapeHtml(transferApplication)}</p>` : ''}
      <p class="certificate-sheet__promise">${promise}</p>
      <footer class="certificate-sheet__footer">
        <span>${escapeHtml(date)}</span><span>세계 연결 탐험대</span><span class="certificate-sheet__seal">완주</span>
      </footer>
    </article>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
