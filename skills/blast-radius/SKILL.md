---
name: blast-radius
description: >-
  Finds what a change breaks outside its own diff, and proves the one fact it is safe because of
  by running code instead of writing it up. Reads what grep cannot reach, such as a pinned
  library's source, a wire format, or a caller three hops downstream. Use for "what could this
  break", "blast radius of X", a small diff you do not trust, or before merging a change to
  something shared. For a full review, use `prod-review`.
allowed-tools: Bash(git status*), Bash(git log*), Bash(git diff*), Bash(git show*), Bash(git grep*), Bash(git ls-files*), Bash(git merge-base*), Bash(gh pr view*), Bash(gh pr diff*)
---

# Blast radius

Listing the callers is not the job. Grep finds those in a second. The job is the breakage
grep does not show.

## Do not trust your own writeup

A blast-radius writeup reads as convincing whether or not it is true, and that is the trap.
Do not hand back the writeup. Find the one or two facts the change's safety depends on, and
prove them by running code.

## Steps

1. **Read the change.** The diff, the symbols it adds, changes, and deletes, and what it now
   does differently, including the part the diff does not spell out. On a branch use
   `git diff origin/HEAD...HEAD`; on a pull request use `gh pr diff`.
2. **Find the one fact it is safe because of.** Most changes that look frightening are safe
   because of a single fact, such as "this call only drops cache entries that are already
   dead". Find that fact. If it holds, most of the scary cases die with it. Spend the time
   here, not on a long list of maybes.
3. **Look where grep stops.** Read the source of the library you call, and check its pinned
   version and any local patch. Work out when things run: microtasks, teardown, unmount
   order, server against client. Follow what a symbol search misses: the JSON an API returns,
   a database column, a wire format, a file another language reads, a feature flag, a caller
   three hops downstream.
4. **Be honest about each risk.** Give it a real chance of happening and a real cost if it
   does. Keep the risks you confirmed and list what you checked and cleared separately. Cite
   a real `file:line`. A search that finds nothing is still an answer. Never invent a caller
   or an API.
5. **Prove the one fact.** Write the script or test that runs the real code, run it, and paste
   what it printed.

## Report

- **What it does.** What changed, including the part that is not obvious from the diff.
- **The one fact it is safe because of.** State it, name the rung it reached, and show the
  proof. If you could not prove it, write unproven.
- **Risks.** Only the real ones. Each names how it breaks, the `file:line`, how likely, how
  bad, and how to check.
- **Cleared.** What you checked and why it is fine.
- **Before you merge.** The cheapest test or repro that catches the real bug, including the
  script you wrote.
