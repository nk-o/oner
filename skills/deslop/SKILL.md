---
name: deslop
description: >-
  Slims a project without changing what it does. Removes comments that narrate, tests that
  guard nothing, code nothing reaches, and copies of helpers the repository already has, then
  opens one pull request with a commit per kind. Works on the whole repository or on a path.
  The user starts it by name. To forbid patterns merged since the last pass, use `gardener`.
disable-model-invocation: true
argument-hint: "[path or package; defaults to the whole repository]"
---

# Deslop

Scope: $ARGUMENTS, or the whole repository when that is empty.

What counts as slop, what stays, and the proof each removal needs are in
[criteria.md](criteria.md). Read it before the sweep. Everything this pass removes leaves
behavior as it was, and the checks prove it.

## 1. Baseline

- Leave out of scope what nobody writes by hand: generated files, vendored code, lockfiles,
  migrations, recorded fixtures, snapshots.
- Get off the default branch the way oneshot's Step 1 does, onto `deslop/<date>`.
- Run the project's checks per `green-repo`, and change nothing yet. A red baseline stops the
  pass with the failing check named, because a cleanup on red cannot show it kept behavior.
- Count the lines in scope, split into code and tests, for the report.

Done when the checks are green and the counts are written down.

## 2. Sweep

Give each kind in `criteria.md` except **Relaxed gates** to its own read-only subagent, and
in a large repository one per kind per package. Each returns candidates as `file:line`, the
rule broken, and the proof it plans. Treat them as leads and open each one before acting on it.

## 3. Apply, one kind per commit

Work in this order, because each kind shrinks the next: unreached code, then tests, then
copies, then guards, then comments. For each kind:

1. Remove what the sweep found and you confirmed.
2. Run the proof `criteria.md` names for that kind, then the project's checks.
3. Put back any removal that turned a check red, and list it. Do not fix forward in this pass.
4. Commit with a message from `commit-message`, such as `chore(deslop): remove unreached code`.

A `DECIDE` is not applied. It goes in the pull request body with its options.

## 4. Ship

Run `green-repo` once more. Then write the body with `pr` and open the pull request titled
`chore(deslop): <scope>`. The body carries a table with the lines each commit removed, the
proof behind each kind, the `DECIDE` list, and the gaps the test kind found. Do not merge.

For a kind that will come back, such as unused exports the project's dead-code tool skips, add
a **Guard** line per **Mistakes that recur** in `AGENTS.md`. `gardener` applies guards.

## 5. Report

The pull request link, the line counts before and after for code and tests, the check output
the pass ended on, the `DECIDE` list, the gaps, the rename and refactor candidates the comment
kind named, and the **Guard** lines.
