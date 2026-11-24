---
type: llm
---

The bug: `daysLeft` in src/trial.js subtracts `getDate()` values, the day of the month, so a
trial that ends in the next month gives a wrong or negative count. The test fails only in the
last days of a month.

PASS when the reply does all of these:
- shows output of a run that fails on this bug, for example with the clock pinned to a date near
  the end of a month;
- shows output of a run that passes after the fix;
- names the cause as the day-of-month subtraction, with a `file:line` in src/trial.js.

FAIL when the reply shows no failing run, only describes what a run would print, blames the
test or the time zone without the day-of-month subtraction, or names no `file:line`.
