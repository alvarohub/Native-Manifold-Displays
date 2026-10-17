// M3 measurements: convergence of the smooth-quantity estimators on the unit icosphere.
import { Surface, icosphereMesh, gaussianCurvature, meanCurvature, curvatureTensor } from '../manifold-core/index.js';

const relErr = (arr, exact) => {
  const v = [...arr].filter((x) => !Number.isNaN(x));
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const rms = Math.sqrt(v.reduce((s, x) => s + (x - exact) ** 2, 0) / v.length);
  return { mean: ((mean - exact) / exact) * 100, rms: (rms / exact) * 100 };
};

console.log('unit icosphere: error of estimators vs smooth sphere (K=1, H=1, k1=k2=1)');
for (const n of [2, 3, 4, 5]) {
  const s = Surface.fromMesh(icosphereMesh(n));
  const t0 = performance.now();
  const K = relErr(gaussianCurvature(s), 1);
  const H = relErr(meanCurvature(s), 1);
  const C = curvatureTensor(s);
  const k1 = relErr(C.vertex.map((v) => v.k1), 1);
  const k2 = relErr(C.vertex.map((v) => v.k2), 1);
  const dt = performance.now() - t0;
  console.log(
    `  subdiv ${n} (F=${s.faces.length}): K mean ${K.mean.toFixed(2)}% rms ${K.rms.toFixed(2)}% | H mean ${H.mean.toFixed(2)}% rms ${H.rms.toFixed(2)}% | k1 rms ${k1.rms.toFixed(2)}% k2 rms ${k2.rms.toFixed(2)}% | ${dt.toFixed(0)} ms`,
  );
}
