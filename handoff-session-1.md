# Handoff — session 1 (2026-10-17 → 2026-10-18)

Repo: Native-Manifold-Displays. Branch `main`, in sync with `origin/main` at commit `2d6c76b` ("Life demo: cube + flat square universes; twisted tube moved to experiments/ pending verification").

Accent of this session: **not** a musical instrument. Three stacked JS libraries (`manifold-core`, `manifold-physics`, `manifold-ink`) plus thematic demos. Music stays an optional later reader. geometry-central stays a reference, not a dependency. Demos call libraries; they do not own geometry.

Local server (from repo root): `python3 -m http.server 8001`. Tests: `node tests/run.mjs`.

Schedule of record: [docs/IMPLEMENTATION_SCHEDULE.md](docs/IMPLEMENTATION_SCHEDULE.md). Architecture of record: [docs/LIBRARY_PLAN.md](docs/LIBRARY_PLAN.md). When they disagree, the schedule wins for sequencing, the plan for design principles.

---

## 1. Problems tackled

### 1.1 Recap and a demo-first schedule

The existing docs ([docs/LIBRARY_PLAN.md](docs/LIBRARY_PLAN.md), [docs/GEODESIC_MOTION.md](docs/GEODESIC_MOTION.md), [docs/MANIFOLD_DISPLAY_IDEA.md](docs/MANIFOLD_DISPLAY_IDEA.md), [experiments/geodesic-surfaces/](experiments/geodesic-surfaces/)) described a polyhedral atlas, but there was no implementation order aimed at demos.

Decision: keep implementing ourselves. Dense triangle meshes are the primary surface class. Point-particle physics is hand-rolled. Stock 2D-engine adapter, firmware tables, and a C++ port stay deferred.

### 1.2 Drawing on a curved surface — which constraints?

Alvaro asked what is worth preserving when imprinting a 2D curve (robot pen normal to the surface; 3D-print toolpaths; Untethered Robotic Printer Heads).

Written up in [docs/DRAWING_ON_SURFACES.md](docs/DRAWING_ON_SURFACES.md). The modes that landed in code:

- **turtle** — dead reckoning (lengths + steering). What a wheeled robot actually does. Closed curves report a closure gap (Gauss–Bonnet).
- **exp** — exponential map / decal from one anchor.
- **fermi** — geodesic graph paper along a baseline. Parallels converge where K ≠ 0.
- **projection** — extrinsic raycast (baseline, not intrinsic).
- **spring relaxation** — noted, not built (milestone M8).

Later notes (do not implement until asked): constraint modes as spring networks with a **reach** knob (distance springs vs zero-rest conformal springs); image vs reading support (Serial Paintings); a `SurfaceCanvas` adapter so any 2D drawing API draws into a surface patch. All in [IDEAS.md](IDEAS.md) §§4b–4d.

### 1.3 Discrete geometry must stay linked to smooth differential geometry

[docs/GEODESIC_MOTION.md](docs/GEODESIC_MOTION.md) §9 correctly said smooth surfaces were out of scope for the polyhedral lab. Alvaro did not want formulas that only make sense on polyhedra.

Answer, written in [docs/DISCRETE_TO_SMOOTH.md](docs/DISCRETE_TO_SMOOTH.md): every quantity is either an exact polyhedral object or a named estimator of a smooth one. Gaussian curvature = angle deficit / area; mean curvature from dihedral angles; curvature tensor via Rusinkiewicz 2004; metric is the identity inside a chart.

### 1.4 Particles on a surface, including annealing and visible connections

D1: particles confined to the mesh, geodesic pair forces, trails, annealing. Alvaro predicted cube local minima (four particles mid-edge on opposite faces) and asked to see trajectories. Implemented as temperature + an anneal button; the basin story is in [IDEAS.md](IDEAS.md) §2. Not over-elaborated.

Follow-ups that were real bugs or missing controls:

- Surface and edge opacity sliders; trail visibility slider.
- Connections: k-nearest by surface distance, drawn as 3D chords and/or geodesic segments (so 12 repellers on a sphere draw an icosahedron).
- **Jitter of on-surface connections.** Endpoints oscillated because each pair was traced from a slightly different unfolding / orientation each frame. Fix: `geodesicBetween` (shooting correction) plus a canonical pair orientation. Commit `62319f9`.
- Torus repellers often do not converge. Left as a question, not an investigation. Hypotheses in [IDEAS.md](IDEAS.md): zero modes of the flat metric vs forces that only see a single unfolding. Commit `c8f725f`.

### 1.5 Architectural separation

Alvaro (C++ minded) wanted demos to only *use* the library, and new dynamics to land as new methods or new classes, not patches inside a demo.

Rule now in [docs/IMPLEMENTATION_SCHEDULE.md](docs/IMPLEMENTATION_SCHEDULE.md) §5: dependency direction is `manifold-core` ← `manifold-physics` ← `manifold-ink` ← demos. Shared three.js glue lives in [demos/shared/](demos/shared/), not copied between demos. There is **no sound/sequencer demo** in this repo yet; that stays Cube Carillon's own repo.

### 1.6 Mesh import

Dropping a Klein-bottle STL did not work (no visible Load affordance; that particular file is also a bad mesh). Added Load buttons and `importMesh` / `cleanMesh`. Alvaro said not to chase that STL. A copy sits at [demos/Klein Bottle.STL](demos/Klein%20Bottle.STL). Presets were added instead, including a parametric Klein bottle.

### 1.7 Möbius presets, L-systems, handedness

Requested: a flat-looking Möbius preset (for the separate Möbius Human Equalizer project — do not develop that project here) and L-systems as turtle programs.

Built: `mobiusBandMesh`, L-system contours in `manifold-ink`, imprint-demo source. Handedness bug found on the band: some transitions have det M = −1, so "turn left" must be multiplied by a running `hand`. Seam-straddling square gap went from 0.40 to 0.0017.

### 1.8 Keep projects separate; add a Life demo; keep a free geodesic

Alvaro insisted other projects stay in their own repos. This repo only prototypes and lists them.

Built:

- Free geodesic particle in the particles demo (forces can be off).
- Game of Life as its **own** demo, not buried inside imprint. Rectangular global grid on cylinder / torus / Möbius / Klein, then cube and flat square.
- Project list: [docs/PROJECTS_USING_THE_LIBRARY.md](docs/PROJECTS_USING_THE_LIBRARY.md) (Cube Carillon, Möbius Human Equalizer, Viva Voce, scoreLight, Untethered Robotic Printer Heads, myBlobChain, Serial Paintings, LED cube / Qbots).

Noted, not built: Voronoi Life from relaxed particles; irregular neighbourhoods; musical score as Life on the cube. See [IDEAS.md](IDEAS.md) §8.

### 1.9 Viewer: drag-ball, appearance, geodesic that hits the rim

Particles demo: orbit-by-axis felt wrong (not about the object centre). Replaced with a drag-ball plus a spin dial. Appearance panel: sphere / disk / hidden particles, colours, line widths. Disks were too big and too colourful; sizes and colours are now choosable. Alvaro then asked to stop polishing render and return to geometry.

Rim-parallel heading on the **smooth** Möbius always hits the border. That is geometry, not a bug: the standard parametrisation is not developable (K ≈ −1/(4R²) on the centreline; the centreline itself has geodesic curvature).

### 1.10 Paper Möbius crumples

A paper band should be developable (cut it and it lies flat). The smooth preset is a twisted ruled surface, not paper. Alvaro's Equalizer solved a different problem (springs with rest length = the formula band), so it never asked for developability and never crumpled.

What was built:

- `paperMobiusMesh` — isometric embedding of a flat strip (error ~1e-10). Rim-parallel lines loop. It looks **pleated** because it can only fold on fixed diagonals.
- Sliding-ruling prototype in [experiments/paper-mobius/sliding-rulings.mjs](experiments/paper-mobius/sliding-rulings.mjs): iso ~3e-4, folds ~23° rms, not smooth. Parked. Proper route is the literature (Sadowsky 1930; Starostin & van der Heijden 2007), not more ad-hoc relaxation.

### 1.11 Life universes: cube, flat square, twisted tube

Requested: cube and a twisted square tube (like [experiments/geodesic-surfaces/](experiments/geodesic-surfaces/)) in the Life dropdown, plus a thin 180°-twisted rectangular tube as a non-crumpling Möbius-like sequencer surface. Shape choice should eventually be shared by all demos.

Done: cube and flat square are in the Life menu. The twisted tube was started, then **removed from the Life dropdown and from core** and parked in [experiments/twisted-tube/](experiments/twisted-tube/). Reason: `orientTriangles` reports the welded odd-twist mesh as orientable, which contradicts the intrinsic frame test (det M = −1 after one loop). Do not promote it until that disagreement is resolved. See the header of [experiments/twisted-tube/selftest.mjs](experiments/twisted-tube/selftest.mjs).

Alvaro asked whether this was new code or a rewrite of working code. It is new primitives plus a new demo; particles and imprint were not rewritten.

### 1.12 Open question left at the end of the session (not answered in chat)

Alvaro asked why the Life width/height sliders seemed capped (he remembered 48 and 120), and how the grid is laid on the surface — Fermi frame? local charts? does the scan change frame from cell to cell?

**Slider facts, as of `2d6c76b`, in [demos/life/index.html](demos/life/index.html):**

- `#nu` "cells around": min 12, **max 160**, step 2, default 80.
- `#nv` "cells across": min 4, **max 48**, step 1, default 14.

So only "across" is capped at 48. "Around" is already 160, not 120. The requested change — **both max 128** — was **not applied**.

**How the grid is actually built** (this is the answer to record):

It is **not** a Fermi frame, and it is **not** a global 2D coordinate system pushed onto an arbitrary mesh.

1. Each universe is a parametric quad mesh from a core primitive: `mobiusBandMesh`, `cylinderMesh`, `torusMesh`, `kleinBottleMesh`, `cubeMesh`, `planeMesh` ([manifold-core/src/mesh.js](manifold-core/src/mesh.js)). The (u, v) parameters are already a regular grid in the generator. That is why cylinder, torus, Möbius, Klein, and the flat square look undeformed: the combinatorics are a rectangle, and the embedding is the parametric formula. Distortion of *lengths* still exists (torus tube radius, Möbius width), but neighbouring cells stay neighbours by construction of the parameter domain, including the seam (Möbius reverses j across the seam; Klein does the same).
2. Each quad is two triangles. [demos/life/main.js](demos/life/main.js) maps triangle index → cell with `t >> 1`.
3. Neighbours come from the mesh, not from a scan direction: `cellAdjacency(mesh, cellOf, { by })` in [manifold-core/src/mesh.js](manifold-core/src/mesh.js). `by: 'vertex'` ≈ Moore (share a corner), `by: 'edge'` ≈ von Neumann (share an edge). The rim of an open band has degree 5 because those cells have fewer vertex-neighbours. No special-case code.
4. The rule in [demos/life/life.js](demos/life/life.js) (`lifeStep`) counts live neighbours on that graph. It does not transport a frame, and it does not walk charts. Locality is combinatorial.
5. The cube is the exception that matches Alvaro's intuition. `SURFACES.cube` **ignores `nv`** and sets `div = round(nu / 10)`, then `cubeMesh(2, div)`. Cells are face-major quads (`6 * div * div`), reported as dims `[6*div, div]`. Interior faces are a regular grid. At corners, vertex-sharing pulls in cells from adjacent faces, and the angle sum is 270° not 360°. The rule does not know that; `cellAdjacency` does. A Fermi frame cannot be extended through those cone points without a cut, which is why this demo does not try.

Seeding (spaceship, glider, R-pentomino) assumes generator order: `i` along the band, `j` across. On the cube that assumption is only roughly true (face-major), so pattern placement there is approximate.

---

## 2. Code and docs changed

### Libraries

| Path | What landed |
| --- | --- |
| [manifold-core/index.js](manifold-core/index.js) | Public exports |
| [manifold-core/src/vec.js](manifold-core/src/vec.js) | Small vector helpers |
| [manifold-core/src/mesh.js](manifold-core/src/mesh.js) | OBJ/STL parse, weld, orient, `cleanMesh`, `importMesh`, stats, primitives (cube, icosphere, torus, cylinder, plane, tetrahedron, Möbius, paper Möbius, Klein), `cellAdjacency` |
| [manifold-core/src/surface.js](manifold-core/src/surface.js) | `Surface.fromMesh` / `fromCharts`, cones, `stepHead` |
| [manifold-core/src/geodesic.js](manifold-core/src/geodesic.js) | `trace`, holonomy, cone continuation, `develop`, `logMap`, `distance`, `geodesicBetween` |
| [manifold-core/src/curvature.js](manifold-core/src/curvature.js) | K, H, curvature tensor, `curvatureAt` |
| [manifold-core/src/fields.js](manifold-core/src/fields.js) | Vertex/face fields, barycentric sample, gradient |
| [manifold-core/src/raycast.js](manifold-core/src/raycast.js) | Möller–Trumbore, used by projection imprint |
| [manifold-physics/index.js](manifold-physics/index.js) | Public exports |
| [manifold-physics/src/particles.js](manifold-physics/src/particles.js) | `ParticleSystem`, pair/spring/field forces, annealing, neighbour queries |
| [manifold-ink/index.js](manifold-ink/index.js) | Public exports |
| [manifold-ink/src/curves.js](manifold-ink/src/curves.js) | SVG path, contour resample, L-systems |
| [manifold-ink/src/imprint.js](manifold-ink/src/imprint.js) | Frame, turtle/exp/fermi/projection, `hand`, `liftContour` |

### Demos

| Path | What landed |
| --- | --- |
| [demos/particles/index.html](demos/particles/index.html), [demos/particles/main.js](demos/particles/main.js) | D1: forces, anneal, connections, free geodesic, import, appearance |
| [demos/imprint/index.html](demos/imprint/index.html), [demos/imprint/main.js](demos/imprint/main.js) | D2: text/SVG/L-system, four modes, frame nudges, export |
| [demos/life/index.html](demos/life/index.html), [demos/life/main.js](demos/life/main.js), [demos/life/life.js](demos/life/life.js) | Life on a cell graph; surfaces Möbius, cylinder, torus, Klein, cube, flat square |
| [demos/shared/viewer.js](demos/shared/viewer.js) | Renderer, meshes, rays, segment buffers |
| [demos/shared/ballControls.js](demos/shared/ballControls.js) | Drag-ball + spin dial |
| [demos/shared/fatLines.js](demos/shared/fatLines.js) | Wide coloured lines |
| [demos/shared/meshes.js](demos/shared/meshes.js) | Shared mesh presets for demos |

### Experiments (not library)

| Path | Status |
| --- | --- |
| [experiments/geodesic-surfaces/](experiments/geodesic-surfaces/) | Pre-existing lab. Square-tube quotients live here (`createSquareTube`). Still the reference for the twisted square torus. |
| [experiments/paper-mobius/sliding-rulings.mjs](experiments/paper-mobius/sliding-rulings.mjs) | Sliding-ruling prototype. Parked. |
| [experiments/twisted-tube/tube.mjs](experiments/twisted-tube/tube.mjs), [experiments/twisted-tube/selftest.mjs](experiments/twisted-tube/selftest.mjs) | Rectangular tube with half-twists. Not in Life, not in core, until orientability is settled. |

### Docs

| Path | Role |
| --- | --- |
| [docs/IMPLEMENTATION_SCHEDULE.md](docs/IMPLEMENTATION_SCHEDULE.md) | What gets built, in what order. M0–M7 done. M8 and M9 open. |
| [docs/DRAWING_ON_SURFACES.md](docs/DRAWING_ON_SURFACES.md) | Imprint modes and robot/print consumers |
| [docs/DISCRETE_TO_SMOOTH.md](docs/DISCRETE_TO_SMOOTH.md) | Estimators vs exact polyhedral quantities |
| [docs/REFERENCES.md](docs/REFERENCES.md) | Papers and links (LSCM, Serial Paintings, Sadowsky, …) |
| [docs/PROJECTS_USING_THE_LIBRARY.md](docs/PROJECTS_USING_THE_LIBRARY.md) | Other repos that will import this library |
| [IDEAS.md](IDEAS.md) | Living notebook. §§1–8 written this session |
| [README.md](README.md) | Points at the libraries and demos |

### Tests

[tests/run.mjs](tests/run.mjs) plus [tests/mesh.test.mjs](tests/mesh.test.mjs), [tests/surface.test.mjs](tests/surface.test.mjs), [tests/geodesic.test.mjs](tests/geodesic.test.mjs), [tests/curvature.test.mjs](tests/curvature.test.mjs), [tests/physics.test.mjs](tests/physics.test.mjs), [tests/ink.test.mjs](tests/ink.test.mjs), [tests/import.test.mjs](tests/import.test.mjs), [tests/mobius-lsystem.test.mjs](tests/mobius-lsystem.test.mjs), [tests/life.test.mjs](tests/life.test.mjs). Benches: [tests/bench-geodesic.mjs](tests/bench-geodesic.mjs), [tests/bench-curvature.mjs](tests/bench-curvature.mjs).

### Milestones

- M0–M3 core atlas, geodesics, curvature: commits `627f2d8`, `5cc029f`, `ca925b0`.
- M4 physics: `e0523e0`.
- M5 particles demo: `83c2138`, `d135500`.
- Connection jitter fix: `62319f9`.
- M6–M7 ink + imprint demo: `8c42244`, `a8653ea`.
- Import + Klein primitive: `ce2592e`.
- Möbius / L-systems / handedness: `fdf3b72`.
- Life + free geodesic: `4a28a5f`.
- Drag-ball, appearance, paper Möbius: `cb189c1`.
- Life cube + plane; tube parked: `2d6c76b`.

### Not committed

`demos/moebius_3D_surface.obj` and `demos/moebius_3D_surface_obj.zip` are untracked. Do not commit the zip unless Alvaro wants that mesh in the repo.

---

## 3. Immediate next steps

In the order Alvaro left them. Do not start M8 or the webpage until he says so.

1. **Life sliders — done (2026-10-18).** Both `#nu` and `#nv` now max out at 128 in [demos/life/index.html](demos/life/index.html); minimums, steps and defaults are unchanged. Regression coverage is in [tests/life.test.mjs](tests/life.test.mjs). The cube path is unchanged: it ignores `nv` and uses `round(nu/10)`, so `nu = 128` makes a 13×13 grid per face (6×169 = 1,014 cells) and still does not give an independent "across" control. If he wants both axes on the cube, that is a separate small change in `SURFACES.cube` in [demos/life/main.js](demos/life/main.js).
2. **Explain the grid in the Life panel — done (2026-10-18).** The hint in [demos/life/index.html](demos/life/index.html) distinguishes preset quad cells, selected corner/edge adjacency and the absence of a Fermi frame. Generic imported-surface layouts are discussed in [IDEAS.md](IDEAS.md) §8; no generic import mode has been implemented.
3. **Twisted rectangular tube.** Finish [experiments/twisted-tube/selftest.mjs](experiments/twisted-tube/selftest.mjs). Decide whether `orientTriangles` or the mesh is wrong for odd half-twists. Only then promote `twistedTubeMesh` into [manifold-core/src/mesh.js](manifold-core/src/mesh.js) and add it to the Life (and later shared) surface list. Target shape he asked for: 180° twist, rectangle with a very small height, so it reads as a band without the paper-Möbius crumple.
4. **Do not** keep iterating the paper Möbius unless he asks. Pleated `paperMobiusMesh` is the honest isometric preset; smooth paper is a research solver.
5. **Sequencer demo** was requested and not started. It should be its own thematic demo (heads = particles on the Life cell graph, or free geodesics reading armed cells), reusing [demos/life/](demos/life/) adjacency and [manifold-physics/src/particles.js](manifold-physics/src/particles.js). Do not modify Cube Carillon in place. A Möbius sequencer waits on a non-crumpling band (item 3, or the parked paper band).
6. **Shared surface menu — done (2026-10-18, explicitly requested ahead of the tube).** All three demos use [demos/shared/meshes.js](demos/shared/meshes.js), including a bundled [Stanford bunny OBJ](demos/assets/bunny.obj) (1,839 vertices / 3,674 triangles). Life-specific quad layouts are metadata in that catalog; [demos/life/surfaces.js](demos/life/surfaces.js) supplies triangle layouts for other presets and uploads. Life now has OBJ/STL import, triangle-aware borders/colours/picking, and random/empty seeds on irregular layouts. Grid-only controls are disabled there. No Voronoi/remeshing work was started. Asset provenance is in [docs/REFERENCES.md](docs/REFERENCES.md); regression coverage is in [tests/demo-meshes.test.mjs](tests/demo-meshes.test.mjs).
7. **Scheduled but not started:** M8 relaxed text (springs, [IDEAS.md](IDEAS.md) §4) and M9 GitHub Pages presentation ([docs/REFERENCES.md](docs/REFERENCES.md), [docs/PROJECTS_USING_THE_LIBRARY.md](docs/PROJECTS_USING_THE_LIBRARY.md)). He explicitly preferred the presentation page in a later clean-up session.
8. **Klein STL.** Leave it. Import path exists; that file is a bad model.

### Working agreements to keep

- Explain the problem before patching. Ask him when a sketch or a physical fact is faster than forensics.
- Append ideas to [IDEAS.md](IDEAS.md); do not bury them in chat.
- Other projects (Möbius Equalizer, Viva Voce, Cube Carillon, scoreLight) are developed in their own repos. This repo only prototypes and lists them.
- Run `node tests/run.mjs` before committing. He tests demos by hand.
- Pure libraries: no DOM, no three.js, no audio under `manifold-*`.
