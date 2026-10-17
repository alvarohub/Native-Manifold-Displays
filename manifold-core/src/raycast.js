// Ray–surface intersection (Möller–Trumbore over all faces). Extrinsic by nature: used by the projection
// imprint mode and by UI picking. Returns the nearest hit { faceId, x, y, t, point } or null.
import { sub3, cross3, dot3, add3, scl3 } from './vec.js';

export function raycast(surface, origin, dir, { tMin = 0, tMax = Infinity, backfaces = true } = {}) {
  let best = null;
  for (const f of surface.faces) {
    if (!f.verts3) continue;
    const [a, b, c] = f.verts3;
    const e1 = sub3(b, a);
    const e2 = sub3(c, a);
    const p = cross3(dir, e2);
    const det = dot3(e1, p);
    if (Math.abs(det) < 1e-14) continue;
    if (!backfaces && det < 0) continue;
    const inv = 1 / det;
    const s = sub3(origin, a);
    const u = dot3(s, p) * inv;
    if (u < -1e-12 || u > 1 + 1e-12) continue;
    const q = cross3(s, e1);
    const v = dot3(dir, q) * inv;
    if (v < -1e-12 || u + v > 1 + 1e-12) continue;
    const t = dot3(e2, q) * inv;
    if (t < tMin || t > tMax) continue;
    if (!best || t < best.t) best = { faceId: f.id, t, u, v };
  }
  if (!best) return null;
  const point = add3(origin, scl3(dir, best.t));
  const [x, y] = surface.toChart(best.faceId, point);
  return { faceId: best.faceId, x, y, t: best.t, point };
}
