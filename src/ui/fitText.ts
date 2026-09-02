/**
 * 글이 상자를 넘치면 글자 크기를 1px씩 줄여 상자 안에 들어가게 한다.
 * 카드·패널처럼 높이가 정해진 곳에서 "잘림" 대신 "작아짐"을 택할 때 쓴다.
 */
export function fitToBox(box: HTMLElement, targets: HTMLElement[], minPx = 13): void {
  targets.forEach((el) => { el.style.fontSize = ''; });
  const sizes = targets.map((el) => parseFloat(getComputedStyle(el).fontSize));
  let guard = 24;
  while (box.scrollHeight > box.clientHeight + 1 && guard-- > 0) {
    let shrunk = false;
    targets.forEach((el, i) => {
      if (sizes[i]! > minPx) { sizes[i] = sizes[i]! - 1; el.style.fontSize = `${sizes[i]}px`; shrunk = true; }
    });
    if (!shrunk) break;
  }
}

/** 상자 크기가 바뀌거나(창 크기) 내용이 바뀔 때마다 다시 맞춘다. */
export function keepFitted(box: HTMLElement, targets: () => HTMLElement[], minPx = 13): () => void {
  const run = () => fitToBox(box, targets(), minPx);
  requestAnimationFrame(run);
  new ResizeObserver(run).observe(box);
  return run;
}
