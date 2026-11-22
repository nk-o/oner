---
name: pr-wait
description: >-
  Watch a pull request through CI and review and handle failures or feedback. Use after opening
  a PR, when asked to watch or babysit one, on a watcher event such as `<ci-monitor-event>`, or
  when verifying readiness, merging, or checking the deployment. For one pass over feedback
  without waiting, use pr-feedback.
argument-hint: "[pull request number or URL]"
---

# Watch a pull request

Pick one watcher from the tools available in this session. Handle existing failures and
feedback before waiting.

- With `watch_pull_request`, read [T3 Code](references/t3-code.md).
- Otherwise, with `mcp__ccd_pr__set_monitor`, read [Claude Code Desktop](references/claude-desktop.md).
- Otherwise, run `{{skills_dir}}/pr-wait/pr-wait.mjs <pr>`. Use Monitor where available,
  or run one foreground command with the host's longest timeout. Restart after a push, after
  acting on exit 1, or after a resume. An existing process with the lock already owns that watch.
  Use `pr-feedback` to collect any existing GitHub feedback before starting the script.

The script's header defines its exit codes. The installed `bots.json` comes from
`reviewBots` in Oner's config. For a PR with existing feedback, use the [event rules](references/events.md)
before waiting. On an event, act on the latest head. When a result needs action, use the
same rules. If it needs no action and the PR is still pending, keep its watch active.

## Ready

Confirm the current head has passing gating checks, completed applicable bot reviews, no
thread awaiting your answer, and no conflict. Check for required reviews before merging.
Determine which CI applies from workflow triggers and filters and the base branch's
required check settings, including checks from other providers. Use the required checks
when configured, otherwise use the PR's CI checks apart from review bot checks. If no
PR CI applies, require `green-repo` to have passed on the current head. If expected
checks have not reported, readiness is still pending.

Stop watching when you hand the PR back. Report the PR, verified head, and any blocker.

For an authorized merge or post-merge verification, read [Release](references/release.md).
