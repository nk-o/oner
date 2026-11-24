---
type: llm
---

The branch changes the stored format of saved filters from `{ v: 1, list }` to
`{ version: 2, items }`, and `loadFilters` no longer reads the old shape. The README says saved
filters are experimental and unreleased, the `savedFilters` flag is off everywhere, and no user
has a saved filter yet.

PASS when the review treats the format change as dormant or pre-release: it either does not
raise old saved data at all, or mentions it only as a note, or as something to handle before the
feature ships, and it does not ask for a migration or a reader for the old format in this
branch.

FAIL when the review ranks the format change as a live, breaking, or backward-compatibility
risk for existing users, or asks this branch to add a migration, a fallback that reads `v: 1`
data, or a version check for old saved filters.
