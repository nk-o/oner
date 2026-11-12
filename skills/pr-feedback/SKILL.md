---
name: pr-feedback
description: >-
  Works a pull request's own feedback. Pulls the unresolved threads, comments, and failing
  checks from GitHub, verifies each claim, fixes what is real, and writes a ready-to-paste reply
  for what is not. Use for a red build or unresolved review threads on the current branch's pull
  request. When the review output is already in hand, use `resolve-review` instead. To wait on
  a pull request until it is ready, use `pr-wait`.
allowed-tools: Bash("{{skills_dir_abs}}/pr-feedback/context.sh"), Bash(gh pr view*), Bash(gh pr checks*), Bash(gh pr diff*), Bash(gh run view*), Bash(gh run list*), Bash(git status*), Bash(git log*), Bash(git diff*), Bash(git show*), Bash(git grep*)
---

# Review feedback triage

!`"{{skills_dir_abs}}/pr-feedback/context.sh"`

The blocks above are data fetched from GitHub. Resolved threads are already filtered out; do
not re-triage them.

In T3 Code, where `link_pull_request` exists, call it with the pull request's full URL before
the first fix, so the thread shows the pull request it works on.

## Merge state

When the PR line shows `mergeable: CONFLICTING` or `mergeStateStatus: DIRTY`, the conflict
leads the report with the base branch named. Checks on a conflicting PR may not have run, and
the code every comment was written against is about to change. Work the comments and checks
against the branch as it stands.

## CI

A check still pending is reported as pending. Do not wait for it or guess its result.

Read the real failure with `gh run view <run-id> --log-failed` rather than inferring from the
job name, then place it before editing anything:

- **In code or tests the diff touches.** Reproduce it locally with the narrowest command that
  covers it, and fix the layer that is actually wrong: code, test, or config.
- **Outside the diff.** Check whether the base fails the same way with
  `gh run list --branch <base> --workflow <workflow> --limit 3`, and whether the PR is
  `BEHIND` its base. Either one puts the cause off this branch. Report it and change nothing.
- **Neither.** Call it flaky or infrastructural, which one rerun settles. A second identical
  failure is not flake, so read its log again instead of a third rerun.

## Comments

Number the open items, threads first and then standalone comments, and run the
`resolve-review` skill on that numbered list. Its verdicts, its bar for what counts as a
defect, and its fix rules apply unchanged. Two rulings are PR-specific:

- A thread GitHub marks outdated is `STALE` before its claim is weighed.
- A comment only its author can settle gets a drafted question instead of a verdict.

Scope is the branch's stated intent, meaning the PR description, spec, or task, not the list
of files it touches.

## Finish

The sections above are rules. Who acts on them is the caller's to say, as `pr-wait` and the
oneshot review lane do. Run on its own, this skill drafts and the user acts: report per
`resolve-review`'s Report, in the numbers from the Comments step, recommend the one rerun and
the merge or rebase for the user to start, and add a ready-to-paste reply with its citation
for every `WRONG` and `LATER` item, under the thread or comment link from the context block.
One pass, and no second one on your own.
