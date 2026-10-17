import { assert, near } from './assert.mjs';
import {
  parseOBJ,
  parseSTL,
  weldVertices,
  orientTriangles,
  meshStats,
  triangleNormal,
  cubeMesh,
  icosphereMesh,
  torusMesh,
  cylinderMesh,
  planeMesh,
  tetrahedronMesh,
} from '../manifold-core/index.js';
import { dot3, sub3, add3, scl3 } from '../manifold-core/src/vec.js';

const CUBE_OBJ = `
# unit cube, quads, with uvs and a negative-index face
v -1 -1 -1
v  1 -1 -1
v  1  1 -1
v -1  1 -1
v -1 -1  1
v  1 -1  1
v  1  1  1
v -1  1  1
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 4/4 3/3 2/2
f 5/1 6/2 7/3 8/4
f 1/1 2/2 6/3 5/4
f 2/1 3/2 7/3 6/4
f 3/1 4/2 8/3 7/4
f -4/1 -1/2 -5/3 -8/4
`;

function outwardFraction(mesh) {
  const c = mesh.positions.reduce((a, p) => add3(a, p), [0, 0, 0]).map((v) => v / mesh.positions.length);
  let out = 0;
  mesh.triangles.forEach((tri, f) => {
    const centre = scl3(add3(add3(mesh.positions[tri[0]], mesh.positions[tri[1]]), mesh.positions[tri[2]]), 1 / 3);
    if (dot3(triangleNormal(mesh, f), sub3(centre, c)) > 0) out++;
  });
  return out / mesh.triangles.length;
}

function binarySTL(mesh) {
  const F = mesh.triangles.length;
  const buf = new ArrayBuffer(84 + F * 50);
  const view = new DataView(buf);
  view.setUint32(80, F, true);
  let off = 84;
  for (const tri of mesh.triangles) {
    off += 12;
    for (const i of tri) {
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

export const tests = {
  'OBJ quads fan-triangulate, uvs and negative indices resolve'() {
    const mesh = parseOBJ(CUBE_OBJ);
    assert(mesh.positions.length === 8, 'eight vertices');
    assert(mesh.triangles.length === 12, 'twelve triangles');
    assert(mesh.triUvs.length === 12 && mesh.triUvs.every((t) => t && t.every((i) => i >= 0 && i < 4)), 'uv indices');
    const stats = meshStats(mesh);
    assert(stats.euler === 2 && stats.closed, `closed sphere topology, got ${JSON.stringify(stats)}`);
    assert(
      mesh.triangles.flat().every((i) => i >= 0 && i < 8),
      'negative indices resolved',
    );
    near(outwardFraction(mesh), 1, 0, 'all faces wound outward');
  },

  'binary STL round-trips through weld to a closed tetrahedron'() {
    const soup = parseSTL(binarySTL(tetrahedronMesh()));
    assert(soup.positions.length === 12, 'unwelded soup has 3 verts per triangle');
    const mesh = weldVertices(soup, 1e-6);
    const stats = meshStats(mesh);
    assert(stats.V === 4 && stats.F === 4 && stats.E === 6 && stats.euler === 2, JSON.stringify(stats));
  },

  'ASCII STL parses'() {
    const text = `solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t`;
    const mesh = parseSTL(text);
    assert(mesh.triangles.length === 1 && mesh.positions.length === 3, 'one triangle');
    const fromBytes = parseSTL(new TextEncoder().encode(text));
    assert(fromBytes.triangles.length === 1, 'ASCII detected from bytes');
  },

  'orientTriangles repairs flipped winding and reports non-orientability'() {
    const mesh = icosphereMesh(1);
    const before = outwardFraction(mesh);
    near(before, 1, 0, 'icosphere starts outward');
    for (let f = 0; f < mesh.triangles.length; f += 3)
      [mesh.triangles[f][1], mesh.triangles[f][2]] = [mesh.triangles[f][2], mesh.triangles[f][1]];
    const report = orientTriangles(mesh);
    assert(report.orientable && report.components === 1, JSON.stringify(report));
    const after = outwardFraction(mesh);
    assert(after === 1 || after === 0, 'consistent after repair');
    // Möbius strip: one strip of quads with a half twist
    const n = 12;
    const positions = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const s of [-1, 1]) {
        const r = 2 + s * 0.4 * Math.cos(a / 2);
        positions.push([r * Math.cos(a), r * Math.sin(a), s * 0.4 * Math.sin(a / 2)]);
      }
    }
    const triangles = [];
    for (let i = 0; i < n; i++) {
      const a0 = 2 * i;
      const b0 = 2 * i + 1;
      const j = (i + 1) % n;
      const flip = j === 0; // the gluing swaps the two rails
      const a1 = flip ? 2 * j + 1 : 2 * j;
      const b1 = flip ? 2 * j : 2 * j + 1;
      triangles.push([a0, a1, b1], [a0, b1, b0]);
    }
    const mobius = orientTriangles({ positions, triangles });
    assert(!mobius.orientable, 'Möbius strip is non-orientable');
  },

  'primitives have the expected topology'() {
    const cube1 = meshStats(cubeMesh(2, 1));
    assert(cube1.V === 8 && cube1.F === 12 && cube1.euler === 2 && cube1.closed, JSON.stringify(cube1));
    const cube3 = meshStats(cubeMesh(2, 3));
    assert(cube3.euler === 2 && cube3.closed && cube3.F === 6 * 9 * 2, JSON.stringify(cube3));
    const ico2 = meshStats(icosphereMesh(2));
    assert(ico2.F === 320 && ico2.euler === 2 && ico2.closed, JSON.stringify(ico2));
    const torus = meshStats(torusMesh(1.5, 0.5, 24, 12));
    assert(torus.euler === 0 && torus.closed, JSON.stringify(torus));
    const cyl = meshStats(cylinderMesh(1, 2, 16, 2));
    assert(cyl.euler === 0 && cyl.boundaryEdges === 32, JSON.stringify(cyl));
    const plane = meshStats(planeMesh(2, 2, 3, 3));
    assert(plane.euler === 1 && plane.boundaryEdges === 12, JSON.stringify(plane));
    for (const m of [cubeMesh(2, 2), icosphereMesh(1), tetrahedronMesh()]) {
      near(outwardFraction(m), 1, 0, 'closed primitives wound outward');
    }
    // torus: outward means away from the tube's ring centre, not from the origin
    const torusM = torusMesh(1.5, 0.5, 24, 12);
    torusM.triangles.forEach((tri, f) => {
      const c = scl3(add3(add3(torusM.positions[tri[0]], torusM.positions[tri[1]]), torusM.positions[tri[2]]), 1 / 3);
      const a = Math.atan2(c[1], c[0]);
      const ring = [1.5 * Math.cos(a), 1.5 * Math.sin(a), 0];
      assert(dot3(triangleNormal(torusM, f), sub3(c, ring)) > 0, `torus face ${f} wound inward`);
    });
  },
};
