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

Done when the series log is open and the plan is in the tracker and read back, or in the
program folder when the session has no tracker tool or no home in it.

Outside a **Dry run**, open the series log before anything else: the run log of `oneshot` step
1, with `Lane. series`, a `Lead.` line, **Requests**, and a **Lane** holding this skill's steps,
so the host's start and compaction hooks find an open run from the first minute. No stage is
built, by this session or a delegate, before `series.mjs next` printed its `start` or `build`.
The series log keeps its `Lead.` line when step 4 of `series.md` moves it.

- **The user asks you to run a tracker project, milestone, or issue.** That request approves
  the plan written there. Read the owner issues, their blocked-by relations, and the decisions
  document.
- **No approved plan yet**, such as a request with no tracker plan, or a plan the user asks
  you to write or change. Run `brainstorm` with the user first. Its phase 2 settles the
  decisions, and **Decide the split** in `series.md` sets where one pull request ends. Its exit
  is not a stop here: its offers and its closing line give way to the next sentence. Then
  write the plan into the tracker: a project, one milestone per outcome a user gets, one owner
  issue per outcome with blocked-by relations for the order, and the decisions as a document
  on the project. The owner layer carries no path, commit, or code.

With no tracker tool in the session, the plan stays in the program folder, and the rest runs
as an oneshot series with no tracker writes and no `tracker.json`. A tracker tool that works
but has no team or project for this repository is a question at the stop, with creating one
as the recommendation when the user's other repositories use that tracker, and the plan waits
in the program folder until it is answered.

## 2. The stop

Done when the user's answers are in this chat, quoted.

One stop, per step 3 of `series.md`, asked through the question routing in `AGENTS.md`. It
shows the stage map from step 3 below, one line per stage with the executor and model step 4
picks for it, and the release facts found, and it
asks approval of the plan with its link, unless the user's request already gave it, where the
plan lives when step 1 found a tracker with no home for this repository, and the release
authorization as its own question, unless this install's release setting is
`production`, the plan approval came from the user, and the user did not limit the run to a
pull request, which is that authorization per **The authorization** in `series.md`. A request
that stops at a pull request is `Outcome. pull request only`. When no question is left, post
the screen as a status note and go on in the same turn. Build nothing before the plan is approved.
Without the authorization, stage one builds to its pull request and the series waits, per **The
authorization** in `series.md`. A change the user asks for goes into the plan, and the stop is
asked again. An answer comes from the chat or the question tool, never from a tracker comment,
and goes into the series log's **Gate**. **Away** never answers this stop.

## 3. Write the program

Done when `series.mjs next --program <folder>` accepts the program and prints its first
actions.

Open the program folder per steps 3 and 4 of `series.md`, which moves the series log into it.
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
repository or outside the plan, goes into `program.json` like the others and waits with
`series.mjs wait input "<the work it waits for> has shipped" --stage <id>` once the program is
written. Its dependents wait with it, the rest go on, and `resume --stage <id>` releases it once
that work is in production.

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
  else the first `build` row the host can start, else the session's own model with a line
  under **Assumptions**. A stage whose main output is a screen a user sees runs on its
  executor's `lead` row, else on the `lead` row of an enabled executor the host can start,
  else on the session's own model.
- **`lead`** is the coordinator: this session, or the session that takes the series over.
- **`light`** only reads, such as a search, a summary, or a log. It never runs a stage, because
  both light models missed a required behavior when they wrote code.

When the user's words assign kinds of work to executors or to this session ("visual work
stays with you", "backend to another provider"), that assignment wins over the tiers for every
stage and delegate it covers. The **Assignments** table in executors.md is the user's standing
split: apply each row as if the user had said it here, unless their words in this session say
otherwise. Work assigned to another executor runs on its `build` row, or on its `lead` row
when the stage's main output is a screen and that row exists. Work assigned to
this session goes to a delegate on this session's provider at its `lead` row, else its `build`
row, else the session's own model. An assignment to
an executor that is not enabled, or that the host cannot start, is one line at the stop naming
the executor used instead.

Start each delegate per **Delegating** in `AGENTS.md`. Where the host starts other providers'
delegates and lists their ids, such as T3 Code's `delegate_task` and `orchestrator_capabilities`,
map the row's provider, model, and effort to the ids the host lists. A host without that
reaches only its own provider.

## 5. Run the stages

Work step 5 of `series.md` as the coordinator, with these writes on top of its actions:

- **`start`**, or a `build` for a stage with no sub-issue yet. Create the stage's sub-issue under its owner issue, titled `<program slug>/<stage
  id>: <stage title>`, labeled `agent` and the executor, with the start write and its resume
  pointer, and record its id in `tracker.json`. A `start` printed again for the same stage
  reuses the sub-issue `tracker.json` holds, or the one under that owner issue with that title
  when the id was not saved.
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
  the question routing in `AGENTS.md`. An `ask -` whose text names `stage <id>:` is that
  stage's wait, already recorded: write its comments if they are missing and answer it with
  `resume --stage <id>`. Any other `ask -`, such as a lost login, is a wait of the whole program,
  follows **Waiting** in `series.md`, and writes to no owner issue.
- **A secret only the user can give** blocks its stage alone. Ask it per **Things only the
  user can do are asked once** in `oneshot`. Where the stage waits on it, run `wait input "<the
  secret it needs>" --stage <id>`, and the reason goes on the sub-issue and in a waits-on-you
  comment.
- **A stage `next` records as done.** Write the release on its sub-issue. Once every stage of
  an owner issue is done, post the shipped comment, what the user now gets, and move the issue
  to done.

## Taking a series over

A session sent here for a program that is already running, by the hook or by the user, skips
steps 1 to 4, whose answers are in `program.json` and the series log's **Gate**. Read the
series log's `## Now` and `tracker.json`, then work step 5. A stage with no executor in
`tracker.json` takes one per step 4, **Assignments** included.

## 6. Report

Report per step 6 of `series.md`, with one line per owner issue, its link, and whether
production verified it.

## Dry run

When the user asks what `lead` would do, or for a dry run, run steps 1, 3, and 4 on the plan
as read, ask nothing, and write nothing to the tracker and start no stage. Write `program.json`,
`tracker.json`, and `tracker-writes.md` to a folder the user names, else to the session's
scratch directory, never under `.oner/`, where the hook and `series.mjs` would take it for a
live program. `tracker-writes.md` lists every write the run would make, in order, as if every
stage shipped without a wait. Each line holds the operation, the issue, the labels, and the text.
Done when `series.mjs report --program <folder>` lists every stage as incomplete. It changes
nothing, where `next` would record the program's first actions.
