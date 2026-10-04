// The WebGL stage behind the gallery: an endless wall of photos you can drag in any
// direction, which can also fold up into a spinning ring. Loaded only when WebGL2 is
// available and the visitor hasn't asked for reduced motion.

import {
  ColorManagement,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { fragmentShader, vertexShader } from './shaders';

// Photos are passed through untouched; no colour-space conversion anywhere.
ColorManagement.enabled = false;

export type Mode = 'wall' | 'ring';
export type Cursor = 'drag' | 'view' | 'grabbing';

export interface StageDish {
  tex: string;
  w: number;
  h: number;
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
  radius: number;
}

export interface StageOptions {
  canvas: HTMLCanvasElement;
  dishes: StageDish[];
  mode: Mode;
  small: boolean;
  /** Reduced-motion visitor who turned the stage on anyway: no burst, no idle drift. */
  calm: boolean;
  onProgress?: (p: number) => void;
  onFocus?: (dish: number) => void;
  onCursor?: (c: Cursor) => void;
  onOpen?: (dish: number) => void;
  onInteract?: () => void;
  onLost?: () => void;
}

export interface Stage {
  readonly mode: Mode;
  readonly focused: number;
  intro(): void;
  setMode(m: Mode): void;
  preview(dish: number | null): void;
  focusDish(dish: number, instant?: boolean): void;
  nudge(cols: number, rows: number): void;
  step(dir: 1 | -1): void;
  openFocused(): void;
  rect(dish: number): TileRect | null;
  hide(dish: number | null): void;
  setPaused(paused: boolean): void;
}

const FOV = 35;
const MODE_DUR = 1300;
const INTRO_DUR = 1500;
const FOLLOW = 5; // how fast the wall catches up with where it is headed, per second
const FOLLOW_DRAG = 24; // the same while a finger or mouse is holding it
const IDLE_AFTER = 3200;
const TILT = 0.2; // how far the ring leans back, in radians
const RING_FOG = 0.36;
const SLOP = 6;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (a: number, b: number, l: number, dt: number) => lerp(a, b, 1 - Math.exp(-l * dt));
const wrap = (v: number, p: number) => ((((v + p / 2) % p) + p) % p) - p / 2;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const normAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Layout {
  vw: number;
  vh: number;
  dist: number;
  W: number;
  H: number;
  cellW: number;
  cellH: number;
  Wr: number;
  Hr: number;
  R: number;
  frontY: number;
  margin: number;
  radius: number;
  floorGap: number;
}

function measure(vw: number, vh: number, n: number, small: boolean): Layout {
  const W = small ? Math.min(vw * 0.42, vh * 0.36, 220) : clamp(vw * 0.17, 210, 340);
  const H = (W * 4) / 3;
  const gap = W * (small ? 0.16 : 0.2);
  const Wr = small ? Math.min(vw * 0.6, vh * 0.42, 290) : clamp(Math.min(vw * 0.17, vh * 0.29), 200, 330);
  return {
    vw,
    vh,
    dist: vh / 2 / Math.tan((FOV * Math.PI) / 360),
    W,
    H,
    cellW: W + gap,
    cellH: H + gap,
    Wr,
    Hr: (Wr * 4) / 3,
    R: Math.max((n * Wr * 1.45) / (2 * Math.PI), Wr * 1.2),
    frontY: vh * (small ? 0.02 : -0.015),
    margin: small ? 26 : 40,
    radius: small ? 8 : 10,
    floorGap: small ? 4 : 6,
  };
}

/** Columns and rows the wall needs to cover the screen, even when zoomed out while dragging. */
function gridFor(L: Layout) {
  let cols = Math.ceil(L.vw / 0.8 / L.cellW) + 3;
  if (cols % 2) cols++; // the brick offset only lines up across the seam with an even count
  const rows = Math.ceil(L.vh / 0.8 / L.cellH) + 3;
  return { cols, rows };
}

/**
 * Which dish goes in which cell. Filled from the middle outwards so the first screen shows
 * every dish, with dish 0 dead centre, and no dish ever sits next to itself (the grid wraps).
 */
function assign(cols: number, rows: number, n: number, pos: (c: number, r: number) => [number, number]) {
  const cells: { c: number; r: number; d: number }[] = [];
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const [x, y] = pos(c, r);
      cells.push({ c, r, d: x * x + y * y });
    }
  cells.sort((a, b) => a.d - b.d);
  const grid = new Int16Array(cols * rows).fill(-1);
  const at = (c: number, r: number) => grid[(((c % cols) + cols) % cols) * rows + (((r % rows) + rows) % rows)];
  const counts = new Array(n).fill(0);
  for (const cell of cells) {
    let best = 0;
    let bestScore = Infinity;
    for (let d = 0; d < n; d++) {
      let s = counts[d] * 2 + d * 0.01;
      for (let dc = -2; dc <= 2; dc++)
        for (let dr = -2; dr <= 2; dr++) {
          if ((dc || dr) && at(cell.c + dc, cell.r + dr) === d) s += Math.abs(dc) < 2 && Math.abs(dr) < 2 ? 1000 : 6;
        }
      if (s < bestScore) {
        bestScore = s;
        best = d;
      }
    }
    grid[cell.c * rows + cell.r] = best;
    counts[best]++;
  }
  return { grid, first: cells[0] };
}

interface Uniforms {
  [k: string]: { value: unknown };
  uPlane: { value: Vector2 };
  uAlpha: { value: number };
  uHover: { value: number };
  uDim: { value: number };
  uFog: { value: number };
  uShadow: { value: number };
  uVel: { value: Vector2 };
  uShift: { value: Vector2 };
  uMouse: { value: Vector2 };
  uMargin: { value: number };
  uRadius: { value: number };
}

interface Tile {
  mesh: Mesh;
  u: Uniforms;
  dish: number;
  col: number;
  row: number;
  primary: boolean;
  // Wall <-> ring morph, per tile so it can be staggered.
  mFrom: number;
  mTo: number;
  mStart: number;
  mDelay: number;
  m: number;
  // Intro burst.
  iDelay: number;
  iRot: [number, number, number];
  iOff: [number, number];
  rand: number;
  hover: number;
  dim: number;
  x: number;
  y: number;
}

export async function createStage(o: StageOptions): Promise<Stage> {
  const n = o.dishes.length;
  const { canvas, small } = o;
  const stageEl = canvas.parentElement as HTMLElement;

  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 20000);

  /* ---------- Load the photos ---------- */
  let loaded = 0;
  const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const textures = await Promise.all(
    o.dishes.map(async (d) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = d.tex;
      await img.decode();
      const t = new Texture(img);
      t.colorSpace = NoColorSpace;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.anisotropy = maxAniso;
      t.needsUpdate = true;
      renderer.initTexture(t);
      o.onProgress?.(++loaded / n);
      return t;
    }),
  ).catch((err) => {
    renderer.dispose();
    renderer.forceContextLoss();
    throw err;
  });

  /* ---------- Shared state ---------- */
  let L = measure(stageEl.clientWidth || innerWidth, stageEl.clientHeight || innerHeight, n, small);
  let cols = 0;
  let rows = 0;
  let mode: Mode = o.mode;
  const off = new Vector2(); // where the wall is
  const target = new Vector2(); // where it is headed
  const prevOff = new Vector2();
  const vel = new Vector2(); // px per second, smoothed
  let ringAngle = 0;
  let ringTarget = 0;
  let prevRing = 0;
  let ringVel = 0;
  let tilt = TILT;
  let zoom = 1;
  let bend = 0;
  let time = 0;
  let introStart = Infinity;
  let modeSwitchAt = -Infinity;
  let previewDish: number | null = null;
  let hidden = false;
  let active: Tile | null = null;
  let hovered: Tile | null = null;
  let focused = 0;
  let lastInput = performance.now();
  let paused = false;
  let raf = 0;
  let last = performance.now();
  let lost = false;
  const mouse = new Vector2(0.5, 0.5); // normalised, for ring tilt and parallax
  const camOff = new Vector2();

  const bg = new Vector3();
  const sharedBg = { value: bg };
  const sharedTime = { value: 0 };
  const sharedBend = { value: 0 };
  let shadowStrength = 0.25;
  const readTheme = () => {
    const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
    if (m) bg.set(+m[0] / 255, +m[1] / 255, +m[2] / 255);
    const dark = bg.x + bg.y + bg.z < 1.2;
    shadowStrength = dark ? 0.6 : 0.26;
  };
  readTheme();
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  darkQuery.addEventListener('change', () => requestAnimationFrame(readTheme));

  const geo = new PlaneGeometry(1, 1, small ? 8 : 12, small ? 10 : 16);
  const makeMaterial = (dish: number) =>
    new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uTex: { value: textures[dish] },
        uImage: { value: new Vector2(o.dishes[dish].w, o.dishes[dish].h) },
        uPlane: { value: new Vector2(L.W, L.H) },
        uMargin: { value: L.margin },
        uRadius: { value: L.radius },
        uAlpha: { value: 0 },
        uHover: { value: 0 },
        uDim: { value: 0 },
        uFog: { value: 0 },
        uReflect: { value: 0 },
        uShadow: { value: shadowStrength },
        uBg: sharedBg,
        uVel: { value: new Vector2() },
        uShift: { value: new Vector2() },
        uMouse: { value: new Vector2(0.5, 0.5) },
        uTime: sharedTime,
        uBend: sharedBend,
      },
    });

  /* ---------- Wall tiles ---------- */
  let tiles: Tile[] = [];
  const baseX = (c: number) => (c - (cols - 1) / 2) * L.cellW;
  const baseY = (c: number, r: number) => -(r - (rows - 1) / 2) * L.cellH - (c % 2 ? L.cellH / 2 : 0);

  function build() {
    const g = gridFor(L);
    cols = g.cols;
    rows = g.rows;
    for (const t of tiles) {
      scene.remove(t.mesh);
      (t.mesh.material as ShaderMaterial).dispose();
    }
    const { grid, first } = assign(cols, rows, n, (c, r) => [baseX(c), baseY(c, r)]);
    tiles = [];
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++) {
        const dish = grid[c * rows + r];
        const mat = makeMaterial(dish);
        const mesh = new Mesh(geo, mat);
        mesh.frustumCulled = false; // the bend moves vertices, so let the GPU clip instead
        scene.add(mesh);
        tiles.push({
          mesh,
          u: mat.uniforms as Uniforms,
          dish,
          col: c,
          row: r,
          primary: false,
          mFrom: 0,
          mTo: 0,
          mStart: 0,
          mDelay: 0,
          m: 0,
          iDelay: 0,
          iRot: [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.9],
          iOff: [(Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120],
          rand: Math.random(),
          hover: 0,
          dim: 0,
          x: 0,
          y: 0,
        });
      }
    // Start with dish 0 in the middle of the screen.
    off.set(-baseX(first.c), -baseY(first.c, first.r));
    target.copy(off);
    prevOff.copy(off);
    pickPrimaries();
    const m = mode === 'ring' ? 1 : 0;
    for (const t of tiles) t.mFrom = t.mTo = t.m = m;
    if (mode === 'ring') ringAngle = ringTarget = prevRing = -focused * stepA;
  }

  const stepA = (Math.PI * 2) / n;

  /** The instance of each dish nearest the middle of the screen; these are the ones that join the ring. */
  function pickPrimaries() {
    const best: (Tile | null)[] = new Array(n).fill(null);
    const bestD = new Array(n).fill(Infinity);
    for (const t of tiles) {
      t.primary = false;
      const x = wrap(baseX(t.col) + off.x, cols * L.cellW);
      const y = wrap(baseY(t.col, t.row) + off.y, rows * L.cellH);
      const d = x * x + y * y;
      if (d < bestD[t.dish]) {
        bestD[t.dish] = d;
        best[t.dish] = t;
      }
    }
    best.forEach((t) => t && (t.primary = true));
    return best;
  }
  let primaries: (Tile | null)[] = [];

  /* ---------- Floor reflections for the ring ---------- */
  const reflections = o.dishes.map((_, dish) => {
    const mat = makeMaterial(dish);
    mat.uniforms.uReflect.value = 1;
    mat.uniforms.uShadow.value = 0;
    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, u: mat.uniforms as Uniforms };
  });

  /* ---------- Sizing ---------- */
  function resize() {
    const w = stageEl.clientWidth || innerWidth;
    const h = stageEl.clientHeight || innerHeight;
    L = measure(w, h, n, small);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const g = gridFor(L);
    // Only rebuild when the wall has to grow, so a phone's address bar can't reshuffle it.
    if (g.cols > cols || g.rows > rows) {
      build();
      primaries = pickPrimaries();
    }
  }
  resize();
  primaries = pickPrimaries();

  /* ---------- Poses ---------- */
  const ringPose = (dish: number, reflect: boolean) => {
    const th = normAngle(dish * stepA + ringAngle);
    const ly = reflect ? -(L.Hr + 2 * L.floorGap) : 0;
    const lx = L.R * Math.sin(th);
    const lz = L.R * Math.cos(th);
    const cy = L.frontY + L.R * Math.sin(tilt);
    const cz = -L.R * Math.cos(tilt);
    return {
      x: lx,
      y: cy + ly * Math.cos(tilt) - lz * Math.sin(tilt),
      z: cz + ly * Math.sin(tilt) + lz * Math.cos(tilt),
      th,
      front: Math.cos(th),
    };
  };

  // Ring photos float up and down a little, each on its own beat.
  const bob = (dish: number) => (o.calm ? 0 : Math.sin(time * 1.1 + dish * 1.7) * (small ? 3 : 5));

  const frontDish = (angle = ringAngle) => (((Math.round(-angle / stepA) % n) + n) % n);

  function modeProgress(t: Tile, now: number) {
    const p = clamp((now - t.mStart - t.mDelay) / MODE_DUR, 0, 1);
    t.m = lerp(t.mFrom, t.mTo, easeInOutCubic(p));
    return t.m;
  }

  /* ---------- Input ---------- */
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let pointerIn = false;
  let px = 0;
  let py = 0;
  let down: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
  let samples: { t: number; x: number; y: number }[] = [];
  let snapTimer = 0;
  let cursor: Cursor = 'drag';

  const interact = () => {
    lastInput = performance.now();
    o.onInteract?.();
  };
  const setCursor = (c: Cursor) => {
    if (c !== cursor) o.onCursor?.((cursor = c));
  };

  let canvasRect = canvas.getBoundingClientRect();
  const ndc = new Vector2();
  const ro = new Vector3();
  const rd = new Vector3();
  const p0 = new Vector3();
  const p1 = new Vector3();
  const inv = new Matrix4();

  function pick(clientX: number, clientY: number) {
    ndc.set(((clientX - canvasRect.left) / canvasRect.width) * 2 - 1, -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1);
    ro.setFromMatrixPosition(camera.matrixWorld);
    rd.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(ro).normalize();
    let best: Tile | null = null;
    let bestS = Infinity;
    let hu = 0.5;
    let hv = 0.5;
    for (const t of tiles) {
      if (!t.mesh.visible || t.u.uAlpha.value < 0.5) continue;
      inv.copy(t.mesh.matrixWorld).invert();
      p0.copy(ro).applyMatrix4(inv);
      p1.copy(ro).add(rd).applyMatrix4(inv);
      const dz = p1.z - p0.z;
      if (Math.abs(dz) < 1e-9) continue;
      const s = -p0.z / dz;
      if (s <= 0 || s >= bestS) continue;
      const sx = t.mesh.scale.x;
      const sy = t.mesh.scale.y;
      const lx = (p0.x + (p1.x - p0.x) * s) * sx;
      const ly = (p0.y + (p1.y - p0.y) * s) * sy;
      const w = sx - 2 * L.margin;
      const h = sy - 2 * L.margin;
      if (Math.abs(lx) > w / 2 || Math.abs(ly) > h / 2) continue;
      bestS = s;
      best = t;
      hu = lx / w + 0.5;
      hv = ly / h + 0.5;
    }
    return best ? { tile: best, u: hu, v: hv } : null;
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0 || down) return;
    canvasRect = canvas.getBoundingClientRect();
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    px = e.clientX;
    py = e.clientY;
    interact();
  }

  function onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      mouse.set(e.clientX / L.vw, e.clientY / L.vh);
    }
    if (!down || e.pointerId !== down.id) {
      px = e.clientX;
      py = e.clientY;
      return;
    }
    const dx = e.clientX - px;
    const dy = e.clientY - py;
    px = e.clientX;
    py = e.clientY;
    if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > SLOP) {
      down.moved = true;
      canvas.setPointerCapture?.(e.pointerId);
      setCursor('grabbing');
    }
    if (!down.moved) return;
    const now = performance.now();
    samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (samples.length > 2 && now - samples[0].t > 100) samples.shift();
    if (mode === 'wall') {
      target.x += dx / zoom;
      target.y -= dy / zoom;
    } else {
      ringTarget += dx / L.R;
    }
    interact();
  }

  function onUp(e: PointerEvent) {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    const now = performance.now();
    if (d.moved) {
      // Fling: keep going at the release speed and ease to a stop.
      const a = samples[0];
      const b = samples[samples.length - 1];
      const span = (b.t - a.t) / 1000;
      let vx = 0;
      let vy = 0;
      if (span > 0.008 && now - b.t < 80) {
        vx = (b.x - a.x) / span;
        vy = (b.y - a.y) / span;
      }
      if (mode === 'wall') {
        target.x += clamp(vx, -6000, 6000) / FOLLOW / zoom;
        target.y -= clamp(vy, -6000, 6000) / FOLLOW / zoom;
      } else {
        ringTarget += clamp(vx, -5000, 5000) / FOLLOW / L.R;
        snapRing();
      }
      setCursor('drag');
      interact();
      return;
    }
    if (now - d.t > 650) return;
    // A click or tap.
    camera.updateMatrixWorld();
    const hit = pick(e.clientX, e.clientY);
    if (!hit) return;
    if (mode === 'wall') {
      active = hit.tile;
      o.onOpen?.(hit.tile.dish);
    } else if (hit.tile.dish === frontDish(ringTarget)) {
      active = primaries[hit.tile.dish];
      o.onOpen?.(hit.tile.dish);
    } else {
      rotateTo(hit.tile.dish);
    }
    interact();
  }

  function snapRing(dir = 0) {
    // After a scroll, carry on to the next photo in the direction it was heading.
    const k = ringTarget / stepA;
    ringTarget = (dir < 0 ? Math.floor(k + 0.15) : dir > 0 ? Math.ceil(k - 0.15) : Math.round(k)) * stepA;
  }

  function rotateTo(dish: number) {
    ringTarget += normAngle(-dish * stepA - ringTarget);
  }

  function onWheel(e: WheelEvent) {
    if (e.ctrlKey) return; // leave pinch-zoom alone
    e.preventDefault();
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (e.deltaMode === 2) {
      dx *= L.vw;
      dy *= L.vh;
    }
    if (e.shiftKey && !dx) {
      dx = dy;
      dy = 0;
    }
    if (mode === 'wall') {
      target.x -= dx * 0.9;
      target.y += dy * 0.9;
    } else {
      const d = -(dx + dy) * 0.0024;
      ringTarget += d;
      clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => snapRing(Math.sign(d)), 160);
    }
    interact();
  }

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', (e) => {
    if (down && e.pointerId === down.id) {
      down = null;
      setCursor('drag');
    }
  });
  canvas.addEventListener('pointerenter', () => (pointerIn = true));
  canvas.addEventListener('pointerleave', () => (pointerIn = false));
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => down?.moved && e.preventDefault());

  /* ---------- Frame ---------- */
  const v = new Vector3();
  let slowFrames = 0;
  let frameCount = 0;

  function update(now: number, dt: number) {
    time += dt;
    sharedTime.value = time;
    const introP = clamp((now - introStart) / (INTRO_DUR + 500), 0, 1);
    const introDone = introP >= 1;

    // Idle drift, paused while hovering a photo.
    const idle = !o.calm && introDone && !down && now - lastInput > IDLE_AFTER && !hovered && previewDish === null;
    if (idle) {
      const ramp = clamp((now - lastInput - IDLE_AFTER) / 1500, 0, 1);
      if (mode === 'wall') {
        target.x -= 16 * ramp * dt;
        target.y += 10 * ramp * dt;
      } else {
        ringTarget -= 0.11 * ramp * dt;
      }
    }

    // Follow.
    const k = down?.moved ? FOLLOW_DRAG : FOLLOW;
    off.x = damp(off.x, target.x, k, dt);
    off.y = damp(off.y, target.y, k, dt);
    ringAngle = damp(ringAngle, ringTarget, down?.moved ? FOLLOW_DRAG : idle ? 3 : FOLLOW + 1, dt);

    // Velocity drives the bend, the zoom and the colour split.
    if (dt > 0) {
      vel.x = damp(vel.x, (off.x - prevOff.x) / dt, 12, dt);
      vel.y = damp(vel.y, (off.y - prevOff.y) / dt, 12, dt);
      ringVel = damp(ringVel, ((ringAngle - prevRing) / dt) * L.R, 12, dt);
    }
    prevOff.copy(off);
    prevRing = ringAngle;
    const speed = mode === 'wall' ? vel.length() : Math.abs(ringVel);
    const wallness = 1 - clamp(tiles.reduce((s, t) => s + (t.primary ? t.m : 0), 0) / n, 0, 1);

    const zoomTarget = mode === 'wall' ? 1 - (down?.moved ? 0.1 : 0) - Math.min(speed / 4000, 1) * 0.06 : 1;
    zoom = damp(zoom, zoomTarget, 5, dt);
    const introBend = o.calm ? 0 : 3.2e-4 * (1 - easeOutExpo(introP));
    const bendTarget = (Math.min(speed, 3300) * 1.05e-7 + introBend) * wallness;
    bend = damp(bend, bendTarget, 7, dt);
    sharedBend.value = bend;

    // Camera: dips back while switching modes; in the ring it follows the mouse a little.
    const sw = clamp((now - modeSwitchAt) / (MODE_DUR + 300), 0, 1);
    const dip = Math.sin(sw * Math.PI) * L.dist * 0.12;
    const ringness = 1 - wallness;
    const tiltTarget = TILT + (fine ? (mouse.y - 0.5) * 0.1 : 0);
    tilt = damp(tilt, tiltTarget, 3, dt);
    camOff.x = damp(camOff.x, fine ? (mouse.x - 0.5) * 50 * ringness : 0, 3, dt);
    camOff.y = damp(camOff.y, fine ? -(mouse.y - 0.5) * 30 * ringness : 0, 3, dt);
    camera.position.set(camOff.x, camOff.y, L.dist / zoom + dip);
    camera.lookAt(0, 0, -L.R * ringness * 0.5);
    camera.updateMatrixWorld();

    // Poses.
    const PX = cols * L.cellW;
    const PY = rows * L.cellH;
    const ix = introStart === Infinity;
    const velX = clamp(vel.x * 4.8e-6, -0.016, 0.016);
    const velY = clamp(vel.y * 4.8e-6, -0.016, 0.016);
    const ringVelX = clamp(ringVel * 4.8e-6, -0.016, 0.016);
    let nearest: Tile | null = null;
    let nearestD = Infinity;

    for (const t of tiles) {
      const mp = modeProgress(t, now);
      const wx = wrap(baseX(t.col) + off.x, PX);
      const wy = wrap(baseY(t.col, t.row) + off.y, PY);
      const edge = smooth(PX / 2, PX / 2 - L.cellW * 0.75, Math.abs(wx)) * smooth(PY / 2, PY / 2 - L.cellH * 0.75, Math.abs(wy));
      let x = wx;
      let y = wy;
      let z = 0;
      let rx = 0;
      let ry = 0;
      let rz = 0;
      let w = L.W;
      let h = L.H;
      let alpha = edge;
      let fog = 0;
      let shadow = shadowStrength;
      let shiftX = clamp((-wx / (L.vw / 2)) * 0.035, -0.05, 0.05);
      let shiftY = clamp((-wy / (L.vh / 2)) * 0.035, -0.05, 0.05);
      let vx = velX;
      let vy = velY;

      if (mp > 0) {
        if (t.primary) {
          const r = ringPose(t.dish, false);
          x = lerp(wx, r.x, mp);
          y = lerp(wy, r.y + bob(t.dish), mp);
          z = r.z * mp + Math.sin(mp * Math.PI) * L.dist * 0.18;
          rx = tilt * mp;
          ry = r.th * mp;
          w = lerp(L.W, L.Wr, mp);
          h = lerp(L.H, L.Hr, mp);
          alpha = lerp(edge, 1, mp);
          fog = RING_FOG * smooth(0.97, -1, r.front) * mp;
          shadow = shadowStrength * (1 - mp);
          shiftX = lerp(shiftX, -Math.sin(r.th) * 0.04, mp);
          shiftY = lerp(shiftY, 0, mp);
          vx = lerp(velX, ringVelX * Math.max(r.front, 0), mp);
          vy = lerp(velY, 0, mp);
        } else {
          // Everything else flies past the camera and away.
          const spread = 1 + mp * 1.2;
          x = wx * spread;
          y = wy * spread;
          z = mp * L.dist * 0.62;
          rz = (t.rand - 0.5) * mp * 0.8;
          alpha = edge * (1 - mp) * (1 - mp);
        }
      }

      // Intro burst from the middle.
      let s = 1;
      if (ix) alpha = 0;
      else if (!introDone) {
        const p = clamp((now - introStart - t.iDelay) / INTRO_DUR, 0, 1);
        if (o.calm) alpha *= p;
        else {
          const e = easeOutExpo(p);
          x = lerp(t.iOff[0], x, e);
          y = lerp(t.iOff[1], y, e);
          z = lerp(-L.dist * 0.9, z, e);
          rx = lerp(t.iRot[0], rx, e);
          ry = lerp(t.iRot[1], ry, e);
          rz = lerp(t.iRot[2], rz, e);
          s = lerp(0.3, 1, e);
          alpha *= clamp(p * 5, 0, 1);
        }
      }

      // The photo under the cursor lifts and leans towards it like a card being pressed.
      if (t.hover > 0.001) {
        const mu = t.u.uMouse.value;
        z += t.hover * (small ? 0 : 34);
        rx -= (mu.y - 0.5) * 0.2 * t.hover;
        ry += (mu.x - 0.5) * 0.2 * t.hover;
      }
      t.x = x;
      t.y = y;
      t.mesh.position.set(x, y, z);
      t.mesh.rotation.set(rx, ry, rz);
      t.mesh.scale.set((w + 2 * L.margin) * s, (h + 2 * L.margin) * s, 1);
      const u = t.u;
      u.uPlane.value.set(w * s, h * s);
      u.uMargin.value = L.margin * s;
      u.uRadius.value = L.radius * s;
      u.uFog.value = fog;
      u.uShadow.value = shadow;
      u.uShift.value.set(shiftX, shiftY);
      u.uVel.value.set(vx, vy);
      u.uAlpha.value = hidden && t === active ? 0 : alpha;
      t.mesh.visible = u.uAlpha.value > 0.003;

      // The open photo is hidden while the viewer shows it, but it still counts as current.
      if (mode === 'wall' && alpha > 0.003 && mp < 0.5) {
        const d = x * x + y * y;
        if (d < nearestD) {
          nearestD = d;
          nearest = t;
        }
      }
    }

    // Reflections sit under the ring tiles once they have landed.
    reflections.forEach((r, dish) => {
      const t = primaries[dish];
      const mp = t ? t.m : 0;
      const a = Math.pow(mp, 4) * (ix ? 0 : 1) * (introDone || o.calm ? 1 : introP);
      r.mesh.visible = a > 0.003;
      if (!r.mesh.visible) return;
      const p = ringPose(dish, true);
      r.mesh.position.set(p.x, p.y - bob(dish), p.z);
      r.mesh.rotation.set(tilt, p.th, 0);
      r.mesh.scale.set(L.Wr + 2 * L.margin, L.Hr + 2 * L.margin, 1);
      r.u.uPlane.value.set(L.Wr, L.Hr);
      r.u.uMargin.value = L.margin;
      r.u.uRadius.value = L.radius;
      r.u.uFog.value = RING_FOG * smooth(0.97, -1, p.front);
      r.u.uAlpha.value = hidden && t === active ? 0 : a;
      r.u.uShift.value.set(-Math.sin(p.th) * 0.04, 0);
      r.u.uDim.value = t ? t.dim : 0;
    });

    // Hover.
    scene.updateMatrixWorld();
    let hit: ReturnType<typeof pick> = null;
    if (fine && pointerIn && !down?.moved && !paused && introDone) hit = pick(px, py);
    hovered = hit && (mode === 'wall' || hit.tile.dish === frontDish(ringTarget)) ? hit.tile : null;
    if (!down?.moved) setCursor(hovered ? 'view' : 'drag');

    for (const t of tiles) {
      t.hover = damp(t.hover, t === hovered ? 1 : 0, 9, dt);
      let dimT = 0;
      if (previewDish !== null) dimT = t.dish === previewDish ? 0 : 1;
      else if (hovered && mode === 'wall') dimT = t === hovered ? 0 : 0.3;
      t.dim = damp(t.dim, dimT, 8, dt);
      t.u.uHover.value = t.hover;
      t.u.uDim.value = t.dim;
      if (t === hovered && hit) {
        const mu = t.u.uMouse.value;
        mu.x = damp(mu.x, hit.u, 14, dt);
        mu.y = damp(mu.y, hit.v, 14, dt);
      }
    }

    // Which dish is "current".
    const f = mode === 'ring' ? frontDish() : hovered ? hovered.dish : nearest ? nearest.dish : focused;
    if (f !== focused) {
      focused = f;
      o.onFocus?.(f);
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function loop(now: number) {
    raf = 0;
    if (lost) return;
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    update(now, dt);
    render();

    // Drop the resolution if this device is struggling.
    if (now - introStart > INTRO_DUR + 800) {
      frameCount++;
      if (dt > 0.034) slowFrames++;
      if (frameCount >= 90) {
        if (slowFrames > 45 && dpr > 1) {
          dpr = Math.max(1, dpr - 0.25);
          renderer.setPixelRatio(dpr);
          renderer.setSize(L.vw, L.vh, false);
        }
        frameCount = 0;
        slowFrames = 0;
      }
    }
    if (!paused && !document.hidden) raf = requestAnimationFrame(loop);
  }

  const kick = () => {
    if (!raf && !paused && !lost && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  document.addEventListener('visibilitychange', kick);
  new ResizeObserver(() => {
    resize();
    canvasRect = canvas.getBoundingClientRect();
    if (paused) {
      update(performance.now(), 0);
      render();
    }
  }).observe(stageEl);
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
    cancelAnimationFrame(raf);
    o.onLost?.();
  });

  // Compile everything up front so the first frames don't stutter.
  renderer.compile(scene, camera);
  update(performance.now(), 0);
  render();
  kick();

  function nearestOf(dish: number, from: Vector2) {
    let best: Tile | null = null;
    let bd = Infinity;
    let bx = 0;
    let by = 0;
    for (const t of tiles) {
      if (t.dish !== dish) continue;
      const x = wrap(baseX(t.col) + from.x, cols * L.cellW);
      const y = wrap(baseY(t.col, t.row) + from.y, rows * L.cellH);
      const d = x * x + y * y;
      if (d < bd) {
        bd = d;
        best = t;
        bx = x;
        by = y;
      }
    }
    return { tile: best, x: bx, y: by };
  }

  function rectOf(t: Tile): TileRect {
    t.mesh.updateMatrixWorld();
    const sx = t.mesh.scale.x;
    const sy = t.mesh.scale.y;
    const w = t.u.uPlane.value.x;
    const h = t.u.uPlane.value.y;
    const hw = w / 2 / sx;
    const hh = h / 2 / sy;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [cx, cy] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]) {
      v.set(cx, cy, 0).applyMatrix4(t.mesh.matrixWorld);
      v.z -= (v.x * v.x + v.y * v.y) * bend;
      v.project(camera);
      const sxp = ((v.x + 1) / 2) * L.vw;
      const syp = ((1 - v.y) / 2) * L.vh;
      minX = Math.min(minX, sxp);
      maxX = Math.max(maxX, sxp);
      minY = Math.min(minY, syp);
      maxY = Math.max(maxY, syp);
    }
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left + minX,
      y: r.top + minY,
      w: maxX - minX,
      h: maxY - minY,
      zoom: 0.88 - 0.05 * t.hover,
      radius: L.radius * ((maxX - minX) / w),
    };
  }

  function stopVelocity() {
    prevOff.copy(off);
    prevRing = ringAngle;
    vel.set(0, 0);
    ringVel = 0;
  }

  function refresh() {
    if (paused) {
      update(performance.now(), 0);
      render();
    } else kick();
  }

  const api: Stage = {
    get mode() {
      return mode;
    },
    get focused() {
      return focused;
    },
    intro() {
      introStart = performance.now();
      const maxD = Math.hypot(L.vw, L.vh) / 2;
      for (const t of tiles) {
        const d = Math.hypot(wrap(baseX(t.col) + off.x, cols * L.cellW), wrap(baseY(t.col, t.row) + off.y, rows * L.cellH));
        t.iDelay = o.calm ? 0 : clamp(d / maxD, 0, 1.4) * 420 + t.rand * 90;
      }
      lastInput = performance.now();
      kick();
    },
    setMode(m: Mode) {
      if (m === mode) return;
      const now = performance.now();
      if (m === 'ring') {
        primaries = pickPrimaries();
        ringAngle = ringTarget = prevRing = -focused * stepA;
      } else {
        // Land back on the wall with the dish that was in front of the ring in the middle.
        const t = primaries[frontDish(ringTarget)];
        if (t) {
          target.x -= wrap(baseX(t.col) + target.x, cols * L.cellW);
          target.y -= wrap(baseY(t.col, t.row) + target.y, rows * L.cellH);
        }
      }
      mode = m;
      modeSwitchAt = now;
      const maxD = Math.hypot(L.vw, L.vh) / 2;
      for (const t of tiles) {
        modeProgress(t, now);
        t.mFrom = t.m;
        t.mTo = m === 'ring' ? 1 : 0;
        t.mStart = now;
        const d = clamp(Math.hypot(t.x, t.y) / maxD, 0, 1.5);
        if (t.primary) {
          const slot = (((t.dish - focused) % n) + n) % n;
          const fromFront = Math.min(slot, n - slot);
          t.mDelay = (m === 'ring' ? 120 : 0) + fromFront * 45;
        } else {
          t.mDelay = m === 'ring' ? d * 220 : 260 + d * 300;
        }
      }
      active = null;
      hovered = null;
      lastInput = now;
      kick();
    },
    preview(dish: number | null) {
      previewDish = dish;
      if (dish !== null) api.focusDish(dish);
      lastInput = performance.now();
      kick();
    },
    focusDish(dish: number, instant = false) {
      if (mode === 'wall') {
        const near = nearestOf(dish, target);
        target.x -= near.x;
        target.y -= near.y;
        if (instant) off.copy(target);
        active = near.tile;
      } else {
        ringTarget += normAngle(-dish * stepA - ringTarget);
        if (instant) ringAngle = ringTarget;
        active = primaries[dish];
      }
      if (instant) stopVelocity();
      lastInput = performance.now();
      refresh();
    },
    nudge(c: number, r: number) {
      if (mode !== 'wall') return;
      // Land the nearest photo in the middle after moving one cell.
      const cx = target.x - c * L.cellW;
      const cy = target.y + r * L.cellH;
      let best = Infinity;
      let bx = 0;
      let by = 0;
      for (const t of tiles) {
        const x = wrap(baseX(t.col) + cx, cols * L.cellW);
        const y = wrap(baseY(t.col, t.row) + cy, rows * L.cellH);
        const d = x * x + y * y;
        if (d < best) {
          best = d;
          bx = x;
          by = y;
        }
      }
      target.set(cx - bx, cy - by);
      lastInput = performance.now();
      kick();
    },
    step(dir: 1 | -1) {
      if (mode === 'ring') {
        ringTarget = Math.round(ringTarget / stepA) * stepA - dir * stepA;
        lastInput = performance.now();
        kick();
      } else api.nudge(dir, 0);
    },
    openFocused() {
      if (mode === 'ring') {
        const d = frontDish(ringTarget);
        active = primaries[d];
        o.onOpen?.(d);
      } else {
        const near = nearestOf(focused, off);
        active = near.tile;
        o.onOpen?.(focused);
      }
    },
    rect(dish: number) {
      let t = active && active.dish === dish ? active : null;
      if (!t) t = mode === 'ring' ? primaries[dish] : nearestOf(dish, off).tile;
      if (!t) return null;
      active = t;
      const r = rectOf(t);
      if (r.x + r.w < 0 || r.y + r.h < 0 || r.x > innerWidth || r.y > innerHeight) return null;
      return r;
    },
    hide(dish: number | null) {
      hidden = dish !== null;
      if (dish !== null && (!active || active.dish !== dish)) api.rect(dish);
      refresh();
    },
    setPaused(p: boolean) {
      paused = p;
      if (!p) kick();
    },
  };
  return api;
}
