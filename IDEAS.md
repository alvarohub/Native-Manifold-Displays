# Native Manifold Displays — Ideas Notebook

Running log of ideas as they appear. Append freely; mark the ones that get
implemented. The Carillon's own notebook
(`../CubicMonome_topologicalSequencer/docs/IDEAS.md`) holds the earlier
seeds — §7 reader-as-sensor, §8 geodesic forces, §9 paint trails, §10 the
2D-skin shader, §20 surface lab — referenced here rather than copied.

---

## 1. Lineage: scoreLight → reader on a surface (2026-10-17)

**scoreLight** (Cassinelli, Kuribara, Zerroug, Manabe, Ishikawa; 2009–2012;
<https://www.alvarocassinelli.com/scorelight>) — a laser spot follows the
contours of a drawing like a pickup needle in a groove, with no camera and no
projector (smart laser scanner). Sound is generated **from local properties of
the line being followed**: pitch from the line's inclination (rotating the
drawing transposes the melody), FM from curvature (hearing the "roughness" —
kiki/bouba), discrete samples at corners (extreme curvature → percussion),
colour/contrast → timbre, length of a closed path → tempo; also bouncing
modes, multi-spot intermodulation by distance. Papers: NIME 2010 "scoreLight:
playing with a human sized laser pickup"; CHI 2012 Interactivity "scoreLight &
scoreBots".

The manifold version is the same idea lifted from 2D to a surface: a particle
following a geodesic (or a traced curve) **reads** what is under and around
it — a scalar/colour field, the Gaussian curvature nearby, the normal
curvature in its direction of motion, the distance to the nearest other
particle — and any of these can drive sound or colour. Direct mapping table:

| scoreLight (2D drawing)              | surface reader                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| line inclination → pitch             | heading relative to a frame field / to the baseline geodesic                         |
| line curvature → FM                  | $\kappa_g$ of the traced curve, or $\kappa_n$ of the surface in the motion direction |
| corners → percussion                 | cone-point hits (angle deficit); sharp field gradients                               |
| colour → timbre                      | texture / scalar field sample                                                        |
| closed-path length → tempo           | period of a closed geodesic (they exist on the cube: the Carillon bands)             |
| spot–spot distance → intermodulation | geodesic distance between readers                                                    |

Status: idea; becomes demo D3 after D1/D2.

## 2. Repelling particles = an "optimal" grid with forced defects

Mutual repulsion through geodesic distance on a closed surface relaxes to a
near-hexagonal packing — but Euler's formula forbids a perfect one on a
sphere ($V - E + F = 2$ forces exactly 12 pentagonal defects, like a football
/ fullerene). On a cube the defects should sit at the 8 corners (deficit
$90°$ each): **the defects of the particle lattice are a picture of where the
curvature is.** Varying $N$ reorganises the whole pattern (Thomson-problem
dynamics Alvaro explored on a sphere years ago; 8 points → cube corners).
Status: core of demo D1.

**Local minima and annealing (Alvaro, 2026-10-17).** On the cube the
landscape is rugged: 8 repelling points can get stuck with four on the
mid-edges of one face and four on the mid-edges of the opposite face — a
stationary configuration that is _not_ the corner minimum, and not obviously
worse. So the gradient flow alone will not find the corners from random
starts: the demo needs **simulated annealing** (a temperature of random kicks
decaying to zero — `ParticleSystem.temperature`) and should **draw the
trajectories** as they converge, so the descent into a basin, the hops between
basins while hot, and the final freeze become visible. Measuring: energy
$\sum 1/d_{ij}$ along the run; count distinct final configurations over many
seeds (a histogram of basins, cube vs sphere). The 8-corner check in the
tests is deliberately a _basin_ test (start near the corners), not a global
claim.

**Why the torus seems never to settle (Alvaro's question, 2026-10-17; not
investigated, recorded).** Two candidate causes, one physical, one ours.
(a) The torus has a continuous symmetry (rotation about its axis) and, for
repulsive packings, a near-flat family of configurations: the whole lattice
can slide along the tube and around the ring at almost no energy cost
(Goldstone-like zero modes), so convergence is slow and the "minimum" is a
valley, not a bowl. (b) Our pair force keeps **one** unfolding per face (the
geodesic disk's shortest) and a cutoff $R$; on a torus with $R$ larger than
the tube circumference ($2\pi r$) the force from a neighbour should include
its images the other way round the tube and the ring — we drop them, so the
force field is not exactly the gradient of a potential, and a
non-conservative field can drive perpetual slow circulation. Test later:
shrink $R$ below $2\pi r$ and see if drift stops; or sum over all unfoldings
within $R$ (method of images, LIBRARY_PLAN §5.3). Demo-side the connections
layer makes the sliding visible.

## 3. Turtle geometry on surfaces (the robot)

Dead reckoning = Abelson–diSessa turtle. A crawling robot with a pen normal to
the surface _is_ a turtle: it knows odometry and steering ($\kappa_g$) only.
Letters it draws don't close by the enclosed curvature. Nice piece: the same
word written around a cube, a sphere and a saddle — three different
"handwritings" of one surface each. See `docs/DRAWING_ON_SURFACES.md`.
Status: imprint mode in D2.
**Lineage — Untethered Robotic Printer Heads (2011)**,
<https://alvarocassinelli.com/unthethered-robotic-printer-heads/>: Korokoro,
an omni-wheel robot pantograph that redraws a figure on the floor after
receiving resize/rotate commands; the proposal was a swarm printing/scanning
in parallel over large _or curved_ surfaces, down to nano-bot "intelligent
ink" that localises by broadcasting presumed positions and refining them
with neighbours (morphogenetic gradients). Two threads for this library: (a)
`manifold-ink` output = the robot's odometry program on a curved object;
(b) a swarm of readers on a surface localising each other through
**geodesic** distances = the particle demo D1 with an extra "belief" state
per particle. Also the natural bridge to **3D printing**: conformal /
non-planar toolpaths on curved substrates are curves-on-surface with the
nozzle along the Darboux normal.

## 4. Text as particles joined by springs

myBlobChain (Verlet chains along glyph outlines, toxiclibs) ported to the
surface: glyph contours → particles with springs of planar rest length,
seeded by any imprint mode, relaxed with intrinsic forces. Letters find their
own minimum-stretch shape; with repulsion between letters a word _spreads_ on
the object. Status: D2 "relax" button (M8).

## 4b. Constraint modes as spring networks — distances, angles, and the reach of the forces (Alvaro, 2026-10-17)

Alvaro's thought: the four imprint modes are each a privileged family of
curves; the _general_ answer is a relaxation. Preserve-distance = length
springs; preserve-angle = "torque springs"; and the **reach** of the springs
(local vs extended) should interpolate between the two regimes. Taking notes
with one correction and two extensions:

- **Distances = springs with planar rest lengths.** On a developable surface
  every spring relaxes to zero stress (the drawing is an isometry). Elsewhere
  the residual stress is forced: it _is_ the curvature made visible, and the
  per-vertex strain ellipse of the relaxed net is exactly the Tissot
  indicatrix of IDEAS §5. Long-range springs (between far points of the
  drawing) ask for a global isometry — impossible for $K \ne 0$ — so they
  distribute error over the whole drawing; short-range springs only (edges of
  a fine triangulation of the drawing) give the elastic / as-rigid-as-possible
  answer where error is pushed into _bending_ between neighbouring cells. The
  reach knob is real: it is the cutoff of the pair-force graph we already
  have in `ParticleSystem` (`neighbourGraph(k, R)`), so one slider gives the
  whole family.
- **Angles do not need torque springs — they need _zero-rest-length_
  springs with the right weights (correction).** A spring network whose rest
  lengths are all zero minimises the Dirichlet energy
  $\sum_{ij} w_{ij}\,|x_i - x_j|^2$; with cotangent weights on a
  triangulated drawing that is the discrete harmonic map, and harmonic maps
  with free (or circle-type) boundaries are the conformal ones (the soap-film
  picture: the drawing wants to shrink to a point and the boundary stops it,
  so what survives is the shape of angles, not sizes). This is the
  variational core of BFF and of least-squares conformal maps (Lévy et al.
  2002, "LSCM"). So "angle mode" = relax with `rest = 0` and cotan weights
  while pinning a scale (two points, or the frame); "distance mode" = relax
  with `rest = planar length`; a blend $\text{rest} = \lambda\,\ell_{\text{planar}}$
  with $\lambda \in [0,1]$ is a continuous isometric→conformal dial.
  (Turtle-type **turning** constraints _are_ angle springs between
  consecutive segments: they preserve geodesic curvature, i.e. the shape of
  one stroke but not angles between strokes — that is why turtle letters are
  perfect individually and misaligned collectively.)
- **Unification with the particle demo.** Springs on surfaces are already
  `springForce` via `logMap`; the relaxation is D1's machinery applied to a
  drawing instead of a gas. The same `temperature` anneals a relaxation out
  of a bad local minimum (foldovers of the drawing are the local minima
  here).

## 4c. What is the "image" and what is its "reading support"? (Alvaro, 2026-10-17)

Imprinting depends on how we _decode_ the 2D content, not only on the surface:

- A **curve** can be read as positions (points in a plane — the exp/Fermi/
  projection readings) or as _odometry_ (lengths between consecutive points +
  steering angles — the turtle reading). Same SVG, different information
  content, different imprint.
- A **raster image** read pixel-wise offers distances and angles to all
  neighbours; decoded through a chart it becomes a texture (exp-map decal,
  Schmidt 2006); decoded along a scan path it becomes a _serial_ stream.
- Link to Alvaro's **Serial Paintings / Back and Forth – pneumatic anadrome**
  (2013–2020, with D. Saakes and C. Sandor; SIGGRAPH Asia 2020 Art Gallery;
  <https://alvarocassinelli.com/serial-paintings/>): the canvas as a
  decrypting/encrypting mechanism. The image is a 1-D string of beads; the
  _support_ (a spiral, a Hilbert/Gosper/Sierpiński space-filling curve)
  decides which image appears; shifting the string by one bead destroys it,
  reversing the string reveals the anadrome. In our vocabulary: the support
  is a map from a 1-D parameter to the 2-D canvas; here the support is a map
  from the 2-D canvas to the surface (the imprint mode) — the same idea one
  dimension up. Natural crossover: a **serial display on a surface** — a
  single geodesic (or a space-filling curve traced by turtle rules) carrying
  a bead string across a 3D object; the straightest geodesic on a torus or
  a cube is itself a quasi-space-filling guide (dense irrational windings).
  Decoding depends on the support; curvature is one more "key".

## 4d. A canvas interface: any 2D drawing library → a region of the surface (Alvaro, 2026-10-17)

Same move as the physics adapter (LIBRARY*PLAN §5: wrap a stock flat engine
behind develop/seam/force hooks): wrap a stock **2D drawing API** (canvas2D,
p5, SVG, a plotter driver) behind a `SurfaceCanvas` whose flat coordinates
\_are* a chosen parameterization $\varphi : U \to S$ of a patch — one of the
imprint modes, or a relaxed map. Two directions, both already half-built:

- **Vector**: paths drawn in $U$ are imprinted through $\varphi$ (what
  `manifold-ink` does; the adapter just translates the library's path
  commands into `contoursFromCommands`).
- **Raster**: for every surface sample in the patch, pull its planar
  coordinates through $\varphi^{-1}$ (= the log map / Fermi inverse, both
  available via the geodesic disk) and sample the image — the discrete
  exponential-map decal. This is also the Phase-4 **texture bridge**: a
  `SurfaceCanvas` _is_ a per-patch texture whose UVs are intrinsic.

Why it makes sense (and the honest limit): a chart in the atlas is a flat
coordinate system over a face; a `SurfaceCanvas` is a flat coordinate system
over a _region_ — a bigger, curvature-distorted chart chosen for drawing
convenience. Any 2D tool works inside it unchanged; the distortion is
confined to the parameterization, exactly like the physics engine never
knowing it runs on a manifold. The limit is the cut locus / injectivity
radius: the region must be small enough for $\varphi$ to be one-to-one, or
multiple overlapping canvases (an atlas of canvases) are needed — which is
where the display library and the manifold meet.

## 5. Make the obstructions visible

Small visual instruments for the demos: a Tissot indicatrix (small geodesic
circle drawn at points of the imprint, showing the local distortion ellipse);
the closure-gap arrow of a turtle loop; the Fermi grid that fails to close;
a vector carried around a vertex returning rotated (holonomy dial).

## 6. Where to go after the demos (pointers, not plans)

- Paint / trails as per-chart buffers (Carillon IDEAS §9) → "texture bridge".
- The whole evolution as a shader skin (Carillon IDEAS §10).
- Back-reacting geometry — particles with mass change vertex deficits
  (`MANIFOLD_DISPLAY_IDEA.md`, "Massive particles that bend the display").
- Robot output: export the surface curve with Darboux frames; a pen robot or a
  laser (scoreLight hardware!) draws it on the real object.

## 7. Möbius band presets + L-systems (Oct 2026)

- **Möbius band for music** (Alvaro: "the moebius band could work very well for music") — link to
  MoebiusHumanEqualizer/moebiusElasticPamelBand_5. A head running along the band returns on the _other side_
  after one turn and home after two: a natural 2:1 period / mirror-voice structure. `mobiusBandMesh(R, w, nu,
  nv, halfTwists)` in core; presets "Möbius" and "Möbius (3 half-twists)" in the demos.
- **Geometry (verified)**: the standard parametrisation is NOT developable — K ≈ −1/(4R²) on the centreline,
  more negative at the rim. A flat paper band is a different embedding (Sadowsky 1930; Starostin & van der
  Heijden, Nature Materials 2007) → candidate "paper Möbius" preset.
- **Handedness fix (found via the band)**: on non-orientable surfaces some chart transitions are reflections
  (det M = −1), so "turn left" must be multiplied by a running handedness. Frames carry `hand`;
  turtle/Fermi/projection respect it. Seam-straddling square: gap 0.40 before → 0.0017 after.
- **L-systems = native turtle programs** (`LSYSTEMS`, `lsystemContours` in manifold-ink): koch, snowflake,
  dragon, hilbert, gosper, sierpinski, plant, bush. On a curved surface the same program draws a different
  fractal (holonomy accumulates per turn). Imprint demo source "L-system", vertices kept exact.
