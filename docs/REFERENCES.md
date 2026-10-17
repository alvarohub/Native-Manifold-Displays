# References and related work

Curated bibliography for the project page / write-up. Keep it honest and
short: what we actually build on, plus the links a reader needs. Local PDFs of
the starred items live outside the repo in `../REFERENCES/` (not committed).

## 1. Theory we stand on

- **Polthier, K., Schmies, M.** — _Straightest Geodesics on Polyhedral
  Surfaces_. Mathematical Visualization (1998) and SIGGRAPH 2006 Courses
  "Discrete Differential Geometry", pp. 30–38.
  <https://dl.acm.org/doi/10.1145/1185657.1185664> ★ (both versions in
  `../REFERENCES/`). The tracing primitive: unique straightest continuation,
  parallel transport, discrete Runge–Kutta on polyhedra.
- **Crane, K.** — _Discrete Differential Geometry: An Applied Introduction_
  (CMU course notes). <https://www.cs.cmu.edu/~kmcrane/Projects/DDG/> ★ The
  modern textbook: angle defect = Gaussian curvature, Gauss–Bonnet, discrete
  exterior calculus.
- **Sharp, N., Crane, K.** — _You Can Find Geodesic Paths in Triangle Meshes
  by Just Flipping Edges_ (FlipOut), SIGGRAPH Asia 2020.
  <https://nmwsharp.com/research/flip-geodesics/> ★ Geodesic _shortening_ by
  intrinsic edge flips (reference for a later "straighten this stroke").
- **Mitchell, Mount, Papadimitriou** — _The Discrete Geodesic Problem_, SIAM
  J. Comput. 16(4), 1987. Exact polyhedral shortest paths (MMP).
- **Crane, Weischedel, Wardetzky** — _Geodesics in Heat_, ACM TOG 2013.
  <https://www.cs.cmu.edu/~kmcrane/Projects/HeatMethod/> Approximate
  distance fields from two linear solves.
- **Sharp, Soliman, Crane** — _The Vector Heat Method_, ACM TOG 2019.
  Parallel transport and log maps at scale; geodesic centroidal Voronoi.
- **Schmidt, R., Grimm, C., Wyvill, B.** — _Interactive Decal Compositing with
  Discrete Exponential Maps_, SIGGRAPH 2006.
  <https://www.dgp.toronto.edu/~rms/pubs/ExpMapSIG06.html> Local exp-map
  parameterization for placing decals/text on meshes — ancestor of our
  exp-map imprint mode.
- **Rusinkiewicz, S.** — _Estimating Curvatures and Their Derivatives on
  Triangle Meshes_, 3DPVT 2004. Per-face curvature tensor; what `curvatureAt`
  will use.
- **Knöppel, Crane, Pinkall, Schröder** — _Globally Optimal Direction Fields_,
  SIGGRAPH 2013. Smoothest n-direction fields with singularities (the "no
  global up" problem).
- **Sawhney, R., Crane, K.** — _Boundary First Flattening_, ACM TOG 2017.
  Conformal flattening with boundary control (the conformal imprint mode we
  do not implement).
- **Abelson, H., diSessa, A.** — _Turtle Geometry: The Computer as a Medium
  for Exploring Mathematics_, MIT Press 1980. Turtles on curved surfaces,
  closure defects, total curvature — the turtle imprint mode.
- **do Carmo, M.** — _Differential Geometry of Curves and Surfaces_ (1976).
  Darboux frame, geodesic curvature, Gauss–Bonnet, Jacobi fields.
- **Snyder, J. P.** — _Map Projections: A Working Manual_, USGS Prof. Paper
  1395 (1987). <https://pubs.usgs.gov/pp/1395/report.pdf> Distortion
  taxonomy and Tissot's indicatrix — drawing on a surface is cartography
  backwards.
- **Regge, T.** — _General relativity without coordinates_, Nuovo Cimento 1961. Curvature as vertex deficit; background for "massive particles that
  bend the display".
- **Thomson problem / spherical codes** — e.g. Wales, D. J., Ulker, S.,
  _Structure and dynamics of spherical crystals characterized for the Thomson
  problem_, Phys. Rev. B 2006; Bowick, Giomi, _Two-dimensional matter: order,
  curvature and defects_, Adv. Phys. 2009 (defects forced by curvature —
  the D1 lattice).

## 2. Software we learned from (not dependencies)

- **geometry-central** (Sharp, Crane et al.) — <https://geometry-central.net>.
  Production-grade intrinsic geometry on halfedge meshes; our API vocabulary
  (`traceGeodesic`, `logMap`, `SurfacePoint`) is borrowed from it. See
  `MANIFOLD_DISPLAY_IDEA.md` for the algorithm map.
- **toxiclibs.js** (Verlet physics, used in myBlobChain) and **opentype.js**
  (glyph outlines) — the text-to-contours pipeline D2 reuses.
- **three.js** — rendering in the demos only.

## 3. Alvaro's related projects (the portfolio thread)

- **Cube Carillon / CubicMonome topological sequencer** (2007 Processing →
  2026 web + LED cube) — <https://github.com/alvarohub/CubicCarillon_topologicalSequencer>.
  The origin: heads on geodesics of a cube, edge crossings as events; the
  atlas model was extracted from it.
- **scoreLight** (2009–2012) — <https://www.alvarocassinelli.com/scorelight>.
  Laser pickup reading drawings: curvature → FM, corners → percussion, colour
  → timbre. NIME 2010; CHI 2012 Interactivity (scoreLight & scoreBots). The
  "reader on a surface" lineage (IDEAS §1).
- **Sticky Light** (2007–) — <https://alvarocassinelli.com/sticky-light/>.
  Laser spot that clings to contours; the tracking technology behind
  scoreLight (smart laser scanner, Ishikawa lab).
- **Untethered Robotic Printer Heads** (2011) —
  <https://alvarocassinelli.com/unthethered-robotic-printer-heads/>. Swarm of
  wheeled/flying printing heads for large and curved surfaces; the robot
  consumer of `manifold-ink` (`DRAWING_ON_SURFACES.md` §2).
- **Qbots: nonlocality in swarming nanobots** —
  <https://alvarocassinelli.com/qbots-swarming-nanobots-and-emergent-behaviour-through-a-non-local-scalar-field/>.
  Emergent behaviour through a shared scalar field — kin to particles reading
  a field on the surface.
- **myBlobChain** (2026) — Verlet chains along glyph outlines with a cursor
  "enzyme lens"; the spring-text machinery D2 ports to the surface.
- **VivaVoce** (2020 → 2026 web) — flocking words; the "emergent vortex"
  write-up is the model for how we document emergent behaviour here.

## 4. Where this document goes

The project page (schedule M9) is built from this file plus `IDEAS.md` and
the demos: \_background → the atlas idea → what is new (display + interaction

- fast paths, see `MANIFOLD_DISPLAY_IDEA.md` "What would be our
  contribution?") → demos → references → related projects\_.
