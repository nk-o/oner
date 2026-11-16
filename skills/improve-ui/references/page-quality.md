# Page quality

A public page is judged by how fast it shows and whether a search engine reads it right, not
only by how it looks. Measure the production build served locally, because a dev server ships
unminified code and its numbers say nothing about users.

## Measure

Run Lighthouse from outside the project, so nothing is added to its dependencies:

```sh
npx -y lighthouse <url> --only-categories=performance,seo,best-practices --form-factor=mobile \
  --chrome-flags="--headless=new" --output=json --output-path=<run>/r<N>/lh-<surface>-<k>.json --quiet
```

Three runs per surface and round, `k` from 1 to 3. Keep the median and the spread of LCP, CLS,
TBT (the lab stand-in for INP), total transferred bytes, and the SEO audits that failed. A
difference smaller than the spread is noise, not a result. Field data from real users, such as
PageSpeed Insights or CrUX, sends the site's address to an outside service, so use it only when
the user asks.

## Findings

| What | Bar | Usual cause |
| --- | --- | --- |
| LCP | 2.5 s or less on mobile | the hero image not preloaded or sized, a render-blocking script or font, the main text drawn by client code |
| CLS | 0.1 or less | an image, embed, or ad slot with no reserved size, a font swap that reflows, content inserted above what is on screen |
| TBT | 200 ms or less | one large bundle, a third-party script loaded early, work at start that could wait |
| Bytes | no image wider than twice its rendered size, no unused library in the page's bundle | a missing `srcset`, an import of a whole library for one function |
| Title and description | one `<title>` and one meta description per page, each unique | a layout that sets them once for every page |
| Canonical and indexing | a canonical URL per page, `noindex` only where meant, `robots.txt` and the sitemap listing the pages that exist | a staging setting that shipped, a sitemap built from an old route list |
| Structure | one `h1`, headings in order, link text that names its target | headings chosen for size |
| Structured data | JSON-LD that matches what the page shows, valid for its type | markup copied from a template with someone else's values |
| Sharing | `og:title`, `og:description`, `og:image` at its required size | the image missing or pointing at a dev host |

A performance finding takes its level from the bar: over the bar is P1, within 25% of it is P2.
An SEO finding that keeps a page out of search, such as a stray `noindex` or a wrong
canonical, is P1. The rest are P2.

## Fix or decide

Sizing and preloading images, deferring a script, reserving space, splitting a bundle, and
fixing a canonical, a `noindex`, a sitemap, or heading order are fixes. A title, a description,
link text, and structured data say something about the product, so they follow the copy rule in
the decision table: the run proposes the text and the user approves it. Removing a third-party
script, such as analytics or chat, is a decision.
