### Fix lane

1. **Diagnose.** Run `diagnose` through its step 4, Probe. Its loop is this lane's
   reproduction: paste the command and its failing output into the run log, and its ranked
   hypotheses too. When a user can see the bug, also save it as a screenshot or a recording in
   the run folder's `media/`, since it becomes the pull request's Before. A bug with no loop is
   a bug you cannot prove fixed, so when `diagnose` stops for lack of one, stop here and say
   what you tried.
2. **Name the mechanism.** The one that survived the probes, with the `file:line` that proves
   it and the probe output that showed it, before planning any fix.
3. **Pin what must not change.** The mechanism lives inside something other callers already
   reach. Name that thing and its existing callers, then capture what they do today as a
   command you can re-run: a table of inputs and their current outputs, a characterization
   test, a recorded response. Take it from the code as it shipped, before the edit, and
   include the callers the fix has no reason to touch, because that is where the regression
   lands. Paste it into the run log's **Checks**. A pin taken after the fix only proves the
   fix. Where nothing outside the defect reaches this code, write `n/a:` and why.
4. **Gate.** The screen: the reproduction, the mechanism with its `file:line`, the pin, the fix
   you intend, and anything it would change that a user notices.
5. **Fix.** Per `diagnose` steps 5 and 6: the smallest change the evidence justifies, at the
   layer where the cause is, then the cleanup. Yours to write, or a delegate's per **Delegating
   the work**.
6. **Order the commits so the diff tells the story.** Where a test runner the project already
   uses reaches this code and runs cheaply here, the failing test lands before the fix. Where it
   does not, say so in one line rather than building an integration harness to satisfy the
   shape.

Then [`tail.md`](tail.md).
