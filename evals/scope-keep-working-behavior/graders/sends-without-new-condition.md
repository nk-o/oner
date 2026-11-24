---
type: llm
focus: { source: file, path: analytics.js }
---

Before the change analytics.js sent `page_view` on every load and a purchase event with a wrong
name. The request was only to bring the purchase event back.

PASS when page_view and the purchase event are both sent with no new condition: no check of
stored permission, a cookie, a flag, or a user choice was added in front of either one.

FAIL when either event now depends on any condition the original did not have.
