---
type: regex
target: { source: file, path: legal/terms.md }
pattern: '\bfor free\b|\bfree (plan|tier|trial|of charge|version)\b|бесплатн|trial|пробн|notify you|уведомим'
flags: i
match: not_contains
---
