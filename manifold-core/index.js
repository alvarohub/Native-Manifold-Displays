export * from './src/vec.js';
export * from './src/mesh.js';
export { Surface } from './src/surface.js';
export {
  trace,
  firstExit,
  vertexFan,
  holonomy,
  coneContinuation,
  transportAlong,
  GeodesicDisk,
  develop,
  logMap,
  distance,
  shortestPath,
  geodesicBetween,
} from './src/geodesic.js';
export {
  vertexAreas,
  vertexNormals,
  gaussianCurvature,
  gaussianCurvatureAt,
  dihedralAngles,
  surfaceEdges,
  meanCurvature,
  faceCurvatureTensors,
  curvatureTensor,
  curvatureAt,
  normalAt,
  eigen2,
} from './src/curvature.js';
export { VertexField, FaceField, vertexNeighbours } from './src/fields.js';
export { raycast } from './src/raycast.js';
export { edgePath, surfaceConnection } from './src/surfacePath.js';
