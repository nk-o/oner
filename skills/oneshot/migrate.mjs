#!/usr/bin/env node
// Moves a repository's ignored state folder from .specs/ to .oner/, for each
// root it is given. series.mjs runs it on every command and hook.sh on session
// start. Only an ignored folder that git tracks nothing in is moved. An entry
// that cannot move, because .oner/ already holds its name or a file in it
// cannot be read or written, stays in .specs/ and is named on stderr. The old
// ignore line stays until .specs/ is empty, and each entry has its paths
// rewritten before it moves, so a run cut off halfway is finished by the next
// one, and a run after a finished one changes nothing.
//
//   migrate.mjs <root>...
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OLD = '.specs';
export const NEW = '.oner';

const line = (name) => new RegExp(`^/?${name.replace('.', '\\.')}/?\\s*$`);
const lists = (text, name) => text.split('\n').some((l) => line(name).test(l));
const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

function ignoreFiles(root) {
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return [join(root, '.gitignore'), ...(common.ok ? [join(common.out, 'info', 'exclude')] : [])];
}

// Before any entry moves: .oner/ is listed beside the .specs/ line, wherever
// that line is written, or in .gitignore when no file names either folder.
function ignoreBoth(root) {
  const files = ignoreFiles(root);
  if (files.some((file) => lists(read(file), NEW))) return;
  const holder = files.find((file) => lists(read(file), OLD));
  if (holder) {
    writeFileSync(holder, read(holder).split('\n').flatMap((l) => (line(OLD).test(l) ? [l, l.replace(OLD, NEW)] : [l])).join('\n'));
    return;
  }
  const text = read(files[0]);
  writeFileSync(files[0], `${text}${text && !text.endsWith('\n') ? '\n' : ''}${NEW}/\n`);
}

// Once .specs/ is gone, a .gitignore that lists both folders drops the old line.
function dropOld(root) {
  const file = join(root, '.gitignore');
  const text = read(file);
  if (lists(text, NEW) && lists(text, OLD)) writeFileSync(file, text.split('\n').filter((l) => !line(OLD).test(l)).join('\n'));
}

// The spellings of `<root>/.specs/<name>` a stored path or command uses.
function prefixes(root) {
  const home = process.env.HOME ? resolve(process.env.HOME) : null;
  const under = home && root.startsWith(`${home}/`) ? relative(home, root) : null;
  return [root, ...(under ? [`~/${under}`, `$HOME/${under}`, `\${HOME}/${under}`] : [])];
}

// Rewrites `<root>/.specs/<name>` to `<root>/.oner/<name>` in every text file
// under `path`, keeping its mode, without following a symlink. A name that
// stays in .specs/ keeps its old path.
function rewrite(path, targets) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) rewrite(join(path, name), targets);
    return;
  }
  if (!stat.isFile() || path.endsWith('.migrate.tmp')) return;
  const buffer = readFileSync(path);
  if (buffer.includes(0)) return;
  const text = buffer.toString('utf8');
  let next = text;
  for (const { prefix, kept } of targets) {
    next = next.replace(new RegExp(`${escape(prefix)}/${escape(OLD)}/([^/\\s'"\`]*)`, 'g'),
      (match, name) => (kept.has(name) ? match : `${prefix}/${NEW}/${name}`));
  }
  if (next === text) return;
  const tmp = `${path}.${process.pid}.migrate.tmp`;
  writeFileSync(tmp, next);
  chmodSync(tmp, stat.mode & 0o7777);
  renameSync(tmp, path);
}

// Returns the entries it left in .specs/.
export function migrate(roots, warn = (text) => process.stderr.write(`${text}\n`)) {
  const all = [...new Set(roots.filter(Boolean).map((root) => resolve(root)))];
  const targets = [];
  const eligible = all.filter((root) => {
    try {
      if (!lstatSync(join(root, OLD), { throwIfNoEntry: false })?.isDirectory()) return false;
      if (!git(root, ['check-ignore', '-q', `${OLD}/`]).ok || git(root, ['ls-files', '--', OLD]).out) return false;
      const kept = new Set(readdirSync(join(root, OLD)).filter((name) => lstatSync(join(root, NEW, name), { throwIfNoEntry: false })));
      targets.push(...prefixes(root).map((prefix) => ({ prefix, kept })));
      return true;
    } catch (error) {
      warn(`Left ${join(root, OLD)} in place: ${error.message}`);
      return false;
    }
  });
  const left = [];
  for (const root of all) {
    const from = join(root, OLD);
    try {
      if (eligible.includes(root)) {
        ignoreBoth(root);
        const to = join(root, NEW);
        mkdirSync(to, { recursive: true });
        for (const name of readdirSync(from)) {
          const src = join(from, name);
          const dest = join(to, name);
          try {
            if (lstatSync(dest, { throwIfNoEntry: false })) throw new Error(`${dest} already exists. Merge the two by hand`);
            rewrite(src, targets);
            renameSync(src, dest);
          } catch (error) {
            if (!lstatSync(src, { throwIfNoEntry: false })) continue;
            left.push(src);
            warn(`Left ${src} in place: ${error.message.replace(/\.$/, '')}.`);
          }
        }
        if (!readdirSync(from).length) rmdirSync(from);
      }
      if (!existsSync(from)) dropOld(root);
    } catch (error) {
      warn(`Stopped moving ${from} to ${NEW}/: ${error.message}`);
    }
  }
  return left;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) migrate(process.argv.slice(2));
