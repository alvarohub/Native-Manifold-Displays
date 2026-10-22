import { assert, near, nearVec } from './assert.mjs';
import { Surface, cubeMesh, planeMesh, torusMesh } from '../manifold-core/index.js';
import { SurfacePlacement, surfacePatch, projectContours } from '../manifold-canvas/index.js';
import { circleContour } from '../manifold-ink/index.js';
import { apply2, det2 } from '../manifold-core/src/vec.js';

function placement(surface, y = 0.13, z = 0.91) {
  return SurfacePlacement.fromRay(surface, { origin: [3, y, z], direction: [-1, 0, 0], heading: [0, 0, 1] });
}
function onSurface(surface, p, faceId) {
  const [x, y] = surface.toChart(faceId, p);
  assert(surface.contains(faceId, x, y, 1e-8), 'point inside source triangle');
  nearVec(surface.to3D({ faceId, x, y }), p, 1e-8, 'point lies in source face plane');
}
function area(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}
function verifyPatch(surface, patch) {
  let uvArea = 0;
  for (const triangle of patch.triangles) {
    uvArea += area(...triangle.vertices.map(v => v.uv));
    for (const v of triangle.vertices) {
      onSurface(surface, v.position, triangle.faceId);
      assert(v.uv.every(x => x >= -1e-9 && x <= 1 + 1e-9), 'UV coordinates clipped to image bounds');
    }
    const center = [0, 1, 2].map(k => triangle.vertices.reduce((sum, v) => sum + v.position[k] / 3, 0));
    onSurface(surface, center, triangle.faceId);
  }
  near(uvArea, 1, 1e-7, 'whole image is covered exactly once');
}
function fails(fn, text) {
  let error = '';
  try { fn(); } catch (e) { error = e.message; }
  assert(error.includes(text), `expected ${text}, got ${error}`);
}

export const tests = {
  'surface patch: image triangles fold across cube seams with exact area and no off-surface chords'() {
    const surface = Surface.fromMesh(cubeMesh(2, 1)), p = placement(surface);
    const patch = surfacePatch(surface, p.frame, { width: 0.65, height: 0.4 });
    verifyPatch(surface, patch);
    assert(new Set(patch.triangles.map(t => surface.normal(t.faceId).join(','))).size === 2, 'crosses a physical cube crease');
    let surfaceArea = 0;
    for (const t of patch.triangles) {
      const [a, b, c] = t.vertices.map(v => surface.toChart(t.faceId, v.position));
      surfaceArea += area(a, b, c);
    }
    near(surfaceArea, 0.65 * 0.4, 1e-9, 'unfold is an isometry');
    const uvByPosition = new Map();
    for (const triangle of patch.triangles) for (const v of triangle.vertices) {
      const key = v.position.map(x => x.toFixed(8)).join(',');
      if (uvByPosition.has(key)) nearVec(v.uv, uvByPosition.get(key), 1e-7, 'same seam position has the same UV');
      uvByPosition.set(key, v.uv);
    }
  },

  'surface patch: parallel-transported motion remains continuous through many cube seams'() {
    const surface = Surface.fromMesh(cubeMesh(2, 1)), p = placement(surface, 0.13, 0.1);
    const first = p.frame;
    const q = surface.trace(first.anchor, first.heading, 8);
    const expected = apply2(q.M, first.heading);
    for (let i = 0; i < 160; i++) {
      p.advance(0.05);
      verifyPatch(surface, surfacePatch(surface, p.frame, { width: 0.4 }));
    }
    nearVec(surface.to3D(p.frame.anchor), surface.to3D(first.anchor), 1e-8, 'one perimeter returns to initial anchor');
    nearVec(p.frame.heading, expected, 1e-8, 'heading matches accumulated transport');
    assert(p.frame.hand === first.hand * Math.sign(det2(q.M)), 'handedness follows transitions');
    p.advance(-0.4).advance(0.4);
    nearVec(surface.to3D(p.frame.anchor), surface.to3D(first.anchor), 1e-8, 'negative distance is reversible');
  },

  'surface patch: local projection works on a torus and vector curves stay on source faces'() {
    const surface = Surface.fromMesh(torusMesh(1.4, 0.5, 40, 24));
    const p = SurfacePlacement.fromRay(surface, { origin: [3, -3, 0.18], direction: [-1, 1, 0], heading: [1, 1, 0] });
    for (let i = 0; i < 160; i++) {
      p.advance(0.08);
      const patch = surfacePatch(surface, p.frame, { mode: 'projection', width: 0.9, height: 0.32, depth: 0.2 });
      verifyPatch(surface, patch);
    }
    const segments = projectContours(surface, p.frame, [circleContour(0.15, 32)], { width: 0.6, height: 0.6, depth: 0.2 });
    assert(segments.length > 32, 'contour is split at mesh triangle boundaries');
    for (const s of segments) for (const point of [s.a, s.b, s.a.map((v, k) => (v + s.b[k]) / 2)]) onSurface(surface, point, s.faceId);
  },

  'surface patch: invalid, ambiguous and unsupported patches fail instead of silently clipping'() {
    const surface = Surface.fromMesh(cubeMesh(2, 1));
    fails(() => surfacePatch(surface, placement(surface).frame, { width: NaN }), 'positive finite');
    fails(() => surfacePatch(surface, placement(surface).frame, { width: 0.4, mode: 'unknown' }), 'unfold or projection');
    fails(() => surfacePatch(surface, placement(surface, 0.93, 0.93).frame, { width: 0.6 }), 'cone vertex');
    fails(() => surfacePatch(surface, placement(surface).frame, { width: 3, mode: 'projection' }), 'single local sheet');
    fails(() => projectContours(surface, placement(surface, 0.13, 0.1).frame, [circleContour(1)], { width: 0.4, depth: 0.2 }), 'exceeds');
    fails(() => SurfacePlacement.fromRay(surface, { origin: [3, 0, 0], direction: [0, 1, 0] }), 'missed');
    fails(() => SurfacePlacement.fromRay(surface, { origin: [3, 0.13, 0.1], direction: [-1, 0, 0], heading: [1, 0, 0] }), 'tangent component');
    const plane = Surface.fromMesh(planeMesh(2, 2, 2, 2));
    const p = SurfacePlacement.fromRay(plane, { origin: [0.13, 0.17, 2], direction: [0, 0, -1] });
    const before = p.frame;
    fails(() => p.advance(10), 'boundary');
    assert(JSON.stringify(p.frame) === JSON.stringify(before), 'failed motion preserves placement');
    fails(() => p.advance(NaN), 'finite');
  },
};
