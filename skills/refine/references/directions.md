# Directions

Read only the section for the direction step 1 chose. Numbers here are starting points for a
surface with no rule of its own. The product's tokens and `DESIGN.md` win over them.

## Polish

Fix in this order, and finish one level across the whole target before the next:

1. A blocked task, lost input, a misleading state, an inaccessible path.
2. Missing states: loading, empty, error, success, disabled, no permission.
3. Drift from the neighbors: terminology, component choice, spacing scale, hierarchy.
4. Details: optical alignment (an icon or a play glyph can sit off its mathematical center),
   icon size and stroke weight, the same role set in the same type, browser surfaces (text
   selection, caret, scrollbars, focus ring, link underline offset, tabular figures in data).
5. Cleanup: dead styles, unused imports, and values duplicated during the pass.

Do not add animation to make the polish visible.

## Quieter

Typical causes are too many accents, saturated color, competing weights, decoration with no
role, motion, and large jumps in scale.

- Color marks what needs attention. Neutrals carry the rest. Mute an accent by lowering its
  saturation to roughly 70 to 85 percent, or by taking the system's quieter step, not by
  turning it gray. Secondary text on a colored surface takes a darker step of that hue.
- Lower weights by one step (700 to 500, 900 to 600) everywhere except one or two anchors.
  Those stay at full strength, so the hierarchy survives.
- Remove decoration with no role: glows, stacked shadows, decorative blur and gradients, a
  border that repeats what a fill already shows.
- Shorten motion distance (10 to 20 px instead of 40) and use an ease-out curve without bounce.
  Remove motion that explains no change.

A quiet surface still has hierarchy, color, and controls that look operable. Equal sizes
everywhere, grayscale, and controls that look like text are failures of this direction.

## Bolder

Touch only the target. A section usually reads flat because it skips something its neighbors
already do: the display type at full size, the product's signature device, a change of
density or pace. Raise the target to that level in the system's own vocabulary. When the
system cannot express the direction, ask for the exact addition.

- Make one decisive move, then quiet what surrounds it so the move reads. If every element got
  louder, nothing stands out. More effects is not bolder.
- Skeleton test: hide the copy (for example `color: transparent` on text) and capture the
  target. The structure alone should show what matters. If it does not, the boldness is only
  in the font size.

## Distill

- One primary action per view. Secondary actions look secondary.
- Run "Every element has a job" from `frontend-design` on each element of the target. A label
  that repeats its column header goes too.
- No card inside a card. Remove a container whose content spacing alone would group.
- Count the type sizes, weights, and accent colors on the target. Collapse values that differ
  without a role to the nearest token. A product surface rarely needs more than three or four
  sizes, two or three weights, and one or two accents besides the state colors.
- Match the complexity to the task. A tool used all day may need its density, so a cut that
  slows an expert is a proposal, not a fix.

## Clarify

Start from "Words in the interface" in `frontend-design`. For each state, the copy gives the
one fact the user needs now, the next action, and only the context that changes the decision.

- Buttons name the outcome as a verb and an object, such as "Delete project". A confirmation
  never offers Yes, OK, or Submit.
- An error says what failed, why when that is known, and how to recover. An internal code is
  never the main message.
- Empty states differ by cause: first use, no results, everything filtered out, no
  permission, and a failure.
- Messages are complete translatable strings with plural rules, not concatenated fragments.
- Ask before changing a factual claim, legal text, or a domain term the audience uses.
  Replacing a confirmation with undo changes behavior, so it is a proposal.
