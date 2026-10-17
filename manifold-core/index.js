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
} from './src/geodesic.js';
export {
  vertexAreas,
  vertexNormals,
  gaussianCurvature,
  gaussianCurvatureAt,
  dihedralAngles,
  meanCurvature,
  faceCurvatureTensors,
  curvatureTensor,
  curvatureAt,
  normalAt,
  eigen2,
} from './src/curvature.js';
export { VertexField, FaceField, vertexNeighbours } from './src/fields.js';
