#!/usr/bin/env node
// Builds a preview of a docs run for the user to read before anything is published:
// every draft in articles/ with its metadata, a search-result preview, its images, and run.md,
// and every update in edits/ as its changed metadata and each edit before and after. A help center
// that shows drafts as they will read, as Poise's editor does, needs none of this.
//   node preview.mjs <run folder> [--site <host shown in the search preview>]
// Writes <run>/preview/index.html and copies the images it uses into <run>/preview/media/.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const run = args[0] && resolve(args[0]);
if (!run || !['articles', 'edits', 'run.md'].some((name) => existsSync(join(run, name)))) {
  console.error('Usage: node preview.mjs <run folder with run.md, articles/ or edits/> [--site <host>]');
  process.exit(2);
}
const siteIndex = args.indexOf('--site');
const site = siteIndex === -1 ? '' : args[siteIndex + 1];
// The run folder sits in <repo>/.specs/, beside the repo's .claude/docs.json.
const contract = join(run, '..', '..', '.claude', 'docs.json');
const product = existsSync(contract) ? JSON.parse(readFileSync(contract, 'utf8')).product ?? '' : '';
const name = `${product ? `${product} ` : ''}Docs Preview`;

function parse(file) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  for (const line of (match?.[1] ?? '').split('\n')) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (field) meta[field[1]] = field[2].replace(/^["']|["']$/g, '');
  }
  return { slug: basename(file, '.md'), meta, body: (match?.[2] ?? text).trim() };
}

const out = join(run, 'preview');
mkdirSync(join(out, 'media'), { recursive: true });
const articles = (existsSync(join(run, 'articles')) ? readdirSync(join(run, 'articles')) : [])
  .filter((name) => name.endsWith('.md'))
  .sort()
  .map((name) => parse(join(run, 'articles', name)));

let copied = 0;
// Copies every media/<file> an image line or a src attribute names into preview/media.
function localize(text) {
  return text.replace(/(\]\(|src=")(?:\.\.\/)?media\/([^)\s"]+)/g, (all, lead, name) => {
    const from = join(run, 'media', name);
    if (existsSync(from)) {
      copyFileSync(from, join(out, 'media', name));
      copied++;
    }
    return `${lead}media/${name}`;
  });
}

// Poise's image blocks show as their plain images with their captions: the marks are the help
// center's to draw. A video or a file shows as its name, since the preview plays and serves none.
const render = (text) =>
  localize(String(text ?? ''))
    .replace(/^([ \t]*)<(Frame|Gallery)\b([^>]*)>([\s\S]*?)^[ \t]*<\/\2>[ \t]*$/gm, (all, indent, tag, attrs, inner) => {
      const caption = attrs.match(/\bcaption="([^"]*)"/)?.[1];
      return `${inner}${caption ? `\n${indent}*${caption}*\n` : ''}`;
    })
    .replace(/^[ \t]*<(Area|Spotlight|Arrow|Line|Pointer|Marker)\b[^>]*?(\/>|>[^<]*<\/\1>)[ \t]*$/gm, '')
    .replace(/^([ \t]*)<(Video|File)\b[^>]*?\b(?:name|src)="([^"]*)"[^>]*\/?>[ \t]*$/gm, (all, indent, tag, name) => `${indent}*${tag}: ${name.split('/').pop()}*`);

for (const article of articles) article.body = render(article.body);
// An update of a live article: its edits as before and after, with live/<slug>.json for the title and url.
const edits = (existsSync(join(run, 'edits')) ? readdirSync(join(run, 'edits')) : [])
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => {
    const slug = basename(name, '.json');
    const draft = JSON.parse(readFileSync(join(run, 'edits', name), 'utf8'));
    const pulled = join(run, 'live', `${slug}.json`);
    const live = existsSync(pulled) ? JSON.parse(readFileSync(pulled, 'utf8')) : {};
    const meta = { ...draft.meta };
    const changes = (draft.edits ?? []).map((e) => ({ before: render(e.oldText), after: render(e.newText), every: !!e.replaceAll }));
    return { slug, meta, title: live.title, url: live.url, changes };
  });
const plan = existsSync(join(run, 'run.md')) ? readFileSync(join(run, 'run.md'), 'utf8') : '';
const data = JSON.stringify({ articles, edits, plan, site }).replace(/</g, '\\u003c');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
:root{--bg:#f6f7f5;--surface:#fff;--fg:#1b201c;--muted:#5c655e;--line:#dde2dc;--accent:#2f6b4f;--warn:#9a5b12;--serp-link:#1a4fb8;--serp-url:#3c6b4a;--body:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;--mono:ui-monospace,"SF Mono",Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121513;--surface:#1a1e1b;--fg:#e6ebe7;--muted:#9aa49d;--line:#2c332e;--accent:#7cc39e;--warn:#e3b06b;--serp-link:#8ab4f8;--serp-url:#8fc7a1;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121513;--surface:#1a1e1b;--fg:#e6ebe7;--muted:#9aa49d;--line:#2c332e;--accent:#7cc39e;--warn:#e3b06b;--serp-link:#8ab4f8;--serp-url:#8fc7a1;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 var(--body);padding:0 16px 64px}
.wrap{max-width:800px;margin:0 auto}
header{padding:36px 0 16px}header h1{font-size:28px;line-height:1.2;margin:0 0 6px}header p{margin:0;color:var(--muted)}
nav{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;flex-wrap:wrap;gap:6px;padding:12px 0;border-bottom:1px solid var(--line);margin-bottom:24px}
nav button{font:600 14px/1 var(--body);padding:9px 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer}
nav button[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
nav button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
section{display:grid;gap:24px}section[hidden]{display:none}
.meta{display:grid;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.meta h2{font:600 12px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0}
.serp .url{font-size:13px;color:var(--serp-url)}.serp .t{font-size:20px;line-height:1.3;color:var(--serp-link)}.serp .d{font-size:14px;color:var(--muted)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0;font-size:14px}dt{font:12px var(--mono);color:var(--muted);padding-top:2px}dd{margin:0;min-width:0;overflow-wrap:anywhere}
.n{font:12px var(--mono);color:var(--muted)}.over{color:var(--warn)}
article{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:clamp(18px,4vw,40px);min-width:0}
article>h1{font-size:clamp(26px,4vw,34px);line-height:1.2;margin:0 0 .3em}
article .excerpt{color:var(--muted);margin:0 0 1.4em;font-size:16px}
article h2{font-size:23px;line-height:1.25;margin:1.6em 0 .5em}article h3{font-size:18px;margin:1.4em 0 .4em}
article img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px;margin:14px 0}
.tbl{overflow-x:auto;margin:12px 0}table{border-collapse:collapse;font-size:15px;min-width:420px;width:100%}
th,td{border-bottom:1px solid var(--line);padding:9px 10px;text-align:left;vertical-align:top}th{font-size:13px;color:var(--muted)}
article a,.plan a{color:var(--accent)}
.plan{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px 22px;min-width:0;overflow-wrap:anywhere}
code{font:14px var(--mono)}
.edit{display:grid;gap:10px}.edit h2,.edit .lbl{font:600 12px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0}
.edit .lbl{margin:0 0 8px}.before article{opacity:.6}
.live{margin:0;font-size:14px;overflow-wrap:anywhere}.live a{color:var(--accent)}
</style>
</head>
<body>
<div class="wrap">
<header><h1 id="heading">${name}</h1><p id="sub"></p></header>
<nav role="tablist" aria-label="Articles" id="tabs"></nav>
<div id="panels"></div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script>
const DATA = ${data};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = (s) => marked.parse(s);
const limits = { title: 60, nav_title: 32, seo_title: 60, seo_description: 160, excerpt: 200 };
const tabs = document.getElementById('tabs');
const panels = document.getElementById('panels');
document.getElementById('sub').textContent = DATA.articles.length + ' articles' + (DATA.edits.length ? ', ' + DATA.edits.length + ' updates' : '') + '. Nothing here is published yet.';
function add(label, html) {
  const id = 'p' + tabs.children.length;
  const tab = document.createElement('button');
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', id);
  tab.textContent = label;
  const panel = document.createElement('section');
  panel.id = id;
  panel.setAttribute('role', 'tabpanel');
  panel.innerHTML = html;
  panel.querySelectorAll('table').forEach((t) => { const d = document.createElement('div'); d.className = 'tbl'; t.replaceWith(d); d.append(t); });
  // Screenshots are 2x, so each shows at half its pixel width, as on the help center.
  panel.querySelectorAll('img').forEach((i) => {
    i.loading = 'lazy';
    const fit = () => { i.style.width = i.naturalWidth / 2 + 'px'; };
    i.complete && i.naturalWidth ? fit() : i.addEventListener('load', fit, { once: true });
  });
  tab.addEventListener('click', () => select(tab));
  tabs.append(tab);
  panels.append(panel);
}
function select(tab) {
  for (const t of tabs.children) {
    const on = t === tab;
    t.setAttribute('aria-selected', on);
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  }
}
const list = (m, fields) => '<dl>' + fields.map((k) => '<dt>' + k + '</dt><dd>' + esc(m[k]) + (limits[k] ? ' <span class="n' + (String(m[k]).length > limits[k] ? ' over' : '') + '">' + String(m[k]).length + '/' + limits[k] + '</span>' : '') + '</dd>').join('') + '</dl>';
for (const a of DATA.articles) {
  const m = a.meta;
  const fields = ['type', 'collection', 'slug', 'nav_title', 'seo_title', 'seo_description', 'excerpt', 'sources'].filter((k) => m[k]);
  add(m.title || a.slug, '<div class="meta"><h2>Search result</h2><div class="serp"><div class="url">' + esc((DATA.site || 'help center') + ' › ' + (m.slug || a.slug)) + '</div><div class="t">' + esc(m.seo_title || m.title) + '</div><div class="d">' + esc(m.seo_description) + '</div></div><h2>Metadata</h2>' + list(m, fields) + '</div><article><h1>' + esc(m.title) + '</h1>' + (m.excerpt ? '<p class="excerpt">' + esc(m.excerpt) + '</p>' : '') + md(a.body) + '</article>');
}
for (const e of DATA.edits) {
  const fields = Object.keys(e.meta);
  const n = e.changes.length;
  add(e.meta.title || e.title || e.slug, '<div class="meta"><h2>Update</h2>' + (e.url ? '<p class="live"><a href="' + esc(e.url) + '">' + esc(e.url) + '</a></p>' : '') + '<h2>Changed metadata</h2>' + (fields.length ? list(e.meta, fields) : '<p class="n">None</p>') + '</div>' + e.changes.map((c, i) => '<div class="edit"><h2>Edit ' + (i + 1) + ' of ' + n + (c.every ? ', every occurrence' : '') + '</h2><div class="before"><p class="lbl">Before</p><article>' + md(c.before) + '</article></div><div class="after"><p class="lbl">After</p><article>' + md(c.after) + '</article></div></div>').join(''));
}
if (DATA.plan) add('Run plan', '<div class="plan">' + md(DATA.plan) + '</div>');
if (tabs.firstChild) select(tabs.firstChild);
</script>
</body>
</html>
`;
writeFileSync(join(out, 'index.html'), page);
console.log(`${join(out, 'index.html')} (${articles.length} articles, ${edits.length} updates, ${copied} images)`);
