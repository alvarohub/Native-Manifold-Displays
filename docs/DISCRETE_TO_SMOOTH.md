# From the Polyhedron to the Smooth Surface — the dictionary

Standing rule for this library (Alvaro, 2026-10-17): _no formula crafted for
polyhedra without its link to real differential geometry._ Every quantity we
compute on a mesh is one of two things, and the code must say which:

1. an **exact polyhedral object** — the mesh _is_ a flat surface with cone
   points, and the quantity is exactly defined on it (angle deficit, holonomy,
   straightest geodesic, unfolding distance); or
2. an **estimator of a smooth object** — the mesh _approximates_ a smooth
   surface, and the quantity converges to the smooth one as the mesh is
   refined (Gaussian/mean curvature density, shape operator, normal field,
   geodesic distance, Laplacian).

Naming convention in `manifold-core`: words like `deficit`, `dihedral`,
`holonomy`, `unfold` denote exact polyhedral objects; `gaussianCurvature`,
`meanCurvature`, `curvatureTensor`, `normalAt` denote smooth estimators, always
with an area normalisation and a documented convergence class.

The philosophy is the one of the discrete-differential-geometry school
(Bobenko–Suris, Crane, Polthier): **discretise the theorems, not the
equations.** Gauss–Bonnet on the mesh is a theorem ($\sum_v \delta_v =
2\pi\chi$, exactly), not an approximation of one; the same holds for holonomy
= enclosed curvature. Where exactness is impossible (pointwise curvature) we
use estimators with known convergence behaviour and we say so.

---

## 1. The dictionary

| Smooth object                                                                                                  | Exact polyhedral analogue                                                                                                                                    | Estimator of the smooth quantity                                                                                                                                                                                                                   | Convergence (mesh size $h \to 0$)                                                                                                                                                                | In the code                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Metric** $g_{ij}$ (first fundamental form)                                                                   | Edge lengths; inside a chart $g = I$ (chart coordinates are isometric)                                                                                       | The polyhedral metric itself                                                                                                                                                                                                                       | Lengths of inscribed polyhedra converge to smooth lengths, $O(h^2)$ for nice meshes (Hildebrandt–Polthier–Wardetzky 2006)                                                                        | `Surface.fromMesh` — the metric is _in_ the transition maps; no $g$ array is ever needed        |
| **Geodesic** (locally shortest; $\nabla_{\dot\gamma}\dot\gamma = 0$)                                           | Straightest geodesic: straight in each chart, equal angles at a vertex (Polthier–Schmies)                                                                    | Same object                                                                                                                                                                                                                                        | Straightest → smooth geodesics under refinement; note straightest ≠ shortest through positive-deficit vertices                                                                                   | `trace`, `coneContinuation`                                                                     |
| **Levi-Civita connection / parallel transport**                                                                | Composition of the transition matrices $M$ along the path                                                                                                    | Same                                                                                                                                                                                                                                               | Same as geodesics                                                                                                                                                                                | `transportAlong`, `trace().M`                                                                   |
| **Holonomy** $\oint = \iint K\,dA$                                                                             | Product of $M$'s around a vertex = rotation by the deficit $\delta_v$                                                                                        | Same                                                                                                                                                                                                                                               | Exact (discrete Gauss–Bonnet)                                                                                                                                                                    | `holonomy`, `vertexFan`                                                                         |
| **Gaussian curvature** $K$ (density)                                                                           | Angle deficit $\delta_v = 2\pi - \sum\theta$ — an _integrated_ curvature, a measure concentrated at vertices                                                 | $K_v = \delta_v / A_v$ with $A_v$ the barycentric (or mixed-Voronoi) vertex area (Meyer et al. 2003)                                                                                                                                               | Converges **as a measure** (Cheeger–Müller–Schrader 1984; Cohen-Steiner–Morvan 2003); pointwise convergence needs well-shaped meshes — expect a few % on an icosphere, worse on skinny triangles | `vertexCones` (exact), `gaussianCurvature` (estimator)                                          |
| **Gauss–Bonnet** $\iint K + \oint \kappa_g = 2\pi\chi$                                                         | $\sum_{\text{int}} \delta_v + \sum_{\partial}(\pi - \sum\theta) = 2\pi\chi$                                                                                  | —                                                                                                                                                                                                                                                  | Exact theorem                                                                                                                                                                                    | `totalDeficit`, tests on every primitive                                                        |
| **Mean curvature** $H = (\kappa_1+\kappa_2)/2$                                                                 | Dihedral angle $\theta_e$ per edge — integrated: $\int H\,dA = \tfrac12\sum_e \ell_e\theta_e$ (Steiner's formula)                                            | $H_v = \frac{1}{4A_v}\sum_{e\ni v}\ell_e\theta_e$; or the cotan-Laplacian mean-curvature normal                                                                                                                                                    | Weak convergence of the mean-curvature vector (HPW 2006); pointwise again mesh-dependent                                                                                                         | `meanCurvature`                                                                                 |
| **Shape operator / second fundamental form** $\mathrm{II}$, principal curvatures $\kappa_{1,2}$ and directions | None (faces are flat; $\mathrm{II} = 0$ inside, singular on edges)                                                                                           | Per-face tensor from finite differences of the vertex normals along the edges, least squares, averaged to vertices in a common tangent frame (Rusinkiewicz 2004); alternative with a convergence theorem: normal cycle (Cohen-Steiner–Morvan 2003) | Rusinkiewicz: accurate in practice on reasonable meshes, no theorem; normal cycle: converges for meshes close in Hausdorff distance and normals                                                  | `curvatureTensor`, `curvatureAt(point, dir)` → $\kappa_n = d^\top \mathrm{II}\, d$              |
| **Normal field** $N$                                                                                           | Face normal (exact for the polyhedron, discontinuous)                                                                                                        | Angle-weighted vertex normals (Thürmer–Wüthrich 1998) interpolated barycentrically                                                                                                                                                                 | $O(h)$ in general, better on regular meshes                                                                                                                                                      | `face.n` (exact), `normalAt` (estimator)                                                        |
| **Geodesic distance** $d(a,b)$, **exp/log maps**                                                               | Unfolding distance along a face strip (exact polyhedral distance when the strip is the right one; MMP computes it exactly)                                   | Same object                                                                                                                                                                                                                                        | Polyhedral → smooth distance, $O(h)$ generally; measured $O(h^2)$ on icospheres (0.68% → 0.02%, subdiv 2–5)                                                                                      | `develop` (geodesic disk = discrete exponential map, Schmidt et al. 2006), `logMap`, `distance` |
| **Laplace–Beltrami** $\Delta$                                                                                  | —                                                                                                                                                            | Cotan weights (Pinkall–Polthier 1993); "no free lunch" — no discrete Laplacian has all smooth properties at once (Wardetzky et al. 2007)                                                                                                           | Weak convergence; the basis of the heat method                                                                                                                                                   | not yet (needed for heat-method distance and field smoothing)                                   |
| **Curve on a surface**: $\kappa_g, \kappa_n, \tau_g$ (Darboux frame)                                           | $\kappa_g$ = turning angle at polyline vertices, measured in the unfolded strip (exact integrated geodesic curvature); a geodesic has $\kappa_g = 0$ exactly | $\kappa_n = T^\top\mathrm{II}\,T$, $\tau_g = (\kappa_2-\kappa_1)\sin\phi\cos\phi$ ($\phi$ = angle to the first principal direction) from the estimated tensor                                                                                      | As for $\mathrm{II}$                                                                                                                                                                             | `manifold-ink` (M6): Darboux frames along imprinted curves                                      |
| **Jacobi fields / geodesic deviation** $\ddot J = -KJ$                                                         | Two nearby straightest geodesics traced and compared                                                                                                         | Finite differences of traced geodesics                                                                                                                                                                                                             | As for geodesics                                                                                                                                                                                 | demo instrument (Fermi grid non-closure)                                                        |
| **Vector fields and flows**                                                                                    | Piecewise-constant per face, transported across edges by $M$                                                                                                 | Polthier–Schmies discrete Runge–Kutta                                                                                                                                                                                                              | —                                                                                                                                                                                                | later (`manifold-physics` flows)                                                                |
| **Cone points** $\delta_v \ne 0$                                                                               | The genuine singularities of the polyhedral metric                                                                                                           | In the smooth limit, $\delta_v \to 0$ and $\delta_v/A_v \to K$: the cone point _is_ the curvature, sampled                                                                                                                                         | —                                                                                                                                                                                                | exposed as events (`trace` → `vertex`)                                                          |

Two consequences worth stating plainly:

- **A dense mesh is already the "smooth backend".** `GEODESIC_MOTION.md` §9
  says smooth surfaces need a different integrator (geodesic equation with
  Christoffel symbols). That is true for an _analytic_ surface, but for the
  demos the polyhedral backend converges to it at second order in $h$; what
  changes is only the interpretation of the outputs (table above). The
  genuinely different backend — `ParametricSurface` with state
  $(u, v, \dot u, \dot v)$, $\Gamma^k_{ij}$ from $g$, RK4 — should implement
  the _same_ interface (`trace`, `logMap`, `curvatureAt`, `normalAt`) if it
  is ever written; the atlas API is designed not to care.
- **Exact and estimated quantities answer different questions.** For an LED
  cube the angle deficit _is_ the physics (accent events at corners); for a
  scanned object the deficit is noise unless divided by area and smoothed.
  Both are legitimate; the API offers both; the demos should label which one
  they show.

---

## 2. What the smooth theory predicts for the polyhedral quantities

Measured on the unit icosphere (`node tests/bench-curvature.mjs`,
2026-10-17), error vs. the smooth sphere:

| subdiv (faces) | $K$ mean / RMS | $H$ mean / RMS | $\kappa_1$, $\kappa_2$ RMS (tensor) |
| -------------- | -------------- | -------------- | ----------------------------------- |
| 2 (320)        | 2.13% / 4.32%  | 1.49% / 4.04%  | 1.16% / 1.12%                       |
| 3 (1280)       | 0.53% / 2.04%  | 0.38% / 2.01%  | 1.31% / 1.22%                       |
| 4 (5120)       | 0.13% / 1.01%  | 0.09% / 1.00%  | 1.02% / 0.86%                       |
| 5 (20480)      | 0.03% / 0.50%  | 0.02% / 0.50%  | 0.73% / 0.61%                       |

Reading: the **integrated** estimators (means of deficit/area and Steiner
$H$) converge at second order ($\div 4$ per halving of $h$) — that is the
"converges as a measure" theorem at work; the **pointwise** RMS converges only
at first order, dominated by the 12 valence-5 vertices whose deficit is
structurally larger (the lattice defects _are_ where the curvature sits on an
icosphere — cf. IDEAS §2); the Rusinkiewicz tensor sits near 1% and barely
improves because it is fed by _estimated_ vertex normals whose error is
$O(h)$ — with analytic normals it would converge. Consequences for the demos:
smooth the pointwise fields before showing them as colour; trust means,
integrals and signs; and prefer `curvatureAt` for _directional_ questions
(it is isotropic to 3% on the sphere and exact in sign).

Useful sanity formulas (also used as test oracles):

- Sphere of radius $r$ tessellated with $V$ vertices: $\sum\delta_v = 4\pi$,
  so the mean deficit is $4\pi/V$ and $K_v \approx 1/r^2$ after area
  normalisation. $H = 1/r$, $\kappa_1 = \kappa_2 = 1/r$ in every direction.
- Cylinder of radius $r$: $K = 0$ exactly (developable: interior deficits are
  exactly zero — the polyhedral cylinder is _isometric_ to a flat strip),
  $\kappa_1 = 1/r$ around, $\kappa_2 = 0$ along the axis, $H = 1/2r$.
- Torus $(R, r)$: $K = \cos v / \big(r(R + r\cos v)\big)$ — positive on the
  outer equator ($1/(r(R+r))$), negative on the inner one
  ($-1/(r(R-r))$), zero on the top/bottom circles; $\iint K\,dA = 0 =
  2\pi\chi$.
- Geodesic circle of radius $\rho$: circumference $2\pi\rho(1 - K\rho^2/6 +
  \dots)$ — the Bertrand–Diguet–Puiseux formula; the exp-map imprint
  distortion in `DRAWING_ON_SURFACES.md`, and a way to _measure_ $K$ from
  traced geodesics alone (intrinsic, no normals): trace $n$ geodesics of
  length $\rho$ from a point, measure the polygon they end on.
- Closed loop of a dead-reckoning turtle: total turning $= 2\pi - \iint K\,dA$
  (Gauss–Bonnet for a disk) — the closure defect in turtle mode.

## 3. References for this chapter

- Meyer, Desbrun, Schröder, Barr — _Discrete Differential-Geometry Operators
  for Triangulated 2-Manifolds_, VisMath 2002/2003. Mixed-Voronoi areas,
  cotan mean-curvature normal, deficit/area Gaussian curvature.
- Cohen-Steiner, Morvan — _Restricted Delaunay Triangulations and Normal
  Cycle_, SoCG 2003. Curvature measures with a convergence theorem.
- Hildebrandt, Polthier, Wardetzky — _On the Convergence of Metric and
  Geometric Properties of Polyhedral Surfaces_, Geom. Dedicata 2006. What
  converges (metric, area, normals, mean curvature) and in which sense.
- Cheeger, Müller, Schrader — _On the Curvature of Piecewise Flat Spaces_,
  Comm. Math. Phys. 1984. Deficits converge to curvature as measures (the
  Regge-calculus justification).
- Wardetzky, Mathur, Kälberer, Grinspun — _Discrete Laplace Operators: No
  Free Lunch_, SGP 2007.
- Rusinkiewicz — _Estimating Curvatures and Their Derivatives on Triangle
  Meshes_, 3DPVT 2004. Taubin — _Estimating the Tensor of Curvature of a
  Surface from a Polyhedral Approximation_, ICCV 1995.
- Thürmer, Wüthrich — _Computing Vertex Normals from Polygonal Facets_,
  J. Graphics Tools 1998.
- Pinkall, Polthier — _Computing Discrete Minimal Surfaces and Their
  Conjugates_, Exp. Math. 1993 (cotan Laplacian).
- Bobenko, Suris — _Discrete Differential Geometry: Integrable Structure_,
  AMS 2008; Crane — _DDG: An Applied Introduction_ (the "discretise the
  theorem" philosophy).
- Polthier, Schmies — _Straightest Geodesics on Polyhedral Surfaces_ (see
  `REFERENCES.md`).
