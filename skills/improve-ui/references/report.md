# Report format

One HTML file, `report.html`, in the run folder, beside the capture folders it shows. Images use
relative paths such as `r0/320-light/ticket.png`, so the folder opens anywhere as long as it
stays together. No external scripts. Inline CSS with light and dark colors under
`prefers-color-scheme`, a body that reads at 320px, and images that scale to the column.

## Order

1. **Header.** Product, date, branch, scope, widths, themes, rounds run. One table of findings
   by level, P0 to P3, before and after. The checks from step 5, each with its result.
   Then the user's complaints, one line each in their words, each pointing to its before and
   after pair, the directions it was shown, or the decision it became.
2. **Changes.** One card per resolved or partial row, P0 first.
3. **Decisions.** One card per `decide` row.
4. **Not fixed.** Reverted and unresolved rows, each with its cause in one line.
5. **Not verified.** Engines, devices, states, and surfaces the run did not reach, and why.

## A change card

- **Title.** What the user now sees, in their words: "The priority control is reachable on a
  phone", not "Fix TicketHeader flex".
- **Badges.** Surface, width, theme, state, level, verdict.
- **Pair.** Before on the left, after on the right, at the same size, from the same state. Below
  640px they stack, before first. When the change is a small region of a full capture, mark it
  on both images with the same box, positioned in percentages of the image, so the eye finds it.
- **Why.** Two or three sentences: what was wrong for the user, the cause with its `file:line`,
  and why the after is better. A measured value names its rule and both numbers, such as
  "WCAG 1.4.3 needs 4.5:1, measured 1.96:1, now 5.2:1".
- **Files.** The changed files, monospaced.

Several rows fixed by one change share one card, with each row's id in the badges.

## A decision card

The current capture, what the change would give users and what they would lose, two or three
options, and the recommendation with its reason first. Name the ledger line it was written to.
