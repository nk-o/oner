# Sources

Adapted from [Emil Kowalski's prototype skill](https://github.com/emilkowalski/skills/tree/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128/skills/prototype)
at commit `d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128`, inspected on 2026-09-30.
The upstream MIT license is included in `../LICENSE.txt`. Preserve its notice when copying
the picker into a distributed artifact.

Retained the three-variant default, named differences, shared realistic content, isolated
exploration, full-size working previews, a separate picker, verification, and selection
before promotion.

Changed the explicit-only trigger to automatic discovery. Expanded scope to user-selected
sections, screens, and short flows. Added project `DESIGN.md` authority and a Figma route.
Removed mandatory motion choices and the fixed fallback product palette. Retained
exploration artifacts unless the user requests deletion.

The picker keeps a neutral dark pill and the upstream selection contract. Its targets are
44 px on touch screens and 36 px with a mouse, rather than 28 px. It scrolls on narrow viewports, leaves product control shortcuts
alone, validates the complete URL parameter, and falls back to the first variant for invalid
indices. It remounts synchronously to avoid overlapping scheduled renders. Cleanup supports
timers and listeners. Back/forward selection follows the URL. The active state is immediate,
so there is no highlight animation or motion requirement in the harness.

The control panel, the side-by-side view, and the config export are additions written for this
set, with no text or code copied. The ideas come from three places, inspected on 2026-10-07:
the Tweaks protocol in [Claude Design's variation guidance](https://github.com/nordeim/claude-design-skill-2/blob/main/references/variations-and-tweaks.md)
(one defaults object, few controls, conservative directions next to bold ones), the
[tuning-panel skill](https://www.skills.sh/petekp/claude-code-setup/tuning-panel) (export only
the values that changed), and the [state-machine skill](https://github.com/jakubkrehel/skills)
(each scenario reachable by a `__`-prefixed URL parameter).

The diverge step, the subagent build, the critique pass, the shortlist, and the scaled `All`
grid are written for this set, with no text or code copied. Their ideas, inspected on
2026-10-12, come from the axis rule and `riff` rounds in the upstream prototype skill above,
the text concepts before generation and the swap test in
[gstack's design-shotgun](https://github.com/garrytan/gstack/blob/main/design-shotgun/SKILL.md),
the safe-to-bold ordering in the Claude Design guidance above, and
[Verbalized Sampling](https://arxiv.org/abs/2510.01171) (asking for many candidates with how
typical each is, which the authors report recovers diversity lost to typicality bias).

## Logic prototype

`logic.md` is adapted from the logic branch of [Matt Pocock's prototype skill](https://github.com/mattpocock/skills/tree/v1.3.1/skills/engineering/prototype)
at tag `v1.3.1`, inspected on 2026-10-05. Its MIT license is included in `../LICENSE.txt`.

Retained the visible question, the pure module the page only calls into, free-play buttons,
walkthrough tabs that reset to a known state, domain-language labels, and in-memory state.
Changed the throwaway branch to a file beside the module plus a verdict in the decisions file,
and added a browser run of every walkthrough before handover.
