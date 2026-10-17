import { assert, near } from './assert.mjs';
import {
  Surface,
  cleanMesh,
  importMesh,
  writeBinarySTL,
  kleinBottleMesh,
  icosphereMesh,
  meshStats,
} from '../manifold-core/index.js';

export const tests = {
  'cleanMesh removes degenerate and duplicate triangles and compacts vertices'() {
    const m = icosphereMesh(1);
    const F = m.triangles.length;
    const V = m.positions.length;
    // add: a duplicate, a zero-area sliver (three distinct collinear vertices), a near-duplicate vertex, an
    // unreferenced vertex
    m.triangles.push([...m.triangles[0]]);
    const [a, b] = m.triangles[1];
    m.positions.push(m.positions[a].map((x, k) => 0.5 * (x + m.positions[b][k])));
    m.triangles.push([a, b, V]);
    const nearDup = m.positions[2].map((x) => x + 1e-12);
    m.positions.push(nearDup);
    m.triangles.push([m.triangles[5][0], m.triangles[5][1], V + 1]);
    m.positions.push([9, 9, 9]); // unreferenced
    const { mesh, report } = cleanMesh(m);
    assert(report.weldedAway >= 1, `welded ${report.weldedAway}`);
    assert(report.degenerate === 1, `degenerate ${report.degenerate}`);
    assert(report.duplicates >= 1, `duplicates ${report.duplicates}`);
    assert(mesh.positions.length === V, `compacted to ${mesh.positions.length} (expected ${V})`);
    assert(mesh.triangles.length <= F + 1, `${mesh.triangles.length} triangles`);
    assert(
      (report.orientable && report.euler === 2) || mesh.triangles.length !== F,
      'still a sphere when nothing extra survived',
    );
  },

  'importMesh: binary STL of a Klein bottle -> clean non-orientable surface with χ = 0 and working geodesics'() {
    const raw = kleinBottleMesh(1, 0.4, 48, 20);
    const buf = writeBinarySTL(raw);
    const { mesh, report } = importMesh('klein.stl', buf, { radius: 1.2 });
    assert(!report.orientable, 'Klein bottle is non-orientable');
    assert(report.euler === 0 && report.closed, `χ = ${report.euler}, closed = ${report.closed}`);
    assert(mesh.triangles.length === raw.triangles.length, `no triangles lost: ${mesh.triangles.length}`);
    const s = Surface.fromMesh(mesh, { name: 'klein' });
    assert(s.faces.length === mesh.triangles.length && s.degenerateFaces === 0, 'all faces charted');
    assert(!s.orientationConsistent, 'surface records the inconsistency');
    const reflecting = s.faces.reduce((n, f) => n + f.edges.filter((g) => g && g.reflects).length, 0);
    assert(reflecting > 0, 'some gluings reverse orientation');
    near(s.totalDeficit(), 0, 1e-6, 'Σδ = 2πχ = 0');
    // geodesics run across the Möbius seam without stalling
    const head = { ...s.centroid(0), vx: 0.4, vy: 0.3 };
    let crossings = 0;
    for (let i = 0; i < 1500; i++) {
      const ev = s.stepHead(head, 0.03);
      assert(!ev.some((e) => e.type === 'stalled' || e.type === 'boundary'), `event ${JSON.stringify(ev)} at ${i}`);
      crossings += ev.length;
      assert(s.contains(head.faceId, head.x, head.y, 1e-7), 'in chart');
    }
    assert(crossings > 50, 'moved across many faces');
    // a disk / logMap works too
    const d = s.distance(s.centroid(0), s.centroid(3));
    assert(Number.isFinite(d) && d > 0, `distance ${d}`);
  },

  'importMesh: OBJ text path and error on unknown extension'() {
    const { mesh, report } = importMesh('tri.obj', 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 0\nf 1 2 3\nf 4 2 3\n');
    assert(mesh.triangles.length === 1 && report.duplicates === 1 && report.weldedAway === 1, JSON.stringify(report));
    let threw = false;
    try {
      importMesh('x.ply', '');
    } catch {
      threw = true;
    }
    assert(threw, 'unknown extension throws');
    assert(meshStats(mesh).F === 1, 'stats');
  },
};
