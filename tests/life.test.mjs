import { readFileSync } from 'node:fs';
import { assert } from './assert.mjs';
import { mobiusBandMesh, torusMesh, cylinderMesh, kleinBottleMesh, cellAdjacency } from '../manifold-core/index.js';
import { parseRule, lifeStep, PATTERNS } from '../demos/life/life.js';

const quads = (m) => m.triangles.map((_, t) => t >> 1);
const counts = (adj) => [...new Set(adj.map((a) => a.length))].sort().join(',');

export const tests = {
  'Life sliders: both allow 128 cells, preserving minimums, steps and defaults'() {
    const html = readFileSync(new URL('../demos/life/index.html', import.meta.url), 'utf8');
    for (const [id, min, step, value] of [
      ['nu', 12, 2, 80],
      ['nv', 4, 1, 14],
    ]) {
      const input = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
      assert(input, `missing ${id} slider`);
      for (const [attr, expected] of Object.entries({ type: 'range', min, max: 128, step, value })) {
        assert(input.includes(`${attr}="${expected}"`), `${id}: expected ${attr}="${expected}"`);
      }
      assert((128 - min) % step === 0, `${id}: 128 must be reachable by stepping`);
    }
  },

  'cellAdjacency: Moore/von Neumann from shared vertices/edges; Möbius seam flips, rim has 5'() {
    const nu = 60;
    const nv = 12;
    const mb = mobiusBandMesh(1.2, 0.6, nu, nv, 1);
    const adj = cellAdjacency(mb, quads(mb));
    assert(counts(adj) === '5,8', `Möbius: ${counts(adj)}`);
    assert(counts(cellAdjacency(mb, quads(mb), { by: 'edge' })) === '3,4', 'Möbius von Neumann');
    assert(
      adj[(nu - 1) * nv].includes(nv - 1) && !adj[(nu - 1) * nv].includes(0),
      'seam neighbour is the flipped cell',
    );
    const t = torusMesh(1.5, 0.5, 40, 16);
    assert(counts(cellAdjacency(t, quads(t))) === '8', 'torus: all 8');
    const k = kleinBottleMesh(1, 0.4, 48, 16);
    assert(counts(cellAdjacency(k, quads(k))) === '8', 'Klein: all 8');
    const c = cylinderMesh(1, 2, 40, 12);
    assert(counts(cellAdjacency(c, quads(c))) === '5,8', 'cylinder: rims 5');
  },

  'Life on the Möbius band: a spaceship returns mirrored after one loop, identical after two'() {
    const nu = 60;
    const nv = 12;
    const mb = mobiusBandMesh(1.2, 0.6, nu, nv, 1);
    const adj = cellAdjacency(mb, quads(mb));
    const rule = parseRule('B3/S23');
    let a = new Uint8Array(nu * nv);
    for (const [di, dj] of PATTERNS.lwss) a[(5 + di) * nv + 2 + dj] = 1;
    const start = a.slice();
    let b = new Uint8Array(a.length);
    const run = (steps) => {
      for (let s = 0; s < steps; s++) {
        lifeStep(a, adj, rule, b);
        [a, b] = [b, a];
      }
    };
    run(2 * nu); // speed c/2: one loop = 2·nu generations
    const mirrored = new Uint8Array(a.length);
    start.forEach((v, c) => v && (mirrored[Math.floor(c / nv) * nv + (nv - 1 - (c % nv))] = 1));
    assert(
      a.every((v, c) => v === mirrored[c]),
      'one loop: mirror image across the band (j -> nv-1-j)',
    );
    run(2 * nu);
    assert(
      a.every((v, c) => v === start[c]),
      'two loops: back to the original',
    );
  },
};
