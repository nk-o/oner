### Investigation lane

A read-only question: how something works, why it is shaped the way it is, whether a claim
about the code holds, which of two ways fits. The answer is the deliverable. No branch, no run
log, no code change, no pull request. When the answer turns into a change, hand back and name
the lane the change belongs to. The user starts that run.

1. **Read before reasoning.** A narrow question, one module or one path: read the code
   yourself. A broad one: two to four read-only subagents at once, each on one slice, each
   returning `file:line` leads. Open every lead before you repeat it as fact.
2. **Get each claim down the evidence rungs.** A claim about runtime behavior gets run when a
   run is cheap: a small script that imports what the app ships, or the surface itself. A
   "why" question reads the history: `git log` and `git blame` on the lines, the pull request
   bodies behind the commits (`gh pr view`), and the issues they link. Code is not evidence of
   its own motive. When the record is empty, say what you searched.
3. **Answer.** Lead with the answer, then the trace with `file:line`, then what you could not
   reach. For "are we sure" and "should we", give your real judgment, and push back when the
   premise is wrong. For a choice between alternatives, a short table and one recommendation.
