---
name: worktree
description: >-
  Runs the feature lifecycle on a git worktree. Creates one with its own dev port and env files,
  then removes the branch, the directory, and the dev server once its pull request has merged.
  Use when starting a feature in a worktree, when a session begins inside a worktree the app
  created and the repository has .claude/worktree.json, when checking what worktrees and pull
  requests are open, when finishing one, and for stale-port complaints. Without that file, use
  `worktree-setup`. To clean up merged worktrees across the machine, use `dev-tidy`.
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
| Verify, or work on a screen | the project's dev server from `.claude/launch.json`, stopped after, per **Dev servers** |
| Open the PR | run the repo's checks, then the `pr` skill, then `gh pr create` |
| Wait for CI and review | the `pr-wait` skill |
| Merge | the `pr-wait` skill |
| Remove the merged worktree | `wt.sh finish` |

`wt.sh status` prints every worktree with its branch, uncommitted changes, commits
ahead of the default branch, dev ports (up or down), and PR state with checks and
review decision. Run it when the user asks what is in flight, and before `finish`.

## Rules

**In T3 Code, `new` does not start a feature.** A worktree made in the shell does not bind to the
T3 thread. Where `t3_thread_launch` exists, start a thread with `workspaceStrategy` set to
`worktree`, or work on a branch in the thread's own checkout, and run `adopt` there.

Port assignments are reserved even while servers are stopped. `dev-tidy --ports-only`
releases reservations for completed tasks without deleting their work. `adopt` and
`ports` restore saved settings, reassign stopped duplicates, and retain a running port
when its listener belongs to that checkout. Concurrent allocation is serialized per clone
for configured `servers`. A bootstrap-only config delegates ports to the repository's script;
verify that script through `worktree-setup`.

**`finish` removes, it does not merge.** It refuses a pull request that is still open, so
merge through `pr-wait` first. It is a dry run by default: show its plan to the user, get a
clear yes, then re-run with `--yes`. Never pass `--yes` on the first call. An oneshot series
the user authorized at its gate counts as that yes for its own finished stages.

**A shell inside the worktree cannot delete it.** `finish` detects this, does everything
except removing the directory, and says so. Run it again from the primary checkout or another
chat, or leave the directory to `dev-tidy`, which removes it once nothing still runs there.
Claude Code's own `ExitWorktree` only removes worktrees that `EnterWorktree` created *in the
same session*, so it is no help after a restart.

**Shared local services are not per-worktree.** A single local database, container
stack, or generated-types file is shared by every checkout on the machine. Only one
worktree may own schema changes at a time. Check the project's `AGENTS.md` before
running migrations or a database reset from a feature worktree.

## Dev servers

A dev server runs only while a step needs the running app, to verify a change or to work on a
screen or a design edit after edit. Start only the apps that step needs, with the project's
`verify-<app>` start command when it has one. Reuse a server only after confirming that its
listener belongs to this checkout, and record which processes you started and which you reused.

When that step ends, including on failure, stop the servers you started before you move on to
review, a pull request, or waiting for CI, and confirm their listeners are gone. Keep one
running when the user asked for a live preview, and say so in the report. Leave reused servers
and shared databases running. An open task or an unmerged PR alone does not need a server.
Stopping keeps the worktree, its port, and its compiler caches, so the next start is warm.

Agent hooks run `{{repo_dir}}/bin/devservers.mjs`, which stops a dev server in a linked
worktree once no client has connected and its processes have used no CPU for 30 minutes, 5
under warning memory pressure, 1 under critical. Its `status` lists what runs, and its log
what it stopped.

Before you start a dev server, a full build, a full test run, or a browser test, run
`{{repo_dir}}/bin/devservers.mjs gate`, joined to the heavy command with `&&`, never `;`, so
exit 75 stops it. Exit 0 means go. Exit 75 means memory pressure stayed
critical after it stopped the idle servers. Then stop the servers this task started, do the work
that needs neither, and run the gate again before the heavy step. The report says which check
waited and for how long.

## When a repository is not set up

`wt.sh` needs a committed `.claude/worktree.json`. When it is missing, run the
`worktree-setup` skill yourself instead of writing the file by hand, then come back to the
stage you were on.

To adjust an existing config, the keys are described in `worktree-setup`'s steps 1 and 3.

## Reporting

After `new`, tell the user the path, branch, and dev port. After `finish`, say what
was removed and what is left to sweep. Do not paste the whole script output back.
