---
name: stale-pr
description: >-
  Brings an old pull request up to date, or shows it should not be. Decides whether its goal
  still holds against the current base branch (MODERNIZE, REWORK, or CLOSE), and for MODERNIZE
  merges the base in and checks the change survived. Also sweeps every open pull request older
  than a given age into one table of verdicts, changing nothing. Use when asked to update,
  rebase, revive, or triage an old or stale pull request, or to go through the open pull
  requests that have been sitting. For new review feedback on a fresh pull request, use
  `pr-feedback`.
argument-hint: "[pull request number or URL, or an age in days for a sweep]"
---

# Stale pull requests

Updating an old pull request means checking its idea, not only its branch. A base that merges
without conflicts says nothing about whether the change still belongs in the product.

## One pull request

1. **Pin what it was for.** Read the title, the body, the linked issue, the commits, every
   review thread, and the whole diff. Record its url, author, base branch, head sha, and merge
   base (`git merge-base origin/<base> <head>`). Check it out in a separate worktree with
   `gh pr checkout <n>`, so this checkout's own work stays as it is. Done when you can write the
   smallest goal it was after in one sentence.
2. **Look at what moved around it.** Read the base branch's commits since the merge base that
   touch the files the pull request touches, and search merged and open pull requests for the
   same problem with `gh pr list --state all --search "<words from its title>"`. Answer each:
   - Is the problem it solves already solved on the base branch?
   - Did an API, a type, a schema, or a dependency it relies on change?
   - Was the code it edits deleted, moved, or simplified on purpose?
   - Would landing it bring back an old behavior, or add a second way to do one thing?
   - Is what it gives still worth what it costs to keep?

   Done when every answer cites a commit, a pull request, or a `file:line`.
3. **Verdict.**
   - `MODERNIZE`: the goal still holds and the implementation is still the right shape. Go to
     step 4.
   - `REWORK`: the goal still holds, but merging the base in would keep the wrong
     implementation. Name the smallest rewrite that would serve the goal, and stop. Building it
     is a task of its own.
   - `CLOSE`: something else solved it, the product moved away from it, or it costs more than
     it gives. Cite the evidence and stop. Close it only on the user's yes, with a comment for
     the author drafted from the evidence.

   Age is not evidence, and the work already in it is not a reason to keep it.
4. **Update it (`MODERNIZE` only).** Merge the fetched base branch into the pull request's
   branch. Do not rebase and do not force-push, so the author's commits and every checkout of
   the branch stay valid. Resolve each conflict by the pull request's goal and the base
   branch's newer rules. A conflict that is a disagreement about the product sends you back to
   step 3. Then check that nothing was lost or brought back: compare the change before and after
   with `diff <(git diff <old merge base> <old head>) <(git diff origin/<base>...HEAD)` and
   read every hunk that moved. Run `green-repo`, push, and hand the pull request to `pr-wait`.

Asking for this on a pull request authorizes updating its branch. It does not authorize
merging it, closing it, or changing its base.

## Many pull requests

List the open pull requests with
`gh pr list --state open --limit 200 --json number,title,author,updatedAt,isDraft,headRefName,baseRefName`,
and keep those not updated in the number of days the user named, 14 when they named none. Run
steps 1 to 3 on each without checking anything out or changing anything. Past a handful, give
each pull request its own read-only subagent that returns its verdict line.

The result is one table: the pull request, its author, days since its last update, the
verdict, the reason with its evidence, and the next step. Then ask the user which to update,
which to rework, and which to close, by the question routing in `AGENTS.md`.

## Report

Lead with the verdict and its reason. Then what changed on the base branch that mattered, the
conflicts or that there were none, the merge and push, the checks with their output, and what
is left, with the pull request's link. Say what you could not verify.
