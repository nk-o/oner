---
name: break-ui
description: >-
  Renders a screen or component with the worst realistic data it can receive, such as long
  names, unbreakable emails, one-letter names, missing fields, huge counts, empty lists, and
  failed requests, in the running product, and reports what broke with a fix for each. Use
  before shipping a new or changed screen, form, or component, when asked to stress-test it or
  what happens with a long name or an empty list, and in the Verify step of a oneshot run. For
  an endpoint, job, or command, use `break-api`.
argument-hint: "[screen, route, or component; defaults to what this branch changed]"
---

# Break the UI

The target is what the user named, or every screen this branch changed that a user sees. A
screen gets built against demo data that fits: names on one line, counts with no separator,
every optional field filled. This skill renders it with the data real users bring.

Two ways this goes wrong. Nonsense data, such as forty `a`s or a 5,000-character name the
column cannot hold, proves nothing and gets dismissed. Stopping at long text misses what
ships broken more often: the one-letter name, the missing avatar, "1 members", the empty
list, the translated badge.

## 1. Map the surface

List every value the screen renders, with where it comes from and what bounds it:

| Field | Source | Limit | Optional |
| --- | --- | --- | --- |
| name | `member.name` | 255, `schema.ts:14` | no |
| email | `member.email` | unbounded | no |
| role | `member.title` | 120 | yes |
| status | enum `active` / `invited` / `expired` | | no |
| count | `workspace.memberCount` | | no |

Include the values people forget: counts in headers, relative timestamps, badge and status
text, labels that come from data, tooltips, images, and the list itself, whose length is a
value too. Take limits from the validation schema, the column type, the API types, and
`maxlength`. Where the form and the column disagree, the longer value arrives through an
import or the API, so test the longer one. A field with no limit anywhere is itself a finding,
and its case becomes whatever a user can paste.

## 2. Pick the cases

Pick values for each field from [`references/catalog.md`](references/catalog.md). Every
value is either something a real user could produce or the exact limit from step 1.

Build one worst-case dataset shaped like the existing demo data. Spread the failures across
the rows a user sees first, as real data does: the long name in row 1, the long email in row
2, the one-letter name in row 3, a missing avatar in row 4. Then add the cases one dataset
cannot hold:

| Axis | Cases |
| --- | --- |
| Count | zero items, exactly one (every count at 1, for plurals), page size and page size + 1, the most rows a real account reaches |
| State | loading, each error the backend returns, a slow response, partial data, every enum value in one list |
| Space | the component's real container width, the narrowest supported width, the widest layout, 200% zoom, the longest shipped translation |
| Environment | dark mode, RTL, and touch, each only when the product supports it |
| Repetition | double submit, back after submit, the same record open in two tabs |
| Access | a role that can see but not edit, the current user in the list |

Take only the rows the change reaches. A new label needs its longest value and Space. A new
list needs most of the table. Two cases that run the same code path are one case.

## 3. Render them on the real screen

The data enters through the same boundary the demo data does: the **Seed** section of the
project's `verify-<app>` skill, a fixture, a factory, a mocked response, the API. Force a
failure outside the code under test, through browser offline or throttling or the project's
own request mocking. Never edit the component's markup or CSS to produce a break. That tests
the edit, not the component.

Screenshot each case at each width that matters. Without browser tooling, reason from the
CSS and mark which findings were seen and which were inferred.

## 4. Look for breaks

Read every screenshot against this table. The cause on the right is almost always the one.

| What the screenshot shows | Cause | Fix |
| --- | --- | --- |
| Avatar or icon squeezed into an oval | Flex child shrinking | `flex-shrink: 0` on fixed-size boxes |
| Text overflows its box | Flex or grid child keeps `min-width: auto` | `min-width: 0` on the text column, `minmax(0, 1fr)` in grid |
| Email or URL runs past the edge | No break opportunity in the string | `overflow-wrap: anywhere` on that element |
| Trailing menu or button pushed off screen | Middle content took the space | `min-width: 0` on the middle, `flex-shrink: 0` on the action |
| Badge wraps onto two lines | Badge allowed to shrink | `white-space: nowrap; flex-shrink: 0`, and decide what yields instead |
| Avatar floats beside a three-line name | `align-items: center` on rows that wrap | Top-align once text can wrap |
| Wrong initials, or `�` for an emoji-first name | `split(' ')[0][0]` | Graphemes through `Intl.Segmenter`, first and last word, an icon fallback |
| Stray `—` or an empty line where an optional field was | Placeholder for a missing value | Omit the line, or reserve its height on purpose |
| "1 members", "0 member" | Hardcoded plural | `Intl.PluralRules` or a string per count |
| `1284`, `0.30000000000000004`, `NaN`, `undefined` | Raw number rendered | `Intl.NumberFormat` in the user's locale, guard null |
| Numbers jitter as they update, columns misalign | Proportional figures | `font-variant-numeric: tabular-nums` |
| Translated button label overflows | Fixed `width` | Width from content with a `min-width` |
| Diacritics or tall scripts clipped | Tight `line-height` with `overflow: hidden` | Looser `line-height`, no clipping on text boxes |
| Broken-image icon, or a stretched photo | No load-error fallback, no `object-fit` | Fall back to initials, `object-fit: cover` |
| Ellipsis with no way to read the rest | `text-overflow: ellipsis` alone | A tooltip or `title`, and the full value in a detail view |
| Last row cut mid-glyph | Fixed height with no scroll affordance | A visible scrollbar or fade, and intended `overflow` |
| Raw `<b>`, `&amp;`, or `**text**` | Escaped at the wrong layer | Escape once, at render |
| Scrolling 1,000 rows stutters | Every row rendered | Virtualize or paginate |
| Action reachable only on hover | Hover-only reveal | Show it on touch and on keyboard focus |

Every long string forces a choice, made per field:

- **Wrap** what identifies the item: names, titles in a detail view. Two lines is fine; four
  means the column is too narrow.
- **Truncate at the end** secondary text whose start carries the meaning: role, description,
  a message preview. Always with a way to see the rest.
- **Truncate in the middle** values that differ at the end: file names, paths, hashes, emails
  on one long domain.
- **Clamp** multi-line previews in cards, so card heights stay predictable.
- **Never truncate** numbers, amounts, dates, or anything the user compares.

## 5. Report

One table, one row per case, worst first:

| Case | How it was produced | Result | Fix |
| --- | --- | --- | --- |
| 64-character email, no spaces | member row in the seed, 360px | Broken: the row menu leaves the screen, `MemberRow.tsx:18` | `min-width: 0` on the text column, `flex-shrink: 0` on the menu |
| Count of 1 | workspace with one member | Ugly: "1 members", `Header.tsx:9` | `Intl.PluralRules` |
| Name | schema and form | Fragile: no limit anywhere | a matching limit in both, a decision below |
| Empty list | new account from the seed | holds | |

A result is `holds`, a severity with what the user sees and its `file:line`, or
`not reached: <why>`. **Broken** means content unreadable, an action unreachable, or wrong data
shown. **Ugly** means readable but visibly wrong. **Fragile** means fine now and one realistic
step from breaking, such as a missing limit or fallback. Not reached is not a pass. Under the
table, say what produced the evidence (the browser tool's viewport, an emulated device, a real
device, a mocked response) and what stayed untested.

Then list the decisions a fix would make: wrap or truncate a field, what an empty optional
field shows, paginate or virtualize, a new length limit. One line each, with a recommendation
and its reason. Changing what the boundary admits changes what a user can do, so it is the
user's call, not a fix.

A break is a finding, not an edit. Run alone, the report goes to the user, and
`resolve-review` fixes what they pick. Inside a oneshot run, every Broken, Ugly, and Fragile
row joins the review's findings for Resolve. After a fix, render the demo data again too, since
a fix for the worst case must not break the ordinary one.
