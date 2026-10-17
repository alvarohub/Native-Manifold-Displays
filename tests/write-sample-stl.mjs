// Write sample meshes as binary STL for manual testing of the demos' import path.
import { writeFileSync, mkdirSync } from 'node:fs';
import { kleinBottleMesh, torusMesh, writeBinarySTL } from '../manifold-core/index.js';

mkdirSync('/tmp/nmd', { recursive: true });
// unwelded soup, in millimetres, like a typical download
const toSoup = (m, scale) => ({
  positions: m.triangles.flatMap((t) => t.map((i) => m.positions[i].map((v) => v * scale))),
  triangles: m.triangles.map((_, f) => [3 * f, 3 * f + 1, 3 * f + 2]),
});
writeFileSync('/tmp/nmd/klein.stl', Buffer.from(writeBinarySTL(toSoup(kleinBottleMesh(1, 0.4, 96, 32), 40))));
writeFileSync('/tmp/nmd/torus.stl', Buffer.from(writeBinarySTL(toSoup(torusMesh(1.5, 0.5, 64, 24), 25))));
console.log('wrote /tmp/nmd/klein.stl and /tmp/nmd/torus.stl');
