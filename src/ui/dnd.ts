import { audio } from '../core/AudioManager';

/**
 * 공통 집기-놓기 상호작용.
 * 1) 포인터 드래그(터치·마우스), 2) 탭 선택 → 탭 배치, 3) 키보드(Enter/Space) 모두 지원.
 * item 요소: data-item-id, zone 요소: data-zone-id 필수.
 */
export interface PickPlaceController {
  refresh(items: HTMLElement[], zones: HTMLElement[]): void;
  dispose(): void;
}

export function enablePickPlace(opts: {
  items: HTMLElement[];
  zones: HTMLElement[];
  canPlace?: (itemId: string, zoneId: string) => boolean;
  touchDragThreshold?: number;
  dropHitSlop?: number;
  onSelectionChange?: (itemId: string | null) => void;
  onDragStateChange?: (dragging: boolean, itemId: string | null) => void;
  onDropMiss?: (itemId: string) => void;
  onPlace: (itemId: string, zoneId: string) => void;
}): PickPlaceController {
  let items = opts.items;
  let zones = opts.zones;
  let selected: HTMLElement | null = null;
  let dragging: HTMLElement | null = null;
  let ghost: HTMLElement | null = null;
  let activeDragCleanup: (() => void) | null = null;
  const cleanups: Array<() => void> = [];

  const canPlace = (itemId: string, zoneId: string) => opts.canPlace?.(itemId, zoneId) ?? true;

  const clearSelection = () => {
    const hadSelection = selected !== null;
    selected?.classList.remove('is-selected');
    selected?.setAttribute('aria-pressed', 'false');
    selected?.setAttribute('aria-grabbed', 'false');
    selected = null;
    if (hadSelection) opts.onSelectionChange?.(null);
  };

  const selectItem = (item: HTMLElement) => {
    clearSelection();
    selected = item;
    item.classList.add('is-selected');
    item.setAttribute('aria-pressed', 'true');
    item.setAttribute('aria-grabbed', 'true');
    opts.onSelectionChange?.(item.dataset.itemId ?? null);
  };

  const place = (item: HTMLElement, zone: HTMLElement) => {
    const itemId = item.dataset.itemId;
    const zoneId = zone.dataset.zoneId;
    if (!itemId || !zoneId || !canPlace(itemId, zoneId)) return;
    void audio.playSfx('drop');
    clearSelection();
    opts.onPlace(itemId, zoneId);
  };

  const zoneAt = (x: number, y: number, slop = 0): HTMLElement | null => {
    for (const z of zones) {
      const r = z.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
    }
    if (slop <= 0) return null;
    let nearest: { zone: HTMLElement; distance: number } | null = null;
    for (const zone of zones) {
      const rect = zone.getBoundingClientRect();
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance <= slop && (!nearest || distance < nearest.distance)) nearest = { zone, distance };
    }
    return nearest?.zone ?? null;
  };

  const onPointerDown = (item: HTMLElement) => (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // 카드 조작은 앱이 전부 맡는다. 브라우저의 이미지/텍스트 끌기가 함께 시작되면
    // Chromium에서 반투명 카드의 backdrop 레이어가 화면 캡처처럼 따라오는 경우가 있다.
    e.preventDefault();
    e.stopPropagation();
    activeDragCleanup?.();
    dragging = item;
    const startX = e.clientX;
    const startY = e.clientY;
    const itemRect = item.getBoundingClientRect();
    const grabX = startX - itemRect.left;
    const grabY = startY - itemRect.top;
    const moveThreshold = e.pointerType === 'touch' ? (opts.touchDragThreshold ?? 10) : 6;
    const dropSlop = opts.dropHitSlop ?? (e.pointerType === 'touch' ? 44 : e.pointerType === 'pen' ? 28 : 18);
    let moved = false;
    try { item.setPointerCapture(e.pointerId); } catch { /* 오래된 브라우저는 window 이벤트로 계속 추적한다. */ }

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < moveThreshold) return;
      if (!moved) {
        moved = true;
        void audio.playSfx('pickup');
        item.classList.add('is-dragging');
        item.setAttribute('aria-grabbed', 'true');
        zones.forEach((z) => z.classList.add('is-dnd-ready'));
        opts.onDragStateChange?.(true, item.dataset.itemId ?? null);
        ghost = item.cloneNode(true) as HTMLElement;
        ghost.classList.remove('is-selected', 'is-pressed', 'is-dragging');
        ghost.classList.add('dnd-drag-ghost');
        ghost.removeAttribute('id');
        ghost.querySelectorAll<HTMLElement>('[id]').forEach((el) => el.removeAttribute('id'));
        ghost.setAttribute('aria-hidden', 'true');
        ghost.setAttribute('role', 'presentation');
        ghost.removeAttribute('aria-describedby');
        ghost.style.cssText += `position:fixed;left:0;top:0;width:${itemRect.width}px;height:${itemRect.height}px;pointer-events:none;z-index:calc(var(--z-modal) + 10);opacity:0.96;margin:0;box-sizing:border-box;contain:layout paint style;isolation:isolate;will-change:transform;transition:none;animation:none;filter:none;backdrop-filter:none;-webkit-backdrop-filter:none;`;
        document.body.appendChild(ghost);
      }
      if (ghost) {
        const ghostX = e.pointerType === 'touch' ? ev.clientX - item.offsetWidth / 2 : ev.clientX - grabX;
        const ghostY = e.pointerType === 'touch' ? ev.clientY - item.offsetHeight - 18 : ev.clientY - grabY;
        ghost.style.transform = `translate(${ghostX}px, ${ghostY}px)`;
      }
      const hoveredZone = zoneAt(ev.clientX, ev.clientY, dropSlop);
      zones.forEach((z) => z.classList.toggle('is-over', z === hoveredZone));
      ev.preventDefault();
    };

    let cleanupDrag = () => undefined;
    const onUp = (ev: PointerEvent) => {
      const zone = moved ? zoneAt(ev.clientX, ev.clientY, dropSlop) : null;
      cleanupDrag();
      if (moved) {
        if (zone) place(item, zone);
        else {
          selectItem(item);
          const itemId = item.dataset.itemId;
          if (itemId) opts.onDropMiss?.(itemId);
        }
      } else {
        if (selected === item) {
          clearSelection();
        } else {
          selectItem(item);
          void audio.playSfx('pickup');
        }
      }
    };

    cleanupDrag = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      try {
        if (item.hasPointerCapture(e.pointerId)) item.releasePointerCapture(e.pointerId);
      } catch { /* 포인터가 이미 해제된 경우 */ }
      item.classList.remove('is-dragging');
      item.setAttribute('aria-grabbed', selected === item ? 'true' : 'false');
      zones.forEach((z) => z.classList.remove('is-over', 'is-dnd-ready'));
      ghost?.remove();
      ghost = null;
      dragging = null;
      if (moved) opts.onDragStateChange?.(false, null);
      if (activeDragCleanup === cleanupDrag) activeDragCleanup = null;
    };

    const onCancel = () => cleanupDrag();

    activeDragCleanup = cleanupDrag;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const bindItem = (item: HTMLElement) => {
    item.classList.add('card-pick', 'dnd-item');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-pressed', 'false');
    item.setAttribute('aria-grabbed', 'false');
    item.setAttribute('draggable', 'false');
    const down = onPointerDown(item);
    const preventNativeDrag = (e: DragEvent) => e.preventDefault();
    item.addEventListener('pointerdown', down);
    item.addEventListener('dragstart', preventNativeDrag);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (selected === item) clearSelection();
        else selectItem(item);
      }
    };
    item.addEventListener('keydown', key);
    cleanups.push(() => {
      item.removeEventListener('pointerdown', down);
      item.removeEventListener('dragstart', preventNativeDrag);
      item.removeEventListener('keydown', key);
      item.classList.remove('dnd-item');
    });
  };

  const bindZone = (zone: HTMLElement) => {
    zone.classList.add('dnd-zone');
    if (!zone.hasAttribute('tabindex')) zone.setAttribute('tabindex', '0');
    const click = () => {
      if (selected && !dragging) place(selected, zone);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && selected) {
        e.preventDefault();
        place(selected, zone);
      }
    };
    zone.addEventListener('click', click);
    zone.addEventListener('keydown', key);
    cleanups.push(() => {
      zone.removeEventListener('click', click);
      zone.removeEventListener('keydown', key);
      zone.classList.remove('dnd-zone', 'is-dnd-ready', 'is-over');
    });
  };

  const bindAll = () => {
    items.forEach(bindItem);
    zones.forEach(bindZone);
  };
  bindAll();

  return {
    refresh(newItems, newZones) {
      activeDragCleanup?.();
      cleanups.forEach((c) => c());
      cleanups.length = 0;
      clearSelection();
      items = newItems;
      zones = newZones;
      bindAll();
    },
    dispose() {
      activeDragCleanup?.();
      opts.onDragStateChange?.(false, null);
      cleanups.forEach((c) => c());
      cleanups.length = 0;
      ghost?.remove();
      clearSelection();
    }
  };
}

/**
 * range input 드래그 보강 — 전자칠판 펜·마우스에서 손잡이(thumb)를 정확히 잡지 못해도
 * 트랙 위 아무 곳이나 누르고 끌면 값이 따라온다. 키보드 조작은 그대로 유지된다.
 * 세로 슬라이더(writing-mode:vertical-*)는 위쪽이 최댓값으로 계산한다.
 */
export function enableRangeDrag(input: HTMLInputElement): () => void {
  const apply = (ev: PointerEvent): void => {
    const rect = input.getBoundingClientRect();
    const vertical = rect.height > rect.width;
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const size = vertical ? rect.height : rect.width;
    if (size <= 0 || max <= min) return;
    const frac = vertical ? 1 - (ev.clientY - rect.top) / rect.height : (ev.clientX - rect.left) / rect.width;
    const step = Number(input.step) || 1;
    const raw = min + Math.max(0, Math.min(1, frac)) * (max - min);
    const value = Math.max(min, Math.min(max, Math.round(raw / step) * step));
    if (String(value) !== input.value) {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const onDown = (ev: PointerEvent): void => {
    ev.preventDefault();
    // 터치는 암시적 캡처가 있다 — 명시 캡처를 걸면 크롬이 이 요소의 다음 탭 click을 삼킨다
    if (ev.pointerType !== 'touch') { try { input.setPointerCapture(ev.pointerId); } catch { /* 이미 해제된 포인터 무시 */ } }
    input.focus({ preventScroll: true });
    apply(ev);
    const onMove = (e: PointerEvent) => apply(e);
    const stop = () => {
      input.removeEventListener('pointermove', onMove);
      input.removeEventListener('pointerup', stop);
      input.removeEventListener('pointercancel', stop);
    };
    input.addEventListener('pointermove', onMove);
    input.addEventListener('pointerup', stop);
    input.addEventListener('pointercancel', stop);
  };
  // 터치에서 브라우저가 스크롤로 가로채 pointercancel을 내지 않게 — 트랙 위 손가락은 전부 슬라이더 몫
  const prevTouchAction = input.style.touchAction;
  input.style.touchAction = 'none';
  input.addEventListener('pointerdown', onDown);
  return () => { input.removeEventListener('pointerdown', onDown); input.style.touchAction = prevTouchAction; };
}
