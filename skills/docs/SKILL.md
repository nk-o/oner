---
name: docs
description: >-
  Writes and maintains a product's help-center articles for its users: one article, an update
  after a code change or a release, a change to the help center's tree of collections and
  articles, a changelog entry published there, and, once per product, the whole set. Use when
  asked to write, update, review, or restructure help-center articles, or to refresh them after
  a release. For a README or a repository's own docs, use `humanizer` or edit them directly. For
  the text of release notes alone, use `changelog`.
argument-hint: "[the article, the change or release range, or the structure to change]"
---

# Docs

The reader is a user of the product in the middle of a job: a merchant who wants the hero to
play a video, not a developer who wants to know how the hero is built. Every article answers
one question that reader has, in the words the product's interface uses, and stops when the
question is answered. A page that describes everything the code can do, in the order the code
does it, is not documentation. It is the code read aloud.

## Where things live

The help center is the only home of published docs. The repository keeps no copy of them.

A run works in `.specs/NNN-docs-<slug>/` in the product's repository, numbered and ignored the
way the `spec` skill's Location section says. Nothing in the folder is committed. A folder whose
`run.md` reads `Status. running` or `waiting` is a run in progress: continue from its first
open checklist line instead of opening a second one.

```
run.md              job, status, the article checklist
inventory.json      the product's inventory command output
inventory-before.json  Update: the same at the older end of the range
inventory-diff.txt  Update: what changed between the two ends of the range
live/<slug>.json    an article's id, hash, checksum, path, url, and metadata as pulled; each write
                    replaces its hash, and a publish adds the url
live/<slug>.md      its body, only where the platform exports one to a file
articles/<slug>.md  a new article or a full rewrite, with frontmatter metadata
edits/<slug>.json   an update of an existing article: fragments, metadata, product references
images.json         the URL each uploaded file in media/ got
upload/             what body.mjs and meta.mjs prepared for each write
shots.json          the shot list
media/              screenshots, recordings, and each shot's boxes
```

No model retypes the body of an article that already exists. A search finds it, an edit
changes a fragment of it, and a write sends a file a script prepared. A model reads a body and
writes new sentences; copying the rest is a script's job, because a copy made by a model drops
an indent, a URL character, or a line, and nothing notices until a reader does. Where the
platform has no tool for a step, such as exporting a body to a file, write it in `run.md` under
`## Platform limits` and in the report as an offer to the user, and take the path the platform
does support. Never cover the gap by copying text by hand.

`run.md` opens with `Job.`, `Status.` (`running`, `waiting`, `done`, `stopped: <reason>`), and
`Help center.` lines,
then the checklist, one line per article, ticked when the article is live:

```
- [ ] `hero-section` · reference · Hero section · new · draft
```

The fields are slug, type, title, action (`new`, `update`, `move`, `rename`, `delete`), and
state (`planned`, `draft`, `checked`, `published <id>`). After the checklist, `## Findings for
the product` lists what the run found wrong in the product itself (a label that misleads, help
text the code contradicts, broken demo content), each with its `file:line`, for the user to
take to the product's team.

The product's repository holds one contract, `.claude/docs.json`. Read it first.

| Key | Holds |
| --- | --- |
| `product` | the product's name as readers know it |
| `audience` | one sentence on who reads the docs and what they already know |
| `language` | the article language |
| `helpCenter` | `{ workspace, id, url }` in Poise, absent until one exists |
| `inventory` | the command that prints every user-facing setting, screen, or option with its interface label, as JSON |
| `serve` | `{ command, url }` to run the product for screenshots |
| `start` | the steps every procedure opens with, the way into the product's settings |
| `shots` | values to copy into the run's shot list, such as `viewport` and the URLs of admin screens; fill `{placeholders}` at run time |

When the file is missing, write it with the user: read the repository for everything it can
tell, and ask only for the help center and the audience.

A run of more than a few articles splits into lanes of subagents. Which work goes to which
model, how to compare two models on writing, and how the fresh reader scales are in
[references/agents.md](references/agents.md); read it before the first delegation.

## 1. Pick the job

| Request | Job |
| --- | --- |
| A new article, or one rewritten | **Article** |
| A product change, a code change, or a release range that made articles wrong | **Update** |
| Collections, order, or article titles to change | **Structure** |
| Release notes to publish in the help center | **Changelog**: take the entry `changelog` wrote for this release, or run `changelog` first when there is none, then shape it as the changelog section of [references/article-types.md](references/article-types.md) says: **Article** for a new Updates entry on Poise, **Update** on the changelog article elsewhere |
| Docs for a whole product, or a rebuild of all of them | **Full build**: read [references/full-build.md](references/full-build.md) and follow it instead of the steps below |

Open the run folder and write `run.md`. Done when its checklist names every article the job
will touch.

## 2. Ground

- Run the `inventory` command into `inventory.json`.
- Pull the live tree into `run.md`, and every article the job touches into `live/`, as
  [references/poise.md](references/poise.md) describes. Find those articles with the platform's
  exact search or its product references, or by searching a mirror a script keeps in sync,
  never by reading every article and never with a search that ranks by meaning.
- Read what readers already ask. Search the support tickets (Poise `search_tickets`) for the
  feature's label and the word merchants use for it, and list the top questions in `run.md`.
  The article answers each one or `run.md` marks it out of scope.
- For **Update**, start from the product, not from the commit messages. Run today's
  `inventory` command against both ends of the range, the older tree checked out in a detached
  worktree, so both outputs have one shape, and diff the two:

  ```bash
  node {{skills_dir}}/docs/scripts/inventory-diff.mjs <run>/inventory-before.json <run>/inventory.json > <run>/inventory-diff.txt
  ```

  It compares every entry at every depth, a setting of a component nested inside another
  included, and lists an added entry with everything under it. When the inventory itself leaves
  out something a user sees, such as the settings of nested components or which go inside which,
  fix the product's inventory command first: a diff cannot show what the inventory omits. A
  commit message is a hint, not proof; read the code diff only for behavior no inventory
  entry shows, such as where a button now sits.
- For each line of the diff, list the articles that name its product reference and search every
  article's text for its label and id, the old ones too when the range renamed it, as
  "Finding the articles a change touches" in `poise.md` says. Every article either lookup
  returns goes on the checklist, and so does every image in it that shows a changed label,
  default, or layout: it is shot again. A change no article mentions is a candidate for a new
  article, not a silent pass.
- Read the code each article describes: the files themselves, not a summary. A label, a
  default, a range, and a condition come from the inventory. What the setting does on the page
  comes from the code and from looking at the running product.

Done when every fact the article will state has a source: an inventory entry, a `file:line`, or
a screenshot. List the files in the draft's `sources` field.

## 3. Shape the article

Read [references/article-types.md](references/article-types.md). Give the article exactly one
type, and take that type's skeleton. Write the headings and one line under each before any
prose. Then write the title and metadata by [references/metadata.md](references/metadata.md).

Done when the draft holds frontmatter and a skeleton whose headings a reader could scan to
find their answer.

## 4. Write

Read [references/writing.md](references/writing.md) every run, before the first sentence. Its
rules are what separate a help article from a generated one.

For **Update**, change only the sentences the product change made wrong, as `edits/<slug>.json`:

```json
{
  "id": "<article id>",
  "hash": "<hash from live/<slug>.json>",
  "edits": [{ "oldText": "click **Export CSV**", "newText": "click **Export**, then **CSV**" }],
  "meta": { "excerpt": "<only a field the change is about>" },
  "product_refs": ["screen:reports", "setting:export_format"],
  "sources": ["src/reports/export-menu.tsx"]
}
```

Each `oldText` is copied from a line the lookup or the read returned, as short as still occurs
once in the article, and each `newText` is what replaces it. Every other line stays in the help
center as it is, so the edits are the whole diff. Write the article as `articles/<slug>.md` with
its `id` only when the change rewrites most of it; its images that stay keep their URLs, which
`verify.mjs` checks by file name. `meta` holds a field only when the
change is about it, and `product_refs` the article's full list.

## 5. Screenshots

Read [references/screenshots.md](references/screenshots.md). Decide which images the article
needs, which is often none, and who draws their annotations: the help center itself, as Poise
does, or the image's pixels, per "Two paths" there. Add them to `shots.json`, and run:

```bash
node {{skills_dir}}/docs/scripts/shoot.mjs <run>/shots.json
```

Open every image the run wrote and compare it with its alt text. A shot with placeholder
content, with a script not yet in its visible state, or with proportions off at the size the
help center shows it is retaken, as `screenshots.md` says. Done when each image shows what its
alt text says and the article's steps still work with the images removed.

On a help center that draws annotations itself, the user sees the images with their marks where
the article is: a new article's in its draft at the stop in step 7, an update's on the page the
report links. Elsewhere, when the run adds or retakes more than a handful
of images, show them to the user as one page grouped by article (the Artifact tool, when the
host has it), each with its file name, and change no article until the user approves them.
Their verdicts on framing and annotation are lessons for `references/screenshots.md`, not for
this run alone.

## 6. Check

1. `node {{skills_dir}}/docs/scripts/lint.mjs <run>/articles <run>/edits` exits 0.
2. Every interface label in bold exists in `inventory.json` or in a screenshot, spelled the same.
3. A fresh reader. Give a subagent the article and its images alone, no code and no
   conversation, and ask it to list every step it could not follow, every term it met
   undefined, every question the article left open, every image that disagrees with its text,
   and every sentence it would cut. It reads; it does not operate the product, because the
   steps end on **Save** in a real store. Its questions are leads: answer from the code the ones a merchant would ask,
   and leave out what the product does not do unless a reader would look for it. Ask again
   until it lists nothing a reader would need. A run of many articles runs the readers in
   parallel rather than skipping them, as [references/agents.md](references/agents.md) describes; for an
   update, the reader gets the article as `get_article` returns it and its `edits/<slug>.json`,
   and reads the article with the edits applied; what it finds changes the edits file before
   any write.
4. Run step 4 of the `humanizer` skill, **Still-AI check**, on the article: list what still
   reads as machine-written, then fix each one. Where its catalogue and `writing.md` differ,
   as on dashes in ranges and bold lead-ins, `writing.md` wins for help articles.
5. For **Update**, each edit changes only what the product change made wrong, and
   `node {{skills_dir}}/docs/scripts/meta.mjs <run>` names, per article, only the metadata
   fields the change is about. An updated article keeps the `id` from `live/`.

Tick each article as `checked` in `run.md`.

## 7. Write, stop where it must, publish

Stop and ask, by the question routing in `AGENTS.md`, before any of these:

- Publishing a new article.
- **Update** or **Structure** deleting, renaming, or moving an article, or adding a section or
  collection.
- In a full build, the structure proposal and the pilot.

An update of a published article is not held for review: no tool can take a draft back to the
published version, so it is written only when it is about to be published, and a correction the
user asks for afterwards is the next round. Each article is written once.

1. **New articles first.** On a help center with drafts (Poise), write every new article as a
   draft, in the order and from the files [references/poise.md](references/poise.md) describes:
   created first so every link has a path, then its body, metadata and product references, each
   write's checksum checked. Its dashboard `editUrl` shows it as the site will, blocks and
   annotations included. On a help center without drafts, build
   `node {{skills_dir}}/docs/scripts/preview.mjs <run> --site <help center host and path>` and
   publish `preview/index.html` as a private page when the host can (the Artifact tool), with
   `preview/media/` as its files; nothing is written yet.
2. **Stop** when the list above asks for it, with one table: each new article's title and
   `editUrl` (or the preview), each update and structure change with one line on what changes,
   and its action. Set `Status. waiting` while it waits. A change the user asks for to a new
   article is another write to its draft; to an update, a change to its `edits/<slug>.json`.
   With nothing on the list, there is no stop.
3. **Write the updates** from `upload/`, as `poise.md` describes, after the yes or at once when
   there was no stop, and check that no article changed since its last read or write (on Poise
   its hash; where the platform exports bodies to `live/<slug>.md`, export again and run
   `node {{skills_dir}}/docs/scripts/drift.mjs <run>/live/<slug>.md <fresh export>`).
4. **Publish** every article together, in reading order, so an update never links to an article
   that is not yet live. Write each article's id into its checklist line, and run
   `node {{skills_dir}}/docs/scripts/verify.mjs <run>` until it prints `all … pages match`. The
   report lists every published article with its URL and its `editUrl`.

Done when every checklist line reads `published <id>`, or names what it waits on. Set
`Status. done`.
