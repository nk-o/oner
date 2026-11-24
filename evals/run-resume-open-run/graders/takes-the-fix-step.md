---
type: llm
focus: { source: file, path: src/date.js }
---

The run log's first open step is Fix. Its cause: `relativeDate` rounds the difference in
milliseconds, so a date from 22:00 the previous evening reads as today at 09:00 the next morning.

PASS when `relativeDate` now compares calendar days, so `relativeDate(new Date('2026-03-09T22:00:00'), new Date('2026-03-10T09:00:00'))` returns 'вчера' and a date from 07:00 the same morning still returns 'сегодня'.

FAIL when the function is unchanged or still decides by rounding the millisecond difference.
