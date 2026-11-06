# Page picker

For a page made of many sections, such as a marketing site. The one-at-a-time picker in
[picker.md](picker.md) compares one thing and hides its neighbors. Here every section keeps its
own choice on the assembled page, so the user judges each one between the sections it really
sits with, and how they join.

`{{skills_dir}}/prototype/assets/section-picker.tsx` is a working React and Tailwind version.
Copy it into the prototype route and adapt its imports. Another stack keeps the behavior below.

## Behavior

- The page renders every section, each in its chosen variant. The first variant is the default,
  and on a live page it starts as `Current`.
- One dark pill sits at the bottom center. It follows the section at 45% of the viewport height
  as the user scrolls, and shows that section's name, its variants, and a Copy button.
- The section name opens a list of all sections with the variant chosen in each. Choosing one
  jumps there.
- A variant change keeps the reader in place. When the new variant is shorter and the section's
  top has moved above the viewport, scroll to that top.
- Number keys and left and right arrows change the variant of the section in view. They ignore
  inputs, textareas, selects, contenteditable, and any modifier key.
- A section can offer its heading as a second row above the pill. A heading is a value, not a
  direction, so it combines with every variant.
- The URL holds each choice under `__<id>` and `__<id>Headline`, and only while it differs from
  the first. A reload returns the same page.
- Copy puts one line per section on the clipboard: `Hero: Refined / Couldn't find`. The user
  pastes that back as their verdict.
- A page-wide choice, such as how section backgrounds alternate or fade, sits in a collapsed
  menu at the bottom left with the links to the other pages. It goes into the copied list too.
  Sections leave their own background off so this choice can apply.

## Rounds

Name each round's verdict in the decisions file. In the next round the chosen variant comes first
and the rejected ones are deleted. A section with one variant left still shows in the pill, so the
list stays complete.

## Product pictures

A cropped screenshot of a whole panel reads as a mistake, and a small panel on a large image
cannot be read. Build a picture the way a designer lays it out by hand.

- Show complete small groups: one heading and its controls, such as a color scheme grid or a
  menu that is open. Never a panel cut across a row.
- Capture them from the running product at three times their size, with the same room on all
  sides, and let the page round the corners. A menu goes in with its own radius and shadow off,
  so no background shows at its corners.
- Set them on a stage in fixed units, with at most three pieces: margins of 6%, pieces at about
  half the stage's width so their text reads, overlapping a little on a diagonal, and one small
  accent such as an open menu. Size radius and shadow by the stage, in container units.
- Rendered pages and sections may run off the stage's sides on purpose. Settings never do.
- In Chrome over CDP, `Page.captureScreenshot` with `clip.scale` re-rasters any region at any
  scale, which also makes a canvas zoomed to 17% sharp.

Done when each picture's text can be read at the size the page shows it.
