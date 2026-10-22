// Run in a served demo page: (await import('/tests/rendering.browser.js')).runRenderingTests()
import * as THREE from 'three';
import { FatSegments } from '../demos/shared/fatLines.js';
import { setSurfaceOpacity, renderSurfaceScene } from '../demos/shared/surfaceRenderer.js';
import { appearanceControl, adoptAppearanceControl } from '../demos/shared/appearance.js';

export async function runRenderingTests() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(64, 64);
  const target = new THREE.WebGLRenderTarget(64, 64);
  renderer.setRenderTarget(target);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  const support = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
    color: 0x00ff00, side: THREE.DoubleSide,
  }));
  scene.add(support);
  const lines = new FatSegments(scene, renderer, { color: 0xff0000, width: 5, max: 1 });
  lines.begin();
  lines.seg([-0.5, -0.8, 0.5], [-0.5, 0.8, 0.5]);
  lines.seg([0.5, -0.8, -0.5], [0.5, 0.8, -0.5]);
  lines.seg([0, -0.8, 0], [0, 0.8, 0]);
  lines.end();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const samples = [];
  try {
    assert(lines.max >= 3 && lines.geometry.instanceCount === 3, 'line buffer grows without truncating paths');
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      setSurfaceOpacity(support, alpha);
      const before = {
        background: scene.background, autoClear: renderer.autoClear, depthFunc: lines.material.depthFunc,
        depthWrite: support.material.depthWrite, transparent: support.material.transparent,
      };
      renderSurfaceScene(renderer, scene, camera, [support]);
      const pixels = new Uint8Array(64 * 64 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 64, 64, pixels);
      const sample = (x) => Array.from(pixels.slice((32 * 64 + x) * 4, (32 * 64 + x) * 4 + 3));
      const front = sample(16), rear = sample(48);
      const coplanar = sample(32);
      assert(front[0] === 255 && front[1] === 0, `front line stays opaque at surface alpha ${alpha}`);
      assert(coplanar[0] === 255 && coplanar[1] === 0, `surface path is not buried by coplanar depth fighting at alpha ${alpha}`);
      assert(Math.abs(rear[0] - 255 * (1 - alpha)) <= 1, `rear red attenuation at alpha ${alpha}`);
      assert(Math.abs(rear[1] - 255 * alpha) <= 1, `surface compositing at alpha ${alpha}`);
      assert(scene.background === before.background && renderer.autoClear === before.autoClear, 'renderer state restored');
      assert(lines.material.depthFunc === before.depthFunc && support.visible === (alpha > 0), 'object state restored');
      assert(support.material.depthWrite === before.depthWrite && support.material.transparent === before.transparent, 'materials restored');
      samples.push({ alpha, front, rear });
    }
    lines.opacity = 0.5;
    setSurfaceOpacity(support, 1);
    renderSurfaceScene(renderer, scene, camera, [support]);
    const translucentLine = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 16, 32, 1, 1, translucentLine);
    assert(Math.abs(translucentLine[0] - 128) <= 1 && Math.abs(translucentLine[1] - 128) <= 1, 'selected line opacity affects actual pixels');
    lines.opacity = 1;
    support.material.color.set(0xffffff);
    support.material.vertexColors = true;
    support.material.needsUpdate = true;
    support.geometry.setAttribute('color', new THREE.Float32BufferAttribute([
      0, 1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5, 0, 1, 0, 0.5,
    ], 4));
    support.userData.vertexTransparency = true;
    setSurfaceOpacity(support, 1);
    renderSurfaceScene(renderer, scene, camera, [support]);
    const cellAlpha = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 48, 32, 1, 1, cellAlpha);
    assert(Math.abs(cellAlpha[0] - 128) <= 1 && Math.abs(cellAlpha[1] - 128) <= 1, 'Life-style per-cell alpha attenuates rear lines');
    let events = 0;
    const style = appearanceControl(host, {
      id: 'regression', label: 'Test line', color: '#ff0000', opacity: 1, width: 2,
      onInput: () => events++,
    });
    const button = host.querySelector('.appearance-button');
    const picker = host.querySelector('.appearance-picker');
    assert(!picker.matches(':popover-open') && picker.getClientRects().length === 0, 'style editor starts hidden');
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(picker.matches(':popover-open') && button.getAttribute('aria-expanded') === 'true', 'button opens accessible style popover');
    const rect = picker.getBoundingClientRect();
    assert(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      'popover fits the viewport');
    const opacity = host.querySelector('#regressionOpacity');
    opacity.value = '0.35';
    opacity.dispatchEvent(new Event('input'));
    const width = host.querySelector('#regressionWidth');
    width.value = '4';
    width.dispatchEvent(new Event('input'));
    assert(style.opacity === 0.35 && style.width === 4 && events === 2, 'shared RGBA/width controls update');
    assert(button.title.includes('0.35') && button.title.includes('4 px'), 'button previews the selected style');
    picker.querySelector('header button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(!picker.matches(':popover-open') && button.getAttribute('aria-expanded') === 'false', 'close button dismisses picker');
    button.click();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!picker.matches(':popover-open') && document.activeElement === button, 'Escape dismisses picker and restores button focus');
    const oldRow = document.createElement('div');
    oldRow.className = 'row';
    const existing = document.createElement('input');
    existing.type = 'color';
    existing.id = 'adoptedColor';
    existing.value = '#abcdef';
    let adoptedEvents = 0;
    existing.addEventListener('input', () => adoptedEvents++);
    oldRow.appendChild(existing);
    host.appendChild(oldRow);
    const adopted = adoptAppearanceControl(existing, { id: 'adopted', label: 'Adopted' });
    existing.value = '#123456';
    existing.dispatchEvent(new Event('input'));
    assert(adopted.color === '#123456' && adoptedEvents === 1 && !oldRow.isConnected,
      'adopting a control preserves its identity and listeners, removing only the old row');
    return { passed: true, samples };
  } finally {
    host.remove();
    lines.dispose(scene);
    support.geometry.dispose();
    support.material.dispose();
    target.dispose();
    renderer.dispose();
  }
}
