---
name: spec
description: >-
  Turns a settled feature discussion into a staged plan, plus a spec when the size warrants one,
  drafted outside git by default so nothing has to be cleaned up afterwards. Approval
  checkpoints are short summaries in chat rather than files to read. Use when the user asks for
  the spec or the plan, or right after a /brainstorm session ends. If material decisions are
  still open, run /brainstorm first.
argument-hint: "[feature name; defaults to the current discussion]"
---

Existing specs in this repo:

!`r="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; out=$( { ls -1 "$r/.specs" 2>/dev/null | sed 's|$|  (this branch)|'; ls -1 "$r/specs" 2>/dev/null | sed 's|$|  (kept)|'; } | sort ); echo "${out:-(none yet)}"`

# Spec: write the files

Feature: $ARGUMENTS (default: the feature settled in this conversation)

Precondition: the decisions are settled, by /brainstorm or because the change is
genuinely small. If material decisions are open, ask up to three using the question routing in `AGENTS.md`,
recommended option first; more than three open means stop and suggest /brainstorm.

Both files are written in English. Both checkpoints are written in the user's language.

## Location

One question picks the folder. Is this spec still worth reading after the branch merges?

- **No, it exists to build the branch in front of you.** `.specs/NNN-slug/`, which git ignores.
  /implement reads it, no commit ever contains it, and it goes away with the worktree. This is
  the default.
- **Yes, the repo should keep it.** `specs/NNN-slug/`, committed with the feature, so it lands
  in the PR and outlives the branch. Use it when the user says the work is for later, for the
  team, or otherwise worth keeping.

Both sit at the repo root. NNN is the next free number across the two, so promoting never
collides. The slug is a short kebab-case feature name.

## Depth

- **Plan-only.** The default for small work: one stage of tasks, behavior that fits inside
  their checks. Skip spec.md. plan.md opens with **Done when** (the numbered acceptance
  criteria) and **Decisions** (one line each), then the stage. One checkpoint total, at
  step 2.
- **Full.** Both files, when the work runs to several stages, or when behavior and edge
  cases need prose the checkboxes cannot carry. A spec in `specs/` is always full, because the
  contract is what the folder is for.

Before the first write into `.specs/`, check that `.gitignore` carries a `.specs/` line. Add the
bare line when it is missing, with no comment naming a skill above it, and say so in the
checkpoint. Otherwise the throwaway folder shows up as untracked in every status. `specs/` is never ignored. Changing your mind later is one move:

```
mv .specs/NNN-slug specs/NNN-slug
```

When the target folder already carries a plan.md (re-planning after an interruption or after the code
has drifted), keep the approved spec.md. Confirm it still matches the intent, then go
straight to step 2 and regenerate plan.md against the current code. A plan-only folder has no
spec.md: reconfirm its Done when instead.

## Unattended

When `oneshot` runs this skill, the decisions were already settled at its gate and the run
does not stop again. The folder is the one the run log opened, with its number and slug: under
`.specs/` for a feature, under `specs/` for a plan lane. Take no number of your own. Both
checkpoints stay, and both become status notes with no question after them, posted in the same
message as the next tool call. Step 2's closing stop does not apply either, since `oneshot` goes
straight on from there, to `implement` or to the pull request.

Everything else in this skill is unchanged, the precondition included: material decisions
still open means the gate did not do its job, so stop and say that rather than guessing them
here.

## Step 1: spec.md, then checkpoint

A plan-only spec skips this step. Write `spec.md` in the chosen folder:

- **Problem.** Why this, in user terms.
- **Goals / Non-goals.** Bullets; non-goals prevent scope creep.
- **Behavior.** What the user sees and does, including the edge cases the discussion
  raised.
- **Acceptance criteria.** Numbered; each one checkable by running the product or a test.
- **Decisions.** Each settled decision with its one-line rationale (from the brainstorm
  decision record).

Then checkpoint in chat instead of showing the file. The file is what /implement reads; the
checkpoint is what the user reads, and they are not the same document. Post only:

- One or two sentences on what gets built.
- **Decisions**, one line each. This is the part the user changes, so it carries the
  checkpoint.
- **Not doing**, one line each, from the non-goals.
- **Done when**, the acceptance criteria as a short numbered list.

No problem restatement, no behavior prose, no edge-case enumeration. Those are in the file
because /implement needs them, not because the user does. Then ask whether to approve or
change something using the question routing in `AGENTS.md`. Do not start plan.md until approved.

## Step 2: plan.md, then checkpoint

Write `plan.md` beside it:

- **Stages** in dependency order. Each stage holds tasks as `- [ ]` checkboxes.
- Each task names the files it writes and the check that proves it. One task is one
  focused edit-and-check cycle.
- Each stage ends with a **Verify** step: exact commands, plus what to open and click when
  UI is involved.
- **Deviations.** An empty section; /implement fills it.

The file lists are what /implement uses to decide parallel versus sequential, so make them
real: migrations, generated files, lockfiles, and shared config always sit in their own
sequential tasks.

Checkpoint the same way: the stages as a numbered list, one line each, saying what the stage
does and what proves it, plus one line on whichever stage is riskiest and why. A plan-only
spec opens this checkpoint with its Done when and Decisions, since step 1 never ran. File
lists, checkboxes, and verify commands stay in the file. Then ask the user using the question routing in `AGENTS.md`, then stop.
Implementation starts only when the user runs `/implement`.
