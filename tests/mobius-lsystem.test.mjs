import { assert, near } from './assert.mjs';
import { Surface, mobiusBandMesh, meshStats, gaussianCurvature, orientTriangles } from '../manifold-core/index.js';
import { LSYSTEMS, lsystemContours, expandLSystem, polylineLength, makeFrame, imprint } from '../manifold-ink/index.js';
import { sub3, len3 } from '../manifold-core/src/vec.js';

const rect = (a, b) => [
  {
    points: [
      [-a, -b],
      [a, -b],
      [a, b],
      [-a, b],
    ],
    closed: true,
  },
];

export const tests = {
  'Möbius band: one boundary loop, χ = 0, non-orientable, K < 0 (parametrised band is NOT developable)'() {
    const R = 1.1;
    const m = mobiusBandMesh(R, 0.5, 96, 6, 1);
    const st = meshStats(m);
    assert(st.euler === 0 && !st.closed, JSON.stringify(st));
    assert(!orientTriangles(structuredClone(m)).orientable, 'one half-twist is non-orientable');
    assert(orientTriangles(mobiusBandMesh(R, 0.5, 96, 6, 2)).orientable, 'two half-twists -> orientable annulus');
    const s = Surface.fromMesh(m);
    assert(s.boundaryEdges === 2 * 96, `boundary edges ${s.boundaryEdges} (ONE loop, twice the length)`);
    // x = ((R + v cos(u/2)) cos u, …, v sin(u/2)) is a twisted ruled surface, not a developable one:
    // K ≈ −1/(4R²) on the centreline, more negative towards the rim. (A truly flat Möbius band is a
    // different, non-analytic embedding — Sadowsky 1930, Starostin & van der Heijden 2007.)
    const K = gaussianCurvature(s);
    let maxK = -Infinity;
    let minK = Infinity;
    K.forEach((k, i) => {
      if (s.vertices[i].boundary) return;
      maxK = Math.max(maxK, k);
      minK = Math.min(minK, k);
    });
    assert(
      maxK < 0 && minK > -1 / (R * R),
      `K in [${minK.toFixed(3)}, ${maxK.toFixed(3)}] vs −1/(4R²) = ${(-1 / (4 * R * R)).toFixed(3)}`,
    );
    // a small turtle rectangle drawn MID-band (away from the rim) nearly closes: gap ~ enclosed curvature × size
    const mid = s.faces.find((f) => f.vidx.every((v) => !s.vertices[v].boundary));
    const start = s.centroid(mid.id);
    const r = imprint(s, rect(0.15, 0.025), makeFrame(start, [1, 0], 1), 'turtle');
    assert(r.contours[0].returnsToStart && r.contours[0].gap < 1e-2, `gap ${r.contours[0].gap}`);
    // handedness: a square straddling the seam (where a transition map is a reflection) must still close
    // (before carrying `hand` the turtle turned R,U,R,D there and ended two sides away)
    for (const dir of [
      [1, 0],
      [0, 1],
    ]) {
      const q = imprint(s, rect(0.1, 0.1), makeFrame(start, dir, 1), 'turtle');
      assert(q.contours[0].gap < 5e-3, `seam square gap ${q.contours[0].gap} (dir ${dir})`);
    }
  },

  'L-systems: expansion lengths and turtle geometry of the presets'() {
    assert(expandLSystem('F', { F: 'F+F-F-F+F' }, 2).length === 5 * 5 + 4 * 5 + 4, 'Koch expansion');
    const koch = lsystemContours({ ...LSYSTEMS.koch, iterations: 2 });
    assert(koch.length === 1 && koch[0].points.length === 26, `Koch: ${koch[0].points.length} points`);
    near(polylineLength(koch[0].points), 25, 1e-9, 'Koch length = 5^n steps');
    const end = koch[0].points[25];
    near(end[0], 9, 1e-9, 'Koch spans 3^n along x');
    near(end[1], 0, 1e-9, 'and returns to the axis');
    const plant = lsystemContours({ ...LSYSTEMS.plant, iterations: 3 });
    assert(plant.length > 10, `branches become contours: ${plant.length}`);
    const snow = lsystemContours({ ...LSYSTEMS.snowflake, iterations: 2 });
    const p = snow[0].points;
    near(
      Math.hypot(p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]),
      0,
      1e-9,
      'snowflake closes in the plane',
    );
    for (const k of Object.keys(LSYSTEMS)) assert(lsystemContours(LSYSTEMS[k]).length >= 1, `${k} draws`);
  },
};
