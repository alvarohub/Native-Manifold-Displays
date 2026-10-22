// Renderer/GUI-independent visualization settings and scalar normalization.
export const FACE_SOURCES = {
  plain: 'Fixed colour', K: 'Gaussian curvature K', H: 'Mean curvature H',
  deficit: 'Interior angle deficit', field: 'Procedural stripes (scalar field)',
};
export const VERTEX_SOURCES = { plain: 'Fixed colour', deficit: 'Interior angle deficit', K: 'Gaussian curvature K' };

const defaults = {
  faces: { visible: true, color: '#9aa6ba', opacity: 1, source: 'plain', map: 'diverging', range: null },
  edges: { visible: false, color: '#6f84aa', opacity: 0.45, width: 1, mode: 'all', angle: 1, fade: 0, source: 'plain' },
  vertices: { visible: false, color: '#ffd27b', opacity: 0.8, size: 0.015, source: 'deficit', map: 'diverging', range: null },
};

export function surfaceSettings(patch = {}, current = defaults) {
  const result = structuredClone(current);
  for (const [part, values] of Object.entries(patch)) {
    if (!Object.hasOwn(defaults, part) || !values || typeof values !== 'object') throw new Error(`Unknown surface representation: ${part}`);
    for (const [key, value] of Object.entries(values)) {
      if (!Object.hasOwn(defaults[part], key)) throw new Error(`Unknown surface setting: ${part}.${key}`);
      result[part][key] = value;
    }
  }
  for (const [part, settings] of Object.entries(result)) {
    if (typeof settings.visible !== 'boolean') throw new Error(`${part}.visible must be boolean`);
    if (!/^#[\da-f]{6}$/i.test(settings.color)) throw new Error(`${part}.color must be a six-digit hex colour`);
    if (!Number.isFinite(settings.opacity) || settings.opacity < 0 || settings.opacity > 1) throw new Error(`${part}.opacity must be in [0,1]`);
    if (part === 'edges') {
      if (!['all', 'feature'].includes(settings.mode) || !['plain', 'angle'].includes(settings.source)) throw new Error('Invalid edge mode or colour source');
      for (const key of ['angle', 'fade']) {
        if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 180) throw new Error(`edges.${key} must be in [0,180] degrees`);
      }
      if (!Number.isFinite(settings.width) || settings.width < 0.5 || settings.width > 8) throw new Error('edges.width must be in [0.5,8] pixels');
    } else {
      const sources = part === 'faces' ? { ...FACE_SOURCES, custom: 'Demo colours' } : VERTEX_SOURCES;
      if (!Object.hasOwn(sources, settings.source)) throw new Error(`Invalid ${part} colour source`);
      if (!['diverging', 'sequential'].includes(settings.map)) throw new Error(`Invalid ${part} colour map`);
      if (settings.range !== null && (!Array.isArray(settings.range) || settings.range.length !== 2 ||
        !settings.range.every(Number.isFinite) || settings.range[0] >= settings.range[1])) throw new Error(`${part}.range must be null or [min,max] with min < max`);
    }
  }
  if (!Number.isFinite(result.vertices.size) || result.vertices.size <= 0 || result.vertices.size > 1) throw new Error('vertices.size must be in (0,1] surface units');
  return structuredClone(result);
}

export function scalarRange(values, map, range = null) {
  if (range) return [...range];
  const finite = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const low = finite[Math.floor((finite.length - 1) * 0.02)];
  const high = finite[Math.ceil((finite.length - 1) * 0.98)];
  if (map === 'diverging') {
    const scale = Math.max(Math.abs(low), Math.abs(high), 1e-9);
    return [-scale, scale];
  }
  return high > low ? [low, high] : [low - 0.5, high + 0.5];
}

export function edgeOpacity(edge, settings) {
  if (edge.angle === null || settings.mode === 'all') return 1;
  const degrees = edge.angle * 180 / Math.PI;
  if (degrees <= settings.angle + 1e-7) return 0;
  if (!settings.fade) return 1;
  const t = Math.min(1, (degrees - settings.angle) / settings.fade);
  return t * t * (3 - 2 * t);
}
