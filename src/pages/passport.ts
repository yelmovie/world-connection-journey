import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { withJosa } from '../core/josa';
import { saveRepo } from '../core/SaveRepository';
import { buildTopBar } from '../ui/chrome';
import { burstConfetti, popBounce } from '../ui/fx';
import { cancelJourneyTransition, playJourneyTransition } from '../ui/journeyTransition';
import { isStampId, STAMP_ASSETS, STAMP_LABELS, STAMP_SLOTS } from '../core/stamps';
import { showToast } from '../ui/toast';
import { AIRPLANE_CHOICES as PLANES } from '../ui/airplaneFleet';
import { AVATAR_CHOICES as AVATARS } from '../ui/avatarRoster';
import { validatePassportNickname } from '../core/passportNickname';
export { validatePassportNickname } from '../core/passportNickname';

interface CommonContent {
  nickname?: { minLen: number; maxLen: number; banned: string[] };
}

interface PassportDraft {
  nickname: string;
  avatarId: string;
  airplaneId: string;
  step: number;
  maxReached: number;
}

const PASSPORT_DRAFT_KEY = 'world-connection-journey.passport-draft.v1';

const PASSPORT_CSS = `
.passport-page {
  --passport-panel-inset:clamp(8px,1.3vh,16px);
  --passport-shell-h:clamp(560px,72dvh,680px);
  --guide-size:clamp(168px,15vw,220px);
  background-position:center;background-size:cover;
  grid-template-rows:auto minmax(0,1fr);
}
.passport-page.passport-step-3 { --passport-shell-h:clamp(620px,78dvh,780px); }
.passport-page > .page-body { grid-row:2;overflow:hidden; }
/* 안내 캐릭터의 발끝을 두 패널의 하단선에 맞춘다. */
.passport-page > .guide-wrap {
  position:absolute;left:0;bottom:max(var(--passport-panel-inset),calc((100dvh - var(--top-bar-h) - var(--passport-shell-h))/2));grid-row:auto;
  width:min(820px,86vw);height:calc(var(--guide-size) + var(--passport-panel-inset));
  padding:0 var(--scene-safe);z-index:calc(var(--z-panel) + 2);
}
.passport-page > .guide-wrap .guide-mascot-button {
  left:var(--scene-safe);bottom:var(--passport-panel-inset);
}
.passport-page > .guide-wrap .guide-bubble {
  left:calc(var(--scene-safe) + var(--guide-size) + var(--sp-2));
  bottom:calc(var(--passport-panel-inset) + var(--sp-2));
}
/* 탐험가·비행기 선택을 가리지 않도록 안내 캐릭터는 별명 단계에서만 둔다. */
.passport-page:not(.passport-step-1) > .guide-wrap { display:none; }
/* 리본 제목이 화면 위로 잘리지 않게 상단바 높이를 내용에 맞춘다 */
.passport-page .top-bar { height:auto;min-height:var(--top-bar-h);padding-block:var(--sp-2); }
.passport-body { max-width:none;padding:var(--passport-panel-inset) clamp(18px,2vw,38px);display:grid;align-items:center; }
/* 셸은 배경이 그대로 보이도록 투명. 패널은 두 개만(§7) */
.passport-shell {
  width:min(1540px,100%);height:min(var(--passport-shell-h),calc(100dvh - var(--top-bar-h) - var(--passport-panel-inset) - var(--passport-panel-inset)));min-height:0;margin:0 auto;
  display:grid;grid-template-columns:minmax(0,970px) minmax(440px,560px);
  gap:clamp(18px,1.4vw,28px);align-items:stretch;justify-content:center;
}
/* §7 반투명 패널 — 배경 일러스트가 비쳐 보이게 */
.passport-shell .scene-board {
  background:rgba(255,252,240,.5);backdrop-filter:blur(4px) saturate(1.03);
  border-color:rgba(255,255,255,.72);box-shadow:0 14px 34px rgba(7,37,62,.16);
}
.passport-form {
  min-width:0;min-height:0;height:100%;display:grid;grid-template-rows:auto minmax(0,1fr);
  gap:var(--sp-3);padding:clamp(14px,1.2vw,22px);align-content:stretch;
}
.passport-stepper { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-2); }
.passport-step-chip {
  min-width:0;min-height:56px;padding:8px 12px;border:2px solid var(--c-line);border-radius:var(--radius-m);
  background:rgba(255,255,255,.82);color:var(--c-ink-soft);font-size:max(18px,var(--fs-small));font-weight:800;
}
.passport-step-chip[aria-current="step"] { border-color:var(--c-violet);background:#fff;color:var(--c-violet-ink);box-shadow:var(--shadow-card); }
.passport-step-chip.is-done::before { content:'✓ ';color:var(--c-success-ink); }
.passport-step-chip:disabled { opacity:.48;cursor:not-allowed; }
.passport-section { min-width:0;min-height:0;display:grid;gap:var(--sp-3);align-content:center; }
.passport-section[data-passport-step="2"],
.passport-section[data-passport-step="3"] { grid-template-rows:auto auto minmax(0,1fr);align-content:stretch; }
.passport-section[hidden] { display:none!important; }
.passport-label { display:block;margin-bottom:4px;font-weight:900;color:var(--c-navy);font-size:var(--fs-body);font-family:var(--font-head);line-height:1.45; }
.passport-nickname {
  width:100%;min-height:76px;padding:12px 20px;border:2px solid rgba(242,193,78,.9);
  border-radius:var(--radius-m);font-size:clamp(24px,1.65vw,32px);background:rgba(255,255,255,.76);
  box-shadow:0 8px 24px rgba(12,42,68,.1);backdrop-filter:blur(5px);
}
.passport-nick-row {
  width:min(920px,96%);min-height:0;justify-self:center;align-self:center;
  padding:clamp(22px,4vh,56px) clamp(8px,1.2vw,18px);
  padding-left:clamp(176px,17vw,230px);
}
/* 빈 상태에서 테두리만 남은 빨간 박스가 보이지 않게 */
.passport-form #nick-msg[hidden] { display:none !important; }
.passport-form #nick-msg { padding:var(--sp-2) var(--sp-3);margin-top:6px;font-size:max(18px,var(--fs-small)); }
.passport-choice-row { display:grid;gap:var(--sp-3); }
.passport-avatars {
  grid-template-columns:repeat(6,minmax(0,1fr));align-self:center;
  gap:clamp(10px,1vw,16px);
}
.passport-planes {
  grid-template-columns:repeat(5,minmax(0,1fr));
  grid-template-rows:repeat(2,minmax(0,1fr));
  min-height:0;gap:clamp(10px,1vw,16px);padding:4px;overflow:visible;align-self:stretch;
}
.passport-choice-hint { margin:0;color:var(--c-ink-soft);font-size:max(18px,var(--fs-small));font-weight:750;line-height:1.35; }
.passport-choice {
  position:relative;min-width:64px;min-height:210px;padding:10px;border:3px solid transparent;border-radius:var(--radius-m);
  display:grid;grid-template-rows:minmax(0,1fr) auto;align-items:end;
  background:rgba(255,255,255,.6)!important;box-shadow:var(--shadow-card);overflow:hidden;
  backdrop-filter:blur(6px) saturate(1.04);
}
.passport-choice img { width:100%;object-fit:contain;aspect-ratio:auto; }
.passport-avatar img { height:clamp(140px,9vw,176px);object-fit:contain;border-radius:var(--radius-s); }
.passport-plane {
  min-height:0;padding:8px 8px 10px;
  grid-template-rows:minmax(0,1fr) auto;align-items:stretch;
}
.passport-plane img {
  width:100%;height:100%;min-height:0;object-fit:contain;border-radius:var(--radius-s);
  background:transparent;mix-blend-mode:multiply;
}
.passport-choice .label {
  display:grid;place-items:center;min-width:0;min-height:2em;max-width:100%;
  color:var(--c-navy);font-size:max(18px,var(--fs-small));line-height:1.2;text-align:center;
  white-space:normal;overflow:visible;text-overflow:clip;word-break:keep-all;overflow-wrap:anywhere;
}
.passport-choice .choice-name { display:block;font-weight:900; }
.passport-plane .label {
  min-height:42px;padding:6px 2px 2px;align-self:stretch;align-content:center;
  font-size:clamp(21px,1.35vw,27px);line-height:1.2;
}
.passport-choice[aria-checked="true"] { border-color:var(--c-violet);box-shadow:0 0 0 3px rgba(108,76,232,.2),var(--shadow-card); }
.passport-choice[aria-checked="true"]::after {
  content:'✓';position:absolute;right:6px;top:6px;width:32px;height:32px;border-radius:50%;
  display:grid;place-items:center;background:var(--c-violet);color:#fff;font-size:20px;font-weight:900;
}
/* 내가 직접 만든 여권 — 원화의 빈 칸에 고른 탐험가와 비행기를 실시간으로 합성한다. */
.passport-preview {
  position:relative;min-width:0;min-height:0;height:100%;
  display:grid;grid-template-rows:auto minmax(0,1fr) auto;align-content:stretch;justify-items:center;
  gap:8px;padding:clamp(14px,1.3vw,24px);overflow:visible;
  background:rgba(239,250,252,.48)!important;
}
.passport-preview-heading {
  width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;
  position:relative;z-index:2;
}
.passport-heading-copy { min-width:0;display:grid;justify-items:center;gap:2px; }
.passport-maker-kicker {
  display:inline-flex;align-items:center;min-height:28px;padding:3px 14px;border-radius:999px;
  background:#eaf8f7;color:#186b6c;border:2px dashed rgba(24,107,108,.32);
  font-size:max(16px,var(--fs-small));font-weight:900;letter-spacing:.02em;
}
.passport-preview__title {
  max-width:100%;margin:0;color:var(--c-navy);font-family:var(--font-head);
  font-size:clamp(32px,2.5vw,46px);line-height:1.12;text-align:center;word-break:keep-all;
}
.passport-advance {
  width:auto;min-width:clamp(168px,11.5vw,220px);max-width:230px;min-height:54px;
  padding:10px 16px;font-size:clamp(18px,1.15vw,22px);line-height:1.15;white-space:normal;
}
.passport-book {
  position:relative;align-self:center;width:min(620px,118%);max-width:none;aspect-ratio:3/2;isolation:isolate;
  filter:drop-shadow(0 14px 26px rgba(8,35,58,.2));
}
.passport-book-art { position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:0; }
.passport-book-slot { position:absolute;z-index:1;display:grid;place-items:center;pointer-events:none; }
.passport-explorer-slot { left:14.2%;top:14.2%;width:30.4%;height:60.5%; }
.passport-plane-slot {
  left:54.7%;top:16.5%;width:27.5%;height:41.5%;border-radius:50%;overflow:hidden;
  border:3px solid rgba(255,255,255,.94);background:radial-gradient(circle at 50% 38%,#fff 0 34%,#e9f8ff 68%,#bfe7f5 100%);
  box-shadow:0 6px 16px rgba(25,50,77,.2);
}
.passport-hero {
  width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 5px 8px rgba(25,50,77,.28));
  transform-origin:50% 100%;animation:passport-arrive .42s cubic-bezier(.2,.85,.35,1.2) both;
}
.passport-plane-preview {
  width:100%;height:100%;object-fit:cover;border-radius:50%;clip-path:circle(49% at 50% 50%);
  filter:drop-shadow(0 5px 8px rgba(25,50,77,.24));
  animation:passport-arrive .42s cubic-bezier(.2,.85,.35,1.2) both;
}
/* 여권 종이 위에 바로 적힌 듯한 이름표 — 상자 없이, 작은 항목명 + 점선 + 이름 */
.passport-book-label {
  position:absolute;z-index:2;margin:0;display:grid;justify-items:center;align-content:center;min-width:0;gap:2px;
  padding:0;background:transparent;border:0;box-shadow:none;color:var(--c-navy);text-align:center;line-height:1.1;
  text-shadow:0 0 6px rgba(255,255,255,.95),0 0 2px rgba(255,255,255,.9);
}
.passport-book-label span { font-size:13px;font-weight:800;letter-spacing:.22em;color:#3d7a80;text-transform:uppercase; }
.passport-book-label strong { max-width:100%;padding-top:3px;border-top:1.5px dotted rgba(29,74,111,.45);font:950 clamp(19px,1.2vw,22px)/1.1 var(--font-head);white-space:normal;word-break:keep-all;letter-spacing:.02em; }
.passport-avatar-label { left:16%;bottom:19.2%;width:27%; }
.passport-plane-label { left:57%;top:58.5%;width:24%; }
.passport-owner-mark {
  display:none;
}
.passport-selected-label {
  width:100%;max-width:100%;min-height:1.6em;margin:0;color:var(--c-navy);font-size:max(18px,var(--fs-small));font-weight:900;
  text-align:center;line-height:1.45;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;
}
.passport-selected-label span { display:block; }
@keyframes passport-arrive { from { opacity:0;transform:translateY(6px) scale(.94); } to { opacity:1;transform:none; } }
@media (max-width:1100px), (max-height:620px) {
  .passport-shell { grid-template-columns:minmax(0,1.55fr) minmax(300px,.78fr);gap:var(--sp-2); }
  .passport-body { padding-block:4px; }
  .passport-form { gap:var(--sp-3);padding:var(--sp-3); }
  .passport-label { margin-bottom:2px;line-height:1.15; }
  .passport-nickname { min-height:56px;padding:8px 12px; }
  .passport-nick-row { padding-left:clamp(150px,17vw,188px); }
  .passport-choice { min-height:142px;padding:6px; }
  .passport-avatar img { height:92px; }
  .passport-plane { min-height:0;padding:7px 7px 9px;grid-template-rows:minmax(0,1fr) auto; }
  .passport-plane img { height:100%; }
  .passport-plane .label { min-height:34px;padding-top:4px;font-size:18px; }
  .passport-planes { gap:7px; }
  .passport-preview { padding:10px; }
  .passport-book { width:min(430px,112%); }
  .passport-preview-heading { gap:6px; }
  .passport-advance { min-width:128px;max-width:148px;min-height:48px;padding:7px 9px;font-size:18px; }
}
@media (max-height:620px) {
  .passport-page > .page-body { overflow-y:auto; }
  .passport-shell { height:auto;min-height:560px; }
  .passport-page > .guide-wrap { bottom:0; }
  .passport-form,.passport-preview { height:auto;min-height:560px; }
  .passport-preview__title { font-size:clamp(22px,2vw,30px); }
  .passport-selected-label { min-height:0;line-height:1.25; }
}
/* 좁은 화면: 여권·도장 영역을 아래로 접는다(단일 컬럼) */
@media (max-width:760px) {
  .passport-page > .page-body { overflow-y:auto; }
  .passport-shell { grid-template-columns:1fr;height:auto; }
  .passport-preview { width:min(620px,100%);justify-self:center; }
  .passport-preview-heading { grid-template-columns:1fr; }
  .passport-advance { width:min(240px,100%);max-width:100%; }
}
@media (max-width:600px) {
  .passport-avatars { grid-template-columns:repeat(3,1fr); }
  .passport-planes { grid-template-columns:repeat(2,1fr);max-height:300px; }
}

/* 2026 passport journey redesign: three immersive travel-preparation scenes. */
.passport-page {
  --passport-footer-h:86px;--passport-route-h:66px;
  background-position:center 42%;
}
.passport-page > .guide-wrap { display:none!important; }
.passport-page > .page-body { overflow:hidden; }
.passport-body { padding:clamp(8px,1.4vh,16px) clamp(14px,2vw,36px); }
.passport-shell {
  position:relative;width:min(1480px,100%);height:calc(100% - clamp(16px,2.8vh,32px));max-height:820px;
  display:block;margin:0 auto;
}
.passport-form {
  position:relative;width:100%;height:100%;min-height:0;padding:0;
  display:grid;grid-template-rows:var(--passport-route-h) minmax(0,1fr) var(--passport-footer-h);gap:0;
  border:1px solid rgba(255,255,255,.76);border-radius:30px;
  background:linear-gradient(135deg,#e8f8fd,#fff8e0);
  box-shadow:0 24px 54px rgba(8,35,58,.26);overflow:hidden;
  backdrop-filter:none;
}
.passport-stepper {
  position:relative;z-index:4;width:min(720px,calc(100% - 180px));height:100%;margin:0 auto;
  display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;align-items:center;
}
.passport-stepper::before {
  content:'';position:absolute;left:16.66%;right:16.66%;top:50%;height:3px;
  background:rgba(39,76,105,.24);transform:translateY(-50%);z-index:-1;
}
.passport-step-chip {
  justify-self:center;width:auto;min-width:132px;min-height:48px;padding:7px 17px;
  border:2px solid rgba(40,78,109,.22);border-radius:999px;background:rgba(245,250,250,.9);
  color:#38566d;font-family:var(--font-head);font-size:clamp(17px,1.25vw,21px);font-weight:900;
  box-shadow:0 4px 10px rgba(13,45,68,.08);
}
.passport-step-chip[aria-current='step'] {
  border-color:#f2c14e;background:#173653;color:#fff;box-shadow:0 0 0 4px rgba(242,193,78,.24),0 7px 16px rgba(13,45,68,.2);
}
.passport-step-chip.is-done { border-color:#63a88c;background:#e5f6ee;color:#245c49; }
.passport-step-chip.is-done::before { content:'✓';margin-right:7px; }
.passport-step-chip:disabled { opacity:.58; }
.passport-scenes { position:relative;min-height:0;overflow:hidden; }
.passport-section {
  position:absolute;inset:0;min-width:0;min-height:0;padding:clamp(12px,2vh,24px) clamp(22px,3.5vw,54px);
  display:grid;grid-template-rows:auto minmax(0,1fr);gap:clamp(10px,1.6vh,18px);align-content:stretch;
}
.passport-section[hidden] { display:none!important; }
.passport-section:not([hidden]) { animation:passport-scene-in .28s ease-out both; }
@keyframes passport-scene-in { from { opacity:.35;transform:translateX(10px); } to { opacity:1;transform:none; } }
.passport-scene-heading { text-align:center;align-self:start; }
.passport-scene-kicker {
  display:inline-flex;align-items:center;min-height:28px;padding:3px 13px;border-radius:999px;
  background:#e6f4ef;color:#22634f;font-size:clamp(15px,1.05vw,18px);font-weight:900;
}
.passport-scene-heading h1 {
  margin:5px 0 2px;color:#173653;font-family:var(--font-head);font-size:clamp(28px,2.45vw,44px);line-height:1.08;
}
.passport-scene-heading p { margin:0;color:#486175;font-size:clamp(17px,1.15vw,21px);font-weight:750; }
.passport-actions {
  position:relative;z-index:5;display:grid;grid-template-columns:190px minmax(0,1fr) 310px;gap:18px;align-items:center;
  padding:12px clamp(18px,2.2vw,34px);border-top:1px solid rgba(45,78,102,.16);
  background:rgba(241,247,246,.9);box-shadow:0 -8px 22px rgba(19,52,76,.08);
}
.passport-actions .btn { min-height:58px;font-size:clamp(18px,1.2vw,22px);font-weight:950; }
.passport-back-step { color:#294c65;background:rgba(255,255,255,.84); }
.passport-back-step[hidden] { visibility:hidden;display:block!important; }
.passport-advance { width:100%;max-width:none;min-height:58px;white-space:normal; }
.passport-step-status { margin:0;text-align:center;color:#31556d;font-size:clamp(17px,1.1vw,20px);font-weight:900; }
.passport-peek {
  position:absolute;right:24px;top:14px;z-index:8;width:138px;min-height:58px;padding:5px 10px;
  display:grid;grid-template-columns:42px 1fr;gap:8px;align-items:center;border:2px solid rgba(242,193,78,.8);
  border-radius:16px;background:#173653;color:#fff;box-shadow:0 8px 18px rgba(8,35,58,.22);
  font-size:16px;font-weight:900;
}
.passport-peek img { width:42px;height:48px;object-fit:contain;filter:drop-shadow(0 3px 4px rgba(0,0,0,.2)); }
.passport-preview {
  position:absolute;right:20px;top:78px;z-index:12;width:min(530px,calc(100% - 40px));height:auto;min-height:0;
  padding:16px;border:2px solid rgba(255,255,255,.82);border-radius:24px;
  background:rgba(225,244,248,.96)!important;box-shadow:0 24px 50px rgba(6,31,53,.36);
  display:grid;grid-template-rows:auto auto auto;gap:8px;justify-items:center;
}
.passport-preview[hidden] { display:none!important; }
.passport-stamps { width:min(480px,100%);display:grid;gap:6px;justify-items:center; }
.passport-stamps__title { margin:0;font:800 max(15px,var(--fs-small)) var(--font-body);color:#3d5a72;letter-spacing:.02em; }
.passport-stamps__title b { color:var(--c-navy);font-size:1.15em; }
.passport-stamps__row { display:grid;grid-template-columns:repeat(6,1fr);gap:8px;width:100%; }
.passport-stamp { display:grid;gap:4px;min-width:0; }
.passport-stamp-name { text-align:center;font:800 12px/1.2 var(--font-body);color:#3d5a72;white-space:nowrap; }
.passport-stamp-slot { aspect-ratio:1;display:grid;place-items:center;border:2px dashed rgba(29,74,111,.35);border-radius:14px;background:rgba(255,255,255,.55);color:#8aa0b2;font:900 18px var(--font-head);overflow:hidden; }
.passport-stamp-slot.is-earned { border:2px solid var(--c-gold);background:#fff;box-shadow:var(--shadow-card); }
.passport-stamp-slot img { width:100%;height:100%;object-fit:cover; }
.passport-preview-heading { width:100%;display:grid;grid-template-columns:1fr auto;align-items:center; }
.passport-preview-heading .passport-heading-copy { justify-items:start; }
.passport-preview__title { font-size:clamp(24px,1.8vw,32px);text-align:left; }
.passport-preview-close { width:46px;height:46px;padding:0;border-radius:50%;font-size:26px; }
.passport-preview .passport-book { width:min(480px,100%); }
.passport-preview .passport-selected-label { font-size:18px; }
.passport-preview-scrim { position:absolute;inset:0;z-index:10;background:rgba(8,32,54,.18);border:0; }
.passport-preview-scrim[hidden] { display:none!important; }

.passport-nick-row { width:auto;justify-self:stretch;align-self:stretch;padding:clamp(12px,2vh,22px) clamp(24px,4vw,64px); }
.passport-station {
  min-height:0;display:grid;grid-template-columns:minmax(240px,.7fr) minmax(430px,1.15fr) minmax(250px,.72fr);
  gap:clamp(18px,3vw,48px);align-items:center;
}
.passport-station-guide { position:relative;height:100%;min-height:260px;display:grid;place-items:end center; }
.passport-station-guide img { width:min(260px,90%);height:min(380px,100%);object-fit:contain;object-position:center bottom;filter:drop-shadow(0 12px 16px rgba(22,50,72,.22)); }
.passport-guide-bubble {
  position:absolute;left:0;top:7%;width:min(240px,94%);margin:0;padding:14px 18px;border-radius:20px 20px 20px 6px;
  background:#fffdf5;color:#24455e;box-shadow:0 9px 20px rgba(18,51,73,.17);font-size:clamp(17px,1.18vw,21px);font-weight:850;line-height:1.35;
}
.passport-tag-wrap { align-self:center; }
.passport-label { margin:0 0 10px;color:#173653;font-size:clamp(19px,1.3vw,23px); }
.passport-luggage-tag {
  position:relative;padding:26px 30px 24px;border:3px solid #e8b940;border-radius:18px 34px 34px 18px;
  background:linear-gradient(145deg,#fffefa,#f7eed2);box-shadow:0 15px 30px rgba(28,54,72,.16);
}
.passport-luggage-tag::before { content:'';position:absolute;right:18px;top:18px;width:16px;height:16px;border:4px solid #d8c99a;border-radius:50%;background:#fff; }
.passport-nickname {
  width:calc(100% - 4px);min-height:74px;padding:11px 18px;border:0;border-bottom:4px solid #6e9f9a;border-radius:4px;
  background:rgba(255,255,255,.7);box-shadow:none;font-size:clamp(26px,2vw,36px);font-weight:950;text-align:center;
}
.passport-nickname:focus { outline:4px solid rgba(71,119,217,.28); }
.passport-nickname-meta { display:flex;justify-content:space-between;gap:12px;margin-top:10px;color:#516879;font-size:17px;font-weight:800; }
#nick-msg { margin:10px 0 0; }
.passport-cover-live {
  position:relative;display:grid;grid-template-rows:minmax(0,1fr) auto;place-items:center;justify-self:center;
  width:min(285px,100%);gap:10px;padding:4px 10px 10px;
}
.passport-cover-art { position:relative;width:min(220px,90%);aspect-ratio:.75;display:grid;place-items:center; }
.passport-cover-art::after { content:'';position:absolute;inset:8% 3% -2%;z-index:-1;border-radius:45%;background:rgba(28,107,123,.16);filter:blur(18px); }
.passport-cover-art img { width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 16px 22px rgba(8,35,58,.28)); }
.passport-cover-owner {
  width:min(270px,100%);min-height:78px;padding:9px 16px 11px;display:grid;justify-items:center;align-content:center;gap:2px;
  border:4px solid #173653;border-radius:20px;background:linear-gradient(145deg,#fffdf7,#fff3c8);
  box-shadow:0 0 0 4px rgba(242,193,78,.88),0 12px 24px rgba(8,35,58,.2);transform:rotate(-1deg);
}
.passport-cover-owner span { color:#39706c;font-size:clamp(15px,1vw,18px);font-weight:950;letter-spacing:.06em; }
.passport-cover-name { max-width:100%;color:#102f49;text-align:center;font-family:var(--font-head);font-size:clamp(24px,1.75vw,32px);font-weight:950;line-height:1.08;word-break:keep-all;overflow-wrap:anywhere; }

.passport-selection-layout { min-height:0;display:grid;grid-template-rows:minmax(0,1fr) 126px;gap:10px; }
.passport-selector-stage { min-height:0;display:grid;grid-template-columns:72px minmax(0,1fr) 72px;gap:12px;align-items:center; }
.passport-arrow {
  width:64px;height:64px;padding:0;border:2px solid rgba(38,75,103,.22);border-radius:50%;background:rgba(255,255,255,.88);
  display:grid;place-items:center;color:#173653;box-shadow:0 7px 16px rgba(12,43,65,.15);
}
.passport-arrow svg { width:30px;height:30px;stroke:currentColor;stroke-width:3;fill:none; }
.passport-feature {
  touch-action:none; /* 무대 위 좌우 스와이프는 우리가 pointer 이벤트로 받는다 */
  position:relative;height:100%;min-height:260px;display:grid;grid-template-columns:minmax(260px,.85fr) minmax(320px,1fr);
  align-items:center;gap:clamp(20px,4vw,70px);padding:8px clamp(14px,3vw,46px);
}
.passport-stage-art { position:relative;align-self:stretch;min-height:0;display:grid;place-items:center;isolation:isolate; }
.passport-stage-art::before {
  content:'';position:absolute;width:min(340px,82%);aspect-ratio:1;border:2px dashed rgba(41,105,113,.36);border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.76) 0 38%,rgba(190,227,222,.45) 39% 58%,transparent 59%);z-index:-1;
}
.passport-avatar-stage-img { width:min(330px,90%);height:100%;max-height:390px;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 14px 16px rgba(16,48,69,.24)); }
.passport-stage-copy { align-self:center;min-width:0; }
.passport-stage-role { margin:0;color:#39706c;font-size:clamp(18px,1.25vw,23px);font-weight:900; }
.passport-stage-name { margin:4px 0 12px;color:#173653;font-family:var(--font-head);font-size:clamp(38px,3vw,58px);line-height:1; }
.passport-stage-line { margin:0;max-width:560px;padding:16px 20px;border-radius:22px 22px 22px 6px;background:#fffdf7;color:#27485e;box-shadow:0 10px 22px rgba(15,48,71,.15);font-size:clamp(19px,1.35vw,24px);font-weight:800;line-height:1.4;word-break:keep-all; }
.passport-choice-row { width:min(720px,100%);justify-self:center;display:flex;gap:10px;align-items:flex-start;justify-content:flex-start;min-width:0;padding:4px 8px;overflow-x:auto;scrollbar-width:thin;scroll-snap-type:x proximity; }
.passport-choice {
  flex:0 0 92px;width:92px;min-width:92px;min-height:100px;height:100px;padding:5px;border:3px solid transparent;border-radius:16px;
  display:grid;grid-template-rows:minmax(0,1fr) auto;background:rgba(255,255,255,.76)!important;box-shadow:0 5px 12px rgba(11,43,65,.12);overflow:hidden;scroll-snap-align:center;
}
.passport-choice img,.passport-avatar img,.passport-plane img { width:100%;height:66px;object-fit:contain;border-radius:10px;background:transparent; }
.passport-choice .label,.passport-plane .label { min-height:24px;padding:0;font-size:15px;line-height:1.05; }
.passport-choice-item { flex:0 0 104px;width:104px;display:grid;grid-template-rows:94px auto;gap:4px;align-items:start;scroll-snap-align:center; }
.passport-choice-item .passport-avatar { width:100%;min-width:0;height:94px;min-height:94px;padding:2px;display:block;overflow:visible;scroll-snap-align:unset; }
.passport-choice-item .passport-avatar img { width:100%;height:88px;object-fit:contain;object-position:center bottom; }
.passport-choice-name { display:block;color:#173653;font-family:var(--font-head);font-size:15px;font-weight:900;line-height:1.2;text-align:center;word-break:keep-all; }
.passport-choice[aria-checked='true'] { border-color:#f2c14e;background:#fff!important;box-shadow:0 0 0 3px rgba(242,193,78,.24),0 8px 16px rgba(11,43,65,.16);transform:translateY(-3px) scale(1.04);filter:brightness(1.05); }
.passport-choice-item .passport-avatar[aria-checked='true'] { transform:none; }
.passport-choice[aria-checked='true']::after { content:'✓';right:4px;top:4px;width:25px;height:25px;background:#26705a;font-size:16px; }
.passport-plane-feature { grid-template-columns:minmax(330px,1fr) minmax(300px,.85fr); }
.passport-plane-stage-img { --plane-stage-lift:0px;width:min(500px,90%);height:100%;max-height:320px;min-height:0;object-fit:contain;object-position:center;filter:drop-shadow(0 16px 18px rgba(17,49,72,.24));transform:translateY(calc(-1 * var(--plane-stage-lift)));animation:passport-plane-float 3.6s ease-in-out infinite; }
.passport-plane-stage .passport-stage-art::before { top:50%;left:50%;transform:translate(-50%,-50%);width:min(500px,92%);aspect-ratio:1.7;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.9),rgba(185,224,239,.5) 58%,transparent 60%); }
@keyframes passport-plane-float { 0%,100% { transform:translateY(calc(2px - var(--plane-stage-lift))) rotate(-.5deg); } 50% { transform:translateY(calc(-7px - var(--plane-stage-lift))) rotate(.5deg); } }

@media (max-width:1100px) {
  /* 906px대에서 스텝바가 우상단 "내 여권 보기" 버튼과 겹치지 않게 폭을 양보한다 */
  .passport-stepper { width:min(600px,calc(100% - 330px)); }
  .passport-step-chip { min-width:0;padding-inline:12px; }
  .passport-page { --passport-footer-h:76px;--passport-route-h:58px; }
  .passport-shell { height:min(710px,calc(100dvh - var(--top-bar-h) - 12px)); }
  .passport-station { grid-template-columns:190px minmax(360px,1fr) 200px;gap:15px; }
  .passport-guide-bubble { left:0;top:2%;width:100%;font-size:16px; }
  .passport-station-guide img { width:185px; }
  .passport-actions { grid-template-columns:150px 1fr 270px;padding-block:8px; }
  .passport-actions .btn { min-height:52px; }
  .passport-selection-layout { grid-template-rows:minmax(0,1fr) 112px; }
  .passport-feature { min-height:210px; }
  .passport-avatar-stage-img { max-height:285px; }
  .passport-choice { flex-basis:82px;width:82px;min-width:82px;height:82px;min-height:82px; }
  .passport-choice img,.passport-avatar img,.passport-plane img { height:52px; }
  .passport-choice .label,.passport-plane .label { font-size:15px; }
  .passport-choice-item { flex-basis:88px;width:88px;grid-template-rows:82px auto; }
  .passport-choice-item .passport-avatar { height:82px;min-height:82px; }
  .passport-choice-item .passport-avatar img { height:76px; }
  .passport-choice-name { font-size:15px; }
}
@media (max-width:760px) {
  .passport-page > .page-body { overflow:auto; }
  .passport-shell { min-height:0;height:calc(100% - 12px); }
  .passport-stepper { width:calc(100% - 20px); }
  .passport-step-chip { min-width:0;padding-inline:10px;font-size:15px; }
  .passport-peek { right:10px;top:64px;width:56px;min-height:52px;grid-template-columns:1fr;padding:3px; }
  .passport-peek span { position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0); }
  .passport-station { grid-template-columns:120px minmax(0,1fr); }
  .passport-cover-live { display:none; }
  .passport-guide-bubble { display:none; }
  .passport-station-guide img { width:120px; }
  .passport-feature,.passport-plane-feature { grid-template-columns:1fr;gap:5px;text-align:center; }
  .passport-stage-art { max-height:260px; }
  .passport-stage-line { margin-inline:auto; }
  .passport-selector-stage { grid-template-columns:52px minmax(0,1fr) 52px; }
  .passport-arrow { width:48px;height:48px; }
  .passport-actions { grid-template-columns:80px 1fr 200px;gap:8px;padding-inline:10px; }
  .passport-step-status { font-size:15px; }
}
@media (max-height:800px) {
  .passport-section { padding-block:10px;gap:8px; }
  .passport-selection-layout { grid-template-rows:minmax(0,1fr) 108px;gap:6px; }
  .passport-feature { min-height:210px; }
  .passport-avatar-stage-img { max-height:240px; }
  .passport-choice { flex-basis:80px;width:80px;min-width:80px;min-height:80px;height:80px; }
  .passport-choice img,.passport-avatar img,.passport-plane img { height:50px; }
  .passport-choice .label,.passport-plane .label { min-height:20px;font-size:15px; }
  .passport-choice-item { flex-basis:88px;width:88px;grid-template-rows:80px auto; }
  .passport-choice-item .passport-avatar { height:80px;min-height:80px; }
  .passport-choice-item .passport-avatar img { height:74px; }
}
@media (max-height:620px) {
  .passport-page > .page-body { overflow:hidden; }
  .passport-shell { min-height:0;height:calc(100% - 16px); }
  .passport-form { min-height:0;height:100%; }
  .passport-scene-heading h1 { font-size:25px; }
  .passport-scene-heading p { display:none; }
  .passport-section { padding-block:6px;gap:4px; }
  .passport-station-guide { min-height:180px; }
  .passport-station-guide img { max-height:235px; }
  .passport-luggage-tag { padding:16px 24px; }
  .passport-selection-layout { grid-template-rows:minmax(0,1fr) 94px;gap:4px; }
  .passport-feature { min-height:145px; }
  .passport-avatar-stage-img { max-height:230px; }
  .passport-stage-line { padding:10px 15px;font-size:17px; }
  .passport-choice { flex-basis:70px;width:70px;min-width:70px;min-height:70px;height:70px; }
  .passport-choice img,.passport-avatar img,.passport-plane img { height:42px; }
  .passport-choice .label,.passport-plane .label { min-height:20px;font-size:15px; }
  .passport-choice-item { flex-basis:74px;width:74px;grid-template-rows:68px auto;gap:2px; }
  .passport-choice-item .passport-avatar { height:68px;min-height:68px; }
  .passport-choice-item .passport-avatar img { height:62px; }
  .passport-choice-name { font-size:15px; }
}
@media (prefers-reduced-motion:reduce) {
  .passport-section,.passport-choice,.passport-avatar-stage-img,.passport-plane-stage-img { animation:none!important;transition:none!important; }
}
`;

export function createPage(): Page {
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      let common: CommonContent = {};
      try { common = await loadContent<CommonContent>('common'); }
      catch { console.warn('[passport] common.json 없음 — 기본값 사용'); }

      const assetIds = [
        'bg.title', 'prop.stamp', 'prop.passport', 'prop.passport_builder', 'prop.passport_stampbook',
        ...AVATARS.map((item) => item.assetId), ...PLANES.map((item) => item.assetId)
      ];
      await preloadImages(assetIds);

      const save = saveRepo.get();
      const profile = save.profile;
      const banned = common.nickname?.banned ?? [];
      const maxLen = common.nickname?.maxLen ?? 10;
      const draft = (() => {
        try {
          const raw = sessionStorage.getItem(PASSPORT_DRAFT_KEY);
          return raw ? JSON.parse(raw) as Partial<PassportDraft> : null;
        } catch {
          return null;
        }
      })();
      const draftAvatarId = draft?.avatarId && AVATARS.some((item) => item.saveId === draft.avatarId) ? draft.avatarId : null;
      const draftPlaneId = draft?.airplaneId && PLANES.some((item) => item.saveId === draft.airplaneId) ? draft.airplaneId : null;
      let avatarId = draftAvatarId ?? profile?.avatarId ?? 'a1';
      let airplaneId = draftPlaneId ?? profile?.airplaneId ?? 'plane1';
      const initialAvatar = AVATARS.find((item) => item.saveId === avatarId) ?? AVATARS[0];
      const initialPlane = PLANES.find((item) => item.saveId === airplaneId) ?? PLANES[0];

      const page = document.createElement('div');
      page.className = 'page passport-page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,.12),rgba(20,45,80,.28)),url('${assetUrl('bg.title')}')`;
      const style = document.createElement('style');
      style.textContent = PASSPORT_CSS;
      page.appendChild(style);
      page.appendChild(buildTopBar({
        title: '나의 여행 여권',
        backTo: profile ? '#/map' : undefined
      }));

      const body = document.createElement('div');
      body.className = 'page-body passport-body';
      body.innerHTML = `
        <div class="passport-shell">
          <section class="passport-form" aria-label="여권 만들기">
            <nav class="passport-stepper" aria-label="여권 만들기 진행 경로">
              <button type="button" class="passport-step-chip" data-step-jump="2">1 탐험가</button>
              <button type="button" class="passport-step-chip" data-step-jump="3">2 비행기</button>
            </nav>

            <div class="passport-scenes">
              <section class="passport-section passport-nick-row" data-passport-step="1" aria-labelledby="passport-nickname-heading">
                <header class="passport-scene-heading">
                  <h1 id="passport-nickname-heading">여행 이름을 정해요</h1>
                </header>
                <div class="passport-station">
                  <div class="passport-station-guide" aria-hidden="true">
                    <img src="${assetUrl(initialAvatar.assetId)}" data-asset-id="${initialAvatar.assetId}" alt="">
                    <p class="passport-guide-bubble">여권에 쓸 이름을 적어 줘.</p>
                  </div>
                  <div class="passport-tag-wrap">
                    <div class="passport-luggage-tag">
                      <label class="passport-label" for="nickname">나의 여행 이름</label>
                      <input class="passport-nickname" id="nickname" type="text" maxlength="${maxLen}" autocomplete="name" enterkeyhint="next" placeholder="한글 또는 영어 이름">
                      <div class="passport-nickname-meta"><span></span><span id="nickname-count">0 / ${maxLen}</span></div>
                    </div>
                    <p id="nick-msg" class="feedback retry" role="alert" hidden></p>
                  </div>
                  <div class="passport-cover-live" aria-label="여권 표지 미리보기">
                    <div class="passport-cover-art">
                      <img src="${assetUrl('prop.passport')}" data-asset-id="prop.passport" alt="">
                    </div>
                    <div class="passport-cover-owner" aria-live="polite">
                      <span>여행 이름</span>
                      <strong class="passport-cover-name" id="passport-cover-name">이름을 적어 줘</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section class="passport-section" data-passport-step="2" hidden aria-labelledby="passport-avatar-heading">
                <header class="passport-scene-heading">
                  <h1 id="passport-avatar-heading">어떤 탐험가로 떠날까?</h1>
                </header>
                <div class="passport-selection-layout" data-swipe-kind="avatar">
                  <div class="passport-selector-stage">
                    <button type="button" class="passport-arrow" data-select-prev="avatar" aria-label="이전 탐험가">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
                    </button>
                    <div class="passport-feature">
                      <div class="passport-stage-art">
                        <img class="passport-avatar-stage-img" id="passport-avatar-stage-img" src="${assetUrl(initialAvatar.assetId)}" data-asset-id="${initialAvatar.assetId}" alt="">
                      </div>
                      <div class="passport-stage-copy" aria-live="polite">
                        <p class="passport-stage-role" id="passport-avatar-stage-role">${initialAvatar.role}</p>
                        <h2 class="passport-stage-name" id="passport-avatar-stage-name">${initialAvatar.name}</h2>
                        <p class="passport-stage-line" id="passport-avatar-stage-line">${initialAvatar.sampleLine}</p>
                      </div>
                    </div>
                    <button type="button" class="passport-arrow" data-select-next="avatar" aria-label="다음 탐험가">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                  <div class="passport-choice-row passport-avatars" role="radiogroup" aria-label="탐험가 목록">
                    ${AVATARS.map((item) => choiceHtml('avatar', item.saveId, item.assetId, item.label, item.name)).join('')}
                  </div>
                </div>
              </section>

              <section class="passport-section passport-plane-stage" data-passport-step="3" hidden aria-labelledby="passport-plane-heading">
                <header class="passport-scene-heading">
                  <h1 id="passport-plane-heading">어떤 비행기로 출발할까?</h1>
                </header>
                <div class="passport-selection-layout" data-swipe-kind="plane">
                  <div class="passport-selector-stage">
                    <button type="button" class="passport-arrow" data-select-prev="plane" aria-label="이전 비행기">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
                    </button>
                    <div class="passport-feature passport-plane-feature">
                      <div class="passport-stage-art">
                        <img class="passport-plane-stage-img" id="passport-plane-stage-img" src="${assetUrl(initialPlane.assetId)}" data-asset-id="${initialPlane.assetId}" alt="">
                      </div>
                      <div class="passport-stage-copy" aria-live="polite">
                        <p class="passport-stage-role">나의 여행 비행기</p>
                        <h2 class="passport-stage-name" id="passport-plane-stage-name">${initialPlane.name}</h2>
                        <p class="passport-stage-line" id="passport-plane-stage-line">${initialPlane.label}</p>
                      </div>
                    </div>
                    <button type="button" class="passport-arrow" data-select-next="plane" aria-label="다음 비행기">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                  <div class="passport-choice-row passport-planes" role="radiogroup" aria-label="비행기 목록">
                    ${PLANES.map((item) => choiceHtml('plane', item.saveId, item.assetId, item.label, item.name)).join('')}
                  </div>
                </div>
              </section>
            </div>

            <footer class="passport-actions">
              <button type="button" class="btn passport-back-step" data-act="previous" hidden>이전</button>
              <p class="passport-step-status" id="passport-step-status" aria-live="polite">1 / 3</p>
              <button type="button" class="btn btn-primary passport-advance" data-act="advance">다음 · 탐험가 만나기</button>
            </footer>
          </section>

          <button type="button" class="passport-peek" data-act="preview" aria-expanded="false" aria-controls="passport-preview">
            <img src="${assetUrl('prop.passport')}" data-asset-id="prop.passport" alt=""><span>내 여권 보기</span>
          </button>
          <button type="button" class="passport-preview-scrim" data-act="close-preview" aria-label="여권 미리보기 닫기" hidden></button>
          <aside class="passport-preview" id="passport-preview" aria-label="내 여행 여권 미리보기" hidden>
            <div class="passport-preview-heading">
              <div class="passport-heading-copy">
                <span class="passport-maker-kicker">내가 만드는 여권</span>
                <h2 class="passport-preview__title" id="passport-card-title">나의 여행 여권</h2>
              </div>
              <button type="button" class="btn passport-preview-close" data-act="close-preview" aria-label="닫기">×</button>
            </div>
            <div class="passport-book">
              <img class="passport-book-art" src="${assetUrl('prop.passport_builder')}" data-asset-id="prop.passport_builder" alt="" aria-hidden="true">
              <div class="passport-book-slot passport-explorer-slot">
                <img class="passport-hero" id="passport-hero" src="${assetUrl(initialAvatar.assetId)}" data-asset-id="${initialAvatar.assetId}" alt="">
              </div>
              <p class="passport-book-label passport-avatar-label"><span>탐험가</span><strong id="passport-avatar-name">${initialAvatar.name}</strong></p>
              <div class="passport-book-slot passport-plane-slot">
                <img class="passport-plane-preview" id="passport-plane-preview" src="${assetUrl(initialPlane.assetId)}" data-asset-id="${initialPlane.assetId}" alt="">
              </div>
              <p class="passport-book-label passport-plane-label"><span>비행기</span><strong id="passport-plane-name">${initialPlane.name}</strong></p>
              <span class="passport-owner-mark" id="passport-owner-mark">이름을 쓰면 나만의 서명이 생겨요</span>
            </div>
            <p class="passport-selected-label" id="passport-selected-label"></p>
            <div class="passport-stamps" id="passport-stamps" aria-label="여행 도장"></div>
          </aside>
        </div>`;
      page.appendChild(body);
      root.appendChild(page);

      /** 여행 도장 여섯 칸(6대륙) — 받은 것은 그림, 아직인 것은 번호. 칸 아래에 대륙 이름 */
      const renderStamps = () => {
        const box = page.querySelector<HTMLElement>('#passport-stamps');
        if (!box) return;
        const earned = saveRepo.get().stamps.filter(isStampId);
        box.innerHTML = `<p class="passport-stamps__title">여행 도장 <b>${earned.length}</b> / ${STAMP_SLOTS.length}</p>
          <div class="passport-stamps__row">${STAMP_SLOTS.map((id, i) => {
            const asset = STAMP_ASSETS[id];
            const label = STAMP_LABELS[id];
            const got = earned.includes(id);
            return `<span class="passport-stamp" role="img" aria-label="${label} 도장 ${got ? '받음' : '아직'}"><span class="passport-stamp-slot${got ? ' is-earned' : ''}">${got && hasAsset(asset) ? `<img src="${assetUrl(asset)}" data-asset-id="${asset}" alt="">` : `<b>${i + 1}</b>`}</span><small class="passport-stamp-name" aria-hidden="true">${label}</small></span>`;
          }).join('')}</div>`;
      };
      renderStamps();
      const input = page.querySelector<HTMLInputElement>('#nickname');
      if (input) input.value = typeof draft?.nickname === 'string' ? draft.nickname.slice(0, maxLen) : profile?.nickname ?? '';
      const msg = page.querySelector<HTMLElement>('#nick-msg');
      const actionButton = page.querySelector<HTMLButtonElement>('[data-act="advance"]');
      const previousButton = page.querySelector<HTMLButtonElement>('[data-act="previous"]');
      const stepStatus = page.querySelector<HTMLElement>('#passport-step-status');
      const previewButton = page.querySelector<HTMLButtonElement>('[data-act="preview"]');
      const preview = page.querySelector<HTMLElement>('#passport-preview');
      const previewScrim = page.querySelector<HTMLButtonElement>('.passport-preview-scrim');

      const bindRadioButtons = (
        selector: string,
        getValue: (el: HTMLElement) => string,
        setValue: (value: string) => void,
        initial: string,
        onChosen?: (value: string, button: HTMLButtonElement) => void
      ) => {
        const buttons = Array.from(page.querySelectorAll<HTMLButtonElement>(selector));
        const mark = (value: string) => buttons.forEach((button) => {
          const selected = getValue(button) === value;
          button.setAttribute('aria-checked', String(selected));
          button.tabIndex = selected ? 0 : -1;
        });
        const choose = (button: HTMLButtonElement) => {
          const value = getValue(button);
          setValue(value);
          mark(value);
          void audio.playSfx('tap');
          popBounce(button);
          onChosen?.(value, button);
        };
        buttons.forEach((button, index) => {
          button.addEventListener('click', () => choose(button));
          button.addEventListener('keydown', (event) => {
            if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
              : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % buttons.length
                : (index - 1 + buttons.length) % buttons.length;
            const next = buttons[nextIndex];
            if (next) { choose(next); next.focus(); }
          });
        });
        mark(initial);
      };
      // 고른 탐험 방식과 여행 장비를 오른쪽 여권에 즉시 연결한다.
      const hero = page.querySelector<HTMLImageElement>('#passport-hero');
      const planePreview = page.querySelector<HTMLImageElement>('#passport-plane-preview');
      const selectedLabel = page.querySelector<HTMLElement>('#passport-selected-label');
      const cardTitle = page.querySelector<HTMLElement>('#passport-card-title');
      const avatarName = page.querySelector<HTMLElement>('#passport-avatar-name');
      const planeName = page.querySelector<HTMLElement>('#passport-plane-name');
      const ownerMark = page.querySelector<HTMLElement>('#passport-owner-mark');
      const coverName = page.querySelector<HTMLElement>('#passport-cover-name');
      const nicknameCount = page.querySelector<HTMLElement>('#nickname-count');
      const avatarStageImage = page.querySelector<HTMLImageElement>('#passport-avatar-stage-img');
      const avatarStageRole = page.querySelector<HTMLElement>('#passport-avatar-stage-role');
      const avatarStageName = page.querySelector<HTMLElement>('#passport-avatar-stage-name');
      const avatarStageLine = page.querySelector<HTMLElement>('#passport-avatar-stage-line');
      const planeStageImage = page.querySelector<HTMLImageElement>('#passport-plane-stage-img');
      const planeStageName = page.querySelector<HTMLElement>('#passport-plane-stage-name');
      const planeStageLine = page.querySelector<HTMLElement>('#passport-plane-stage-line');
      const updateSelectionLabel = () => {
        const avatar = AVATARS.find((item) => item.saveId === avatarId) ?? AVATARS[0];
        const plane = PLANES.find((item) => item.saveId === airplaneId) ?? PLANES[0];
        // 이름을 따로 적지 않는다 — 고른 캐릭터가 곧 '나'이고, 그 이름을 끝까지 쓴다
        const myName = avatar.name;
        if (cardTitle) cardTitle.textContent = `${myName}의 여행 여권`;
        if (coverName) coverName.textContent = myName;
        if (nicknameCount) nicknameCount.textContent = '';
        if (avatarName) avatarName.textContent = myName;
        if (planeName) planeName.textContent = plane.name;
        if (ownerMark) ownerMark.textContent = `${myName}가 직접 만든 여권`;
        if (hero) hero.alt = `${avatar.role} ${myName} 모습`;
        if (planePreview) planePreview.alt = `${plane.name} 비행기`;
        if (avatarStageRole) avatarStageRole.textContent = avatar.role;
        if (avatarStageName) avatarStageName.textContent = myName;
        if (avatarStageLine) avatarStageLine.textContent = avatar.sampleLine;
        if (avatarStageImage) avatarStageImage.alt = `${myName}, ${avatar.role}`;
        if (planeStageName) planeStageName.textContent = plane.name;
        if (planeStageLine) planeStageLine.textContent = plane.label;
        if (planeStageImage) planeStageImage.alt = `${plane.name} 비행기`;
        if (selectedLabel) {
          selectedLabel.textContent = `${withJosa(myName, '과', '와')} ${withJosa(plane.name, '이', '가')} 함께 여행해요`;
        }
      };
      const showHero = (value: string) => {
        const picked = AVATARS.find((item) => item.saveId === value) ?? AVATARS[0];
        if (hero && hasAsset(picked.assetId)) {
          hero.src = assetUrl(picked.assetId);
          hero.dataset.assetId = picked.assetId;
        }
        if (avatarStageImage && hasAsset(picked.assetId)) {
          avatarStageImage.src = assetUrl(picked.assetId);
          avatarStageImage.dataset.assetId = picked.assetId;
        }
        updateSelectionLabel();
      };
      const showPlane = (value: string) => {
        const picked = PLANES.find((item) => item.saveId === value) ?? PLANES[0];
        if (planePreview && hasAsset(picked.assetId)) {
          planePreview.src = assetUrl(picked.assetId);
          planePreview.dataset.assetId = picked.assetId;
        }
        if (planeStageImage && hasAsset(picked.assetId)) {
          planeStageImage.src = assetUrl(picked.assetId);
          planeStageImage.dataset.assetId = picked.assetId;
        }
        updateSelectionLabel();
      };
      bindRadioButtons(
        '.passport-avatar',
        (el) => el.dataset.avatar ?? 'a1',
        (value) => { avatarId = value; showHero(value); persistDraft(); },
        avatarId,
        (_value, button) => button.scrollIntoView({ block: 'nearest', inline: 'center' })
      );
      bindRadioButtons('.passport-plane', (el) => el.dataset.plane ?? 'plane1', (value) => { airplaneId = value; showPlane(value); persistDraft(); }, airplaneId);
      showHero(avatarId);
      showPlane(airplaneId);

      const validate = (): string | null => {
        return validatePassportNickname(input?.value ?? '', maxLen, banned);
      };

      const finishPassport = () => {
        if (msg) msg.hidden = true;
        const chosen = AVATARS.find((item) => item.saveId === avatarId) ?? AVATARS[0];
        saveRepo.update((state) => {
          state.profile = {
            nickname: chosen.name, // 이름 입력 단계는 없다 — 캐릭터 이름이 곧 내 이름
            createdAt: state.profile?.createdAt ?? new Date().toISOString(),
            avatarId,
            airplaneId
          };
        });
        try { sessionStorage.removeItem(PASSPORT_DRAFT_KEY); } catch { /* ignore */ }
        if (actionButton) actionButton.disabled = true;
        const stamp = page.querySelector<HTMLElement>('.passport-hero') ?? actionButton;
        if (!stamp) return;
        burstConfetti(stamp, 8);
        void audio.playSfx('stamp');
        const avatar = AVATARS.find((item) => item.saveId === avatarId) ?? AVATARS[0];
        const plane = PLANES.find((item) => item.saveId === airplaneId) ?? PLANES[0];
        showToast(`${withJosa(avatar.name, '과', '와')} ${plane.name}, 여행 준비 완료!`, 'success');
        const transition = playJourneyTransition({ kind: 'stamp', label: '여행을 시작해 여섯 도장을 완성해 줘!', assetId: 'prop.stamp' });
        void transition.finished.then(() => { if (!disposed) navigate('#/map'); });
      };

      const panels = Array.from(page.querySelectorAll<HTMLElement>('[data-passport-step]'));
      const stepButtons = Array.from(page.querySelectorAll<HTMLButtonElement>('[data-step-jump]'));
      const advanceLabels = [
        '다음 · 탐험가 만나기',
        '다음 · 비행기 고르기',
        '여권 완성하고 출발하기'
      ];
      const statusLabels = ['', '1 / 2', '2 / 2']; // 이름 단계를 뺀 두 단계
      const FIRST_STEP = 2; // 1단계(이름 입력)는 뺐다
      let maxReached = profile ? 3 : Math.max(FIRST_STEP, Math.min(3, Number(draft?.maxReached) || FIRST_STEP));
      let currentStep = Math.min(maxReached, Math.max(FIRST_STEP, Math.min(3, Number(draft?.step) || FIRST_STEP)));
      let transitionLocked = false;
      let composingNickname = false;

      function persistDraft() {
        try {
          const nextDraft: PassportDraft = {
            nickname: input?.value ?? '',
            avatarId,
            airplaneId,
            step: currentStep,
            maxReached
          };
          sessionStorage.setItem(PASSPORT_DRAFT_KEY, JSON.stringify(nextDraft));
        } catch {
          // 저장 공간이 막혀도 현재 화면의 선택은 계속 동작한다.
        }
      }

      const setStep = (step: number) => {
        currentStep = Math.max(FIRST_STEP, Math.min(maxReached, step));
        page.classList.remove('passport-step-1', 'passport-step-2', 'passport-step-3');
        page.classList.add(`passport-step-${currentStep}`);
        panels.forEach((panel) => { panel.hidden = Number(panel.dataset.passportStep) !== currentStep; });
        stepButtons.forEach((button) => {
          const buttonStep = Number(button.dataset.stepJump);
          button.disabled = buttonStep > maxReached;
          button.classList.toggle('is-done', buttonStep < currentStep);
          if (buttonStep === currentStep) button.setAttribute('aria-current', 'step');
          else button.removeAttribute('aria-current');
        });
        if (actionButton) actionButton.textContent = advanceLabels[currentStep - 1] ?? advanceLabels[2]!;
        if (previousButton) previousButton.hidden = currentStep === FIRST_STEP;
        if (stepStatus) stepStatus.textContent = statusLabels[currentStep - 1] ?? statusLabels[0]!;
        page.querySelector<HTMLElement>(currentStep === 2 ? '.passport-avatar[aria-checked="true"]' : currentStep === 3 ? '.passport-plane[aria-checked="true"]' : '#nickname')
          ?.scrollIntoView({ block: 'nearest', inline: 'center' });
        persistDraft();
      };

      const unlockStepChange = () => {
        requestAnimationFrame(() => requestAnimationFrame(() => { transitionLocked = false; }));
      };

      const openPreview = (open: boolean) => {
        if (!preview || !previewButton) return;
        preview.hidden = !open;
        if (previewScrim) previewScrim.hidden = !open;
        previewButton.setAttribute('aria-expanded', String(open));
        if (open) preview.querySelector<HTMLButtonElement>('[data-act="close-preview"]')?.focus();
        else previewButton.focus();
      };
      previewButton?.addEventListener('click', () => openPreview(preview?.hidden ?? true));
      page.querySelectorAll<HTMLElement>('[data-act="close-preview"]').forEach((button) => button.addEventListener('click', () => openPreview(false)));

      const selectRelative = (kind: 'avatar' | 'plane', offset: number) => {
        const buttons = Array.from(page.querySelectorAll<HTMLButtonElement>(`.passport-${kind}`));
        if (!buttons.length) return;
        const selectedIndex = Math.max(0, buttons.findIndex((button) => button.getAttribute('aria-checked') === 'true'));
        const next = buttons[(selectedIndex + offset + buttons.length) % buttons.length];
        next?.click();
      };
      page.querySelectorAll<HTMLButtonElement>('[data-select-prev]').forEach((button) => button.addEventListener('click', () => selectRelative(button.dataset.selectPrev === 'plane' ? 'plane' : 'avatar', -1)));
      page.querySelectorAll<HTMLButtonElement>('[data-select-next]').forEach((button) => button.addEventListener('click', () => selectRelative(button.dataset.selectNext === 'plane' ? 'plane' : 'avatar', 1)));

      page.querySelectorAll<HTMLElement>('[data-swipe-kind]').forEach((surface) => {
        let startX: number | null = null;
        surface.addEventListener('pointerdown', (event) => {
          if (event.pointerType === 'mouse' || (event.target as HTMLElement).closest('button')) return;
          startX = event.clientX;
          surface.setPointerCapture(event.pointerId); // 손가락이 무대 밖으로 나가도 pointerup을 받는다
        });
        surface.addEventListener('pointerup', (event) => {
          if (startX === null) return;
          const delta = event.clientX - startX;
          startX = null;
          if (Math.abs(delta) < 48) return;
          selectRelative(surface.dataset.swipeKind === 'plane' ? 'plane' : 'avatar', delta > 0 ? -1 : 1);
        });
        surface.addEventListener('pointercancel', () => { startX = null; });
      });

      input?.addEventListener('compositionstart', () => { composingNickname = true; });
      input?.addEventListener('compositionend', () => {
        composingNickname = false;
        updateSelectionLabel();
        persistDraft();
      });
      input?.addEventListener('input', () => {
        updateSelectionLabel();
        if (msg && !validate()) msg.hidden = true;
        persistDraft();
      });
      input?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || composingNickname || event.isComposing) return;
        event.preventDefault();
        actionButton?.click();
      });

      stepButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const step = Number(button.dataset.stepJump);
          if (transitionLocked || step > maxReached || step === currentStep) return;
          transitionLocked = true;
          void audio.playSfx('tap');
          setStep(step);
          unlockStepChange();
        });
      });
      previousButton?.addEventListener('click', () => {
        if (transitionLocked || currentStep <= FIRST_STEP) return;
        transitionLocked = true;
        void audio.playSfx('tap');
        setStep(currentStep - 1);
        unlockStepChange();
      });
      actionButton?.addEventListener('click', () => {
        if (transitionLocked) return;
        transitionLocked = true;
        if (currentStep < 3) {
          maxReached = Math.max(maxReached, currentStep + 1);
          void audio.playSfx('tap');
          setStep(currentStep + 1);
          unlockStepChange();
          return;
        }
        finishPassport();
      });
      page.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && preview && !preview.hidden) openPreview(false);
      });

      updateSelectionLabel();
      setStep(currentStep);
    },

    unmount() {
      disposed = true;
      cancelJourneyTransition();
    }
  };
}

/** 그림과 이름만 또렷하게 보여 주고, 성격 소개는 선택 시 말풍선으로 전달한다. */
function choiceHtml(kind: 'avatar' | 'plane', saveId: string, assetId: string, label: string, name: string): string {
  const button = `<button type="button" class="passport-choice card-visual passport-${kind}" data-${kind}="${saveId}" data-asset-src="${assetId}" role="radio" aria-checked="false" aria-label="${label}">
    ${hasAsset(assetId) ? `<img src="${assetUrl(assetId)}" data-asset-id="${assetId}" alt="" aria-hidden="true">` : ''}
    ${kind === 'plane' ? `<span class="label"><span class="choice-name">${name}</span></span>` : ''}
  </button>`;
  return kind === 'avatar'
    ? `<div class="passport-choice-item">${button}<span class="passport-choice-name" aria-hidden="true">${name}</span></div>`
    : button;
}
