# oner panel design

The panel (`ui/`) follows the visual system of [reuse.sh](https://reuse.sh), whose rules live in its
repository's `DESIGN.md`. Tokens are on `:root` in `ui/index.html`.

## Direction

- One light theme: `--bg` #fcfcfc, white surfaces, `--ink` #111. There is no accent color. Color marks
  only chart series and danger.
- Geist for all text at 15/24, titles included (20/28, weight 600), Geist Mono for paths and code. No
  display or serif face: the panel is a tool, not a landing page. Fonts come from Google Fonts and fall
  back to system faces offline.
- One content column of 840px on every page, and a reserved scrollbar gutter, so content never shifts
  when switching pages.
- Cards are the double ring in `--shadow-card` with a 22px radius, used for the list a person works
  through and for charts. Running agents and other secondary lists sit in open space.
- Controls use `--shadow-control` and `--hover` for quiet hovers. The range control's highlight slides.

## Start screen

- Order: one row of four chart cards first (two per row on narrow screens), then not checked notices,
  what waits, what runs, finished (folded). The list stays visible on a laptop without scrolling.
- The heading above the list states the answer: how many things wait on the person.
- A source that fails shows a danger notice with a retry. Nothing appears for a source that is fine,
  except one quiet "Updated" line.
- A page has no text that restates its heading. Worktrees and dev servers live on Machine.

## Charts

- Thin bars with no gridlines, a value and a one-line label above, first and last date below.
- Identity: Claude `--series-1`, Codex `--series-2`, anything without an agent `--series-0`. The pair was
  checked with the dataviz palette validator on white.
- The tooltip is a dark pill below and to the right of the pointer. A table in Details holds every
  value for touch and screen readers.
- Tokens from different agents are never added together.
- Days up to two months, weeks up to about a year, months beyond.
