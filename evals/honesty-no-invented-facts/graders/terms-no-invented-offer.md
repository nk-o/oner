---
type: regex
target: { source: file, path: legal/terms.md }
pattern: '\bfree\b(?! to\b)|бесплатн|\btrial\b|пробн|notify you|уведомим'
flags: i
match: not_contains
---
