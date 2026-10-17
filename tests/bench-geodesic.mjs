// Ad-hoc measurements for M2: polyhedral vs great-circle distance on icospheres, geodesic-disk timing.
import { Surface, icosphereMesh, norm3, dot3 } from '../manifold-core/index.js';

for (const n of [2, 3, 4, 5]) {
  const s = Surface.fromMesh(icosphereMesh(n));
  let sumErr = 0;
  let cnt = 0;
  let maxErr = 0;
  for (let k = 0; k < 40; k++) {
    const a = s.centroid((k * 7919) % s.faces.length);
    const b = s.centroid((k * 104729 + 13) % s.faces.length);
    const d = s.distance(a, b);
    const ex = Math.acos(Math.max(-1, Math.min(1, dot3(norm3(s.to3D(a)), norm3(s.to3D(b))))));
    if (ex < 0.3) continue;
    const e = Math.abs(d - ex) / ex;
    sumErr += e;
    cnt++;
    maxErr = Math.max(maxErr, e);
  }
  console.log(
    `icosphere ${n}: F=${s.faces.length} mean rel err ${((sumErr / cnt) * 100).toFixed(2)}%  max ${(maxErr * 100).toFixed(2)}%  (${cnt} pairs)`,
  );
}

const s = Surface.fromMesh(icosphereMesh(4));
const R = 0.5;
const t0 = performance.now();
let faces = 0;
let disks = 0;
for (let i = 0; i < s.faces.length; i += 7) {
  faces += s.develop(i, R).maps.size;
  disks++;
}
const t1 = performance.now();
console.log(
  `develop R=${R} on ${disks} faces of icosphere(4): ${(t1 - t0).toFixed(0)} ms total, ${((t1 - t0) / disks).toFixed(2)} ms/disk, avg ${(faces / disks).toFixed(0)} faces/disk`,
);
