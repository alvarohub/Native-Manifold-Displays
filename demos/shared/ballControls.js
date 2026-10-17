// Drag-ball camera control (Shoemake-style, done by moving the camera so world coordinates never change):
//   drag inside the dial → rotate the object about its centre like a ball in your hand (axis ⟂ drag);
//   drag on the dial rim → spin about the view axis; wheel → zoom; right-drag → pan.
// Shift-drags are ignored (demos use shift-click). Same surface as OrbitControls: update(), enabled, target.
import * as THREE from 'three';

const RIM_FRACTION = 0.44; // dial radius / min(width, height)
const RIM_BAND = 18; // px either side of the dial that grab the spin

export class BallControls {
  constructor(camera, dom, { speed = 1, damping = 6 } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3();
    this.enabled = true;
    this.speed = speed;
    this.damping = damping;
    this._mode = null;
    this._last = null;
    this._spin = new THREE.Quaternion(); // object-frame rotation per second (inertia)
    this._spinRate = 0;
    this._spinAxis = new THREE.Vector3();
    this._t = performance.now();
    this._dial = this._makeDial();

    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._move(e));
    dom.addEventListener('pointerup', (e) => this._up(e));
    dom.addEventListener('pointercancel', (e) => this._up(e));
    dom.addEventListener('pointerleave', () => this._hover(false));
    dom.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Centre the rotation on a set of points (bounding-box centre) and back off to see them all.
  frame(positions, { keepDirection = true } = {}) {
    const box = new THREE.Box3();
    for (const p of positions) box.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = keepDirection
      ? this.camera.position.clone().sub(this.target).normalize()
      : new THREE.Vector3(0.45, -0.65, 0.6).normalize();
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.05;
    this.target.copy(centre);
    this.camera.position.copy(centre).addScaledVector(dir, dist);
    this.camera.lookAt(centre);
    this._spinRate = 0;
  }

  update() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._t) / 1000);
    this._t = now;
    if (!this._mode && this._spinRate > 1e-4) {
      this._rotateWorld(this._spinAxis, this._spinRate * dt);
      this._spinRate *= Math.exp(-this.damping * dt);
    }
  }

  // ---------------------------------------------------------------- internals
  _makeDial() {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      borderRadius: '50%',
      border: '1px solid rgba(160,180,220,0.18)',
      boxShadow: 'none',
      transition: 'border-color 120ms, box-shadow 120ms',
    });
    const host = this.dom.parentElement ?? document.body;
    host.appendChild(el);
    const place = () => {
      const { cx, cy, r } = this._geom();
      const rect = this.dom.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      Object.assign(el.style, {
        left: `${rect.left - hostRect.left + cx - r}px`,
        top: `${rect.top - hostRect.top + cy - r}px`,
        width: `${2 * r}px`,
        height: `${2 * r}px`,
      });
    };
    window.addEventListener('resize', place);
    requestAnimationFrame(place);
    return el;
  }

  _geom() {
    const rect = this.dom.getBoundingClientRect();
    return { cx: rect.width / 2, cy: rect.height / 2, r: RIM_FRACTION * Math.min(rect.width, rect.height), rect };
  }

  _local(e) {
    const rect = this.dom.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _onRim([x, y]) {
    const { cx, cy, r } = this._geom();
    return Math.abs(Math.hypot(x - cx, y - cy) - r) < RIM_BAND;
  }

  _hover(on) {
    this._dial.style.borderColor = on ? 'rgba(143,180,255,0.75)' : 'rgba(160,180,220,0.18)';
    this._dial.style.boxShadow = on ? '0 0 0 3px rgba(143,180,255,0.12)' : 'none';
  }

  _down(e) {
    if (!this.enabled || e.shiftKey) return;
    const p = this._local(e);
    this._mode = e.button === 2 ? 'pan' : this._onRim(p) ? 'spin' : 'ball';
    this._last = p;
    this._lastT = performance.now();
    this._spinRate = 0;
    this.dom.setPointerCapture?.(e.pointerId);
  }

  _move(e) {
    const p = this._local(e);
    if (!this._mode) {
      this._hover(this.enabled && this._onRim(p));
      return;
    }
    const [dx, dy] = [p[0] - this._last[0], p[1] - this._last[1]];
    const now = performance.now();
    const dt = Math.max(1e-3, (now - this._lastT) / 1000);
    const { cx, cy, r } = this._geom();
    const cam = this.camera;
    if (this._mode === 'ball') {
      const angle = (Math.hypot(dx, dy) / r) * this.speed * 1.6;
      if (angle > 0) {
        // object rotates about the screen axis perpendicular to the drag (screen y points down)
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        const axis = up.multiplyScalar(dx).add(right.multiplyScalar(dy)).normalize();
        this._rotateWorld(axis, angle);
        this._spinAxis.copy(axis);
        this._spinRate = angle / dt;
      }
    } else if (this._mode === 'spin') {
      const a0 = Math.atan2(-(this._last[1] - cy), this._last[0] - cx);
      const a1 = Math.atan2(-(p[1] - cy), p[0] - cx);
      let d = a1 - a0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2); // towards the viewer
      this._rotateWorld(fwd, d);
      this._spinAxis.copy(fwd);
      this._spinRate = d / dt;
    } else if (this._mode === 'pan') {
      const dist = cam.position.distanceTo(this.target);
      const k = (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / this._geom().rect.height;
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(-dx * k);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(dy * k);
      cam.position.add(right).add(up);
      this.target.add(right).add(up);
    }
    this._last = p;
    this._lastT = now;
  }

  _up(e) {
    if (!this._mode) return;
    if (performance.now() - this._lastT > 80) this._spinRate = 0; // released while still: no fling
    if (this._spinRate < 0) {
      this._spinRate = -this._spinRate;
      this._spinAxis.negate();
    }
    if (this._mode === 'pan') this._spinRate = 0;
    this._mode = null;
    this.dom.releasePointerCapture?.(e.pointerId);
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const f = Math.exp(e.deltaY * 0.0012);
    const off = this.camera.position.clone().sub(this.target).multiplyScalar(f);
    const len = THREE.MathUtils.clamp(off.length(), 0.2, 60);
    this.camera.position.copy(this.target).add(off.setLength(len));
  }

  // Rotating the object by +angle about a world axis through the target = rotating the camera by −angle.
  _rotateWorld(axis, angle) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, -angle);
    const cam = this.camera;
    cam.position.sub(this.target).applyQuaternion(q).add(this.target);
    cam.quaternion.premultiply(q);
    cam.up.applyQuaternion(q);
    cam.updateMatrixWorld();
  }
}
