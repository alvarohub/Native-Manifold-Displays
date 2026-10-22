# Handoff — session 2 (2026-10-18 → 2026-10-23)

Repo: `alvarohub/Native-Manifold-Displays`, branch `main`.
Local server (from repo root): `python3 -m http.server 8001`.
Tests: `node tests/run.mjs` (74 passing Node tests + browser GPU suites in `tests/*.browser.js`).

---

## 1. Core Architectural Synthesis (Agreed Vision)

This session clarified the overarching vision for **Native Manifold Displays** — both as a creative-coding/hardware library and as a SIGGRAPH-style computer graphics contribution:

1. **The Intrinsic Core (`manifold-core`, `manifold-ink`, `manifold-physics`, C++ `cube_display` topology):**
   - Owns **only** the mathematical manifold: the **Atlas** of 2D **Charts** (`faceId`), the rigid **Transition Maps** ($p' = M p + t$) across edges, **Cone-Point Deficits** ($\delta_v$), and **Geodesic Tracing / Unfolding**.
   - Contains **zero** framebuffers, **zero** textures, and **zero** 3D rendering code. Portable across JavaScript (`p5.js` / `three.js`), C++ (`openFrameworks`), and microcontrollers (`Arduino` / `Adafruit_GFX`).

2. **Native Manifold Rendering Pipeline (The "Manifold GPU" for Physical Displays):**
   - On a physical manifold display (LED cube, e-ink/AMOLED skins, spatially distributed panel installations), the display consists of discrete **manifold fragments / emitters** at known chart addresses $q_k = (\text{faceId}_k, x_k, y_k)$.
   - **No intermediate rectangular chart texture framebuffers are needed** to draw 2D primitives!
   - Instead, just as a modern 2D GPU draws a thick line by generating a thin bounding rectangle and computing each pixel's perpendicular distance to the mathematical segment in the fragment shader (rather than Bresenham), a **Native Manifold GPU** works in two stages:
     - **Manifold Geometry Stage:** Given an intrinsic primitive (e.g. a geodesic segment with origin $p_0 = (\text{faceId}_0, x_0, y_0)$, 2D chart unit tangent $\mathbf{d}_0 = (d_x, d_y)$, surface length $L$, and half-width $w$), traces/unfolds a thin bounding strip across chart seams $(M, t)$ and wakes up candidate manifold fragments in each overlapped chart.
     - **Manifold Fragment Shader:** Evaluates the exact longitudinal projection $s(q)$ and **perpendicular geodesic distance** $d_\perp(q)$ (**Fermi coordinates**) or **Manifold Signed Distance Field (SDF)** (for geodesic circles, polygons, splines) directly at each fragment $q = (\text{faceId}, x, y)$, writing into the persistent **Manifold Framebuffer** (`emitterColor[k]` or barycentric *Mesh Colors* / *Ptex* grids or polygonal atlas tiles with seam gutters).
   - **The "Curved Retina" (3D-to-Manifold Projection):** Generalizes OpenGL's flat projection plane to an arbitrarily shaped manifold display (per-chart off-axis perspective frusta for polyhedral displays; geometry tessellation or per-fragment ray-casting along $\mathbf{r}(p) = \text{normalize}(\mathbf{P}(p) - \mathbf{E})$ for curved retinas).
   - Full write-up: [docs/MANIFOLD_DISPLAY_IDEA.md](docs/MANIFOLD_DISPLAY_IDEA.md#architecture-of-a-native-manifold-rendering-pipeline--framebuffer).

3. **Simulated Manifold Displays on a Computer Screen (`p5.js` / `three.js` 3D Previews):**
   - Because a computer screen is a flat monitor viewing a virtual 3D mesh, and creative coders want to reuse existing 2D drawing primitives (`triangle`, `circle`, `text`, SVG), the screen preview uses **three pragmatic rendering paths**:
     1. **Direct 3D Vector Tracing (`to3D`):** Compute intrinsic chart points `{faceId, x, y}` (`turtle`, `exp`, `fermi`, particle trajectories), lift them to `(X, Y, Z)` via `surface.to3D(p)`, and let the monitor's 3D GPU rasterize the lines at screen resolution.
     2. **Local `p5.Graphics` Artwork Stamp (`display.imprint`):** Draw into a temporary 2D `createGraphics(resX, resY)` buffer, then unfold (`mode: 'unfold'`) or orthogonally project (`mode: 'projection'`) the mesh triangles around the moving `placement` to clip and texture-map a bounded square/rectangular patch (`width` in surface units) onto the 3D mesh.
     3. **Discrete Cell / Emitter Buffer:** Maintain state per cell/triangle (`demos/life/` and sequencer) and color the 3D mesh faces or emitter markers directly.

---

## 2. What Landed in Session 2

1. **Stanford Bunny & Triangle-Cell Game of Life (`6722c02`):**
   - Added bundled low-res Stanford bunny (`demos/assets/bunny.obj`, 3,674 triangles), shared surface selector across all demos, and triangle-cell Game of Life for arbitrary imported `.obj`/`.stl` meshes.
2. **All Five Platonic Solids & Shared Surface Visualization Architecture:**
   - Added regular octahedron, dodecahedron (exact dual of icosahedron), and icosahedron presets in [manifold-core/src/mesh.js](manifold-core/src/mesh.js) and [demos/shared/meshes.js](demos/shared/meshes.js).
   - Built `surfaceEdges(surface)` in [manifold-core/src/curvature.js](manifold-core/src/curvature.js) using numerically stable `atan2(\|n_A \times n_B\|, \pm n_A \cdot n_B)` so coplanar polygon diagonals vanish cleanly in feature-edge mode.
   - Separated pure settings ([demos/shared/surfaceStyle.js](demos/shared/surfaceStyle.js)), DOM-free Three.js adapter ([demos/shared/surfaceView.js](demos/shared/surfaceView.js)), compact popover swatch controls ([demos/shared/appearance.js](demos/shared/appearance.js)), and shared `"Manifold surface"` panel ([demos/shared/surfacePanel.js](demos/shared/surfacePanel.js)) with **Faces / Edges / Vertices** across `particles`, `imprint`, and `life`.
   - Added nearest-shell surface transparency ([demos/shared/surfaceRenderer.js](demos/shared/surfaceRenderer.js)) and per-segment alpha in [demos/shared/fatLines.js](demos/shared/fatLines.js).
3. **Geodesic Motion vs. Shortest Paths Audit & Documentation:**
   - Added Part III to [docs/GEODESIC_MOTION.md](docs/GEODESIC_MOTION.md) distinguishing initial-value straightest continuation (Polthier–Schmies) from boundary-value shortest paths (MMP), documenting the `coneContinuation` frame-transport issue and the explicit `ERR_NOT_IMPLEMENTED` placeholder `shortestPath` API.
   - Improved readability, definitions ($K, \chi, \delta_v$, holonomy as a linear isometry $H \in O(2)$ including reflections on non-orientable loops, Tissot indicatrix, Darboux frame), and the dimensional/Jacobi justification of the $K L^2$ scaling rule in [docs/DRAWING_ON_SURFACES.md](docs/DRAWING_ON_SURFACES.md).
4. **`p5.js` Addon (`p5-manifold`) & Initial `p5.js` Demos:**
   - [manifold-canvas/index.js](manifold-canvas/index.js), [manifold-canvas/placement.js](manifold-canvas/placement.js), [manifold-canvas/patch.js](manifold-canvas/patch.js): renderer-independent stroke retention (`traceTurtle`), raycast placements with parallel-transported `.advance(ds)`, local isometric unfolded patches (`mode: 'unfold'`), and tangent-plane projected patches/contours (`mode: 'projection'`).
   - [p5-manifold/index.js](p5-manifold/index.js): `p5.registerAddon(manifoldAddon)` for pinned **p5 2.3.4**.
   - [demos/p5-hello/sketch.js](demos/p5-hello/sketch.js): classic global-mode `setup()` / `draw()` hello-world with moving `p5.Graphics` triangle, circle, and rectangle folding across cube seams in perspective.
   - [demos/p5-gallery/](demos/p5-gallery/): moving circle on cube (`circle.js`), moving native p5 text on torus (`text.js`), and p5 `font.textToPaths` + generated SVG heart contours on torus (`svg.js`).
   - [demos/p5-pilot/](demos/p5-pilot/): dual instance-mode regression demo.

---

## 3. Next Steps (In Agreed Order)

### Phase 1 — Dedicated Paper & `p5.js` Library Documentation
1. **Create `paper/NATIVE_MANIFOLD_DISPLAYS.md` (SIGGRAPH-style technical monograph):**
   - Consolidate and expand the theory, system architecture, and rendering pipeline into a clean, self-contained paper draft:
     - §1 Motivation & Vision (beyond flat rectangular framebuffers: emissive skins, polyhedral instruments, spatially distributed panels).
     - §2 Intrinsic Atlas & Transition Calculus (charts, rigid gluings $p' = M p + t$, non-orientable $\det M = -1$, discrete Gauss–Bonnet & cone deficits $\delta_v$).
     - §3 The Native Manifold Rendering Pipeline ("Manifold GPU"): FBO-free primitive rasterization via thin geodesic bounding strips + Manifold Fragment Shader evaluating Fermi coordinates $(s, d_\perp)$ and Manifold SDFs; Manifold Framebuffer storage models (emitter arrays, barycentric *Mesh Colors*/*Ptex*, polygonal atlas tiles with seam gutters); rotated derivatives across seams; and the **Curved Retina** (3D-to-manifold projection).
     - §4 Imprinting 2D Graphics on Curved Surfaces (*Theorema Egregium*, $K L^2$ scaling, Tissot indicatrix, Darboux frame $\kappa_g, \kappa_n, \tau_g$, and the 5 imprint constructions).
     - §5 Intrinsic Physics, Agents & Cellular Automata.
     - §6 Hardware Realization (`cube_display` MCU fast paths) & Simulated 3D Screen Previews.
2. **Create `p5-manifold/README.md` (`p5.js` Library Manual):**
   - Document the `p5-manifold` API, the distinction between native manifold rendering and the three simulated 3D screen-preview techniques (`to3D` vector lines, `p5.Graphics` local stamps, per-cell face buffers), limitations, and step-by-step examples.

### Phase 2 — Shared `p5-manifold` Capabilities for Full Demo Parity
- Extend `p5-manifold` with:
  - Shared surface catalog (all 5 Platonic solids, torus, Möbius, paper Möbius, Klein bottle, cylinder, plane, Stanford bunny, plus `.obj`/`.stl` import).
  - Face coloring modes (plain, custom per-face RGBA for Life/sequencer, and scalar curvature fields $K, H, \delta_v$), feature-edge rendering with coplanarity angle threshold, and vertex deficit markers in `p5` WEBGL.
  - 3D mouse raycast picking (`display.pick(mouseX, mouseY)`) returning `{faceId, x, y, faceIndex}` in `p5` WEBGL.
  - All 4 `manifold-ink` contour modes (`turtle`, `exp`, `fermi`, `projection`) + closure-gap reporting in `display.contours(...)`.

### Phase 3 — Port All Four Complete Demos to `p5.js`
1. **`demos/p5-life/`:** Game of Life on quad grids + Stanford bunny triangle cells in `p5.js` (with `display.pick` click-to-toggle and cell borders).
2. **`demos/p5-imprint/`:** Full `p5.js` version of Demo D2 (text, SVG, circle, grid, L-systems; `turtle` / `exp` / `fermi` / `projection` modes; closure gaps; interactive frame placement/nudging; plus `p5.Graphics` stamps).
3. **`demos/p5-particles/`:** Full `p5.js` version of Demo D1 (geodesic motion, repulsion/annealing, trails, surface links, shift-click free geodesic, curvature coloring).
4. **`demos/p5-sequencer/`:** `p5.js` version of the geodesic musical sequencer (moving heads, armed cells, WebAudio synth on cube, torus, twisted tubes, and Möbius strip).

### Untracked files to leave alone
- `demos/moebius_3D_surface.obj` and `demos/moebius_3D_surface_obj.zip` remain untracked unless requested.
