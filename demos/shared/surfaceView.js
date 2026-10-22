// Three.js output adapter. No DOM: sketches or a different GUI can set options directly.
import * as THREE from 'three';
import { surfaceEdges, gaussianCurvature, meanCurvature } from '../../manifold-core/index.js';
import { FatSegments } from './fatLines.js';
import { setSurfaceOpacity } from './surfaceRenderer.js';
import { surfaceSettings, scalarRange, edgeOpacity } from './surfaceStyle.js';

function mappedColor(value, range, map, out) {
  if (!Number.isFinite(value) || !range) return out.set('#7f8a9c');
  const t = Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0])));
  if (map === 'sequential') return out.setHSL(0.66 * (1 - t), 0.85, 0.3 + 0.4 * t);
  const x = 2 * t - 1;
  return x < 0 ? out.setRGB(1 + 0.45 * x, 1 + 0.38 * x, 1)
    : out.setRGB(1, 1 - 0.75 * x, 1 - 0.9 * x);
}

export class SurfaceView {
  constructor(scene, renderer, options = {}, { customLabel = null } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.customLabel = customLabel;
    this._settings = surfaceSettings(options);
    if (this._settings.faces.source === 'custom' && !customLabel) throw new Error('This surface view has no demo colour provider');
    this.listeners = new Set();
    this.surface = null;
    this.solid = null;
    this.customColors = null;
  }

  get settings() { return structuredClone(this._settings); }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setOptions(patch) {
    const next = surfaceSettings(patch, this._settings);
    if (next.faces.source === 'custom' && !this.customLabel) throw new Error('This surface view has no demo colour provider');
    const changed = Object.keys(patch);
    this._settings = next;
    if (this.surface) {
      if (changed.includes('faces')) this.paintFaces();
      if (changed.includes('edges')) this.paintEdges();
      if (changed.includes('vertices')) this.paintVertices();
    }
    this.notify();
  }

  notify() { for (const listener of this.listeners) listener(this.settings); }

  setSurface(surface) {
    if (!surface.mesh || !surface.vertices) throw new Error('SurfaceView requires an embedded mesh');
    this.releaseGeometry();
    this.surface = surface;
    this.fields = new Map();
    this.customColors = null;
    this.edges = surfaceEdges(surface);
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.Float32BufferAttribute(surface.mesh.positions.flat(), 3));
    indexed.setIndex(surface.faces.flatMap((face) => face.vidx));
    indexed.computeVertexNormals();
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(surface.faces.length * 12), 4));
    this.solid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide,
    }));
    this.scene.add(this.solid);
    this.edgeLines = new FatSegments(this.scene, this.renderer, {
      max: this.edges.length, vertexColors: true, segmentOpacity: true,
    });
    this.vertexMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ depthWrite: false, transparent: true }), surface.vertices.length);
    this.scene.add(this.vertexMesh);
    this.paintFaces();
    this.paintEdges();
    this.paintVertices();
    this.notify();
  }

  scalarValues(source) {
    if (!this.fields.has(source)) {
      const s = this.surface;
      let values;
      switch (source) {
        case 'K': values = gaussianCurvature(s); break;
        // A globally signed H is not available for inconsistent/nonorientable normals.
        case 'H': values = s.orientationConsistent ? meanCurvature(s) : new Float64Array(s.vertices.length).fill(NaN); break;
        case 'deficit': values = s.vertices.map((v) => v.boundary ? NaN : 2 * Math.PI - v.angleSum); break;
        case 'field': values = s.vertices.map(({ position: p }) => Math.sin(4 * p[0]) * Math.cos(3 * p[2]) + 0.5 * Math.sin(5 * p[1])); break;
        default: throw new Error(`Unknown surface scalar field: ${source}`);
      }
      this.fields.set(source, values);
    }
    return this.fields.get(source);
  }

  legend(part) {
    const settings = this._settings[part];
    if (!this.surface || ['plain', 'custom'].includes(settings.source)) return null;
    const values = this.scalarValues(settings.source);
    return {
      range: scalarRange(values, settings.map, settings.range),
      missing: Array.from(values).filter((v) => !Number.isFinite(v)).length,
      colors: Array.from({ length: 17 }, (_, i) => mappedColor(i / 16, [0, 1], settings.map, new THREE.Color()).getStyle()),
    };
  }

  // RGBA per triangle corner, in surface.faces order. Retained separately from diagnostic colours.
  setFaceColors(colors) {
    if (!this.surface || colors.length !== this.surface.faces.length * 12 ||
      !colors.every((v, i) => Number.isFinite(v) && (i % 4 !== 3 || (v >= 0 && v <= 1)))) {
      throw new Error('Demo face colours must contain finite RGBA per triangle corner (alpha in [0,1])');
    }
    this.customColors = colors;
    if (this._settings.faces.source === 'custom') this.paintFaces();
  }

  paintFaces() {
    const settings = this._settings.faces;
    const attr = this.solid.geometry.getAttribute('color');
    const color = new THREE.Color(settings.color);
    const values = ['plain', 'custom'].includes(settings.source) ? null : this.scalarValues(settings.source);
    const range = values ? scalarRange(values, settings.map, settings.range) : null;
    let transparent = false;
    this.surface.faces.forEach((face, f) => face.vidx.forEach((vertex, k) => {
      const i = 3 * f + k;
      let alpha = 1;
      if (settings.source === 'custom' && this.customColors) {
        const o = i * 4;
        color.setRGB(this.customColors[o], this.customColors[o + 1], this.customColors[o + 2]);
        alpha = this.customColors[o + 3];
      } else if (values) mappedColor(values[vertex], range, settings.map, color);
      attr.setXYZW(i, color.r, color.g, color.b, alpha);
      transparent ||= alpha < 1;
    }));
    attr.needsUpdate = true;
    this.solid.material.color.set('#ffffff');
    this.solid.userData.vertexTransparency = transparent;
    setSurfaceOpacity(this.solid, settings.opacity);
    this.solid.visible = settings.visible && settings.opacity > 0;
  }

  paintEdges() {
    const settings = this._settings.edges;
    this.edgeLines.begin();
    const color = new THREE.Color(settings.color);
    for (const edge of this.edges) {
      const alpha = edgeOpacity(edge, settings);
      if (!alpha) continue;
      if (settings.source === 'angle') mappedColor(edge.angle ?? NaN, [0, Math.PI], 'sequential', color);
      this.edgeLines.seg(this.surface.vertices[edge.a].position, this.surface.vertices[edge.b].position, color, alpha);
    }
    this.edgeLines.end();
    this.edgeLines.visible = settings.visible;
    this.edgeLines.width = settings.width;
    this.edgeLines.opacity = settings.opacity;
  }

  paintVertices() {
    const settings = this._settings.vertices;
    const values = settings.source === 'plain' ? null : this.scalarValues(settings.source);
    const range = values ? scalarRange(values, settings.map, settings.range) : null;
    const color = new THREE.Color(settings.color);
    const transform = new THREE.Object3D();
    this.surface.vertices.forEach((vertex, i) => {
      transform.position.set(...vertex.position);
      transform.scale.setScalar(settings.size);
      transform.updateMatrix();
      this.vertexMesh.setMatrixAt(i, transform.matrix);
      if (values) mappedColor(values[i], range, settings.map, color);
      this.vertexMesh.setColorAt(i, color);
    });
    this.vertexMesh.instanceMatrix.needsUpdate = true;
    if (this.vertexMesh.instanceColor) this.vertexMesh.instanceColor.needsUpdate = true;
    this.vertexMesh.computeBoundingSphere();
    this.vertexMesh.material.opacity = settings.opacity;
    this.vertexMesh.visible = settings.visible;
  }

  fitResolution() { this.edgeLines?.fitResolution(); }

  releaseGeometry() {
    for (const object of [this.solid, this.vertexMesh].filter(Boolean)) {
      this.scene.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
    this.edgeLines?.dispose(this.scene);
    this.solid = null;
    this.vertexMesh = null;
    this.edgeLines = null;
  }

  dispose() {
    this.releaseGeometry();
    this.surface = null;
    this.listeners.clear();
  }
}
