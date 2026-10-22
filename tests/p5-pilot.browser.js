// Run from demos/p5-pilot/: await (await import('/tests/p5-pilot.browser.js')).runP5PilotTests()
import p5 from 'p5';
import { manifoldAddon } from '../p5-manifold/index.js';
import { Surface, cubeMesh } from '../manifold-core/index.js';
import { frameFromPoint } from '../manifold-ink/index.js';

export async function runP5PilotTests() {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  p5.registerAddon(manifoldAddon);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-1000px;top:0;width:96px;height:96px';
  document.body.appendChild(host);
  const surface = Surface.fromMesh(cubeMesh(2, 1));
  const frame = (z) => frameFromPoint(surface, surface.raycast([0.13, 0.07, z], [0, 0, -Math.sign(z)]), [1, 0, 0]);
  let sketch, front, rear, pixels, independent, independentCanvas;
  const saved = { setup: window.setup, draw: window.draw };
  let globalSketch, globalCanvas;
  try {
    sketch = await new Promise(resolve => {
      new p5(p => {
        p.setup = () => {
          p.createCanvas(96, 96, p.WEBGL).id('p5-pilot-test');
          p.pixelDensity(1);
          p.ortho(-2, 2, -2, 2, 0.1, 100);
          p.camera(0, 0, 7, 0, 0, 0, 0, 1, 0);
          p.noLoop();
          front = p.createManifoldCanvas(surface, { frame: frame(3) });
          rear = p.createManifoldCanvas(surface, { frame: frame(-3) });
          front.path({ points: [[-0.6, 0], [0.6, 0]], closed: false }, { stroke: '#00ffff', width: 0.1 });
          rear.path({ points: [[-0.6, 0], [0.6, 0]], closed: false }, { stroke: '#ff0000', width: 0.1 });
        };
        p.draw = () => setTimeout(() => resolve(p), 0);
      }, host);
    });
    const count = predicate => {
      let n = 0;
      for (let i = 0; i < pixels.length; i += 4) if (predicate(pixels[i], pixels[i + 1], pixels[i + 2])) n++;
      return n;
    };
    const render = async showFront => {
      sketch.draw = () => {
        sketch.background('#000000');
        sketch.stroke('#ff00ff');
        sketch.strokeWeight(0.1);
        const gl = sketch.drawingContext;
        const enabled = gl.isEnabled(gl.POLYGON_OFFSET_FILL);
        const factor = gl.getParameter(gl.POLYGON_OFFSET_FACTOR), units = gl.getParameter(gl.POLYGON_OFFSET_UNITS);
        rear.draw({ edges: false });
        if (showFront) front.draw({ faces: false, edges: false });
        assert(gl.isEnabled(gl.POLYGON_OFFSET_FILL) === enabled &&
          gl.getParameter(gl.POLYGON_OFFSET_FACTOR) === factor &&
          gl.getParameter(gl.POLYGON_OFFSET_UNITS) === units, 'GL depth-bias state restored');
        sketch.line(-0.6, 0.6, 1.1, 0.6, 0.6, 1.1);
        sketch.loadPixels();
        pixels = new Uint8Array(sketch.pixels);
      };
      await sketch.redraw();
    };
    await render(false);
    const rearPixels = count((r, g, b) => r > 200 && g < 30 && b < 30);
    assert(rearPixels === 0, 'opaque surface hides rear stroke');
    await render(true);
    const frontPixels = count((r, g, b) => r < 30 && g > 200 && b > 200);
    const restoredStylePixels = count((r, g, b) => r > 200 && g < 30 && b > 200);
    assert(frontPixels >= 30 && frontPixels < 300, 'front stroke visible at a bounded width, not filling the preview');
    assert(restoredStylePixels >= 30, 'draw restores native p5 stroke style');
    const oldRear = JSON.stringify(rear.paths);
    front.clear();
    assert(JSON.stringify(rear.paths) === oldRear, 'two manifold canvases in one sketch have independent state');
    independent = await new Promise(resolve => {
      new p5(p => {
        p.setup = () => {
          p.createCanvas(16, 16, p.WEBGL).id('p5-independent-test');
          p.noLoop();
          independentCanvas = p.createManifoldCanvas(surface, { frame: frame(3) });
        };
        p.draw = () => setTimeout(() => resolve(p), 0);
      }, host);
    });
    await sketch.remove();
    assert(front.disposed && rear.disposed, 'actual p5 remove hook disposes both owned canvases');
    assert(!independentCanvas.disposed, 'second sketch remains active');
    await independent.remove();

    await new Promise(resolve => {
      window.setup = function() {
        window.createCanvas(32, 32, window.WEBGL).id('p5-global-test');
        window.noLoop();
        globalCanvas = window.createManifoldCanvas(surface, { frame: frame(3) });
        globalCanvas.path({ points: [[0, 0], [0.2, 0]], closed: false });
      };
      window.draw = () => setTimeout(resolve, 0);
      globalSketch = new p5(undefined, host);
    });
    assert(globalCanvas.paths.length === 1, 'global-mode createManifoldCanvas is bound to its sketch');
    await globalSketch.remove();
    assert(globalCanvas.disposed, 'global-mode cleanup disposes its canvas');
    assert(typeof window.createManifoldCanvas === 'undefined', 'global registration cleaned up');
    return { passed: true, rearPixels, frontPixels, restoredStylePixels, globalMode: true };
  } finally {
    if (sketch && !front?.disposed) await sketch.remove();
    if (independent && !independentCanvas?.disposed) await independent.remove();
    if (globalSketch && !globalCanvas?.disposed) await globalSketch.remove();
    for (const name of ['setup', 'draw']) {
      if (saved[name] === undefined) delete window[name];
      else window[name] = saved[name];
    }
    host.remove();
  }
}
