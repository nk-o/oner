### Refine lane

The task changes how an existing surface looks, feels, or moves, in a direction it names, and
keeps the surface's structure. `refine` does the design work, and this lane ships it.

1. **Find the causes.** Run `refine` steps 1 and 2. Save its captures into the run folder's
   `media/`, at the widths and with the data the Verify step will use, because they become the
   pull request's Before. Write the target, its duplicates, the direction, and each cause with
   its `file:line` into the run log. A cause `refine` classifies as a concept mismatch ends the
   lane: set `Status. stopped: concept mismatch`, and report `prototype` or `frontend-design` as
   the next step.
2. **Gate.** The screen: the direction, the causes, the edits you intend, and the proposals
   `refine` would wait on, such as a new token, a removed element, or an owner fix
   `design-review` says the user approves first. The proposals are the open decisions.
3. **Change.** Run `refine` step 3 with the gate's answers. Yours to write, or a delegate's per
   **Delegating the work**.
4. **Compare.** Run `refine` step 4. Its after captures, at the same widths, states, and data as
   the Before, go into `media/` and are the pull request's After. Its report goes into the run
   log.

Then [`tail.md`](tail.md).
