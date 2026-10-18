// Self-test for the experimental twisted tube. Run: node experiments/twisted-tube/selftest.mjs
// What a correct tube must satisfy — anything failing here keeps it out of manifold-core:
//   · closed, χ = 0, every edge shared by exactly 2 faces (no boundary, no non-manifold edges)
//   · intrinsically flat away from the 4 corner rings (deficit ≈ 0), Σ deficits = 0 (Gauss–Bonnet for χ = 0)
//   · ORIENTABILITY: odd half twists must be one-sided. Measured intrinsically: start on a wide face near
//     u = 0, follow the surface around the tube on the geodesic that hugs the centreline, and compare the
//     final frame with the start frame via the accumulated transition map M. Even twists: M is a rotation.
//     Odd twists: the frame comes back MIRRORED (det M = −1) — that is non-orientability seen from inside.
// Known open issue: orientTriangles (local winding BFS) currently reports the welded twisted mesh as
// orientable even for odd twists — investigate whether that test or this mesh is wrong before promoting.
import { Surface, meshStats, gaussianCurvature, orientTriangles } from '../../manifold-core/index.js';
import { twistedTubeMesh } from './tube.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : `  ${detail}`}`);
  if (!cond) failures++;
};

for (const halfTwists of [0, 1, 2, 3]) {
  const m = twistedTubeMesh(1.3, 0.3, 0.3, 64, 8, 8, halfTwists);
  const st = meshStats(m);
  check(`k=${halfTwists}: closed, χ=0, no non-manifold edges`, st.closed && st.euler === 0 && st.nonManifoldEdges === 0, JSON.stringify(st));
  const s = Surface.fromMesh(m);
  const K = gaussianCurvature(s);
  let flat = 0;
  K.forEach((k) => Math.abs(k) < 1 && flat++);
  check(`k=${halfTwists}: flat off the corners`, flat > (3 * K.length) / 4, `${flat}/${K.length}`);
  // frame flip test: det of the accumulated transition map after one loop
  const q0 = [1.6, 0.2, 0.05];
  const hit = s.raycast([q0[0], q0[1], 5], [0, 0, -1]) ?? s.raycast([q0[0] + 3, q0[1], q0[2]], [-1, 0, 0]);
  const f0 = s.faceById(hit.faceId);
  const tang = [-0.05, 0.98, 0];
  let dir = [tang[0] * f0.u[0] + tang[1] * f0.u[1] + tang[2] * f0.u[2], tang[0] * f0.v[0] + tang[1] * f0.v[1] + tang[2] * f0.v[2]];
  const dn = Math.hypot(...dir);
  dir = [dir[0] / dn, dir[1] / dn];
  let h = hit;
  let M = null;
  for (let k = 0; k < 4; k++) {
    const r = s.trace(h, dir, (2 * Math.PI * 1.6) / 4);
    h = r.end;
    dir = r.dir;
    if (r.M) M = M ? { a: r.M.a * M.a + r.M.b * M.c, b: r.M.a * M.b + r.M.b * M.d, c: r.M.c * M.a + r.M.d * M.c, d: r.M.c * M.b + r.M.d * M.d } : r.M;
  }
  const det = M ? M.a * M.d - M.b * M.c : NaN;
  check(`k=${halfTwists}: frame ${halfTwists % 2 ? 'MIRRORED' : 'preserved'} (det ${det.toFixed(3)})`, Math.sign(det) === (halfTwists % 2 ? -1 : 1));
  const ori = orientTriangles(structuredClone(m)).orientable;
  check(`k=${halfTwists}: winding BFS says ${halfTwists % 2 ? 'non-orientable' : 'orientable'}`, ori === !(halfTwists % 2), `got ${ori} (known mismatch under investigation)`);
}
process.exit(failures ? 1 : 0);
