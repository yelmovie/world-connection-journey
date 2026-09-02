export interface MapZoomOptions {
  min?: number;
  max?: number;
  /** 확대·축소 버튼을 붙일지 (기본 true) */
  buttons?: boolean;
}

/**
 * 지도를 두 손가락으로 확대하고 끌어서 옮긴다.
 *
 * 태블릿에서 지도를 들여다보는 가장 자연스러운 조작이고, 종이 지도로는 못 하는 일이다.
 * 끌기는 확대했을 때만 동작한다 — 기본 배율에서는 카드를 지도에 놓는 드래그와 부딪히기 때문.
 *
 * 핀(button) 위에서 손가락을 대도 핀치·끌기가 된다. 핀 위에서 시작한 끌기는 8px 넘게 움직인
 * 순간부터 지도가 따라오고, 그때부터는 손을 떼도 핀이 눌리지 않는다(캡처 + click 차단).
 *
 * viewport는 잘라 내는 상자, target은 실제로 움직일 층(배경과 표식이 함께 들어 있어야 한다).
 */
export function enableMapZoom(viewport: HTMLElement, target: HTMLElement, options: MapZoomOptions = {}): () => void {
  const min = options.min ?? 1;
  const max = options.max ?? 2.6;
  const DRAG_START = 8;
  let scale = 1;
  let x = 0;
  let y = 0;
  const points = new Map<number, { x: number; y: number; start: { x: number; y: number }; onControl: boolean; captured: boolean }>();
  let pinchStart: { distance: number; scale: number } | null = null;
  let dragFrom: { x: number; y: number } | null = null;
  let gestureMoved = false;
  let suppressClickUntil = 0;
  let frame = 0;

  viewport.style.touchAction = 'none';

  const paint = (): void => {
    frame = 0;
    // 확대한 만큼만 움직일 수 있게 가둔다 — 지도가 화면 밖으로 사라지지 않는다
    const box = viewport.getBoundingClientRect();
    const limitX = (box.width * (scale - 1)) / 2;
    const limitY = (box.height * (scale - 1)) / 2;
    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));
    target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    viewport.classList.toggle('is-zoomed', scale > 1.02);
  };
  /** move 이벤트마다 그리지 않고 프레임당 한 번만 — 손가락이 빠를수록 이벤트가 몰린다 */
  const apply = (): void => { if (!frame) frame = requestAnimationFrame(paint); };

  const setScale = (next: number): void => {
    scale = Math.max(min, Math.min(max, next));
    if (scale <= min + 0.01) { scale = min; x = 0; y = 0; }
    apply();
  };

  const distance = (): number => {
    const [a, b] = [...points.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const capture = (id: number): void => {
    const p = points.get(id);
    if (!p || p.captured) return;
    try { viewport.setPointerCapture(id); p.captured = true; } catch { /* 이미 사라진 포인터 */ }
  };
  const beginGesture = (): void => {
    if (gestureMoved) return;
    gestureMoved = true;
    // 손가락을 따라올 때는 전환 애니메이션을 끈다 — 켜 두면 한 박자 늦게 따라와 뻑뻑하게 느껴진다
    target.style.transition = 'none';
    for (const id of points.keys()) capture(id);
  };

  const onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const onControl = Boolean((event.target as HTMLElement).closest('button, input, a, select, textarea'));
    points.set(event.pointerId, { x: event.clientX, y: event.clientY, start: { x: event.clientX, y: event.clientY }, onControl, captured: false });
    if (points.size === 2) {
      pinchStart = { distance: distance(), scale };
      dragFrom = null;
    } else if (points.size === 1) {
      gestureMoved = false;
      dragFrom = scale > min ? { x: event.clientX, y: event.clientY } : null;
      // 핀이 아닌 곳은 바로 잡는다. 핀 위는 탭(클릭)일 수 있으니 움직이기 시작할 때 잡는다.
      if (dragFrom && !onControl) capture(event.pointerId);
    }
  };

  const onMove = (event: PointerEvent): void => {
    const p = points.get(event.pointerId);
    if (!p) return;
    p.x = event.clientX;
    p.y = event.clientY;
    if (pinchStart && points.size === 2) {
      const now = distance();
      if (Math.abs(now - pinchStart.distance) > DRAG_START) beginGesture();
      if (pinchStart.distance > 8) setScale(pinchStart.scale * (now / pinchStart.distance));
      return;
    }
    if (!dragFrom) return;
    if (!gestureMoved) {
      if (Math.hypot(p.x - p.start.x, p.y - p.start.y) < DRAG_START) return;
      beginGesture();
      dragFrom = { x: p.x, y: p.y };
      return;
    }
    x += event.clientX - dragFrom.x;
    y += event.clientY - dragFrom.y;
    dragFrom = { x: event.clientX, y: event.clientY };
    apply();
  };

  const onUp = (event: PointerEvent): void => {
    const p = points.get(event.pointerId);
    points.delete(event.pointerId);
    if (p?.captured) { try { viewport.releasePointerCapture(event.pointerId); } catch { /* 이미 해제 */ } }
    if (points.size < 2) pinchStart = null;
    if (points.size === 0) {
      dragFrom = null;
      if (gestureMoved) {
        suppressClickUntil = performance.now() + 400;
        target.style.transition = '';
        gestureMoved = false;
      }
    } else if (points.size === 1 && scale > min) {
      // 두 손가락 중 하나만 뗐으면 남은 손가락으로 이어서 끈다
      const [rest] = [...points.values()];
      if (rest) dragFrom = { x: rest.x, y: rest.y };
    }
  };
  /** 끌고 나서 손을 뗀 자리에 핀이 있어도 눌리지 않게 */
  const onClick = (event: MouseEvent): void => {
    if (performance.now() > suppressClickUntil) return;
    event.stopPropagation();
    event.preventDefault();
  };

  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  viewport.addEventListener('click', onClick, true);

  let controls: HTMLElement | null = null;
  if (options.buttons !== false) {
    controls = document.createElement('div');
    controls.className = 'map-zoom-controls';
    controls.innerHTML = `
      <button type="button" class="btn" data-zoom="out" aria-label="지도 축소">−</button>
      <button type="button" class="btn" data-zoom="in" aria-label="지도 확대">+</button>`;
    controls.querySelector('[data-zoom="in"]')?.addEventListener('click', () => setScale(scale + 0.4));
    controls.querySelector('[data-zoom="out"]')?.addEventListener('click', () => setScale(scale - 0.4));
    viewport.appendChild(controls);
  }

  return () => {
    if (frame) cancelAnimationFrame(frame);
    viewport.removeEventListener('pointerdown', onDown);
    viewport.removeEventListener('pointermove', onMove);
    viewport.removeEventListener('pointerup', onUp);
    viewport.removeEventListener('pointercancel', onUp);
    viewport.removeEventListener('click', onClick, true);
    target.style.transition = '';
    controls?.remove();
  };
}
