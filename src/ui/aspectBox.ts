/**
 * 배경 그림 위에 %좌표로 핀을 찍는 지도용 유틸.
 *
 * `contain`은 좌우(또는 위아래)에 레터박스를 만들고 `cover`는 잘라낸다. 어느 쪽이든
 * 상자 비율과 그림 비율이 다르면 %로 찍은 좌표가 그림 위 실제 위치와 어긋난다.
 * 상자를 그림과 같은 비율로 맞춰 두 좌표계를 일치시킨다.
 */
export function fitAspect(el: HTMLElement, ratio = 16 / 9): () => void {
  const parent = el.parentElement;
  if (!parent) return () => undefined;
  const box = document.createElement('div');
  box.className = 'aspect-fit';
  parent.insertBefore(box, el);
  box.appendChild(el);
  let lastW = -1;
  const apply = (): void => {
    const { width, height } = box.getBoundingClientRect();
    if (width < 8 || height < 8) return;
    const w = Math.round(Math.min(width, height * ratio));
    // 크기를 다시 쓰면 부모 행 높이가 바뀌고 관찰자가 또 불린다 — 값이 같으면 멈춘다.
    if (w === lastW) return;
    lastW = w;
    el.style.width = `${w}px`;
    el.style.height = `${Math.round(w / ratio)}px`;
  };
  const observer = new ResizeObserver(() => requestAnimationFrame(apply));
  observer.observe(box);
  apply();
  return () => observer.disconnect();
}
