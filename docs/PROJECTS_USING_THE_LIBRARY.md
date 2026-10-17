# Projects that will use this library

Each project is developed in **its own repository** and imports `manifold-core` / `manifold-physics` /
`manifold-ink` from here. The demos in this repo stay small and thematic (particles, imprint, life, …). When a
demo prototypes something a project needs, it is tagged below so the idea can be lifted later rather than
re-invented.

- **Cube Carillon** (topological sequencer; heads on polyhedra fire notes at edge crossings and collisions)
  - uses: geodesic heads (`trace`, `stepHead`), cone points as accent events, cell grids on faces
  - prototyped here: free-particle geodesics (demos/particles), Life on cell graphs as an evolving score (demos/life)
- **Möbius Human Equalizer** (moebiusElasticPamelBand_5 lineage; elastic toxiclibs band)
  - uses: `mobiusBandMesh`, one-sided surface handling (`hand` in placement frames), Life/heads on the band
  - prototyped here: Möbius presets, turtle drawing across the twist, spaceship returning mirrored (demos/life)
  - musical intuition: anything travelling the band comes back mirrored after one loop, identical after two
- **Viva Voce** (spoken words flocking on a table)
  - uses: flocking / pair forces along the surface instead of the flat disk (`ParticleSystem`, `pairForce`),
    geodesic chains for sentences, imprinting words on curved supports
- **scoreLight / Sticky Light** (laser follows drawn contours, sonified)
  - uses: imprint + `liftContour` (Darboux frame) to follow contours on 3D objects; geodesic distance for sound
- **Untethered Robotic Printer Heads** (swarm printing on curved surfaces)
  - uses: turtle imprint (dead reckoning = what a wheeled robot actually does), closure gap / holonomy readouts
- **myBlobChain / florderelosss** (text-outline Verlet chains)
  - uses: spring relaxation of imprinted text on a surface (schedule M8)
- **Serial Paintings** (image vs reading support)
  - uses: surface as a reading support (heads reading an embedded score), SurfaceCanvas adapter (IDEAS §4d)
- **LED cube / Qbots** (physical displays)
  - uses: per-face cell grids, generated integer tables for firmware (`firmware-lib/`)
