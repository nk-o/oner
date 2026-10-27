# /oneshot

```
/oneshot <the feature, the ticket, or the bug>
```

`oneshot` carries one task from idea to an open pull request. It stops once, at the gate right
after the analysis, to settle the decisions that are yours. Everything after the gate runs without
asking: the spec, the implementation, the checks, verification against the running product, review
by several models from different vendors, the fixes the review proves, and `gh pr create`. It does
not merge, unless the work becomes a series and you authorize its release.

You start it by name. An agent starts it on its own only when you hand over a whole task and ask
for it carried through to a pull request.

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
and appear in the final report. A question the run can answer by running something (behavior on
an input, timing, what a library returns) is answered that way, not asked. Four kinds of decision
stop the run wherever they come up: a database schema or migration, the shape of stored data, a
contract outside the repository, and dropping or overwriting data a user has. When you say you
are stepping away, the gate takes its own recommended answers and keeps going.

## The run log

The run lives in `.specs/NNN-slug/oneshot.md`, so a stopped session can be picked up. Its **Lane**
checklist holds every step of the lane and of the shared tail, ticked as the run goes.

While its `Status.` line reads `running` or `waiting`, a hook reminds the agent each turn that the
run is open, and again after a resume or a compaction, so "continue" is enough to pick it up. When
a turn ends while `Status.` reads `running` and steps are still open, the hook names them and asks
for the next one, once per state of the work. Models sometimes end a long turn on a progress
report, and this hook is what keeps an unattended run going. The run sets `waiting` before it
stops for your answer, and `stopped: <reason>` when the lane ends without a pull request. The hook
works in Claude Code and Codex.

## A series of pull requests, through production

There is no flag for this. During its analysis, `oneshot` decides whether the work fits one pull
request. It becomes a series when one change has to be in production before the next can land
(an expand-and-contract migration, a backfill before a constraint), or when the work is several
independently shippable pieces too large to review as one diff.

A series still stops once, at the gate. That stop shows the decisions, the stage map, and the
release process found in the repository: the merge method, the checks GitHub must report, the
command that prints the commit production runs, the command that proves migrations applied, and
the read-only production checks. It then asks for release authorization as a separate question.
"Build stage one only" turns the run back into an ordinary one. Stepping away never answers this
question.

The authorization covers this series and nothing else: merging each stage's pull request with
`gh pr merge --match-head-commit`, waiting for the repository's own pipeline to deploy and
migrate, the approved production checks, fix-forward pull requests within the spec, and removing
finished worktrees. It does not cover work outside the spec, manual migrations or other writes to
production, a new external reviewer, or dropping data the spec does not drop.

The series lives in the primary checkout's `.specs/NNN-slug/`: the approved `spec.md` and
`plan.md`, `program.json`, and each finished stage's run folder under `stages/`. Branch switches
and removed worktrees do not touch it. `skills/oneshot/series.mjs` is the only writer of
`program.json`. `series.mjs next` reads GitHub, git, and production, records a stage's step only
on evidence it saw, and prints what to do next. It never merges or deploys by itself, so running
it again after a crash or a resume repeats nothing.

Each stage runs as an ordinary `oneshot` run in its own worktree, up to its open pull request.
Independent stages build in parallel. Merges, deploys, and production checks go one stage at a
time. A stage is done only when all of these hold:

- every check on the pull request's current head passed, and the head that merged is that head;
- the merge commit is on the default branch;
- production runs that commit or a descendant of it;
- the stage's migrations and production checks passed against it.

A missing or pending check means the stage is unfinished, and a required check that only skipped
stops the series with a question. A deploy that still runs an older commit is unfinished, and so
is a check that cannot decide. A failed production check gets a fix-forward pull request, at most
twice per stage. The series sets itself to waiting and asks you when a deploy never picks up the
merge, a migration fails, a check fails a third time, the spec leaves a decision open, a review
needs a person, or a login expires.

After your answer, `series.mjs resume` and `next` read GitHub and production again before
repeating anything. `resume --recheck <stage>` reads a stage you repaired by hand from production
again. The hook keeps the coordinating session going while the series runs, once per change of
state, and stays silent while it waits. The series is finished when `series.mjs report` exits 0,
which needs every stage done with its evidence.
