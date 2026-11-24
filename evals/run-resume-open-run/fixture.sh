#!/usr/bin/env bash
set -euo pipefail
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
mkdir -p src test
printf 'node_modules/\n.oner/\n' > .gitignore
cat > src/date.js <<'JS'
const DAY = 24 * 60 * 60 * 1000;

export function relativeDate(date, now = new Date()) {
  const days = Math.round((now - date) / DAY);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  return date.toLocaleDateString('ru-RU');
}
JS
cat > test/date.test.mjs <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeDate } from '../src/date.js';

test('a date from last night is yesterday, not today', () => {
  const now = new Date('2026-03-10T09:00:00');
  assert.equal(relativeDate(new Date('2026-03-09T22:00:00'), now), 'вчера');
});

test('a date from this morning is today', () => {
  const now = new Date('2026-03-10T09:00:00');
  assert.equal(relativeDate(new Date('2026-03-10T07:00:00'), now), 'сегодня');
});
JS
cat > package.json <<'JSON'
{ "name": "feed", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
git add -A
git commit -qm "feat: relative dates in the feed"
base=$(git rev-parse HEAD)
git switch -q -c fix-relative-date
mkdir -p .oner/001-fix-relative-date
cat > .oner/001-fix-relative-date/oneshot.md <<MD
# fix-relative-date

Lane. fix
Branch. fix-relative-date
Base. $base
Issue. none
Status. running

## Lane
- [x] Diagnose
- [x] Name the mechanism
- [x] Pin what must not change
- [x] Gate
- [ ] Fix
- [ ] Order the commits so the diff tells the story
- [ ] Clean the diff
- [ ] Green
- [ ] Verify against the running product
- [ ] Cross the boundary if the change does
- [ ] Review, two voices
- [ ] Resolve
- [ ] Round two
- [ ] Ship
- [ ] Watch
- [ ] Release
- [ ] Report

## Gate
Outcome. nothing to settle

## Assumptions
- Mechanism: src/date.js:4 rounds the elapsed time, so 11 hours before now counts as 0 days and a date from last night reads as today. The day count has to compare calendar days instead.
- Pin: dates 7 or more days back keep the locale date, checked by the existing test file.

## Checks
- Repro: node --test fails 1 of 2: expected 'вчера', got 'сегодня'.
MD
