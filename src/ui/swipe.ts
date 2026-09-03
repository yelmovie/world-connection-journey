/**
 * 가로 스와이프 넘기기 — dx가 임계 이상이고 세로 이동보다 클 때만 발동.
 * 터치는 암시적 캡처가 있어 명시 캡처를 걸지 않는다(크롬이 다음 탭 click을 삼킨다).
 */
export function enableSwipeNav(
  surface: HTMLElement,
  opts: { threshold?: number; ignore?: (ev: PointerEvent) => boolean; onSwipe: (dir: 1 | -1) => void }
): void {
  const threshold = opts.threshold ?? 36;
  let from: { id: number; x: number; y: number } | null = null;
  surface.addEventListener('pointerdown', (ev) => {
    if (opts.ignore?.(ev)) return;
    from = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    if (ev.pointerType !== 'touch') { try { surface.setPointerCapture(ev.pointerId); } catch { /* 이미 사라진 포인터 */ } }
  });
  surface.addEventListener('pointerup', (ev) => {
    if (!from || from.id !== ev.pointerId) return;
    const dx = ev.clientX - from.x;
    const dy = ev.clientY - from.y;
    from = null;
    if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) opts.onSwipe(dx < 0 ? 1 : -1);
  });
  surface.addEventListener('pointercancel', () => { from = null; });
}
