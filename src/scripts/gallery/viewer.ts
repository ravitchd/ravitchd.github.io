// Fullscreen photo viewer. The photo grows out of wherever it was on the page (a tile on
// the WebGL wall, or a card in the plain grid) and shrinks back into it on close.

export interface ViewerDish {
  no: string;
  title: string;
  caption: string;
  tags: string[];
  alt: string;
  w: number;
  h: number;
  large: string;
  recipe?: string;
}

export interface FlipRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** How far the source shows into the photo: 1 = the whole cover crop, 0.88 = a bit zoomed in. */
  zoom: number;
  radius: number;
}

export interface ViewerSource {
  rect(i: number): FlipRect | null;
  /** An already-loaded image to show straight away while the large one loads. */
  thumb(i: number): string;
  hide(i: number | null): void;
  navigate(i: number): void;
  wake?(): void;
  sleep?(): void;
  restoreFocus?(): void;
}

const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
const EASE_IN_OUT = 'cubic-bezier(.65, 0, .35, 1)';
const REST: Keyframe = { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px round 6px)' };
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const done = (anims: Animation[]) => Promise.all(anims.map((a) => a.finished.catch(() => {})));

function flip(from: FlipRect, to: DOMRect): Keyframe {
  const s = Math.max(from.w / to.width, from.h / to.height) / from.zoom;
  const ix = Math.max(0, (to.width - from.w / s) / 2);
  const iy = Math.max(0, (to.height - from.h / s) / 2);
  const dx = from.x + from.w / 2 - (to.left + to.width / 2);
  const dy = from.y + from.h / 2 - (to.top + to.height / 2);
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${s})`,
    clipPath: `inset(${iy}px ${ix}px round ${from.radius / s}px)`,
  };
}

export interface ViewerOptions {
  reduce: boolean;
  onToggle?: (open: boolean) => void;
  /** The dish on screen, or null once closed. */
  onShow?: (i: number | null) => void;
}

export function createViewer(dishes: ViewerDish[], opts: ViewerOptions) {
  const dlg = document.querySelector<HTMLDialogElement>('.lb')!;
  const shade = dlg.querySelector<HTMLElement>('.lb-shade')!;
  const img = dlg.querySelector<HTMLImageElement>('.lb-img')!;
  const text = dlg.querySelector<HTMLElement>('.lb-text')!;
  const count = dlg.querySelector<HTMLElement>('.lb-count')!;
  const title = dlg.querySelector<HTMLElement>('.lb-title')!;
  const caption = dlg.querySelector<HTMLElement>('.lb-caption')!;
  const tags = dlg.querySelector<HTMLElement>('.lb-tags')!;
  const recipe = dlg.querySelector<HTMLAnchorElement>('.lb-recipe')!;
  const buttons = [...dlg.querySelectorAll<HTMLElement>('.lb-btn')];
  const root = document.documentElement;
  const n = dishes.length;
  const large = new Set<number>();
  let cur = -1;
  let src: ViewerSource | null = null;
  let busy = false;
  // A close asked for while the photo is still moving happens as soon as it stops.
  let closeAfter = false;
  let live: Animation[] = [];
  let finished = true;

  function fill(i: number) {
    const d = dishes[i];
    cur = i;
    img.width = d.w;
    img.height = d.h;
    img.alt = d.alt;
    img.src = large.has(i) ? d.large : src!.thumb(i);
    count.textContent = `Nº ${d.no} / ${String(n).padStart(2, '0')}`;
    title.textContent = d.title;
    caption.textContent = d.caption;
    tags.textContent = d.tags.join(' · ');
    recipe.hidden = !d.recipe;
    if (d.recipe) recipe.href = d.recipe;
    opts.onShow?.(i);
  }

  /** Swap in the full-size photo once it has loaded. */
  function upgrade(i: number) {
    if (large.has(i)) return;
    const pre = new Image();
    pre.src = dishes[i].large;
    pre
      .decode()
      .then(() => {
        large.add(i);
        if (cur === i && dlg.open) img.src = dishes[i].large;
      })
      .catch(() => {});
  }

  const textIn = (delay: number) =>
    [...text.children].map((el, k) =>
      (el as HTMLElement).animate(
        [
          { opacity: 0, transform: 'translateY(16px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: opts.reduce ? 200 : 700, delay: opts.reduce ? 0 : delay + k * 70, easing: EASE_OUT, fill: 'backwards' },
      ),
    );

  async function open(i: number, source: ViewerSource) {
    if (busy || dlg.open) return;
    busy = true;
    src = source;
    fill(i);
    await Promise.race([img.decode().catch(() => {}), wait(180)]);
    dlg.showModal();
    finished = false;
    root.classList.add('lb-open');
    opts.onToggle?.(true);
    const to = img.getBoundingClientRect();
    const from = opts.reduce ? null : source.rect(i);
    source.hide(i);
    live = [
      shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: opts.reduce ? 200 : 600, easing: 'ease-out' }),
      from
        ? img.animate([flip(from, to), REST], { duration: 820, easing: EASE_OUT })
        : img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' }),
    ];
    textIn(from ? 260 : 60);
    buttons.forEach((el) =>
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: opts.reduce ? 200 : 500,
        delay: opts.reduce ? 0 : 300,
        easing: 'ease-out',
        fill: 'backwards',
      }),
    );
    // The text can finish arriving on its own; closing only has to wait for the photo.
    await done(live);
    live = [];
    source.sleep?.();
    upgrade(i);
    busy = false;
    if (closeAfter) close();
  }

  function finish() {
    if (finished) return;
    finished = true;
    live.forEach((a) => a.cancel());
    live = [];
    src?.hide(null);
    src?.wake?.();
    root.classList.remove('lb-open');
    opts.onToggle?.(false);
    opts.onShow?.(null);
    busy = false;
    closeAfter = false;
  }
  // However the dialog ends up closed (even a double Escape mid-animation), tidy up.
  dlg.addEventListener('close', () => {
    finish();
    src?.restoreFocus?.();
  });

  async function close() {
    if (!dlg.open) return;
    if (busy) {
      closeAfter = true;
      return;
    }
    closeAfter = false;
    busy = true;
    src!.wake?.();
    await frame();
    const to = img.getBoundingClientRect();
    const from = opts.reduce ? null : src!.rect(cur);
    live = [
      shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: from ? 560 : 220, easing: 'ease-in-out', fill: 'forwards' }),
      ...[text, ...buttons].map((el) =>
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }),
      ),
      from
        ? img.animate([REST, flip(from, to)], { duration: 640, easing: EASE_IN_OUT, fill: 'forwards' })
        : img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }),
    ];
    await done(live);
    // Show the tile again first, so there is never a frame with neither on screen.
    src!.hide(null);
    await frame();
    await frame();
    dlg.close();
  }

  async function go(dir: 1 | -1) {
    if (busy || !dlg.open) return;
    busy = true;
    const j = (cur + dir + n) % n;
    const pre = new Image();
    pre.src = large.has(j) ? dishes[j].large : src!.thumb(j);
    await Promise.race([pre.decode().catch(() => {}), wait(300)]);
    const away = `translateX(${-dir * 40}px)`;
    const enter = `translateX(${dir * 40}px)`;
    let out = [img, text].map((el) =>
      el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: away }], {
        duration: opts.reduce ? 120 : 220,
        easing: 'ease-in',
        fill: 'forwards',
      }),
    );
    live = out;
    await done(out);
    src!.wake?.();
    src!.navigate(j);
    fill(j);
    src!.hide(j);
    out.forEach((a) => a.cancel());
    out = [img, text].map((el) =>
      el.animate([{ opacity: 0, transform: enter }, { opacity: 1, transform: 'none' }], {
        duration: opts.reduce ? 160 : 460,
        easing: EASE_OUT,
      }),
    );
    live = out;
    await done(out);
    live = [];
    src!.sleep?.();
    upgrade(j);
    busy = false;
    if (closeAfter) close();
  }

  dlg.querySelector('.lb-close')!.addEventListener('click', close);
  dlg.querySelector('.lb-prev')!.addEventListener('click', () => go(-1));
  dlg.querySelector('.lb-next')!.addEventListener('click', () => go(1));
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === dlg || t === shade || t.classList.contains('lb-inner')) close();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
  });

  // Swipe sideways for the next dish, or down to close.
  let sx = 0;
  let sy = 0;
  dlg.addEventListener(
    'touchstart',
    (e) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    },
    { passive: true },
  );
  dlg.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
      else if (dy > 90 && dy > Math.abs(dx) * 1.4) close();
    },
    { passive: true },
  );

  return {
    open,
    close,
    isOpen: () => dlg.open,
  };
}
