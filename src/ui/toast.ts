let wrap: HTMLDivElement | null = null;

export function clearToasts(): void {
  wrap?.replaceChildren();
}

export function showToast(message: string, kind: 'info' | 'warn' | 'success' = 'info', ms = 2600): void {
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.getElementById('overlay-root')?.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind === 'info' ? '' : kind}`.trim();
  el.setAttribute('role', 'status');
  el.textContent = message;
  wrap.appendChild(el);
  window.setTimeout(() => el.remove(), ms);
}
