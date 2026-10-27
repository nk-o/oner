---
name: changelog
description: >-
  Writes a changelog entry from commit history, keeping only what a user of the product would
  notice. Use when asked for a changelog, release notes, or a version entry, or when an entry
  that already exists reads too technical. To publish entries in a help center, use `docs`.
argument-hint: "[version or tag range, and the file to write, when the project does not make it obvious]"
---

# Changelog entry

The reader is a user of the product, not a contributor. They open the changelog to answer one
question: what is different for me now. Every line has to answer that question, and a release
with three real lines is a release with three lines.

## 1. Find where the entry goes

Look for the file before asking for it, in this order: `CHANGELOG.md` at the root,
`release-notes.md` (a Shopify theme's notes for the Theme Store), a plugin readme
(`readme.txt` or `readme.md`), a docs site page under `content/**/changelog.*`, a changelog
route in the app. Then search the repository for the previous version string. Two files often
carry the same entries, and both are part of the release.

When `.claude/docs.json` names a help center, it publishes each release too.
Write the entry here and stop at the file. The `docs` skill's Changelog job puts it into the help
center later, and decides when it is published.

When the user named the file and the range, use them. When the search finds nothing, or more
than one candidate, ask once and list what you found.

## 2. Collect the changes

```bash
git describe --tags --abbrev=0
git log --format='%h %s%n%b' <previous-tag>..HEAD
```

Use `<previous-tag>..<tag>` for a release that is already tagged. Read commit bodies and merge
subjects, not only the first line. When a subject does not say what the user sees, open the
diff with `git show <sha>` before deciding.

The code and the changelog do not always live in the same repository. One release of a shared
library can feed several changelogs. The entry above yours tells you whether a second
repository feeds this file. A block for a paid tier, or lines about a shared framework, means
those changes come from somewhere else. Run the same range there.

## 3. Decide what survives

Two tests for every commit. Could the user notice this without being told? If you cannot name
what they see, there is no line. Would they miss the line if it were gone? A changed border,
spacing, icon, or notice style passes the first test and fails the second, so it goes into the
line of the feature it belongs to, or nowhere.

Keep a new capability, setting, block, or screen. Keep a bug they could have hit, described by
what went wrong for them. Keep behavior that changed under them: a new default, a removal, a
raised minimum version, anything that needs action on their side. Keep security fixes, in
plain words. Keep performance only when you can say what got faster.

Drop CI, dependencies, tests, linting, build tooling, and the development environment. Drop
refactors, renames, and moves, including internal APIs, unless third-party code calls them.
Drop documentation and comments, unless the doc page is the thing that shipped. Drop anything
no user can reach: dev-only flags, debug output, internal tooling.

Describe the release head, not the history. A bug introduced and fixed inside the range, and
a feature added and then removed or replaced inside it, never existed for the reader. Check
each line against the code at the head, because a line written when its pull request merged
goes stale when a later one changes the same thing. A fix that only matters on a platform
version not yet released is covered by the compatibility line and gets none of its own.

## 4. One line per outcome

Five commits building one feature are one line. A feature and the fixes to it before release
are one line, and the line names the feature. A line that needs "and" between two unrelated
things is two lines, or one line and one cut.

When several lines belong to one area the reader can skip as a whole, such as an experimental
feature or one product inside a bundle, put them under one parent line as a nested list, if
the file already nests lists or its renderer does.

## 5. Take the voice from the file

The entry directly above yours sets capitalization, the verbs in use, tense, date format, the
order of change types, the marker for a breaking change, and whether the file closes with a
catch-all such as "minor fixes and changes". Follow it exactly. Do not import a format from
another project.

Beyond that:

- Verb first, from the set the file already uses.
- Name things the way the interface names them. No file, class, function, hook, or option key.
  No library name unless the user chose that library.
- Say what changed for the user, then the condition it happens under.
- No bare "improved performance", "improved compatibility", or "polish". Name the thing that
  got faster, or the setup that now works.
- One sentence per line. Backticks only for something the user types or sees.
- Add a documentation link when the file already links out and a page explains the feature.

## 6. Commits turned into lines

| Commit | Entry |
| --- | --- |
| `fix(export): stop a concurrent export from breaking the CSV` | fixed report export producing a broken file when two exports ran at once |
| `perf(search): load only the results of the current page` | improved search speed on large projects |
| `feat(invoices): add recurring invoices`, plus four follow-up fixes | added recurring invoices |
| `fix(preview): match the sandbox policy in the embedded preview` | fixed the preview on sites that restrict embedded scripts |
| `chore(deps): move to eslint 10`, `ci: cut runner minutes`, `fix(i18n): add the missing translator comments` | no line |

What the rewrite removes each time is the mechanism. The CSV writer, the sandbox policy, and
the query count are how the fix works. The reader only needs the symptom that is gone.

## 7. Finish

Write the entry into every file that mirrors it. Take the version and the date from the
release being described, in the format the file already uses. Do not bump a version, create a
tag, or commit unless you were asked to. Done when the section reads the same in every mirror,
checked with a diff after the last edit to any of them, since a later fix to one file is where
the copies drift apart.

Then report: how many commits the range held, how many lines you wrote, and what you dropped,
grouped by reason with counts. Name the subject of anything borderline. That is how a line the
user wanted gets pulled back in.
