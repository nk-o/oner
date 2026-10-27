---
name: figma-design
description: >-
  Creates and improves editable Figma sections, screens, and variants with auto layout,
  content sizing, variables, styles, and reusable components. Use before Figma design writes
  and when checking layout or consistency. Follows the project's DESIGN.md and visual system.
---

# Figma design

Keep the result editable and coherent. The brief, applicable DESIGN.md, and the file's system
determine direction. Apple, a light theme, a single accent, or a number of fonts is not a
universal requirement.

## Before writing

1. Load Figma's `figma-use` skill for the Plugin API contract and the specialized skill the
   operation needs when available. This skill supplies craft and editability guidance, not a
   replacement API or component-library discovery process.
2. Use `design-context` when context is unresolved. Inspect the target, neighboring sections,
   variables, text styles, components, dimensions, and source content. Screenshot the source.
3. Determine actual platform constraints when known. Mark design-only interactions unverified
   until implemented. Do not claim a Figma prototype proves production behavior.
4. Create missing reusable values and styles only where this task needs them. Do not impose
   an arbitrary radius scale or tokenize every unique position.

For alternatives, build beside the source unless asked to edit it. Preserve the original and
its shared main components, styles, and variables. Editing a shared owner also changes the
source, even when the visible work is in a clone.

## Build editable layout

Read `{{skills_dir}}/figma-design/helpers.js` and paste it into scripts where its helpers fit.
Use the documented Plugin API directly for other capabilities. A helper's missing option is
not a design restriction.

- Use auto layout for content containers with related children. Icons, illustrations, charts,
  and deliberate overlaps may use geometry. Absolute children can represent intentional
  overlaps. x/y places top-level frames on the canvas.
- Space comes from gap, padding, or space-between, not invisible spacers. Repeated peers use
  shared alignment and spacing.
- Text-bearing surfaces generally size from content or fill their parent. Fixed geometry is
  valid for media, icons, avatars, viewport frames, and explicit component sizes. Wrapping
  text grows rather than clipping to a fixed height.
- After changing a container's layout direction, reapply its intended hug/fill sizing and
  inspect its children's bounds. Figma can reset sizing when the direction changes.
- Reuse existing components. Repeated semantic elements use instances. Similar layer trees
  alone do not prove two elements share a role or should be merged.
- Bind established colors, spacing, radii, and type where supported. Preserve semantic roles
  and selected modes. Transparency can come from alpha or intentional paint opacity.
- Borders and separators may communicate grouping, selection, or state. Remove redundant
  decoration for its lack of purpose, not merely because a fill exists.
- Split meta items and their dots with `metaRow()` when independent editing matters. A
  separator in established copy is not automatically a defect.

## Variants

Use `prototype`'s exploration contract, with Figma as the output. Start with three unless the
user gives a number or the task needs more. Keep content and size comparable; do not change
facts to make one candidate win.

Explore different structures for a new direction. Refine one axis for an established direction.
Keep peers consistent within a candidate. Different content alone does not require different
card styles. Name candidates by their decisions rather than V1/V2.

Place candidates beside the source with `besideOf()` or a deliberate canvas arrangement at the
same scale. Judge them in neighboring context and at supported sizes. Explain differences
in chat without adding design notes to the product UI.

"Improve X" edits X in place unless the request protects the original or asks for alternatives.
Promote only the chosen candidate. Keep alternatives until asked to remove them. Writing
agents, if used, own separate candidate frames.

## Audit and inspect

Paste `{{skills_dir}}/figma-design/audit.js` into a read-only `use_figma` script ending in
`return await audit('<nodeId>')`. Audit each created or changed top-level frame.

The result separates `errors` from `warnings`. Fix confirmed editability errors such as
unintentional manual layout, spacers, or clipped fixed text. Verify context first: drawings
and explicitly sized components are not failed content containers.

Warnings are leads about strokes, scales, repeated structures, separators, or variable
opacity. Judge them against DESIGN.md, roles, resolved modes, and the screenshot. Do not
delete a state border or merge unlike components to clear warnings. `clean` describes
structural errors only; report remaining warnings and their disposition separately.

Inspect each screenshot for hierarchy, density, shared edges, content, contrast, clipping,
and neighboring rhythm. Use `design-review` for the same bounded check, not another polish
loop. Report names and IDs, actual audit results, created owners, and unverified behavior.
