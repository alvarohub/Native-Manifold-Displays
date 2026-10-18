import { readFileSync } from 'node:fs';
import { assert, near } from './assert.mjs';
import { MESHES } from '../demos/shared/meshes.js';
import { buildLifeSurface, cellBorderEdges } from '../demos/life/surfaces.js';
import { lifeStep, parseRule } from '../demos/life/life.js';
import { importMesh, writeBinarySTL, Surface, cellAdjacency, planeMesh } from '../manifold-core/index.js';

const bunnyOBJ = readFileSync(new URL('../demos/assets/bunny.obj', import.meta.url), 'utf8');

export const tests = {
  'demo meshes: bundled bunny imports as a modest, closed manifold through OBJ and STL'() {
    const { mesh, report } = importMesh('bunny.obj', bunnyOBJ);
    assert(report.vertices === 1839 && report.triangles === 3674, 'expected low-resolution bunny');
    assert(report.closed && report.orientable && report.components === 1, 'one closed orientable component');
    assert(report.nonManifoldEdges === 0 && report.euler === 2, 'manifold sphere topology');
    assert(report.degenerate === 0 && report.duplicates === 0, 'no bad triangles');
    const stl = importMesh('bunny.stl', writeBinarySTL(mesh));
    assert(stl.report.closed && stl.report.triangles === 3674 && stl.report.euler === 2, 'STL round-trip');
    const surface = Surface.fromMesh(mesh);
    assert(surface.degenerateFaces === 0 && surface.faces.length === 3674, 'all triangles charted');
    const start = surface.centroid(1200);
    const trace = surface.trace(start, [1, 0.3], 0.2);
    assert(surface.contains(trace.end.faceId, trace.end.x, trace.end.y, 1e-7), 'geodesic endpoint in its chart');
    assert(trace.end.faceId !== start.faceId, 'trace crosses bunny triangles');
    near(surface.totalDeficit(), 4 * Math.PI, 1e-6, 'bunny Gauss-Bonnet');
  },

  async 'demo meshes: bunny asset handles fetch failures and supplies independent meshes'() {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    try {
      globalThis.fetch = async () => ({ ok: false, status: 404 });
      let failed = false;
      try {
        await MESHES.bunny.load();
      } catch (err) {
        failed = err.message.includes('HTTP 404');
      }
      assert(failed, 'failed fetch is explicit');
      globalThis.fetch = async (url) => {
        requests++;
        assert(url.pathname.endsWith('/demos/assets/bunny.obj'), 'module-relative local OBJ');
        return { ok: true, text: async () => bunnyOBJ };
      };
      await Promise.all([MESHES.bunny.load(), MESHES.bunny.load()]);
      assert(requests === 1, 'concurrent loads share a request');
      const a = MESHES.bunny.build();
      const b = MESHES.bunny.build();
      a.positions[0][0] += 100;
      assert(a.positions[0][0] !== b.positions[0][0], 'no shared mutable mesh');
      const layout = buildLifeSurface('bunny', 80, 14);
      assert(layout.dims === null && layout.cellOf.length === 3674, 'one triangle per cell');
      assert(layout.cellOf.every((c, t) => c === t), 'no arbitrary triangle pairing');
      const edges = cellAdjacency(layout.mesh, layout.cellOf, { by: 'edge' });
      assert(edges.every((ns) => ns.length === 3), 'closed bunny triangles have 3 edge neighbours');
      const vertices = cellAdjacency(layout.mesh, layout.cellOf);
      assert(new Set(vertices.map((ns) => ns.length)).size > 1, 'vertex neighbours have variable degree');
      for (const adj of [edges, vertices]) {
        assert(adj.every((ns, c) => !ns.includes(c) && ns.every((d) => adj[d].includes(c))), 'symmetric graph');
        let alive = Uint8Array.from(adj, (_, c) => (c * 17) % 10 < 3);
        const expected = alive.map((a, c) => {
          const count = adj[c].reduce((n, d) => n + alive[d], 0);
          return a ? +(count === 2 || count === 3) : +(count === 3);
        });
        let next = lifeStep(alive, adj, parseRule('B3/S23'));
        assert(next.every((a, c) => a === expected[c]), 'triangle Life matches independent count');
        for (let i = 0; i < 60; i++) {
          [alive, next] = [next, alive];
          lifeStep(alive, adj, parseRule('B3/S23'), next);
        }
        assert(next.every((a) => a === 0 || a === 1), 'multiple generations preserve binary states');
      }
      assert(cellBorderEdges(layout.mesh, layout.cellOf).length === 5511, 'all triangle edges drawn once');
    } finally {
      globalThis.fetch = originalFetch;
    }
  },

  'demo meshes: original Life grids retain dimensions and quad pairing at both slider maximums'() {
    for (const key of ['mobius', 'cylinder', 'torus', 'klein', 'cube', 'plane']) {
      const { mesh, dims, cellOf } = buildLifeSurface(key, 128, 128);
      const count = key === 'cube' ? 6 * 13 * 13 : 128 * 128;
      assert(dims[0] * dims[1] === count, `${key}: expected dimensions`);
      assert(mesh.triangles.length === 2 * count, `${key}: two triangles per quad`);
      assert(cellOf.every((c, t) => c === t >> 1), `${key}: preserved pairing`);
      assert(cellAdjacency(mesh, cellOf).length === count, `${key}: all cells have adjacency entries`);
    }
  },

  'demo meshes: imported layouts and borders do not assume consecutive triangle pairs'() {
    const mesh = planeMesh(2, 2, 1, 1);
    const custom = buildLifeSurface('custom', 80, 14, mesh);
    assert(custom.dims === null && custom.cellOf.join(',') === '0,1', 'custom triangles are individual cells');
    assert(cellBorderEdges(mesh, custom.cellOf).length === 5, 'triangle diagonal included, no duplicate edges');
    assert(cellBorderEdges(mesh, [0, 0]).length === 4, 'quad internal diagonal excluded');
    for (const key of ['icosphere', 'mobiusPaper', 'mobius3', 'tetra']) {
      const layout = buildLifeSurface(key, 80, 14);
      assert(layout.dims === null && layout.cellOf.every((c, t) => c === t), `${key}: triangle fallback`);
    }
  },
};
