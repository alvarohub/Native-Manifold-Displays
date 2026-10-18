// Demo D1 — particles on a surface. three.js host for manifold-core + manifold-physics.
import * as THREE from 'three';
import { BallControls } from '../shared/ballControls.js';
import { FatSegments } from '../shared/fatLines.js';
import {
  Surface,
  meshStats,
  gaussianCurvature,
  meanCurvature,
  VertexField,
  geodesicBetween,
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
    'colorBy',
    'wire',
    'surfOpacity',
    'wireOpacity',
    'cones',
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
    'linkOpacity',
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
    'surfColor',
    'wireW',
    'wireC',
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
bindRange(ui.surfOpacity, (v) => v.toFixed(2));
bindRange(ui.wireOpacity, (v) => v.toFixed(2));
bindRange(ui.linkK);
bindRange(ui.linkMax, (v) => v.toFixed(2));
bindRange(ui.linkOpacity, (v) => v.toFixed(2));
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
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0d12');
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
camera.position.set(2.6, -3.6, 2.4);
camera.up.set(0, 0, 1);
camera.lookAt(0, 0, 0);
const controls = new BallControls(camera, renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(3, -4, 5);
camera.add(key); // lights ride with the camera: the lit side stays the side you look at while you turn it
const fill = new THREE.DirectionalLight(0x8fb4ff, 0.5);
fill.position.set(-4, 3, -2);
camera.add(fill);
scene.add(camera);

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
if (window.innerWidth < 900) ui.collapse.click();

// ---------------------------------------------------------------- state
let surface = null;
let surfaceMesh = null;
let wireLines = null;
let coneGroup = null;
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

// diverging colormap centred at zero, robustly scaled
function colormapDiverging(values) {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const q = (t) => finite[Math.min(finite.length - 1, Math.floor(t * finite.length))] ?? 0;
  const scale = Math.max(Math.abs(q(0.02)), Math.abs(q(0.98)), 1e-9);
  return values.map((v) => {
    const t = Number.isFinite(v) ? Math.max(-1, Math.min(1, v / scale)) : 0;
    const c = new THREE.Color();
    if (t < 0) c.setRGB(0.55 + 0.45 * (1 + t), 0.62 + 0.38 * (1 + t), 1.0);
    else c.setRGB(1.0, 0.9 - 0.65 * t, 0.85 - 0.75 * t);
    return c;
  });
}

function sequentialColor(t, out) {
  // dark blue -> cyan -> yellow -> white-ish
  const x = Math.max(0, Math.min(1, t));
  return out.setHSL(0.66 - 0.66 * x, 0.9, 0.25 + 0.5 * x);
}

function buildSurface() {
  const key = ui.mesh.value;
  ui.subdiv.disabled = key === 'custom' || !!MESHES[key].fixedResolution;
  const d = parseInt(ui.subdiv.value, 10);
  let mesh;
  if (key === 'custom' && customMesh) mesh = customMesh;
  else mesh = MESHES[key].build(d);
  surface = Surface.fromMesh(mesh, { name: key });
  surface.maxDisks = 4096;
  testField = VertexField.from(surface, (p) => Math.sin(4 * p[0]) * Math.cos(3 * p[2]) + 0.5 * Math.sin(5 * p[1]));

  if (surfaceMesh) {
    scene.remove(surfaceMesh, coneGroup);
    wireLines.dispose(scene);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.flat(), 3));
  geo.setIndex(mesh.triangles.flat());
  geo.computeVertexNormals();
  surfaceMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  scene.add(surfaceMesh);
  // unique mesh edges as wide lines
  const seen = new Set();
  const edges = [];
  for (const t of mesh.triangles)
    for (let k = 0; k < 3; k++) {
      const a = t[k];
      const b = t[(k + 1) % 3];
      const id = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(id)) {
        seen.add(id);
        edges.push([a, b]);
      }
    }
  wireLines = new FatSegments(scene, renderer, { max: edges.length });
  wireLines.begin();
  for (const [a, b] of edges) wireLines.seg(mesh.positions[a], mesh.positions[b]);
  wireLines.end();
  coneGroup = buildCones();
  coneGroup.visible = ui.cones.checked;
  scene.add(coneGroup);
  applyStyles();
  colourSurface();
  controls.frame(mesh.positions);
  rebuildParticles();
}

function applyStyles() {
  const so = parseFloat(ui.surfOpacity.value);
  surfaceMesh.material.opacity = so;
  surfaceMesh.material.depthWrite = so > 0.6;
  surfaceMesh.visible = so > 0.005;
  wireLines.visible = ui.wire.checked;
  wireLines.opacity = parseFloat(ui.wireOpacity.value);
  wireLines.width = parseFloat(ui.wireW.value);
  wireLines.color = ui.wireC.value;
  trailLines.opacity = parseFloat(ui.trailOpacity.value);
  trailLines.width = parseFloat(ui.trailW.value);
  chordLines.opacity = geoLines.opacity = parseFloat(ui.linkOpacity.value);
  chordLines.width = parseFloat(ui.chordW.value);
  chordLines.color = ui.chordC.value;
  geoLines.width = parseFloat(ui.geoW.value);
  geoLines.color = ui.geoC.value;
  fixedColor.set(ui.pColor.value);
}

function colourSurface() {
  const n = surface.vertices.length;
  let values;
  switch (ui.colorBy.value) {
    case 'K':
      values = new VertexField(surface, Array.from(gaussianCurvature(surface))).smoothed(2, 0.6).values;
      break;
    case 'H':
      values = new VertexField(surface, Array.from(meanCurvature(surface))).smoothed(2, 0.6).values;
      break;
    case 'deficit':
      values = surface.vertices.map((v) => (v.corners.length ? (v.boundary ? Math.PI : 2 * Math.PI) - v.angleSum : 0));
      break;
    case 'field':
      values = testField.values;
      break;
    default:
      values = new Array(n).fill(0);
  }
  const plain = new THREE.Color(ui.surfColor.value);
  const colors =
    ui.colorBy.value === 'none'
      ? surface.vertices.map(() => plain)
      : colormapDiverging(values.map((v) => (Number.isNaN(v) ? 0 : v)));
  const arr = new Float32Array(n * 3);
  colors.forEach((c, i) => {
    arr[3 * i] = c.r;
    arr[3 * i + 1] = c.g;
    arr[3 * i + 2] = c.b;
  });
  surfaceMesh.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function buildCones() {
  const g = new THREE.Group();
  const cones = surface.vertexCones().filter((c) => Math.abs(c.deficit) > 1e-6);
  const maxD = Math.max(1e-9, ...cones.map((c) => Math.abs(c.deficit)));
  const sphere = new THREE.SphereGeometry(1, 10, 8);
  for (const c of cones) {
    const m = new THREE.Mesh(
      sphere,
      new THREE.MeshBasicMaterial({
        color: c.deficit > 0 ? 0xff6b5d : 0x5da8ff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    const r = 0.008 + 0.03 * Math.sqrt(Math.abs(c.deficit) / maxD);
    m.scale.setScalar(r);
    m.position.set(...c.position);
    g.add(m);
  }
  return g;
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
function renderConnections() {
  const wantChords = ui.linkChords.checked;
  const wantGeo = ui.linkGeo.checked;
  chordLines.visible = wantChords;
  geoLines.visible = wantGeo;
  if (!wantChords && !wantGeo) return;
  const pairs = sys.neighbourGraph(parseInt(ui.linkK.value, 10), parseFloat(ui.linkMax.value));
  if (wantChords) {
    chordLines.begin();
    for (const { a, b } of pairs) chordLines.seg(surface.to3D(a), surface.to3D(b));
    chordLines.end();
  }
  if (wantGeo) {
    geoLines.begin();
    for (const { a, b } of pairs) {
      // shooting-corrected geodesic that actually ends at b (the disk's single unfolding only gives a guess)
      const r = geodesicBetween(surface, a, b, { iterations: 3, tol: 1e-5 });
      if (!r) continue;
      const pl = r.polyline;
      for (let i = 0; i + 1 < pl.length; i++) geoLines.seg(lifted(pl[i], 0.004), lifted(pl[i + 1], 0.004));
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
  wireLines.fitResolution();
  controls.update();
  renderer.render(scene, camera);
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
    `${fps.toFixed(0)} fps  disks cached=${surface._disks?.size ?? 0}`;
}

// ---------------------------------------------------------------- wiring
ui.mesh.onchange = buildSurface;
ui.subdiv.onchange = buildSurface;
ui.colorBy.onchange = colourSurface;
ui.surfColor.addEventListener('input', colourSurface);
for (const el of [
  ui.wire,
  ui.surfOpacity,
  ui.wireOpacity,
  ui.trailOpacity,
  ui.linkOpacity,
  ui.wireW,
  ui.wireC,
  ui.trailW,
  ui.chordW,
  ui.chordC,
  ui.geoW,
  ui.geoC,
  ui.pColor,
])
  el.addEventListener('input', applyStyles);
ui.wire.onchange = applyStyles;
ui.cones.onchange = () => (coneGroup.visible = ui.cones.checked);
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
  get surface() {
    return surface;
  },
  get sys() {
    return sys;
  },
  THREE,
  scene,
  camera,
  controls,
  geodesicBetween,
};
