---
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite]
---

Разбери ревью этой ветки.

1. Sale discount is applied twice per line (`src/checkout.js:8`). `line` already has the sale taken off, and `applyDiscount(line, salePercent)` takes it off again, so a 10% sale removes 19%.
2. `formatPrice` returns an empty string for a free order (`src/format.js:2`). It checks `!cents`, so an order of 0 cents shows no price at all.
3. `exportCsv` does not quote its fields (`src/legacy-export.js:2`). A customer name with a comma shifts every column after it.
4. A removed item is still charged (`src/checkout.js:7`). `removeItem` keeps the item with `qty: 0`, and `item.qty || 1` bills it as one.
