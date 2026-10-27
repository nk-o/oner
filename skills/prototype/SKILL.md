---
name: prototype
description: >-
  Build working UI prototypes and meaningful variants of a component, section, screen, or
  short flow, from a wide round of many different directions down to live controls for the
  parameters still open in a chosen one, or a clickable
  single-file demo that pushes a state model or business rule through its awkward cases. Use
  when the user asks to prototype, compare designs, explore alternatives, make screen or
  section variations, tune a design's open parameters live, or check whether a state machine,
  workflow rule, or data shape holds up before building it. Applies to browser and
  Figma exploration across agents. Ordinary implementation of an already chosen design
  belongs to frontend-design or figma-design.
license: MIT. Adapted material and attribution in LICENSE.txt and references/sources.md.
---

# Prototype

Build an isolated comparison the user can operate and choose from. Exploration ends with a
working preview and a choice. Integration starts only after the user chooses a direction.

The question decides the shape. "What should this look like?" is the rest of this file.
"Does this logic or state model hold up?" is [the logic prototype](references/logic.md): one
HTML file with a pure module behind free-play buttons and guided walkthroughs, and no visual
variants. When a request mixes both, settle the logic first, because the screens depend on
which states exist.

## Set the comparison

Keep the requested scope. A section, an entire screen, and a short flow are all valid.
Do not replace a requested dashboard with one card. If an essential decision blocks the
comparison, investigate it, then ask using the current host's question rules.

Use `design-context` to read the applicable `DESIGN.md`, neighboring UI, tokens, components,
and supplied references. Use `frontend-design` for browser UI and `figma-design` for editable
Figma work. Existing product behavior and the user's brief bound the exploration.

Choose the mode from the request:

- **Directions.** Compare different answers to the same task. Structure, hierarchy, density,
  or interaction can differ. Build three, or the count the user named. When the user asks for
  a wide or bold exploration, many directions, or options beyond the current design system,
  run [a wide round](references/wide-round.md) instead.
- **Refinement.** Keep the chosen direction and expose the axes still open in it as
  controls, such as density, action placement, or how detail expands. Add another direction
  only for a structural alternative.

Split the open decisions into two kinds before building:

- **Directions** are different structures: what is grouped with what, the order, what leads,
  how detail expands. Each direction is one picker item with its own mount.
- **Controls** are values one structure takes: density, a type or radius step, where an
  action sits, which copy, whether an element shows. A control applies live to the direction
  on screen, so the user composes combinations that no single variant holds.

When one mount would branch through its whole body on a value, that value is two directions.
When two directions differ only in a value, they are one direction with a control.

Name each direction by its decision, such as "List", "Media first", or "Ledger", never
"Option A".

Give each direction a control for every axis that stays open inside it, at most five on
screen at a time, shared ones included. A control offers values the product can ship: steps
of the token scale in `DESIGN.md`, the real placements, the drafted copy. A free numeric
range is for a question about that exact value, such as a duration or a breakpoint.

Done when each direction has a one-line brief: what it changes, and that everything else stays
as the product has it.

## Start from the real screen

The user judges a prototype against the product they know. A redraw that drifts from it in
fonts, spacing, or navigation turns the review into a review of the redraw.

1. Open the running app at the target screen and capture it with realistic data. For a screen
   that does not exist yet, capture the neighbor it will sit beside.
2. In an existing project, build inside the app: a development-only route, or the project's
   preview surface such as Storybook or a playground page. Import the real layout, navigation,
   components, and tokens. A direction changes only what its brief names, and everything else
   is the product's own code, imported rather than copied. Production entry points and shared
   components stay untouched, and production never imports prototype files.
3. Mount the target unchanged as the first picker item, `Current`. Done when it matches the
   capture from step 1 at the same width. It proves the harness renders the real product, and
   every direction is judged against it. A new screen has no `Current`.

A standalone file is for a project with no runnable interface, or when the user asks for a
file. Start it from the running app's rendered markup and computed styles, saved from the
browser, not from a redraw out of screenshots or memory. Without a running app, follow
`DESIGN.md` and the source components, and say in the handover that the result approximates
the product. A standalone file opens in a browser with no new dependency and simulates
external writes locally.

Directions stay inside the product's tokens, fonts, and components. A change of type, palette,
or the product's metaphor belongs to a wide round.

## Shared content

Use the same real content, fixtures, assets, and initial state in every variant. When the
surface shows data, add a shared `scenario` control that swaps fixtures: the typical case,
then the cases it must survive, such as long content, empty, error, or loading. Every
direction reads the same fixture for a scenario. Missing data can use clearly identified
realistic fixtures. Do not silently change copy, invent claims, or simplify a dataset to
make one direction look better. Motion is optional. A static task does not need replay or an
animation library.

## Build each direction

Each direction starts from the fewest elements that complete the task, by "Every element has
a job" in `frontend-design`. An element joins only when the direction's brief or a scenario
needs it.

Render one variant at a time at its actual size, in the context needed to judge it. A toast
needs a page behind it; a section needs its neighbors. Keep the preview viewport consistent
between variants. An element that fits three across at actual size, such as a button, a card,
a row, or a badge, can also be compared side by side: the picker's `All` item mounts every
direction next to each other under the same controls. A section or a screen stays one at a
time.

For browser output, read [the picker contract](references/picker.md). Adapt the bundled
`{{skills_dir}}/prototype/assets/picker.css` and `{{skills_dir}}/prototype/assets/picker.js`
instead of recreating its behavior. Inline them for a single-file preview. Its neutral review
chrome stays separate from product styling. A framework can express the same contract with
its own state and keyed remounts without adding a runtime dependency. When the project
already uses a tuning panel such as Leva, Tweakpane, or DialKit, that panel can host the
controls.

- **Figma.** Create separate editable copies beside the original or on an exploration page.
  Keep the original unchanged. Use equal frame widths and shared content. A browser picker
  is unnecessary for a Figma-only result; verify exported views and name what interaction
  remains untested in Figma.
- **Page-level motion.** The whole page is the stage. Each variant is a direction that
  applies its effects to the live page on mount and removes them in its cleanup. Give each
  effect a toggle control so the user can compose effects across directions.

Every visible action within scope must work. Local state is sufficient for a prototype;
an empty event handler is not. Implement the states and recovery paths needed to compare
the proposed behavior. Do not add unrelated product features to fill surrounding context.

## Check, show, and stop

Capture `Current` and every direction at the same desktop width and look at them together.
Each direction differs from `Current` only where its brief says, carries its brief to the end,
and has no element without a job. Check the directions against "Habits to question" in
`frontend-design`. Rebuild a direction that fails once. When it still fails, drop it and say so.

Then operate the assembled picker in a browser:

- the main interaction of each direction;
- every scenario on one direction, and the narrowest supported width on one direction;
- a reload with a changed control, which returns, and Copy config, which prints only what
  changed;
- the picker and the control panel clear of product controls.

Report actual results and console errors. Without browser execution, state that the
interaction remains unproven.

Present the preview URL or file, the picker and its controls, and a short comparison of each
direction's benefit and cost, without picking a favorite. Stop for the user's choice. It comes
back as the line from Copy config: the direction, every value the user changed, and under
`keep` the shortlist. A preference voiced during exploration is not permission to integrate
unselected variants.

Over several rounds, keep a decisions file beside the prototype and record every verdict as
it lands: what was kept, what was rejected, and why, with the Copy config line. Once a
verdict is recorded, delete the rejected direction, and write each settled value into
`PROTO_DEFAULTS` and remove its control, so neither keeps costing review attention.

After selection, integrate only the chosen variant into the requested destination, using
the product's conventions. The chosen values become the product's tokens and props, not a
runtime setting. Remove the review chrome from production. Keep the original and the
exploration artifacts unless the user requests deletion. On another round, reuse the surface
and refine the selected direction. Update `DESIGN.md` through `design-context` only for an
approved project-wide decision, not for every experimental detail.
