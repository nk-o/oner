#!/usr/bin/env node
// Checks the published pages against the drafts after a publish: the text, six words at a time and
// its last words too, every image by its file name, every link to another article of the run, and,
// for an edit, that the text it replaced is gone.
//   node verify.mjs <run> [slug...]
// articles/<slug>.md is checked whole; edits/<slug>.json by each newText. A page's address is the
// draft's `url`, else live/<slug>.json `url`; a link target's path is its live/<slug>.json `path`.
// Poise marks body links with `data-article`; the sidebar links every article of the collection, so
// a bare href search would always pass.
// Exits 1 when a page lacks text, an image, or a link its draft has.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [run, ...only] = process.argv.slice(2);
if (!run) {
  console.error('Usage: node verify.mjs <run> [slug...]');
  process.exit(2);
}
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const split = (text) => {
  const m = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = Object.fromEntries((m?.[1] ?? '').split('\n').map((l) => l.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map((x) => [x[1], x[2].trim()]));
  return { meta, body: m ? m[2] : text };
};
const list = (dir, ext) => (existsSync(join(run, dir)) ? readdirSync(join(run, dir)) : []).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length));
const live = (slug) => JSON.parse(read(join(run, 'live', `${slug}.json`)) ?? '{}');
const urlOf = (slug) => {
  const draft = read(join(run, 'articles', `${slug}.md`));
  return (draft && split(draft).meta.url) || live(slug).url;
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
const words = (s) => decode(s).toLowerCase().match(/[a-z0-9%$#@.:/+-]+/g)?.map((w) => w.replace(/[.:]+$/, '')).filter((w) => w && w !== '-') ?? [];
const plain = (md) =>
  md
    // Inline code shows its angle brackets as text, so they must not read as tags below.
    .replace(/`([^`]*)`/g, (m, code) => code.replace(/[<>]/g, ' '))
    .replace(/^\s*(\d+\.|-)\s+/gm, ' ')
    // A changelog item's tag shows as an icon, not as text.
    .replace(/^\s*\[(new|feature|improved|changed|fixed|removed)\]\s/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s/gm, ' ')
    // A block's title attribute (callout, step, tab, accordion) shows on the page as text.
    .replace(/<[A-Z]\w*\s[^>]*?title="([^"]*)"[^>]*>?/g, ' $1 ')
    // Marker and pointer texts move out of the sentence flow on the page; they are checked as words.
    .replace(/<[^>]+>/g, ' ')
    // What is left of a fragment cut from an image line or a tag, as a short oldText or newText
    // can be, is no text the reader sees: a URL or path piece, an attribute such as x={24.5}, or
    // a tag's unclosed start.
    .replace(/\S*\/\S*[._\d)]\S*|\S*[._\d]\S*\/\S*|\S+\.(webp|png|jpe?g|gif|svg|avif|mp4|webm)\)/gi, ' ')
    .replace(/\b\w+=(\{[^}]*\}|"[^"]*")/g, ' ')
    .replace(/<[A-Za-z]\w*/g, ' ')
    .replace(/[*`|>_]/g, ' ')
    .replace(/^\s*[-]{3,}.*$/gm, ' ');

const checks = [
  ...list('articles', '.md').map((slug) => ({ slug, parts: [split(readFileSync(join(run, 'articles', `${slug}.md`), 'utf8')).body] })),
  ...list('edits', '.json').map((slug) => {
    const edits = JSON.parse(readFileSync(join(run, 'edits', `${slug}.json`), 'utf8')).edits;
    // Replaced text whose words the new text does not hold must be gone from the page.
    const gone = edits.filter((e) => !words(plain(e.newText)).join(' ').includes(words(plain(e.oldText)).join(' '))).map((e) => e.oldText);
    return { slug, parts: edits.map((e) => e.newText), gone };
  }),
].filter(({ slug }) => !only.length || only.includes(slug));

let bad = 0;
for (const { slug, parts, gone } of checks) {
  const url = urlOf(slug);
  if (!url) {
    console.log(`${slug}: no url`);
    bad++;
    continue;
  }
  const html = await (await fetch(url)).text();
  // Poise puts the body in data-slot="article-content", apart from the title, the sidebar, and the
  // links to the next article that follow it.
  const start = html.indexOf('data-slot="article-content"');
  const end = start === -1 ? -1 : html.indexOf('<nav', start);
  const page = start === -1 ? html : html.slice(start, end === -1 ? undefined : end);
  const got = words(page.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).join(' ');
  const missing = [];
  const images = [];
  const links = [];
  for (const part of parts) {
    const want = words(plain(part));
    const chunks = [];
    for (let i = 0; i < want.length; i += 6) chunks.push(want.slice(Math.max(0, Math.min(i, want.length - 6)), i + 6).join(' '));
    for (const chunk of chunks) if (!got.includes(chunk)) missing.push(chunk);
    // The site may serve a file from its own host, so an image is found by its file name.
    for (const m of part.matchAll(/!\[[^\]]*\]\(([^)\s]+)|<(?:Video|File)\b[^>]*\bsrc="([^"]+)"/g)) {
      const file = (m[1] ?? m[2]).split('/').pop();
      if (!page.includes(file)) images.push(file);
    }
    for (const m of part.matchAll(/\]\(article:([a-z0-9-]+)(#[^)]*)?/g)) {
      // The site writes each link at the target's current path under its own folder, keeping its
      // #anchor, so the link is found by the target's public id, the suffix after the last hyphen,
      // which a slug change keeps, followed by the draft's own anchor.
      const id = live(m[1]).path?.split('-').pop();
      if (!id || !new RegExp(`href="[^"]*-${escapeRe(id)}${escapeRe(m[2] ?? '')}" data-article`).test(page)) links.push(m[1]);
    }
  }
  const stale = (gone ?? []).filter((text) => {
    // Under three words, a phrase also occurs in text the edit never touched.
    const old = words(plain(text));
    return old.length >= 3 && got.includes(old.join(' '));
  });
  if (missing.length || images.length || links.length || stale.length) {
    bad++;
    console.log(`${slug}: ${missing.length} text chunks missing${missing[0] ? ` ("${missing[0]}")` : ''}, ${images.length} images missing${images[0] ? ` (${images[0]})` : ''}, ${links.length} links missing${links[0] ? ` (${links[0]})` : ''}${stale.length ? `, replaced text still there ("${stale[0].slice(0, 60)}")` : ''}`);
  }
}
console.log(bad ? `${bad} of ${checks.length} pages differ` : `all ${checks.length} pages match`);
process.exit(bad ? 1 : 0);
