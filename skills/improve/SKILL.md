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
argument-hint: "[architecture | recurrence | bugs] [path, module, or pain point] [base ref]"
---

# Improve

Agents extend the patterns they read, and the code that changes most is where a shallow module
or a missed bug costs the most. This pass finds both, verifies every candidate, and writes a plan
for each concern the user picks. It changes no tracked file. Everything it writes goes in the
ignored `.specs/` of the primary checkout: the ledger `.specs/improve.md` and one plan folder
per concern. `/oneshot <folder>` builds a plan.

## 1. Scope

- **Kinds.** The argument names `architecture`, `recurrence`, `bugs`, or several of them. With
  none, run all three. A path, a module, a subsystem, or a pain point in the argument narrows
  every kind to it.
- **Primary checkout.** The first entry of `git worktree list`. When neither its `.gitignore`
  nor `$(git rev-parse --git-common-dir)/info/exclude` carries a `.specs/` line, add one to the
  exclude file, so this pass changes no tracked file.
- **Ledger.** Read `<primary>/.specs/improve.md` before anything else. When it is missing,
  create it in this shape with `Last pass. none` and empty sections. Step 4 writes the lines.

  ```markdown
  # improve

  Last pass. none

  ## Open
  - <kind> | <path> | <finding> | <verdict> | <YYYY-MM-DD>

  ## Planned
  - <plan folder> | <finding> | <branch, once a build took it>

  ## Rejected
  - <kind> | <path> | <finding> | <reason> | <default branch sha>
  ```

- **Hot spots** for architecture and bugs, unless the argument narrowed the scope:
  `git log --since=6.months --name-only --format= | sort | uniq -c | sort -rn | head -40`.
  When the changes are scattered with no clear hot spot, widen the net.
- **Range** for recurrence: the base ref in the argument, else the ledger's `Last pass.` sha
  when it holds one, else the last commit on the default branch whose subject begins with
  `chore(garden)`, else 30 days back. It ends at the default branch's head. Say the range and
  its commit count. Code that moved is not new code, so write the range's added lines with
  moved ones dropped to a file in the scratch directory, and give its path to the recurrence
  sweep:

  ```sh
  git -c color.diff.newMoved=cyan -c color.diff.oldMoved=cyan diff -M --color=always \
    --color-moved=plain <range> | grep -v $'^\e\\[36m[-+]' | sed $'s/\e\\[[0-9;]*m//g'
  ```

  For a line in doubt, `git blame -M -C` names where it came from.

This pass reads. Call the project's tools through their binaries, such as
`node_modules/.bin/<tool>`, not through the package manager, which can install on its own and
rewrite dependencies under a running dev server.

## 2. Sweep

Give each kind to its own read-only subagent where the host has them, all at once. On Claude
Code, architecture goes to `Explore`. Recurrence and bugs go to `general-purpose`, because they
judge by rules in `AGENTS.md` and Explore skips it. Each brief carries the scope, the ledger's
**Rejected** lines for its kind, the row format in step 3, the added-lines file for
recurrence, and the rule that it returns leads with `file:line` and no fixes. Without
subagents, sweep the kinds yourself one after another.

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
  places, one of them in the range. Use the project's duplicate finder when it has one, and
  otherwise compare the bodies of the functions the range added against the rest of the
  repository. Import lists, component boilerplate, and migrations that redefine a function are
  not copies. Copies that differ in one detail often differ on purpose, so read the difference
  first.
- **Dead code.** Run the project's dead-code tool with its own configuration. What the project
  chose not to check stays out.
- **Map drift.** When the project has a `verify-<app>` skill, run its `map` command.

### Bugs

Run `prod-review` on the hot-spot paths as shipped code. Keep its verified findings in
correctness, security, data loss, and concurrency. Its style and size remarks are not rows.

## 3. Verify every candidate

Every **Open** line in the ledger is a candidate again, beside what the sweep returned.

Nothing becomes a row that you did not open. A subagent returns leads, not findings: open
every `file:line` it cites, and trace the callers of anything a row proposes to change. A
candidate you could not verify is dropped, or kept as `Speculative` with the reason.

Drop a candidate that matches a **Rejected** line, unless a file it cites changed since that
line's sha: `git diff --quiet <sha> HEAD -- <path>` exits 1. Then it comes back with the old
reason quoted beside it. A sha git cannot read, exit 128, keeps the row rejected. Drop one that
a **Planned** line covers. A **Planned** line whose branch is merged into the default branch, or
exists neither locally nor on the remote, comes out of the ledger, and its rows can come back.

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
| `FIX` | A defect, with the input that shows it. A `verify-<app>` map entry that is wrong, or a route it does not cover, is one too |
| `DEEPEN` | A module worth deepening. The interface is not proposed yet |
| `GUARD` | The pattern can come back. Name the rule and the tool that runs it: a type first, then the project's linter, then a test or CI check it already runs. Already shown failing on a scratch copy of the commit it names, the one that brought the pattern back, or the parent of the fix when it never came back |
| `REMOVE` | Dead code, or an in-reach workaround whose root-cause fix is small and chooses no behavior |
| `DECIDE` | Stopping it means a design choice, such as one layer that throws instead of dozens of call sites that check. Options with a recommendation |
| `LEAVE` | By design, caused by something outside the repository, or a one-off with nothing to bring it back |

A `GUARD` usually comes with a `REMOVE` for the cases that already exist. Its row counts the
cases that remain.

## 4. Present

Order the rows: `FIX` by blast radius, then `GUARD` and `REMOVE`, then `DEEPEN` and `DECIDE`,
`Strong` first within each, and the `LEAVE` rows last, under their own heading. When there is a
`DEEPEN` row, also render the architecture rows as an HTML report per
[HTML-REPORT.md](HTML-REPORT.md), write it to `<tmpdir>/improve-<timestamp>.html`, open it, and
give its absolute path.

Post the table, then ask with the question routing in `AGENTS.md` which rows to plan and which
to reject, with your recommendation first. A picked `DECIDE` row asks its options in the same
round, and the option chosen sets its verdict for step 5. A picked `LEAVE` row is planned as
`REMOVE`.

Then write the ledger, every line in one pass:

- **Rejected.** Each row the user rejected, with the reason, and each `LEAVE` row nobody picked.
  The sha is the default branch's head, which no branch deletion makes unreadable.
- **Open.** Each row neither picked nor rejected, so a pass whose range has moved on still
  shows it. A line the code no longer shows comes out.
- **Planned.** One line per picked row, naming the folder step 5 writes.
- **Last pass.** The default branch's head, only when recurrence swept the whole repository.
  A narrowed pass leaves it as it was, because the rest of the range was not read.

## 5. Plan the picked rows

- **One folder per concern**, per **Commits and pull requests** in `AGENTS.md`. The picked
  `GUARD` and `REMOVE` rows and the map `FIX` rows share one folder, `cleanup-<YYYY-MM-DD>`.
  Each other `FIX` and each `DEEPEN` gets its own.
- **A `DEEPEN` row is designed with the user first.** Run `grilling` on it: constraints,
  dependencies, the shape of the deepened module, what sits behind the seam, which tests
  survive. For alternative interfaces, use `codebase-design`'s DESIGN-IT-TWICE.md. A term that
  turns out fuzzy gets its precise name before the design goes further.
- **Write each plan.md** under `<primary>/.specs/NNN-slug/`, with the next free number across
  `.specs/` and `specs/`, in the shape of `spec`'s plan-only plan (its **Depth** and **Step 2**).
  Skip its checkpoints, because the answer in step 4 is the approval, and its `.gitignore` step,
  because step 1 keeps `.specs/` out of git. Under the title and before **Done when**, put two
  lines: `Source. improve <YYYY-MM-DD>`, and `Lane. fix` for a single `FIX`, `Lane. refactor`
  for a `DEEPEN`, or `Lane. feature` for the cleanup folder. **Decisions** carry one line per
  row with its finding, evidence, and verdict, plus the choice a `DECIDE` row got and what
  `grilling` settled.
- **A `GUARD` task** names the commit its rule must fail on, and its check runs the rule there
  and then on the branch. When the existing cases are too many for one run and the linter has
  no baseline, each gets a suppression whose reason starts with `improve: existing`, which later
  passes skip.

## 6. Report

The HTML report's path when there is one. One line per plan folder, with the findings it
carries and the command that builds it, `/oneshot <absolute folder path>`. The rows added to
**Rejected** and **Open**. The kinds or slices this pass did not sweep, and `partial` when it
stopped before step 4 was done.
