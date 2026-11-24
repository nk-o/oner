---
type: regex
target: { source: file, path: rating.html }
pattern: '<h1(?:(?!</h1>)[\s\S])*<svg'
match: not_contains
---
