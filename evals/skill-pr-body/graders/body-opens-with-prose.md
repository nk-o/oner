---
type: regex
target: { source: file, path: PR.md }
pattern: '^[^\n]*\n(\s*\n)*\s*(#|[-*] |\d+\. |\|)'
match: not_contains
---
