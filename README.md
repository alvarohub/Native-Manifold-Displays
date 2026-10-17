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
- `demos/particles/` — **Demo D1**: particles on any mesh (drop an .obj/.stl),
  forces along the surface, annealing, trails, connections, colour by what
  each particle reads.
- `demos/imprint/` — **Demo D2**: text / SVG drawn on any mesh in the four
  imprint modes, movable frame, closure gaps, Darboux/OBJ export.
  Run `python3 -m http.server 8001` from the repo root and open
  `http://localhost:8001/demos/particles/` or `.../demos/imprint/`.
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
