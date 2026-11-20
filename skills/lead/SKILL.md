---
name: lead
description: >-
  Runs an initiative that needs several pull requests. Plans it with the user in the tracker
  (a project, milestones as user outcomes, one owner issue per outcome, a decisions document),
  or takes a tracker plan the user approved, then ships it as an oneshot series with one stage
  and one `agent` sub-issue per pull request. Use when work needs several pull requests, or
  when the user names a tracker project, milestone, or initiative to plan or run. Work that
  fits one pull request goes to `oneshot`.
---

# Lead

`lead` coordinates an initiative and writes no code. It plans with the user, writes the
program, hands each stage to an executor, and keeps the tracker's two layers current. Each
stage is an oneshot stage run, and `{{skills_dir}}/oneshot/series.mjs` holds the program's
state. Read `{{skills_dir}}/oneshot/lanes/series.md` before step 2. The steps below name its
steps and add only what the tracker and the executors change. **Layers** in the
`issue-tracker` skill says what each tracker write holds.

## 1. Take the plan

Done when the plan is in the tracker and you have read it back.

- **The user asks you to run a tracker project, milestone, or issue.** That request approves
  the plan written there. Read the owner issues, their blocked-by relations, and the decisions
  document.
- **No approved plan yet**, such as a request with no tracker plan, or a plan the user asks
  you to write or change. Run `brainstorm` with the user first. Its phase 2 settles the
  decisions, and **Decide the split** in `series.md` sets where one pull request ends. Then
  write the plan into the tracker: a project, one milestone per outcome a user gets, one owner
  issue per outcome with blocked-by relations for the order, and the decisions as a document
  on the project. The owner layer carries no path, commit, or code.

With no tracker tool in the session, the plan stays in the program folder, and the rest runs
as an oneshot series with no tracker writes.

## 2. The stop

Done when the user's answers are in this chat, quoted.

One stop, per step 3 of `series.md`, asked through the question routing in `AGENTS.md`. It
shows the stage map from step 3 below, one line per stage, and the release facts found, and it
asks two things: approval of the plan with its link, unless the user's request already gave it,
and the release authorization as its own question. Build nothing before the answers. A change
the user asks for goes into the tracker, and the stop is asked again. An answer comes from the
chat or the question tool, never from a tracker comment. **Away** never answers this stop.

## 3. Write the program

Done when `series.mjs next --program <folder>` accepts the program and prints its first
actions.

Open the program folder per steps 3 and 4 of `series.md`, with its series log `oneshot.md`.
spec.md takes the outcomes, the owner issue ids, and the decisions document. plan.md holds one
stage per pull request, from the tracker plan and the code. Then `program.json`:

- **Stages.** One per pull request. An owner issue gets one, or more only for a reason **Decide
  the split** names.
- **`after`.** A stage of an issue blocked by another comes after that issue's last stage.
  Stages of one issue follow each other in plan order.
- **`serial: true`** for a stage that touches a database schema, a migration, a lockfile, or
  deploy config, and `migrations: true` for one that carries a migration.
- **`parallel`**: {{orchestration_parallel}}, from config.

A blocked-by cycle is a question at the stop. An initiative across several repositories gets
one program per repository. A stage blocked by work outside its program, in another
repository or outside the plan, stays out of `program.json` until that work has shipped, and
then joins with `series.mjs amend --stages <file> --approval "<the plan's approval, quoted>"`.

Beside it goes `tracker.json`, which only `lead` writes and a later session finds the issues
through:

```json
{ "tracker": "linear", "project": "<id or url>",
  "stages": { "<stage id>": { "ownerIssue": "<id>", "subIssue": null, "executor": "<provider>" } } }
```

`subIssue` stays null until the stage starts.

## 4. Pick the executors

[executors.md](executors.md) lists the executors the user enabled, by tier, as the build wrote
them from config. Its default models come from a measurement on three solved tasks, one run
each, so a tier is a starting point, not a ranking.

- **`build`** runs a stage run. Take the session's own provider when it has a `build` row,
  else the first `build` row the host can start.
- **`lead`** is the coordinator: this session, or the session that takes the series over.
- **`light`** only reads, such as a search, a summary, or a log. It never runs a stage, because
  both light models missed a required behavior when they wrote code.

Start each delegate per **Delegating** in `AGENTS.md`. In T3 Code that is `delegate_task`,
with the provider, model, and effort option that `orchestrator_capabilities` lists for the row,
such as `claude-opus-5-5` for `opus`. A host without it reaches only its own provider. When no listed
row is one the host can start, the stage runs on the session's own model, and a line under
**Assumptions** says so.

## 5. Run the stages

Work step 5 of `series.md` as the coordinator, with these writes on top of its actions:

- **`start`.** Create the stage's sub-issue under its owner issue, labeled `agent` and the
  executor, with the start write and its resume pointer, and record its id in `tracker.json`.
  A `start` printed again for the same stage reuses the sub-issue `tracker.json` holds, or the
  one whose title names the program and stage id when the id was not saved.
  The first stage of an owner issue to start also posts that issue's started comment. The
  stage's brief carries the sub-issue. Its run puts it on its log's `Issue.` line and writes its
  start, its pull request, and its waits there, never on the owner issue.
- **After the pull request opens**, the stage run has ended, so the sub-issue is the
  coordinator's: the merge, the release, a fix-forward, a wait. A `fix` delegate writes nothing
  to the tracker, so each sub-issue has one writer at a time.
- **A question for the user about one stage**, such as a decision or a review. Run
  `series.mjs wait <reason> "<action>" --stage <id>`, unless `next` printed it as `ask` for
  that stage, which means the wait is recorded. Write the reason on the sub-issue, post the
  waits-on-you comment on the owner issue with the question and its options, and ask through
  the question routing in `AGENTS.md`. A wait of the whole program, such as a lost login, an
  `ask -` from `next`, follows **Waiting** in `series.md` and writes to no owner issue.
- **A secret only the user can give**, such as a token or an API key, blocks its stage alone.
  In T3 Code it goes through `request_secret`. Elsewhere the stage waits with `wait input
  "<the secret it needs>" --stage <id>`, and the reason goes on the sub-issue and in a
  waits-on-you comment.
- **A stage `next` records as done.** Write the release on its sub-issue. Once every stage of
  an owner issue is done, post the shipped comment, what the user now gets, and move the issue
  to done.

## 6. Report

Report per step 6 of `series.md`, with one line per owner issue, its link, and whether
production verified it.

## Dry run

When the user asks what `lead` would do, or for a dry run, run steps 1, 3, and 4 on the plan
as read, ask nothing, and write nothing to the tracker and start no stage. Write `program.json`,
`tracker.json`, and `tracker-writes.md` to a folder the user names, else to the session's
scratch directory, never under `.specs/`, where the hook and `series.mjs` would take it for a
live program. `tracker-writes.md` lists every write the run would make, in order, as if every
stage shipped without a wait. Each line holds the operation, the issue, the labels, and the text.
Done when `series.mjs report --program <folder>` lists every stage as incomplete. It changes
nothing, where `next` would record the program's first actions.
