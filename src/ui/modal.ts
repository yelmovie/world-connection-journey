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
let modalSequence = 0;
let activeClose: (() => void) | null = null;
/**
 * 다른 모달이 열려 있는 동안 들어온 요청. 예전에는 그냥 버렸는데,
 * 그러면 핵심 학습 카드처럼 꼭 보여 줘야 할 내용이 조용히 사라진다.
 */
let pending: ModalOptions[] = [];

/** 라우트 전환처럼 모달 소유 페이지가 사라질 때 남은 backdrop과 포커스 trap을 정리한다. */
export function closeActiveModal(): void {
  pending = [];
  activeClose?.();
}

/** 모달은 동시에 1개만. 같은 id의 중복 열기는 무시하고(빠른 연속 클릭 방지), 다른 id는 줄을 세운다. */
export function openModal(opts: ModalOptions): () => void {
  if (openId) {
    const alreadyQueued = openId === opts.id || pending.some((item) => item.id === opts.id);
    if (!alreadyQueued) pending.push(opts);
    return () => undefined;
  }
  openId = opts.id;
  void audio.playSfx('tap');

  const previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const sceneRoot = document.getElementById('scene-root');
  const sceneWasInert = sceneRoot?.inert ?? false;
  const previousSceneAriaHidden = sceneRoot?.getAttribute('aria-hidden') ?? null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.dataset.modalId = opts.id;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.tabIndex = -1;

  if (opts.title) {
    const h = document.createElement('h2');
    h.className = 'modal-title';
    const titleId = `modal-title-${++modalSequence}`;
    h.id = titleId;
    h.textContent = opts.title;
    modal.appendChild(h);
    modal.setAttribute('aria-labelledby', titleId);
  } else {
    modal.setAttribute('aria-label', '안내');
  }
  const body = document.createElement('div');
  body.className = 'modal-body';
  if (opts.bodyHtml) body.innerHTML = opts.bodyHtml;
  if (opts.bodyEl) body.appendChild(opts.bodyEl);
  if (body.childNodes.length > 0) modal.appendChild(body);

  const focusableSelector = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && opts.dismissible !== false) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector));
    if (focusable.length === 0) {
      event.preventDefault();
      modal.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const close = () => {
    if (openId !== opts.id) return;
    openId = null;
    activeClose = null;
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
    if (sceneRoot) {
      sceneRoot.inert = sceneWasInert;
      if (previousSceneAriaHidden === null) sceneRoot.removeAttribute('aria-hidden');
      else sceneRoot.setAttribute('aria-hidden', previousSceneAriaHidden);
    }
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
    bus.emit('MODAL_CLOSED', { id: opts.id });
    const next = pending.shift();
    if (next) queueMicrotask(() => openModal(next));
  };

  if (opts.dismissible !== false) {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'modal-close';
    closeButton.setAttribute('aria-label', '팝업 닫기');
    closeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>`;
    closeButton.addEventListener('click', () => {
      void audio.playSfx('tap');
      close();
    });
    modal.appendChild(closeButton);
  }

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
  activeClose = close;
  if (sceneRoot) {
    sceneRoot.inert = true;
    sceneRoot.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('overlay-root')?.appendChild(backdrop);
  document.addEventListener('keydown', onKeyDown);
  queueMicrotask(() => {
    if (openId !== opts.id || modal.contains(document.activeElement)) return;
    (modal.querySelector<HTMLElement>(focusableSelector) ?? modal).focus();
  });
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
