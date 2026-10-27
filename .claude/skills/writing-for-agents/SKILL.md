---
name: writing-for-agents
description: >-
  How to write the text an agent runs on in this repository: a SKILL.md, a lane, a reference
  file, an agents/*.md definition, AGENTS.md, or CLAUDE.md. Covers what a description must
  carry to fire, what stays in the main file and what moves behind a pointer, completion
  criteria, and the pruning pass. Use before creating or editing any of those files, and when
  a skill did not fire or a step was skipped.
---

# Writing for agents

The sentence-level rules are in `AGENTS.md` under **Talking to me** and apply here too. This
file is about structure: what the agent reads, when, and what makes it take the same path
every run.

## What every session pays for

`bin/build.mjs` renders `AGENTS.md` into every session of every agent the user runs, and every
model-invoked skill's `description` sits in context on every turn. Together they are already
several thousand words. A line added there is read in every session, whether or not it applies.
A line inside a skill body costs only when the skill fires. So a new rule goes to the narrowest
home that still reaches the moment it applies: a skill step before a skill's reference, a
skill before `AGENTS.md`.

## The description is a pointer

A description is the only part of a skill the agent sees before deciding to load it. Its
wording, not the body, decides when the skill fires.

- Start with what the skill does, in the words the user and the code already use. Those words
  are what the agent matches against.
- Name each distinct case that should fire it once. Three synonyms for one case are one case
  written three times.
- Leave out what the body already says about method. The description says when, the body
  says how.
- Name the near miss that should go elsewhere when one exists ("For an endpoint, use
  `break-api`").

When a skill exists and did not fire, fix the description before moving its content into
`AGENTS.md`.

## Invocation

- **Model-invoked** (the default): the agent can load it on its own and other skills can call
  it. It pays a description on every turn.
- **User-invoked**: `disable-model-invocation: true`, plus `agents/openai.yaml` with
  `allow_implicit_invocation: false` for Codex, per `CLAUDE.md`. No context cost, but only the
  user typing its name reaches it. No other skill can load it. A skill that needs one runs its
  script, as `oneshot` does with `external-review`, or tells the user to run it.

Make a skill user-invoked when firing it by itself would surprise the user: it opens a pull
request, spends money on external reviewers, or sweeps the whole repository.

## Steps and reference

A skill holds steps (what the agent does, in order) and reference (rules and facts consulted
on demand). Put the steps every run takes in `SKILL.md`. Move what only some runs need into a
file beside it, such as `references/<topic>.md` or `lanes/<case>.md`, and point to it from
the place the condition arises: "For a logic question, read [the logic
prototype](references/logic.md)." A pointer at the place it applies fires; a list of links at
the bottom does not.

Keep a concept's definition, its rule, and its exception under one heading. A rule split across
three sections is read in one and missed in the other two.

## Every step ends on a check

A step ends on a condition the agent can observe: "Done when you can name one command you
have already run that is red on this bug." A vague end ("once the cause is understood") lets
the agent move on early, because the next steps are in view and pull it forward. Sharpen the
condition first. Only when it cannot be sharpened and the rush is observed, move the later
steps behind a subagent or a separate file the agent reaches after the check.

The condition also sets how much work the step demands. "Every caller traced" produces more
digging than "list the callers".

## Words that carry behaviour

A word the model already knows can stand for a whole behaviour: _red_ for a check that fails
on the bug, _tight_ for a loop that is fast and deterministic, _frontier_ for the questions
answerable now. Use one such word, define it once where it first appears, and repeat the word
rather than the definition. Prefer an existing word to a coined one, which recruits nothing
the model already knows.

State the behaviour you want. "Write one-line comments" works; "don't write long comments"
puts long comments in front of the agent. Keep a prohibition for a hard limit that has no
positive form, and pair it with what to do instead.

## The pruning pass

Run it on every file you edit, and on `AGENTS.md` whenever it grows.

- **One home per rule.** When two files say the same thing, keep it in the one closest to
  where it applies and point to it from the other. A rule in two places drifts into two rules.
- **The environment is a source.** A line that restates what `package.json`, a config file, or
  `--help` already says goes stale. Keep what no file can tell the agent: the unwritten
  convention, the reason for a choice, the trap.
- **No-ops.** For each sentence, ask whether the model would behave differently without it.
  When it would not, delete the whole sentence rather than trimming words. The test is about
  the model's default, so settle a disagreement by running the skill, not by arguing.
- **Sediment.** A line about a file, flag, or step that no longer exists is worse than none.
  Check every name the text cites still exists.

## Before you finish

- `node bin/build.mjs --auto` passes. It refuses frontmatter a host would skip.
- Every `{{token}}` and path follows `CLAUDE.md`.
- Read the description alone and ask whether a session that needs this skill would load it,
  and whether one that does not would stay away.
