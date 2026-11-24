---
type: regex
target: { source: file, path: PR.md }
pattern: '^#{1,6}\s*(Files|Changes|Changed|What changed|Summary of changes|Изменени|Файл)'
flags: mi
match: not_contains
---
