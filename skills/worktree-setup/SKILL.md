---
name: worktree-setup
description: >-
  Prepares a project for parallel worktrees and for verification. Reserves a dev port block,
  writes .claude/worktree.json and a verify-<app> skill (a CLI and a map of every feature a
  user reaches) that proves a change on the running app, fixes the gitignore entries, and
  records shared local services that only one worktree may own. Run once per repository. Use when worktree work starts in a repository that has no
  .claude/worktree.json, including a session that begins inside an app-created worktree, when
  wt.sh reports the file missing or wrong, or when a project has no verify-<app> skill yet.
---

# Worktree setup

One-time per repository. The result is a committed `.claude/worktree.json` that the
`worktree` skill reads, a port block no other project on this machine uses, a repo that does
not track its own worktrees, and a `verify-<app>` skill.

Run `{{skills_dir}}/worktree/wt.sh init` first. It fills in the package manager, ignored
`.env*` files, and lint/test scripts. Everything below is what autodetection cannot guess.
When the file already exists, update it in place.

## 1. Read the project

Do not guess any of this. Read, then decide.

- `package.json` → `scripts`. Which ones start a **long-running server** (`dev`, `start`,
  `serve`, `watch`, `preview`) and which of those accept a port. A script that only
  compiles is not a server.
- Lockfile → package manager. `composer.json`, `Gemfile`, `go.mod` → a second install step.
- `.gitignore` → local files a fresh checkout will not have. Anything matching `.env*`
  that exists in the primary checkout has to be copied.
- `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/` → port conventions the project already
  documents, local services, and any bootstrap script it already ships.
- `.github/workflows/*.yml` → the commands CI actually gates on. Those are the `checks`, and
  `green-repo` runs them in that order.
- `scripts/bootstrap*.sh` → if the repo bootstraps itself, set `bootstrap` and stop; that
  script owns copying, installing, and ports.

## 2. Reserve a port block

`{{repo_dir}}/local/ports.md` is the machine-wide registry. When it does not exist yet, restore
the one this checkout tracked before it moved to `local/`, if there was one:
`git -C {{repo_dir}} show "$(git -C {{repo_dir}} rev-list -n 1 HEAD -- ports.md)^:ports.md"`.
When that prints nothing, create it with a table of `Block`, `Project`, `Path`, and `Layout` columns. Take the next free block and
add a row with the project and what each port in it is for. One hundred ports per project is the
working size for parallel sessions. Reserve fixed primary and test ports, then size
worktree ranges for every server a checkout starts. Existing projects keep their
working assignments when their ranges expand. A block is taken when the registry
says so, whether or not anything is listening right now.

## 3. Write `.claude/worktree.json`

Three shapes cover almost everything.

**The repo bootstraps itself.** One line, plus the gates:

```json
{ "bootstrap": "scripts/bootstrap-worktree.sh", "checks": ["pnpm lint", "pnpm test"] }
```

**A server that takes a port.** The common case:

```json
{
  "install": "npm install",
  "copy": [".env.local"],
  "servers": [
    {
      "name": "web",
      "command": "npm run dev -- --port {port}",
      "portRange": [3201, 3299],
      "envFile": ".env.local",
      "envUrlKey": "NEXT_PUBLIC_URL"
    }
  ],
  "checks": ["npm run lint", "npm test"]
}
```

`portRange` starts one above the block's base: the base port belongs to the primary
checkout. Set `envFile`/`envUrlKey` only when the app reads its own URL from the
environment. A wrong public URL breaks auth callbacks and absolute links.

**A dev command that picks its own port or tunnel** (a framework CLI, a local stack, a watcher):
list it with no `portRange`. It still lands in `.claude/launch.json`, it just gets no
assigned port.

```json
{ "servers": [{ "name": "theme", "command": "npm start" }] }
```

A library with no dev server gets no `servers` key at all. Say so in the report rather
than inventing one.

## 4. Make the repo worktree-safe

`.gitignore` needs both, or the primary checkout shows every worktree as untracked and each
worktree commits its own port:

```
.claude/worktrees/
.claude/launch.json
```

Add the `.specs/` line as well, per `spec`'s Depth section.

`.claude/worktree.json` is committed, so every checkout and every teammate gets the same setup.

## 5. Record shared local services

A local database, a container stack, or a generated types file is shared by every checkout on
the machine, so parallel worktrees fight over it. When the project has one, add a short
paragraph to `AGENTS.md` naming the service, who starts it (the primary checkout), and the rule
that only one worktree at a time may own schema changes. A project with no such service gets no
rule.

## 6. Write the verify skill

Write `.claude/skills/verify-<app>/`, a committed project skill that drives the app the way a
user does, per [references/verify-skill.md](references/verify-skill.md): the CLI, the feature
map, its SKILL.md, and the proof run that ends the step. A library with no runnable surface
gets no verify skill; say so.

## 7. Verify

Create a throwaway worktree, look at it, remove it:

```bash
{{skills_dir}}/worktree/wt.sh new setup-check --no-install
{{skills_dir}}/worktree/wt.sh status
git worktree remove .claude/worktrees/setup-check && git branch -D setup-check
```

`status` has to show the worktree with the port you assigned. If `new` fails, fix the config
rather than leave a half-working setup behind.

## 8. Report

Name the port block, the files written, and anything the user has to finish by hand:
secrets in a copied `.env`, a dev command you could not verify, a shared service worth a
second opinion. Then point at `wt.sh new` for the first real feature.
