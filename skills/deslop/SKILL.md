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

A pass covers the whole scope, not a sample of it. When the user asks for a lighter pass,
name before the sweep which slices or kinds it leaves out, and report them as not covered.

## 1. Baseline

- Resume before you start. When the branch carries `.specs/deslop-*/ledger.md`, that ledger
  is the pass: take its first slice or candidate without a verdict and go on from there, on
  the same branch and pull request.
- Leave out of scope what nobody writes by hand: generated files, vendored code, lockfiles,
  migrations, recorded fixtures, snapshots.
- Get off the default branch the way oneshot's Step 1 does, onto `deslop-<date>`.
- Run the project's checks per `green-repo`, and change nothing yet. A red baseline stops the
  pass with the failing check named, because a cleanup on red cannot show it kept behavior.
- Count the lines in scope, split into code and tests, for the report.
- Split the scope into slices: a package, an app, or a top-level directory, cut further until
  one subagent can read every file in a slice. Write them into `.specs/deslop-<date>/ledger.md`,
  with the `.specs/` line in `.gitignore` per `spec`'s Depth section, one row per slice.

Done when the checks are green, the counts are written down, and every file in scope belongs
to exactly one slice in the ledger.

## 2. Sweep

Run the project's dead-code tool once over the whole scope, per the unreached code kind in
`criteria.md`, and add every hit to the ledger as a candidate under its slice. Then give each
slice to its own read-only subagent, in waves of as many as the host runs at once. It reads
every file in the slice and returns every candidate of every other kind except **Relaxed
gates**, as `file:line`, the rule broken, and the proof it plans, plus a verdict on each
dead-code hit in its slice. It returns all of them, not the strongest few. Write each into
the ledger, and mark the slice swept.

Done when every slice is marked swept and every candidate is a ledger row.

## 3. Apply, one kind per commit

Work in this order, because each kind shrinks the next: unreached code, then tests, then
copies, then guards, then comments. For each kind:

1. Open each candidate of that kind before acting on it, and give it a verdict in the ledger:
   `REMOVE`, `KEEP` with the rule that keeps it, or `DECIDE`. A slice's subagent may do this for
   its own slice and return the verdicts with their evidence.
2. Remove every `REMOVE`. In a large scope, apply one slice at a time and run the checks that
   cover it after each.
3. Run the proof `criteria.md` names for that kind, then the project's full checks.
4. Put back any removal that turned a check red, mark it `PUT BACK` with the failure, and do
   not fix forward in this pass.
5. Commit with a message from `commit-message`, such as `chore(deslop): remove unreached code`,
   and push, so a pass that stops early has its finished kinds on the pull request.

A `DECIDE` is not applied. It goes in the pull request body with its options.

Done when every candidate in the ledger has a verdict and every `REMOVE` is either committed
or marked `PUT BACK`.

## 4. Ship

Run `green-repo` once more. Then write the body with `pr` and open the pull request titled
`chore(deslop): <scope>`, or update the one the branch already has. The body carries a table
with the lines each commit removed, the proof behind each kind, the `DECIDE` list, and the gaps
the test kind found. Do not merge.

When the pass has to stop before step 3 is done, because the host's context, time, or a
check the pass cannot fix runs out, ship what is committed. The body and the report then say
`partial` with the slices swept out of the total and the candidates still without a verdict,
and name the ledger the next run resumes from.

For a kind that will come back, such as unused exports the project's dead-code tool skips, add
a **Guard** line per **Mistakes that recur** in `AGENTS.md`. `gardener` applies guards.

## 5. Report

Whether the pass is complete or `partial`, with its slice and candidate counts. The pull
request link, the line counts before and after for code and tests, the check output the pass
ended on, the `DECIDE` list, the gaps, the rename and refactor candidates the comment kind
named, and the **Guard** lines.
