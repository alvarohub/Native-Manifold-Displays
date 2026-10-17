// Demo D1 — particles on a surface. three.js host for manifold-core + manifold-physics.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  Surface,
  cubeMesh,
  icosphereMesh,
  torusMesh,
  cylinderMesh,
  planeMesh,
  tetrahedronMesh,
  parseOBJ,
  parseSTL,
  weldVertices,
  orientTriangles,
  meshStats,
  gaussianCurvature,
  meanCurvature,
  VertexField,
} from '../../manifold-core/index.js';
import { ParticleSystem, pairForce, uniformField } from '../../manifold-physics/index.js';

// ---------------------------------------------------------------- DOM
const $ = (id) => document.getElementById(id);
const ui = {
  mesh: $('mesh'),
  subdiv: $('subdiv'),
  colorBy: $('colorBy'),
  wire: $('wire'),
  cones: $('cones'),
  count: $('count'),
  speed: $('speed'),
  readBy: $('readBy'),
  trails: $('trails'),
  trailLen: $('trailLen'),
  reseed: $('reseed'),
  run: $('run'),
  stepOnce: $('stepOnce'),
  repel: $('repel'),
  law: $('law'),
  radius: $('radius'),
  drag: $('drag'),
  gravity: $('gravity'),
  temp: $('temp'),
  anneal: $('anneal'),
  readout: $('readout'),
  panel: $('panel'),
  collapse: $('collapse'),
};
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
bindRange(ui.repel, (v) => v.toFixed(2));
bindRange(ui.radius, (v) => v.toFixed(1));
bindRange(ui.drag, (v) => v.toFixed(2));
bindRange(ui.gravity, (v) => v.toFixed(2));
bindRange(ui.temp, (v) => v.toFixed(2));
ui.collapse.onclick = () => {
  ui.panel.classList.toggle('collapsed');
  ui.collapse.textContent = ui.panel.classList.contains('collapsed') ? '+' : '–';
};

// ---------------------------------------------------------------- meshes
const MESHES = {
  icosphere: { label: 'Icosphere', build: (d) => icosphereMesh(Math.min(5, d), 1.2) },
  cube: { label: 'Cube', build: (d) => cubeMesh(2, 1 + d) },
  torus: { label: 'Torus', build: (d) => torusMesh(1.1, 0.45, 12 * (d + 1), 6 * (d + 1)) },
  cylinder: { label: 'Open cylinder', build: (d) => cylinderMesh(0.9, 2.2, 8 * (d + 1), 2 * (d + 1)) },
  plane: { label: 'Flat square', build: (d) => planeMesh(2.4, 2.4, 2 * (d + 1), 2 * (d + 1)) },
  tetra: { label: 'Tetrahedron', build: () => tetrahedronMesh(1.1) },
};
let customMesh = null;
for (const [k, m] of Object.entries(MESHES)) {
  const o = document.createElement('option');
  o.value = k;
  o.textContent = m.label;
  ui.mesh.appendChild(o);
}

function normalizeMesh(mesh, radius = 1.3) {
  const c = [0, 0, 0];
  for (const p of mesh.positions) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  c.forEach((v, i) => (c[i] = v / mesh.positions.length));
  let r = 0;
  for (const p of mesh.positions) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
  const s = radius / (r || 1);
  mesh.positions = mesh.positions.map((p) => [(p[0] - c[0]) * s, (p[1] - c[1]) * s, (p[2] - c[2]) * s]);
  return mesh;
}

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
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(3, -4, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x8fb4ff, 0.5);
fill.position.set(-4, 3, -2);
scene.add(fill);

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
let wireMesh = null;
let coneGroup = null;
let testField = null;
let sys = null;
let pair = null;
let gravityForce = null;
let particleMesh = null;
let trailLines = [];
let running = true;
let annealing = null;
const MAX_N = 400;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

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
  const d = parseInt(ui.subdiv.value, 10);
  let mesh;
  if (key === 'custom' && customMesh) mesh = customMesh;
  else mesh = MESHES[key].build(d);
  surface = Surface.fromMesh(mesh, { name: key });
  surface.maxDisks = 4096;
  testField = VertexField.from(surface, (p) => Math.sin(4 * p[0]) * Math.cos(3 * p[2]) + 0.5 * Math.sin(5 * p[1]));

  // geometry (flat-shaded look via non-indexed positions is unnecessary: smooth normals read better)
  if (surfaceMesh) {
    scene.remove(surfaceMesh);
    scene.remove(wireMesh);
    scene.remove(coneGroup);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.flat(), 3));
  geo.setIndex(mesh.triangles.flat());
  geo.computeVertexNormals();
  surfaceMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }),
  );
  scene.add(surfaceMesh);
  wireMesh = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x3a4a66, transparent: true, opacity: 0.45 }),
  );
  wireMesh.visible = ui.wire.checked;
  scene.add(wireMesh);
  coneGroup = buildCones();
  coneGroup.visible = ui.cones.checked;
  scene.add(coneGroup);
  colourSurface();
  rebuildParticles();
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
  const colors =
    ui.colorBy.value === 'none'
      ? surface.vertices.map(() => new THREE.Color(0x9aa6ba))
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
  if (!particleMesh) {
    particleMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x111111 }),
      MAX_N,
    );
    particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(particleMesh);
  }
  particleMesh.count = n;
  rebuildTrails();
}

function rebuildTrails() {
  for (const l of trailLines) scene.remove(l);
  trailLines = [];
  if (!ui.trails.checked) return;
  const len = parseInt(ui.trailLen.value, 10);
  for (const p of sys.particles) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(len * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    );
    line.frustumCulled = false;
    scene.add(line);
    trailLines.push(line);
  }
}

function applyForces() {
  if (pair) sys.removeForce(pair);
  if (gravityForce) sys.removeForce(gravityForce);
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
  const r = 0.02 + 0.03 / Math.sqrt(Math.max(1, ps.length / 12));
  ps.forEach((p, i) => {
    const pos = surface.to3D(p);
    const n = surface.normal(p.faceId);
    dummy.position.set(pos[0] + n[0] * r * 0.6, pos[1] + n[1] * r * 0.6, pos[2] + n[2] * r * 0.6);
    dummy.scale.setScalar(r);
    dummy.updateMatrix();
    particleMesh.setMatrixAt(i, dummy.matrix);
    particleMesh.setColorAt(i, sequentialColor((p.read - readLo) / span, tmpColor));
    const line = trailLines[i];
    if (line) {
      const attr = line.geometry.getAttribute('position');
      const t = p.trail;
      for (let k = 0; k < t.length; k++) attr.setXYZ(k, t[k][0], t[k][1], t[k][2]);
      attr.needsUpdate = true;
      line.geometry.setDrawRange(0, t.length);
      line.material.color.copy(tmpColor);
    }
  });
  particleMesh.instanceMatrix.needsUpdate = true;
  if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
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
ui.wire.onchange = () => (wireMesh.visible = ui.wire.checked);
ui.cones.onchange = () => (coneGroup.visible = ui.cones.checked);
ui.count.onchange = rebuildParticles;
ui.speed.onchange = rebuildParticles;
ui.trails.onchange = () => {
  sys.trailLength = ui.trails.checked ? parseInt(ui.trailLen.value, 10) : 0;
  for (const p of sys.particles) p.trail.length = 0;
  rebuildTrails();
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

// drag & drop OBJ / STL
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const name = file.name.toLowerCase();
  let mesh;
  if (name.endsWith('.obj')) mesh = parseOBJ(await file.text());
  else if (name.endsWith('.stl')) mesh = parseSTL(await file.arrayBuffer());
  else return alert('Drop an .obj or .stl file');
  mesh = weldVertices(mesh, 1e-6);
  const rep = orientTriangles(mesh);
  normalizeMesh(mesh);
  customMesh = mesh;
  let opt = ui.mesh.querySelector('option[value="custom"]');
  if (!opt) {
    opt = document.createElement('option');
    opt.value = 'custom';
    ui.mesh.appendChild(opt);
  }
  opt.textContent = `${file.name} (${mesh.triangles.length} tri${rep.orientable ? '' : ', non-orientable'})`;
  ui.mesh.value = 'custom';
  buildSurface();
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
};
