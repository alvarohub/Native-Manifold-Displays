export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

export function near(a, b, tol = 1e-9, msg = '') {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg} expected ${b}, got ${a} (tol ${tol})`);
}

export function nearVec(a, b, tol = 1e-9, msg = '') {
  if (a.length !== b.length) throw new Error(`${msg} length ${a.length} vs ${b.length}`);
  for (let i = 0; i < a.length; i++) near(a[i], b[i], tol, `${msg}[${i}]`);
}
