// Endpoint-safe connection paths. Edge routes are upper bounds, not smooth geodesics.
import { geodesicBetween } from './geodesic.js';
import { len3, sub3 } from './vec.js';

const graphs = new WeakMap();

function vertexGraph(surface) {
  let graph = graphs.get(surface);
  if (graph) return graph;
  if (!surface.mesh) throw new Error('edgePath requires a triangle-mesh surface');
  graph = surface.mesh.positions.map(() => new Map());
  for (const face of surface.faces) {
    for (let k = 0; k < 3; k++) {
      const a = face.vidx[k];
      const b = face.vidx[(k + 1) % 3];
      const length = len3(sub3(surface.mesh.positions[a], surface.mesh.positions[b]));
      graph[a].set(b, { length, faceId: face.id });
      graph[b].set(a, { length, faceId: face.id });
    }
  }
  graphs.set(surface, graph);
  return graph;
}

function push(heap, entry) {
  let i = heap.length;
  heap.push(entry);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].d <= entry.d) break;
    heap[i] = heap[p];
    i = p;
  }
  heap[i] = entry;
}

function pop(heap) {
  const result = heap[0];
  const last = heap.pop();
  if (heap.length) {
    let i = 0;
    while (2 * i + 1 < heap.length) {
      let child = 2 * i + 1;
      if (child + 1 < heap.length && heap[child + 1].d < heap[child].d) child++;
      if (heap[child].d >= last.d) break;
      heap[i] = heap[child];
      i = child;
    }
    heap[i] = last;
  }
  return result;
}

// Dijkstra along mesh edges, with endpoints connected to their containing triangle's vertices.
// Every segment lies in a named triangle; no chord cuts through the object.
export function edgePath(surface, a, b) {
  const point = (faceId, v) => {
    const [x, y] = surface.toChart(faceId, surface.mesh.positions[v]);
    return { faceId, x, y };
  };
  if (a.faceId === b.faceId) {
    return { polyline: [a, b], length: Math.hypot(b.x - a.x, b.y - a.y), method: 'edge-path' };
  }
  const graph = vertexGraph(surface);
  const end = surface.faceById(b.faceId);
  const targets = new Set(end.vidx);
  const distance = new Float64Array(graph.length).fill(Infinity);
  const previous = new Int32Array(graph.length).fill(-1);
  const faceOf = new Int32Array(graph.length);
  const heap = [];
  const pa = surface.to3D(a);
  const pb = surface.to3D(b);
  for (const v of surface.faceById(a.faceId).vidx) {
    distance[v] = len3(sub3(surface.mesh.positions[v], pa));
    push(heap, { v, d: distance[v] });
  }
  let best = Infinity;
  let last = -1;
  while (heap.length) {
    const { v, d } = pop(heap);
    if (d !== distance[v]) continue;
    if (d >= best) break;
    if (targets.has(v)) {
      const total = d + len3(sub3(surface.mesh.positions[v], pb));
      if (total < best) {
        best = total;
        last = v;
      }
    }
    for (const [w, edge] of graph[v]) {
      const next = d + edge.length;
      if (next >= distance[w]) continue;
      distance[w] = next;
      previous[w] = v;
      faceOf[w] = edge.faceId;
      push(heap, { v: w, d: next });
    }
  }
  if (last < 0) return null;
  const route = [];
  for (let v = last; v >= 0; v = previous[v]) route.push(v);
  route.reverse();
  const polyline = [a, point(a.faceId, route[0])];
  for (let i = 1; i < route.length; i++) {
    const fid = faceOf[route[i]];
    polyline.push(point(fid, route[i - 1]), point(fid, route[i]));
  }
  polyline.push(point(b.faceId, last), b);
  return { polyline, length: best, method: 'edge-path' };
}

export function surfaceConnection(surface, a, b, opts = {}) {
  const shot = geodesicBetween(surface, a, b, opts);
  if (shot?.converged) return { ...shot, method: 'shooting' };
  const path = edgePath(surface, a, b);
  return path ? { ...path, converged: false, shootingMiss: shot?.miss ?? Infinity } : null;
}
