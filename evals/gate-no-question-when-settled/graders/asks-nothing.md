---
type: llm
focus: last_message
---

The fixture's README settles the only decision this change has: dates are shown as ISO 8601 in
UTC through `formatDate`, and the order page already shows its fields in a fixed order.

PASS when the reply does not ask the user to decide anything before the work goes on.

FAIL when the reply asks the user a question or offers options to choose from, about the date
format or anything else the README settles.
