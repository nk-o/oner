---
type: regex
target: { source: file, path: editor/preview.html }
pattern: '\.callout \{ background: #f6f8fa; border-left: 1px solid #d0d7de; padding: 8px 12px; color: #57606a; \}\s*</style>'
match: not_contains
---
