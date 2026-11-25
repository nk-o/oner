---
type: regex
target: { source: file, path: app/customer-panel.html }
pattern: '\.site-row \{ display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var\(--line\); \}\s*</style>'
match: not_contains
---
