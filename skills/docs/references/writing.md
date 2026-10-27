# Writing a help article

The sentence rules in `AGENTS.md` (**Talking to me**) apply to every article: one idea per
sentence, the same word for the same thing, no figure of speech, no sentence that would read
the same in another product, no colon splice, no intro that restates the title. The `humanizer`
skill's `references/PATTERNS.md` is the catalogue of machine-written tells. This file holds
what is different about a help article, and where it overrides those two. `lint.mjs` checks
the rules marked _(lint)_, with the rule id in brackets.

## The reader

- Write to one person, as "you", in the present tense. The product is the subject of a sentence
  only when it does something the reader sees: "The hero fills the screen".
- The reader already owns the product. Do not sell it _(lint: stock-word)_.
- The reader skims with the task half done in another tab. The first sentence under every
  heading is the action or the fact the heading promises, and the explanation follows it.
- Aim for about a seventh-grade reading level: short sentences, common words, no idioms, because
  many readers read English as a second language or through a translator.

## Saying something

- Say what a setting does on the page, then when to use it: "Stretches the image to the screen
  edges. Use it for photos without detail near the sides."
- Give the number. A range, a default, a limit, the image size that looks sharp.
- Explain a choice the reader has to make, not the mechanism behind it. Liquid, CSS, file
  names, and setting ids stay out, except where the reader types them.
- A value the reader types (a URL, a video link, a hex color, a handle) gets one valid example
  in code format and the formats it accepts.
- When the interface already says it, do not say it again. "Click **Save** to save your
  changes" is "Click **Save**."
- Say what the product cannot do where a reader will look for it: "There is no setting that
  turns dark mode off."
- Cut behavior the reader can neither change nor notice, however true it is.
- When a setting needs a minimum theme version, a plan, an app, or a staff permission, the
  first line of the article, or of its `##` part, says so: "Available in Acme 2.4 and
  later." It is a condition the reader must meet, not history.
- When the interface's own label or help text disagrees with the code, the article follows the
  code, and `run.md` lists the disagreement under **Findings for the product**.
- Any fact the sources do not hold stays out. "I could not confirm this" goes into `run.md`,
  never a plausible guess into the article. History and plans ("we added", "coming soon")
  stay out too.

## Words

- The interface's words, exactly. When the interface spells a word its own way ("centre"), the
  label keeps it, and the prose around it uses the word the way it would anyway.
- When merchants search for a different word than the label ("banner" for **Hero**), name it
  once in the first paragraph and once in `seo_description`, then use only the label. A title
  takes the reader's word, the verb they search for: when the interface says **Add** and readers
  say "install", the title says "Install" and the body names **Add** once.
- An icon without a visible label is named by its look and its tooltip: "click the gear icon,
  **Theme settings**".
- "Click" for a pointer, "select" for an option in a list or a menu, "turn on" and "turn off"
  for a checkbox or a switch, "enter" for text. Never "click on" _(lint: click-on)_.
- No softeners that judge the reader's effort: "simply", "easily", "basically"
  _(lint: stock-word)_, and "just" in the same sense.
- No filler, chatbot framing, or signposting _(lint: filler, chatbot, signpost)_. The title
  already says what the article covers.
- No design or typesetting terms in prose ("set in", "weight", "hover state", "color stop")
  unless they are the interface's label. Say what the reader sees: "thin letters", "when the
  pointer is over it".
- "A paragraph" or "a line of text", never "a text".

## Sentences

- A condition comes first: "If your logo is dark, turn on **Invert logo on dark backgrounds**."
- No em or en dash, not even in a range: "1 to 5" _(lint: dash)_. This overrides the
  catalogue in `humanizer`, which allows an en dash in a range.
- No exclamation marks _(lint: exclaim)_ and no rhetorical questions.

## Headings

- `##` for the article's parts and `###` inside them, nothing deeper, and no `#`, because the
  title is the H1 _(lint: heading)_.
- Sentence case, starting with the words that set the heading apart. No "Using", "About", or
  "How to" in front, and no two sibling headings that open with the same two words.
- A heading says what is under it ("Choose a height"), never a catch-all such as "Good to
  know", "Notes", or "Overview" _(lint: heading)_. Each fact goes beside the setting or the
  step it qualifies.

## Procedures

- Number the steps. A one-step procedure is a sentence, not a list.
- A procedure opens with the `start` steps from `.claude/docs.json`, word for word, links
  included, so every procedure begins somewhere the reader can reach in one click.
- One action per step _(lint: one-action)_. Say where, then what: "In the **Hero** section,
  select **Full screen** under **Height**."
- A step that opens something (a group, a picker, a panel) says what opens, so the next step
  has somewhere to start: "In the color picker that opens, ...".
- When the step's result is visible, say it in the same step, in its own sentence.
- An optional step starts with "Optional." Never mark it with parentheses.
- A choice is "If you want X, do Y." Do not fork the list into two procedures.
- Name places by their label, not by direction _(lint: direction)_.
- A table the reader needs during the steps, such as which swatch colors what, comes before
  the steps.
- The last step keeps the change, usually **Save**. When customers do not see the change right
  away, as with a theme that isn't published, say when they will.
- More than eight steps means two tasks. Split them and link one from the other.
- A stepper block, such as `<Steps>`, holds short stages only: a title and one or two lines
  each. When a stage carries several paragraphs, images, or links, every stage becomes a `##`
  heading numbered in order ("## 1. Connect your domain"), so the page's table of contents
  shows the path.

## Formatting

- Bold an interface label exactly as it appears. Punctuation goes outside the bold
  _(lint: bold-punct)_. A path through menus is "**Online Store** > **Themes**".
- Bold is for labels only, never for a lead-in to a paragraph. This overrides `AGENTS.md`,
  which allows a bold lead-in: in a help article a bold word reads as something to click.
- A table for settings, two or three columns, one setting per row. A list for parallel items a
  reader compares. Prose for everything else.
- When the reader picks among three or more layouts, presets, or values, a table with one
  column per option and one row per thing to weigh comes before the details, and marks the
  default or the recommended one when there is one.
- "Important." opens a paragraph that sits right before the step the reader cannot undo:
  losing changes, removing a section, publishing. "Tip." opens a paragraph right after the
  step it helps. A callout that holds the main point means the main point is in the wrong
  place.
- A callout block (`<Info>`, `<Tip>`, `<Note>`, `<Warning>`, `<Danger>`, `<Check>`) holds prose,
  never a bulleted or numbered list _(lint: callout-list)_. A list with no paragraph before it
  renders as bare bullets in a box. Several conditions become sentences in one or two
  paragraphs. A callout's `title` is optional: add one only when the callout reads worse
  without it, and never by habit, such as "Before you start" on every prerequisite.
- The article reads the same with every image removed. An image confirms, it never carries,
  and the text never points at one as the example _(lint: image-pointer)_.
- Link to another article by its title, at the first mention, inside the sentence. A related
  article goes at the end only when it is the reader's likely next task.
- The frontmatter's metadata follows the same rules as the body.
