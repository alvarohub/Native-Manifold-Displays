# Drawing on a Curved Surface — what can be preserved, and what cannot

Design note for `manifold-ink` (schedule M6–M8). Written 2026-10-17 to answer
the question: _given a 2D drawing (curves, text) and a surface, what are the
interesting constraints of "imprinting" it, and which ways of imprinting are
worth implementing?_ Motivating application: a robot drawing on an object with
a pen held normal to the surface.

---

## 1. The problem in one sentence

An imprint is a map $\varphi : U \subset \mathbb{R}^2 \to S$ from a flat
drawing domain to the surface. The drawing is a set of curves $\gamma_i$ in
$U$; the result is $\varphi \circ \gamma_i$ on $S$. Everything interesting
follows from one theorem:

> **Theorema Egregium (Gauss).** Gaussian curvature $K$ is intrinsic. A map
> that preserves lengths (an isometry) also preserves $K$; the plane has
> $K = 0$, so **no distortion-free imprint exists wherever $K \neq 0$.**

So "draw on the surface" is never one operation. It is a _choice of what to
preserve_, and every choice is a different map. The menu is the same as in
cartography (Mercator, equal-area, azimuthal…) run backwards: instead of
flattening the sphere onto paper we press the paper onto the surface, and the
Tissot indicatrix of the chosen projection is exactly the distortion the
letters will suffer.

### The exception that makes polyhedra special

Faces, edges and extrusions are **developable** ($K = 0$ everywhere except at
cone points). Unfolding is an exact isometry, so on a cube, a tube or a cone
the drawing can be imprinted with **zero distortion** — this is the clip+fold
method already proven for head sprites (Carillon IDEAS §2). All the curvature
sits at the vertices (angle deficit $\delta_v$, $\sum_v \delta_v = 2\pi\chi$),
so distortion appears only when a stroke's unfolding wraps around a vertex:
the figure _splits_ (Carillon IDEAS §3). For smooth meshes every vertex has a
small deficit and the same mechanism, applied densely, produces smooth
distortion — the mesh is the general case, the cube is the sparse case.

### Rule of thumb: size versus curvature radius

For a drawing of size $L$ on a region of curvature $K$, all the distortions
below scale like $K L^2$ (relative length error of a geodesic circle of radius
$r$ is $\approx K r^2 / 6$; the closure defect of a loop is $\approx K \cdot
\text{area}$). Text much smaller than the curvature radius $1/\sqrt{|K|}$ looks
undistorted in **every** mode; the mode only matters when $L \sim 1/\sqrt{|K|}$.
This is the knob to expose in the demo: scale the text up until the modes
diverge.

---

## 2. What a curve on a surface has, that a planar curve does not

A planar curve is described by arc length $s$ and signed curvature $\kappa(s)$
(its _steering_). A curve on a surface carries three scalars — the **Darboux
frame** $(T, N_s \times T, N_s)$ with $N_s$ the surface normal:

| quantity                      | meaning                                                       | who decides it                 |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------ |
| geodesic curvature $\kappa_g$ | how much the curve turns _within_ the surface (steering)      | the drawing                    |
| normal curvature $\kappa_n$   | how much the surface bends the curve out of its tangent plane | the surface, in that direction |
| geodesic torsion $\tau_g$     | how the surface normal twists along the curve                 | the surface                    |

This is the precise statement of the robot problem: a crawling robot with a
pen normal to the surface controls **only** $\kappa_g$ (its wheels / steering)
and arc length (its odometer). $\kappa_n$ and $\tau_g$ are _imposed_ by the
object — they are what the robot's suspension / wrist must comply with, and
what a 6-axis arm must add to its orientation. A geodesic is the curve with
$\kappa_g = 0$: "drive straight".

The lineage here is Alvaro's **Untethered Robotic Printer Heads** (2011,
[page](https://alvarocassinelli.com/unthethered-robotic-printer-heads/)): a
holonomic omni-wheel robot ("Korokoro, the robot pantograph") is shown a
drawing plus resize/rotate instructions and reproduces it on the floor; the
proposal is a swarm of such heads printing or scanning in parallel over
**large or curved surfaces**, down to an "intelligent printing ink" of
nano-bots localising each other. The floor is the $K = 0$ case; `manifold-ink`
is what the same robot needs once the floor curves: the turtle mode _is_ the
robot's odometry program, and the `{anchor, heading, scale}` frame _is_ the
resize/rotate command set. The same output feeds non-planar / conformal 3D
printing toolpaths (a nozzle kept normal to a curved substrate).

---

## 3. The menu of imprints

| mode                        | preserves                                                                 | distorts                                                  | closed curves close?                        | classical name / reference                                                                      |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Turtle / dead reckoning** | arc length, $\kappa_g$ = planar $\kappa$                                  | positions accumulate; shape drifts                        | **No** — gap $= \iint K\,dA$ (Gauss–Bonnet) | Turtle geometry on curved surfaces, Abelson & diSessa 1980                                      |
| **Exponential map (polar)** | distances and angles _from the anchor_                                    | circumferential lengths ($2\pi r \to 2\pi r(1 - Kr^2/6)$) | Yes (it is a map)                           | Riemann normal coordinates; Discrete Exponential Map decals, Schmidt–Grimm–Wyvill SIGGRAPH 2006 |
| **Fermi / graph paper**     | lengths along the baseline geodesic and along each perpendicular geodesic | the "rectangle" doesn't close; parallels converge/diverge | Yes (it is a map)                           | Fermi coordinates; geodesic deviation (Jacobi)                                                  |
| **Conformal**               | angles everywhere (letters stay _similar_ locally)                        | scale varies across the drawing                           | Yes                                         | Riemann mapping; BFF (Sawhney–Crane 2017) — needs a solver, out of scope                        |
| **Equal-area**              | area                                                                      | angles / aspect                                           | Yes                                         | Lambert-type projections                                                                        |
| **Extrinsic projection**    | nothing intrinsic; what a projector/camera sees from a direction $d$      | foreshortening $1/\cos\theta$, occlusion, no wrap-around  | Yes                                         | the standard graphics decal; our _baseline_                                                     |
| **Spring relaxation**       | a compromise: minimises $\sum (\ell - \ell_0)^2$                          | spreads the error evenly                                  | Yes if the chain is closed                  | Elastic / ARAP-style fitting; myBlobChain Verlet chains                                         |

Observations that fall out of the table:

- **Turtle is the robot's native language** and the only mode that is _local_
  (needs no map, only odometry) — and the only one whose closed letters don't
  close. The "O" in a word has a gap exactly equal to the curvature it
  encloses; its sign tells you whether the surface is dome- or saddle-like
  there. That gap is a feature to display, not a bug to hide.
- **Exp map and Fermi are the two ways to "extend a tiny flat canvas along
  geodesics"** that the brief describes. They differ in _which_ geodesics are
  taken as straight: exp map radiates from one point (good for a logo /
  decal); Fermi follows a baseline (good for a line of text — the baseline is
  a geodesic by construction, letter heights then vary by geodesic deviation).
- **Projection is extrinsic**: it is what "projecting an image on the object"
  literally does, and the one mode that does not depend on the surface metric
  at all. Keeping it as the baseline makes the intrinsic modes legible by
  contrast.
- **Relaxation is the bridge to the particle demo**: letters = particles joined
  by springs with planar rest lengths, placed initially by any of the modes
  above, then relaxed with intrinsic forces. The result is the imprint that
  minimises total stretch — a variational answer to "which mode is best".

---

## 4. The four obstructions (what the demo should make visible)

1. **Holonomy / non-closure.** Parallel transport around a loop rotates a
   vector by $\iint K\,dA$; dead reckoning around a loop misses the start by
   the same angle integrated once more. On the cube, going around a vertex
   turns a heading by $90°$.
2. **Geodesic deviation.** Two geodesics that start parallel do not stay
   equidistant: $\ddot{J} = -K J$ (Jacobi). On a dome the lines of a Fermi
   grid converge (letters get shorter toward the ends of a long word), on a
   saddle they diverge.
3. **Cut locus / injectivity radius.** The exp map is only one-to-one up to the
   cut locus (on a sphere of radius $r$, up to distance $\pi r$). A decal
   larger than that overlaps itself. On a mesh, the local `develop(point, R)`
   must stop (or branch) where two unfoldings of the same face meet.
4. **Cone points.** On a polyhedron a stroke whose unfolding passes a vertex
   has no unique continuation (positive deficit: the straightest geodesic is
   undefined there; locally shortest geodesics avoid it). The figure splits,
   with a wedge of angle $\delta_v$ missing or doubled. For a dense mesh this
   is just the small-scale version of distortion; for a cube it is dramatic.

---

## 5. The placement frame: translate, rotate, scale on a surface

A planar drawing has a similarity frame (position, angle, scale). On the
surface the equivalent is the triple **`{anchor, heading, scale}`**:

- **anchor** — a chart point `{faceId, x, y}` where the drawing's origin lands;
- **heading** — a unit tangent direction at the anchor (the drawing's $+x$);
- **scale** — a length factor applied to all planar lengths before imprinting.

Transformations: _translate_ = move the anchor along a geodesic and
parallel-transport the heading (the drawing "slides" without spinning;
sliding around a loop will nevertheless rotate it — holonomy again);
_rotate_ = rotate the heading in the anchor's tangent plane; _scale_ =
multiply. Every mode in §3 consumes exactly this triple, so the UI is the same
for all of them.

---

## 6. Where the hard parts are, implementation-wise

- All intrinsic modes reduce to **two primitives** already scheduled for
  `manifold-core`: `trace(point, dir, length)` (turtle, Fermi, exp map all
  shoot geodesics) and `transport` (headings). Exp map additionally wants
  `develop(point, R)` to place many points at once instead of tracing each.
- Turtle needs the planar curve resampled to small, uniform steps; the turning
  angle per step is $\Delta\theta = \kappa\,\Delta s$ (or just the angle
  between consecutive segments of the polyline).
- Text → curves: opentype.js path → contours split at `M`, resampled uniformly
  (myBlobChain's `extractContours`, ~60 lines, already written and validated).
- Output for a robot/laser/projector is the surface curve lifted to 3D with
  normals: `{p, n, T}` per sample — the full Darboux frame is one cross
  product away.

## 7. References

- Abelson, H., diSessa, A. — _Turtle Geometry_ (MIT Press 1980), chapters on
  turtles on curved surfaces: closure defects and total curvature.
- Schmidt, R., Grimm, C., Wyvill, B. — _Interactive Decal Compositing with
  Discrete Exponential Maps_, SIGGRAPH 2006 — placing images/text on meshes
  via a local exp-map parameterization; the direct ancestor of our exp-map
  mode.
- Polthier, K., Schmies, M. — _Straightest Geodesics on Polyhedral Surfaces_
  — the tracing primitive (see `GEODESIC_MOTION.md`).
- do Carmo — _Differential Geometry of Curves and Surfaces_, §4 (Gauss–Bonnet,
  geodesic curvature, Darboux frame), §5 (Jacobi fields).
- Snyder, J. P. — _Map Projections: A Working Manual_ (USGS 1987) — the
  distortion taxonomy, with Tissot's indicatrix.
- Cassinelli, A. et al. — _Untethered Robotic Printer Heads_ (2011; idea:
  A. Cassinelli, prototype supervised with Y. Watanabe, Ishikawa lab,
  U. Tokyo): <https://alvarocassinelli.com/unthethered-robotic-printer-heads/>
  — swarm of wheeled/flying printing heads for large and curved surfaces; the
  robot consumer this library is ultimately for.
- Non-planar / conformal 3D printing (e.g. Ahlers et al. 2019, "3D printing
  of nonplanar layers"; curved-layer FDM literature) — toolpaths on curved
  substrates are the same curve-on-surface object with $\kappa_n, \tau_g$
  driving nozzle orientation.
