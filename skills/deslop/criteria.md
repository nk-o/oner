# What slop is

The rules `deslop` applies to a path or a whole repository, and the oneshot tail applies to a
diff. Each kind says what goes, what stays, and the proof a removal needs. A removal changes no
behavior. A cleanup that needs a test's assertion changed has changed behavior, so put it back.

## Comments

Goes: a line that says what the next line does, a section banner, commented-out code, a
restated name or type, history ("added for #123", "previously this used X"), a TODO with no
issue, a defense of this repository's own design.

Stays: the keep list in **Editing** in `AGENTS.md`, and nothing else. A comment that warns,
such as "do not remove", "order matters", or "IMPORTANT", states a constraint. Turn it into a
type, a test, or a lint rule and delete it. When that is out of reach for this pass, keep it
and list it. A comment that explains a surprise in this repository's own code goes, and the
symbol it explained is listed as a rename or refactor candidate, not refactored here.

Comments go to a reader who did not write them, because an author keeps its own. When the
comments in scope are yours, hand this kind to a subagent.

Proof: the commit removes comment lines and changes nothing else. Read its diff once to confirm.

## Tests

Goes:

- A test whose only assertion is that this repository's own code, mocked, was called or was
  called with some arguments. What a boundary the repository does not own receives, such as an
  email sent or a vendor request body, is behavior and stays.
- A test that restates on-screen text, a log line, a config table, a catalog, or a constant the
  code already holds.
- A test of the same branch as another test, with an input that changes nothing. Merge it into
  a row of that test's table.
- A test whose name claims a check its own mocks remove, such as "refuses a non-owner" with the
  access module mocked out. Make it check what the name says, or delete it.
- The tests of code that goes in this pass.
- Scaffolding copied into three or more test files: one fake, one `tool()` builder, one render
  helper. Move it to the project's shared test helpers, or create that file where the project
  keeps them.

Stays: a test that fails when a behavior breaks and that no other test catches.

Proof for a test that claims to guard a behavior: break that behavior in the source with a
one-line edit, run the tests that remain, see one fail, and revert the edit. When none fails,
the test was the only guard, so it stays. A test of a mock's arguments guards no behavior and
needs no such proof, but when the path it covered handles money, access, deletion, or a data
write and nothing else covers it, list that path as a gap.

Never delete a test because it fails.

## Unreached code

Goes: an export, a function, a file, a flag, or an option that nothing outside its own tests
reaches, and a compatibility path for a caller this repository owns. Run the project's
dead-code tool, such as `knip`, `ts-prune`, `vulture`, or PHPStan's unused rules, with unused
exports turned on for this pass even where the project's configuration leaves them out. Then
confirm each hit by search, including references by string: a registry, a route table, a hook
or filter name, a template, a job name. The code and the tests that only test it go in one
commit.

Stays, listed as `DECIDE`: a surface something outside the repository may call, such as a
package's exports, a REST route, a plugin hook or filter, a CLI flag, or a database function;
the off path of a flag that still exists; a migration.

## Copies

Goes: a helper that re-implements one the repository already has. Move its callers to the
existing one when both return the same for every input those callers send, and the checks stay
green. Copies that differ in one detail often differ on purpose, so read the difference first.

Logic copied across a boundary, such as PHP and JavaScript, a free and a paid edition, or
migration SQL and application code, held together by a "keep in sync" comment, gets one source
or a test that compares both copies. When neither is in reach, it is a `DECIDE`.

## Guards for cases that do not exist

Goes: a check on data whose type or whose parse at the boundary already rules the case out, a
`catch` that turns an error into a default nobody handles, a fallback for a state the code
cannot enter. Show the type, the parse, or the caller that rules the case out. A `catch` around
a call this repository does not own, such as a network call or a vendor SDK, usually handles a
case that exists, so it stays.

## Relaxed gates

In a diff only. Flag, do not fix: a raised limit, timeout, budget, or retry count, an exact
value loosened to a range, an added skip or focus, a test deleted while the code it tested
stays. Each needs a measurement in the diff or the user's decision, per **Verifying** in
`AGENTS.md`.
