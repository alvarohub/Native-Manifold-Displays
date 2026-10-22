# Implementation Schedule — demos first

Status: **living document, schedule of record** (started 2026-10-17).
`LIBRARY_PLAN.md` keeps the architecture and the rationale (language choice,
purity rules, physics-adapter theory). _This_ file says what gets built, in
what order, and which demo each step unlocks. When they disagree, this file
wins for sequencing; the plan wins for design principles.

Re-orientation (2026-10-17): the first host is **no longer a musical
instrument**. Sound stays available as one optional output adapter (a
"reader" may sonify what it reads, cf. scoreLight in `IDEAS.md`), but the
accent is on the surface toolkit itself and on two visual demos.

**Scope clarification (2026-10-21):** the product is a **2D graphics interface
on a non-flat canvas**, aimed at creative coders and evolving/distributed
physical displays, not a replacement for geometry-central or a new stock
graphics/physics engine. The support (mesh or explicitly glued charts) is
separate from its viewport and output devices. Motivation, scattered-panel
topology, dynamic geometry, p5.js, SVG and Arduino/GFX strategy are recorded in
[LIBRARY_PLAN.md §2.1–2.3](LIBRARY_PLAN.md#21-motivation-the-canvas-is-the-support-not-a-rectangular-viewport).
Exact global shortest paths are deferred; do not block this adapter work
on implementing a general solver. Local approximations must remain explicit.

---

## 1. Objectives, restated

Three libraries, stacked. Each is a dependency-free JS ES module (Node-testable),
rendered only by adapters in the demos.

### A. `manifold-core` — differential geometry on a surface given as a mesh

Input: any triangle mesh (OBJ/STL loaded, or built-in primitives). The mesh is
treated as a **polyhedral 2-manifold** embedded in $\mathbb{R}^3$: every face is
a flat chart, every interior edge a transition map $p' = Mp + t$, every vertex
a cone point with an angle deficit. The math is written for 2-manifolds but the
atlas construction does not depend on the embedding dimension.

What it must do:

- **Atlas**: build charts + transitions from the mesh in $O(F)$ (edge hash,
  not the lab's $O(F^2)$ scan); detect boundary edges; vertex table with
  incident faces in cyclic order.
- **Navigate**: `trace(point, dir, length)` — straightest geodesic as a pure
  function returning the polyline, endpoint, transported direction and the
  crossing events (edges, boundary, cone-point hits). `stepHead` becomes a thin
  wrapper. Nudges scale with face size (robust on small triangles).
- **Local geometry**: angles between tangent directions at a point (trivial —
  charts are Euclidean), `transport(dir, path)` (compose the $M$'s),
  holonomy around a vertex (= deficit, made visible).
- **Distances**: `develop(faceId, R)` currently retains one unfolded copy
  per face; `logMap(a,b)` / `distance(a,b)` use that heuristic. This is not
  a certified metric across curvature, competing routes or cut loci.
  Exact global endpoint paths are **deferred**, not a geometry-central
  implementation requirement. `shortestPath` is a throwing placeholder
  (`ERR_NOT_IMPLEMENTED`), never an alias for shooting or graph routes.
  Validate and state the local regime used by demos; graph BFS remains a
  separate quantized metric. Preserve the initial-value tracer for inertia.
- **Curvature**: Gaussian curvature = angle deficit per vertex (exact,
  intrinsic); mean curvature from dihedral angles per edge (extrinsic);
  per-vertex **curvature tensor** (Rusinkiewicz 2004 face-tensor averaging) so
  a particle can ask "normal curvature in my direction of motion",
  $\kappa_n = v^{\top}\,\mathrm{II}\,v$. Metric is the identity inside a chart
  by construction — the embedding only matters for these extrinsic estimates.
- **Fields on the surface**: scalar/vector attributes per vertex or per face,
  sampled at a chart point by barycentric interpolation, with gradient; later a
  texture sampled through the mesh's UVs. This is what a "reader" reads.
- **Embedding helpers**: `to3D(point)`, surface normal, Darboux frame of a
  traced curve ($\kappa_g, \kappa_n, \tau_g$) — needed for the robot/pen case.

### B. `manifold-physics` — particles confined to the surface

- Particle state `{faceId, x, y, vx, vy, m}`; free motion = `trace`.
- Forces expressed in the particle's chart frame: external fields (gravity
  projected, drag, noise), **pair forces along geodesics** via `logMap` within
  a cutoff radius (repulsion → packing/Voronoi; attraction/springs → chains),
  user callbacks that may read any surface field (colour, curvature).
- Integrator: semi-implicit Euler with substeps; energy/speed diagnostics.
- Planned before publication: a bounded stock 2D-engine adapter and demo
  ([LIBRARY_PLAN.md §5](LIBRARY_PLAN.md#5-physics-pluggable-flat-engines-on-a-curved-surface)).
  Reuse engine machinery rather than growing a general physics engine here;
  surface versus ambient-distance interactions are explicit model choices.

### C. `manifold-ink` — imprinting 2D curves onto the surface

- Input: planar polylines (from SVG, from text via opentype.js contour
  extraction as in myBlobChain, or drawn).
- Several **imprint modes** with different preserved quantities — the theory
  and the choice of modes is in `DRAWING_ON_SURFACES.md`: turtle /
  dead-reckoning, exponential map (decal), Fermi grid, extrinsic projection
  (baseline), and spring relaxation (ties into B).
- A placement **frame** `{anchor point, heading, scale}` so the drawing can be
  translated (move the anchor along a geodesic, transporting the heading),
  rotated (heading) and scaled (multiply arc lengths) on the surface.
- Output: a curve _on the surface_ (list of chart points) → 3D polyline with
  normals for display, projection, laser, or a pen robot. The ultimate
  consumer is **motion of robots on the object** — Alvaro's _Untethered
  Robotic Printer Heads_ (2011) swarm-printing on large or curved surfaces,
  and conformal (non-planar) 3D-printing toolpaths; see
  `DRAWING_ON_SURFACES.md` §7.

---

## 2. The demos

- **D1 — Particles on a surface.** Load/choose a mesh. N particles move along
  geodesics; toggle forces: mutual repulsion (→ optimal spacing, hexagonal in
  the limit with the topologically forced defects), springs, gravity, noise.
  Each particle _reads_ a local property (scalar field / texture colour,
  Gaussian curvature nearby, normal curvature in its direction) shown as its
  colour, optionally sonified. Trails optional.
- **D2 — Text / curve on a surface.** Type text (or load SVG), place it with
  the `{anchor, heading, scale}` frame, switch imprint modes live and see the
  distortions and the closure gap; optionally relax the letters as spring
  chains (D1 physics). Export the 3D polyline.

Later (not scheduled): D3 reader sonification (scoreLight on a surface),
D4 paint/trails as a per-chart buffer, D5 geodesic Voronoi zones.

Both demos live in this repo under `demos/` as plain ES-module web pages
consuming the libraries by relative import (three.js via CDN importmap, like
the lab). "Send a link" = GitHub Pages of this repo.
This describes the current hosts, not a renderer requirement. Target p5.js
sketches through an addon/WEBGL adapter, first as a small pilot, then by
incremental demo migration with parity tests. No full rewrite is scheduled
before that pilot; the core remains independent of p5 and three.js.

---

## 3. Milestones (in order)

Sizes: S = an afternoon, M = a few sessions. Each milestone ends with a Node
selftest; the lab's `atlas-selftest.mjs` must keep passing throughout.

- [x] **M0 — Scaffold (S).** _Done 2026-10-17._ `manifold-core/` (`index.js`,
      `src/vec.js`, `src/mesh.js`, `src/surface.js`), `tests/run.mjs`
      (+ `assert.mjs`) which also re-runs the lab selftest. `manifold-physics/`,
      `manifold-ink/`, `demos/` are created when their first file lands.
- [x] **M1 — Mesh → atlas (M).** _Done 2026-10-17._ `mesh.js`: `parseOBJ`
      (quads/polygons fan-triangulated, uvs kept, negative indices), `parseSTL`
      (ASCII + binary), `weldVertices`, `orientTriangles` (BFS winding repair,
      reports non-orientable), `meshStats` (V/E/F/χ/boundary/non-manifold),
      primitives cube(div)/icosphere(n)/torus/open cylinder/plane/tetrahedron.
      `surface.js`: `Surface.fromMesh` (edge-hash gluing, boundary + non-manifold
      detection, winding-consistency flag, vertex table), `Surface.fromCharts`
      (hand-glued flat quotients), `vertexCones`/`totalDeficit`/
      `eulerCharacteristic`, `stepHead` (skip-entry-edge instead of absolute
      nudges), barycentric/contains/centroid/to3D/toChart. Verified: 16 tests —
      reciprocal gluings (round trip, 3D edge coincidence, interior probe),
      Σδ = 2πχ on cube/icosphere/torus/cylinder/plane (boundary turning
      included), cube corners δ = π/2, icosahedron 12 equal cones, torus mixed
      signs, 2000-step walk on icosphere with no stalls; build is linear:
      82k faces in ~0.5 s, Σδ/4π = 1.000000000.
- [x] **M2 — Trace, transport, develop, logMap (M).** _Done 2026-10-17._
      `src/geodesic.js`: pure `trace(point, dir, length)` → {end, dir,
      composed M, polyline, crossings, events}; `firstExit` reports vertex
      hits; `vertexFan` / `holonomy` / `coneContinuation` (straightest rule:
      equal angles left and right of the total cone angle); `transportAlong`;
      `GeodesicDisk` + `develop(faceId, R)` (face Dijkstra by unfolded polygon
      distance, cached per face+R); `logMap` / `distance` (grow R until the
      target is in the disk). `stepHead` is now a wrapper over `trace`.
      Verified (9 new tests, 25 total): holonomy = deficit on cube (90°),
      icosahedron (60°), plane (0); closed cube equator with identity
      transport; cube distances 2 / 4 / unfolded diagonal 1 and exp(log) = id;
      planar logMap exact; cylinder short-way wrap exact; cone point through a
      cube corner matches the hand unfolding (θ = 45° − ψ); asymmetric
      icosahedron vertex splits the cone angle equally. Icosphere distance vs
      great circle: mean error 0.68% → 0.17% → 0.05% → 0.02% for subdiv
      2–5 (second order); disk R=0.5 on icosphere(4) ≈ 360 faces in 0.4 ms.
      Caveat: the disk keeps each face's _first_ unfolding (shortest polygon
      distance), so `distance` is exact on developable patches and a
      shortest-among-found approximation around cone points — fine for the
      short-range forces and decals it serves; not a general shortest-path
      solver.
- [x] **M3 — Fields and curvature (S/M).** _Done 2026-10-17._
      `src/curvature.js`: `vertexAreas`, `vertexNormals` (angle-weighted),
      `gaussianCurvature` (deficit/area), `dihedralAngles` (signed),
      `meanCurvature` (Steiner Σℓθ/4A), `faceCurvatureTensors` +
      `curvatureTensor` (Rusinkiewicz least squares, corner-angle averaging in
      vertex frames, principal curvatures/directions), `curvatureAt(point,
dir)` → {II, κ₁, κ₂, H, K, κₙ, τ_g}, `normalAt`, `gaussianCurvatureAt`.
      `src/fields.js`: `VertexField` (barycentric sample, exact per-face
      gradient, umbrella smoothing), `FaceField`, `vertexNeighbours`. Convex
      = positive. Verified (6 tests, 31 total): icosphere K≈1/r², H≈1/r,
      κₙ isotropic, τ_g≈0; cylinder K = 0 exactly, κ₁ = 1/r around, κ₂ = 0
      along the axis, τ_g(45°) = 1/2r; torus K = cos v/(r(R+r cos v)) incl.
      both equators; plane/cube flat; linear fields sampled and
      differentiated exactly. Convergence table and its reading in
      `DISCRETE_TO_SMOOTH.md` §2 (integrated 2nd order, pointwise 1st,
      tensor ~1% limited by normal estimates).
- [x] **M4 — Particles (M).** _Done 2026-10-17._ `manifold-physics/src/particles.js`:
      `ParticleSystem` (chart-state particles, `addRandom` uniform by area,
      semi-implicit Euler with substeps, drag, `temperature` = random kicks
      for annealing, speed cap, optional 3D trails, `forEachNeighbour(R)`
      through geodesic disks with face buckets), forces `pairForce`
      (inverse-square / inverse / linear, cutoff, softening), `springForce`
      (via `logMap`, reaction transported into the partner's chart),
      `uniformField` (3D vector projected per chart), `customForce`. Disk cache
      now has a stable radius per query and evicts beyond `surface.maxDisks`.
      Verified (5 tests, 36 total): free particle ≡ `trace`, drag = e^{−ct},
      two repellers → antipodal on a sphere, spring settles at its surface
      rest length, gravity slides side-face particles to the bottom of a cube
      and leaves level faces alone, 12 annealed repellers on a sphere →
      icosahedral spacing (NN spread < 8%), 8 repellers started near cube
      corners sit on them to < 0.05 (basin test; global search needs
      annealing — IDEAS §2).
- [x] **M5 — Demo D1 (M).** _First version 2026-10-17_ — `demos/particles/`
      (three.js + OrbitControls via importmap). Surface: icosphere / cube /
      torus / open cylinder / plane / tetrahedron with a detail slider, **drop
      an .obj/.stl** (weld + orient + normalise); colour by smoothed K, H,
      exact deficit, or a test field; wireframe; cone points as dots sized by
      deficit. Particles: N (1–400), initial speed, trails with length,
      reseed / pause / single step; each particle _reads_ K, κₙ along its
      motion, τ_g, the test field or its speed and is coloured by it.
      Forces: repulsion (strength, law, cutoff), drag, gravity (−z),
      temperature, **anneal** button (hot → cold over 8 s). Readout: mesh
      stats, Σδ/2π, kinetic energy, mean NN distance, cone hits, fps, cached
      disks. Verified in-browser: 0 errors; 12 repellers on the icosphere →
      NN 1.21 (≈ icosahedral edge 1.26 for r = 1.2), κₙ reads 0.83 ≈ 1/1.2;
      torus red/blue by K sign with 40 particles at 76 fps; cube + 8 + anneal
      lands most particles on corners within 12 s (the rest still
      descending — the local-minimum story of IDEAS §2, visible). Added same
      day (d135500): surface / edge opacity sliders, trail visibility,
      **connections** between particles (k nearest by surface distance:
      straight 3D chords and/or geodesic segments on the surface — 12
      repellers on the sphere draw the icosahedron). Pending polish for M9:
      fixed colour ranges, energy plot, basin histogram.
- [x] **M6 — Curves in, imprint modes (M).** _Done 2026-10-17._
      `manifold-ink/src/curves.js`: `parseSVGPath` (M/L/H/V/C/S/Q/T/Z,
      abs/rel; arcs chorded), `contoursFromCommands` (opentype.js-shaped
      commands → flattened, uniformly resampled contours, `flipY`),
      `resampleContour`, `turningAngles`, bbox/transform, circle/rect
      generators. `manifold-ink/src/imprint.js`: frame
      `{anchor, heading, scale}` with `makeFrame` / `rotateFrame` /
      `scaleFrame` / `translateFrame` (geodesic slide + transported heading)
      / `frameFromPoint`; modes `turtle` (dead reckoning; closed contours
      keep their return point and report `gap`), `exp`, `fermi`,
      `projection` (new core `raycast`, Möller–Trumbore); `closureGap`;
      `liftContour` → position, normal, tangent, κ_g (from logMaps), κₙ,
      τ_g per sample (the robot/printer output). Verified (6 tests, 42
      total): plane — all modes reproduce the rotated/scaled drawing to 1e-9;
      cube — turtle strip across two edges closes exactly and matches exp;
      unit sphere — turtle circle gap ≈ πρ³ (Gauss–Bonnet, within 25%), exp
      circle has radius ρ and circumference 2π sin ρ, Fermi parallel at
      height y shrinks by cos y; `translateFrame` round-trips; cylinder lift
      gives κ_g = 0, κₙ = 1/r around, 0 along.
- [x] **M7 — Demo D2 (M).** _First version 2026-10-17_ — `demos/imprint/`
      (shares `demos/shared/viewer.js` with D1: renderer, surface meshes,
      pointer rays, segment buffers). Sources: text via opentype.js (4
      bundled Google fonts by URL, drop a .ttf/.otf), SVG path, circle,
      Fermi test grid; point density. Imprint: mode (turtle / exp / Fermi /
      projection / **all four overlaid** in distinct colours), size, heading,
      arrow nudges = `translateFrame` along geodesics, "slide along
      baseline" animation, **click the surface** to move the anchor (heading
      kept as a 3D direction), closure-gap segments in red, frame gizmo
      traced as geodesics. Export: Darboux JSON (`liftContour`) and OBJ
      polylines. Verified in-browser: 0 errors; sphere — the four modes agree
      near the anchor and diverge toward the ends of the word; cube — text
      folds across the edge with gap 0.0000; 400 points imprint in 3 ms
      (25 ms for all four modes).
- [x] **Before M8 — Shared surface visualization API/panel.**
      One programmatic, GUI-independent surface view for all demos; one panel
      named "Manifold surface". Faces / edges / vertices each have a leading
      visibility checkbox and trailing swatch-only style button. Shared scalar
      field sources, colour scales/ranges and legends; preserve demo state
      colours (e.g. Life) as an explicit alternative, not an overwritten buffer.
      Edges: all versus feature edges, angular threshold and optional continuous
      bending-angle fade; always handle open boundaries separately. Vertices:
      fixed colour, angle deficit or area-normalized Gaussian curvature, with
      distinct boundary treatment. Use locally consistent orientations on
      nonorientable inputs. Geometry calculations stay in the library, rendering
      in an adapter, DOM controls in shared GUI helpers; no copying among demos.
      Keep the interface suitable for a later p5 renderer. Verify polyhedron
      coplanar-diagonal suppression, boundary retention, nonorientable seams,
      independent visibility/styles and Life's own colouring before proceeding.
      Implemented across particles, imprint and Life with a pure core edge query,
      renderer-independent settings, a DOM-free three.js adapter and one shared
      GUI. Verified polygon-crease counts (cube/dodecahedron), Möbius boundaries,
      API/GUI synchronization, GPU per-edge opacity and retained Life colours.
      See [usage and conventions](../README.md#shared-manifold-surface-view).
- [x] **p5.js addon pilot (staged creative-coding priority).**
      Use documented addon hooks and an explicit supported p5 version; keep
      `createCanvas(width,height,WEBGL)` for the viewport and
      `createManifoldCanvas(surface,{frame})` for the logical support. First
      validate a seam-crossing path, explicit placement/imprint semantics,
      multiple canvas instances and renderer-independent core state.
      Implemented on pinned p5 2.3.4 in `demos/p5-pilot`: independent cube
      stroke/rectangle sketches, shared existing turtle computation, per-face
      segment retention, explicit boundary/vertex/stall rejection, global and
      instance modes, per-sketch cleanup. Node and real p5 GPU regressions
      cover seam fidelity, lengths, isolation, opaque occlusion and style/GL
      restoration. [Pilot API](../README.md#p5js-addon-pilot).
- [x] **Simple p5 hello-world and graphics/SVG adapter sketches.**
      Preserve the original pilot; add classic global-mode setup/draw examples
      with perspective cameras. Native p5.Graphics supplies moving coloured
      shapes on a cube and text on a torus. Pure bounded patch geometry clips
      image UVs to actual source triangles; isometric local unfolding rejects
      cone-containing/cut patches, tangent-plane projection permits distortion
      on curved supports and rejects missing/overlapping sheets.
      Placements use straightest tracing and ordinary-edge parallel transport.
      Generated SVG path data and p5 font outlines reuse existing curve parsing,
      with projected vector segments clipped at seams. Full p5 demo migration,
      arbitrary SVG documents and transparent supports remain separate.
      [Usage and limitations](../README.md#classic-p5-sketches-graphics-buffers-and-moving-placements).
- [ ] **p5.js demo migration (incremental, parity-gated).**
      Migrate demos incrementally, preserving picking, wide lines, transparency,
      controls, imports and exports. Full raster/SVG compatibility is not the
      pilot scope; reuse existing drawing tools rather than reimplement them.
      Do not make AR/VR or device output depend on a p5 framebuffer.
- [ ] **M8 — Spring-chain lettering (next content demo; scope updated 2026-10-21).**
      Extend D2 with input-text and live-clock sources (the blobchain reference),
      a relax/run toggle and reset to the initial imprint. Each glyph contour
      becomes its own chain: preserve closed loops and holes, never connect
      unrelated contours. Rest lengths come from planar contour samples;
      soft anchors retain the letter shape while surface springs relax.
      Geometry/dynamics belong in the libraries; font, clock and UI glue in D2.
      Clock digit changes must rebuild/retarget affected glyphs without
      accidentally linking old and new contours. Define clock update and
      anchor behavior before implementation.
      **Prerequisite:** validate the local distance/direction regime used by
      springs and repair the relevant cone transport contract. Exact global
      shortest paths are deferred, not an M8 prerequisite; state explicitly
      which local approximation the demo uses and report out-of-regime cases.
      The current single-copy unfolding and edge fallback are not exact
      geodesic solutions and must not be presented as such.
      See [GEODESIC_MOTION.md, Part III](GEODESIC_MOTION.md#part-iii--straightest-motion-versus-shortest-connections).
      Verify rest-length force balance on a plane, seam-crossing chains,
      stable relaxation on curved meshes, independent glyph contours, and
      text/clock updates. Implementation deferred until after the menu/style work.
- [ ] **Before M9 — Stock 2D-engine adapter + bounded demo.**
      Start with one engine (e.g. Box2D; choose the actual JS/WASM binding
      before implementation), valid locally developed neighborhoods, and
      cross-seam motion/contact tests. State limits for finite rigid bodies,
      cone vertices and joints. Offer explicitly named surface/ambient
      interaction models; do not imply replacing a distance callback adapts
      an entire engine. This milestone does not require exact global distances.
- [ ] **M9 — Publish: project page (M).** GitHub Pages site for the repo:
      a presentation page (not a paper, but with real references) —
      background → the atlas idea → what is new → the demos embedded/linked
      → references (`docs/REFERENCES.md`) → Alvaro's related projects
      (scoreLight, Sticky Light, Robotic Printer Heads, Cube Carillon…) as
      links into his portfolio. Done in a dedicated clean-up session after D1
      and D2 exist; until then `REFERENCES.md` and `IDEAS.md` accumulate the
      material. `.nojekyll`, README demo links.

Deferred: exact global shortest-path backend, full SVG/Geomerative-like
document adapters, dynamic-support updates/remeshing, AR/VR and device-output
adapters, texture bridge both ways, firmware table generator and the bounded
Arduino/C++/GFX subset (plus any oF host). Write conformance vectors before a
native port. The bounded stock-engine adapter is now a pre-publication task,
not part of this deferred list.

---

## 4. Decisions taken on 2026-10-17 (deviations from `LIBRARY_PLAN.md`)

- **Dense triangle meshes are the primary surface class now**, not optional.
  The fast-path tiers (flat quotients, regular polyhedra) stay as special
  cases the same API accepts.
- **Point-particle physics is hand-rolled** in `manifold-physics` (an
  integrator plus force callbacks). Update 2026-10-21: a bounded pluggable
  stock-engine adapter/demo is required before publication.
- **Demos live in-repo** (`demos/`) for speed; the "separate host repo" idea
  returns only if a demo grows into its own project.
- **Phase 2 "shareable web instrument" → "shareable demos"** (D1, D2). The
  textured-object instrument becomes D3, optional.
- **geometry-central** remains reference only; do not grow a duplicate general
  geometry toolkit. Current `develop` is a local heuristic, not a globally
  valid unfolding or certified shortest-path solver.
- Three.js currently appears only inside `demos/`; the libraries stay pure.
  p5.js is a planned frontend/renderer adapter, not a replacement dependency
  in the geometry, drawing-state or physics core.

---

## 5. Working conventions

- Pure core: no DOM, no three.js, no audio in `manifold-*`.
- **Layering rule (2026-10-17).** Demos only _call_ the libraries. A demo may
  own: DOM/UI, three.js scene code, colour maps, audio adapters, and glue.
  Anything geometric, dynamic or combinatorial (neighbour graphs, mesh
  normalisation, curve resampling, imprint maths…) lives in a library the
  moment it is written — as a new method on an existing class, a new function
  in the right module, or a new class that composes/extends an existing one
  (`ParticleSystem` has-a `Surface`; `manifold-ink` functions take a
  `Surface`; a future rigid-body system would be a new class in
  `manifold-physics`, not a patch on `ParticleSystem`). Dependency direction:
  `manifold-core` ← `manifold-physics` ← `manifold-ink` ← demos; never
  sideways from a demo into another demo. Audit at every milestone: anything
  a second demo would need to copy gets promoted.
- Every geometric quantity is either an exact polyhedral object or an
  estimator of a smooth one, named and documented as such — see
  `DISCRETE_TO_SMOOTH.md` (standing rule).
- Every module ships a Node selftest; run `node tests/run.mjs` before any
  commit. Browser verification of demos follows (test-first workflow: Alvaro
  tests by hand before pushes).
- Local server from repo root: `python3 -m http.server 8001`.
- New ideas go to `IDEAS.md` (root), not into this schedule.

## 6. Open questions

- Which meshes to ship as examples (bunny? a scanned object of yours?). OBJ is
  the default input; STL is a weld away.
- Should D1 particles be visualised as discs tangent to the surface (sprites
  via clip+fold, LED-like) or as small spheres (cheap)? Spheres first.
- Reader sonification: Web Audio in D1 as a toggle, or wait for D3?
