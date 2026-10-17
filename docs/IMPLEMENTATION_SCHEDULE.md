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
- **Distances**: `develop(point, R)` — unfold the faces reachable within
  geodesic radius $R$ into one plane (a _geodesic disk_: BFS over faces with
  per-face `{M, t}` into the disk plane, pruned by distance). From it:
  `logMap(a, b)` (direction + distance from $a$ to $b$ in $a$'s frame) and
  `distance(a, b)`, exact for $b$ inside the disk. This is the primitive both
  demos need (pair forces, decal placement). Global shortest paths across a
  dense mesh are **out of scope** (geometry-central's job); the cell-graph BFS
  remains the cheap quantized metric for displays.
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
- Deferred: the stock-engine adapter of `LIBRARY_PLAN.md` §5 (needed only for
  rigid bodies and contact, not for point particles).

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
- [ ] **M2 — Trace, transport, develop, logMap (M).** Pure `trace()`;
      size-relative nudges; cone-point hit event; `transport()`;
      `develop(point, R)`; `logMap`, `distance`. Selftest: on the cube,
      distances vs. hand-unfolded values; on an icosphere vs. great-circle
      distance (converges with subdivision); holonomy around a cube vertex
      $= 90°$.
- [ ] **M3 — Fields and curvature (S/M).** Per-vertex/per-face attributes,
      barycentric sampling + gradient; dihedral mean curvature; Rusinkiewicz
      curvature tensor; `curvatureAt(point, dir)`. Selftest: icosphere tensor
      → $\kappa_n \approx 1/r$ in every direction; cylinder → $0$ along axis,
      $1/r$ around.
- [ ] **M4 — Particles (M).** `manifold-physics`: particle set, integrator,
      external forces, pair forces through `logMap` with cutoff (bucket
      particles by face, query the geodesic disk), spring constraints.
      Selftest: free particle = `trace`; energy drift bounded; 8 repelling
      particles on a cube settle near the corners (Thomson-on-a-cube, IDEAS).
- [ ] **M5 — Demo D1 (M).** three.js host: mesh picker + OBJ drop, particle
      count/force sliders, colour-by-reading, trails; share-ready.
- [ ] **M6 — Curves in, imprint modes (M).** `manifold-ink`: polyline input
      (SVG path sampler, opentype.js contours from myBlobChain's
      `extractContours`), turtle imprint, exp-map imprint, Fermi imprint,
      projection baseline; the placement frame. Selftest: on a plane all modes
      coincide with the input; on a cube away from corners turtle = exact
      unfolding; closed-curve closure gap on an icosphere $\approx \iint K\,dA$.
- [ ] **M7 — Demo D2 (M).** Text field, font picker, mode switch, drag the
      anchor / rotate / scale on the surface, closure-gap readout, 3D polyline
      export (JSON/OBJ lines).
- [ ] **M8 — Relaxed text (S).** D2 "relax" button: letters become spring
      chains (rest lengths = planar lengths) with soft anchors; uses M4.
- [ ] **M9 — Publish: project page (M).** GitHub Pages site for the repo:
      a presentation page (not a paper, but with real references) —
      background → the atlas idea → what is new → the demos embedded/linked
      → references (`docs/REFERENCES.md`) → Alvaro's related projects
      (scoreLight, Sticky Light, Robotic Printer Heads, Cube Carillon…) as
      links into his portfolio. Done in a dedicated clean-up session after D1
      and D2 exist; until then `REFERENCES.md` and `IDEAS.md` accumulate the
      material. `.nojekyll`, README demo links.

Deferred, unchanged from the plan: conformance JSON vectors (write them when
the API stops moving, before any C++ port), texture bridge both ways, stock
physics-engine adapter, firmware table generator, C++/oF port.

---

## 4. Decisions taken on 2026-10-17 (deviations from `LIBRARY_PLAN.md`)

- **Dense triangle meshes are the primary surface class now**, not optional.
  The fast-path tiers (flat quotients, regular polyhedra) stay as special
  cases the same API accepts.
- **Point-particle physics is hand-rolled** in `manifold-physics` (an
  integrator plus force callbacks). The pluggable stock-engine adapter is
  deferred to rigid bodies.
- **Demos live in-repo** (`demos/`) for speed; the "separate host repo" idea
  returns only if a demo grows into its own project.
- **Phase 2 "shareable web instrument" → "shareable demos"** (D1, D2). The
  textured-object instrument becomes D3, optional.
- **geometry-central** remains reference only; the geodesic-disk `develop`
  deliberately covers the _local_ regime both demos need and nothing more.
- Three.js appears only inside `demos/`; the three libraries stay pure.

---

## 5. Working conventions

- Pure core: no DOM, no three.js, no audio in `manifold-*`.
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
