// A small STL viewer for the 3D prints section. The model "prints" itself in
// layer by layer (a clipping plane rising off the bed with a glowing cut face
// and a nozzle tracing over it), shows faint layer lines, and can be scrubbed
// like a slicer preview.

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface PrintViewer {
  /** Total layers at the model's layer height. */
  layers: number;
  /** Show the model up to this fraction of its height (0..1). Stops any running print-in. */
  setLevel(level: number): void;
  /** Run the print-in animation again from the bed. */
  replay(): void;
  setWireframe(on: boolean): void;
}

interface Options {
  url: string;
  layerHeight?: number;
  /** Full orbit controls (detail page) vs. a hands-off spinning preview (cards). */
  interactive?: boolean;
  /** How long the print-in takes, in ms. */
  duration?: number;
  onLevel?(layer: number, layers: number): void;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => 1 - Math.pow(1 - t, 2.2);

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

export async function mountPrint(canvas: HTMLCanvasElement, opts: Options): Promise<PrintViewer> {
  const layerHeight = opts.layerHeight ?? 0.2;
  const duration = opts.duration ?? 3400;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 1.6, 0.8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-1.2, 0.6, -1);
  scene.add(rim);

  // Geometry: STL files are Z-up, the scene is Y-up. Sit the part on the bed at y = 0.
  const geometry = await new STLLoader().loadAsync(opts.url);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const box0 = geometry.boundingBox!;
  const center = box0.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -box0.min.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const height = size.y;
  const layers = Math.max(1, Math.ceil(height / layerHeight - 1e-6));

  // Keep everything below the cut height.
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), height + 1);

  const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05, clippingPlanes: [plane] });
  // Faint layer lines, faded out when they get too fine to draw cleanly.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLayer = { value: layerHeight };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vModelY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvModelY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vModelY;\nuniform float uLayer;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ly = vModelY / uLayer;
        float fade = clamp(1.0 - fwidth(ly) * 1.6, 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - 0.09 * fade * (0.5 + 0.5 * cos(6.2831853 * ly));`,
      );
  };
  const part = new THREE.Mesh(geometry, material);

  // Inside faces, drawn flat and hot, read as the molten top of the part at the cut.
  // Pushed back a touch so it never peeks out along silhouettes.
  const capMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    clippingPlanes: [plane],
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const cap = new THREE.Mesh(geometry, capMaterial);

  const wireMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55, clippingPlanes: [plane] });
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), wireMaterial);
  wire.visible = false;

  scene.add(part, cap, wire);

  // Print bed: a soft plate with a 10 mm grid.
  const span = Math.max(size.x, size.z) * 1.7;
  const bedMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, transparent: true, opacity: 0.5 });
  const bed = new THREE.Mesh(new THREE.CircleGeometry(span * 0.62, 72), bedMaterial);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -0.05;
  const cells = Math.max(4, Math.round(span / 10));
  const grid = new THREE.GridHelper(cells * 10, cells);
  const gridMaterial = grid.material as THREE.LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.22;
  grid.position.y = -0.02;
  scene.add(bed, grid);

  // Nozzle: a little hot-end cone that traces over the current layer.
  const r = geometry.boundingSphere!.radius;
  const nozzleH = r * 0.16;
  const nozzle = new THREE.Group();
  const nozzleMaterial = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.8, roughness: 0.3 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(nozzleH * 0.42, nozzleH, 24), nozzleMaterial);
  cone.rotation.x = Math.PI;
  cone.position.y = nozzleH / 2 + layerHeight;
  const tipMaterial = new THREE.MeshBasicMaterial();
  const tip = new THREE.Mesh(new THREE.SphereGeometry(nozzleH * 0.09, 12, 8), tipMaterial);
  tip.position.y = layerHeight;
  nozzle.add(cone, tip);
  nozzle.visible = false;
  scene.add(nozzle);

  const applyColors = () => {
    const accent = cssColor('--accent', '#2f5d50');
    const text = cssColor('--text', '#1c1b19');
    const bg = cssColor('--bg', '#fbfaf7');
    material.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.12);
    capMaterial.color.set(0xff8a3d);
    tipMaterial.color.set(0xffb070);
    wireMaterial.color.copy(text);
    bedMaterial.color.copy(bg).lerp(text, 0.08);
    gridMaterial.color.copy(text);
  };
  applyColors();
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', () => {
    applyColors();
    requestRender();
  });

  // Camera: three-quarter view from above, framed to the part.
  const target = new THREE.Vector3(0, height * 0.4, 0);
  const fit = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fov = camera.aspect < 1 ? 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect) : vFov;
    const dist = (r * 1.25) / Math.sin(fov / 2);
    if (!controls || !userMoved) {
      camera.position.copy(target).add(new THREE.Vector3(0.62, 0.62, 0.9).normalize().multiplyScalar(dist));
    }
    camera.near = dist / 100;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
  };

  let controls: OrbitControls | null = null;
  let userMoved = false;
  if (opts.interactive) {
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = r * 1.4;
    controls.maxDistance = r * 8;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.addEventListener('start', () => {
      userMoved = true;
      controls!.autoRotate = false;
    });
  }
  const spin = new THREE.Group();
  scene.remove(part, cap, wire, nozzle);
  spin.add(part, cap, wire, nozzle);
  scene.add(spin);
  fit();
  camera.lookAt(target);
  if (controls) {
    controls.target.copy(target);
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 1.2;
    controls.update();
  }

  // Print-in state
  let level = 1;
  let animStart = -1;
  let lastLayer = -1;

  const setCut = (l: number) => {
    level = THREE.MathUtils.clamp(l, 0, 1);
    const y = level * height;
    plane.constant = level >= 1 ? height + 1 : y;
    nozzle.visible = level > 0 && level < 1;
    cap.visible = level < 1 && !wire.visible;
    nozzle.position.y = y;
    const layer = Math.round(level * layers);
    if (layer !== lastLayer) {
      lastLayer = layer;
      opts.onLevel?.(layer, layers);
    }
  };

  const traceNozzle = (t: number) => {
    // Sweep around the part's footprint so it reads as a toolpath.
    const a = t * 0.009;
    nozzle.position.x = Math.cos(a) * size.x * 0.32 + Math.sin(a * 2.3) * size.x * 0.08;
    nozzle.position.z = Math.sin(a) * size.z * 0.32 + Math.cos(a * 1.7) * size.z * 0.08;
  };

  // Render loop: runs only while on screen and something is moving.
  let visible = false;
  let raf = 0;
  let dirty = true;
  let pointer = { x: 0, y: 0 };
  const frame = (t: number) => {
    raf = 0;
    if (animStart >= 0) {
      if (animStart === 0) animStart = t;
      const p = Math.min(1, (t - animStart) / duration);
      setCut(ease(p));
      traceNozzle(t);
      if (p >= 1) animStart = -1;
      dirty = true;
    }
    if (controls) {
      if (controls.update()) dirty = true;
      if (controls.autoRotate) dirty = true;
    } else if (!reduceMotion) {
      spin.rotation.y += 0.004;
      spin.rotation.x += (pointer.y * 0.25 - spin.rotation.x) * 0.06;
      dirty = true;
    }
    if (dirty) renderer.render(scene, camera);
    dirty = false;
    const moving = animStart >= 0 || (controls ? controls.autoRotate : !reduceMotion);
    if (!raf && visible && !document.hidden && moving) raf = requestAnimationFrame(frame);
  };
  function requestRender() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  controls?.addEventListener('change', requestRender);
  if (!controls) {
    canvas.addEventListener('pointermove', (e) => {
      const b = canvas.getBoundingClientRect();
      pointer = { x: (e.clientX - b.left) / b.width - 0.5, y: (e.clientY - b.top) / b.height - 0.5 };
    });
    canvas.addEventListener('pointerleave', () => (pointer = { x: 0, y: 0 }));
  }

  new ResizeObserver(() => {
    fit();
    if (!userMoved) camera.lookAt(target);
    requestRender();
  }).observe(canvas);
  document.addEventListener('visibilitychange', requestRender);

  let started = false;
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible && !started) {
        started = true;
        if (!reduceMotion) {
          setCut(0);
          animStart = 0;
        }
      }
      if (visible) requestRender();
    },
    { threshold: 0.25 },
  ).observe(canvas);

  setCut(1);
  renderer.render(scene, camera);
  canvas.classList.add('ready');

  return {
    layers,
    setLevel(l) {
      animStart = -1;
      setCut(l);
      traceNozzle(performance.now());
      requestRender();
    },
    replay() {
      setCut(0);
      animStart = 0;
      requestRender();
    },
    setWireframe(on) {
      wire.visible = on;
      material.transparent = on;
      material.opacity = on ? 0.18 : 1;
      material.depthWrite = !on;
      cap.visible = !on && level < 1;
      requestRender();
    },
  };
}
