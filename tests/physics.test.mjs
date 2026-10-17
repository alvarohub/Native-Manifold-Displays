import { assert, near, nearVec } from './assert.mjs';
import { Surface, cubeMesh, icosphereMesh } from '../manifold-core/index.js';
import { ParticleSystem, pairForce, springForce, uniformField } from '../manifold-physics/index.js';
import { sub3, len3, norm3, dot3 } from '../manifold-core/src/vec.js';

function anneal(sys, { steps, dt, T0, substeps = 1 }) {
  for (let i = 0; i < steps; i++) {
    sys.temperature = T0 * (1 - i / steps) ** 2;
    sys.step(dt, substeps);
  }
  sys.temperature = 0;
  for (let i = 0; i < steps / 2; i++) sys.step(dt, substeps);
}

function minPairDistance3(sys) {
  const P = sys.particles.map((p) => sys.surface.to3D(p));
  let m = Infinity;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) m = Math.min(m, len3(sub3(P[i], P[j])));
  return m;
}

export const tests = {
  'free particle follows trace exactly; drag decays speed exponentially'() {
    const s = Surface.fromMesh(icosphereMesh(2));
    const sys = new ParticleSystem(s, { drag: 0 });
    const start = s.centroid(4);
    const p = sys.add(start, [0.3, 0.4]);
    const ref = s.trace(start, [0.6, 0.8], 0.5 * 2.0);
    sys.step(2.0, 4);
    nearVec(s.to3D(p), s.to3D(ref.end), 1e-9, 'same endpoint as trace');
    near(Math.hypot(p.vx, p.vy), 0.5, 1e-12, 'speed conserved without drag');
    const d = new ParticleSystem(s, { drag: 1 });
    const q = d.add(start, [1, 0]);
    d.step(1, 10);
    near(Math.hypot(q.vx, q.vy), Math.exp(-1), 1e-9, 'exp(-drag·t)');
  },

  'two repelling particles on a sphere end up antipodal'() {
    const s = Surface.fromMesh(icosphereMesh(3));
    const sys = new ParticleSystem(s, { drag: 2, seed: 3 });
    sys.addForce(pairForce({ radius: 4, strength: 0.5, law: 'inverse' }));
    const a = sys.add(s.centroid(0));
    const b = sys.add(s.centroid(1));
    for (let i = 0; i < 800; i++) sys.step(0.05, 2);
    const pa = norm3(s.to3D(a));
    const pb = norm3(s.to3D(b));
    // the antipode is a's cut locus: the unfolding there is ambiguous, so expect ~antipodal, not exact
    near(dot3(pa, pb), -1, 0.03, 'antipodal');
  },

  'spring: two particles settle at the rest length (surface distance)'() {
    const s = Surface.fromMesh(icosphereMesh(3));
    const sys = new ParticleSystem(s, { drag: 3 });
    const a = sys.add(s.centroid(0));
    const b = sys.add(s.centroid(0), [0.3, 0]);
    sys.addForce(springForce([{ a, b, rest: 0.4, k: 4 }]));
    for (let i = 0; i < 400; i++) sys.step(0.02);
    near(s.distance(a, b), 0.4, 1e-3, 'rest length reached');
  },

  'uniform field: on a cube, particles on side faces slide to the bottom; top/bottom faces are level'() {
    const s = Surface.fromMesh(cubeMesh(2, 1));
    const sys = new ParticleSystem(s, { drag: 1.5, seed: 5 });
    sys.addForce(uniformField([0, 0, -3]));
    sys.addRandom(24);
    const startedOnSide = sys.particles.map((p) => Math.abs(s.to3D(p)[2]) < 1 - 1e-9);
    for (let i = 0; i < 300; i++) sys.step(0.03, 2);
    sys.particles.forEach((p, i) => {
      const z = s.to3D(p)[2];
      if (startedOnSide[i]) near(z, -1, 1e-6, 'side-face particle reached the bottom');
      else near(Math.abs(z), 1, 1e-9, 'level faces feel no tangential gravity');
    });
    assert(startedOnSide.filter(Boolean).length > 5, 'enough particles started on side faces');
  },

  'repulsion packing: 12 on an icosphere spread evenly, 8 on a cube stay in the corner basin'() {
    // 12 points on a sphere: nearest-neighbour distances become uniform (icosahedral arrangement)
    const sph = Surface.fromMesh(icosphereMesh(3));
    const sys = new ParticleSystem(sph, { drag: 1.5, seed: 11, maxSpeed: 2 });
    sys.addForce(pairForce({ radius: 4, strength: 0.3, law: 'inverseSquare' }));
    sys.addRandom(12);
    anneal(sys, { steps: 400, dt: 0.04, T0: 0.3 });
    const P = sys.particles.map((p) => sph.to3D(p));
    const nn = P.map((p, i) => Math.min(...P.filter((_, j) => j !== i).map((q) => len3(sub3(p, q)))));
    const mean = nn.reduce((a, b) => a + b, 0) / nn.length;
    const std = Math.sqrt(nn.reduce((a, b) => a + (b - mean) ** 2, 0) / nn.length);
    assert(
      std / mean < 0.08,
      `nearest-neighbour spread ${(std / mean).toFixed(3)} (mean ${mean.toFixed(3)}, icosahedron edge ≈ 1.05)`,
    );
    near(mean, 1.0515, 0.06, 'icosahedral edge length on the unit sphere');

    // 8 points on a cube started near the corners settle onto them (basin test, not global search —
    // competing minima exist, see IDEAS.md)
    const cube = Surface.fromMesh(cubeMesh(2, 2));
    const cs = new ParticleSystem(cube, { drag: 2, seed: 7, maxSpeed: 2 });
    cs.addForce(pairForce({ radius: 6, strength: 0.4, law: 'inverseSquare' }));
    const corners = cube.vertexCones().filter((c) => c.deficit > 1e-9);
    assert(corners.length === 8, 'eight cone points');
    for (const c of corners) {
      const vtx = cube.vertices[c.vertex];
      const { faceId } = vtx.corners[0];
      const centroid = cube.centroid(faceId);
      // start a third of the way from the corner toward the face centroid
      const f = cube.faceById(faceId);
      const vc = f.verts2[vtx.corners[0].corner];
      cs.add({ faceId, x: vc[0] + (centroid.x - vc[0]) * 0.35, y: vc[1] + (centroid.y - vc[1]) * 0.35 });
    }
    for (let i = 0; i < 500; i++) cs.step(0.03, 2);
    const cornerPos = corners.map((c) => c.position);
    let worst = 0;
    for (const p of cs.particles) {
      const q = cube.to3D(p);
      worst = Math.max(worst, Math.min(...cornerPos.map((v) => len3(sub3(v, q)))));
    }
    assert(worst < 0.05, `particles should sit on the corners, worst distance ${worst.toFixed(3)}`);
    assert(minPairDistance3(cs) > 1.9, 'no two particles share a corner');
  },
};
