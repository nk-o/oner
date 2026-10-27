# Interface checks

Use the project's actual primitives and tokens. These checks supplement the task's visual
review; they do not prescribe a framework or aesthetic.

## Forms and actions

- A visible label names the field. Clicking it focuses the input. Placeholder text is an
  example, not its only name. Types, autocomplete, and input mode fit the requested data.
- Forms support Enter where submission is appropriate. Pasting and password managers work.
- Validation preserves entered data and identifies the affected field with a useful recovery
  action. Async feedback distinguishes loading, failure, and completion.
- Repeated submission does not duplicate an action. Irreversible actions follow the product's
  confirmation or undo pattern. Do not add confirmations to routine controls by habit.
- Icon-only actions have accessible names. Loading does not erase the action's meaning.

## Keyboard, touch, and overlays

- Keyboard users can reach and operate what pointer users can. Native elements and established
  primitives manage focus. Dialogs return focus to their trigger; menus follow their pattern.
- Focus is visible and remains clear of sticky chrome. Tooltips do not carry essential content
  or interactive actions. A popover escapes clipping ancestors through the project's portal.
- Targets suit pointer precision and platform requirements. Check adjacent targets and mobile
  safe areas. Test mobile input text at its rendered size for unwanted focus zoom.
- Hover-only effects are gated for hover-capable pointers. Content and actions remain available
  on touch. Do not block scrolling or zooming unless a real gesture interaction requires it.

## Text, images, and layout

- Use role-based type and spacing, not new literals for every element. Choose one or more font
  families from the brief and system; no font family is banned for being common.
- Font weights and styles actually load. Titles wrap with their content. Truncated essential
  text stays reachable. Long URLs, IDs, translations, and mixed-direction text do not escape.
- Use tabular figures where changing values or numeric columns need stable alignment. A
  monospace font is not required for every number.
- Light text on a dark surface reads tighter and thinner. Give it a little more line height
  (about 0.05 to 0.1) and tracking (about 0.01 to 0.02em), and one weight step for a thin face.
- Product UI keeps a fixed type scale. Fluid `clamp()` type belongs to marketing pages, with
  its maximum no more than about 2.5 times its minimum.
- Headings use `text-wrap: balance` and prose uses `pretty` where supported. A heading has more
  space above it than below it.
- Browser surfaces take the palette instead of defaults: text selection, caret, scrollbars,
  focus ring, and link underline offset.
- Group related content with spacing and shared edges. Borders and backgrounds may express
  grouping, selection, or state. Do not delete a meaningful border because a fill also exists.
- Responsive changes follow content and the established breakpoints. Check overflow, 200%
  zoom where applicable, and the supported theme and writing direction.
- Images have suitable alternatives, reserved aspect ratios, and a clear loading/failure
  behavior. Decorative images do not add screen-reader noise. Use the actual assets where
  possible, and label temporary fixtures rather than inventing product claims.

## Color and theme

- Secondary text on a colored surface takes a darker or lighter step of that hue, not gray.
- A ramp built in OKLCH lowers chroma near white and black instead of keeping it constant.
- Translucent overlays make contrast depend on what sits behind them. Where text sits on one,
  use an explicit color.
- A dark theme is designed, not inverted. It shows elevation with lighter surfaces rather than
  shadows.

## Motion and performance

- Animate named properties rather than `transition: all`. Use the least complex tool that
  satisfies the interaction; a CSS transition does not require a motion dependency.
- Do not move content being read or frequently operated just to decorate it. Test interruption,
  repeated input, reduced motion, and pointer differences for changed animations.
- Reserve layout work for interactions that need it, and measure before diagnosing dropped
  frames. A CSS property or library shorthand alone does not prove a performance defect.
- Off-screen continuous work pauses. Use `will-change` only for a measured need. Large blur
  surfaces and scroll effects need checks on the supported devices.

## Sources

Adapted from Vercel's [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines),
Jakub Krehel's [interface skills](https://github.com/jakubkrehel/skills), especially
`better-layout`, `better-typography`, and `better-ui`, and the typography and color rules of
Paul Bakaus's [Impeccable](https://github.com/pbakaus/impeccable). The adapted checks preserve project
authority rather than importing their exact style defaults. See the licenses alongside this
reference and the pinned sources in `SOURCES.md`.
