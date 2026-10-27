### Refactor lane

The structure changes and the behavior does not. A refactor that uncovers a missing feature
or a bug splits in two: the structural change ships first against the pinned contract, and
the rest is its own run.

1. **Pin the behavior.** Read the affected code and every caller, write the contract down,
   then capture it in something that fails when it changes: a characterization test, a
   snapshot, a recorded output replayed against the new code. Type-check and lint are not a
   pin. The pin is the acceptance criterion for the whole run.
2. **Name the target shape, then gate.** The module layout, the types, and the call graph as
   they would be if built today, with a structure in place of scattered conditionals per
   **Shaping code** in `AGENTS.md`. The gate screen: the pin, the target shape, every caller
   that changes.
3. **Split the work.** Answer the four questions under **Delegating the work** in the run log.
4. **Subtract first.** Delete dead code, one-caller wrappers, redundant guards, and orphan
   references before the new shape lands. Its own commit.
5. **Move in steps that keep the pin green.** Migrate every caller and delete the old path in
   the same wave, with no compatibility shim for callers this repository owns. Spot-check
   every rename in strings, prose, and config, which a symbol search misses. Delegate
   mechanical slices per **Delegating the work**.
6. **Prove the behavior held on the real artifact.** The pin, plus one run of the surface a
   user touches. "It compiles" is not proof. A cleanup that changed behavior is reverted, not
   patched.
7. **Keep it only if a reader wins.** Fewer layers to trace, or less state to hold in the
   head. Otherwise revert, and say so.

Commits in this order: the subtraction, the reshape, the follow-on cleanup.

Then [`tail.md`](tail.md).
