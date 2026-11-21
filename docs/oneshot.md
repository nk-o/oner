# /oneshot

```
/oneshot <the feature, the ticket, or the bug>
```

`oneshot` carries one task from idea to an open pull request. It stops once, at the gate right
after the analysis, to settle the decisions that are yours. Everything after the gate runs without
asking: the spec, the implementation, the checks, verification against the running product, review
by several models from different vendors, the fixes the review proves, `gh pr create`, and
`pr-wait` on the pull request until its checks and review bots are through. It does not merge,
unless the work becomes a series and you authorize its release, or the release setting below is
`production`.

You do not have to name it. Write a bug, a change, or a feature in plain words, and the route
table in `AGENTS.md` **Whole tasks** starts `oneshot`, naming the route in the first line of the
reply. A question about something that fails starts it too, unless it is about how
something looks, feels, or moves, which starts `prototype` or `refine`. A question about how something
works, a one-line edit, and work already under way in the chat go the ordinary way,
and a skill you name wins over the table.

## Release setting

`oneshot.release` in `config.json` sets where a run ends:

- `pr`, the default. The run ends at a pull request that is ready to merge.
- `production`. A fix, feature, refactor, or performance run whose gate had nothing to ask,
  got your answers, or follows a plan you approved goes on to a **Release** step after the
  watch. It merges the pull request once it is ready,
  waits for the repository's own pipeline to deploy, and runs the read-only production checks it
  finds. When nothing tells which commit production runs, it merges and reports production as
  not verified, after watching the deploy. A gate that took its own recommendations while you
  were away, or an answer that chose to stop at the pull request, ends the run at the pull
  request, unless you said to merge it. On either setting, a fix, feature, refactor, or
  performance run you told to merge it yourself goes on to the same **Release** step, and so does
  one you tell after its report. A review run on an existing pull request never merges it. The hard stops still stop, and a series still
  asks for its own release authorization, unless the release setting is `production` and you
  answered the gate or approved the plan it runs.

## Lanes

A run takes one of seven lanes:

- **Investigation.** A read-only answer, with no pull request.
- **Fix**, **feature**, and **refactor.** Each records what must not change before it edits, and
  the shared tail checks that again in the running product.
- **Performance.** Measured before and after.
- **Review to act on.** A pull request's own threads and checks, or findings pasted in.
- **Plan.** Thinks a feature through and ends at a pull request that holds only the spec.

A task that fits none of them gets a lane written for it in the run log.

## Decisions during the run

Decisions taken after the gate go under **Assumptions** in the run log, each with its evidence,
and the ones you might overturn appear in the final report. A question the run can answer by running something (behavior on
an input, timing, what a library returns) is answered that way, not asked. Three kinds of decision
stop the run wherever they come up: a contract outside the repository, dropping or overwriting
data a user has, and a migration or stored data shape that does more than add. One that only
adds is decided, flagged with `Attention.`, and checked right before the merge: it applies to
existing rows, and the code production runs works on it. A clash with another open pull
request's migration is noted, and whichever merges second meets it in its own checks. When you say you
are stepping away, the gate takes its own recommended answers and keeps going.

## The run log

The run lives in `.oner/NNN-slug/oneshot.md`, so a stopped session can be picked up. Its **Lane**
checklist holds every step of the lane and of the shared tail, ticked as the run goes.

While its `Status.` line reads `running` or `waiting`, a hook reminds the agent each turn that the
run is open, and again after a resume or a compaction, so "continue" is enough to pick it up. When
a turn ends while `Status.` reads `running` and steps are still open, the hook names them and asks
for the next one, once per state of the work. Models sometimes end a long turn on a progress
report, and this hook is what keeps an unattended run going. The run sets `waiting` before it
stops for your answer, and `stopped: <reason>` when the lane ends without a pull request. The hook
works in Claude Code and Codex.

In Claude Code the same hook answers permission prompts while `Status.` reads `running`, in the
session that started the run and in its subagents. It approves edits inside the repository's
worktrees, reads, and shell commands. It leaves to you every other tool (MCP servers, web
fetches), and commands that run as another user, open a remote shell, deploy, change
infrastructure, publish a package or release, start a workflow, merge a pull request outside a
series you authorized, force-push without a lease, push to the default branch, delete a remote
branch, or delete recursively outside the repository. `skills/oneshot/permission.mjs`
holds that list.

## A series of pull requests, through production

There is no flag for this. During its analysis, `oneshot` decides whether the work fits one pull
request. It becomes a series when one change has to be in production before the next can land
(an expand-and-contract migration, a backfill before a constraint), when a later part is designed
on what an earlier one shows in production, when a part's failure must not roll back the rest, or
when a part waits on a date or a person. Size alone never splits it.

A series still stops once, at the gate. That stop shows the decisions, the stage map, and the
release process found in the repository: the merge method, the checks GitHub must report, the
command that prints the commit production runs, the command that proves migrations applied, and
the read-only production checks. It then asks for release authorization as a separate question, unless the release setting is
`production` and you answered the gate or approved the plan it runs.
"Build stage one only" turns the run back into an ordinary one. Stepping away never answers this
question.

The authorization covers this series and nothing else: merging each stage's pull request with
`gh pr merge --match-head-commit`, waiting for the repository's own pipeline to deploy and
migrate, the approved production checks, fix-forward pull requests within the spec, and removing
finished worktrees. It does not cover work outside the spec, manual migrations or other writes to
production, a new external reviewer, or dropping data the spec does not drop.

The series lives in the primary checkout's `.oner/NNN-slug/`: the approved `spec.md` and
`plan.md`, `program.json`, and each finished stage's run folder under `stages/`. Branch switches
and removed worktrees do not touch it. `skills/oneshot/series.mjs` is the only writer of
`program.json`. `series.mjs next` reads GitHub, git, and production, records a stage's step only
on evidence it saw, and prints what to do next. It never merges or deploys by itself, so running
it again after a crash or a resume repeats nothing.

Each stage runs as an ordinary `oneshot` run in its own worktree, up to its open pull request.
Independent stages build in parallel, up to `orchestration.parallel` in the config at once (4 by
default, or the program's own `parallel`), and a stage marked `serial` never builds beside another
serial one. Merges, deploys, and production checks go one stage at a time. A stage is done only when all of these hold:

- every check on the pull request's current head passed, and the head that merged is that head;
- the merge commit is on the default branch;
- production runs that commit or a descendant of it;
- the stage's migrations and production checks passed against it.

A missing or pending check means the stage is unfinished, and a required check that only skipped
stops the series with a question. A deploy that still runs an older commit is unfinished, and so
is a check that cannot decide. A failed production check gets a fix-forward pull request, at most
twice per stage. A stage waits and asks you when a deploy never picks up the merge, a migration
fails, a check fails a third time, the spec leaves a decision open, or a review needs a person.
The stages that do not depend on it go on, and the series reads waiting only once none of them
can act. An expired login holds the whole series.

After your answer, `series.mjs resume`, with `--stage <id>` when several stages wait, and `next` read GitHub and production again before
repeating anything. `resume --recheck <stage>` reads a stage you repaired by hand from production
again. The hook keeps the coordinating session going while the series runs, once per change of
state, and stays silent while it waits. The series is finished when `series.mjs report` exits 0,
which needs every stage done with its evidence.

## /lead

`lead` runs an initiative of several pull requests from the tracker, and the route table starts
it for work that needs several pull requests or names a tracker project. Given a project,
milestone, or issue to run, it takes the plan written there as approved. Otherwise it
brainstorms with you and writes the plan into the tracker: a project, a milestone per outcome a
user gets, one owner issue per outcome with blocked-by relations for the order, and the
decisions as a document. It builds nothing until you approve the plan in the chat. With the release setting at
`production` that approval also authorizes the release, unless you ask it to stop at a pull
request; otherwise it asks for the release authorization at the same stop.

It then writes `program.json` with one stage per pull request. A stage comes after the stages
of the issues that block its own, and a stage that touches a schema, a migration, a lockfile,
or deploy config is `serial`. `series.mjs` drives it as described above, with `lead` as the
coordinator.

The tracker gets two layers. Each stage has a sub-issue under its owner issue, labeled `agent`
and the executor's name, which holds every technical update with a pointer to resume from. The
owner issue gets three comments, started, waits on you, and shipped, in the language your
rules set for tracker text, without commits, paths, or code. An answer always comes from the
chat or the question tool, never from a tracker comment, because every comment is written
under your account. A secret only you can give holds its own stage, and the others go on.

### Executors

`executors.<provider>` in `config.json` (`claude`, `codex`, `grok`, `cursor`) sets which
providers build the stages, each with `enabled` and a model per tier: `lead` coordinates,
`build` writes a stage's code, and `light` only reads. The build writes the enabled ones into
the skill's `executors.md`. The defaults come from a measurement on three solved tasks:

| Provider | lead | build | light | On by default |
| --- | --- | --- | --- | --- |
| claude | opus, high | opus, medium | haiku, high | yes |
| codex | gpt-6.2-sol, high | gpt-6.2-sol, medium | gpt-6-luna, high | yes |
| grok | grok-4.7, high | grok-4.7, high | grok-4.7, high | no |
| cursor | none | none | none | no |

Sonnet with high effort is a cheaper `build` model that was correct on all three tasks, and
slower. Haiku and Luna missed a required behavior when they wrote code, so `light` never runs a
stage. A delegate reaches another provider only where the host can start one, such as T3
Code's `delegate_task`.

## /oneshot-auto

```
/oneshot-auto <the feature, the ticket, or the bug>
```

The same run for when you are not watching, carried into production. Starting it by name is
your authorization to merge and deploy this task, and it differs from `oneshot` in two ways:

- The gate posts its screen and takes its own recommended answers.
- After the pull request is ready, the **Release** step runs whatever the release setting says.
  It releases the run as a one-stage series: merge, wait for the repository's own pipeline to
  deploy, then the production checks. When nothing tells which commit production runs, it merges,
  watches the deploy, and reports production as not verified.

It still stops for a login only you can supply, a review only a person can give, and the
failures a series asks about.
