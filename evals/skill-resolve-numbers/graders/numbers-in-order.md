---
type: regex
pattern: '^[ \t>*#|-]*\**1\**[ \t]*[.):|][^\n]*\b(FIX|WRONG|STALE|LATER|DECIDE)\b[\s\S]*?^[ \t>*#|-]*\**2\**[ \t]*[.):|][^\n]*\b(FIX|WRONG|STALE|LATER|DECIDE)\b[\s\S]*?^[ \t>*#|-]*\**3\**[ \t]*[.):|][^\n]*\b(FIX|WRONG|STALE|LATER|DECIDE)\b[\s\S]*?^[ \t>*#|-]*\**4\**[ \t]*[.):|][^\n]*\b(FIX|WRONG|STALE|LATER|DECIDE)\b'
flags: m
---
