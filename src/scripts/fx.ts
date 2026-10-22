// Site-wide interaction effects. Everything here is progressive enhancement:
// the site works without it.

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

initHeader();
