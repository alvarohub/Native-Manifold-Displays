// Point particles confined to a Surface. State per particle: { faceId, x, y, vx, vy, m } in chart
// coordinates; free motion is the straightest geodesic (surface.trace). Forces are chart-frame vectors
// accumulated into (fx, fy) by force objects each step; pair forces measure distance along the surface
// through geodesic disks (surface.develop / logMap), never through ambient space.
// Integrator: semi-implicit Euler with substeps; drag and a temperature (random kicks) for annealing.

export class ParticleSystem {
  constructor(surface, { drag = 0.1, maxSpeed = Infinity, temperature = 0, trail = 0, seed = 1 } = {}) {
    this.surface = surface;
    this.particles = [];
    this.forces = [];
    this.drag = drag; // fraction of velocity removed per unit time
    this.maxSpeed = maxSpeed;
    this.temperature = temperature; // random force magnitude per unit sqrt(time)
    this.trailLength = trail; // 3D points kept per particle (0 = off)
    this.time = 0;
    this._rng = mulberry32(seed);
    this._nextId = 0;
  }

  random() {
    return this._rng();
  }

  add(point, velocity = [0, 0], props = {}) {
    const p = {
      id: this._nextId++,
      faceId: point.faceId,
      x: point.x,
      y: point.y,
      vx: velocity[0],
      vy: velocity[1],
      m: 1,
      fx: 0,
      fy: 0,
      trail: [],
      ...props,
    };
    this.particles.push(p);
    return p;
  }

  // n particles uniformly by area (face picked ∝ area, uniform barycentric point)
  addRandom(n, props = {}) {
    const faces = this.surface.faces;
    const cum = [];
    let total = 0;
    for (const f of faces) {
      total += f.area ?? 1;
      cum.push(total);
    }
    const out = [];
    for (let k = 0; k < n; k++) {
      const r = this.random() * total;
      let lo = 0;
      let hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      let a = this.random();
      let b = this.random();
      if (a + b > 1) {
        a = 1 - a;
        b = 1 - b;
      }
      const pt = this.surface.fromBarycentric(faces[lo].id, [1 - a - b, a, b]);
      out.push(this.add(pt, [0, 0], props));
    }
    return out;
  }

  clear() {
    this.particles.length = 0;
  }

  addForce(force) {
    this.forces.push(force);
    return force;
  }

  removeForce(force) {
    this.forces = this.forces.filter((f) => f !== force);
  }

  // faceId -> particles currently on it (rebuilt each step; pair forces use it)
  bucketByFace() {
    const map = new Map();
    for (const p of this.particles) {
      let arr = map.get(p.faceId);
      if (!arr) map.set(p.faceId, (arr = []));
      arr.push(p);
    }
    this.buckets = map;
    return map;
  }

  step(dt, substeps = 1) {
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) this._substep(h);
  }

  _substep(h) {
    const ps = this.particles;
    for (const p of ps) {
      p.fx = 0;
      p.fy = 0;
    }
    this.bucketByFace();
    for (const force of this.forces) force.apply(this, h);
    const kick = this.temperature * Math.sqrt(h);
    const keep = Math.exp(-this.drag * h);
    for (const p of ps) {
      if (p.fixed) continue;
      p.vx = (p.vx + (p.fx / p.m) * h) * keep;
      p.vy = (p.vy + (p.fy / p.m) * h) * keep;
      if (kick > 0) {
        p.vx += kick * gauss(this._rng);
        p.vy += kick * gauss(this._rng);
      }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > this.maxSpeed) {
        p.vx *= this.maxSpeed / sp;
        p.vy *= this.maxSpeed / sp;
      }
      if (sp < 1e-14) continue;
      const r = this.surface.trace(p, [p.vx / sp, p.vy / sp], sp * h);
      p.faceId = r.end.faceId;
      p.x = r.end.x;
      p.y = r.end.y;
      p.vx = r.dir[0] * sp;
      p.vy = r.dir[1] * sp;
      p.lastEvents = r.events.length ? r.events : null;
      if (this.trailLength > 0) {
        p.trail.push(this.surface.to3D(p));
        if (p.trail.length > this.trailLength) p.trail.shift();
      }
    }
    this.time += h;
  }

  // k-nearest-neighbour graph by SURFACE distance within maxDist. Returns [{ a, b, d, dir }] with one record
  // per unordered pair, oriented from the lower id (dir = unit vector a->b in a's chart frame).
  neighbourGraph(k, maxDist) {
    const ps = this.particles;
    const cand = new Map(ps.map((p) => [p.id, []]));
    this.bucketByFace();
    this.forEachNeighbour(maxDist, (p, q, v, d) => {
      cand.get(p.id).push({ q, d, v });
    });
    const pairs = new Map();
    for (const p of ps) {
      const list = cand
        .get(p.id)
        .sort((x, y) => x.d - y.d)
        .slice(0, k);
      for (const { q, d, v } of list) {
        const key = p.id < q.id ? `${p.id}:${q.id}` : `${q.id}:${p.id}`;
        const prev = pairs.get(key);
        if (!prev || (prev.a.id > prev.b.id && p.id < q.id))
          pairs.set(key, { a: p, b: q, d, dir: [v[0] / d, v[1] / d] });
      }
    }
    return [...pairs.values()];
  }

  kineticEnergy() {
    let e = 0;
    for (const p of this.particles) e += 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy);
    return e;
  }

  // For every particle, neighbours within geodesic radius R with the separation vector in the
  // particle's chart frame: callback(p, q, vec, dist). Uses the geodesic disk around p's face.
  forEachNeighbour(R, callback) {
    const buckets = this.buckets ?? this.bucketByFace();
    const S = this.surface;
    S.maxFaceSize ??= Math.max(...S.faces.map((f) => f.size));
    const diskR = R + S.maxFaceSize; // one radius for all faces keeps the disk cache keys stable
    for (const p of this.particles) {
      const disk = S.develop(p.faceId, diskR);
      const pp = disk.toPlane(p);
      for (const fid of disk.order) {
        const arr = buckets.get(fid);
        if (!arr) continue;
        for (const q of arr) {
          if (q === p) continue;
          const qq = disk.toPlane(q);
          const vx = qq[0] - pp[0];
          const vy = qq[1] - pp[1];
          const d = Math.hypot(vx, vy);
          if (d <= R) callback(p, q, [vx, vy], d, disk);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- forces

// Repulsion (strength > 0) or attraction (< 0) along the surface with cutoff radius R.
// law: 'inverseSquare' (∝ 1/d²), 'linear' (∝ 1 − d/R), 'inverse' (∝ 1/d). Softened below `soft`.
export function pairForce({ radius = 1, strength = 1, law = 'inverseSquare', soft = 1e-3 } = {}) {
  const mag = {
    inverseSquare: (d) => 1 / (d * d),
    inverse: (d) => 1 / d,
    linear: (d) => Math.max(0, 1 - d / radius),
  }[law];
  return {
    kind: 'pair',
    radius,
    strength,
    law,
    apply(sys) {
      sys.forEachNeighbour(radius, (p, q, v, d) => {
        const dd = Math.max(d, soft);
        const f = (strength * mag(dd)) / dd; // along -v for repulsion
        p.fx -= f * v[0];
        p.fy -= f * v[1];
      });
    },
  };
}

// Hookean springs between particle pairs: links = [{ a, b, rest, k }] (particle references).
// Separation measured via logMap(a, b); the force on b is the transported opposite.
export function springForce(links, { k = 1, searchRadius = null } = {}) {
  return {
    kind: 'spring',
    links,
    apply(sys) {
      const S = sys.surface;
      for (const L of links) {
        const { a, b } = L;
        const l = S.logMap(a, b, searchRadius ? { maxR: searchRadius } : {});
        if (!l) continue;
        const stretch = l.distance - L.rest;
        const kk = L.k ?? k;
        const f = kk * stretch; // positive = pull a toward b
        a.fx += f * l.dir[0];
        a.fy += f * l.dir[1];
        const db = l.disk.toChartDir(b.faceId, l.dir);
        if (db) {
          b.fx -= f * db[0];
          b.fy -= f * db[1];
        }
      }
    },
  };
}

// Constant 3D vector field (e.g. gravity) projected onto each particle's chart.
export function uniformField(g3) {
  return {
    kind: 'uniform',
    g3,
    apply(sys) {
      for (const p of sys.particles) {
        const f = sys.surface.faceById(p.faceId);
        p.fx += p.m * (g3[0] * f.u[0] + g3[1] * f.u[1] + g3[2] * f.u[2]);
        p.fy += p.m * (g3[0] * f.v[0] + g3[1] * f.v[1] + g3[2] * f.v[2]);
      }
    },
  };
}

// Arbitrary per-particle force from a callback returning a chart vector (may read any surface field).
export function customForce(fn) {
  return {
    kind: 'custom',
    apply(sys, h) {
      for (const p of sys.particles) {
        const f = fn(p, sys.surface, h);
        if (!f) continue;
        p.fx += f[0];
        p.fy += f[1];
      }
    },
  };
}

// ---------------------------------------------------------------- helpers

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
