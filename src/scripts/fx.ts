// Site-wide interaction effects. Everything here is progressive enhancement:
// the site works without it, and motion is skipped for reduced-motion users.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/* ---------- A hello for anyone who opens devtools ---------- */
function hello() {
  console.log(
    '%cHey there 👋%c\nIf you are poking around in here, we would probably get along.\nSource: https://github.com/ravitchd/ravitchd.github.io',
    'font: 700 18px system-ui, sans-serif; color: #2340d8',
    'font: 13px system-ui; color: inherit',
  );
}

initReveal();
initHeader();
initRotator();
hello();
