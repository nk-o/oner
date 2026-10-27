# dev-tidy

Reclaims what local development leaves behind, across every project on this
machine: git worktrees whose pull request already landed, the dev servers still
running inside them, local branches for merged or closed pull requests, wp-env
stacks whose plugin checkout is gone, and Docker images that pile up as duplicate
versions.

It belongs to the machine, not to any repository. Nothing needs to be added to
a project for it to be covered. The script walks the folders code usually lives in
(`~/Work`, `~/Projects`, `~/Code`, `~/Developer`, `~/dev`, `~/src`), finds git checkouts,
reads each one's `origin` remote, and asks GitHub about pull request state.

It lives in the `dev-tidy` skill so it is versioned with the rest of
`{{repo_dir}}`. The skill's `SKILL.md` is how an agent drives it; this file is the
reference for what it does and how to schedule it.

## Running it

```bash
{{skills_dir}}/dev-tidy/dev-tidy          # report only, changes nothing
{{skills_dir}}/dev-tidy/dev-tidy --kept   # and why everything else was left
{{skills_dir}}/dev-tidy/dev-tidy --yes    # apply
```

Always worth reading the report first. The list is usually longer than expected.

| Option | Meaning |
| --- | --- |
| `--yes` | Actually remove. Without it the script only reports. |
| `--root PATH` | Where to look for checkouts. Repeatable. Default: whichever of `~/Work`, `~/Projects`, `~/Code`, `~/Developer`, `~/dev`, `~/src` exist. |
| `--depth N` | How deep below each root to search. Default `4`. |
| `--jobs N` | Pull request indexes to fetch at once. Default `8`. |
| `--skip-docker` | Leave Docker images and build cache alone. |
| `--skip-wp-env` | Leave wp-env stacks alone. |
| `--skip-git` | Leave worktrees, servers, and branches alone. |
| `--kept` | Also print what was left alone, and the reason. |
| `--quiet` | Print only what changed. For scheduled runs. |
| `--inspect PATH [BRANCH]` | What one kept worktree or branch holds that the default branch does not. Changes nothing. |
| `--against BRANCH` | With `--inspect`, compare with `origin/BRANCH` instead of the default branch. |
| `--drop PATH [BRANCH]` | Remove one worktree and its branch, or one branch and its worktree, without either proof. Only with `--yes`. |

Needs `gh` (authenticated) for pull request state, and `docker` for the image
pass. Either being absent just skips that part.

## Releasing ports without removing worktrees

```bash
{{skills_dir}}/dev-tidy/dev-tidy --ports-only --kept
{{skills_dir}}/dev-tidy/dev-tidy --ports-only --yes
```

This mode saves `.claude/launch.json` as `launch.released.json` in each completed
worktree's private git directory. Its files and branch remain. An exact head match
with a merged or closed PR, or the existing content proof, establishes completion.
An open PR or a git operation in progress prevents release. Uncommitted files stay
on disk and do not prevent release after a completed PR. Builds, tests, installs,
and migrations defer cleanup. Unknown completion retains the reservation and is
reported with `--kept`; age alone never stops a server.

`wt.sh adopt` and `wt.sh ports` restore saved settings, validating ownership and
choosing a free port when another checkout took the old one. Repository-owned
bootstrap scripts need the same restore behavior.

The orphan pass includes `~/.codex/worktrees` by default and checks for the
checkout's `.git`, so a surviving Next cache does not keep a deleted worktree's
server alive. Only dev servers and their launchers are stopped in port-only mode.
A failed GitHub lookup reports the failure, keeps that repository's reservations,
and exits nonzero. Orphan servers can still be checked without GitHub.

After a dry run and an apply run, install the macOS port cleanup job:

```bash
node {{skills_dir}}/dev-tidy/schedule-ports.mjs
```

The job runs every 15 minutes while the machine is awake, without an open agent
application. It only releases ports. Its log is `~/Library/Logs/dev-tidy-ports.log`.
Running the installer again replaces the same job. Inspect or remove it with:

```bash
launchctl print gui/$(id -u)/local.dev-tidy.ports
launchctl bootout gui/$(id -u)/local.dev-tidy.ports
```

## Putting it on PATH

The skill calls it by absolute path, so nothing is needed for that. To run it by
name from a shell, link it into a directory already on `PATH`, which keeps the
copy in the repository the single source of truth:

```bash
ln -sf {{skills_dir}}/dev-tidy/dev-tidy ~/.local/bin/dev-tidy
```

## How long a run takes

The network is the whole cost: one pull request index per repository, about a
second each. They are fetched `--jobs` at a time before anything is examined, so
thirty-five checkouts take about eight seconds rather than a minute. The default
branch comes from `refs/remotes/origin/HEAD` instead of a second round trip.

Only that fetch is parallel. Everything that removes anything runs in one
process, one repository at a time, in the order the report listed. Nothing races
another worktree, another branch, or another container.

## What it removes, and what it will not touch

A worktree or a branch goes on any of three proofs.

**The tip.** It is exactly the commit its pull request carried, and that pull
request is merged or closed.

**The content.** It has commits of its own, and every file those commits touched
is already byte-identical to the default branch.

**The sessions.** Every Claude app session and every Codex session that worked
in it is archived, and its tip is on the default branch or on a remote branch,
so removing it loses no commit. The app's records are read from
`~/Library/Application Support/Claude/claude-code-sessions/`, by working
directory and by branch, and Codex's from `~/.codex/sessions/` and
`~/.codex/archived_sessions/`, by working directory. An archived session is
finished work, so this proof takes the checkout that has nothing of its own and
the one whose work was pushed but never merged.

The second proof is there because of the squash merge. A squash rewrites the
commits it lands, so the original ones sit on no branch and on no remote, and
the tip stops matching the pull request head the moment anything is committed
afterwards. From then on the first proof can never let go of that checkout, and
a reused worktree keeps its several gigabytes forever. What survives a rewrite
is the files, which is why they are what the second proof reads.

Asking instead whether every commit is pushed somewhere answers no for nearly
every squash-merged branch and would protect the whole list, which is why the
script never asks it.

Reading the default branch is only worth anything if it is current, so its ref
is fetched once per repository before the pass, `--jobs` at a time alongside the
pull request indexes. Nothing else is fetched, and nothing is pruned.

Left alone, always:

- worktrees with uncommitted changes, or with a rebase, merge, cherry-pick, revert or
  bisect in progress, and the branch each of them has checked out
- worktrees and branches whose pull request is still open
- a worktree or branch that a Claude app or Codex session not yet archived
  worked in, because the app reuses one worktree for many sessions and the
  newest may still be in use
- a worktree whose `.specs/*/oneshot.md` reads `Status. running` or `waiting`,
  because git ignores that log and no proof above can see it
- the worktrees and branches of every stage an open oneshot series has not
  finished, read from `program.json` in the primary checkout's `.specs/`. A
  stage is merged hours before it is verified, and until then its run log lives
  in its worktree
- every worktree passed as `--keep PATH`, and its branch
- anything holding a file the default branch does not have, whatever its pull
  request says
- a checkout with no commits of its own, so a worktree made an hour ago and not
  committed to yet is still there in the morning
- the repository's default branch, and the long-lived names `main`, `master`,
  `dev`, `develop`, `development`, `staging`, `stage`, `production`, `prod`,
  `release`, `next`, `trunk`, `canary`, `beta`, `alpha`
- any Docker container, volume, or image a container still references
- the newest tag of every Docker image repository

A kept line carries the number that decides what to do about it. `3 of 41
changed files differ from main` is three files to open, not forty-one. `nothing
of its own` is a checkout that never committed anything. `0 of 41` cannot
appear, because that is the second proof passing and the checkout is gone.

The file count overstates what is missing on a busy repository: a file the
default branch rewrote after the merge differs from the branch's copy, though
the branch's work is in. `--inspect` counts lines instead. A line the checkout
adds, committed or not, is missing only when it appears nowhere in the same
file on the default branch, or in a file of the same name when the default
branch moved it. It also lists the pull requests the commits cite and where
each one merged, because work merged into a long-lived branch such as `v2`
reads as missing from `main` until `--against v2` compares it there.

Turborepo caches go by age. Every worktree of a repository writes into the
primary checkout's `.turbo/cache`, so it grows with every build of every branch
and never shrinks. An entry not written for seven days is removed, in the
primary checkout and in each worktree; a build that needs it again rebuilds it.
`--skip-turbo` leaves them alone, and `--ports-only` never touches them.

Worktrees nest (`.claude/worktrees/<group>/<name>`), and a grouping directory is
only removed once no git metadata remains anywhere beneath it.

### Detached worktrees

The editor checks a worktree out on a commit rather than on a branch, so most of
them carry no branch name. The directory name is the only handle left, and it is
the last segment of the branch. The script accepts that guess only when exactly
one pull request head matches it, and then still requires the commit check
above to agree. A directory named after nothing recognisable, such as a Cursor
worktree, is skipped.

### Dev servers

A dev server is found by its working directory, never by its command line. A
Next process reports itself as `next-server (v16.3.1)` with no path in it at
all, so matching the command line finds nothing.

Two passes:

- processes whose working directory is inside a worktree about to be removed
- processes whose working directory no longer exists and sat under a
  `worktrees/` path, left behind when a worktree was deleted without stopping
  what ran inside it. These are the ones that hold a port for weeks.

Anything running out of an application bundle is skipped, along with this script
and the shell and editor above it, and so is any shell, `tmux` or `screen`, or agent CLI
(`claude`, `codex`, `cursor-agent`): those are someone's session, not a server. A daemon inherits whatever directory it was
started from, so its working directory says nothing about who owns it.

The second pass respects `--root`. A process outside the roots was never this
run's to stop.

### wp-env

Each wp-env project keeps a full WordPress install, a compose file, and four
built images under `~/.wp-env/<project>`, and mounts the plugin from the checkout
it was started in. That mount is written into its `docker-compose.yml`, and it is
the only link back. Once the checkout is gone the stack can never be started
again, so its database is unreachable whatever happens to it.

A stack goes when its checkout has disappeared, or when it is a worktree this run
is about to remove. Containers, volumes, images and the `~/.wp-env` directory all
go with it. Each removal is done one id at a time and says which ones refused, so
a stack is never reported gone while gigabytes of it remain.

A stack whose compose file has no plugin mount to read is left alone. There is no
way to tell whose it is.

### Reading what was left

`--kept` adds a line for everything the script refused to touch, with the reason:

```
kept      worktree redesign-right-sidebar-fa5e9a  (5 commit(s) added after the merged pull request)
kept      branch   claude/beautiful-dijkstra-1b4902  (no pull request)
kept      wp-env   wp-env-my-plugin-...  (checkout ~/code/... is still there)
```

Those are the ones that need a person. The `dev-tidy` skill in `{{skills_dir}}`
walks that list with you after a run.

## Running it on a schedule

Once manual runs feel predictable, hand it to the system scheduler: `launchd` on macOS,
a `systemd` user timer on Linux. Neither needs an application open.

### macOS: launchd

Write `~/Library/LaunchAgents/local.dev-tidy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>local.dev-tidy</string>

    <key>ProgramArguments</key>
    <array>
        <string>{{skills_dir_abs}}/dev-tidy/dev-tidy</string>
        <string>--yes</string>
        <string>--quiet</string>
    </array>

    <!-- launchd starts with a bare PATH; gh, git, and docker all live outside it. -->
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>{{home}}</string>
    </dict>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>11</integer>
        <key>Minute</key>
        <integer>30</integer>
    </dict>

    <!-- Skipped rather than queued when the machine is asleep at 11:30;
         the next day's run picks everything up anyway. -->
    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>{{home}}/Library/Logs/dev-tidy.log</string>
    <key>StandardErrorPath</key>
    <string>{{home}}/Library/Logs/dev-tidy.log</string>

    <key>ProcessType</key>
    <string>Background</string>
    <key>LowPriorityIO</key>
    <true/>
    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
```

Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/local.dev-tidy.plist
```

Then:

```bash
launchctl kickstart -p gui/$(id -u)/local.dev-tidy   # run now, don't wait for 11:30
launchctl print gui/$(id -u)/local.dev-tidy          # state, exit code, next run
tail -f ~/Library/Logs/dev-tidy.log                  # what it did
launchctl bootout gui/$(id -u)/local.dev-tidy        # stop scheduling it
```

Editing the plist requires a `bootout` followed by a `bootstrap`, because
`launchd` reads it only at load.

Two things that make scheduled runs fail silently and are worth checking first:

- `gh auth status` must be valid; a scheduled run cannot answer a login prompt,
  and without it every repository is skipped.
- `EnvironmentVariables.PATH` above must actually contain `gh`, `git`, and
  `docker`. `launchd` does not read your shell profile.

### Linux: a systemd user timer

Write `~/.config/systemd/user/dev-tidy.service`:

```ini
[Unit]
Description=Reclaim what local development left behind

[Service]
Type=oneshot
ExecStart={{skills_dir_abs}}/dev-tidy/dev-tidy --yes --quiet
StandardOutput=append:{{home}}/.local/state/dev-tidy.log
StandardError=append:{{home}}/.local/state/dev-tidy.log
Nice=10
IOSchedulingClass=idle
```

and `~/.config/systemd/user/dev-tidy.timer`:

```ini
[Unit]
Description=Run dev-tidy daily

[Timer]
OnCalendar=*-*-* 11:30
Persistent=false

[Install]
WantedBy=timers.target
```

Then:

```bash
mkdir -p ~/.local/state
systemctl --user daemon-reload
systemctl --user enable --now dev-tidy.timer
systemctl --user start dev-tidy.service       # run now
systemctl --user list-timers dev-tidy.timer   # next run
tail -f ~/.local/state/dev-tidy.log           # what it did
systemctl --user disable --now dev-tidy.timer # stop scheduling it
```

A user unit sees a minimal `PATH` too. When `gh` or `docker` live outside `/usr/bin` and
`/usr/local/bin`, add `Environment=PATH=...` to the service. The same `gh auth status` check
applies.

## Why a scheduler and not a scheduled Claude task

Deciding what to remove here is a lookup, not a judgement: a pull request is
merged or it is not. The system scheduler runs without any application open, costs nothing,
and does the same thing every time. A scheduled agent is worth its cost on the
questions that need reading rather than checking, such as which of these stale
branches still matter, or why a project keeps growing. Not on this.
