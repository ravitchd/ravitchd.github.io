// Boots a viewer for every [data-print] canvas once it gets near the screen,
// and wires up the slicer-style controls on the detail page.

const hasWebGL = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();

function boot(canvas: HTMLCanvasElement) {
  const stage = canvas.closest<HTMLElement>('[data-print-stage]');
  const slider = stage?.querySelector<HTMLInputElement>('[data-layer]');
  const readout = stage?.querySelector<HTMLElement>('[data-layer-readout]');
  const replay = stage?.querySelector<HTMLButtonElement>('[data-replay]');
  const wire = stage?.querySelector<HTMLButtonElement>('[data-wire]');

  import('./viewer')
    .then(({ mountPrint }) =>
      mountPrint(canvas, {
        url: canvas.dataset.print!,
        layerHeight: Number(canvas.dataset.layerHeight) || 0.2,
        interactive: canvas.hasAttribute('data-interactive'),
        duration: canvas.hasAttribute('data-interactive') ? 4200 : 3000,
        onLevel(layer, layers) {
          if (readout) readout.textContent = `${layer} / ${layers}`;
          if (slider && document.activeElement !== slider) slider.value = String(layer / layers);
        },
      }),
    )
    .then((viewer) => {
      stage?.classList.add('ready');
      slider?.addEventListener('input', () => viewer.setLevel(Number(slider.value)));
      replay?.addEventListener('click', () => viewer.replay());
      wire?.addEventListener('click', () => {
        const on = wire.getAttribute('aria-pressed') !== 'true';
        wire.setAttribute('aria-pressed', String(on));
        viewer.setWireframe(on);
      });
    })
    .catch(() => stage?.classList.add('failed'));
}

export function initPrints() {
  const canvases = document.querySelectorAll<HTMLCanvasElement>('canvas[data-print]');
  if (!hasWebGL) {
    canvases.forEach((c) => c.closest('[data-print-stage]')?.classList.add('failed'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        boot(e.target as HTMLCanvasElement);
      }
    },
    { rootMargin: '300px 0px' },
  );
  canvases.forEach((c) => io.observe(c));
}
