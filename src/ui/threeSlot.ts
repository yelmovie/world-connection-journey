import { assetUrl, hasAsset } from '../core/assets';

/**
 * Three.js 예약 슬롯.
 * 지금은 2.5D 렌더 이미지("3d assets" 원본의 최적화본)를 표시하고,
 * 나중에 GLB가 준비되면 [data-three-slot="<id>"] 컨테이너에 Three.js 뷰어를 마운트한다.
 * 계약: 뷰어는 이 컨테이너 안에서만 렌더하고, 페이지 unmount 시 dispose되어야 하며,
 * GLB 로드 실패 시 지금의 폴백 이미지를 그대로 유지한다. (docs/TRD.md 참고)
 */
export function threeSlot(opts: { slotId: string; assetId: string; label: string; width?: string }): HTMLElement {
  const el = document.createElement('figure');
  el.dataset.threeSlot = opts.slotId;
  el.style.cssText = `margin:0;display:flex;flex-direction:column;align-items:center;gap:6px;width:${opts.width ?? 'min(220px,40vw)'}`;
  const img = hasAsset(opts.assetId)
    ? `<img src="${assetUrl(opts.assetId)}" alt="${opts.label}" style="width:100%;filter:drop-shadow(0 6px 16px rgba(10,25,45,0.35))" class="bob">`
    : `<div style="width:100%;aspect-ratio:1;border-radius:var(--radius-m);background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;color:#fff">${opts.label}</div>`;
  el.innerHTML = `${img}<figcaption class="chip" style="font-size:var(--fs-small)">${opts.label}</figcaption>`;
  return el;
}
