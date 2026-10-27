# Edit files

One JSON file per video, read by `scripts/edit.mjs`. Paths resolve against the file's folder.

```json
{
  "size": [1920, 1080],
  "fps": 60,
  "segments": [
    { "src": "cards/intro.mp4", "from": 0, "to": 2.6, "transition": { "type": "fade", "dur": 0.35 } },
    { "src": "shots/hero.mp4", "from": 0.25, "to": 3.1, "transition": { "type": "smoothup", "dur": 0.45 } },
    { "src": "shots/cards.mp4", "from": 2.2, "to": 7.0,
      "camera": [{ "at": 0, "zoom": 1.35, "focus": "mark:card" }, { "at": 4.8, "zoom": 1.42, "focus": "mark:card", "ease": "linear" }] },
    { "src": "cards/end.mp4", "from": 0, "to": 2.1, "hold": 2.6 }
  ]
}
```

| Key | Holds |
| --- | --- |
| `size` | output pixels; a take of another aspect is cropped from its top |
| `from`, `to` | seconds of the take, never stretched or sped up |
| `hold` | seconds the last frame stays on screen, for a closing card |
| `still` | longest run of identical frames kept, in seconds (default `0.45`, or the file's `still`); `false` keeps them all. Runs at the start and end of a segment are cut almost entirely |
| `settle` | seconds of a still ending kept (default `0.3`); 1.2 or more when the end state is the result the viewer has to read, such as an open cart |
| `drift` | camera push across a segment with no `camera`, as zoom gained (default `0.035`, or the file's `drift`); `false` for a segment already in motion, such as a survey window or a card |
| `camera` | keyframes: `at` seconds into the segment, `zoom` (1 is the whole frame), `focus` as `[x, y]` in take pixels or `mark:<name>`, `ease` into this keyframe (`inOut`, `out`, `in`, `linear`) |
| `transition` | into the next segment: `{ "type": "cut" }` or an ffmpeg `xfade` type with `dur` |

## Camera

- Zoom 1.0 for layout, 1.2-1.5 for a component, 2.0 at most for one control.
- Zoom in over about 1 s with `inOut`, after the viewer has seen the wide frame for 0.8 s or
  more, toward the place the next action happens. Hold the zoom with a slow linear drift of
  2-5 %, never a dead stop and never zoom in and out within 1.5 s.
- Zoom out, or cut, before moving to a distant part of the page. A long pan at 2x makes people
  feel ill.

## Transitions

- `cut` between takes of one action, such as a click and its result, and whenever the motion
  carries across.
- `smoothup` (0.4-0.5 s) to a section further down the page, `smoothleft` to another page or
  an interaction, so the direction matches where the viewer is going.
- `fade` only out of the opening card; `fadeblack` (0.6 s) only into the closing card.
- Never the decorative types (`circle*`, `wipe*`, `pixelize`, `radial`, `zoomin`).
- A segment that follows a slide starts on a still moment of 0.3-0.5 s: begin its scroll or
  its action after the transition has landed, or the movement reads as a glitch.
