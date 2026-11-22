# Watch in T3 Code

Use the tools from T3 Code's namespace, whichever model provider runs the session.

1. Use `pull_request_read` with `summary`, `checks`, and `conversation` before waiting, on
   each wake, and after each push. For a cross-repository PR pass its repository and number.
   Read additional conversation pages when needed to settle unresolved feedback. If the PR
   is merged, go to [After a merge](release.md#after-a-merge) when the task includes release.
   Report the outcome and stop watching if the PR is merged or closed.
2. Use the native snapshot to evaluate [Ready](../SKILL.md#ready) for `summary.headSha`.
   Handle failures or cancellations of gating checks, conflicts, and feedback through
   [PR events](events.md). A check awaiting approval needs a person. A null check list, a
   placeholder check, or an expected check that has not reported cannot establish readiness.
   A successful, skipped, or neutral check has finished. Confirm approval and unresolved
   threads from the conversation. Settle blocked or unknown mergeability before merging.
3. On github.com, consult the installed `bots.json`. If a bot is in `request` mode, run
   `pr-wait.mjs request <pr-url>` before assessing that bot on the first read of each head. Use
   `pr-wait.mjs <pr-url> --once` for bot readiness only when a review was requested or a
   bot configured to wait is present in the PR's checks or conversation. This reuses
   Oner's bot rules. Use the bot verdict on the same head and the native snapshot for PR
   status, checks, and discussion. A wait-mode bot with no activity or request does not gate.
4. If ready, proceed in this turn. Before waiting, name the outstanding gate and the
   event T3 can receive for it. Watch for an applicable non-placeholder pending
   check, an expected check with an active run or confirmed trigger on this head, or
   an outstanding review the task requires. If a gating check is missing and you
   cannot establish that it will run, hand back the PR with that check named as the blocker.
   Call `watch_pull_request` with the PR URL if a watch is not yet
   active and end the turn. Use `until: "checks"` for a handoff after checks or
   `until: "merged"` if you are to see the merge through. T3 records checks that already
   passed as its initial state, so those checks send no wake. The watch follows pushes and
   stays active for later comments and reviews even after checks finish. Run only that watch.

Before handing the PR back, call `unwatch_pull_request` if it is active.
