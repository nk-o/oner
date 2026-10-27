---
name: commit-message
description: >-
  Writes the commit message for a staged change in Conventional Commits form: an imperative
  subject under fifty characters, a body only when the why is not in the diff, no filler and no
  attribution. Use before every `git commit`, whether the user asked for the message or the
  commit is a step in a run, and when asked to write or rewrite a commit message.
allowed-tools: Bash(git rev-parse *) Bash(git diff *) Bash(git log *) Bash(git status *)
---

# Commit message

- Branch: !`git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no commits yet)"`
- Recent subjects on the default branch: !`git log --format='%s' -15 origin/HEAD 2>/dev/null || git log --format='%s' -15 2>/dev/null || true`

Read `git diff --cached` before writing. With nothing staged, read `git diff` and the files the
caller named, and say which you took. Terse and exact, why over what: the diff already says
what changed.

## Subject

- `<type>(<scope>): <imperative summary>`, scope optional
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Imperative mood: "add", "fix", "remove", not "added", "adds", "adding"
- Under 50 characters when possible, hard cap 72
- No trailing period
- The recent subjects above set the convention: whether a scope is used, and the
  capitalization after the colon

## Body, only when needed

- Skip it when the subject is self-explanatory
- Add one for a non-obvious *why* or a linked issue
- Always add one for a breaking change, a security fix, a data migration, or a revert: the
  future debugger needs the context
- Wrap at 72 characters, bullets with `-`
- Issues and pull requests at the end as `Refs #17`. The closing keyword goes in the pull
  request body, because one in a commit closes the issue when the commit lands, finished or not

## What never goes in

- "This commit does X", "I", "we", "now", "currently". The diff says what
- "As requested by ..."
- "Generated with Claude Code" or any other AI attribution
- Emoji, unless the recent subjects use them
- The file name, when the scope already says it

## Examples

A new endpoint, with the why in the body:

```
feat(api): add GET /users/:id/profile

Mobile client needs profile data without the full user payload
to reduce LTE bandwidth on cold-launch screens.

Refs #128
```

Not `feat: add a new endpoint to get user profile information from the database`.

A breaking change:

```
feat(api)!: rename /v1/orders to /v1/checkout

BREAKING CHANGE: clients on /v1/orders must migrate to /v1/checkout
before 2026-06-01. Old route returns 410 after that date.
```

## Boundaries

This skill writes the message. Staging and committing are the caller's steps and come after
the message is ready. Hand it over as a code block, and when you are the one committing, use it
as written.
