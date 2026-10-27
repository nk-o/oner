---
name: product-video
description: >-
  Records a website or web app in headless Chrome and cuts the takes into a short product
  video: a marketplace listing video, a launch or feature reel, a demo of a theme preset.
  Plans the shot list, scripts scrolls, hovers, and clicks, adds camera zooms and transitions,
  and renders a 1080p 60 fps file. Use when asked to make, redo, or improve a product video,
  promo, highlight video, or screen-recorded showcase of a site. For still screenshots in docs,
  use `docs`; for designing motion inside the product, use `motion-design`.
argument-hint: "[the product or URL, the audience, and where the video will play]"
---

# Product video

A product video is a short argument made of the product's own screens: each shot shows
one thing the product does, long enough to read, and the cut moves on the moment it has been
seen. It is not a tour of every section. A viewer watches it muted, in a small player, once.

Two CLIs in `scripts/` do the mechanical work, with no npm dependencies. They need Google
Chrome and `ffmpeg` on the machine. The other two files there, `assemble.js` and
`card-stage.js`, are page helpers a shot runs in an `eval` step; [craft](references/craft.md)
says when.

- `scripts/record.mjs <shot.json> <out.mp4>` records one take. Format: [shots](references/shots.md).
- `scripts/edit.mjs <edit.json> <out.mp4>` cuts takes into the video. Format: [edit](references/edit.md).

Work in a run folder outside git, such as `.specs/NNN-video-<slug>/` in the product's
repository: `shots/` for shot files and takes, `cards/` for title cards, `edit.json`, `out/`.

## 1. Brief

Settle with the user, before recording, what a viewer could notice:

- Where it plays and in which frame. A Shopify Theme Store listing plays the first highlight
  as a YouTube embed, muted, in a 4:3 card and mobile player and a 16:9 desktop modal. Other
  platforms have their own frame. Record in the frame most viewers see: 4:3 (1440 x 1080)
  for a Theme Store listing.
- One video per variant, or one for the product. Per variant (one per theme preset, one per
  plan) when each has its own listing or audience.
- The three to five things the video must prove, ranked. They come from the product's real
  strengths, not from what is easy to film.

Done when the brief names the frame, the count of videos, and the ranked claims.

## 2. Shot list

List the shots per video before recording anything. For each: the claim it proves, the page
and the section, the action (load, scroll, hover, click, type), and the state that has to be
on screen long enough to read. Read [craft](references/craft.md) first: it holds the pacing,
the hold times, and the mistakes users have rejected before.

- Open on the product in motion: the page loading with its own intro, not a black card.
- Alternate kinds of shot: a scroll-driven section, then an interaction, then a layout. Never
  put two shots of the same shape side by side, such as two rails of product cards.
- Every section appears once per video.
- The interaction shots carry the story. Show cause and effect: the cursor arrives, rests,
  clicks, and the result settles on screen before the cut.

Done when the list fits the length, every claim has a shot, and no section repeats.

## 3. Record

Start with a survey pass of every page the video may use: one shot that loads the page and
scrolls to `end` at `speed` 300-360. Tile it at one frame per second, mark the windows worth
showing, and cut sections from it rather than recording each one alone. Record separate takes
only for the load intro and for interactions.

Write one shot file per take and record it. Record each take on its own, so a bad take is
redone without touching the rest. Look at every take before editing: tile frames into one
contact sheet (`ffmpeg -i take.mp4 -vf "fps=2,scale=240:-1,tile=10x2" -frames:v 1 sheet.png`)
and read it.

A take is usable when:

- its first frame is the state the shot starts from, not a leftover of the previous page;
- nothing in it waits on a spinner, a skeleton, or a blank image longer than a cut can hide;
- the action is slow enough to follow at normal speed. Never speed up footage in the edit:
  frame skipping reads as fake. Slow or quicken the scripted action and record again.

Recording against a local dev server, such as `shopify theme dev`, has its own traps; see
[shots](references/shots.md#dev-servers).

## 4. Title cards

The opening and the closing card are HTML pages recorded like any other shot, in the
product's own fonts and colours, so they match the screens around them. See
[craft](references/craft.md#title-cards). The closing card holds 4 seconds or more and ends
on one call to action.

## 5. Edit

Write `edit.json`: segments cut from the takes, a camera per segment where a detail needs to
be read, and a transition into the next segment. Render, then tile the result at one frame per
0.8 seconds and check it against [craft](references/craft.md#review) before showing anyone.

Done when the render passes the review list and its length is inside the brief.

## 6. Hand over

Give the user each video with its length, and say what is left: a take that could not be
made clean, a claim with no shot. A video for a listing is uploaded by the user; the run does
not publish.
