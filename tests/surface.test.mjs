import { assert, near, nearVec } from './assert.mjs';
import {
  Surface,
  cubeMesh,
  icosphereMesh,
  torusMesh,
  cylinderMesh,
  planeMesh,
  parseOBJ,
  weldVertices,
} from '../manifold-core/index.js';
import { apply2, matMul2, add2, sub3, len3, det2 } from '../manifold-core/src/vec.js';

const TWO_PI = 2 * Math.PI;

function checkReciprocal(surface) {
  let count = 0;
  for (const A of surface.faces) {
    A.edges.forEach((g, e) => {
      if (!g) return;
      const B = surface.faceById(g.toFaceId);
      const back = B.edges[g.toEdge];
      assert(back && back.toFaceId === A.id && back.toEdge === e, `edge ${A.id}/${e} not reciprocal`);
      // back ∘ forth = identity on a probe point
      const p = [0.123, -0.456];
      const q = add2(apply2(back.M, add2(apply2(g.M, p), g.t)), back.t);
      nearVec(q, p, 1e-9, `round trip ${A.id}/${e}`);
      near(Math.abs(det2(g.M)), 1, 1e-12, 'orthogonal');
      // the shared 3D edge maps onto itself: endpoints of edge e in A land on edge toEdge in B
      const n = A.verts2.length;
      for (const vA of [A.verts2[e], A.verts2[(e + 1) % n]]) {
        const img = add2(apply2(g.M, vA), g.t);
        const pa = surface.to3D({ faceId: A.id, x: vA[0], y: vA[1] });
        const pb = surface.to3D({ faceId: B.id, x: img[0], y: img[1] });
        near(len3(sub3(pa, pb)), 0, 1e-9, 'edge endpoint coincides in 3D');
      }
      // interior probe: a point just across the edge lands inside B
      const mid = [(A.verts2[e][0] + A.verts2[(e + 1) % n][0]) / 2, (A.verts2[e][1] + A.verts2[(e + 1) % n][1]) / 2];
      const c = surface.centroid(A.id);
      const outside = [mid[0] + (mid[0] - c.x) * 1e-3, mid[1] + (mid[1] - c.y) * 1e-3];
      const img = add2(apply2(g.M, outside), g.t);
      assert(surface.contains(B.id, img[0], img[1], 1e-12), `probe across ${A.id}/${e} not inside ${B.id}`);
      count++;
    });
  }
  return count;
}

export const tests = {
  'cube: 12 charts, reciprocal gluings, deficit π/2 at 8 corners, Σ = 4π'() {
    const s = Surface.fromMesh(cubeMesh(2, 1));
    assert(s.faces.length === 12 && s.boundaryEdges === 0 && s.orientationConsistent, 'closed consistent cube');
    assert(checkReciprocal(s) === 36, 'every half-edge glued');
    const cones = s.vertexCones();
    assert(cones.length === 8, 'eight corners');
    for (const c of cones) near(c.deficit, Math.PI / 2, 1e-12, 'corner deficit');
    near(s.totalDeficit(), 2 * TWO_PI, 1e-12, 'Gauss–Bonnet');
    assert(s.eulerCharacteristic() === 2, 'χ = 2');
  },

  'subdivided cube: flat interior vertices, Σ deficits still 4π'() {
    const s = Surface.fromMesh(cubeMesh(2, 3));
    checkReciprocal(s);
    const cones = s.vertexCones();
    const corners = cones.filter((c) => Math.abs(c.deficit) > 1e-9);
    assert(corners.length === 8, `only corners curved, got ${corners.length}`);
    near(s.totalDeficit(), 2 * TWO_PI, 1e-9, 'Gauss–Bonnet');
  },

  'icosphere: positive deficits, Σ = 4π at every subdivision'() {
    for (const n of [0, 1, 2, 3]) {
      const s = Surface.fromMesh(icosphereMesh(n));
      checkReciprocal(s);
      const cones = s.vertexCones();
      assert(
        cones.every((c) => c.deficit > 0),
        'all deficits positive on a convex sphere',
      );
      near(s.totalDeficit(), 2 * TWO_PI, 1e-8, `Σ deficit, subdiv ${n}`);
      assert(s.eulerCharacteristic() === 2, 'χ = 2');
    }
    const s0 = Surface.fromMesh(icosphereMesh(0));
    for (const c of s0.vertexCones()) near(c.deficit, (2 * TWO_PI) / 12, 1e-12, 'icosahedron: 12 equal cones');
  },

  'torus: χ = 0, Σ deficits = 0 with both signs present'() {
    const s = Surface.fromMesh(torusMesh(1.5, 0.5, 24, 12));
    checkReciprocal(s);
    assert(s.eulerCharacteristic() === 0, 'χ = 0');
    near(s.totalDeficit(), 0, 1e-8, 'Gauss–Bonnet');
    const d = s.vertexCones().map((c) => c.deficit);
    assert(Math.max(...d) > 1e-3 && Math.min(...d) < -1e-3, 'outer rim positive, inner rim negative');
  },

  'open cylinder: developable, boundary vertices flagged, Gauss–Bonnet with boundary'() {
    const s = Surface.fromMesh(cylinderMesh(1, 2, 16, 2));
    checkReciprocal(s);
    assert(s.boundaryEdges === 32, 'two boundary loops');
    const cones = s.vertexCones();
    const interior = cones.filter((c) => !c.boundary);
    const boundary = cones.filter((c) => c.boundary);
    assert(interior.length === 16 && boundary.length === 32, 'vertex classes');
    for (const c of interior) near(c.deficit, 0, 1e-9, 'interior flat');
    near(s.totalDeficit(), 0, 1e-9, '2πχ with χ = 0');
  },

  'plane: boundary turning sums to 2π'() {
    const s = Surface.fromMesh(planeMesh(2, 2, 3, 3));
    checkReciprocal(s);
    near(s.totalDeficit(), TWO_PI, 1e-9, 'χ = 1');
    const corners = s.vertexCones().filter((c) => Math.abs(c.deficit - Math.PI / 2) < 1e-9);
    assert(corners.length === 4, 'four right-angle corners');
  },

  'OBJ cube through the whole pipeline'() {
    const obj = parseOBJ(
      `v -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nf 1 4 3 2\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 5 8 4 1`,
    );
    const s = Surface.fromMesh(weldVertices(obj));
    checkReciprocal(s);
    near(s.totalDeficit(), 2 * TWO_PI, 1e-12, 'Gauss–Bonnet');
  },

  'fromCharts: hand-glued flat torus keeps working'() {
    const w = 4;
    const h = 2;
    const I = { a: 1, b: 0, c: 0, d: 1 };
    const face = {
      id: 0,
      verts2: [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ],
      edges: [
        { toFaceId: 0, toEdge: 2, M: I, t: [0, h] },
        { toFaceId: 0, toEdge: 3, M: I, t: [-w, 0] },
        { toFaceId: 0, toEdge: 0, M: I, t: [0, -h] },
        { toFaceId: 0, toEdge: 1, M: I, t: [w, 0] },
      ],
    };
    const s = Surface.fromCharts([face], { name: 'flat torus' });
    const head = { faceId: 0, x: 0, y: 0, vx: 1, vy: 0.5 };
    const events = s.stepHead(head, 8); // returns to start: 2 wraps in x, 2 in y
    assert(events.filter((e) => e.type === 'edge').length === 4, `4 wraps, got ${events.length}`);
    nearVec([head.x, head.y], [0, 0], 1e-9, 'periodic orbit closes');
    assert(s.vertexCones().length === 0, 'no vertex table for abstract charts');
  },

  'stepHead on an icosphere: stays in-chart, speed conserved, no stalls'() {
    const s = Surface.fromMesh(icosphereMesh(2));
    const start = s.centroid(0);
    const head = { ...start, vx: 0.37, vy: 0.21 };
    const speed = Math.hypot(head.vx, head.vy);
    let crossings = 0;
    for (let i = 0; i < 2000; i++) {
      const ev = s.stepHead(head, 0.05);
      assert(
        !ev.some((e) => e.type === 'stalled' || e.type === 'boundary'),
        `bad event at step ${i}: ${JSON.stringify(ev)}`,
      );
      crossings += ev.length;
      assert(s.contains(head.faceId, head.x, head.y, 1e-7), `left chart at step ${i}`);
      near(Math.hypot(head.vx, head.vy), speed, 1e-9, 'speed');
      const p = s.to3D(head);
      const r = len3(p);
      assert(r > 0.95 && r < 1 + 1e-9, `embedding off the polyhedron: |p| = ${r}`);
    }
    assert(crossings > 100, `expected many crossings, got ${crossings}`);
  },

  'stepHead on a cube: closed geodesic around the equator returns home'() {
    const s = Surface.fromMesh(cubeMesh(2, 1));
    const head = { ...s.centroid(0), vx: 0, vy: 0 };
    // pick the chart direction whose 3D image is +y (around the cube's x-axis faces... any axis works)
    const f = s.faceById(0);
    const dir3 = [0, 0, 1];
    head.vx = f.u[0] * dir3[0] + f.u[1] * dir3[1] + f.u[2] * dir3[2];
    head.vy = f.v[0] * dir3[0] + f.v[1] * dir3[1] + f.v[2] * dir3[2];
    const p0 = s.to3D(head);
    const ev = s.stepHead(head, 8); // perimeter of the cube cross-section = 4 · 2
    const p1 = s.to3D(head);
    near(len3(sub3(p0, p1)), 0, 1e-9, 'closed geodesic');
    assert(ev.filter((e) => e.type === 'edge').length >= 4, 'crossed at least four faces');
  },
};
