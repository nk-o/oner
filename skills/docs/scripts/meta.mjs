#!/usr/bin/env node
// Collects, per article, only the metadata the draft changes, so a write never sends back a value
// the user edited in the dashboard after the pull.
//   node meta.mjs <run> [slug...]
// Compares the draft (frontmatter of articles/<slug>.md, or `meta` and `product_refs` of
// edits/<slug>.json) with live/<slug>.json, the article as pulled in get_article's own field names.
// A field the draft leaves out is never sent. Writes upload/<slug>.meta.json as
// { articleId, fields, productRefs? } in the tool's field names, and prints one line per article.
// A draft without live/<slug>.json is a new article: everything it holds is sent.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Draft name -> the name get_article returns and update_article takes.
const FIELDS = {
  title: 'title',
  nav_title: 'navTitle',
  slug: 'slug',
  excerpt: 'excerpt',
  seo_title: 'seoTitle',
  seo_description: 'seoDescription',
  keywords: 'keywords',
  label: 'label',
};
const LISTS = new Set(['keywords']);

const [run, ...only] = process.argv.slice(2);
if (!run) {
  console.error('Usage: node meta.mjs <run> [slug...]');
  process.exit(2);
}

const unquote = (value) => value.trim().replace(/^["']|["']$/g, '');
const items = (value) => (Array.isArray(value) ? value : String(value ?? '').split(','))
  .map((item) => String(item).trim())
  .filter(Boolean);
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function frontmatter(text) {
  const match = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  return Object.fromEntries((match?.[1] ?? '').split('\n').map((line) => line.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], unquote(m[2])]));
}

const drafts = [];
for (const name of existsSync(join(run, 'articles')) ? readdirSync(join(run, 'articles')) : []) {
  if (!name.endsWith('.md')) continue;
  const meta = frontmatter(readFileSync(join(run, 'articles', name), 'utf8'));
  drafts.push({ slug: name.slice(0, -3), meta, refs: meta.product_refs });
}
for (const name of existsSync(join(run, 'edits')) ? readdirSync(join(run, 'edits')) : []) {
  if (!name.endsWith('.json')) continue;
  const draft = JSON.parse(readFileSync(join(run, 'edits', name), 'utf8'));
  drafts.push({ slug: name.slice(0, -5), meta: { id: draft.id, ...draft.meta }, refs: draft.product_refs ?? draft.meta?.product_refs });
}

mkdirSync(join(run, 'upload'), { recursive: true });
for (const { slug, meta, refs } of drafts) {
  if (only.length && !only.includes(slug)) continue;
  const livePath = join(run, 'live', `${slug}.json`);
  const live = existsSync(livePath) ? JSON.parse(readFileSync(livePath, 'utf8')) : null;
  if (live?.draft) {
    console.error(`${slug}: live/${slug}.json holds get_article's nested result; write its fields flat, as poise.md says`);
    process.exitCode = 1;
    continue;
  }
  const fields = {};
  for (const [draftName, apiName] of Object.entries(FIELDS)) {
    if (!(draftName in meta)) continue;
    const value = LISTS.has(draftName) ? items(meta[draftName]) : meta[draftName];
    const before = live?.[apiName];
    const changed = LISTS.has(draftName) ? !same(value, items(before)) : value !== (before ?? '');
    if (!live || changed) fields[apiName] = value;
  }
  const payload = { articleId: live?.id ?? meta.id ?? null, fields };
  if (refs !== undefined && (!live || !same(items(refs), items(live.productRefs)))) payload.productRefs = items(refs);
  writeFileSync(join(run, 'upload', `${slug}.meta.json`), `${JSON.stringify(payload, null, 1)}\n`);
  const names = [...Object.keys(fields), ...(payload.productRefs ? ['productRefs'] : [])];
  console.log(`${slug}: ${live ? '' : 'new, '}${names.length ? names.join(', ') : 'unchanged'}`);
}
