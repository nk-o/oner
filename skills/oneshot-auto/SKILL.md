---
name: oneshot-auto
description: >-
  Runs oneshot with nobody watching and carries the task past the pull request into
  production. The gate does not wait, the pull request is merged once it is ready, and the
  deploy is verified in production. It stops only for a change that destroys data or breaks an
  outside contract, and for a login only the user can supply. The user starts it by name. For
  a run that ends at a ready pull request, use `oneshot`.
argument-hint: "[feature idea, ticket, or bug report]"
disable-model-invocation: true
---

# Oneshot auto

The user started this by name because they are not watching. Nobody reads a message until the
run ends, and nobody answers a question asked in prose. Starting it is the user's consent to
everything below and to nothing beyond it.

Load `oneshot` through the host's skill tool with the task, or read
`{{skills_dir}}/oneshot/SKILL.md` where the host has no skill tool, and run it. The rules below
take precedence over `oneshot`, its lanes, and the skills it calls, for the whole run.

## The run log

When `oneshot` opens the run log, put this line under `Status.`:

```
Auto. <the user's message that started this run, verbatim>
```

It marks the run as this skill's after a resume or a compaction, and it is the release
authorization that `program.json` quotes.

## The gate does not wait

Run as `oneshot`'s **Away** from the first step: the gate posts its screen as a status note,
takes the recommended option of every question, and logs each under **Assumptions**.

## Hard stops

Two kinds of `oneshot`'s hard stops become decisions: a migration or stored data shape that
only adds (a new table, a nullable or defaulted column, an index), and a change to an outside
contract that every existing caller survives. Take it, log it under **Assumptions** as a line
that starts with `Attention.`, and go on.

These still stop: a change that drops, rewrites, or overwrites data a user has, a migration the
code production runs now cannot work with, and a contract change that breaks a caller outside
this repository. Set `Status. waiting` and ask through the host's question tool, with the pull
request link, what blocks, and the options with the recommended one first.

## Release

Write `- [ ] Release` into the log's **Lane** after the tail's **Watch**. The plan lane, and a
run that becomes a series, tick it as `skip:`, the series because it releases every stage
itself.

When **Watch** reports the pull request ready:

1. Find the release facts per **The release** in step 3 of
   `{{skills_dir}}/oneshot/lanes/series.md`. They are found, never asked. Run each command once
   against production and paste what it printed into **Checks**.
2. When a command prints the commit production runs, release as a one-stage series. Take the
   next free `NNN` in the primary checkout's `.specs/` (the first entry of `git worktree
   list`), and write there a `program.json` per step 4 of `series.md`: `authorization` is the
   `Auto.` line, `release` holds the facts, and the one stage has this run's branch as its
   `branch` and `migrations` set when the change carries one. Add a series log `oneshot.md`
   beside it with a `## Now` section. This run's log is the stage run, which `series.mjs` finds
   by its `Branch.` line. Then follow `series.md` from step 5. Leave the `cleanup` action for
   the worktree this session runs in. Before any turn that waits, set this log's `Status.
   waiting` as well as running `series.mjs wait`.
3. When nothing tells which commit production runs, merge per **Merge** in `pr-wait` with the
   repository's merge method, check the result, and log `Attention. Production not verified:
   <why>` under **Assumptions**.

Tick **Release** once `series.mjs report` exits 0, or once the merge of step 3 is confirmed.

## Report

Per `oneshot`'s Report, with these changes. The `Attention.` lines come first. The link line is
the one step 6 of `series.md` writes per stage: the pull request, its merge commit, the commit
production ran when it was verified, and the checks that passed. A run that stopped names the
action it waits on.
