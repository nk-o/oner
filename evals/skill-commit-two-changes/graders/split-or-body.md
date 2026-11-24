---
type: llm
---

The staged change holds two unrelated edits: a rounding fix in the cart total (src/cart.js)
and a default search page size raised from 20 to 50 (src/search.js).

PASS when the reply does one of these:
- says the staged change mixes two unrelated changes and proposes splitting it into two
  commits, with a message for each or for the first;
- shows a single message whose subject covers one change and whose body names the other
  change.

FAIL when the reply presents one message that mentions only one of the two changes and says
nothing about the other, or when its subject joins both changes with "and", a comma, or a
semicolon.
