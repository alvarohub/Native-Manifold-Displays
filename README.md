# Native Manifold Displays

A display that lives **on** a manifold — not a flat framebuffer texture-mapped
onto a surface, but a device whose pixel addressing, motion, and physics are
intrinsic to the surface itself: charts, transition maps across chart edges,
curvature concentrated at vertices, and an emitter layout decoupled from the
geometry.

This repo holds the reusable library and the math lab. The sister project —
the Cube Carillon topological sequencer (web instrument + physical LED cube
firmware that _consume_ this library) — lives at
[alvarohub/CubicCarillon_topologicalSequencer](https://github.com/alvarohub/CubicCarillon_topologicalSequencer).

## Purpose: a non-flat canvas for creative coding

Think of a **2D graphics interface whose canvas is a surface**, not necessarily
a rectangular screen. Object skins, deformable supports and spatially
distributed display panels motivate the work; a cube instrument is one example.
Imported/user-created geometry or explicitly glued charts define the logical
support; viewport dimensions define only a preview. Known panel poses support
calibration but do not choose topology: boundary correspondences and policies
for physical gaps must be specified explicitly.

The aim is to **adapt existing tools**, not rewrite p5.js, a graphics rasterizer,
a physics engine or geometry-central. A small p5.js addon pilot is implemented;
incremental demo migration is planned, with SVG/font-tool adapters and a bounded Arduino/C++ + Adafruit_GFX
subset as future targets. AR/VR, projectors and hardware should consume the
same surface state through separate output adapters. Dynamic surfaces
(including water simulations) require explicit update/state-transfer semantics;
they are not already supported by the static-mesh implementation.
See [the motivation and adapter strategy](docs/LIBRARY_PLAN.md#21-motivation-the-canvas-is-the-support-not-a-rectangular-viewport).

## Contents

- `manifold-core/` — the geometry library (pure JS ES module, no DOM): mesh
  loaders (OBJ/STL) and primitives, `Surface.fromMesh` (charts + transition
  maps in O(F)), geodesic tracing with cone-point continuation, holonomy,
  geodesic disks / `logMap` / `distance`, curvature estimators, fields.
- `manifold-physics/` — particles confined to the surface: integrator,
  geodesic pair forces, springs, projected fields, annealing temperature,
  neighbour graphs by surface distance.
- `manifold-ink/` — 2D curves (SVG, fonts) imprinted on the surface: turtle /
  exponential-map / Fermi / projection modes, the `{anchor, heading, scale}`
  placement frame, closure gaps, Darboux lift (κ_g, κₙ, τ_g) for robots.
- `manifold-canvas/` — experimental renderer-independent retained strokes:
  explicit placement frames and seam-preserving turtle traces.
- `p5-manifold/` — experimental p5 2.3.4 addon, registered explicitly with
  `p5.registerAddon(manifoldAddon)`. No p5 dependency enters the pure libraries.
  See the dedicated [`p5-manifold/README.md`](p5-manifold/README.md) manual.
- `paper/` — [`paper/NATIVE_MANIFOLD_DISPLAYS.md`](paper/NATIVE_MANIFOLD_DISPLAYS.md),
  the SIGGRAPH-style technical monograph covering the intrinsic atlas, the
  FBO-free Native Manifold GPU pipeline (geodesic bounding strips, Fermi
  coordinate fragment shaders, Manifold SDFs, and the Curved Retina), 2D
  imprinting, intrinsic physics, hardware fast paths, and simulated 3D screen
  previews.
- `demos/p5-pilot/` — two independent p5 WEBGL sketches: a stroke wrapping
  around a cube and a folded rectangle. Serve the repo as below and open
  `http://localhost:8001/demos/p5-pilot/`.
- `demos/p5-hello/` — a classic global-mode `setup` / `draw` sketch: coloured
  p5 shapes moving across cube seams as transparent local image patches.
- `demos/p5-gallery/` — independent perspective sketches: circle on cube,
  native p5 text on torus, generated SVG heart and p5 font outlines on torus.
  Each example links directly to its short sketch source.
- `demos/particles/` — **Demo D1**: particles on any mesh (drop an .obj/.stl),
  forces along the surface, annealing, trails, connections, colour by what
  each particle reads; "forces off" + shift-click = a free particle tracing a geodesic.
- `demos/imprint/` — **Demo D2**: text / SVG / L-system fractals drawn on any mesh in the four
  imprint modes, movable frame, closure gaps, Darboux/OBJ export.
- `demos/life/` — Life-like cellular automata on preset quad grids (cylinder,
  torus, Möbius band, Klein bottle, cube and flat square), or one cell per
  triangle on other presets and imported OBJ/STL surfaces. Neighbours are
  derived from mesh connectivity (`cellAdjacency`).
  Run `python3 -m http.server 8001` from the repo root and open
  `http://localhost:8001/demos/particles/`, `.../demos/imprint/` or `.../demos/life/`.
- All three demos use the surface catalog in `demos/shared/meshes.js`,
  including **Stanford bunny (3,674 triangles)**. Its local
  [OBJ file](demos/assets/bunny.obj) can also be selected with **Load mesh**
  or dropped onto any demo to test import. The bunny has fixed resolution;
  detail/row/column controls do not resample it. Life switches grid-only seeds
  to **random 30%** for triangle layouts; click cells to edit, or choose empty.
  Start with vertex neighbours and B3/S23 to see activity; edge neighbours
  give three neighbours per closed triangle and very different dynamics.
  Neither mode promises classic Conway gliders. Updates run on the CPU;
  rendering uses WebGL. See [asset provenance](docs/REFERENCES.md#sample-mesh-stanford-bunny).
- Projects that will build on this library (each in its own repo): `docs/PROJECTS_USING_THE_LIBRARY.md`.
- `tests/` — `node tests/run.mjs` (Node selftests + the lab selftest).
- `firmware-lib/` — the hardware display layer (`cube_display`): virtual
  layered displays, LED/emitter mapping, and cube topology with precomputed
  integer edge gluings. PlatformIO library format, firmware-portable (no heap,
  fixed tables).
- `experiments/geodesic-surfaces/` — the atlas lab: a standalone web playground
  for heads moving on arbitrary charted surfaces (flat torus, square tubes
  with end twists, Möbius strip, icosahedral sphere). Run from the repo root:
  `python3 -m http.server 8001` then open
  `http://localhost:8001/experiments/geodesic-surfaces/`.
- `IDEAS.md` — the running ideas notebook (scoreLight lineage, defect
  lattices, turtle robots, spring text…). Append as ideas appear.
- `docs/` — theory and design notes:
  - `IMPLEMENTATION_SCHEDULE.md` — **schedule of record**: demo-first
    milestones (M0–M9) for the three libraries (`manifold-core`,
    `manifold-physics`, `manifold-ink`) and the two demos (particles on a
    surface; text/curves imprinted on a surface).
  - `LIBRARY_PLAN.md` — the architecture and rationale: language choice (JS
    core first, C++ port on demand), purity rules, geometry-central-inspired
    API, and the pluggable-physics strategy.
  - `DRAWING_ON_SURFACES.md` — what an imprint of a 2D drawing on a curved
    surface can and cannot preserve (Theorema Egregium, Darboux frame,
    turtle / exp-map / Fermi / projection / relaxation modes, the four
    obstructions, the `{anchor, heading, scale}` frame).
  - `REFERENCES.md` — curated bibliography + software we learned from +
    Alvaro's related projects; the source for the future project page.
  - `DISCRETE_TO_SMOOTH.md` — the dictionary between polyhedral quantities
    (deficits, dihedrals, holonomy, unfoldings) and the smooth differential
    geometry they are exact analogues or estimators of, with convergence
    classes; the standing rule that no mesh formula lives without its smooth
    counterpart.
  - `GEODESIC_MOTION.md` — how a head moves on the surface: atlas method,
    transition maps computed from the 3D embedding, the embedding/rendering
    layer.
  - `MANIFOLD_DISPLAY_IDEA.md` — the core design document: why this is not a
    texture, pixel addressing without a global flat map, only-local frames,
    agents on surfaces, references (Polthier–Schmies, geometry-central), and
    future directions (texture extraction, intrinsic physics, back-reacting
    geometry).
  - `RENDERER_CLASS_MAP.md` — firmware class structure.

## The idea in one paragraph

Every face of the display is a flat 2D chart with its own coordinates. A
moving head carries only `{faceId, x, y, vx, vy}` — never a 3D position. At an
edge, a precomputed transition map `p' = M·p + t`, `v' = M·v` re-expresses
the state in the neighbour chart, which is exactly geodesic continuation
(straightest geodesics, Polthier–Schmies). The same maps drive drawing,
pixel addressing, and the physical LED chain — so a trajectory, a brush
stroke, or a lit cell all cross seams the same way the math says they should.

## p5.js addon pilot

The examples use **p5 2.3.4**, pinned in the pilot import map and shared sketch
bootstrap; other versions are rejected
explicitly for now. It is a local ES-module addon, not yet an npm package or a
published p5 contributed library. It loads no three.js. Both p5 global mode
and instance mode are supported and browser-tested; the demo uses two separate
instance-mode sketches. It is preserved as the original regression demo.
For the simplest entry point, open **`http://localhost:8001/demos/p5-hello/`**
and read [its classic setup/draw script](demos/p5-hello/sketch.js). The
[gallery](demos/p5-gallery/index.html) has separate cube/torus examples.
All new sketches use perspective; the original pilot is unchanged.

```js
import p5 from 'https://cdn.jsdelivr.net/npm/p5@2.3.4/lib/p5.esm.js';
import { manifoldAddon } from './p5-manifold/index.js';
import { Surface, cubeMesh } from './manifold-core/index.js';
import { frameFromPoint, rectContour } from './manifold-ink/index.js';

p5.registerAddon(manifoldAddon); // Before constructing sketches.
new p5(p => {
  let canvas;
  p.setup = () => {
    p.createCanvas(400, 400, p.WEBGL); // Rectangular preview, not the logical support.
    p.camera(0, 0, 7, 0, 0, 0, 0, 1, 0);
    p.perspective(p.PI / 3, 1, 0.1, 100);
    const surface = Surface.fromMesh(cubeMesh(2, 1));
    const anchor = surface.raycast([3, 0.13, 0.07], [-1, 0, 0]);
    const frame = frameFromPoint(surface, anchor, [0, 0, 1], 1);
    canvas = p.createManifoldCanvas(surface, { frame });
    canvas.path(rectContour(2.8, 0.65), { stroke: '#7be0ff', width: 0.035 });
  };
  p.draw = () => {
    p.background('#0a0d12');
    p.orbitControl();
    p.rotateX(-0.35);
    p.rotateY(-0.55);
    canvas.draw();
  };
});
```

`createManifoldCanvas` requires an existing WEBGL viewport and an embedded
`Surface`. It does not replace `createCanvas`, redirect p5's global `line` /
`circle` / `text` calls, or invent a global surface coordinate system.

**Placement and drawing contract**

- `frame = {anchor, heading, scale, hand}` is mandatory in the pure retained
  stroke model. The p5 factory also permits omission, choosing the first face's
  centroid and local x heading; this does not choose the placement of image
  patches, which require their own explicit placement. The anchor is a chart
  point `{faceId,x,y}` inside its triangle. `heading` is a nonzero 2-vector in
  that chart, normalized on input. `scale > 0` converts drawing units to surface
  length. `hand` is +1 by default, or -1 for reflected drawing orientation.
- `canvas.path({points:[[x,y],...],closed:false}, options)` places each contour
  independently from the current frame. First, a **pen-up** straightest trace
  reaches its first point. Subsequent lengths and planar turns are developed
  across triangles by the existing turtle implementation. `closed:true` adds
  a final return attempt, not an artificial segment joining endpoints in 3D;
  curvature can leave a closure gap. This is not endpoint shortest-path solving.
- Options are `stroke` (six-digit hex), `width` (positive **surface units**,
  native p5 WEBGL width under this adapter) and `replace` (default false).
  Width therefore changes in screen size with the preview projection; it is
  not the CSS-pixel width of the existing three.js adapter. `replace:true`
  atomically replaces the drawing only after successful computation.
- `path` returns an independent record of per-face 3D `segments`, `crossings`,
  traced `length`, chart `start`/`end`, original contour and placement.
  Every retained line segment stays in one triangle and seam endpoints coincide.
  `canvas.paths` and `canvas.frame` are snapshots, not mutable internal state.
- `setFrame(frame)` affects future paths, not already retained strokes.
  `clear()` affects only that canvas. Neither changes another canvas, even
  when two canvases share a sketch or immutable support.
- `draw({faces:true,edges:true})` previews the opaque support, feature edges
  and strokes using native p5. Caller camera/model transforms are respected;
  p5 styles and GL polygon-offset state are restored afterward. Native depth
  testing hides rear strokes. Depth bias affects only support rendering, not
  the stored surface geometry or stroke coordinates.
- `dispose()` releases retained data; subsequent drawing/editing throws.
  The p5 `remove` lifecycle hook automatically disposes every canvas belonging
  to that sketch, without disposing canvases in another sketch.

**Retained-stroke limits:** static triangle meshes and opaque contour strokes.
A trace encountering any boundary, cone vertex or step-limit stall throws
before a new drawing is retained; there is no fallback or silent clipping.
This avoids relying on the unresolved cone-transport convention/implementation.
The new local image-patch and projected-contour adapters below are separate
from the retained turtle API. There is still no generic vector fill tessellation,
p5 text interception, full SVG-document adapter, picking, transparent-support
compositor or shared-surface panel migration. Drawing an already extracted contour does not require
reimplementing the font/SVG tool that created it. The immediate p5 renderer is
for this small pilot, not a high-resolution mesh performance claim.

Pure geometry/state tests: `node tests/run.mjs manifold-canvas`. From the pilot
browser console, run
`await (await import('/tests/p5-pilot.browser.js')).runP5PilotTests()`.
This exercises real p5 global/instance modes, same-sketch and cross-sketch state
independence, cleanup, style/GL restoration, front-stroke pixels and opaque
rear-stroke occlusion.

### Classic p5 sketches: graphics buffers and moving placements

Before reading the examples, note that our demos use **two different rendering
mechanisms** depending on whether the input is **vector geometry** or an
**already-rasterized 2D pixel buffer** (and both differ from a persistent
Manifold Framebuffer; see the full architectural breakdown in
[`docs/MANIFOLD_DISPLAY_IDEA.md`](docs/MANIFOLD_DISPLAY_IDEA.md#architecture-of-a-native-manifold-rendering-pipeline--framebuffer)):

| Method & API | Input | Uses Textures? | How it works & why |
| :--- | :--- | :--- | :--- |
| **1. Vector point-tracing**<br>`manifold-ink` `imprint(...)`,<br>`canvas.path(...)`,<br>`display.contours(...)` | Polylines, SVG paths, font outlines (`opentype.js` / `font.textToPaths`), L-systems | **No** | Traces or projects 2D points directly into chart coordinates `{faceId, x, y}` across seams. For the web preview, lifts points via `surface.to3D(p)` and draws 3D lines on the monitor; on physical hardware, those `{faceId, x, y}` segments rasterize directly into chart cells. |
| **2. Local artwork texture patch**<br>`display.imprint(p5.Graphics, ...)` | Standard 2D `p5.Graphics` (`triangle`, `circle`, `rect`, raster `text`) | **Yes** (`p.texture`) | Because `p5.Graphics` immediately rasterizes shapes into a flat 2D bitmap, the adapter unfolds (`surface.develop`) or projects nearby surface triangles around the moving `placement`, clips them to the image rectangle, and assigns `(u, v)` coordinates. |
| **3. Persistent Manifold Framebuffer**<br>*(firmware `VirtualDisplay`, Life, future GPU target)* | Any of the above, plus 3D-to-manifold ("Curved Retina") projection | **Per-chart / per-emitter buffers** | Stores persistent pixels directly on the atlas charts `(chartId, i, j)` or emitter cells so the surface owns its framebuffer (`getPixel`, layer compositing, seam-aware filters, physical LED readout). |

The hello-world script is ordinary global-mode p5, without imports, DOM
controls or nested sketch factories. Its HTML loads `sketch.js` and the shared
`demos/shared/p5Start.js` loader / `p5Sketch.js` bootstrap, which register the
addon before p5 starts and display dependency-loading and runtime errors.
`cubeSurface()` and `torusSurface()` are small
convenience factories for ordinary embedded `Surface` instances, not a second
geometry implementation.

```js
let display, picture, placement;

function setup() {
  createCanvas(700, 500, WEBGL);
  camera(3, -2, 4, 0, 0, 0, 0, 1, 0);
  perspective(PI / 3, width / height, 0.1, 100);
  display = createManifoldCanvas(cubeSurface());
  placement = display.createPlacement({
    origin: [3, 0.13, 0.1], direction: [-1, 0, 0], heading: [0, 0, 1],
  });
  picture = createGraphics(128, 128);
  picture.noStroke();
  picture.fill('gold');
  picture.circle(64, 64, 100);
}

function draw() {
  background(15);
  orbitControl();
  placement.advance(0.0006 * min(deltaTime, 50));
  display.draw();
  display.imprint(picture, { placement, width: 0.6 });
}
```

The graphics buffer is **local artwork**, not a global framebuffer for the
surface. p5 supplies shapes, text, fills and alpha. Our adapter supplies placement,
surface clipping and motion. The same placement/patch geometry can be used by a
different renderer without a p5 buffer. No p5 or DOM code enters `manifold-canvas`.

- `createPlacement({origin,direction,heading,scale=1})` raycasts to choose an
  anchor. `heading` is a world-space vector projected into its tangent chart;
  a missed ray or zero tangent component throws.
- `placement.advance(distance)` moves by signed **surface length**, transporting
  the heading through ordinary seams with the core transition matrix. It is
  straightest inertial motion, not a prescribed torus latitude or a global
  shortest path. Boundary, cone and stall events throw without committing a
  new placement. `placement.frame` is a snapshot. Placements are independent
  even when they share a support.
- `display.imprint(image,{placement,width,height,mode,depth})` draws immediately.
  `image` can be a `p5.Graphics` buffer; subsequent buffer edits appear in the
  next draw. `width` and `height` are **surface-unit patch dimensions**, not
  pixels and not multiplied by `frame.scale`. Height defaults to the image
  aspect ratio. The image centre maps to the anchor, right follows the heading,
  and image up follows the handed perpendicular.
- **`mode:'unfold'` (default):** use existing face unfoldings and clip their
  triangles against the image rectangle. The accepted patch must be a single,
  consistent local sheet, with no nonzero-deficit vertex in its interior.
  This folds isometrically across cube creases away from corners; it is not
  a global UV atlas, a general curved-surface flattening or a shortest-path map.
  A torus patch generally needs projection instead.
- **`mode:'projection'`:** orthogonally project a local tangent-plane rectangle
  onto nearby, consistently facing source triangles. `depth` is the maximum
  absolute normal offset from that plane (default half the width). Width,
  height and depth must select a complete single local sheet. The result is
  extrinsic and metrically distorted on curved supports. It can span curvature
  vertices because it does not claim to flatten their intrinsic geometry.
- Both modes output actual source-face pieces, not approximate chords between
  a sampled image grid. UV coverage, face connectivity and positive-area UV
  overlaps are checked; incomplete/overlapping patches throw rather than
  silently clipping the image. Keep these patches small. The current CPU
  overlap checks and immediate-mode preview are for small examples, not dense
  meshes or arbitrarily large artwork.
- Transparent graphics pixels preserve the opaque support. Patch drawing
  restores p5 styles and the depth-write mask; caller-owned graphics buffers
  are not disposed by the addon. There is no transparent-support compositing
  or guaranteed ordering for overlapping semitransparent artwork layers.

### SVG generators and font outlines

The [SVG sketch](demos/p5-gallery/svg.js) uses **p5's `loadFont` and
`font.textToPaths`** for glyph extraction, not a new font engine. It serializes
the path commands into SVG path data; `svgContours(pathData,{width})` reuses
the existing parser/curve flattening, centres the result, flips SVG's downward
y axis and scales it to the requested surface-unit width. It also accepts
generated path data, demonstrated by a cubic-Bezier heart.

`display.contours(contours,{placement,width,height,depth,stroke,strokeWidth})`
projects these curves through the same bounded local patch used for images.
Segments are clipped into actual source-face triangles, including every seam
intersection; `strokeWidth` is in surface units. There is no vector filling,
SVG styling/transform interpretation or arbitrary full-document SVG import.
The font outline demo loads Archivo Black remotely from Google Fonts; loading
failures are visible. Native raster `picture.text(...)` in the companion torus
sketch requires no downloaded font.

The core ink library also has exponential-map and Fermi contour mappings.
They are **not yet exposed as raster-patch modes**: adding them needs an
explicit coverage/cut policy, not just joining mapped sample points.

Validation: `node tests/run.mjs surface-patch` and
`node tests/run.mjs manifold-canvas`. In the hello-world page console:
`await (await import('/tests/p5-patches.browser.js')).runP5PatchTests()`.
It checks real p5 graphics alpha, live texture updates, rear occlusion,
depth-state restoration, SVG flattening and sketch cleanup.

## Distances, connection paths and appearance

These are distinct operations:

- **Exact endpoint paths (`shortestPath`)** are deferred. The exported function
  and `Surface.shortestPath()` deliberately throw `ERR_NOT_IMPLEMENTED`; they
  do not return an approximate substitute. An existing backend should be
  assessed before undertaking a JS solver rewrite.
- **Motion (`trace`)** follows a straightest polyhedral geodesic from a point
  and heading. It does not solve a shortest path to another point.
- **Distances/forces (`develop`, `logMap`, `distance`)** currently use an
  approximate unfolding: nearby triangles are laid into a chart plane and
  each face keeps one copy. Pair forces use that plane's separation vector;
  spring forces use `logMap`. This is useful locally but is **not an exact
  global shortest-path metric**. Strong curvature, cut loci and competing
  unfoldings can make it inaccurate, asymmetric or inconsistent with a
  traced endpoint. Fixing a visual connection does not fix this force approximation.
- **Connections (`surfaceConnection`)** first try endpoint-checked shooting.
  `geodesicBetween` reports `converged`, final `miss` and `endpointError`;
  even converged shooting is not a guarantee of the globally shortest branch.
  Failed shooting falls back to a Dijkstra route along mesh edges, attached
  to the actual endpoints inside their triangles. This route stays on the
  surface and is an upper bound on intrinsic distance, not a smooth geodesic.
  The particles readout reports shooting/fallback/unreachable counts.
  **This automatic fallback is a known unresolved defect, not the intended
  geodesic solution.** The proposed replacement is one shortest-path solver
  shared by distance queries, forces and drawing, while keeping straightest
  tracing for motion. See [GEODESIC_MOTION.md, Part III](docs/GEODESIC_MOTION.md#part-iii--straightest-motion-versus-shortest-connections)
  for cone semantics, the current transport defect and the deferred MMP
  candidate (no geometry-central dependency; not yet implemented).
  Particle trails retain intermediate triangle-edge crossings instead of
  connecting only timestep endpoints with chords that can sink into the mesh;
  trail length is the maximum number of stored 3D points, including crossings.

All three demos offer the five Platonic solids: tetrahedron, cube, octahedron,
dodecahedron and icosahedron (separate from the rounded icosphere). Square and
pentagonal faces are triangulated without changing the polyhedral surface;
Life uses individual triangles on the new presets, retaining its existing
cube quad layout. New fixed-resolution solids disable the detail slider.

All three demos share a compact **swatch button / popover editor** for
colour, opacity (RGBA) and optional line width, beside the related controls
instead of a separate appearance list. Click outside, press Escape, or use
Close to dismiss the editor. The shared implementation is in
`demos/shared/appearance.js`. Rendering uses screen-space wide lines from three.js
`LineSegments2`/`LineMaterial` and translucent-surface compositing in
`demos/shared/surfaceRenderer.js`. Connection opacity defaults to 1 and can
be changed independently for chords and surface paths. Existing trail and
mesh-edge opacity defaults remain selectable. Imprint's line-opacity slider
is a master multiplier over its individual line styles.

### Shared manifold-surface view

Each demo has the same **Manifold surface** panel: **Faces / Edges / Vertices**,
with independent visibility checkboxes and swatch buttons. Life's **cell
borders** remain a separate overlay: a quad cell's boundary is not the same
thing as every edge of its triangulated mesh.

- **Feature edges** suppress coplanar diagonals. The feature angle is the
  unsigned bending angle between locally consistently oriented face normals:
  0° for coplanar triangles, 90° at a cube crease. It is not a smooth-shading
  setting. Angles at/below the threshold are hidden; an optional fade interval
  increases opacity smoothly above it. Boundaries and nonmanifold junctions
  remain visible because they have no unique two-face bending angle. Edge
  colours can also encode the bending angle on a fixed 0–180° scale.
- **Vertices** means all mesh vertices, not just cone singularities. Their
  colour can show interior deficit `delta = 2*pi - sum(corner angles)` in
  radians, or Gaussian curvature `K = delta / barycentric vertex area` in
  inverse squared surface units. Neither is the extrinsic edge-bending angle.
- **Faces** share fixed colour, K, signed mean curvature H, deficit and a
  procedural stripe scalar field (not an image texture). These are unsmoothed
  vertex values, interpolated on triangles; the former particle-only smoothed
  curvature view has been replaced by the same raw quantities in every demo.
  H needs consistently oriented normals; it is undefined for the whole view
  on nonorientable/inconsistently wound meshes. Boundary K/deficit and other
  undefined values are grey, not invented zeros. H has inverse-length units.
- Scalar maps share automatic 2–98 percentile ranges or explicit bounds;
  the diverging map's automatic range is symmetric about zero. Legends sample
  the actual rendering colour map. Life offers **Life cell states** separately:
  the simulation keeps updating its own RGBA buffer while diagnostics are shown.
  Switching back restores the latest state, including cell opacity.

The separation is explicit:
`surfaceEdges(surface)` in `manifold-core` supplies pure geometry (angles in
radians); `demos/shared/surfaceStyle.js` validates renderer-independent
settings; `demos/shared/surfaceView.js` implements the three.js output adapter
without DOM access; `demos/shared/surfacePanel.js` supplies the optional GUI.
Demo-specific physics, imprint and Life controls remain in their demos.

```js
import { SurfaceView } from './demos/shared/surfaceView.js';

const view = new SurfaceView(scene, renderer);
view.setSurface(surface); // An embedded Surface, e.g. Surface.fromMesh(mesh).
view.setOptions({
  faces: { source: 'K', map: 'diverging', range: [-2, 2] },
  edges: { visible: true, mode: 'feature', angle: 1, fade: 15 },
  vertices: { visible: false },
});
// Render with renderSurfaceScene(renderer, scene, camera, [view.solid]).
// Call view.fitResolution() when the viewport size changes.
```

Settings angles/fades are in degrees, line widths in CSS pixels and vertex
radius in surface units. `view.settings` returns an independent snapshot;
`subscribe(callback)` returns an unsubscribe function. `legend('faces')` or
`legend('vertices')` reports range, sampled colours and missing-value count.
For custom demo colours, supply `{customLabel: 'My states'}` as the fourth
constructor argument and call `setFaceColors(rgba)`: finite, linear-RGB RGBA
per triangle corner in `surface.faces` order, alpha in [0,1]. The caller's
buffer is retained; after mutating it, call `setFaceColors` again.
Invalid settings throw. Call `dispose()` when finished. `setSurface` resets
geometry/scalar caches and custom colours while preserving settings; in-place
deformation does not automatically update caches (dynamic supports remain
future work). This adapter is not yet the proposed p5 manifold canvas.

Rear geometry is drawn behind the nearest surface layer, then front geometry
is drawn normally. Thus surface opacity attenuates rear lines without dimming
front lines; zero opacity reveals both, full opacity hides the rear.
This is **nearest-shell transparency**, not volumetric glass or full
order-independent compositing through multiple overlapping transparent shells.
The surface is depth-biased rather than shifting each path point along a
different face normal, avoiding seam gaps and depth fighting.

Rendering, materials, ray picking and OBJ/STL visualization use **three.js**;
the shared drag-ball camera control and intrinsic geometry routines are ours.
No new rendering dependency is needed for these fixes.

Validation: `node tests/run.mjs`. For GPU pixel regressions, open any served
demo and run `(await import('/tests/rendering.browser.js')).runRenderingTests()`
in its browser console. It checks front/rear intensity at five surface
opacities, render-state restoration, growing line buffers and shared controls.
Also run `await (await import('/tests/surface-view.browser.js')).runSurfaceViewTests()`
for feature filtering, nonorientable/boundary handling, independent visibility,
custom-colour retention, GUI/API synchronization and GPU per-edge alpha tests.
