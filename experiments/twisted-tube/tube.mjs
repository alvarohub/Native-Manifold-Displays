// EXPERIMENT (not library): twisted rectangular tube — a rectangle (half-sizes a, b) swept around a circle of
// radius R, rotated by `halfTwists` half-twists per turn (twist centred at u = π). Generalises the square tube
// of experiments/geodesic-surfaces (a = b); a ≫ b = paper-rectangular band (crumple-free Möbius-like strip,
// pending verification of orientability).
// Grid over (u, arclength s around the section), corners exactly on ±a/±b, welded by position: coincident
// corner vertices merge, which implements the twist relabelling (corner k ↦ k + halfTwists mod 4).
import { weldVertices } from '../../manifold-core/index.js';

export function twistedTubeMesh(R = 1.3, a = 0.3, b = 0.3, nu = 32, na = 8, nb = 8, halfTwists = 1) {
  const cols = 2 * na + 2 * nb; // grid steps around the section
  const positions = [];
  for (let i = 0; i < nu; i++) {
    const u = (i / nu) * 2 * Math.PI;
    const c = Math.cos(u), s = Math.sin(u);
    const t = ((u - Math.PI) * halfTwists) / 2;
    const ct = Math.cos(t), st = Math.sin(t);
    for (let j = 0; j < cols; j++) {
      let p, q;
      if (j < na) [p, q] = [a, -b + (2 * b * j) / na];
      else if (j < na + nb) [p, q] = [a - (2 * a * (j - na)) / nb, b];
      else if (j < 2 * na + nb) [p, q] = [-a, b - (2 * b * (j - na - nb)) / na];
      else [p, q] = [-a + (2 * a * (j - 2 * na - nb)) / nb, -b];
      const A = p * ct - q * st;
      const B = p * st + q * ct;
      positions.push([(R + A) * c, (R + A) * s, B]);
    }
  }
  const id = (i, j) => (((i % nu) + nu) % nu) * cols + ((j % cols) + cols) % cols;
  const triangles = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < cols; j++) {
      triangles.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  return weldVertices({ positions, triangles }, 1e-12);
}
