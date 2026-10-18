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
- **Lévy, Petitjean, Ray, Maillot** — _Least Squares Conformal Maps for
  Automatic Texture Atlas Generation_, SIGGRAPH 2002. Conformality as a
  quadratic (spring-like) energy — the "zero-rest-length springs" reading of
  the angle-preserving mode (IDEAS §4b).
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

### Cell layouts and connectivity optimization (research directions)

- **Botsch, M., Kobbelt, L.** — _A Remeshing Approach to Multiresolution Modeling_ (2004).
  <https://diglib.eg.org/handle/10.2312/SGP.SGP04.185-196>.
  Local split/collapse/flip operations and relaxation; practical algorithm overview:
  <https://www.pmp-library.org/remeshing.html>. Valence equalization concerns mesh vertices,
  not automatically the neighbour count of face-cells.
- **Bommes, D., Zimmer, H., Kobbelt, L.** — _Mixed-Integer Quadrangulation_, ACM TOG 2009.
  <https://doi.org/10.1145/1531326.1531373>. Direction-field-guided quad layouts with singularities;
  relevant to retaining square-grid-like corner neighbourhoods.
- **Du, Q., Faber, V., Gunzburger, M.** — _Centroidal Voronoi Tessellations: Applications and
  Algorithms_, SIAM Review 1999. <https://doi.org/10.1137/S0036144599352836>.
  Coverage-based relaxation rather than a guarantee of fixed cell degree; intrinsic surface
  versions require geodesic distances and surface-constrained updates.
- **Mathieson, L., Szeider, S.** — _Editing graphs to satisfy degree constraints: A parameterized
  approach_, JCSS 2012. <https://doi.org/10.1016/j.jcss.2011.02.001>.
  Complexity of degree-constrained graph editing, not a surface-preserving remeshing algorithm.

### Existing software references

- **geometry-central** (Sharp, Crane et al.) — <https://geometry-central.net>.
  Production-grade intrinsic geometry on halfedge meshes; our API vocabulary
  (`traceGeodesic`, `logMap`, `SurfacePoint`) is borrowed from it. See
  `MANIFOLD_DISPLAY_IDEA.md` for the algorithm map.
- **toxiclibs.js** (Verlet physics, used in myBlobChain) and **opentype.js**
  (glyph outlines) — the text-to-contours pipeline D2 reuses.
- **three.js** — rendering in the demos only.

### Sample mesh: Stanford bunny

- Original scan/model: **Stanford Computer Graphics Laboratory**,
  [Stanford 3D Scanning Repository](https://graphics.stanford.edu/data/3Dscanrep/#bunny).
- Low-resolution distribution: [Mikola Lysenko's `bunny`](https://github.com/mikolalysenko/bunny).
  Its [package metadata](https://github.com/mikolalysenko/bunny/blob/master/package.json)
  declares **Public Domain**.
- Bundled data source: [`index.js` at revision
  `d70c5da8e02ee56d20ec3360e0859f37fada81ba`](https://github.com/mikolalysenko/bunny/blob/d70c5da8e02ee56d20ec3360e0859f37fada81ba/index.js).
  Converted its `positions` and `faces` arrays to [bunny.obj](../demos/assets/bunny.obj),
  rotating Y-up to Z-up with `(x, y, z) -> (x, -z, y)`. No further decimation.
  **1,839 vertices / 3,674 triangles**, one closed orientable component,
  Euler characteristic 2; no non-manifold edges or degenerate faces in the import check.
  Demos normalize the mesh to their viewing scale via the same importer used for uploads.

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
- **Serial Paintings / Back and Forth – pneumatic anadrome** (2013–2020, with
  D. Saakes and C. Sandor; SIGGRAPH Asia 2020 Art Gallery) —
  <https://alvarocassinelli.com/serial-paintings/>. The canvas as a
  decrypting/encrypting mechanism: a 1-D bead string becomes an image only
  through its support (spiral, space-filling fractal). The "image vs reading
  support" theme behind the imprint modes (IDEAS §4c).
- **myBlobChain** (2026) — Verlet chains along glyph outlines with a cursor
  "enzyme lens"; the spring-text machinery D2 ports to the surface.
- **VivaVoce** (2020 → 2026 web) — flocking words; the "emergent vortex"
  write-up is the model for how we document emergent behaviour here.

## 4. Where this document goes

The project page (schedule M9) is built from this file plus `IDEAS.md` and
the demos: \_background → the atlas idea → what is new (display + interaction

- fast paths, see `MANIFOLD_DISPLAY_IDEA.md` "What would be our
  contribution?") → demos → references → related projects\_.
