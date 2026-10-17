// Planar curves for manifold-ink: path commands (SVG or opentype.js style) -> flattened, uniformly resampled
// contours; polyline helpers. Everything here is 2D and dependency-free.
//
// Contour: { points: [[x, y], ...], closed: boolean }. Path command: { type: 'M'|'L'|'C'|'Q'|'Z', x, y, x1, y1,
// x2, y2 } with absolute coordinates (the shape opentype.js `getPath().commands` already has).

// ---------------------------------------------------------------- SVG path d-string -> commands
export function parseSVGPath(d) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const cmds = [];
  let i = 0;
  let cmd = null;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCtrl = null;
  const num = () => parseFloat(tokens[i++]);
  const isNum = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const px = () => (rel ? cx : 0);
    const py = () => (rel ? cy : 0);
    switch (C) {
      case 'M': {
        cx = px() + num();
        cy = py() + num();
        sx = cx;
        sy = cy;
        cmds.push({ type: 'M', x: cx, y: cy });
        cmd = rel ? 'l' : 'L'; // subsequent pairs are implicit line-tos
        lastCtrl = null;
        break;
      }
      case 'L': {
        cx = px() + num();
        cy = py() + num();
        cmds.push({ type: 'L', x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      case 'H': {
        cx = px() + num();
        cmds.push({ type: 'L', x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      case 'V': {
        cy = py() + num();
        cmds.push({ type: 'L', x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      case 'C': {
        const x1 = px() + num(),
          y1 = py() + num(),
          x2 = px() + num(),
          y2 = py() + num();
        cx = px() + num();
        cy = py() + num();
        cmds.push({ type: 'C', x1, y1, x2, y2, x: cx, y: cy });
        lastCtrl = [x2, y2];
        break;
      }
      case 'S': {
        const x1 = lastCtrl ? 2 * cx - lastCtrl[0] : cx;
        const y1 = lastCtrl ? 2 * cy - lastCtrl[1] : cy;
        const x2 = px() + num(),
          y2 = py() + num();
        cx = px() + num();
        cy = py() + num();
        cmds.push({ type: 'C', x1, y1, x2, y2, x: cx, y: cy });
        lastCtrl = [x2, y2];
        break;
      }
      case 'Q': {
        const x1 = px() + num(),
          y1 = py() + num();
        cx = px() + num();
        cy = py() + num();
        cmds.push({ type: 'Q', x1, y1, x: cx, y: cy });
        lastCtrl = [x1, y1];
        break;
      }
      case 'T': {
        const x1 = lastCtrl ? 2 * cx - lastCtrl[0] : cx;
        const y1 = lastCtrl ? 2 * cy - lastCtrl[1] : cy;
        cx = px() + num();
        cy = py() + num();
        cmds.push({ type: 'Q', x1, y1, x: cx, y: cy });
        lastCtrl = [x1, y1];
        break;
      }
      case 'A': {
        // arcs are approximated by their chord (rare in glyph/logo paths; good enough for a first pass)
        num();
        num();
        num();
        num();
        num();
        cx = px() + num();
        cy = py() + num();
        cmds.push({ type: 'L', x: cx, y: cy });
        lastCtrl = null;
        break;
      }
      case 'Z': {
        cmds.push({ type: 'Z' });
        cx = sx;
        cy = sy;
        lastCtrl = null;
        break;
      }
      default:
        throw new Error(`unsupported SVG path command ${cmd}`);
    }
    if (C === 'Z' && isNum()) cmd = rel ? 'l' : 'L';
  }
  return cmds;
}

// ---------------------------------------------------------------- commands -> contours
// step: target spacing of the resampled points; flipY mirrors the y axis (font/screen coordinates are y-down).
export function contoursFromCommands(commands, { step = 1, flipY = false, curveSegments = 12 } = {}) {
  const contours = [];
  let cur = null;
  const push = (x, y) => cur.points.push([x, flipY ? -y : y]);
  const flush = () => {
    if (cur && cur.points.length > 1) contours.push(cur);
    cur = null;
  };
  let last = [0, 0];
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        flush();
        cur = { points: [], closed: false };
        push(c.x, c.y);
        last = [c.x, c.y];
        break;
      case 'L':
        if (!cur) cur = { points: [[last[0], flipY ? -last[1] : last[1]]], closed: false };
        push(c.x, c.y);
        last = [c.x, c.y];
        break;
      case 'C':
        for (let k = 1; k <= curveSegments; k++) {
          const t = k / curveSegments;
          const p = cubic(last, [c.x1, c.y1], [c.x2, c.y2], [c.x, c.y], t);
          push(p[0], p[1]);
        }
        last = [c.x, c.y];
        break;
      case 'Q':
        for (let k = 1; k <= curveSegments; k++) {
          const t = k / curveSegments;
          const p = quadratic(last, [c.x1, c.y1], [c.x, c.y], t);
          push(p[0], p[1]);
        }
        last = [c.x, c.y];
        break;
      case 'Z':
        if (cur) {
          cur.closed = true;
          flush();
        }
        break;
      default:
        break;
    }
  }
  flush();
  return contours.map((ct) => resampleContour(ct, step)).filter((ct) => ct.points.length > 1);
}

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

function quadratic(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

// ---------------------------------------------------------------- polyline helpers
export function polylineLength(points, closed = false) {
  let L = 0;
  for (let i = 1; i < points.length; i++)
    L += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  if (closed && points.length > 1) {
    const a = points[points.length - 1];
    const b = points[0];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

// Uniform arc-length resampling; closed contours get the closing segment sampled too (last point ≠ first).
export function resampleContour({ points, closed }, step) {
  const pts = dedupe(points);
  if (pts.length < 2) return { points: pts, closed };
  const src = closed ? [...pts, pts[0]] : pts;
  const L = polylineLength(src);
  const n = Math.max(closed ? 3 : 2, Math.round(L / step));
  const h = L / (closed ? n : n - 1);
  const out = [src[0]];
  let seg = 0;
  let acc = 0; // length consumed in the current segment
  let segLen = dist(src[0], src[1]);
  const count = closed ? n : n - 1; // number of points to generate after the first
  for (let k = 1; k <= count; k++) {
    let remaining = h;
    while (remaining > segLen - acc - 1e-12 && seg < src.length - 2) {
      remaining -= segLen - acc;
      seg++;
      acc = 0;
      segLen = dist(src[seg], src[seg + 1]);
    }
    acc += remaining;
    const t = segLen > 0 ? Math.min(1, acc / segLen) : 1;
    const a = src[seg];
    const b = src[seg + 1];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  if (closed) out.pop(); // the last generated point coincides with the start
  return { points: out, closed };
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-12) out.push(p);
  }
  return out;
}

function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function contoursBBox(contours) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of contours)
    for (const [x, y] of c.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

// Translate/scale contours in the plane (used to centre text on its bbox before imprinting).
export function transformContours(contours, { dx = 0, dy = 0, scale = 1 } = {}) {
  return contours.map((c) => ({
    closed: c.closed,
    points: c.points.map(([x, y]) => [(x + dx) * scale, (y + dy) * scale]),
  }));
}

// Signed turning angles at interior vertices (and at the seam for closed contours): the turtle's steering.
export function turningAngles(points, closed = false) {
  const n = points.length;
  const out = [];
  const dirAt = (i) => {
    const a = points[i];
    const b = points[(i + 1) % n];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  const upto = closed ? n : n - 2;
  for (let i = 0; i < upto; i++) {
    const d0 = dirAt(i);
    const d1 = dirAt((i + 1) % n);
    let dt = d1 - d0;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    out.push(dt);
  }
  return out;
}

// Simple generators for tests and demos.
export function circleContour(radius, n = 64, cx = 0, cy = 0) {
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return { points, closed: true };
}

export function rectContour(w, h, cx = 0, cy = 0) {
  return {
    points: [
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2],
      [cx - w / 2, cy + h / 2],
    ],
    closed: true,
  };
}
