#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src test

cat > package.json <<'EOF'
{ "name": "notes-search", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF
cat > src/search.js <<'EOF'
export function search(notes, query) {
  const q = query.toLowerCase();
  return notes.filter((n) => n.title.toLowerCase().includes(q));
}
EOF
git add -A
git commit -qm "feat(search): add note search"

cat > test/search.test.js <<'EOF'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { search } from '../src/search.js';

const notes = [{ title: 'Groceries' }, { title: 'Trip plan' }];

test('finds a note by part of its title', () => {
  assert.deepEqual(search(notes, 'trip'), [{ title: 'Trip plan' }]);
});
EOF
git add -A
git commit -qm "test(search): cover title match"

git checkout -q -b fix/blank-search
cat > src/search.js <<'EOF'
export function search(notes, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  return notes.filter((n) => n.title.toLowerCase().includes(q));
}
EOF
git add -A
git commit -qm "fix(search): return no notes for a blank query"

cat >> test/search.test.js <<'EOF'

test('a whitespace-only query finds nothing', () => {
  assert.deepEqual(search(notes, '   '), []);
});
EOF
git add -A
git commit -qm "test(search): cover a whitespace-only query"
