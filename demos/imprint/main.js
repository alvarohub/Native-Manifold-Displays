// Demo D2 — drawing on a surface. three.js host for manifold-core + manifold-ink.
import { Surface, meshStats } from '../../manifold-core/index.js';
import {
  parseSVGPath,
  contoursFromCommands,
  contoursBBox,
  transformContours,
  polylineLength,
  circleContour,
  LSYSTEMS,
  lsystemContours,
  makeFrame,
  rotateFrame,
  translateFrame,
  frameFromPoint,
  imprint,
  liftContour,
} from '../../manifold-ink/index.js';
import { createViewer, surfaceMeshes, pointerRay, SegmentBuffer, download } from '../shared/viewer.js';
import {
  MESHES,
  fillMeshSelect,
  importMeshFile,
  describeImport,
  wireMeshImport,
  setCustomOption,
} from '../shared/meshes.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(
  [
    'mesh',
    'subdiv',
    'surfOpacity',
    'wire',
    'source',
    'text',
    'font',
    'svg',
    'density',
    'mode',
    'size',
    'angle',
    'nudgeL',
    'nudgeR',
    'nudgeU',
    'nudgeD',
    'animate',
    'showGap',
    'showFrame',
    'lineOpacity',
    'exportJson',
    'exportObj',
    'readout',
    'panel',
    'collapse',
    'loadMesh',
    'loadFont',
    'lsys',
    'lsysIter',
    'lsysAngle',
  ].map((id) => [id, $(id)]),
);
const bindRange = (input, fmt = (v) => v) => {
  const out = $(input.id + 'Out');
  const sync = () => (out.textContent = fmt(parseFloat(input.value)));
  input.addEventListener('input', sync);
  sync();
};
bindRange(ui.subdiv);
bindRange(ui.surfOpacity, (v) => v.toFixed(2));
bindRange(ui.density);
bindRange(ui.size, (v) => v.toFixed(2));
bindRange(ui.angle, (v) => `${v}°`);
bindRange(ui.lineOpacity, (v) => v.toFixed(2));
bindRange(ui.lsysIter);
bindRange(ui.lsysAngle, (v) => `${v}°`);
for (const k of Object.keys(LSYSTEMS)) {
  const o = document.createElement('option');
  o.value = k;
  o.textContent = k;
  ui.lsys.appendChild(o);
}
const syncLsysDefaults = () => {
  const p = LSYSTEMS[ui.lsys.value];
  ui.lsysIter.value = p.iterations;
  ui.lsysAngle.value = p.angle;
  ui.lsysIter.dispatchEvent(new Event('input'));
  ui.lsysAngle.dispatchEvent(new Event('input'));
};
syncLsysDefaults();
ui.collapse.onclick = () => {
  ui.panel.classList.toggle('collapsed');
  ui.collapse.textContent = ui.panel.classList.contains('collapsed') ? '+' : '–';
};
if (window.innerWidth < 900) ui.collapse.click();

// ---------------------------------------------------------------- meshes
let customMesh = null;
let importNote = '';
fillMeshSelect(ui.mesh);

// ---------------------------------------------------------------- scene
const V = createViewer($('app'));
const { THREE, scene, camera, renderer, controls } = V;
const COLORS = { turtle: 0xffd27b, exp: 0x7be0ff, fermi: 0x9dff7b, projection: 0xff8fd4 };
const buffers = Object.fromEntries(Object.entries(COLORS).map(([k, c]) => [k, new SegmentBuffer(scene, c)]));
const gapBuffer = new SegmentBuffer(scene, 0xff4d4d, 2000);
const frameBuffer = new SegmentBuffer(scene, 0xffffff, 64);
const anchorDot = new THREE.Mesh(
  new THREE.SphereGeometry(0.02, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
scene.add(anchorDot);

let surface = null;
let solid = null;
let wire = null;
let frame = null;
let contours = []; // planar, normalised to unit width, centred
let font = null;
let lastResult = null;
let animating = false;
let dirty = true;

// ---------------------------------------------------------------- surface
function buildSurface() {
  const key = ui.mesh.value;
  const d = parseInt(ui.subdiv.value, 10);
  const mesh = key === 'custom' && customMesh ? customMesh : MESHES[key].build(d);
  surface = Surface.fromMesh(mesh, { name: key });
  if (solid) {
    scene.remove(solid);
    scene.remove(wire);
  }
  ({ solid, wire } = surfaceMeshes(surface));
  scene.add(solid, wire);
  applyLook();
  // default anchor: the point facing the camera, heading = screen-right so text reads left to right
  const c = camera.position;
  const view = [-c.x, -c.y, -c.z];
  const right = [view[1] * 1 - view[2] * 0, view[2] * 0 - view[0] * 1, 0]; // view × up(z)
  const hit = surface.raycast([c.x, c.y, c.z], view) ?? surface.centroid(0);
  frame = frameFromPoint(surface, hit, right, parseFloat(ui.size.value));
  frame = rotateFrame(frame, (parseFloat(ui.angle.value) * Math.PI) / 180);
  dirty = true;
}

function applyLook() {
  const o = parseFloat(ui.surfOpacity.value);
  solid.material.opacity = o;
  solid.material.depthWrite = o > 0.6;
  wire.visible = ui.wire.checked;
  for (const b of Object.values(buffers)) b.opacity = parseFloat(ui.lineOpacity.value);
}

// ---------------------------------------------------------------- drawing source
async function loadFont(url) {
  return new Promise((resolve, reject) => window.opentype.load(url, (err, f) => (err ? reject(err) : resolve(f))));
}

function buildContours() {
  const density = parseInt(ui.density.value, 10);
  let raw = [];
  switch (ui.source.value) {
    case 'text': {
      if (!font) return;
      const cmds = font.getPath(ui.text.value || ' ', 0, 0, 100).commands;
      raw = contoursFromCommands(cmds, { step: 1, flipY: true, curveSegments: 10 });
      break;
    }
    case 'svg': {
      try {
        raw = contoursFromCommands(parseSVGPath(ui.svg.value), { step: 0.01, flipY: true });
      } catch (e) {
        ui.readout.textContent = `SVG error: ${e.message}`;
        return;
      }
      break;
    }
    case 'circle':
      raw = [circleContour(0.5, 256)];
      break;
    case 'lsystem': {
      const p = LSYSTEMS[ui.lsys.value];
      const iterations = Math.min(parseInt(ui.lsysIter.value, 10), p.maxIterations ?? 12);
      raw = lsystemContours({ ...p, iterations, angle: parseFloat(ui.lsysAngle.value) });
      // guard against exponential blow-up: cap total points
      const total = raw.reduce((n, c) => n + c.points.length, 0);
      if (total > 60000) {
        ui.readout.textContent = `L-system too large (${total} points) — lower the iterations`;
        return;
      }
      break;
    }
    case 'grid': {
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const t = -0.5 + i / n;
        raw.push({ points: Array.from({ length: 41 }, (_, k) => [-0.5 + k / 40, t]), closed: false });
        raw.push({ points: Array.from({ length: 41 }, (_, k) => [t, -0.5 + k / 40]), closed: false });
      }
      break;
    }
  }
  if (!raw.length) return;
  // normalise: centre on the bbox, unit width; then resample to the requested total point count
  const bb = contoursBBox(raw);
  const s = 1 / (bb.width || 1);
  let norm = transformContours(raw, { dx: -bb.cx, dy: -bb.cy, scale: s });
  const total = norm.reduce((L, c) => L + polylineLength(c.points, c.closed), 0);
  const step = total / Math.max(10, density);
  // L-systems are exact turtle programs: keep their vertices (corners) instead of resampling
  if (ui.source.value !== 'lsystem') norm = norm.map((c) => contoursFromCommands(toCommands(c), { step })[0] ?? c);
  contours = norm;
  dirty = true;
}

function toCommands(c) {
  const cmds = [{ type: 'M', x: c.points[0][0], y: c.points[0][1] }];
  for (let i = 1; i < c.points.length; i++) cmds.push({ type: 'L', x: c.points[i][0], y: c.points[i][1] });
  if (c.closed) cmds.push({ type: 'Z' });
  return cmds;
}

// ---------------------------------------------------------------- imprint + render
function lift(p, amount = 0.004) {
  const q = surface.to3D(p);
  const n = surface.normal(p.faceId);
  return [q[0] + n[0] * amount, q[1] + n[1] * amount, q[2] + n[2] * amount];
}

function redraw() {
  if (!surface || !contours.length) return;
  const modes = ui.mode.value === 'all' ? Object.keys(COLORS) : [ui.mode.value];
  lastResult = {};
  gapBuffer.begin();
  let gapSum = 0;
  let gapCount = 0;
  let dropped = 0;
  const t0 = performance.now();
  for (const mode of Object.keys(COLORS)) {
    const buf = buffers[mode];
    if (!modes.includes(mode)) {
      buf.visible = false;
      continue;
    }
    buf.visible = true;
    const res = imprint(surface, contours, frame, mode);
    lastResult[mode] = res;
    buf.begin();
    for (const c of res.contours) {
      const pts = c.points;
      if (mode === 'projection') dropped += c.planar.points.length - pts.length;
      for (let i = 1; i < pts.length; i++) buf.seg(lift(pts[i - 1]), lift(pts[i]));
      if (c.closed && pts.length > 2) buf.seg(lift(pts[pts.length - 1]), lift(pts[0]));
      if (mode === 'turtle' && c.returnsToStart) {
        gapSum += c.gap;
        gapCount++;
        if (ui.showGap.checked) gapBuffer.seg(lift(pts[pts.length - 1], 0.006), lift(pts[0], 0.006));
      }
    }
    buf.end();
  }
  gapBuffer.end();
  const ms = performance.now() - t0;
  // frame gizmo: anchor, heading (long) and perpendicular (short) traced as geodesics
  frameBuffer.begin();
  if (ui.showFrame.checked) {
    const L = 0.25 * frame.scale;
    for (const [dir, len] of [
      [frame.heading, L],
      [[-frame.heading[1], frame.heading[0]], L * 0.5],
    ]) {
      const r = surface.trace(frame.anchor, dir, len);
      for (let i = 1; i < r.polyline.length; i++)
        frameBuffer.seg(lift(r.polyline[i - 1], 0.008), lift(r.polyline[i], 0.008));
    }
  }
  frameBuffer.end();
  anchorDot.position.set(...lift(frame.anchor, 0.01));
  anchorDot.visible = ui.showFrame.checked;
  const st = meshStats(surface.mesh);
  const K = surface.gaussianCurvatureAt(frame.anchor);
  ui.readout.textContent =
    (ui.mesh.value === 'custom' && importNote ? `${importNote}\n` : '') +
    `${surface.name}: F=${st.F} χ=${st.euler}   K at anchor ≈ ${Number.isFinite(K) ? K.toFixed(3) : '–'}\n` +
    `${contours.length} contours, ${contours.reduce((n, c) => n + c.points.length, 0)} points, size ${frame.scale.toFixed(2)}\n` +
    (gapCount ? `turtle closure gap: mean ${(gapSum / gapCount).toFixed(4)} over ${gapCount} closed contours\n` : '') +
    (dropped ? `projection: ${dropped} points missed the surface\n` : '') +
    `imprint ${ms.toFixed(1)} ms`;
  dirty = false;
}

// ---------------------------------------------------------------- interaction
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY, performance.now()]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  const dt = performance.now() - downAt[2];
  downAt = null;
  if (moved > 6 || dt > 400) return;
  const { origin, dir } = pointerRay(e, renderer, camera);
  const hit = surface.raycast(origin, dir);
  if (!hit) return;
  // keep the current heading as a 3D direction so the drawing does not spin when the anchor jumps
  const f = surface.faceById(frame.anchor.faceId);
  const h3 = [0, 1, 2].map((k) => f.u[k] * frame.heading[0] + f.v[k] * frame.heading[1]);
  frame = frameFromPoint(surface, hit, h3, frame.scale);
  dirty = true;
});

const nudge = (dx, dy) => {
  frame = translateFrame(surface, frame, dx, dy);
  dirty = true;
};
ui.nudgeL.onclick = () => nudge(-0.1, 0);
ui.nudgeR.onclick = () => nudge(0.1, 0);
ui.nudgeU.onclick = () => nudge(0, 0.1);
ui.nudgeD.onclick = () => nudge(0, -0.1);
ui.animate.onclick = () => {
  animating = !animating;
  ui.animate.classList.toggle('on', animating);
};
let lastAngle = parseFloat(ui.angle.value);
ui.angle.addEventListener('input', () => {
  const a = parseFloat(ui.angle.value);
  frame = rotateFrame(frame, ((a - lastAngle) * Math.PI) / 180);
  lastAngle = a;
  dirty = true;
});
ui.size.addEventListener('input', () => {
  frame = { ...frame, scale: parseFloat(ui.size.value) };
  dirty = true;
});
ui.mode.onchange = () => (dirty = true);
ui.showGap.onchange = ui.showFrame.onchange = () => (dirty = true);
ui.lineOpacity.addEventListener('input', applyLook);
ui.surfOpacity.addEventListener('input', applyLook);
ui.wire.onchange = applyLook;
ui.mesh.onchange = ui.subdiv.onchange = buildSurface;
ui.source.onchange = ui.density.onchange = buildContours;
ui.lsys.onchange = () => {
  syncLsysDefaults();
  buildContours();
};
ui.lsysIter.onchange = ui.lsysAngle.onchange = buildContours;
ui.text.addEventListener('input', buildContours);
ui.svg.addEventListener('input', buildContours);
ui.font.onchange = async () => {
  font = await loadFont(ui.font.value);
  buildContours();
};

// export
ui.exportJson.onclick = () => {
  if (!lastResult) return;
  const mode = ui.mode.value === 'all' ? 'turtle' : ui.mode.value;
  const res = lastResult[mode];
  const data = {
    surface: surface.name,
    mode,
    frame: { anchor: frame.anchor, heading: frame.heading, scale: frame.scale },
    contours: res.contours.map((c) => ({
      closed: c.closed,
      gap: c.gap,
      samples: liftContour(surface, c.points, c.closed),
    })),
  };
  download(`imprint-${mode}.json`, JSON.stringify(data, null, 1), 'application/json');
};
ui.exportObj.onclick = () => {
  if (!lastResult) return;
  const mode = ui.mode.value === 'all' ? 'turtle' : ui.mode.value;
  const res = lastResult[mode];
  let out = `# Native Manifold Displays imprint (${mode}) on ${surface.name}\n`;
  let base = 1;
  for (const c of res.contours) {
    for (const p of c.points)
      out += `v ${surface
        .to3D(p)
        .map((v) => v.toFixed(6))
        .join(' ')}\n`;
    const idx = c.points.map((_, i) => base + i);
    if (c.closed) idx.push(base);
    out += `l ${idx.join(' ')}\n`;
    base += c.points.length;
  }
  download(`imprint-${mode}.obj`, out, 'text/plain');
};

// file import: mesh (.obj/.stl) or font (.ttf/.otf) via buttons or drag & drop
async function onFile(file) {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.ttf') || name.endsWith('.otf')) {
      font = window.opentype.parse(await file.arrayBuffer());
      const opt = document.createElement('option');
      opt.value = 'custom';
      opt.textContent = file.name;
      ui.font.appendChild(opt);
      ui.font.value = 'custom';
      buildContours();
      return;
    }
    const imported = await importMeshFile(file, 1.3);
    customMesh = imported.mesh;
    importNote = describeImport(imported);
    setCustomOption(ui.mesh, `${file.name} (${imported.report.triangles} tri)`);
    buildSurface();
  } catch (err) {
    importNote = `import failed: ${err.message}`;
    ui.readout.textContent = importNote;
  }
}
wireMeshImport({ button: ui.loadMesh, accept: '.obj,.stl,.ttf,.otf', onFile });
ui.loadFont.onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ttf,.otf';
  input.onchange = () => input.files?.[0] && onFile(input.files[0]);
  input.click();
};

// ---------------------------------------------------------------- loop
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (animating) nudge(0.25 * dt, 0);
  if (dirty) redraw();
  controls.update();
  renderer.render(scene, camera);
}

buildSurface();
loadFont(ui.font.value)
  .then((f) => {
    font = f;
    buildContours();
  })
  .catch((err) => {
    ui.readout.textContent = `font load failed (${err.message}); using circle`;
    ui.source.value = 'circle';
    buildContours();
  });
requestAnimationFrame(loop);
window.__nmd = {
  get surface() {
    return surface;
  },
  get frame() {
    return frame;
  },
  get contours() {
    return contours;
  },
  get result() {
    return lastResult;
  },
  imprint,
  liftContour,
};
