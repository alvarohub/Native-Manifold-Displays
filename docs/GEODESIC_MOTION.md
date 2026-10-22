# How a Head Moves on the Surface — the Atlas Method

This document explains intrinsic motion from the original 2007 cube to the
current triangle-mesh library, and distinguishes it from finding a shortest
path between two points.

- [manifold-core/src/geodesic.js](../manifold-core/src/geodesic.js) — current
  library: tracing, cone continuation, transport, and approximate distance queries.
- [experiments/geodesic-surfaces/src/atlas.js](../experiments/geodesic-surfaces/src/atlas.js) —
  historical generalized lab (polygon charts and abstract gluings).
- [Cube Carillon](https://github.com/alvarohub/CubicCarillon_topologicalSequencer) —
  the original instrument; its `surface.js` / `ball.js` are in that repository.

**Reading guide (2026-10-19):** Parts I–II explain the atlas and embedding.
[Part III](#part-iii--straightest-motion-versus-shortest-connections) separates
the initial-value and endpoint problems, explains the vertex cases, audits
the current limitations, and proposes a JS shortest-path solver without
geometry-central. That proposal is **not implemented** by this documentation update.

---

## 1. The central idea: the head never lives in 3D

A head is **not** a particle moving through 3D space with constraints. Its
entire state is five numbers:

```
head = { faceId, x, y, vx, vy }
```

- `faceId` — which chart (face) of the surface it currently sits in.
- `(x, y)` — its position in that chart's local 2D coordinates.
- `(vx, vy)` — its velocity, expressed in the same local 2D coordinates.

That is the whole kinematic state. 3D is only used twice:

1. **At build time**, to _compute_ the transition maps between charts (see §4).
2. **At render time**, to _place_ the head on screen via the face's 3D frame:
   `P = C + x·u + y·v` (see `to3D` in both modules).

The motion itself is pure 2D Euclidean geometry inside flat charts, plus a
lookup table of gluing maps between them. This is exactly your 2007 structure
— a face with local coordinates (`classFaceGeom`) and a transform table
(`classFaceGraph`) — except the transform table is now **computed from the
geometry** instead of hand-typed.

The mathematical name for this object: the surface is an **atlas** (a set of
flat polygonal charts), the gluing maps are its **transition maps**, and a
trajectory that is straight inside each chart **and straight across unfolded
seams** is locally geodesic away from vertices. At vertices a continuation
definition is necessary; local straightness never guarantees global shortestness.

---

## 2. Inside one chart: motion is trivial

Within a face, the chart is a flat polygon in the plane. With no forces, the
head is a free particle:

```
x += vx * dt
y += vy * dt
```

Nothing else happens. All the topology of the surface is concentrated at the
chart boundaries.

---

## 3. Crossing a boundary: the step loop

Each frame, `stepHead(head, dt)` (atlas.js) / `ball.step(surface, dt)`
(ball.js) does this:

```
remaining = dt
while remaining > 0:
    1. Find the EARLIEST time t_hit at which the current ray
       (x,y) + t·(vx,vy) exits the current polygon.
    2. If t_hit > remaining:   no crossing this frame
           x += vx·remaining;  y += vy·remaining;  done.
    3. Otherwise:              advance exactly TO the edge
           x += vx·t_hit;  y += vy·t_hit;  remaining -= t_hit
    4. Look up the transition map of this (face, edge).
    5. Apply it:
           faceId ← toFaceId
           (x,y)  ← M·(x,y) + t        ← position re-charted
           (vx,vy) ← M·(vx,vy)         ← velocity re-charted (NO +t)
    6. Loop again with the leftover time, now inside the new chart.
```

Sub-stepping to the exact edge (step 3) is what makes the crossing exact
rather than approximate: the head never overshoots and gets corrected, it
_touches_ the seam and continues from the correct point of the neighbour
chart.

Two fine points:

- **Position gets `M·p + t`, velocity gets only `M·v`.** The translation `t`
  re-centres coordinates between charts; velocity is a _displacement_, it has
  no origin, so it is only rotated/reflected. Applying the same `M` to both is
  the invariant that keeps the trajectory straight when the two charts are
  unfolded into one plane.
- **If an edge has no neighbour** (an open boundary, like the rim of the
  Möbius strip in the lab), the head is reflected off the edge instead:
  `v ← 2(v·tangent)tangent − v`.
  This is a chosen **billiard boundary condition**, not free geodesic
  continuation. Stopping or emitting an event are other possible policies.

On the cube this loop is what you wrote in 2007: detect which side of the
square was exceeded, switch face, remap coordinates and velocity. The
generalization replaces "which side of a square" with "which side of an
arbitrary convex polygon" (§5) and the hand-typed remap table with computed
maps (§4).

---

## 4. How transition maps are _computed_ from the 3D embedding

This is the part that lets the code handle **any** polyhedron. It is done once
at build time (`_buildGluings` in surface.js, `buildComputedTransitions` in
atlas.js). For every face edge:

### Step 1 — find the neighbour by 3D point matching

Each face stores its vertices in 3D (cube: derived from `C + x·u + y·v`;
polyhedra: the actual vertex coordinates, e.g. the icosahedron's vertices).
Two faces are adjacent along an edge if their 3D edge endpoints coincide:

```
edge (A,i) ≡ edge (B,j)  iff  {P0, P1} match as a SET (either order)
```

So adjacency is discovered from the embedding, never declared by hand. Add a
new polyhedron = supply its vertex list; the maps follow automatically.

### Step 2 — express the shared edge in BOTH charts

The two shared 3D endpoints `P0, P1` are projected into each face's local 2D
frame:

```
a_A, b_A = to2D(A, P0), to2D(A, P1)   // same physical edge, chart A coords
a_B, b_B = to2D(B, P0), to2D(B, P1)   // same physical edge, chart B coords
```

(`to2D(face, P) = [dot(P − C, u), dot(P − C, v)]` — just a projection onto the
face's own axes.)

### Step 3 — build an orthonormal "edge frame" in each chart

In each chart, build a little coordinate system attached to the edge:

```
e1 = normalized(b − a)          // unit tangent ALONG the edge
e2 = perp(e1) = (−e1.y, e1.x)   // unit normal to the edge, in the plane
```

The change-of-basis from "chart A coordinates" to "chart A edge-frame
coordinates" is the transpose of the matrix whose columns are `(e1_A, e2_A)`
(the frames are orthonormal, so transpose = inverse — no matrix inversion
code needed anywhere).

### Step 4 — two candidate isometries

Going A → edge-frame-A → edge-frame-B → B gives a rigid 2D motion
`p_B = M·p_A + t`. But there are **two** ways to superimpose the two edge
frames, and both correctly map the shared segment onto itself:

```
M_pres = [e1_B | e2_B] · [e1_A | e2_A]ᵀ      // orientation-PRESERVING
M_rev  = [e1_B | −e2_B] · [e1_A | e2_A]ᵀ     // orientation-REVERSING
```

For each candidate, the translation is pinned by anchoring one endpoint:

```
t = a_B − M·a_A        (because M·a_A + t must equal a_B)
```

### Step 5 — the interior probe disambiguates

Both candidates glue the _edge line_ correctly, but only one glues the
_interiors_ correctly: a point just **outside** face A across the edge must
land just **inside** face B. So the code builds a probe:

```
midA   = midpoint of the edge in chart A
outA   = direction from A's centre to midA   (faces are centred at origin)
probe  = midA + ε·outA                       // ε = small fraction of the face size
```

then maps the probe with each candidate and scores it by how far the image
lies toward B's interior:

```
score(M, t) = (M·probe + t − midB) · inB
```

The winner becomes the stored transition map
`{ toFaceId, toEdge, M, t }`.

This interior test is what makes the construction physically correct for
convex polyhedra without ever measuring dihedral angles: the two faces _are_
rigidly hinged along the edge in 3D, and the correct unfolding is the one that
does not flip the outside to the outside.

### Why M is what it is

`M` is orthonormal — it preserves lengths and angles. On the cube it comes out
as a signed permutation (entries in {−1, 0, +1}) because face axes meet at
multiples of 90°; on the icosahedron it is a general rotation by the angle
between the two triangles' edge frames. The code does not care: it is the same
formula.

---

## 5. Polygons instead of squares: finding the exit edge

On the cube, the face is an axis-aligned rectangle, so "earliest exit" is four
divisions (`(halfU − x)/vx`, etc.). For arbitrary convex polygons (triangles
included), `firstExit` in atlas.js tests the ray against each edge segment
using 2D cross products:

For each edge `(a → b)` of the polygon, with edge vector `E = b − a`:

```
value  = cross(E, p − a)      // signed side of the edge line the point is on
                               //   (for a CCW polygon: positive = inside)
denom  = cross(E, v)          // how fast the velocity changes that side
```

- `denom ≥ 0` → the ray is parallel to the edge or moving _toward the inside_
  through it — it cannot exit there. Skip.
- Otherwise the exit time is `t = −value / denom`.

Take the smallest non-negative `t` within the remaining frame time; that is
the edge the head leaves through. This is the standard convex-polygon raycast;
for triangles it is three of these tests per frame.

Everything else (the map application, the sub-stepping loop) is identical to
the cube. A triangle is just a chart with 3 entries in its `edges` array
instead of 4.

---

## 6. Why this gives geodesics (the unfolding picture)

A geodesic on a polyhedron is the curve that becomes a **straight line** when
the faces it visits are unfolded flat. The transition map `p_B = M·p_A + t` is
_exactly_ that unfolding, expressed as a change of coordinates instead of a
physical fold:

- **Folding picture**: rotate face B in 3D around the shared edge until it is
  coplanar with A; the trajectory continues straight across.
- **Chart picture (what the code does)**: stay flat the whole time, and change
  coordinates so the two charts overlap on the shared edge.

They are the same rigid motion. Away from vertex hits and open boundaries,
"ray inside a chart + map at the seam" is geodesic integration on a
polyhedron, exact up to floating-point and intersection tolerances — no
normal corrections or projection steps. Singularities need the explicit
rules in §14, not just another seam map.

### Curvature lives only at the vertices

Faces are flat and edges are flat (folding along an edge costs no curvature).
All Gaussian curvature of a polyhedron concentrates at vertices as **angle
deficit**. On the cube: three 90° corners meet → 270° around a vertex →
deficit 90°; eight vertices give 8·90° = 720° = 4π (Gauss–Bonnet for a
sphere, χ = 2). On the icosahedron: five 60° triangles meet → 300° around a
vertex → deficit 60°; twelve vertices give 12·60° = 720° = 4π. ✓

Consequences for the sequencer:

- At an interior vertex, let the total incident angle be `Theta`. It can be
  less than, equal to, or greater than `2*pi`. A **straightest** continuation
  is uniquely defined by splitting `Theta` equally, whereas a **locally
  shortest** continuation may be impossible or nonunique (see §14).
  The current library explicitly detects vertex hits and emits events;
  floating-point noise is not a valid continuation policy. These are also
  natural musical accent/decision events.
- Parallel transport around a vertex rotates a vector by the deficit — this is
  why a head that loops a closed path around a corner comes back heading in a
  _different_ direction than it left (holonomy). On a flat torus (no vertices,
  no deficit) directions are globally consistent; on the icosahedral sphere
  they cannot be.

---

## 7. The full data flow, end to end

```
3D vertex list of the polyhedron
        │
        ▼  build time
per-face frames (C, u, v, n)  +  3D edge matching  +  edge frames  +  probe test
        │
        ▼
face.edges[e] = { toFaceId, toEdge, M, t }        (the atlas)
        │
        ▼  every frame, pure 2D
firstExit(ray vs polygon) → M·p+t / M·v at the seam → continue in next chart
        │
        ▼  render time only
P = C + x·u + y·v   (embed the 2D state back into 3D for three.js)
```

Cell grids (the musical score) are just a uniform subdivision of each chart's
(x, y) domain; "head entered cell (i, j)" is an index computation in the local
chart, so the score is painted on the _surface_, not on the 3D embedding — the
same score survives any re-embedding of the atlas (this is what the twisted
square-tube demos show: four identical charts, four different 3D placements).

---

## 8. Cube vs. generalized lab: side by side

| Concern        | Cube (`src/core/`)                        | Lab (`experiments/geodesic-surfaces/`)                                                    |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Chart shape    | axis-aligned rectangle (`su × sv`)        | arbitrary convex polygon (`verts2`)                                                       |
| Exit test      | 4 analytic divisions                      | cross-product raycast per edge (`firstExit`)                                              |
| Frames         | `u, v` axis-aligned with the face         | `u = B−A` direction of first edge, `v = n×u` (`triangleFace`)                             |
| Maps           | computed in `_buildGluings`/`_transition` | computed in `buildComputedTransitions`/`transition` (identical math)                      |
| Hand-made maps | not used                                  | allowed via `glue()` for abstract surfaces with no natural embedding (flat torus, Möbius) |
| Open edges     | bounce                                    | bounce (same reflection rule)                                                             |

Note the last row: the atlas also supports surfaces that have **no 3D
embedding at all** — you just write the maps by hand with `glue()` (flat
torus: one rectangle, opposite edges identified; Möbius: one rectangle, one
pair of edges identified with a flip). Hand-made maps are still legal; the
contribution of the generalized code is that they are _derived automatically_
whenever a 3D embedding exists.

---

## 9. What is _not_ covered (and would need a different backend)

Smooth surfaces (a true sphere, a donut torus) have curvature distributed
continuously, not concentrated at vertices. There the state is a point on a
parametric surface plus a tangent velocity, and the step must integrate the
geodesic equation (or use constrained dynamics). The atlas method above is for
**flat charts glued by isometries** — polyhedra, polygon unfoldings, and flat
quotients — which is where the instrument's musical structure (cell grids,
edge events, vertex accents) is exact and cheap.

_Addendum (2026-10-19)._ This paragraph is about the integrator, not about
the geometry: a suitable dense triangle mesh approximates a smooth surface.
Metric convergence requires appropriate approximation/mesh-quality assumptions;
selected icosphere distance tests do not certify the current solver globally
or establish convergence of every trajectory through a cone point.
How each polyhedral quantity relates to
its smooth counterpart — exact analogue vs. estimator, and in which sense it
converges — is the subject of
[DISCRETE_TO_SMOOTH.md](DISCRETE_TO_SMOOTH.md).

---

# Part II — From a 3D mesh to flat charts: the embedding layer

Part I described motion as pure 2D geometry plus gluing maps. This part
answers the other half: where the charts come from, how a local coordinate
system is attached to each triangle, how the head's 2D state becomes a 3D
point on screen, and how the polyhedron is stored as data.

All references are to
[experiments/geodesic-surfaces/src/atlas.js](../experiments/geodesic-surfaces/src/atlas.js)
(core) and
[experiments/geodesic-surfaces/src/main.js](../experiments/geodesic-surfaces/src/main.js)
(renderer). The separate cube instrument's `surface.js` does the same things with
a shorthand (its faces are axis-aligned rectangles, so the frames are written
down directly in `FACE_SPECS`).

## 10. How the polyhedron is represented as data

It is the classic mesh representation — the same thing OpenGL/Direct3D have
used since forever, nothing exotic:

```
raw     = [v0, v1, ..., v11]    // flat list of 3D vertices (floats)
indices = [[a,b,c], ...]        // one triplet per face: WHICH three vertices
```

For the icosahedron (`createIcosaSphere`): 12 vertices (the
$(\pm 1, \pm\varphi, 0)$ rectangle-corner construction, normalized and scaled
to radius 1.55) and 20 index triplets. The triplets also encode **winding**:
`[a, b, c]` is counter-clockwise seen from outside, which is what lets the
code compute an outward normal later.

So: **vertices carry geometry, indices carry topology.** Two faces are
adjacent not because of a pointer structure, but because two triplets happen
to contain the same two vertex coordinates — and the transition-map builder
(Part I, §4) discovers that by comparing 3D endpoints (`buildComputedTransitions`
matches `[A0,A1]` against `[B0,B1]` in either order).

Note that each face then **copies** its three vertex positions into
`face.verts3`. The mesh becomes a "polygon soup": duplicated vertices, no
shared half-edge structure. For 20–1000 faces that is a feature, not a bug —
edge matching by coordinate equality is $O(F^2)$ once at build time, and after
that nothing chases pointers.

## 11. How the coordinate frame is attached to a triangle (`triangleFace`)

This is the step that "applies a coordinate system over the triangle". Given
the three 3D vertices $(a, b, c)$, `triangleFace` builds a small 3D
orthonormal frame glued to the triangle's plane:

1. **Normal.**
   $$n = \operatorname{norm}\big((b-a)\times(c-a)\big)$$
   If $n$ points toward the mesh centre ($n\cdot C < 0$), swap $b$ and $c$ —
   this is how the code _repairs_ wrong winding instead of trusting the index
   list.

2. **In-plane axes.** Pick the first edge as the local $u$ axis, and get $v$
   as the normal rotated 90° inside the plane:
   $$u = \operatorname{norm}(b-a), \qquad v = \operatorname{norm}(n\times u)$$
   Now $(u, v, n)$ is a right-handed orthonormal basis: a tiny 3D coordinate
   system sitting on the triangle.

3. **Origin.** $C = (a+b+c)/3$, the barycentre — so local coordinates are
   centred, exactly like the cube faces are centred.

The frame defines the two maps that convert between the chart and 3D:

$$
\text{to3D}:\quad P = C + x\,u + y\,v
$$

$$
\text{to2D}:\quad x = (P-C)\cdot u, \qquad y = (P-C)\cdot v
$$

The second line works _because the basis is orthonormal_: projecting onto $u$
and $v$ is the inverse of the first line. No matrix inversion anywhere — the
dot product with an orthonormal basis **is** the inverse transform. (For the
cube, the same formulas appear in `Surface.to3D` / `Surface.to2D`.)

Then `triangleFace` computes `verts2 = [to2D(a), to2D(b), to2D(c)]`: the same
triangle, flattened into its own plane coordinates. That `verts2` polygon is
the entire playing field of the chart — the exit test (`firstExit`) only ever
sees these three 2D points, and by construction $a$ lands at
$(|b-a|/... )$ on the $x$-axis side: $u$ points from $a$ to $b$, so in local
coords the edge $a\!\to\!b$ is horizontal-ish. The choice is arbitrary (any
rotation of the frame would work); fixing $u$ along an edge just makes the
numbers tidy.

**Per-face summary** — each triangle is tracked as one plain object:

```
face = {
  id,                     // index in the faces array (the "tracking" key)
  C, u, v, n,             // 3D frame: origin + orthonormal basis
  verts3: [a, b, c],      // 3D corners (copied from the mesh)
  verts2: [a2, b2, c2],   // the SAME corners in local 2D  (the chart)
  edges:  [e0, e1, e2],   // transition maps, filled by buildComputedTransitions
}
```

`AtlasSurface` puts these in an array plus a `Map` (`_byId`), so the head's
`faceId` is just an integer and "which triangle am I on" is an $O(1)$ lookup.

## 12. From head state to pixels: two different paths

The renderer never simulates in 3D — it only _consumes_ the 2D state, through
one of two doors depending on the surface kind.

### Path A — polyhedra: the frame formula directly

For `kind: 'polyhedron'` the embedding function is literally the chart map:

```js
embed: (head, surface) => surface.to3D(surface.faceById(head.faceId), head.x, head.y);
```

Each frame, `sampleAndPlaceHeads` calls it and writes the result into the
three.js mesh:

```js
const p = surface.embed(head, surface);
headMeshes[i].position.set(p[0], p[1], p[2]);
```

So the chain is:

```
(faceId, x, y)  ──to3D: C + x·u + y·v──▶  3D point  ──▶  mesh.position
```

The head sphere then rides the polyhedron exactly, including across seams —
the seam crossing already happened in 2D (Part I); 3D only sees the result.
`checkCollisions` compares these embedded 3D positions pairwise (two heads
meeting on an edge have _different_ chart states but the _same_ 3D point —
embedding is the correct place to detect that).

### Path B — abstract surfaces: `embed` is a parametric display function

For the torus / tube / Möbius there is no frame per face; `embed` is an
ordinary parametric surface $E(x, y)$ (e.g. `torusEmbed` is the textbook
torus formula). The charts are flat rectangles; the display is curved. The
musical logic (cells, transitions, distances) lives in the flat chart; the
curve is a pure rendering choice. This is the "skin for any mesh" idea —
dynamics in $(x,y)$, polyhedron (or torus) just the texture-mapping display.

The grid lines on the curved skins are drawn the same way: sample
$E(x, y=\text{const})$ at ~160 points and emit a polyline (`buildGrid` →
`addGridLine` with `embedOffset`). On the polyhedron the "grid" is just the
triangle outlines themselves: `verts2` edges pushed through `to3D`.

## 13. The OpenGL side: how the mesh is actually drawn

`buildSurfaceMesh` in main.js is the GPU-facing half. For the icosahedron:

```js
const positions = [];               // flat float array, 9 floats per triangle
for (const face of surf.faces)
  for (const p of face.verts3) positions.push(...p);

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
geo.computeVertexNormals();
new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, ... }));
```

Three things to note:

1. **Non-indexed soup again.** The 3D vertex list (`raw`) used at build time
   is _not_ what goes to the GPU. For rendering, each face re-emits its three
   corners into one flat `position` buffer — 20 triangles × 3 = 60 vertices
   with duplicates. That is deliberate: with `vertexColors` (one colour per
   face) and flat facets you _want_ duplicated vertices, because a shared
   vertex can't carry two different colours/normals. This is the standard
   "flat-shaded low-poly" recipe.

2. **Normals.** `computeVertexNormals()` on a non-indexed buffer gives each
   triangle its own constant normal (the cross product of its edges — the same
   $n$ the chart frame uses). That's what makes the facets read as hard,
   gem-like planes under the lights instead of a blurry blob. (The square-tube
   mesh sets `flatShading: true` for the same reason on indexed geometry.)

3. **Wireframe + grid are extra line layers.** `WireframeGeometry` extracts
   the triangle edges as a `LineSegments` buffer (faint blue), and the bright
   grid layer is built by pushing chart-coordinate points through the
   embedding — the visible tracks are therefore guaranteed to coincide with
   the logical cells, because both are functions of the same $(x, y)$.

The correspondence to keep in mind:

| Layer        | Data                             | Produced from                 |
| ------------ | -------------------------------- | ----------------------------- |
| Logic        | `face.verts2`, `edges[]`         | 3D mesh, once, at build time  |
| Display mesh | `position`/`color` float buffers | `face.verts3`                 |
| Head markers | `mesh.position`                  | `to3D(face, x, y)` each frame |
| Grid lines   | polyline buffers                 | `embed(x, y)` sampled         |

Same surface, four views of it. The head only ever _lives_ in the first row.

---

# Part III — Straightest motion versus shortest connections

## 14. The initial-value problem: position, direction, travel length

**Input:** a surface point `p`, a tangent direction `v`, and an arc length `s`.
**Output:** the trajectory, endpoint, outgoing direction, and crossing events.
This is the job of `trace(p, v, s)`. For an unforced, undamped musical head,
`s = speed * dt`: there is no target point to find.

The directly relevant reference is **Polthier–Schmies, _Straightest Geodesics
on Polyhedral Surfaces_** (1998; reprinted in the SIGGRAPH 2006 course).
Their straightest definition supplies a unique initial-value continuation
through interior cone vertices. See the
[paper and author preprint](REFERENCES.md#straightest-geodesics).
It is a principled definition, not an endpoint-search algorithm.

At an interior vertex, write `Theta = sum(incident face angles)` and
`deficit = 2*pi - Theta`. The incoming and outgoing rays divide the fan into
angles `alpha` and `beta`, with `alpha + beta = Theta`:

| Vertex | Straightest rule | Locally shortest continuation through the vertex |
| --- | --- | --- |
| Flat, `Theta = 2*pi` | `alpha = beta = pi` | The same unique continuation |
| Positive curvature, `Theta < 2*pi` | `alpha = beta = Theta/2 < pi` | None, when the vertex is in the path interior |
| Negative curvature (saddle), `Theta > 2*pi` | `alpha = beta = Theta/2 > pi` | A range: both `alpha >= pi` and `beta >= pi` |

The shortestness condition has a simple explanation: if either side angle
is less than `pi`, unfolding that side lets us cut the corner and shorten the
path. Thus a cube-corner continuation with 135° on each side is **straightest
but not locally shortest**. At a saddle, equal splitting selects one of the
locally shortest continuations, not all of them. Endpoints located at a vertex
are a separate case; the two-sided interior-path test does not apply there.

So the user's natural equal-angle choice is precisely an established
straightest rule. Other choices model different things: stop and signal the
singularity, choose a saddle shortest branch, or smooth the cone into a cap
and integrate on that different metric. They are not interchangeable exact
solutions of one initial-value problem. Smooth-surface geodesics are both
straightest and locally shortest, but even there a long geodesic need not be
the globally shortest route between its endpoints.

**Boundaries and frames need separate contracts.** Reflection at an open edge
is billiard motion; at a boundary corner there may be several incident edges,
so "reflect" alone does not specify a unique outcome. Transport along an
ordinary edge-crossing path is the product of its chart matrices. Through a
cone singularity, one must specify the discrete transport convention too;
ordinary seam products alone do not implement the straightest heading change.
The paper develops discrete transport as well as vector-field integration.

## 15. The endpoint problem: connect two specified surface points

**Input:** `a` and `b`, including arbitrary points inside faces.
**Output:** a path connecting them, its intrinsic length, and endpoint tangent
directions. For distance-based interactions the desired quantity is

`d(a,b) = min(length(gamma))` over all surface paths from `a` to `b`.

This is harder than tracing: neither the initial direction, the length, nor
the sequence of faces is known. Different routes can pass on different sides
of curvature, holes or handles; equally short routes can coexist at a
**cut locus**. There is no globally single-valued smooth logarithm map.

For a vertex-free candidate face sequence, unfold the strip and connect the
endpoints by a straight segment. That candidate is valid only if the segment
crosses the required edges in order and remains inside every triangle.
Unfolded faces can overlap: their planar coordinates alone do not prove that
the segment follows a legal surface route. A correct local candidate is not
automatically the global minimum over other sequences.

In particular:

- **Shooting** tries to invert tracing by adjusting initial direction/length.
  It can fail or find a longer branch. A shortest path through a saddle may
  use an unequal-angle continuation, so straightest shooting cannot express
  every shortest path, even with unlimited iterations.
- **Edge Dijkstra** solves a restricted graph problem. Its route is a valid
  upper bound, useful for initialization or pruning, not generally a
  geodesic. Original mesh edges do not constrain the shortest surface path.
- **A fixed corridor plus unfolding/funnel or local shortening** only solves
  a restricted problem. Freeing a path from its initial corridor is essential;
  shortest within one corridor does not establish globally shortest.
- **[FlipOut](REFERENCES.md#flipout)** shortens an initial path using intrinsic
  edge flips. The result follows edges of a *new intrinsic triangulation*,
  whose edges cross interiors of the original triangles. This is not the
  original-edge zigzag. It computes locally shortest geodesics; it does not
  generally guarantee the global minimum across competing routes.
- **[Heat / vector heat](REFERENCES.md#heat-method)** provide approximate
  distance and transport/log-map machinery. They are valuable alternatives
  for large systems, but not exact polyhedral endpoint-path certificates.

Shortest paths and straightest traces therefore need **distinct APIs**.
Replaying a shortest route for a musical head should follow the returned
segments, not assume `trace(a, initialDir, distance)` reproduces it through
every singularity.

## 16. Current code: what is implemented and what is not

This is an audit of the working tree on 2026-10-19, not a claim of completed
repairs:

- **Motion:** `trace` uses exact face-interior drift and edge transitions,
  with equal-angle `coneContinuation`, boundary reflection and a step limit.
  Existing tests cover several positive-curvature vertex hits, not the full
  singularity/boundary contract.
- **Transport defect:** for `Surface.fromMesh(cubeMesh(2,1))`, face 0,
  corner 0, arriving from that face's centroid, `coneContinuation().M`
  maps the incoming direction **45° away** from the returned outgoing
  direction. The direction and advertised transport disagree.
  `transportAlong` only sees ordinary crossings, not cone or reflection
  events. This needs repair before frames are trusted through such events.
- **Distances and forces:** `GeodesicDisk` retains one unfolding per face.
  `logMap` / `distance`, pair-neighbour selection and spring forces use that
  approximation, not a globally valid shortest-path map.
- **Connections:** `geodesicBetween` is local shooting. `converged` checks
  its endpoint, not global optimality. The current `surfaceConnection`
  automatically substitutes an edge route when shooting fails.
  **That fallback is a known defect in the geodesic feature, not the
  proposed solution.** Reaching both endpoints is necessary, not sufficient.

The motion integrator does not use this edge fallback; pair and spring
forces do not use it either. Their separate approximation must also be
replaced, rather than fixing only the displayed line.

## 17. Proposed solution without geometry-central

**Decision update (2026-10-21): exact global endpoint paths are deferred.**
Keep and harden straightest tracing for inertia; preserve explicit limitations
on current local force/distance estimates. Do not block surface-canvas, p5.js
or bounded physics-adapter work on a general solver, and do not quietly turn
approximate paths into exact results.

The public `shortestPath(surface,a,b,opts)` and `Surface.shortestPath(a,b,opts)`
are reserved placeholders: both always throw `ERR_NOT_IMPLEMENTED`, even
for coincident endpoints. They are not called by existing demos/forces.
No output/options contract or backend is implemented.

The earlier proposal below is retained as **one candidate**, not a commitment
to rebuilding geometry-central's algorithms in JS. When the capability is
needed, compare existing implementations/adapters first.
Also, an exact polyhedral solver does not necessarily require an iterative
numerical optimizer: MMP is a wavefront-propagation algorithm. The challenge
is finding the global minimum across routes, not just shortening one route.

[Mitchell–Mount–Papadimitriou (MMP)](REFERENCES.md#mmp) solves the polyhedral
shortest-path problem. Unlike graph Dijkstra, it propagates information over
**continuous intervals on edges**, often called windows:

1. A window stores an edge interval, an unfolded source or pseudo-source,
   an accumulated distance offset, and predecessor information.
   In edge coordinates its distance function has the form
   `D(x) = offset + sqrt((x-u)^2 + v^2)` on that interval.
2. Unfold the adjacent triangle and propagate visible portions onto its
   other edges. Retain multiple competing windows, split their overlaps,
   and discard only portions dominated by a shorter valid distance function.
   This is the essential information missing from one-copy-per-face unfolding.
3. Handle vertex events/pseudo-sources, including saddle and boundary cases
   required by shortest paths. Do **not** impose equal-angle straightest
   continuation on the shortest-path wavefront.
4. Seed arbitrary face-interior sources without snapping to mesh vertices.
   Query face-interior targets by the valid incoming windows, then backtrack
   to recover exact endpoint positions and face-interior crossing segments.
5. Stop only when the propagation frontier cannot improve the target, or
   when the requested distance-radius search is complete. A work/memory
   budget exhaustion is `incomplete`, not "unreachable" or an exact result.

Here "exact" means the exact **piecewise-flat metric algorithm**, implemented
with documented numerical tolerances, not exact arithmetic and not an exact
geodesic on an underlying smooth bunny. Window intersection, dominance,
near-degenerate cases and traceback require careful numerical testing.

**Existing implementations, not mandatory dependencies:**
[Kirsanov's MMP code](REFERENCES.md#kirsanov-geodesic) is a standalone C++
implementation; geometry-central itself uses it for exact distances/paths.
[CGAL Surface Mesh Shortest Path](REFERENCES.md#cgal-shortest-path) provides
another exact family (Xin–Wang / Chen–Han). These confirm that the requested
library function exists and give independent test references. Reusing a
small standalone C++ solver through WASM would be an alternative if we later
choose a compiled build; it is **not required or adopted by this proposal**.
Any source reuse needs a pinned revision and license review. A JS
implementation should follow the published algorithm, not a guessed subset.

### One result shared by physics and drawing

Proposed eventual result contract (not implemented by the throwing exports):

- `shortestPath(a,b)` returns status, distance, a surface polyline, initial
  and terminal unit tangents, method/tolerances, and any detected branch ties.
  Distinguish `ok`, `disconnected`, `incomplete` and invalid input.
  Do not claim uniqueness merely because one path was returned.
- `distance` and a branch-aware `logMap` use that same solver/result.
  `logMap = distance * initialTangent` on a selected shortest branch, but
  it is not always the inverse of the straightest exponential map at cones.
- Compute an interacting unordered pair once. Use the same branch and
  distance for both forces, neighbour selection, and the displayed path at
  the same simulation state; reverse the result for the opposite query.
  Remove automatic graph-route substitution. An edge route may be an
  explicitly selected diagnostic, never a success-shaped geodesic.

For a pair energy `U(d)`, let `tA` point from `a` into the selected path and
`tB` be its forward arrival tangent at `b`. At regular endpoints where the
distance is differentiable, first variation gives

`F_a = U'(d) * tA`, and `F_b = -U'(d) * tB`.

For a spring, `U'(d) = k*(d-rest)`. This uses endpoint tangents rather than
comparing chart coordinates or transporting through an unrelated unfolding.
At a cut locus there may be no unique distance gradient; specify a
deterministic shared-branch policy and report ties. Branch persistence or
smoothing may help musical behavior, but can change the shortest-distance
force law and must be an explicit model choice. Coincident particles and
endpoints at cone vertices also need a stated force/direction policy.

### Performance without substituting the wrong geometry

Cache static topology/edge lengths, not distance fields for moving sources.
One source propagation can answer multiple target queries and stop at a
finite force radius; recompute it when the source moves. A multi-source
nearest-source field does not supply all pairwise distances. Reuse the
same solve for rendering rather than paying twice.

On an isometrically embedded triangle mesh, the 3D chord is a lower bound
on intrinsic distance and can safely reject pairs outside a cutoff; it must
not supply the force distance. This bound is not automatically valid for
an arbitrary decorative embedding of an abstract atlas. Graph paths can
provide valid upper bounds. Benchmark bunny-sized meshes and actual particle
counts before promising interactive exact all-pairs forces. Workers or a
compiled backend are later performance decisions, not fallback geometry.

## 18. Candidate implementation order and acceptance tests

The global-solver steps below are deferred. The tracer/transport audit is
still relevant now; these are acceptance criteria to preserve for future
backend selection, not a requirement to implement MMP before the next demo.

1. **Harden tracing and transport.** Test flat, positive- and negative-deficit
   fans; wrapped fan angles; incoming/outgoing frame consistency; reversal
   and timestep subdivision; exact/near vertex hits; edge-aligned motion;
   boundary edges/corners; nonorientable seams. Audit fan traversal assumptions
   and ensure step-budget failures are exposed. Preserve speed without
   forces/damping and retain the correct crossing sequence.
2. **Build the shortest-path solver independently.** Start with valid
   manifold triangle meshes (closed or with boundary), arbitrary face/edge/
   vertex endpoints, and explicit disconnected/invalid-input results.
   Nonorientable meshes must use local adjacency, not assume a global
   orientation; verify Möbius cases before claiming support. General
   nonmanifold junctions and abstract quotient atlases need separate contracts.
3. **Wire every consumer together.** Replace distance/log queries, force
   cutoffs and nearest-neighbour ranking, springs, and connections; retain
   straightest tracing for integration. Resolve cut-locus/boundary policies
   before switching dynamics. No invisible approximate fallback.
4. **Verify geometry, then benchmark.** Plane and cube hand-unfolding cases;
   cylinder wraparound; sphere non-antipodal and antipodal routes; saddle
   paths with unequal angles; boundary shortest paths without billiard
   reflection; disconnected meshes; and bunny face-interior endpoints.
   Check both endpoints intrinsically (not just coincident 3D coordinates),
   containment of every segment, straightness across ordinary unfolded
   crossings, the vertex angle inequalities, reversal symmetry, and length.
   Endpoint/straightness tests alone do not certify global optimality:
   compare against analytic cases and an independent exact implementation.
   Test force directions against finite differences of the same distance
   energy away from cut loci. Check path-length/force/display agreement.

For numerical tests, normalize by a characteristic mesh length and declare
tolerances before accepting results (initial target: `1e-6` relative length/
endpoint error and `1e-6` radians ordinary-crossing residual on well-conditioned
fixtures). Use absolute-plus-relative tolerances near zero. Smooth-sphere arc
error is a **separate mesh-approximation test** under refinement, not the
numerical tolerance for an exact polyhedral solver. Near-antipodal branch
choices and near-singular triangles require dedicated cases, not relaxed
tolerances that hide failures.
