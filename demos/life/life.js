// Game of Life on any cell graph (pure, no DOM). The library supplies the graph (cellAdjacency);
// the rule is Life-like "B…/S…": a dead cell is born with a count in B, a live one survives with a count in S.
// On irregular graphs (5-neighbour rims, Voronoi cells) the same rule string means different physics — see IDEAS.

export function parseRule(text) {
  const m = /^\s*B(\d*)\s*\/\s*S(\d*)\s*$/i.exec(text);
  if (!m) return null;
  const set = (s) => new Set([...s].map(Number));
  return { born: set(m[1]), survive: set(m[2]), text: `B${m[1]}/S${m[2]}` };
}

export function lifeStep(alive, adjacency, rule, out = new Uint8Array(alive.length)) {
  for (let c = 0; c < alive.length; c++) {
    let n = 0;
    for (const d of adjacency[c]) n += alive[d];
    out[c] = alive[c] ? (rule.survive.has(n) ? 1 : 0) : rule.born.has(n) ? 1 : 0;
  }
  return out;
}

// Classic patterns as [di, dj] offsets; i runs along the band/around the tube, j across it.
export const PATTERNS = {
  // lightweight spaceship travelling towards +i (period 4, 2 cells per period)
  lwss: [
    [0, 0],
    [3, 0],
    [4, 1],
    [0, 2],
    [4, 2],
    [1, 3],
    [2, 3],
    [3, 3],
    [4, 3],
  ],
  glider: [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  rpentomino: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
};
