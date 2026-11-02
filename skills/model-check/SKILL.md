---
name: model-check
description: >-
  Checks code that has states, timers, or concurrent steps against every sequence of events up
  to a bound, not only the few a test author thought of, and reports the shortest sequence that
  breaks a stated property. Use when a change adds or alters a control or flow with states (a
  confirm or copy button, a carousel, a modal, a wizard, a checkout), timers, retries,
  webhooks, or two writers to one record, when a bug shows only after some order of clicks,
  events, or messages, and in the Verify step of a oneshot run. For the data a screen renders,
  use `break-ui`.
argument-hint: "[component, flow, or module; defaults to what this branch changed]"
---

# Model check

A test checks the sequences someone wrote down. A user, a retry, or a second worker produces
the others: the second click while the first one's timer runs, the release after the confirm,
the webhook that lands before the row it updates. This skill drives the code through every
sequence of events up to a bound, checks the properties after every step, and leaves the check
in the project's test suite so every later change runs it.

It is model checking in the sense of bounded exhaustive search, run by the project's own test
runner on the real code. A pass covers the events, the bound, and the properties you wrote,
and nothing else. Say so in the report.

## 1. Write the properties

Pick the target: what the user named, or each thing with states this branch adds or changes.
Write each property as one sentence a user would recognize, then as a check over the state:

- **Never**: something that must not happen in any state. "At most one reset timer is
  pending." "The label width does not change between Delete and Deleted."
- **Only by**: a state that may end in one way only. "A confirmed press ends only by its reset
  timer." Checks see a state, not a transition, so record the transition in a variable the
  steps set (`leftConfirmedEarly = true` when anything but the reset leaves the confirmed
  state) and check that variable.
- **Always back**: from every state the control can reach, some sequence leads to its resting
  state. This catches the state a user enters and never leaves, which passes every unit test.
- **Agree**: two views of one thing match after every step. "The carousel's active slide is
  the lightbox's slide."

Take properties from the principles first: the spec's **Principles**, the gate, or the ones
the project keeps for this code. Then the component's docs and the user's words. A principle
about behavior a user sees that no property checks is a gap; name it in the report. Done when each property is one sentence of harm and one check,
and at least one is about time or repetition.

## 2. Choose what the check drives

Drive the real code whenever the project's test runner can mount it fast: a component in its
DOM environment, a reducer, a module with its clock and network faked. A hand-written model of
the code drifts from it; the real code cannot.

When the logic is spread across booleans, timers, and handlers so that no state can be read
back, that is a finding of its own. **Shaping code** in `AGENTS.md` prefers one state value
with its transitions in one place, and a change that touches the logic is the place to make it
one.

Write a hand model only for steps the runner cannot execute: two processes, a queue, a
database, a third party. Each step of the model is one atomic action in the code (one
statement, one transaction, one request), and names the `file:line` it stands for. When the
repository already runs a model checker such as TLA+ or Alloy, use it for these. Installing
one is a new dependency and the user's decision.

## 3. Write the world

Copy [`explore.ts`](explore.ts) into the project's test helpers, translated to the project's
language when it is not TypeScript. It takes a function that builds a fresh **world** and a
depth, replays every sequence of steps from a fresh world in breadth-first order, and returns
the shortest sequence that breaks a check or throws.

A world has:

- **steps**: one per event the outside can cause, named in the product's words ("pointer
  down", "Escape", "webhook: paid"). Time is a step: "time: next timer" advances to the next
  pending timer, and "time: 100ms" lands between timers. Repetition comes free, because any
  step can follow itself.
- **checks**: the properties from step 1.
- **fingerprint**: a string of everything that decides what happens next, pending timers
  included. Two states with one fingerprint are explored once, so a fingerprint that leaves out
  a field hides the bugs behind it. When unsure, put more in.
- **home**: the resting state, when you wrote an **Always back** property.
- **teardown**: destroy what the world built and restore the real clock.

Pick the depth so the run stays under ten seconds, and raise it while it does. Most control
bugs need three to five steps.

## 4. Run it, and prove it can fail

Run it as a test in the project's runner. A failure prints the path: the steps in order, then
the property they broke. Replay the path by hand in the running product once, to confirm the
world matches the code.

A check you have never seen fail proves nothing. Break the code the way each property guards
against (drop the `clearTimeout`, remove the guard, reorder two steps) on a scratch edit, run
the check, see it fail with the path you expected, and revert the edit. A property that stays
green on its own break is checking nothing. Fix the world or the property, never the break.

## 5. Keep it

Commit the world as a test beside the code it drives, named `<subject>.model.test.<ext>`, so
the project's test command and CI run it on every change. A change to the control that adds an
event adds a step to the world in the same diff.

A violation in code that already shipped is a finding. Report its path and harm, and leave the
product code as it is unless the task is to fix it. The test then lands with the fix, red
before it and green after. Never weaken a property or lower the depth to make a run pass. A
smaller depth needs a measurement, per **Verifying** in `AGENTS.md`.

A hand model lists at its top the files and functions it stands for and the commit at which
they last matched. Rerun this skill on it when a diff touches one of them, and move the commit
only after the model matches the code again.

## 6. Report

One line per property: the sentence, `holds to depth N (S states, P paths)` or the breaking
path in the product's words with its `file:line`, and the scratch break that proved the check
can fail. Then the bound and what the world leaves out: events with no step, a browser engine
or a real device the runner does not emulate, steps a hand model collapsed into one.

Inside a oneshot run, every broken property joins the review's findings for Resolve, and the
report goes into the run log's **Checks**.
