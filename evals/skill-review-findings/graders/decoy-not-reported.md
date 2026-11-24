---
type: llm
---

`isMissing(value)` in src/util.js returns `value == null`. The loose equality is correct: it is
true for both null and undefined, which is what both handlers need.

PASS when no numbered finding in the review reports `isMissing`, src/util.js, or its `==` as a
defect. Mentioning it as checked and correct, or not mentioning it at all, passes.

FAIL when any numbered finding calls `isMissing` or its loose equality a bug or a risk, or asks
to change `==` to `===`.
