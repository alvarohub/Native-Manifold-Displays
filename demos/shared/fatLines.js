// Wide lines for the demos (WebGL ignores linewidth on plain lines): one LineSegments2 with a fixed capacity,
// positions/colours rewritten in place each frame. Width is in CSS pixels.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const size = new THREE.Vector2();

export class FatSegments {
  constructor(scene, renderer, { color = 0xffffff, width = 1.5, opacity = 1, max = 20000, vertexColors = false, segmentOpacity = false } = {}) {
    this.renderer = renderer;
    this.max = Math.max(1, max);
    max = this.max;
    this.positions = new Float32Array(max * 6);
    this.geometry = new LineSegmentsGeometry().setPositions(this.positions);
    if (vertexColors) {
      this.colors = new Float32Array(max * 6);
      this.geometry.setColors(this.colors);
    }
    this.material = new LineMaterial({
      color: vertexColors ? 0xffffff : color,
      linewidth: width,
      transparent: true,
      opacity,
      vertexColors,
      depthWrite: false,
    });
    if (segmentOpacity) {
      this.opacities = new Float32Array(max);
      this.geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(this.opacities, 1));
      this.material.onBeforeCompile = (shader) => {
        shader.vertexShader = `attribute float instanceOpacity;\nvarying float vSegmentOpacity;\n${shader.vertexShader}`
          .replace('void main() {', 'void main() {\n vSegmentOpacity = instanceOpacity;');
        const output = 'gl_FragColor = vec4( diffuseColor.rgb, alpha );';
        if (!shader.fragmentShader.includes(output)) throw new Error('Unsupported three.js line shader: segment opacity output not found');
        shader.fragmentShader = `varying float vSegmentOpacity;\n${shader.fragmentShader}`
          .replace(output, 'gl_FragColor = vec4( diffuseColor.rgb, alpha * vSegmentOpacity );');
      };
      this.material.customProgramCacheKey = () => 'surface-segment-opacity-v1';
    }
    this.lines = new LineSegments2(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.n = 0;
    this.geometry.instanceCount = 0;
    scene.add(this.lines);
  }

  begin() {
    this.n = 0;
  }

  seg(p, q, c = null, opacity = 1) {
    if (this.n >= this.max) {
      this.max *= 2;
      const positions = new Float32Array(this.max * 6);
      positions.set(this.positions);
      this.positions = positions;
      this.geometry.dispose();
      this.geometry.setPositions(positions);
      if (this.colors) {
        const colors = new Float32Array(this.max * 6);
        colors.set(this.colors);
        this.colors = colors;
        this.geometry.setColors(colors);
      }
      if (this.opacities) {
        const opacities = new Float32Array(this.max);
        opacities.set(this.opacities);
        this.opacities = opacities;
        this.geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(opacities, 1));
      }
    }
    if (this.opacities) this.opacities[this.n] = opacity;
    const o = 6 * this.n++;
    this.positions[o] = p[0];
    this.positions[o + 1] = p[1];
    this.positions[o + 2] = p[2];
    this.positions[o + 3] = q[0];
    this.positions[o + 4] = q[1];
    this.positions[o + 5] = q[2];
    if (c && this.colors) {
      this.colors[o] = this.colors[o + 3] = c.r;
      this.colors[o + 1] = this.colors[o + 4] = c.g;
      this.colors[o + 2] = this.colors[o + 5] = c.b;
    }
  }

  end() {
    this.geometry.attributes.instanceStart.data.needsUpdate = true;
    if (this.colors) this.geometry.attributes.instanceColorStart.data.needsUpdate = true;
    if (this.opacities) this.geometry.attributes.instanceOpacity.needsUpdate = true;
    this.geometry.instanceCount = this.n;
    this.fitResolution();
  }

  // call every frame for static buffers (window may have been resized)
  fitResolution() {
    this.renderer.getSize(size);
    this.material.resolution.copy(size);
  }

  set visible(v) {
    this.lines.visible = v;
  }

  set width(w) {
    this.material.linewidth = w;
  }

  set opacity(o) {
    this.material.opacity = o;
  }

  set color(c) {
    this.material.color.set(c);
  }

  dispose(scene) {
    scene.remove(this.lines);
    this.geometry.dispose();
    this.material.dispose();
  }
}
