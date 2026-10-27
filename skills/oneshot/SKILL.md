---
name: oneshot
description: >-
  Carries one task from idea to open pull request in one run. Stops once, early, to settle the
  decisions that are the user's, then builds, checks, reviews with several models from different
  vendors, fixes what the review proves, and opens the PR without stopping again. Work too
  large for one PR becomes a series of PRs, each merged, deployed, and verified in production
  once the user authorizes that release at the gate. The user starts it by name. Start it
  yourself only when the user hands over a whole feature or bug and asks for it carried through
  to a pull request. A question, a one-line edit, a review of shipped code, or work already
  under way in the chat goes the ordinary way.
argument-hint: "[feature idea, ticket, bug report, or question]"
---

# Oneshot

The task is whatever the user typed after the skill name, or the task under discussion.

This skill implements nothing itself. It picks a lane, writes that lane's steps into the run
log as a checklist, and runs the skills already in this set. What it adds is the contract below.

## The contract

**One stop.** The run pauses at the gate and nowhere else. The gate can take several rounds of
questions when many decisions are open, and it is still one stop. In the feature and plan lanes
the gate is `brainstorm`'s phase 2, and in a series it also approves the stage map and the
release, per [`lanes/series.md`](lanes/series.md). In the fix, perf, refactor, and review lanes
it posts one screen holding what the lane's gate step lists. With no open decision on it, say `gate: nothing to settle` and keep
going. Otherwise ask the open decisions with the question routing in `AGENTS.md`, recommended
option first.

**A turn ends only where the run waits.** A message with no tool call ends the turn, and the
run stands still until someone types, who may be asleep. After the gate, none of these ends a
turn: a summary that names the next step instead of taking it, an offer to go on unless the
user objects, a list of decisions none of which blocks the rest (take each and log it under
**Assumptions**), a report because a stage, a checkpoint, or a called skill just finished. A
status note goes in the same message as the next tool call. The turns that do end are the
gate's questions, a hard stop, a conflict with the spec or a gate decision that `implement` or
`spec` stops on, a login or credential only the user can supply, a wait on background work
this run started, and the final Report. A server or watcher started in the background never
ends, so stop it once the step that needed it is done. Before a turn that waits on the user,
set `Status. waiting` in the run log, and back to `running` when the answer arrives. While it
reads `running`, the host's lifecycle hook catches a turn that ends with steps still open in
the log's **Lane**, and names them.

**A called skill's ending is not the run's.** Its Report, its closing line, its offer, its
"then stop", and its "leave pushing to the user" are for when the user runs it alone. Here its
output goes where the lane step says, usually the run log, and the next step follows.

**Everything after the gate is decided here, and not silently.** Each decision taken during
the run goes into the run log's **Assumptions** as one line with its reason, and every one of
them is in the final report.

**A fact is not a question.** Before the gate asks anything, settle every open fact by running
something, as `brainstorm`'s phase 2 does, and log the result under **Assumptions**.

**Away.** When the user says they are stepping away ("going to bed", "run until done", "I will
read it in the morning"), the gate still posts its screen and does not wait: take the
recommended option of every question, log each under **Assumptions**, and go on. The four hard
stops and a login only the user can supply still stop, and a series' release is never authorized
this way.

**Four hard stops survive the gate.** Stop and ask, whatever else is running, when the choice
in front of you sets a database schema or a migration, fixes the shape of data that gets
stored, changes a contract something outside this repository already depends on, or drops or
overwrites data a user has. These are expensive to unwind after the fact, which is the whole
reason the rest are not.

**A skipped step stays visible.** A lane step you decide not to run stays in the log's
**Lane** as `skip: <reason>`, never dropped. The lane files exist to stop a run from reading a
lane, then writing a bespoke plan that loses half of it.

**A run can end without a pull request.** When the lane itself ends the work (the fix lane
cannot reproduce, the refactor or every perf change is reverted), skip the tail, set
`Status. stopped: <reason>`, and report without a link.

**The code's author is not its only reader.** Delegate and review the returned diff, or write it
yourself and let the review stage read it. Which one is your call. See **Delegating the work**.

## Delegating the work

A delegate starts on a clean context, and its diff reaches a reader who did not write it. It
costs a fresh read of the codebase. Whether to delegate is your call every time, and nothing
here forbids it on small work or forces it on large work. Say in one line which way you went.

Usually, tasks in one stage whose file lists do not intersect get one delegate each, run at
once. A task that runs alone is usually yours, because its delegate re-reads half the
repository to save no time and the review stage already gives the diff a second reader. A run
whose context is filling up is the exception.

**The task's file list is the isolation boundary**, under `implement`'s rule: sequential by
default, parallel only for tasks in one stage whose file lists do not intersect. A migration, a
generated file, a lockfile, or shared config is always its own sequential task.

**A lane's Split the work step** writes four answers in the run log, one line each,
`n/a: <reason>` where one does not apply: what runs first because the rest depends on it (a
migration, a shared type, a generated file); which tasks write disjoint files and can run at
once; what shared state two parallel writers would both touch, and how each gets its own copy
instead of a lock; the smallest safe split, and why one worker when one is best.

**The brief carries what the delegate needs and nothing else:**

- That it comes from an oneshot run, and the spec folder's absolute path, so it reads
  `spec.md` and `plan.md` itself.
- Its one task, quoted.
- The files it may write. Anything outside that list comes back to you unedited.
- The names and the data shape already settled, so it does not invent a parallel vocabulary.
- The decisions from the gate that bear on this task, and only those.
- The check that proves the task, written as a command it runs.

It does not get the conversation, the brainstorm transcript, earlier review findings, or the
reasoning behind a decision it only has to honor.

**The delegate returns a diff and the output of its check.** Nothing else is trusted. Read the
diff yourself and write your own summary, because passing its words through is how a bad diff
gets approved.

**Never chain a second instruction into a delegate that already ran.** A resumed agent drops
directives silently. Start a fresh one with the whole scope.

**On Claude Code the delegate is `oneshot-worker`** (`subagent_type: "oneshot-worker"`,
defined in `{{agents_dir}}/`). It carries the delegate contract, so the brief carries only the
items above. Read-only exploration goes to `Explore`. The tail's review goes to `oneshot-reviewer`,
and any other review to `general-purpose`, because Explore skips `AGENTS.md`. Both delegates
carry their own reasoning effort from `config.json`, whatever level the session runs at.
Anything that does not block the next step runs with `run_in_background: true`. Pass
`model: "sonnet"` for a mechanical task with a precise brief, and no `model` where the task
needs judgment. A delegate that runs alone edits the branch's own tree. Parallel writers follow
`implement`'s steps, with `install` from `.claude/worktree.json` as the install command, else
the lockfile's package manager.

**No subagents available changes how a step runs, not whether it runs.** Write the code
yourself, then review it in a separate pass whose only input is the diff, and say so. `external-review`
is unaffected: it starts separate processes.

## Reaching the other skills

Follow the question routing in `AGENTS.md` for every gate and hard stop. `external-review`
carries `disable-model-invocation: true`, so the host refuses a call from here. Run its script
instead:

```
{{skills_dir}}/external-review/ext-review.sh --intent "<one sentence on what the change is for>"
```

It prints one path per voice and nothing else. Read every file it names, in full. `--base <ref>`
scopes a round to the commits after `<ref>`. The remaining options, the exit codes, and what to
do when the host denies the run are in [external-review/SKILL.md](../external-review/SKILL.md).
An exit that means no voice ran is a `skip:`, not a stop. Exit `4`, a reviewer CLI that is not
logged in, is a login only the user can supply, and it stops an away run too.

Any other step the host refuses for that flag stays unrun. Do not reproduce the skill from
memory. Record it as `skip: reserved for the user, run /<name> yourself`, say it in the report,
and go on with the rest of the lane.

## Step 0: pick the lane

| The task | Lane |
| --- | --- |
| A read-only question: how something works, why it is this way, whether a claim holds | [`lanes/investigation.md`](lanes/investigation.md) |
| A defect that exists now and can be made to happen | [`lanes/fix.md`](lanes/fix.md) |
| New or changed behavior | [`lanes/feature.md`](lanes/feature.md) |
| A behavior-preserving change of shape | [`lanes/refactor.md`](lanes/refactor.md) |
| A measured slowness | [`lanes/perf.md`](lanes/perf.md) |
| A review to act on: a pull request's threads and checks, or findings pasted or handed over | [`lanes/review.md`](lanes/review.md) |
| A feature to think through and plan, with no code in this run | [`lanes/plan.md`](lanes/plan.md) |

Say which lane you picked in one line before doing anything else. A feature that needs several
pull requests becomes a series inside the feature lane, per its step 1.

When no lane fits, write one. Put its steps in the run log's **Lane** in full, since no file
holds them, in the shape of the others: ground, gate, build, then
[`lanes/tail.md`](lanes/tail.md). Say in the report that the lane was written for this run. Two
tasks still go elsewhere: a review of code that already shipped is `prod-review`, and a machine
that needs cleaning is `dev-tidy`. Name the skill in one sentence and stop.

## Step 1: open the run

The investigation lane writes nothing, so it skips this step.

**Resume before you open.** When this branch already carries `.specs/*/oneshot.md` with
`Status. running` or `Status. waiting`, that run is the task: read the log, take the first open
line in its **Lane**, and re-read that step in the lane file the `Lane.` line names. Never open
a second folder for the same branch. When the hook names an open series in this repository and
the task is that series, read the `## Now` section of the series log in its program folder,
then follow [`lanes/series.md`](lanes/series.md) from step 5, whichever agent ran it before.

**Never commit or push to the default branch.** When HEAD is the default branch, get off it
before anything else. Where the repository has `.claude/worktree.json`, run
`{{skills_dir}}/worktree/wt.sh new <slug>` and continue the whole run inside the directory it
prints, because it adds a worktree beside you and leaves this HEAD where it was. Where the file
is missing, `git switch -c <slug>` here.
A worktree the app already created counts, adopt it per `AGENTS.md`.

Add the `.specs/` line to `.gitignore` per `spec`'s Depth section before writing the run log,
because `implement` refuses to start on a tree where the run log sits untracked.

Then take the next free `NNN` the way `spec` does, counting `.specs/` and `specs/` together, and
create `.specs/NNN-slug/oneshot.md`, always in the ignored `.specs/`. Every later step reuses
that exact folder, `spec` included. A second number means two folders and a plan nothing
reads.

The file holds the run:

```markdown
# <slug>

Lane. fix | feature | refactor | perf | review | plan | series
Branch. <branch>
Base. <the sha HEAD was at when the run opened>
Issue. <the tracker issue's id and link, and its status before the run, or none>
Status. running | waiting | done | stopped: <reason> | series

## Lane
- [ ] <each step's bold title, the lane's then the tail's, in order>

## Gate
<each decision the user settled, one line with its rationale>

## Assumptions
<each decision taken during the run, one line with why and its evidence: a sha, a file:line, a
screenshot path, the output of the run that settled it>

## Checks
<what you ran and what it printed, most recent run>

## Review
<per round: findings from each reviewer, fixed, refuted, deferred>
```

When **Issue trackers** in `AGENTS.md` puts an issue in scope, put it on the `Issue.` line.
Move it to started through the `issue-tracker` skill once the gate is settled, not before.

This file is the state. It makes an unattended run auditable and lets another session pick it
up where it stopped. While `Status.` reads `running` or `waiting`, the hook in `settings.json`
reminds every turn that the run is open, and again after a resume or a compaction.

## Step 2: copy the lane in

Open the lane file and write the bold title of every step into the log's **Lane** as a `- [ ]`
line, before any task-specific plan and before reasoning about the task. A lane that writes code
ends by naming [`lanes/tail.md`](lanes/tail.md): its steps follow the lane's own, in the same
list. Mirror the list in the host's todo tool when it has one. Then work the list: re-read each
step's text in its file before you start it, because a compaction keeps the log and drops what
you read, and tick its line when it is done. A step you do not run is ticked as
`- [x] <title> skip: <reason>`.

## Report

Set `Status. done` in the run log first, or leave `stopped: <reason>` in place for a run that
ends without a pull request, so the hook stops reminding.

The log already holds the gate, the checks, every review round, and the evidence. The report
is not a second copy of it. Name the log's path once, and write only what the user acts on:

- **The outcome and the link.** One or two sentences on what now works or what is fixed, then
  the PR link.
- **The proof.** The one check or verification the outcome rests on, as the output it printed.
  Not the list of everything the run executed.
- **Assumptions**, one line each, no evidence attached, the ones the user might overturn
  first. They approved the gate and nothing since, so this is the part that is new to them.
- **Skipped steps** from **Lane**, **Attention** lines from the review, `LATER` findings,
  **Guard** lines, and each workaround the change kept with the cause it could not reach, one
  line each. None of them is one line saying so.
- **The issue**, when the log names one: the status it is in now, or the tracker update that
  failed.
- **What the run could not reach.** One line, or nothing.

Length follows the size of the change, per **Talking to me** in `AGENTS.md`. A one-file fix
reports in a short paragraph however long the run took. No preamble, no recap of the diff, no
walk through the steps in order.

A series reports per step 6 of [`lanes/series.md`](lanes/series.md).

A review lane adds the verdict table in the review's own numbers, with a ready-to-paste reply
for every `WRONG` and `LATER`, because those are what the user sends back.

## Portability

On a host without browser or preview tools, verify through whatever the project's own run path
offers. A step that cannot run is a `skip:` with its reason, not a silent pass.
