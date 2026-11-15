# Git worktrees and ports

Use the script by its absolute path. GitHub CLI authentication supplies PR completion;
a missing or failed lookup keeps the affected work. `--root PATH` includes projects outside
the conventional folders. Ordinary previews fetch remote refs, so they are not the
read-only capability inventory.

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
See [dev-tidy.md](../dev-tidy.md) for logging and removal.

## Decide it yourself

Most of the report is already decided. The script only lists what it proved is
recoverable, so do not hand any of it back as a question.

For T3-owned worktrees, read [T3](t3.md) before interpreting retained work. Unknown task state keeps the checkout and its ports.

- Everything the dry run listed for removal. Worktrees, branches, wp-env stacks,
  Turborepo cache, images, build cache.
- Dev servers. Stopping one costs nothing and it starts again.
- A `kept` line reading `pull request still open`. Nothing to do, and it does not
  belong in the message either.
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

Mark it **ask** when none of these holds, because its missing lines exist nowhere
else. That includes an old experiment with no pull request and nothing pushed. Give
each one a line saying what it is about, read from its commit subjects and
files, and how many lines are missing.

`operation in progress` and `build, test, install, or migration running` are always
ask. Offer to wait for the process. `--drop` refuses such a checkout by itself.

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


For detailed proofs and scheduler configuration, read [the command reference](../dev-tidy.md).
