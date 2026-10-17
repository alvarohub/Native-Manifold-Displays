// Surface = atlas of flat polygonal charts glued by rigid transition maps p' = M p + t.
// Built from a triangle mesh (Surface.fromMesh) or from hand-glued charts (Surface.fromCharts).
// A point on the surface is { faceId, x, y } in that chart's 2D frame; 3D is only used to
// build the gluings and to embed for display (to3D).
import {
  EPS,
  add3,
  sub3,
  scl3,
  dot3,
  cross3,
  len3,
  norm3,
  sub2,
  cross2,
  norm2,
  len2,
  apply2,
  matMul2,
  transpose2,
  colsToMat2,
  det2,
} from './vec.js';
import {
  trace as traceGeodesic,
  firstExit,
  cornerAngle,
  vertexFan,
  holonomy,
  coneContinuation,
  develop,
  logMap,
  distance,
  transportAlong,
} from './geodesic.js';
import { curvatureAt, normalAt, gaussianCurvatureAt, curvatureTensor } from './curvature.js';
import { raycast } from './raycast.js';

export class Surface {
  constructor({ faces, name = 'surface', vertices = null, mesh = null, ...meta }) {
    this.name = name;
    this.faces = faces;
    this.vertices = vertices; // [{ position, corners: [{faceId, corner}], angleSum, boundary }] or null
    this.mesh = mesh;
    Object.assign(this, meta);
    this._byId = new Map(faces.map((f) => [f.id, f]));
  }

  // ------------------------------------------------------------ builders

  // mesh: { positions, triangles }. Winding defines the chart orientation (u, v, n right-handed).
  static fromMesh(mesh, { name = 'mesh', tolerance = 1e-9 } = {}) {
    const { positions, triangles } = mesh;
    // degenerate triangles have no chart frame: skip them (ids stay = index into `triangles`)
    const faces = [];
    let degenerate = 0;
    triangles.forEach((tri, id) => {
      const f = triangleChart(id, tri, positions);
      if (f.area > 0 && Number.isFinite(f.n[0]) && Number.isFinite(f.u[0])) faces.push(f);
      else degenerate++;
    });

    // O(F) adjacency: undirected edge key -> [{faceId, edge}]
    const edgeMap = new Map();
    for (const face of faces) {
      for (let e = 0; e < 3; e++) {
        const a = face.vidx[e];
        const b = face.vidx[(e + 1) % 3];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key).push({ faceId: face.id, edge: e });
      }
    }
    let boundaryEdges = 0;
    let nonManifoldEdges = 0;
    let orientationConsistent = true;
    for (const users of edgeMap.values()) {
      if (users.length === 1) {
        boundaryEdges++;
        continue;
      }
      if (users.length > 2) {
        nonManifoldEdges++;
        continue;
      }
      const [A, B] = users.map((u) => faces[u.faceId]);
      const [ea, eb] = users.map((u) => u.edge);
      // consistent winding traverses the shared edge in opposite directions
      if (A.vidx[ea] !== B.vidx[(eb + 1) % 3]) orientationConsistent = false;
      const P0 = positions[A.vidx[ea]];
      const P1 = positions[A.vidx[(ea + 1) % 3]];
      A.edges[ea] = transition(A, ea, B, eb, [P0, P1]);
      B.edges[eb] = transition(B, eb, A, ea, [P0, P1]);
    }

    // vertex table: incident corners, angle sums, boundary flags
    const vertices = positions.map((position) => ({ position, corners: [], angleSum: 0, boundary: false }));
    for (const face of faces) {
      for (let c = 0; c < 3; c++) {
        const vtx = vertices[face.vidx[c]];
        vtx.corners.push({ faceId: face.id, corner: c });
        vtx.angleSum += cornerAngle(face.verts2, c);
        if (!face.edges[c]) vtx.boundary = true; // edge c starts at corner c
        if (!face.edges[(c + 2) % 3]) vtx.boundary = true; // edge c-1 ends at corner c
      }
    }

    return new Surface({
      name,
      faces,
      vertices,
      mesh,
      kind: 'mesh',
      boundaryEdges,
      nonManifoldEdges,
      edgeCount: edgeMap.size,
      orientationConsistent,
      degenerateFaces: degenerate,
      tolerance,
    });
  }

  // faces: [{ id, verts2, edges: [{toFaceId, toEdge, M, t} | null], C?, u?, v?, n? }] already glued.
  static fromCharts(faces, meta = {}) {
    for (const face of faces) {
      face.C ??= [0, 0, 0];
      face.u ??= [1, 0, 0];
      face.v ??= [0, 1, 0];
      face.n ??= [0, 0, 1];
      face.edges = face.edges.map((e) => (e && e.toFaceId != null ? e : null));
      face.size ??= chartSize(face.verts2);
    }
    return new Surface({ faces, kind: 'charts', ...meta });
  }

  // ------------------------------------------------------------ queries

  faceById(id) {
    return this._byId.get(id);
  }

  to3D(point) {
    const f = this.faceById(point.faceId);
    return add3(f.C, add3(scl3(f.u, point.x), scl3(f.v, point.y)));
  }

  normal(faceId) {
    return this.faceById(faceId).n;
  }

  // 3D point (assumed on the face plane) -> chart coordinates
  toChart(faceId, p) {
    const f = this.faceById(faceId);
    const d = sub3(p, f.C);
    return [dot3(d, f.u), dot3(d, f.v)];
  }

  // barycentric coordinates w.r.t. the chart's polygon (triangles only)
  barycentric(faceId, x, y) {
    const [a, b, c] = this.faceById(faceId).verts2;
    const det = cross2(sub2(b, a), sub2(c, a));
    const l1 = cross2(sub2([x, y], a), sub2(c, a)) / det;
    const l2 = cross2(sub2(b, a), sub2([x, y], a)) / det;
    return [1 - l1 - l2, l1, l2];
  }

  fromBarycentric(faceId, l) {
    const [a, b, c] = this.faceById(faceId).verts2;
    return { faceId, x: l[0] * a[0] + l[1] * b[0] + l[2] * c[0], y: l[0] * a[1] + l[1] * b[1] + l[2] * c[1] };
  }

  contains(faceId, x, y, tol = 1e-9) {
    const verts = this.faceById(faceId).verts2;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      if (cross2(sub2(b, a), sub2([x, y], a)) < -tol) return false;
    }
    return true;
  }

  centroid(faceId) {
    const verts = this.faceById(faceId).verts2;
    const s = verts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return { faceId, x: s[0] / verts.length, y: s[1] / verts.length };
  }

  // ------------------------------------------------------------ curvature (intrinsic, exact)

  // Angle deficit per vertex: 2π − Σ angles (interior) or π − Σ angles (boundary = turning angle).
  vertexCones() {
    if (!this.vertices) return [];
    return this.vertices
      .map((v, index) => ({
        vertex: index,
        position: v.position,
        boundary: v.boundary,
        angleSum: v.angleSum,
        deficit: (v.boundary ? Math.PI : 2 * Math.PI) - v.angleSum,
        valence: v.corners.length,
      }))
      .filter((c) => c.valence > 0);
  }

  // Σ deficits (interior) + Σ boundary turning = 2πχ (Gauss–Bonnet, discrete form).
  totalDeficit() {
    return this.vertexCones().reduce((s, c) => s + c.deficit, 0);
  }

  eulerCharacteristic() {
    if (!this.vertices) return null;
    const V = this.vertices.filter((v) => v.corners.length > 0).length;
    return V - this.edgeCount + this.faces.length;
  }

  // ------------------------------------------------------------ geodesics (see geodesic.js)

  trace(point, dir, length, opts) {
    return traceGeodesic(this, point, dir, length, opts);
  }

  vertexFan(faceId, corner) {
    return vertexFan(this, faceId, corner);
  }

  holonomy(faceId, corner) {
    return holonomy(this, faceId, corner);
  }

  coneContinuation(faceId, corner, dir) {
    return coneContinuation(this, faceId, corner, dir);
  }

  develop(faceId, R) {
    return develop(this, faceId, R);
  }

  logMap(a, b, opts) {
    return logMap(this, a, b, opts);
  }

  distance(a, b, opts) {
    return distance(this, a, b, opts);
  }

  transportAlong(crossings, vec) {
    return transportAlong(this, crossings, vec);
  }

  clearDisks() {
    this._disks = new Map();
  }

  // ------------------------------------------------------------ smooth estimators (see curvature.js)

  curvatureAt(point, dir) {
    return curvatureAt(this, point, dir);
  }

  normalAt(point) {
    return normalAt(this, point);
  }

  gaussianCurvatureAt(point) {
    return gaussianCurvatureAt(this, point);
  }

  curvatureTensor() {
    return curvatureTensor(this);
  }

  raycast(origin, dir, opts) {
    return raycast(this, origin, dir, opts);
  }

  // ------------------------------------------------------------ motion

  // Advance head {faceId, x, y, vx, vy} by dt along its straightest geodesic (speed preserved).
  // Returns the trace's events with crossings as { type: 'edge', ... }.
  stepHead(head, dt, opts) {
    const speed = Math.hypot(head.vx, head.vy);
    if (speed < EPS || dt <= 0) return [];
    const r = traceGeodesic(this, head, [head.vx / speed, head.vy / speed], speed * dt, opts);
    head.faceId = r.end.faceId;
    head.x = r.end.x;
    head.y = r.end.y;
    head.vx = r.dir[0] * speed;
    head.vy = r.dir[1] * speed;
    return [...r.crossings.map((c) => ({ type: 'edge', ...c })), ...r.events];
  }
}

// ---------------------------------------------------------------- chart construction

function triangleChart(id, vidx, positions) {
  const [a, b, c] = vidx.map((i) => positions[i]);
  const n = norm3(cross3(sub3(b, a), sub3(c, a)));
  const u = norm3(sub3(b, a));
  const v = cross3(n, u);
  const C = scl3(add3(add3(a, b), c), 1 / 3);
  const to2 = (p) => [dot3(sub3(p, C), u), dot3(sub3(p, C), v)];
  const verts2 = [to2(a), to2(b), to2(c)];
  return {
    id,
    vidx: [...vidx],
    C,
    u,
    v,
    n,
    verts3: [a, b, c],
    verts2,
    edges: [null, null, null],
    size: chartSize(verts2),
    area: 0.5 * len3(cross3(sub3(b, a), sub3(c, a))),
  };
}

function chartSize(verts2) {
  let m = 0;
  for (let i = 0; i < verts2.length; i++) m = Math.max(m, len2(sub2(verts2[(i + 1) % verts2.length], verts2[i])));
  return m;
}

// Rigid map from chart A to chart B across their shared edge (two candidate isometries, interior probe).
// See docs/GEODESIC_MOTION.md §4.
function transition(A, edgeA, B, edgeB, [P0, P1]) {
  const to2D = (face, p) => [dot3(sub3(p, face.C), face.u), dot3(sub3(p, face.C), face.v)];
  const aA = to2D(A, P0);
  const bA = to2D(A, P1);
  const aB = to2D(B, P0);
  const bB = to2D(B, P1);
  const e1A = norm2(sub2(bA, aA));
  const e2A = [-e1A[1], e1A[0]];
  const e1B = norm2(sub2(bB, aB));
  const e2B = [-e1B[1], e1B[0]];
  const invA = transpose2(colsToMat2(e1A, e2A));
  const Mpres = matMul2(colsToMat2(e1B, e2B), invA);
  const Mrev = matMul2(colsToMat2(e1B, [-e2B[0], -e2B[1]]), invA);
  const tFor = (M) => {
    const img = apply2(M, aA);
    return [aB[0] - img[0], aB[1] - img[1]];
  };
  const tPres = tFor(Mpres);
  const tRev = tFor(Mrev);
  const midA = [(aA[0] + bA[0]) / 2, (aA[1] + bA[1]) / 2];
  const midB = [(aB[0] + bB[0]) / 2, (aB[1] + bB[1]) / 2];
  const edgeLen = len2(sub2(bA, aA));
  const outA = norm2(midA); // chart origin is the centroid, so this points out of A
  const inB = norm2([-midB[0], -midB[1]]);
  const probe = [midA[0] + 1e-3 * edgeLen * outA[0], midA[1] + 1e-3 * edgeLen * outA[1]];
  const score = (M, t) => {
    const p = apply2(M, probe);
    return (p[0] + t[0] - midB[0]) * inB[0] + (p[1] + t[1] - midB[1]) * inB[1];
  };
  const useRev = score(Mrev, tRev) > score(Mpres, tPres);
  const M = useRev ? Mrev : Mpres;
  return { toFaceId: B.id, toEdge: edgeB, M, t: useRev ? tRev : tPres, length: edgeLen, reflects: det2(M) < 0 };
}

export { transition as _transition, firstExit as _firstExit };
