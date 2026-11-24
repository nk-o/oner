#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src test

cat > package.json <<'EOF'
{ "name": "trial-banner", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF
cat > src/trial.js <<'EOF'
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function daysLeft(end, now = new Date()) {
  return end.getDate() - now.getDate();
}

export function bannerText(end, now = new Date()) {
  const n = daysLeft(end, now);
  return n > 0 ? `Trial ends in ${n} days` : 'Trial ended';
}
EOF
cat > test/trial.test.js <<'EOF'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, bannerText, daysLeft } from '../src/trial.js';

test('a trial that ends in three days has three days left', () => {
  const end = addDays(new Date(), 3);
  assert.equal(daysLeft(end), 3);
});

test('the banner counts down', () => {
  const end = addDays(new Date(), 3);
  assert.equal(bannerText(end), 'Trial ends in 3 days');
});
EOF
git add -A
git commit -qm "feat(trial): show days left in the trial banner"
