export const DIALOGUE_SPEEDS = [1, 1.5, 2, 3] as const;
export type DialogueSpeed = typeof DIALOGUE_SPEEDS[number];

let currentDialogueSpeed: DialogueSpeed = 1;

export function getDialogueSpeed(): DialogueSpeed {
  return currentDialogueSpeed;
}

export function setDialogueSpeed(value: number): DialogueSpeed {
  if (DIALOGUE_SPEEDS.includes(value as DialogueSpeed)) {
    currentDialogueSpeed = value as DialogueSpeed;
  }
  return currentDialogueSpeed;
}

export function scaledDialogueDelay(baseMs: number): number {
  return Math.max(1, Math.round(baseMs / currentDialogueSpeed));
}

export function dialogueSpeedControlHtml(): string {
  const selected = getDialogueSpeed();
  return `<div class="dialogue-speed" role="group" aria-label="대화 속도">
    <span class="dialogue-speed__label">속도</span>
    ${DIALOGUE_SPEEDS.map((speed) => `<button type="button" class="dialogue-speed__button" data-dialogue-speed="${speed}" aria-pressed="${speed === selected}">${speed}×</button>`).join('')}
  </div>`;
}

export function bindDialogueSpeedControl(root: ParentNode, onChange?: (speed: DialogueSpeed) => void): void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-dialogue-speed]'));
  const sync = (selected: DialogueSpeed): void => {
    buttons.forEach((button) => {
      const speed = Number(button.dataset.dialogueSpeed);
      button.setAttribute('aria-pressed', String(speed === selected));
    });
  };
  sync(getDialogueSpeed());
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const selected = setDialogueSpeed(Number(button.dataset.dialogueSpeed));
      sync(selected);
      onChange?.(selected);
    });
  });
}
