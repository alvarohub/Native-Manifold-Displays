import { assert, near, nearVec } from './assert.mjs';
import { Surface, cubeMesh, icosphereMesh, planeMesh, cylinderMesh, torusMesh, shortestPath } from '../manifold-core/index.js';
import { sub3, len3, dot3, add3, scl3, norm3 } from '../manifold-core/src/vec.js';

// chart point on a face containing 3D point P (P must lie on the surface)
function chartPointAt(s, P) {
  for (const f of s.faces) {
    if (Math.abs(dot3(sub3(P, f.C), f.n)) > 1e-9) continue;
    const [x, y] = s.toChart(f.id, P);
    if (s.contains(f.id, x, y, 1e-9)) return { faceId: f.id, x, y };
  }
  throw new Error(`no face contains ${P}`);
}

function chartDir(s, faceId, d3) {
  const f = s.faceById(faceId);
  return [dot3(d3, f.u), dot3(d3, f.v)];
}

export const tests = {
  'shortestPath: deferred exact queries fail explicitly through both public entry points'() {
    const surface = Surface.fromMesh(planeMesh(2, 2, 1, 1));
    const a = surface.centroid(0);
    const b = surface.centroid(1);
    for (const target of [a, b]) {
      for (const query of [() => shortestPath(surface, a, target), () => surface.shortestPath(a, target)]) {
        let error;
        try { query(); } catch (caught) { error = caught; }
        assert(error instanceof Error && error.code === 'ERR_NOT_IMPLEMENTED', 'explicit unimplemented error');
        assert(error.message.includes('exact global surface paths are deferred'), 'explains deferred capability');
      }
    }
    const approximate = surface.distance(a, b);
    assert(Number.isFinite(approximate), 'existing approximate query remains available');
    near(surface.trace(a, [1, 0], 0.01).length, 0.01, 1e-12, 'existing motion is unaffected');
  },

  'holonomy around a vertex equals its angle deficit (cube 90°, icosahedron 60°, plane 0)'() {
    const cube = Surface.fromMesh(cubeMesh(2, 1));
    for (const f of cube.faces) {
      for (let c = 0; c < 3; c++) {
        const h = cube.holonomy(f.id, c);
        near(Math.abs(h.angle), Math.PI / 2, 1e-12, 'cube corner holonomy');
        near(h.deficit, Math.PI / 2, 1e-12, 'cube corner deficit');
      }
    }
    const ico = Surface.fromMesh(icosphereMesh(0));
    const h = ico.holonomy(0, 0);
    near(Math.abs(h.angle), h.deficit, 1e-12, 'icosahedron holonomy = deficit');
    near(h.deficit, Math.PI / 3, 1e-12, '12 vertices × 60° = 4π');
    const plane = Surface.fromMesh(planeMesh(2, 2, 4, 4));
    // an interior vertex of the plane: find a corner whose fan closes
    const fan = plane.faces
      .map((f) => [0, 1, 2].map((c) => plane.vertexFan(f.id, c)))
      .flat()
      .find((v) => !v.boundary);
    assert(fan, 'interior vertex exists');
    near(fan.deficit, 0, 1e-12, 'flat');
  },

  'trace reproduces the cube equator and reports crossings; transported frame is a rotation'() {
    const s = Surface.fromMesh(cubeMesh(2, 1));
    const start = s.centroid(0);
    const d = chartDir(s, 0, [0, 0, 1]);
    const r = s.trace(start, d, 8);
    nearVec(s.to3D(r.end), s.to3D(start), 1e-9, 'closed geodesic of length 8');
    assert(
      r.crossings.length >= 4 && r.events.length === 0,
      `crossings ${r.crossings.length}, events ${JSON.stringify(r.events)}`,
    );
    near(Math.abs(r.M.a * r.M.d - r.M.b * r.M.c), 1, 1e-12, 'orthogonal transport');
    // around a closed geodesic that threads no vertex, transport is the identity
    nearVec([r.M.a, r.M.b, r.M.c, r.M.d], [1, 0, 0, 1], 1e-9, 'trivial holonomy along the equator');
    near(r.length, 8, 1e-12, 'full length consumed');
  },

  'distances on the cube match hand unfolding (2 to a neighbour centre, 4 to the antipode)'() {
    const s = Surface.fromMesh(cubeMesh(2, 1));
    const px = chartPointAt(s, [1, 0, 0]);
    const pz = chartPointAt(s, [0, 0, 1]);
    const pmx = chartPointAt(s, [-1, 0, 0]);
    near(s.distance(px, pz), 2, 1e-9, 'adjacent face centres');
    near(s.distance(px, pmx), 4, 1e-9, 'opposite face centres');
    near(s.distance(pz, px), 2, 1e-9, 'symmetric');
    // across one edge diagonally: (1, 0.5, 0.5) -> (0.5, 0.5, 1) unfolds to a straight segment of length 1
    const a = chartPointAt(s, [1, 0.5, 0.5]);
    const b = chartPointAt(s, [0.5, 0.5, 1]);
    near(s.distance(a, b), 1, 1e-9, 'unfolded diagonal');
    const l = s.logMap(a, b);
    // follow the log map direction for the log map distance: must land on b
    const r = s.trace(a, l.dir, l.distance);
    nearVec(s.to3D(r.end), s.to3D(b), 1e-9, 'exp(log) = identity');
  },

  'logMap on a flat triangulated plane is the exact planar vector'() {
    const s = Surface.fromMesh(planeMesh(4, 4, 8, 8));
    const a = s.centroid(3);
    const b = s.centroid(s.faces.length - 5);
    const l = s.logMap(a, b);
    const fa = s.faceById(a.faceId);
    const reached = add3(s.to3D(a), add3(scl3(fa.u, l.vector[0]), scl3(fa.v, l.vector[1])));
    nearVec(reached, s.to3D(b), 1e-9, "vector in a's chart frame reaches b");
    near(l.distance, len3(sub3(s.to3D(a), s.to3D(b))), 1e-9, 'planar distance');
  },

  'cylinder is developable: vertical separation is exact, wrap-around picks the short way'() {
    const n = 24;
    const s = Surface.fromMesh(cylinderMesh(1, 2, n, 2));
    const a = s.centroid(2 * 3); // face (i=3, j=0, lower triangle)
    const b = s.centroid(2 * (n + 3)); // same column, next ring
    near(s.distance(a, b), 1, 1e-9, 'one ring apart = height/rings');
    // around the polygonal perimeter: 6 sides along the short way vs 18 the long way
    const c = s.centroid(2 * 9);
    const side = 2 * Math.sin(Math.PI / n);
    near(s.distance(a, c), 6 * side, 1e-9, 'perimeter distance along the short arc');
  },

  'icosphere distance converges to the great-circle distance under subdivision'() {
    const A3 = norm3([1, 0.3, 0.2]);
    const B3 = norm3([-0.2, 1, 0.4]);
    const arc = Math.acos(dot3(A3, B3));
    let prevErr = Infinity;
    for (const n of [2, 3, 4]) {
      const s = Surface.fromMesh(icosphereMesh(n));
      const a = nearestCentroid(s, A3);
      const b = nearestCentroid(s, B3);
      const d = s.distance(a, b);
      const exact = Math.acos(dot3(norm3(s.to3D(a)), norm3(s.to3D(b))));
      const err = Math.abs(d - exact) / exact;
      assert(err < prevErr * 1.05 + 1e-12, `error should not grow: ${err} vs ${prevErr}`);
      assert(err < 0.03, `subdiv ${n}: relative error ${err}`);
      prevErr = err;
    }
    assert(prevErr < 0.005, `finest subdivision should be within 0.5%, got ${prevErr}`);
    assert(arc > 1, 'test points are far apart');
  },

  'geodesic disk: centre maps to origin, faces ordered by distance, size grows with R'() {
    const s = Surface.fromMesh(icosphereMesh(3));
    const d1 = s.develop(0, 0.4);
    const d2 = s.develop(0, 0.8);
    nearVec(d1.toPlane(s.centroid(0)), [0, 0], 1e-12, 'centre at origin');
    assert(d1.order[0] === 0, 'root first');
    assert(d2.maps.size > 2.5 * d1.maps.size, `disk area should scale ~R²: ${d1.maps.size} -> ${d2.maps.size}`);
    for (const fid of d1.order) assert(d2.has(fid), 'bigger disk contains the smaller');
    assert(s.develop(0, 0.4) === d1, 'cached');
  },

  'cone point: geodesic aimed at a cube corner continues straightest (equal 135° on both sides)'() {
    const s = Surface.fromMesh(cubeMesh(2, 1));
    // arrive on the +x face from P toward the corner V; ψ = angle between the arrival ray and the edge z=1
    const P = [1, 0.3, 0.7];
    const V = [1, 1, 1];
    const psi = Math.atan2(0.3, 0.7);
    const start = chartPointAt(s, P);
    const d = chartDir(s, start.faceId, norm3(sub3(V, P)));
    const toVertex = len3(sub3(V, P));
    const r = s.trace(start, d, toVertex + 0.5);
    const vertexEvents = r.events.filter((e) => e.type === 'vertex');
    assert(vertexEvents.length === 1, `expected one vertex event, got ${JSON.stringify(r.events)}`);
    near(vertexEvents[0].deficit, Math.PI / 2, 1e-9, 'corner deficit');
    near(r.length, toVertex + 0.5, 1e-9, 'full length');
    // hand unfolding of the 270° corner: the exit leaves inside the +y face at θ = 45° − ψ from the edge (−1,0,0)
    const theta = Math.PI / 4 - psi;
    nearVec(s.to3D(r.end), [1 - 0.5 * Math.cos(theta), 1, 1 - 0.5 * Math.sin(theta)], 1e-6, 'straightest continuation');
  },

  'cone point: asymmetric arrival on an icosahedron vertex splits the total angle equally'() {
    const s = Surface.fromMesh(icosphereMesh(0));
    const face = s.faceById(0);
    const corner = 1;
    const v = face.verts2[corner];
    // arrive from inside the face at 20° from the wedge's start edge
    const e0 = [face.verts2[(corner + 1) % 3][0] - v[0], face.verts2[(corner + 1) % 3][1] - v[1]];
    const ang0 = Math.atan2(e0[1], e0[0]);
    const inAngle = ang0 + (20 * Math.PI) / 180;
    const back = [Math.cos(inAngle), Math.sin(inAngle)]; // from vertex into the face
    const start = { faceId: 0, x: v[0] + 0.3 * back[0], y: v[1] + 0.3 * back[1] };
    assert(s.contains(0, start.x, start.y), 'start inside face');
    const dIn = [-back[0], -back[1]];
    const out = s.coneContinuation(0, corner, dIn);
    assert(!out.boundary, 'closed fan');
    // in the exit chart, the angle from the vertex's wedge-start edge to the outgoing direction must equal
    // (ψ + total/2) minus the wedges skipped — check via the invariant: total CCW angle from `back` to `out.dir`
    // across the fan is total/2. Reconstruct by summing skipped wedge angles.
    const { fan, total } = s.vertexFan(0, corner);
    let skipped = 0;
    let i = 0;
    for (; fan[i].faceId !== out.faceId; i++) skipped += fan[i].angle;
    const f = s.faceById(out.faceId);
    const w = f.verts2[fan[i].corner];
    const e = [f.verts2[(fan[i].corner + 1) % 3][0] - w[0], f.verts2[(fan[i].corner + 1) % 3][1] - w[1]];
    const angOut = Math.atan2(e[0] * out.dir[1] - e[1] * out.dir[0], e[0] * out.dir[0] + e[1] * out.dir[1]);
    const psi = (20 * Math.PI) / 180;
    near(skipped + angOut, psi + total / 2, 1e-9, 'equal angles left and right');
  },
};

function nearestCentroid(s, P3) {
  let best = null;
  let bd = Infinity;
  for (const f of s.faces) {
    const c = s.centroid(f.id);
    const d = len3(sub3(s.to3D(c), scl3(P3, len3(f.C))));
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
