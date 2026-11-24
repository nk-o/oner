# Evals

Each folder here is one case for `claude plugin eval`: a synthetic repository, a request, and
graders that check what the agent did. Most cases put the agent in a situation where a run used
to go wrong, such as a defect question that should start `oneshot`, a gate that should settle
facts itself, or a fix that must not narrow a behavior that works, and check the decision it
takes. The rest check one skill's output.

Run them from the repository root:

```
node bin/eval.mjs                     # every case, once
node bin/eval.mjs --case 'route-*'    # one group; the glob takes `[` and `]` literally
node bin/eval.mjs --baseline          # also run without oner and report the difference
```

`bin/eval.mjs` renders this checkout, not the installed copy, so a skill edit is measured
before it ships. Results and the HTML report go to `.oner/evals/<timestamp>/`. Every run
spends the Claude Code account's usage. In the first runs a case of 6 to 15 turns cost $0.25 to
$0.55, one of 23 turns $1.90, and 15 cases about $7.

## A case

```
evals/<group>-<name>/
├── prompt.md        frontmatter (max_turns, allowed_tools, tags) and the request, verbatim
├── case.yaml        schema_version "1.1", name, description, context.scaffold_script
├── fixture.sh       builds the repository in an empty directory
└── graders/*.md     one check per file
```

`case.yaml`'s `description` names the rule the case checks and where the expectation comes
from: a line of `AGENTS.md`, a skill's `SKILL.md`, or a correction users made more than once.
The expected result never comes from what the skills happen to do today.

Groups: `route` (which flow the request starts), `gate` (what the run asks and what it settles
itself), `scope` (what the change leaves alone), `honesty` (what the report claims), `run`
(resuming, finishing, where the files go), `design` (UI decisions), `skill` (one skill's
output).

## Fixtures

`fixture.sh` starts with `set -euo pipefail`, runs `git init -q -b main`, sets a local
`user.email eval@example.invalid` and `user.name eval`, writes small files with heredocs, and
commits. It runs with a temporary HOME and no network, so it installs nothing. Everything in it
is invented: no real product, company, person, store, order, or key.

## Graders

| type | use it for |
| --- | --- |
| `tool_used` | a skill was or was not called: `tool: Skill`, `input_match: oneshot`, `min`/`max`. `min: 0` with `max: 0` forbids a call; `max: 0` alone fails every run, because `min` defaults to 1. Skills are namespaced `oner:<name>`, and `input_match` is a regex over the call's JSON input. |
| `tool_order` | one call came before another. Both must happen, so pair the first call with one that always follows, such as `Bash`. |
| `regex` | text in the final reply (`target: last_message`), in the transcript (`target: trace`), or in a file the run left (`target: { source: file, path: <path> }`). `match: not_contains` forbids, `match: "count:N"` counts. Flags go in `flags`, never inline. The transcript is one JSON message per line and also holds the rules and skill texts the agent read, so a pattern for what the agent said or wrote starts with `"role":"assistant"[^\n]*`. |
| `file_exists` | a file the agent created, by glob. `exists: false` forbids. Files from `fixture.sh` do not count. `[` and `]` are literal characters there, so a character class needs `regex` with `target: files`, the list of created paths. |
| `llm` | a judgement no pattern can make. Write the body as PASS and FAIL conditions about one observable thing. With `focus: trace` the judge sees only the first and last 12 messages. |

Prefer a deterministic grader. Add an `llm` grader only for the part no pattern can check. A
grader that every run would pass whatever the agent did checks nothing, so delete it. The judge
sees only the first and last 12 transcript messages, and the first ones are the hook outputs, so
`focus: trace` judges only the end of a run. `last_message` is the final text block alone, often
one line. Under `--baseline` a `tool_used: Skill` grader stops
counting and shows whether the plugin fired, because the run without oner has no skill to call.
Score both runs on what the agent left behind.

To check that something comes first, anchor at the start of the transcript:
`^(?:(?!"type":"tool_use")[\s\S])*"type":"tool_use","id":"[^"]*","name":"Skill"` passes only when
the first tool call is `Skill`.

`allowed_tools` takes only read-only tools: `Read`, `Glob`, `Grep`, `Skill`, `Agent`,
`TodoWrite`. The runner grants `Bash`, `Edit`, and `Write` to every case. An eval run offers no
`AskUserQuestion` tool, so the agent asks in its reply text and stops for an answer. A case
about the gate judges the questions in that text. A case that needs the run to get past the
gate says so the way a user would, such as "Я отойду, бери рекомендованные варианты", which
`oneshot` treats as **Away**.
