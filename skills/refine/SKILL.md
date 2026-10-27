---
name: refine
description: >-
  Improves a screen, section, or component that already works, in one direction: polish it,
  make it quieter, make it bolder, distill it to fewer elements, or make its words clearer.
  Keeps the product's design system, content, and behavior. Use when asked to polish, clean
  up, tighten, calm down, declutter, simplify, make more confident or louder, or fix the copy
  of existing UI. A new screen or identity goes to `frontend-design`, several directions to
  compare go to `prototype`, and a report without edits goes to `design-review`.
---

# Refine

Refinement changes how an existing surface reads without changing what it is. The diff stays
inside the named target and inside the product's system. A change of structure or identity is
a redesign, and a redesign is the user's decision.

## 1. Set the target and the direction

The target is what the user named. Everything outside it stays as it is. Read
`design-context` for the applicable `DESIGN.md`, tokens, shared components, and the two or
three neighboring screens the target should match.

Map the request to one direction:

| Direction | Words that ask for it |
| --- | --- |
| polish | polish, finish, clean up, fix the details, "make it better" with no direction named |
| quieter | calmer, too loud, too busy, too much color, tone it down |
| bolder | flat, boring, weak, more confident, make it stand out |
| distill | cluttered, too much going on, simplify, fewer things |
| clarify | confusing, unclear, the copy, labels, errors, empty states |

When the words fit two directions, choose by the causes step 2 finds and name the choice in
the report. When the user asks for two, run them in this order: clarify, distill, quieter or
bolder, polish.

Done when you can name the target, the direction, and the neighbors you compare against.

## 2. Find why it reads that way

Capture the target before any edit, at a desktop width and the narrowest supported width,
with realistic content. Keep these captures for step 4.

List the concrete causes, each with its `file:line`: "four font weights in one card", "the
primary action has the same weight as two secondary ones", "three accent colors where the
neighbors use one". A cause is something you can point at, not an impression. Classify each:

- **Local defect.** The target is incomplete or inconsistent. Fix it in place.
- **One-off.** A shared component or token already does this job. Use it.
- **Missing token.** The system lacks a value several places need. Adding a token changes the
  system, so propose it.
- **Concept mismatch.** The structure or flow itself is wrong for the task. Stop and propose
  `frontend-design` for a redesign or `prototype` to compare directions. Do not make a redesign
  look like a refinement.

Done when every edit you plan traces to a named cause.

## 3. Change within the system

Read the section for your direction in [directions](references/directions.md). These hold for
all of them:

- Use the product's tokens, components, and type scale. A new color, font, radius, shadow, or
  token is a decision. Bring it with the exact value and the job it would do.
- Removing or hiding an action, a field, an option, or information people rely on is a product
  decision. List it as a proposal with what users would lose, and apply it only when approved.
- Factual copy, claims, and data stay. Wording changes belong to clarify, and claims change
  only when the user supplies new ones.
- A fix in a shared component reaches every consumer. Check those consumers, or fix the target
  locally and report the shared fix as a proposal.

Done when every planned cause is fixed or listed as a proposal.

## 4. Compare and stop

Capture the target again at the same widths and states as step 2, and look at each pair side
by side. The change should be visible in the pair. If it is not, the edit did not address the
cause. Run `design-review` on the changed surface and reuse these captures as its evidence.
Check that `git diff` touches only the target and the consumers step 3 checked.

Fix the failures in one batch and confirm once. Do not start a second pass in another
direction unless the user asks for it.

Report the direction, the causes found, the before and after captures, the proposals that
wait for a decision, and what remains unverified.
