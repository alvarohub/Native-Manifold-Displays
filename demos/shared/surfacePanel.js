// DOM adapter for SurfaceView's public settings. No geometry calculations or three.js types.
import { appearanceControl } from './appearance.js';
import { FACE_SOURCES, VERTEX_SOURCES } from './surfaceStyle.js';

export function surfacePanel(fieldset, view) {
  fieldset.querySelector('legend').textContent = 'Manifold surface';
  const host = document.createElement('div');
  host.className = 'surface-controls';
  const css = document.createElement('style');
  css.textContent = `
    .surface-controls .surface-option { display:grid; grid-template-columns:105px minmax(0,1fr); gap:6px; align-items:center; margin:5px 0; }
    .surface-controls select,.surface-controls input[type=number] { min-width:0; width:100%; box-sizing:border-box; background:#121722; color:#e6ebf2; border:1px solid #2a3140; border-radius:4px; font:inherit; padding:2px; }
    .surface-controls .surface-range { display:flex; gap:4px; }
    .surface-controls .surface-legend { font-size:11px; color:#9fb3d9; margin:4px 0 10px; }
    .surface-controls .surface-scale { display:block; height:5px; border-radius:2px; margin:4px 0; }
    .surface-controls input[type=range] { width:100%; min-width:0; }
    .surface-controls [hidden] { display:none !important; }
  `;
  if (!document.getElementById('surface-panel-style')) {
    css.id = 'surface-panel-style';
    document.head.appendChild(css);
  }
  fieldset.appendChild(host);
  const groups = {};
  const cleanups = [];
  for (const [part, title] of [['faces', 'Faces'], ['edges', 'Edges'], ['vertices', 'Vertices']]) {
    const section = document.createElement('div');
    section.dataset.representation = part;
    host.appendChild(section);
    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.id = `surface-${part}-visible`;
    const c = document.createElement('input');
    c.type = 'color';
    c.id = `surface-${part}-color`;
    const opacity = document.createElement('input');
    Object.assign(opacity, { type: 'range', id: `surface-${part}-opacity`, min: 0, max: 1, step: 0.01 });
    const width = part === 'edges' ? document.createElement('input') : null;
    if (width) Object.assign(width, { type: 'range', id: 'surface-edges-width', min: 0.5, max: 8, step: 0.25 });
    const style = appearanceControl(section, {
      id: `surface-${part}`, label: title, colorInput: c, opacityInput: opacity, widthInput: width,
      visibilityInput: visible,
      onInput: () => view.setOptions({ [part]: { color: c.value, opacity: Number(opacity.value),
        ...(width ? { width: Number(width.value) } : {}) } }),
    });
    visible.addEventListener('change', () => view.setOptions({ [part]: { visible: visible.checked } }));
    const controls = {};
    const option = (key, label, choices) => {
      const row = document.createElement('div');
      row.className = 'surface-option';
      const caption = document.createElement('label');
      caption.htmlFor = `surface-${part}-${key}`;
      caption.textContent = label;
      const input = document.createElement('select');
      input.id = caption.htmlFor;
      for (const [value, text] of Object.entries(choices)) input.add(new Option(text, value));
      input.addEventListener('change', () => view.setOptions({ [part]: { [key]: input.value } }));
      row.append(caption, input);
      section.appendChild(row);
      controls[key] = input;
      return row;
    };
    const range = (key, label, min, max, step, suffix) => {
      const row = document.createElement('div');
      row.className = 'surface-option';
      const caption = document.createElement('label');
      caption.htmlFor = `surface-${part}-${key}`;
      const input = document.createElement('input');
      Object.assign(input, { id: caption.htmlFor, type: 'range', min, max, step });
      input.addEventListener('input', () => view.setOptions({ [part]: { [key]: Number(input.value) } }));
      row.append(caption, input);
      section.appendChild(row);
      controls[key] = input;
      controls[`${key}Label`] = { caption, label, suffix };
      return row;
    };
    if (part === 'edges') {
      option('mode', 'Show edges', { all: 'All mesh edges', feature: 'Feature edges' });
      range('angle', 'Feature angle', 0, 180, 0.5, '°');
      range('fade', 'Fade interval', 0, 180, 0.5, '°');
      option('source', 'Edge colour', { plain: 'Fixed colour', angle: 'Bending angle (0–180°)' });
      const note = document.createElement('div');
      note.className = 'surface-legend';
      note.textContent = 'Feature mode hides angles at/below the threshold; fade rises above it. Boundary/nonmanifold edges stay visible (grey in angle-colour mode).';
      section.appendChild(note);
    } else {
      option('source', 'Colour source', part === 'faces'
        ? { ...FACE_SOURCES, ...(view.customLabel ? { custom: view.customLabel } : {}) } : VERTEX_SOURCES);
      const mapRow = option('map', 'Colour scale', { diverging: 'Blue / white / red', sequential: 'Blue / cyan / yellow' });
      const rangeRow = document.createElement('div');
      rangeRow.className = 'surface-option';
      const autoLabel = document.createElement('label');
      const auto = document.createElement('input');
      auto.type = 'checkbox';
      auto.id = `surface-${part}-auto`;
      autoLabel.append(auto, ' Auto range');
      const bounds = document.createElement('div');
      bounds.className = 'surface-range';
      const low = document.createElement('input'), high = document.createElement('input');
      for (const [input, name] of [[low, 'minimum'], [high, 'maximum']]) {
        input.type = 'number';
        input.step = 'any';
        input.setAttribute('aria-label', `${title} scale ${name}`);
        bounds.appendChild(input);
      }
      const error = document.createElement('div');
      error.className = 'surface-legend';
      error.setAttribute('role', 'alert');
      const applyRange = () => {
        const valid = low.value !== '' && high.value !== '' &&
          Number.isFinite(low.valueAsNumber) && Number.isFinite(high.valueAsNumber) && low.valueAsNumber < high.valueAsNumber;
        if (!auto.checked && !valid) {
          error.textContent = 'Colour range requires two finite numbers with minimum < maximum.';
          return;
        }
        error.textContent = '';
        view.setOptions({ [part]: { range: auto.checked ? null : [low.valueAsNumber, high.valueAsNumber] } });
      };
      auto.addEventListener('change', applyRange);
      low.addEventListener('change', applyRange);
      high.addEventListener('change', applyRange);
      rangeRow.append(autoLabel, bounds);
      const legend = document.createElement('div');
      legend.className = 'surface-legend';
      section.append(rangeRow, error, legend);
      Object.assign(controls, { mapRow, rangeRow, auto, low, high, legend, error });
      if (part === 'vertices') range('size', 'Radius', 0.002, 0.08, 0.001, ' units');
    }
    groups[part] = { visible, c, opacity, width, style, controls };
    cleanups.push(() => {
      if (style.picker.matches(':popover-open')) style.picker.hidePopover();
    });
  }
  const sync = (settings) => {
    for (const [part, group] of Object.entries(groups)) {
      const values = settings[part], controls = group.controls;
      group.visible.checked = values.visible;
      group.c.value = values.color;
      group.opacity.value = values.opacity;
      if (group.width) group.width.value = values.width;
      group.style.syncPreview();
      for (const key of ['source', 'map', 'mode', 'angle', 'fade', 'size']) {
        if (controls[key]) controls[key].value = values[key];
        const info = controls[`${key}Label`];
        if (info) info.caption.textContent = `${info.label}: ${values[key]}${info.suffix}`;
      }
      if (part === 'edges') {
        controls.angle.disabled = controls.fade.disabled = values.mode === 'all';
      } else {
        const scalar = !['plain', 'custom'].includes(values.source);
        controls.mapRow.hidden = controls.rangeRow.hidden = !scalar;
        const legend = view.legend(part);
        controls.auto.checked = values.range === null;
        controls.error.textContent = '';
        const bounds = values.range || legend?.range;
        controls.low.disabled = controls.high.disabled = values.range === null;
        controls.low.value = bounds ? bounds[0] : '';
        controls.high.value = bounds ? bounds[1] : '';
        controls.legend.hidden = !scalar || !legend;
        controls.legend.replaceChildren();
        if (scalar && legend) {
          if (bounds) {
            const scale = document.createElement('span');
            scale.className = 'surface-scale';
            scale.style.background = `linear-gradient(to right,${legend.colors.join(',')})`;
            controls.legend.append(scale, `${bounds[0].toPrecision(3)} … ${bounds[1].toPrecision(3)}${values.range ? '' : ' (auto, 2–98%)'}. `);
          } else controls.legend.append('No finite values. ');
          controls.legend.append('Grey = undefined/boundary value.',
            values.source === 'H' ? ' Signed H requires consistent normals.' : '',
            legend?.missing ? ` ${legend.missing} undefined vertices.` : '');
        }
      }
    }
  };
  const unsubscribe = view.subscribe(sync);
  sync(view.settings);
  return { element: host, dispose() { unsubscribe(); for (const cleanup of cleanups) cleanup(); host.remove(); } };
}
