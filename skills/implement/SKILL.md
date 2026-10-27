---
name: implement
description: >-
  Executes an approved spec end to end, working through its plan.md task by task until every
  checkbox is ticked and every acceptance criterion is verified in the running product. Reads
  throwaway specs from .specs/ and kept ones from specs/. Use when the user asks to implement,
  build, or continue a spec, or names a spec folder. Needs an approved plan.md; without one, run
  /spec first.
argument-hint: "[spec folder; defaults to the only one with unchecked tasks]"
---

Specs with unchecked tasks in this repo:

!`r="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; out=$(grep -rl --include=plan.md -- "- \[ \]" "$r/.specs" "$r/specs" 2>/dev/null); echo "${out:-(none)}"`

# Implement: execute the plan

Spec folder: $ARGUMENTS. When omitted: if exactly one spec above has unchecked tasks, take
it; otherwise ask which one. A folder under `.specs/` exists only to build this branch. Git
ignores it, so its plan.md never enters a commit and needs no cleanup once the feature ships.
A folder under `specs/` is committed, so edits to it belong in a stage commit like any file.

Read plan.md, and spec.md when the folder has one, fully before the first edit. A plan-only
spec carries its acceptance criteria and decisions at the top of plan.md under **Done when**
and **Decisions**. Everything below is a standing instruction for the whole run, not a
one-time step.

## Preflight

- The working tree must be clean; if it is not, stop and ask. One expected leftover: the
  `.gitignore` line /spec adds for `.specs/` folds into the first stage commit instead of
  blocking the run.
- Run the project's standard checks once for a baseline. A pre-existing failure gets
  reported, not silently fixed.

## Loop

Take the next unchecked task in plan order:

1. Implement exactly what the task says, in the smallest change that satisfies it.
2. Run the task's check and make it pass.
3. Tick the checkbox in plan.md.

At each stage boundary: run the stage's Verify step, then commit, with a message from the
`commit-message` skill that references the spec folder. Checkboxes are the state, so an
interrupted run resumes from them.

Default to sequential. Parallel subagents are for tasks in the same stage whose file lists
do not intersect. A subagent starts with none of this context: give it the spec folder's
absolute path, its own task, and the rule that anything outside its file list comes back to
you unedited. On Claude Code that subagent is `oneshot-worker`. Parallel ones each get
`isolation: "worktree"`, so one task's check never runs against another's half-written files.
That worktree starts from the default branch with tracked files only: commit what the branch
holds before they start, put that commit's sha and the install command in each brief, and
apply each returned diff with `git -C <worktree> diff --cached | git apply` before the stage's
Verify step.

## Deviations

- The plan is wrong in a detail (a file moved, a name differs): fix it and add a one-line
  entry under Deviations in plan.md.
- The plan conflicts with the spec, or reality invalidates a recorded decision: stop,
  present the conflict, wait for the user.
- The plan is silent on something a user will notice (wording, behavior on an error, a
  limit): stop and offer options, recommended first. Silence in the plan is not a
  delegation.

## Unattended

When `oneshot` runs this skill, the third Deviations rule no longer stops. Silence in the plan
is decided here, recorded as one line with its reason and its evidence under **Assumptions**
in the run log (`.specs/NNN-slug/oneshot.md`, the file the hook names), and reported at the
end. That log is the one place assumptions live, so plan.md gets no copy.

Two things still stop, whatever else is running: a conflict with the spec or a contradicted
decision, as written above, and the four hard stops in `oneshot`'s contract.

Final verification and Report do not run under `oneshot`: its tail runs `green-repo` and the
Verify step on the cleaned diff, and writes the report. After the last stage's Verify and
commit, the lane's next step follows in the same turn. Keep the Preflight baseline in the run
log's **Checks**; the tail still counts a failure as pre-existing only when it also fails on
**Base**.

## Final verification

- Run the full checks relevant to the change (lint, types, tests).
- Start the app and walk spec.md's acceptance criteria, or plan.md's Done when, against
  the running product. When the repository has a project skill named `verify-<app>` under
  `.claude/skills/`, drive the app through its CLI and run `check` on the features
  `list --affected` names, or `check --all` when it prints `unmapped` files. Otherwise use the
  browser/preview tools.
  Take screenshots as proof for the visual ones.

## Report

What changed, what you ran and what it printed, what is left. The Deviations section is up
to date. The PR description is written with the pr skill when the user asks.
