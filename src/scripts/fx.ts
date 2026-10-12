// Site-wide interaction effects. Everything here is progressive enhancement:
// the site works without it, and motion is skipped for reduced-motion users.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- Scroll reveal ---------- */
function initReveal() {
  const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
  );
  items.forEach((el) => io.observe(el));
}

/* ---------- Header hides on scroll down, returns on scroll up ---------- */
function initHeader() {
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  let last = window.scrollY;
  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        header.classList.toggle('tucked', y > last && y > 160);
        header.classList.toggle('scrolled', y > 8);
        last = y;
        ticking = false;
      });
    },
    { passive: true },
  );
}

/* ---------- Cursor follower ring ---------- */
function initCursor() {
  if (!finePointer || reduceMotion) return;
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);

  let x = -100, y = -100, rx = x, ry = y;
  window.addEventListener('pointermove', (e) => {
    x = e.clientX;
    y = e.clientY;
    ring.classList.add('on');
  });
  document.addEventListener('pointerleave', () => ring.classList.remove('on'));
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    ring.classList.toggle('hover', !!t.closest('a, button, input, [data-cursor]'));
  });
  window.addEventListener('pointerdown', () => ring.classList.add('down'));
  window.addEventListener('pointerup', () => ring.classList.remove('down'));

  const tick = () => {
    rx += (x - rx) * 0.2;
    ry += (y - ry) * 0.2;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    requestAnimationFrame(tick);
  };
  tick();
}

/* ---------- Magnetic buttons ---------- */
function initMagnetic() {
  if (!finePointer || reduceMotion) return;
  document.querySelectorAll<HTMLElement>('.btn, [data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.32}px)`;
    });
    el.addEventListener('pointerleave', () => (el.style.transform = ''));
  });
}

/* ---------- Rotating words in the hero ---------- */
function initRotator() {
  const el = document.querySelector<HTMLElement>('[data-rotate]');
  if (!el) return;
  const words: string[] = JSON.parse(el.dataset.rotate || '[]');
  if (words.length < 2 || reduceMotion) return;
  let i = 0;
  setInterval(() => {
    el.classList.add('out');
    setTimeout(() => {
      i = (i + 1) % words.length;
      el.textContent = words[i];
      el.classList.remove('out');
      el.classList.add('in');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('in')));
    }, 380);
  }, 2800);
}

/* ---------- Ingredient scatter behind the hero ----------
   Chili flakes, basil leaves, peppercorns and flour specks sit loosely on the
   hero like a dusted countertop. The cursor brushes them aside, and a click
   sprinkles a fresh pinch that falls and settles. */
function initField() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-field]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const GAP = 46;
  const RADIUS = 140;
  type Kind = 0 | 1 | 2 | 3; // chili, basil, pepper, flour
  type Bit = {
    kind: Kind; ox: number; oy: number; x: number; y: number; vx: number; vy: number;
    a: number; va: number; size: number; life?: number;
  };
  let bits: Bit[] = [];
  let falling: Bit[] = [];
  let w = 0, h = 0;
  let mouse = { x: -9999, y: -9999 };
  let colors = ['#c42d1c', '#5f7f3a', '#2a1d17', '#d9c9b4'];
  let visible = true;
  let raf = 0;

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    colors = [v('--ing-chili', v('--accent', colors[0])), v('--ing-herb', colors[1]), v('--ing-pepper', v('--text', colors[2])), v('--ing-flour', v('--border', colors[3]))];
  };

  // Mostly flour and pepper, with chili and basil as the colorful accents.
  const pickKind = (): Kind => {
    const r = Math.random();
    return (r < 0.22 ? 0 : r < 0.36 ? 1 : r < 0.62 ? 2 : 3) as Kind;
  };
  const sizeFor = (k: Kind) => (k === 0 ? 3.8 : k === 1 ? 5.2 : k === 2 ? 1.8 : 1.5) * (0.8 + Math.random() * 0.5);
  const make = (x: number, y: number, kind = pickKind()): Bit => ({
    kind, ox: x, oy: y, x, y, vx: 0, vy: 0, a: Math.random() * Math.PI * 2, va: 0, size: sizeFor(kind),
  });

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bits = [];
    for (let y = GAP / 2; y < h; y += GAP)
      for (let x = GAP / 2; x < w; x += GAP)
        bits.push(make(x + (Math.random() - 0.5) * GAP * 0.8, y + (Math.random() - 0.5) * GAP * 0.8));
  };

  const shape = (b: Bit, alpha: number) => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors[b.kind];
    const s = b.size;
    ctx.beginPath();
    if (b.kind === 0) {
      // chili flake: a ragged little sliver
      ctx.moveTo(-s, -s * 0.35);
      ctx.lineTo(s * 0.9, -s * 0.5);
      ctx.lineTo(s * 0.6, s * 0.45);
      ctx.lineTo(-s * 0.8, s * 0.3);
    } else if (b.kind === 1) {
      // basil leaf: two arcs meeting at the tips, with a pale midrib
      ctx.moveTo(-s, 0);
      ctx.quadraticCurveTo(0, -s * 0.85, s, 0);
      ctx.quadraticCurveTo(0, s * 0.85, -s, 0);
    } else {
      ctx.ellipse(0, 0, s, b.kind === 3 ? s * 0.7 : s, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (b.kind === 1) {
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = colors[3];
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, 0);
      ctx.lineTo(s * 0.8, 0);
      ctx.stroke();
    }
    ctx.restore();
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      let tx = b.ox;
      let ty = b.oy;
      if (!reduceMotion) ty += Math.sin(b.ox * 0.011 + t * 0.0006) * 2.5;
      const dx = b.x - mouse.x;
      const dy = b.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      let k = 0;
      if (dist < RADIUS) {
        k = 1 - dist / RADIUS;
        const f = k * k * 46;
        tx += (dx / (dist || 1)) * f;
        ty += (dy / (dist || 1)) * f;
        b.va += (dx > 0 ? 1 : -1) * k * 0.02;
      }
      b.vx = (b.vx + (tx - b.x) * 0.08) * 0.8;
      b.vy = (b.vy + (ty - b.y) * 0.08) * 0.8;
      b.x += b.vx;
      b.y += b.vy;
      b.va *= 0.92;
      b.a += b.va;
      shape(b, (b.kind === 3 ? 0.6 : b.kind === 2 ? 0.35 : 0.62) + k * 0.35);
    }
    // a fresh pinch: falls, tumbles, fades
    falling = falling.filter((b) => (b.life ?? 0) > 0);
    for (const b of falling) {
      b.vy += 0.12;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.a += b.va;
      b.life = (b.life ?? 0) - 1;
      shape(b, Math.min(1, (b.life ?? 0) / 40) * 0.9);
    }
  };

  const loop = (t: number) => {
    draw(t);
    raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  };
  const start = () => {
    if (!raf && !reduceMotion) raf = requestAnimationFrame(loop);
  };

  readColors();
  resize();
  draw(0);

  new ResizeObserver(() => {
    resize();
    draw(performance.now());
  }).observe(canvas);
  const recolor = () => {
    readColors();
    draw(performance.now());
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
  window.addEventListener('themechange', recolor);
  if (reduceMotion) return;

  window.addEventListener(
    'pointermove',
    (e) => {
      const r = canvas.getBoundingClientRect();
      mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => (mouse = { x: -9999, y: -9999 }));
  // Click anywhere in the hero (but not on a link or button) to sprinkle a pinch.
  canvas.parentElement?.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button')) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    for (let i = 0; i < 26; i++) {
      const b = make(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 10);
      b.vx = (Math.random() - 0.5) * 5;
      b.vy = -Math.random() * 3.5 - 1;
      b.va = (Math.random() - 0.5) * 0.3;
      b.life = 70 + Math.random() * 50;
      falling.push(b);
    }
    if (falling.length > 400) falling.splice(0, falling.length - 400);
    start();
  });
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
  }).observe(canvas);
  document.addEventListener('visibilitychange', start);
  start();
}

/* ---------- A hello for anyone who opens devtools ---------- */
function hello() {
  console.log(
    '%cHey there 👋%c\nIf you are poking around in here, we would probably get along.\nSource: https://github.com/ravitchd/ravitchd.github.io',
    'font: 700 18px system-ui, sans-serif; color: #c42d1c',
    'font: 13px system-ui; color: inherit',
  );
}

initReveal();
initHeader();
initCursor();
initMagnetic();
initRotator();
initField();
hello();
