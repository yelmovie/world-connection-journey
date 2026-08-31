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
 * viewport는 잘라 내는 상자, target은 실제로 움직일 층(배경과 표식이 함께 들어 있어야 한다).
 */
export function enableMapZoom(viewport: HTMLElement, target: HTMLElement, options: MapZoomOptions = {}): () => void {
  const min = options.min ?? 1;
  const max = options.max ?? 2.6;
  let scale = 1;
  let x = 0;
  let y = 0;
  const points = new Map<number, { x: number; y: number }>();
  let pinchStart: { distance: number; scale: number } | null = null;
  let dragFrom: { x: number; y: number } | null = null;

  const apply = (): void => {
    // 확대한 만큼만 움직일 수 있게 가둔다 — 지도가 화면 밖으로 사라지지 않는다
    const box = viewport.getBoundingClientRect();
    const limitX = (box.width * (scale - 1)) / 2;
    const limitY = (box.height * (scale - 1)) / 2;
    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));
    target.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    viewport.classList.toggle('is-zoomed', scale > 1.02);
  };

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

  const onDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.size === 2) {
      pinchStart = { distance: distance(), scale };
      dragFrom = null;
    } else if (points.size === 1 && scale > min) {
      dragFrom = { x: event.clientX, y: event.clientY };
      viewport.setPointerCapture(event.pointerId);
    }
  };

  const onMove = (event: PointerEvent): void => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchStart && points.size === 2) {
      const now = distance();
      if (pinchStart.distance > 8) setScale(pinchStart.scale * (now / pinchStart.distance));
      return;
    }
    if (!dragFrom) return;
    x += event.clientX - dragFrom.x;
    y += event.clientY - dragFrom.y;
    dragFrom = { x: event.clientX, y: event.clientY };
    apply();
  };

  const onUp = (event: PointerEvent): void => {
    points.delete(event.pointerId);
    if (points.size < 2) pinchStart = null;
    if (points.size === 0) dragFrom = null;
  };

  viewport.addEventListener('pointerdown', onDown);
  viewport.addEventListener('pointermove', onMove);
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);

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
    viewport.removeEventListener('pointerdown', onDown);
    viewport.removeEventListener('pointermove', onMove);
    viewport.removeEventListener('pointerup', onUp);
    viewport.removeEventListener('pointercancel', onUp);
    controls?.remove();
  };
}
