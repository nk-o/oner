### Shared tail

Every lane that writes code ends here, after its own steps. The scope of everything below is
what this run wrote: the branch's diff for a feature or a fix, and the commits since **Base** in
the run log for a review.

- **Clean the diff.** Read the whole diff once, the delegates' parts included. Remove
  narrating comments, guards and options for cases that do not exist, dead compatibility
  paths, and edits outside the task, per **Editing** in `AGENTS.md`. A behavior change found
  here is a finding for the steps below, not a cleanup, and so is a workaround whose cause the
  change could reach.
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
     off, goes into the report rather than being swallowed.
  2. `prod-review` on this session's model, in an `oneshot-reviewer` subagent, where the host
     has subagents. Its brief carries the run log's **Assumptions**, and the `blast-radius`
     result when the step above ran, so its step 6 does not run it a second time. Where the
     host has no subagents, `prod-review` runs inline, returns an **Attention** line for each
     assumption it would have decided differently or whose evidence is thin, and runs first,
     ahead of `external-review`, because a reviewer that has already read the other cannot
     agree with it independently.

  Size the review to the change. A two-line fix gets a short, confident review, not a fan-out.
  Merge every voice, `prod-review` included, into one numbered sequence before acting, per
  **Reading the result** in `external-review`.

  Both voices are in before Resolve starts. One that lands after the fixes read code the other
  has already changed, so its list arrives carrying findings that are gone and its agreement
  with the first is no longer independent. Wait for it. When it arrives late anyway, scope it
  with `--base` on the fix commits and count it as round two.
- **Resolve.** Run `resolve-review` on the merged list. Its `DECIDE` verdict is not available
  here: the spec, the plan, or the gate pins the behavior, or the decision is taken and logged
  under **Assumptions**, or it is one of the four hard stops and the run pauses. Its own
  `prod-review` of the fixes does not run here, because round two is that review. Re-run
  `green-repo` after the fixes, then commit them.

  Put `git diff <Base>...HEAD --shortstat` into the run log's **Review** before the fixes and
  again after their commit, write `Round 2 base. <the sha HEAD was at before the fixes>` beside
  it, and name the finding number each added block closes. The review is there to
  catch what the change broke, not to grow it, so a total that went up is reported with the
  findings that paid for it. Hardening against a case the boundary does not admit is what makes
  it go up.
- **Round two.** If Resolve changed code, review the fix commits alone and resolve again,
  scoped with `--base` set to the logged **Round 2 base**. Stop after round two unless
  round two's own fixes introduced a regression, in which case review those fixes and stop
  there. Record each round in the run log's **Review**.
- **Ship.** Run `pr`, push the branch, and open the PR with `gh pr create`, naming
  each screenshot and recording the body shows with `--attach`, as `pr` says. When
  the branch already has a pull request, push to it and leave its description alone unless the
  change made it wrong. When the run log names an issue, update it for the open pull request
  per the `issue-tracker` skill. The run ends at the open PR. Do not merge, and do not
  run `wt finish`. In a series stage, the series takes the PR from there, per
  [`series.md`](series.md).
- **Report** per the skill's Report section.
