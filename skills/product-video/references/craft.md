# Craft

Rules for pacing, framing, and title cards. Each one holds a number a source gave or a mistake
a user rejected. Sources and the reasoning behind the numbers are in
[research](research.md).

## Length and pacing

- Length follows the content: up to about 2 minutes when the product has that many sections
  worth showing. What matters is that no shot drags and the cuts flow; 40 s or 80 s is the same
  verdict if every shot moves.
- 10-14 shots. A shot shows one idea and lasts 2.5-4 s; an interaction with its result may run
  to 6 s. When a shot reaches its point, cut. A screen where the animations have finished and
  nothing else happens is dead time, however good it looks.
- Something moves in every frame, and the movement has a shape. A scene centres on one to
  three sections: it eases into the first (`curve: ease`), lets it play, eases to the next. A
  long constant-speed scroll through a page reads as monotone, so a survey pass is for picking
  sections, not for the cut. A shot where the page stands still (a hover, a result on screen)
  gets a slow camera push of 3 % across it, which `edit.mjs` adds by default.
- Two hovers show a hover effect: the first shows it, the second shows it change. A third
  repeats it. The same goes for hotspots, hover rows, and an effect that follows the pointer.
- A section that moves on its own (a drifting photo wall, a marquee) and fits the frame is
  shown without a scroll: land on it and let it run.
- Hand moves are quick and direct: open, move, click, with a 200-350 ms rest before each click
  and no wait after a menu has shown what it shows.
- Hold a settled state that carries the point at least 1.2 s after all motion stops, and text
  meant to be read for 0.6 s per word.
- The first 5 s show the product moving and its name. No black screen, no slogan card.
- Never change the speed of footage. Record the action at the speed it should play. A sped-up
  scroll or a video inside the page played fast looks wrong at once.

## What goes in

- The product's distinctive moves first: what a competitor's video could not show.
- Breadth: a theme video shows 8 or more different sections, from the home page and from the
  pages around it (about, product). Survey them all first and pick the most striking.
- A zoom has a reason the viewer can name: a control too small to read at full frame, such as
  a slider or a swatch. Never zoom into products only to fill time.
- Interactions with cause and effect over passive scrolling: open a menu and switch inside
  it, hover a card, open a quick view, pick an option, add to cart, watch the cart arrive.
- One appearance per section. Check the edges of each take too: a scroll that ends on the next
  section shows that section, and it then repeats later.
- A taller frame shows more of the next section. After changing the aspect ratio, check the
  edges of every take for repeats again.
- Neighbouring sections go in one continuous pass, never in two scenes cut together: a cut that
  lands on part of what the last scene showed reads as a jump back. Between two scenes, either
  show sections far apart on the page (or another page), or keep scrolling in one take.
- A held frame is dead time. `edit.mjs` cuts every run of identical frames down to `still`
  seconds (0.45 by default), and a take keeps moving under a hover or a build with a `creep`
  step, a slow constant scroll.
- No two adjacent shots of the same shape (two grids of product cards, two dark full-bleed
  sections).
- Leave out what the brief does not need, such as a dark-mode toggle when the claim is the
  sections.

## Things that read as bugs

- An image that appears after its frame: every image loads eagerly in a take (the recorder
  does it), and markup fetched on click, such as a quick view, is opened once in `prepare` and
  closed, so the take finds it cached.
- A click on a control that opens on hover, or a hover on one that needs a click. Read the
  section's trigger setting before scripting it.
- The same small change repeated (picking three swatches in turn). Show a change once.
- A pinned, scroll-driven section cut before its end state. Glide through all of it, faster
  than the survey pace if it is long.

## Scroll shape

- Every scroll is eased. A pinned or horizontal section driven by scroll (a carousel that pans,
  stacking cards, a video window) is played with an eased curve to its true end, never a linear
  glide and never cut while its last item is still against the screen edge.
- One long eased scroll, or a chain of eased ones. An eased scroll followed by a slow constant
  creep reads as a stutter; use `creep` only for a whole take that otherwise stands still.
- No creep while the cursor clicks a small control: the target moves away and the click misses.
- A new scene starts still on its section, and starts moving only after the transition into it
  has landed. A scene already scrolling under the transition looks like a broken cut.
- Show a carousel driven by scroll for two or three items, not all of them.

## Loading and entrances

- Images in a section load before its take: a photo that pops in after the scroll is a bug.
- Entrance animations play once, from the page's real first paint. A warmed page that shows its
  content, then hides it and replays the entrance, reads as a glitch.
- The cursor starts where it touches nothing: a cursor that crosses a card on its way flips that
  card's gallery and pulls focus from the subject.
- An effect that follows the pointer (a magnetic play button) is filmed with the recorder's
  cursor hidden and the mouse moving.

## Assembled sections

A section can build itself on screen from its own parts: the photo settles in, the heading
rises word by word, badges and buttons pop, bars grow. `scripts/assemble.js` does it in place
on the real section, so styles and hover states stay the product's own; run it in an `eval`
step with `async: true` after a `creep` step, so the section builds while the page drifts. Vary the recipe per section, keep each under 2 s, and
use it on three or four sections a video, where the parts are worth seeing one by one (product
cards, a featured product, steps). The 3D exploded card in `scripts/card-stage.js` was rejected
as buggy-looking; keep to flat, in-place builds.

## Title cards

- The opening card is the product's logo, set the way the product sets it (for example a
  light and a heavy weight in one word), in its own font and colours. 1.5-2.5 s, then the
  product. Leave it out when the product's own load intro is strong enough to open on.
- Record cards with `headful: true`. Headless Chrome drops text animations to 20-30 fps, and
  next to 60 fps screens the card looks choppy.
- Nothing is on screen in the first frame of a card that the card is about to animate in:
  motion starts after 0.4-0.5 s of the empty background.
- One idea per card, no divider cards between sections ("SCROLL", "SHOP"), no gradient rules
  or decorative underlines.
- One font family per line. Never set names in different fonts side by side.
- The closing card: the product's name, one short line saying who it is for, and one button
  with the call to action ("Try Lair"). Hold it 4 s or more. Keep a clear hierarchy: the line
  about a fifth of the name's height, muted, about 30 px under the name and about 55 px above
  the button.
- No platform names or logos the platform forbids (Shopify forbids its own in listing videos).

## Per-variant videos

When each variant (a theme preset, a plan) has its own listing, make one video per variant
from that variant's own demo, with its own fonts on the cards. Each video picks the
variant's own strongest sections rather than one shot list for all.

## Review

Before handing over, tile the render at one frame per 0.8 s and check:

- the first frame of every shot is its starting state, with no leftover of the previous page;
- no frame shows a spinner, a skeleton, or a blank image for longer than a blink;
- every click is preceded by a visible rest on its target, and its result is held;
- no section appears twice, and no two neighbours look alike;
- every movement after a transition starts after the transition ends;
- no run of three tiled frames (about 2 s) looks the same;
- the closing card holds 4 s or more;
- the video still makes sense at 480 x 270, muted.
