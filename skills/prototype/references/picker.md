# Browser picker contract

Adapted from Emil Kowalski's pinned prototype picker. Read [sources.md](sources.md) for
attribution and deliberate changes. The floating dark pill and the control panel are review
chrome, not a product design reference. Keep their `proto-` classes isolated from product
styles.

The bundled CSS and JavaScript supply selection, controls, keyboard shortcuts, URL
persistence, the config export, and replay. Adapt rendering to the framework when needed;
preserve these observable behaviors:

- Show exactly one full-size variant and one selected picker item. With side-by-side on, an
  `All` item mounts every variant in its own cell, each under its name, and the name opens
  that variant at full size. With `cellWidth`, each cell lays its variant out at that width
  and zooms it down to the cell, so whole screens fit a grid.
- With `shortlist` on, a Keep button after the names, the `K` key, and a Keep button in each
  `All` caption mark the variant. A kept name shows a star.
- Clicking or tapping a named item switches instantly. Number keys `1` through `9` select
  the corresponding available variant, `0` selects `All`, and left/right arrows also switch.
  `R` replays only when replay is present. Past nine variants, the arrows reach the rest.
- Ignore shortcut events while editing, with a modifier held, or when a focused product
  control needs those keys. Buttons, links, sliders, listboxes, and comboboxes keep their
  own keyboard behavior. Tab reaches every picker button and control with visible focus.
- The URL holds the whole state under `__`-prefixed keys, so it never collides with the
  product's own parameters. `?__v=2` selects the second variant and `?__v=all` the side-by-side
  view. `?__keep=2,5` holds the shortlist by position. Each control appears as `__<key>` only
  while it differs from its default. Missing,
  malformed, and out-of-range values fall back to the default. Browser back/forward
  synchronizes selection and controls with the URL.
- Switching remounts the variant to the same initial state. Replay remounts the active
  variant. A control change calls the mounted variant's `update(params)` when its mount
  returned one, so the state the user built up survives, and remounts it otherwise. A control
  marked `remount`, such as the scenario, always remounts.
- The control panel lists the shared controls and the active variant's own, and under `All`
  every variant's own controls grouped by name. It ends with Copy config, which copies one
  JSON line holding the variant name, only the values that differ from the defaults, and the
  shortlist names under `keep`, and
  Reset, which returns every control to its default. The line also shows in the panel for
  manual selection.
- Static comparisons omit replay. The picker fits a narrow viewport, supports scrolling
  through long names, and provides at least 44 px touch targets. The panel opens by default
  from 640 px wide and starts collapsed below.
- Reserve space for the review chrome in the review wrapper: the picker's height, the panel's
  width beside the stage on desktop, and its collapsed height on a narrow viewport. The panel
  sits top right, below the picker when the picker is at the top. This must not change the
  product layout.

## Standalone integration

Create the stage and a picker mount outside it:

```html
<main id="stage"></main>
<div id="picker-host"></div>
```

Inline the bundled CSS in a `style` element and the bundled JavaScript in a `script` element.
Keep every default in one object at the top of the script that follows, so a settled value is
one edit:

```js
const PROTO_DEFAULTS = { variant: 'List', density: 'Comfortable', scenario: 'Typical' };

const prototype = createPrototypePicker({
  stage: document.getElementById('stage'),
  host: document.getElementById('picker-host'),
  defaults: PROTO_DEFAULTS,
  controls: [
    { key: 'scenario', label: 'Data', type: 'choice', options: ['Typical', 'Long names', 'Empty'], remount: true },
    { key: 'density', label: 'Density', type: 'choice', options: ['Compact', 'Comfortable', 'Spacious'] },
    { key: 'badge', label: 'Show badge', type: 'toggle' },
  ],
  variants: [
    { name: 'List', mount: mountList },
    { name: 'Media first', mount: mountMediaFirst,
      controls: [{ key: 'ratio', label: 'Media ratio', type: 'choice', options: ['1:1', '4:3', '16:9'] }] },
    { name: 'Compact', mount: mountCompact },
  ],
  sideBySide: false,
  cellWidth: undefined,
  shortlist: false,
  replay: false,
  position: 'bottom',
});
```

A control is `{ key, label, type, ... }`. `choice` takes `options`, a list of strings, and
shows as segments while the labels are short, otherwise as a select. `toggle` is a checkbox.
`range` takes `min`, `max`, `step`, and an optional `unit`. Keys are camelCase and unique
across the whole prototype. A key missing from the defaults starts at the first option, off,
or `min`. The harness throws on a malformed control or a default that matches no control.

Each `mount(stage, params)` renders the variant from `params`, which holds the shared values
and its own, and wires its actual interactions. It returns nothing, a cleanup function, or
`{ update(params), cleanup() }`. Give it `update` when a value can be applied in place, such
as a class or a CSS custom property, so tuning does not reset what the user did on the
screen. Each function reads the same fixtures and starts from the same scenario.

In a wide round, set `sideBySide: true`, `cellWidth` to the desktop width the screens are
judged at, such as `1280`, and `shortlist: true`. A variant that sizes itself by the viewport
(`vw`, `vh`, fixed positioning) does not shrink in a cell; size it by its stage instead.

The API returns `select(index)`, `replay()`, `current` (the variant count while `All` is
shown), `values`, `kept` (the shortlist names), and `destroy()`. Use
`destroy()` before replacing a harness within a long-lived preview. Do not load product data
from the picker.
