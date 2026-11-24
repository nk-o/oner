# Arena

An arena builds each direction several times and keeps the strongest version of it. One
attempt at a direction locks in the first shape its builder thought of; an arena gives the
direction several builders, a judge who has not seen how any of them worked, and a merge of
the best parts. The user still chooses among directions. The arena only decides which version
of a direction they see.

It multiplies the build of every direction by the number of candidates, so it runs only when
the user asks for it: an arena, several attempts per direction, or the best possible version of
each. Three candidates per direction unless the user names a count.

## Frame

1. Write each direction's brief as the rest of the skill does. The brief is the contract every
   candidate builds, so it names what the direction changes and that everything else stays as
   the product has it.
2. Write the rubric for the round: three to six criteria a reader can check on a screenshot,
   such as "the order number and its status read first at 390px", "no element without a job",
   "every value comes from the token scale in `DESIGN.md`", "the brief's change is carried to
   every state of the scenario control". Take them from the brief, `DESIGN.md`, and "Habits to
   question" in `frontend-design`. Candidates never see the rubric.
3. Give each candidate of a direction one emphasis inside the brief, such as the fewest
   elements, the strongest hierarchy, or the densest layout that still reads. Candidates given
   the same words converge on one design, so no two candidates of a direction share an emphasis.

Done when every direction has its brief, the round has its rubric, and every candidate has an
emphasis no sibling shares.

## Build the candidates

Each candidate writes its own mount file beside the direction's, such as
`<direction>.arena-<n>.js`, under the same `mount(stage, params)` contract, and reads the same
shared files. Where the host runs subagents, give each candidate its own, with the brief, its
emphasis, the shared paths it may read, the one file it may write, and the instruction to use
`frontend-design` and operate the candidate in a browser before returning. Start every
candidate of a round at once. Without subagents, build the candidates in order, reread the
brief and the emphasis before each, and do not open a sibling's file.

Then capture every candidate at the same width, with the same scenario, as
`<direction>-<letter>.png`, lettering the candidates in a shuffled order, so a name gives away
neither the builder nor the emphasis.

## Judge

The judge is a fresh read-only subagent. It gets the rubric and the lettered screenshots and
nothing else: no brief rationale, no emphasis, no build order. It scores each candidate on
each criterion as met or not met, with one line of evidence it can point to in the image, and
names the base it recommends. Without subagents, judge in a separate pass that reads only the
rubric and the screenshots.

When another vendor's model is available, it judges too:

```
{{skills_dir}}/prototype/arena-judge.sh <rubric.md> <verdict.md> <direction>-a.png <direction>-b.png ...
```

The script asks Codex, read-only, when Codex is turned on for `external-review` and installed,
and this session is not Codex. It prints the verdict file's path, or one line starting `skip:`
or `fail:` with the reason. A skip leaves the round to the first judge and is reported.

Two judges that pick the same base confirm it. When they disagree, read both verdicts
criterion by criterion. The rubric was ambiguous, or one judge misread an image. Pick the base
whose met criteria survive your own look at the screenshots, and write down why.

## Graft

Read each losing candidate once more for what is worth carrying into the base: usually one
or two things, such as a label, a spacing decision, or an empty state, not most of it. Fold each
one in by hand, so the direction keeps one structure. When the candidates converged on one
shape, there is nothing to graft, and the agreement goes into the report. When they diverged
wildly, the brief was underspecified. Rewrite it and run the round again rather than averaging.

The grafted result is the direction's mount file. Capture it again and check it against the
rubric and its brief as the rest of the skill checks a direction. Delete the candidate files
and keep their screenshots and verdicts in the decisions file.

Done when each direction's mount file is its grafted result and passes its brief and rubric
on a fresh capture.

## Report

For each direction, beside the comparison the skill already asks for: the base and why, each
graft with the candidate it came from, the judges' scores, any disagreement and how it was
settled, and a skipped second judge with its reason. The directions still go to the user
without a favorite.
