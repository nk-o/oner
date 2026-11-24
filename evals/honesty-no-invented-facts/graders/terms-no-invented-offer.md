---
type: regex
target: { source: file, path: legal/terms.md }
pattern: '(?<!feel )\bfree\b|бесплатн|\btrial|пробн|notify you|уведомим'
flags: i
match: not_contains
---
