---
name: issue-tracker
description: >-
  Keeps a tracker issue (Linear, GitHub Issues, Jira, any other) in step with the work done
  for it: its status, its checklist, milestone comments, and the closing keyword or partial
  reference in the pull request. Use when work starts on an issue the user named, on a branch
  whose name carries an issue id, or for a pull request or spec that names one, and again when
  that work opens a PR, gets blocked, ships, or is dropped.
---

# Issue tracker

Which issue is in scope, and the permission to write to it, are in **Issue trackers** in
`AGENTS.md`. This skill is what those writes are. Use whatever tracker tool the session has.

## Before the first write

Read the issue: its status, its checklist, and which status changes the tracker's automation
already makes on a branch, a pull request, or a merge. Do not repeat a change the automation
makes.

## As the work goes

- **Starting.** Move the issue to the first started status, where the tracker has statuses,
  unless it is already started, done, or canceled.
- **Checklist.** Tick an item in the description when the work it names is done and verified.
  Change no other text in the description.
- **Comments.** Comment only at a milestone: the pull request is open, the work is blocked on
  someone other than the user, or it is finished or dropped. The last comment says what
  shipped and names the work found outside the issue. That work becomes a new issue only when
  the user asks.
- **Dropped.** Work dropped before it ships puts the issue back to the status it had.

## The pull request

A pull request that finishes the issue ends its body with the keyword the tracker closes on
(`Fixes ENG-123`, `Closes #42`), and the tracker's automation closes the issue at merge. One
that finishes only part of it, such as a spec or one stage, carries a partial reference
(`Part of ENG-123`, `Refs #42`) and leaves the status alone.

Move the issue to review yourself only for a closing pull request the automation did not
move. Close it yourself only for finished work that ships without a pull request, or after a
closing pull request merged and the automation did not act.

## When a write fails

A tracker write that fails, or a session with no tracker tool, is one line in the report
naming the update not made. It does not stop the work.
