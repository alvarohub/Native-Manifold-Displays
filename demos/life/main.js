// Game of Life on preset quad grids or triangle cells of any imported surface.
import { createViewer } from '../shared/viewer.js';
import {
  cellAdjacency,
  meshStats,
  orientTriangles,
} from '../../manifold-core/index.js';
import { fillMeshSelect, importMeshFile, describeImport, wireMeshImport, setCustomOption } from '../shared/meshes.js';
import { parseRule, lifeStep, PATTERNS } from './life.js';
import { buildLifeSurface, cellBorderEdges } from './surfaces.js';

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
    'loadMesh',
    'meshNote',
    'layoutHint',
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

let customMesh = null;
fillMeshSelect(ui.surf);
ui.surf.value = 'mobius';

const { THREE, renderer, scene, camera, controls } = createViewer($('app'), { cameraPos: [0.4, -3.4, 3.0] });
if (window.innerWidth < 900) ui.collapse.click();

const ALIVE = new THREE.Color('#ffb45d');
const DEAD = new THREE.Color('#1b2130');
const GLOW = new THREE.Color('#7a3d8f');

let mesh, adjacency, alive, next, heat, rule, nu, nv, cellMesh, borders, generation, stats, orientable, cellOf, dims;
let running = true;
let acc = 0;

function build() {
  nu = parseInt(ui.nu.value, 10);
  nv = parseInt(ui.nv.value, 10);
  ({ mesh, cellOf, dims } = buildLifeSurface(ui.surf.value, nu, nv, customMesh));
  adjacency = cellAdjacency(mesh, cellOf, { by: ui.nbh.value });
  stats = meshStats(mesh);
  orientable = orientTriangles(structuredClone(mesh)).orientable;
  const n = adjacency.length;
  alive = new Uint8Array(n);
  next = new Uint8Array(n);
  heat = new Float32Array(n);

  ui.nu.disabled = !dims;
  ui.nv.disabled = !dims || ui.surf.value === 'cube';
  for (const option of ui.seed.options) option.disabled = !dims && !!PATTERNS[option.value];
  if (!dims && PATTERNS[ui.seed.value]) ui.seed.value = 'random';
  ui.nbh.options[0].textContent = dims ? 'share a corner (Moore-like)' : 'share a vertex (variable degree)';
  ui.nbh.options[1].textContent = dims ? 'share an edge (von Neumann-like)' : 'share an edge (3 on closed triangles)';
  ui.layoutHint.textContent = dims
    ? 'Preset quad cells: neighbours come from mesh connectivity, not a Fermi frame. Cube uses only "cells around".'
    : 'One triangle = one cell; fixed preset resolution or uploaded mesh resolution. No global rows/columns or classic grid seeds. B3/S23 runs on this graph, but Conway gliders are not guaranteed.';

  if (cellMesh) {
    scene.remove(cellMesh, borders);
    cellMesh.geometry.dispose();
    cellMesh.material.dispose();
    borders.geometry.dispose();
    borders.material.dispose();
  }
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
  const seg = [];
  for (const [a, b] of cellBorderEdges(mesh, cellOf)) seg.push(...mesh.positions[a], ...mesh.positions[b]);
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
  const kind = ui.seed.value;
  if (kind === 'random') for (let c = 0; c < alive.length; c++) alive[c] = Math.random() < 0.3 ? 1 : 0;
  else if (PATTERNS[kind]) {
    // place the pattern near the middle of the first face/row, as (di, dj) offsets in cell space
    const nCells = adjacency.length;
    const j0 = Math.max(0, Math.floor(dims[1] / 2) - 2);
    for (const [di, dj] of PATTERNS[kind]) {
      const j = j0 + dj;
      if (j < 0 || j >= dims[1]) continue;
      // cell index: rows of quads in generator order (face-major for the cube)
      const c = Math.floor((di % Math.max(1, Math.floor(nCells / dims[1]))) * dims[1] + j);
      if (c < nCells) alive[c] = 1;
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
  for (let t = 0; t < cellOf.length; t++) {
    const c = cellOf[t];
    if (alive[c]) tmp.copy(ALIVE);
    else tmp.copy(DEAD).lerp(GLOW, Math.min(1, heat[c] * 0.9));
    for (let k = 0; k < 3; k++) col.setXYZ(3 * t + k, tmp.r, tmp.g, tmp.b);
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
    `${dims ? `${dims[0]}×${dims[1]} = ${alive.length} quad cells` : `${alive.length} triangle cells`}   neighbour counts: ${Object.entries(hist)
      .map(([k, v]) => `${k}×${v}`)
      .join('  ')}\n` +
    `rule ${rule.text}   generation ${generation}   population ${pop}`;
}

// three.js faceIndex is mapped through the active cell layout.
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
  const c = cellOf[hit.faceIndex];
  alive[c] ^= 1;
  heat[c] = alive[c];
  paint();
});

ui.surf.onchange = ui.nu.onchange = ui.nv.onchange = ui.nbh.onchange = build;
wireMeshImport({
  button: ui.loadMesh,
  onFile: async (file) => {
    try {
      const imported = await importMeshFile(file);
      if (imported.report.nonManifoldEdges || !imported.mesh.triangles.length) {
        throw new Error('Use a surface with triangles and no non-manifold edges');
      }
      customMesh = imported.mesh;
      setCustomOption(ui.surf, `${file.name} (${imported.report.triangles} tri)`);
      ui.meshNote.textContent = describeImport(imported);
      build();
    } catch (err) {
      ui.meshNote.textContent = `Import failed: ${err.message}`;
      console.error('Mesh import failed', err);
    }
  },
});
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
