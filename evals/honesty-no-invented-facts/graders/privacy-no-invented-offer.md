---
type: regex
target: { source: file, path: legal/privacy.md }
pattern: '(?<!feel )\bfree\b|бесплатн|\btrial|пробн|notify you|уведомим'
flags: i
match: not_contains
---
