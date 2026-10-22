// Shared compact style button with a native popover. Adopted inputs retain their bindings.
export function appearanceControl(parent, {
  id, label, color = '#ffffff', opacity = 1, width = null,
  colorInput = null, opacityInput = null, widthInput = null, onInput = () => {}, before = null,
  visibilityInput = null,
}) {
  if (!document.getElementById('appearance-style')) {
    const style = document.createElement('style');
    style.id = 'appearance-style';
    style.textContent = `
      .appearance-control { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:5px 0; color:#aab3c2; }
      .appearance-control > label { display:flex; align-items:center; gap:6px; }
      .appearance-button { display:flex; align-items:center; gap:6px; background:#1a2230; color:#e6ebf2; border:1px solid #3a4356; border-radius:5px; padding:2px 7px; font:inherit; cursor:pointer; }
      .appearance-button:focus-visible { outline:2px solid #8fb4ff; outline-offset:2px; }
      .appearance-swatch { display:block; width:22px; height:12px; border:1px solid #7f8a9c; border-radius:2px; background:repeating-conic-gradient(#777 0% 25%,#222 0% 50%) 0 / 8px 8px; }
      .appearance-swatch span { display:block; width:100%; height:100%; }
      .appearance-picker { position:fixed; inset:auto; margin:0; box-sizing:border-box; width:260px; max-width:calc(100vw - 16px); max-height:calc(100dvh - 16px); overflow:auto; padding:10px; border:1px solid #4b5971; border-radius:8px; background:#121722; color:#e6ebf2; box-shadow:0 6px 24px #0009; font:13px system-ui,sans-serif; color-scheme:dark; }
      .appearance-picker header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
      .appearance-picker header button { background:none; color:inherit; border:1px solid #4b5971; border-radius:4px; cursor:pointer; font:inherit; }
      .appearance-picker .appearance-row { display:grid; grid-template-columns:65px minmax(50px,1fr) 42px; gap:6px; align-items:center; margin:6px 0; }
      .appearance-picker input[type=range] { min-width:0; width:100%; }
      .appearance-picker output { text-align:right; font-variant-numeric:tabular-nums; }
      .appearance-picker input[type=color] { width:42px; height:26px; padding:1px; cursor:pointer; }
    `;
    document.head.appendChild(style);
  }
  const group = document.createElement('div');
  group.className = 'appearance-control';
  const name = document.createElement('span');
  name.textContent = label;
  let caption = name;
  if (visibilityInput) {
    caption = document.createElement('label');
    caption.append(visibilityInput, name);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'appearance-button';
  button.setAttribute('aria-label', `${label} style`);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'dialog');
  const swatch = document.createElement('span');
  swatch.className = 'appearance-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  const preview = document.createElement('span');
  swatch.appendChild(preview);
  button.append(swatch);
  const picker = document.createElement('div');
  picker.id = `${id}Picker`;
  picker.className = 'appearance-picker';
  picker.popover = 'auto';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', `${label} style`);
  button.popoverTargetElement = picker;
  button.setAttribute('aria-controls', picker.id);
  const header = document.createElement('header');
  const heading = document.createElement('strong');
  heading.textContent = `${label} style`;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.popoverTargetElement = picker;
  close.popoverTargetAction = 'hide';
  header.append(heading, close);
  picker.appendChild(header);
  group.append(caption, button, picker);
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && picker.matches(':popover-open')) {
      event.preventDefault();
      event.stopPropagation();
      picker.hidePopover();
      button.focus();
    }
  });
  const position = () => {
    const rect = button.getBoundingClientRect();
    const box = picker.getBoundingClientRect();
    picker.style.left = `${Math.max(8, Math.min(rect.right - box.width, window.innerWidth - box.width - 8))}px`;
    const top = rect.bottom + 5;
    picker.style.top = `${Math.max(8, Math.min(top, window.innerHeight - box.height - 8))}px`;
  };
  picker.addEventListener('toggle', (event) => {
    const open = event.newState === 'open';
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      position();
      window.addEventListener('resize', position);
      document.addEventListener('scroll', position, true);
    } else {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    }
  });
  const make = (type, suffix, value, min, max, step) => {
    const input = document.createElement('input');
    input.id = id + suffix;
    input.type = type;
    input.value = value;
    if (type === 'range') Object.assign(input, { min, max, step });
    return input;
  };
  const c = colorInput || make('color', 'Color', color);
  const a = opacityInput || make('range', 'Opacity', opacity, 0, 1, 0.01);
  const w = widthInput || (width === null ? null : make('range', 'Width', width, 0.5, 8, 0.25));
  const colorRow = document.createElement('div');
  colorRow.className = 'appearance-row';
  const colorLabel = document.createElement('label');
  colorLabel.htmlFor = c.id;
  colorLabel.textContent = 'colour';
  colorRow.append(colorLabel, c);
  picker.appendChild(colorRow);
  const syncOutputs = [];
  const row = (text, input) => {
    const div = document.createElement('div');
    div.className = 'appearance-row';
    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = text;
    const out = document.getElementById(input.id + 'Out') || document.createElement('output');
    out.htmlFor = input.id;
    const sync = () => { out.textContent = Number(input.value).toFixed(2); };
    input.addEventListener('input', sync);
    syncOutputs.push(sync);
    sync();
    div.append(label, input, out);
    picker.appendChild(div);
  };
  row('opacity', a);
  if (w) row('width px', w);
  const syncPreview = () => {
    for (const sync of syncOutputs) sync();
    preview.style.backgroundColor = c.value;
    preview.style.opacity = a.value;
    button.title = `${label}: ${c.value}, opacity ${Number(a.value).toFixed(2)}${w ? `, width ${w.value} px` : ''}`;
  };
  for (const input of [c, a, w].filter(Boolean)) input.addEventListener('input', syncPreview);
  syncPreview();
  for (const input of [c, a, w].filter(Boolean)) input.addEventListener('input', onInput);
  parent.insertBefore(group, before);
  return {
    element: group,
    button,
    picker,
    syncPreview,
    get color() { return c.value; },
    get opacity() { return Number(a.value); },
    get width() { return w ? Number(w.value) : null; },
  };
}

export function adoptAppearanceControl(colorInput, options) {
  const row = colorInput.closest('.row');
  const oldRows = [row, options.opacityInput?.closest('.row'), options.widthInput?.closest('.row')].filter(Boolean);
  const result = appearanceControl(options.parent || row.parentElement, {
    ...options, colorInput, before: options.before ?? (options.parent ? null : row),
  });
  for (const old of new Set(oldRows)) old.remove();
  return result;
}
