#!/usr/bin/env node
// Moves a repository's ignored state folder from .specs/ to .oner/, for each
// root it is given. series.mjs runs it on every command and hook.sh on session
// start. An entry whose name .oner/ already holds stays in .specs/ and is named
// on stderr. The ignore rule moves before any entry, and each entry has its
// paths rewritten before it moves, so a run cut off halfway is finished by the
// next one, and a run after a finished one changes nothing.
//
//   migrate.mjs <root>...
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OLD = '.specs';
export const NEW = '.oner';

const listed = (text, name) => text.split('\n').some((line) => new RegExp(`^/?${name.replace('.', '\\.')}/?\\s*$`).test(line));

// The .specs/ line becomes .oner/ in .gitignore and in the repository's
// info/exclude, wherever one is written. With neither file naming either
// folder, .gitignore gains the line.
function ignore(root) {
  const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  const files = [join(root, '.gitignore'), ...(common.status === 0 ? [join(common.stdout.trim(), 'info', 'exclude')] : [])];
  let covered = false;
  for (const file of files) {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (listed(text, NEW)) covered = true;
    else if (listed(text, OLD)) {
      writeFileSync(file, text.split('\n').map((line) => (listed(line, OLD) ? line.replace(OLD, NEW) : line)).join('\n'));
      covered = true;
    }
  }
  if (!covered) {
    const file = files[0];
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${NEW}/\n`);
  }
}

// Rewrites `<root>/.specs/` to `<root>/.oner/` in every text file under `path`,
// for each root, without following a symlink.
function rewrite(path, roots) {
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) rewrite(join(path, name), roots);
    return;
  }
  if (!stat.isFile()) return;
  const buffer = readFileSync(path);
  if (buffer.includes(0)) return;
  const text = buffer.toString('utf8');
  let next = text;
  for (const root of roots) next = next.replaceAll(`${root}/${OLD}/`, `${root}/${NEW}/`);
  if (next === text) return;
  writeFileSync(`${path}.migrate.tmp`, next);
  renameSync(`${path}.migrate.tmp`, path);
}

// Returns the entries it left in .specs/ because .oner/ already holds the name.
export function migrate(roots, warn = (line) => process.stderr.write(`${line}\n`)) {
  const all = [...new Set(roots.filter(Boolean).map((root) => resolve(root)))];
  const kept = [];
  for (const root of all) {
    const from = join(root, OLD);
    if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory()) continue;
    ignore(root);
    const to = join(root, NEW);
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      const dest = join(to, name);
      if (lstatSync(dest, { throwIfNoEntry: false })) {
        kept.push(join(from, name));
        warn(`Left ${join(from, name)} in place: ${dest} already exists. Merge the two by hand.`);
        continue;
      }
      rewrite(join(from, name), all);
      renameSync(join(from, name), dest);
    }
    if (!readdirSync(from).length) rmdirSync(from);
  }
  return kept;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    migrate(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${OLD}/ to ${NEW}/ migration stopped: ${error.message}\n`);
    process.exitCode = 1;
  }
}
