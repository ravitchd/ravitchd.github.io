// Home page motion: portrait tilt with parallax chips, count-up stats, and the
// fishing photo that grows to full-bleed as you scroll past it. All of it is skipped for reduced motion.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function initTilt() {
  const wrap = document.querySelector<HTMLElement>('[data-tilt]');
  if (!wrap || reduceMotion || !finePointer) return;
  const card = wrap.querySelector<HTMLElement>('.portrait')!;
  const chips = [...wrap.querySelectorAll<HTMLElement>('[data-depth]')];
  const hero = wrap.closest('section') ?? wrap;

  hero.addEventListener('pointermove', (e) => {
    const r = wrap.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 1.2)));
    const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 1.2)));
    card.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`;
    for (const c of chips) {
      const d = Number(c.dataset.depth) || 0;
      c.style.transform = `translate(${x * d * 0.5}px, ${y * d * 0.4}px)`;
    }
  });
  hero.addEventListener('pointerleave', () => {
    card.style.transform = '';
    chips.forEach((c) => (c.style.transform = ''));
  });
}


function initCounters() {
  const els = document.querySelectorAll<HTMLElement>('[data-count]');
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const el = e.target as HTMLElement;
        const end = Number(el.dataset.count);
        const start = end > 1000 ? end - 25 : 0; // years count up from just before
        const t0 = performance.now();
        const dur = 1400;
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 4);
          el.textContent = String(Math.round(start + (end - start) * eased));
          if (p < 1) requestAnimationFrame(step);
        };
        el.textContent = String(start);
        requestAnimationFrame(step);
      }
    },
    { threshold: 0.6 },
  );
  els.forEach((el) => io.observe(el));
}

function initReel() {
  const reel = document.querySelector<HTMLElement>('[data-reel]');
  if (!reel || reduceMotion) return;
  reel.classList.add('live');
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = reel.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    // reach full-bleed about two thirds of the way through, then hold
    const p = span > 0 ? Math.min(1, Math.max(0, -r.top / (span * 0.65))) : 1;
    reel.style.setProperty('--p', p.toFixed(4));
  };
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  window.addEventListener('resize', update);
  update();
}

initTilt();
initCounters();
initReel();
