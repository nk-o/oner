---
name: dev-tidy
description: >-
  Analyzes local development disk and memory usage, discovers supported cleanup options,
  and reclaims proven leftovers. Use for machine cleanup, a full disk, merged worktrees,
  stale dev servers or ports, and leftover containers or build caches.
allowed-tools: Bash(*/dev-tidy --capabilities), Bash(*/dev-tidy --kept), Bash(*/dev-tidy --help), Bash(du *), Bash(lsof *), Bash(ps *)
---

# dev-tidy

Run `{{skills_dir}}/dev-tidy/dev-tidy --capabilities` first. It reports optional modules
without fetching Git refs or changing resources. Available means prerequisites can be inspected,
not that data is safe to delete. Absent modules need no setup. Blocked or unknown modules retain
their data; report the missing prerequisite or unreadable state.

Read only the guidance relevant to the request and the detected modules:

| Request or detected data | Read |
| --- | --- |
| Disk or memory complaint, macOS Chrome clones | [Storage investigation](references/storage.md) |
| Git worktrees, branches, ports or dev servers | [Git and ports](references/git.md) |
| T3 records or retained worktree caches | [T3](references/t3.md) |
| Docker images or build cache | [Docker](references/docker.md) |
| WordPress runtime or Docker resources | [WordPress](references/wordpress.md) |
| Turborepo cache | [The Turborepo rules](dev-tidy.md) |

Git, T3, Docker, WordPress and macOS are optional. Do not infer their presence from this skill.
Use --root for projects outside the discovered folders. Read --help for flags and the relevant
section of [the command reference](dev-tidy.md) for implementation details or scheduling.

## Cleanup contract

1. Measure the problem, then choose only the applicable modules. A capability report is not a
   cleanup preview. Scope actual previews with the flags in the selected guidance.
2. Run the scoped command without --yes. Inspect retained work when its ownership or completion
   is uncertain. Completion follows PR content and task records, never age or SHA alone.
3. Report what will be removed and apply the same scope with --yes when authorized. Existing
   authorization carries forward. If apply adds an unpreviewed item, stop and report the drift.
4. Compare free space and repeat the preview. Report what changed, what remains and why.

Use the shipped scripts for cleanup. Do not reconstruct Git, Docker or process deletion by hand.
One apply runs at a time. Active work, source files, histories, unknown ownership and --keep
remain protected. Never use --drop to bypass unreadable app state. Stopping containers preserves
local data; purge requires explicit consent to discard it. Scheduled cleanup never enables purge
or Chrome clone cleanup. Preserve the user's app lifecycle settings, including auto-settlement.
