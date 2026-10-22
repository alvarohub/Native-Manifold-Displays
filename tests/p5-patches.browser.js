// From a p5 example: await (await import('/tests/p5-patches.browser.js')).runP5PatchTests()
import p5 from 'https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.esm.js';
import { manifoldAddon } from '../p5-manifold/index.js';

export async function runP5PatchTests() {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  p5.registerAddon(manifoldAddon);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-1000px;width:128px;height:128px';
  document.body.append(host);
  let sketch, display, picture, foreground, background, samples;
  try {
    sketch = await new Promise(resolve => {
      new p5(p => {
        p.setup = () => {
          p.createCanvas(128, 128, p.WEBGL).id('p5-patch-test');
          p.pixelDensity(1);
          p.camera(0, 0, 5, 0, 0, 0, 0, 1, 0);
          p.perspective(p.PI / 3, 1, 0.1, 100);
          p.noLoop();
          display = p.createManifoldCanvas(p.cubeSurface());
          foreground = display.createPlacement({ origin: [0.13, 0.07, 3], direction: [0, 0, -1], heading: [1, 0, 0] });
          background = display.createPlacement({ origin: [0.13, 0.07, -3], direction: [0, 0, 1], heading: [1, 0, 0] });
          picture = p.createGraphics(64, 64);
          picture.pixelDensity(1);
          picture.noStroke();
          picture.fill('#ff0000');
          picture.circle(32, 32, 36);
        };
        p.draw = () => setTimeout(() => resolve(p), 0);
      }, host);
    });
    let stage = 0;
    const render = async () => {
      sketch.draw = () => {
        sketch.background('#000000');
        display.draw({ edges: false });
        if (stage !== 0) display.imprint(picture, { placement: stage === 1 ? foreground : background, width: 1.2 });
        const gl = sketch.drawingContext;
        assert(gl.getParameter(gl.DEPTH_WRITEMASK), 'depth-write state restored');
        sketch.loadPixels();
        samples = new Uint8Array(sketch.pixels);
      };
      await sketch.redraw();
      return samples;
    };
    const base = await render();
    stage = 1;
    const front = await render();
    let red = 0, transparent = 0, support = 0;
    for (let i = 0; i < front.length; i += 4) {
      if (front[i] > 220 && front[i + 1] < 30 && front[i + 2] < 30) red++;
      if (base[i + 2] > 30) {
        support++;
        if (front[i] === base[i] && front[i + 1] === base[i + 1] && front[i + 2] === base[i + 2]) transparent++;
      }
    }
    assert(red > 100 && red < 1000, 'native p5 circle is visible with a bounded footprint');
    assert(transparent / support > 0.7, 'transparent graphics corners preserve support pixels');
    picture.clear();
    picture.fill('#00ff00');
    picture.circle(32, 32, 36);
    const updated = await render();
    let green = 0;
    for (let i = 0; i < updated.length; i += 4) if (updated[i] < 30 && updated[i + 1] > 220 && updated[i + 2] < 30) green++;
    assert(green > 100, 'editing the original p5.Graphics updates the texture without rebuilding the adapter');
    stage = 2;
    const rear = await render();
    assert(rear.every((v, i) => v === base[i]), 'image on rear face remains occluded');
    const old = foreground.frame;
    foreground.advance(0.2);
    assert(JSON.stringify(old) !== JSON.stringify(foreground.frame), 'placement advances independently');
    assert(background.surface === foreground.surface, 'placements share immutable geometry, not frames');
    const svg = sketch.svgContours('M 0 0 C 0 40 40 40 40 0 Z', { width: 0.5 });
    assert(svg.length === 1 && svg[0].points.length > 4 && svg[0].closed, 'SVG parser reuses cubic contour flattening');
    assert(svg[0].points.every(p => p.every(Number.isFinite)), 'SVG points finite');
    await sketch.remove();
    assert(display.disposed, 'sketch removal releases the surface adapter');
    return { passed: true, redPixels: red, updatedGreenPixels: green, unchangedSupportFraction: transparent / support, rearOccluded: true };
  } finally {
    if (sketch && !display?.disposed) await sketch.remove();
    picture?.remove();
    host.remove();
  }
}
