---
name: gardener
description: >-
  Sweeps the code merged since the last pass for patterns that spread when agents copy them:
  a fixed mistake that came back, workarounds whose cause is in reach, silenced checks, the
  same code written three times, dead code, and a feature map that drifted from the app. Turns
  each into a rule that fails on the real example, or a deletion, and ships the approved ones
  as one pull request. The user starts it by name.
disable-model-invocation: true
argument-hint: "[base ref or date; defaults to the last gardener pass]"
---

# Gardener

Agents extend the patterns they read. One workaround, one silenced check, one copied helper
becomes the house style within weeks. This pass finds what spread since the last one and makes
each case either gone or impossible to repeat, per **Mistakes that recur** in `AGENTS.md`. It
removes and forbids. Reshaping modules is `architecture-scan`'s job.

## 1. Range

The range starts at the argument when one is given. Otherwise it starts at the last commit on
the default branch whose subject begins with `chore(garden)`, and with none, 30 days back. It
ends at the default branch's head. Say the range and its commit count.

Write the range's added lines once, with moves detected (`git diff -M --color-moved=zebra`,
or `git blame -M -C` on a line in doubt), to a file in the scratch directory. Every kind below
reads that file, and a subagent gets its path. Code that moved is not new code. Findings start
in the range; a fix may land in older code when that is where the cause is.

This pass reads. Call the project's tools through their binaries, such as
`node_modules/.bin/<tool>`, not through the package manager, which can install on its own and
rewrite dependencies under a running dev server.

## 2. Sweep

In a large range, give each kind below to its own read-only subagent.

- **Fixes that came back.** Read the range's `fix` commits for the pattern each one removed,
  then search the later commits for it. A pattern removed and then added again is the
  strongest row this pass can produce: the mistake recurs, and the commit that brought it back
  is the one the rule must fail on.
- **Workarounds.** Found by the shape of the code, not by words in comments, which match the
  product's own prose: a `catch` that swallows, a fixed delay that guesses at timing, a cap
  that fails closed, a branch for a shape the types rule out, a re-read that tells two
  outcomes apart after the fact. Added suppressions too: `biome-ignore` in every form,
  `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `as any`, `as unknown as`,
  `# type: ignore`, `noqa`. A rule the project's own config turns off for that path is not a
  suppression. For each, find the cause and decide whether it is in reach, per **Editing** in
  `AGENTS.md`. The cause often sits in older code, such as a helper that turns an error into
  `null`, and the fix goes there. A comment that blames something outside the repository is a
  claim: check it by running something, such as a type probe or a call, before the workaround
  stays.
- **Copies.** Three signals, strongest first. A commit in the range that made the same edit in
  several places, which means one type or rule lives in several copies. New code that rewrites
  a helper the repository already has, where one copy is enough. The same logic written in three
  or more places, one of them in the range. Use the project's duplicate finder when it has one;
  otherwise compare the bodies of the functions the range added against the rest of the
  repository. Import lists, component boilerplate, and migrations that redefine a function are
  not copies. Copies that differ in one detail often differ on purpose, so read the difference
  before merging them.
- **Dead code.** Run the project's dead-code tool with the project's own configuration. What
  the project chose not to check, such as unused exports, stays out of the sweep.
- **Map drift.** When the project has a `verify-<app>` skill, run its `map` command.

## 3. Verdict every candidate

| Verdict | Test |
| --- | --- |
| `GUARD` | The pattern can come back. Name the rule and the tool that runs it: a type first, then the project's linter, then a test or CI check it already runs. Already shown failing on a scratch copy of the code it must catch |
| `REMOVE` | Dead code, or an in-reach workaround whose root-cause fix is small and chooses no behavior |
| `FIX MAP` | A map entry is wrong or a route is uncovered |
| `DECIDE` | The pattern recurs, but stopping it means a design choice, such as a layer that throws instead of dozens of call sites that check. Options with a recommendation |
| `LEAVE` | A workaround explained by a cause outside the repository, or a one-off with nothing to bring it back |

A `GUARD` names the commit it fails on: the one that brought the pattern back, or the parent
of the fix when it never came back. It usually comes with a `REMOVE` for the cases that already
exist. When those are too many for this pass, the rule applies to new code the way the project's
tools allow; with a linter that has no baseline, each existing case gets a suppression whose
reason starts with `garden: existing`, which later passes skip. The table carries a column for
how many existing cases remain. Post it and ask using the question routing in `AGENTS.md` which rows to apply.
Nothing lands on your own verdict.

## 4. Apply the approved rows

On a branch named `garden/<date>`, one commit per row. Run each `GUARD` on the commit it names
and paste the failure, then on the branch and paste the pass. Run `green-repo`, then open the
pull request as oneshot's Ship step does, titled `chore(garden): <what it forbids or removes>`,
so the next pass finds where this one ended.

## 5. Report

The PR link, one line per applied row with its proof, each `DECIDE` with its options, and the
`LEAVE` rows with their reasons.
