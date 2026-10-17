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
