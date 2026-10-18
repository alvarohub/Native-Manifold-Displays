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
  mobiusBandMesh,
  paperMobiusMesh,
  importMesh,
} from '../../manifold-core/index.js';

let bunny = null;
let bunnyLoad = null;

function loadBunny() {
  if (!bunnyLoad) {
    bunnyLoad = (async () => {
      const response = await fetch(new URL('../assets/bunny.obj', import.meta.url));
      if (!response.ok) throw new Error(`bunny.obj: HTTP ${response.status}`);
      const { mesh, report } = importMesh('bunny.obj', await response.text());
      if (report.nonManifoldEdges || !mesh.triangles.length) throw new Error('bunny.obj: invalid surface mesh');
      bunny = mesh;
    })().catch((err) => {
      bunnyLoad = null;
      throw err;
    });
  }
  return bunnyLoad;
}

export const MESHES = {
  icosphere: { label: 'Icosphere', build: (d) => icosphereMesh(Math.min(5, d), 1.2) },
  bunny: {
    label: 'Stanford bunny (3,674 triangles)',
    fixedResolution: true,
    load: loadBunny,
    build: () => {
      if (!bunny) throw new Error('Stanford bunny is not loaded yet');
      return structuredClone(bunny);
    },
  },
  cube: {
    label: 'Cube',
    build: (d) => cubeMesh(2, 1 + d),
    life: {
      build: (nu) => cubeMesh(2, Math.max(2, Math.round(nu / 10))),
      dims: (nu) => {
        const n = Math.max(2, Math.round(nu / 10));
        return [6 * n, n];
      },
    },
  },
  torus: {
    label: 'Torus',
    build: (d) => torusMesh(1.1, 0.45, 12 * (d + 1), 6 * (d + 1)),
    life: {
      build: (nu, nv) => torusMesh(1.3, Math.min(0.75, (1.3 * nv) / nu), nu, nv),
      dims: (nu, nv) => [nu, nv],
    },
  },
  mobius: {
    label: 'Möbius band (smooth formula, K < 0)',
    build: (d) => mobiusBandMesh(1.1, 0.6, 24 * (d + 1), 2 * (d + 1), 1),
    life: {
      build: (nu, nv) => mobiusBandMesh(1.2, Math.min(1.5, (2 * Math.PI * 1.2 * nv) / nu), nu, nv, 1),
      dims: (nu, nv) => [nu, nv],
    },
  },
  mobiusPaper: {
    label: 'Möbius band (paper, flat: rim-parallel lines loop)',
    build: (d) => paperMobiusMesh(7, 0.6, 16 * (d + 1)),
  },
  mobius3: {
    label: 'Band with 3 half-twists',
    build: (d) => mobiusBandMesh(1.1, 0.45, 32 * (d + 1), 2 * (d + 1), 3),
  },
  klein: {
    label: 'Klein bottle (non-orientable)',
    build: (d) => kleinBottleMesh(0.9, 0.35, 16 * (d + 1), 6 * (d + 1)),
    life: {
      build: (nu, nv) => kleinBottleMesh(1, 0.4, nu, nv),
      dims: (nu, nv) => [nu, nv],
    },
  },
  cylinder: {
    label: 'Open cylinder',
    build: (d) => cylinderMesh(0.9, 2.2, 8 * (d + 1), 2 * (d + 1)),
    life: {
      build: (nu, nv) => cylinderMesh(1, Math.min(3, (2 * Math.PI * nv) / nu), nu, nv),
      dims: (nu, nv) => [nu, nv],
    },
  },
  plane: {
    label: 'Flat square',
    build: (d) => planeMesh(2.4, 2.4, 2 * (d + 1), 2 * (d + 1)),
    life: {
      build: (nu, nv) => planeMesh(Math.min(3, (2 * nu) / nv), 2, nu, nv),
      dims: (nu, nv) => [nu, nv],
    },
  },
  tetra: { label: 'Tetrahedron', build: () => tetrahedronMesh(1.1) },
};

export function fillMeshSelect(select) {
  for (const [k, m] of Object.entries(MESHES)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = m.label;
    select.appendChild(o);
    if (m.load) {
      o.disabled = true;
      o.textContent = `${m.label} (loading...)`;
      m.load().then(
        () => {
          o.disabled = false;
          o.textContent = m.label;
        },
        (err) => {
          o.textContent = `${m.label} (load failed)`;
          const message = document.createElement('div');
          message.className = 'hint';
          message.setAttribute('role', 'alert');
          message.textContent = `Mesh load failed: ${err.message}. Reload the page to retry.`;
          select.parentElement.after(message);
          console.error('Mesh preset load failed', err);
        },
      );
    }
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
