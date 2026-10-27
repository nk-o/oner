# Lanes and models

A run of more than a few articles splits into lanes of subagents. Each lane gets a brief with the
run folder's path, the slugs it owns, the rules from the pilot or the user, and the command that
proves its part. Lanes that write different files run at once. Lanes that call the help center
share one member's limits, as `poise.md` says under **Limits**.

## Which model does what

Work splits by what can go wrong in it. A mechanical step with a precise brief and a script or a
checksum behind it loses nothing on a cheaper model. A step that decides what a sentence says
does.

| Work | Model | Why |
| --- | --- | --- |
| Lookups: exact search, product references, pulling `live/<slug>.json` | cheaper | The search answers `total` and `scanned`; nothing is judged |
| Uploading media and recording each URL in `images.json` | cheaper | The tool answers the URL; the brief says where it goes |
| Writing from `upload/`: `edit_article`, a file body, metadata, product references | cheaper | `body.mjs` and `meta.mjs` prepared every value, and each write answers a checksum |
| Publishing and `verify.mjs` | cheaper | Both answer per article, and a failure names itself |
| Writing and updating articles | strongest | A writer reads the code behind each sentence and finds what the brief did not say: a default the inventory spells differently, a condition only the rendering code shows, a label that misleads |
| Fresh reader | strongest | Its value is the question a reader would ask and the brief did not foresee |
| Reading the writers' output before ticking `checked` | the session's own | It is the run's own check and is never delegated |

On Claude Code, pass `model: "sonnet"` for a cheaper lane and no `model` for the others. On
another agent, take its smaller model for the cheaper rows. A cheaper lane's brief names the
exact tool calls, the files they read, and what to record, and stops at the first answer that
differs from the brief: a mechanical lane never decides what to do about one.

## Comparing two models on writing

No run has measured a cheaper model against the strongest on writing. Before moving writers to
a cheaper model, measure it on one batch:

1. Pick five articles from the run's checklist of at least three types, at least one with an
   image to place and one whose change touches a condition in the code.
2. Run two writer lanes on the same brief and the same slugs, one per model, each into a
   folder of its own, `<run>/compare-a/` and `<run>/compare-b/`, with its own `articles/` and
   `edits/` and a copy of `media/`. Neither sees the other.
3. For each lane, count: lint findings; facts that disagree with the inventory or the code,
   checked by a third subagent that reads each claim against its `sources`; edits outside what
   the change made wrong; findings the writer raised that the brief did not hold; and the fresh
   reader's questions a user would ask.
4. Build the preview of each folder with `preview.mjs <run>/compare-a` and `compare-b`, the
   folders named `A` and `B` only, and ask
   the user which reads better per article, without saying which model wrote it. It shows the
   text and the images without the help center's marks, which is what the comparison judges.
5. Write the counts and the user's verdict into `run.md`. Move writers to the cheaper model only
   when its counts and the verdict are no worse, and keep the comparison for the next run.

## The fresh reader at scale

Every article a run writes or changes gets a fresh reader, however many there are. A run of
many articles runs them in parallel, five at a time, one reader per article given that article
and its images alone, because a term another article defines would answer the reader's
question for it. For an update the reader gets the article as `get_article`
returns it and its edits, before anything is written. The writer of a batch answers its
reader's questions and the session reads the answers. Skipping the readers to save time leaves
every question a user will ask to the user.
