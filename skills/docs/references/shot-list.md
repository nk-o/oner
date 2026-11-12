# The shot list

`shots.json` in the run folder. Copy `viewport` and the admin URLs from `shots` in
`.claude/docs.json` into it, and set `baseUrl` from `serve`. The runner reads only this file.

```json
{
  "baseUrl": "http://127.0.0.1:3301",
  "viewport": { "width": 1440, "height": 900 },
  "shots": [
    {
      "name": "hero-section-full-screen",
      "url": "/?view=docs-hero",
      "target": "#shopify-section-template--docs__hero_full",
      "waitFor": "#shopify-section-template--docs__hero_full img"
    },
    {
      "name": "change-theme-colors-schemes",
      "url": "https://admin.shopify.com/store/<store>/themes/<id>/editor?context=theme&category=colors",
      "session": "admin.shopify.com",
      "frame": "iframe[name=app-iframe]",
      "target": "[data-panel=settings]",
      "highlight": "[data-setting=color_schemes]"
    }
  ]
}
```

| Field | Means |
| --- | --- |
| `name` | output file name without extension |
| `url` | absolute, or relative to `baseUrl` |
| `target` | selector of the element to capture, or a list joined into the one box that holds them all, such as a row of cards with no parent of its own; without it, `clip` or the viewport |
| `clip` | `{ x, y, width, height }` in CSS pixels |
| `boxes` | `{ "<name>": selector }`: each target's box in percent of the finished image, grown by `pad`, into `media/<shot>.json`, for annotations the help center draws; a list of selectors is one box holding them all, and `{ "selector": ..., "pad": 8 }` sets that box's own room. A box the image does not hold fails the shot |
| `spotlight` | selector of the part left bright, or a list of selectors joined into one area |
| `spotlights` | a list of further bright areas, each a selector or a list joined into one area, such as the part of a preview a setting changes |
| `pad` | room in CSS pixels between the spotlight's edge and the part, and around each of `boxes`, 24 by default |
| `redact` | selectors blurred past reading, for what `hide` cannot reach |
| `highlight`, `highlights` | selector, or a list of selectors, to outline |
| `arrows` | `[{ "to": selector, "from": "bottom-left", "length": 110 }]`; `from` is where the arrow comes from: `left`, `right`, `top`, `bottom`, or a corner; `length` in CSS pixels |
| `markers` | `[{ "on": selector, "n": 3, "at": "right" }]` |
| `balance` | `true` for equal space on all sides, for a whole section or component |
| `even` | room in CSS pixels on all four sides of the content found inside the box: thin divider lines, a scrollbar and a border along an edge are dropped first, and content still touching an edge fails the shot instead of being cut. Use it for a section or a component, with `grow` |
| `grow` | CSS pixels of page taken in around `target` before `even` looks for room, a number or `[top, right, bottom, left]`; a section's box often ends at its content |
| `isolate` | `true` hides every other section and paints the page behind the target its nearest background, so the room `grow` adds is plain page, not the edge of the next section |
| `open` | sides, such as `["right"]`, the content runs past on purpose, like a carousel's next card: the image stays flush there instead of failing |
| `panel` | `true` for a settings sidebar: with `even`, it also drops the tinted header strips of the editor panel. `--panel` on the command line sets `even` to 24 |
| `waitFor` | selector that must be visible on load, checked before `actions` run; for something an action opens, add a `wait` action instead |
| `actions` | in order: `{ "click" }`, `{ "hover" }`, `{ "focus" }`, `{ "scroll" }`, `{ "scrollTo": "bottom" }`, `{ "fill": [selector, text] }`, `{ "eval": "<js>" }`, `{ "wait": ms }`; `scrollTo` reaches a footer revealed from under the page, which `scroll` treats as already in view; `focus` opens what shows on focus, such as a `:focus-within` menu, without following a link; `eval` runs a short script on the page for a state no action reaches in a headless browser, such as an indicator it keeps hidden |
| `motion` | `true` keeps animations running, for a shot of an effect that is motion itself |
| `block` | URL glob patterns to abort, such as `**/graphql.json*` against a Shopify `theme dev` proxy, whose storefront session a fresh browser would otherwise replace |
| `hide` | selectors made invisible, for personal data and overlays |
| `frame` | selector of an iframe the other selectors live in |
| `session` | host whose saved session the shot needs, such as a store behind a password or an admin |
| `viewport`, `scale`, `delay` | per-shot overrides |

The list's top level also takes `session`, `balance`, `hide`, and `block` for every shot (a
shot's own `hide` and `block` add to the list's), `annotations` (`"platform"` when the help
center draws them), `format` (`webp`, the default, or `png`), `quality`, and `highlightColor`.

Run it with `node {{skills_dir}}/docs/scripts/shoot.mjs <run>/shots.json`, or `--only
<name>` to retake one. It writes into `<run>/media/` and exits 1 when any shot failed, naming
it. Find selectors in the running product first, in a browser tool, rather than guessing them
from the source.

A local dev server draws its own overlays, such as Next.js's `nextjs-portal` indicator or a
query devtools button: put them in the list's `hide`. The selectors of one shot live in one
document, so a spotlight on a part of a same-origin iframe, such as an editor's preview, takes
an `eval` action that lays an empty fixed `div` with an id over that part, sized by the frame's
box and its width over its `innerWidth`, and the spotlight names that id.
