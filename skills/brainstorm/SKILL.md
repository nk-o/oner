---
name: brainstorm
description: >-
  Analyzes a feature idea against the code that exists, proposes concrete ways to build it and
  the problems it can already see, then settles every decision that can be settled now. Ends
  with a decision record ready for /spec, or a staged map when the work outgrows one session.
  Use when the user describes an idea and wants options, cost, or fit before code or specs
  exist. Not for changes already fully decided.
argument-hint: "[feature idea or ticket]"
---

# Brainstorm: analyze, then settle decisions

Target: $ARGUMENTS

Standing rule through both phases: this skill writes nothing into the repository and no code
that ships, and it ends where the skill ends. What it produces is understanding, delivered as
an impact report and a decision record in chat. A throwaway prototype that settles a fact
lives outside the repository and is deleted when the fact is recorded.

## Phase 1: analysis

Read the code before reasoning about it. Every claim about current behavior cites
`file:line`. When you cannot find something, say where you looked. For broad searches in a
large codebase, dispatch a read-only exploration subagent available on this host and keep only its conclusions. Treat what it
returns as leads, and open every `file:line` it cites before you repeat the claim as fact.

The idea arrives underspecified, and that is the normal case, not a blocker. Do not open with
questions. Work out what the request most likely means, say which reading you took, and bring
back options and objections. A phase 1 that only summarizes the code has not done its job.

Open with the answer, one line naming the approach you recommend and why, ahead of every
section below. The sections are what the user checks that line against, not the road they
walk to reach it. Length follows the decision rather than how much you read. One line per
item, a heading with nothing under it dropped rather than filled, and a change inside one
module reported in a screen rather than six sections.

Then, in this order:

1. **Destination and scope.** One or two lines on what the end of this work looks like, then
   the things a reader could reasonably expect from the request that it will not do. Both go
   before the analysis, because the destination is what every option below gets measured
   against, and the exclusions are where a narrower reading of the request goes on the record
   instead of quietly shrinking the work later.
2. **What it touches.** The real files, the layer each one sits in, and the existing
   callers whose behavior changes. The list, not a tour of each file.
3. **What breaks or needs a decision.** Only the items that genuinely apply here: access
   checks, data model and migrations, cached or client-held state that goes stale,
   background work and retries, and any rule the repository states that this change would
   skip.
4. **Ways to build it.** Two or three approaches this codebase actually admits, each named
   after the seam it uses and grounded in files that exist. One line each on what it costs,
   what it forecloses, and who pays for it later. Say why the recommended one won. When a
   smaller change gets most of the value, it belongs here as an option, even if the request
   implies the larger one. When the change sets an interface other code will build on (a
   module's public surface, a shared type, a protocol), do not draft the approaches alone: run
   two or three read-only subagents at once, each under a different constraint from
   `codebase-design`'s DESIGN-IT-TWICE.md, and compare what comes back on depth, locality, and
   seam placement before you recommend.
5. **What worries you.** The problems you can already see without asking: the part that will
   be hard, the assumption in the request the code contradicts, the case nobody mentioned,
   the thing that looks cheap and is not. State them now. A worry the user can dismiss in one
   line is worth more than a question they have to answer.
6. **Candidate stages.** Dependency order, each with the check that proves it. This becomes
   the skeleton of plan.md in /spec, or of the map when phase 2 ends staged.

## Phase 2: settle the decisions

First split the open decisions from phase 1. A decision is ready when you could act on the
answer today. It is deferred when its answer depends on what a later stage will reveal, so any
answer now is a guess, not a decision. Never put a deferred decision to the user. Name it, say
which stage unblocks it, and leave it.

Then take the facts out of the ready list. A question is a fact when running something answers
it: how the code behaves on an input, how long a step takes, what a layout looks like, what a
library returns. Settle it yourself, with the code, a small script, or a throwaway prototype
outside the repository, and report the result in one line. What remains is the user's:
product behavior, wording, scope, a visual direction, a new dependency, which repository ships
the code when more than one could.

Take the ready decisions:

- Three or fewer, independent of each other: ask them directly using the question routing in `AGENTS.md`,
  recommended option first.
- More than three, or decisions that depend on each other: invoke the `grilling` skill and
  run its design-tree method on them: frontier rounds, numbered questions, recommended
  answer first.

## Exit

Which exit you take depends on whether anything was deferred.

**Settled.** Nothing deferred, so the whole feature can be specced now. Post a **decision
record**: each settled decision with a one-line rationale, plus the chosen stage order. Close
with: ready for `/spec`.

**Staged.** Something was deferred, so the work outgrew one pass. Post a **map** instead: the
destination, the stages in dependency order, the decisions settled for stage one with their
rationale, and each deferred decision under the stage that unblocks it. Close with: `/spec`
for stage one only, then a fresh `/brainstorm` for each later stage, run once the stage before
it is built.

A map that lives only in this chat dies with it. Offer to record it where the next session
will look, one issue on the project's tracker holding the map and its stages, and write
nothing until the user picks.

## Unattended

When `oneshot` runs this skill, phase 2 is its gate, and the exit does not end the turn. The
decisions the user answered go into the run log's **Gate**, anything settled without asking
goes under **Assumptions**, nothing is offered, and the closing line is left out. The lane's next step follows in the same turn.
