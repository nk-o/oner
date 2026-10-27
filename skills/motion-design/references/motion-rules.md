# Motion rules

## Ingredients

- Explain feedback, state change, spatial continuity, or a transition that otherwise jumps.
  Decorative motion needs a reason in the brief and a budget appropriate to usage frequency.
- Prefer transitions for rapidly toggled states. They retarget from the current value.
  Predetermined one-off sequences may use keyframes; interruptible gestures may use springs.
- Start entrances responsively, often with ease-out. Movement within a scene may suit ease-in-out.
  Select exit timing for the task rather than enforcing one universal curve.
- A press can begin around 100–160 ms, a small popover around 125–200 ms, and a dropdown around
  150–250 ms. Larger surfaces may need longer. Use existing tokens first and test the result.
- An anchored popover uses an origin near its trigger. A centered modal has a different origin.
  Avoid scale-from-zero for ordinary surfaces. Small scale changes can support a fade when the
  component's geometry and purpose call for it; a pure fade is also valid.
- Prefer transform and opacity when they express the change. Height may be necessary for an
  accordion or layout transition. Measure the real interaction before calling it slow.
- Match entrance and exit spatially. Gesture-driven motion should reverse without restarting.
  Springs preserve velocity; bounce belongs to the selected motion language, not a default.
- Honor `prefers-reduced-motion`. Remove unnecessary movement and preserve useful feedback.
  Gate hover motion with pointer capabilities and keep touch actions usable without hover.
- Pause off-screen continuous motion. Do not introduce loops into status indicators or cards
  merely to make a screen look active.

## Page and scroll effects

- A calmer page lowers distances and angles and moves fewer kinds of element. Every element
  still enters, with at least a small stagger. Entrances play once on entering the viewport
  and are not scrubbed by scroll. Vary the recipe by element kind, such as headings word by
  word, cards, images, and copy. The first screen gets a load-in, never a scroll-linked effect.
- Never animate an inherited custom property, such as a palette token, or per-element
  colors for a page color switch. Every descendant restyles on every frame, even when only
  the subtrees near the viewport interpolate. Draw a dark section in its dark palette at all
  times, on its own dark ground, and on arrival fade only opacity: a page-level layer behind
  the sections and the neighbours' content. Every color then moves on one curve, on the
  compositor.
- A marquee runs no per-frame script. Loop the track with a CSS or Web Animations animation
  paused off screen, and take scroll response from a scroll-driven view timeline on a wrapper,
  so both run on the compositor. Measure loop widths after `document.fonts.ready`. Clip only
  the inline axis so glyph overshoot keeps its tops and bottoms. Center separators against
  cap-trimmed text with `text-box: trim-both cap alphabetic`. Give the marquee host a definite
  width, such as a `minmax(0, 1fr)` grid column: a host sized by its content grows with every
  clone the loop adds to fill it, and the clones never stop.
- A count-up number needs tabular figures. Before building one, measure each digit's width
  with `font-variant-numeric: tabular-nums` on and off. If the digits still differ in width
  with it on, the font has no tabular figures and the count jitters, so do not count.
- `IntersectionObserver` never reports an intersection for a target its own `clip-path` hides.
  Observe an unclipped parent. Items inside a horizontal scroller are clipped by the scroller,
  so an item outside its visible range reports no intersection until it is scrolled in.

## Explain motion precisely

Name the trigger, initial state, final state, animated properties, origin, timing or spring,
and interruption/exit behavior. For example, a drawer opens from its edge, stays responsive
to dragging, and dismisses along the same axis. Such a description is more useful than
"make it smooth" and does not require a particular library.

## Evidence

Try repeat input while the animation is still running, both forward and backward. Test
reduced motion and the supported pointer types. For a reported performance problem, inspect
actual frames or rendering work under the relevant load. Slow playback can expose a timing
problem but does not prove normal-speed performance.

For a scroll or page effect, record `requestAnimationFrame` frame deltas while it runs and
compare them with the same scroll with the effect off. Report the numbers. Headless numbers
are a floor, not what the user's 120 Hz display shows, and the report says so.

When an effect does not seem to animate, check every visible layer above it. An opaque
ancestor background, such as a wrapper painted to cover a footer, can hide a correct
transition underneath.

## Source

Adapted from Emil Kowalski's `animate`, `animation-vocabulary`, and `emil-design-eng` in
[emilkowalski/skills](https://github.com/emilkowalski/skills), pinned in `SOURCES.md`.
The workflow and vocabulary are retained; exact-value mandates and universal style bans
are replaced by project tokens and observed behavior. See `LICENSE-Emil.txt`.
