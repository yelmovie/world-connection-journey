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
    selected?.classList.remove('is-selected');
    selected?.setAttribute('aria-pressed', 'false');
    selected = null;
  };

  const place = (item: HTMLElement, zone: HTMLElement) => {
    const itemId = item.dataset.itemId;
    const zoneId = zone.dataset.zoneId;
    if (!itemId || !zoneId || !canPlace(itemId, zoneId)) return;
    void audio.playSfx('drop');
    clearSelection();
    opts.onPlace(itemId, zoneId);
  };

  const zoneAt = (x: number, y: number): HTMLElement | null => {
    for (const z of zones) {
      const r = z.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
    }
    return null;
  };

  const onPointerDown = (item: HTMLElement) => (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    activeDragCleanup?.();
    dragging = item;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      if (!moved) {
        moved = true;
        void audio.playSfx('pickup');
        item.classList.add('is-dragging');
        ghost = item.cloneNode(true) as HTMLElement;
        ghost.style.cssText = `position:fixed;left:0;top:0;width:${item.offsetWidth}px;pointer-events:none;z-index:200;opacity:0.9;margin:0;`;
        document.body.appendChild(ghost);
      }
      if (ghost) {
        ghost.style.transform = `translate(${ev.clientX - item.offsetWidth / 2}px, ${ev.clientY - 24}px)`;
      }
      zones.forEach((z) => z.classList.toggle('is-over', z === zoneAt(ev.clientX, ev.clientY)));
      ev.preventDefault();
    };

    let cleanupDrag = () => undefined;
    const onUp = (ev: PointerEvent) => {
      const zone = moved ? zoneAt(ev.clientX, ev.clientY) : null;
      cleanupDrag();
      if (moved) {
        if (zone) place(item, zone);
      } else {
        if (selected === item) {
          clearSelection();
        } else {
          clearSelection();
          selected = item;
          item.classList.add('is-selected');
          item.setAttribute('aria-pressed', 'true');
          void audio.playSfx('pickup');
        }
      }
    };

    cleanupDrag = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      item.classList.remove('is-dragging');
      zones.forEach((z) => z.classList.remove('is-over'));
      ghost?.remove();
      ghost = null;
      dragging = null;
      if (activeDragCleanup === cleanupDrag) activeDragCleanup = null;
    };

    activeDragCleanup = cleanupDrag;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
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
        else {
          clearSelection();
          selected = item;
          item.classList.add('is-selected');
          item.setAttribute('aria-pressed', 'true');
        }
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
