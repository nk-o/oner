# How it works

## Repository layout

| Path | What it is |
| --- | --- |
| `AGENTS.md` | the rules: how the agent talks, decides, edits, verifies, and treats review comments. Loaded into every session. |
| `CLAUDE.md` | what to know before editing this repository. |
| `INSTALL.md` | the setup an agent follows on a new machine. |
| `skills/` | one directory per skill, each with a `SKILL.md`. |
| `agents/` | subagent definitions. `oneshot-worker` writes one task of a plan, `oneshot-reviewer` reviews the finished change. |
| `mods/` | Claude Code mods, one folder per mod. `weekly-pace` shows the weekly usage limit under the prompt against how much today can spend, and warns when the five-hour window nears its limit. |
| `bin/build.mjs`, `build/` | the build. It has no dependencies. |
| `bin/ui.mjs`, `ui/` | the settings page. |
| `bin/status.mjs` | what is configured, installed, and available on this machine. |
| `bin/update-check.mjs`, `bin/session-start.mjs` | session-start hooks: the update check, and the context for agents whose hooks take JSON. |
| `targets/` | for each agent, the hooks and settings keys the build owns there. |
| `config.json` | personal settings, ignored by git. `config.schema.json` describes every key, and a missing file means the defaults. |
| `local/` | personal additions, ignored by git, including `local/ports.md`, the machine's dev port registry. |

## The build

`node bin/build.mjs` renders `skills/`, `agents/`, `AGENTS.md`, and `local/` into every agent
turned on in `config.json`, and merges the build's own keys into each agent's settings. The build
points `CLAUDE_CODE_PLUGIN_DIRS` at `mods/`, so a new Claude Code session loads the mods from the
checkout.

Paths in the sources are written as `{{skills_dir}}`, `{{agents_dir}}`, and `{{repo_dir}}`, and
each agent's copy gets its own paths. `{{reply_language}}` comes from `config.json`, and so do
`{{effort_build}}` and `{{effort_review}}`, the reasoning effort `oneshot-worker` and
`oneshot-reviewer` run at in Claude Code and Codex, whatever level the session started with.

Each agent's directory holds `.agent-config-manifest.json`, which lists every file the build
wrote there and every hook or settings key it owns. The build deletes only files on that list, so
your own skills and anything the agent puts there stay. `enabled: false` for an agent removes what
the build put there, and a new `dir` moves it. `.build-state.json` records which directories the
checkout installed into for each home directory. A worktree of this repository has no such file,
so it never rebuilds over the main checkout's install.

The Cursor CLI reads no user-level rules file, so its `sessionStart` hook passes the rules in as
context. Past Cursor's 10,000-character limit, it passes a pointer to them instead. OpenCode and
Grok Build read `~/.claude/skills` on their own. While Claude Code is on, they get no copy of
their own, because a second copy would list every skill twice.

## Skill frontmatter

`allowed-tools`, `argument-hint`, and `disable-model-invocation` are Claude Code keys. Codex and
Cursor read only `name` and `description`, so every `description` says both what the skill does
and when to use it. Codex also ignores `disable-model-invocation`. The three skills that run only
when you start them (`architecture-scan`, `external-review`, `gardener`) therefore carry an
`agents/openai.yaml` with `allow_implicit_invocation: false`, which keeps a skill off the model's
list in Codex.

Claude Code expands dynamic context (`` !`command` `` in a skill's body) and `$ARGUMENTS`. The
build keeps that syntax for Claude Code and renders explicit commands and arguments for the other
agents. Agents that share Claude Code's copy follow the fallback described in `AGENTS.md`. A
dynamic-context command that exits non-zero aborts the skill in Claude Code, so each one ends in a
fallback.

## Questions to the user

Each agent asks in its own way. Claude Code uses `AskUserQuestion`. Cursor uses a user-input tool
when its rules allow the question. Codex puts a numbered list of questions in its final response
and ends the turn, in every mode, and resumes the same task after the answers. Other agents send
numbered questions in chat. Skills meant to work in every agent, such as `dev-tidy` and
`worktree`, ask no questions.

## External review

Turning a review provider on is consent to send it sanitized code from any repository, for every
review round. Each provider that is on runs on every review while its CLI is installed, and a
provider that is out of its usage limit is skipped. The build writes the providers into each
agent's instructions, and adds them to Codex's `auto_review.extra_policy` while keeping the
policy that was already there.

Reviewers receive a separate repository with sanitized versions of the baseline, HEAD, and the
current files. The copy has no original git objects, commit messages, remotes, or hooks.
Environment files, common credential files, keys, certificates, dumps, and ignored files are left
out of every version. Symlinks and submodules are left out too, while regular committed files stay.
The script lists every exclusion on stderr. This controls which files reviewers get, and each
provider's instructions require its reads to stay inside the copy. It is not a filesystem
sandbox. Reports stay after the copy is removed.

## Moving from the older setup

An older setup linked each agent's directories into a checkout at `~/.agents`. The first build
replaces each link with real files and keeps what `settings.json` held. Once it has run, remove
`~/.agents`, because several agents read `~/.agents/skills` on their own and would list every
skill twice.
