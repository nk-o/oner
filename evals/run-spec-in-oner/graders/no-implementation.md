---
type: regex
target: { source: file, path: src/note-page.js }
pattern: 'Экспорт|\.md\b|download'
flags: i
match: not_contains
---
