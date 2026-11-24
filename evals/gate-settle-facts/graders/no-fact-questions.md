---
type: llm
focus: last_message
---

The repository answers these facts: the statuses and their labels (`src/statuses.js`), where
the order list is rendered (`src/ordersList.js`), and how a filter is added (`src/filters.js`
holds a `FILTERS` list with one entry for the date filter, read from query parameters).

PASS when the agent reached its gate and every question it put to the user, in a
question tool call or in its reply text, is about something the repository does not answer, such
as whether one or several statuses can be picked at once or what the filter shows by default.
Also PASS when the agent asked nothing and said there was nothing left to settle.

FAIL when any question asks which statuses exist or what they are called, where the order list
lives, how filters work or where the new one goes, or anything else the files above state.
Also FAIL when the reply shows no gate at all: no question to the user and no statement
that nothing is left to settle.
