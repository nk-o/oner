---
name: configure
description: >-
  Sets up, changes, and updates oner, the shared rules and skills installed into the user's
  coding agents. Use when the user asks to set up or reconfigure oner, to change the reply
  language, which agents get it, which external reviewers run, or which skills are off, to update
  it, or to open its settings page. Also when a session-start note says an update is available.
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

## External review consent

Enabling a provider under `externalReview` is the user's consent to send it sanitized code from
any repository, for every round. Turn a provider on only when the user asks for it. Turning it
off revokes that consent. The build writes the enabled providers into each agent's instructions
and into Codex's `auto_review.extra_policy`. It preserves personal policy and does not replace
managed policy or grant filesystem or network permissions.

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

Start `node {{repo_dir}}/bin/ui.mjs` in the background and give the user the address it prints.
It runs until that process stops. The page changes the same `config.json` and rebuilds on save.

## Two effects to mention when they apply

- The rules and the language load when a session starts, so they take effect in the next
  session, not this one.
- Codex skips a new or changed hook until the user trusts it once with `/hooks` in Codex. The
  build says when that is needed.

Do not edit anything under `{{repo_dir}}` other than `config.json` and `local/`, and nothing in
the agents' own directories: the build owns what it wrote there and replaces it on the next run.
Personal rules go in `{{repo_dir}}/local/AGENTS.md` and personal skills in
`{{repo_dir}}/local/skills/<name>/`, both of which the build picks up.
