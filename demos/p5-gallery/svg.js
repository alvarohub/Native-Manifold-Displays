let display, placement, heartPlace, letters, heart;

async function setup() {
  createCanvas(480, 400, WEBGL).parent('preview');
  camera(3, -3, 3.5, 0, 0, 0, 0, 0, 1);
  perspective(PI / 3, width / height, 0.1, 100);
  display = createManifoldCanvas(torusSurface());
  placement = display.createPlacement({ origin: [3, -3, 0.18], direction: [-1, 1, 0], heading: [1, 1, 0] });
  heartPlace = display.createPlacement({ origin: [0.1, -3, 0.08], direction: [0, 1, 0], heading: [1, 0, 0] });
  const font = await loadFont('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/archivoblack/ArchivoBlack-Regular.ttf');
  textFont(font);
  textSize(100);
  const svgText = font.textToPaths('hi', 0, 0).map(command => command.join(' ')).join(' ');
  letters = svgContours(svgText, { width: 0.45 });
  const svgHeart = 'M 50 90 C 0 55 0 0 50 25 C 100 0 100 55 50 90 Z';
  heart = svgContours(svgHeart, { width: 0.28 });
}

function draw() {
  background(15);
  ambientLight(110);
  directionalLight(200, 200, 200, -1, 1, -1);
  orbitControl();
  const dt = min(deltaTime, 50) / 1000;
  placement.advance(0.25 * dt);
  heartPlace.advance(0.35 * dt);
  display.draw({ edges: false });
  display.contours(letters, { placement, width: 0.6, height: 0.5, depth: 0.25, stroke: '#7be0ff' });
  display.contours(heart, { placement: heartPlace, width: 0.4, height: 0.5, depth: 0.2, stroke: '#ff6688' });
}
