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

/* ---------- Card spotlight + tilt ---------- */
function initCards() {
  if (!finePointer) return;
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      card.style.setProperty('--mx', `${px}px`);
      card.style.setProperty('--my', `${py}px`);
      if (reduceMotion || card.tagName !== 'A') return;
      const rx = (py / r.height - 0.5) * -6;
      const ry = (px / r.width - 0.5) * 6;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-3px)`;
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    });
  });
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

/* ---------- Interactive dot field behind the hero ---------- */
function initField() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-field]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const GAP = 26;
  const RADIUS = 150;
  type Dot = { ox: number; oy: number; x: number; y: number; vx: number; vy: number };
  let dots: Dot[] = [];
  let w = 0, h = 0;
  let mouse = { x: -9999, y: -9999 };
  let accent = '#2f5d50', ink = '#1c1b19';
  let visible = true;
  let raf = 0;

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    accent = cs.getPropertyValue('--accent').trim() || accent;
    ink = cs.getPropertyValue('--text').trim() || ink;
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    for (let y = GAP / 2; y < h; y += GAP)
      for (let x = GAP / 2; x < w; x += GAP) dots.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 });
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      let tx = d.ox;
      let ty = d.oy;
      if (!reduceMotion) ty += Math.sin(d.ox * 0.011 + t * 0.0009) * Math.cos(d.oy * 0.013 + t * 0.0007) * 5;

      const dx = d.x - mouse.x;
      const dy = d.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      let k = 0;
      if (dist < RADIUS) {
        k = 1 - dist / RADIUS;
        const f = k * k * 42;
        tx += (dx / (dist || 1)) * f;
        ty += (dy / (dist || 1)) * f;
      }
      d.vx = (d.vx + (tx - d.x) * 0.09) * 0.8;
      d.vy = (d.vy + (ty - d.y) * 0.09) * 0.8;
      d.x += d.vx;
      d.y += d.vy;

      ctx.globalAlpha = 0.16 + k * 0.75;
      ctx.fillStyle = k > 0.05 ? accent : ink;
      const s = 1.3 + k * 2.4;
      ctx.beginPath();
      ctx.arc(d.x, d.y, s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readColors();
    draw(performance.now());
  });
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
    'font: 600 18px Georgia, serif; color: #2f5d50',
    'font: 13px system-ui; color: inherit',
  );
}

initReveal();
initHeader();
initCursor();
initCards();
initMagnetic();
initRotator();
initField();
hello();
