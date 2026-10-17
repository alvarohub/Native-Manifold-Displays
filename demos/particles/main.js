// Demo D1 — particles on a surface. three.js host for manifold-core + manifold-physics.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
const ui = {
  mesh: $('mesh'),
  subdiv: $('subdiv'),
  colorBy: $('colorBy'),
  wire: $('wire'),
  surfOpacity: $('surfOpacity'),
  wireOpacity: $('wireOpacity'),
  cones: $('cones'),
  count: $('count'),
  speed: $('speed'),
  readBy: $('readBy'),
  trails: $('trails'),
  trailLen: $('trailLen'),
  trailOpacity: $('trailOpacity'),
  linkChords: $('linkChords'),
  linkGeo: $('linkGeo'),
  linkK: $('linkK'),
  linkMax: $('linkMax'),
  linkOpacity: $('linkOpacity'),
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
  loadMesh: $('loadMesh'),
  freeMode: $('freeMode'),
  clearAll: $('clearAll'),
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
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  scene.add(surfaceMesh);
  wireMesh = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x6f84aa, transparent: true, opacity: 0.45 }),
  );
  wireMesh.visible = ui.wire.checked;
  scene.add(wireMesh);
  applyOpacities();
  coneGroup = buildCones();
  coneGroup.visible = ui.cones.checked;
  scene.add(coneGroup);
  colourSurface();
  rebuildParticles();
}

function applyOpacities() {
  const so = parseFloat(ui.surfOpacity.value);
  surfaceMesh.material.opacity = so;
  surfaceMesh.material.depthWrite = so > 0.6;
  surfaceMesh.visible = so > 0.005;
  wireMesh.material.opacity = parseFloat(ui.wireOpacity.value);
  for (const l of trailLines) l.material.opacity = parseFloat(ui.trailOpacity.value);
  chordLines.material.opacity = parseFloat(ui.linkOpacity.value);
  geoLines.material.opacity = parseFloat(ui.linkOpacity.value);
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

// Drop one particle at a 3D hit, initial velocity = the screen's horizontal projected onto the face.
const FREE_TRAIL = 2000;
const DROPPED = new THREE.Color(0xffd27b);
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
  particleMesh.count = sys.particles.length;
  addTrailLine(FREE_TRAIL);
}

function addTrailLine(len) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(len * 3), 3));
  geo.setDrawRange(0, 0);
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: parseFloat(ui.trailOpacity.value) }),
  );
  line.frustumCulled = false;
  scene.add(line);
  trailLines.push(line);
}

function rebuildTrails() {
  for (const l of trailLines) scene.remove(l);
  trailLines = [];
  if (!ui.trails.checked) return;
  const len = parseInt(ui.trailLen.value, 10);
  for (const p of sys.particles) addTrailLine(len);
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

// ---------------------------------------------------------------- connections (k nearest by surface distance)
const MAX_LINK_SEGMENTS = 20000;
const chordLines = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_N * 12 * 6), 3)),
  new THREE.LineBasicMaterial({ color: 0xffd27b, transparent: true, opacity: 0.8 }),
);
const geoLines = new THREE.LineSegments(
  new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(MAX_LINK_SEGMENTS * 6), 3),
  ),
  new THREE.LineBasicMaterial({ color: 0x7be0ff, transparent: true, opacity: 0.8 }),
);
chordLines.frustumCulled = geoLines.frustumCulled = false;
chordLines.geometry.setDrawRange(0, 0);
geoLines.geometry.setDrawRange(0, 0);
scene.add(chordLines, geoLines);

// pairs (i < j) where j is among i's k nearest within maxDist, or vice versa
function neighbourPairs(k, maxDist) {
  return sys.neighbourGraph(k, maxDist);
}

function renderConnections() {
  const wantChords = ui.linkChords.checked;
  const wantGeo = ui.linkGeo.checked;
  chordLines.visible = wantChords;
  geoLines.visible = wantGeo;
  if (!wantChords && !wantGeo) return;
  const pairs = neighbourPairs(parseInt(ui.linkK.value, 10), parseFloat(ui.linkMax.value));
  const lift = 0.004;
  if (wantChords) {
    const attr = chordLines.geometry.getAttribute('position');
    let n = 0;
    for (const { a, b } of pairs) {
      if (n + 2 > attr.count) break;
      const pa = surface.to3D(a);
      const pb = surface.to3D(b);
      attr.setXYZ(n++, pa[0], pa[1], pa[2]);
      attr.setXYZ(n++, pb[0], pb[1], pb[2]);
    }
    attr.needsUpdate = true;
    chordLines.geometry.setDrawRange(0, n);
  }
  if (wantGeo) {
    const attr = geoLines.geometry.getAttribute('position');
    let n = 0;
    for (const { a, b } of pairs) {
      // shooting-corrected geodesic that actually ends at b (the disk's single unfolding only gives a guess)
      const r = geodesicBetween(surface, a, b, { iterations: 3, tol: 1e-5 });
      if (!r) continue;
      const pl = r.polyline;
      for (let i = 0; i + 1 < pl.length && n + 2 <= attr.count; i++) {
        const p0 = surface.to3D(pl[i]);
        const p1 = surface.to3D(pl[i + 1]);
        const n0 = surface.normal(pl[i].faceId);
        const n1 = surface.normal(pl[i + 1].faceId);
        attr.setXYZ(n++, p0[0] + n0[0] * lift, p0[1] + n0[1] * lift, p0[2] + n0[2] * lift);
        attr.setXYZ(n++, p1[0] + n1[0] * lift, p1[1] + n1[1] * lift, p1[2] + n1[2] * lift);
      }
    }
    attr.needsUpdate = true;
    geoLines.geometry.setDrawRange(0, n);
  }
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
      const k0 = Math.max(0, t.length - attr.count);
      for (let k = k0; k < t.length; k++) attr.setXYZ(k - k0, t[k][0], t[k][1], t[k][2]);
      attr.needsUpdate = true;
      line.geometry.setDrawRange(0, t.length - k0);
      line.material.color.copy(p.dropped ? DROPPED : tmpColor);
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
  renderConnections();
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
ui.wire.onchange = () => (wireMesh.visible = ui.wire.checked);
for (const el of [ui.surfOpacity, ui.wireOpacity, ui.trailOpacity, ui.linkOpacity])
  el.addEventListener('input', applyOpacities);
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
ui.freeMode.onchange = applyForces;
ui.clearAll.onclick = () => {
  sys.clear();
  particleMesh.count = 0;
  for (const l of trailLines) scene.remove(l);
  trailLines = [];
};
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
  geodesicBetween,
};
