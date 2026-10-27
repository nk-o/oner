---
name: design-context
description: >-
  Reads a project's DESIGN.md and existing visual system before designing or changing UI.
  Creates or updates DESIGN.md when asked to document a design system or when an approved
  new visual direction needs to be recorded. Also uses measured website or Figma references.
---

# Design context

Establish what governs this product before proposing a visual change. Read context once for
the task and reuse it across prototypes, code, and Figma.

## Read before designing

1. Resolve the product and surface the user named. In a monorepo, read the root guidance and
   the selected product's `DESIGN.md`; a sibling product's file is not authority for this one.
2. Read the applicable `DESIGN.md`, then the actual tokens, shared components, assets, and two
   relevant neighboring screens. With Figma, inspect its variables, styles, instances, and
   the source frame. Preserve an established system even when no document exists.
3. Record the task's purpose, audience when known, main action, content, important states,
   constraints, and what may vary. Use the request and existing documentation for product
   intent. Do not invent an audience or a brand from CSS.

The current request wins over saved guidance. `DESIGN.md` governs durable visual decisions;
the existing implementation supplies evidence and available components. If they disagree,
name the conflict before changing it. A local refinement does not authorize a new identity.
Ask only for an unresolved decision that changes the result, following the host's question
rule in `AGENTS.md`. Do not repeat questions the user already answered.

## Document a system

Write or update `DESIGN.md` when the user asks, or after they approve a new system and ask to
implement it. Read an existing document first and preserve its format, frontmatter, accepted
decisions, and unrelated sections. Do not add a new token schema or export dependency just to
document an interface.

Keep the document small. Include only supported rules that change the next agent's decisions:

- Purpose and audience, if confirmed, plus the visual direction and its constraints.
- Existing semantic colors, typography roles, spacing, layout, shapes, and elevation.
- Reusable components, meaningful states, responsive behavior, and motion where established.
- References and the specific qualities to study, plus confirmed things to avoid.

Use the source's real token and component names. Link to their owners instead of copying a
full inventory. Distinguish accepted rules from observations and proposals. Do not promote a
repeated hardcoded value, a single screen's layout, or an accidental bug into a system rule.
Record why a decision matters when the value alone cannot explain it.

Each entry must change a future implementation choice. Do not turn the document into a
markup inventory, an audit report, a list of every absent CSS property, or a transcript of
the investigation. Omit unknown system rules and report verification limits in the chat.
For a small interface, a short document is enough. Browser defaults are not intentional
component rules unless the project's guidance adopts them.

After a local UI edit, change the document only if the edit implements an approved durable
system change. Report unrelated drift without silently repairing the document or product.

## Study a reference

Prefer source tokens when available. Otherwise inspect the rendered reference, its DOM and
computed styles at relevant widths, or editable Figma nodes and variable bindings. A
screenshot supports hierarchy, composition, and image treatment; it cannot prove exact CSS
values, token names, hidden interactions, or responsive behavior.

Extract the relevant decisions rather than copying a whole brand. A reference can inform
reading rhythm, navigation, density, typography, or media treatment without replacing the
product's palette and components. Apple is one possible reference, never the default identity.
For other kinds of work, consider a relevant screen from GOV.UK, Stripe, Linear, a publication,
or a specialist product, and inspect it before citing it. These are candidates to study, not
presets to apply. Prefer the user's own accepted screens whenever they answer the task.

If rendered access is unavailable, state which properties remain unverified and use available
source evidence. Do not fabricate measured values or the reference author's rationale.

## Handoff

Pass the same resolved context to `frontend-design`, `figma-design`, `prototype`, and
`design-review` as needed. They own construction, exploration, and verification; this skill
owns the shared design authority. Report which document and evidence governed the work, and
which material decisions remain open.
