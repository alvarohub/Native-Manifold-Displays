let display, picture, placement;

function setup() {
  createCanvas(480, 400, WEBGL).parent('preview');
  camera(3, -3, 3.5, 0, 0, 0, 0, 0, 1);
  perspective(PI / 3, width / height, 0.1, 100);
  display = createManifoldCanvas(torusSurface());
  placement = display.createPlacement({ origin: [3, -3, 0.18], direction: [-1, 1, 0], heading: [1, 1, 0] });
  picture = createGraphics(400, 140);
  picture.fill('gold');
  picture.noStroke();
  picture.textAlign(CENTER, CENTER);
  picture.textSize(90);
  picture.text('hello!', 200, 65);
}

function draw() {
  background(15);
  ambientLight(110);
  directionalLight(200, 200, 200, -1, 1, -1);
  orbitControl();
  placement.advance(0.0003 * min(deltaTime, 50));
  display.draw({ edges: false });
  display.imprint(picture, { placement, width: 0.9, mode: 'projection', depth: 0.2 });
}
