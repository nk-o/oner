# Release a pull request

## Merge, only when the task says so

A change that carries a migration or adds to a stored data shape merges only after its migration checks ran on the exact head that merges and on the default
branch as it is now: it applies to existing rows, the code production runs works on it, and no
migration merged since takes its number or alters what it touches. See **Migration checks**
in the [oneshot tail](../../oneshot/lanes/tail.md).

Merge only when the task says to merge once the pull request is ready. Never turn on
auto-merge, the app's switch included. It waits only for required checks, merges at once on a
branch without them, and is dropped silently on a private Free-plan repository.

The gate is ready on the newest head, no review requesting changes, and a branch that is not
BEHIND. A branch that is behind gets the base merged in as for a conflict, and waits for ready
again. Use a merge method the repository allows, preferring squash. In T3 Code, call
`pull_request_merge` with the verified head as `expectedHeadSha`, then confirm the result
with `pull_request_read`. On GitHub without the native tool, get the allowed methods with
`gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed`. Run
`gh pr merge <n> --<method> --match-head-commit <sha>` as a command of its own, then check
the result in a separate call.

## After a merge

This runs after a merge you made, and after one the user made by hand when the task is to see
the work through. The task ends when the change is live, not when it merged. A series skips this
section, since `series.mjs` verifies its own deploys.

**Deploy.** Run `pr-wait.mjs deploy <pr>` as a background command, because the app's Auto-fix
stops at the merge and this is the one thing still watching. In T3 Code, where
`t3_background_wait` exists, call it with the command's task ID before the turn ends.

- **Exit 0.** Report the line it printed. `nothing deploys` is the normal result for a branch that
  does not deploy.
- **Exit 1.** The deployment is blocked, and so is every deployment after it. Open the failed
  status's link. A flaky failure gets one rerun, `gh run rerun <run-id> --failed`, and a second
  identical failure is not flake. A real failure goes to **A broken release**.
- **Exit 3.** Report what it still waits on.

`deploy` reads commit statuses only. When it says `nothing deploys` but the project deploys from
a workflow, such as a GitHub Actions job on the default branch, wait for that run on the merge
commit, `gh run list --commit <merge sha>`, and treat its failure as a deploy failure.

**Production.** After the deploy, when the change reaches a page a user sees, open each such page
in production with the browser driver, the way a user arrives: it loads, its main content
renders, the console shows no page error, and no request for the app's own assets or API fails.
The production URL comes from the deploy status's link, the project's `verify-<app>` skill, or
its deploy config. A failure counts when it shows on two checks a minute apart, since a cache
or a cold start can fail once. Never sign in as a real user or write data in production for the
check. Without a URL, report `Production not checked` and why.

**A broken release.** A real deploy failure, or a production failure this change can cause,
gets one of two answers:

- **Fix forward** when the cause is known and the fix is small: a new branch from the base,
  carried through the same steps as this pull request, merge included.
- **Revert** when users are blocked and the cause is not known yet, or a fix forward already
  failed once. Open the revert as its own pull request from the base. The sha is the commit that
  landed on the base, `gh pr view <pr> --json mergeCommit`, never the pull request's head:
  `git revert <sha>` for a squash, `git revert -m 1 <sha>` for a merge commit. A rebase merge
  landed new copies of the pull request's `<n>` commits, ending at `<sha>`, so revert
  `<sha>~<n>..<sha>`, which git takes newest first. Carry it through the same steps.

A revert does not undo a migration that ran or a message, webhook, or API change that already
reached someone. Those, and any failed migration, go to the user with the pull request's
rollback note.

**Clean up.** Once the change is live, update the issue through `issue-tracker` when one is in
scope, and delete this work's `.oner/` folder per `AGENTS.md`. For the work's worktree, print
the plan `wt.sh finish` shows and leave the removal to the user, unless the task said to finish
it.
