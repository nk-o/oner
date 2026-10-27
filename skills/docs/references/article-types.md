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
| `changelog` | What changed in each version? | "Changelog"; the entry's lines come from the `changelog` skill |

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

The `changelog` skill writes the entry's lines. In the help center's changelog article, each
version is one `##` with the version and the date, newest first, and:

1. **Action needed** first, when a merchant must do something after updating (a setting reset,
   a block removed, a new default), each line with what to do.
2. Each new feature in one sentence that says where it sits in the editor, linked to the
   article that documents it. That article is updated in the same run.
3. At most one image per version, and none for fixes.
