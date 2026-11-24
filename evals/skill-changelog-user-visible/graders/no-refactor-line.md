---
type: regex
target: { source: file, path: CHANGELOG.md }
pattern: 'refactor|\bsplit\b|module|\bstore\b'
flags: i
match: not_contains
---
