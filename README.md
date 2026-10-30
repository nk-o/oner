# oner

Rules and skills for coding agents, kept in one place and built into every agent you use:
Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot CLI, OpenCode, and Grok Build.

## Why

We use several coding agents side by side. Each reads its rules and skills from its own folder,
in its own format, and copies kept by hand drift apart. oner keeps one copy, and a build writes it
into each agent. A rule changed here changes in every agent at once.

The rules describe the agent we want to work with. It finds facts on its own and brings us only
the decisions that are ours. It makes the smallest change that solves the task. It proves its work
by running it and says when it could not. It reports in a few plain sentences.

## A personal stack

This is the set we work with every day, published as it is. It changes whenever a skill handles a
real task worse than it should, so skills get renamed, merged, and dropped, and an update can break
something that worked the day before. Read it and take what helps. There is no stable interface.

## What is inside

- **Rules.** `AGENTS.md` loads into every session and sets how the agent talks, decides, edits,
  checks its work, and treats review comments.
- **`/oneshot`.** It takes a feature or a bug from idea to an open pull request and stops once,
  early, for your decisions.
- **Review by other vendors' models.** Codex, Cursor, and Claude review a change through your own
  subscriptions, each on a sanitized copy of the code.
- **Skills** for planning, interface design, debugging, review, and shipping, listed below.
- **A settings page** for the reply language, the agents, the reviewers, and the skills you turn
  off.

## Install

Ask your coding agent:

> Set up oner: clone https://github.com/nk-o/oner and follow its INSTALL.md.

The agent checks the machine, asks you four questions (reply language, which agents, which
reviewers, which skills to leave out), builds, and gives you the address of the settings page.
[INSTALL.md](INSTALL.md) is the script it follows.

oner runs on macOS and Linux, and on Windows inside WSL. It needs Node 20 or newer and git. Some
skills also use `jq`, `lsof`, and the GitHub CLI `gh`.

## Day to day

- **Settings.** Ask your agent to change one, or open the settings page. Both edit `config.json`
  and rebuild. `node bin/ui.mjs` serves the page on `127.0.0.1`.
- **Updates.** Once a day, at session start, oner checks for new commits in the background. The
  agent offers the update and applies it only when you agree.
- **Your own rules and skills.** The build appends `local/AGENTS.md` to the rules and installs
  `local/skills/<name>/` beside the shared skills. Git ignores `local/`.
- **What is installed where.** `node bin/status.mjs` prints it.

## One command, start to finish

```
/oneshot <the feature, the ticket, or the bug>
```

`oneshot` reads the code, then stops once to ask the decisions that are yours to make. Everything
after that runs without asking: the spec, the implementation, the project's checks, verification
in the running product, review by several models, fixes for what the review proves, the pull
request, and a watch on it until checks and review bots are through. It does not merge.

Work too large for one pull request becomes a series. With your authorization, each stage is
merged, deployed, and checked in production before the next one lands.

`/oneshot-auto` is the same run for when you are not watching. The gate takes its own
recommended answers, and the pull request is merged once it is ready and checked in production
after the deploy. It stops only for a change that destroys data or breaks an outside contract.

[docs/oneshot.md](docs/oneshot.md) covers the lanes, the run log, and the series.

## By hand

The same work, one step at a time, for when you want to see each stage:

| Step | Command | What you get |
| --- | --- | --- |
| Isolate the work | `wt new <name>` | a worktree on a fresh branch, with its own dev port, env files, and dependencies |
| Think it through | `/brainstorm <idea>` | the idea checked against the real code, and every decision that can be settled now |
| Write it down | `/spec` | `plan.md`, plus `spec.md` when the work is big, each approved before the next |
| Build it | `/implement` | `plan.md` worked task by task, with each acceptance criterion checked in the product |
| Open the PR | `/pr`, then `gh pr create` | a title and body written for a person |
| Wait for CI and review | `/pr-wait` | the PR watched until it is ready, real defects fixed, every thread answered |
| Ship | `wt finish` | the PR merged, the dev server stopped, the branch and worktree removed |

A one-file fix needs only `wt new`, the edit, `/pr`, and `wt finish`.
[docs/workflow.md](docs/workflow.md) explains why planning takes three skills and how to prepare
a new project.

## Skills

| Stage | Skill | What it does |
| --- | --- | --- |
| Plan | `/brainstorm` | checks an idea against the code that exists and settles the decisions it can |
| | `/spec` | turns a settled discussion into a staged plan, and a spec when the size calls for one |
| | `/grilling` | questions a plan or decision you already have until its weak points show |
| | `/codebase-design` | vocabulary for designing a deep module or placing a seam |
| | `/architecture-scan` | finds modules worth deepening, reports them, then questions you about one |
| Design | `/design-context` | reads the product's `DESIGN.md` and visual system before any UI work |
| | `/frontend-design` | builds UI that fits the product it lives in, checked on screenshots |
| | `/figma-design` | editable Figma screens with auto layout, variables, and components |
| | `/prototype` | working variants to choose from, with live controls for the values still open |
| | `/refine` | improves a working screen in one direction: polish, quieter, bolder, distill, or clearer copy |
| | `/motion-design` | purpose, timing, easing, and reduced motion for UI animation |
| | `/design-review` | checks hierarchy, readability, accessibility, and states on the rendered result |
| Build | `/implement` | works through an approved plan until every task and criterion is done |
| | `/diagnose` | builds a command that fails on the bug first, then rules out causes until one is left |
| | `/humanizer` | removes AI tells from a blog post, a README, or other published copy |
| | `/changelog` | a release entry from commit history, keeping only what users would notice |
| | `/docs` | help-center articles with screenshots from the running product, published through Poise |
| | `/product-video` | a short product video recorded from the running site |
| Check | `/prod-review` | reviews a change or shipped code by what it will do in production |
| | `/blast-radius` | what a change breaks outside its own diff, with the key safety fact proven by running code |
| | `/break-ui` | renders a screen with the worst data it can get, and gives a fix for each break |
| | `/break-api` | runs an endpoint, job, or command against the worst inputs it accepts |
| | `/green-repo` | runs the project's own checks in order and fixes failures until all pass |
| | `/resolve-review` | acts on a review already in hand: fixes what is real, refutes the rest |
| | `/external-review` | the same change reviewed by every provider turned on in `config.json` |
| Ship | `/oneshot` | one task from idea to open pull request |
| | `/oneshot-auto` | one task from idea to production, with nobody watching |
| | `/commit-message` | a Conventional Commits message for the staged change |
| | `/pr` | a pull request title and body written for a person |
| | `/pr-feedback` | works through a PR's unresolved threads and failing checks once |
| | `/pr-wait` | watches a PR until checks and review bots are through, fixing and answering on the way |
| | `/stale-pr` | decides whether an old PR should be updated, reworked, or closed, and updates it |
| | `/issue-tracker` | keeps the tracker issue's status and checklist in step with the work |
| Upkeep | `/configure` | changes the language, agents, reviewers, or disabled skills, and applies updates |
| | `/worktree` | creates, tracks, and removes feature worktrees with their own ports |
| | `/worktree-setup` | prepares a repository for worktrees and writes its `verify-<app>` skill |
| | `/dev-tidy` | clears merged worktrees, stale dev servers, and old build caches from the machine |
| | `/reflect` | turns what went wrong in a session into rules, applied only on your approval |
| | `/gardener` | finds workarounds, silenced checks, and dead code merged since the last pass |
| | `/deslop` | slims a project: narrating comments, tests that guard nothing, unreached code, and copied helpers go |

An agent also loads a skill on its own when a task calls for it. `/architecture-scan`,
`/deslop`, `/external-review`, `/gardener`, and `/oneshot-auto` are the exceptions and run only when you
start them.

## Agents

| Agent | Skills | Rules | Subagents | Hooks |
| --- | --- | --- | --- | --- |
| Claude Code | `~/.claude/skills` | `~/.claude/CLAUDE.md` | `agents/*.md` | merged into `settings.json` |
| Codex | `~/.codex/skills` | `~/.codex/AGENTS.md` | `agents/*.toml` | merged into `hooks.json`, trusted once with `/hooks` |
| Cursor | `~/.cursor/skills` | passed in by the `sessionStart` hook | `agents/*.md` | merged into `hooks.json` |
| Gemini CLI | `~/.gemini/skills` | `~/.gemini/GEMINI.md` | `agents/*.md` | merged into `settings.json` |
| GitHub Copilot CLI | `~/.copilot/skills` | `~/.copilot/copilot-instructions.md` | `agents/*.agent.md` | none |
| OpenCode | the Claude Code copy while that target is on | `~/.config/opencode/AGENTS.md` | `agents/*.md` | none |
| Grok Build | the Claude Code copy while that target is on | `~/.grok/AGENTS.md` | none | `hooks/agent-config.json` |

An agent is on by default when its directory exists. The hook that keeps an unattended `/oneshot`
run going works in Claude Code and Codex. The Gemini CLI, Copilot, OpenCode, and Grok targets
follow each tool's documentation and have not been run against the tool itself. [docs/how-it-works.md](docs/how-it-works.md) describes the
build, the repository layout, and what external reviewers receive.

## Where the skills come from

Skills and rules that started elsewhere keep only the parts that worked in practice, rewritten to
the rules in `AGENTS.md`.

| Source | What came from it |
| --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `grilling`, `codebase-design`, and `architecture-scan` (upstream `improve-codebase-architecture`); `diagnose`, from `diagnosing-bugs`; the logic branch of `prototype`; the information-access, tool-cost, and unwired-check lessons in `reflect`, from `retro`; the call tree and rollback note in `pr`; `writing-for-agents` in this repository's `.claude/skills` |
| [pstack](https://github.com/cursor/plugins/tree/main/pstack) | `blast-radius` and the evidence rungs in `AGENTS.md`; the **Shaping code** principles in `AGENTS.md`; `reflect`; the `verify-<app>` skill `worktree-setup` writes, from `create-verification-skill`, with its CLI and feature map from Lauren Tan's Control Glass; **Mistakes that recur** in `AGENTS.md` and `gardener`, from the same talk; the multi-model review in `external-review`, from `interrogate`; four technical-prose patterns in `humanizer`, from `unslop`; the comment keep list in `AGENTS.md` and `deslop`, from `no-comments` |
| [cursor/plugins](https://github.com/cursor/plugins) `cursor-team-kit` | the diff scope, behavior rule, and guards kind of `deslop`, from `deslop` |
| [garrytan/gstack](https://github.com/garrytan/gstack) | the relaxed-gate rule in `AGENTS.md` and `deslop`'s criteria, from `review/gate-integrity.md`; the test kind's copied-scaffolding and test-only-caller rows, from `test-audit` |
| [obra/superpowers](https://github.com/obra/superpowers) | the test bar in `AGENTS.md`, from `writing-good-tests` |
| [blader/humanizer](https://github.com/blader/humanizer) | `humanizer`, built on Wikipedia's "Signs of AI writing" |
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | `prototype`; the field map, catalog, and failure signatures in `break-ui` |
| [t3dotgg/tstack](https://github.com/t3dotgg/tstack) | `pr-wait`, from `babysit-pr` and its `pr-wait` script; `stale-pr`, from `modernize`; `oneshot-auto`, from `full-send`; the extra review round for security, access, data loss, and concurrency in `oneshot`, from `sol-loop`; the secrets check in `pr`, from `file-pr` |
| [anthropics/skills](https://github.com/anthropics/skills) | `frontend-design`, extended with a branch for screens inside an existing product; the fresh-reader check in `docs`, from `doc-coauthoring` |
| [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `refine` and its five directions; `break-api` and the cases in `break-ui`, from its `harden`; the product UI rules, templated habits, and bounded screenshot rounds in `frontend-design` |
| [juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) | `commit-message`, from `caveman-commit` |
| Diátaxis, the Google, Microsoft, and GitLab documentation style guides, GitHub Docs' screenshot guidelines, Shopify's release-notes rules | the article types, procedure rules, screenshot rules, and metadata limits in `docs` |
| Anthropic's prompting guides for Opus 5, Opus 5.5, and Fable 5.1 | the writing and reporting rules in `AGENTS.md`, and the named design defaults in `frontend-design` |

These skills ran beside ours for a while and were later removed: `brainstorming`,
`requesting-code-review`, `receiving-code-review`, and `verification-before-completion` from
[obra/superpowers](https://github.com/obra/superpowers); `tdd`, `to-prd`, `to-issues`, and
`zoom-out` from [mattpocock/skills](https://github.com/mattpocock/skills); `copywriting` and
`copy-editing` from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills);
`documentation-writer` from [github/awesome-copilot](https://github.com/github/awesome-copilot);
`improve` from [shadcn/improve](https://github.com/shadcn/improve); and `find-skills` from
[vercel-labs/skills](https://github.com/vercel-labs/skills).

## License

MIT, see [LICENSE](LICENSE). Parts adapted from other projects keep their own licenses, listed
with their copyright in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
