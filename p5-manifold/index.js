import { ManifoldCanvas, SurfacePlacement, surfacePatch, projectContours } from '../manifold-canvas/index.js';
import { Surface, cubeMesh, torusMesh, surfaceEdges } from '../manifold-core/index.js';
import { makeFrame, parseSVGPath, contoursFromCommands, contoursBBox, transformContours } from '../manifold-ink/index.js';

export const P5_VERSION = '2.3.4';

// Explicit registration: p5.registerAddon(manifoldAddon), before creating sketches.
export function manifoldAddon(p5, fn, lifecycles) {
  if (p5.VERSION !== P5_VERSION) throw new Error(`This manifold pilot supports p5 ${P5_VERSION}; received ${p5.VERSION}`);
  const owners = new WeakMap();
  fn.cubeSurface = (size = 2) => Surface.fromMesh(cubeMesh(size, 1));
  fn.torusSurface = (major = 1.4, minor = 0.5) => Surface.fromMesh(torusMesh(major, minor, 64, 32));
  fn.svgContours = (path, { width = 1 } = {}) => {
    if (!Number.isFinite(width) || width <= 0) throw new Error('SVG contour width must be positive');
    const commands = parseSVGPath(path);
    const xs = commands.flatMap(c => ['x', 'x1', 'x2'].filter(k => Number.isFinite(c[k])).map(k => c[k]));
    const span = Math.max(...xs) - Math.min(...xs);
    if (!(span > 0) || !Number.isFinite(span)) throw new Error('SVG path must have finite nonzero width');
    const contours = contoursFromCommands(commands, { step: span / 80, flipY: true, curveSegments: 12 });
    if (!contours.length) throw new Error('SVG path contains no contours');
    const bounds = contoursBBox(contours);
    if (!(bounds.width > 0)) throw new Error('SVG path must have nonzero width');
    return transformContours(contours, { dx: -bounds.cx, dy: -bounds.cy, scale: width / bounds.width });
  };

  class P5ManifoldCanvas extends ManifoldCanvas {
    constructor(sketch, surface, options) {
      super(surface, options);
      this.sketch = sketch;
      this.edges = surfaceEdges(surface).filter((e) => e.angle === null || e.angle > 1e-7);
    }

    createPlacement(options) {
      this.assertActive();
      return SurfacePlacement.fromRay(this.surface, options);
    }

    placementFrame(placement) {
      this.assertActive();
      if (!(placement instanceof SurfacePlacement) || placement.surface !== this.surface) throw new Error('Placement belongs to a different surface');
      return placement.frame;
    }

    imprint(image, { placement, width, height, mode = 'unfold', depth } = {}) {
      const frame = this.placementFrame(placement);
      if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
        throw new Error('Imprint requires a p5 image or graphics buffer with positive dimensions');
      }
      height ??= width * image.height / image.width;
      const patch = surfacePatch(this.surface, frame, { width, height, mode, depth });
      const p = this.sketch, gl = p.drawingContext;
      const writeDepth = gl.getParameter(gl.DEPTH_WRITEMASK);
      p.push();
      try {
        p.noLights();
        p.noStroke();
        p.fill('#ffffff');
        p.noTint();
        p.textureMode(p.NORMAL);
        p.texture(image);
        // Transparent texels must not occlude another patch; the opaque support already supplies depth.
        gl.depthMask(false);
        p.beginShape(p.TRIANGLES);
        for (const triangle of patch.triangles) for (const v of triangle.vertices) p.vertex(...v.position, ...v.uv);
        p.endShape();
      } finally {
        gl.depthMask(writeDepth);
        p.pop();
      }
      return patch;
    }

    contours(contours, { placement, width, height = width, depth, stroke = '#7be0ff', strokeWidth = 0.015 } = {}) {
      if (typeof stroke !== 'string' || !/^#[\da-f]{6}$/i.test(stroke) || !Number.isFinite(strokeWidth) || strokeWidth <= 0) throw new Error('Contour style requires a hex stroke and positive surface-unit width');
      const segments = projectContours(this.surface, this.placementFrame(placement), contours, { width, height, depth });
      const p = this.sketch;
      p.push();
      try {
        p.noFill();
        p.stroke(stroke);
        p.strokeWeight(strokeWidth);
        p.beginShape(p.LINES);
        for (const segment of segments) { p.vertex(...segment.a); p.vertex(...segment.b); }
        p.endShape();
      } finally { p.pop(); }
      return segments;
    }

    draw({ faces = true, edges = true } = {}) {
      this.assertActive();
      const p = this.sketch, gl = p.drawingContext;
      p.push();
      try {
        if (faces) {
          // Bias only the support's depth, not the intrinsic stroke or its seam endpoints.
          const offset = gl.isEnabled(gl.POLYGON_OFFSET_FILL);
          const factor = gl.getParameter(gl.POLYGON_OFFSET_FACTOR), units = gl.getParameter(gl.POLYGON_OFFSET_UNITS);
          gl.enable(gl.POLYGON_OFFSET_FILL);
          gl.polygonOffset(1, 1);
          try {
            p.noStroke();
            p.fill('#34465c');
            p.beginShape(p.TRIANGLES);
            for (const face of this.surface.faces) {
              p.normal(...face.n);
              for (const v of face.verts3) p.vertex(...v);
            }
            p.endShape();
          } finally {
            gl.polygonOffset(factor, units);
            if (!offset) gl.disable(gl.POLYGON_OFFSET_FILL);
          }
        }
        p.noFill();
        if (edges) {
          p.stroke('#8196b1');
          p.strokeWeight(0.008);
          p.beginShape(p.LINES);
          for (const edge of this.edges) {
            p.vertex(...this.surface.vertices[edge.a].position);
            p.vertex(...this.surface.vertices[edge.b].position);
          }
          p.endShape();
        }
        for (const path of this.paths) {
          p.stroke(path.stroke);
          p.strokeWeight(path.width);
          p.beginShape(p.LINES);
          for (const segment of path.segments) {
            p.vertex(...segment.a);
            p.vertex(...segment.b);
          }
          p.endShape();
        }
      } finally { p.pop(); }
    }

    dispose() {
      owners.get(this.sketch)?.delete(this);
      this.sketch = null;
      this.edges = [];
      super.dispose();
    }
  }

  fn.createManifoldCanvas = function(surface, options) {
    if (!this._renderer?.isP3D) throw new Error('Call createCanvas(width,height,WEBGL) before createManifoldCanvas');
    const canvas = new P5ManifoldCanvas(this, surface, options ?? { frame: makeFrame(surface.centroid(surface.faces[0].id)) });
    if (!owners.has(this)) owners.set(this, new Set());
    owners.get(this).add(canvas);
    return canvas;
  };
  lifecycles.remove = function() {
    for (const canvas of owners.get(this) ?? []) canvas.dispose();
    owners.delete(this);
  };
}
