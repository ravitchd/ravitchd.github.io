// Gallery page: boots the WebGL wall when it can, otherwise wires up the plain grid.
// Both share the fullscreen viewer and the count-up stats.

import type { Cursor, Mode, Stage } from './stage';
import { createViewer, type ViewerSource } from './viewer';

interface Dish {
  id: string;
  no: string;
  title: string;
  caption: string;
  tags: string[];
  alt: string;
  w: number;
  h: number;
  tex: string;
  texSm: string;
  large: string;
  recipe?: string;
}

const $ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = document) => el.querySelector<T>(sel);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function initGallery() {
  const root = document.documentElement;
  const dataEl = document.getElementById('g-data');
  if (!dataEl) return;
  const dishes: Dish[] = JSON.parse(dataEl.textContent || '[]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const small = Math.min(innerWidth, innerHeight) < 640;
  let optedIn = false;
  try {
    optedIn = sessionStorage.getItem('g-motion') === '1';
  } catch {}

  // Each open dish gets its own address (gallery/#heart-pizza), so it can be shared.
  const hashDish = () => dishes.findIndex((d) => `#${d.id}` === location.hash);
  const setHash = (i: number | null) => {
    try {
      history.replaceState(history.state, '', i === null ? location.pathname + location.search : `#${dishes[i].id}`);
    } catch {}
  };

  let viewing = false;
  const viewer = createViewer(dishes, {
    reduce: reduce && !optedIn,
    onToggle: (open) => {
      viewing = open;
      root.classList.toggle('g-viewing', open);
    },
    onShow: setHash,
  });

  /* ---------- Count-up stats ---------- */
  let counted = false;
  function countUp() {
    if (counted) return;
    counted = true;
    document.querySelectorAll<HTMLElement>('[data-count]').forEach((el, k) => {
      const end = Number(el.dataset.count);
      if (reduce) return;
      const t0 = performance.now() + 350 + k * 150;
      el.textContent = '0';
      const step = (t: number) => {
        const p = Math.min(Math.max((t - t0) / 1100, 0), 1);
        el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------- Plain grid ---------- */
  const cards = [...document.querySelectorAll<HTMLAnchorElement>('.g-card')];
  const cardImg = (i: number) => cards[i]?.querySelector('img');
  let gridCurrent = 0;
  const gridSource: ViewerSource = {
    rect(i) {
      const im = cardImg(i);
      if (!im) return null;
      const r = im.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) return null;
      return { x: r.left, y: r.top, w: r.width, h: r.height, zoom: 1, radius: 10 };
    },
    thumb: (i) => cardImg(i)?.currentSrc || dishes[i].texSm,
    hide(i) {
      cards.forEach((c, k) => c.classList.toggle('is-out', k === i));
      if (i !== null) gridCurrent = i;
    },
    navigate(i) {
      gridCurrent = i;
      cards[i].scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    },
    restoreFocus: () => cards[gridCurrent]?.focus({ preventScroll: true }),
  };
  cards.forEach((c, i) =>
    c.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      viewer.open(i, gridSource);
    }),
  );

  $('.g-optin')?.addEventListener('click', () => {
    try {
      sessionStorage.setItem('g-motion', '1');
    } catch {}
    optedIn = true;
    root.classList.add('g-webgl');
    boot();
  });

  const fallback = (err?: unknown) => {
    if (err) console.warn('Gallery: showing the plain grid instead.', err);
    root.classList.remove('g-webgl', 'g-ring', 'g-ready', 'g-fine');
    countUp();
  };

  // Focus rings on the photo wall only for people moving around with Tab.
  window.addEventListener('keydown', (e) => e.key === 'Tab' && root.classList.add('g-kbd'));
  window.addEventListener('pointerdown', () => root.classList.remove('g-kbd'));

  if (root.classList.contains('g-webgl')) boot();
  else {
    countUp();
    const deep = hashDish();
    if (deep >= 0) {
      cards[deep].scrollIntoView({ block: 'center' });
      setTimeout(() => viewer.open(deep, gridSource), 250);
    }
  }

  /* ---------- The interactive version ---------- */
  async function boot() {
    const stageEl = $('.g-stage')!;
    const canvas = $<HTMLCanvasElement>('.g-canvas')!;
    const loader = $('.g-loader')!;
    const loaderNum = $('.g-loader-num')!;
    const focusNo = $('.g-focus-no')!;
    const focusTags = $('.g-focus-tags')!;
    const focusTitle = $('.g-focus-title')!;
    const back = $('.g-back')!;
    const backSpans = [...back.querySelectorAll<HTMLElement>('span')];
    const liveEl = $('#g-live')!;
    const cursorEl = $('.g-cursor')!;
    const cursorLabel = $('.g-cursor-label')!;
    const idxBtn = $<HTMLButtonElement>('.g-index-btn')!;
    const idx = $('.g-index')!;
    const modeBtns = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
    const calm = reduce; // only here because they opted in

    // Loading counter that eases towards the real progress.
    let want = 0;
    let shown = 0;
    let loading = true;
    const tickLoader = () => {
      shown += (want - shown) * 0.16;
      if (want - shown < 0.002) shown = want;
      loaderNum.textContent = String(Math.round(shown * 100)).padStart(3, '0');
      loader.style.setProperty('--p', String(shown));
      if (loading || shown < want) requestAnimationFrame(tickLoader);
    };
    requestAnimationFrame(tickLoader);

    // Start downloading the photos while three.js loads, and pick out each one's
    // strongest colour for the glow behind the ring.
    const texUrl = (d: Dish) => (small ? d.texSm : d.tex);
    const glow: string[] = dishes.map(() => '');
    dishes.forEach((d, i) => {
      const im = new Image();
      im.decoding = 'async';
      im.src = texUrl(d);
      im.decode()
        .then(() => {
          const c = document.createElement('canvas');
          c.width = c.height = 24;
          const g = c.getContext('2d', { willReadFrequently: true });
          if (!g) return;
          g.drawImage(im, 0, 0, 24, 24);
          const px = g.getImageData(0, 0, 24, 24).data;
          let r = 0;
          let gr = 0;
          let b = 0;
          let w = 0;
          for (let k = 0; k < px.length; k += 4) {
            const max = Math.max(px[k], px[k + 1], px[k + 2]);
            const sat = max ? (max - Math.min(px[k], px[k + 1], px[k + 2])) / max : 0;
            const wt = sat * sat * (max / 255) + 0.002;
            r += px[k] * wt;
            gr += px[k + 1] * wt;
            b += px[k + 2] * wt;
            w += wt;
          }
          glow[i] = `rgb(${Math.round(r / w)} ${Math.round(gr / w)} ${Math.round(b / w)})`;
          if (i === shownFocus) stageEl.style.setProperty('--g-glow', glow[i]);
        })
        .catch(() => {});
    });

    let stage: Stage;
    let mode: Mode = root.classList.contains('g-ring') ? 'ring' : 'wall';
    let kbd = false;

    /* Focus label: the dish in the middle (or under the cursor) */
    let shownFocus = -1;
    let focusTimer = 0;
    let lastFocusAt = 0;
    const splitInto = (el: HTMLElement, text: string) => {
      el.querySelectorAll('.g-t:not(.out)').forEach((old) => {
        old.classList.add('out');
        setTimeout(() => old.remove(), 700);
      });
      const line = document.createElement('span');
      line.className = 'g-t';
      let k = 0;
      text.split(' ').forEach((word, wi, words) => {
        const w = document.createElement('span');
        w.className = 'g-w';
        for (const ch of word) {
          const c = document.createElement('span');
          c.className = 'g-c';
          c.textContent = ch;
          c.style.setProperty('--k', String(k++));
          w.appendChild(c);
        }
        line.appendChild(w);
        if (wi < words.length - 1) line.appendChild(document.createTextNode(' '));
      });
      el.appendChild(line);
    };
    let backTimer = 0;
    const setBack = (text: string) => {
      back.classList.add('swap');
      clearTimeout(backTimer);
      backTimer = window.setTimeout(() => {
        backSpans.forEach((s) => (s.textContent = `${text} — ${text} — `));
        back.classList.remove('swap');
      }, 320);
    };
    const showFocus = (i: number) => {
      if (i === shownFocus) return;
      shownFocus = i;
      lastFocusAt = performance.now();
      const d = dishes[i];
      focusNo.textContent = `Nº ${d.no}`;
      focusTags.textContent = d.tags.join(' · ');
      splitInto(focusTitle, d.title);
      setBack(d.title);
      if (glow[i]) stageEl.style.setProperty('--g-glow', glow[i]);
      if (kbd) liveEl.textContent = `Nº ${d.no}, ${d.title}`;
    };
    const onFocus = (i: number) => {
      clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => showFocus(i), Math.max(0, 170 - (performance.now() - lastFocusAt)));
    };

    /* Custom cursor */
    const labels: Record<Cursor, string> = { drag: 'Drag', view: 'View', grabbing: '' };
    let cursorState: Cursor = 'drag';
    const paintCursor = () => {
      cursorEl.dataset.state = cursorState;
      cursorLabel.textContent = cursorState === 'drag' && mode === 'ring' ? 'Spin' : labels[cursorState];
    };
    if (fine) {
      root.classList.add('g-fine');
      let x = -200;
      let y = -200;
      let cx = x;
      let cy = y;
      let running = false;
      const tick = () => {
        cx += (x - cx) * 0.24;
        cy += (y - cy) * 0.24;
        cursorEl.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        running = Math.abs(x - cx) + Math.abs(y - cy) > 0.2;
        if (running) requestAnimationFrame(tick);
      };
      canvas.addEventListener('pointermove', (e) => {
        x = e.clientX;
        y = e.clientY;
        if (!cursorEl.classList.contains('on')) {
          cx = x;
          cy = y;
          cursorEl.classList.add('on');
        }
        if (!running) {
          running = true;
          requestAnimationFrame(tick);
        }
      });
      canvas.addEventListener('pointerleave', () => cursorEl.classList.remove('on'));
    }

    /* Hint: goes away after the first drag, scroll or key press */
    const touched = () => root.classList.add('g-touched');

    const stageSource: ViewerSource = {
      rect: (i) => stage.rect(i),
      thumb: (i) => texUrl(dishes[i]),
      hide: (i) => stage.hide(i),
      navigate: (i) => stage.focusDish(i, true),
      wake: () => stage.setPaused(false),
      sleep: () => stage.setPaused(true),
    };

    try {
      const { createStage } = await import('./stage');
      stage = await createStage({
        canvas,
        dishes: dishes.map((d) => ({ tex: texUrl(d), w: d.w, h: d.h })),
        mode,
        small,
        calm,
        onProgress: (p) => (want = p),
        onFocus,
        onCursor: (c) => {
          cursorState = c;
          paintCursor();
        },
        onOpen: (i) => {
          touched();
          viewer.open(i, stageSource);
        },
        onInteract: () => {
          kbd = false;
          touched();
        },
        onLost: () => fallback(new Error('WebGL context lost')),
      });
    } catch (err) {
      loading = false;
      fallback(err);
      return;
    }

    want = 1;
    loading = false;
    await wait(calm ? 0 : 420);
    const deep = hashDish();
    if (deep >= 0) stage.focusDish(deep, true);
    root.classList.add('g-ready');
    stage.intro();
    showFocus(deep >= 0 ? deep : stage.focused);
    countUp();
    if (deep >= 0) setTimeout(() => !viewing && viewer.open(deep, stageSource), calm ? 300 : 1700);

    /* Wall / Ring */
    const setModeUI = (m: Mode) => {
      mode = m;
      modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
      root.classList.toggle('g-ring', m === 'ring');
      paintCursor();
      try {
        localStorage.setItem('g-mode', m);
      } catch {}
    };
    setModeUI(mode);
    modeBtns.forEach((b) =>
      b.addEventListener('click', () => {
        const m = b.dataset.mode as Mode;
        if (m === stage.mode) return;
        stage.setMode(m);
        setModeUI(m);
        touched();
      }),
    );

    /* Index */
    const toggleIndex = (open = idx.hidden) => {
      idxBtn.setAttribute('aria-expanded', String(open));
      root.classList.toggle('g-index-open', open);
      if (open) {
        idx.hidden = false;
        requestAnimationFrame(() => idx.classList.add('open'));
        idx.focus({ preventScroll: true });
      } else {
        idx.classList.remove('open');
        stage.preview(null);
        setTimeout(() => {
          if (!idx.classList.contains('open')) idx.hidden = true;
        }, 450);
      }
    };
    idxBtn.addEventListener('click', () => toggleIndex());
    idx.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach((b) => {
      const i = Number(b.dataset.i);
      if (fine) b.addEventListener('pointerenter', () => stage.preview(i));
      b.addEventListener('focus', () => b.matches(':focus-visible') && stage.preview(i));
      b.addEventListener('click', async () => {
        toggleIndex(false);
        stage.preview(null);
        stage.focusDish(i);
        touched();
        await wait(reduce ? 60 : 650);
        if (!viewing) viewer.open(i, stageSource);
      });
    });
    idx.addEventListener('pointerleave', () => stage.preview(null));
    document.addEventListener('pointerdown', (e) => {
      if (!idx.hidden && !idx.contains(e.target as Node) && !idxBtn.contains(e.target as Node)) toggleIndex(false);
    });

    /* Keyboard */
    window.addEventListener('keydown', (e) => {
      if (viewing || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (!idx.hidden) {
        if (e.key === 'Escape') {
          toggleIndex(false);
          idxBtn.focus();
        }
        return;
      }
      const onControl = t.closest('button, a');
      switch (e.key) {
        case 'ArrowLeft':
          stage.step(-1);
          break;
        case 'ArrowRight':
          stage.step(1);
          break;
        case 'ArrowUp':
          if (stage.mode !== 'wall') return;
          stage.nudge(0, -1);
          break;
        case 'ArrowDown':
          if (stage.mode !== 'wall') return;
          stage.nudge(0, 1);
          break;
        case 'Enter':
        case ' ':
          if (onControl) return;
          stage.openFocused();
          break;
        default:
          return;
      }
      e.preventDefault();
      kbd = true;
      touched();
    });
  }
}
