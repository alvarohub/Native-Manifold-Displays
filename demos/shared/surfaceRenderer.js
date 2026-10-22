import * as THREE from 'three';

export function setSurfaceOpacity(mesh, opacity) {
  mesh.material.opacity = opacity;
  mesh.material.transparent = opacity < 1 || !!mesh.userData.vertexTransparency;
  mesh.material.depthWrite = !mesh.material.transparent;
  // Bias the support, not individual path endpoints: chart normals jump at seams.
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 1;
  mesh.material.polygonOffsetUnits = 2;
  mesh.visible = opacity > 0;
}

// Nearest-shell translucency: rear geometry, surface colour, then front geometry.
// Not order-independent transparency or volumetric transmission through multiple shells.
export function renderSurfaceScene(renderer, scene, camera, surfaces) {
  const supports = new Set(surfaces.filter((s) => s?.visible));
  if (![...supports].some((s) => s.material.transparent)) {
    renderer.render(scene, camera);
    return;
  }
  const objects = [];
  const materials = new Map();
  scene.traverse((o) => {
    if (!o.material) return;
    objects.push({ o, visible: o.visible });
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!materials.has(m)) {
        materials.set(m, {
          colorWrite: m.colorWrite,
          depthWrite: m.depthWrite,
          depthTest: m.depthTest,
          depthFunc: m.depthFunc,
          transparent: m.transparent,
        });
      }
    }
  });
  const background = scene.background;
  const autoClear = renderer.autoClear;
  const restoreMaterials = () => {
    for (const [m, state] of materials) Object.assign(m, state);
  };
  const select = (support) => {
    for (const { o, visible } of objects) o.visible = visible && supports.has(o) === support;
  };
  try {
    renderer.autoClear = false;
    renderer.clear();
    select(true);
    for (const s of supports) {
      Object.assign(s.material, { colorWrite: false, depthWrite: true, depthTest: true, transparent: false });
    }
    renderer.render(scene, camera);
    scene.background = null;
    restoreMaterials();
    select(false);
    for (const [m] of materials) {
      Object.assign(m, { depthFunc: THREE.GreaterDepth, depthWrite: false, depthTest: true });
    }
    renderer.render(scene, camera);
    restoreMaterials();
    select(true);
    for (const s of supports) {
      Object.assign(s.material, { depthFunc: THREE.LessEqualDepth, depthWrite: false, transparent: true });
    }
    renderer.render(scene, camera);
    restoreMaterials();
    select(false);
    renderer.render(scene, camera);
  } finally {
    restoreMaterials();
    for (const { o, visible } of objects) o.visible = visible;
    scene.background = background;
    renderer.autoClear = autoClear;
  }
}
