---
name: motion-design
description: >-
  Designs and checks UI animation, transitions, and gesture feedback. Use when adding,
  changing, or reviewing motion, including animated prototypes. Chooses purpose, frequency,
  interruption, easing, duration, reduced motion, and the simplest fitting tool.
---

# Motion design

Use the product's motion tokens and primitives. A prototype exploring layout does not need
animation. For animation recipes and defaults, read [motion rules](references/motion-rules.md)
only when building or reviewing motion.

For motion across a whole page, check it first for the flat rhythm that `frontend-design`
lists under "Habits to question". Motion cannot fix monotony that composition causes.

Before implementation, settle these in order:

1. What change does motion explain or confirm? If it adds nothing to the task, keep the state
   change immediate. Frequent actions usually need less motion than onboarding or a rare event.
2. Does the user initiate it, interrupt it, or reverse it? Preserve input response and continue
   from the current state on rapid repetition. Gestures may need velocity-preserving springs.
3. Which existing tool can do it? Prefer CSS transitions for ordinary state changes. Use the
   project's motion library when its layout, exit, or gesture capabilities are actually needed.
4. What properties, origin, curve, duration, and exit make the change legible? Existing tokens
   win. Defaults are starting points to test, not a reason to rewrite working motion.
5. How does it behave with reduced motion, touch, slow rendering, and repeated input?

Match visual choices to the brief. Do not force bounce, magnetic buttons, scroll reveals,
stagger, or perpetual animation into routine UI. Do not install a library for a fade.

Run the real interaction at normal speed, then slow or step it when timing is hard to judge.
Check rapid reverse input, focus and hover on the relevant devices, and reduced motion. A
screenshot cannot verify timing or interruptibility. A browser pane or tab the user is not
looking at reports `visibilityState` as `hidden` and throttles `requestAnimationFrame` and
`IntersectionObserver`, so its frames misstate motion. Verify in headless Chrome or a separate
visible Chrome driven over CDP, and capture frames mid-animation as well as settled. Report
what ran and what remains unverified; distinguish an observed failure from a proposed timing
refinement.
