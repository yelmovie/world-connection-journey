import { bus } from '../core/EventBus';
import { audio } from '../core/AudioManager';

export interface ModalOptions {
  id: string;
  title?: string;
  bodyHtml?: string;
  bodyEl?: HTMLElement;
  actions?: Array<{ label: string; kind?: 'primary' | 'success' | 'ghost'; onClick: (close: () => void) => void; autofocus?: boolean }>;
  dismissible?: boolean;
}

let openId: string | null = null;

/** 모달은 동시에 1개만. 중복 열기 무시(빠른 연속 클릭 방지). */
export function openModal(opts: ModalOptions): () => void {
  if (openId) return () => undefined;
  openId = opts.id;
  void audio.playSfx('tap');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  if (opts.title) {
    const h = document.createElement('h2');
    h.textContent = opts.title;
    modal.appendChild(h);
    modal.setAttribute('aria-label', opts.title);
  }
  if (opts.bodyHtml) {
    const body = document.createElement('div');
    body.innerHTML = opts.bodyHtml;
    modal.appendChild(body);
  }
  if (opts.bodyEl) modal.appendChild(opts.bodyEl);

  const close = () => {
    if (openId !== opts.id) return;
    openId = null;
    backdrop.remove();
    bus.emit('MODAL_CLOSED', { id: opts.id });
  };

  if (opts.actions?.length) {
    const bar = document.createElement('div');
    bar.className = 'modal-actions';
    for (const a of opts.actions) {
      const btn = document.createElement('button');
      btn.className = `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'success' ? 'btn-success' : a.kind === 'ghost' ? 'btn-ghost' : ''}`.trim();
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        void audio.playSfx('tap');
        a.onClick(close);
      });
      bar.appendChild(btn);
      if (a.autofocus) queueMicrotask(() => btn.focus());
    }
    modal.appendChild(bar);
  }

  if (opts.dismissible !== false) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  }
  backdrop.appendChild(modal);
  document.getElementById('overlay-root')?.appendChild(backdrop);
  bus.emit('MODAL_OPENED', { id: opts.id });
  return close;
}

export function confirmDialog(title: string, message: string, confirmLabel: string, onConfirm: () => void): void {
  openModal({
    id: `confirm-${title}`,
    title,
    bodyHtml: `<p>${message}</p>`,
    actions: [
      { label: '취소', kind: 'ghost', onClick: (close) => close(), autofocus: true },
      { label: confirmLabel, kind: 'primary', onClick: (close) => { close(); onConfirm(); } }
    ]
  });
}
