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

/* ---------- Hero backdrop ----------
   The hero canvas draws one of a few kitchen-themed effects, picked by the
   --hero-fx token so a theme can choose it:
   - mesh: a springy grid, like stretched dough or an FEA mesh; drag the cursor
     through it to pull it around, click to poke a ripple, and strained cells
     glow in the accent color
   - flakes: chili, basil, pepper and flour scattered like a dusted counter;
     the cursor brushes them aside and a click sprinkles a fresh pinch
   - steam: soft wisps rising off the bottom, bending away from the cursor
   - embers: sparks drifting up from a wood-fired oven; a click throws a burst
   - none: nothing drawn */
type Fx = 'mesh' | 'flakes' | 'steam' | 'embers' | 'none';

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
  type Rise = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; seed: number };
  let mode: Fx = 'mesh';
  let bits: Bit[] = [];
  let falling: Bit[] = [];
  let risers: Rise[] = [];
  let w = 0, h = 0;
  let mouse = { x: -9999, y: -9999 };
  let mvx = 0, mvy = 0; // cursor velocity, decays each frame
  // mesh nodes: rest grid + displacement and velocity, stored flat
  const CELL = 34;
  let cols = 0, rows = 0;
  let mx: Float32Array = new Float32Array(0), my = mx, mvxs = mx, mvys = mx;
  let ink = '#2a1d17', hot = '#c42d1c';
  let colors = ['#c42d1c', '#5f7f3a', '#2a1d17', '#d9c9b4'];
  let steam = '#d9c9b4';
  let ember = ['#ff7a3d', '#ffb347'];
  let visible = true;
  let raf = 0;

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    colors = [v('--ing-chili', v('--accent', colors[0])), v('--ing-herb', colors[1]), v('--ing-pepper', v('--text', colors[2])), v('--ing-flour', v('--border', colors[3]))];
    steam = v('--fx-steam', v('--muted', steam));
    ink = v('--text', ink);
    hot = v('--accent', hot);
    ember = [v('--fx-ember-1', v('--accent', ember[0])), v('--fx-ember-2', ember[1])];
    const m = v('--hero-fx', 'mesh').replace(/['"]/g, '') as Fx;
    if (m !== mode) {
      mode = m;
      risers = [];
      falling = [];
    }
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
    cols = Math.ceil(w / CELL) + 2;
    rows = Math.ceil(h / CELL) + 2;
    mx = new Float32Array(cols * rows);
    my = new Float32Array(cols * rows);
    mvxs = new Float32Array(cols * rows);
    mvys = new Float32Array(cols * rows);
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

  const drawFlakes = (t: number) => {
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

  const stepMesh = () => {
    const R = RADIUS * 1.1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = j * cols + i;
        const px = (i - 1) * CELL + mx[n];
        const py = (j - 1) * CELL + my[n];
        // neighbours pull toward their average, so a dent spreads as a ripple
        let ax = 0, ay = 0, c = 0;
        if (i > 0) { ax += mx[n - 1]; ay += my[n - 1]; c++; }
        if (i < cols - 1) { ax += mx[n + 1]; ay += my[n + 1]; c++; }
        if (j > 0) { ax += mx[n - cols]; ay += my[n - cols]; c++; }
        if (j < rows - 1) { ax += mx[n + cols]; ay += my[n + cols]; c++; }
        let fx = (ax / c - mx[n]) * 0.22 - mx[n] * 0.035;
        let fy = (ay / c - my[n]) * 0.22 - my[n] * 0.035;
        const dx = px - mouse.x;
        const dy = py - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < R) {
          const k = 1 - d / R;
          // drag the dough along with the cursor, plus a gentle press outward
          fx += mvx * k * k * 0.32 + (dx / (d || 1)) * k * 0.5;
          fy += mvy * k * k * 0.32 + (dy / (d || 1)) * k * 0.5;
        }
        mvxs[n] = (mvxs[n] + fx) * 0.9;
        mvys[n] = (mvys[n] + fy) * 0.9;
      }
    }
    for (let n = 0; n < mx.length; n++) {
      mx[n] += mvxs[n];
      my[n] += mvys[n];
    }
    mvx *= 0.85;
    mvy *= 0.85;
  };

  const drawMesh = () => {
    if (!reduceMotion) stepMesh();
    const P = (i: number, j: number): [number, number] => {
      const n = j * cols + i;
      return [(i - 1) * CELL + mx[n], (j - 1) * CELL + my[n]];
    };
    // base grid, faint
    ctx.globalAlpha = 0.11;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const [x, y] = P(i, j);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const [x, y] = P(i, j);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    // strained edges light up in the accent, like a stress plot
    ctx.strokeStyle = hot;
    ctx.lineWidth = 1.5;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = j * cols + i;
        const s = Math.hypot(mx[n], my[n]);
        if (s < 1.5) continue;
        const a = Math.min(0.85, s / 26);
        ctx.globalAlpha = a;
        const [x, y] = P(i, j);
        ctx.beginPath();
        if (i < cols - 1) { const [x2, y2] = P(i + 1, j); ctx.moveTo(x, y); ctx.lineTo(x2, y2); }
        if (j < rows - 1) { const [x3, y3] = P(i, j + 1); ctx.moveTo(x, y); ctx.lineTo(x3, y3); }
        ctx.stroke();
        if (s > 6) {
          ctx.fillStyle = hot;
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };

  const spawnRiser = (x = Math.random() * w, y = h + 20, burst = false): Rise => {
    const isSteam = mode === 'steam';
    const max = isSteam ? 260 + Math.random() * 200 : 140 + Math.random() * 160;
    return {
      x, y,
      vx: burst ? (Math.random() - 0.5) * 4 : 0,
      vy: burst ? -2 - Math.random() * 3 : isSteam ? -0.55 - Math.random() * 0.35 : -0.9 - Math.random() * 1.1,
      r: isSteam ? 22 + Math.random() * 30 : 1 + Math.random() * 1.8,
      life: max, max, seed: Math.random() * 1000,
    };
  };

  const drawRisers = (t: number) => {
    const isSteam = mode === 'steam';
    const target = isSteam ? Math.round(w / 34) : Math.round(w / 14);
    while (risers.length < target) {
      const r = spawnRiser();
      // stagger the first fill so the screen doesn't start empty
      if (!t) r.life = Math.random() * r.max;
      if (!t) r.y = h - (1 - r.life / r.max) * h * 1.1;
      risers.push(r);
    }
    for (const p of risers) {
      const sway = Math.sin(t * 0.0011 + p.seed) * (isSteam ? 0.35 : 0.5);
      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < RADIUS * 1.2) {
        const k = 1 - dist / (RADIUS * 1.2);
        p.vx += (dx / (dist || 1)) * k * (isSteam ? 0.35 : 0.6);
      }
      p.vx = (p.vx + sway * 0.05) * 0.96;
      p.x += p.vx + sway * 0.3;
      p.y += p.vy;
      p.life -= 1;
      const age = 1 - p.life / p.max; // 0 → 1
      if (isSteam) {
        const rr = p.r * (0.7 + age * 1.4);
        const a = Math.sin(Math.PI * age) * 0.3;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        g.addColorStop(0, steam);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const flick = 0.65 + 0.35 * Math.sin(t * 0.02 + p.seed * 7);
        const a = Math.min(1, p.life / 50) * Math.min(1, age * 6) * flick;
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = ember[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.fillStyle = ember[1];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    risers = risers.filter((p) => p.life > 0 && p.y > -60);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    if (mode === 'mesh') drawMesh();
    else if (mode === 'flakes') drawFlakes(t);
    else if (mode === 'steam' || mode === 'embers') drawRisers(t);
    ctx.globalAlpha = 1;
  };

  const loop = (t: number) => {
    draw(t);
    raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  };
  const start = () => {
    if (!raf && !reduceMotion && mode !== 'none') raf = requestAnimationFrame(loop);
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
    start();
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor);
  window.addEventListener('themechange', recolor);
  if (reduceMotion) return;

  window.addEventListener(
    'pointermove',
    (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (mouse.x > -9000) {
        mvx = Math.max(-40, Math.min(40, x - mouse.x));
        mvy = Math.max(-40, Math.min(40, y - mouse.y));
      }
      mouse = { x, y };
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => (mouse = { x: -9999, y: -9999 }));
  // Click anywhere in the hero (but not on a link or button): a pinch of flakes, or a burst of sparks.
  canvas.parentElement?.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a, button')) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (mode === 'mesh') {
      // poke: shove nearby nodes outward and let the ripple travel
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const n = j * cols + i;
          const dx = (i - 1) * CELL + mx[n] - x;
          const dy = (j - 1) * CELL + my[n] - y;
          const d = Math.hypot(dx, dy);
          if (d < 120) {
            const k = 1 - d / 120;
            mvxs[n] += (dx / (d || 1)) * k * 14;
            mvys[n] += (dy / (d || 1)) * k * 14;
          }
        }
      }
    } else if (mode === 'flakes') {
      for (let i = 0; i < 26; i++) {
        const b = make(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 10);
        b.vx = (Math.random() - 0.5) * 5;
        b.vy = -Math.random() * 3.5 - 1;
        b.va = (Math.random() - 0.5) * 0.3;
        b.life = 70 + Math.random() * 50;
        falling.push(b);
      }
      if (falling.length > 400) falling.splice(0, falling.length - 400);
    } else if (mode === 'embers') {
      for (let i = 0; i < 24; i++) risers.push(spawnRiser(x, y, true));
    } else if (mode === 'steam') {
      for (let i = 0; i < 5; i++) risers.push(spawnRiser(x + (Math.random() - 0.5) * 40, y, false));
    }
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
