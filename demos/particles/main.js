// Demo D1 — particles on a surface. three.js host for manifold-core + manifold-physics.
import * as THREE from 'three';
import { createViewer } from '../shared/viewer.js';
import { FatSegments } from '../shared/fatLines.js';
import { adoptAppearanceControl } from '../shared/appearance.js';
import { renderSurfaceScene } from '../shared/surfaceRenderer.js';
import { SurfaceView } from '../shared/surfaceView.js';
import { surfacePanel } from '../shared/surfacePanel.js';
import {
  Surface,
  meshStats,
  VertexField,
  geodesicBetween,
  surfaceConnection,
} from '../../manifold-core/index.js';
import { ParticleSystem, pairForce, uniformField } from '../../manifold-physics/index.js';
import {
  MESHES,
  fillMeshSelect,
  importMeshFile,
  describeImport,
  wireMeshImport,
  setCustomOption,
} from '../shared/meshes.js';

// ---------------------------------------------------------------- DOM
const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(
  [
    'mesh',
    'subdiv',
    'count',
    'speed',
    'readBy',
    'trails',
    'trailLen',
    'trailOpacity',
    'linkChords',
    'linkGeo',
    'linkK',
    'linkMax',
    'reseed',
    'run',
    'stepOnce',
    'repel',
    'law',
    'radius',
    'drag',
    'gravity',
    'temp',
    'anneal',
    'readout',
    'panel',
    'collapse',
    'loadMesh',
    'freeMode',
    'clearAll',
    'pStyle',
    'pSize',
    'pColorMode',
    'pColor',
    'trailW',
    'trailC',
    'trailByParticle',
    'chordW',
    'chordC',
    'geoW',
    'geoC',
  ].map((id) => [id, $(id)]),
);
const bindRange = (input, fmt = (v) => v) => {
  const out = $(input.id + 'Out');
  const sync = () => {
    out.textContent = fmt(parseFloat(input.value));
  };
  input.addEventListener('input', sync);
  sync();
};
bindRange(ui.subdiv);
bindRange(ui.count);
bindRange(ui.speed, (v) => v.toFixed(2));
bindRange(ui.trailLen);
bindRange(ui.trailOpacity, (v) => v.toFixed(2));
bindRange(ui.linkK);
bindRange(ui.linkMax, (v) => v.toFixed(2));
bindRange(ui.repel, (v) => v.toFixed(2));
bindRange(ui.radius, (v) => v.toFixed(1));
bindRange(ui.drag, (v) => v.toFixed(2));
bindRange(ui.gravity, (v) => v.toFixed(2));
bindRange(ui.temp, (v) => v.toFixed(2));
bindRange(ui.pSize, (v) => `×${v.toFixed(2)}`);
ui.collapse.onclick = () => {
  ui.panel.classList.toggle('collapsed');
  ui.collapse.textContent = ui.panel.classList.contains('collapsed') ? '+' : '–';
};

// ---------------------------------------------------------------- meshes
let customMesh = null;
let importNote = '';
fillMeshSelect(ui.mesh);

// ---------------------------------------------------------------- three.js scene
const app = $('app');
const { renderer, scene, camera, controls } = createViewer(app);
if (window.innerWidth < 900) ui.collapse.click();

// ---------------------------------------------------------------- state
let surface = null;
const surfaceView = new SurfaceView(scene, renderer, { faces: { source: 'K' } });
surfacePanel(ui.mesh.closest('fieldset'), surfaceView);
let testField = null;
let sys = null;
let pair = null;
let gravityForce = null;
let running = true;
let annealing = null;
const MAX_N = 400;
const MAX_TRAIL_SEGMENTS = 250000;
const FREE_TRAIL = 2000;
const DROPPED = new THREE.Color(0xffd27b);
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const fixedColor = new THREE.Color();

const trailLines = new FatSegments(scene, renderer, { max: MAX_TRAIL_SEGMENTS, vertexColors: true });
const chordLines = new FatSegments(scene, renderer, { max: MAX_N * 12 });
const geoLines = new FatSegments(scene, renderer, { max: 40000 });
const styles = {};
const particlePanel = ui.count.closest('fieldset');
const oldAppearance = ui.pStyle.closest('fieldset');
for (const input of [ui.pStyle, ui.pSize, ui.pColorMode]) {
  particlePanel.insertBefore(input.closest('.row'), ui.trails.closest('.row'));
}
for (const [name, label, colorInput, opacityInput, widthInput, anchor] of [
  ['particle', 'Particles', ui.pColor, null, null, ui.trails],
  ['trail', 'Trails', ui.trailC, ui.trailOpacity, ui.trailW, ui.trailLen],
  ['chord', '3D chords', ui.chordC, null, ui.chordW, ui.linkGeo],
  ['geo', 'Surface connections', ui.geoC, null, ui.geoW, ui.linkK],
]) {
  styles[name] = adoptAppearanceControl(colorInput, {
    id: name, label, opacity: 1, opacityInput, widthInput,
    parent: anchor.closest('fieldset'), before: anchor.closest('.row'),
    onInput: () => {
      if (surfaceView.solid) applyStyles();
    },
  });
}
particlePanel.insertBefore(ui.trailByParticle.closest('.row'), ui.trailLen.closest('.row'));
oldAppearance.remove();

// spheres
const sphereMesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(1, 14, 10),
  new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x111111 }),
  MAX_N,
);
sphereMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
sphereMesh.count = 0;
scene.add(sphereMesh);

// geodesic disks: centre + two rings of points reached by tracing geodesics outwards (they bend over edges)
const DISK_K = 18;
const DISK_V = 1 + 2 * DISK_K;
const DISK_T = 3 * DISK_K;
const diskGeo = new THREE.BufferGeometry();
diskGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_N * DISK_V * 3), 3));
diskGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_N * DISK_V * 3), 3));
{
  const idx = new Uint32Array(MAX_N * DISK_T * 3);
  let o = 0;
  for (let i = 0; i < MAX_N; i++) {
    const c = i * DISK_V;
    const r1 = (k) => c + 1 + (k % DISK_K);
    const r2 = (k) => c + 1 + DISK_K + (k % DISK_K);
    for (let k = 0; k < DISK_K; k++) {
      idx.set([c, r1(k), r1(k + 1)], o);
      idx.set([r1(k), r2(k), r2(k + 1)], o + 3);
      idx.set([r1(k), r2(k + 1), r1(k + 1)], o + 6);
      o += 9;
    }
  }
  diskGeo.setIndex(new THREE.BufferAttribute(idx, 1));
}
const diskMesh = new THREE.Mesh(
  diskGeo,
  new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  }),
);
diskMesh.frustumCulled = false;
scene.add(diskMesh);

function sequentialColor(t, out) {
  // dark blue -> cyan -> yellow -> white-ish
  const x = Math.max(0, Math.min(1, t));
  return out.setHSL(0.66 - 0.66 * x, 0.9, 0.25 + 0.5 * x);
}

function buildSurface() {
  connectionCache = '';
  const key = ui.mesh.value;
  ui.subdiv.disabled = key === 'custom' || !!MESHES[key].fixedResolution;
  const d = parseInt(ui.subdiv.value, 10);
  let mesh;
  if (key === 'custom' && customMesh) mesh = customMesh;
  else mesh = MESHES[key].build(d);
  surface = Surface.fromMesh(mesh, { name: key });
  surface.maxDisks = 4096;
  surfaceView.setSurface(surface);
  testField = new VertexField(surface, surfaceView.scalarValues('field'));
  applyStyles();
  controls.frame(mesh.positions);
  rebuildParticles();
}

function applyStyles() {
  trailLines.opacity = parseFloat(ui.trailOpacity.value);
  trailLines.width = parseFloat(ui.trailW.value);
  chordLines.opacity = styles.chord.opacity;
  geoLines.opacity = styles.geo.opacity;
  chordLines.width = parseFloat(ui.chordW.value);
  chordLines.color = ui.chordC.value;
  geoLines.width = parseFloat(ui.geoW.value);
  geoLines.color = ui.geoC.value;
  fixedColor.set(ui.pColor.value);
  for (const m of [sphereMesh.material, diskMesh.material]) {
    m.opacity = styles.particle.opacity;
    m.transparent = m.opacity < 1;
    m.depthWrite = m.opacity === 1;
  }
}

function rebuildParticles() {
  sys = new ParticleSystem(surface, {
    drag: parseFloat(ui.drag.value),
    maxSpeed: 3,
    trail: ui.trails.checked ? parseInt(ui.trailLen.value, 10) : 0,
    seed: (Math.random() * 1e9) | 0,
  });
  applyForces();
  const n = parseInt(ui.count.value, 10);
  sys.addRandom(n);
  const v0 = parseFloat(ui.speed.value);
  for (const p of sys.particles) {
    const a = sys.random() * Math.PI * 2;
    p.vx = v0 * Math.cos(a);
    p.vy = v0 * Math.sin(a);
    p.read = 0;
  }
}

// Drop one particle at a 3D hit, initial velocity = the screen's horizontal projected onto the face.
function dropParticle(hit) {
  if (sys.particles.length >= MAX_N) return;
  const f = surface.faceById(hit.faceId);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  let v = [
    right.x * f.u[0] + right.y * f.u[1] + right.z * f.u[2],
    right.x * f.v[0] + right.y * f.v[1] + right.z * f.v[2],
  ];
  const len = Math.hypot(v[0], v[1]) || 1;
  const speed = Math.max(1, parseFloat(ui.speed.value));
  v = [(v[0] / len) * speed, (v[1] / len) * speed];
  sys.trailLength = Math.max(sys.trailLength, FREE_TRAIL);
  sys.add({ faceId: hit.faceId, x: hit.x, y: hit.y }, v, { read: 0, dropped: true });
}

function applyForces() {
  if (pair) sys.removeForce(pair);
  if (gravityForce) sys.removeForce(gravityForce);
  pair = gravityForce = null;
  if (ui.freeMode.checked) {
    // no force, no drag, no noise: each step is a straight line in a flat chart = a geodesic
    sys.drag = 0;
    sys.temperature = 0;
    return;
  }
  const strength = parseFloat(ui.repel.value);
  pair =
    strength > 0 ? sys.addForce(pairForce({ radius: parseFloat(ui.radius.value), strength, law: ui.law.value })) : null;
  const g = parseFloat(ui.gravity.value);
  gravityForce = g > 0 ? sys.addForce(uniformField([0, 0, -g])) : null;
  sys.drag = parseFloat(ui.drag.value);
  sys.temperature = parseFloat(ui.temp.value);
}

// ---------------------------------------------------------------- reading + rendering
function readParticle(p) {
  switch (ui.readBy.value) {
    case 'K':
      return surface.gaussianCurvatureAt(p);
    case 'kn': {
      const sp = Math.hypot(p.vx, p.vy);
      return sp > 1e-9 ? surface.curvatureAt(p, [p.vx, p.vy]).kn : surface.curvatureAt(p).H;
    }
    case 'tau': {
      const sp = Math.hypot(p.vx, p.vy);
      return sp > 1e-9 ? surface.curvatureAt(p, [p.vx, p.vy]).tauG : 0;
    }
    case 'field':
      return testField.sample(p);
    case 'speed':
      return Math.hypot(p.vx, p.vy);
    default:
      return 0;
  }
}

let readLo = 0;
let readHi = 1;

function lifted(p, d) {
  const q = surface.to3D(p);
  const n = surface.normal(p.faceId);
  return [q[0] + n[0] * d, q[1] + n[1] * d, q[2] + n[2] * d];
}

// ---------------------------------------------------------------- connections (k nearest by surface distance)
let connectionStats = { shooting: 0, fallback: 0, unreachable: 0 };
let connectionCache = '';
function renderConnections() {
  const wantChords = ui.linkChords.checked;
  const wantGeo = ui.linkGeo.checked;
  chordLines.visible = wantChords;
  geoLines.visible = wantGeo;
  if (!wantChords && !wantGeo) return;
  const key = `${wantChords}:${wantGeo}:${ui.linkK.value}:${ui.linkMax.value}:` +
    sys.particles.map((p) => `${p.id},${p.faceId},${p.x},${p.y}`).join(';');
  if (connectionCache === key) {
    chordLines.fitResolution();
    geoLines.fitResolution();
    return;
  }
  connectionCache = key;
  connectionStats = { shooting: 0, fallback: 0, unreachable: 0 };
  const pairs = sys.neighbourGraph(parseInt(ui.linkK.value, 10), parseFloat(ui.linkMax.value));
  if (wantChords) {
    chordLines.begin();
    for (const { a, b } of pairs) chordLines.seg(surface.to3D(a), surface.to3D(b));
    chordLines.end();
  }
  if (wantGeo) {
    geoLines.begin();
    for (const pair of pairs) {
      const [a, b] = pair.a.id < pair.b.id ? [pair.a, pair.b] : [pair.b, pair.a];
      const r = surfaceConnection(surface, a, b, { iterations: 3, tol: 1e-5 });
      if (!r) { connectionStats.unreachable++; continue; }
      if (r.method === 'shooting') connectionStats.shooting++;
      else connectionStats.fallback++;
      const pl = r.polyline;
      for (let i = 0; i + 1 < pl.length; i++) geoLines.seg(surface.to3D(pl[i]), surface.to3D(pl[i + 1]));
    }
    geoLines.end();
  }
}

function particleColor(p, span, out) {
  if (ui.pColorMode.value === 'fixed') return out.copy(fixedColor);
  return sequentialColor((p.read - readLo) / span, out);
}

function renderParticles() {
  const ps = sys.particles;
  const reads = ps.map((p) => (p.read = readParticle(p)));
  const finite = reads.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length) {
    const lo = finite[Math.floor(0.05 * (finite.length - 1))];
    const hi = finite[Math.floor(0.95 * (finite.length - 1))];
    readLo += (lo - readLo) * 0.1;
    readHi += (hi - readHi) * 0.1;
  }
  const span = Math.max(1e-9, readHi - readLo);
  const style = ui.pStyle.value;
  const r = (0.02 + 0.03 / Math.sqrt(Math.max(1, ps.length / 12))) * parseFloat(ui.pSize.value);
  sphereMesh.count = style === 'sphere' ? ps.length : 0;
  diskMesh.visible = style === 'disk';
  const dPos = diskGeo.getAttribute('position');
  const dCol = diskGeo.getAttribute('color');
  const trailFixed = new THREE.Color(ui.trailC.value);
  const byParticle = ui.trailByParticle.checked;
  trailLines.visible = ui.trails.checked;
  trailLines.begin();
  ps.forEach((p, i) => {
    particleColor(p, span, tmpColor);
    if (style === 'sphere') {
      const pos = lifted(p, r * 0.6);
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      sphereMesh.setMatrixAt(i, dummy.matrix);
      sphereMesh.setColorAt(i, tmpColor);
    } else if (style === 'disk') {
      const base = i * DISK_V;
      const lift = 0.002;
      const c = lifted(p, lift);
      dPos.setXYZ(base, c[0], c[1], c[2]);
      for (let k = 0; k < DISK_K; k++) {
        const a = (2 * Math.PI * k) / DISK_K;
        const dir = [Math.cos(a), Math.sin(a)];
        const q1 = lifted(surface.trace(p, dir, r * 0.5).end, lift);
        const q2 = lifted(surface.trace(p, dir, r).end, lift);
        dPos.setXYZ(base + 1 + k, q1[0], q1[1], q1[2]);
        dPos.setXYZ(base + 1 + DISK_K + k, q2[0], q2[1], q2[2]);
      }
      for (let v = 0; v < DISK_V; v++) dCol.setXYZ(base + v, tmpColor.r, tmpColor.g, tmpColor.b);
    }
    if (ui.trails.checked) {
      const tc = byParticle ? (p.dropped && ui.pColorMode.value === 'read' ? DROPPED : tmpColor) : trailFixed;
      const t = p.trail;
      for (let k = 0; k + 1 < t.length; k++) trailLines.seg(t[k], t[k + 1], tc);
    }
  });
  trailLines.end();
  if (style === 'sphere') {
    sphereMesh.instanceMatrix.needsUpdate = true;
    if (sphereMesh.instanceColor) sphereMesh.instanceColor.needsUpdate = true;
  } else if (style === 'disk') {
    dPos.needsUpdate = true;
    dCol.needsUpdate = true;
    diskGeo.setDrawRange(0, ps.length * DISK_T * 3);
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let fps = 60;
let vertexHits = 0;
let frame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps += (1 / Math.max(1e-3, dt) - fps) * 0.05;
  if (annealing) {
    const t = (now - annealing.start) / annealing.duration;
    const T = t >= 1 ? 0 : annealing.T0 * (1 - t) ** 2;
    if (t >= 1) annealing = null;
    ui.temp.value = T.toFixed(2);
    ui.temp.dispatchEvent(new Event('input')); // updates the readout and applyForces → sys.temperature
  }
  if (running) {
    sys.step(1 / 60, 2);
    for (const p of sys.particles)
      if (p.lastEvents) vertexHits += p.lastEvents.filter((e) => e.type === 'vertex').length;
  }
  renderParticles();
  renderConnections();
  surfaceView.fitResolution();
  controls.update();
  renderSurfaceScene(renderer, scene, camera, [surfaceView.solid]);
  if (frame++ % 10 === 0) updateReadout();
}

function updateReadout() {
  const st = meshStats(surface.mesh);
  const P = sys.particles.map((p) => surface.to3D(p));
  let nnSum = 0;
  if (P.length > 1) {
    for (let i = 0; i < P.length; i++) {
      let m = Infinity;
      for (let j = 0; j < P.length; j++)
        if (j !== i) m = Math.min(m, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]));
      nnSum += m;
    }
  }
  ui.readout.textContent =
    (ui.mesh.value === 'custom' && importNote ? `${importNote}\n` : '') +
    `${surface.name}: F=${st.F} V=${st.V} χ=${st.euler}${st.closed ? '' : ' (open)'}  Σδ/2π=${(surface.totalDeficit() / (2 * Math.PI)).toFixed(2)}\n` +
    `N=${sys.particles.length}  t=${sys.time.toFixed(1)}s  E_kin=${sys.kineticEnergy().toExponential(2)}\n` +
    `mean NN dist (3D)=${P.length > 1 ? (nnSum / P.length).toFixed(3) : '–'}  cone hits=${vertexHits}\n` +
    `reading ${ui.readBy.options[ui.readBy.selectedIndex].text}: [${readLo.toFixed(3)}, ${readHi.toFixed(3)}]\n` +
    (ui.linkGeo.checked ? `connections: ${connectionStats.shooting} shooting, ${connectionStats.fallback} edge-route fallback, ${connectionStats.unreachable} unreachable\n` : '') +
    `${fps.toFixed(0)} fps  disks cached=${surface._disks?.size ?? 0}`;
}

// ---------------------------------------------------------------- wiring
ui.mesh.onchange = buildSurface;
ui.subdiv.onchange = buildSurface;
for (const el of [
  ui.trailOpacity,
  ui.trailW,
  ui.chordW,
  ui.chordC,
  ui.geoW,
  ui.geoC,
  ui.pColor,
])
  el.addEventListener('input', applyStyles);
ui.count.onchange = rebuildParticles;
ui.speed.onchange = rebuildParticles;
ui.trails.onchange = () => {
  sys.trailLength = ui.trails.checked ? parseInt(ui.trailLen.value, 10) : 0;
  for (const p of sys.particles) p.trail.length = 0;
};
ui.trailLen.onchange = ui.trails.onchange;
ui.reseed.onclick = rebuildParticles;
ui.run.onclick = () => {
  running = !running;
  ui.run.textContent = running ? 'running' : 'paused';
  ui.run.classList.toggle('on', running);
};
ui.stepOnce.onclick = () => {
  sys.step(1 / 60, 2);
};
for (const el of [ui.repel, ui.law, ui.radius, ui.drag, ui.gravity, ui.temp]) el.addEventListener('input', applyForces);
ui.anneal.onclick = () => {
  annealing = { start: performance.now(), duration: 8000, T0: Math.max(0.6, parseFloat(ui.temp.value)) };
};
ui.freeMode.onchange = applyForces;
ui.clearAll.onclick = () => sys.clear();
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!e.shiftKey) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(
    new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
    camera,
  );
  const { origin, direction } = raycaster.ray;
  const hit = surface.raycast([origin.x, origin.y, origin.z], [direction.x, direction.y, direction.z]);
  if (hit) dropParticle(hit);
});

// file import (button or drag & drop) through the library's importMesh
wireMeshImport({
  button: ui.loadMesh,
  onFile: async (file) => {
    try {
      const imported = await importMeshFile(file, 1.3);
      customMesh = imported.mesh;
      importNote = describeImport(imported);
      setCustomOption(ui.mesh, `${file.name} (${imported.report.triangles} tri)`);
      buildSurface();
    } catch (err) {
      importNote = `import failed: ${err.message}`;
      ui.readout.textContent = importNote;
    }
  },
});

buildSurface();
requestAnimationFrame(loop);
window.__nmd = {
  surfaceView,
  get surface() {
    return surface;
  },
  get sys() {
    return sys;
  },
  get connectionStats() { return connectionStats; },
  get connectionLines() { return geoLines; },
  THREE,
  scene,
  camera,
  controls,
  geodesicBetween,
};
