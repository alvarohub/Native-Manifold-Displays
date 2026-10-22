# `p5-manifold` — A Non-Flat Canvas Addon for `p5.js`

`p5-manifold` brings **intrinsic surface graphics and geodesic motion** to `p5.js` (`v2.3.4`). Instead of treating a canvas as a flat $(W \times H)$ rectangle, `p5-manifold` lets your sketch draw, move shapes, trace curves, and run simulations directly on the surface of a 3D manifold (a cube, torus, Möbius band, Klein bottle, Stanford bunny, or any imported `.obj` / `.stl` mesh).

For the full mathematical theory and the native hardware pipeline ("Manifold GPU"), see [`../paper/NATIVE_MANIFOLD_DISPLAYS.md`](../paper/NATIVE_MANIFOLD_DISPLAYS.md).

---

## 1. Quick Start (`Hello, Manifold!`)

In a classic global-mode `p5.js` sketch ([`../demos/p5-hello/sketch.js`](../demos/p5-hello/sketch.js)):

```js
let display, circlePicture, circlePlace;

function setup() {
  // 1. Standard p5 WEBGL viewport (the camera window on your computer screen)
  createCanvas(720, 500, WEBGL);
  camera(3, -2.3, 3.5, 0, 0, 0, 0, 1, 0);
  perspective(PI / 3, width / height, 0.1, 100);

  // 2. Create the Manifold Display support (e.g. a 2×2×2 cube)
  display = createManifoldCanvas(cubeSurface());

  // 3. Place an anchor + heading on the surface via a 3D ray
  circlePlace = display.createPlacement({
    origin: [3, 0.05, 0.1],
    direction: [-1, 0, 0],
    heading: [0, 0, 1],
  });

  // 4. Draw standard p5 2D shapes into a local p5.Graphics stamp
  circlePicture = createGraphics(128, 128);
  circlePicture.noStroke();
  circlePicture.fill('gold');
  circlePicture.circle(64, 64, 100);
}

function draw() {
  background(15);
  ambientLight(110);
  directionalLight(200, 200, 200, -1, 1, -1);
  orbitControl();

  // 5. Move along a geodesic (automatically crosses edges & parallel-transports heading!)
  const dt = min(deltaTime, 50) / 1000;
  circlePlace.advance(0.6 * dt);

  // 6. Render the manifold support and imprint the p5.Graphics stamp at circlePlace
  display.draw();
  display.imprint(circlePicture, { placement: circlePlace, width: 0.44 });
}
```

---

## 2. How `p5-manifold` Works: Simulated Screen Previews vs. Native Manifold Hardware

When you run `p5-manifold` in a web browser, you are viewing a **simulated manifold display** inside a 3D perspective viewport on your flat computer monitor.

To make `p5.js` both **easy for creative coders** and **geometrically faithful to the manifold**, `p5-manifold` separates **intrinsic surface coordinates** from **how primitives are rendered on your screen**:

### The Core Coordinate Rule
Every position on the manifold is stored as an **intrinsic chart coordinate**:
```js
{ faceId, x, y }
```
where `faceId` identifies the polygon chart (triangle or face) and `(x, y)` are local 2D coordinates inside that chart's flat plane. Every direction is a 2D tangent vector `[hx, hy]` in that chart. When a placement or curve crosses an edge into a neighboring chart, the library multiplies by the edge's rigid transition matrix `p' = M * p + t` (`v' = M * v`).

### The Three Rendering Paths on a Computer Screen

Because a browser sketch renders to a flat monitor rather than physical LEDs, `p5-manifold` provides three distinct ways to turn intrinsic surface primitives into screen pixels:

| Path | `p5-manifold` API | Uses Textures? | How It Works Under the Hood | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **Path 1: Direct 3D Vector Lines (`to3D`)** | `display.path(contour, opts)`<br>`display.contours(contours, opts)` | **No** | Traces or projects 2D vector curves across chart seams into per-face `{faceId, x, y}` segments, lifts each segment's endpoints to 3D `(X, Y, Z)` via `surface.to3D()`, and draws 3D `LINES` over the depth-biased mesh. | Long wrapping strokes, turtle/exp/Fermi curves, SVG outlines, `font.textToPaths()`, L-systems, particle trails. |
| **Path 2: Local `p5.Graphics` Texture Stamp** | `display.imprint(graphics, { placement, width, mode })` | **Yes** (`p.texture`) | Because `createGraphics(resX, resY)` rasterizes `triangle()`, `circle()`, `rect()`, or `text()` into a flat 2D pixel buffer, `imprint()` unfolds (`mode: 'unfold'`) or projects (`mode: 'projection'`) the mesh triangles around `placement`, clips them to a `width × height` box (in surface units!), assigns `(u, v) ∈ [0,1]²`, and draws textured 3D triangles. | Reusing any 2D `p5.Graphics` drawing, filled shapes, raster text, or 2D shaders as a moving sprite/decal folding across seams. |
| **Path 3: Discrete Cell / Face Framebuffer** | `display.setFaceColors(rgba)` *(planned for `p5-life` & `p5-sequencer`)* | **Per-cell buffer** | Stores an RGBA color per surface cell (quad or triangle) and renders vertex-colored mesh faces. | Cellular automata (Game of Life on a torus/bunny), musical sequencers, curvature heatmaps ($K, H, \delta_v$). |

> **Important Distinction (`resX × resY` vs. `width`):**
> In `picture = createGraphics(128, 128)` followed by `display.imprint(picture, { placement, width: 0.44 })`:
> - `128, 128` is only the **pixel resolution (sharpness/DPI)** of the offscreen bitmap.
> - `width: 0.44` is the **physical width on the manifold** in surface units (e.g., $0.44$ units on a cube of side length $2.0$).
> - In `mode: 'unfold'` (default), neighboring triangles are unfolded isometrically into a flat plane around `placement`: the sticker folds across cube creases with **zero metric distortion**, and throws an error only if it tries to cover a cone singularity (like a $270^\circ$ cube corner).
> - In `mode: 'projection'`, the sticker is projected orthogonally from the anchor's tangent plane onto curved surfaces (like a torus) where every vertex has nonzero curvature.

---

## 3. Current API Reference (`p5-manifold/index.js`)

### Registration
- **`p5.registerAddon(manifoldAddon)`**  
  Registers `p5-manifold` with `p5.js` (requires pinned **p5 `2.3.4`**). In HTML sketches, loading `../shared/p5Start.js` registers the addon automatically before global `setup()` runs.

### Surface Helpers on `p5`
- **`cubeSurface(size = 2)`** — Returns an embedded `Surface` for a cube of side length `size`.
- **`torusSurface(major = 1.4, minor = 0.5)`** — Returns an embedded `Surface` for a $64 \times 32$ torus.
- **`svgContours(svgPathString, { width = 1 })`** — Parses an SVG path string (or serialized `font.textToPaths()` commands), flattens cubic/quadratic Beziers, flips SVG's downward $y$-axis, centers the bounding box, and scales it to `width` surface units.

### `display = createManifoldCanvas(surface, options?)`
Creates a manifold canvas bound to the current `p5` WEBGL sketch (automatically disposed if `sketch.remove()` is called).

- **`display.draw({ faces = true, edges = true })`**  
  Draws the manifold support mesh (with hardware polygon-offset depth bias so on-surface strokes and textures never z-fight), feature edges (coplanar diagonals suppressed), and any retained `display.path()` strokes.
- **`placement = display.createPlacement({ origin, direction, heading, scale = 1 })`**  
  Casts a 3D ray from `origin` along `direction` onto `surface` to establish an anchor `{faceId, x, y}`, and projects the 3D vector `heading` onto that chart's tangent plane.
- **`placement.advance(distance)`**  
  Moves the placement anchor along a straightest geodesic by signed arc length `distance` (in surface units), parallel-transporting its tangent heading across seams (and updating handedness across orientation-reversing seams).
- **`display.imprint(p5GraphicsOrImage, { placement, width, height, mode = 'unfold', depth })`**  
  Clips and textures a `p5.Graphics` or `p5.Image` patch centered at `placement` with surface dimensions `width × height`.
- **`display.contours(contours, { placement, width, height, depth, stroke = '#7be0ff', strokeWidth = 0.015 })`**  
  Clips 2D vector contours against the local patch at `placement` so every segment lies strictly on a surface triangle, and renders them with `stroke` and `strokeWidth` (in surface units).
- **`display.path(contour, { stroke = '#ffd27b', width = 0.025, replace = false })`**  
  Traces a 2D contour from `display.frame` using intrinsic turtle dead-reckoning (`traceTurtle`), retaining all seam crossings.

---

## 4. Suite of `p5.js` Demos & Roadmap

All `p5.js` demos live under `demos/` and run from a static server (`python3 -m http.server 8001` from the repo root):

1. **[`demos/p5-hello/`](../demos/p5-hello/) — Hello World on a Cube (Implemented)**  
   Classic 40-line `setup()` / `draw()` sketch: a red triangle, gold circle, and blue rectangle drawn with `createGraphics` moving independently across the seams of a cube in perspective.
2. **[`demos/p5-gallery/`](../demos/p5-gallery/) — Cube Circle, Torus Text, and Torus SVG/Font Outlines (Implemented)**  
   - `circle.html` (`circle.js`): Unfolded `p5.Graphics` circle crossing cube creases.
   - `text.html` (`text.js`): Native `p5.Graphics` typography (`picture.text('hello!')`) moving around a torus via local tangent-plane projection.
   - `svg.html` (`svg.js`): `p5.Font.textToPaths('hi')` + a cubic-Bezier SVG heart moving on a torus as clipped vector contours.
3. **[`demos/p5-pilot/`](../demos/p5-pilot/) — Dual Instance-Mode Turtle Stroke & Folded Rectangle (Implemented)**  
   Two side-by-side instance-mode sketches demonstrating multi-face turtle wrapping, state isolation, and interactive length/color controls.
4. **`demos/p5-life/` — Game of Life on Manifolds & Stanford Bunny (Planned Phase 3.2)**  
   Quad-grid Life (torus, Möbius, Klein bottle, cube) and triangle-cell Life on the 3,674-triangle Stanford bunny in `p5.js`, with `display.pick(mouseX, mouseY)` cell toggling.
5. **`demos/p5-imprint/` — Full Imprint Studio in `p5.js` (Planned Phase 3.3)**  
   Complete port of Demo D2: side-by-side comparison of `turtle`, `exp`, `fermi`, and `projection` modes, L-system fractals, closure-gap visualization, and interactive placement nudging on any preset or uploaded `.obj`/`.stl` mesh.
6. **`demos/p5-particles/` — Geodesic Particles & Surface Physics in `p5.js` (Planned Phase 3.4)**  
   Complete port of Demo D1: inertial geodesics, surface repulsion, simulated annealing, seam-preserving trails, geodesic neighbor links, and Gaussian/mean curvature coloring.
7. **`demos/p5-blobchain-clock/` — Spring-Chain Lettering / Blobchain Clock on Manifolds (Planned Phase 3.5 / Milestone M8)**  
   Combines `manifold-ink` text contour imprinting with `manifold-physics` particle-spring chains: live clock digits (`HH:MM:SS`) or custom text imprinted on the surface as closed elastic particle loops that relax and morph across seams when digits change.
8. **`demos/p5-sequencer/` — Geodesic Topological Sequencer in `p5.js` (Planned Phase 3.6)**  
   Musical read-heads moving along geodesics on a cube, torus, twisted tube, or Möbius strip, triggering WebAudio notes when crossing armed surface cells and accenting on cone-point vertices.
