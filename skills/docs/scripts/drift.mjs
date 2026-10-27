#!/usr/bin/env node
// Checks that an article still holds the text a draft was made from, before a write replaces it.
//   node drift.mjs <base.md> <current.md>   the copy the draft started from, and the article now
//   node drift.mjs <base.md> --sha <hex>     the article's checksum now, where the platform gives one
// Frontmatter is ignored. Text mode forgives what platforms rewrite on save (CRLF, spaces at a line
// end, blank lines at the ends) and nothing else: leading spaces stay, because an image indented
// under a list item is part of the list and the same line unindented breaks its numbering.
// `--sha` hashes the body the way body.mjs sends it. Prints OK, or the first differing lines, and
// exits 1 on a difference.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [basePath, second, third] = process.argv.slice(2);
if (!basePath || !second || (second === '--sha' && !/^[0-9a-f]{64}$/.test(third ?? ''))) {
  console.error('Usage: node drift.mjs <base.md> <current.md> | <base.md> --sha <sha256 hex>');
  process.exit(2);
}

const body = (path) => readFileSync(path, 'utf8').replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');
const base = body(basePath);

if (second === '--sha') {
  const sha = createHash('sha256').update(Buffer.from(base.trim(), 'utf8')).digest('hex');
  if (sha === third) {
    console.log('OK');
    process.exit(0);
  }
  console.log(`checksum differs: the base hashes to ${sha}, the article to ${third}`);
  process.exit(1);
}

const lines = (text) => text.split('\n').map((line) => line.trimEnd()).join('\n').replace(/^\n+|\n+$/g, '').split('\n');
const a = lines(base);
const b = lines(body(second));
const shown = (line) => JSON.stringify((line ?? '(none)').slice(0, 160));
const problems = [];
for (let i = 0; i < Math.max(a.length, b.length) && problems.length < 6; i++) {
  if (a[i] !== b[i]) problems.push(`line ${i + 1}\n  base:    ${shown(a[i])}\n  current: ${shown(b[i])}`);
}
if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log('OK');
