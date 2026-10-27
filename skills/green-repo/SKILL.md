---
name: green-repo
description: >-
  Makes the repository pass its own gates: the checks list in .claude/worktree.json when the
  project has one, otherwise the package.json verification scripts in order (format, lint,
  type-check, test, knip, build, then whatever CI runs). Uses the project's own autofix scripts,
  understands a failure before editing, fixes the right layer, and repeats until green or
  blocked. Use when the user wants the project green or the checks passing, before opening a
  pull request, and as the Green step of a oneshot run.
---

# Green repo

1. When `.claude/worktree.json` carries a `checks` list, run those commands in that order and skip the rest of this step. `worktree-setup` took them from the CI workflow, so they are the repository's own gates, PHP and all, and the same list in every worktree. Otherwise, from the project root, read `package.json` → `scripts`. Run only scripts whose keys exist, **in this order**:
   - **`format`**
   - **`lint`**
   - **`type-check`**
   - **`test`**
   - **`knip`** (if defined; unused files/exports/deps and workspace config)
   - **`build`** (production build; must exit 0, catches bundler/module resolution failures that type-check and tests miss)
   - **Other verification scripts the repo treats as a gate.** One counts when the user names
     it, or when a CI workflow file such as `.github/workflows/*.yml` calls the same
     `npm run <name>` or `pnpm <name>`. Run these last, after every script above, and only
     when the key exists in `scripts`.

   Leave out anything that is not verification: **`dev`**, watch modes, and benches that need
   live secrets. Run one of those only when the user asks for it.

2. Use the package manager the repo already uses (for example `packageManager` in `package.json`, or the lockfile: `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, else `npm`).

3. If a step fails or prints fixable warnings, prefer **existing** `scripts` that already autofix (for example **`lint:fix`**) or whatever **`format`** / **`lint`** already run (read the command string; if it already uses write/fix flags, that is enough). Do not invent new CLI flags the project does not use. For **`knip`**, use project-documented fixes (ignore patterns, `tags`, entry files); do not disable rules broadly without a decision.

4. For anything still failing after that, understand the failure before editing: wrong **implementation**, wrong **test or expectation**, **config/tooling**, or **flakiness**. Fix the layer that should change; do not hollow out tests just to go green unless that matches obvious project intent (for example an outdated snapshot the team would retire).

5. If more than one reasonable fix exists and you are not confident which is correct, **stop and ask** using the question routing in `AGENTS.md`, recommended option first.

6. After you change files, run the chain again from its first step, through every step you included in step 1 for this repo.

7. Stop when every step you ran exits **0**, or when you cannot fix further without secrets, network-only data, or a user decision. Say which step failed and why.

## Unattended

When `oneshot` runs this skill, step 5 no longer stops. Take the fix that matches how this
project already resolves that class of failure, record it as one line with its reason under
**Assumptions** in the run log, and carry on. The four hard stops in `oneshot`'s contract still
stop. Step 7 is unchanged: a failure you cannot fix at all is still reported, not worked
around.
