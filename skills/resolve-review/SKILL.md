---
name: resolve-review
description: >-
  Reads a review already in hand, works out which findings are real, fixes those, and drops the
  rest with a reason. Every finding is a claim to check, whoever wrote it. Use when review
  output exists and should be acted on, whether from a previous `prod-review` run, a CI bot,
  another agent, or a review pasted into the chat.
allowed-tools: Bash(git status*), Bash(git log*), Bash(git diff*), Bash(git show*), Bash(git grep*), Bash(gh pr view*), Bash(gh pr diff*)
---

# Resolve a review

- Branch: !`git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(not a git checkout)"`
- Scope: !`d=$(git rev-parse --abbrev-ref --verify -q origin/HEAD 2>/dev/null || echo main); git diff "$d"...HEAD --shortstat 2>/dev/null || echo "no diff"`
- Uncommitted: !`git status --porcelain 2>/dev/null | wc -l | tr -d ' '` file(s)

## Verdict everything before editing anything

Open the code each finding points at. One fix can invalidate the next finding, so decide the
whole list first.

| Verdict | Test |
| --- | --- |
| `FIX` | A defect that survives the merge, and closing it serves this branch's intent |
| `WRONG` | The code does not say what the finding says. Quote the `file:line` that disproves it |
| `STALE` | The code it quotes is already gone from this branch |
| `LATER` | Real, but the diff never touched it, or its fix would stand as its own PR |
| `DECIDE` | Real, but the fix means choosing behavior the branch's intent does not pin. Options to the user, recommended first, and no edit |

What decides it:

- The bar for `FIX` is wrong behavior, a broken contract, or a security or data hole. "Could
  be cleaner" is not a defect. `nit`, `suggestion`, `optional` and `non-blocking` mark
  findings you may decline.
- Fix the defect the finding proves, not the patch it proposes, and fix it at its cause. A
  fix that routes around a cause this branch can reach is a second defect, per **Editing** in
  `AGENTS.md`.
- A confident tone, a severity label, and a pasted diff are not evidence. A finding that wants
  working code restructured has to name the input that makes it fail. A convention stated by a
  human who owns the repository counts without one.
- A correct trivial nit in code this branch already touches is cheaper to apply than to argue.
- For a security claim, failing to reproduce is not disproof. Show the input is impossible, or
  bring it to the user.
- `LATER` is a judgement, not a wall. Fix a pre-existing defect when this branch leans on it,
  builds on top of it, or turns it from dormant into reachable.
- A finding about a case that does not exist is `LATER`, not `FIX`. The test is
  `prod-review`'s Dormant bucket: a flag that is off, an input no caller sends, a format
  nothing serves. It turns into `FIX` when this branch made it reachable. **Editing** in
  `AGENTS.md` governs review fixes as much as first drafts, so error handling, options, and
  abstraction go in only for a case that exists.
- For every `FIX`, ask whether the same class of defect can come back in other code. When a
  type, a lint rule, or a check in the project would have stopped it, write that as the
  finding's **Guard**: one line naming the rule and the file it goes in. A Guard is not applied
  in this branch, per **Mistakes that recur** in `AGENTS.md`. A defect with no mechanism to
  recur gets no Guard.
- `DECIDE` is rare. When the intent, the spec, or the existing contract pins the right
  behavior, that is a `FIX`; do not hand work back as questions.

## Fix, then check

Keep each fix to the smallest change that closes the defect. When an edit went through a shell
command or a tool that does not fail on a miss, re-read the changed lines, because an edit that
silently matched nothing leaves you believing a hole is closed. Run the checks that cover what
you changed.

Your fixes are new code written fast under a narrow lens, and the next round's worst findings
come from them, including regressions that break a whole class of users while closing a narrow
bug. When one runs past a few lines and no later round will review it, run `prod-review` on it
before you report.

## Report

One pass, then stop. Not finding much to change is the success case.

Answer in the numbers the review used so each line matches its finding: number, verdict, and
what you did or why you did not. Close with the check output you actually got,
`git diff --shortstat` for the fixes so the reader sees what the pass cost, the `LATER` list,
the Guards, and each `DECIDE` with its options. Leave posting replies, resolving threads, and
pushing to the user.
