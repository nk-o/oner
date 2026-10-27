---
name: external-review
description: >-
  Reviews the same change with models this session is not running, one voice per provider the
  user's config turns on and has installed. Each is told what to review and reads the repository through its own harness, so
  the readings differ in method and not only in model. Use when a change deserves opinions from
  outside this session. Needs at least one
  provider CLI on PATH: Cursor's `agent`, `codex`, or `claude`.
argument-hint: "[base ref; defaults to this branch's diff]"
disable-model-invocation: true
---

# External review

One command. It runs every enabled and installed provider at once, and writes each voice to its
own file:

```
{{skills_dir}}/external-review/ext-review.sh --intent "<one sentence on what the change is for>"
```

stdout carries the paths and nothing else. Read every file it names, in full. The reports run to
tens of kilobytes, and while they shared one stdout, anything that truncated the stream ate the
first voice whole.

The consent in `config.json` does not override the host's approval policy. On an automatic
denial, report the exact reason and obtain the missing consent or use a materially safer
alternative. Do not repeat the same denied action through another command.

Options: `--provider cursor|codex|claude|all` to pick voices, `--base <ref>` to review against something
other than `origin/HEAD`, `--model <slug>` for the Cursor voice.

`--base` is how you scope a later round. Pass the sha HEAD was at before the fixes and both
voices review the fix commits alone. There is no way to hand in a prepared patch, on purpose: a
patch file is a diff somebody assembled by hand, which is the thing this skill stopped doing.

## Review an independent copy

Each provider is given the contract, the intent, and the scope. It reads a sanitized repository,
through its own harness, with its own tools. That is deliberate. Two agents that go looking
differently surface different defects, and pre-chewing the diff for both would flatten the one
thing worth paying for.

What the copy leaves out, and why, is in the header of [`snapshot.mjs`](snapshot.mjs). The
script lists every exclusion on stderr: put that list in your report, because an excluded file
is one no external voice reviewed. Agent runtime directories and MCP configuration are among
them, so a change confined to those files needs the in-session review.

The cost is time. A reviewer that walks the repository takes minutes rather than seconds. The
providers are read-only and share nothing, so they run at once and the wall clock is the slower
of them rather than their sum. It is still longer than a foreground command may take, so start
this in the background and do the next thing while it works.

## The voices are not the same reviewer twice

**Cursor** gets this repository's own contract from [`PROMPT.md`](PROMPT.md), plus the base ref
and the three commands that bound the scope: the committed diff, the uncommitted tracked
changes, and the untracked files that neither of those reports. Those name the scope, not the
method. Its model defaults to `cursor-grok-4.6-low`. The CLI starts in `--mode ask`, which
runs read commands and refuses to write.

**Codex** runs `codex review`, its own built-in review, with its own method and its own scope
selection. It receives the same sanitized repository, with no custom review prompt. It differs
in how it looks, not only in the model behind it. The script gives it `--base` when the branch is
ahead, `--uncommitted` when the tree is dirty, and both when both are true. Its model and
effort come from `config.json` and apply to this run only; the defaults are `gpt-6.1-sol` at
`medium`.

**Claude** gets the same contract as Cursor through `claude -p`, with read tools and read-only
`git` commands allowed, every writing tool refused, and no settings file or hook loaded. Its model
defaults to `opus`.

The independence is narrower than it reads. The build puts the same skills into `~/.codex`,
`~/.cursor`, and `~/.claude`, so `prod-review` sits in every provider's own skill catalogue and
each of them may load it before it starts. Every run is scored against this repository's rubric whatever the
script hands over.

Keep `PROMPT.md` in step with [`prod-review`](../prod-review/SKILL.md), which is where it came
from: its buckets, seams, verdicts, report shape, and rules are steps 2, 3, 7, 8 and **Rules**
there, cut down for a reviewer that runs once and sees no other voice. Two reviewers scored
against two different rubrics cannot be compared.

## Leave out the vendor this session already is

`prod-review` runs on the calling session's own model, so a voice from that same vendor is not
a second opinion, and counting the two as agreeing is worse than having one. The build writes
`providers.env` beside the script for each agent it installs into, with the voices
`config.json` turns on and that agent's own voice left out. Claude Code's copy is the exception,
because OpenCode and Grok Build read it too: it keeps the Claude voice, and the script leaves it
out when it runs inside Claude Code. The default `all` means that list, so pass nothing. Voices and models change through `config.json`, which the `configure` skill edits.

## Exit codes

`0` at least one voice ran. `1` a provider or the snapshot failed. `2` a bad argument or base
ref. `3` nothing in scope, including a change made only of excluded files, and no provider was
called. `4` a requested voice's CLI is not logged in, and no voice was started. `127` no voice
could run: none installed, `config.json` turns every voice off for this agent, or every voice was
out of its usage limit. Neither `3` nor `127` stops the surrounding work: report it and go on
with the reviews you do have. `4` does stop it: ask the user to run the login command stderr
names, and run the review again once they say it is done.

## Reading the result

Each voice writes a numbered list, and every list is a set of claims, not a work order. Nothing
gets acted on until it has been through [`resolve-review`](../resolve-review/SKILL.md).

Merge the voices before resolving, into one numbered sequence. The same defect from two
voices is one entry, marked as raised by both, because that agreement is the strongest signal
in the list and the reason to run more than one. Do not drop a finding
for being unique to one voice, and do not promote one for being duplicated. Both still get
verdicted against the code.

## When a provider is missing

The script names the CLI and how to add it, then runs whatever is left. That message is for the
human: put it in your report rather than swallowing it, because a missing provider is one fewer
independent reader, and installing it is a one-time fix.

A voice out of its usage limit is reported as `limit` and skipped, not counted as a failure.
