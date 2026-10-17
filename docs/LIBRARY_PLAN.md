# Native Manifold Displays — Library Plan

Status: **draft, living document** (started 2026-08-22). Adjust freely; this file
is the plan of record for _architecture and rationale_, the chat was only the
sketch. **Sequencing now lives in `IMPLEMENTATION_SCHEDULE.md`** (2026-10-17):
demo-first milestones, dense meshes as the primary surface class, hand-rolled
point-particle physics, demos in-repo under `demos/`. Where the two disagree
on _what to build next_, the schedule wins; §4 there lists the deviations.

Goal: a reusable library for displays and agents that live **on** a manifold
(charts + transition maps). First consumers are the two demos of the schedule
(particles on an arbitrary mesh; 2D curves/text imprinted on a surface); the
"textured 3D object as musical instrument" is now an optional later host.

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

**Geometry-central:** a reference and inspiration, not a dependency and not a
fork. Its API surface (see §3.1) is the model for hardening our JS geometry
module. If a dense-mesh display ever materializes, a geometry-central
adapter can be added behind an interface — optional, CMake-gated, and only
in a C++ build.

**The JS lab** (`experiments/geodesic-surfaces/`) is promoted from
playground to **executable spec and reference host**: its selftests define
correct behaviour, and it demos every surface class the library supports.

---

## 2. Architecture principles

- **The core is pure intrinsic.** No 3D, no rendering, no heap. 3D embedding
  is used only at build time (to compute transition maps) and at render time
  (to place things on screen).
- **Rendering, audio, UI are adapters** in the consuming projects.
- A moving agent's whole state is `{chart, x, y, vx, vy}` — never a 3D
  position (see `GEODESIC_MOTION.md`).

---

## 3. Phases

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

The current atlas code (`experiments/geodesic-surfaces/src/atlas.js`) is a
validated lab: `AtlasSurface` with `stepHead`, builders for torus / tube /
Möbius / icosahedron. To become a library it needs a deliberate public API.
Below, the geometry-central-inspired surface, marked by feasibility on a
chart atlas (≠ halfedge mesh).

Already have (to formalize, not rewrite):

- `stepHead` — straightest geodesic tracing (geometry-central's
  `traceGeodesic`).
- Seam-aware `neighbors`, cell BFS distance, `to3D`/`embed`.

Add — cheap, high value:

- **`trace(start, dir)` as a first-class API** returning the full polyline,
  endpoint, and incoming direction transported into the endpoint's frame
  (today `stepHead` mutates a head and returns events; the pure function
  is the reusable primitive).
- **`transport(frame, path)`** — parallel transport along a traced path:
  just compose the `M` matrices along the crossing sequence.
- **`distance(a, b)` / `shortestPath(a, b)`** — candidate-unfolding search:
  unfold the faces along candidate face-paths into the plane, measure
  straight-line distance, take the minimum (exact for few-face paths,
  bounded search for general ones). The cell-graph BFS remains the cheap
  quantized metric.
- **`logMap(a, b)`** — direction + distance from `a` to `b` in `a`'s chart
  frame (read off the winning unfolding).
- **`vertexCones()`** — angle deficit per vertex; cone points as first-class
  data (accent events, agent decision points), plus holonomy computation
  around loops (compose `M`s around a vertex → the deficit rotation, made
  visible on the display).
- **Unfold helper** `develop(facePath)` — lay a strip of faces flat; needed
  by the physics adapter (§5.1) and texture extraction alike.

Add — medium effort, worth it:

- **Vector-field integration** — Polthier–Schmies discrete Runge–Kutta for
  flow-following agents (currents, winds, crowds).
- **Frame fields** — smoothest n-direction field on the atlas, with
  singularities at cone points (Poincaré–Hopf made visible). On a polygon
  soup this is combinatorial matching, not geometry-central's connection
  Laplacian — cheaper and sufficient at our scale.
- **Heat-method distance field** — smooth per-chart distance via the
  cell graph (diffusion on the grid); useful for "distance to a drawn
  stroke" features and gradient flows.

Explicitly out of scope (need a halfedge mesh; if ever wanted, that's the
optional geometry-central backend in a C++ build):

- MMP exact geodesics on arbitrary dense meshes, BFF conformal
  parameterization, vector heat method, intrinsic triangulations.

The honest framing for the docs: geometry-central is the general,
robust reference; ours is the display-oriented subset, cheaper and
portable, deliberately so. The module docs should state the capability
ladder per surface class (flat quotient / regular polyhedron / polygon
soup) so users know what costs what.

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

Sequencing: Phases 1, 1.5, 2 and 4 are the spine (the instrument example
needs exactly those). Phase 3 can lag without blocking.

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
  develops isometrically onto the plane away from cone points), let the
  engine work there, fold back. The engine never knows. This is the
  differential-geometer's development map; cost is maintaining the unfolding
  and sub-stepping agents that cross a seam mid-step (the head stepper
  already does exactly this).
- **Long-range geodesic forces via force callbacks.** Every serious engine
  lets you apply custom per-body forces each step. Compute intrinsic
  distances with the library's `distance(a, b)` (cell-graph BFS / unfolding /
  heat method, depending on surface class) and inject attraction/repulsion as
  ordinary forces expressed in each agent's current chart frame. Thomson-
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
- **Cone points** — unfolding around a cube vertex has a 90° wedge mismatch.
  Options: exclude vertex-threading interactions (measure-zero, fine in
  practice), or use the **method of images** in the unfolded universal cover
  (standard for conical singularities): sum contributions from the agent's
  mirrored copies.

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
