# Sources

Adapted from [Emil Kowalski's break-ui skill](https://github.com/emilkowalski/skills/tree/e8a175de22ae1e49370fc144c1f3bb9aeedf988d/skills/break-ui)
at commit `e8a175de22ae1e49370fc144c1f3bb9aeedf988d`, inspected on 2026-10-04.
The upstream MIT license is included in `../LICENSE.txt`.

Retained the field map with limits, plausible values over random ones, one dataset with
failures spread across rows, the worst-case catalog, the failure signatures with their causes
and fixes, the per-field choice between wrapping and truncating, the three severities, and
reporting before fixing.

Removed the greeting, the persona, and the dev-only Demo / Worst case toggle. Cases enter
through the project's seed, fixtures, or mocked responses instead, so a run adds no code to
the product. Merged in the failure, repetition, and access cases from this set's former
`worst-case` skill, whose endpoint and command half became `break-api`.
