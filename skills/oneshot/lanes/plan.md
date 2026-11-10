### Plan lane

The run thinks the feature through and writes it down. No code is written, and the pull request
it opens carries the spec alone. The build is a later run: `implement` on the folder, or
`oneshot` pointed at it.

1. **Ground and gate.** Run `brainstorm` on the task. Its phase 1 is the analysis, its phase 2
   is the gate. Copy the decisions the user answered into the run log's **Gate**, the rest into
   **Assumptions**. A *Staged* exit is expected here and is not a limit on the run: record the map in the run log, and carry every stage into the spec below.
2. **Spec.** Run `spec` in unattended mode at full depth, under `specs/` rather than `.specs/`,
   with the number and slug the run log took. A plan nobody builds in this run exists for
   later by definition, which is the case spec's own Location rule keeps in the repository.
   plan.md carries every stage in dependency order. A stage whose decisions brainstorm deferred
   opens with one task that names them and the stage that unblocks them, so `/brainstorm` on
   that stage is the first thing its implementer runs. Both checkpoints are status notes, and
   nothing waits.
3. **Read it cold.** Its builder will have the folder and none of this conversation. Hand the
   folder's absolute path to a fresh `general-purpose` subagent, and nothing else, with the
   question: where would you have to guess to build this, task by task? Each gap it names is a
   fact missing from the files: add it to spec.md or plan.md, or answer why the code already
   settles it. When it named gaps, a second fresh read after the edits names none a builder
   would act on differently. Without subagents, skip it with that reason.
4. **Ship.** Commit the spec folder, run `pr`, push the branch, and open the PR
   with `gh pr create`. The body says what was planned, what was settled, and what was deferred
   to which stage. When the run log names an issue, plan.md names it as a partial reference
   under **Done when**, and the PR finishes only part of it, per the
   `issue-tracker` skill. The run ends at the open PR. Do not merge, and do not run `wt finish`.
5. **Report** per the skill's Report section, plus the spec's path and the command that builds
   it.
