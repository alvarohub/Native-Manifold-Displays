import { validatedFrame } from './placement.js';
import { applyRigid, dot3, sub3, add3, scl3 } from '../manifold-core/src/vec.js';

// Clip a source-face polygon while interpolating both its 3D positions and image coordinates.
function clip(polygon, value) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = value(a), db = value(b);
    if (da >= 0) out.push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db);
      out.push({
        uv: a.uv.map((v, k) => v + t * (b.uv[k] - v)),
        position: a.position.map((v, k) => v + t * (b.position[k] - v)),
        depth: a.depth + t * (b.depth - a.depth),
      });
    }
  }
  return out;
}

const area = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;

export function surfacePatch(surface, inputFrame, { width, height = width, mode = 'unfold', depth = width / 2 } = {}) {
  const frame = validatedFrame(surface, inputFrame);
  if (![width, height, depth].every(v => Number.isFinite(v) && v > 0)) throw new Error('Patch dimensions and depth must be positive finite surface lengths');
  if (!['unfold', 'projection'].includes(mode)) throw new Error('Image patches support unfold or projection mapping');
  const root = surface.faceById(frame.anchor.faceId);
  const center = surface.to3D(frame.anchor), h = frame.heading, hand = frame.hand;
  const xAxis = add3(scl3(root.u, h[0]), scl3(root.v, h[1]));
  const yAxis = scl3(add3(scl3(root.u, -h[1]), scl3(root.v, h[0])), hand);
  // Fixed radius for a given patch/root, not one cache entry per moving anchor position.
  const disk = mode === 'unfold' ? surface.develop(root.id, Math.hypot(width, height) + root.size) : null;
  const triangles = [], vertexUV = new Map();
  const candidates = disk ? disk.order.map(id => surface.faceById(id)) : surface.faces;
  for (const face of candidates) {
    if (mode === 'projection' && dot3(face.n, root.n) <= 1e-6) continue;
    const mapped = face.verts3.map((position, i) => {
      let x, y;
      if (disk) {
        const p = applyRigid(disk.maps.get(face.id), face.verts2[i]);
        const a = disk.toPlane(frame.anchor), dx = p[0] - a[0], dy = p[1] - a[1];
        x = dx * h[0] + dy * h[1];
        y = hand * (-dx * h[1] + dy * h[0]);
      } else {
        const d = sub3(position, center);
        x = dot3(d, xAxis);
        y = dot3(d, yAxis);
      }
      return { position: [...position], uv: [0.5 + x / width, 0.5 - y / height], depth: dot3(sub3(position, center), root.n) };
    });
    let polygon = mapped;
    for (const boundary of [v => v.uv[0], v => 1 - v.uv[0], v => v.uv[1], v => 1 - v.uv[1]]) polygon = clip(polygon, boundary);
    if (!disk) for (const boundary of [v => depth - v.depth, v => depth + v.depth]) polygon = clip(polygon, boundary);
    if (polygon.length < 3) continue;
    const pieces = [];
    for (let i = 1; i < polygon.length - 1; i++) {
      const vertices = [polygon[0], polygon[i], polygon[i + 1]];
      if (area(...vertices.map(v => v.uv)) > 1e-12) pieces.push({ faceId: face.id, vertices });
    }
    if (!pieces.length) continue;
    if (disk) {
      face.vidx.forEach((id, i) => {
        const uv = mapped[i].uv, previous = vertexUV.get(id), vertex = surface.vertices[id];
        if (uv.every(v => v > 1e-8 && v < 1 - 1e-8) &&
          (vertex.boundary || Math.abs(2 * Math.PI - vertex.angleSum) > 1e-7)) {
          throw new Error('Unfold patch contains a boundary or cone vertex; shrink it or use projection');
        }
        if (previous && Math.hypot(previous[0] - uv[0], previous[1] - uv[1]) > 1e-7) {
          throw new Error('Unfold patch crosses an inconsistent chart cut; shrink it or use projection');
        }
        vertexUV.set(id, uv);
      });
    }
    triangles.push(...pieces);
  }
  const coverage = triangles.reduce((sum, t) => sum + area(...t.vertices.map(v => v.uv)), 0);
  if (Math.abs(coverage - 1) > 1e-6) throw new Error(`Patch is not a complete single local sheet (UV coverage ${coverage.toFixed(6)}); shrink it or adjust projection depth`);
  const faces = new Set(triangles.map(t => t.faceId)), reached = new Set(), queue = [root.id];
  while (queue.length) {
    const id = queue.pop();
    if (reached.has(id) || !faces.has(id)) continue;
    reached.add(id);
    for (const edge of surface.faceById(id).edges) if (edge) queue.push(edge.toFaceId);
  }
  if (reached.size !== faces.size) throw new Error('Patch includes disconnected surface pieces; shrink it or adjust projection depth');
  for (let i = 0; i < triangles.length; i++) {
    const A = triangles[i].vertices;
    for (let j = i + 1; j < triangles.length; j++) {
      const B = triangles[j].vertices;
      if ([0, 1].some(k => Math.max(...A.map(v => v.uv[k])) <= Math.min(...B.map(v => v.uv[k])) + 1e-10 ||
        Math.max(...B.map(v => v.uv[k])) <= Math.min(...A.map(v => v.uv[k])) + 1e-10)) continue;
      const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const sign = Math.sign(cross(B[0].uv, B[1].uv, B[2].uv));
      let overlap = A;
      for (let k = 0; k < 3; k++) overlap = clip(overlap, v => sign * cross(B[k].uv, B[(k + 1) % 3].uv, v.uv));
      let overlapArea = 0;
      for (let k = 1; k < overlap.length - 1; k++) overlapArea += area(overlap[0].uv, overlap[k].uv, overlap[k + 1].uv);
      if (overlapArea > 1e-8) throw new Error('Patch overlaps multiple surface sheets; shrink it or adjust projection depth');
    }
  }
  return { triangles, mode, width, height };
}

// Orthogonal projection of vector contours; clip against the same exact source-face triangles as images.
export function projectContours(surface, frame, contours, options) {
  const patch = surfacePatch(surface, frame, { ...options, mode: 'projection' });
  const segments = [];
  for (const contour of contours) {
    if (!Array.isArray(contour.points) || contour.points.length < 2 ||
      !contour.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ||
      typeof contour.closed !== 'boolean') throw new Error('Contours require finite 2D points and a boolean closed flag');
    const points = contour.closed ? [...contour.points, contour.points[0]] : contour.points;
    for (let i = 1; i < points.length; i++) {
      const a = [0.5 + points[i - 1][0] / patch.width, 0.5 - points[i - 1][1] / patch.height];
      const b = [0.5 + points[i][0] / patch.width, 0.5 - points[i][1] / patch.height];
      if ([...a, ...b].some(v => v < -1e-9 || v > 1 + 1e-9)) throw new Error('Vector contour exceeds its projection patch');
      for (const triangle of patch.triangles) {
        const [A, B, C] = triangle.vertices;
        const barycentric = (p) => {
          const u = B.uv.map((v, k) => v - A.uv[k]), v = C.uv.map((x, k) => x - A.uv[k]);
          const q = p.map((x, k) => x - A.uv[k]), d = u[0] * v[1] - u[1] * v[0];
          const y = (q[0] * v[1] - q[1] * v[0]) / d, z = (u[0] * q[1] - u[1] * q[0]) / d;
          return [1 - y - z, y, z];
        };
        const ba = barycentric(a), bb = barycentric(b);
        let low = 0, high = 1;
        for (let k = 0; k < 3; k++) {
          const d = bb[k] - ba[k];
          if (Math.abs(d) < 1e-14) { if (ba[k] < -1e-10) high = -1; }
          else if (d > 0) low = Math.max(low, -ba[k] / d);
          else high = Math.min(high, -ba[k] / d);
        }
        if (high - low <= 1e-10) continue;
        const position = (t) => {
          const weights = ba.map((v, k) => v + t * (bb[k] - v));
          return A.position.map((_, k) => weights.reduce((sum, w, j) => sum + w * triangle.vertices[j].position[k], 0));
        };
        segments.push({ faceId: triangle.faceId, a: position(low), b: position(high) });
      }
    }
  }
  return segments;
}
