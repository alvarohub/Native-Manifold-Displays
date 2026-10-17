// Demo — Game of Life on a surface. The universe is a quad grid wrapped on a cylinder / torus / Möbius band /
// Klein bottle; the library builds the mesh and derives each cell's neighbours from shared vertices.
import { createViewer } from '../shared/viewer.js';
import {
  mobiusBandMesh,
  cylinderMesh,
  torusMesh,
  kleinBottleMesh,
  cellAdjacency,
  meshStats,
  orientTriangles,
} from '../../manifold-core/index.js';
import { parseRule, lifeStep, PATTERNS } from './life.js';

const $ = (id) => document.getElementById(id);
const ui = Object.fromEntries(
  [
    'surf',
    'nu',
    'nv',
    'nbh',
    'rule',
    'seed',
    'speed',
    'run',
    'stepOnce',
    'reset',
    'grid',
    'readout',
    'panel',
    'collapse',
  ].map((id) => [id, $(id)]),
);
for (const id of ['nu', 'nv', 'speed']) {
  const sync = () => ($(id + 'Out').textContent = ui[id].value);
  ui[id].addEventListener('input', sync);
  sync();
}
ui.collapse.onclick = () => {
  ui.panel.classList.toggle('collapsed');
  ui.collapse.textContent = ui.panel.classList.contains('collapsed') ? '+' : '–';
};

// cell (i around, j across) -> quad index in the generator's triangle order; sizes chosen for ~square cells
const SURFACES = {
  mobius: {
    build: (nu, nv) => mobiusBandMesh(1.2, Math.min(1.5, (2 * Math.PI * 1.2 * nv) / nu), nu, nv, 1),
    cell: (i, j, nu, nv) => i * nv + j,
  },
  cylinder: {
    build: (nu, nv) => cylinderMesh(1, Math.min(3, (2 * Math.PI * nv) / nu), nu, nv),
    cell: (i, j, nu) => j * nu + i,
  },
  torus: {
    build: (nu, nv) => torusMesh(1.3, Math.min(0.75, (1.3 * nv) / nu), nu, nv),
    cell: (i, j, nu, nv) => i * nv + j,
  },
  klein: {
    build: (nu, nv) => kleinBottleMesh(1, 0.4, nu, nv),
    cell: (i, j, nu, nv) => i * nv + j,
  },
};

const { THREE, renderer, scene, camera, controls } = createViewer($('app'), { cameraPos: [0.4, -3.4, 3.0] });
if (window.innerWidth < 900) ui.collapse.click();

const ALIVE = new THREE.Color('#ffb45d');
const DEAD = new THREE.Color('#1b2130');
const GLOW = new THREE.Color('#7a3d8f');

let mesh, adjacency, alive, next, heat, rule, nu, nv, cellMesh, borders, generation, stats, orientable;
let running = true;
let acc = 0;

function build() {
  nu = parseInt(ui.nu.value, 10);
  nv = parseInt(ui.nv.value, 10);
  const S = SURFACES[ui.surf.value];
  mesh = S.build(nu, nv);
  adjacency = cellAdjacency(
    mesh,
    mesh.triangles.map((_, t) => t >> 1),
    { by: ui.nbh.value },
  );
  stats = meshStats(mesh);
  orientable = orientTriangles(structuredClone(mesh)).orientable;
  const n = adjacency.length;
  alive = new Uint8Array(n);
  next = new Uint8Array(n);
  heat = new Float32Array(n);

  if (cellMesh) scene.remove(cellMesh, borders);
  // non-indexed: one colour per cell (its two triangles), flat shading
  const pos = new Float32Array(mesh.triangles.length * 9);
  mesh.triangles.forEach((tri, t) => tri.forEach((v, k) => pos.set(mesh.positions[v], 9 * t + 3 * k)));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  geo.computeVertexNormals();
  cellMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      side: THREE.DoubleSide, // one-sided surfaces: a cell is a region of the surface, seen from both sides
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  // quad outlines (skip the diagonal): tri0 = [a,b,c], tri1 = [a,c,d]
  const seg = [];
  for (let c = 0; c < n; c++) {
    const [a, b, cc] = mesh.triangles[2 * c];
    const d = mesh.triangles[2 * c + 1][2];
    for (const [p, q] of [
      [a, b],
      [b, cc],
      [cc, d],
      [d, a],
    ])
      seg.push(...mesh.positions[p], ...mesh.positions[q]);
  }
  borders = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)),
    new THREE.LineBasicMaterial({ color: 0x3a4660, transparent: true, opacity: 0.6 }),
  );
  borders.visible = ui.grid.checked;
  scene.add(cellMesh, borders);
  controls.frame(mesh.positions);
  seed();
}

function seed() {
  alive.fill(0);
  heat.fill(0);
  generation = 0;
  const S = SURFACES[ui.surf.value];
  const kind = ui.seed.value;
  if (kind === 'random') for (let c = 0; c < alive.length; c++) alive[c] = Math.random() < 0.3 ? 1 : 0;
  else if (PATTERNS[kind]) {
    const j0 = Math.max(0, Math.floor(nv / 2) - 2);
    for (const [di, dj] of PATTERNS[kind]) {
      const j = j0 + dj;
      if (j < nv) alive[S.cell(di % nu, j, nu, nv)] = 1;
    }
  }
  setRule();
  paint();
}

function setRule() {
  const r = parseRule(ui.rule.value);
  ui.rule.style.borderColor = r ? '' : '#d9534f';
  if (r) rule = r;
}

function step() {
  lifeStep(alive, adjacency, rule, next);
  for (let c = 0; c < alive.length; c++) heat[c] = next[c] ? 1 : heat[c] * 0.82;
  [alive, next] = [next, alive];
  generation++;
}

const tmp = new THREE.Color();
function paint() {
  const col = cellMesh.geometry.getAttribute('color');
  for (let c = 0; c < alive.length; c++) {
    if (alive[c]) tmp.copy(ALIVE);
    else tmp.copy(DEAD).lerp(GLOW, Math.min(1, heat[c] * 0.9));
    for (let k = 0; k < 6; k++) col.setXYZ(6 * c + k, tmp.r, tmp.g, tmp.b);
  }
  col.needsUpdate = true;
}

function readout() {
  let pop = 0;
  for (const a of alive) pop += a;
  const hist = {};
  for (const a of adjacency) hist[a.length] = (hist[a.length] ?? 0) + 1;
  ui.readout.textContent =
    `${ui.surf.options[ui.surf.selectedIndex].text}: χ=${stats.euler}  ${stats.closed ? 'closed' : 'open'}  ` +
    `${orientable ? 'orientable' : 'NON-orientable'}\n` +
    `${nu}×${nv} = ${alive.length} cells   neighbour counts: ${Object.entries(hist)
      .map(([k, v]) => `${k}×${v}`)
      .join('  ')}\n` +
    `rule ${rule.text}   generation ${generation}   population ${pop}`;
}

// click to toggle a cell (three.js faceIndex = triangle index; two triangles per cell)
const raycaster = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(
    new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
    camera,
  );
  const hit = raycaster.intersectObject(cellMesh)[0];
  if (!hit) return;
  const c = hit.faceIndex >> 1;
  alive[c] ^= 1;
  heat[c] = alive[c];
  paint();
});

ui.surf.onchange = ui.nu.onchange = ui.nv.onchange = ui.nbh.onchange = build;
ui.seed.onchange = ui.reset.onclick = seed;
ui.rule.onchange = setRule;
ui.grid.onchange = () => (borders.visible = ui.grid.checked);
ui.run.onclick = () => {
  running = !running;
  ui.run.textContent = running ? 'running' : 'paused';
  ui.run.classList.toggle('on', running);
};
ui.stepOnce.onclick = () => {
  step();
  paint();
};

let last = performance.now();
let frame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    acc += dt * parseFloat(ui.speed.value);
    let n = 0;
    while (acc >= 1 && n++ < 8) {
      step();
      acc -= 1;
    }
    if (n) paint();
  }
  controls.update();
  renderer.render(scene, camera);
  if (frame++ % 10 === 0) readout();
}

build();
requestAnimationFrame(loop);
window.__nmd = {
  get alive() {
    return alive;
  },
  get adjacency() {
    return adjacency;
  },
  step,
  paint,
};
