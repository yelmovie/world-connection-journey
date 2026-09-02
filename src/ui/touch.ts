/**
 * 터치 보정 — 문서 전체에 한 번만 건다(main.ts에서 import).
 *
 * 1) 누름 반응: Chrome은 터치의 :active를 ShowPress(약 150ms) 뒤에야 붙인다. pointerdown 즉시
 *    .is-pressed 를 붙여 손가락이 닿는 순간 눌린 느낌을 준다. (CSS: components.css / travel-theme.css)
 * 2) 탭 확정: 빠르게 끌고 난 직후의 첫 탭은 브라우저가 플링 취소로 삼켜 click이 안 온다
 *    (사진 끌기→반짝이 점, 아바타 스와이프→아바타 탭). 터치 pointerup 때 우리가 click을 만들고,
 *    뒤따라오는 브라우저 click은 버린다 — 탭 한 번에 click 한 번만 나간다.
 */
const TARGET = 'button, [role="button"]';
const SLOP = 12;
const ECHO_MS = 500;

let pressed: HTMLElement | null = null;
let down: { id: number; x: number; y: number; el: HTMLElement } | null = null;
let synthAt = -Infinity;

const targetOf = (e: Event): HTMLElement | null => (e.target as Element | null)?.closest?.<HTMLElement>(TARGET) ?? null;
const usable = (el: HTMLElement | null): el is HTMLElement =>
  !!el && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
const release = () => { pressed?.classList.remove('is-pressed'); pressed = null; };

document.addEventListener('pointerdown', (e) => {
  release();
  down = null;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const el = targetOf(e);
  if (!usable(el)) return;
  el.classList.add('is-pressed');
  pressed = el;
  if (e.pointerType === 'touch') down = { id: e.pointerId, x: e.clientX, y: e.clientY, el };
}, true);

document.addEventListener('pointerup', (e) => {
  release();
  const d = down;
  down = null;
  if (!d || e.pointerId !== d.id || e.pointerType !== 'touch') return;
  if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > SLOP) return;
  if (targetOf(e) !== d.el || !d.el.isConnected || !usable(d.el)) return;
  synthAt = performance.now();
  d.el.click();
}, true);

document.addEventListener('pointercancel', () => { release(); down = null; }, true);

// 우리가 만든 click 직후에 오는 브라우저 click은 같은 탭의 메아리다 — 화면이 바뀐 뒤 엉뚱한 버튼에 떨어지지 않게 버린다.
document.addEventListener('click', (e) => {
  if (!e.isTrusted || performance.now() - synthAt > ECHO_MS) return;
  synthAt = -Infinity;
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);
