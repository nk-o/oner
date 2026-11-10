---
name: improve
description: >-
  Sweeps a repository for what is worth changing and turns the rows the user picks into plans
  that `/oneshot` builds. Three kinds: modules worth deepening, shown in an HTML report with
  before and after diagrams; mistakes, workarounds, silenced checks, copies, and dead code that
  spread since the last pass; and bugs or security holes in the code that changes most. Keeps
  what the user rejected so the next pass does not raise it again. The user starts it by name.
  For a review of one change or one feature, use `prod-review`.
disable-model-invocation: true
argument-hint: "[architecture | recurrence | bugs] [path or base ref]"
---

# Improve

Agents extend the patterns they read, and the code that changes most is where a shallow module
or a missed bug costs the most. This pass finds both, verifies every candidate, and writes a plan
for each row the user picks. It changes no tracked file. Everything it writes goes in the
ignored `.specs/` of the primary checkout: the ledger `.specs/improve.md` and one plan folder
per picked row. `/oneshot <folder>` builds a plan.

## 1. Scope

- **Kinds.** The argument names `architecture`, `recurrence`, `bugs`, or several of them. With
  none, run all three. A path in the argument narrows every kind to it.
- **Primary checkout.** The first entry of `git worktree list`. When its `.gitignore` has no
  `.specs/` line, add one to `$(git rev-parse --git-common-dir)/info/exclude` instead, so this
  pass changes no tracked file.
- **Ledger.** Read `<primary>/.specs/improve.md` before anything else, and create it in this
  shape when it is missing:

  ```markdown
  # improve

  Last pass. <default branch sha> <YYYY-MM-DD>

  ## Rejected
  - <kind> | <path> | <finding> | <reason> | <sha HEAD was at>
  ```

- **Hot spots** for architecture and bugs, unless the argument named a path:
  `git log --since=6.months --name-only --format= | sort | uniq -c | sort -rn | head -40`.
  When the changes are scattered with no clear hot spot, widen the net.
- **Range** for recurrence: the base ref in the argument, else the ledger's `Last pass.` sha,
  else the last commit on the default branch whose subject begins with `chore(garden)`, else 30
  days back. It ends at the default branch's head. Say the range and its commit count. Write
  its added lines once, with moves detected (`git diff -M --color-moved=zebra`, or
  `git blame -M -C` on a line in doubt), to a file in the scratch directory. Code that moved
  is not new code.

This pass reads. Call the project's tools through their binaries, such as
`node_modules/.bin/<tool>`, not through the package manager, which can install on its own and
rewrite dependencies under a running dev server.

## 2. Sweep

Give each kind to its own read-only subagent where the host has them, all at once. On Claude
Code, architecture and recurrence go to `Explore`, and bugs to `general-purpose`, because it
loads `prod-review` and Explore skips `AGENTS.md`. Each brief carries the scope, the ledger's
**Rejected** lines for its kind, the row format in step 3, and the rule that it returns leads
with `file:line` and no fixes. Without subagents, sweep the kinds yourself one after another.

### Architecture

Read the project's `AGENTS.md` or `CLAUDE.md` first, then load `codebase-design` and use its
glossary in every candidate. The codebase's own names are the domain language: a seam named
after one of its types, tables, routes, or directories survives review. Walk the hot spots and
note where you meet friction:

- Understanding one concept means bouncing between many small modules.
- A module is **shallow**, with an interface nearly as complex as its implementation.
- Pure functions were extracted for testability, but the real bugs hide in how they are called.
- Tightly coupled modules leak across their seams.
- Code is untested, or hard to test through its current interface.

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate
complexity, or just move it? "Concentrates" is the signal.

**Deliberate choices.** Before proposing a candidate that undoes a structure, run
`git log -- <path>` over it. A commit message that argues for the current shape is a reason the
team already had, and it outranks your read of the code. Raise the candidate anyway when the
friction is real, and say which choice it reopens and why now is different. Never propose a
refactor whose own history says it was tried and reverted.

### Recurrence

Findings start in the range. A fix may land in older code when that is where the cause is.

- **Fixes that came back.** Read the range's `fix` commits for the pattern each one removed,
  then search the later commits for it. A pattern removed and then added again is the
  strongest row this pass produces, and the commit that brought it back is the one its rule
  must fail on.
- **Workarounds.** Found by the shape of the code, not by words in comments: a `catch` that
  swallows, a fixed delay that guesses at timing, a cap that fails closed, a branch for a shape
  the types rule out, a re-read that tells two outcomes apart after the fact. Added
  suppressions too: `biome-ignore` in every form, `eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, `as any`, `as unknown as`, `# type: ignore`, `noqa`. A rule the
  project's own config turns off for that path is not a suppression, and neither is one whose
  reason starts with `improve: existing` or `garden: existing`. For each, find the cause and
  decide whether it is in reach, per **Editing** in `AGENTS.md`. A comment that blames
  something outside the repository is a claim: check it by running something, such as a type
  probe or a call, before the workaround stays.
- **Copies.** Strongest first: a commit in the range that made the same edit in several places;
  new code that rewrites a helper the repository already has; the same logic in three or more
  places, one of them in the range. Use the project's duplicate finder when it has one.
  Import lists, component boilerplate, and migrations that redefine a function are not copies.
  Copies that differ in one detail often differ on purpose, so read the difference first.
- **Dead code.** Run the project's dead-code tool with its own configuration. What the project
  chose not to check stays out.
- **Map drift.** When the project has a `verify-<app>` skill, run its `map` command.

### Bugs

Run `prod-review` on the hot-spot paths as shipped code. Keep its verified findings in
correctness, security, data loss, and concurrency. Its style and size remarks are not rows.

## 3. Verify every candidate

Nothing becomes a row that you did not open. A subagent returns leads, not findings: open
every `file:line` it cites, and trace the callers of anything a row proposes to change. A
candidate you could not verify is dropped, or kept as `Speculative` with the reason.

Drop a candidate that matches a **Rejected** line, unless a file it cites changed since that
line's sha (`git diff --quiet <sha> HEAD -- <path>` fails). Then it comes back with the old
reason quoted beside it. Drop one that an unbuilt plan already covers: a folder in
`<primary>/.specs/` whose plan.md opens with `Source. improve`.

Each row carries:

| Field | Holds |
| --- | --- |
| Kind | `architecture`, `recurrence`, or `bugs` |
| Finding | One line, in the codebase's own names |
| Evidence | `file:line`, plus the commit or input that shows it |
| Verdict | One from the table below |
| Strength | `Strong` when you ran it or traced every caller, `Worth exploring` when the shape is clear and the callers are partly traced, `Speculative` when the evidence stops at reading |
| Effort | `S`, `M`, or `L` for the fix, its tests included |

| Verdict | Test |
| --- | --- |
| `FIX` | A defect, with the input that shows it |
| `DEEPEN` | A module worth deepening. The interface is not proposed yet |
| `GUARD` | The pattern can come back. Name the rule and the tool that runs it: a type first, then the project's linter, then a test or CI check it already runs. Already shown failing on a scratch copy of the commit it names, the one that brought the pattern back, or the parent of the fix when it never came back |
| `REMOVE` | Dead code, or an in-reach workaround whose root-cause fix is small and chooses no behavior |
| `DECIDE` | Stopping it means a design choice, such as one layer that throws instead of dozens of call sites that check. Options with a recommendation |
| `LEAVE` | By design, caused by something outside the repository, or a one-off with nothing to bring it back |

A `GUARD` usually comes with a `REMOVE` for the cases that already exist. Its row counts the
cases that remain.

## 4. Present

Order the rows: `FIX` by blast radius, then `GUARD` and `REMOVE`, then `DEEPEN` and `DECIDE`,
`Strong` first within each. When there is a `DEEPEN` row, also render the architecture rows as
an HTML report per [HTML-REPORT.md](HTML-REPORT.md), write it to
`<tmpdir>/improve-<timestamp>.html`, open it, and give its absolute path.

Post the table, then ask with the question routing in `AGENTS.md` which rows to plan and which
to reject, with your recommendation first. A picked `DECIDE` row asks its options in the same
round. An unpicked row with no reason is not rejected and may come back next pass.

Then write the ledger: each rejected row and each `LEAVE` under **Rejected** with its reason
and the sha HEAD is at, and `Last pass.` set to the default branch's head when recurrence ran.

## 5. Plan the picked rows

- **One folder per concern**, per **Commits and pull requests** in `AGENTS.md`. The picked
  `GUARD` and `REMOVE` rows share one folder, `cleanup-<YYYY-MM-DD>`. Each `FIX` and each
  `DEEPEN` gets its own.
- **A `DEEPEN` row is designed with the user first.** Run `grilling` on it: constraints,
  dependencies, the shape of the deepened module, what sits behind the seam, which tests
  survive. For alternative interfaces, use `codebase-design`'s DESIGN-IT-TWICE.md. A term that
  turns out fuzzy gets its precise name before the design goes further.
- **Write each folder with `spec`** at plan-only depth, under `<primary>/.specs/` with the next
  free number, and run it per its **Unattended** section, because the answer in step 4 is the
  approval. Its `.gitignore` line is not needed there, since step 1 already keeps `.specs/`
  out of git. plan.md opens with `Source. improve <YYYY-MM-DD>` and the row numbers. Its
  **Decisions** carry each row's evidence and verdict, the choice a `DECIDE` row got, and what
  `grilling` settled. A `GUARD` task names the commit its rule must fail on, and its check runs
  the rule there and then on the branch. When the existing cases are too many for one run and
  the linter has no baseline, each gets a suppression whose reason starts with
  `improve: existing`, which later passes skip.

## 6. Report

The HTML report's path when there is one. One line per plan folder, with the rows it carries
and the command that builds it, `/oneshot <absolute folder path>`. The rows added to
**Rejected**. The kinds or slices this pass did not sweep, and `partial` when it stopped before
step 4 was done.
