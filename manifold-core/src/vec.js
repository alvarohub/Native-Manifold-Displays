// Small vector / 2x2 matrix helpers shared by manifold-core. Arrays in, arrays out; no classes.

export const EPS = 1e-9;

export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scl3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => {
  const n = len3(a);
  return n < EPS ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scl2 = (a, s) => [a[0] * s, a[1] * s];
export const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len2 = (a) => Math.hypot(a[0], a[1]);
export const perp2 = (a) => [-a[1], a[0]];
export const norm2 = (v) => {
  const n = len2(v);
  return n < EPS ? [0, 0] : [v[0] / n, v[1] / n];
};
export const angleOf2 = (v) => Math.atan2(v[1], v[0]);
export const fromAngle2 = (a) => [Math.cos(a), Math.sin(a)];

// 2x2 matrices as {a, b, c, d} = [[a, b], [c, d]].
export const mat2 = (a, b, c, d) => ({ a, b, c, d });
export const I2 = () => mat2(1, 0, 0, 1);
export const apply2 = (M, p) => [M.a * p[0] + M.b * p[1], M.c * p[0] + M.d * p[1]];
export const matMul2 = (A, B) =>
  mat2(A.a * B.a + A.b * B.c, A.a * B.b + A.b * B.d, A.c * B.a + A.d * B.c, A.c * B.b + A.d * B.d);
export const transpose2 = (M) => mat2(M.a, M.c, M.b, M.d);
export const colsToMat2 = (e1, e2) => mat2(e1[0], e2[0], e1[1], e2[1]);
export const det2 = (M) => M.a * M.d - M.b * M.c;
export const rot2 = (angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return mat2(c, -s, s, c);
};
// Rotation angle of an orthogonal M (reflections report the angle of their first column).
export const angleOfMat2 = (M) => Math.atan2(M.c, M.a);

// Rigid motion p' = M p + t as {M, t}; compose(outer, inner)(p) = outer(inner(p)).
export const composeRigid = (outer, inner) => ({
  M: matMul2(outer.M, inner.M),
  t: add2(apply2(outer.M, inner.t), outer.t),
});
export const invertRigid = ({ M, t }) => {
  const Mi = transpose2(M); // orthogonal
  return { M: Mi, t: scl2(apply2(Mi, t), -1) };
};
export const applyRigid = ({ M, t }, p) => add2(apply2(M, p), t);
