// Shared three.js scaffolding for the demos (renderer, camera, lights, orbit controls, surface mesh).
// Demo-side code: knows about three.js, never about the libraries' internals beyond their public API.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createViewer(container, { background = '#0a0d12', cameraPos = [2.6, -3.6, 2.4] } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  camera.position.set(...cameraPos);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, -4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.5);
  fill.position.set(-4, 3, -2);
  scene.add(fill);
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  return { THREE, renderer, scene, camera, controls, resize };
}

// Mesh + wireframe for a library Surface built from a mesh ({positions, triangles}).
export function surfaceMeshes(surface, { color = 0x9aa6ba, vertexColors = null } = {}) {
  const mesh = surface.mesh;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions.flat(), 3));
  geo.setIndex(mesh.triangles.flat());
  geo.computeVertexNormals();
  if (vertexColors) geo.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
  const solid = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: vertexColors ? 0xffffff : color,
      vertexColors: !!vertexColors,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x6f84aa, transparent: true, opacity: 0.35 }),
  );
  return { solid, wire, geometry: geo };
}

// Camera ray through a pointer event, as { origin, dir } arrays for Surface.raycast.
export function pointerRay(ev, renderer, camera) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -(((ev.clientY - rect.top) / rect.height) * 2 - 1),
  );
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  const o = rc.ray.origin;
  const d = rc.ray.direction;
  return { origin: [o.x, o.y, o.z], dir: [d.x, d.y, d.z] };
}

// Growable line-segment buffer: call begin(), seg(p, q) ..., end().
export class SegmentBuffer {
  constructor(scene, color, maxSegments = 60000, opacity = 1) {
    this.attr = new THREE.BufferAttribute(new Float32Array(maxSegments * 6), 3);
    const geo = new THREE.BufferGeometry().setAttribute('position', this.attr);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    this.lines.frustumCulled = false;
    this.n = 0;
    scene.add(this.lines);
  }

  begin() {
    this.n = 0;
  }

  seg(p, q) {
    if (this.n + 2 > this.attr.count) return;
    this.attr.setXYZ(this.n++, p[0], p[1], p[2]);
    this.attr.setXYZ(this.n++, q[0], q[1], q[2]);
  }

  end() {
    this.attr.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, this.n);
  }

  set visible(v) {
    this.lines.visible = v;
  }

  set opacity(o) {
    this.lines.material.opacity = o;
  }
}

export function download(filename, text, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
