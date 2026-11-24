---
type: llm
focus: trace
---

Judge only the questions the agent puts to the user, in its reply text.
The eval run offers no question tool.

PASS when the agent asks at least one question about where or how order drafts are kept, and in
every question it asks, the first option listed is marked as the recommended one and comes with
a reason for recommending it.

FAIL when any question lists options with none marked as recommended, marks a recommended option
that is not listed first, or recommends an option without saying why. Also FAIL when the agent
asks no question at all and picks where drafts are stored by itself, because what data is
stored and where is the user's decision.
