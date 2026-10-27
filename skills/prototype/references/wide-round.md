# Wide round

A wide round replaces the default three directions when the user asks for a wide or bold
exploration, many directions, or options beyond the current design system. It costs several
times a default round, so it runs only on that request.

## Diverge before building

The first ideas that come are the most typical ones, and a set built from them reads as one
design in several colors. Draw the set from a longer list instead.

1. List the axes this surface can move on: structure and what leads, density, metaphor (how
   the product is framed, such as a ledger, a studio, a feed, or a canvas), type, palette and
   background logic, media, and interaction model. Drop an axis the brief fixes.
2. Write 15 to 20 one-line concepts. Each names its metaphor, its position on every axis, and
   how often a designer would reach for it: common, uncommon, or rare. At least a third are
   rare. A concept that only recolors another is not a concept.
3. Pick 8 to 12 directions with the widest spread, or the count the user named. Every pair
   differs on at least two axes, one of them structure or metaphor. Apply the swap test: when
   the headlines of two directions could trade places without anyone noticing, they are one
   direction, so drop one.
4. Split the freedom. About half the set stays inside the product's tokens, fonts, and
   components and differs in structure, density, and interaction. The other half is beyond
   system: free to change type, palette, and metaphor. A request that sets the freedom level
   replaces this split. Product behavior, factual copy, and data stay fixed in both.
5. Order the set from closest to the current product to boldest, and write a brief for each
   direction: its name, its concept line, its axis positions, and whether it is beyond system.

Done when every chosen direction has a brief and no pair fails the two-axes rule or the swap
test. Keep the concepts left out. The handover lists them so the user can ask for one.

## Build

Write the harness, the fixtures, and the scenario control yourself, then give each direction
to its own subagent where the host can run them. Its prompt holds the brief, the paths of the
shared files it may read, the one mount file it may write, the `mount(stage, params)`
contract, and these instructions: use `frontend-design`, carry every axis position of the
brief to its end, and operate the direction in a browser before returning. A fresh context per
direction keeps it from converging on its siblings. Without subagents, build the directions in
order and reread each brief before its build.

Turn on the picker's wide-round settings from [the picker contract](picker.md), so `All` shows
every screen scaled down as a map and the user marks what to keep.

## Critique

Check that each direction carries its brief to the end rather than halfway and passes the swap
test against every sibling. A beyond-system direction that changed only color is a refinement.
Rebuild a direction that fails once. When it still fails, drop it and say so.

## Next round

The handover lists the concepts left out. A shortlist starts another round. Riff on the kept
directions with 4 to 6 new ones around them, including crosses the user names, such as one
direction's header on another's layout. Every rejected concept goes into the next round's
briefs as a direction to avoid.
