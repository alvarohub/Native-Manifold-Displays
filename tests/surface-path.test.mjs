import { readFileSync } from 'node:fs';
import { assert, near, nearVec } from './assert.mjs';
import { Surface, importMesh, planeMesh, cubeMesh, geodesicBetween, edgePath, surfaceConnection } from '../manifold-core/index.js';
import { ParticleSystem } from '../manifold-physics/index.js';

function verifyPath(s, a, b, path) {
  assert(path, 'path exists');
  nearVec(s.to3D(path.polyline[0]), s.to3D(a), 1e-9, 'starts at a');
  nearVec(s.to3D(path.polyline.at(-1)), s.to3D(b), 1e-9, 'ends at b');
  let length = 0;
  for (let i = 1; i < path.polyline.length; i++) {
    const p = path.polyline[i - 1], q = path.polyline[i];
    const P = s.to3D(p), Q = s.to3D(q);
    const d = Math.hypot(...P.map((v, k) => v - Q[k]));
    length += d;
    if (d < 1e-9) continue;
    assert(p.faceId === q.faceId, 'each nonzero segment belongs to one triangle');
    const mid = { faceId: p.faceId, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    assert(s.contains(mid.faceId, mid.x, mid.y, 1e-7), 'segment midpoint on surface');
  }
  near(length, path.length, 1e-7, 'reported length matches displayed path');
}

export const tests = {
  'surface paths: particle trails retain crossed edges rather than cutting through the cube'() {
    const s = Surface.fromMesh(cubeMesh(2, 1));
    const sys = new ParticleSystem(s, { drag: 0, trail: 100 });
    const p = sys.add(s.centroid(0), [1, 0.3]);
    sys.step(5);
    assert(p.trail.length > 3, 'large timestep retains intermediate crossings');
    for (let i = 1; i < p.trail.length; i++) {
      const a = p.trail[i - 1], b = p.trail[i];
      const midpoint = a.map((v, k) => (v + b[k]) / 2);
      assert(midpoint.some((v) => Math.abs(Math.abs(v) - 1) < 1e-7), 'trail segment remains on a cube face');
    }
    nearVec(p.trail.at(-1), s.to3D(p), 1e-9, 'trail ends at current particle');
    sys.trailLength = 3;
    sys.step(5);
    assert(p.trail.length === 3, 'trail point limit respected');
  },

  'surface paths: bunny failed shooting is flagged and fallback reaches actual endpoints on the mesh'() {
    const mesh = importMesh('bunny.obj', readFileSync(new URL('../demos/assets/bunny.obj', import.meta.url), 'utf8')).mesh;
    const s = Surface.fromMesh(mesh);
    for (const [x, y] of [[0, 900], [800, 2200], [1700, 3500], [100, 2000]]) {
      const a = s.centroid(x), b = s.centroid(y);
      const shot = geodesicBetween(s, a, b, { iterations: 3 });
      assert(!shot.converged, 'known bunny pair does not converge in three corrections');
      const endpointError = Math.hypot(...s.to3D(shot.end).map((v, k) => v - s.to3D(b)[k]));
      near(shot.endpointError, endpointError, 1e-12, 'error is for the returned endpoint');
      if (Number.isFinite(shot.miss)) {
        near(shot.miss, s.logMap(shot.end, b, { R: s.maxFaceSize * 3 }).distance, 1e-12, 'miss is not stale');
      }
      const path = surfaceConnection(s, a, b, { iterations: 3 });
      assert(path.method === 'edge-path', 'approximation explicitly identified');
      verifyPath(s, a, b, path);
      const reverse = edgePath(s, b, a);
      near(reverse.length, path.length, 1e-9, 'edge-route length is symmetric');
    }
  },

  'surface paths: successful shooting reports convergence and no-iteration misses are measured'() {
    const s = Surface.fromMesh(planeMesh(3, 3, 5, 5));
    const a = s.centroid(0), b = s.centroid(43);
    const shot = geodesicBetween(s, a, b, { iterations: 0 });
    assert(shot.converged && shot.miss < 1e-9, 'initial planar guess converges without correction');
    const path = surfaceConnection(s, a, b);
    assert(path.method === 'shooting', 'keep the direct geodesic when successful');
    verifyPath(s, a, b, path);
    const cube = Surface.fromMesh(cubeMesh(2, 2));
    verifyPath(cube, cube.centroid(0), cube.centroid(0), edgePath(cube, cube.centroid(0), cube.centroid(0)));
  },

  'surface paths: disconnected surfaces return unreachable instead of growing disks indefinitely'() {
    const mesh = {
      positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [3, 0, 0], [4, 0, 0], [3, 1, 0]],
      triangles: [[0, 1, 2], [3, 4, 5]],
    };
    const s = Surface.fromMesh(mesh);
    const a = s.centroid(0), b = s.centroid(1);
    assert(s.logMap(a, b) === null, 'log map detects unreachable face');
    assert(edgePath(s, a, b) === null, 'no edge route');
    assert(surfaceConnection(s, a, b) === null, 'no fabricated success');
  },
};
