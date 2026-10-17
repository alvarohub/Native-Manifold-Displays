// Fields on a Surface: values attached per vertex or per face, sampled at chart points.
// What a "reader" reads. Vertex fields interpolate barycentrically (piecewise linear, exact gradient per
// face); face fields are piecewise constant. A texture sampled through the mesh UVs is a vertex/corner field
// in disguise and will plug in here later (M4/M5).
import { sub2, cross2 } from './vec.js';

export class VertexField {
  // values: array indexed by vertex (numbers or equal-length arrays for vector/colour fields)
  constructor(surface, values) {
    this.surface = surface;
    this.values = values;
    this.dim = Array.isArray(values[0]) ? values[0].length : 0;
  }

  static from(surface, fn) {
    return new VertexField(
      surface,
      surface.vertices.map((v, i) => fn(v.position, i, v)),
    );
  }

  sample(point) {
    const f = this.surface.faceById(point.faceId);
    const l = this.surface.barycentric(point.faceId, point.x, point.y);
    const [a, b, c] = f.vidx.map((i) => this.values[i]);
    if (this.dim === 0) return l[0] * a + l[1] * b + l[2] * c;
    const out = new Array(this.dim);
    for (let k = 0; k < this.dim; k++) out[k] = l[0] * a[k] + l[1] * b[k] + l[2] * c[k];
    return out;
  }

  // Chart-frame gradient of a scalar field on the face (constant per face: the field is linear there).
  gradient(faceId) {
    const f = this.surface.faceById(faceId);
    const [p0, p1, p2] = f.verts2;
    const [v0, v1, v2] = f.vidx.map((i) => this.values[i]);
    const det = cross2(sub2(p1, p0), sub2(p2, p0));
    // ∇λ_i are the perpendiculars of the opposite edges, scaled by 1/det
    const g1 = [(p2[1] - p0[1]) / det, (p0[0] - p2[0]) / det];
    const g2 = [(p0[1] - p1[1]) / det, (p1[0] - p0[0]) / det];
    return [(v1 - v0) * g1[0] + (v2 - v0) * g2[0], (v1 - v0) * g1[1] + (v2 - v0) * g2[1]];
  }

  // Smooth one Laplacian step (umbrella weights) — cheap diffusion for noisy estimators.
  smoothed(iterations = 1, lambda = 0.5) {
    let vals = this.values.slice();
    const nbrs = vertexNeighbours(this.surface);
    for (let it = 0; it < iterations; it++) {
      const next = vals.slice();
      for (let i = 0; i < vals.length; i++) {
        const nb = nbrs[i];
        if (!nb.length) continue;
        if (this.dim === 0) {
          let s = 0;
          for (const j of nb) s += vals[j];
          next[i] = vals[i] + lambda * (s / nb.length - vals[i]);
        } else {
          next[i] = vals[i].map((x, k) => {
            let s = 0;
            for (const j of nb) s += vals[j][k];
            return x + lambda * (s / nb.length - x);
          });
        }
      }
      vals = next;
    }
    return new VertexField(this.surface, vals);
  }
}

export class FaceField {
  constructor(surface, values) {
    this.surface = surface;
    this.values = values;
  }

  static from(surface, fn) {
    return new FaceField(
      surface,
      surface.faces.map((f) => fn(f)),
    );
  }

  sample(point) {
    return this.values[point.faceId];
  }
}

export function vertexNeighbours(surface) {
  if (surface._vertexNeighbours) return surface._vertexNeighbours;
  const sets = surface.vertices.map(() => new Set());
  for (const f of surface.faces) {
    for (let e = 0; e < 3; e++) {
      const a = f.vidx[e];
      const b = f.vidx[(e + 1) % 3];
      sets[a].add(b);
      sets[b].add(a);
    }
  }
  surface._vertexNeighbours = sets.map((s) => [...s]);
  return surface._vertexNeighbours;
}
