#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src test
printf 'node_modules/\n.oner/\n' > .gitignore
cat > src/text.js <<'JS'
export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
JS
cat > test/text.test.mjs <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capitalize } from '../src/text.js';

test('capitalize upper-cases the first letter', () => {
  assert.equal(capitalize('привет'), 'Привет');
});
JS
cat > package.json <<'JSON'
{ "name": "text-helpers", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
git add -A
git commit -qm "feat: capitalize helper"
git switch -q -c text-helpers
sha=$(git rev-parse HEAD)
mkdir -p .oner/001-text-helpers
cat > .oner/001-text-helpers/plan.md <<MD
# Text helpers

Planned at. $sha

## Done when
1. \`slugify\` and \`truncate\` are exported from src/text.js and behave as the checks below say.
2. \`npm test\` passes.

## Decisions
- Both helpers live in src/text.js next to \`capitalize\`, with no new dependency.
- \`truncate\` appends a single ellipsis character, not three dots.

## Stage 1: slugify
- [ ] Add \`slugify(s)\` to src/text.js: lower-case, trim, every run of characters other than a-z and 0-9 becomes one \`-\`, no leading or trailing \`-\`. Files: src/text.js. Check: \`node -e "import('./src/text.js').then(m => { if (m.slugify('  Hello, World! ') !== 'hello-world') process.exit(1) })"\`
- [ ] Add a test for \`slugify\` to test/text.test.mjs. Files: test/text.test.mjs. Check: \`npm test\`
- Verify: \`npm test\`

## Stage 2: truncate
- [ ] Add \`truncate(s, max)\` to src/text.js: return \`s\` when it is at most \`max\` characters, else the first \`max - 1\` characters followed by \`…\`. Files: src/text.js. Check: \`node -e "import('./src/text.js').then(m => { if (m.truncate('abcdef', 4) !== 'abc…' || m.truncate('abc', 4) !== 'abc') process.exit(1) })"\`
- [ ] Add a test for \`truncate\` to test/text.test.mjs. Files: test/text.test.mjs. Check: \`npm test\`
- Verify: \`npm test\`

## Deviations
MD
