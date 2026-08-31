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
    selected = null;
    if (hadSelection) opts.onSelectionChange?.(null);
  };

  const selectItem = (item: HTMLElement) => {
    clearSelection();
    selected = item;
    item.classList.add('is-selected');
    item.setAttribute('aria-pressed', 'true');
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
        ghost = item.cloneNode(true) as HTMLElement;
        ghost.style.cssText = `position:fixed;left:0;top:0;width:${item.offsetWidth}px;pointer-events:none;z-index:calc(var(--z-modal) + 10);opacity:0.9;margin:0;`;
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
        else selectItem(item);
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
      zones.forEach((z) => z.classList.remove('is-over'));
      ghost?.remove();
      ghost = null;
      dragging = null;
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
    const down = onPointerDown(item);
    item.addEventListener('pointerdown', down);
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
      item.removeEventListener('keydown', key);
      item.classList.remove('dnd-item');
    });
  };

  const bindZone = (zone: HTMLElement) => {
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
      cleanups.forEach((c) => c());
      cleanups.length = 0;
      ghost?.remove();
      clearSelection();
    }
  };
}
