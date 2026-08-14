import type { Page } from '../router';
import { buildTopBar } from '../ui/chrome';

export function createPage(): Page {
  return {
    mount(root: HTMLElement) {
      const page = document.createElement('div');
      page.className = 'page';
      page.style.background = 'var(--c-navy)';
      page.appendChild(buildTopBar({ title: '준비 중', backTo: '#/map' }));
      const body = document.createElement('div');
      body.className = 'page-body';
      body.innerHTML = `<div class="panel"><p>이 미션은 곧 열려요!</p></div>`;
      page.appendChild(body);
      root.appendChild(page);
    },
    unmount() { /* no-op */ }
  };
}
