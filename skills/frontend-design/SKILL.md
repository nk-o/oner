---
name: frontend-design
description: >-
  Designs and builds UI that serves its task and fits its product. Use before creating or
  reshaping a visible screen, section, component, or interactive prototype. Reads DESIGN.md,
  preserves existing systems, and verifies the rendered result without imposing a style.
license: Complete terms in LICENSE.txt
---

# Frontend design

Start with `design-context` when design authority is unresolved. If unavailable, read the
applicable DESIGN.md, tokens, and neighboring screens directly. Reuse that context through
construction and verification. Choose the job before designing:

- **Extend or improve a product.** Read its tokens, components, assets, and neighboring
  screens in its current UI layer, per `design-context`. Preserve the system, behavior, and
  factual copy outside the requested change.
- **Create or replace an identity.** Resolve the subject, audience, purpose, constraints,
  and references from the brief. Propose missing material decisions rather than silently
  inventing the product. Explore a new direction only where the user requested one.
- **Compare alternatives.** Use `prototype` for working section, screen, or flow variants.
  The choice belongs to the user. Do not promote a candidate before their choice.
- **Refine what works.** To polish, calm, strengthen, simplify, or reword an existing surface
  without changing its structure, use `refine`.

## Before the first edit

A new or reshaped screen gets these three steps in every job above, with or without
prototypes. Skipping prototypes skips the comparison, not the design.

1. Capture the screen where the user meets this task, in the running app with realistic data.
   Put the new UI there, as a panel, a dialog, a menu, or a row, unless the task happens apart
   from that screen. Where the request leaves the place open, the place is a decision. Bring
   it with that recommendation.
2. Write the element list: every text, control, status, and icon with its job, starting from
   the fewest that complete the task, per **Every element has a job**. A rare action goes
   behind one menu, not into every row.
3. Pick the fixtures per steps 1 and 2 of `break-ui`: the typical case, the most items a real
   account reaches, the longest values, and empty. Read the element list against each. A
   structure that holds only for three short rows changes now, before any code.

Done when the capture is saved and the place, the element list, and the fixtures are written
down. In a spec run they go into the plan task that builds the screen. Build that list and
nothing more.

## Inside a product

- Use the platform's current controls and accessible primitives. The same action keeps the
  same component and name. Reuse established tokens instead of creating parallel values.
- Output that renders inside a page someone else styles, such as a plugin's front end inside a
  theme or an embed on a customer's site, takes type, color, and spacing from that page's
  presets and custom properties, and adds as few values of its own as it can.
- Density follows the task. A table used all day and onboarding need different spacing and
  emphasis. One or more font families are valid when the system calls for them.
- Cover the states the interaction admits: focus, active, disabled, loading, empty, and error
  where applicable. Emptiness names a next action; failure preserves input and offers recovery.
  Do not manufacture unused states for a static section.
- Use inline controls, panels, or dialogs according to the task and product patterns.
  Established portals or popovers handle overlays inside clipping ancestors.
- Motion explains change or feedback. Read `motion-design` when changing motion. Routine
  transitions may remain immediate when animation adds nothing.

A missing DESIGN.md does not erase the existing identity. A local improvement does not
authorize rebuilding neighboring screens or replacing the product's typography and palette.

## A new direction

Base choices on the actual subject and audience. References inform composition, typography,
density, imagery, or interactions without copying an unrelated brand. The brief and accepted
references win over generic anti-pattern warnings.

Before implementation, make a compact plan for palette, typography roles, layout, content,
and any distinctive treatment the brief needs. A single family is as legitimate as a pairing.
A centered hero, dark theme, bright accent, serif, gradient, or card grid is valid when it
serves the content. Do not ban styles to compensate for a model's defaults.

Review the plan against the task. Remove choices whose rationale would fit an unrelated
product unchanged. Check hierarchy, the main action, real content, and supported sizes.
Where alternatives help resolve a direction, use `prototype` rather than choosing invisibly.

Implement the selected direction completely in the existing stack. Introduce dependencies
only for a capability the task needs. Ground assets and copy in evidence. Mark fixtures and
never invent customer, performance, or credibility claims to decorate a page.

## Every element has a job

For each line of text, control, status, and icon, name what the user does differently because
it is there. Delete what has no answer. A screen starts from the fewest elements that complete
its task, and an element joins only when a state or a decision needs it. Say each thing once.

Clutter hides in text more than in decoration. These usually have no job:

- A description under a heading that restates the heading.
- A status line that repeats its row's own title or value, or the same address, name, or count
  shown twice in one view.
- Reassurance about what the system does by itself, such as "updates automatically" or
  "nothing to set up".
- An inline tip for an edge case most users never meet.
- A control for what happens anyway, such as Check now beside a status that refreshes itself,
  Show and Hide for help that could appear only while it is needed, or two routes to the same
  action on one screen.
- A status on something that needs no action from the user.

Keep such an element when the brief, the system, or a real user question needs it, and name
which one.

## Words in the interface

Write from the user's side. Name what people recognize and control, not implementation
details. Actions say what happens, such as "Save changes". Keep that vocabulary through the
flow. Labels label, examples demonstrate, and errors explain recovery.

Use plain verbs, concise copy, and the product's voice. Preserve factual copy when changing
visual treatment. Long text and translations are inputs, not reasons to shorten the content
until a convenient layout works.

## Habits to question

These are prompts to inspect purpose, not universal bans:

- Repeated or nested surfaces with no grouping or interaction role.
- A page with flat rhythm: long runs of one surface color, identical section headers, several
  card rails in a row, uniform gaps. Reorder, drop duplicates, or alternate surfaces before
  reaching for motion.
- An eyebrow, badge, icon tile, metric, section number, or decorative line above a heading
  added only to fill a template.
- Low contrast, oversized headings that hide the task, or replaced content that masks overflow.
- Decorative blur, glows, constant movement, or entrances on every section.
- Big type dividers, such as marquee words, before every section. One or two per page work as
  accents, muted like a watermark behind the next heading.
- Outline text, or text laid over a product photo.
- Differences between peer controls with no content, role, or state explanation.
- Card treatments repeated on every card: a colored side stripe thicker than 1px, a hairline
  border under a wide soft shadow, an icon tile above every heading. A grid of same-size
  icon, heading, and text cards as the page's whole structure, or the hero-metric template
  (big number, small label, supporting stats).
- Gradient text, a zero-offset colored glow, a modal for a task that needs no interruption,
  monospace worn as a "technical" costume, emoji standing in for icons.
- A type scale whose steps are all under about 1.25x, so nothing leads.
- A light or dark theme picked from the product category instead of the use scene: who reads
  it, where, and in what light.
- Copy built from buzzwords (streamline, empower, supercharge) or from repeated short
  aphorisms ("Not a tool. A platform.").

Keep a treatment when the accepted system or brief uses it for a concrete purpose. No named
font, color, theme, or reference is the default for every project.

## Look at what you built

Build fully, render it with every fixture from **Before the first edit**, then run
`design-review` on the rendered result before reporting visible UI done.
Include an ordinary laptop height when viewport sizing, sticky chrome, or a large hero is
involved, and reuse `break-ui` evidence for the same surface. A prototype has the same
interaction floor as a working screen.

Report what rendered, which interactions and sizes were checked, and what remains unverified.
Record only approved durable system changes in DESIGN.md through `design-context`.
For a report-only review or oneshot verification step, report failures without editing them.
The caller's resolve step owns fixes. Do not restart an exploration or verification workflow
already running for this target.
