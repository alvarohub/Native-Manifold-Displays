// Triangle-mesh data: { positions: [[x,y,z],...], triangles: [[i,j,k],...], uvs?: [[u,v],...], triUvs?: [[a,b,c],...] }.
// Loaders (OBJ, STL), cleanup (weld, orient), stats, and primitives used as test surfaces.
import { add3, cross3, dot3, len3, lerp3, norm3, scl3, sub3 } from './vec.js';

// ---------------------------------------------------------------- loaders

export function parseOBJ(text) {
  const positions = [];
  const uvs = [];
  const triangles = [];
  const triUvs = [];
  let hasUv = false;
  const resolve = (idx, count) => (idx < 0 ? count + idx : idx - 1);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === 'v') positions.push([+parts[1], +parts[2], +parts[3]]);
    else if (tag === 'vt') uvs.push([+parts[1], +(parts[2] ?? 0)]);
    else if (tag === 'f') {
      const corners = parts.slice(1).map((tok) => {
        const [vi, ti] = tok.split('/');
        return { v: resolve(+vi, positions.length), t: ti ? resolve(+ti, uvs.length) : -1 };
      });
      // fan triangulation (fine for convex polygons, which is what OBJ quads are in practice)
      for (let i = 1; i + 1 < corners.length; i++) {
        triangles.push([corners[0].v, corners[i].v, corners[i + 1].v]);
        if (corners[0].t >= 0) {
          hasUv = true;
          triUvs.push([corners[0].t, corners[i].t, corners[i + 1].t]);
        } else triUvs.push(null);
      }
    }
  }
  const mesh = { positions, triangles };
  if (hasUv) {
    mesh.uvs = uvs;
    mesh.triUvs = triUvs;
  }
  return mesh;
}

// STL: text (ASCII) or ArrayBuffer/Uint8Array (binary or ASCII). Returns an UNWELDED soup; call weldVertices.
export function parseSTL(data) {
  if (typeof data === 'string') return parseAsciiSTL(data);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // binary iff the declared triangle count matches the file length exactly (an ASCII file starting with "solid" won't)
  const looksBinary = bytes.length >= 84 && 84 + view.getUint32(80, true) * 50 === bytes.length;
  if (!looksBinary) return parseAsciiSTL(new TextDecoder().decode(bytes));
  const count = view.getUint32(80, true);
  const positions = [];
  const triangles = [];
  let off = 84;
  for (let i = 0; i < count; i++) {
    off += 12; // normal ignored, recomputed from winding
    const base = positions.length;
    for (let k = 0; k < 3; k++) {
      positions.push([view.getFloat32(off, true), view.getFloat32(off + 4, true), view.getFloat32(off + 8, true)]);
      off += 12;
    }
    off += 2; // attribute byte count
    triangles.push([base, base + 1, base + 2]);
  }
  return { positions, triangles };
}

function parseAsciiSTL(text) {
  const positions = [];
  const triangles = [];
  const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let m;
  while ((m = re.exec(text))) positions.push([+m[1], +m[2], +m[3]]);
  for (let i = 0; i + 2 < positions.length; i += 3) triangles.push([i, i + 1, i + 2]);
  return { positions, triangles };
}

// ---------------------------------------------------------------- cleanup

// Merge vertices closer than tol (quantised hash). Keeps the first occurrence; drops degenerate triangles.
export function weldVertices(mesh, tol = 1e-6) {
  const map = new Map();
  const remap = new Array(mesh.positions.length);
  const positions = [];
  const inv = 1 / tol;
  for (let i = 0; i < mesh.positions.length; i++) {
    const p = mesh.positions[i];
    const key = `${Math.round(p[0] * inv)},${Math.round(p[1] * inv)},${Math.round(p[2] * inv)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length;
      positions.push(p);
      map.set(key, id);
    }
    remap[i] = id;
  }
  const triangles = [];
  const triUvs = mesh.triUvs ? [] : undefined;
  mesh.triangles.forEach((tri, k) => {
    const t = tri.map((i) => remap[i]);
    if (t[0] === t[1] || t[1] === t[2] || t[2] === t[0]) return;
    triangles.push(t);
    if (triUvs) triUvs.push(mesh.triUvs[k]);
  });
  const out = { positions, triangles };
  if (mesh.uvs) {
    out.uvs = mesh.uvs;
    out.triUvs = triUvs;
  }
  return out;
}

// Make winding consistent across shared edges by BFS over face adjacency (flips triangles in place).
// Returns { flipped, components, orientable }. Non-orientable meshes (Möbius) report orientable: false.
export function orientTriangles(mesh) {
  const { triangles } = mesh;
  const edgeFaces = new Map();
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  triangles.forEach((tri, f) => {
    for (let e = 0; e < 3; e++) {
      const k = key(tri[e], tri[(e + 1) % 3]);
      if (!edgeFaces.has(k)) edgeFaces.set(k, []);
      edgeFaces.get(k).push(f);
    }
  });
  const hasDirected = (tri, a, b) => {
    for (let e = 0; e < 3; e++) if (tri[e] === a && tri[(e + 1) % 3] === b) return true;
    return false;
  };
  const seen = new Uint8Array(triangles.length);
  let flipped = 0;
  let components = 0;
  let orientable = true;
  for (let root = 0; root < triangles.length; root++) {
    if (seen[root]) continue;
    components++;
    seen[root] = 1;
    const queue = [root];
    while (queue.length) {
      const f = queue.pop();
      const tri = triangles[f];
      for (let e = 0; e < 3; e++) {
        const a = tri[e];
        const b = tri[(e + 1) % 3];
        const others = edgeFaces.get(key(a, b));
        if (others.length !== 2) continue;
        const g = others[0] === f ? others[1] : others[0];
        // neighbour must traverse the shared edge as b->a
        const consistent = hasDirected(triangles[g], b, a);
        if (!seen[g]) {
          seen[g] = 1;
          if (!consistent) {
            const t = triangles[g];
            [t[1], t[2]] = [t[2], t[1]];
            flipped++;
          }
          queue.push(g);
        } else if (!consistent) orientable = false;
      }
    }
  }
  return { flipped, components, orientable };
}

// Weld, drop degenerate (zero-area) and duplicate triangles, drop unreferenced vertices. Returns the clean
// mesh and a report. `tol` is relative to the bounding-box diagonal.
export function cleanMesh(mesh, { tol = 1e-7 } = {}) {
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.positions) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
  }
  const diag = len3(sub3(hi, lo)) || 1;
  const welded = weldVertices(mesh, diag * tol);
  const seen = new Set();
  const triangles = [];
  let degenerate = 0;
  let duplicates = 0;
  const areaEps = (diag * tol) ** 2;
  for (const tri of welded.triangles) {
    const [a, b, c] = tri.map((i) => welded.positions[i]);
    if (0.5 * len3(cross3(sub3(b, a), sub3(c, a))) < areaEps) {
      degenerate++;
      continue;
    }
    const key = [...tri].sort((x, y) => x - y).join(',');
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    triangles.push(tri);
  }
  // compact vertices
  const used = new Map();
  const positions = [];
  const remapped = triangles.map((tri) =>
    tri.map((i) => {
      let j = used.get(i);
      if (j === undefined) {
        j = positions.length;
        positions.push(welded.positions[i]);
        used.set(i, j);
      }
      return j;
    }),
  );
  const out = { positions, triangles: remapped };
  const orient = orientTriangles(out);
  return {
    mesh: out,
    report: {
      inputVertices: mesh.positions.length,
      inputTriangles: mesh.triangles.length,
      vertices: positions.length,
      triangles: remapped.length,
      weldedAway: mesh.positions.length - welded.positions.length,
      degenerate,
      duplicates,
      ...orient,
      ...meshStats(out),
    },
  };
}

// One-stop import for demos and tools: filename decides the parser (OBJ text, STL text/binary);
// the mesh is cleaned, oriented and normalised to `radius` (0 = keep units).
export function importMesh(filename, data, { radius = 1.3 } = {}) {
  const name = filename.toLowerCase();
  let raw;
  if (name.endsWith('.obj')) raw = parseOBJ(typeof data === 'string' ? data : new TextDecoder().decode(data));
  else if (name.endsWith('.stl')) raw = parseSTL(data);
  else throw new Error(`unsupported mesh format: ${filename} (use .obj or .stl)`);
  if (!raw.triangles.length) throw new Error(`${filename}: no triangles found`);
  const { mesh, report } = cleanMesh(raw);
  if (radius > 0) normalizeMesh(mesh, radius);
  return { mesh, report };
}

// Binary STL writer (for tests/tools; normals recomputed from winding).
export function writeBinarySTL(mesh) {
  const F = mesh.triangles.length;
  const buf = new ArrayBuffer(84 + F * 50);
  const view = new DataView(buf);
  view.setUint32(80, F, true);
  let off = 84;
  for (let f = 0; f < F; f++) {
    const n = triangleNormal(mesh, f);
    view.setFloat32(off, n[0], true);
    view.setFloat32(off + 4, n[1], true);
    view.setFloat32(off + 8, n[2], true);
    off += 12;
    for (const i of mesh.triangles[f]) {
      const p = mesh.positions[i];
      view.setFloat32(off, p[0], true);
      view.setFloat32(off + 4, p[1], true);
      view.setFloat32(off + 8, p[2], true);
      off += 12;
    }
    off += 2;
  }
  return buf;
}

export function meshStats(mesh) {
  const edges = new Map();
  for (const tri of mesh.triangles) {
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const n of edges.values()) {
    if (n === 1) boundaryEdges++;
    else if (n > 2) nonManifoldEdges++;
  }
  const V = mesh.positions.length;
  const E = edges.size;
  const F = mesh.triangles.length;
  return { V, E, F, euler: V - E + F, boundaryEdges, nonManifoldEdges, closed: boundaryEdges === 0 };
}

// Centre the mesh on its vertex centroid and scale it so the farthest vertex sits at `radius`.
export function normalizeMesh(mesh, radius = 1) {
  const c = [0, 0, 0];
  for (const p of mesh.positions) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  const n = mesh.positions.length || 1;
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  let r = 0;
  for (const p of mesh.positions) r = Math.max(r, len3(sub3(p, c)));
  const s = radius / (r || 1);
  mesh.positions = mesh.positions.map((p) => scl3(sub3(p, c), s));
  return mesh;
}

export function triangleNormal(mesh, f) {
  const [a, b, c] = mesh.triangles[f].map((i) => mesh.positions[i]);
  return norm3(cross3(sub3(b, a), sub3(c, a)));
}

export function triangleArea(mesh, f) {
  const [a, b, c] = mesh.triangles[f].map((i) => mesh.positions[i]);
  return 0.5 * len3(cross3(sub3(b, a), sub3(c, a)));
}

// Flip every triangle so normals point away from the centroid (only meaningful for star-shaped meshes).
export function orientOutward(mesh) {
  const c = mesh.positions.reduce((acc, p) => add3(acc, p), [0, 0, 0]).map((v) => v / mesh.positions.length);
  for (let f = 0; f < mesh.triangles.length; f++) {
    const tri = mesh.triangles[f];
    const centre = scl3(add3(add3(mesh.positions[tri[0]], mesh.positions[tri[1]]), mesh.positions[tri[2]]), 1 / 3);
    if (dot3(triangleNormal(mesh, f), sub3(centre, c)) < 0) [tri[1], tri[2]] = [tri[2], tri[1]];
  }
  return mesh;
}

// ---------------------------------------------------------------- primitives (all CCW-outward, welded)

// Axis-aligned cube of edge `size`, each face split into div×div quads (2 triangles each).
export function cubeMesh(size = 2, div = 1) {
  const h = size / 2;
  const faces = [
    { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
  ];
  const positions = [];
  const triangles = [];
  for (const { n, u, v } of faces) {
    const base = positions.length;
    for (let j = 0; j <= div; j++) {
      for (let i = 0; i <= div; i++) {
        const a = -h + (size * i) / div;
        const b = -h + (size * j) / div;
        positions.push(add3(scl3(n, h), add3(scl3(u, a), scl3(v, b))));
      }
    }
    for (let j = 0; j < div; j++) {
      for (let i = 0; i < div; i++) {
        const p00 = base + j * (div + 1) + i;
        const p10 = p00 + 1;
        const p01 = p00 + div + 1;
        const p11 = p01 + 1;
        triangles.push([p00, p10, p11], [p00, p11, p01]);
      }
    }
  }
  return weldVertices({ positions, triangles }, size * 1e-9);
}

export function icosphereMesh(subdivisions = 1, radius = 1) {
  const phi = (1 + Math.sqrt(5)) / 2;
  let positions = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ].map((p) => scl3(norm3(p), radius));
  let triangles = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map();
    const mid = (a, b) => {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      let id = cache.get(k);
      if (id === undefined) {
        id = positions.length;
        positions.push(scl3(norm3(lerp3(positions[a], positions[b], 0.5)), radius));
        cache.set(k, id);
      }
      return id;
    };
    const next = [];
    for (const [a, b, c] of triangles) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    triangles = next;
  }
  return { positions, triangles };
}

export function torusMesh(R = 1.5, r = 0.5, nu = 32, nv = 16) {
  const positions = [];
  const triangles = [];
  for (let i = 0; i < nu; i++) {
    const a = (i / nu) * Math.PI * 2;
    for (let j = 0; j < nv; j++) {
      const b = (j / nv) * Math.PI * 2;
      positions.push([(R + r * Math.cos(b)) * Math.cos(a), (R + r * Math.cos(b)) * Math.sin(a), r * Math.sin(b)]);
    }
  }
  const id = (i, j) => ((i + nu) % nu) * nv + ((j + nv) % nv);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  return { positions, triangles };
}

// Open cylinder (no caps): a developable surface with two boundary loops.
export function cylinderMesh(radius = 1, height = 2, n = 24, rings = 1) {
  const positions = [];
  const triangles = [];
  for (let j = 0; j <= rings; j++) {
    const z = -height / 2 + (height * j) / rings;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      positions.push([radius * Math.cos(a), radius * Math.sin(a), z]);
    }
  }
  const id = (i, j) => j * n + ((i + n) % n);
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < n; i++) {
      triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  return { positions, triangles };
}

// Flat rectangle in the z=0 plane (normal +z), nx×ny quads.
export function planeMesh(width = 2, height = 2, nx = 4, ny = 4) {
  const positions = [];
  const triangles = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) positions.push([-width / 2 + (width * i) / nx, -height / 2 + (height * j) / ny, 0]);
  }
  const id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  return { positions, triangles };
}

export function tetrahedronMesh(size = 1) {
  const s = size;
  const positions = [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s],
  ];
  const triangles = [
    [0, 1, 2],
    [0, 3, 1],
    [0, 2, 3],
    [1, 3, 2],
  ];
  return { positions, triangles };
}

// Figure-8 immersion of the Klein bottle: a closed NON-ORIENTABLE surface (χ = 0, self-intersecting in 3D).
// Useful as a stress test: gluings must handle orientation-reversing transitions.
export function kleinBottleMesh(R = 1.0, r = 0.4, nu = 64, nv = 24) {
  const positions = [];
  for (let i = 0; i < nu; i++) {
    const u = (i / nu) * 2 * Math.PI;
    for (let j = 0; j < nv; j++) {
      // half-step offset: the figure-8 curve passes through its centre at v = 0 and v = π, which would make two
      // vertex rings coincide in 3D; sampling between them keeps the self-intersection off the vertices
      const v = ((j + 0.5) / nv) * 2 * Math.PI;
      const w = R + r * Math.cos(u / 2) * Math.sin(v) - r * Math.sin(u / 2) * Math.sin(2 * v);
      positions.push([
        w * Math.cos(u),
        w * Math.sin(u),
        r * Math.sin(u / 2) * Math.sin(v) + r * Math.cos(u / 2) * Math.sin(2 * v),
      ]);
    }
  }
  // the u-seam glues with v -> -v (the Möbius identification): j -> nv - 1 - j with the half-step grid
  const id = (i, j) => {
    let ii = i;
    let jj = ((j % nv) + nv) % nv;
    if (ii >= nu) {
      ii -= nu;
      jj = nv - 1 - jj;
    }
    return ii * nv + jj;
  };
  const triangles = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  return { positions, triangles };
}
