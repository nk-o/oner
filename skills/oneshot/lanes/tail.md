### Shared tail

Every lane that writes code ends here, after its own steps. The scope of everything below is
what this run wrote: the branch's diff for a feature or a fix, and the commits since **Base** in
the run log for a review.

- **Clean the diff.** Read the whole diff once, the delegates' parts included, against
  [`deslop`'s criteria](../../deslop/criteria.md), scoped to the diff. When `deslop` is turned
  off and that file is missing, read **Editing**, **Shaping code**, and **Verifying** in
  `AGENTS.md` instead, and leave what they do not settle as it is.
  Remove what the criteria name in every kind, with the proof each kind asks for, plus options
  nothing uses and edits outside the task. An item they mark `DECIDE` stays as it is and goes
  into the report. Give the comments to a subagent when you wrote them. A relaxed gate, a behavior
  change, and a workaround whose cause the change could reach are findings for the steps
  below, not cleanups. A second change a user would notice is a follow-up for the report, per
  **Commits and pull requests** in `AGENTS.md`.
- **Green.** Run `green-repo`. Paste what it printed into the run log's **Checks**. A
  pre-existing failure is reported, not fixed inside this run. It counts as pre-existing only
  when it also fails on **Base**; log how you showed that. Then commit what Clean the diff,
  Green, and the lane's own steps left uncommitted, so the review, the first shortstat, and the
  **Round 2 base** below all start from a commit.
- **Verify against the running product.** What the gate promised, on the surface a user would
  touch, not on a proxy: the acceptance criteria for a feature, the reproduction from step 1
  for a fix, the measurement for a perf change, the failing input each `FIX` named for a
  review. When the repository has a project skill named `verify-<app>` under
  `.claude/skills/`, drive the surface through its CLI with `--out` set to the run folder's
  `media/`, and add a command it lacks to the CLI rather than writing a one-off script. Without
  one, save screenshots and recordings as files in `media/` through the project's own
  end-to-end harness, or a Playwright script (`page.screenshot({ path })` for a still,
  `recordVideo` on the browser context for a recording). Failing-then-passing output is pasted
  verbatim where there is one. The screenshots that match a Before, at the same viewport and
  with the same data, are the pull request's After. A feature with nothing to compare against
  ships its screenshot of what is new. Inconclusive is not a pass, and neither is the suite
  going green. A unit test shows branch behavior, not the absence of the bug.

  When the change adds or alters server code that a build bundles, a background job or
  workflow, an RPC, or a migration, also run that path once from the production build against
  the local stack, on top of the `verify-<app>` checks, which run on the dev server. Seed it
  with the most data the project's `verify-<app>` **Seed** section can put in front of it, log
  the count, and revert the seed after. A build that exits 0 says nothing about what it does
  when it runs. When the change adds
  or alters anything with states, timers, retries, or two writers to one record, run
  `model-check` on it with the properties the lane picked, since a state a user can enter and
  never leave, or a second click while a timer runs, passes every unit test.

  **Migration checks.** When the change carries a migration or adds to a stored data shape,
  run these in a scratch worktree (`git worktree add`, removed after), so the branch's own
  checkout stays as it is, and paste each result into **Checks** with the head it ran on:
  1. It applies cleanly. Build a scratch database by replaying, in version order through the
     project's own migration tool, every migration on the default branch, then this change's.
     Seed it per the project's `verify-<app>` **Seed** section where it has one.
  2. The code production runs works on that database. Find that commit the way **The release**
     in `series.md` does; when nothing prints it, take the default branch's head and log
     `Attention. Production commit unknown, checked the default branch`. Run its tests and its
     writes to each table or record the change touches, inserts included, against the
     database from check 1. A record it reads and writes back keeps the new field. A stored
     shape with no migration file gets this check alone.
  3. No open pull request clashes with it. List them with `gh pr list --state open --limit
     1000`, and read each one's migration files with `gh api repos/<owner>/<repo>/pulls/<number>/files
     --paginate`, this one left out. One that takes the same version number, or renames, drops,
     or alters a table or field this change touches, is logged as `Attention. Clashes with
     #<number>`, not a stop: whichever merges second meets it in its own checks at merge time.

  A migration of this change that does not apply, or a version number the default branch
  already took or passed, is renumbered or fixed and checked again. Old code that breaks on it, a default-branch
  change that cannot be reconciled with it, and a check that cannot run are hard stops. The
  checks hold for one head: run them again on the exact head right before it merges, wherever
  the merge happens (**Release**, a series `merge` action, or `pr-wait`'s merge), whenever
  **Checks** names another head or the default branch moved since.



  Then, where the lane took a pin, re-run it, and run `check` on every feature
  `list --affected <Base>` names, or `check --all` when it prints `unmapped` files. When the
  change adds, moves, or removes something a user reaches, update `features.json` in the same
  diff first and run `map`. Name which features you
  ran. New behavior working says nothing about old behavior still working, and the regression
  lands in the caller the change had no reason to touch. Where the scenario is yours to pick, pick it before the edit and take the hardest one
  the surface admits rather than the one that shows the change working. A pin that moved is a
  finding for the steps below, and the run does not ship until it is back or the move is
  recorded under **Assumptions** as intended.

  Then run `break-ui` on each screen and `break-api` on each endpoint, job, or command the
  change reaches that a user or a caller touches, with the cases the lane picked before the
  edit, or with cases taken from the boundary in **Base** when the lane picked none. Size it to
  the change. A one-line fix gets the one or two cases beside its reproduction. When the change
  is UI a user sees, run the **Look at what you built** round from `frontend-design` on the
  same screenshots. Here all of them only report. Every row that did not hold and every defect
  the round shows is a finding for Resolve, not an edit made in this step. Paste both results
  into the run log's **Checks**.
- **Cross the boundary if the change does.** When the change reaches a wire format, a stored
  column another service reads, a pinned library's internals, or a file another language
  parses, run `blast-radius` on that path and paste its result into the run log's **Checks**.
  Grep stops at the boundary and the trace becomes a guess without it.
- **Review, two voices.** Each works from the diff alone, and neither reads the other's output,
  because agreement between reviewers who saw each other means nothing.
  1. `external-review`, by its script per **Reaching the other skills**, started in the
     background because its reviewers walk the repository themselves and take minutes. On a
     review lane pass `--base` with **Base**. The script already leaves out the vendor this
     session is. A message naming a CLI to install, or saying the config turns every voice
     off, goes into the report rather than being swallowed. In T3 Code, where
     `t3_background_wait` exists, call it with the script's task ID before a turn ends on it.
  2. `prod-review` on this session's model, in an `oneshot-reviewer` subagent, where the host
     has subagents, started once the script is running and run in the foreground per
     **Delegating** in `AGENTS.md`. The turn holds until it returns, so no fix starts under it,
     and then waits on the script for the rest. Its brief carries the run log's
     **Assumptions**, and the `blast-radius` result when the step above ran, so its step 6
     does not run it a second time. Where the host has no subagents, `prod-review` runs
     inline, returns an **Attention** line for each assumption it would have decided
     differently or whose evidence is thin, and runs first,
     ahead of `external-review`, because a reviewer that has already read the other cannot
     agree with it independently.

  Size the review to the change. A two-line fix gets a short, confident review, not a fan-out.
  Merge every voice, `prod-review` included, into one numbered sequence before acting, per
  **Reading the result** in `external-review`.

  Both voices are in before Resolve starts. One that lands after the fixes read code the other
  has already changed, so its list arrives carrying findings that are gone and its agreement
  with the first is no longer independent. Wait for it. When it arrives late anyway, scope it
  with `--base` on the fix commits and count it as round two.

  The wait ends when the script exits, because the script stops each external voice at its
  deadline. A voice listed as `timeout` is an incomplete review, never a clean one: its
  partial file joins the merged list like any other, the run log's **Review** names the voice
  as timed out, and the run goes on with the voices that finished. It is not run again in this
  round.
- **Resolve.** Run `resolve-review` on the merged list. Its `DECIDE` verdict is not available
  here: the spec, the plan, or the gate pins the behavior, or the decision is taken and logged
  under **Assumptions**, or it is one of the hard stops and the run pauses. Its own
  `prod-review` of the fixes runs only for a fix past a few lines when round two below will
  skip. Re-run
  `green-repo` after the fixes, then commit them.

  Put `git diff <Base>...HEAD --shortstat` into the run log's **Review** before the fixes and
  again after their commit, write `Round 2 base. <the sha HEAD was at before the fixes>` beside
  it, and name the finding number each added block closes. The review is there to
  catch what the change broke, not to grow it, so a total that went up is reported with the
  findings that paid for it. Hardening against a case the boundary does not admit is what makes
  it go up.
- **Round two.** When `git diff <Round 2 base>..HEAD --shortstat` counts more than 20 changed
  lines, insertions and deletions together, or the fixes touch access control, stored data, or
  concurrency, review the fix commits alone and resolve again, scoped with `--base` set to the
  logged **Round 2 base**. Smaller fixes rest on the checks Resolve re-ran, and the run log says
  `round two: skip, <that shortstat>`. Stop after round two, with two
  exceptions, each worth one more round on the newest fixes and no more. Round two's own fixes
  introduced a regression, or a `FIX` in security, access control, data loss, or concurrency is
  still open with an input that shows it. Record each round in the run log's **Review**.
- **Ship.** Run `pr`, push the branch, and open the PR with `gh pr create`, naming
  each screenshot and recording the body shows with `--attach`, as `pr` says. When
  the branch already has a pull request, push to it and leave its description alone unless the
  change made it wrong. In T3 Code, the call after `gh pr create` or the push is
  `link_pull_request` with the pull request's full URL. When the run log names an issue, update
  it for the open pull request per the `issue-tracker` skill. Do not merge, and do not run
  `wt finish`.
- **Watch.** Run `pr-wait` on the pull request until it is ready. Each fix it pushes runs
  `green-repo` first, and a `DECIDE` from a comment follows the **Resolve** rule above. Before
  a turn that ends to wait for the Claude app's Auto-fix events or T3 Code's
  `watch_pull_request` wakes, set `Status. waiting` in the run log, and set it back to
  `running` when an event or a wake arrives. In a series stage, skip this step:
  the series takes the PR from here, per [`series.md`](series.md).
- **Release.** This install's release setting is `{{oneshot_release}}`. The step runs in an
  `oneshot-auto` run whatever the conditions below say. In any other run it runs only when all
  of these hold, read from the run log: the setting is `production`; the lane is fix, feature,
  refactor, or perf, so the pull request is this run's own; and the **Gate** `Outcome.` line
  reads `nothing to settle`, `answered`, or `approved <path>`, in a feature as in a fix. Outside
  `oneshot-auto`, `away` and `pull request only` never release. Otherwise tick it as
  `skip: <the condition that failed>`. A series stage ticks it `skip:`, because the series
  releases every stage itself, and so does the plan lane.

  When **Watch** reports the pull request ready:

  1. Find the release facts per **The release** in step 3 of [`series.md`](series.md). They are
     found, never asked. Run each command once against production and paste what it printed
     into **Checks**.
  2. When a command prints the commit production runs, release as a one-stage series. Take the
     next free `NNN` in the primary checkout's `.specs/` (the first entry of `git worktree
     list`), and write there a `program.json` per step 4 of `series.md`. Its `authorization` is
     the `Auto.` line in an `oneshot-auto` run, and otherwise `oneshot.release: production`,
     the user's standing consent. `release` holds the facts, and the one stage has this run's
     branch as its `branch` and `migrations` set when the change carries one. Add a series log
     `oneshot.md` beside it with a `## Now` section, and write the folder's path into this
     run's log as `Program. <path>`. Pass `--program <path>` to every `series.mjs` call, because
     another series may be open in the same checkout. This run's log is the stage run, which
     `series.mjs` finds by its `Branch.` line. Then follow `series.md` from step 5. Leave the
     `cleanup` action for the worktree this session runs in. Before any turn that waits, set
     this log's `Status. waiting` as well as running `series.mjs wait`.
  3. When nothing tells which commit production runs, merge per **Merge** in `pr-wait` with the
     repository's merge method, check the result, and run only the **Deploy** paragraph of
     **After a merge** in `pr-wait`, because its production check cannot tell this deploy from
     the last one and its clean up would delete this run log. Log `Attention. Production not
     verified: <why>` under **Assumptions**, with the deploy's result beside it.

  Tick **Release** once `series.mjs report --program <path>` exits 0, or once step 3's deploy
  watch exits 0. A deploy still pending leaves **Release** open, and a failed one goes to
  **A broken release** in `pr-wait`.
  The hard stops still stop here.
- **Report** per the skill's Report section.
