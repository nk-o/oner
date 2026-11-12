# A help center other than Poise

`SKILL.md` and `poise.md` describe the path through Poise, which has drafts, draws annotations
itself, and reads and writes articles through tools. On another platform the steps are the
same and these parts differ. No reference covers a second platform's own tools yet, so write
what it cannot do under `## Platform limits` in `run.md`.

## Bodies and drift

Where the platform exports an article's body to a file, keep it as `live/<slug>.md`. Before
writing an update, export again and run
`node {{skills_dir}}/docs/scripts/drift.mjs <run>/live/<slug>.md <fresh export>`, which shows
whether anyone changed the article since the pull.

## The preview stands in for drafts

On a help center without drafts, build
`node {{skills_dir}}/docs/scripts/preview.mjs <run> --site <help center host and path>` and
publish `preview/index.html` as a private page when the host can (the Artifact tool), with
`preview/media/` as its files. Nothing is written to the help center before the stop, and the
stop's table links the preview where Poise would link an `editUrl`.

When the run adds or retakes more than a handful of images, show them to the user as one page
grouped by article, each with its file name, and change no article until the user approves
them.

## The changelog

The help center keeps one changelog article, each version one `##` with the version and the
date, newest first. A release is an **Update** of that article, not a new entry.

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
