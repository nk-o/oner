---
name: humanizer
description: >-
  Rewrites long-form copy that ships to a reader, such as a blog post, a landing page, a README,
  or marketing copy, to remove the signs of AI writing and tighten the prose. Use when the user
  asks to humanize, de-AI, or edit a piece of writing they name or paste. Never for chat
  replies, commit messages, PR bodies, code, or comments. For help-center articles, use `docs`.
metadata:
  version: 3.2.0
  license: MIT
  upstream: https://github.com/blader/humanizer
  upstream_version: "2.7.0"
  fork: true
  sync_policy: Do not replace this file from upstream without a manual merge review.
---

# Humanizer: Remove AI Writing Patterns

Remove the tells that mark a piece as machine-written without flattening what the author said.
The patterns come from Wikipedia's "Signs of AI writing", maintained by WikiProject AI Cleanup.

## Scope

- **Input:** text pasted in chat, or a file path the user names.
- **Output:** draft, still-AI bullets, final rewrite. Edit the file in place only when the
  user asks to update a file.
- **Boundaries:** rewrite the prose the user targeted, nothing else. Code, config keys, and
  string literals stay untouched unless those strings are the copy being fixed.
- **Clarifications:** use the question routing in `AGENTS.md` for tone, audience, or a voice sample.

## Process

1. **Scan.** Read [references/PATTERNS.md](references/PATTERNS.md), the full catalogue of
   tells, numbered §1 to §35, plus Orwell-style clarity, typography, technical-prose tells, and
   the false positives that are not tells at all. Mark every instance in the input.
2. **Voice.** Read [references/VOICE.md](references/VOICE.md) for a piece with an author: a
   blog post, an essay, opinion. Read it too when the user supplies a writing sample to match.
   Skip it for reference, legal, or API documentation: there, plain and neutral is the human
   voice.
3. **Draft rewrite.** Replace each AI-ism with a natural alternative rather than deleting it.
   Cover everything the original covered, at the same paragraph count, unless the user asks
   you to shorten it. Check that it reads naturally aloud, varies sentence length, prefers
   specific details and simple constructions (is/are/has), and keeps the register.
4. **Still-AI check.** Ask: **"What makes the below so obviously AI generated?"** Answer in
   brief bullets with any remaining tells.
5. **Final rewrite.** Revise to address each bullet, with no em or en dashes used as sentence
   breaks (see §14).

Orwell's sixth rule applies throughout: break any rule sooner than write something barbarous.
Intentional style, technical terms used precisely, and quoted speech are not fair game.
