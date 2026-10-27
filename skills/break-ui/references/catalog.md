# Worst-case catalog

Realistic values that break UI, grouped by the kind of value a screen renders. Take the rows
that match the fields from step 1. Each note says what the value tends to break.

Use `example.com`, `example.org`, or `.test` domains in emails and URLs, so a fixture never
points at a real inbox or site.

## People and names

| Value | Breaks |
| --- | --- |
| `Aleksandra Wiśniewska-Kowalczyk` | Long, hyphenated, diacritics. Wraps to two lines, and the hyphen is a break point |
| `Christopher Alexander Montgomery III` | Suffix. Naive first and last initials give `CI` |
| `Jo` | Two letters. Leaves the column mostly empty, naive initials give `J` |
| `J` | One letter. A tiny click target when the name is the link |
| `Đặng Thị Ngọc Hân` | Stacked diacritics. Clipped by a tight `line-height` with `overflow: hidden` |
| `王秀英` | CJK with no spaces. "First and last word" initials find one word, and CJK breaks anywhere |
| `نور الهدى عبد الرحمن` | RTL. Punctuation and icons land on the wrong side without `dir="auto"` |
| `Seán O'Brien-Ó Súilleabháin` | Apostrophe and accents. Escaping, initials, search |
| `María José de la Cruz y Fernández` | Lowercase particles. Initials and sorting by last name |
| `dana` | All lowercase. Initials should still be uppercase |
| `🦊 Fox` | Emoji first. `charAt(0)` returns half a surrogate pair |
| `👩🏽‍💻 Priya` | ZWJ sequence. `length` is 7 or more, and slicing splits it |
| `  Sam   Lee ` | Extra spaces. Initials from empty words, odd gaps |
| *(missing)* | Only an email. The screen needs a fallback |

## Emails, URLs, identifiers

These have no spaces, so the browser has nowhere to wrap them.

| Value | Breaks |
| --- | --- |
| `bartholomew.fitzgerald@northwind-industries-holdings.example.com` | Pushes every sibling off the row without `overflow-wrap: anywhere` |
| `a@b.co` | A layout that assumed a long email looks empty |
| `first.last+billing-notifications@example.com` | Plus addressing. Validation that rejects `+`, truncation that hides the meaningful part |
| `https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved` | Overflow, and end truncation hides the part that differs |
| `9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f` | UUID. Monospace width, a middle-truncation candidate |
| `Q3 Board Deck FINAL (revised) v12 [approved].pdf` | End truncation hides the version and extension |
| `IMG_20250914_183022_HDR_portrait_edited_edited.HEIC` | Unbreakable camera file name |
| `@a` and the longest handle the schema allows | Handle extremes |

## Labels, titles, and copy from data

| Value | Breaks |
| --- | --- |
| `Senior Product Design Engineer, Platform Infrastructure` | Wraps to three lines in a secondary slot |
| `Invitation expired 12 days ago` | A long status badge wraps or squeezes the name |
| `Benachrichtigungseinstellungen` | German compound, 30 characters with no space |
| `Paramètres de confidentialité et de sécurité` | Translated copy runs about 30% longer |
| Twelve tags on one item | A wall of tags that needs a `+8` overflow |
| One tag named `customer-feedback-from-enterprise-onboarding` | One tag wider than its container |
| `Untitled`, an empty string, `   ` | A collapsed heading, a zero-height row |
| `<script>alert(1)</script>`, `&amp;`, `**bold**` | Must render as literal text |
| A newline inside a single-line field | Doubles the row height, or is dropped silently |
| A 2,000-character pasted description | Clamping, "show more", textarea growth |

## Numbers and money

| Value | Breaks |
| --- | --- |
| `0` | Zero states, an empty progress bar, division by zero in a percentage |
| `1` | Plurals: "1 members", "1 days ago" |
| `1284` | Needs a thousands separator |
| `1000000` | Badge width. A compact `1M` where precision does not matter |
| `12345678.9` as currency | Overflows a totals column |
| `-42.5` | The negative sign, red color logic, accounting parentheses |
| `0.1 + 0.2` | `0.30000000000000004` rendered raw |
| `142%`, `-3%` | Bars and meters past their bounds |
| `null`, `undefined`, `NaN` | Rendered literally |
| `1.284` in `de-DE` against `1,284` in `en-US` | Hardcoded separators |
| A live value going from `99` to `100` | Width jump without `tabular-nums` |

## Collections

| Value | Breaks |
| --- | --- |
| 0 items | The empty state, and whether one exists |
| 1 item | A grid that looks broken with one card, "1 of 1" |
| Exactly the page size, and one more | "Showing 40 of 40", an empty page 2 |
| 1,000 or more items, unpaginated | Scroll performance, render time, "Showing 40 of 1,284" |
| One item ten times the size of the rest | Rows stretching to the tallest item |
| Items with identical names | Lists where the name is the only difference |

## Time

| Value | Breaks |
| --- | --- |
| Now | "0 seconds ago" instead of "just now" |
| 12 days, 11 months, 3 years ago | Relative-time thresholds. Switch to an absolute date after a week or so |
| A future date | "in 3 days" against "-3 days ago" |
| `1970-01-01` | A zero timestamp shown as a real date |
| `2025-12-31T23:30:00-08:00` | A different day in UTC and in the user's timezone |
| `1,284 hours` | A duration that never rolls up to days |

Format with `Intl.RelativeTimeFormat` and `Intl.DateTimeFormat`, not hand-built strings.

## Images and media

| Value | Breaks |
| --- | --- |
| An avatar URL that returns 404 | A broken-image icon instead of the initials fallback |
| No avatar | The fallback itself: initials, color, the same size as a real avatar |
| A 4000×200 panorama, a 200×4000 strip | Distortion without `object-fit: cover`, a card blown out in height |
| A transparent or dark logo in dark mode | Invisible on the background |
| A slow image | Layout shift without fixed dimensions or `aspect-ratio` |

## States

| Value | Breaks |
| --- | --- |
| Loading | A skeleton that does not match the final layout, a spinner that shifts content |
| An API error | No error state, or a raw `TypeError` shown to the user |
| Partial data | Some optional fields filled and others not, in one list |
| Every status at once | Badge widths vary across `active`, `invited`, `expired`, `suspended` |
| No permission | Disabled actions. Does the row still lay out the same? |
| The current user in the list | A "You" label, actions that should not apply to yourself |

## Environment

Not data, but checked the same way: render the worst case, then change these.

| Condition | Breaks |
| --- | --- |
| The narrowest supported width | Every overflow above, at once |
| A narrow sidebar placement | A component built full width, reused in a 280px column |
| The widest layout | Lines too long to read, content stranded on one side |
| 200% zoom or a large text setting | Fixed heights that clip growing text |
| Dark mode | Hardcoded colors, invisible borders and logos |
| `dir="rtl"` | Icons, chevrons, padding, the order of trailing actions |
| A touch device | Actions revealed only on hover are unreachable |
