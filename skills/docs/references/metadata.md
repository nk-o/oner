# Title and metadata

A new article's draft opens with this frontmatter. `lint.mjs` checks each field's presence and
length. An update's `edits/<slug>.json` carries in `meta` only the fields the change is about,
under the same names, and `meta.mjs` sends only those that differ from `live/<slug>.json`, so a
value the user edited in the dashboard stays.

```yaml
---
title: Hero section
slug: hero-section
type: reference
collection: Sections
seo_title: Hero section settings and presets | Acme
seo_description: Set the height, layout, image and video of Acme's hero section, and pick one of its three presets for the top of your home page.
excerpt: The large opening section with a heading, a photo or video, and buttons.
keywords: banner, slideshow, header image
product_refs: section:hero, setting:hero_height, setting:hero_video_url
sources: sections/hero.liquid, locales/en.default.schema.json
---
```

## title

The page's H1 and its name in the help center's lists, at most 60 characters. Its form comes
from the type, in [article-types.md](article-types.md). No product name unless the reader
would search for it there, no "How to", no "Guide to", no colon subtitles.

## nav_title

Optional. The article's name in the help center's sidebar, where titles sit in a narrow column
next to each other, at most 32 characters. Write one only when the title is longer than that
or reads badly in a list: "Show the header over your hero image" becomes "Header over the hero".
It names the same thing as the title in fewer words, never something else, and drops what the
collection already says: under **Sections**, "Hero section" is "Hero".

## slug

Lowercase words and single hyphens, 3 to 48 characters. Built from the title without stop
words or the product name: `change-theme-colors`. A published slug is a URL other pages and
search engines hold. Changing it is a rename and stops for approval.

## seo_title

What a search result shows, 20 to 60 characters. The topic first, then what the reader can do
with it, then ` | ` and the product name. Different from every other article's `seo_title`.

## seo_description

What a search result shows under the title, 110 to 160 characters, one or two full sentences.
It says what the reader can do after reading, with the words they would search for, and
something this page has that the others do not. It promises only what the page itself covers,
not what a linked page does. It never starts with "This article", "Learn", or "Discover".

## excerpt

The line under the title in the help center's lists and search, 40 to 200 characters, one
sentence. It answers "is this the page I need" for someone browsing a collection, so it
describes the thing, where `seo_description` describes the outcome. Never a copy of either,
and never a copy of the article's first paragraph: a reader who clicks has already read it.

## keywords

Hidden search terms, comma-separated: the words a reader types that the article does not use,
such as "banner" for an article titled "Hero section", or the name a competing product gives
the feature. At most 30, each at most 60 characters. Never a word the title or text already
has, because the search finds that without help.

## product_refs

The parts of the product the article describes, comma-separated `kind:identifier`, taken from
`inventory.json` as [poise.md](poise.md) says: every setting a step changes or a table lists,
and the section, block, or screen the article is about. At most 100. They are how the next
**Update** run finds this article, so an article without them is found only by its text.

## collection

The help center collection the article lives in, by its name. A new name is a structure change
and stops for approval.

## sources

The files the article's facts come from, comma-separated, for the fact check in step 6. It is
not published, so a later run finds articles by their text, not by this field.
