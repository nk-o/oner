# Product basics

The floor for any product screen: a dashboard, an account, a settings page, a list, a detail
panel. The project's `DESIGN.md` and tokens set the values. These rules hold whatever the
values are, and a screen that breaks one reads as unfinished. They are not a style.

## Alignment

- One column has one left edge. A section heading, its rows' content, and the dividers between
  them start on the same line. A hover fill may extend past that edge, by the same amount on
  both sides, while the text stays on it.
- A row with an optional leading item, such as a flag, a badge, or an icon only some rows have,
  reserves its slot, so every row's text starts on one edge.
- An avatar, logo, or icon beside text centers on the first line of that text, not on the whole
  block, unless it is as tall as the block.
- Text of different sizes on one line shares a baseline: a number beside its label, a badge
  beside a title.
- Peers in a row or grid are the same size as each other: avatars, logos, flags, stat cards.
  Two circles that overlap are the same diameter.

## Spacing and shape

- Padding is symmetric as the user sees it: the same above the first line as below the last,
  and the same left and right. Measure from the text, not from the box, per **Composition** in
  `design-review`.
- The gap between groups is at least twice the gap inside a group. Peers sit at equal gaps.
- A rounded surface inside a rounded surface keeps `outer radius = inner radius + inset`. A hover
  fill inside a rounded panel follows the same rule, on the first and last row too.
- One line separates two things. A list inside a section that already ends in a divider drops
  its last row's divider. A container with its own edge drops the edge dividers of its rows.
- Dividers are straight lines. They do not take the radius of the rows they separate.

## Type

- Two or three weights on a screen. Buttons and labels are not heavier than the headings above
  them.
- One size for secondary text under a heading. Two lines under a heading in two sizes is one
  line too many.
- Numbers that line up in columns or change in place use tabular figures.
- A heading has more space above it than below it.

## Density

The question for each element is the one in **Every element has a job**. In product UI these
are the usual answers:

- A list row carries what the user scans the list for: a leading visual, the name, one
  secondary line at most, a status, and the one value or date the list is sorted by. Every
  other field belongs to the record's detail.
- A row shows one date: the one that answers the list's question, such as last activity. Recent
  times read relative ("2h ago") with the exact time in a tooltip.
- A column whose values say what they are, such as names, dates, and amounts, needs no header.
  A small table inside a labelled panel section usually needs none.
- A detail header holds the identity: the name, one line of key facts, the status at the
  right, and the actions. Counts and totals go below it as small stats, not into it.
- A known entity with a recognizable mark, such as a payment provider, a country, or a website,
  may show as its mark with the name in a tooltip, when the screen shows it in every row.
- Text that restates a control, a heading, or a value next to it goes: a line under a button
  that repeats the button, a caption that repeats the heading, a note on what the system does
  by itself.
- Color marks state, in small doses: a dot or a tinted badge. Neutrals carry the rest. A
  status with no action for the user can stay neutral.
- A field's label goes when the design shows none and the field's purpose is plain, such as the
  email on a sign-in form. The placeholder names it and `aria-label` carries the name.

## Loading and change

- A loading region shows a skeleton in the shape of its content, at the height the content
  will take, never a "Loading…" line. Nothing below it moves when the data arrives.
- A scrolling panel keeps a stable scrollbar gutter, so opening a section does not shift its
  content sideways.
- A menu opened with the pointer highlights no item. Opened from the keyboard, it focuses the
  first.
- An action revealed on hover has a visible form on touch, such as an icon button at the row's
  end or a menu.

## Sources

Concentric radius and symmetric padding follow
[interface-design](https://github.com/Dammyjay93/interface-design), tabular figures and
structural skeletons follow [ui-skills baseline-ui](https://github.com/ibelick/ui-skills),
both MIT. The rest comes from corrections users made more than once on dense product screens.
