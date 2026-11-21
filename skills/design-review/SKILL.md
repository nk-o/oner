---
name: design-review
description: >-
  Checks a rendered interface, Figma frame, or UI change for hierarchy, consistency,
  readability, accessibility, responsive behavior, and working states. Use when reviewing
  design or checking UI before reporting it finished. To change a working screen in one
  direction, use `refine`. Does not replace general code review or select a visual direction
  for the user.
---

# Design review

Judge the surface against its task and established system. Keep the review proportional to
the change. When `frontend-design` or `break-ui` already captured the relevant states and
widths, reuse that evidence rather than repeating the browser pass.

## Resolve the target

Read `design-context` when context is not already resolved. Scope to the user's screen or
change; if that skill is unavailable, read the applicable DESIGN.md and visual owners directly.
For each changed surface, inspect
the consumers a changed token or shared component actually reaches. For a diff,
read the previous and current versions. Separate introduced defects from pre-existing ones.
For Figma, run `figma-design`'s structural audit on the changed frames and inspect screenshots.

## Look first

Capture each changed screen at the width the user views it: the width they named or sent
screenshots at, else 1280 and the widest layout the product supports. Output that renders in
both an editor and a front end, such as a block, an embed, or a widget, is captured in both.
Open each capture and look at it beside a reference: the product's best neighboring screen,
an external screen the user or `design-context` named, else the screen's own capture from
before the change. A first screen with none of these is judged against the brief, and its line
says so.

The look is done by a reader who did not build the change. Where the host has subagents, a
fresh delegate gets the captures, the reference, and the task, and not the diff or the
author's notes. Otherwise it is a separate pass whose only input is those three. A look already
done on the same captures is reused. The reader is skeptical: a screen passes only when its line names nothing that reads worse than the
reference.

Write one line per screen: what reads well, what reads worse than the reference, and the
capture's path. "No remarks", "passed", or "clean" about how a screen looks needs that line
for every screen it covers. A script that checks status codes, DOM presence, scroll width, or
errors is reported by what it checked, never as a visual pass. A screen that cannot be
captured gets a line that says so, and nothing about how it looks is reported.

Done when every changed screen has its line.

## Check the result

Use the widths from **Look first** and the narrowest supported width, realistic data and text
lengths, and the states the task changes. Operate the actual controls, including keyboard focus and
validation. Static mockups prove presentation only; Figma frames do not prove web behavior.
If browser or rendered access is unavailable, name the unverified checks.

- **Task and hierarchy.** The reading order, main action, and grouping are clear. Secondary
  content does not compete with the task. Density suits use frequency and information.
  Removal test: hide each line of text, control, and status in turn. One the task still reads
  and completes without fails "Every element has a job" in `frontend-design`. It is a defect
  of the change when the change added it, and a proposal to remove when it was already there.
  Purpose test: for each card or widget, say in one line what it tells the user and what they
  do next. One that answers neither leaves the user asking whether to act on it. It says what
  it is and the next step, or folds away when it is reference material.
- **System consistency.** Tokens, components, terminology, and meaningful states match the
  product. A local change does not introduce a second visual language. A new surface built in
  an older UI layer while the platform has a current one is a system conflict, per
  `design-context`. Frame: put the target beside a sibling screen at the same width. Content
  width, alignment, gutters, the surface content sits on, and the header's position match,
  unless the system gives the target its own frame for a stated reason.
- **Composition.** After the look, run the measurements in
  [Composition](references/interface-checks.md#composition) on each screen the look flagged,
  the change reshaped, or the caller named.
- **Text and layout.** Real copy wraps without hiding essential information. Containers adapt
  to content. Numbers align where comparison matters. Images reserve their space. Repeated
  elements stay consistent, and intentional differences have a content or interaction reason.
- **Interaction.** Actions work, feedback appears near its trigger, errors offer recovery,
  and empty states give the next useful action. Arrive the way a user does, from navigation and
  after scrolling elsewhere: the page opens at its top, and nothing shifts when data, images,
  or a scrollbar arrive. Touch does not depend on hover. Existing
  accessible primitives own focus and keyboard behavior.
- **Accessibility.** Semantic controls, visible labels, accessible names, visible unobscured
  focus, and meaning beyond color. Measure contrast on rendered colors for the applicable
  text or control requirement; do not report a ratio guessed from a screenshot.
- **Motion.** Purposeful, frequency-appropriate, interruptible when needed, and compatible
  with reduced motion. Read `motion-design` only when motion is part of the target.

Use [interface checks](references/interface-checks.md) for detailed web checks when relevant.
Read only the categories the target uses. Typography choices, dark themes, gradients,
decorative treatments, or a particular font are not defects on their own.

After your own judgment, not before it, check the target against "Habits to question" in
`frontend-design`. A habit present with no purpose that the brief, the system, or the content
states is a design proposal. Reading the list first anchors the review on it.

## Report and stop

Inspect one batch, fix the actual failures together when fixing is authorized, and confirm
once. Escalate a remaining material problem rather than reporting it passed.

**A defect is a class.** Before fixing a defect the user reported or the look found, list
every page and component that renders the same cause, then fix it at the owner they share:
the component, the block's stylesheet, or the token. A page-scoped override, such as a
`body.page-id-*` selector, `!important`, or a per-page stylesheet, leaves the other pages
broken, so fix the owner instead. When the list reaches pages outside the task's scope, the
owner fix and the list go to the user, and the fix lands after they approve it.

Keep three kinds of finding distinct:

1. **Observed failure:** a concrete input or interaction produces clipping, an inaccessible
   control, unreadable content, or a broken state, or a **Composition** measurement fails.
   Name the trigger and evidence.
2. **System conflict:** a source, token, component, or accepted DESIGN.md rule is violated.
   Cite its owner and the consumer. A stale document is a conflict to resolve, not proof that
   the implementation is wrong.
3. **Design proposal:** a different hierarchy or treatment could help the stated task. Explain
   the tradeoff and label it a proposal. It reaches the user per **Habits to question** in
   `frontend-design`. Preference is not a blocker.

Report the target, observed material findings, actual checks and widths, and what remains
unverified. General correctness, security, and test coverage belong to `prod-review`.
