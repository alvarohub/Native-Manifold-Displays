import { assert, near, nearVec } from './assert.mjs';
import { Surface, cubeMesh, planeMesh, mobiusBandMesh } from '../manifold-core/index.js';
import { frameFromPoint, rectContour, imprintTurtle, traceTurtle } from '../manifold-ink/index.js';
import { ManifoldCanvas } from '../manifold-canvas/index.js';
import { manifoldAddon } from '../p5-manifold/index.js';

const setup = () => {
  const surface = Surface.fromMesh(cubeMesh(2, 1));
  const hit = surface.raycast([3, 0.13, 0.07], [-1, 0, 0]);
  return { surface, frame: frameFromPoint(surface, hit, [0, 0, 1]) };
};
const expectError = (fn, text) => {
  let message = '';
  try { fn(); } catch (error) { message = error.message; }
  assert(message.includes(text), `expected "${text}", received "${message}"`);
};

export const tests = {
  'manifold canvas: long sparse strokes retain every seam, stay on faces and preserve length'() {
    const { surface, frame } = setup();
    const canvas = new ManifoldCanvas(surface, { frame });
    const line = canvas.path({ points: [[0, 0], [6.4, 0]], closed: false });
    assert(line.crossings.length >= 3 && line.segments.length > 3, 'sparse input crosses several faces');
    let length = 0;
    for (const { faceId, a, b } of line.segments) {
      for (const point of [a, b, a.map((v, i) => (v + b[i]) / 2)]) {
        const [x, y] = surface.toChart(faceId, point);
        assert(surface.contains(faceId, x, y), 'entire segment inside its triangle');
        nearVec(surface.to3D({ faceId, x, y }), point, 1e-9, 'point lies in face plane');
      }
      length += Math.hypot(...a.map((v, i) => v - b[i]));
    }
    near(length, 6.4, 1e-9, 'renderable pieces preserve arc length');
    near(line.length, length, 1e-9, 'reported length is not an endpoint chord');
    for (let i = 1; i < line.segments.length; i++) nearVec(line.segments[i - 1].b, line.segments[i].a, 1e-9, 'seam endpoints coincide');
    const contour = rectContour(2.8, 0.65);
    const rectangle = canvas.path(contour);
    nearVec(surface.to3D(rectangle.start), surface.to3D(rectangle.end), 1e-9, 'developable rectangle closes');
    near(rectangle.length, 2 * (2.8 + 0.65), 1e-9, 'rectangle perimeter');
    const detailed = traceTurtle(surface, contour, frame);
    assert(JSON.stringify(detailed.points) === JSON.stringify(imprintTurtle(surface, contour, frame)), 'existing imprint API unchanged');
  },

  'manifold canvas: placement, styles and retained paths are independent and transactional'() {
    const { surface, frame } = setup();
    const a = new ManifoldCanvas(surface, { frame }), b = new ManifoldCanvas(surface, { frame });
    const contour = { points: [[0, 0], [0.3, 0]], closed: false };
    const record = a.path(contour, { stroke: '#ff0000' });
    b.path(contour);
    frame.heading[0] = 42;
    contour.points[1][0] = 100;
    record.segments[0].a[0] = 99;
    a.paths[0].stroke = '#000000';
    assert(a.paths[0].stroke === '#ff0000' && a.paths[0].segments[0].a[0] !== 99, 'snapshots and inputs are isolated');
    const oldB = JSON.stringify(b.paths);
    a.path({ points: [[0, 0], [0.6, 0]], closed: false }, { replace: true });
    assert(a.paths.length === 1 && JSON.stringify(b.paths) === oldB, 'replace affects only this canvas');
    expectError(() => a.path({ points: [[NaN, 0], [1, 0]], closed: false }, { replace: true }), 'finite 2D');
    assert(a.paths.length === 1, 'failed replacement preserves valid drawing');
    a.clear();
    assert(a.paths.length === 0 && b.paths.length === 1, 'clear affects only its owner');
    a.dispose();
    expectError(() => a.path({ points: [[0, 0], [1, 0]], closed: false }), 'disposed');
    expectError(() => a.setFrame(b.frame), 'disposed');
    assert(b.paths.length === 1, 'other canvas still active');
  },

  'manifold canvas: invalid frames and unsupported boundary or cone events fail explicitly'() {
    const { surface, frame } = setup();
    expectError(() => new ManifoldCanvas(surface), 'placement anchor');
    expectError(() => new ManifoldCanvas(surface, { frame: { ...frame, heading: [0, 0] } }), 'heading');
    expectError(() => new ManifoldCanvas(surface, { frame: { ...frame, heading: [Number.MAX_VALUE, Number.MAX_VALUE] } }), 'heading');
    expectError(() => new ManifoldCanvas(surface, { frame: { ...frame, scale: 0 } }), 'positive scale');
    expectError(() => new ManifoldCanvas(surface, { frame: { ...frame, anchor: { faceId: 999, x: 0, y: 0 } } }), 'placement anchor');
    const plane = Surface.fromMesh(planeMesh(2, 2, 1, 1));
    const planar = new ManifoldCanvas(plane, { frame: frameFromPoint(plane, plane.centroid(0), [1, 0, 0]) });
    expectError(() => planar.path({ points: [[0, 0], [10, 0]], closed: false }), 'boundary');
    expectError(() => planar.path({ points: [[10, 0], [10.1, 0]], closed: false }), 'boundary');
    assert(planar.paths.length === 0, 'failed boundary path was not retained');
    const f = surface.faceById(frame.anchor.faceId);
    const corner = f.verts2[0];
    const dx = corner[0] - frame.anchor.x, dy = corner[1] - frame.anchor.y;
    const cone = new ManifoldCanvas(surface, { frame: { ...frame, heading: [dx, dy] } });
    expectError(() => cone.path({ points: [[0, 0], [Math.hypot(dx, dy) + 0.1, 0]], closed: false }), 'vertex');
    const canvas = new ManifoldCanvas(surface, { frame });
    expectError(() => canvas.path({ points: [[0, 0], [1e6, 0]], closed: false }), 'stalled');
    expectError(() => canvas.path({ points: [[0, 0], [1, 0]], closed: false }, { width: NaN }), 'positive width');
    expectError(() => canvas.path({ points: [[0, 0], [1, 0]], closed: false }, { stroke: ['#abcdef'] }), 'hex colour');
    assert(canvas.paths.length === 0, 'no unsupported or invalid stroke is retained');
  },

  'manifold canvas: local orientation works without a global normal on a Möbius band'() {
    const surface = Surface.fromMesh(mobiusBandMesh(1, 0.5, 40, 8));
    const frame = frameFromPoint(surface, surface.centroid(100), [0, 1, 0], 0.01);
    const canvas = new ManifoldCanvas(surface, { frame });
    const path = canvas.path({ points: [[0, 0], [0.2, 0], [0.2, 0.1]], closed: false });
    near(path.length, 0.003, 1e-10, 'frame scale is surface length per drawing unit');
    assert(path.segments.length > 0, 'global orientation is not required');
  },

  'p5 addon: requires supported version and WEBGL, uses per-sketch cleanup'() {
    expectError(() => manifoldAddon({ VERSION: '1.11.0' }, {}, {}), '2.3.4');
    const fn = {}, hooks = {};
    manifoldAddon({ VERSION: '2.3.4' }, fn, hooks);
    const small = fn.svgContours('M 0 0 C 0 1 1 1 1 0 Z', { width: 0.5 });
    const large = fn.svgContours('M 0 0 C 0 100 100 100 100 0 Z', { width: 0.5 });
    assert(small[0].points.length > 20 && small[0].points.length === large[0].points.length, 'SVG sampling is independent of input coordinate scale');
    small[0].points.forEach((p, i) => nearVec(p, large[0].points[i], 1e-9, 'same normalized SVG geometry'));
    const { surface, frame } = setup();
    expectError(() => fn.createManifoldCanvas.call({}, surface, { frame }), 'WEBGL');
    const sketchA = { _renderer: { isP3D: true } }, sketchB = { _renderer: { isP3D: true } };
    const a = fn.createManifoldCanvas.call(sketchA, surface, { frame });
    const otherA = fn.createManifoldCanvas.call(sketchA, surface, { frame });
    const b = fn.createManifoldCanvas.call(sketchB, surface, { frame });
    a.dispose();
    hooks.remove.call(sketchA);
    assert(otherA.disposed && !b.disposed, 'remove disposes only canvases owned by that sketch');
    hooks.remove.call(sketchB);
    assert(b.disposed, 'all owners can be removed independently');
  },
};
