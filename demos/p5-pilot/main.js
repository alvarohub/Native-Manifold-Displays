import p5 from 'p5';
import { manifoldAddon } from '../../p5-manifold/index.js';
import { Surface, cubeMesh } from '../../manifold-core/index.js';
import { frameFromPoint, rectContour } from '../../manifold-ink/index.js';

p5.registerAddon(manifoldAddon);
const pilots = [];
for (const [id, rectangle] of [['left', false], ['right', true]]) {
  const host = document.getElementById(id), viewport = host.querySelector('.viewport');
  const length = host.querySelector('.length'), colour = host.querySelector('.colour');
  const output = host.querySelector('output'), error = host.querySelector('[role=alert]');
  const surface = Surface.fromMesh(cubeMesh(2, 1));
  const anchor = surface.raycast([3, 0.13, 0.07], [-1, 0, 0]);
  const frame = frameFromPoint(surface, anchor, [0, 0, 1]);
  const state = { sketch: null, canvas: null };
  const sketch = new p5(p => {
    const report = () => {
      const paths = state.canvas.paths;
      output.textContent = paths.length
        ? `${paths[0].length.toFixed(2)} surface units; ${paths[0].crossings.length} triangle seams\n` +
          `${new Set(paths[0].segments.map(s => surface.faceById(s.faceId).n.join(','))).size} cube faces; ${paths[0].segments.length} on-face segments`
        : 'Canvas cleared (the other sketch is unchanged).';
    };
    const rebuild = () => {
      try {
        const n = Number(length.value);
        const contour = rectangle ? rectContour(n, 0.65)
          : { points: [[0, 0], [n, 0]], closed: false };
        state.canvas.path(contour, { stroke: colour.value, width: 0.035, replace: true });
        error.textContent = '';
        report();
      } catch (e) { error.textContent = e.message; console.error(e); }
    };
    p.setup = () => {
      p.createCanvas(viewport.clientWidth, viewport.clientWidth, p.WEBGL).id(`pilot-${id}`);
      p.pixelDensity(1);
      p.ortho(-1.9, 1.9, -1.9, 1.9, 0.1, 100);
      p.camera(0, 0, 7, 0, 0, 0, 0, 1, 0);
      p.describe(rectangle ? 'A cyan rectangle folded around a cube.' : 'An amber stroke wrapping around four cube faces.');
      state.canvas = p.createManifoldCanvas(surface, { frame });
      rebuild();
      length.addEventListener('input', rebuild);
      colour.addEventListener('input', rebuild);
      host.querySelector('.clear').onclick = () => { state.canvas.clear(); report(); };
      host.querySelector('.reset').onclick = rebuild;
    };
    p.draw = () => {
      p.background('#0a0d12');
      p.ambientLight(130);
      p.directionalLight(200, 200, 200, -0.5, 0.5, -1);
      p.orbitControl();
      p.push();
      p.rotateX(-0.35);
      p.rotateY(-0.55);
      state.canvas.draw();
      p.pop();
    };
    p.windowResized = () => { p.resizeCanvas(viewport.clientWidth, viewport.clientWidth); };
  }, viewport);
  state.sketch = sketch;
  pilots.push(state);
}
window.__p5Pilot = { pilots, version: p5.VERSION };
