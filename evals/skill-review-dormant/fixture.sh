#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src

cat > package.json <<'EOF'
{ "name": "task-board", "private": true, "type": "module" }
EOF
cat > README.md <<'EOF'
# Task board

## Saved filters (experimental, unreleased)

Saved filters sit behind the `savedFilters` flag in `src/flags.js`, which is off in every
environment. The feature has not shipped, so no user has a saved filter yet. The storage format
may change freely until release.
EOF
cat > src/flags.js <<'EOF'
export const flags = {
  savedFilters: false,
};
EOF
cat > src/saved-filters.js <<'EOF'
const KEY = 'saved-filters';

export function saveFilters(storage, filters) {
  storage.setItem(KEY, JSON.stringify({ v: 1, list: filters }));
}

export function loadFilters(storage) {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  return JSON.parse(raw).list;
}
EOF
cat > src/board.js <<'EOF'
import { flags } from './flags.js';
import { loadFilters } from './saved-filters.js';

export function sidebarItems(storage) {
  const items = [{ label: 'All tasks' }, { label: 'Assigned to me' }];
  if (flags.savedFilters) {
    for (const f of loadFilters(storage)) items.push({ label: f.name, query: f.query });
  }
  return items;
}
EOF
git add -A
git commit -qm "feat(filters): add saved filters behind a flag"

git checkout -q -b feat/filter-format
cat > src/saved-filters.js <<'EOF'
const KEY = 'saved-filters';

export function saveFilters(storage, filters) {
  const items = filters.map((f) => ({ name: f.name, query: f.query, pinned: Boolean(f.pinned) }));
  storage.setItem(KEY, JSON.stringify({ version: 2, items }));
}

export function loadFilters(storage) {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  return JSON.parse(raw).items;
}
EOF
git add -A
git commit -qm "feat(filters): store a pinned state with each saved filter"
