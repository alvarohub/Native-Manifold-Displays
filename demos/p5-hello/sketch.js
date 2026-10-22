let display, trianglePicture, circlePicture, rectanglePicture;
let trianglePlace, circlePlace, rectanglePlace;

function setup() {
  createCanvas(720, 500, WEBGL).parent('preview');
  camera(3, -2.3, 3.5, 0, 0, 0, 0, 1, 0);
  perspective(PI / 3, width / height, 0.1, 100);
  display = createManifoldCanvas(cubeSurface());
  trianglePlace = display.createPlacement({ origin: [3, -0.45, 0.1], direction: [-1, 0, 0], heading: [0, 0, 1] });
  circlePlace = display.createPlacement({ origin: [3, 0.05, 0.1], direction: [-1, 0, 0], heading: [0, 0, 1] });
  rectanglePlace = display.createPlacement({ origin: [3, 0.5, 0.1], direction: [-1, 0, 0], heading: [0, 0, 1] });

  trianglePicture = createGraphics(128, 128);
  trianglePicture.noStroke();
  trianglePicture.fill('tomato');
  trianglePicture.triangle(16, 108, 64, 16, 112, 108);
  circlePicture = createGraphics(128, 128);
  circlePicture.noStroke();
  circlePicture.fill('gold');
  circlePicture.circle(64, 64, 100);
  rectanglePicture = createGraphics(128, 128);
  rectanglePicture.noStroke();
  rectanglePicture.fill('deepskyblue');
  rectanglePicture.rect(12, 32, 104, 64);
}

function draw() {
  background(15);
  ambientLight(110);
  directionalLight(200, 200, 200, -1, 1, -1);
  orbitControl();
  const dt = min(deltaTime, 50) / 1000;
  trianglePlace.advance(0.4 * dt);
  circlePlace.advance(0.6 * dt);
  rectanglePlace.advance(0.8 * dt);
  display.draw();
  display.imprint(trianglePicture, { placement: trianglePlace, width: 0.44 });
  display.imprint(circlePicture, { placement: circlePlace, width: 0.44 });
  display.imprint(rectanglePicture, { placement: rectanglePlace, width: 0.44 });
}
