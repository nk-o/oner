---
type: llm
---

The user asked to think through an idea, reminders for notes, and wanted only a short task with
a rough list of features, no spec and no plan.

PASS when all of these hold:
- the reply recommends one way to build reminders and gives the reason for that choice, for
  example in its first lines;
- it holds a short task description with a rough feature list;
- it is not a spec or a plan: no acceptance criteria section, no staged plan with checkboxes, no
  file-by-file implementation steps.

FAIL when the reply has no recommendation, gives a recommendation without a reason, or delivers
a full spec or plan.
