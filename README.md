# oner

Shared rules and skills for the coding agents you use. One checkout holds them, and a build
installs them into Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI, OpenCode, and Grok
Build. What differs per person lives in `config.json`, so the shared files never change and an
update never collides with anyone's choices.

This is our personal stack: the rules and skills we work with every day. It changes whenever a
skill handles a real task worse than it should, so skills get renamed, merged, and dropped, and an
update can break what worked before. Read it, take what helps, and expect no stable interface.

What it gives you:

- The same agent in every tool: one set of rules for how it talks, decides, edits, and checks its
  work.
- `/oneshot`, which carries a feature or a bug from idea to pull request and stops once for your
  decisions.
- Review by models other than the one that wrote the change.
- Nothing to maintain by hand: a change in settings reaches every agent on its own.

## Install

Ask your coding agent:

> Set up oner: clone https://github.com/nk-o/oner and follow its INSTALL.md.

The agent checks the machine itself, asks you four questions in the chat (reply language, which
agents, which reviewers, which skills to leave out), builds, and gives you the address of the
settings page. `INSTALL.md` is the script it follows.

oner runs on macOS and Linux, and on Windows inside WSL. It needs Node 20 or newer and git.
Some skills also use `jq`, `lsof`, and the GitHub CLI `gh`.

## Using it

Interface work reads the product's `DESIGN.md` through `design-context`. `frontend-design`
and `figma-design` build within that system, `prototype` creates working alternatives with
a portable picker, `refine` improves a working screen in one direction (polish, quieter,
bolder, distill, clarify), and `design-review` checks the result. `motion-design` applies when motion
changes. These skills are discoverable automatically and do not prescribe a visual style.

- **Change a setting.** Ask your agent, or open the settings page. The `configure` skill edits
  `config.json` and rebuilds, and so does the page.
- **Settings page.** `node bin/ui.mjs` serves it on `127.0.0.1`. Ask an agent to open oner
  settings and it starts the page and gives you the link.
- **Updates.** Once a day, at session start, oner checks the remote in the background. When
  there is an update, the agent offers it, and applies it only when you agree.
- **Your own rules and skills.** `local/AGENTS.md` is appended to the rules, and
  `local/skills/<name>/` is installed beside the shared skills. Git ignores `local/`.
- **What is installed where.** `node bin/status.mjs`.

| File | What it is |
| --- | --- |
| `AGENTS.md` | how the agent talks, decides, edits, verifies, and handles review comments. Loaded every session. |
| `CLAUDE.md` | what to know before editing this repository. |
| `INSTALL.md` | the setup an agent follows on a new machine. |
| `skills/` | one directory per skill, each with a `SKILL.md`. |
| `mods/` | Claude Code mods, one folder per mod. The build points `CLAUDE_CODE_PLUGIN_DIRS` here, so a new session loads them from the checkout. `weekly-pace` shows the weekly limit under the prompt against how far today can spend it, and warns as the five-hour window nears its limit. |
| `agents/` | subagent definitions. `oneshot-worker` is the delegate that writes one plan.md task. |
| `bin/build.mjs`, `build/` | the build. No dependencies. |
| `bin/ui.mjs`, `ui/` | the settings page. |
| `bin/status.mjs` | what is configured, installed, and available on this machine. |
| `bin/update-check.mjs`, `bin/session-start.mjs` | session-start hooks: the update check, and the context for agents whose hooks take JSON. |
| `targets/` | per agent, the hooks and settings keys the build owns there. |
| `config.json` | per-person settings, gitignored. `config.schema.json` describes every key; a missing file means the defaults. |
| `local/` | per-person additions, gitignored, including `local/ports.md`, the machine's dev port registry. |

## Wiring

| Agent | Skills | Rules | Subagents | Hooks |
| --- | --- | --- | --- | --- |
| Claude Code | `~/.claude/skills` | `~/.claude/CLAUDE.md` | `agents/*.md` | merged into `settings.json` |
| Codex | `~/.codex/skills` | `~/.codex/AGENTS.md` | `agents/*.toml` | merged into `hooks.json`, trusted once with `/hooks` |
| Cursor | `~/.cursor/skills` | passed in by the `sessionStart` hook | `agents/*.md` | merged into `hooks.json` |
| Gemini CLI | `~/.gemini/skills` | `~/.gemini/GEMINI.md` | `agents/*.md` | merged into `settings.json` |
| GitHub Copilot CLI | `~/.copilot/skills` | `~/.copilot/copilot-instructions.md` | `agents/*.agent.md` | none |
| OpenCode | the Claude Code copy while that target is on | `~/.config/opencode/AGENTS.md` | `agents/*.md` | none |
| Grok Build | the Claude Code copy while that target is on | `~/.grok/AGENTS.md` | none | `hooks/agent-config.json` |

An agent is on by default when its directory exists. The Cursor CLI reads no user-level rules
file, so its `sessionStart` hook passes the rules in as context, or a pointer to them past
Cursor's 10,000-character limit. OpenCode and Grok Build read `~/.claude/skills` on their own,
so while Claude Code is on they get no copy of their own, which would list every skill twice.
The oneshot hook that keeps an unattended run going at the end of a turn works in Claude Code
and Codex. The Gemini CLI, Copilot, OpenCode, and Grok targets follow each tool's documentation and
have not been run against the tool itself.

Paths in the sources are written as `{{skills_dir}}`, `{{agents_dir}}`, and `{{repo_dir}}`,
and each copy gets its own. `{{reply_language}}` comes from `config.json`, and so do
`{{effort_build}}` and `{{effort_review}}`, the reasoning effort that `oneshot-worker` and
`oneshot-reviewer` run at in Claude Code and Codex whatever level the session was started with. Each agent's
directory holds `.agent-config-manifest.json`, which lists every file the build wrote there and
every hook or settings key it owns. The build deletes only files on that list, so skills of your
own and anything the agent itself puts there stay. `enabled: false` for a target removes what
the build put there, and a new `dir` moves it. The checkout records in `.build-state.json` which
directories it installed into for each home directory, so a worktree of this repository, which
has no such file, never rebuilds over the main checkout's install.

Moving from the older wiring, where these directories linked into a checkout at `~/.agents`: the
first build replaces each link with real files and keeps what `settings.json` held. Once it has
run, remove `~/.agents`, since several agents read `~/.agents/skills` on their own and would list
every skill twice.

`allowed-tools`, `argument-hint` and `disable-model-invocation` are Claude Code
keys. Codex and Cursor read `name` and `description` only and ignore the rest, so
every `description` carries both what the skill does and when to use it. Codex also
ignores `disable-model-invocation`, so the three skills only I start (`architecture-scan`,
`external-review`, `gardener`) carry an `agents/openai.yaml` with
`allow_implicit_invocation: false`, which is Codex's way to keep a skill off the model's list.

Claude Code expands dynamic context (`` !`command` `` in the body) and `$ARGUMENTS`.
The build keeps that syntax for Claude and renders explicit commands and invocation arguments
for other targets. Agents sharing Claude's copy follow the runtime fallback in `AGENTS.md`.
A dynamic-context command that exits non-zero aborts the Claude skill, so each one ends in a fallback.
Questions follow the actual running host. Claude Code uses `AskUserQuestion`. Cursor uses an
available user-input tool when permitted. Codex puts a numbered list of questions in its final
response and ends the turn in every mode, without using a question tool. It resumes the same
task after the user's answers. Other agents receive numbered chat questions and answer with a
numbered list.
Skills meant to work everywhere, `dev-tidy` and `worktree` among them, do
without.

Enabling an external review provider is consent to send it sanitized code from any repository,
for every round. Each enabled provider runs on every review while its CLI is installed, and a
provider out of its usage limit is skipped. The build writes the enabled providers into each
agent's instructions, and adds them to Codex's `auto_review.extra_policy` while preserving the
existing policy.

Reviewers receive a separate repository containing sanitized baseline, HEAD and current files.
The copy has no original objects, commit messages, remotes or hooks. Environment files, common
credential files, keys, certificates, dumps and ignored files are excluded from every version.
Symlink and submodule states are omitted while regular committed versions remain available.
stderr lists exclusions. This controls the files handed to reviewers;
provider instructions also require reads to stay inside the copy. It is not a filesystem sandbox.
Reports remain after the copy is removed.

## One command, start to finish

```
/oneshot <the feature, the ticket, or the bug>
```

`oneshot` carries one task from idea to open pull request and stops once, at the gate, right
after the analysis. There it settles the decisions that are mine. Everything after it runs
without asking: spec, implementation, checks, verification against the running product,
review by several models from different vendors, the fixes the review proves, and `gh pr create`. It does not merge,
unless the work becomes a series and I authorize its release.

It has seven lanes: an investigation (a read-only answer, no PR), a fix, a feature, a
refactor (each of the three pins what must not change before it edits, and the tail re-runs
that pin on the real surface), a perf change (measured before and after), a review to act on
(a pull request's own threads and checks, or findings pasted in),
and a plan, which thinks a feature through and ends at a pull request holding the spec alone.
A task that fits none gets a lane written for it in the run log.

Decisions taken during the run are logged under **Assumptions**, each with its evidence, and
land in the final report. A choice that a run can settle (behavior on an input, timing, what a
library returns) is settled by running it, not asked. Four kinds stop the run wherever they
surface: a database schema or migration, the shape of stored data, a contract outside the
repository, and dropping or overwriting data a user has. When I say I am stepping away, the
gate takes its own recommended answers and keeps going.

The run lives in `.specs/NNN-slug/oneshot.md`, so a stopped session can be picked up. Its
**Lane** checklist holds every step of the lane and of the shared tail, ticked as the run goes.
While its `Status.` line reads `running` or `waiting`, the hook in `~/.claude/settings.json` reminds each
turn that the run is open, and again after a resume or a compaction, so "continue" is enough.
When a turn ends while `Status.` reads `running` and steps are still open, the hook names them
and asks for the next one, once per state of the work. Opus 5.5 sometimes ends a long turn on a
progress report, and this is what keeps an unattended run going. The run sets `waiting` before
it stops for my answer, and `stopped: <reason>` when the lane ends without a pull request.

I start it by name. The model may start it on its own only when I hand over a whole task and
ask for it carried through to a PR.

### A series of pull requests, through production

There is no flag. `/oneshot <task>` decides during its analysis whether the work fits one pull
request. When one change has to be in production before the next can land (an
expand-and-contract migration, a backfill before a constraint), or the work is several
independently shippable pieces too large to review as one diff, the run becomes a series. A
task that fits one pull request runs as before and ends at the open PR.

A series still stops once, at the gate. That stop shows the decisions, the stage map, and the
release found in the repository: the merge method, the checks GitHub must report, the command
that prints the commit production runs, the command that proves migrations applied, and the
read-only production checks. It then asks for the release authorization as its own question.
"Build stage one only" turns the run back into an ordinary one. Stepping away never answers
this question.

The authorization covers this program's stages and nothing else: merging each stage's pull
request with `gh pr merge --match-head-commit`, waiting for the repository's own pipeline to
deploy and migrate, the approved production checks, fix-forward pull requests within the spec,
and removing finished worktrees. It does not cover work outside the spec, manual migrations or
other writes to production, a new external reviewer, or dropping data the spec does not drop.

The program lives in the primary checkout's `.specs/NNN-slug/`: the approved `spec.md` and
`plan.md`, `program.json`, and each finished stage's run folder under `stages/`. Branch
switches and removed worktrees do not touch it. `skills/oneshot/series.mjs` is the only writer
of `program.json`. `series.mjs next` reads GitHub, git, and production, records a stage's step
only on evidence it saw, and prints what to do next. It never merges or deploys itself, so
running it again after a crash or a resume repeats nothing.

Each stage runs as an ordinary oneshot run in its own worktree, up to its open pull request.
Independent stages build in parallel. Merges, deploys, and production checks go one stage at a
time. A stage is done only when all of these hold:

- every check on the pull request's current head passed, and the head that merged is that head;
- the merge commit is on the default branch;
- production runs that commit or a descendant of it;
- the stage's migrations and production checks passed against it.

A missing or pending check is unfinished, and a required check that only skipped stops the
series with a question. A deploy that still runs an older commit is unfinished, and so is a
check that cannot decide. A failed production check gets a fix-forward pull
request, at most twice per stage. A deploy that never picks up the merge, a failed migration, a
third failure, a decision the spec did not settle, a review only a person can give, and an
expired login all set the series to waiting and ask me. After my answer, `series.mjs resume`
and `next` re-read GitHub and production before repeating anything, and `resume --recheck
<stage>` reads a stage I repaired by hand from production again. The hook keeps the coordinating session going while the series is
running, once per change of state, and stays silent while the series is waiting. The series is finished when
`series.mjs report` exits 0, which needs every stage done with its evidence.

The table below is the same sequence run by hand. Use it when I want to see each stage, or
when the work does not fit any lane.

## A feature, start to finish

Each feature gets its own worktree and its own chat. Run these in order.

| Step | Command | What you get |
| --- | --- | --- |
| Isolate the work | `wt new <name>` | worktree on a fresh branch, own dev port, local env files, dependencies |
| Think it through | `/brainstorm <idea>` | impact against real code, then every decision that can be settled now. Writes nothing. |
| Write it down | `/spec` | `.specs/NNN-slug/plan.md`, plus `spec.md` when the work is big. Approve each before it continues. |
| Build it | `/implement` | walks `plan.md` task by task, commits per stage, verifies each acceptance criterion |
| Open the PR | `/pr`, then `gh pr create` | title and body written for a human |
| Red CI or review | `/pr-feedback` | each claim checked against the code, real ones fixed, wrong ones refuted |
| Ship | `wt finish` | merges the PR, stops the dev server, deletes branch and worktree |

`wt status` prints every worktree with its port, dev server, and PR state. `wt prune` sweeps
worktrees whose PR is already merged. Both `finish` and `prune` print a plan and change
nothing until you add `--yes`.

Skip what the task does not need. A one-file fix goes `wt new` → edit → `/pr`
→ `wt finish`, with no spec at all.

## Why brainstorm, spec, and implement are three skills

They split on what they produce, so an interrupted session can be picked up by any agent.

- **`/brainstorm`** reads the code before it reasons, cites `file:line` for every claim,
  then grills the decisions it can settle now, in rounds with a recommended answer each
  time. A decision that hangs on a later stage is named and deferred, never guessed. It
  ends with a decision record, or a staged map when the work outgrew one pass.
- **`/spec`** turns that conversation into files: `spec.md` holds the problem, behavior,
  acceptance criteria, and the decisions with their reasoning; `plan.md` holds staged
  checkbox tasks, each naming the files it writes and the check that proves it. Two approval
  gates: spec first, then plan. Called without a brainstorm on a non-trivial feature, it
  sends you back to one.
- **`/implement`** executes `plan.md` to the end. The checkboxes are the state, so a
  stopped session resumes exactly where it left off. Small mismatches with reality get
  fixed and logged under Deviations; a contradiction with the spec stops and asks.
  Subagents only for tasks with non-overlapping file lists. Migrations, lockfiles,
  generated files, and shared config are always sequential.

Where the spec lands comes down to one question. Does it outlive the branch? A spec written
to build what is in front of you goes in `.specs/`, which git ignores, so it never reaches a
commit and nothing has to be cleaned up once the feature ships. That is the default. A spec
the repo should keep goes in `specs/` and is committed with the feature, so it lands in the PR
and gets reviewed.

## Setting up a new project

Once per repository, from its root:

```
/worktree-setup
```

It reads the project, reserves a port block in `local/ports.md`, writes `.claude/worktree.json`,
adds the gitignore entries, notes any local service that only one worktree may own
(a shared database, a container stack, generated types), and writes `.claude/skills/verify-<app>/`,
the project skill that drives the app the way a user does: a CLI (`start`, `doctor`, `list
--affected`, `check`, `map`, `stop`) and `features.json`, a map of every place a user can reach
and the files behind it. `oneshot` and `implement` check the features a diff reaches through
that CLI when it exists. Run it again on a
project that has `worktree.json` but no verify skill yet. Verify with `wt new` afterwards.

## The rest of the skills

| Skill | When |
| --- | --- |
| `/prod-review` | review a diff, a branch, a PR, or code that already shipped, ranked by blast radius |
| `/resolve-review` | act on a review already in hand, whoever wrote it: fix what is real, refute the rest |
| `/diagnose` | find the cause of a bug, a flaky failure, or a regression: a command that fails on it first, then ranked hypotheses, then the fix at the right layer |
| `/blast-radius` | what a change breaks outside its own diff, with the one safety fact proven by running code |
| `/external-review` | more opinions on the same change, one per reviewer `config.json` turns on: Cursor and Claude on our contract, Codex on its own |
| `/configure` | change the reply language, the agents built for, the reviewers, or which skills are off |
| `/green-repo` | make the repo pass its own checks, in the right order, until green |
| `/commit-message` | commit message before every commit, Conventional Commits, no filler |
| `/changelog` | release entry from commit history, written for the user, not the contributor |
| `/docs` | help-center articles for the product's users: one article, an update after a release, the help center's structure, a changelog entry there; screenshots from the running product, stops before structure changes and publishing |
| `/product-video` | a 25-40 s product or listing video recorded from the running site: shot list, scripted scrolls and clicks, camera zooms, title cards in the product's fonts, one video per variant |
| `/architecture-scan` | scan for deepening opportunities, report, then grill one |
| `/codebase-design` | vocabulary for designing a deep module or placing a seam |
| `/grilling` | stress-test a plan or decision you already have |
| `/reflect` | after a run that went wrong or taught something: the lessons, routed to a rule in the project or a skill edit, applied only on approval |
| `/gardener` | sweep what merged since the last pass for workarounds, silenced checks, copies, and dead code; forbid or remove them in one PR |
| `/prototype` | working variants of a screen to choose from, with live controls for the values still open, or a clickable demo that pushes a state model through its awkward cases |
| `/frontend-design` | UI that fits the product it lives in, or a new visual identity, checked on screenshots |
| `/break-ui` | render a screen with the worst data it can get: long names, unbreakable emails, empty lists, failed requests; each break with its fix |
| `/break-api` | run an endpoint, job, or command against the worst inputs it admits: empty body, failed dependency, retry, two writers |
| `/humanizer` | strip AI tells out of a blog post, docs page, or other published copy |
| `/dev-tidy` | reclaim the machine: dead worktrees, stale dev servers, Docker cache |

## Where the skills come from

Skills and rules that started elsewhere keep only the parts that held up in use, rewritten to
the rules in `AGENTS.md`.

| Source | What came from it |
| --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `grilling`, `codebase-design`, and `architecture-scan` (upstream `improve-codebase-architecture`); `diagnose`, from `diagnosing-bugs`; the logic branch of `prototype`; the information-access, tool-cost, and unwired-check lessons in `reflect`, from `retro`; the call tree and rollback note in `pr`, from upstream `pr`; `writing-for-agents` in this repository's `.claude/skills` |
| [pstack](https://github.com/cursor/plugins/tree/main/pstack) | `blast-radius` and the evidence rungs in `AGENTS.md`; the **Shaping code** principles in `AGENTS.md`; `reflect`; the `verify-<app>` skill `worktree-setup` writes, from `create-verification-skill`, with its CLI and feature map from Lauren Tan's Control Glass; **Mistakes that recur** in `AGENTS.md` and `gardener`, from the same talk; the multi-model review in `external-review`, from `interrogate`; four technical-prose patterns in `humanizer`, from `unslop` |
| [blader/humanizer](https://github.com/blader/humanizer) | `humanizer`, built on Wikipedia's "Signs of AI writing" |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | `prototype`; the field map, catalog, and failure signatures in `break-ui` |
| [anthropics/skills](https://github.com/anthropics/skills) | `frontend-design`, extended here with a branch for screens inside an existing product; the fresh-reader check in `docs`, from `doc-coauthoring` |
| Diátaxis, the Google, Microsoft, and GitLab documentation style guides, GitHub Docs' screenshot guidelines, Shopify's release-notes rules | the article types, procedure rules, screenshot rules, and metadata limits in `docs` |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `refine` and its five directions; `break-api` and the cases in `break-ui`, from its `harden`; the product UI rules, templated habits, and bounded screenshot rounds in `frontend-design` |
| [juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) | `commit-message`, from `caveman-commit` |
| Anthropic's prompting guides for Opus 5, Opus 5.5, and Fable 5.1 | the writing and reporting rules in `AGENTS.md`, and the named design defaults in `frontend-design` |

These skills ran beside ours for a while and were later removed: `brainstorming`,
`requesting-code-review`, `receiving-code-review`, and `verification-before-completion` from
[obra/superpowers](https://github.com/obra/superpowers); `tdd`, `to-prd`, `to-issues`, and
`zoom-out` from [mattpocock/skills](https://github.com/mattpocock/skills); `copywriting` and
`copy-editing` from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills);
`documentation-writer` from [github/awesome-copilot](https://github.com/github/awesome-copilot);
`improve` from [shadcn/improve](https://github.com/shadcn/improve); and `find-skills` from
[vercel-labs/skills](https://github.com/vercel-labs/skills).

The copyright and license of each adapted project are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT, see [LICENSE](LICENSE). Parts adapted from other projects keep their own licenses, listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
