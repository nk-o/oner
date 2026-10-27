# Editing this repository

`AGENTS.md` here is rendered into the global `~/.claude/CLAUDE.md`, so it is already in context.
`skills/`, `agents/`, `AGENTS.md`, `targets/`, and `local/` reach every session once
`bin/build.mjs` renders them. In Claude Code the hook in `.claude/settings.json` runs it after
each edit. Any other agent runs `node bin/build.mjs --auto` after editing those or `config.json`.
Every agent, Claude Code included, runs it after a pull, merge, rebase, or branch switch, and
after the app syncs the branch, because no edit hook fires when git brings the changes in.

- Before writing or editing a skill, a lane, an agent definition, or `AGENTS.md`, read
  `.claude/skills/writing-for-agents/SKILL.md`. It covers structure: descriptions, what moves
  behind a pointer, completion criteria, and pruning.
- A path to one of the set's own files is written as `{{skills_dir}}`, `{{agents_dir}}`, or
  `{{repo_dir}}`, never as `~/.claude/...`. The build puts each agent's own path there: `~/...`
  in text, `$HOME/...` in `.sh` files and hook commands. `{{skills_dir_abs}}`,
  `{{repo_dir_abs}}` and `{{home}}` are absolute, for files no shell reads.
  `{{reply_language}}` is the language from `config.json`, and `{{effort_<stage>}}` is a
  subagent's effort level from its `effort` section.
- `mods/` is not rendered. The Claude Code settings the build writes name it in
  `CLAUDE_CODE_PLUGIN_DIRS`, so each folder there loads as a mod in every new Claude Code
  session. Check a mod with `claude plugin validate` and `claude plugin test` from its folder.
- A new setting goes in `config.schema.json`, is validated in `build/config.mjs`, and reaches
  the files through a token or a generated file, never through a skill reading `config.json`
  at run time.
- A `` !`command` `` line that exits non-zero aborts the whole skill. End each one with a
  fallback (`|| true`, `|| echo ...`), and try it outside a git checkout and in a repository with
  no commits.
- `allowed-tools` grants last for the rest of the turn that invoked the skill, and inside an
  unattended oneshot run that turn is the rest of the run. Grant read-only commands only. When
  a read needs a command that can also write, such as `gh api`, put the read in a script beside
  the skill and grant that script, as `pr-feedback` does with `context.sh`.
- `model` in a skill's frontmatter holds for the rest of the turn that invoked it, so no skill
  that oneshot calls sets it.
- Codex and Cursor read `name` and `description` only. Codex ignores
  `disable-model-invocation`: an `agents/openai.yaml` beside the skill with
  `allow_implicit_invocation: false` keeps it off the model's list there.
- Question tool names belong in the runtime routing rule in `AGENTS.md`, not in a skill.
  Non-Claude skill copies render dynamic context as explicit commands through `build/skills.mjs`.
- An enabled `externalReview` provider is the user's consent to review any repository. Do not
  add a second consent gate in front of it. Snapshot changes must preserve the diff without copying original
  Git objects, ignored files or symlink contents.
- A one-line frontmatter value with `: `, ` #`, or a leading `[` goes in quotes. An unquoted
  `[a, b]` parses as a YAML list, and a host skips a skill whose frontmatter does not parse.
  The build refuses these shapes, and a `name` that differs from the skill's directory.
