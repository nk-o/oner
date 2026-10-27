### Review lane

The findings arrived from someone else: a pull request's threads and checks, a CI bot, another
agent, or a list the user pasted. Each one is a claim to check.

1. **Collect the list.** When the branch has a pull request and the review lives there, run
   `pr-feedback` for its context block, which pulls the unresolved threads, the comments, and
   the failing checks, and for the numbering in its Comments section. Its fixes, Rounds, and
   Finish do not run here: step 2 verdicts, the gate decides, and the tail fixes and pushes.
   When the review was pasted or handed over as a file, number its items yourself, in the order
   given. When both exist, the pull request's items come first and the pasted ones continue the
   numbering. One list either way, and every later step answers in its numbers.
2. **Verdict everything, edit nothing.** Run `resolve-review` on the list as far as its verdict
   table and no further: open the code each finding points at and rule `FIX`, `WRONG`, `STALE`,
   `LATER`, or `DECIDE`. On a pull request, `pr-feedback`'s two rulings apply on top: a thread
   GitHub marks outdated is `STALE`, and a comment only its author can settle gets a drafted
   question. Write the table into the run log's **Review**.
3. **Gate.** The screen: the verdict table, and for each `DECIDE` its options. The `DECIDE`
   rows are the open decisions.
4. **Fix.** Work the `FIX` list under `resolve-review`'s fix rules: the smallest change that
   closes each defect, the defect the finding proves rather than the patch it proposes. A red
   check is fixed at the layer that is wrong, per `pr-feedback`'s CI section, and a flaky or
   infrastructural failure is named rather than coded around. `WRONG` and `LATER` stay
   untouched, and the diff never widens to satisfy them.

Then [`tail.md`](tail.md).
