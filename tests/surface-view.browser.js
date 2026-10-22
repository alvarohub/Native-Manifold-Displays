// Run from any demo: await (await import('/tests/surface-view.browser.js')).runSurfaceViewTests()
import * as THREE from 'three';
import { Surface, cubeMesh, planeMesh, mobiusBandMesh } from '../manifold-core/index.js';
import { SurfaceView } from '../demos/shared/surfaceView.js';
import { surfacePanel } from '../demos/shared/surfacePanel.js';
import { FatSegments } from '../demos/shared/fatLines.js';
import { renderSurfaceScene } from '../demos/shared/surfaceRenderer.js';

export async function runSurfaceViewTests() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(64, 64);
  const target = new THREE.WebGLRenderTarget(64, 64);
  renderer.setRenderTarget(target);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const view = new SurfaceView(scene, renderer, {}, { customLabel: 'Demo states' });
  const host = document.createElement('fieldset');
  host.appendChild(document.createElement('legend'));
  document.body.appendChild(host);
  const panel = surfacePanel(host, view);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  const lines = new FatSegments(scene, renderer, { max: 1, color: 0xff0000, width: 5, segmentOpacity: true });
  try {
    let rejected = false;
    try { new SurfaceView(scene, renderer, { faces: { source: 'custom' } }); }
    catch (error) { rejected = error.message.includes('no demo colour provider'); }
    assert(rejected, 'constructor rejects missing demo colour provider');
    view.setSurface(Surface.fromMesh(cubeMesh(2, 1)));
    view.setOptions({ edges: { visible: true, mode: 'feature', angle: 1 }, vertices: { visible: true } });
    assert(view.edgeLines.n === 12, 'cube polygon edges only');
    assert(view.vertexMesh.count === 8, 'all vertices represented');
    view.setOptions({ faces: { visible: false } });
    assert(!view.solid.visible && view.edgeLines.lines.visible && view.vertexMesh.visible, 'representations independently visible');
    assert(!host.querySelector('#surface-faces-visible').checked, 'programmatic changes synchronize checkbox');
    view.setOptions({ edges: { mode: 'all' } });
    assert(view.edgeLines.n === 18, 'all-edges mode restores six diagonals');
    const snapshot = view.settings;
    snapshot.edges.width = 7;
    assert(view.settings.edges.width === 1, 'settings snapshots cannot mutate the adapter');
    const outputs = host.querySelector('#surface-edgesPicker').querySelectorAll('output');
    assert(outputs[0].textContent === '0.45' && outputs[1].textContent === '1.00', 'style readouts match programmatic settings');
    view.setSurface(Surface.fromMesh(mobiusBandMesh(1, 0.5, 24, 4)));
    view.setOptions({ edges: { mode: 'feature', angle: 180 } });
    assert(view.edgeLines.n === 48, 'Möbius boundary retained at maximum threshold');
    view.setOptions({ faces: { source: 'H' } });
    assert(view.legend('faces').range === null, 'no invented signed H on nonorientable surface');
    assert(host.querySelector('[data-representation=faces] .surface-legend:last-child').textContent.includes('No finite values'),
      'undefined field has no invented numeric legend');
    view.setSurface(Surface.fromMesh(planeMesh(1, 1, 1, 1)));
    view.setOptions({ faces: { visible: true, source: 'custom' }, edges: { visible: false }, vertices: { visible: false } });
    const rgba = new Float32Array(24);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([1, 0, 0, 0.35], i);
    view.setFaceColors(rgba);
    const attr = view.solid.geometry.getAttribute('color');
    assert(Math.abs(attr.getW(0) - 0.35) < 1e-6, 'custom alpha applied');
    view.setOptions({ faces: { source: 'K' } });
    const diagnostic = Array.from(attr.array);
    rgba[0] = 0;
    rgba[1] = 1;
    view.setFaceColors(rgba);
    assert(attr.array.every((v, i) => v === diagnostic[i]), 'simulation updates do not overwrite diagnostic colours');
    view.setOptions({ faces: { source: 'custom' } });
    assert(attr.getX(0) === 0 && attr.getY(0) === 1, 'latest demo state restored when switching back');
    assert(view.solid.material.transparent, 'demo alpha informs surface compositor');
    view.setOptions({ faces: { visible: false } });
    lines.begin();
    lines.seg([-0.5, -0.8, 0], [-0.5, 0.8, 0], null, 0.25);
    lines.seg([0, -0.8, 0], [0, 0.8, 0], null, 0.5);
    lines.seg([0.5, -0.8, 0], [0.5, 0.8, 0], null, 1);
    lines.end();
    renderSurfaceScene(renderer, scene, camera, [view.solid]);
    const samples = [];
    for (const [x, expected] of [[16, 64], [32, 128], [48, 255]]) {
      const pixel = new Uint8Array(4);
      renderer.readRenderTargetPixels(target, x, 32, 1, 1, pixel);
      assert(Math.abs(pixel[0] - expected) <= 1 && pixel[1] === 0, `per-edge opacity after buffer growth: ${pixel[0]} != ${expected}`);
      samples.push(pixel[0]);
    }
    lines.opacity = 0.5;
    renderSurfaceScene(renderer, scene, camera, [view.solid]);
    for (const [x, expected] of [[16, 32], [32, 64], [48, 128]]) {
      const pixel = new Uint8Array(4);
      renderer.readRenderTargetPixels(target, x, 32, 1, 1, pixel);
      assert(Math.abs(pixel[0] - expected) <= 1, 'material opacity multiplies per-edge opacity');
    }
    const visible = host.querySelector('#surface-edges-visible');
    visible.checked = true;
    visible.dispatchEvent(new Event('change'));
    assert(view.edgeLines.lines.visible, 'GUI edits the same public settings');
    const swatch = host.querySelector('[aria-label="Edges style"]');
    assert(swatch.textContent === '', 'style button contains only a swatch');
    swatch.click();
    assert(host.querySelector('#surface-edgesPicker').matches(':popover-open'), 'swatch opens editor');
    swatch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!host.querySelector('#surface-edgesPicker').matches(':popover-open'), 'Escape closes editor');
    return { passed: true, segmentOpacityPixels: samples };
  } finally {
    panel.dispose();
    host.remove();
    view.dispose();
    lines.dispose(scene);
    target.dispose();
    renderer.dispose();
  }
}
