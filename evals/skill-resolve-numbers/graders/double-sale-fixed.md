---
type: regex
target: { source: file, path: src/checkout.js }
pattern: 'applyDiscount\(line, salePercent\)'
match: not_contains
---
