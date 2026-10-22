import { assert, near } from './assert.mjs';
import { Surface, cubeMesh, planeMesh, dodecahedronMesh, mobiusBandMesh, surfaceEdges } from '../manifold-core/index.js';
import { surfaceSettings, edgeOpacity, scalarRange } from '../demos/shared/surfaceStyle.js';

export const tests = {
  'surface view: coplanar triangulation edges disappear without removing polyhedron creases'() {
    for (const [mesh, creases] of [[cubeMesh(2, 1), 12], [dodecahedronMesh(), 30]]) {
      const edges = surfaceEdges(Surface.fromMesh(mesh));
      const settings = surfaceSettings({ edges: { mode: 'feature', angle: 0 } }).edges;
      const features = edges.filter((e) => edgeOpacity(e, settings) > 0);
      assert(features.length === creases, 'only polygon edges retained');
      assert(edges.length > features.length, 'coplanar diagonals removed');
      for (const e of features) assert(e.angle > 0 && !e.boundary, 'crease has bending angle');
    }
    const edges = surfaceEdges(Surface.fromMesh(cubeMesh(2, 1)));
    for (const e of edges.filter((e) => e.angle > 1e-7)) near(e.angle, Math.PI / 2, 1e-12, 'cube bends 90 degrees');
    const theta = 1e-8;
    const shallow = Surface.fromMesh({
      positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -Math.cos(theta), Math.sin(theta)]],
      triangles: [[0, 1, 2], [1, 0, 3]],
    });
    const fold = surfaceEdges(shallow).find((e) => !e.boundary);
    near(fold.angle, theta, 1e-14, 'real shallow folds are not rounded to coplanar');
    assert(edgeOpacity(fold, surfaceSettings({ edges: { mode: 'feature', angle: 0 } }).edges) === 1,
      'a genuine shallow fold survives a zero-degree threshold');
  },

  'surface view: bending angles are independent of local winding, including nonorientable seams'() {
    for (const mesh of [cubeMesh(2, 1), mobiusBandMesh(1, 0.5, 24, 4)]) {
      const before = surfaceEdges(Surface.fromMesh(mesh));
      const flipped = structuredClone(mesh);
      flipped.triangles.forEach((t, i) => { if (i % 3) [t[1], t[2]] = [t[2], t[1]]; });
      const after = new Map(surfaceEdges(Surface.fromMesh(flipped)).map((e) => [`${e.a}:${e.b}`, e]));
      for (const a of before) {
        const b = after.get(`${a.a}:${a.b}`);
        assert(a.boundary === b.boundary && a.nonManifold === b.nonManifold, 'topology unchanged');
        if (a.angle !== null) near(a.angle, b.angle, 1e-12, 'same bending despite chart orientation');
      }
    }
  },

  'surface view: boundaries and nonmanifold edges remain explicit, and angular fade is continuous'() {
    const edges = surfaceEdges(Surface.fromMesh(planeMesh(2, 2, 2, 2)));
    const settings = surfaceSettings({ edges: { mode: 'feature', angle: 180, fade: 40 } }).edges;
    assert(edges.filter((e) => edgeOpacity(e, settings) > 0).length === 8, 'all open boundaries retained at any threshold');
    const mesh = { positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]],
      triangles: [[0, 1, 2], [1, 0, 3], [0, 1, 4]] };
    const junction = surfaceEdges(Surface.fromMesh(mesh)).find((e) => e.nonManifold);
    assert(junction.angle === null && edgeOpacity(junction, settings) === 1, 'no fabricated angle for a three-face junction');
    const fading = { ...settings, angle: 10, fade: 20 };
    near(edgeOpacity({ angle: 10 * Math.PI / 180 }, fading), 0, 1e-12, 'threshold');
    near(edgeOpacity({ angle: 20 * Math.PI / 180 }, fading), 0.5, 1e-12, 'fade midpoint');
    near(edgeOpacity({ angle: 30 * Math.PI / 180 }, fading), 1, 1e-12, 'full opacity');
    assert(edgeOpacity({ angle: 0 }, { ...fading, mode: 'all' }) === 1, 'all-edges mode retains diagonals');
  },

  'surface view: settings reject invalid input and do not alias callers or overwrite unrelated styles'() {
    const previous = surfaceSettings({ faces: { source: 'custom' }, edges: { width: 3 } });
    const range = [-2, 4];
    const next = surfaceSettings({ vertices: { range }, faces: { visible: false } }, previous);
    range[0] = -99;
    assert(next.vertices.range[0] === -2 && previous.faces.visible && next.edges.width === 3, 'immutable independent state');
    for (const patch of [{ edges: { angle: NaN } }, { faces: { opacity: 2 } }, { vertices: { range: [2, 1] } },
      { faces: { source: 'texture' } }, { edges: { visible: 1 } }, { edges: { typo: 2 } }]) {
      let thrown = false;
      try { surfaceSettings(patch); } catch (e) { thrown = e instanceof Error; }
      assert(thrown, 'invalid settings fail explicitly');
    }
    assert(scalarRange([NaN, Infinity], 'diverging') === null, 'undefined fields stay undefined');
    const symmetric = scalarRange([-2, 0, 4, NaN], 'diverging');
    assert(symmetric[0] === -4 && symmetric[1] === 4, 'signed auto range');
    const constant = scalarRange([3, 3, 3], 'sequential');
    assert(constant[0] < 3 && constant[1] > 3, 'constant field has a finite scale');
  },
};
