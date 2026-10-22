# Native Manifold Displays: Intrinsic Graphics, Geodesic Shaders, and Physics on Non-Euclidean Surfaces

**Draft Technical Monograph — Native Manifold Displays Project**  
*Alvaro Cassinelli et al. (2026)*

---

## Abstract

Almost all of computer graphics is built upon a single hardware assumption: the display is a flat, rectangular array of pixels $(x, y) \in [0, W) \times [0, H)$ equipped with a global Euclidean coordinate system. Even when imagery is wrapped around 3D geometry via UV texture mapping or projected onto physical objects via spatial augmented reality, the underlying canvas remains a flat rectangle distorted a posteriori onto a surface. Meanwhile, emerging display hardware—flexible e-ink and AMOLED skins, polyhedral LED instruments, robotic surface plotters, and spatially distributed architectural panels—makes it possible to cover curved, non-orientable, or topologically non-trivial objects with emissive elements.

We introduce **Native Manifold Displays**: a mathematical framework, rendering pipeline, and software/firmware architecture in which the display itself is treated as a 2-manifold $S$ represented by an **atlas of local coordinate charts** glued by **explicit transition maps**. In this model, no global coordinate system, UV unwrapping, or ambient 3D embedding is required for computation. Moving agents, brush strokes, vector curves, and physical particles carry only chart-local coordinates $(\text{faceId}, x, y)$ and tangent vectors $(v_x, v_y)$, crossing chart seams via precomputed rigid transformations $p' = M p + t$. We formulate a **Native Manifold Rendering Pipeline ("Manifold GPU")** that rasterizes 2D primitives directly into surface fragments without intermediate rectangular chart framebuffers—by evaluating perpendicular geodesic distance (Fermi coordinates) and Manifold Signed Distance Fields (SDFs) in a **Manifold Fragment Shader**—and generalizes 3D perspective rendering to a **Curved Retina**. Finally, we contrast native hardware execution (demonstrated on an embedded LED cube) with pragmatic **Simulated Manifold Display** techniques for previewing manifold graphics on standard 3D computer monitors in `Three.js` and `p5.js`.

---

## 1. Introduction: Beyond the Flat Rectangular Framebuffer

### 1.1 The Tyranny of the Rectangle
Why do graphics APIs—from early bitmapped framebuffers to OpenGL, Vulkan, HTML5 Canvas, Processing, and `p5.js`—define a canvas by two numbers: `width` and `height`? Historically, cathode-ray raster scanlines and planar lithographic matrices forced physical displays to be flat rectangles. Because a flat rectangle is a single global Euclidean chart ($K = 0$), graphics software inherited three implicit axioms:
1. **Global Addressing:** Every pixel has a unique pair of global coordinates $(x, y)$.
2. **Global Parallelism ("Up" and "Right"):** A single pair of orthogonal basis vectors $(\mathbf{e}_x, \mathbf{e}_y)$ is valid everywhere on the canvas; translating a shape from $(x_1, y_1)$ to $(x_2, y_2)$ requires no rotation, and the result is independent of the path taken.
3. **Euclidean Metric:** Distance between any two pixels is $\sqrt{\Delta x^2 + \Delta y^2}$, and parallel lines never converge or diverge.

When physical displays leave the flat plane—wrapping around cylinders, spheres, polyhedra, architectural columns, or freeform object skins—**all three axioms fail** by theorems of differential geometry:
- By **Gauss's *Theorema Egregium***, no surface with nonzero Gaussian curvature ($K \neq 0$) is locally isometric to the plane. Any single global 2D texture (UV map) must stretch, shear, or tear the metric.
- By the **Hairy Ball Theorem (Poincaré–Hopf)**, a closed surface of Euler characteristic $\chi \neq 0$ (such as a sphere or cube, $\chi = 2$) admits no continuous, non-vanishing tangent vector field. There is no global "up" or "right".
- By the **Gauss–Bonnet Theorem**, parallel-transporting a tangent vector around a closed loop $C = \partial R$ rotates it by the enclosed curvature $\iint_R K\,dA$ (**holonomy**)—or reflects its handedness if the loop reverses orientation on a non-orientable surface such as a Möbius band.

### 1.2 Physical Motivation: A World Covered with Displays
Our work is motivated by physical systems where the support is the canvas:
- **Polyhedral Musical & Interactive Instruments:** The *Cube Carillon* topological sequencer—an $8 \times 8 \times 6$ physical LED cube where musical read-heads travel along straightest geodesics, triggering notes on surface cells and producing accents when encountering corner singularities.
- **Deformable & Object-Conformal Skins:** Flexible e-ink and OLED sheets laminated onto curved objects (*Khronos Projector*, deformable interfaces).
- **Spatially Distributed & Sliced Displays:** Non-coplanar display panels scattered across rooms or public spaces with known 3D poses (*Volume Slicing Display*, *AngleCAD*), glued logically across physical gaps into a single manifold canvas.
- **Swarm & Robotic Surface Plotters:** Wheeled robots (*Untethered Robotic Printer Heads / Korokoro*) driving directly on curved floors or shells with a pen or nozzle held normal to the surface.

---

## 2. The Intrinsic Atlas and Transition Calculus

### 2.1 Charts, Transition Maps, and Non-Orientability
A piecewise-flat (polyhedral) surface $S$ is defined by an **atlas** $\mathcal{A} = \{(U_i, \varphi_i)\}$:
1. **Charts (Faces):** Each face $i \in \{0 \dots F-1\}$ is a flat 2D polygon $P_i \subset \mathbb{R}^2$ with its own local orthonormal coordinate axes $(u_i, v_i)$. A point on $S$ is represented purely by its chart tuple:
   $$p = (\text{faceId}, x, y), \qquad (x, y) \in P_{\text{faceId}}.$$
   A tangent vector at $p$ is a 2D vector $\mathbf{v} = (v_x, v_y) \in \mathbb{R}^2$ in that chart's frame.
2. **Edge Gluings (Transition Maps):** Whenever edge $e$ of chart $i$ is glued to edge $e'$ of chart $j$, the shared edge has the same intrinsic length in both charts. There is therefore a unique 2D rigid transformation $(M_{ij}, \mathbf{t}_{ij})$ with $M_{ij} \in O(2)$ that maps points and tangent vectors from chart $i$ into chart $j$:
   $$\mathbf{p}_j = M_{ij}\,\mathbf{p}_i + \mathbf{t}_{ij}, \qquad \mathbf{v}_j = M_{ij}\,\mathbf{v}_i.$$
   - If the two charts share consistent local orientation across edge $e$, $\det M_{ij} = +1$ ($M_{ij} \in SO(2)$ is a pure 2D rotation).
   - If the surface is **non-orientable** (e.g., a Möbius band or Klein bottle) or charts have opposite winding, seam crossings with $\det M_{ij} = -1$ are reflections. By tracking a scalar handedness $h \in \{+1, -1\}$ updated via $h \leftarrow h \cdot \operatorname{sign}(\det M_{ij})$ at every crossing, "turn left" ($h \cdot \mathbf{v}^\perp$) remains physically continuous across orientation-reversing seams.

### 2.2 Discrete Curvature and Cone Singularities
Inside every flat chart, the metric tensor is the identity ($g_{ab} = \delta_{ab}$) and Gaussian curvature vanishes ($K = 0$). All intrinsic curvature is concentrated at the vertices:
- At an interior vertex $v$, let $\Theta_v = \sum_{c \ni v} \theta_c$ be the sum of the interior corner angles of the incident faces. The **angle deficit** is:
  $$\delta_v = 2\pi - \Theta_v.$$
- Composing the edge transition matrices $M_{ij}$ counterclockwise once around vertex $v$ yields a rotation by exactly $\delta_v$ (**discrete holonomy**).
- Summing over all vertices of a closed polyhedral surface recovers the exact discrete **Gauss–Bonnet theorem**:
  $$\sum_{v \in V_{\text{int}}} \delta_v + \sum_{v \in \partial S} (\pi - \Theta_v) = 2\pi\chi(S), \qquad \chi(S) = V - E + F.$$

### 2.3 Geodesic Continuation vs. Geodesic Shortest Paths
Two distinct geodesic problems arise on $S$ (Polthier & Schmies 1998; Mitchell, Mount, & Papadimitriou 1987):
1. **Initial-Value Geodesic Tracing (`trace` — Straightest Geodesics):**
   Given $p_0 = (\text{faceId}, x, y)$, unit tangent $\mathbf{d}_0 = (d_x, d_y)$, and distance $L$, the trajectory moves in a straight line inside the current chart until it hits an edge at parameter $t$. It crosses into the neighbor chart via $(M, \mathbf{t})$ and continues for $L - t$. If it hits a vertex with angle sum $\Theta_v$, the **straightest geodesic** continues in the unique direction making equal angles $\Theta_v / 2$ on either side.
2. **Boundary-Value Geodesic Connection (`shortestPath` / `logMap`):**
   Given two points $p, q \in S$, find the shortest surface curve joining them. Away from cut loci and positive-deficit cone vertices ($\delta_v > 0$), unfolding a local neighborhood of charts (`develop`) lays target chart $q$ into $p$'s plane via composed transitions, giving a local logarithmic map $\log_p(q)$. Globally, shortest paths never pass through spherical cone vertices ($\delta_v > 0$) because cutting the corner always shortens the path, whereas saddle vertices ($\delta_v < 0$) act as scattering hubs that branch shortest paths.

---

## 3. The Native Manifold Rendering Pipeline ("Manifold GPU")

A central contribution of this work is clarifying what a **native hardware or GPU pipeline for a manifold display** looks like, and why it is fundamentally **not** "draw into rectangular chart framebuffers and glue textures together."

### 3.1 Why Intermediate Rectangular Chart FBOs Are the Wrong Abstraction
Suppose we want to draw a 2D line segment, circle, or polygon onto a manifold display. A tempting shortcut—used when adapting legacy 2D engines—is to render the shape into a small rectangular offscreen framebuffer (an FBO or `createGraphics(w, h)` texture) in the tangent plane and then project or unfold that texture onto the surface.

While useful as a compatibility bridge (see §6.2), intermediate rectangular FBOs are **not** the native manifold pipeline:
1. **Charts are not rectangles:** On a triangulated surface (e.g., the Stanford bunny) or a dodecahedron, charts are triangles or pentagons of varying sizes. Allocating rectangular FBOs wastes memory and requires UV clipping.
2. **Pre-rasterization freezes Euclidean geometry:** Rasterizing a primitive into a flat FBO *before* mapping it to the manifold freezes it in $K = 0$ Euclidean space, destroying multi-face wrapping and intrinsic curvature effects, and introducing double-resampling blur when the FBO texels are resampled onto surface emitters.

### 3.2 FBO-Free Primitive Rasterization via Geodesic Distance Fields
Recall how a modern flat 2D GPU rasterizes an anti-aliased line segment of length $L$ and half-width $w$:
- It does **not** step pixel-by-pixel with Bresenham's algorithm.
- Instead, the **geometry stage** emits a thin bounding rectangle of width $2(w + \epsilon)$ around the mathematical segment so the rasterizer visits only candidate pixels near the line.
- For each candidate pixel $\mathbf{q}$, the **fragment shader** computes the longitudinal projection $s(\mathbf{q}) \in [0, L]$ and the **exact perpendicular distance** $d_\perp(\mathbf{q})$ to the mathematical line, outputting smooth coverage $\alpha = \operatorname{smoothstep}(w + \epsilon, w - \epsilon, d_\perp(\mathbf{q}))$.

A **Native Manifold GPU** translates this architecture directly to the atlas—going from vertex coordinates in chart space straight to the **Manifold Fragment Shader**:

```text
  Intrinsic Primitive (e.g. Geodesic Segment: origin p0={faceId,x,y}, tangent d0, length L, width w)
        │
        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ STAGE 1: MANIFOLD GEOMETRY STAGE (Atlas Seam Router & Bounding Strip)   │
  │ • Traces centerline geodesic γ(s), s ∈ [0, L], across chart seams.      │
  │ • For each visited chart f_m (and neighbors within distance w of seams),│
  │   maps segment frame (p0^(m), t_m) into f_m's 2D coordinates via (M,t). │
  │ • Clips conservative bounding strip [0,L] × [-w-ε, +w+ε] against f_m.   │
  └─────────────────────────────────────────────────────────────────────────┘
        │  wakes candidate manifold fragments q = (faceId, x, y)
        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ STAGE 2: MANIFOLD FRAGMENT SHADER (Fermi Coordinates / Manifold SDFs)   │
  │ • Evaluates longitudinal & perpendicular geodesic distance at q:        │
  │     s(q) = clamp((q - p0^(m)) · t_m, 0, L)                              │
  │     d_⊥(q) = || q - (p0^(m) + s(q) t_m) ||                              │
  │ • Computes coverage α = smoothstep(w + ε, w - ε, d_⊥(q)) and color.     │
  └─────────────────────────────────────────────────────────────────────────┘
        │  writes directly into
        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ STAGE 3: PERSISTENT MANIFOLD FRAMEBUFFER (Per-Emitter or Barycentric)   │
  └─────────────────────────────────────────────────────────────────────────┘
```

Because $(\mathbf{p}_0^{(m)}, \mathbf{t}_m)$ in adjacent charts are related by the exact rigid transition map $(M, \mathbf{t})$, **both $s(q)$ and $d_\perp(q)$ are automatically continuous across every chart seam**—even when a thick line crosses an edge obliquely or its rounded cap straddles a polyhedral crease. On a smoothly curved chart ($K \neq 0$), $(s, \pm d_\perp(q))$ are the classical **Fermi (geodesic normal) coordinates** along $\gamma(s)$, where by Gauss's Lemma the surface metric is $ds^2 = (1 - K(s)y_\perp^2 + \mathcal{O}(y_\perp^3))ds^2 + dy_\perp^2$.

Every 2D vector primitive becomes a **Manifold Signed Distance Field (SDF)** evaluated in the fragment shader without intermediate FBOs:
- **Geodesic Circle / Disk $(p_0, R)$:** Unfold charts within $R + w$ of $p_0$; each fragment evaluates $r(q) = d_S(p_0, q) = \|\log_{p_0}(q)\|$ and shades $|r(q) - R| \le w$ (ring) or $r(q) \le R$ (disk).
- **Geodesic Triangles, Polygons, and Splines:** Map control vertices into overlapped charts, emit conservative per-chart bounding polygons, and evaluate signed distance to the geodesic edges per fragment.

### 3.3 The Manifold Framebuffer: Storage Models and Seam Gluing
Where do the shaded manifold fragments live? Unlike a flat display's single $W \times H$ array, a **Manifold Framebuffer** supports three physical/logical organizations depending on the display:
1. **Unstructured Emitter / Cell Buffers:**
   When the physical display consists of discrete LEDs or cells at known surface points $q_k = (\text{faceId}_k, x_k, y_k)$ for $k \in \{0 \dots M-1\}$ (or one cell per triangle as in our 3,674-triangle Stanford bunny), the framebuffer is a 1D array `framebuffer[k]`. There are **no rectangular chart textures at all**; the Manifold Fragment Shader executes directly over the emitter addresses $q_k$ inside each bounding strip.
2. **Intrinsic Barycentric Face Grids (*Mesh Colors* / *Ptex* style):**
   For uniformly sampled triangulated surfaces, each triangle of resolution $N$ stores $\binom{N+2}{2}$ texels at barycentric indices $(i, j, k)$ with $i + j + k = N$, with halfedge pointers linking edge texels across seams.
3. **Polygonal Atlas Tiles with Seam Gutters:**
   When charts are flat polygons (such as the 6 square faces of an LED cube, or multi-panel installations), each chart has a local 2D grid supplemented by a 1–2 texel **seam gutter (halo)** populated by copying border texels from neighboring charts via $M^{-1}(p - \mathbf{t})$.

Across chart seams, the Manifold Framebuffer enforces two rules analogous to OpenGL's rasterizer and fragment stage:
- **Shared-Edge Ownership (Top-Left Rule):** Emitters or texels lying exactly on a seam edge are assigned to a single canonical chart so translucent strokes never double-blend or leave a crack.
- **Frame Rotation of Derivatives (`dFdu`, `dFdv`) and Convolutions:** When a fragment shader or PDE step (e.g., blur, reaction–diffusion, fluid advection) samples a neighbor across edge $e$, the step offset $(\Delta u, \Delta v)$ is rotated by $M_e$, and any tangent vector stored in the framebuffer is rotated back by $M_e^{-1}$.

### 3.4 The "Curved Retina": Projecting 3D Worlds onto a Manifold Display
A flat display serves not only as a 2D canvas, but also as a **projection plane** for 3D scenes via OpenGL's perspective matrix. What is the equivalent for a Manifold Display $S \subset \mathbb{R}^3$? **The Curved Retina** (or crystal-ball / object-skin display):
- Given a 3D scene and a center of projection (eye point) $\mathbf{E} \in \mathbb{R}^3$, each manifold fragment $q = (\text{faceId}, x, y)$ with 3D position $\mathbf{P}(q)$ defines a viewing ray:
  $$\mathbf{r}(q) = \frac{\mathbf{P}(q) - \mathbf{E}}{\|\mathbf{P}(q) - \mathbf{E}\|}.$$
- **Polyhedral Displays (Piecewise-Flat Charts):** Because each chart $c$ is a flat polygon in $\mathbb{R}^3$, central projection from $\mathbf{E}$ onto chart $c$ is an exact **off-axis perspective frustum**. Standard hardware rasterization renders a 3D scene into the Manifold Framebuffer using one off-axis projection matrix per chart.
- **Smoothly Curved Retinas:** Straight 3D lines project to curved arcs in chart coordinates; the pipeline either tessellates 3D triangles in the geometry stage until each micro-triangle projects linearly, or evaluates a ray-casting / ray-marching query along $\mathbf{r}(q)$ per manifold fragment.

---

## 4. Imprinting 2D Graphics on Curved Surfaces

When placing a 2D drawing $\Gamma \subset U \subset \mathbb{R}^2$ (typography, SVG vector art, logos, or procedural curves) onto a curved manifold $S$, Gauss's *Theorema Egregium* forbids a distortion-free map wherever $K \neq 0$. Thus, "imprinting" is a **deliberate choice of which geometric invariant to preserve**.

### 4.1 The $K L^2$ Scaling Law and Tissot Indicatrix
For a drawing of characteristic size $L$ placed on a surface region of Gaussian curvature $K$, every intrinsic metric distortion scales as the dimensionless product **$K L^2$** (the leading term of the Jacobi geodesic-deviation expansion $\ddot{J} + K J = 0$):
- The circumference of a geodesic circle of radius $r$ is $C = 2\pi r\big(1 - \frac{1}{6} K r^2 + \mathcal{O}(r^4)\big)$.
- Parallel transport around a small loop of area $A \sim L^2$ rotates the heading by $\Delta \theta \approx K A$.

Consequently, $R_K = 1/\sqrt{|K|}$ is the **curvature radius**: any figure with $L \ll R_K$ looks identical across all imprinting modes, whereas as $L \to R_K$, the modes diverge dramatically, deforming infinitesimal circles into the **Tissot indicatrix** ellipse of the chosen map.

### 4.2 The Placement Frame and Five Imprint Constructions
In the Euclidean plane, a drawing is positioned by a similarity frame $(x_0, y_0, \theta, s)$. On a manifold $S$, the placement frame is the tuple:
$$\mathcal{F} = \big(\text{anchor } p_0 = (\text{faceId}, x, y),\ \text{unit heading } \mathbf{h} \in T_{p_0}S,\ \text{scale } s > 0,\ \text{handedness } h \in \{\pm 1\}\big).$$
Translating $\mathcal{F}$ by $(\Delta x, \Delta y)$ traces a geodesic from $p_0$ and **parallel-transports** $\mathbf{h}$ (and updates $h$ across orientation-reversing seams). From $\mathcal{F}$, `manifold-ink` defines five constructions:

| Mode | Preserves | Distorts | Closed Loops Close? | Geometric Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **1. Turtle (Dead Reckoning)** | Arc length $s$ and geodesic curvature $\kappa_g = \kappa_{\text{planar}}$ | Global positions drift; loops fail to close | **No** — heading rotates by $\iint K\,dA$, leaving a closure gap | Step-by-step `trace` turning by $\Delta\theta = h\,\kappa\,\Delta s$; native to wheeled surface robots |
| **2. Exponential Map (Polar)** | Geodesic radial distances and angles from $p_0$ | Circumferential lengths scale by $1 - \frac{1}{6}Kr^2$ | **Yes** (within injectivity radius) | Each point $(x, y) = (r\cos\theta, r\sin\theta)$ shoots a radial geodesic of length $s r$ from $p_0$ |
| **3. Fermi (Geodesic Graph Paper)** | Arc length along baseline ($x$) and along perpendicular geodesics ($y$) | Longitudinal parallels converge ($K>0$) or diverge ($K<0$) by $\cos(\sqrt{K}y)$ | **Yes** (within focal locus) | Walk $s x$ along baseline geodesic, turn $90^\circ$ ($h$), walk $s y$ along perpendicular geodesic |
| **4. Extrinsic Projection** | Sightlines from an external projector/eye direction $\mathbf{d}$ | Foreshortening $\propto 1/\cos\theta$; no wrap-around | **Yes** (where visible) | Cast 3D rays from anchor tangent plane onto $S$ |
| **5. Spring Relaxation (Blobchain)** | Minimizes elastic energy $\sum_{ij} k_{ij}(\ell_{ij} - \ell_{ij}^0)^2$ | Distributes metric error smoothly across the figure | **Yes** (topological chains) | Closed particle-spring chains per glyph contour relaxing via intrinsic surface forces |

### 4.3 The Darboux Frame for Physical Robots and Non-Planar Toolpaths
Lifting an imprinted surface curve $\gamma(s) \subset S$ to 3D attaches the orthonormal **Darboux frame** $(\mathbf{T}, \mathbf{N}_S \times \mathbf{T}, \mathbf{N}_S)$, decomposing spatial curvature into:
- **Geodesic curvature $\kappa_g$:** In-surface steering, controlled by the drawing / robot wheels.
- **Normal curvature $\kappa_n$:** Out-of-plane bending imposed by the surface along $\mathbf{T}$.
- **Geodesic torsion $\tau_g$:** Twisting of the surface normal $\mathbf{N}_S$ about $\mathbf{T}$, imposed by the surface.

---

## 5. Intrinsic Physics, Spring Lettering, and Cellular Automata

1. **Intrinsic Particle Dynamics (`manifold-physics`):**
   Particles live strictly in chart state $(\text{faceId}, x, y, v_x, v_y)$. Inertial motion calls `trace`, conserving speed across seams without 3D projection constraints. Pairwise forces (repulsion, springs) evaluate the separation vector in the unfolded geodesic disk $\log_{p_i}(p_j)$, pulling particles along the surface.
2. **Spring-Chain Typography & The Blobchain Clock:**
   Combining `manifold-ink` with `manifold-physics` turns static imprinted text into a living physical object on the manifold: each glyph contour (e.g. outer loop and inner counter of `"8"` or `"0"`) is instantiated as a closed chain of surface particles connected by geodesic springs with planar rest lengths plus soft restoring anchors. In the **Blobchain Clock**, live time digits (`HH:MM:SS`) morph and relax across polyhedral creases and curved surfaces.
3. **Topological Cellular Automata (`cellAdjacency`):**
   Discrete cellular automata (Conway's Game of Life and general `B/S` rules) run directly on the manifold's cell graph—either on structured quad charts (cylinder, torus, Möbius band with orientation-flipping seam, Klein bottle, cube) or on unstructured triangle cells of any imported mesh (such as the 3,674 triangles of the Stanford bunny).

---

## 6. Hardware Realization vs. Simulated 3D Screen Previews

### 6.1 The Complexity Ladder & Microcontroller Fast Paths (`cube_display`)
While general triangle meshes require floating-point $2 \times 2$ rotation matrices $M_{ij}$ and polygon ray-clipping, structured manifolds collapse to $O(1)$ integer operations:
- On the **LED Cube** ($6$ square $N \times N$ charts), all 24 directed edge transitions belong to the octahedral group: every $M_{ij}$ is a signed permutation ($\pm 1, 0$), requiring zero floating-point operations or trigonometry (`kCubeGluings` in `firmware-lib/src/cube_topology.hpp`).
- Each face's $N \times N$ emitter grid maps directly to physical daisy-chained NeoPixels through `LedMapper` + `Adafruit_NeoMatrix`, decoupling intrinsic chart coordinates `(faceId, i, j)` from hardware wiring.

### 6.2 Simulated Manifold Displays on a Computer Screen (`Three.js` and `p5.js`)
When developing on a laptop or publishing interactive web sketches, the user views a **simulated manifold display** rendered in perspective on a flat 2D monitor. Our web architecture (`demos/shared/SurfaceView` for `Three.js` and `p5-manifold` for `p5.js`) bridges the intrinsic core to the screen through three complementary paths:

| Screen-Preview Technique | How it Works on the Monitor | Why it Exists & Trade-offs |
| :--- | :--- | :--- |
| **Path 1: Direct 3D Vector Lines (`to3D`)** | Computes intrinsic chart segments `{faceId, x, y}` across seams (`trace`, `imprint`), lifts endpoints to `(X,Y,Z)` via `surface.to3D`, and renders 3D lines with depth bias. | Crisp screen-resolution curves for turtle paths, exponential/Fermi imprints, L-systems, and particle trails without allocating surface textures. |
| **Path 2: Local `p5.Graphics` Stamp (`display.imprint`)** | Lets `p5.js` draw into a small 2D FBO (`createGraphics`), unfolds (`mode:'unfold'`) or projects (`mode:'projection'`) mesh triangles around `placement`, clips to the stamp's surface width, and draws textured 3D triangles. | Reuses 100% of `p5.js`'s 2D shapes, fills, images, and typography (`triangle`, `circle`, `rect`, `text`) on moving surface placements without rewriting a 2D rasterizer. |
| **Path 3: Per-Cell / Per-Emitter Framebuffer** | Stores RGBA color per surface cell/triangle (`setFaceColors`) and renders vertex/face-colored mesh triangles. | True discrete Manifold Framebuffer on the screen (used by Game of Life, curvature diagnostics, and the Sequencer). |

---

## 7. References

1. **Polthier, K., & Schmies, M.** (1998 / 2006). *Straightest Geodesics on Polyhedral Surfaces*. In *Mathematical Visualization* (pp. 135–150) & ACM SIGGRAPH 2006 Courses.
2. **Mitchell, J. S. B., Mount, D. M., & Papadimitriou, C. H.** (1987). *The Discrete Geodesic Problem*. SIAM Journal on Computing, 16(4), 647–668.
3. **Crane, K., Weischedel, C., & Wardetzky, M.** (2013). *Geodesics in Heat: A New Approach to Computing Distance Based on Heat Flow*. ACM TOG, 32(5).
4. **Sharp, N., Soliman, Y., & Crane, K.** (2019). *The Vector Heat Method*. ACM TOG, 38(3).
5. **Sharp, N., & Crane, K.** (2020). *You Can Find Geodesic Paths in Triangle Meshes by Just Flipping Edges (FlipOut)*. ACM TOG (SIGGRAPH Asia).
6. **Schmidt, R., Grimm, C., & Wyvill, B.** (2006). *Interactive Decal Compositing with Discrete Exponential Maps*. ACM TOG (SIGGRAPH 2006).
7. **Abelson, H., & diSessa, A.** (1980). *Turtle Geometry: The Computer as a Medium for Exploring Mathematics*. MIT Press.
8. **do Carmo, M. P.** (1976). *Differential Geometry of Curves and Surfaces*. Prentice-Hall.
9. **Yuksel, C., Keyser, J., & House, D. H.** (2010). *Mesh Colors*. ACM TOG, 29(2).
10. **Burley, B., & Lacewell, D.** (2008). *Ptex: Per-Face Texture Mapping for Production Rendering*. Eurographics Symposium on Rendering.
11. **Cassinelli, A.** (2005–2026). *Khronos Projector*, *Untethered Robotic Printer Heads (Korokoro)*, *Volume Slicing Display*, *myBlobChain*, *AngleCAD*, and *Cube Carillon Topological Sequencer*.

