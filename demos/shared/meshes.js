// Built-in surfaces shared by the demos, plus the file-import glue (file picker + drag & drop) that hands
// files to the library's importMesh. Demo-side: knows about DOM and files, not about geometry.
import {
  cubeMesh,
  icosphereMesh,
  torusMesh,
  cylinderMesh,
  planeMesh,
  tetrahedronMesh,
  kleinBottleMesh,
  importMesh,
} from '../../manifold-core/index.js';

export const MESHES = {
  icosphere: { label: 'Icosphere', build: (d) => icosphereMesh(Math.min(5, d), 1.2) },
  cube: { label: 'Cube', build: (d) => cubeMesh(2, 1 + d) },
  torus: { label: 'Torus', build: (d) => torusMesh(1.1, 0.45, 12 * (d + 1), 6 * (d + 1)) },
  klein: {
    label: 'Klein bottle (non-orientable)',
    build: (d) => kleinBottleMesh(0.9, 0.35, 16 * (d + 1), 6 * (d + 1)),
  },
  cylinder: { label: 'Open cylinder', build: (d) => cylinderMesh(0.9, 2.2, 8 * (d + 1), 2 * (d + 1)) },
  plane: { label: 'Flat square', build: (d) => planeMesh(2.4, 2.4, 2 * (d + 1), 2 * (d + 1)) },
  tetra: { label: 'Tetrahedron', build: () => tetrahedronMesh(1.1) },
};

export function fillMeshSelect(select) {
  for (const [k, m] of Object.entries(MESHES)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = m.label;
    select.appendChild(o);
  }
}

// Read a File and import it through the library. Returns { mesh, report, name }.
export async function importMeshFile(file, radius = 1.3) {
  const name = file.name.toLowerCase();
  const data = name.endsWith('.obj') ? await file.text() : await file.arrayBuffer();
  const { mesh, report } = importMesh(file.name, data, { radius });
  return { mesh, report, name: file.name };
}

export function describeImport({ name, report }) {
  const flags = [];
  if (!report.orientable) flags.push('non-orientable');
  if (!report.closed) flags.push(`${report.boundaryEdges} boundary edges`);
  if (report.nonManifoldEdges) flags.push(`${report.nonManifoldEdges} non-manifold edges`);
  if (report.components > 1) flags.push(`${report.components} components`);
  return (
    `${name}: ${report.triangles} triangles, ${report.vertices} vertices, χ=${report.euler}` +
    (flags.length ? ` (${flags.join(', ')})` : '') +
    `\ncleaned: ${report.weldedAway} welded, ${report.degenerate} degenerate, ${report.duplicates} duplicates` +
    (report.flipped ? `, ${report.flipped} triangles re-wound` : '')
  );
}

// Wire a "Load mesh…" button (hidden <input type=file>) and window drag & drop to one handler.
export function wireMeshImport({ button, accept = '.obj,.stl', onFile }) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  document.body.appendChild(input);
  button.onclick = () => input.click();
  input.onchange = () => {
    if (input.files?.[0]) onFile(input.files[0]);
    input.value = '';
  };
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', () => document.body.classList.remove('dragging'));
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}

// Add/replace the "custom" option in a mesh <select>.
export function setCustomOption(select, label) {
  let opt = select.querySelector('option[value="custom"]');
  if (!opt) {
    opt = document.createElement('option');
    opt.value = 'custom';
    select.appendChild(opt);
  }
  opt.textContent = label;
  select.value = 'custom';
}
