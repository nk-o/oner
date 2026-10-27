#!/usr/bin/env node
// Prepares what a write sends, so no body passes through a model on its way to the help center.
//   node body.mjs <run> [slug...]
// For articles/<slug>.md it writes upload/<slug>.md, the body without frontmatter, and prints
// `<sha256> <bytes> <file>`: the checksum is the `markdownSha256` Poise answers when it stored the
// Markdown as sent. Poise trims the stored Markdown and turns CRLF into LF, so the file does too.
// For edits/<slug>.json it writes upload/<slug>.edits.json, the same edits with each newText filled.
// Filling: `media/<file>` becomes the URL in <run>/images.json; `[text](article:<slug>)` becomes the
// target's `path` in live/<slug>.json, which Poise assigns when the draft is created, with its
// `#anchor` kept. A path, not the full URL, because Poise opens full URLs in a new tab. A
// `<!-- lint-ignore -->` line is dropped: Poise shows an HTML comment as text. A missing image or
// link target exits 1.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [run, ...only] = process.argv.slice(2);
if (!run) {
  console.error('Usage: node body.mjs <run> [slug...]');
  process.exit(2);
}

function split(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (lines[0] === '---' && end === -1) throw new Error('frontmatter is not closed');
  const meta = Object.fromEntries(
    lines.slice(1, Math.max(end, 1)).map((line) => line.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
  );
  return { meta, body: lines.slice(end + 1).join('\n') };
}

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const images = JSON.parse(read(join(run, 'images.json')) ?? '{}');

const pathOf = (slug) => JSON.parse(read(join(run, 'live', `${slug}.json`)) ?? '{}').path;

function fill(markdown, problems) {
  return markdown
    .replace(/^[ \t]*<!--\s*lint-ignore\b[^>]*-->[ \t]*\n?/gm, '')
    .replace(/(!\[[^\]]*\]\()(?:\.\.\/)?media\/([^)\s]+)/g, (all, start, file) => {
      if (!images[file]) problems.push(`image not uploaded: ${file}`);
      return `${start}${images[file] ?? `media/${file}`}`;
    })
    .replace(/(<(?:Video|File)\b[^>]*\bsrc=")(?:\.\.\/)?media\/([^"]+)/g, (all, start, file) => {
      if (!images[file]) problems.push(`file not uploaded: ${file}`);
      return `${start}${images[file] ?? `media/${file}`}`;
    })
    .replace(/\[([^\]]+)\]\(article:([a-z0-9-]+)(#[^)]*)?\)/g, (all, label, target, anchor = '') => {
      const path = pathOf(target);
      if (!path) problems.push(`no path for link target: ${target}, record it in live/${target}.json`);
      return `[${label}](${path ?? ''}${anchor})`;
    });
}

const out = join(run, 'upload');
mkdirSync(out, { recursive: true });
const list = (dir, ext) => (existsSync(join(run, dir)) ? readdirSync(join(run, dir)) : [])
  .filter((name) => name.endsWith(ext))
  .map((name) => name.slice(0, -ext.length))
  .filter((slug) => only.length === 0 || only.includes(slug));

let failed = 0;
for (const slug of list('articles', '.md')) {
  const problems = [];
  const markdown = Buffer.from(fill(split(readFileSync(join(run, 'articles', `${slug}.md`), 'utf8')).body, problems).trim(), 'utf8');
  if (problems.length) {
    console.error(`${slug}: ${problems.join('; ')}`);
    failed++;
    continue;
  }
  const target = join(out, `${slug}.md`);
  writeFileSync(target, markdown);
  console.log(`${createHash('sha256').update(markdown).digest('hex')} ${markdown.length} ${target}`);
}
for (const slug of list('edits', '.json')) {
  const problems = [];
  const draft = JSON.parse(readFileSync(join(run, 'edits', `${slug}.json`), 'utf8'));
  const edits = draft.edits.map((edit) => ({ ...edit, newText: fill(edit.newText, problems) }));
  if (problems.length) {
    console.error(`${slug}: ${problems.join('; ')}`);
    failed++;
    continue;
  }
  const target = join(out, `${slug}.edits.json`);
  writeFileSync(target, `${JSON.stringify({ articleId: draft.id, edits }, null, 1)}\n`);
  console.log(`${edits.length} edits ${target}`);
}
process.exit(failed ? 1 : 0);
