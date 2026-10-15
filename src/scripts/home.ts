// Home page motion: a photo preview follows the cursor over the contents
// list. Skipped without a fine pointer.

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

initPeek();
