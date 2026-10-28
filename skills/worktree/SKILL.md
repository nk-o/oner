---
name: worktree
description: >-
  Runs the feature lifecycle on a git worktree. Creates one with its own dev port and env files,
  watches its pull request, then merges and removes the branch, the directory, and the dev
  server in one pass. Use when starting a feature in a worktree, when a session begins inside a
  worktree the app created and the environment is not set up yet, when checking what worktrees
  and pull requests are open, or when finishing one. Also for stale-port complaints. To clean up
  merged worktrees across the machine, use `dev-tidy`.
allowed-tools: Bash(git worktree list*) Bash(gh pr view*) Bash(*/wt.sh status*)
---

# Worktree lifecycle

All commands come from `wt.sh`, next to this file. Call it by absolute path:
`{{skills_dir}}/worktree/wt.sh`.

Read `wt.sh --help` if a flag is unclear. Never re-implement its steps by hand.
If it cannot do something, say so and fix the script.

## The stages

| Stage | Command |
| --- | --- |
| Session began in a worktree the app made | `wt.sh adopt`, which copies env files, assigns the port, installs |
| Start a feature from the primary checkout | `wt.sh new <name>` |
| Repair copied launch settings without bootstrap | `wt.sh ports [<name>]` |
| Develop and verify | project's own dev server, started from `.claude/launch.json` |
| Open the PR | run the repo's checks, then the `pr` skill, then `gh pr create` |
| Wait for CI and review | the `pr-wait` skill |
| Finish | `wt.sh finish` |

`wt.sh status` prints every worktree with its branch, uncommitted changes, commits
ahead of the default branch, dev ports (up or down), and PR state with checks and
review decision. Run it when the user asks what is in flight, and before `finish`.

## Rules

Port assignments are reserved even while servers are stopped. `dev-tidy --ports-only`
releases reservations for completed tasks without deleting their work. `adopt` and
`ports` restore saved settings, reassign stopped duplicates, and retain a running port
when its listener belongs to that checkout. Concurrent allocation is serialized per clone
for configured `servers`. A bootstrap-only config delegates ports to the repository's script;
verify that script through `worktree-setup`.

**Merging is the user's call.** `finish` and `prune` are dry runs by default: they
print the plan and change nothing. Show that output to the user, get a clear yes,
then re-run with `--yes`. Never pass `--yes` on the first call. An oneshot series the user
authorized at its gate counts as that yes for its own finished stages.

**Never finish a red PR.** If `status` shows `checks:FAIL` or `checks:running`,
say so and stop. Use the `pr-wait` skill instead.

**A shell inside the worktree cannot delete it.** `finish` detects this, does
everything except removing the directory, and says so. Sweep it later with
`wt.sh prune` from the primary checkout or another chat, or leave it to `dev-tidy`, which
removes it once the pull request lands. Claude Code's own
`ExitWorktree` only removes worktrees that `EnterWorktree` created *in the same
session*, so it is no help after a restart.

**Shared local services are not per-worktree.** A single local database, container
stack, or generated-types file is shared by every checkout on the machine. Only one
worktree may own schema changes at a time. Check the project's `AGENTS.md` before
running migrations or a database reset from a feature worktree.

## When a repository is not set up

`wt.sh` needs a committed `.claude/worktree.json`. When it is missing, run the
`worktree-setup` skill yourself instead of writing the file by hand, then come back to the
stage you were on.

To adjust an existing config, the keys are described in `worktree-setup`'s steps 1 and 3.

## Reporting

After `new`, tell the user the path, branch, and dev port. After `finish`, say what
was merged and what is left to sweep. Do not paste the whole script output back.
