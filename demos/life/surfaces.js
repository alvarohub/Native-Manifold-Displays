import { MESHES } from '../shared/meshes.js';

export function buildLifeSurface(key, nu, nv, customMesh = null) {
  const preset = MESHES[key];
  if (key === 'custom' && !customMesh) throw new Error('No imported mesh is available');
  const grid = key === 'custom' ? null : preset.life;
  const mesh = key === 'custom' ? customMesh : grid ? grid.build(nu, nv) : preset.build(2);
  const dims = grid ? grid.dims(nu, nv) : null;
  return { mesh, dims, cellOf: mesh.triangles.map((_, t) => (dims ? t >> 1 : t)) };
}

export function cellBorderEdges(mesh, cellOf) {
  const edges = new Map();
  mesh.triangles.forEach((tri, t) => {
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const edge = edges.get(key);
      if (edge) {
        edge.count++;
        if (edge.cell !== cellOf[t]) edge.border = true;
      } else edges.set(key, { a, b, cell: cellOf[t], count: 1, border: false });
    }
  });
  return [...edges.values()].filter((e) => e.count === 1 || e.border).map(({ a, b }) => [a, b]);
}
