#!/usr/bin/env node
// Lints help-center article drafts: Markdown files with a frontmatter block, and edits drafts
// (edits/<slug>.json), whose newText is linted as body and whose meta as frontmatter.
// Usage: node lint.mjs <file-or-directory>...
// Prints `file:line rule message` per finding, `file:edit<n>:line` inside an edit's newText and
// `file:meta.<name>` for its metadata, and exits 1 when there is any.
// A line `<!-- lint-ignore rule[,rule] -->` silences those rules on the next line.
// lint-fixture.md and lint-fixture.edits.json together hold at least one violation of every
// rule: after changing a rule, run this on both and check that every rule id still appears.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TYPES = ['how-to', 'reference', 'guide', 'concept', 'troubleshooting', 'changelog'];

// The stock vocabulary of Poise's writing bench, plus words docs style guides cut.
const STOCK_WORDS = [
  'additionally', 'crucial', 'delve', 'pivotal', 'showcase', 'underscore', 'underscores',
  'vibrant', 'foster', 'testament', 'interplay', 'intricate', 'seamless', 'seamlessly', 'robust',
  'groundbreaking', 'game-changing', 'world-class', 'landscape', 'leverage', 'utilize',
  'streamline', 'empower', 'cutting-edge', 'elevate', 'stunning', 'effortless', 'effortlessly',
  'unleash', 'unlock', 'supercharge', 'boasts', 'simply', 'easily', 'basically',
];

const PHRASES = [
  ['chatbot', /\b(certainly|great question|happy to help|hope this helps|let me know|feel free to|absolutely)\b/i],
  ['filler', /\b(in order to|it is important to note|it's important to note|it's worth noting|please note|note that|at this point in time|due to the fact that)\b/i],
  ['signpost', /\b(let's (dive|break)|here's what you need to know|without further ado|in this (article|guide),? (we|you)('ll| will)|you'll learn)\b/i],
  ['click-on', /\bclick on\b/i],
  ['image-pointer', /\b(in|at|from) the (image|screenshot|picture)s?\b(?!\s+(picker|library|field|settings?|gallery))|\b(shown|pictured) (above|below)\b|\bat the top of (this|the) page\b/i],
];

const CALLOUT = 'Info|Tip|Note|Warning|Danger|Check';

const ACTION = /^(click|select|choose|enter|type|drag|tap|go to|open|turn (on|off)|upload|scroll|paste|clear|check|uncheck|add|remove)\b/i;

// Annotation tags inside a Poise <Frame>, with the coordinates each one requires, in percent
// of the image from its top left.
const ANNOTATIONS = {
  Area: ['x', 'y', 'w', 'h'],
  Spotlight: ['x', 'y', 'w', 'h'],
  Arrow: ['x1', 'y1', 'x2', 'y2'],
  Line: ['x1', 'y1', 'x2', 'y2'],
  Pointer: ['x', 'y'],
  Marker: ['x', 'y'],
};
const TAG = new RegExp(`<(${Object.keys(ANNOTATIONS).join('|')})\\b([^>]*?)(/?)>(?:([^<]*)</\\1>)?`, 'g');
const ALT_MARKUP = /\b(highlight(ed)?|outlined|circled|arrows?|spotlight|spotlit|dimmed|markers?|numbered)\b|\bred (box|frame)\b/i;

function lintFile(file) {
  return file.endsWith('.json') ? lintEdits(file) : lintArticle(file);
}

function lintArticle(file) {
  const findings = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  const report = (at, rule, message) => findings.push({ at, rule, message });

  let body = 0;
  const meta = {};
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end === -1) report(1, 'frontmatter', 'frontmatter is not closed');
    for (let i = 1; i < end; i++) {
      // The scripts read one line per field, so a YAML list under the key reaches them empty.
      if (/^\s*-\s/.test(lines[i])) report(i + 1, 'meta', 'write a list comma-separated on its key\'s line');
      const match = lines[i].match(/^([a-z_]+):\s*(.*)$/);
      if (match) meta[match[1]] = { value: match[2].replace(/^["']|["']$/g, ''), line: i + 1 };
    }
    body = end + 1;
  } else {
    report(1, 'frontmatter', 'no frontmatter block');
  }

  // An article pulled from the help center carries its `id`; its metadata lives there and may
  // be absent from the draft. A new article has no `id` and needs all of it.
  const required = ['title', 'type', 'slug', 'collection', 'sources'];
  if (!meta.id?.value) required.push('seo_title', 'seo_description', 'excerpt');
  checkMeta(meta, new Set(required), report);
  lintBody(lines, body, report);
  return findings;
}

// An edits draft updates a pulled article: every body rule runs on each newText, and the meta
// it sends is checked like frontmatter, though none is required since it carries only changes.
function lintEdits(file) {
  const findings = [];
  const report = (at, rule, message) => findings.push({ at, rule, message });
  let draft;
  try {
    draft = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    report(1, 'edits', `is not valid JSON: ${error.message}`);
    return findings;
  }
  if (!Array.isArray(draft?.edits)) {
    report(1, 'edits', 'has no edits array');
    return findings;
  }
  const meta = {};
  const entry = (value, at) => ({ value: value == null ? '' : Array.isArray(value) ? value.join(', ') : String(value), line: at });
  for (const [name, value] of Object.entries(draft.meta ?? {})) meta[name] = entry(value, `meta.${name}`);
  if (draft.product_refs && !meta.product_refs) meta.product_refs = entry(draft.product_refs, 'product_refs');
  checkMeta(meta, new Set(), report);
  draft.edits.forEach((edit, index) => {
    const at = `edit${index + 1}`;
    if (typeof edit?.newText !== 'string') {
      report(at, 'edits', 'has no newText');
      return;
    }
    lintBody(edit.newText.split('\n'), 0, (line, rule, message) => report(`${at}:${line}`, rule, message), true);
    // An image or a Frame under a list item keeps the item's indent, or it leaves the list.
    const indent = (text) => text?.match(/^[ \t]*(?=\S)/m)?.[0];
    // An empty newText deletes, and has no indent to keep.
    if (typeof edit.oldText === 'string' && edit.newText.trim() && indent(edit.oldText) !== indent(edit.newText)) {
      report(`${at}:1`, 'indent', `newText starts at indent ${JSON.stringify(indent(edit.newText))}, oldText at ${JSON.stringify(indent(edit.oldText))}`);
    }
  });
  return findings;
}

function checkMeta(meta, required, report) {
  const field = (name, check) => {
    const entry = meta[name];
    if (!entry || entry.value === '') {
      if (required.has(name)) report(1, 'meta', `${name} is missing`);
      return;
    }
    const problem = check(entry.value);
    if (problem) report(entry.line, 'meta', `${name} ${problem}`);
  };
  const present = () => null;
  const length = (min, max) => (value) =>
    value.length < min || value.length > max
      ? `is ${value.length} characters, keep it within ${min}-${max}`
      : null;
  field('title', length(3, 60));
  field('type', (value) => (TYPES.includes(value) ? null : `must be one of ${TYPES.join(', ')}`));
  field('slug', (value) =>
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) && value.length >= 3 && value.length <= 48
      ? null
      : 'must be 3-48 lowercase letters, digits and single hyphens',
  );
  field('nav_title', length(3, 32));
  field('collection', present);
  field('sources', present);
  field('seo_title', length(20, 60));
  field('seo_description', length(110, 160));
  field('excerpt', length(40, 200));
  const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
  for (const name of ['keywords', 'product_refs']) {
    if (/^\[/.test(meta[name]?.value ?? '')) report(meta[name].line, 'meta', `${name}: write the list without brackets, comma-separated`);
  }
  field('keywords', (value) => {
    const terms = list(value);
    if (terms.length > 30) return `has ${terms.length} terms, keep it within 30`;
    const long = terms.find((term) => term.length > 60);
    return long ? `"${long}" is over 60 characters` : null;
  });
  field('product_refs', (value) => {
    const refs = list(value);
    if (refs.length > 100) return `has ${refs.length} references, keep it within 100`;
    const bad = refs.find((ref) => !/^[a-z][a-z0-9_-]{0,31}:\S/.test(ref) || ref.length > 200);
    return bad ? `"${bad}" is not kind:identifier` : null;
  });
  for (const name of ['title', 'nav_title', 'seo_title', 'seo_description', 'excerpt']) {
    if (meta[name]) checkProse(meta[name].value, meta[name].line, report);
  }
}

// `fragment` is an edit's newText, whose Frame may sit outside it in the article.
function lintBody(lines, body, report, fragment = false) {
  let fenced = false;
  let callout = false;
  let frame = null;
  let ignore = new Set();
  for (let i = body; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const skip = ignore;
    ignore = new Set();
    const directive = raw.match(/<!--\s*lint-ignore\s+([\w,-]+)\s*-->/);
    if (directive) {
      ignore = new Set(directive[1].split(','));
      continue;
    }
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const local = (line, rule, message) => {
      if (!skip.has(rule)) report(line, rule, message);
    };

    // A list in a callout with no paragraph before it renders as bare bullets in the box.
    if (callout && /^\s*([-*+]|\d+\.)\s+/.test(raw)) {
      local(lineNo, 'callout-list', 'a callout holds prose, not a list');
    }
    for (const tag of raw.matchAll(new RegExp(`<(/?)(${CALLOUT})\\b[^>]*?(/?)>`, 'g'))) {
      if (!tag[3]) callout = !tag[1];
    }

    const code = raw.replace(/`[^`]*`/g, '``');
    const open = code.match(/<Frame\b[^>]*?(\/?)>/);
    if (open && !open[1]) {
      if (frame) checkFrame(frame);
      frame = { image: null, tags: [] };
    }

    if (/^#\s/.test(raw)) local(lineNo, 'heading', 'no H1 in the body, the title is the H1');
    if (/^#{4,}\s/.test(raw)) local(lineNo, 'heading', 'use ## and ### only');
    if (/^#{2,3}\s+(good to know|notes?|overview|introduction|summary|conclusion|more|misc(ellaneous)?)\s*$/i.test(raw)) {
      local(lineNo, 'heading', 'name what is under the heading, not a catch-all');
    }

    for (const image of raw.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) {
      const alt = image[1].trim();
      if (!alt) local(lineNo, 'alt', `image ${image[2]} has no alt text`);
      else if (alt.length > 155) local(lineNo, 'alt', `alt text is ${alt.length} characters, keep it within 155`);
      else if (/^(screenshot|image|picture) of\b/i.test(alt)) local(lineNo, 'alt', 'alt text starts with "screenshot of"');
      if (frame && !frame.image) frame.image = { alt, line: lineNo, report: local };
    }

    for (const tag of code.matchAll(TAG)) {
      const [, kind, attributes, selfClosing, label] = tag;
      if (frame) frame.tags.push({ kind, line: lineNo, report: local });
      else if (!fragment) local(lineNo, 'annotation', `<${kind}> sits outside a Frame`);
      checkTag(kind, attributes, selfClosing ? '' : label, lineNo, local);
    }
    if (frame && /<\/Frame>/.test(code)) {
      checkFrame(frame);
      frame = null;
    }

    const text = raw.replace(/`[^`]*`/g, '``').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\]\([^)]*\)/g, ']');
    // A bold interface label is the product's wording, so the prose rules skip it.
    checkProse(text.replace(/\*\*[^*]+\*\*/g, '**'), lineNo, local);

    if (/\*\*[^*]*[.,:;!?]\*\*/.test(text)) local(lineNo, 'bold-punct', 'punctuation goes outside the bold label');

    const step = text.match(/^\s*\d+\.\s+(.*)$/);
    if (step) {
      if (/\b(above|below|left-hand|right-hand|(to|on) the (left|right))\b/i.test(step[1])) {
        local(lineNo, 'direction', 'a step names a place by the label, not by direction');
      }
      const sentences = step[1].split(/(?<=[.!?])\s+/);
      const actions = sentences.filter((sentence) => ACTION.test(sentence.replace(/^(optional\.|then)\s*/i, ''))).length;
      const chained = /,?\s+(and\s+)?then\s+(click|select|choose|enter|drag|tap|open)\b/i.test(step[1]);
      if (actions > 1 || chained) local(lineNo, 'one-action', 'one action per step');
    }
  }
  if (frame) checkFrame(frame);
}

// `label` is undefined when the tag's text does not close on the same line; it is not checked.
function checkTag(kind, attributes, label, line, report) {
  const attrs = {};
  for (const [, name, quoted, braced] of attributes.matchAll(/(\w+)=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    attrs[name] = (quoted ?? braced).trim();
  }
  const at = {};
  for (const name of ANNOTATIONS[kind]) {
    if (!(name in attrs)) {
      report(line, 'annotation', `<${kind}> has no ${name}`);
      continue;
    }
    const value = Number(attrs[name]);
    if (attrs[name] === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      report(line, 'annotation', `<${kind}> ${name}=${attrs[name]} is outside 0 to 100`);
      continue;
    }
    at[name] = value;
  }
  for (const [start, size] of [['x', 'w'], ['y', 'h']]) {
    if (!(size in at)) continue;
    const end = Math.round((at[start] + at[size]) * 1000) / 1000;
    if (at[size] <= 0) report(line, 'annotation', `<${kind}> ${size} must be above 0`);
    else if (start in at && end > 100) report(line, 'annotation', `<${kind}> ${start} + ${size} is ${end}, over 100`);
  }
  if (label === undefined) return;
  const words = label.trim().split(/\s+/).filter(Boolean).length;
  if (kind === 'Pointer' && (words < 2 || words > 4)) {
    report(line, 'annotation', `<Pointer> label is ${words} words, use two to four`);
  }
  if (kind === 'Area' && words > 4) report(line, 'annotation', `<Area> label is ${words} words, keep it within four`);
  if (kind === 'Marker' && words > 12) report(line, 'annotation', `<Marker> text is ${words} words, keep it within twelve`);
}

// One focus and at most two kinds of marks per Frame; markers show an order, so one shows none.
function checkFrame({ image, tags }) {
  if (tags.length === 0) return;
  if (!image) {
    for (const tag of tags) tag.report(tag.line, 'annotation', `<${tag.kind}> is in a Frame with no image`);
  }
  const kinds = [];
  let spotlights = 0;
  for (const tag of tags) {
    if (!kinds.includes(tag.kind) && kinds.push(tag.kind) === 3) {
      tag.report(tag.line, 'annotation', `a third annotation kind in one Frame (${kinds.join(', ')}), keep one focus and at most two kinds of marks`);
    }
    if (tag.kind === 'Spotlight' && ++spotlights === 3) {
      tag.report(tag.line, 'annotation', 'more than two Spotlights in one Frame');
    }
  }
  const markers = tags.filter((tag) => tag.kind === 'Marker');
  if (markers.length === 1) {
    markers[0].report(markers[0].line, 'annotation', 'a single Marker shows no order, use a Pointer or an Area');
  }
  const markup = image?.alt.match(ALT_MARKUP);
  if (markup) image.report(image.line, 'alt-markup', `alt text names the markup ("${markup[0]}"), describe the picture`);
}

function checkProse(text, line, report) {
  if (/[—–]/.test(text) || /\s--\s/.test(text)) report(line, 'dash', 'no em or en dash, use a period, a comma, or "to" for a range');
  if (/!(\s|$)/.test(text.replace(/!\[/g, ''))) report(line, 'exclaim', 'no exclamation marks');
  for (const word of STOCK_WORDS) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) report(line, 'stock-word', `"${word}"`);
  }
  for (const [rule, pattern] of PHRASES) {
    const match = text.match(pattern);
    if (match) report(line, rule, `"${match[0]}"`);
  }
}

// A run may hold only articles/ or only edits/, so a folder that is not there is skipped.
function collect(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isDirectory()) {
    return readdirSync(path).flatMap((entry) => collect(join(path, entry)));
  }
  return /\.(md|json)$/.test(path) ? [path] : [];
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node lint.mjs <file-or-directory>...');
  process.exit(2);
}
const files = targets.flatMap(collect);
if (files.length === 0) {
  console.error(`no .md or .json file in ${targets.join(', ')}`);
  process.exit(2);
}
let count = 0;
for (const file of files) {
  for (const { at, rule, message } of lintFile(file)) {
    console.log(`${file}:${at} ${rule} ${message}`);
    count++;
  }
}
process.exit(count > 0 ? 1 : 0);
