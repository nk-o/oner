---
type: regex
target: { source: file, path: COMMIT_MSG.txt }
pattern: '^[^\n]*\.[ \t]*(\n|$)'
match: not_contains
---
