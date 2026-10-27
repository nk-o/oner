---
name: architecture-scan
description: Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
disable-model-invocation: true
---

# Architecture Scan

Surface architectural friction and propose **deepening opportunities**, refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This command is _informed_ by the project's domain model and built on a shared design vocabulary:

- Run the `/codebase-design` skill and use its glossary and principles in every suggestion.
- The codebase's own names are the domain language. The types, the tables, the routes, and the directory names are what the team already calls these things, and a seam named after one of them survives review. Do not invent a parallel vocabulary for the report.

## Process

### 1. Explore

Read the project's instructions file first, `AGENTS.md` or `CLAUDE.md`. That is where the team's own vocabulary and its stated rules live.

**Scope before you scan.** Deepening a module pays off by making future changes to it easier, so weight the parts of the codebase that keep changing. Decide where to look before you look:

- If the user named a direction (a module, a subsystem, a pain point), take it and skip the step below.
- Otherwise find the hot spots in the history: `git log --since=6.months --name-only --format= | sort | uniq -c | sort -rn | head -40` lists the files changed most often. Let those paths pull the exploration first. When the changes are scattered with no clear hot spot, widen the net.

Then use the host's read-only exploration subagent to walk the codebase. On Claude Code,
use `subagent_type=Explore`, and give it the scope you chose. If subagents are unavailable, explore inline. Don't follow rigid
heuristics. Explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow**, with an interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

Nothing reaches the report that you did not open the code to check. The Explore subagent returns leads, not findings. Open every `file:line` it cites and trace the callers of anything you propose to change before it becomes a card. A candidate you could not verify is dropped, or it goes in marked `Speculative` with the reason.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to the OS temp directory so nothing lands in the repo. Write to `<tmpdir>/architecture-review-<timestamp>.html` so each run gets a fresh file. Open it for the user, then tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals. Use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, render a card with:

- **Files.** Which files/modules are involved
- **Problem.** Why the current architecture is causing friction
- **Solution.** Plain English description of what would change
- **Benefits.** Explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram.** Side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength.** `Strong` when you applied the deletion test and traced every caller of the interface in question. `Worth exploring` when the shape is clear but the caller set is large or partly untraced. `Speculative` when the pattern is visible and the evidence stops at reading. Rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Deliberate choices.** Some of what looks like friction was chosen on purpose. Before proposing a candidate that undoes a structure, run `git log -- <path>` over it. A commit message that argues for the current shape is a reason the team already had, and it outranks your read of the code. Surface the candidate anyway when the friction is real, and say in the card which choice it reopens and why now is different. Never propose a refactor whose own history says it was tried and reverted.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, ask which candidate to explore, using the question routing in `AGENTS.md`, with your top recommendation first.

### 3. Grilling loop

Once the user picks a candidate, run the `/grilling` skill to walk the design tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

This skill writes nothing into the repository. The report lives in the temp directory and the decisions live in the conversation.

- **A term in the conversation is fuzzy or overloaded?** Propose the precise name before the design goes further. Two people meaning different things by "account" put the seam in the wrong place.
- **The user rejects a candidate with a load-bearing reason?** Say the reason back in your summary so the next run has it. Do not re-suggest it later in the same session.
- **Want to explore alternative interfaces for the deepened module?** Run the `/codebase-design` skill and use its design-it-twice parallel sub-agent pattern.
