# Native Manifold Displays — Library Plan

Status: **draft, living document** (started 2026-08-22). Adjust freely; this file
is the plan of record for _architecture and rationale_, the chat was only the
sketch. **Sequencing now lives in `IMPLEMENTATION_SCHEDULE.md`** (2026-10-17):
demo-first milestones, dense meshes as the primary surface class, hand-rolled
point-particle physics, demos in-repo under `demos/`. Where the two disagree
on _what to build next_, the schedule wins; §4 there lists the deviations.

Goal (clarified 2026-10-21): **a 2D graphics interface on a non-flat canvas**,
for creative coders and physical displays. Reuse existing drawing/typography
and physics tools; supply surface coordinates, seam continuation and output
mapping, not another general graphics engine or geometry-central clone.
Particles, imprint and Life are demonstrations; the musical cube is one
consumer, not the definition of the library. See §2.1–2.3.

---

## 1. Language decision: JavaScript core first, C++ port on demand

Decision (2026-08-22, revised same day after discussion): the library core is
**JavaScript** — a dependency-free ES module (no DOM, no three.js), extracted
from the Cube Carillon core and the geodesic lab. A **C++ port is deferred
until a real consumer demands it** (the openFrameworks addon, or firmware
unification), at which point the conformance vectors make the port
mechanical.

Rationale:

- **Shareability is the deciding feature.** A browser demo is "send a link
  to a friend". A WASM build of a C++ core is _also_ a webpage, but for a
  maintainer who works in JS daily and does not enjoy the browser build
  pipeline, an Emscripten toolchain is a foreign burden, not a convenience.
  Shareability belongs to the demo, and the cheapest shareable demo is the
  JS core itself.
- **The purity discipline is already proven.** The Carillon's `src/core` is
  pure JS (no DOM/three/audio) by construction; the same discipline makes
  this core portable to Node and, later, portable _in principle_ to C++.
- **The C++ port is deferred, not avoided.** It remains the answer for the
  oF addon and for firmware. The trigger is stated explicitly so the port
  happens when it earns its cost, not before.

What JS-first honestly costs:

- The oF addon and firmware need C++ eventually — the port is deferred, not
  eliminated, and conformance vectors (Phase 0) are what de-risk it.
- Two implementations exist only if/when the C++ port happens; until then
  there is exactly one.

**[Geometry-central](REFERENCES.md#geometry-central):** a reference and inspiration, not a dependency and not a
fork. Its API surface (see §3.1) is a reference for hardening the small geometry
subset we need. For advanced geometry in a future native host, a geometry-central
adapter can be added behind an interface — optional, CMake-gated, and only
in a C++ build.

**Geodesic decision (2026-10-21):** exact global endpoint paths are deferred,
not a prerequisite for the surface-canvas/adapter work. A correct solver
would serve both forces and visible connections; graph routes or straightest
tracing are not substitutes. The earlier candidate JS MMP proposal and tests remain in
[GEODESIC_MOTION.md, Part III](GEODESIC_MOTION.md#part-iii--straightest-motion-versus-shortest-connections).
Do not commit to rewriting it: assess an existing backend when needed.
`Surface.shortestPath()` is a deliberately throwing TODO, not a solver.
Existing local distance/force approximations remain explicitly approximate;
their limitations and the cone-transport defect are not excused by this deferral.

**The JS lab** (`experiments/geodesic-surfaces/`) is promoted from
playground to **executable spec and reference host**: its selftests define
correct behaviour, and it demos every surface class the library supports.

---

## 2. Architecture principles

- **The core has no renderer, DOM, p5.js or device dependency.** Intrinsic
  state uses charts; embedding data supports mesh import, extrinsic geometry,
  picking and output mapping. JS is not heap-free; bounded storage is a
  separate requirement of the future embedded subset.
- **Rendering, audio, UI are adapters** in the consuming projects.
- A moving agent's whole state is `{chart, x, y, vx, vy}` — never a 3D
  position (see `GEODESIC_MOTION.md`).

### 2.1 Motivation: the canvas is the support, not a rectangular viewport

Most conventional displays and graphics APIs assume a flat rectangle,
partly because of manufacturing and addressing constraints. The motivation
here is to prepare for displays on object skins, buildings, deformable
supports (including emerging flexible/e-ink technologies), and distributed
panels in installations. This is a design horizon, not a claim that arbitrary
stretchable full-surface displays are already generally available.

Alvaro's stated lineage includes **Khronos Projector** and work on deformable
display supports, **volume-slicing displays**, and the recent **AngleCAD**
paper, alongside the cube instrument. Record these as author-supplied
motivation; verify exact publication records/links before a public bibliography.
The common problem is that a rectangular framebuffer is not a sufficient
description of the support on which an image or interaction lives.

A logical canvas is a surface/atlas plus its metric, seams and drawing state.
Its 3D embedding and physical outputs are separate. A viewport of width and
height merely previews it; an AR/VR view, projector, LED assembly, or e-ink
device can consume the same logical content. Surface construction should
accept imported geometry, user-generated geometry and explicit chart
assemblies, not require an on-screen canvas.

Pieces may be noncoplanar, spatially separated, and tracked. Known poses let
us calibrate output and identify candidate adjacencies, but **do not determine
the topology**: the application must specify which boundaries are glued,
their correspondence, and how a physical gap is crossed (logical seam,
finite virtual connector, or no connection). Disconnected components remain
disconnected unless explicitly connected. Rigid chart transitions require
matching intrinsic edge lengths; arbitrary rescaling needs a different
metric/mapping contract. A known 3D pose alone does not solve that constraint.

For evolving supports (e.g. a water simulation), distinguish isometric
re-embedding, metric deformation, and remeshing. Each needs explicit geometry
revision/cache invalidation and state-attachment rules. Moving a drawing with
the material surface is not the same as inertial motion on a moving surface.
These capabilities are future work, not implied by today's static `Surface`.

### 2.2 Scope boundary: not a second geometry-central

[geometry-central](REFERENCES.md#geometry-central) targets general geometry
processing: mesh data structures, intrinsic algorithms, differential
operators and sparse numerical machinery. We necessarily overlap in a small
foundation (surface points, charts, tracing, transport, curvature), but the
product is different: accessible drawing and interaction on non-flat,
possibly distributed display supports, with adapters to creative tools and
physical output. This distinction does not make the overlapping geometry
novel, nor justify reimplementing a mature algorithm by default.

Keep the JS geometry subset small and tested. Treat advanced distances,
remeshing and general numerical solvers as capabilities a backend may supply,
not an expanding checklist for this library. GUI and backend types must not
leak into the surface-canvas contract. An embedded build may support a fixed
atlas with precomputed transitions without any dense-mesh solver.

### 2.3 Adapter strategy: reuse tools without pretending all mappings are trivial

The intended split is **surface geometry/continuation → drawing operations
on a surface → rendering/output adapters**, with physics consuming geometry
and a separate GUI consuming programmatic visualization settings. Names
such as `SurfaceCanvas` below describe the wider proposed interface.
The narrow `ManifoldCanvas` stroke/placement/patch model and `createManifoldCanvas` p5 addon
now exist as a pilot, not a complete graphics API. One instance owns its state;
no dependency on a single global sketch,
browser framebuffer or renderer.

The shared visualization split is now implemented in the three demos:
`manifold-core.surfaceEdges` provides pure geometry, shared `surfaceStyle`
validates settings independently of the renderer, `SurfaceView` is the
DOM-free three.js output adapter, and `surfacePanel` is the shared DOM GUI.
It preserves demo-owned colour buffers separately from scalar diagnostics.
This is a visualization interface, not yet a surface drawing canvas.
See [the API, units and limitations](../README.md#shared-manifold-surface-view).

- **p5.js is a priority creative-coding frontend.** Keep its normal
  `createCanvas(width,height,WEBGL)` for the preview. Add a separately named
  `createManifoldCanvas(surface, {frame})` (implemented pilot), taking a support rather
  than a pixel rectangle. Put drawing operations on that object, with an
  explicit placement frame and imprint rule. Do not override p5's
  `createCanvas` signature or silently redirect all global drawing calls.
  Both global and instance-mode sketches must work; multiple canvases must
  not share accidental mutable state.
- **Start with a p5 addon pilot**, using the existing pure JS libraries and
  documented [addon hooks](REFERENCES.md#p5-adapters). Keep the first supported
  p5 version explicit; compatibility across major versions needs tests.
  First show a shape/stroke crossing a seam and verify state independence.
  Then migrate the demos incrementally to a p5 WEBGL adapter if feature
  parity is demonstrated. The desired demos are p5 sketches; this is not
  authorization to rewrite all current demos now. Three.js remains the
  current tested adapter, not a dependency of the future p5 one.
  The first pilot is now implemented on p5 2.3.4: two independent sketches,
  explicit placement, opaque turtle strokes with retained seam crossings,
  global/instance-mode registration and automatic sketch cleanup. Its state
  model has no p5/DOM dependency. Real GPU tests check front/rear occlusion
  and style restoration. Vertex/boundary hits fail explicitly rather than
  concealing the unresolved cone-transport issue. See
  [the pilot contract and limitations](../README.md#p5js-addon-pilot).
  Follow-up classic `setup`/`draw` examples now reuse native `p5.Graphics`
  shapes/text on independently transported placements: small isometric
  unfolded patches on a cube and bounded tangent-plane projected patches on
  a torus. A companion sketch takes p5 font outlines and generated SVG path
  data through the existing ink parser. Patch geometry stays renderer-free,
  is clipped to actual source triangles and rejects missing/overlapping sheets.
  This is not full raster/SVG compatibility or migration of the larger demos.
- **Do not rebuild p5's rasterizer or typography.** Adapt paths/contours or
  local `p5.Graphics` buffers. These are complementary: semantic paths
  support intrinsic continuation and robot/vector output; local raster
  buffers reuse fills/images/fonts but need placement, clipping and seam
  handling. Texture-mapping one flat image onto a mesh alone does not make
  its coordinates or dynamics intrinsic. Arbitrary fills, winding/holes,
  stroke widths, transforms and multi-chart clipping make full compatibility
  substantially harder than an ES-module wrapper. `line` or `circle` on a
  curved surface needs a stated construction (turtle, exp-map, etc.); there
  is no universal distortion-free interpretation of every planar primitive.
- **SVG / Geomerative-like adapters** expose vector paths, typography,
  sampling and styles from existing tools, then feed the surface mapping.
  [Geomerative](REFERENCES.md#geomerative) itself is a Processing/Java
  library, not a drop-in p5.js dependency. The current SVG path-data parser
  is not a full SVG document renderer (transforms, fills, CSS, clipping and
  text are additional concerns). SVG output must distinguish a projected
  view from per-chart vector drawings plus seam metadata; one flat SVG
  cannot generally preserve a curved surface's metric globally.
- **Physics adapters** let engines such as Box2D provide integration/contact
  machinery where valid. The manifold layer supplies coordinate changes,
  valid local unfoldings and an explicitly selected interaction metric
  (surface approximation, future exact path, or ambient chord with specified
  tangential force conversion). Seam contacts/joints and finite rigid
  bodies still require the restrictions in §5; a distance callback alone
  cannot adapt the entire engine. A bounded adapter demo is required before
  publication; a general-purpose adapter is not promised for the first release.
- **Arduino/C++ + Adafruit_GFX** is a future small-output target. Reuse GFX
  primitives/fonts and display drivers through per-patch render targets or
  emitter routing; supply chart/seam geometry around them. Merely overriding
  `drawPixel` does not recover a stroke already clipped at a planar
  framebuffer's boundary. Seam continuation must happen before such clipping,
  or through explicit neighboring-chart render passes. Prefer precomputed
  transitions and fixed-capacity buffers; expensive geometry can be prepared
  off-device. This is a selected portable subset, not a mechanical port of
  every JS feature or the full dense-mesh pipeline.

---

### 2.4 Community-facing graphics contract: artwork buffers versus a surface framebuffer

The first p5 version is experimental. The intended user experience is ordinary
graphics-engine drawing directed to a manifold support at an explicit placement,
not requiring each sketch to implement texture coordinates or seam routing.
The support geometry does not choose the placement: the author must choose an
anchor, tangent heading, scale and mapping rule. Convenience/defaults must not
conceal these semantics or imply a global flat coordinate system.

**Current implementation:** `p5.Graphics` is a local artwork buffer.
`display.imprint` computes a bounded patch, clips source mesh triangles, assigns
image UV coordinates and draws them with `p.texture(image)` into the ordinary
perspective preview framebuffer. This is texture mapping, but not a persistent
texture atlas covering the support. There is no interception of arbitrary p5
draw calls, no per-chart persistent colour storage and no surface `getPixel`.
Vector contours instead produce on-surface line segments rendered directly in
the preview; they are not automatically written into image storage either.

**Proposed surface framebuffer:** persistent, view-independent colour layers
addressed by surface points, e.g. `{faceId,x,y}`. Its GPU storage could be
separate chart textures, tiles packed into an atlas, texture-array layers or
an emitter-oriented layout; these are backend choices, not the mathematical
surface. Distinguish intrinsic coordinate charts from raster-storage tiles:
one triangle need not mean one texture allocation. Resolution, density, layers,
colour space, alpha compositing, filtering and boundary policies must be explicit.

Drawing into an existing engine buffer and transferring it into surface storage
is a useful initial compatibility path. It does not provide automatic intrinsic
semantics for all operations. Alternatively, suitable commands can be replayed
into chart targets, or geometry can be mapped before rasterization. Placement
and seam routing must precede destructive clipping by the original local target:
pixels already clipped away cannot be recovered by gluing afterward.
Shaders using pixel coordinates, neighbouring texels or screen-space derivatives
need a defined interpretation. Seam-aware filtering requires neighbour-chart
lookup, correctly oriented gutters or equivalent sampling; identifying geometric
edge points alone does not make image filters continuous across the seam.

A proposed `getPixel(surfacePoint,{layer,...})` samples the composed surface
framebuffer, not the camera image and not an arbitrary source artwork buffer.
Surface points are continuous; sampling requires a specified resolution and
nearest/interpolated convention. Seam-equivalent points should give consistent
results for a continuous layer, subject to the declared discretization/filter
policy. Reading GPU data may require asynchronous readback; distinguish this
from a CPU-mirrored implementation and avoid promising cheap per-pixel queries.
Screen picking first produces a surface point; the colour query is independent
of whether that point is visible in the preview.

**Physics remains geometric:** particles carry chart coordinates and tangent
state, cross seams through transition maps and use an explicitly chosen force
metric. They do not move inside raster buffers. Rendering may display their
embedded positions as 3D markers, rasterize their footprints into surface layers,
or do both. A 3D preview marker does not alter surface pixels unless an explicit
surface-layer render pass writes it. Hardware outputs sample surface layers or
evaluate vector/agent state directly; they must not depend on the preview camera.

Before community publication, document this separation, the experimental scope
and unsupported shader/pixel operations prominently. A full persistent surface
framebuffer, seam-aware sampling and pixel readback are future work, not features
of the current local image-patch examples.

## 3. Phases

The phase numbering below records the original extraction plan, not the
current demo order. The schedule now prioritizes a shared surface-view API,
a p5 addon pilot/incremental migration, M8 and a bounded physics-adapter demo
before publication. Dense meshes are already supported; the surface canvas
also targets explicit chart assemblies and physical outputs.

### Phase 0 — Spec freeze (small, first)

- Extract conformance vectors from `atlas-selftest.mjs` into
  language-neutral JSON: surface definitions, initial states, expected
  trajectories / crossing sequences.
- Write `docs/LIBRARY_SPEC.md`: the step loop, transition-map construction,
  vertex-hit semantics, reflection at open boundaries. The C++ port is
  written against this spec, not against the JS source.

### Phase 1 — `manifold-core/` (dependency-free JS ES module)

Extracted from the Carillon core + the geodesic lab, hardened into a real
library (API upgrade list in §3.1):

- `Chart`, `Transition`, `Surface` — builder from vertex list + face indices;
  gluings computed as in `GEODESIC_MOTION.md` §4 (edge frames, two candidate
  isometries, interior probe).
- `Head` + `stepHead()` — exact sub-stepped edge crossing; cone-point hits
  exposed as first-class events.
- `CellGrid` + `neighbors()` — chart-local grid, seam-aware neighbour
  queries, BFS distance on the cell graph (cheap exact metric).
- `EmitterMap` — chart cells → physical chain index, as a _declarative
  description_ the firmware generator can consume (see Phase 5).
- Fast-path tiers as explicit surface classes:
  flat quotients (torus/Möbius — modular arithmetic)
  < regular polyhedra (integer signed permutations)
  < polygon-soup atlas
  < (optional) dense mesh.

### Phase 1.5 — Geometry API hardening (see §3.1)

Not a separate package — the work that turns Phase 1's internals into a
library-worthy geometry module. Scheduled right after extraction so later
phases build on the final API, not on lab internals.

### Phase 2 — Shareable web instrument (first host)

The "send a link" payoff. A standalone web app consuming `manifold-core` —
likely the textured-object instrument, since it exercises the texture bridge
(Phase 4) plus heads. Separate repo, library consumed as a module.

### Phase 3 — Physics adapter (see §5, the interesting part)

Not a physics engine — an adapter that makes **stock 2D engines** run on the
manifold.

### Phase 4 — `manifold-display/`

- `VirtualDisplay` — layered per-chart state: score/pixels live _on_ the
  surface, not in a texture.
- Rasterization of agents into cell grids; trails/paint; `sample(state,
chartPoint)` — what "reading a textured surface" means intrinsically.
- **Sprites**: a sprite lives in one chart, heading parallel-transported;
  near a seam it is clip+folded into the neighbour chart via the same
  `{M, t}` map (proven for head squares in the Carillon: `M` is a signed
  permutation, so an axis-aligned sprite folds axis-aligned — "not extremely
  deformed" falls out naturally). Double-overflow corner slivers are clipped.
- **Texture bridge, both directions**:
  - texture → atlas state (load mesh + texture, bake texels into chart
    state) — the feature the textured-object instrument needs first;
  - atlas state → texture atlas (publish to the standard GL pipeline).

### Phase 5 — Hosts and the C++ port trigger

- openFrameworks example app: textured-object instrument. **This is the C++
  port trigger** — the moment this app is seriously wanted, the port earns
  its cost, and conformance vectors make it mechanical. The oF addon
  packages the ported core with a Box2D + sound-generation example.
- Firmware: `firmware-lib/` stays its own lean C++ for now (MCU constraints
  differ from a browser's). Convergence path: a **generator** that emits
  `kCubeGluings`-style integer tables _from_ the library's declarative
  `EmitterMap`/surface description — so firmware is a compiled artifact of
  the JS model, not a parallel hand-maintained implementation.
- Cube Carillon: can migrate onto `manifold-core` at leisure, replacing its
  in-repo core.

---

## 3.1 Geometry module API — inspired by geometry-central

The historical atlas lab supplies `AtlasSurface` / `stepHead`; the extracted
library now lives in [manifold-core](../manifold-core/). The API inspiration
is [geometry-central](REFERENCES.md#geometry-central), not a dependency.
The following distinguishes current primitives from proposed work.

Already have (to formalize, not rewrite):

- `trace` / lab `stepHead` — straightest geodesic tracing; see
  [Polthier–Schmies](REFERENCES.md#straightest-geodesics). Cone transport and
  boundary semantics still need the audit in
  [GEODESIC_MOTION.md §16](GEODESIC_MOTION.md#16-current-code-what-is-implemented-and-what-is-not).
- Seam-aware `neighbors`, cell BFS distance, `to3D`/`embed`.

Add — cheap, high value:

- **`trace(start, dir, length)`** already returns a polyline, endpoint,
  outgoing direction, transport and events; harden its singular cases rather
  than replacing it with an endpoint solver.
- **`transport(frame, path)`** — parallel transport along a traced path:
  compose the `M` matrices along ordinary crossings. Cone continuation and
  boundary reflections need an explicit, consistent frame contract.
- **`vertexCones()`** — angle deficit per vertex; cone points as first-class
  data (accent events, agent decision points), plus holonomy computation
  around loops (compose `M`s around a vertex → the deficit rotation, made
  visible on the display).
- **Unfold helper** `develop(facePath)` — lay a strip of faces flat; needed
  by the physics adapter (§5.1) and texture extraction alike.

Add — medium effort, worth it:

- **Vector-field integration** — [Polthier–Schmies](REFERENCES.md#straightest-geodesics) discrete Runge–Kutta for
  flow-following agents (currents, winds, crowds).
- **Frame fields** — smoothest n-direction field on the atlas, with
  singularities at cone points (Poincaré–Hopf made visible). On a polygon
  soup this is combinatorial matching, not geometry-central's connection
  Laplacian — cheaper and sufficient at our scale.
- **Approximate distance fields** — the
  [heat method](REFERENCES.md#heat-method) uses gradient/divergence and two
  sparse solves; cell-graph diffusion alone is not that algorithm or an exact
  mesh-distance solver. Useful for distance-to-stroke features and flows.

Deferred capability — not a current implementation milestone (2026-10-21):

- **`shortestPath(a,b)`** — a reserved API that currently throws
  `ERR_NOT_IMPLEMENTED`. A future solver, potentially
  [MMP](REFERENCES.md#mmp), would support arbitrary face
  endpoints, vertex events, traceback and explicit incomplete/failure states.
  It should supply metric queries, forces, neighbour ranking and displayed
  connections consistently. Existing `distance` remains an approximate query;
  no backend selection or JS solver rewrite is committed.
- **Branch-aware `logMap(a,b)`** — distance and initial tangent from the same
  shortest-path result; expose ambiguity at cut loci. Use both endpoint
  tangents for forces rather than a separately chosen unfolding.
- Candidate strip unfolding is a useful analytic test/optimization only
  after validating ordered crossings. Bounded candidate search, shooting,
  edge Dijkstra and [FlipOut](REFERENCES.md#flipout) are not general proofs of
  globally shortest distance. The cell graph retains its separate graph metric.

Still deferred: BFF conformal parameterization, vector heat and general
intrinsic-triangulation infrastructure. These algorithms need additional
structures/numerics, not necessarily geometry-central. Its optional C++
adapter remains a future choice. See the
[standalone MMP](REFERENCES.md#kirsanov-geodesic) and
[CGAL](REFERENCES.md#cgal-shortest-path) references for existing endpoint solvers.
Document capability and cost per surface class; do not imply that the general
shortest-path problem is already solved or cheap because the tracer is.

## 4. Repo layout

```
Native-Manifold-Displays/
  manifold-core/            # Phase 1+1.5: atlas, heads, grids, emitter maps (JS)
  manifold-physics/         # Phase 3: engine-agnostic adapter (JS; wraps
                            #   Matter.js in-browser, other engines per host)
  manifold-display/         # Phase 4 (JS)
  conformance/              # JSON vectors + JS runner now; C++ runner joins
                            #   when the port happens
  firmware-lib/             # existing C++; converges via generated tables
  experiments/              # JS lab — promoted to reference host / spec
  docs/
```

Current sequencing is in [IMPLEMENTATION_SCHEDULE.md](IMPLEMENTATION_SCHEDULE.md).
A bounded Phase 3 adapter/demo is now a pre-publication requirement; the
general adapter and embedded port remain later work.

---

## 5. Physics: pluggable flat engines on a curved surface

The key structural fact: **inside every chart the geometry is exactly flat
Euclidean.** So a stock 2D physics engine is _locally exact_ on a polyhedral
manifold — no modification at all. Everything manifold-ish lives in exactly
two places:

1. **the seams** (chart boundaries), and
2. **long-range interactions** (which must travel along surface geodesics,
   not through ambient space).

This gives a three-tier feasibility analysis.

### 5.1 What works with ZERO engine modification

- **The development (unfolding) proxy.** For any local interaction, unfold
  the involved charts into one plane via the transition maps (a polyhedron
  develops locally onto the plane away from cone points), let the
  engine work there, fold back. The engine never knows. This is the
  differential-geometer's development map; cost is maintaining the unfolding
  and sub-stepping agents that cross a seam mid-step (the head stepper
  already does exactly this).
  This requires a valid common developed neighborhood; an arbitrary region
  around curvature or a loop need not have one consistent planar image.
- **Long-range geodesic forces via force callbacks.** Every serious engine
  lets you apply custom per-body forces each step. Compute intrinsic
  distance and endpoint tangents from the same shortest-path result and
  inject attraction/repulsion in each agent's chart frame. Graph or heat
  distances must be explicitly different/approximate models, not hidden
  substitutes for this metric. See [GEODESIC_MOTION.md §17](GEODESIC_MOTION.md#17-proposed-solution-without-geometry-central).
  Thomson-
  problem-on-a-cube, surface gases, etc. — all outside the engine.
- **Seam transport as a coordinate change.** At a crossing, position and
  velocity are re-expressed by `p' = M·p + t`, `v' = M·v`. Since `M` is
  orthogonal, kinetic energy and momentum magnitude are preserved — the
  transport is physically transparent, not a hack.

### 5.2 The minimal override surface (the adapter API)

`manifold-physics` wraps a pluggable flat-2D engine behind three hooks:

1. `develop(region) → plane` — unfold/fold coordinates for the engine;
2. seam-crossing events — re-chart bodies (the `stepHead` mechanism);
3. intrinsic force callback — geodesic-distance forces per body pair.

Engines that qualify (all have per-step custom forces):
**Chipmunk2D** (C, lightweight, MCU-plausible), **Box2D** (C++, featureful,
deterministic option), **Matter.js** (JS host only). Start with Chipmunk2D
or Box2D behind the interface.

### 5.3 What genuinely breaks (and the honest limits)

- **Extended rigid bodies spanning a seam** — a body's shape lives in one
  coordinate system; a box straddling an edge has no single-chart
  representation. Needs the development proxy with the body duplicated into
  both charts, or bodies constrained to stay within charts.
- **Contact across seams / cross-chart joints** — narrow-phase (SAT/GJK) and
  joint solvers are hardcoded Euclidean with no distance hook; "override just
  the distance function" is generally _not_ possible without forking. Route
  these through the proxy layer instead.
- **Cone points and cut loci** — no single planar proxy covers all routes.
  Shortest paths may pass through saddles or have competing branches; these
  cannot be dismissed as numerical noise. Summing forces from unfolded
  images would define a different interaction law, not repair a
  shortest-distance pair potential. Choose and document branch/singularity
  policies as described in [GEODESIC_MOTION.md §17](GEODESIC_MOTION.md#17-proposed-solution-without-geometry-central).

### 5.4 The GR ladder ("modify the metric, not the engine")

1. **Fixed polyhedral metric** — free; the atlas already _is_ a cone metric.
2. **Deficit dynamics** — agents carry mass; mass at a vertex eats/adds angle
   (discrete Regge calculus); transition maps recomputed, tracing loop
   unchanged. Geodesics bend toward mass. Cheap to prototype.
3. **Smooth metric fields** — the elegant trick: geodesic motion in a metric
   `g` looks, in coordinates, like flat motion plus a velocity-dependent
   fictitious force `−Γ(v, v)`. So keep the stock Newtonian engine and inject
   the Christoffel term through the ordinary force callback — `g` sampled on
   the chart, `Γ` by finite differences. The user plugs the engine; the
   library supplies only _forces and coordinate transforms_. Caveats:
   semi-implicit integration and small `dt` needed (velocity-dependent forces
   destabilize naive solvers), and coordinate patches must avoid metric
   singularities.
4. **Higher dimensions** — the atlas construction generalizes (gluing
   3-cells), so the same adapter strategy works for 3-manifold simulations;
   display side stays 2D.

### 5.5 Deferred questions

- Fixed-point vs float on MCU builds (Chipmunk2D has a fixed-point lineage).
- Whether joints/constraints get any cross-chart support at all (lean: no —
  document as out of scope, proxy layer handles the useful cases).

---

## 6. Conformance & testing

- `conformance/`: JSON vectors (surface, initial state, expected trajectory)
  with a JS runner now; a C++ runner joins when the port happens, and CI
  compares both against the same vectors within epsilon. This is what makes
  the deferred C++ port safe.
- The lab selftests keep passing as the library is extracted; the lab
  becomes the reference host that exercises every surface class.

## 7. Open questions

- npm packaging: bare ES module vs package.json + registry publish (bare
  module + git dependency may suffice for our own hosts).
- Sprite representation: strictly axis-aligned-in-chart (LED-friendly) vs
  freely oriented with parallel transport (prettier, costlier).
- First physics engine per host: Matter.js in browser hosts; Chipmunk2D or
  Box2D when the C++/oF port happens (same adapter interface).
