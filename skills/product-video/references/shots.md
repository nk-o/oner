# Shot files

One JSON file per take, read by `scripts/record.mjs`. It loads `url`, runs `prepare` without
recording, then records `steps`. The take is a 60 fps H.264 file at `viewport` times `dpr`
pixels, and `<out>.marks.json` beside it holds the boxes the steps marked.

```json
{
  "url": "http://127.0.0.1:3302/",
  "viewport": [1440, 810],
  "dpr": 2,
  "hide": ["[id*='__overlay_popup']"],
  "prepare": [["jump", { "to": "[id$='__card-rail']", "offset": -60, "settle": 2000 }]],
  "steps": [
    ["wait", { "ms": 400 }],
    ["hover", { "sel": ".card-product__media", "nth": 0, "ms": 800, "dwell": 700 }],
    ["mark", { "name": "card", "sel": ".card-product", "nth": 0 }],
    ["click", { "sel": ".card-product__add", "nth": 0, "dwell": 550, "after": 300 }],
    ["waitFor", { "sel": "dialog[open]", "after": 700 }]
  ]
}
```

| Key | Holds |
| --- | --- |
| `viewport` | CSS pixels. 1440 x 810 for 16:9, 1440 x 1080 for 4:3 |
| `dpr` | 1.5 by default: room for the edit's camera push without upscaling; 2 for a shot the edit zooms into |
| `hide` | selectors hidden for the whole take: popups, cookie banners, chat widgets. A dialog or popover among them is also closed when it opens, since a hidden modal still leaves the page inert to the pointer |
| `block` | extra URL patterns to block, added to the defaults the script carries |
| `cursor` | `false` for a take with no interaction; the script draws a cursor and a click ring otherwise |
| `mouseStart` | `[x, y]` where the pointer rests when the take starts; pick a spot that touches nothing, so no card reacts before the first step |
| `colorScheme` | `dark` or `light`, as `prefers-color-scheme` |
| `ready` | custom element names the take depends on; the page reloads until all are defined, since a module that failed to load leaves its section static |
| `headful` | `true` to record in a visible window on the GPU; it must stay uncovered, so record such takes one at a time. Pages with heavy effects (per-letter blur, filters) drop to 15 fps headless and keep 60 here |
| `warm` | `true` to scroll the whole page once before `prepare`, for sections that fetch on first view; it also plays their entrances, so leave it off when the take should show them |
| `settle` | ms after the first load before `prepare`, default 2500 |
| `tail` | ms recorded after the last step, default 400 |

## Steps

Each step is `[op, options]`. Selectors match visible elements only; `text` narrows to the
element whose text contains it, `nth` picks among matches, `fx`/`fy` place the cursor inside
the element (0 to 1).

| Op | Does |
| --- | --- |
| `reload` | records the page loading, from the moment the new document commits. Use as the first step of an opening shot |
| `wait` | `ms` |
| `jump` | scrolls instantly to `to` (a selector or a y), `align` 0 for the element's top or 1 for its end, plus `offset`; then waits `settle` |
| `scroll` | to `to`/`align`/`offset`, `by` pixels, or `end`. With `ms` and `curve: "ease"`, eased the whole way, for moving from one section to the next. With `ms` alone, an even glide eased only at its ends, for a pinned scroll-driven section that must play at a steady pace. `speed` instead of `ms` sets CSS px per second. Without either, a damped spring |
| `move` | the cursor to an element or to `x`,`y`, along a slight arc, over `ms` |
| `hover` | `move`, then `dwell` ms of stillness (default 700) so hover motion plays out |
| `click` | `move`, `dwell` ms resting on the target (default 450), press, release, then `after` ms |
| `drag` | presses at `from`, moves through each of `to` (fractions of the element's width) over `each` ms, then releases; for sliders and before/after comparisons |
| `type` | `text` at `cps` characters per second (default 11) |
| `waitFor` | until `sel` is visible, at most `timeout` ms, then `after` ms |
| `mark` | records `name`'s box and the take time into the marks file, for the edit's camera |
| `creep` | starts a slow constant scroll at `speed` CSS px per second (0 stops it) that runs under the steps after it, until the next `scroll` |
| `key` | presses `key` (Escape by default), then waits `after` |
| `eval` | runs `js` in the page, printing its value with `log: true`, or without waiting for it with `async: true`; for state the page offers no control for and for staged shots |

## Timing that reads

- Cursor: about 400-500 ms per move, a 250-350 ms dwell before every click. A click with no
  dwell looks like the page changed by itself; a longer one looks like hesitation.
- After a click, cut about 0.8 s after the result settles. Waiting for a fetch is cut out, never
  held.
- A survey pass: the whole page in one `scroll` to `end` at a steady `speed` of 300-360 CSS px
  per second. Every window of it is in motion, so the edit cuts 2.5-3.5 s pieces anywhere.

## Dev servers

`shopify theme dev` proxies a password-protected store and shares one session among all
clients. A fresh browser that calls the store's own APIs (Shop sign-in, the account menu,
`sf_private_access_tokens`) replaces that session, and from then on every request lands on
`/password`. The script blocks those requests by default. When it happens anyway, restart the
dev server; after several restarts in a row, wait a few minutes instead.

- The proxy sometimes answers one request with an "access token expired" page. The script
  reloads until it gets the storefront.
- Keep one browser per dev server. An open tab in another browser on the same server breaks
  the session the same way.
- A worktree's pinned theme (`SHOPIFY_FLAG_THEME_ID`) can stop working on its own; the CLI's
  own development theme for the store (`shopify theme dev -e <store>`) is the fallback.
- The proxy now and then fails to serve a JavaScript module or one of its imports, so a
  scroll-driven section stays static in that take with no error on screen. Stacking cards that
  lost their library looked like a browser rendering bug. The script reloads while a script from
  the dev server has failed, and a failure during the take prints `BROKEN TAKE` and exits 3:
  record that take again. List a section's custom element in `ready` as well.
- A visible window driven over CDP crashed its renderer ("Aw, Snap!", error 11) every time a
  mouse press led to Chrome 154 opening the theme's cart drawer, while the same click in the
  user's own Chrome on the live store worked. Treat a crash in a `headful` take as a recording
  artefact first: record that interaction headless and check it once in a real browser.
- The proxy serves HTML and CSS uncompressed and slower than production. That changes load
  timing, not what the page looks like.
