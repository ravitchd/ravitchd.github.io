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

/* ---------- A hello for anyone who opens devtools ---------- */
function hello() {
  console.log(
    '%cHey there 👋%c\nIf you are poking around in here, we would probably get along.\nSource: https://github.com/ravitchd/ravitchd.github.io',
    'font: 700 18px system-ui, sans-serif; color: #161615',
    'font: 13px system-ui; color: inherit',
  );
}

initHeader();
hello();
