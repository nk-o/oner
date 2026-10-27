---
name: dev-tidy
description: >-
  Reclaims what local development leaves behind on this machine: worktrees and branches whose
  pull request has landed, the dev servers still running inside them, wp-env stacks whose
  checkout is gone, Turborepo cache older than a week, and Docker images and build cache. Use
  when the user asks to clean up the machine, free disk space, or stop stale dev servers. Also
  for "clean up merged worktrees", "what is still running", "why is the disk full", a port that
  will not free up, and "which of my branches are dead".
allowed-tools: Bash(*/dev-tidy --kept), Bash(*/dev-tidy --help), Bash(du *), Bash(lsof *), Bash(ps *)
---

# dev-tidy

Every command comes from `dev-tidy`, next to this file. Call it by absolute path:
`{{skills_dir}}/dev-tidy/dev-tidy`. Read `dev-tidy --help` when a flag is
unclear. Never re-implement what it does with `git`, `docker`, or `kill` by hand.
If it cannot do something, say so and fix the script.

`dev-tidy.md` next to it is the reference for the rules and the launchd schedule.

## Ports without deleting work

For port conflicts or scheduled port cleanup, use `dev-tidy --ports-only --kept`
first. This mode stops dev servers in completed tasks, saves their launch settings
in the worktree git directory, and releases port reservations. It also stops servers
left behind by deleted worktrees, including Codex worktrees with surviving caches.
It preserves working files and branches. Open PRs, active jobs, and tasks whose
completion is unconfirmed retain their reservations. Report those tasks instead of
judging them by age. Apply with `--ports-only --yes` when authorized.

On macOS, `node {{skills_dir}}/dev-tidy/schedule-ports.mjs` installs the port-only
launchd job every 15 minutes. Run its dry run and apply once before installing it.
See [dev-tidy.md](dev-tidy.md) for logging and removal.

## The loop

1. `dev-tidy --kept`. A dry run takes about ten seconds and changes nothing.
   Never pass `--yes` first, whatever the user asked for.
2. Run the pre-flight below.
3. Inspect every kept item that holds work, as described under **Inspect what
   holds work**. Done when each one is marked drop or ask.
4. Send one short message and wait for a yes.
5. `dev-tidy --drop` each item marked drop, with `--yes`, then `dev-tidy --yes`.
   The drops go first so the pass also takes the wp-env stacks they free.
6. Two lines back, plus whatever is still open.

## Decide it yourself

Most of the report is already decided. The script only lists what it proved is
recoverable, so do not hand any of it back as a question.

- Everything the dry run listed for removal. Worktrees, branches, wp-env stacks,
  Turborepo cache, images, build cache.
- Dev servers. Stopping one costs nothing and it starts again.
- A `kept` line reading `pull request still open`. Nothing to do, and it does not
  belong in the message either.
- A `kept` line reading `checkout ... is still there`. The stack has a live
  worktree. Leave it and stay quiet.
- A `kept` line reading `nothing of its own`. A branch or a checkout sitting on
  the default branch with nothing committed to it. Not worth a line.
- Anything the report marks `squashed`. The script compared the files rather
  than the commits and found every one of them in the default branch already.
- A `kept` line reading `open oneshot run`, `stage of an open oneshot series`,
  or `session still open`. That work resumes from there, whatever its pull
  request says. Leave it and stay quiet.
- Anything the report marks `sessions archived`. Every session in it is archived
  and its commits are on the default branch or a remote.

When something outside git still runs from a worktree the dry run lists, a tool
whose path names it for example, pass that worktree to every run as
`--keep PATH` and say so in the message.

## Inspect what holds work

The script keeps two kinds of item because removing them could lose work: a
`kept` line ending in `N of M changed files differ from <branch>`, and one
reading `uncommitted changes`. Most of them turn out to have landed already,
because the default branch rewrote the files after the merge. Settle each one
yourself:

```bash
dev-tidy --inspect <worktree path>
dev-tidy --inspect <checkout> <branch>
```

When it lists cited pull requests merged into a branch other than the default,
run it again with `--against <that branch>`.

Mark it **drop** on any of these:

- Almost none of its added lines are missing, a handful in a file of hundreds.
- The missing lines belong to a feature the base already shipped in another
  shape. Check by finding the merged pull request or the base's files for that
  feature, not by the line count alone.
- Its uncommitted changes are only a lockfile or a package-manager file the
  repository does not use.
- An experiment. No pull request, nothing pushed, untouched for two weeks, and
  nothing on the base builds on it.

Mark it **ask** only when none of these holds and the missing lines are real
work: touched in the last two weeks, or pushed to a branch nothing merged. Give
each one a line saying what it is about, read from its commit subjects and
files, and how many lines are missing.

`operation in progress` is always ask. One more from the pre-flight rather than
from `--kept`: a process that is doing real work rather than serving. Offer to
wait for it.

## Pre-flight

Run this on the processes the dry run listed, by the pids on each `server` line, to find one
that is mid-job. Only what it flags goes into the message.

```bash
ps -o pid=,etime=,command= -p <pids>
```

A dev server is fine. `install`, `build`, `test` or `migrate` is not.

## The message

Short. Totals, then one line for what inspection dropped, then only the items
marked ask. No tables, no repository-by-repository walk, no restating what the
script already settled.

```
Removing: 4 worktrees (3.1 GB), 12 branches, 9 processes.
Also dropping 6 more after inspection: all already in main or v2.
The dev server on port 3001 stops.

Left for you:
  project-a/feature-x: export retry queue, 2 days old, 140 of 160 lines not on main
  project-c/refactor-z: uncommitted rewrite of the settings form, no pull request

Go ahead?
```

Under fifteen lines. If it does not fit, you are pasting the report instead of
reading it.

## After

Two lines: what went and how much came back. Then the ask list again, one item
at a time, only if the user wants to deal with it now. Never drop one without
asking.

## Rules

**The dry run is the plan.** If `--yes` reports something the dry run did not
list, stop and say so rather than carrying on. A wp-env stack mounted from a
worktree you dropped is the one expected addition.

**Never judge a branch by its SHA.** A squash merge rewrites every commit it
lands, so `git branch -r --contains` and `origin/main..HEAD` both report landed
work as missing, and a stale `origin/*` makes it worse. `--inspect` fetches the
base and compares lines, not commits.

**One run at a time.** The script fetches pull request state `--jobs` at a time
on its own, and that is the only part that is parallel. Removal is deliberately
serial. Never start a second `--yes`, and never split a run across subagents.

**Never kill a process by hand.** The working-directory rule exists so nobody has
to guess which process belongs to which checkout. If something survives, that is
a script bug worth reporting.

**Docker beyond the wp-env pass is off limits.** Only the script touches
containers and volumes.

**Scope down rather than skip the dry run.** `--skip-git`, `--skip-wp-env`,
`--skip-docker` and `--root PATH` narrow a run to one part of it.
