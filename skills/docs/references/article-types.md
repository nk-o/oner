# Article types

Each article is exactly one type. When a draft needs two, it is two articles that link to
each other. The type goes in the frontmatter `type` field.

| Type | Answers | Title |
| --- | --- | --- |
| `how-to` | How do I get this result? | Verb and object, the reader's goal: "Change your theme colors" |
| `reference` | What does each part of this do? | The name the interface uses: "Hero section" |
| `guide` | Where do I start? | The outcome of the whole path: "Set up your store with Acme" |
| `concept` | How does this work, so I can decide? | The idea as a noun phrase: "How color schemes work" |
| `troubleshooting` | Why is this wrong, and how do I fix it? | The symptom in the reader's words: "My logo looks blurry" |
| `changelog` | What changed in this release? | The product and the version: "Acme 2.4.0"; the lines come from the `changelog` skill |

## how-to

1. One or two sentences: the result, and when the reader wants it. Not a restatement of the
   title.
2. `## Before you start`, only when something must be true first. A list of conditions, each
   a fact the reader can check.
3. The procedure. A long task splits into `##` parts named by their own goal, each with its
   own numbered steps.
4. What the reader sees when it worked, when that is not obvious from the last step.
5. One sentence linking the likely next task, when there is one.

One task per article. The main way to do it comes first. A second way goes under its own
heading only when readers need it.

## reference

Its structure mirrors the interface, so a reader with the editor open finds the part they are
looking at.

1. Two or three sentences: what the part is for on the page, and where it can be added.
2. One screenshot of the finished result, the most common configuration.
3. `## Presets` when it has more than one: with three or more, a table that compares them first; then one line each on what the preset is for, and a screenshot only
   when the presets look clearly different.
4. Settings, in the interface's order, under `##` headings named after the interface's own
   groups. A table per group:

   | Setting | What it does |
   | --- | --- |
   | **Height** | How tall the section is. **Full screen** fills the browser window. |

   Name the default and the range in the second column when the reader needs them to choose.
   A setting that appears only when another is on says so: "Shows when **Video** is on."
5. `## Blocks` when it holds blocks: each block in a line, with a link to its own reference
   when it has one.
6. A limit or an interaction a reader would trip over goes beside the setting it concerns.
   When it concerns the whole part, it gets a `##` heading that names it.

A reference describes. It does not instruct, beyond one sentence that links to the how-to for
adding the part. Settings that many parts share (spacing, motion) are described once in their
own reference and linked, not copied into every page. The exception is the setting the reader
opened the page for: a hero's background is shared with other sections, and it still belongs on
the hero's page, because that is what a merchant setting up a hero asks first.

Describe what the reader sees in each value, and where on the page it lands, rather than what
the value is called: "puts the buttons on the left and the paragraph on the right", not
"places the copy along the bottom".

## guide

One path from nothing to a visible result, with no alternatives. Each `##` part ends with
something the reader can see. It links to how-tos and references instead of repeating them.

## concept

Prose and, where it helps, one diagram or comparison table. No steps. It ends with links to
the how-tos that use the idea.

## troubleshooting

The title is the symptom in the reader's words, and an on-screen message quoted exactly.

1. The first `##` rules out what isn't the product: an app's code, the browser cache, a theme
   that isn't published, editing a different theme than the live one.
2. Then one `##` per cause, most likely first. Each says how to recognize it and the fix, as
   steps when the fix takes more than one action, simplest fix first.
3. The last `##` is "Contact support", with what to send: the product version, a preview link,
   the page's URL, and a screenshot.

## changelog

The `changelog` skill writes the lines. On Poise each release is its own entry in the help
center's Updates section, created by the **Article** job with the release's `date` and
`version`. Elsewhere the help center keeps one changelog article, each version one `##` with the
version and the date, newest first, in the same order as below. An entry holds, in this order:

1. **A lead** of one or two sentences: what the release is about, then what a merchant must do
   after updating when there is anything (check a renamed setting, replace a removed block),
   then a link to the article on updating.
2. **An image** of the change a merchant will see first, when one exists. It is welcome, not
   required, and a release of fixes alone has none. A phone screenshot goes in a narrow
   `<Frame>`, several looks side by side in a `<Gallery>`.
3. **Every main change** in a `<Changes>` block, so the Updates feed shows it without a click.
4. **`<More />`, then the rest** in a second `<Changes>` block. The feed folds what is below
   More behind one "Show N more changes" line. Leave More out when every change is main.

A change is main when a merchant would look for it or has to act on it: a feature they would
use, a different look or behavior of something they already set up, every removal, and a fix
of a bug many stores hit. A refinement to one section, a small visual tweak, and a fix of a rare
or cosmetic bug go below More. When the main block passes about a dozen lines, the cut is too loose.

Each line takes the kind of change, and the feed writes the kind's word over each run of lines:

- `new`: something the product could not do before.
- `improved`: something that existed works or looks better, with nothing for the merchant to do.
- `changed`: something that existed behaves differently in a way the merchant should check,
  such as a renamed or moved setting, a new default, or a new layout of what they set up.
- `removed`: gone. The line says what happens to the sections that used it.
- `fixed`: a bug, named by what the merchant saw go wrong.

Order the lines of a block by kind, in the list's order, so each word appears once. A new
feature's line ends with a link to the article that documents it, and that article is updated
in the same run. `get_article_format` has the syntax of every block named here.
