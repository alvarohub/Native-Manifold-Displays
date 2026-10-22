import { makeFrame, frameFromPoint } from '../manifold-ink/index.js';
import { apply2, det2, dot3 } from '../manifold-core/src/vec.js';

export function validatedFrame(surface, frame) {
  const anchor = frame?.anchor, heading = frame?.heading;
  if (!anchor || !surface.faceById(anchor.faceId) ||
    !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) ||
    !surface.contains(anchor.faceId, anchor.x, anchor.y)) {
    throw new Error('A placement anchor inside a surface face is required');
  }
  if (!Array.isArray(heading) || heading.length !== 2 || !heading.every(Number.isFinite) ||
    !Number.isFinite(Math.hypot(...heading)) || Math.hypot(...heading) === 0 ||
    !Number.isFinite(frame.scale) || frame.scale <= 0 ||
    ![1, -1].includes(frame.hand ?? 1)) throw new Error('Placement requires a nonzero heading, positive scale and hand ±1');
  return makeFrame(anchor, heading, frame.scale, frame.hand ?? 1);
}

export class SurfacePlacement {
  constructor(surface, frame) {
    this.surface = surface;
    this._frame = validatedFrame(surface, frame);
  }

  static fromRay(surface, { origin, direction, heading = [1, 0, 0], scale = 1 }) {
    for (const vector of [origin, direction, heading]) {
      if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite) ||
        !Number.isFinite(Math.hypot(...vector))) throw new Error('Placement ray and heading require finite 3-vectors');
    }
    if (!Math.hypot(...direction) || !Math.hypot(...heading)) throw new Error('Placement directions must be nonzero');
    const hit = surface.raycast(origin, direction);
    if (!hit) throw new Error('Placement ray missed the surface');
    const face = surface.faceById(hit.faceId);
    if (Math.hypot(dot3(heading, face.u), dot3(heading, face.v)) <= 1e-12 * Math.hypot(...heading)) {
      throw new Error('Placement heading has no tangent component at the ray hit');
    }
    return new SurfacePlacement(surface, frameFromPoint(surface, hit, heading, scale));
  }

  get frame() { return structuredClone(this._frame); }

  advance(distance) {
    if (!Number.isFinite(distance)) throw new Error('Motion distance must be finite');
    const frame = this._frame;
    const sign = distance < 0 ? -1 : 1;
    const result = this.surface.trace(frame.anchor, frame.heading.map(v => sign * v), Math.abs(distance));
    if (result.events.length) throw new Error(`Placement motion encountered ${result.events[0].type}; state was not advanced`);
    this._frame = validatedFrame(this.surface, {
      ...frame, anchor: result.end, heading: apply2(result.M, frame.heading),
      hand: frame.hand * (det2(result.M) < 0 ? -1 : 1),
    });
    return this;
  }
}
