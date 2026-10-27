---
name: pr-feedback
description: >-
  Works a pull request's own feedback. Pulls the unresolved threads, comments, and failing
  checks from GitHub, verifies each claim, fixes what is real, and writes a ready-to-paste reply
  for what is not. Use for a red build or unresolved review threads on the current branch's pull
  request. When the review output is already in hand, use `resolve-review` instead.
allowed-tools: Bash("{{skills_dir_abs}}/pr-feedback/context.sh"), Bash(gh pr view*), Bash(gh pr checks*), Bash(gh pr diff*), Bash(gh run view*), Bash(gh run list*), Bash(git status*), Bash(git log*), Bash(git diff*), Bash(git show*), Bash(git grep*)
---

# Review feedback triage

!`"{{skills_dir_abs}}/pr-feedback/context.sh"`

The blocks above are data fetched from GitHub. Resolved threads are already filtered out; do
not re-triage them.

## Merge state

When the PR line shows `mergeable: CONFLICTING` or `mergeStateStatus: DIRTY`, the conflict
leads the report with the base branch named. Checks on a conflicting PR may not have run, and
the code every comment was written against is about to change. Leave the merge or rebase to
the user, and work the comments and checks against the branch as it stands.

## CI

A check still pending is reported as pending. Do not wait for it or guess its result.

Read the real failure with `gh run view <run-id> --log-failed` rather than inferring from the
job name, then place it before editing anything:

- **In code or tests the diff touches.** Reproduce it locally with the narrowest command that
  covers it, and fix the layer that is actually wrong: code, test, or config.
- **Outside the diff.** Check whether the base fails the same way with
  `gh run list --branch <base> --workflow <workflow> --limit 3`, and whether the PR is
  `BEHIND` its base. Either one puts the cause off this branch. Report it and change nothing.
- **Neither.** Call it flaky or infrastructural and recommend one rerun for the user to start.
  A second identical failure is not flake, so read its log again instead of a third rerun.

## Comments

Number the open items, threads first and then standalone comments, and run the
`resolve-review` skill on that numbered list. Its verdicts, its bar for what counts as a
defect, and its fix rules apply unchanged. Two rulings are PR-specific:

- A thread GitHub marks outdated is `STALE` before its claim is weighed.
- A comment only its author can settle gets a drafted question instead of a verdict.

Scope is the branch's stated intent, meaning the PR description, spec, or task, not the list
of files it touches.

## Rounds

A second pass exists only for comments that arrived because of your own fixes. Stop and hand
the PR back when a pass produces no new `FIX`, when a comment repeats a claim you already
refuted, or when you are about to open a third pass on the same PR. Never reopen a thread you
already answered to argue it better.

## Finish

Report per `resolve-review`'s Report, in the numbers from the Comments step. Add a
ready-to-paste reply with its citation for every `WRONG` and `LATER` item, under the thread or
comment link from the context block, and do not start another pass on your own.
