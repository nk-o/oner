---
name: diagnose
description: >-
  Finds the cause of a bug, a flaky failure, or a regression by first building one command that
  fails on it, then ruling out ranked hypotheses until one mechanism and its file:line remain,
  then fixing it at that layer. Use when the user says debug, diagnose, or "why does this
  happen", reports something broken, throwing, failing, flaky, or slower than before, and in
  the fix lane of an oneshot run. Not for a change whose cause is already known.
---

# Diagnose

The command comes first. With a command that goes red on this bug, bisection, hypotheses, and
logging all have something to run against, and the cause gets found. Without one, reading code
produces theories, and a fix built on a theory is a guess that ships.

Every shipped line traces to evidence from a running program. When evidence refutes a
hypothesis, revert what it motivated.

## Redact

Commands, logs, and captured requests carry tokens and cookies. Write `<REDACTED>` in place of
every secret you show, keep credentials in environment variables the command reads, and quote
only the lines that carry the signal.

## 1. Build the loop

Find one command that drives the real code path and asserts the symptom the user described. In
roughly this order of preference:

1. A failing test at the layer the bug lives on: unit, integration, or end to end.
2. A `curl` or HTTP script against the running dev server.
3. A CLI call with a fixture input, diffed against known-good output.
4. A headless browser script that drives the UI and asserts on the DOM, console, or network.
5. A captured request, payload, or event log saved to disk and replayed through the code path.
6. A throwaway harness that runs the smallest slice of the system reaching the bug.
7. A loop over many random or recorded inputs, for output that is only sometimes wrong.
8. `git bisect run` with the command, when the bug appeared between two known states.
9. The same input through the old and the new version, with the outputs diffed.

Reproduce it yourself, through the project's own run path. Do not ask the user to reproduce it
for you. If it does not happen on demand, force it: synthesize the trigger, tighten the
conditions, or add instrumentation until it fires.

Then tighten the loop. Make it faster by skipping unrelated setup and narrowing the scope. Make
it sharper by asserting the specific symptom, not "did not crash". Make it deterministic by
pinning time, seeding randomness, and isolating the filesystem and network. For a flaky bug the
goal is a higher reproduction rate, not a clean repro: run the trigger a hundred times, run it
in parallel, add load, narrow the timing window. A bug that fails half the time can be debugged
and one that fails once in a hundred cannot, so raise the rate until it can.

**Done when** you can name one command you have already run, with its redacted output, that is
red on this bug, gives the same verdict every run (or a pinned high rate for a flaky one),
takes seconds, and runs without a human. If you catch yourself reading code to build a theory
before this command exists, go back to building it.

When no loop is possible, stop and say so. List what you tried and ask for one of: access to an
environment that reproduces it, a redacted captured artifact (a HAR file, a log dump, a
recording with timestamps), or permission to add temporary instrumentation where it happens.

## 2. Minimise

Confirm the loop shows the failure the user described, not a different one nearby. Then cut
inputs, callers, config, data, and steps one at a time, re-running after each cut, and keep
only what the failure needs. Done when removing any remaining element turns the loop green.
The minimal case shrinks the space of causes and becomes the regression test.

## 3. Hypotheses

Write three to five ranked hypotheses before testing any. One hypothesis anchors on the first
plausible idea. Each states its prediction: "if X is the cause, changing Y makes the bug go
away and changing Z makes it worse". A hypothesis with no prediction cannot be refuted, so
sharpen it or drop it.

Show the ranked list to the user when they are in the conversation. They often know that one
was ruled out last week or that a deploy touched another. Do not wait for an answer. Under
`oneshot`, the list goes into the run log instead.

## 4. Probe

Each probe maps to one prediction and changes one variable. Prefer a debugger or a REPL
breakpoint; otherwise add logs at the boundaries that tell two hypotheses apart, never
everywhere. Tag every temporary log with one unique prefix, such as `[DEBUG-a4f2]`, so removing
them is one search.

For a slowdown, measure first: a baseline with a timing harness, a profiler, or a query plan,
then bisect against it. Logs mislead about time.

**Done when** one mechanism survives and you can name the `file:line` that proves it, with the
probe output that showed it.

## 5. Fix

Fix at the layer where the cause is, in the smallest change the evidence justifies, not with a
guard that hides the symptom.

Where a test runner the project already uses reaches the layer the bug actually goes through,
turn the minimal case into a test at that layer, watch it fail, apply the fix, and watch it
pass. A test at a layer too shallow to reach the bug's real chain, such as one caller when the
bug needs two, proves nothing about this bug. When no such layer exists, say so in the report, since that is a
finding about the code's structure. Then run the original, unminimised loop from step 1 again.

## 6. Clean up

- The step 1 loop is green.
- A search for the debug prefix finds nothing.
- Throwaway harnesses and scripts are deleted, or moved under a clearly marked scratch path.
- The commit message or the PR body names the hypothesis that held and the mechanism, so the
  next person debugging this area starts from it.
