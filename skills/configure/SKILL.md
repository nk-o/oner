---
name: configure
description: >-
  Sets up, changes, and updates oner, the shared rules and skills installed into the user's
  coding agents. Use when the user asks to set up or reconfigure oner, to change the reply
  language, which agents get it, which external reviewers run, which executors `lead` uses,
  which skills are off, or the agent settings (Chrome access, attribution, telemetry, the command guard, auto-compact), to
  update it, or to open its settings page. Also when a session-start note says an update is available.
---

# Configure

The checkout is `{{repo_dir}}`. The settings live in its `config.json`, which is the user's own
file and never committed. `config.schema.json` beside it lists every key, its default, and what
it does. A missing file means every default.

Start from the facts: `node {{repo_dir}}/bin/status.mjs` prints what is configured, what is
installed in each agent, which CLIs exist, and whether an update is waiting. Answer a question
about the current setup from it without changing anything.

## Change a setting

1. Change only the keys the request names in `config.json`. Keep the `$schema` line and every
   other key as it is. Skill names in `skills.disabled` must match a directory under
   `{{repo_dir}}/skills/`.
2. Run `node {{repo_dir}}/bin/build.mjs`. It checks the file and refuses a wrong key or value with
   a message naming it. Fix the key and run it again. Its output lists what each agent gained or
   lost.
3. Report the change and what the build printed, in one or two lines.

When the whole setup is being redone, or the user asks to set oner up from scratch, follow
`{{repo_dir}}/INSTALL.md` from step 2.

## Personal repository

`local.repository` is an optional HTTPS or SSH Git URL. Its root supplies `local/`, including
`AGENTS.md`, `skills/` and other personal files. Use the machine's existing Git authentication
for a private repository. Never put credentials in the URL.

A normal build clones a missing checkout or downloads updates with a fast-forward. It can
connect an existing plain `local/` directory when overlapping files match, preserving files
that exist only locally. A different file at the same path stops the connection before writes.
Automatic builds use the files on disk and never contact the remote.

`node {{repo_dir}}/bin/local.mjs` downloads only personal files without rebuilding agents.
Dirty files are kept and stop this command. A normal build keeps using them and reports that
downloading was skipped. Diverged history, another origin or a detached HEAD stops the update.
The tool does not stash, reset, commit or push. Back up intentional edits with Git from `local/`.
Clearing the setting stops downloading without removing the checkout or installed personal skills.

## External review consent

Enabling a provider under `externalReview` is the user's consent to send it sanitized code from
any repository, for every round. Turn a provider on only when the user asks for it. Turning it
off revokes that consent. The build writes the enabled providers into each agent's instructions
and into Codex's `auto_review.extra_policy`. It preserves personal policy and does not replace
managed policy or grant filesystem or network permissions.

## Release

`oneshot.release` sets where an `oneshot` run ends: `pr` (the default) at a ready pull request,
or `production`, where a run also merges its own pull request and checks production when its
gate allows it, per **Release** in `{{skills_dir}}/oneshot/lanes/tail.md`. It takes effect in the next session.

`orchestration.parallel` (4 by default) caps how many stages of a series build at once. A
`program.json` can set its own `parallel`.

## Executors

`executors.<provider>` (`claude`, `codex`, `grok`, `cursor`) sets which providers `lead` hands
stages to. Each takes `enabled` and a model per tier, `lead`, `build`, and `light`, as
`{ "model": "...", "effort": "..." }`. Claude and Codex are on by default, Grok and Cursor off,
and Cursor has no default models. Turn on only the providers the user pays for. The build
writes the enabled ones into `{{skills_dir}}/lead/executors.md`. `light` stays read-only
whatever model it names. `executors.assign` holds the user's preferred split of work, a list of
`{ "work": "...", "executor": "..." }`, also editable on the settings page. `lead` follows it as a
recommendation in every session, and falls back to the tiers for a stage it fits poorly or an
executor that is off, out of limits, or failing. Without it `lead` picks by tier, which keeps a
stage on the session's own provider whenever that provider has a `build` model.

## Review bots

`reviewBots` sets how `pr-wait` treats each bot that reviews pull requests on the repository's
side: `off`, `wait` (the default for `claude`), or `request`, which posts `@<bot> review` after
each push and so spends that bot's quota.

## Agent settings

These write into each agent's own settings files, so they hold in every host, T3 Code included.
Model, effort, and permission mode are left to the host. Each takes effect in the next session.

- `browser.enabled` adds a rule to Claude Code, Codex, and Cursor to drive the user's Chrome
  through Tencent BrowserSkill. It needs the `bsk` CLI (`install.sh` from
  github.com/Tencent/BrowserSkill), its Chrome extension, and
  `bsk install-skill -H claude-code -H codex`, which Cursor also reads. Check it with
  `bsk doctor`.
- `attribution.enabled` (off by default) lets Claude Code and Cursor credit themselves in commits
  and pull requests.
- `telemetry.enabled` (on by default). Off sets `DISABLE_TELEMETRY` for Claude Code and
  `[analytics] enabled = false` in Codex's `config.toml`.
- `guard.enabled` (on by default) adds a hook, `bin/guard.mjs`, to Claude Code and Codex that
  refuses a force-push or delete of the default branch and a recursive delete of `/`, the home
  directory, or a repository root. It stops a hard reset, a forced clean, or another force-push
  until the agent checks it and runs it again, and never asks the user. In Codex the user trusts
  the hook once in `/hooks`.
- `autoCompact.tokens` sets Claude Code's `autoCompactWindow` and Codex's
  `model_auto_compact_token_limit`. Without it each agent keeps its own default.

## Update

A session-start note says when the remote has commits this checkout does not. Offer the update
in one line when the conversation reaches a pause, and never apply it unasked. When the user
agrees, or asks to update:

1. Show what changed with `git -C {{repo_dir}} log --oneline HEAD..@{upstream}`, in a few lines.
2. When `git -C {{repo_dir}} status --porcelain` prints anything, stop and say which files are
   changed. The user's own additions belong in `local/`, which git ignores.
3. Run `git -C {{repo_dir}} pull --ff-only`, then `node {{repo_dir}}/bin/build.mjs`, and report
   what the build printed.

## Open the settings page

Start `node {{repo_dir}}/bin/ui.mjs` in the background and give the user the `Settings:` address it
prints. It runs until that process stops, and a second start finds the running one. The page changes
the same `config.json` and rebuilds on save.

## Two effects to mention when they apply

- The rules and the language load when a session starts, so they take effect in the next
  session, not this one.
- Codex skips a new or changed hook until the user trusts it once with `/hooks` in Codex. The
  build says when that is needed.

While configuring, do not edit anything under `{{repo_dir}}` other than `config.json` and
`local/`, and nothing in the agents' own directories: the build owns what it wrote there and replaces it on the next run.
Personal rules go in `{{repo_dir}}/local/AGENTS.md` and personal skills in
`{{repo_dir}}/local/skills/<name>/`, both of which the build picks up.
