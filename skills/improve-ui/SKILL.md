---
name: improve-ui
description: >-
  Audits a running product's screens the way a UI/UX designer would and fixes what it finds in
  rounds: spacing, overlap, overflow, contrast, missing states, keyboard and touch, awkward
  flows, and on public pages load speed and what search engines read. Covers one screen, a
  section, or every screen a user reaches, public pages included, and ends with an HTML report
  that pairs a before and an after screenshot with a verdict and a reason for each change.
  Product decisions go into the report, not the code. The user starts it by name. For one screen in one direction, use `refine`. For a report without edits, use
  `design-review`.
disable-model-invocation: true
argument-hint: "[screen, route, section, or all] [focus, such as mobile, contrast, or forms]"
---

# Improve the UI

Screens drift: a gap set by hand, a state nobody rendered, a control that works only with a
mouse. This run looks at each screen where a user meets it, fixes the defects inside the
product's own system, and looks again, until a fresh look finds nothing it may fix. It edits the
current checkout on its own branch, and commits only the setup in step 1 and the checkpoint in
step 2. Its evidence goes to the run folder,
`.oner/improve-ui-<YYYY-MM-DD>/` in this checkout, and its ledger to `.oner/improve-ui.md` in
the primary checkout, the first entry of `git worktree list`. Keep `.oner/` out of git as
`improve-code` step 1 does.

## 1. Set up

- **Target.** The argument names a screen, a route, a section, or `all`. With none, `all`: every
  feature in the project's map, signed-out ones (`session: false`) included. A focus in the
  argument narrows the checks, not the screens.
- **Clean tree.** The run checkpoints its rounds in the git index, so it starts from a tree with
  no changes. When there are changes, ask whether to commit them, set them aside, or stop, with
  the question routing in `AGENTS.md`. Get off the default branch the way oneshot's Step 1
  does, onto `improve-ui-<date>`.
- **Driver.** Run `{{skills_dir}}/worktree/wt.sh adopt` when the repository has
  `.claude/worktree.json`. The project's `verify-<app>` skill drives every capture, so rounds
  compare the same states: run its `start`, `doctor`, and `map`. Without one, run
  `worktree-setup` first and commit what it writes on its own, so round 1 holds only UI fixes.
  A capture or a state the CLI cannot reach is added to the CLI, per
  that skill's rules, not written as a one-off script.
- **Context.** Read `design-context` for `DESIGN.md`, tokens, shared components, and the screens
  the target must match. Without a `DESIGN.md`, the existing system is the authority.
- **Complaints.** Each thing the user named in the argument is a row in `run.md` before the
  first capture, in their words. Every one ends `resolved` or as a decision. None is dropped
  because a measurement found nothing. A constraint on markup or content, such as "other
  plugins extend these screens", limits what the DOM holds, not how CSS lays it out. Write it
  as the selectors and hooks that must keep working, and recompose inside it.
- **References.** Name one to three reference screens: the ones the user calls good, else the
  ones `DESIGN.md` holds up, else the most used. Measure each on the rendered page at 1280 and
  write its frame in `run.md`: content width and alignment, gutters, the surface content sits
  on (a card, a panel, the bare page), where the header starts, and the anatomy of a list row.
  This frame is the bar every other surface is held to in step 3. A reference that exists only
  as the user's screenshots gets its component anatomy written in `run.md` instead, per
  **Study a reference** in `design-context`, and every surface's rows, headers, stats, and
  badges are held to it.
- **Ledger.** Read `.oner/improve-ui.md` in the primary checkout. Create it when missing, with
  two sections, `## Open` and `## Rejected`, one line per decision:
  `<surface> | <decision> | <reason> | <default branch sha> | <YYYY-MM-DD>`. A finding that
  matches a **Rejected** line is dropped unless a file it cites changed since that line's sha.
- **Data.** Seed demo data only through the verify skill's **Seed** or the project's fixtures,
  on a local app with synthetic accounts, never on production or an account with real
  customers. Claims, prices, and testimonials come from the user, never from the run.

Done when `doctor` passes, `map` is clean or each gap is a finding, and `run.md` in the run
folder lists every surface in scope, the user's complaints, and the references with their frame.

## 2. Group the surfaces

In `run.md`, give each surface its feature ids, the files it owns from the map's `code` globs,
and its kind, which sets the bar for density, copy, and motion:

| Kind | Examples | The bar |
| --- | --- | --- |
| Work | inbox, ticket, settings, tables | density, keyboard, speed of repeated actions |
| Read | help center, docs, articles | type, measure, navigation between pages |
| Sell | landing, pricing, sign-up | hierarchy, one main action, honest claims |

Group surfaces whose files do not intersect. The layer every surface uses, such as the root
layout, navigation, tokens, and shared components, is its own group. It runs first, in this
checkout, because its fixes move every other surface.

With `delegate_task` and two or more other groups, start one delegate per group, all at once,
with `isolation: "worktree"` based on this branch. A worktree starts from a commit, not from the
index, so first commit the shared group's staged rounds as `style(ui): improve-ui shared layer`.
No delegate sees another group's screens, so the frame pass of step 3 runs here, over every
surface, after the groups return. Each delegate's brief carries steps 3 and 4 of this file, its surfaces, the files it may write,
the decision table, and the rule that it returns a patch, its captures, and its rows, and
writes no file outside its group. Otherwise run the groups one after another. Apply
each returned patch here and capture that group again in this checkout, since two groups' fixes
can meet on one screen.

Done when every surface belongs to exactly one group and each group's files are listed.

## 3. Look

Capture each surface with `check <ids> --out <run>/r0/<width>-<theme>`: at the narrowest width
the product supports (320 when nothing says), 768, 1280, and 1920, in each theme the product
ships. Add the states the surface has: empty, loading, each error through `--block`, and the
worst realistic data from steps 1 and 2 of `break-ui`. Note each page error the CLI reports.

Run **Look first** from `design-review` on every surface, at least one width per surface, each
capture opened at full size. A contact sheet, a thumbnail grid, or a JSON of measurements is
not a look. Then, before any defect check, run four passes:

- **Frame.** Put each surface beside a reference at the same width and theme. A different
  content width, alignment, gutter, surface, header position, or row anatomy is a finding, at
  least P2, unless `DESIGN.md` gives that surface its own frame for a reason it states.
- **Purpose.** For each card, panel, and widget, write one line: what it tells the user and
  what they do next. One you cannot write is a finding. Its fix says what the block is and the
  next step, or folds it away when it is reference material or kept for agents.
- **Arrival.** In one session, reach each surface the way a user does: from the navigation,
  after scrolling another page, and back. A page opens at its top. Content does not shift
  sideways or jump when data, images, or a scrollbar arrive, so measure the content's left
  edge before and after the first load. A fresh capture per feature cannot see this.
- **Composition.** Run **Composition** from `design-review` on every surface. Each failure is
  a finding, at least P2. A complaint that a screen reads piled up, cluttered, or hard to
  scan is checked here first.

Then operate the real controls: tab through, use touch targets at their
rendered size, open each menu and dialog. Check against **Check the result** in
`design-review` and its interface checks, then against `frontend-design`'s
[product basics](../frontend-design/references/product-basics.md) and its "Habits to
question", in that order. A break of a product basic is a finding, at least P2, whose action
the table below sets. Measure contrast, target sizes, and padding on the rendered
page. A value read from a screenshot or from the CSS is a guess. For a Read or Sell surface a search engine indexes,
also measure it per [page quality](references/page-quality.md).

Write each finding as a row in `run.md`:

| Id | Surface | Width, theme, state | Level | What the user sees | Cause | Kind of cause | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F7 | ticket | 320, light, long name | P1 | the priority control is 12 x 12 px and sits under the title | `TicketHeader.tsx:41` | local defect | fix |

- **Level.** P0 blocks the task or loses data. P1 makes the task hard, or fails WCAG AA. P2 is
  an annoyance with a workaround. P3 is polish. A finding a user would write to support about
  is at least P1.
- **Kind of cause.** Local defect, one-off, missing token, or concept mismatch, per step 2 of
  `refine`.
- **Action.** `fix` or `decide`, per this table:

| The run fixes it | It goes to decisions |
| --- | --- |
| spacing, alignment, overlap, overflow, clipping, text with no way to read the rest | a new token, color, font, radius, or shadow |
| grouping, order within a row, and gaps of controls the page already has, in CSS with the markup unchanged | which controls a page has |
| on a surface the user called overloaded, text, a repeated value, a column, or a field that fails "Every element has a job" and stays reachable in the record's detail view, per step 3 of `refine` | removing an action, or information the product would then show nowhere |
| contrast below the requirement, with a value the system already has | removing, hiding, or moving an action, a field, or information people use, outside the overload case above |
| a missing loading, empty, error, or disabled state, an error with no retry | a change to navigation, the sections a page has, or the order of a flow |
| accessible names, visible focus, keyboard reach, target size | copy that states a fact, a claim, a limit, or a price |
| an action reachable only on hover, a one-off where a shared component exists | what data is stored, sent, or accepted, per the decisions in `break-ui` |
| a label that names its control wrongly, per the clarify rules of `refine` | a concept mismatch, which goes to `frontend-design` or `prototype` |
| a surface whose frame differs from the references, brought back to theirs | a frame rule in `DESIGN.md`: widths, alignment, gutters, the surface content sits on |

`DESIGN.md` records decisions, so the run never edits it to describe what the run just built.
A frame rule changes only through an answered decision, and the report quotes the old and
the new rule. A change the user asked for in this run's argument is answered, and its rule is
written in the same round.

Done when every surface in scope has captures at each width, theme, and state, and every
finding has a level, a cause with `file:line`, and an action.

## 4. Fix in rounds

A round takes every `fix` row the last look found on a surface, P0 first, and fixes them
together before looking again.

1. **Fix.** Fix the cause at the narrowest level that holds it, inside the system, per step 3 of
   `refine`. For layout breaks, the table in step 4 of `break-ui` names the usual cause. A fix
   that changes logic, such as a state, a retry, or a handler, gets a test, per `AGENTS.md`.
2. **Checkpoint.** Accepted rounds are staged with `git add -A`, so `git diff` holds only the
   current round. Save it with `git add -N . && git diff > <run>/r<N>.patch`, since a plain
   `git diff` leaves out the files the round created. To revert the round, run
   `git apply -R <run>/r<N>.patch && git add -A`, which puts back the last accepted state.
3. **Capture again** into `<run>/r<N>/`, with the same width, theme, data, state, and scroll
   position as the row's earlier capture, so each pair differs only by the fix. Give each row a
   verdict, `resolved`, `partial`, or `unresolved`, from the pair, not from the diff.
4. **Regression.** A page error the CLI reports that `r0` did not have, a page quality metric
   worse than its `r0` median by more than the spread of its runs, a new finding at another
   width or theme, a consumer of a changed shared component that now looks wrong, or a failing
   test that covers a changed file reverts the fix that caused it: by hand when the cause is one
   fix, or the whole round with its patch when it is unclear, and the other fixes then run again
   as the next round. Mark the row `reverted` with the cause. Two reverts on one surface stop
   that surface.
5. **Look again** at the whole surface, per step 3, not only at the changed rows. A fix moves
   its neighbors, and new rows join the next round. Then stage the round.

A surface stops when a look finds no open `fix` row at P0 to P2, its frame matches the
references, and each complaint on it has a before and after pair at 1280 that answers it;
after its fifth round; or after its second revert. A complaint about how a screen reads that
the fixes did not answer goes to `prototype`: two or three directions on the real page,
inside the constraints, shown to the user before the report. P3 rows are fixed when a round touches their files anyway, and they never
start a round by themselves.

Done when every surface has stopped, `run.md` names why, and `git diff` is empty, every
accepted round being staged or in the step 2 checkpoint.

## 5. Check the whole change

- Run the project's checks that cover the changed files, in the order of `green-repo`, and keep
  their output in `run.md`.
- When a round changed logic, run `prod-review` on the staged diff and `resolve-review` on its
  findings. Run `model-check` on a control with states or timers the run changed.
- Run `check --all` at the narrowest width and at 1280. A shared fix can move a screen outside
  the target.
- Capture the ordinary demo data once more. A fix for the worst case must not break the usual
  one.

Done when each check ran and each failure is fixed or listed in the report.

## 6. Report

Write `<run>/report.html` per [the report format](references/report.md), open it, and give its
absolute path. Add each `decide` row nobody has answered to **Open** in the ledger.

Then ask, with the question routing in `AGENTS.md`, which decisions to apply and which to
reject, with your recommendation first. A rejected decision goes to **Rejected** with the reason
and the default branch's head. Apply the picked ones as one more round, steps 4 and 5, and add
their pairs to the report.

In chat: what changed, counted by surface and level, before and after. What you ran and what it
printed. The decisions still open. What stayed unverified, such as WebKit, real devices, or a
state the CLI could not reach. The changes stay staged on the run's branch. When the user asks
for a pull request, commit them per `commit-message` and open it per `pr`.
