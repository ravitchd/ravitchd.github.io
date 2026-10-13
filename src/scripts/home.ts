// Home page motion. Editorial: a photo preview follows the cursor over the
// contents list. Spec Sheet: a coordinate readout tracks the cursor over the
// hero drawing. Both are skipped without a fine pointer.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function initPeek() {
  const box = document.querySelector<HTMLElement>('.peek');
  const img = box?.querySelector('img');
  if (!box || !img || !finePointer) return;
  let x = 0, y = 0, px = 0, py = 0, raf = 0;
  const follow = () => {
    px += (x - px) * (reduceMotion ? 1 : 0.18);
    py += (y - py) * (reduceMotion ? 1 : 0.18);
    box.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    raf = Math.abs(x - px) + Math.abs(y - py) > 0.5 ? requestAnimationFrame(follow) : 0;
  };
  document.querySelectorAll<HTMLElement>('[data-peek]').forEach((el) => {
    el.addEventListener('pointerenter', (e) => {
      img.src = el.dataset.peek!;
      x = px = e.clientX;
      y = py = e.clientY;
      box.classList.add('on');
    });
    el.addEventListener('pointerleave', () => box.classList.remove('on'));
    el.addEventListener('pointermove', (e) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(follow);
    });
  });
}

function initReadout() {
  const frame = document.querySelector<HTMLElement>('[data-coords]');
  const out = frame?.querySelector<HTMLElement>('.readout');
  if (!frame || !out || !finePointer) return;
  const mm = (px: number) => (px * 0.2646).toFixed(1).padStart(5, '0'); // 96 dpi
  frame.addEventListener('pointermove', (e) => {
    const r = frame.getBoundingClientRect();
    out.textContent = `X ${mm(e.clientX - r.left)} · Y ${mm(e.clientY - r.top)} mm`;
  });
  frame.addEventListener('pointerleave', () => (out.textContent = 'X 000.0 · Y 000.0'));
}

initPeek();
initReadout();
