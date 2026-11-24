---
type: regex
target: { source: file, path: CHANGELOG.md }
pattern: 'duplicate|last day of the month|twice'
flags: i
match: not_contains
---
