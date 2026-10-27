#!/usr/bin/env node
// Lists what changed between two runs of a product's inventory command, at every depth: a setting
// inside a block inside a section is compared like a top-level one.
//   node inventory-diff.mjs <before.json> <after.json>
// Prints one line per change: `+ path name`, `- path name`, `~ path.field: old -> new`.
// A list of objects is matched by each entry's id, else its value, else its type (with its
// content or label for an entry such as a heading that has no id), else its name, so reordering
// is not a change and a renamed id shows as one removal and one addition. An added or removed
// entry is listed with everything under it. Exits 0 either way.
import { readFileSync } from 'node:fs';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('Usage: node inventory-diff.mjs <before.json> <after.json>');
  process.exit(2);
}
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keyOf = (entry, index) => {
  if (!isObject(entry)) return null;
  if (entry.id !== undefined) return String(entry.id);
  if (entry.value !== undefined) return String(entry.value);
  if (entry.type !== undefined) return entry.content || entry.label ? `${entry.type}:${entry.content ?? entry.label}` : String(entry.type);
  if (entry.name !== undefined) return String(entry.name);
  return `#${index}`;
};
// Entries that share a key, such as two unlabelled paragraphs, are told apart by their order.
function keyed(list) {
  const seen = new Map();
  return new Map(list.map((entry, index) => {
    const key = keyOf(entry, index);
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return [count ? `${key}~${count + 1}` : key, entry];
  }));
}
const name = (entry) => (isObject(entry) ? JSON.stringify(entry.name ?? entry.label ?? entry.content ?? entry.group ?? '') : JSON.stringify(entry));
const show = (value) => JSON.stringify(value) ?? 'undefined';

const out = [];
const listOfObjects = (list) => Array.isArray(list) && list.length > 0 && list.every(isObject);
// An added or removed entry lists what it holds too, so a new block's settings each get a line.
function whole(sign, entry, path) {
  if (listOfObjects(entry)) {
    for (const [key, child] of keyed(entry)) whole(sign, child, `${path}/${key}`);
    return;
  }
  out.push(`${sign} ${path} ${name(entry)}`);
  if (!isObject(entry)) return;
  for (const [field, value] of Object.entries(entry)) {
    if (listOfObjects(value)) for (const [key, child] of keyed(value)) whole(sign, child, `${path}.${field}/${key}`);
  }
}
function diff(a, b, path) {
  if (a === undefined) return whole('+', b, path);
  if (b === undefined) return whole('-', a, path);
  if (isObject(a) && isObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], `${path}.${key}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && (listOfObjects(a) || listOfObjects(b))) {
    const before = keyed(a);
    const after = keyed(b);
    for (const key of new Set([...before.keys(), ...after.keys()])) diff(before.get(key), after.get(key), `${path}/${key}`);
    return;
  }
  if (show(a) !== show(b)) out.push(`~ ${path}: ${show(a)} -> ${show(b)}`);
}

const before = load(beforePath);
const after = load(afterPath);
if (isObject(before) && isObject(after)) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) diff(before[key], after[key], key);
} else {
  diff(before, after, '');
}
console.log(out.join('\n'));
