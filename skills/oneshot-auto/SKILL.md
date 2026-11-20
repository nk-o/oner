---
name: oneshot-auto
description: >-
  Runs oneshot with nobody watching and carries the task past the pull request into
  production. The gate does not wait, the pull request is merged once it is ready, and the
  deploy is verified in production. It stops only for a change that destroys data, a
  migration that does more than add or fails its checks, a change that breaks an outside
  contract, and a login only the user can supply. The user starts it by name. For
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

`oneshot`'s **Three hard stops** hold as written there: an additive migration is a decision
with its checks, not a stop. One more becomes a decision here: a change to an outside contract
that every existing caller survives. Take it, log it under **Assumptions** as a line that starts
with `Attention.`, and go on. When a hard stop comes up, set `Status. waiting` and ask through the host's question tool, with the pull
request link, what blocks, and the options with the recommended one first.

## Release

**Release** in `{{skills_dir}}/oneshot/lanes/tail.md` runs in this run whatever the release
setting says, with the `Auto.` line as its authorization. The plan lane, and a run that becomes
a series, tick it as `skip:`, the series because it releases every stage itself.

## Report

Per `oneshot`'s Report, with these changes. The link line is the one step 6 of `series.md`
writes per stage. The `Attention.` lines come right after it, before every other added line,
as decisions the user might overturn or as what waits on them. A run that stopped names the
action it waits on.
