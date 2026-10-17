// Discrete developable Möbius band: planar quads between two rims, rulings free to slide/tilt.
// Unknowns: 3D rim points X (P_0..P_{n-1}, Q_0..Q_{n-1}) and development abscissae D (s_0..s_{n-1}, t_0..t_{n-1}).
// Corner (side, i) lives at (D[var] + k·L, y) in the flat L×w strip; crossing the seam swaps P↔Q (half twist).
import { Surface } from '../manifold-core/index.js';

export function paperBand(L, w, n, { iters = 6000, bend = 0.02, finalIters = 20000, tol = 1e-9 } = {}) {
  const h = L / n;
  const R = L / (2 * Math.PI);
  const X = [];
  for (const side of [0, 1])
    for (let i = 0; i < n; i++) {
      const u = (i / n) * 2 * Math.PI;
      const t = u / 2;
      const v = side ? w / 2 : -w / 2;
      X.push([(R + v * Math.cos(t)) * Math.cos(u), (R + v * Math.cos(t)) * Math.sin(u), v * Math.sin(t)]);
    }
  const D = [];
  for (const side of [0, 1]) for (let i = 0; i < n; i++) D.push(i * h);
  const corner = (side, i) => {
    const k = Math.floor(i / n);
    const r = i - k * n;
    const s2 = side ^ (k & 1);
    const idx = s2 ? n + r : r;
    return { v: idx, d: idx, off: k * L, y: side ? w : 0 };
  };
  const hard = [];
  const soft = [];
  for (let i = 0; i < n; i++) {
    const P0 = corner(0, i), P1 = corner(0, i + 1), Q0 = corner(1, i), Q1 = corner(1, i + 1);
    hard.push([P0, P1], [Q0, Q1], [P0, Q0], [P0, Q1], [P1, Q0]); // 4 sides + 2 diagonals = rigid planar quad
    soft.push([corner(0, i - 1), corner(1, i + 1)], [corner(1, i - 1), corner(0, i + 1)]); // hinge springs = bending
  }
  const project = (list, k) => {
    let err = 0;
    for (const [A, B] of list) {
      const xa = X[A.v], xb = X[B.v];
      const dx = xa[0] - xb[0], dy = xa[1] - xb[1], dz = xa[2] - xb[2];
      const len = Math.hypot(dx, dy, dz);
      const ex = D[B.d] + B.off - (D[A.d] + A.off);
      const T = Math.hypot(ex, B.y - A.y);
      const C = len - T;
      err = Math.max(err, Math.abs(C) / T);
      const g = ex / T; // ∂C/∂D_A = +g, ∂C/∂D_B = −g
      const wD = 1; const denom = 2 + wD * 2 * g * g;
      const lam = (-k * C) / denom;
      const ux = dx / len, uy = dy / len, uz = dz / len;
      xa[0] += lam * ux; xa[1] += lam * uy; xa[2] += lam * uz;
      xb[0] -= lam * ux; xb[1] -= lam * uy; xb[2] -= lam * uz;
      D[A.d] += wD * lam * g;
      D[B.d] -= wD * lam * g;
    }
    return err;
  };
  for (let it = 0; it < iters; it++) {
    project(soft, bend);
    project(hard, 1);
  }
  let err = Infinity;
  let m = 0;
  while (err > tol && m++ < finalIters) err = project(hard, 1);
  const triangles = [];
  for (let i = 0; i < n; i++) {
    const a = corner(0, i).v, b = corner(0, i + 1).v, c = corner(1, i + 1).v, d = corner(1, i).v;
    triangles.push([a, b, c], [a, c, d]);
  }
  return { positions: X, triangles, isometryError: err, D, n, w };
}

export function report(m) {
  const { positions: P, triangles: T, n } = m;
  const nrm = (t) => { const [a, b, c] = t.map((i) => P[i]); const u = b.map((x, k) => x - a[k]), v = c.map((x, k) => x - a[k]); const x = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]; const l = Math.hypot(...x); return x.map((q) => q / l); };
  const N = T.map(nrm);
  const ang = (a, b) => (Math.acos(Math.min(1, Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))) * 180) / Math.PI;
  let inQuad = 0, across = 0, rms = 0;
  for (let i = 0; i < n; i++) {
    inQuad = Math.max(inQuad, ang(N[2*i], N[2*i+1]));
    const a = ang(N[2*i+1], N[(2*i+2) % N.length]);
    across = Math.max(across, a); rms += a*a;
  }
  const tilt = [];
  for (let i = 0; i < n; i++) tilt.push((Math.atan2(m.D[n + i] - m.D[i], m.w) * 180) / Math.PI);
  return `iso ${m.isometryError.toExponential(1)}  in-quad fold max ${inQuad.toFixed(2)}°  across-ruling fold max ${across.toFixed(1)}° rms ${Math.sqrt(rms/n).toFixed(1)}°  ruling tilt ${Math.min(...tilt).toFixed(0)}..${Math.max(...tilt).toFixed(0)}°`;
}
