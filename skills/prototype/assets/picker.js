/*
 * Adapted from Emil Kowalski's prototype picker.
 * MIT License
 * Copyright (c) 2026 Emil Kowalski
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
function createPrototypePicker({
  stage, host, variants, controls = [], defaults = {}, sideBySide = false, cellWidth, shortlist = false, replay = false, position = 'bottom',
}) {
  if (!(stage instanceof HTMLElement) || !(host instanceof HTMLElement) || stage === host || stage.contains(host)) {
    throw new TypeError('The stage and picker host must be separate HTML elements.');
  }
  if (!Array.isArray(variants) || !variants.length || variants.some(v => !v || typeof v.name !== 'string' || !v.name.trim() || typeof v.mount !== 'function')) {
    throw new TypeError('Each variant needs a name and a mount function.');
  }
  if (cellWidth !== undefined && !(Number.isFinite(cellWidth) && cellWidth > 0)) throw new TypeError('cellWidth must be a positive number of pixels.');

  // A control with owner -1 is shared by every variant; otherwise it belongs to variants[owner].
  const allControls = [
    ...controls.map(control => ({ ...control, owner: -1 })),
    ...variants.flatMap((variant, index) => (variant.controls || []).map(control => ({ ...control, owner: index }))),
  ];
  const keys = new Set();
  for (const control of allControls) {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(control.key) || control.key === 'v' || control.key === 'keep' || keys.has(control.key)) {
      throw new TypeError(`Control keys must be unique camelCase names other than "v" and "keep": ${control.key}`);
    }
    keys.add(control.key);
    const valid = control.type === 'toggle'
      || (control.type === 'choice' && Array.isArray(control.options) && control.options.length > 0
        && control.options.every(option => typeof option === 'string' && option !== '')
        && new Set(control.options).size === control.options.length)
      || (control.type === 'range' && [control.min, control.max, control.step].every(Number.isFinite)
        && control.min < control.max && control.step > 0);
    if (!valid) throw new TypeError(`Control "${control.key}" needs type choice with distinct string options, toggle, or range with min < max and step > 0.`);
  }

  function parse(control, raw) {
    if (control.type === 'choice') return control.options.includes(raw) ? raw : undefined;
    if (control.type === 'toggle') return raw === true || raw === '1' ? true : raw === false || raw === '0' ? false : undefined;
    const number = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    return Number.isFinite(number) && number >= control.min && number <= control.max ? number : undefined;
  }

  const names = variants.map(variant => variant.name);
  for (const key of Object.keys(defaults)) {
    if (key !== 'variant' && !keys.has(key)) throw new TypeError(`Default "${key}" has no control.`);
  }
  if ('variant' in defaults && !names.includes(defaults.variant)) throw new TypeError(`Default variant "${defaults.variant}" does not exist.`);
  const baseIndex = 'variant' in defaults ? names.indexOf(defaults.variant) : 0;
  const base = {};
  for (const control of allControls) {
    if (control.key in defaults) {
      base[control.key] = parse(control, defaults[control.key]);
      if (base[control.key] === undefined) throw new TypeError(`Default "${control.key}" is not a valid value for its control.`);
    } else {
      base[control.key] = control.type === 'choice' ? control.options[0] : control.type === 'toggle' ? false : control.min;
    }
  }

  const all = variants.length;
  const count = variants.length + (sideBySide ? 1 : 0);
  let current = baseIndex;
  let values = { ...base };
  let kept = new Set();
  let mounted = [];
  let resizeObserver;

  const picker = document.createElement('nav');
  picker.className = 'proto-picker';
  picker.dataset.position = position;
  picker.setAttribute('aria-label', 'Prototype variants');
  const items = [...names, ...(sideBySide ? ['All'] : [])].map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'proto-picker-item';
    button.textContent = name;
    button.title = index === all ? 'All variants side by side' : name;
    button.addEventListener('click', () => select(index));
    picker.append(button);
    return button;
  });
  let keepButton;
  if (shortlist) {
    const divider = document.createElement('span');
    divider.className = 'proto-picker-divider';
    divider.setAttribute('aria-hidden', 'true');
    keepButton = document.createElement('button');
    keepButton.type = 'button';
    keepButton.className = 'proto-picker-item proto-picker-keep';
    keepButton.addEventListener('click', () => toggleKeep(current));
    picker.append(divider, keepButton);
  }
  if (replay) {
    const divider = document.createElement('span');
    divider.className = 'proto-picker-divider';
    divider.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'proto-picker-item proto-picker-replay';
    button.textContent = '↻';
    button.setAttribute('aria-label', 'Replay animation (R)');
    button.addEventListener('click', remount);
    picker.append(divider, button);
  }
  host.append(picker);

  let panel, panelBody;
  if (allControls.length || shortlist) {
    panel = document.createElement('details');
    panel.className = 'proto-controls';
    panel.open = matchMedia('(min-width: 640px)').matches;
    const summary = document.createElement('summary');
    summary.textContent = 'Controls';
    panelBody = document.createElement('div');
    panelBody.className = 'proto-controls-body';
    panel.append(summary, panelBody);
    host.append(panel);
  }

  function readUrl() {
    const params = new URL(location.href).searchParams;
    const v = params.get('__v');
    let index = baseIndex;
    if (sideBySide && v === 'all') index = all;
    else if (v && /^[1-9]\d*$/.test(v) && Number(v) <= variants.length) index = Number(v) - 1;
    values = {};
    for (const control of allControls) values[control.key] = parse(control, params.get(`__${control.key}`)) ?? base[control.key];
    kept = new Set(shortlist ? (params.get('__keep') || '').split(',')
      .filter(n => /^[1-9]\d*$/.test(n) && Number(n) <= variants.length).map(n => Number(n) - 1) : []);
    return index;
  }

  function activeControls() {
    return allControls.filter(control => control.owner === -1 || current === all || control.owner === current);
  }

  function writeUrl() {
    const url = new URL(location.href);
    url.searchParams.set('__v', current === all ? 'all' : String(current + 1));
    for (const control of allControls) {
      const value = values[control.key];
      if (value === base[control.key]) url.searchParams.delete(`__${control.key}`);
      else url.searchParams.set(`__${control.key}`, control.type === 'toggle' ? (value ? '1' : '0') : String(value));
    }
    if (kept.size) url.searchParams.set('__keep', [...kept].sort((a, b) => a - b).map(i => i + 1).join(','));
    else url.searchParams.delete('__keep');
    history.replaceState(null, '', url);
  }

  // Only what differs from the defaults, so the line pasted back to the agent names the decisions.
  function config() {
    const out = current === all ? {} : { variant: names[current] };
    for (const control of activeControls()) {
      if (values[control.key] !== base[control.key]) out[control.key] = values[control.key];
    }
    if (kept.size) out.keep = names.filter((_, i) => kept.has(i));
    return JSON.stringify(out);
  }

  function paramsFor(index) {
    const params = {};
    for (const control of allControls) {
      if (control.owner === -1 || control.owner === index) params[control.key] = values[control.key];
    }
    return params;
  }

  function unmount(entry) {
    const cleanup = typeof entry.result === 'function' ? entry.result : entry.result && entry.result.cleanup;
    if (typeof cleanup === 'function') cleanup();
    entry.result = undefined;
    entry.el.replaceChildren();
  }

  function mount(entry) {
    unmount(entry);
    entry.result = variants[entry.index].mount(entry.el, paramsFor(entry.index));
  }

  function teardown() {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = undefined;
    mounted.forEach(unmount);
    mounted = [];
    stage.replaceChildren();
  }

  function remount() {
    teardown();
    if (current !== all) {
      mounted.push({ index: current, el: stage });
      mounted.forEach(mount);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'proto-grid';
    stage.append(grid);
    variants.forEach((variant, index) => {
      const cell = document.createElement('section');
      cell.className = 'proto-cell';
      cell.setAttribute('aria-label', variant.name);
      const caption = document.createElement('div');
      caption.className = 'proto-cell-name';
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = variant.name;
      open.title = `Open ${variant.name} at full size`;
      open.addEventListener('click', () => select(index));
      caption.append(open);
      if (shortlist) {
        const keep = document.createElement('button');
        keep.type = 'button';
        keep.className = 'proto-cell-keep';
        keep.addEventListener('click', () => toggleKeep(index));
        caption.append(keep);
      }
      const cellStage = document.createElement('div');
      if (cellWidth) {
        // The variant lays out at cellWidth and is zoomed down to the cell, so a screen shows whole.
        const frame = document.createElement('div');
        frame.className = 'proto-cell-frame';
        cellStage.style.width = `${cellWidth}px`;
        frame.append(cellStage);
        cell.append(caption, frame);
      } else {
        cell.append(caption, cellStage);
      }
      grid.append(cell);
      mounted.push({ index, el: cellStage });
    });
    if (cellWidth) {
      const fit = () => mounted.forEach(entry => { entry.el.style.zoom = String(entry.el.parentElement.clientWidth / cellWidth); });
      resizeObserver = new ResizeObserver(fit);
      resizeObserver.observe(grid);
      fit();
    }
    mounted.forEach(mount);
  }

  function renderKeep() {
    if (!shortlist) return;
    items.forEach((item, i) => item.toggleAttribute('data-kept', kept.has(i)));
    const on = current !== all && kept.has(current);
    keepButton.innerHTML = on ? '<span class="proto-star">★</span>Kept' : '<span class="proto-star">☆</span>Keep';
    keepButton.setAttribute('aria-pressed', String(on));
    keepButton.disabled = current === all;
    keepButton.title = current === all ? 'Mark directions from their captions' : 'Add to shortlist (K)';
    stage.querySelectorAll('.proto-cell-keep').forEach((button, i) => {
      button.innerHTML = kept.has(i) ? '<span class="proto-star">★</span>Kept' : '<span class="proto-star">☆</span>Keep';
      button.setAttribute('aria-pressed', String(kept.has(i)));
    });
  }

  function toggleKeep(index) {
    if (!shortlist || index < 0 || index >= all) return;
    if (kept.has(index)) kept.delete(index);
    else kept.add(index);
    writeUrl();
    output.value = config();
    renderKeep();
  }

  function setValue(control, value) {
    values[control.key] = value;
    writeUrl();
    output.value = config();
    for (const entry of mounted) {
      if (control.owner !== -1 && control.owner !== entry.index) continue;
      if (!control.remount && entry.result && typeof entry.result.update === 'function') entry.result.update(paramsFor(entry.index));
      else mount(entry);
    }
  }

  function field(control) {
    const value = values[control.key];
    const label = control.label || control.key;
    const id = `proto-control-${control.key}`;
    // Segments only while every label fits its share of the panel width; longer sets use a select.
    const fits = { 1: 30, 2: 18, 3: 11, 4: 7 }[control.options && control.options.length];
    if (control.type === 'choice' && fits && control.options.every(option => option.length <= fits)) {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'proto-field';
      const legend = document.createElement('legend');
      legend.textContent = label;
      const segments = document.createElement('div');
      segments.className = 'proto-segments';
      for (const option of control.options) {
        const item = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = id;
        input.value = option;
        input.checked = option === value;
        input.addEventListener('change', () => setValue(control, option));
        const text = document.createElement('span');
        text.textContent = option;
        item.append(input, text);
        segments.append(item);
      }
      fieldset.append(legend, segments);
      return fieldset;
    }
    const wrap = document.createElement('label');
    wrap.className = control.type === 'toggle' ? 'proto-field proto-toggle' : 'proto-field';
    const name = document.createElement('span');
    name.className = 'proto-field-name';
    name.textContent = label;
    if (control.type === 'toggle') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value;
      input.addEventListener('change', () => setValue(control, input.checked));
      wrap.append(input, name);
    } else if (control.type === 'choice') {
      const select = document.createElement('select');
      for (const option of control.options) select.append(new Option(option, option, false, option === value));
      select.addEventListener('change', () => setValue(control, select.value));
      wrap.append(name, select);
    } else {
      const shown = document.createElement('output');
      const unit = control.unit || '';
      shown.value = `${value}${unit}`;
      name.append(shown);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = control.min;
      input.max = control.max;
      input.step = control.step;
      input.value = value;
      input.addEventListener('input', () => {
        shown.value = `${input.value}${unit}`;
        setValue(control, Number(input.value));
      });
      wrap.append(name, input);
    }
    return wrap;
  }

  const output = document.createElement('output');
  output.className = 'proto-config';
  output.setAttribute('aria-label', 'Changed values');

  function renderPanel() {
    if (!panel) return;
    const shared = activeControls().filter(control => control.owner === -1);
    const own = activeControls().filter(control => control.owner !== -1);
    const children = shared.map(field);
    variants.forEach((variant, index) => {
      const group = own.filter(control => control.owner === index);
      if (!group.length) return;
      if (current === all) {
        const heading = document.createElement('div');
        heading.className = 'proto-group';
        heading.textContent = variant.name;
        children.push(heading);
      }
      children.push(...group.map(field));
    });
    if (!children.length) {
      const empty = document.createElement('p');
      empty.className = 'proto-empty';
      empty.textContent = 'No controls for this variant.';
      children.push(empty);
    }
    const actions = document.createElement('div');
    actions.className = 'proto-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'proto-button proto-button-primary';
    copy.textContent = 'Copy config';
    copy.addEventListener('click', () => {
      const done = text => { copy.textContent = text; setTimeout(() => { copy.textContent = 'Copy config'; }, 1200); };
      // The Clipboard API is missing or denied in some previews; a selection copy still works there.
      const fallback = () => {
        const range = document.createRange();
        range.selectNodeContents(output);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        let copied = false;
        try { copied = document.execCommand('copy'); } catch {}
        done(copied ? 'Copied' : 'Select below');
      };
      if (navigator.clipboard) navigator.clipboard.writeText(output.value).then(() => done('Copied'), fallback);
      else fallback();
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'proto-button';
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => {
      values = { ...base };
      writeUrl();
      renderPanel();
      remount();
    });
    actions.append(copy, reset);
    output.value = config();
    panelBody.replaceChildren(...children, actions, output);
  }

  function select(index, updateUrl = true) {
    if (!Number.isInteger(index) || index < 0 || index >= count) return;
    current = index;
    items.forEach((item, i) => {
      item.toggleAttribute('data-active', i === current);
      if (i === current) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
    if (updateUrl) writeUrl();
    renderPanel();
    remount();
    renderKeep();
    const item = items[current];
    if (item.offsetLeft < picker.scrollLeft) picker.scrollLeft = item.offsetLeft;
    else if (item.offsetLeft + item.offsetWidth > picker.scrollLeft + picker.clientWidth) {
      picker.scrollLeft = item.offsetLeft + item.offsetWidth - picker.clientWidth;
    }
  }

  function onKey(event) {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('input, textarea, select') || target.isContentEditable) return;
    if (!picker.contains(target) && target.closest('button, a[href], summary, [role="slider"], [role="spinbutton"], [role="combobox"], [role="listbox"], [role="tablist"], [role="menu"], [role="tree"], [role="grid"]')) return;
    if (/^[1-9]$/.test(event.key) && Number(event.key) <= variants.length) {
      event.preventDefault();
      select(Number(event.key) - 1);
    } else if (sideBySide && event.key === '0') {
      event.preventDefault();
      select(all);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      select((current + (event.key === 'ArrowRight' ? 1 : count - 1)) % count);
      if (picker.contains(target)) items[current].focus({ preventScroll: true });
    } else if (shortlist && current !== all && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      toggleKeep(current);
    } else if (replay && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      remount();
    }
  }

  function onPopState() { select(readUrl(), false); }
  document.addEventListener('keydown', onKey);
  window.addEventListener('popstate', onPopState);
  select(readUrl());

  return {
    select,
    replay: remount,
    get current() { return current; },
    get values() { return { ...values }; },
    get kept() { return names.filter((_, i) => kept.has(i)); },
    destroy() {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPopState);
      teardown();
      picker.remove();
      if (panel) panel.remove();
    },
  };
}
