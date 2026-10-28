### Series lane

A series carries one approved program through several pull requests. Each stage gets its own
branch and pull request and runs the feature lane and the shared tail like any run. Then it is
merged, deployed, and verified in production before the stages that depend on it start. The
user approves the program and its release once, at the gate. After that the series runs to its
last stage and stops only where **Waiting** below says.

`series.mjs`, beside this file, owns the program's state. Call it by absolute path:
`{{skills_dir}}/oneshot/series.mjs`. It reads GitHub, git, and production. It records a
stage's transition only on evidence it saw, and prints the next actions. It never merges,
pushes, or deploys. You do, one command at a time, and run `next` again.

1. **Decide the split.** Feature lane step 1 sends you here after `brainstorm`'s phase 1 when
   the work cannot ship as one pull request. Every stage costs a full pass: review, CI, merge,
   deploy, and a production check, an hour or more before the next stage starts. So a stage
   boundary needs one of these reasons, and the stage map names it on each line:
   - **Order.** One change has to be in production before the next can land: an
     expand-and-contract migration, a backfill before a constraint, a contract its consumers
     adopt before the old one goes.
   - **Production fact.** The next piece is designed or tuned on what an earlier one shows in
     production: real usage, a measurement, a benchmark, a decision deferred until then.
   - **Separate risk.** A capability a user or an operator can notice, in another subsystem or
     on another surface, whose failure in production must not hold back or roll back the
     rest. Its production check can fail, because it checks behavior that is live.
   - **Outside gate.** A date, a provider's approval, an operator step, or a person's answer
     that one part waits for and the rest does not.

   Size is not a reason. Neither is review size, a line count, or preparing code that a later
   stage switches on. Code no caller reaches ships in the pull request that switches it on,
   and a capability's schema, helpers, and activation are one stage unless one of the reasons
   above stands between them. A stage too large for one session is built task by task inside
   its stage run, a delegate per task, and its review is scoped by commit range with
   `--base`. A stage that grows while it is built stays one stage.

   Without one of these reasons the work stays one run and one pull request. This is the
   run's call. Write it under **Assumptions** with its reason, and the gate shows it to the
   user.
2. **Open the program.** Set `Lane. series` in the run log, and make its **Lane** the feature
   lane's first step followed by this lane's steps from this one on. The log stays where it is, with `Status.
   running`, until step 4 moves it, so the hook keeps reminding through the gate and the spec.
3. **Gate.** `brainstorm`'s phase 2 is the gate, and the same stop carries three more things.
   - **The stage map**, one line per stage: what it ships, which stages it waits for, the
     reason from step 1 that makes it a stage of its own, and whether it carries a migration.
   - **The release.** The merge method the repository uses, the checks GitHub must report
     green, the command that prints the commit production runs, the command that proves a
     stage's migrations are applied, the read-only production checks, and the timeout. Each
     is a fact you find before the gate, in the CI workflows, the deploy provider, and the
     project's `AGENTS.md`. None of them is a question. Each command runs from the primary
     checkout, where a deploy provider's local project link lives, but that checkout's files
     can be older than production, so a command calls a production URL, the provider's CLI,
     or `gh`, never a script of the repository. A script or query a command needs goes in the
     run folder's `release/`, which moves with it in step 4, never in a session scratchpad, a
     tool's own folder, or a temporary directory, because the agent that continues the series
     may run on another host. `series.mjs` refuses a command that calls a file under the home
     directory outside the program folder. Run each one once before the gate, against
     production as it is, and show what it printed.
   - **The operator steps.** Any step the plan runs against a provider outside the pipeline,
     such as copying stored files or reading a recovery bucket, is tried once under the
     host's permission mode before the gate, as a dry run where the step has one. List each
     refusal with the allow rule or the credential it needs, so the user grants them all at
     this stop instead of one per stage.
   - **The authorization**, asked as its own question. The options are: authorize the
     series' release; build stage one only and end at its pull request, which is the
     ordinary run; or change the split.

   The authorization covers this program's stages and nothing else: merging each stage's
   pull request with the command `next` prints, waiting for the repository's own pipeline to
   deploy and migrate, running the approved read-only production checks, opening fix-forward
   pull requests within the spec, and removing a finished stage's worktree with `wt.sh
   finish`. It does not cover work outside the spec, a write to production outside the
   pipeline (no manual migration, and no data a check writes unless the user approved that
   write here), a new external reviewer, dropping data the spec does not drop, or an action
   the host asks to confirm when it happens.

   **Away** does not reach this question. An authorization is consent, never a recommended
   default. A run `oneshot-auto` opened already has one: the user started it by name, and
   `authorization` quotes the log's `Auto.` line. Without one, build stage one to its pull
   request and run `series.mjs wait input "authorize the release of <program folder>"`.

   The four hard stops still stop. A migration or data shape the approved spec already sets
   is settled, so only one the spec does not cover stops the series. A decision that can only
   be settled once an earlier stage is in production stays in the plan as the first task of
   its stage. The series asks it when that stage starts, as a `decision` wait.
4. **Spec.** Run `spec` unattended at full depth into the program folder. plan.md holds one
   stage per series stage, in dependency order, under the ids `program.json` uses, and no
   size limit that splits a stage. Each
   stage's Verify step names the production checks it must pass, and each stage in
   `program.json` carries them as its own `accept`. A check that only proves production runs
   the merge passes every stage, so `next` holds a merge until the stage has one, or an
   `acceptWaived` reason when no read-only check can see what the stage ships. Every migration is
   forward-compatible: the code each stage ships works on the schema before and after its
   migration, so a deploy can run while the previous release is live, and no stage relies on
   a down migration. Then move the run folder to the primary checkout, the first entry of
   `git worktree list`, so a branch switch or a removed stage worktree never touches it:
   `<primary>/.specs/NNN-slug/`, taking the next free number there when its own is taken.
   Write `program.json` into it, and set the log's `Status. series`, which tells the run-log
   hook that `program.json` now holds the state. The log keeps **Gate** and **Assumptions**
   for the whole series.

   ```json
   {
     "status": "running",
     "authorization": "<the user's answer, verbatim>",
     "release": {
       "merge": "squash",
       "checks": ["test", "build"],
       "deployed": "curl -fsS https://app.example.test/version",
       "migrations": "<exits 0 once $SERIES_COMMIT's migrations are applied>",
       "accept": ["<a read-only production check>"],
       "timeoutMinutes": 30
     },
     "stages": [
       { "id": "schema", "title": "Add the nullable column", "migrations": true, "accept": ["<check>"] },
       { "id": "backfill", "title": "Fill the column", "after": ["schema"], "accept": ["<check>"] }
     ]
   }
   ```

   `deployed` prints the commit production runs. `migrations` and every `accept` command exit
   0 to pass, and read `SERIES_STAGE`, `SERIES_COMMIT` (the stage's merge commit), and
   `SERIES_DEPLOYED`. `deployed` may print more than the commit: the first full sha in its
   output that names a commit wins, then the first short one. `checks` names at least one check every head must report, beyond
   whatever else reports. `base` defaults to the remote's default branch, and a stage's
   `branch` to `<slug>-<id>`. Every other field is written by `series.mjs`. After this step
   `program.json` changes only through `series.mjs`, `amend` included, never by hand. Run
   `series.mjs next`. A record it refuses names the field.
5. **Run the stages.** Run `next`, take every action it prints, from the first line down, and
   run `next` again, until it prints `complete`. Read its whole output: a pipe through
   `head`, `tail`, or `sed` drops the actions sorted last. Its `--wait` is the only wait, in
   place of `sleep`, `gh pr checks --watch`, or a loop of your own. One session coordinates a
   series. Another session that only needs its state runs `series.mjs report`, which changes
   nothing.

   | Action | What you do |
   | --- | --- |
   | `start` | Cut the branch from the updated default branch: `{{skills_dir}}/worktree/wt.sh new <branch>` where the repository has `.claude/worktree.json`, else `git switch -c <branch> origin/<base>`. Open the stage run below there, and build it. |
   | `build` | Work the stage run until its pull request is open. |
   | `restart` | The branch was cut before a stage it needs was merged. Remove it and start again. |
   | `fix` | A fresh delegate works what `next` names in the stage's checkout by `pr-wait`'s **Handle an event**, and pushes. It does not wait. |
   | `update` | Merge the default branch into the stage's branch, run `green-repo`, and push. `next` asks for this whenever the head lacks a stage merged since the branch was cut, whatever GitHub's own setting. |
   | `merge` | Run the printed `gh pr merge` command exactly, as a command of its own, then `next`. `--match-head-commit` lets the merge through only for the head whose checks `next` verified. |
   | `accept` | Record the production check the stage run wrote, with `series.mjs amend --stage <id> --accept "<command>"`, once its log shows the check failing on production as it is. When the stage run wrote none, a fresh delegate writes it. When no read-only check can see the stage, record `--waive-accept "<reason>"` instead. |
   | `wait-checks`, `wait-merge`, `wait-deploy`, `wait-verify`, `hold` | Run `series.mjs next --wait 1800`. It returns once an action other than a wait appears. Where the host wakes the session when background work ends, run it in the background and end the turn. Where it does not, run it in the foreground as one command and wait on that command with the longest timeout the host allows. |
   | `fix-forward` | Cut the branch it names from the updated default branch and run a stage run there with `Lane. fix`, on the failure it quotes. The stage stays open until the fix passes production. |
   | `ask` | `next` has set the program to waiting. Ask the user what it names, per **Waiting**. |
   | `cleanup` | Run `wt.sh finish <name>` from outside that worktree, then again with `--yes`. The authorization covers it. When something outside the series still runs from that worktree, leave it, name it in the series log's **Now**, and go on. `next --wait` does not stop on a cleanup. |
   | `complete` | Go to step 6. |

   **The coordinator drives, and a delegate builds.** The coordinator's context is what
   every later turn pays for, so it holds `next`, merges, production checks, the series log,
   and the user's questions, and hands out the rest. Each stage run goes to a fresh
   background `general-purpose` delegate with the brief under **Parallel stages**, and so
   does long browser or provider work, such as a production canary in a dashboard. The
   delegate returns its pull request and a summary of a few lines. Read the pull request's
   `--stat` and the stage log's **Review** and **Checks**, not its transcript. The stage's
   tail already gave the diff two readers who did not write it, so open code only where the
   review left an **Attention** line or a deferred finding.

   **Waiting costs a pass over the whole context.** Every wait is one long call: `next
   --wait` for GitHub and production, and the host's wait on a delegate with the longest
   timeout it allows. A loop of short waits, `sleep`, `gh pr checks`, or plain `next` re-reads
   the coordinator's context on every pass and spends more than the stages it waits on.

   A fix for a stage after its delegate finished, a red check, review feedback,
   or a scope change goes to a fresh delegate with the whole scope, never as a second
   message to the finished one. The coordinator writes no code on a stage branch. The one
   commit it makes there is an `update` that merges without a conflict. Where the host has
   no subagents, the coordinator builds the stage itself.

   **A commit after the review reopens it.** A stage branch that gains a commit after its
   review round, a fix or a merge of the default branch with conflicts resolved by hand, runs
   the tail's review again on the commits after the reviewed head before `merge`. A plain
   update from the default branch with no conflict does not.

   **A stage run** is an ordinary oneshot run in the stage's checkout. It has its own
   `.specs/NNN-slug/oneshot.md`, with `Lane. feature` and one more line,
   `Series. <program folder> stage <id>`. Copy the program's spec.md into its folder, and
   write its plan.md from the program plan's Done when, its Decisions, and this stage's
   tasks alone, so its `implement` builds this stage and ticks only this copy. Tick Ground
   and gate and Spec as `skip: approved program <folder>, stage <id>`, then work Split the
   work, Pin, Build, and the tail through Ship. Its Verify step also writes the stage's
   production check from the stage's Verify into the program's `release/`, runs it against
   production as it is, and logs that it fails there, or why no read-only check can see
   the stage. Its Report is a status note in the message
   that carries the next tool call, because the series goes on. An open pull request
   finishes the stage run. It does not finish the stage.

   **What a stage creates for its checks, it removes.** A local database, a container, a
   bucket, or a temporary directory a stage run makes to test or rehearse is named with the
   stage id, such as `<app>_<stage>_<purpose>`, and listed in the run log's **Checks** with
   the command that removes it. The run removes each one before Ship, and the coordinator
   checks that none is left when the stage is done. One that a later stage needs, such as a
   template a script reads, stays and goes into the series log's **Now** with the stage that
   needs it.

   **Parallel stages.** When `next` prints `start` or `build` for more than one stage, those
   stages wait for nothing in each other. Hand each to its own background `general-purpose`
   delegate at once. Its brief holds the program folder's absolute path, the stage id, its
   branch and checkout, the rule that it runs the stage run above through Ship and never
   touches `program.json`, merges, or deploys, the rule that a question at one of the four
   hard stops comes back unanswered in its summary, the rule that it removes what it
   creates for its checks, the rule that it writes the stage's production check, and the
   check that proves it: an open pull request whose checks are running. The coordinator puts a hard stop to the user, per
   **Waiting**, and does not settle it for the delegate. Where the host has no subagents,
   build them one after another. Merges, deploys, and production checks go one stage at a
   time whatever else runs, and `next` holds the rest. A stage built beside another is
   brought up to date before its merge, so its checks run again on the new head. When the
   user named a model for this run, pass it as each delegate's `model`, and leave
   `config.json` and the agent definitions as they are.

   **Waiting.** The series waits, with `series.mjs wait <reason> "<pending action>"` and an
   ended turn, in these cases and no others. Every question to the user after the gate runs
   `wait` first, a question asked through the host's question tool included, so the program
   never reads `running` while it waits on a person. Add `--stage <id>` when the wait is
   about one stage, so the answer can move that stage:
   - A login expired, for `gh`, `git`, or a production command. `series.mjs` sets this
     itself and exits 3. When a step of your own hits it, run `wait auth` with the exact
     command that failed. Ask the user to restore access. Never skip the provider or the
     check instead.
   - The host refused an action the authorization covers, such as an auto-mode denial of an
     operator credential: `wait permission` with the exact action and the allow rule that
     would let it through. Ask the user to add the rule or run the step themselves. Never
     route around the refusal with another tool.
   - A decision the approved program did not settle: the code contradicts the spec, a gate
     decision turns out wrong, or a hard stop comes up outside what the spec sets. Ask, and
     change nothing in the contract to keep the series moving.
   - A review only a person can give, or an `ask` from `next`.

   Before the turn ends, the stage's run log and `program.json` both hold what is done.
   Once the user answers, run `series.mjs resume` and then `next`, before repeating any
   action. `next` reads GitHub and production first, so a merge that went through before
   the wait is recorded, not run twice. Time spent waiting does not count against a
   release's timeout. An answer moves only the stage the question named:
   - The user repaired a failed stage outside the series, by a redeploy or a migration
     applied per the rollback policy: `resume --recheck <stage>`, and production is read
     again.
   - The user chose a fix forward for a failed stage: plain `resume`, then cut the branch
     the question named. `next` takes it up.
   - The user accepts a merge at a head the series did not verify: `resume --recheck
     <stage>`, and the merge is recorded as accepted by the user. A recheck given for any
     other question lapses on the next pass.

   **Changing the plan.** A stage that grows while it is built is not split, per step 1.
   When the user revises the program while it runs, pause it with
   `wait decision`, rewrite `spec.md` and `plan.md` in the program folder, and show the user
   the new stage map with one line per stage, as at the gate. Ask the approval and the
   release of the new stages as one question, because a new stage can drop data or take
   payments that the first authorization never named. Write the stages not started yet to a
   file, in the shape of `program.json`'s `stages`, and run `series.mjs amend --stages <file>
   --approval "<the user's answer, verbatim>"`, then `resume`. `amend` keeps every started
   stage as it is and refuses a field only `series.mjs` writes. Release commands change the
   same way, with `--release <file>`.

   **Work outside the series.** The repository keeps moving while a series runs. The user's
   own pull requests and side fixes land on the default branch, and `next` brings each stage
   up to date with an `update`. A side pull request this session merges waits until no stage
   is between its merge and its verification, so a production check reads one change at a
   time. When one changes what a done stage shipped, add a line to the series log's
   **Assumptions** naming the stage and the pull request.

   **Failure.** A red check, a failed migration, a production that still runs an older
   commit, and a check that does not pass before the timeout all leave the stage open. A
   check that cannot decide counts as not passed. `next` turns a failed production check
   into `fix-forward`, at most twice per stage. A deploy that never picked up the merge is a
   pipeline problem, not a code one, so it asks, and so do a failed migration, a third
   failure, and a required check that was skipped, since nothing in the series will run it. A 401 from a production check is a failed check. Only a command-line login that
   is gone counts as a lost login. No down migration and no destructive rollback runs on its own. When
   the series asks, offer the project's own rollback policy, from its docs or `AGENTS.md`.

   **Cleanup.** `next` copies each open stage's run folder into the program folder's
   `stages/<id>/` on every pass, and once more when the stage closes, so `cleanup` removes
   only its worktree and dev servers. Never delete the program folder. `dev-tidy` leaves the
   worktrees and branches of every stage not yet done.

   **The series log is the handoff.** The series may stop at any point and continue in
   another session, on another agent. The program folder holds everything it needs:
   `program.json` for the state, `spec.md` and `plan.md` for the contract, `release/` for
   the tools, `stages/` for every stage run, and `oneshot.md` for the rest. Keep a `## Now`
   section in that `oneshot.md`, rewritten at every stage transition and before every turn
   that waits:
   - the stage in progress, its branch, worktree, pull request, and the action `next` last
     printed;
   - everything the series depends on outside the folder: a credential store item, an allow
     rule, an operator tool and the path it runs from, a local database or container;
   - what the next coordinator reads first, in order.

   No separate handoff file. A new coordinator, on any host, reads `## Now`, then runs `next`.
   Where the host can start a new session, hand off after every stage that `next` records as
   done, never in the middle of one, so no coordinator carries more than one stage's context.
6. **Report.** `series.mjs report` exits 0 only when every stage is done with its evidence.
   Then set the series log's `Status. done` and report per the skill's Report section, with
   one line per stage in place of the single link: its pull request, its merge commit, the
   commit production ran when it was verified, and the checks that passed. A series that
   stops short reports the same lines, with each open stage and the action `next` printed
   for it.
