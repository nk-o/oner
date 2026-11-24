---
type: regex
target: { source: file, path: COMMIT_MSG.txt }
pattern: '^(feat|fix|refactor|perf|docs|test|chore|build|ci|style|revert)(\([^)]+\))?!?: \S'
---
