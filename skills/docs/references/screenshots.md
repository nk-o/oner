# Screenshots

An image costs a reader nothing to skip and costs every later release a re-capture, so each
one has to earn that.

## When an image belongs

- Once at the top of a `reference`, showing the finished result in its most common setup.
- At a step whose target is small, hidden in a menu or a drawer, or easy to confuse with the
  control beside it.
- Where the result of a setting is visual and hard to say in words: a layout, an effect, the
  difference between two presets.

Never an image of text the article can hold, of code, or of a step a label already makes
clear. Shopify's own help center uses few images, and so should this one.

## What an image shows

- Demo content only: the product's demo store or seeded data. Never a real customer, order,
  or account. Hide anything personal with `hide`. Where the page cannot be styled, such as a
  name inside an admin's cross-origin frame, `redact` blurs that box past reading.
- The product as a new user gets it: a project made the way the product makes one, with its
  default theme, colors, fonts and templates. Change a setting only in the image that shows
  that setting, and set it back for the next. A custom palette or font carried through every
  image makes the docs show a different product from the one the reader opens.
- Nothing temporary: a launch offer, a discount button, a promotion banner or a notice the
  release will drop is hidden with `hide`, and `run.md` lists each one with its selector so
  every retake hides it too.
- A plain background behind anything that opens over the page, such as a picker, a menu or a
  popover: open it over a plain section, never over a photo or a busy section, where its edges
  get lost.
- Realistic content: the demo data the product ships with, the way a user would fill it. A
  placeholder image, lorem text, or sample content that reads like a test ("Heading",
  "Product 1") is a defect to reshoot. When the demo itself holds it, list it under **Findings
  for the product** and pick a part of the demo that does not.
- The image agrees with the text beside it. When it shows one button and the text says two, or
  a heading about spices over a photo of coffee, pick another example or say what it shows.
  A mismatch in demo content is a finding for the product, not something to explain away.
- Frame by what the reader needs to recognize, never by the element alone. No browser chrome,
  no cursor, no scrollbar edge. See **Framing** below.
- A shot of a whole section or component, such as a hero, has the same space on all four
  sides. Crop to the section's own box and set `balance`, which measures the space between the
  content and the side edges and gives the top and the bottom the same. Most sections pad their
  sides more than their top and bottom, so without it the content looks jammed against the
  edges.
- Every image is 2x, so it stays sharp on a retina laptop and a phone: a 1440 by 900 page
  gives a 2880 by 1800 image. The help center shows it at half its pixel width. A 1x image is a
  defect, not a draft. Add a mobile image (390 by 844, also 2x) only where the mobile behavior
  differs and the article says so.
- The product as it ships. Labels and help text in an editor shot come from the build the docs
  describe, so shoot the editor once that build is live, and retake every shot whose labels a
  release changed.
- Light color scheme and reduced motion, which the runner sets, so entrance animations are
  finished when the shot is taken. A shot of an effect that is motion itself, such as a marquee
  or text lit by scrolling, sets `motion: true`, or reduced motion shows it broken or static.
- A part whose look depends on a script, such as a marquee, a carousel, or an animated counter,
  is shot only in the state the script makes visible: `waitFor` on an element or class the
  script adds, or a `wait` action. Open the image and check for that state before keeping it.
  A static or half-initialised capture is a failed shot.

## Two paths

Who draws the annotations decides how an image is shot.

- **The help center draws them.** Poise does: its `<Area>`, `<Spotlight>`, `<Pointer>`,
  `<Marker>`, `<Arrow>` and `<Line>` sit inside the image's `<Frame>`, in percent of the
  image, and scale with it in the lightbox; on a phone a Pointer turns into a numbered badge at
  its point with its label listed under the image. The shot is a
  clean image: the runner only blurs what must not be shown (names, emails, addresses, order
  numbers, tokens) with `redact` or hides it with `hide`, and draws nothing else. Set
  `"annotations": "platform"` at the top of `shots.json`, and the runner refuses a pixel
  annotation by mistake. Give the shot `boxes`, each target you will mark by name, and the
  runner writes `media/<shot>.json` beside the image with each box in percent of the finished
  image, after the crop and the balance, grown by the same room a drawn spotlight gets (`pad`,
  24 CSS px), because the help center draws a mark exactly on the numbers it gets and a box
  without room runs the outline along the part's edges. Write the article's tags from those
  numbers, never by eye. **Annotations in the help center** below says which tags to use.
- **The image carries them.** On any other platform the runner draws them into the pixels, as
  **Annotations in the image** says.

## Framing

A reader matches the image against the screen in front of them, so the image keeps enough of
the screen around its subject to be found there. Pick the frame by what the image is for:

| The image answers | Frame | Example |
| --- | --- | --- |
| Where is it? The reader must also see how the screen is reached: the first image of a screen in an article, a control in a toolbar or a rail, a page in an admin's navigation | The whole screen, with the admin's navigation and the editor's panels | The editor's rail and template picker in a getting-started guide |
| Where is it? The steps already bring the reader to the screen, and the image shows a setting on it | The panel that holds the setting and a strip of what sits next to it, such as the editor's sidebar with the edge of its preview | A setting inside an open Theme settings group |
| What does this part look like? A small part of a page | The part and its surroundings: the column, the row, or the header it belongs to. Cut away only what says nothing about it | Color swatches with the product photo, title and buy button around them |
| What does this section or block look like? | The section's own box with `balance` | A hero, a footer |

A setting's image also shows what the setting changes. In an editor with a live preview, open
the preview on the page where the setting acts, open the drawer or panel it changes if the
preview allows it, and frame the whole screen with two bright areas: `spotlight` on the
setting in the sidebar and `spotlights` (`--spotlight-also` for a capture) on the part of the
preview it changes; where the help center draws the marks, two Spotlights, as
**Annotations in the help center** says. Never an outline on the dimmed part: a red frame in the dark reads as a
mistake. Where two bright areas would cover most of the screen, drop the dim and use an outline
with an arrow instead. When the effect cannot be on the same screen,
because it shows on another page or only after an interaction the preview does not allow,
follow the setting's image with a second image of the result on the storefront.

A group of settings or one button the steps already lead to reads better as its panel alone
than as a full screen, where it shrinks to a few pixels at the size the help center shows it.
Shoot the panel with `target`, plus `pad` worth of what surrounds it, and where the platform
frames images, give it the larger frame (Poise: `frame="on"`) and a `width` that shows it near
its real size. Keep the full screen for the first image of a screen and for a setting whose
effect shows in the preview beside it.

Most images in an article are crops: the panel, the menu or the part of the screen the step
works in. The whole screen is for the first image of a screen and for a setting whose effect
shows beside it. Before keeping a full-screen image, ask what the reader would lose if it were
cut to the half that matters; when the answer is nothing, crop it.

A dialog, a modal or a sheet that dims the page behind it is the whole screen, or a crop with
at least 48 CSS px of the dimmed page on every side. A crop at the dialog's own edge shows the
dim page only in its rounded corners, which reads as a rendering fault.

A crop to the element alone, such as a 100 px strip of a header or one product card, fails the
first two: the reader cannot tell where it sits. A whole screen for a 30 px badge fails the
other way: the subject is lost at the size the help center shows it. When in doubt between
two frames, take the larger one and let the spotlight say where to look.

## Annotations in the help center

The same calm style as in an image: one focus per image, at most two kinds of marks, one colour
for all of them (the help center's accent), and no mark where the image shows a result. Lint
checks the limits it can count.

| Tag | Use it when | Not when |
| --- | --- | --- |
| None | The image shows a result: a section as visitors see it, a layout, a preset. | |
| `<Spotlight>` | The image is large and the text is about one part of it: a settings group in a full editor, one card in a grid. Two only for a setting and the part it changes; Poise cuts both out of one shade. | The part is most of the image. |
| `<Area>` | Similar elements sit next to the one the text names, such as a group of settings in a long panel. A label, when it adds a name the image lacks, of at most four words. | The target is a small icon, which an outline hides. |
| `<Pointer>` | One control or region needs its name beside the image: a label of one to four words, the control's own label or what it does. On a phone it becomes a numbered note, so it reads alone. | The image is a crop of that one control. |
| `<Marker>` | The order of actions on one screen matters, two or more of them. Or a tour of a whole screen: one numbered Marker per region, at most six, matching a table or list beside the image. Its text is listed under the image and takes **bold** for labels. | The path to the screen: the steps already say it. |
| `<Arrow>` | The target is small or easy to miss, an icon or a toggle, and nothing else isolates it. It comes from empty space and its point lands on the icon. | A Spotlight already isolates it. |
| `<Line>` | Rarely: it joins two marked points, such as a setting and the part of the preview it changes, where the eye would not link them. | Anything an Area beside the setting already says. |

A tour of a screen, such as the parts of an editor, marks its three to six regions, never every
control: Pointers named after the regions, each with a `side` that sends its label to the
nearest free edge so no two labels meet, or numbered Markers that a list beside the image
names. Before keeping marks, look at the image at the size the help center shows it: two marks
whose labels or badges touch are one too many.

A setting and its effect on one screen take two Spotlights, one on the setting and one on the
part of the preview it changes, as two bright areas do in an image. Never an Area in the shade:
an outline in the dark reads as a mistake.

Coordinates come from the shot's boxes, each measured for the mark it feeds:

- A Spotlight takes its box as it is, room included. A part and what sits on it, such as a card
  and the badge over its corner, are one box of both selectors. When the room would reach the
  next element, such as a card in a grid whose gap equals `pad`, or the next row of a tight
  panel, lower that box's `pad` to half the gap, so the edge falls in the gap and never on the
  neighbor.
- An Area takes a box of its own with `pad: 8`, as a drawn outline does.
- A Pointer's or a Marker's point sits on the edge of the default box, in the empty space
  beside the control, because a Marker draws a solid badge centred on its point, and so does a
  Pointer on a phone: the box's room keeps the badge off the control.
- An Arrow takes a box with `pad: 4`, so its tip lands on the control and not a spotlight's
  margin away. The tip sits on that box's edge facing its tail, and its tail in empty space on
  the side the pixel rules below name.

Look at each mark in the draft through its `editUrl` before publishing. The dashboard needs the
user's sign-in, so open it in the user's own browser through the `browser-skill` skill, never a
fresh one, which lands on the sign-in page. Without `bsk`, the stop or the report names the
images for the user to look at.

## Annotations in the image

An annotation tells the reader where to look, and one is usually enough. The steps already
give the path, so the image marks where that path ends: the setting, the button, the panel.
A result image carries none. Before keeping an image, look at it at the size the help center
shows it and ask whether the eye lands on the right place first. When the annotations compete
with each other or with the content, cut them down to the one that matters, or split the image.

The look follows CleanShot: one red (`#F23A4C`; `highlightColor` in a shot list or `--color`
for tiles to change it), flat markers and arrows with no border or shadow,
no text drawn on the image beyond marker numbers.

| Annotation | Use it when | Not when |
| --- | --- | --- |
| None | The image shows a result: a section as visitors see it, a layout, a preset. | |
| Spotlight (`spotlight`) | The image is large and the text is about one part of it: a settings group in a full editor, one card in a grid. Everything else is dimmed, and the part stays at full brightness in a rounded frame with room around it (`pad`, 24 CSS px by default). A list of selectors or boxes is joined into the one area that holds them, such as a mega menu panel and the header it opens from; `spotlights` adds separate areas, for a setting and its effect. | The part is most of the image. |
| Outline (`highlight`, `highlights`) | The text names one or more areas, and similar ones sit next to them: a group of settings in a long panel, the two places a layout puts the buttons. | The target is a small icon, which an outline hides. |
| Arrow (`arrows`) | The target is small or easy to miss: an icon, a toggle, a link in a toolbar, and nothing else isolates it. The arrow is straight, comes from empty space, and its point lands on the visible icon, not on the padded button around it. | The target is large enough to outline, or a spotlight already isolates it: an arrow into a spotlight that holds only its target says the same thing twice. |
| Numbered markers (`markers`) | One screen holds several places the reader acts on or the text names, in order. The numbers may simply show the order of actions on that screen, with no numbered list beside the image. When a table or a list beside it does describe the marked areas, its numbers match the markers one to one, 1 to n, with no row the image does not mark. Never use them to retrace the steps that led to the screen. | The path to the screen (Theme settings, then a group, then a setting): the steps already say it, and three markers on one image read as clutter. An overview of a whole screen: outline the one or two areas the text is about, or mark nothing. |

A marker sits beside its target (`left`, `right`, `top`, `bottom`) or on one of its corners
(`top-left`, `top-right`, `bottom-left`, `bottom-right`), in empty space. It never covers the
target or its neighbors, and two markers never touch. When the targets are too close for that,
use one marker on the group, or an outline, or no annotation.

Measure every box on the page as it is when the shot is taken, after the last change to the
DOM, such as hiding a badge or an overlay, and after entrance animations have finished. An icon
moves when a neighbor appears, and a block that rises into place on load sits 20 px lower while
it rises, so a box measured too early frames the spotlight off its part.

A spotlight's edge falls in the gap between two rows, never across a label or the next control.
In a tight panel, such as a settings sidebar, lower `pad` to 10 or 12 for that shot rather than
cut the row below in half.

Mark the control that changes what the reader sees. Before outlining a field, find in the code
which one the result reads: a product often keeps two similar strings, such as a button's
visible label and its label for screen readers, and outlining the wrong one sends the reader to
a change that shows nowhere.

## Motion and comparisons

- An effect that is motion itself, such as a marquee, a scroll-linked section or a hover state,
  is a short video: five to ten seconds, muted and looping, which Poise plays like a GIF
  (`<Video>`), not a still of one frame. `record.mjs` records it headless, frame by frame at 2x,
  and joins the frames into an MP4 with ffmpeg:
  ```bash
  node {{skills_dir}}/docs/scripts/record.mjs <run>/record.json
  ```
  A recording scrolls between two page positions (`scroll: { from, to, seconds }`) or moves a
  pointer along a path of points or selectors (`pointer: { path, cursor: true }`, with a drawn
  arrow, because a headless page shows no pointer); `target` with `grow` crops to a section.
  The script's header lists every key. For a page only the user's browser reaches, record the
  tab with `bsk video start --quality clear` and `bsk video stop --out <file>.mp4`. It records
  at the Agent Window's size in CSS pixels, not at 2x, so prefer `record.mjs` with a saved
  `--login` session wherever the page allows one.
- Two or more variants the reader compares, such as two presets or the desktop and the phone
  layout, sit side by side in one `<Gallery>`, each image titled by its variant, not in a stack
  of images the reader scrolls between.

## Alt text and placement

- Alt text says what the image shows, at most 155 characters _(lint)_: "Hero section with a
  full-screen photo and the heading split across three lines". Never "Screenshot of"
  _(lint)_. When the image carries its annotation in its pixels, the alt text also says what it
  marks. When the help center draws the annotations, the alt text describes the picture and
  never the marks _(lint)_, which the reader meets on their own.
- An image follows the step or the sentence it illustrates: the step whose screen it shows,
  not a closing **Save** step after it. A step's image needs no introduction. Any other image
  is introduced by a full sentence.
- Write alt text and placement from the image itself. A shot plan or a capture log goes stale
  the moment a shot is retaken.
- Look at each image at the size the help center shows it, in the draft or the preview. An image stretched
  or squashed against its natural aspect ratio is a failed shot. Where the platform lets the
  article set an image's width or height, set one of them, never both.
- Placing an image is a fact check. When the image and the text disagree and the image is the
  product as it is, fix the text. A result image that repeats one the article already shows is
  left out.
- File names: `<slug>-<what>` in lowercase with hyphens, plus `-mobile` for a mobile shot. A
  re-capture keeps the name.

## The shot list

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

## Screens behind a sign-in

An admin screen, such as a theme editor, and a store behind a password need the user's
session. A shot that comes back as a sign-in or password page is the sign.

Take these shots in the user's own Chrome through the `browser-skill` skill and its `bsk` CLI.
Read that skill first: every untargeted command needs the `context_id` and a fresh
`observation_id` from `bsk cooperate sync`, and refs come from that sync. The user is already
signed in, and nobody types a password. A fresh browser that signs in by itself often stops at
a bot check (Shopify's admin answers "Just a moment..." to Playwright), so the user's browser is
the first choice, not the fallback. The Agent Window works in the background, and its overlay
stays out of the page, so a capture holds the page alone.

1. Start the session with `--agent-name`, `--project` and `--name`, as `AGENTS.md` says, and
   size the tab:
   ```bash
   bsk emulate --width 1440 --height 900 --dpr 2 --session <id> --context <ctx> --observation <obs>
   bsk evaluate '({ page: [innerWidth, innerHeight], dpr: devicePixelRatio })' --session <id> --context <ctx> --observation <obs>
   ```
   Emulation belongs to the tab, so a new tab starts at the window's size and 1x again.
2. After every navigation, hide the scrollbar and the overlays the reader never sees (a preview
   bar, a floating picker, a framework's dev indicator) with `bsk evaluate`:
   ```js
   if (!document.getElementById('docs-shot-hide')) { const st = document.createElement('style'); st.id = 'docs-shot-hide'; st.textContent = 'html{scrollbar-width:none!important}'; document.head.append(st); }
   ```
3. Measure what you will annotate. On a page you can script, read boxes with
   `getBoundingClientRect()` through `bsk evaluate`. Inside a frame, such as a preview in an
   iframe, add the frame's own box to the inner box, scaled by the frame's width over its
   `innerWidth`. A cross-origin frame cannot be scripted: take the control's ref from the sync
   and run `bsk scroll-to <ref> --json`, which returns `x`, `y`, `width` and `height` in the
   page's CSS pixels.
4. Capture the viewport and crop it:
   ```bash
   bsk screenshot --out <run>/media/raw/<name>.png --json --session <id> --context <ctx> --observation <obs>
   node {{skills_dir}}/docs/scripts/shoot.mjs --crop <run>/media/raw/<name>.png --page-width 1440 \
     [--box x,y,w,h] [--spotlight x,y,w,h]... [--highlight x,y,w,h]... [--arrow x,y,w,h,from[,length]]... \
     [--marker n,x,y,w,h,at]... [--redact x,y,w,h]... [--mark name,x,y,w,h]... --out <run>/media/<name>.webp
   ```
   The capture must be 2880 by 1800; `--crop` refuses a source under 2x. Repeated `--spotlight`
   boxes join into one bright area that holds them all; a second, separate area is
   `--spotlight-also`. `--mark name,x,y,w,h[,pad]` draws nothing and writes `<name>.json` with
   the box in percent of the finished image, grown by `--pad` or its own pad: on the
   help-center path it is the only annotation flag to pass, beside `--redact`. Keep the raw
   capture: a changed annotation is a second `--crop` run, not a second visit. Something
   mid-animation, such as a rotating announcement bar, shows as a difference between two
   captures: retake while they differ there.
5. Open the result. Blur internal names the reader should not see, such as a development
   theme's name, with `--redact`, and check that every annotation lands where the alt text says.
6. Run `bsk emulate --off`, then `bsk session stop <id>`, on success and on failure.

Never click **Save**, **Publish**, or anything else that changes the product while setting up
a shot. Opening a panel or a picker is fine, and so is changing a setting only to show its
result, as long as it is never saved. Roll every such change back with the editor's own Undo
until **Save** is disabled again, before the next navigation, so no leave-page prompt opens. Some
editors record an unsaved change just from opening a panel; undo it the same way, or ask the
user to leave the page through its prompt.

Without `bsk`, run once per host:

```bash
node {{skills_dir}}/docs/scripts/shoot.mjs --login <url>
```

It opens a window, the user signs in, and the session is saved in `~/.cache/docs-skill/` when
they close the tab, outside every repository and readable only by them. Closing the whole
window can end the browser before the last save. Signing in is the user's step: stop and ask them,
never type a password. The session expires after some days, and a shot that lands on a sign-in
page means it is time to run `--login` again.

Playwright comes from the product's `node_modules`, else from `~/.cache/docs-skill`. When
neither has it, the runner prints the one install command.
