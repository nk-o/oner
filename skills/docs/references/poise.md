# Publishing to a Poise help center

The Poise MCP server is the way in, and its tool descriptions and `get_article_format` are the
reference for every field and block. Read those, not a copy here. This file holds only
the order a run takes through them and what the run keeps in its folder. Tools take `workspace`
when the user belongs to more than one, and the help center id from `.claude/docs.json`.

Check the session's tool list at the start of the run. Without `search_article_text`,
`edit_article`, and `publish_articles`, stop and tell the user. When `get_article` already
answers `editUrl` the server is current and the session started before its update: a new
session gets the new tools. A `get_article` without `editUrl` means a server older than this
skill: stop.

## Reading

Pull the tree the job touches with `list_help_centers` into `run.md`. For each article the
lookups below return, call `get_article` and save `live/<slug>.json` flat, in the tool's own
field names: `id`, `path`, `editUrl`, `hash`, `markdownSha256`, `state`, and `productRefs`
from the top level; `title`, `navTitle`, `slug`, `excerpt`, `seoTitle`, `seoDescription`, `keywords` from
`draft`; `url` from `published`. `meta.mjs` refuses a file that keeps `draft` nested. The body
stays in the help center: read it from the result and never write it into a file (see **What
the tools cannot do yet**). Never ask for `include: ["html"]`.

An article in state `changed` has edits someone made in the dashboard and has not published.
Read it again with `include: ["published"]`, show the user how the draft differs from the
published text, and write over it only after they say so.

## Finding the articles a change touches

Never read every article to find the ones that mention something. For each line of
`inventory-diff.txt`:

- `list_articles` with `productRef` for its reference, or a prefix ending in `*`.
- `search_article_text` for its interface label, its id, and the old label when the change
  renamed it, as one regex with alternatives where it can. It cuts a long line; an `oldText`
  comes from `get_article`'s draft, never from a cut line.

Follow `nextCursor` until it is `null`, write the first page's `total` and `scanned` into
`run.md`, and repeat a search that answers `complete: false` until it says `true`.
`search_articles` and `search_knowledge` rank by meaning and never prove an article untouched.

## Product references

A reference is `kind:identifier`: the inventory entry's category in the singular and its id, so
an inventory line turns into a reference without guessing, with one spelling per help center.
Every article a run writes leaves with the references of every inventory item it describes,
set with `set_article_product_refs` from what `meta.mjs` prepared. An article the run reads and
finds without references gets them in the same pass, so the next update finds it without a
text search.

## Limits

Every session and subagent of one MCP app shares the member's hourly budget (`search_article_text`
costs five calls of it) and its four calls in flight, so all lanes of a run together keep four calls going at most, and uploads run in one
lane. A refusal says what to wait for; wait, then send the same call again. A refused
`add_article_image` keeps its staged file: retry with the same `uploadId`.

## Writing

New articles go through steps 1 to 5 before the stop in step 7 of `SKILL.md`, which links each
one's `editUrl`. Updates of published articles go through steps 2 to 5 only after it, right
before the publish, so each article is written once.

1. **New articles first.** Create each new article with its title and the draft's `slug` and no
   body. Write its `id`, `hash`, `editUrl` and the `path` the answer holds into
   `live/<slug>.json`, so every link target has a path before any body is written.
2. **Prepare.** `node {{skills_dir}}/docs/scripts/body.mjs <run>` fills each `media/<file>`
   from `images.json` and each `[Title](article:<slug>)` with the target's path, drops
   `lint-ignore` comments, and writes `upload/<slug>.md` (whole bodies, with their checksum) and
   `upload/<slug>.edits.json` (updates). `node {{skills_dir}}/docs/scripts/meta.mjs <run>`
   writes `upload/<slug>.meta.json` with only the fields that differ from `live/<slug>.json`.
3. **Check for drift.** `get_article` with `ifNoneMatch` set to the hash in `live/<slug>.json`.
   `notModified` means nobody touched the article since the pull. Otherwise edits still go
   through `edit_article` with the new hash, since every `oldText` must match exactly and a
   rewritten fragment refuses the whole call; a whole body stops, and the user sees what changed
   before anything overwrites it.
4. **Write.** An update sends `upload/<slug>.edits.json` through `edit_article`. A whole body
   goes as a file: `create_upload` with `text/markdown`, `curl -X PUT` of `upload/<slug>.md`,
   then `update_article` with `markdownUploadId` and the printed checksum as
   `expectedMarkdownSha256`. Metadata goes from `upload/<slug>.meta.json`, references through
   `set_article_product_refs`. Every write answers a new `hash`, and the next write to the
   same article sends that one: write it into `live/<slug>.json` as soon as it comes back.
   Nothing is retyped from a draft into a tool call.
5. **Confirm.** A whole body's `markdownSha256` matches the checksum `body.mjs` printed. An edit
   has no copy to compare: `edit_article` applies every fragment or none, and `verify.mjs`
   checks the page after the publish. On a mismatch or `normalized: true`, read the article,
   compare it with the draft, and fix what changed the meaning.
6. **Publish** with `publish_articles` in reading order, and write each answered `url` into
   `live/<slug>.json`, which `verify.mjs` fetches.

A new article the user turns down at the stop is reworked as another write to its draft, or
deleted with `delete_article`. An update of a published article is never left as a draft for the
user to judge: no Poise tool restores a draft to its published version, and a reverse edit
cannot undo every fragment.

An article `edit_article` refuses because its Markdown cannot reproduce its content stays as it
is, and `run.md` lists the change for the user to make in the dashboard.

Images, recordings and files go up through the upload tools in one lane, and each returned URL
goes into `images.json` under its file name in `media/` at once. A file two articles share is
uploaded once. Annotations are the image's `<Frame>` tags; `screenshots.md` says which to use.
Leave `color` off the Frame, so the marks take the help center's accent.

A collection page's own text says what the collection is for and where to start; the page lists
its articles and child collections itself, so the text never repeats them. An image on the page
is uploaded through any article of the run with `add_article_image`, and its URL goes into the
page's Markdown.

## Links between articles

A link is the target's path, never its full URL: Poise opens full URLs in a new tab. The path
exists from the draft's creation, which is why new articles are created first. `verify.mjs`
finds a body link by the attribute Poise puts on it (`data-article`), because the sidebar links
every article of the collection and a bare `href` search always passes.

## What the tools cannot do yet

- **Export.** No tool writes an article's body to a file, and the public `<url>.md` is
  converted from the published page, so it is no copy of the draft. A run keeps no body of an
  existing article: an update goes through `edit_article`, and a full rewrite is a new body the
  writer authors, keeping the URLs of images that stay. Write this under `## Platform limits` in
  `run.md`.

When a step needs a tool the session lacks, the stop, or the report when there is none, lists
what the user does by hand in the dashboard, per article, and no article is published while its images or
metadata are missing.
