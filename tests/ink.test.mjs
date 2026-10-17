import { assert, near, nearVec } from './assert.mjs';
import { Surface, planeMesh, cubeMesh, icosphereMesh, cylinderMesh } from '../manifold-core/index.js';
import {
  parseSVGPath,
  contoursFromCommands,
  circleContour,
  rectContour,
  polylineLength,
  turningAngles,
  makeFrame,
  translateFrame,
  rotateFrame,
  frameFromPoint,
  imprint,
  liftContour,
} from '../manifold-ink/index.js';
import { sub3, len3, dot3, norm3 } from '../manifold-core/src/vec.js';

const dist3 = (s, a, b) => len3(sub3(s.to3D(a), s.to3D(b)));
const chain3 = (s, pts, closed = false) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist3(s, pts[i - 1], pts[i]);
  if (closed) L += dist3(s, pts[pts.length - 1], pts[0]);
  return L;
};

export const tests = {
  'SVG path parses, flattens curves, resamples; turning angles of a square sum to 2π'() {
    const cmds = parseSVGPath('M0 0 L2 0 L2 1 L0 1 Z m 3 0 c 1 0 1 1 0 1 q -1 0 -1 -1 z');
    const cs = contoursFromCommands(cmds, { step: 0.1 });
    assert(cs.length === 2 && cs.every((c) => c.closed), 'two closed contours');
    near(polylineLength(cs[0].points, true), 6, 0.05, 'rectangle perimeter');
    const turns = turningAngles(cs[0].points, true);
    near(
      turns.reduce((a, b) => a + b, 0),
      2 * Math.PI,
      1e-9,
      'total turning of a simple closed curve',
    );
    assert(
      cs[1].points.every(([x, y]) => x >= 1.9 && x <= 4.1 && y >= -0.1 && y <= 1.1),
      'curved contour inside its control bbox (x 2..4 after the relative q)',
    );
    const circ = circleContour(1, 128);
    near(polylineLength(circ.points, true), 2 * Math.PI, 0.01, 'circle perimeter');
  },

  'plane: all four modes reproduce the planar drawing (rotated, scaled, placed)'() {
    const s = Surface.fromMesh(planeMesh(4, 4, 8, 8));
    const anchor = s.centroid(37);
    const frame = rotateFrame(makeFrame(anchor, [1, 0], 0.5), 0.7);
    const square = rectContour(1.2, 0.8, 0.3, -0.2);
    const A = s.to3D(anchor);
    const f = s.faceById(anchor.faceId);
    const h = [Math.cos(0.7), Math.sin(0.7)]; // heading in the chart (plane chart axes = u, v)
    const expected = square.points.map(([x, y]) => {
      const cx = 0.5 * (x * h[0] - y * h[1]);
      const cy = 0.5 * (x * h[1] + y * h[0]);
      return [A[0] + f.u[0] * cx + f.v[0] * cy, A[1] + f.u[1] * cx + f.v[1] * cy, A[2]];
    });
    for (const mode of ['turtle', 'exp', 'fermi', 'projection']) {
      const r = imprint(s, [square], frame, mode);
      const pts = r.contours[0].points;
      for (let i = 0; i < 4; i++) nearVec(s.to3D(pts[i]), expected[i], 1e-9, `${mode} point ${i}`);
      near(r.contours[0].gap, 0, 1e-9, `${mode} closes on a plane`);
    }
  },

  'cube: away from corners the turtle unfolds exactly across edges and closes'() {
    const s = Surface.fromMesh(cubeMesh(2, 2));
    // anchor near the middle of the +x face, square big enough to wrap onto the neighbouring faces
    const px = s.raycast([3, 0.1, 0.05], [-1, 0, 0]);
    const frame = frameFromPoint(s, px, [0, 0, 1], 1); // drawing x-axis = world +z
    // long along z (crosses the z = ±1 edges onto the +z and −z faces), narrow along y: no cube corner enclosed,
    // so the developable turtle must close exactly
    const square = rectContour(2.4, 1.0);
    const r = imprint(s, [square], frame, 'turtle');
    near(r.contours[0].gap, 0, 1e-9, 'developable: closed curve closes');
    const faces = new Set(r.contours[0].points.map((p) => s.faceById(p.faceId).n.join(',')));
    assert(faces.size === 2 && !faces.has('1,0,0'), `all four corners should sit on the ±z faces, got ${[...faces]}`);
    // exp and fermi agree with turtle on a developable surface for points away from cone points
    const e = imprint(s, [square], frame, 'exp').contours[0].points;
    const t = r.contours[0].points;
    for (let i = 0; i < 4; i++) near(dist3(s, e[i], t[i]), 0, 1e-9, `exp == turtle at corner ${i}`);
  },

  'unit sphere: turtle circle misses closure by ≈ πρ³, exp circle is a geodesic circle, Fermi rectangle narrows as cos(y)'() {
    const s = Surface.fromMesh(icosphereMesh(4, 1));
    const anchor = s.centroid(0);
    const frame = makeFrame(anchor, [1, 0], 1);
    const rho = 0.35;
    const circ = circleContour(rho, 180);
    const t = imprint(s, [circ], frame, 'turtle').contours[0];
    const expectedGap = Math.PI * rho ** 3; // leading order: ρ · (K · area)
    near(t.gap, expectedGap, 0.25 * expectedGap, `turtle closure gap ${t.gap}`);
    const e = imprint(s, [circ], frame, 'exp').contours[0];
    // every point at geodesic distance ρ from the anchor: chord = 2 sin(ρ/2) on the unit sphere (polyhedral: ~1%)
    for (let i = 0; i < e.points.length; i += 15)
      near(dist3(s, anchor, e.points[i]), 2 * Math.sin(rho / 2), 0.02, 'exp radius');
    near(chain3(s, e.points, true), 2 * Math.PI * Math.sin(rho), 0.03, 'geodesic circle circumference 2π sin ρ');
    const x = 1.0;
    const y = 0.6;
    const n = 40;
    const bottom = { points: Array.from({ length: n + 1 }, (_, i) => [-x / 2 + (x * i) / n, 0]), closed: false };
    const top = { points: Array.from({ length: n + 1 }, (_, i) => [-x / 2 + (x * i) / n, y]), closed: false };
    const fb = imprint(s, [bottom], frame, 'fermi').contours[0].points;
    const ft = imprint(s, [top], frame, 'fermi').contours[0].points;
    near(chain3(s, fb), x, 0.02, 'baseline keeps its length');
    near(chain3(s, ft), x * Math.cos(y), 0.03, 'parallel at height y shrinks by cos y (geodesic deviation)');
  },

  'translateFrame slides along a geodesic and transports the heading'() {
    const s = Surface.fromMesh(icosphereMesh(3, 1));
    const f0 = makeFrame(s.centroid(0), [1, 0], 1);
    const f1 = translateFrame(s, f0, 0.8, 0);
    near(s.distance(f0.anchor, f1.anchor), 0.8, 0.01, 'moved by 0.8 along the surface');
    // heading at the new anchor is the transported travel direction
    const r = s.trace(f0.anchor, f0.heading, 0.8);
    nearVec(f1.heading, r.dir, 1e-9, 'heading transported');
    const back = translateFrame(s, f1, -0.8, 0);
    near(dist3(s, back.anchor, f0.anchor), 0, 1e-6, 'round trip');
  },

  'liftContour on a cylinder: κg ≈ 0 on a geodesic, κn = 1/r around and 0 along'() {
    const r = 0.8;
    const s = Surface.fromMesh(cylinderMesh(r, 3, 64, 8));
    // anchor between two vertex columns (angle 0 is a column: a line along it would ride a mesh edge)
    const hit = s.raycast([3, 0.039, 0.11], [-1, 0, 0]);
    const f = s.faceById(hit.faceId);
    const around = [dot3([0, 1, 0], f.u), dot3([0, 1, 0], f.v)];
    const frame = makeFrame(hit, around, 1);
    const line = { points: Array.from({ length: 21 }, (_, i) => [i * 0.05, 0]), closed: false };
    const lifted = liftContour(s, imprint(s, [line], frame, 'turtle').contours[0].points);
    for (const d of lifted.slice(2, -2)) {
      near(d.kappaG, 0, 1e-6, 'geodesic has no geodesic curvature');
      near(d.kappaN, 1 / r, 0.02 / r, 'normal curvature around the cylinder');
      near(Math.abs(dot3(d.normal, norm3([d.position[0], d.position[1], 0]))), 1, 1e-3, 'normal is radial');
    }
    const axial = { points: Array.from({ length: 21 }, (_, i) => [0, i * 0.05]), closed: false };
    const la = liftContour(s, imprint(s, [axial], frame, 'turtle').contours[0].points);
    for (const d of la.slice(2, -2)) near(d.kappaN, 0, 0.02 / r, 'flat along the axis');
  },
};
