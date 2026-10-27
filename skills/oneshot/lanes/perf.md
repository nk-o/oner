### Perf lane

A measured slowness. Every change ties to a measurement, and reading the source is not
measuring.

1. **Baseline.** Reproduce the slow case on the surface where it was reported, on a workload
   that shows it (data size, history, concurrency). Measure it with one repeatable command: a
   profile, a trace, or a timing taken as the median of several runs. Record the number and
   the artifact path in the run log's **Checks**.
2. **Hypotheses from the measurement.** Each one names a mechanism ("the sync on boot blocks
   first paint") and the move it implies: delete work nobody consumes, split or chunk the
   input, cache and say what invalidates it, index or queue instead of scanning, batch many
   small calls, defer until first use, move work off the interactive path. Try a move only
   when the measurement shows its signal.
3. **Gate.** The screen: the baseline, the mechanism, the change you intend, and anything a
   user notices.
4. **One change, one measurement.** Make the change, run the same command. Keep it when the
   number moves past the noise and the checks stay green. Otherwise revert it in full. One
   commit per kept change.
5. **Cite the numbers.** Before, after, the delta, and the artifact path go into the run log
   and later into the pull request body.

Then [`tail.md`](tail.md).
