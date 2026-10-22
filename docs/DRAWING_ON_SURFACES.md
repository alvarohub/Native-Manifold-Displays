# Drawing on a Curved Surface — what can be preserved, and what cannot

Design note for `manifold-ink` (schedule M6–M8). Written 2026-10-17 to answer
the question: _given a 2D drawing (curves, text) and a surface, what are the
interesting constraints of "imprinting" it, and which ways of imprinting are
worth implementing?_ Motivating application: a robot drawing on an object with
a pen held normal to the surface.

_Revised 2026-10-21: added definitions, source pointers and the reasoning
behind the $K L^2$ rule, for readers new to the subject._

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
preserve_, and every choice is a different map.

The menu of choices is the one cartographers use, run backwards. A map
projection flattens a sphere onto paper; here we press the paper onto the
surface (exactly the process behind the robotic "Sphere Display" project). The
**Tissot indicatrix** — the ellipse into which a map turns an infinitesimal
circle — therefore shows the distortion the letters will suffer: the ellipse's
axis lengths give the local stretch, and its shape and orientation the local
shear (§7, Snyder).

**Terms and symbols used below** (sources in §7). A **chart** is one face
carrying its own flat 2D coordinates, so a surface point is written
`{faceId, x, y}`.

- **$K$** — Gaussian curvature, the product of the two principal curvatures.
  Units: $1/\text{length}^2$. A sphere of radius $r$ has $K = 1/r^2$; a flat
  sheet has $K = 0$.
- **$\chi$** — the Euler characteristic, the integer $V - E + F$ of any
  triangulation (it depends only on topology). A sphere-like closed surface has
  $\chi = 2$; a torus has $\chi = 0$.
- **$\delta_v$** — the angle deficit at an interior vertex $v$: $2\pi$ minus the
  sum of the corner angles meeting there. A cube corner has $\delta_v = \pi/2$;
  a flat interior vertex has $0$.
- **geodesic** — a curve whose geodesic curvature $\kappa_g$ (§2) is zero:
  locally shortest, i.e. "straight" on the surface. Example: great circles on a
  sphere.
- **holonomy** — the map $H$ that sends a tangent vector $v$ to the vector
  $Hv$ you get by transporting it once around a closed loop. It is a rotation,
  or a reflection if the loop reverses orientation. Flat sheet: $Hv = v$; one
  turn around a cube corner: rotation by $\pi/2$.
- **cut locus** — the set of points reached by two or more equally short
  geodesics from a given point; past it the exponential map is no longer
  one-to-one. On a sphere, the cut locus of a point is its antipode.

### The exception that makes polyhedra special

A surface is **developable** if $K = 0$ almost everywhere: it is locally flat,
so it can be flattened without stretching (a cone or cylinder unrolls into a
sheet). Unfolding is then an exact isometry. On a cube, a tube or a cone a
drawing can therefore be imprinted with **zero distortion**, by the clip-and-fold
method already used for the Carillon's head sprites (Carillon IDEAS §2).

All the curvature of a polyhedron sits at its vertices. For a closed polyhedron
the angle deficits satisfy $\sum_v \delta_v = 2\pi\chi$ (Gauss–Bonnet: the
total curvature is fixed by topology alone; a boundary adds one term, see
[`DISCRETE_TO_SMOOTH.md`](DISCRETE_TO_SMOOTH.md)). Distortion therefore appears
only where a stroke's unfolding wraps around a vertex, and the figure _splits_
(Carillon IDEAS §3).

For a smooth surface sampled by a fine mesh, every vertex carries a small
deficit and the same mechanism, applied densely, produces smooth distortion.
The mesh is the general case; the cube is the sparse case.

### Rule of thumb: size versus curvature radius

How much distortion a drawing suffers depends mainly on one ratio: its size
compared with the length over which the surface curves. Write $L$ for the
drawing's size and $K$ for the curvature; each _intrinsic_ distortion in §3 —
turtle drift, exp-map and Fermi distortion, closure gaps — is of relative size
$K L^2$. Two concrete cases make this tangible:

- **A circle drawn on a sphere of radius $R$**, so $K = 1/R^2$. Its measured
  circumference is $C \approx 2\pi r\,\big(1 - \tfrac{1}{6} K r^2\big)$ rather
  than $2\pi r$: a circle one tenth of the sphere's radius comes out $0.17\%$
  short.
- **A small closed loop, driven around once.** Its heading comes back rotated by
  about the curvature it enclosed, $K \times \text{area}$ — on the same sphere,
  by $\text{area} / R^2$ radians.

Both say the same thing: the correction is curvature times a length squared.

_Why_ $K L^2$? A distortion is a pure number (a ratio of lengths), while $K$
has units $1/\text{length}^2$. So $K L^2$ is the only dimensionless combination
that is linear in $K$ and can be formed from a figure of size $L$. The numerical
coefficient depends on the figure's shape and on the mode; it comes from the
first-order term of the Jacobi (geodesic-deviation) expansion (§7, do Carmo §5).

Take $L \approx 1/\sqrt{|K|}$ and the correction reaches order one. That length
is the **curvature radius**. A drawing much smaller than it looks undistorted in
_every_ mode; the modes only separate once the drawing is comparable to it.
Hence the knob to expose in the demo: scale the text up until the modes diverge.

---

## 2. What a curve on a surface has, that a planar curve does not

A planar curve is described by its arc length $s$ and its signed curvature
$\kappa(s)$, which measures how fast it _steers_.

A curve on a surface additionally carries a moving frame, the **Darboux frame**
$(T,\ N_s \times T,\ N_s)$ — the surface analogue of the Frenet frame of a
space curve. $T$ is the curve's unit tangent, $N_s$ the surface normal, and
$N_s \times T$ the perpendicular to the curve _within_ the surface. Three scalars
are measured in this frame:

| quantity                      | meaning                                                       | who decides it                 |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------ |
| geodesic curvature $\kappa_g$ | how much the curve turns _within_ the surface (steering)      | the drawing                    |
| normal curvature $\kappa_n$   | how much the surface bends the curve out of its tangent plane | the surface, in that direction |
| geodesic torsion $\tau_g$     | how fast the surface normal twists about the curve's tangent  | the surface                    |

This is the precise statement of the robot problem. A crawling robot with a pen
held normal to the surface controls **only** $\kappa_g$ (through its wheels or
steering) and the arc length (its odometer). $\kappa_n$ and $\tau_g$ are
_imposed_ by the object: they are what the robot's suspension or wrist must
absorb, and what a 6-axis arm must add to its orientation. A geodesic is the
curve with $\kappa_g = 0$ — "drive straight".

The lineage is Alvaro's **Untethered Robotic Printer Heads** (2011,
[page](https://alvarocassinelli.com/unthethered-robotic-printer-heads/)). A
holonomic omni-wheel robot ("Korokoro, the robot pantograph") is shown a drawing
plus resize/rotate instructions and reproduces it on the floor. The proposal is
a swarm of such heads printing or scanning in parallel over **large or curved
surfaces**, down to an "intelligent printing ink" of nano-bots that localise
each other.

The floor is the $K = 0$ case; `manifold-ink` is what the same robot needs once
the floor curves. The turtle mode _is_ the robot's odometry program, and the
`{anchor, heading, scale}` frame _is_ its resize/rotate command set. The same
output also feeds non-planar and conformal 3D-printing toolpaths, where a nozzle
is kept normal to a curved substrate.

---

## 3. The menu of imprints

The columns answer, in order: what the map keeps exactly, what it must
therefore give up, whether a _closed_ planar contour comes back closed (a real
map always does; dead reckoning need not), and the closest classical
construction with its source.

| mode                        | preserves                                                                 | distorts                                                  | closed curves close?                        | classical name / reference                                                                      |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Turtle / dead reckoning** | arc length, $\kappa_g$ = planar $\kappa$                                  | positions accumulate; shape drifts                        | **No** — heading off by $\iint K\,dA$ (Gauss–Bonnet), so the ends miss | Turtle geometry on curved surfaces, Abelson & diSessa 1980                                      |
| **Exponential map (polar)** | distances and angles _from the anchor_                                    | circumferential lengths ($2\pi r \to 2\pi r(1 - Kr^2/6)$) | Yes (it is a map)                           | Riemann normal coordinates; Discrete Exponential Map decals, Schmidt–Grimm–Wyvill SIGGRAPH 2006 |
| **Fermi / graph paper**     | lengths along the baseline geodesic and along each perpendicular geodesic | the "rectangle" doesn't close; parallels converge/diverge | Yes (it is a map)                           | Fermi coordinates; geodesic deviation (Jacobi)                                                  |
| **Conformal**               | angles everywhere (letters stay _similar_ locally)                        | scale varies across the drawing                           | Yes                                         | Riemann mapping; Boundary First Flattening (BFF, Sawhney–Crane 2017) — needs a solver, out of scope |
| **Equal-area**              | area                                                                      | angles / aspect                                           | Yes                                         | Lambert-type projections                                                                        |
| **Extrinsic projection**    | nothing intrinsic; what a projector/camera sees from a direction $d$      | foreshortening $1/\cos\theta$, occlusion, no wrap-around  | Yes                                         | the standard graphics decal; our _baseline_                                                     |
| **Spring relaxation**       | a compromise: minimises $\sum (\ell - \ell_0)^2$                          | spreads the error evenly                                  | Yes if the chain is closed                  | Elastic / as-rigid-as-possible (ARAP) fitting; myBlobChain Verlet chains                        |

Observations that fall out of the table:

- **Turtle is the robot's native language.** It is the only mode that is _local_
  (it needs no map, only odometry) — and the only one whose closed letters do
  not close. The "O" in a word comes back with its heading rotated by exactly
  the curvature it encloses, so its ends do not meet; the sign of the miss tells
  you whether the surface is dome-like or saddle-like there. That gap is a
  feature to display, not a bug to hide.
- **Exp map and Fermi are the two ways to "extend a tiny flat canvas along
  geodesics"**, as the brief puts it. They differ in _which_ geodesics are taken
  as straight. The exp map radiates from one point (good for a logo or decal).
  Fermi follows a baseline (good for a line of text): the baseline is a geodesic
  by construction, and letter heights then vary by geodesic deviation.
- **Projection is extrinsic.** It is what "projecting an image on the object"
  literally does, and the one mode that does not depend on the surface metric at
  all. Keeping it as the baseline makes the intrinsic modes legible by contrast.
- **Relaxation is the bridge to the particle demo.** Letters are particles
  joined by springs with planar rest lengths, placed initially by any mode above
  and then relaxed with intrinsic forces. The result is the imprint that
  minimises total stretch — a variational answer to "which mode is best".

---

## 4. The four obstructions (what the demo should make visible)

1. **Holonomy / non-closure.** **Parallel transport** slides a tangent vector
   along a curve, keeping its length and its angle to the surface. After a
   closed loop the vector comes back as $Hv$, usually not equal to $v$. The
   map $H$ is the **holonomy** of the loop: a linear isometry of the tangent
   plane $T_pS$ at the loop's base point $p$.
   - On a flat sheet, $H$ is the identity.
   - For a simple loop enclosing a region $R$ of an orientable surface, $H$ is a
     rotation by the enclosed curvature $\iint_R K\,dA$ (Gauss–Bonnet, §7 do
     Carmo §4).
   - For an orientation-reversing loop — possible only on a non-orientable
     surface — $H$ is a reflection. This is the sign of $\det M$ that the code
     accumulates into `hand` on a Möbius band.
   - On a polyhedron, $H$ is the product of the edge transition matrices; one
     turn around a cube corner is a $90°$ rotation.

   The turtle re-uses the planar turning angles, so a closed letter comes back
   with its heading rotated by $H$: that is the gap in the "O".
2. **Geodesic deviation.** Two geodesics that start parallel do not stay
   equidistant. Their separation $J(s)$, called the **Jacobi field**, obeys
   $\ddot{J} = -K J$: positive curvature focuses neighbouring geodesics,
   negative curvature spreads them. On a dome the lines of a Fermi grid converge
   (letters get shorter toward the ends of a long word); on a saddle they diverge.
3. **Cut locus / injectivity radius.** The exp map is one-to-one only up to the
   cut locus (on a sphere of radius $r$, up to distance $\pi r$). The
   **injectivity radius** at a point is its distance to the nearest cut point,
   i.e. the largest radius on which the map is unambiguous. A decal larger than
   that overlaps itself. On a mesh, the local `develop(point, R)` must stop (or
   branch) where two unfoldings of the same face meet.
4. **Cone points.** A cone point is a vertex with positive deficit
   $\delta_v > 0$: less than $2\pi$ of surface surrounds it. A stroke reaching it
   can leave in many directions, and nearby strokes split to either side. The
   straightest-geodesic rule (equal angles on both sides) chooses one outgoing
   direction, but that is a convention; locally _shortest_ paths never pass
   through such a vertex (see [`GEODESIC_MOTION.md`](GEODESIC_MOTION.md),
   Part III). Unfolding a figure around the vertex leaves a wedge of angle
   $\delta_v$ missing (or doubled, if $\delta_v < 0$), so the figure splits. On a
   dense mesh this is just the small-scale version of distortion; on a cube it
   is dramatic.

---

## 5. The placement frame: translate, rotate, scale on a surface

A planar drawing has a _similarity frame_: position, angle and scale. (A
similarity is a map that preserves all angles and every ratio of lengths.) On a
surface the equivalent is the triple **`{anchor, heading, scale}`**:

- **anchor** — a chart point `{faceId, x, y}` where the drawing's origin lands;
- **heading** — a unit tangent direction at the anchor (the drawing's $+x$);
- **scale** — a length factor applied to all planar lengths before imprinting.

The three transformations:

- _translate_ — move the anchor along a geodesic and parallel-transport the
  heading, so the drawing slides without spinning. Sliding it around a loop will
  nevertheless rotate (or reflect) it: holonomy again.
- _rotate_ — rotate the heading in the anchor's tangent plane.
- _scale_ — multiply the scale factor.

Every mode in §3 consumes exactly this triple, so the UI is the same for all of
them.

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

---

## 7. References

Full bibliography (with links and local PDFs): [`REFERENCES.md`](REFERENCES.md).

- Abelson, H., diSessa, A. — _Turtle Geometry_ (MIT Press 1980), chapters on
  turtles on curved surfaces: closure defects and total curvature.
- Schmidt, R., Grimm, C., Wyvill, B. — _Interactive Decal Compositing with
  Discrete Exponential Maps_, SIGGRAPH 2006 — placing images/text on meshes
  via a local exp-map parameterization; the direct ancestor of our exp-map
  mode.
- Polthier, K., Schmies, M. — _Straightest Geodesics on Polyhedral Surfaces_
  — the tracing primitive (see [`GEODESIC_MOTION.md`](GEODESIC_MOTION.md)).
- do Carmo — _Differential Geometry of Curves and Surfaces_: §4 Gauss–Bonnet,
  angle deficits and the Euler characteristic, geodesic curvature, Darboux
  frame; §5 Jacobi fields, cut locus and conjugate points (the source of the
  $K L^2$ scaling).
- Crane, K. — _Discrete Differential Geometry: An Applied Introduction_
  (CMU notes) — the discrete forms of deficit, Gauss–Bonnet and geodesic
  deviation used on meshes.
- Snyder, J. P. — _Map Projections: A Working Manual_ (USGS 1987) — the
  distortion taxonomy, with Tissot's indicatrix defined and tabulated per
  projection.
- Cassinelli, A. et al. — _Untethered Robotic Printer Heads_ (2011; idea:
  A. Cassinelli, prototype supervised with Y. Watanabe, Ishikawa lab,
  U. Tokyo): <https://alvarocassinelli.com/unthethered-robotic-printer-heads/>
  — swarm of wheeled/flying printing heads for large and curved surfaces; the
  robot consumer this library is ultimately for.
- Non-planar / conformal 3D printing (e.g. Ahlers et al. 2019, "3D printing
  of nonplanar layers"; curved-layer FDM literature) — toolpaths on curved
  substrates are the same curve-on-surface object with $\kappa_n, \tau_g$
  driving nozzle orientation.
