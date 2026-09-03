import { escapeHtml } from './escape';
/**
 * 다음 화면으로 넘어가는 조건을 버튼 옆에 항상 보여 준다.
 * 비활성 버튼은 눌러도 아무 일이 없어 아이가 이유를 알 수 없다 —
 * 그래서 남은 조건을 "무엇을 몇 개 더" 형태로 계속 띄워 둔다.
 */
export interface GateRequirement {
  label: string;
  got: number;
  need: number;
}

const esc = escapeHtml;

export function createGateNote(): HTMLElement {
  const note = document.createElement('p');
  note.className = 'gate-note';
  note.setAttribute('role', 'status');
  note.hidden = true;
  return note;
}

/** 조건을 다시 계산해 버튼 활성 여부와 안내 문구를 함께 갱신한다. */
export function updateGate(
  button: HTMLButtonElement,
  note: HTMLElement,
  requirements: GateRequirement[],
  options: { bypass?: boolean } = {}
): void {
  const unmet = requirements.filter((item) => item.got < item.need);
  const ready = options.bypass === true || unmet.length === 0;
  button.disabled = !ready;
  if (ready) {
    note.hidden = true;
    note.replaceChildren();
    button.removeAttribute('title');
    button.removeAttribute('aria-describedby');
    return;
  }
  const summary = unmet.map((item) => `${item.label} ${Math.min(item.got, item.need)}/${item.need}`).join(' · ');
  note.hidden = false;
  note.innerHTML = `<span class="gate-note__lead">다음으로 가려면</span>${
    unmet.map((item) =>
      `<span class="gate-note__item">${esc(item.label)} <b>${Math.min(item.got, item.need)}/${item.need}</b></span>`
    ).join('')}`;
  if (!note.id) note.id = `gate-note-${Math.random().toString(36).slice(2, 8)}`;
  button.title = `다음으로 가려면 · ${summary}`;
  button.setAttribute('aria-describedby', note.id);
}
