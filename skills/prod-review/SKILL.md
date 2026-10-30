---
name: prod-review
description: >-
  Reviews code by what it will do in production, not by how much of it there is. Sorts what goes
  live from what stays dormant, ranks by blast radius, and verifies every finding before
  reporting it. Works on a diff and on code that already shipped. Use when asked to review a
  change, a branch, a pull request, a diff, or an existing feature, path, or subsystem. Use it
  again on the fixes from a previous round.
argument-hint: "[PR number, branch, path, or feature; defaults to this branch's diff]"
allowed-tools: Bash(git status*), Bash(git log*), Bash(git diff*), Bash(git show*), Bash(git grep*), Bash(git ls-files*), Bash(git merge-base*), Bash(gh pr view*), Bash(gh pr diff*)
---

# Review

- Branch: !`git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(not a git checkout)"`
- Default: !`git rev-parse --abbrev-ref --verify -q origin/HEAD 2>/dev/null || echo main`
- Uncommitted: !`git status --porcelain 2>/dev/null | wc -l | tr -d ' '` file(s)
- Size: !`d=$(git rev-parse --abbrev-ref --verify -q origin/HEAD 2>/dev/null || echo main); s=$(git diff "$d"...HEAD --shortstat 2>/dev/null); echo "${s:-nothing between $d and HEAD}"`

Target: $ARGUMENTS

Two shapes, and the target decides which:

- **A change.** The default when no target is given: `git diff <default>...HEAD`, plus
  `git diff HEAD` when the working tree is dirty. A PR number or a branch names a different
  one. The baseline is what the default branch does today.
- **Shipped code.** A feature, a path, a subsystem, or a file, with no diff behind it. The
  baseline is what the code promises: its callers, its tests, its docs, the data it already
  stores. Every step below still runs, with the substitution each one names.

Name the shape beside the rung when you size the job. A defect in shipped code already reaches
users, so it outranks anything that would only merge badly.

## 1. Size the job

Ceremony is a cost. Match it to the job, and say which rung you picked and why.

| The job | Do this |
| --- | --- |
| Small, and touches nothing shared | Read every hunk and its enclosing function yourself. No fan-out, no bucket sort. Verify anything before you report it |
| Medium, or touches shared code at all | Sort into buckets, name the seams, run two or three passes yourself |
| Large, or crosses layers, schema, or infrastructure | The full method below, with parallel passes |
| A previous round's fixes | At least the medium rung, scoped to the fix commits whatever their size, with every existing caller of what they touched traced |

A small change gets a short, confident answer. "I read all of it; here is the one thing I
found" beats guessing to fill space. At every size, nothing gets reported that you did not open
the code to check.

## 2. Decide what actually ships

Sort the code under review into three buckets and write down which is which:

| Bucket | Test | Bar |
| --- | --- | --- |
| **Live** | Reaches a real user who did nothing, already or the moment this merges | Every changed line, differentially. With no diff, every line on a path a real user reaches |
| **Dormant** | Behind a flag that is off, a new entity nobody has yet, a caller that does not exist | Correctness only. A bug here is fixed on the default branch, not in an incident. Code that nothing outside its own tests calls is itself a finding: wire it in this change or remove it |
| **Inert** | Tests, fixtures, docs, generated files | Read tests against the Tests kind in `{{skills_dir}}/deslop/criteria.md`. A test it would remove, and a relaxed gate, are findings |

Prove each placement rather than assuming it: grep for the callers, check whether the flag is
on, check whether any row of the new type exists. "Nobody has this entity yet" is a claim you
can verify, and it separates an urgent finding from a note. Attention that follows line count
reads five thousand new lines carefully and skims the twenty-line change to a shared path
buried inside them, and those twenty lines are the ones that page someone.

Write down the expected load beside the buckets: one person running a script, or many users and
processes at once. Take it from what the repository says, such as the README, the deploy
config, replica and worker counts, and cron schedules. A race, an unbounded list, or a query
per item is a finding when the expected load triggers it, and a note when only a larger load
would.

## 3. Rank, and name the seams

Order the Live bucket by *users affected × how hard it is to undo*. Schema changes and data
migrations come first, because they run against real rows and reverting the commit does not
undo them. Then shared code an existing user already reaches. Then everything else.

Name the seams before reading, because this is where findings concentrate:

- Every function whose **signature or semantics** changed. Grep every caller, check each one
- Every **deleted or replaced** line. Name the invariant it held, then find where the new code
  re-establishes it; if you cannot, that is a finding
- Every **shared component, helper, or type**. Find the consumers that relied on the old shape
- Every **new step in an existing pipeline**. What does it cost when it does nothing?

With no diff there is nothing to call *changed*, so the seams are the edges of the thing under
review: its entry points, the shared state it reads or writes, every caller outside it, and the
data it has already stored. Same rule, different way in.

## 4. Choose the passes

Pick by what the change actually touches. Running all of them produces volume, not findings.

| Pass | Run it when | Looks for |
| --- | --- | --- |
| **Differential trace** | Always | Does a named existing user, doing a named action, still get what they got before? |
| **Removed behaviour** | Anything was deleted or replaced | Guards, validations, error paths, and tests whose invariant never came back |
| **Caller tracing** | A signature or contract changed | Call sites that no longer hold: new precondition, changed nullability, new throw, new ordering |
| **Data and migrations** | Schema, SQL, or stored data changed | Behaviour on a populated table: locks, rewrites, unbounded updates, policies that widen |
| **Concurrency and lifecycle** | Locks, retries, queues, background work, caches | Interleavings, double-spend, orphaned work, a lock released by the wrong holder, a claim nothing releases |
| **Boundary inputs** | A new or changed surface a user or caller touches | What it does at the edge the code admits: the longest accepted value, nothing at all, a failed dependency, the same action twice. `break-ui` runs these against a screen, `break-api` against an endpoint or command |
| **Dead ends** | New state machines or gates | States a user can enter and never leave: work assigned to something that never runs, a refusal with no way forward |
| **Language and framework** | Always, cheaply | The known footguns of this stack, in the lines the diff adds |
| **Conventions** | The repo owns an instructions file | Rules you can quote, broken by lines you can quote |

The differential trace is the one pass worth running every time. "Find bugs" produces noise;

> Does `a named existing user` doing `a named action` get exactly what they got before?

produces findings. Name the persona and the action, trace it, and answer.

With no diff there is no *before*, so the reference becomes the promise. Name the persona and
the action the same way, follow the path end to end, and at each step ask what this code
promises its caller and whether it keeps that promise on the inputs that actually arrive. A
promise the code breaks is a finding whether or not anything changed recently.

## 5. Fan out, and brief properly

On the large rung, run the chosen passes as parallel subagents. They are read-only, so they do
not need the file-set check that writing agents do.

Give every pass the same three things, or it reports the wrong bucket's nits:

1. **The deployment context**, meaning what is Live, what is Dormant, the expected load, and
   why you know
2. **Its scope as a concrete command** it can run itself
3. **The named seams**, with instructions to trace callers and cite `file:line`

Require each pass to state where a path is **unchanged**, not only where it found something,
so the reader can tell thoroughness from luck. Do not let one pass suppress another: when two
flag the same line for different reasons, keep both and dedupe at verification.

## 6. Go deep where it matters

Breadth is the passes. Depth is one complete trace. Pick the single most consequential path,
the one most users hit or the one that touches money, data, or access, and follow it end to
end through the changed code, into the callees, and back out. Sampling hunks finds typos;
following one path finds the design mistake.

Run the project's own checks and read what they print. Do not fix what fails here: a failure
that was already there is a fact about the baseline, and one this change introduced is a
finding.

When that path leaves the repository, reading it is not enough. A wire format, a stored column
another service reads, the internals of a pinned library, a file another language parses: grep
stops at the boundary and the trace becomes a guess. Run the `/blast-radius` skill on that
path, unless the brief already carries its result for that path. It names the one fact the
change is safe because of and proves that fact by running code, which is rung 4 instead of
rung 2.

## 7. Verify, defaulting to refuted

Every candidate gets one adversarial check that tries to **kill** it, quoting the decisive line.

| Verdict | Meaning |
| --- | --- |
| `CONFIRMED` | You can name the inputs or the interleaving, and the wrong output |
| `PLAUSIBLE` | The mechanism is real, the trigger depends on timing, config, or scale |
| `REFUTED` | The code does not say that, or a guard elsewhere covers it. Quote it |

Refuting your own reasoning is the point: a round that never refutes anything has not checked
anything. Keep `CONFIRMED` and `PLAUSIBLE`.

## 8. Report

One numbered list, ranked by blast radius: correctness in the Live bucket first, cleanup in
code that runs nowhere last. Number every finding from `1` in a single flat sequence across
the whole report. The numbers are the handle the reader grabs to ask for fixes, so they have
to survive being pointed at: no per-section restarts, no letters, no gaps.

Each finding is one entry, and looks like this:

```
### 3. Retry releases a claim it no longer holds (`worker/claim.ts:88`)

`CONFIRMED` · Live · a retry can clear the claim another attempt already won, and the sweeper
then skips that row forever.

Two attempts land inside the same 50 ms window. The second takes the row; the first's
`finally` clears `claimed_by` without checking who holds it, leaving queued work nobody owns.
```

| Part | Rule |
| --- | --- |
| Title | The defect in a few words, then the `file:line` you opened in parentheses |
| Line under it | Verdict, bucket, one sentence: what breaks and for whom |
| Trigger | Inputs, state, or interleaving → the wrong output. Two or three sentences, and only when the line above does not already make the mechanism obvious |

Knowing the trigger is not optional, since step 7 does not pass without one. Writing it out is.

Keep the report to that list. No preamble, no background paragraph per finding, no proposed
patch pasted as a diff. A fix that needs an argument to justify it is a question for the
reader, not a subsection.

Report every confirmed defect rather than cutting the list to a round number: give the tail
one numbered line each. Where a real finding is out of scope to fix now, say so in its own
entry and say why. An honest deferral beats a half-built fix.

Close with two lines, not sections: what you traced and found unchanged, and what this review
could not reach. Name the load you assumed in one of them.

## 9. If you also fix

Run the `/resolve-review` skill on the list you just wrote. Its verdicts, its bar for what
counts as a defect, and its fix rules are the same whoever wrote the review, and keeping one
copy of them is how the two skills stay in step.

The reader picks work by number, as in "fix 2 and 5", so never renumber the list you are fixing
from. Then review the fixes. They are new code written under a lens narrowed to one problem,
and they are where the next round's worst findings come from.

## When to stop

Rounds end when the *character* of the findings changes, not when they stop arriving, since a
large change yields tail items forever. Stop when new findings are confined to dormant or
cosmetic code **and** your own fixes have stopped introducing regressions. If the last round's
fixes produced a new defect, review the fixes rather than run another broad pass.

The risk left then is usually the kind review cannot reach: untested paths, a migration that
has only met an empty database, code no human has read. Name which is still open instead of
running a round that will not find it.

## Rules

- Every claim cites a `file:line` you opened. Never from a filename, a diff header, or memory.
- A convention counts when you can quote the rule from a file the repository owns *and* the
  line that breaks it. Otherwise it is a preference, and preferences are not findings.
- The evidence rungs in `AGENTS.md` apply here without exception.
