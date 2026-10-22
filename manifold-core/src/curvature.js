// Curvature on a Surface built from a mesh.
// Exact polyhedral objects: angle deficits (Surface.vertexCones), signed dihedral angles (dihedralAngles).
// Estimators of the smooth surface (see docs/DISCRETE_TO_SMOOTH.md): vertexAreas, vertexNormals,
// gaussianCurvature (deficit / area), meanCurvature (Steiner: Σ ℓ·θ / 4A), curvatureTensor
// (Rusinkiewicz 2004 per-face least squares, averaged at vertices), curvatureAt / normalAt (barycentric).
// Sign convention: convex surfaces with outward normals have positive curvature (sphere: κ = +1/r).
import { add3, sub3, scl3, dot3, cross3, len3, norm3 } from './vec.js';

// Unique embedded mesh edges. angle is unsigned bending in radians (zero = coplanar).
// Orient the two incident normals consistently across this edge only: no global orientation is
// required, including on a Möbius band. Boundary/nonmanifold edges have no two-face angle.
export function surfaceEdges(surface) {
  if (!surface.mesh || !surface.vertices) throw new Error('surfaceEdges requires an embedded mesh surface');
  const edges = new Map();
  for (const face of surface.faces) {
    for (let e = 0; e < face.vidx.length; e++) {
      const from = face.vidx[e], to = face.vidx[(e + 1) % face.vidx.length];
      const a = Math.min(from, to), b = Math.max(from, to), key = `${a}:${b}`;
      if (!edges.has(key)) edges.set(key, { a, b, sides: [] });
      edges.get(key).sides.push({ faceId: face.id, edge: e, from, to });
    }
  }
  return [...edges.values()].map(({ a, b, sides }) => {
    let angle = null;
    if (sides.length === 2) {
      const [A, B] = sides;
      const orientation = A.from === B.from ? -1 : 1;
      const nA = surface.faceById(A.faceId).n, nB = surface.faceById(B.faceId).n;
      // atan2 remains accurate near coplanarity, unlike acos of a dot product near one.
      angle = Math.atan2(len3(cross3(nA, nB)), orientation * dot3(nA, nB));
    }
    return { a, b, sides, angle, boundary: sides.length === 1, nonManifold: sides.length > 2 };
  });
}

// ---------------------------------------------------------------- per-vertex scalars

export function vertexAreas(surface) {
  const A = new Float64Array(surface.vertices.length);
  for (const f of surface.faces) for (const vi of f.vidx) A[vi] += f.area / 3;
  return A;
}

// Angle-weighted vertex normals (Thürmer–Wüthrich).
export function vertexNormals(surface) {
  const N = surface.vertices.map(() => [0, 0, 0]);
  for (const f of surface.faces) {
    for (let c = 0; c < 3; c++) {
      const w = cornerAngle3(f.verts3, c);
      const vi = f.vidx[c];
      N[vi] = add3(N[vi], scl3(f.n, w));
    }
  }
  return N.map(norm3);
}

function cornerAngle3(verts3, c) {
  const p = verts3[c];
  const e1 = sub3(verts3[(c + 1) % 3], p);
  const e2 = sub3(verts3[(c + 2) % 3], p);
  return Math.acos(Math.max(-1, Math.min(1, dot3(e1, e2) / (len3(e1) * len3(e2)))));
}

// Gaussian curvature estimate K_v = deficit / barycentric area (interior vertices; boundary → NaN).
export function gaussianCurvature(surface) {
  const A = vertexAreas(surface);
  const K = new Float64Array(surface.vertices.length);
  surface.vertices.forEach((v, i) => {
    K[i] = v.corners.length === 0 || v.boundary ? NaN : (2 * Math.PI - v.angleSum) / A[i];
  });
  return K;
}

// Signed dihedral angle per half-edge (face f, edge e): > 0 convex (neighbour bends away from f's normal).
// Returns Map `${faceId}:${edge}` -> angle; boundary edges absent.
export function dihedralAngles(surface) {
  const out = new Map();
  for (const f of surface.faces) {
    f.edges.forEach((g, e) => {
      if (!g) return;
      const B = surface.faceById(g.toFaceId);
      const cosT = Math.max(-1, Math.min(1, dot3(f.n, B.n)));
      const convex = dot3(sub3(B.C, f.C), f.n) < 0;
      out.set(`${f.id}:${e}`, (convex ? 1 : -1) * Math.acos(cosT));
    });
  }
  return out;
}

// Mean curvature estimate H_v = (1 / 4A_v) Σ_{e ∋ v} ℓ_e θ_e (each edge counted once).
export function meanCurvature(surface) {
  const A = vertexAreas(surface);
  const H = new Float64Array(surface.vertices.length);
  const theta = dihedralAngles(surface);
  for (const f of surface.faces) {
    f.edges.forEach((g, e) => {
      if (!g) return;
      if (g.toFaceId < f.id) return; // visit each undirected edge once
      const a = f.vidx[e];
      const b = f.vidx[(e + 1) % 3];
      const contrib = g.length * theta.get(`${f.id}:${e}`);
      H[a] += contrib / 4;
      H[b] += contrib / 4;
    });
  }
  for (let i = 0; i < H.length; i++) H[i] = surface.vertices[i].boundary ? NaN : H[i] / A[i];
  return H;
}

// ---------------------------------------------------------------- curvature tensor (Rusinkiewicz 2004)

// Rotate the frame (u, v) with normal u×v into the plane of normal `nOld` by the minimal rotation (in place copy).
function rotateCoordSys(u, v, nOld) {
  let nNew = cross3(u, v);
  const ndot = dot3(nNew, nOld);
  if (ndot <= -1) return [scl3(u, -1), scl3(v, -1)];
  const perpOld = sub3(nOld, scl3(nNew, ndot));
  const dperp = scl3(add3(nNew, nOld), 1 / (1 + ndot));
  return [sub3(u, scl3(dperp, dot3(u, perpOld))), sub3(v, scl3(dperp, dot3(v, perpOld)))];
}

// Re-express a 2x2 symmetric tensor {a, b, c} given in frame (uOld, vOld, nOld) in a new frame (uNew, vNew).
function projectTensor(T, uOld, vOld, nOld, uNew, vNew) {
  const [ru, rv] = rotateCoordSys(uNew, vNew, nOld);
  const u1 = dot3(ru, uOld);
  const v1 = dot3(ru, vOld);
  const u2 = dot3(rv, uOld);
  const v2 = dot3(rv, vOld);
  return {
    a: T.a * u1 * u1 + 2 * T.b * u1 * v1 + T.c * v1 * v1,
    b: T.a * u1 * u2 + T.b * (u1 * v2 + u2 * v1) + T.c * v1 * v2,
    c: T.a * u2 * u2 + 2 * T.b * u2 * v2 + T.c * v2 * v2,
  };
}

// Per-face second fundamental form in the face chart frame (u, v), by least squares on the three edges:
// II · (e·u, e·v) = (Δn·u, Δn·v) for each edge e with normal difference Δn between its endpoints.
export function faceCurvatureTensors(surface, normals = vertexNormals(surface)) {
  return surface.faces.map((f) => {
    // normal equations for unknowns (a, b, c): rows [eu, ev, 0] -> Δnu ; [0, eu, ev] -> Δnv
    let m00 = 0,
      m01 = 0,
      m02 = 0,
      m11 = 0,
      m12 = 0,
      m22 = 0;
    let r0 = 0,
      r1 = 0,
      r2 = 0;
    for (let e = 0; e < 3; e++) {
      const i = f.vidx[e];
      const j = f.vidx[(e + 1) % 3];
      const E = sub3(f.verts3[(e + 1) % 3], f.verts3[e]);
      const dN = sub3(normals[j], normals[i]);
      const eu = dot3(E, f.u);
      const ev = dot3(E, f.v);
      const nu = dot3(dN, f.u);
      const nv = dot3(dN, f.v);
      // row 1: a*eu + b*ev = nu
      m00 += eu * eu;
      m01 += eu * ev;
      m11 += ev * ev;
      r0 += eu * nu;
      r1 += ev * nu;
      // row 2: b*eu + c*ev = nv
      m11 += eu * eu;
      m12 += eu * ev;
      m22 += ev * ev;
      r1 += eu * nv;
      r2 += ev * nv;
    }
    const [a, b, c] = solve3Sym(m00, m01, m02, m11, m12, m22, r0, r1, r2);
    return { a, b, c };
  });
}

function solve3Sym(m00, m01, m02, m11, m12, m22, r0, r1, r2) {
  const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02);
  if (Math.abs(det) < 1e-30) return [0, 0, 0];
  const i00 = (m11 * m22 - m12 * m12) / det;
  const i01 = (m02 * m12 - m01 * m22) / det;
  const i02 = (m01 * m12 - m02 * m11) / det;
  const i11 = (m00 * m22 - m02 * m02) / det;
  const i12 = (m02 * m01 - m00 * m12) / det;
  const i22 = (m00 * m11 - m01 * m01) / det;
  return [i00 * r0 + i01 * r1 + i02 * r2, i01 * r0 + i11 * r1 + i12 * r2, i02 * r0 + i12 * r1 + i22 * r2];
}

// Per-vertex tensor: corner-angle-weighted average of incident face tensors re-expressed in the vertex
// tangent frame (u, v, n). Returns [{ a, b, c, u, v, n, k1, k2, dir1, dir2 }] (k1 ≥ k2, dirs in 3D).
export function curvatureTensor(surface) {
  if (surface._curvature) return surface._curvature;
  const normals = vertexNormals(surface);
  const faceT = faceCurvatureTensors(surface, normals);
  const acc = surface.vertices.map(() => ({ a: 0, b: 0, c: 0, w: 0 }));
  const frames = surface.vertices.map((v, i) => {
    const n = normals[i];
    const seed = v.corners.length ? surface.faceById(v.corners[0].faceId).u : [1, 0, 0];
    let u = sub3(seed, scl3(n, dot3(seed, n)));
    if (len3(u) < 1e-9) u = sub3([0, 1, 0], scl3(n, n[1]));
    u = norm3(u);
    return { u, v: cross3(n, u), n };
  });
  for (const f of surface.faces) {
    const T = faceT[f.id];
    for (let c = 0; c < 3; c++) {
      const vi = f.vidx[c];
      const fr = frames[vi];
      const P = projectTensor(T, f.u, f.v, f.n, fr.u, fr.v);
      const w = cornerAngle3(f.verts3, c);
      const A = acc[vi];
      A.a += w * P.a;
      A.b += w * P.b;
      A.c += w * P.c;
      A.w += w;
    }
  }
  const result = acc.map((A, i) => {
    const fr = frames[i];
    if (A.w === 0) return { ...fr, a: 0, b: 0, c: 0, k1: 0, k2: 0, dir1: fr.u, dir2: fr.v };
    const T = { a: A.a / A.w, b: A.b / A.w, c: A.c / A.w };
    const { k1, k2, e1, e2 } = eigen2(T);
    return {
      ...T,
      ...fr,
      k1,
      k2,
      dir1: add3(scl3(fr.u, e1[0]), scl3(fr.v, e1[1])),
      dir2: add3(scl3(fr.u, e2[0]), scl3(fr.v, e2[1])),
    };
  });
  surface._curvature = { normals, faceT, vertex: result, frames };
  return surface._curvature;
}

// Eigen-decomposition of a symmetric 2x2 {a, b, c}; k1 ≥ k2 with unit eigenvectors.
export function eigen2({ a, b, c }) {
  const tr = a + c;
  const d = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b));
  const k1 = tr / 2 + d;
  const k2 = tr / 2 - d;
  let e1;
  if (Math.abs(b) > 1e-14) e1 = [k1 - c, b];
  else e1 = a >= c ? [1, 0] : [0, 1];
  const n = Math.hypot(e1[0], e1[1]);
  e1 = [e1[0] / n, e1[1] / n];
  return { k1, k2, e1, e2: [-e1[1], e1[0]] };
}

// ---------------------------------------------------------------- pointwise queries

export function normalAt(surface, point) {
  const { normals } = curvatureTensor(surface);
  const f = surface.faceById(point.faceId);
  const l = surface.barycentric(point.faceId, point.x, point.y);
  return norm3(
    add3(add3(scl3(normals[f.vidx[0]], l[0]), scl3(normals[f.vidx[1]], l[1])), scl3(normals[f.vidx[2]], l[2])),
  );
}

// Second fundamental form at a chart point, in the chart (u, v) frame, by barycentric interpolation of the
// vertex tensors re-expressed in the face frame. Optional chart direction `dir` gives κ_n = dᵀ II d.
export function curvatureAt(surface, point, dir = null) {
  const C = curvatureTensor(surface);
  const f = surface.faceById(point.faceId);
  C.faceVertexT ??= new Map();
  let VT = C.faceVertexT.get(f.id);
  if (!VT) {
    VT = f.vidx.map((vi) => {
      const T = C.vertex[vi];
      return projectTensor(T, T.u, T.v, T.n, f.u, f.v);
    });
    C.faceVertexT.set(f.id, VT);
  }
  const l = surface.barycentric(point.faceId, point.x, point.y);
  const II = {
    a: l[0] * VT[0].a + l[1] * VT[1].a + l[2] * VT[2].a,
    b: l[0] * VT[0].b + l[1] * VT[1].b + l[2] * VT[2].b,
    c: l[0] * VT[0].c + l[1] * VT[1].c + l[2] * VT[2].c,
  };
  const { k1, k2, e1, e2 } = eigen2(II);
  const out = { II, k1, k2, dir1: e1, dir2: e2, H: (k1 + k2) / 2, K: k1 * k2 };
  if (dir) {
    const n = Math.hypot(dir[0], dir[1]) || 1;
    const d = [dir[0] / n, dir[1] / n];
    out.kn = II.a * d[0] * d[0] + 2 * II.b * d[0] * d[1] + II.c * d[1] * d[1];
    // geodesic torsion of a curve with tangent d: τ_g = (k2 − k1) sinφ cosφ, φ = angle from dir1
    const cosP = d[0] * e1[0] + d[1] * e1[1];
    const sinP = d[0] * e2[0] + d[1] * e2[1];
    out.tauG = (k2 - k1) * sinP * cosP;
  }
  return out;
}

// Interpolated deficit-based Gaussian curvature at a chart point (intrinsic estimator).
export function gaussianCurvatureAt(surface, point) {
  surface._K ??= gaussianCurvature(surface);
  const f = surface.faceById(point.faceId);
  const l = surface.barycentric(point.faceId, point.x, point.y);
  let K = 0;
  let w = 0;
  for (let i = 0; i < 3; i++) {
    const k = surface._K[f.vidx[i]];
    if (Number.isNaN(k)) continue;
    K += l[i] * k;
    w += l[i];
  }
  return w > 0 ? K / w : NaN;
}
