---
type: regex
target: { source: file, path: CHANGELOG.md }
pattern: 'refactor|\bsplit\b|module|store'
flags: i
match: not_contains
---
