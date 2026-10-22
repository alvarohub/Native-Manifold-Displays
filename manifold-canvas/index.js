// Retained surface strokes, independent of p5, three.js and the DOM.
import { traceTurtle } from '../manifold-ink/index.js';
import { validatedFrame } from './placement.js';
export { SurfacePlacement } from './placement.js';
export { surfacePatch, projectContours } from './patch.js';

export class ManifoldCanvas {
  constructor(surface, { frame } = {}) {
    if (!surface?.mesh || !surface.vertices) throw new Error('ManifoldCanvas requires an embedded mesh Surface');
    this.surface = surface;
    this._paths = [];
    this.disposed = false;
    this.setFrame(frame);
  }

  assertActive() {
    if (this.disposed) throw new Error('ManifoldCanvas has been disposed');
  }

  get frame() { this.assertActive(); return structuredClone(this._frame); }
  get paths() { this.assertActive(); return structuredClone(this._paths); }

  setFrame(frame) {
    this.assertActive();
    this._frame = validatedFrame(this.surface, frame);
    return this;
  }

  // Each contour is placed independently, not appended to a persistent moving pen.
  path(contour, { stroke = '#ffd27b', width = 0.025, replace = false } = {}) {
    this.assertActive();
    if (!contour || !Array.isArray(contour.points) || contour.points.length < 2 ||
      !contour.points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ||
      typeof contour.closed !== 'boolean') throw new Error('A contour requires finite 2D points and a boolean closed flag');
    if (typeof stroke !== 'string' || !/^#[\da-f]{6}$/i.test(stroke) || !Number.isFinite(width) || width <= 0) {
      throw new Error('Stroke requires a hex colour and positive width in surface units');
    }
    if (typeof replace !== 'boolean') throw new Error('replace must be boolean');
    const result = traceTurtle(this.surface, contour, this._frame);
    const all = [result.placement, ...result.traces];
    const event = all.flatMap((trace) => trace.events)[0];
    if (event) throw new Error(`Pilot stroke encountered ${event.type}; boundary/vertex continuation and stalled traces are not supported`);
    const segments = [];
    for (const trace of result.traces) {
      for (let i = 1; i < trace.polyline.length; i++) {
        const a = trace.polyline[i - 1], b = trace.polyline[i];
        if (a.faceId !== b.faceId || (a.x === b.x && a.y === b.y)) continue;
        segments.push({ faceId: a.faceId, a: this.surface.to3D(a), b: this.surface.to3D(b) });
      }
    }
    const path = {
      contour: structuredClone(contour), frame: this.frame, stroke, width, segments,
      length: result.traces.reduce((sum, trace) => sum + trace.length, 0),
      crossings: result.traces.flatMap((trace) => trace.crossings),
      start: result.points[0], end: result.points.at(-1),
    };
    if (replace) this._paths = [path];
    else this._paths.push(path);
    return structuredClone(path);
  }

  clear() { this.assertActive(); this._paths = []; return this; }

  dispose() {
    this._paths = [];
    this._frame = null;
    this.surface = null;
    this.disposed = true;
  }
}
