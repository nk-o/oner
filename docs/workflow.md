# Working by hand

The README lists the steps of a feature done one skill at a time. This page explains how the
planning skills split the work and how to prepare a project for it.

## Worktrees

Each feature gets its own worktree and its own chat. `wt new <name>` creates the worktree on a
fresh branch, with its own dev port, local env files, and installed dependencies. `wt status`
prints every worktree with its port, dev server, and pull request state. `wt finish` merges the
pull request, stops the dev server, and deletes the branch and the worktree. `wt prune` removes
worktrees whose pull request already merged. `finish` and `prune` print a plan and change nothing
until you add `--yes`.

## Why brainstorm, spec, and implement are three skills

They split on what they produce, so any agent can pick up an interrupted session.

- **`/brainstorm`** reads the code before it reasons and cites `file:line` for every claim. Then
  it settles the decisions it can, in rounds, with a recommended answer each time. A decision
  that depends on a later stage is named and deferred, not guessed. It ends with a decision
  record, or with a staged map when the work is too large for one pass.
- **`/spec`** turns that conversation into files. `spec.md` holds the problem, the behavior, the
  acceptance criteria, and the decisions with their reasons. `plan.md` holds staged checkbox
  tasks, each naming the files it writes and the check that proves it. You approve the spec
  first, then the plan. Called on a non-trivial feature without a brainstorm, it sends you back
  to one.
- **`/implement`** works through `plan.md` to the end. The checkboxes are the state, so a stopped
  session resumes where it left off. A small mismatch with reality is fixed and logged under
  Deviations. A contradiction with the spec stops the run and asks. Subagents take only tasks
  whose file lists do not overlap. Migrations, lockfiles, generated files, and shared config are
  always done one at a time.

Where the spec goes depends on whether it should outlive the branch. A spec written only to build
the feature goes in `.specs/`, which git ignores, so nothing needs cleaning up after the feature
ships. That is the default. A spec the repository should keep goes in `specs/` and is committed
with the feature, so it is reviewed in the pull request.

## Setting up a new project

Once per repository, from its root:

```
/worktree-setup
```

It reads the project, reserves a block of ports in `local/ports.md`, writes
`.claude/worktree.json`, adds the gitignore entries, and records any local service that only one
worktree may own, such as a shared database, a container stack, or generated types. It also
writes `.claude/skills/verify-<app>/`, a project skill that drives the app the way a user does. It
has a CLI (`start`, `doctor`, `list --affected`, `check`, `map`, `stop`) and `features.json`, a map
of every place a user can reach and the files behind it. When that CLI exists, `/oneshot` and
`/implement` use it to check the features a diff reaches.

Run it again on a project that has `worktree.json` but no verify skill yet. Check the result with
`wt new`.
