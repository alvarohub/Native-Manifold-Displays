# Native Manifold Displays

A display that lives **on** a manifold — not a flat framebuffer texture-mapped
onto a surface, but a device whose pixel addressing, motion, and physics are
intrinsic to the surface itself: charts, transition maps across chart edges,
curvature concentrated at vertices, and an emitter layout decoupled from the
geometry.

This repo holds the reusable library and the math lab. The sister project —
the Cube Carillon topological sequencer (web instrument + physical LED cube
firmware that *consume* this library) — lives at
[alvarohub/CubicCarillon_topologicalSequencer](https://github.com/alvarohub/CubicCarillon_topologicalSequencer).

## Contents

- `firmware-lib/` — the hardware display layer (`cube_display`): virtual
  layered displays, LED/emitter mapping, and cube topology with precomputed
  integer edge gluings. PlatformIO library format, firmware-portable (no heap,
  fixed tables).
- `experiments/geodesic-surfaces/` — the atlas lab: a standalone web playground
  for heads moving on arbitrary charted surfaces (flat torus, square tubes
  with end twists, Möbius strip, icosahedral sphere). Run from the repo root:
  `python3 -m http.server 8001` then open
  `http://localhost:8001/experiments/geodesic-surfaces/`.
- `docs/` — theory and design notes:
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
