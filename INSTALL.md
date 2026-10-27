# Setting up oner

This file is for the coding agent that sets oner up. The user asked you to install or set up
oner. Do everything that needs no decision yourself, ask the user only what follows, and
finish with a working install and a link to the settings page.

## 1. Get the checkout

If this file is not already inside a clone, clone the repository. The default location is
`~/.oner`. Use another one only when the user names it.

```bash
git clone https://github.com/nk-o/oner.git ~/.oner
```

Never clone into `~/.agents`. Codex, Cursor, and several other agents read `~/.agents/skills` on
their own, and would load the raw sources next to the built copies. The build refuses to run
from there.

## 2. Check the machine, without asking

Run these from the checkout and read what they print:

```bash
node --version
command -v git jq lsof gh
node bin/status.mjs
```

Node 20 or newer and git are required. When either is missing or Node is older, stop and tell the
user how to install it for their system, then continue once they have. The others are needed by
some skills: `jq` by the oneshot hooks, `lsof` by the worktree and cleanup scripts to see which
ports are in use, and `gh` by everything that reads or opens pull requests. Name the missing ones
and how to install them, and go on. `bin/status.mjs` lists every agent oner
can install into, whether its CLI and its directory exist, the external reviewers and whether
their CLIs exist, and the skills.

oner runs on macOS and Linux. On Windows it runs inside WSL.

## 3. Ask the user, in one message

Put the questions below in one message, numbered, each with your recommended answer taken from
what `bin/status.mjs` found. Ask nothing else, and use the recommendation for anything the user
skips.

Route questions by the actual host. Claude Code uses `AskUserQuestion`. Cursor uses an available
user-input tool when its rules permit the question. In Codex, put one numbered list in the final
response and end the turn in every mode, without using a question tool. Wait for the user's
numbered answers before continuing. On other hosts, or without a suitable tool, send the same
list in chat and end the turn.

1. **Language.** Which language should the agents reply in? Code, commit messages, and pull
   requests stay in English whatever they choose. Recommend the language the user is writing to
   you in.
2. **Agents.** Which of the agents found on this machine should get the rules and skills?
   Recommend all of them. List only the ones whose CLI or directory exists.
3. **External review.** Which installed providers should review changes through the user's
   subscriptions? Explain that enabling one sends sanitized code from any repository to that
   service on every review. Recommend the installed providers. Enable only the ones the user
   approves.
4. **Skills to leave out.** Recommend none. Mention that any skill can be turned off later.

## 4. Write the config and build

Write `config.json` at the checkout root with only what differs from the defaults in
`config.schema.json`, plus the `$schema` line:

```json
{
  "$schema": "./config.schema.json",
  "language": "German",
  "targets": { "cursor": { "enabled": false } },
  "externalReview": { "codex": { "enabled": false } }
}
```

Then build:

```bash
node bin/build.mjs
```

It prints one line per agent. When it refuses, it names the file in the way and why:

- A file it would overwrite and did not write itself, such as the user's own `~/.claude/CLAUDE.md`:
  show the user the file, and with their agreement move its content into `local/AGENTS.md`,
  which the build appends to the rules. Personal skills go in `local/skills/<name>/`.
- A symlink into something that is not a checkout of this repository: show it and ask.

A symlink into an older checkout of this repository is replaced on its own, with the settings it
pointed at kept. When that older checkout sits at `~/.agents`, tell the user to remove it once
they have checked the new install, since Codex reads `~/.agents/skills` and would list every
skill twice.

## 5. Finish

- When the build printed a line asking to trust Codex hooks, tell the user to run `/hooks` in
  Codex once. Codex skips a new or changed hook until then.
- Start the settings page in the background with `node bin/ui.mjs` and give the user the address
  it prints. Say that it runs until that process stops, and that asking an agent to "open
  oner settings" starts it again.
- Tell the user to start a new session in each agent, because the rules load at startup.

Report in a few lines: which agents got oner and where, the language, the reviewers, the
settings page address, and anything left for the user to do.

After this, the `configure` skill handles changes, updates, and the settings page.
