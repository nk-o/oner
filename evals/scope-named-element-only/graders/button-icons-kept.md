---
type: regex
target: { source: file, path: rating.html }
pattern: '<button(?:(?!</button>)[\s\S])*<svg'
match: "count:2"
---
