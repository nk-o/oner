# Product basics

The floor for any product screen: a dashboard, an account, a settings page, a list, a detail
panel. The project's `DESIGN.md` and tokens set the values and the choices, such as which fields
a row shows or how a date reads. These principles hold whatever those are, and a screen that
breaks one reads as unfinished. They are not a style.

## Alignment

- One column has one left edge. A section heading, its rows' content, and the dividers between
  them start on the same line. A hover fill may extend past that edge, by the same amount on
  both sides, while the text stays on it.
- An item only some rows have reserves its slot in every row, so all rows' text starts on one
  edge.
- A visual beside text, such as an avatar, a logo, or an icon, centers on the first line of
  that text, not on the whole block, unless it is as tall as the block.
- Text of different sizes on one line shares a baseline.
- Peers in a row or a grid are the same size as each other.

## Spacing and shape

- Padding is symmetric as the user sees it, and groups sit further apart than their members.
  **Composition** in `design-review` measures both.
- A rounded surface inside a rounded surface keeps `outer radius = inner radius + inset`. A hover
  fill inside a rounded panel follows the same rule, on the first and last row too.
- One line separates two things. A list inside a section that already ends in a divider drops
  its last row's divider. A container with its own edge drops the edge dividers of its rows.
- Dividers are straight lines. They do not take the radius of the rows they separate.

## Type

- Weight follows hierarchy. A control or a label is not heavier than the heading it sits under.
- Text in one role keeps one size and one weight across the screen.
- Tabular figures, heading spacing, and wrapping follow **Text, images, and layout** in
  `design-review`'s interface checks.

## Density

- A summary, such as a row, a card, or a header, shows what the user scans it for. Everything
  else lives in the record's detail. The project's `DESIGN.md` names what each summary keeps.
- Each value appears once on a screen, per **Every element has a job** in `frontend-design`.
- Color marks state, in small doses. Neutrals carry the rest.
- Data the user reads is never in a tooltip alone, since touch has no hover. A tooltip may
  sharpen a value the screen already shows.
- A field may go without a visible label, per **Forms and actions** in `design-review`'s
  interface checks.

## Loading and change

- A loading region reserves the shape and height its content will take. Nothing around it
  moves when the data arrives, and nothing shifts sideways when a section opens or a scrollbar
  appears.
- A menu opened with the pointer highlights no item. Opened from the keyboard, it focuses the
  first.
- An action revealed on hover has a visible form on touch.
