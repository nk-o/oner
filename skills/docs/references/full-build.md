# Full build

Docs for a whole product happen once, or when the old set is beyond updating. It runs the same
steps as one article, in four stages with three stops. `run.md` is the plan, and every stage
ticks it.

## 1. Inventory and structure

1. Run the inventory. List every part a user can reach: global settings by group, each section
   or screen, each block or component, each template or page type.
2. Pull the live tree. An article that already exists is updated, not duplicated.
3. Write the structure into `run.md`: collections in the order a new user meets them, and
   under each the articles with slug, type, title, and one line on the reader's question. A
   common order for a theme: Getting started, Theme settings, Sections, Blocks, Pages and
   templates, How-to guides, Troubleshooting, Changelog. Take the product's own order when it
   has one.
4. Map every inventory item to the article that covers it. An item no article covers is either
   a new article or written down as left out on purpose, with the reason. The map becomes each
   article's `product_refs`, as `poise.md` describes.
5. Settings many parts share get one article of their own, and the other articles link to it.

**Stop.** Show the collections and the article count per collection, the articles as a table,
and the inventory items left out. Iterate until the user approves. Write each change into
`run.md` before showing it again.

## 2. Pilot

Write two articles of different types end to end, screenshots and metadata included, through
steps 3 to 6 of `SKILL.md`. Pick the two that the most other articles will copy: usually one
`reference` and one `how-to`.

**Stop.** Show both, the lint output, and what the fresh reader found. What the user changes
here is a rule for all the rest: write it into `run.md` under `Rules from the pilot`, and into
the skill's references when it applies beyond this product.

## 3. Write the rest

Hand the articles to writer subagents on the strongest model, one batch per collection, as
[agents.md](agents.md) describes. Each brief holds the run folder's
path, the slugs of its batch, the rules from the pilot, and these steps: read `SKILL.md` steps
3 to 6 and the references they name, write each article into `articles/`, add its shots to
`shots-<collection>.json`, run lint, and return the slugs with their lint output. Batches write
different files, so they run at once. Shots run after all batches, one list at a time, because
they share the product's dev server: `shoot.mjs <run>/shots-<collection>.json --out <run>/media`
for each file.

Read every returned article before you tick it as `checked`. Run the fresh readers in parallel,
one per article, as `agents.md` says: a large build is where skipping them costs most.
Nothing stops in this stage.

## 4. Publish

Create the collections the structure stop approved, then write every new article as a draft in
reading order, as `poise.md` describes under **Writing**: titles and slugs first, so every link
has a path, then the bodies, metadata and product references from the files `body.mjs` and
`meta.mjs` wrote, each write's checksum checked. These are mechanical lanes on the cheaper
model. An existing article the build updates is written after the stop, as `SKILL.md` step 7
says.

**Stop.** Show the table of all articles with each new one's `editUrl` and the manual steps
from `poise.md`. After the yes, write the updates and publish everything with
`publish_articles`, 50 at a time in reading order, and tick each as `published <id>`.
