// Imprinting planar contours onto a Surface. Modes (see docs/DRAWING_ON_SURFACES.md):
//   turtle     – dead reckoning: preserve arc length and geodesic curvature (closed curves may not close)
//   exp        – exponential map at the anchor: preserve distances/angles from the anchor
//   fermi      – geodesic graph paper: baseline geodesic + perpendicular geodesics
//   projection – extrinsic: project the drawing from the anchor's tangent plane along the normal
// Every mode consumes the same placement frame { anchor, heading, scale } and returns
// { mode, contours: [{ points: [chart points], closed, planar, gap }] } where gap is the surface distance
// between the last and first imprinted point of a closed contour (0 when it closes).
import {
  apply2,
  perp2,
  norm2,
  rot2,
  add3,
  scl3,
  sub3,
  cross3,
  dot3,
  len3,
  norm3,
} from '../../manifold-core/src/vec.js';
import { turningAngles } from './curves.js';

// ---------------------------------------------------------------- frame

export function makeFrame(anchor, heading = [1, 0], scale = 1) {
  return { anchor: { faceId: anchor.faceId, x: anchor.x, y: anchor.y }, heading: norm2(heading), scale };
}

// Planar vector (in drawing units) -> chart direction and surface length at the anchor.
function frameVector(frame, x, y) {
  const h = frame.heading;
  const p = perp2(h);
  const v = [x * h[0] + y * p[0], x * h[1] + y * p[1]];
  const len = Math.hypot(v[0], v[1]) * frame.scale;
  return { dir: len > 0 ? norm2(v) : [h[0], h[1]], len };
}

export function rotateFrame(frame, angle) {
  return { ...frame, heading: apply2(rot2(angle), frame.heading) };
}

export function scaleFrame(frame, factor) {
  return { ...frame, scale: frame.scale * factor };
}

// Slide the anchor by a planar displacement (dx, dy) in frame units along a geodesic, transporting the heading.
export function translateFrame(surface, frame, dx, dy) {
  const { dir, len } = frameVector(frame, dx, dy);
  if (len === 0) return frame;
  const r = surface.trace(frame.anchor, dir, len);
  return { anchor: r.end, heading: norm2(apply2(r.M, frame.heading)), scale: frame.scale };
}

// Frame from a 3D hit point (e.g. a raycast): heading = a 3D direction projected onto the chart.
export function frameFromPoint(surface, point, heading3 = [1, 0, 0], scale = 1) {
  const f = surface.faceById(point.faceId);
  let h = [dot3(heading3, f.u), dot3(heading3, f.v)];
  if (Math.hypot(h[0], h[1]) < 1e-9) h = [1, 0];
  return makeFrame(point, h, scale);
}

// ---------------------------------------------------------------- modes

export function imprint(surface, contours, frame, mode = 'turtle', opts = {}) {
  const fn = { turtle: imprintTurtle, exp: imprintExp, fermi: imprintFermi, projection: imprintProjection }[mode];
  if (!fn) throw new Error(`unknown imprint mode ${mode}`);
  const out = contours.map((c) => {
    const points = fn(surface, c, frame, opts).filter(Boolean);
    if (mode === 'turtle' && c.closed && points.length > 2) {
      // the turtle's last point is its attempt to return to the start; the miss is the closure gap
      return { points, closed: false, planar: c, gap: closureGap(surface, points), returnsToStart: true };
    }
    return { points, closed: c.closed, planar: c, gap: 0 };
  });
  return { mode, frame, contours: out };
}

// Dead reckoning. The first point is reached by the exp map (so the drawing is placed consistently with
// the other modes); from there the turtle turns by the planar turning angle and advances by the planar
// segment length, both scaled.
export function imprintTurtle(surface, contour, frame) {
  const pts = contour.points;
  if (pts.length === 0) return [];
  const first = frameVector(frame, pts[0][0], pts[0][1]);
  const r0 = surface.trace(frame.anchor, first.dir, first.len);
  const out = [r0.end];
  if (pts.length < 2) return out;
  // heading frame transported to the first point; initial travel direction = first planar segment
  const h = norm2(apply2(r0.M, frame.heading));
  const seg0 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]];
  const a0 = Math.atan2(seg0[1], seg0[0]);
  let dir = apply2(rot2(a0), h);
  const closedPts = contour.closed ? [...pts, pts[0]] : pts;
  const turns = turningAngles(pts, contour.closed);
  let cur = r0.end;
  for (let i = 1; i < closedPts.length; i++) {
    const a = closedPts[i - 1];
    const b = closedPts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * frame.scale;
    const r = surface.trace(cur, dir, len);
    cur = r.end;
    dir = r.dir;
    out.push(cur);
    const turn = turns[i - 1];
    if (turn !== undefined) dir = apply2(rot2(turn), dir);
  }
  return out; // for closed contours the last point is the return attempt (see imprint)
}

// Exponential map at the anchor: polar coordinates of each planar point become (direction, geodesic length).
export function imprintExp(surface, contour, frame) {
  return contour.points.map(([x, y]) => {
    const { dir, len } = frameVector(frame, x, y);
    return surface.trace(frame.anchor, dir, len).end;
  });
}

// Fermi coordinates: walk x along the baseline geodesic (heading), then y along the perpendicular geodesic.
export function imprintFermi(surface, contour, frame) {
  const cache = new Map();
  return contour.points.map(([x, y]) => {
    const key = x.toFixed(9);
    let base = cache.get(key);
    if (!base) {
      const sx = Math.sign(x) || 1;
      const r1 = surface.trace(
        frame.anchor,
        sx > 0 ? frame.heading : [-frame.heading[0], -frame.heading[1]],
        Math.abs(x) * frame.scale,
      );
      const H = sx > 0 ? r1.dir : [-r1.dir[0], -r1.dir[1]];
      base = { point: r1.end, heading: H };
      cache.set(key, base);
    }
    if (y === 0) return base.point;
    const p = perp2(base.heading);
    const d = y > 0 ? p : [-p[0], -p[1]];
    return surface.trace(base.point, d, Math.abs(y) * frame.scale).end;
  });
}

// Extrinsic projection: lay the drawing on the anchor's tangent plane and cast rays along −normal.
// opts.direction overrides the ray direction (e.g. a projector axis); misses yield null (dropped).
export function imprintProjection(surface, contour, frame, { direction = null, offset = null } = {}) {
  const f = surface.faceById(frame.anchor.faceId);
  const P0 = surface.to3D(frame.anchor);
  const N = f.n;
  const e1 = norm3(add3(scl3(f.u, frame.heading[0]), scl3(f.v, frame.heading[1])));
  const e2 = cross3(N, e1);
  const dir = direction ? norm3(direction) : scl3(N, -1);
  const back = offset ?? 4 * (surface.boundingRadius ??= boundingRadius(surface));
  return contour.points.map(([x, y]) => {
    const onPlane = add3(P0, add3(scl3(e1, x * frame.scale), scl3(e2, y * frame.scale)));
    const origin = sub3(onPlane, scl3(dir, back));
    const hit = surface.raycast(origin, dir);
    return hit ? { faceId: hit.faceId, x: hit.x, y: hit.y } : null;
  });
}

function boundingRadius(surface) {
  let r = 0;
  for (const f of surface.faces) for (const v of f.verts3 ?? []) r = Math.max(r, len3(v));
  return r || 1;
}

// ---------------------------------------------------------------- measurements

export function closureGap(surface, points) {
  const a = points[points.length - 1];
  const b = points[0];
  const d = surface.distance(a, b, {
    maxR: 8 * (surface.maxFaceSize ??= Math.max(...surface.faces.map((f) => f.size))),
  });
  if (Number.isFinite(d)) return d;
  return len3(sub3(surface.to3D(a), surface.to3D(b)));
}

// Lift an imprinted contour to 3D with its Darboux data: position, surface normal, unit tangent,
// geodesic curvature κg (turning angle / mean adjacent length, from logMaps at the vertex), normal curvature
// κn and geodesic torsion τg (from the curvature tensor). What a pen robot or a non-planar printer needs.
export function liftContour(surface, points, closed = false) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = i > 0 ? points[i - 1] : closed ? points[n - 1] : null;
    const next = i < n - 1 ? points[i + 1] : closed ? points[0] : null;
    const pos = surface.to3D(p);
    const normal = surface.normalAt(p);
    let tangent2 = null;
    let kappaG = 0;
    let lenPrev = 0;
    let lenNext = 0;
    const lNext = next ? surface.logMap(p, next) : null;
    const lPrev = prev ? surface.logMap(p, prev) : null;
    if (lNext) {
      tangent2 = lNext.dir;
      lenNext = lNext.distance;
    }
    if (lPrev) {
      lenPrev = lPrev.distance;
      if (!tangent2) tangent2 = [-lPrev.dir[0], -lPrev.dir[1]];
    }
    if (lNext && lPrev) {
      const inDir = [-lPrev.dir[0], -lPrev.dir[1]];
      const turn = Math.atan2(
        inDir[0] * lNext.dir[1] - inDir[1] * lNext.dir[0],
        inDir[0] * lNext.dir[0] + inDir[1] * lNext.dir[1],
      );
      kappaG = turn / (0.5 * (lenPrev + lenNext) || 1);
    }
    let kappaN = 0;
    let tauG = 0;
    let T = [0, 0, 0];
    if (tangent2) {
      const c = surface.curvatureAt(p, tangent2);
      kappaN = c.kn;
      tauG = c.tauG;
      const f = surface.faceById(p.faceId);
      T = norm3(add3(scl3(f.u, tangent2[0]), scl3(f.v, tangent2[1])));
    }
    out.push({ point: p, position: pos, normal, tangent: T, kappaG, kappaN, tauG });
  }
  return out;
}
