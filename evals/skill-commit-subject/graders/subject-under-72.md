---
type: regex
target: { source: file, path: COMMIT_MSG.txt }
pattern: '^[^\n]{73,}'
match: not_contains
---
