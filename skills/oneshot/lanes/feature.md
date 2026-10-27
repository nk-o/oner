### Feature lane

You own the design and the verdict on every diff. Whether the typing is yours or a delegate's
is your call, per **Delegating the work**.

1. **Ground and gate.** Run `brainstorm` on the task. Its phase 1 is the analysis, its phase 2
   is the gate. Copy the decisions the user answered into the run log's **Gate** section, the
   rest into **Assumptions**. When phase 1 shows the work needs more than one pull request, per
   **Decide the split** in [`series.md`](series.md), the run becomes a series: go on in that
   lane from its step 2, whose gate takes the place of phase 2 here. Otherwise, if it exits
   *Staged* rather than *Settled*, this run covers stage one only: record the map in the run
   log, and say at the end that later stages need their own run. When the task names a folder
   under `specs/` that a plan lane wrote, its **Decisions** are the gate: copy them into **Gate**, tick this step and
   the next as `skip: approved spec <path>`, and build that folder up to the first stage that
   opens with decisions brainstorm deferred; the report names that stage as the next run. When
   the first unbuilt stage is one of those, run this step as written on that stage instead,
   because its brainstorm is the gate. An edit step 3 makes to that tracked plan.md is committed
   before the build.
2. **Spec.** Run `spec` in unattended mode, into the folder step 1 of the skill created. It
   does not take a number of its own. Its two checkpoints become status notes that wait for
   nothing, because the decisions behind them were approved at step 1 of this lane.
3. **Split the work.** Answer the four questions under **Delegating the work** in the run log.
   When an answer changes a task's file list or a stage boundary, fix plan.md, because its file
   lists are what `implement` parallelizes on.
4. **Pin what must not change.** `brainstorm` listed the existing callers whose behavior this
   touches. Take each one and capture what it does today as a command you can re-run, from the
   code as it shipped, before the first edit. Paste it into the run log's **Checks**. Where the
   feature reaches nothing that already exists, write `n/a:` and why. This is the pin the
   refactor lane opens with, and the Verify step in [`tail.md`](tail.md) re-runs it. A pin that
   ships as a test gets its own commit before the build, because `implement` starts only on a
   clean tree. A scratch pin lives in the run folder, which git ignores. In the same step, pick
   the worst cases for each surface the feature adds or changes, per steps 1 and 2 of
   `break-ui` for a screen or `break-api` for an endpoint, job, or command, and list them in **Checks**. A surface that does not exist yet takes its
   boundary from the spec and the data model it adds. Picked now, the cases come from what the
   product admits rather than from what the new code happens to handle. When the feature
   changes a screen a user already sees, save that screen now into the run folder's `media/`,
   at the viewport and with the data the Verify step will use, as the pull request's Before.
5. **Build.** Run `implement` in unattended mode on that folder. Silence in the plan is
   decided here and logged under **Assumptions** in the run log; a conflict with the spec and
   the four hard stops still stop. Delegate or not per **Delegating the work**, and review
   every diff you did not write before its checkbox is ticked. When the plan adds or reshapes
   UI a user sees, load `frontend-design` before the first UI edit, and tell a delegate that
   writes UI to load it too. The run log is what the report
   reads from.

Then [`tail.md`](tail.md).
