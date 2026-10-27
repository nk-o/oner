# The verify skill

`.claude/skills/verify-<app>/` is a committed project skill that any agent uses to drive the
app the way a user does and to prove a change on the real surface. It is a tool, not a page of
instructions. An agent that writes its own driver script every session writes a different one
each time, and a check that changes between runs proves nothing across them.

```
.claude/skills/verify-<app>/
  SKILL.md        when to reach for it, this project's specifics, Seed
  features.json   the feature map
  verify.mjs      the CLI, in the project's own runtime
```

**The CLI.** One entry point, run from the repository root. One line per item, a non-zero exit
on any failure, so nobody has to read the output to know whether it passed.

| Command | Does |
| --- | --- |
| `start` | Brings the app up for this checkout and waits until it answers. A no-op when it already does. Records any shared state it changes |
| `doctor` | Read-only. The app answers, it runs from this checkout, the install and the browser are current, the session is signed in. Names the command that fixes each problem |
| `list [--affected <base>]` | Feature ids. With `--affected`, only features whose `code` globs match a file changed since `<base>`, uncommitted files included. Changed files no feature claims go to stderr as `unmapped <file>` |
| `check <id>... \| --all [--out <dir>] [--width <px>] [--block <url glob>]` | Per feature: open it, run its steps, wait for its `url` and its proof, save a screenshot. `ok <id>`, `fail <id> <reason> <screenshot>`, or `skip <id>` when the width does not show it. `--block` fails matching requests |
| `map` | The map against the code: a `code` glob that matches nothing, a route or screen the code defines that no feature covers and `omit` does not list |
| `stop` | Undoes `start`: stops what it started and restores what it switched |

A page error or a failed request for the app's own assets fails the feature, whatever the proof
shows. Without `--out`, screenshots go to a temp directory and the CLI prints its path. Runtime
state (a pid, a log, a session) lives in a temp directory keyed by the checkout, never in the
repository. The port comes from `.claude/launch.json`, the environment, or the harness's own
config, never a constant, so the same CLI drives every worktree. Drive the surface with the
browser driver the project already has, and reuse its test sign-in rather than building a second
one. Sign in once and keep the session in that temp directory, signing in again only when it
expires: an app that limits sign-in attempts locks out a CLI that signs in on every command.
When the project has no driver, resolve one from a local harness outside the repository and say
where in SKILL.md, because a new dependency in the project is the user's decision.

When the app runs outside the repository, such as one local server shared by several projects,
the CLI finds it through an environment variable with a documented default. Only one checkout
drives a shared harness at a time; record that in `AGENTS.md` as step 5 of
[SKILL.md](../SKILL.md) does for a shared service. When several repositories share one harness and one shape, write the CLI with no
project name in it, so the same file serves them all and only the map differs.

**The feature map.** `features.json` lists every place a user can reach, not the few used
most, because a regression lands in the feature nobody thought to check. One entry:

```json
{
  "id": "note-edit",
  "title": "Edit a note",
  "path": "/notes",
  "steps": [{ "click": "role=link[name=\"First note\"]" }, { "click": "role=button[name=\"Edit\"]" }],
  "route": "/notes/[id]/edit",
  "url": "^/notes/[^/]+/edit$",
  "proof": "role=textbox[name=\"Body\"]",
  "code": ["src/app/notes/[id]/edit/**", "src/lib/notes/**"]
}
```

`path` and `steps` are how a user gets there, through stable handles (routes, roles, labels,
data attributes), not coordinates. `route` is the page the feature lands on, as the router
names it, and it is what `map` matches against the route files. `url` is what the address bar
shows once the feature has loaded; `check` waits for it, because after a client-side navigation
the page being left is still on screen. `code` is where the feature lives, the data layer behind
it included, and it is what `--affected` matches a diff against. The glob matcher treats `[`,
`]`, `(` and `)` literally, because frameworks name folders with them. Beside `features`, the
file holds `shared`, the globs whose change selects every feature (the root layout, global
styles, the package manifest), and `omit`, each uncovered route with its reason, so `map` can
come back clean.

`proof` is what the user sees when the feature works. A proof that passes without the steps
observes nothing: an element hidden by `opacity`, `clip-path`, or `inert` still counts as
visible to the driver, and a panel that is always in the DOM is present whether or not it
opened. Prefer the state the action changes, such as `[data-state=active]` or a class the
action adds. Add `minWidth` or `maxWidth` to a feature the layout shows only at some widths,
and `session: false` to one a signed-out user reaches.

A feature that is reachable only after a data change, such as a record switched to another
layout, gets a `seed`: a change the CLI applies before the check and reverts after it, and
reverts again on the next command if a check crashed. It runs in `check --all`. `writes: true`
marks a feature whose change the CLI cannot revert; `check --all` leaves it out unless it is
named. A local database or harness that every checkout shares cannot be reset for a check, so a
proof reads data the seed guarantees, not rows someone happened to create.

Build the map from the code on the default branch's head, not from memory: the router's route
files, the templates, the navigation, and any registry of panels or dialogs that have no route.
Where routes are implicit, as with templates chosen by file name, `map` checks each template by
name, because a wildcard glob would count everything as covered.

**SKILL.md.** Frontmatter `name: verify-<app>` and a description naming the app, the surface,
and when to reach for it. The body holds what the CLI cannot say: what `start` runs and what it
needs, where the signed-in session comes from, what a shared harness means for parallel
worktrees, and **Seed**, which is how to put extreme data in front of the surface for
`break-ui` and `break-api` (no data, the most data, a record at the longest accepted values). It also holds
these rules. A change that adds, moves, or removes something a user reaches updates
`features.json` in the same diff. A command the CLI lacks is added to the CLI, not written as a
one-off script. When `list --affected` prints `unmapped` files, run `check --all`. The three
files pass the project's formatter and linter when those cover `.claude/`.

Prove it before you report it, with the output pasted: `start`, `doctor`, `map`,
`check --all`, then a one-line break in a file some feature's proof depends on, where
`list --affected HEAD` names that feature and `check` on it fails, then the file restored and
`stop`. A CLI that never failed has not shown it can. A feature that fails `check` is either a
map error to fix or a product bug to report, and the report says which. A verify skill in the
older one-file form is migrated: its Features become map entries, its Launch and Doctor become
commands, its Seed stays.
