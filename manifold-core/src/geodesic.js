// Geodesic tracing, parallel transport, cone-point continuation and local development (geodesic disks)
// on a Surface. All functions are pure w.r.t. the surface (the disk cache lives on the surface object).
import {
  EPS,
  add2,
  sub2,
  scl2,
  dot2,
  cross2,
  len2,
  norm2,
  perp2,
  apply2,
  matMul2,
  transpose2,
  I2,
  rot2,
  composeRigid,
  invertRigid,
  applyRigid,
  angleOfMat2,
} from './vec.js';

const VERTEX_TOL = 1e-7; // relative to edge length: closer than this to an endpoint counts as a vertex hit

// ------------------------------------------------------------------ tracing

// Straightest geodesic from `point` {faceId, x, y} in chart direction `dir` for arc length `length`.
// Returns { end, dir, M, length, polyline, crossings, events }:
//   end       – { faceId, x, y }
//   dir       – unit direction in the end chart
//   M         – composed transition matrix (start chart frame -> end chart frame) = parallel transport
//   polyline  – chart points [{faceId, x, y}] including every seam crossing (both sides)
//   crossings – [{ faceFrom, edge, toFace, toEdge }] in order
//   events    – 'vertex' (cone point, with deficit) and 'boundary' (reflection) occurrences
export function trace(surface, point, dir, length, { maxSteps = 4096 } = {}) {
  let faceId = point.faceId;
  let p = [point.x, point.y];
  let d = norm2(dir);
  let M = I2();
  let remaining = length;
  let skipEdge = -1;
  const polyline = [{ faceId, x: p[0], y: p[1] }];
  const crossings = [];
  const events = [];
  let steps = 0;

  while (remaining > 0 && steps++ < maxSteps) {
    const face = surface.faceById(faceId);
    const hit = firstExit(face, p, d, remaining, skipEdge);
    if (!hit) {
      p = add2(p, scl2(d, remaining));
      remaining = 0;
      break;
    }
    p = add2(p, scl2(d, hit.t));
    remaining -= hit.t;
    polyline.push({ faceId, x: p[0], y: p[1] });

    if (hit.vertex >= 0 && surface.vertices) {
      // cone point: leave the vertex by the straightest rule (equal angles left and right)
      const corner = hit.vertex;
      const out = coneContinuation(surface, faceId, corner, d);
      events.push({
        type: 'vertex',
        vertex: face.vidx ? face.vidx[corner] : null,
        faceId,
        corner,
        deficit: out.deficit,
        boundary: out.boundary,
      });
      if (out.boundary) {
        // vertex on an open boundary: reflect like a boundary edge hit (keep it simple)
        d = reflectAtEdge(face, hit.edge, d);
        skipEdge = hit.edge;
        continue;
      }
      M = matMul2(out.M, M);
      faceId = out.faceId;
      p = out.point;
      d = out.dir;
      // tiny push off the vertex so neither incident edge is re-detected
      p = add2(p, scl2(d, 1e-9 * surface.faceById(faceId).size));
      skipEdge = -1;
      polyline.push({ faceId, x: p[0], y: p[1] });
      continue;
    }

    const gluing = face.edges[hit.edge];
    if (!gluing) {
      d = reflectAtEdge(face, hit.edge, d);
      skipEdge = hit.edge;
      events.push({ type: 'boundary', faceId, edge: hit.edge });
      continue;
    }
    p = applyRigid(gluing, p);
    d = apply2(gluing.M, d);
    M = matMul2(gluing.M, M);
    crossings.push({ faceFrom: faceId, edge: hit.edge, toFace: gluing.toFaceId, toEdge: gluing.toEdge });
    faceId = gluing.toFaceId;
    skipEdge = gluing.toEdge;
    polyline.push({ faceId, x: p[0], y: p[1] });
  }
  if (remaining > 0) events.push({ type: 'stalled', remaining });
  polyline.push({ faceId, x: p[0], y: p[1] });
  return {
    end: { faceId, x: p[0], y: p[1] },
    dir: d,
    M,
    length: length - Math.max(0, remaining),
    polyline,
    crossings,
    events,
  };
}

function reflectAtEdge(face, edgeIdx, d) {
  const a = face.verts2[edgeIdx];
  const b = face.verts2[(edgeIdx + 1) % face.verts2.length];
  const tangent = norm2(sub2(b, a));
  const along = dot2(d, tangent);
  return [2 * along * tangent[0] - d[0], 2 * along * tangent[1] - d[1]];
}

// Earliest exit of the ray p + s·d (0 ≤ s ≤ limit) through the CCW polygon, ignoring skipEdge.
// Reports a vertex index when the exit point lies at an edge endpoint.
export function firstExit(face, p, d, limit, skipEdge = -1) {
  const verts = face.verts2;
  const n = verts.length;
  let best = null;
  for (let i = 0; i < n; i++) {
    if (i === skipEdge) continue;
    const a = verts[i];
    const edge = sub2(verts[(i + 1) % n], a);
    const denom = cross2(edge, d);
    if (denom >= -EPS * face.size) continue;
    const value = cross2(edge, sub2(p, a));
    const t = -value / denom;
    if (t <= limit + EPS * face.size && (!best || t < best.t)) {
      const q = add2(p, scl2(d, Math.max(0, t)));
      const s = dot2(sub2(q, a), edge) / dot2(edge, edge);
      let vertex = -1;
      if (s < VERTEX_TOL) vertex = i;
      else if (s > 1 - VERTEX_TOL) vertex = (i + 1) % n;
      best = { t: Math.max(0, t), edge: i, vertex };
    }
  }
  return best;
}

// ------------------------------------------------------------------ vertex fans and cone points

// Faces around the vertex at `corner` of face `faceId`, in CCW order (as seen from the outside), each as
// { faceId, corner, angle, gluing } where gluing is the transition used to reach the NEXT fan face.
// Stops at an open boundary (returns boundary: true) or when the fan closes.
export function vertexFan(surface, faceId, corner) {
  const fan = [];
  let fid = faceId;
  let c = corner;
  let boundary = false;
  for (let guard = 0; guard < 1024; guard++) {
    const face = surface.faceById(fid);
    const n = face.verts2.length;
    const angle = cornerAngle(face.verts2, c);
    const gluing = face.edges[(c + n - 1) % n]; // edge arriving at the corner: cross it to turn CCW
    fan.push({ faceId: fid, corner: c, angle, gluing });
    if (!gluing) {
      boundary = true;
      break;
    }
    fid = gluing.toFaceId;
    c = gluing.toEdge; // the shared edge leaves the vertex in the neighbour (consistent winding)
    if (fid === faceId && c === corner) break;
  }
  const total = fan.reduce((s, f) => s + f.angle, 0);
  return { fan, total, boundary, deficit: (boundary ? Math.PI : 2 * Math.PI) - total };
}

// Compose the transition matrices once around the vertex: a rotation by the angle deficit.
export function holonomy(surface, faceId, corner) {
  const { fan, deficit, boundary } = vertexFan(surface, faceId, corner);
  if (boundary) return { M: null, angle: null, deficit, boundary };
  let M = I2();
  for (const f of fan) M = matMul2(f.gluing.M, M);
  return { M, angle: angleOfMat2(M), deficit, boundary };
}

// Straightest continuation through the vertex at `corner` of face `faceId`, arriving with chart direction dIn.
// Returns { faceId, point, dir, M, deficit, boundary } — the chart in which the geodesic leaves the vertex,
// the vertex position in that chart, the outgoing direction there, and the frame map start→end.
export function coneContinuation(surface, faceId, corner, dIn) {
  const { fan, total, boundary, deficit } = vertexFan(surface, faceId, corner);
  if (boundary) return { boundary: true, deficit };
  const face0 = surface.faceById(faceId);
  const v0 = face0.verts2[corner];
  const s0 = sub2(face0.verts2[(corner + 1) % face0.verts2.length], v0); // wedge start edge direction
  const back = scl2(dIn, -1);
  let psi = ccwAngle(s0, back); // where the incoming ray sits inside the first wedge
  if (psi > fan[0].angle) psi = fan[0].angle; // numerical guard: the ray must lie inside the wedge
  let remaining = psi + total / 2; // straightest rule: equal angle (total/2) on both sides
  let M = I2();
  for (let i = 0; i < fan.length; i++) {
    const f = fan[i];
    if (remaining <= f.angle + 1e-12 || i === fan.length - 1) {
      const face = surface.faceById(f.faceId);
      const v = face.verts2[f.corner];
      const s = norm2(sub2(face.verts2[(f.corner + 1) % face.verts2.length], v));
      const dir = apply2(rot2(Math.min(remaining, f.angle)), s);
      return { boundary: false, faceId: f.faceId, point: [v[0], v[1]], dir, M, deficit };
    }
    remaining -= f.angle;
    M = matMul2(f.gluing.M, M);
  }
  return { boundary: true, deficit };
}

function ccwAngle(from, to) {
  const a = Math.atan2(cross2(from, to), dot2(from, to));
  return a < 0 ? a + 2 * Math.PI : a;
}

export function cornerAngle(verts2, c) {
  const n = verts2.length;
  const p = verts2[c];
  const e1 = sub2(verts2[(c + 1) % n], p);
  const e2 = sub2(verts2[(c + n - 1) % n], p);
  return Math.abs(Math.atan2(cross2(e1, e2), dot2(e1, e2)));
}

// ------------------------------------------------------------------ transport

// Carry a chart vector along a list of crossings (as returned by trace).
export function transportAlong(surface, crossings, vec) {
  let v = [vec[0], vec[1]];
  for (const c of crossings) v = apply2(surface.faceById(c.faceFrom).edges[c.edge].M, v);
  return v;
}

// ------------------------------------------------------------------ development (geodesic disk)

// Unfold the faces within geodesic radius R of the centroid of `faceId` into that face's chart plane.
// maps: faceId -> rigid {M, t} taking that face's chart coordinates into the disk plane. Faces are
// visited in order of unfolded distance (Dijkstra); each face keeps its first (shortest) unfolding.
export class GeodesicDisk {
  constructor(surface, faceId, R) {
    this.surface = surface;
    this.faceId = faceId;
    this.R = R;
    this.maps = new Map();
    this.order = [];
    this.build();
  }

  build() {
    const { surface, faceId, R } = this;
    const c = surface.centroid(faceId);
    const centre = [c.x, c.y];
    const root = { faceId, map: { M: I2(), t: scl2(centre, -1) } };
    const queue = [{ ...root, dist: 0 }];
    const best = new Map([[faceId, 0]]);
    while (queue.length) {
      // small frontier: linear extract-min is fine
      let bi = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].dist < queue[bi].dist) bi = i;
      const cur = queue.splice(bi, 1)[0];
      if (this.maps.has(cur.faceId)) continue;
      this.maps.set(cur.faceId, cur.map);
      this.order.push(cur.faceId);
      const face = surface.faceById(cur.faceId);
      face.edges.forEach((g) => {
        if (!g || this.maps.has(g.toFaceId)) return;
        const map = composeRigid(cur.map, invertRigid(g));
        const dist = polygonDistance(surface.faceById(g.toFaceId).verts2.map((v) => applyRigid(map, v)));
        if (dist > R) return;
        const prev = best.get(g.toFaceId);
        if (prev !== undefined && prev <= dist) return;
        best.set(g.toFaceId, dist);
        queue.push({ faceId: g.toFaceId, map, dist });
      });
    }
  }

  has(faceId) {
    return this.maps.has(faceId);
  }

  // chart point -> disk-plane coordinates (null if the face is outside the disk)
  toPlane(point) {
    const map = this.maps.get(point.faceId);
    return map ? applyRigid(map, [point.x, point.y]) : null;
  }

  // disk-plane vector -> the same vector expressed in `faceId`'s chart frame
  toChartDir(faceId, v) {
    const map = this.maps.get(faceId);
    return map ? apply2(transpose2(map.M), v) : null;
  }
}

// distance from the origin to a convex polygon (0 if inside)
function polygonDistance(verts) {
  const n = verts.length;
  let inside = true;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const e = sub2(b, a);
    if (cross2(e, scl2(a, -1)) < 0) inside = false;
    const t = Math.max(0, Math.min(1, -dot2(a, e) / dot2(e, e)));
    best = Math.min(best, len2(add2(a, scl2(e, t))));
  }
  return inside ? 0 : best;
}

export function develop(surface, faceId, R) {
  surface._disks ??= new Map();
  const key = `${faceId}:${R}`;
  let disk = surface._disks.get(key);
  if (!disk) {
    disk = new GeodesicDisk(surface, faceId, R);
    const cap = surface.maxDisks ?? 2048;
    if (surface._disks.size >= cap) surface._disks.delete(surface._disks.keys().next().value); // evict oldest
    surface._disks.set(key, disk);
  }
  return disk;
}

// Direction (unit, in a's chart) and distance from a to b, via the geodesic disk around a's face.
// R defaults to growing powers of two of the face size until b is reached (bounded by maxR).
export function logMap(surface, a, b, { R = null, maxR = Infinity } = {}) {
  const faceA = surface.faceById(a.faceId);
  let radius = R ?? faceA.size * 2;
  let disk = develop(surface, a.faceId, radius);
  while (!disk.has(b.faceId)) {
    if (R !== null || radius * 2 > maxR) return null;
    radius *= 2;
    disk = develop(surface, a.faceId, radius);
  }
  const pa = disk.toPlane(a);
  const pb = disk.toPlane(b);
  const v = sub2(pb, pa);
  const dist = len2(v);
  // the disk plane is a's chart translated, so plane directions are already a's chart directions
  return { dir: dist < EPS ? [1, 0] : scl2(v, 1 / dist), distance: dist, vector: v, disk };
}

export function distance(surface, a, b, opts) {
  const l = logMap(surface, a, b, opts);
  return l ? l.distance : Infinity;
}

export { perp2 };
