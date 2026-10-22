let display, picture, placement;

function setup() {
  createCanvas(480, 400, WEBGL).parent('preview');
  camera(3, -2.3, 3.5, 0, 0, 0, 0, 1, 0);
  perspective(PI / 3, width / height, 0.1, 100);
  display = createManifoldCanvas(cubeSurface());
  placement = display.createPlacement({ origin: [3, 0.13, 0.1], direction: [-1, 0, 0], heading: [0, 0, 1] });
  picture = createGraphics(160, 160);
  picture.noFill();
  picture.stroke('cyan');
  picture.strokeWeight(12);
  picture.circle(80, 80, 120);
}

function draw() {
  background(15);
  ambientLight(110);
  directionalLight(200, 200, 200, -1, 1, -1);
  orbitControl();
  placement.advance(0.0006 * min(deltaTime, 50));
  display.draw();
  display.imprint(picture, { placement, width: 0.65 });
}
