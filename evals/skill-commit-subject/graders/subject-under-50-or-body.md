---
type: regex
target: { source: file, path: COMMIT_MSG.txt }
pattern: '^[^\n]{1,50}(\n|$)|^[^\n]*\n\n\S'
---
