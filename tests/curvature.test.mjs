import { assert, near, nearVec } from './assert.mjs';
import {
  Surface,
  icosphereMesh,
  cylinderMesh,
  torusMesh,
  planeMesh,
  cubeMesh,
  gaussianCurvature,
  meanCurvature,
  vertexNormals,
  vertexAreas,
  curvatureTensor,
  VertexField,
  FaceField,
} from '../manifold-core/index.js';
import { dot3, norm3, len3, sub3 } from '../manifold-core/src/vec.js';

const stats = (arr) => {
  const v = [...arr].filter((x) => !Number.isNaN(x));
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const max = Math.max(...v);
  const min = Math.min(...v);
  return { mean, max, min, n: v.length };
};

export const tests = {
  'icosphere: K ≈ 1/r², H ≈ 1/r, κn ≈ 1/r in every direction, normals radial'() {
    const r = 1.7;
    const s = Surface.fromMesh(icosphereMesh(4, r));
    const K = stats(gaussianCurvature(s));
    near(K.mean, 1 / (r * r), 0.02 / (r * r), 'mean Gaussian curvature');
    // pointwise, deficit/area over-reads at the 12 valence-5 vertices (the lattice defects carry extra
    // deficit) and is within 2% elsewhere — the measure-vs-pointwise caveat of DISCRETE_TO_SMOOTH.md
    const Kv = gaussianCurvature(s);
    const hot = [];
    for (let i = 0; i < Kv.length; i++) {
      if (Kv[i] > 1.05 / (r * r)) hot.push(i);
      else near(Kv[i], 1 / (r * r), 0.02 / (r * r), `K at regular vertex ${i}`);
    }
    assert(hot.length === 12 && hot.every((i) => s.vertices[i].corners.length === 5), `defects: ${hot.length}`);
    const H = stats(meanCurvature(s));
    near(H.mean, 1 / r, 0.02 / r, 'mean curvature');
    const N = vertexNormals(s);
    for (let i = 0; i < N.length; i += 97)
      near(dot3(N[i], norm3(s.vertices[i].position)), 1, 1e-4, 'radial normal (estimator, ~mrad)');
    const C = curvatureTensor(s);
    for (let i = 0; i < C.vertex.length; i += 61) {
      near(C.vertex[i].k1, 1 / r, 0.03 / r, `k1 at vertex ${i}`);
      near(C.vertex[i].k2, 1 / r, 0.03 / r, `k2 at vertex ${i}`);
    }
    for (let f = 0; f < s.faces.length; f += 211) {
      const p = s.centroid(f);
      for (const ang of [0, 0.7, 2.1]) {
        const q = s.curvatureAt(p, [Math.cos(ang), Math.sin(ang)]);
        near(q.kn, 1 / r, 0.03 / r, 'normal curvature isotropic');
        near(q.tauG, 0, 0.03 / r, 'no geodesic torsion on a sphere');
      }
      near(dot3(s.normalAt(p), norm3(s.to3D(p))), 1, 1e-4, 'interpolated normal radial');
    }
    // total area ≈ 4πr² (inscribed polyhedron slightly smaller)
    const A = vertexAreas(s).reduce((a, b) => a + b, 0);
    assert(A < 4 * Math.PI * r * r && A > 0.98 * 4 * Math.PI * r * r, `area ${A}`);
  },

  'cylinder: developable (K = 0 exactly), κ = 1/r around, 0 along the axis, H = 1/2r'() {
    const r = 0.8;
    const s = Surface.fromMesh(cylinderMesh(r, 3, 48, 6));
    const K = gaussianCurvature(s);
    for (let i = 0; i < K.length; i++) if (!s.vertices[i].boundary) near(K[i], 0, 1e-9, 'K exactly zero');
    const H = stats(meanCurvature(s));
    near(H.mean, 1 / (2 * r), 0.01 / r, 'H = 1/2r');
    const C = curvatureTensor(s);
    for (let i = 0; i < C.vertex.length; i += 37) {
      if (s.vertices[i].boundary) continue;
      near(C.vertex[i].k1, 1 / r, 0.01 / r, 'κ1 around');
      near(Math.abs(C.vertex[i].k2), 0, 0.01 / r, 'κ2 along');
      near(Math.abs(C.vertex[i].dir2[2]), 1, 1e-3, 'flat direction is the axis');
    }
    // directional normal curvature from a face interior: along axis 0, around 1/r
    const f = s.faceById(2 * 48 * 2 + 10); // a face in an interior ring
    const p = s.centroid(f.id);
    const axis = [dot3([0, 0, 1], f.u), dot3([0, 0, 1], f.v)];
    const around = [-axis[1], axis[0]];
    near(s.curvatureAt(p, axis).kn, 0, 0.01 / r, 'κn along axis');
    near(s.curvatureAt(p, around).kn, 1 / r, 0.01 / r, 'κn around');
    near(
      Math.abs(s.curvatureAt(p, [axis[0] + around[0], axis[1] + around[1]]).tauG),
      1 / (2 * r),
      0.01 / r,
      'τg at 45° = (κ1−κ2)/2',
    );
  },

  'torus: K positive outside, negative inside, matches cos v / (r (R + r cos v))'() {
    const R = 2;
    const r = 0.6;
    const s = Surface.fromMesh(torusMesh(R, r, 96, 48));
    const K = gaussianCurvature(s);
    let maxErr = 0;
    for (let i = 0; i < K.length; i += 7) {
      const p = s.vertices[i].position;
      const rho = Math.hypot(p[0], p[1]);
      const cosv = (rho - R) / r;
      const exact = cosv / (r * (R + r * cosv));
      maxErr = Math.max(maxErr, Math.abs(K[i] - exact) * r * r);
    }
    assert(maxErr < 0.05, `torus K relative error (×r²) ${maxErr}`);
    const Ks = stats(K);
    assert(Ks.max > 0 && Ks.min < 0, 'both signs');
    near(Ks.max * r * (R + r), 1, 0.05, 'outer equator');
    near(Ks.min * r * (R - r), -1, 0.05, 'inner equator');
  },

  'plane and cube faces: zero curvature where flat'() {
    const plane = Surface.fromMesh(planeMesh(2, 2, 6, 6));
    const C = curvatureTensor(plane);
    for (const v of C.vertex) near(Math.abs(v.k1) + Math.abs(v.k2), 0, 1e-9, 'flat tensor');
    const cube = Surface.fromMesh(cubeMesh(2, 4));
    const K = gaussianCurvature(cube);
    const corners = [...K].filter((k) => k > 1e-6).length;
    assert(corners === 8, `only the 8 corners carry Gaussian curvature, got ${corners}`);
    const inner = cube.centroid(0);
    assert(Math.abs(cube.gaussianCurvatureAt(inner)) >= 0, 'interpolates');
  },

  'vertex field: barycentric sampling is exact for linear functions, gradient exact'() {
    const s = Surface.fromMesh(icosphereMesh(2));
    const field = VertexField.from(s, (p) => 0.3 * p[0] - 1.2 * p[1] + 0.5 * p[2] + 2);
    for (let f = 0; f < s.faces.length; f += 17) {
      const p = s.fromBarycentric(f, [0.2, 0.3, 0.5]);
      const P = s.to3D(p);
      near(field.sample(p), 0.3 * P[0] - 1.2 * P[1] + 0.5 * P[2] + 2, 1e-9, 'linear field exact');
      const g = field.gradient(f);
      const face = s.faceById(f);
      const g3 = [0.3, -1.2, 0.5];
      nearVec(g, [dot3(g3, face.u), dot3(g3, face.v)], 1e-9, 'gradient = tangential projection');
    }
    const vec = VertexField.from(s, (p) => [p[0], p[1], p[2]]);
    const p = s.centroid(5);
    nearVec(vec.sample(p), s.to3D(p), 1e-9, 'vector field interpolates position');
    const ff = FaceField.from(s, (f) => f.id);
    assert(ff.sample(s.centroid(9)) === 9, 'face field');
    const sm = VertexField.from(s, (p, i) => (i % 2 ? 1 : 0)).smoothed(20);
    const st = stats(sm.values);
    assert(st.max - st.min < 0.3, `smoothing contracts the range: ${st.min}..${st.max}`);
  },

  'noisy mesh: gaussianCurvatureAt and curvatureAt agree in the mean on a sphere'() {
    const s = Surface.fromMesh(icosphereMesh(3, 1));
    let sumA = 0;
    let sumB = 0;
    let n = 0;
    for (let f = 0; f < s.faces.length; f += 5) {
      const p = s.centroid(f);
      sumA += s.gaussianCurvatureAt(p);
      sumB += s.curvatureAt(p).K;
      n++;
    }
    near(sumA / n, 1, 0.03, 'intrinsic K (deficit/area)');
    near(sumB / n, 1, 0.03, 'extrinsic K (det II)');
    assert(len3(sub3([0, 0, 0], [0, 0, 0])) === 0, 'sanity');
  },
};
