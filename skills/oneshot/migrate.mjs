#!/usr/bin/env node
// Moves a repository's ignored state folder from .specs/ to .oner/, for each
// root it is given. series.mjs runs it on every command and hook.sh on session
// start. A folder git tracks anything in is not state, and stays. The run makes
// .oner/ ignored, moves every entry whose name .oner/ does not hold yet, then
// rewrites the paths in .oner/'s text files that name an entry that moved, and
// removes .specs/ last, once it is empty and every rewrite went through. Until
// then each run repeats the rewrite, so a run cut off anywhere is finished by
// the next one, and a run after a finished one changes nothing. An entry that
// stays, and a file it cannot rewrite, is named on stderr.
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
const exists = (path) => Boolean(lstatSync(path, { throwIfNoEntry: false }));

function git(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim() };
}

// .oner/ becomes ignored before anything moves into it: listed beside the
// .specs/ line, or at the end of .gitignore. With `tracked` false, as for a
// stage worktree whose branch must stay clean, the line goes to the shared
// info/exclude instead. Returns false when git still does not ignore it.
function ignoreNew(root, tracked) {
  if (git(root, ['check-ignore', '-q', `${NEW}/`]).ok) return true;
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const exclude = common.ok ? join(common.out, 'info', 'exclude') : null;
  const files = tracked ? [join(root, '.gitignore'), exclude] : [exclude];
  const holder = files.find((file) => file && lists(read(file), OLD));
  if (holder) {
    writeFileSync(holder, read(holder).split('\n').flatMap((l) => (line(OLD).test(l) ? [l, l.replace(OLD, NEW)] : [l])).join('\n'));
  } else if (files[0]) {
    const text = read(files[0]);
    writeFileSync(files[0], `${text}${text && !text.endsWith('\n') ? '\n' : ''}${NEW}/\n`);
  }
  return git(root, ['check-ignore', '-q', `${NEW}/`]).ok;
}

// The spellings of `<root>/.specs/` a stored path or command uses.
function prefixes(root) {
  const home = process.env.HOME ? resolve(process.env.HOME) : null;
  const under = home && root.startsWith(`${home}/`) ? relative(home, root) : null;
  return [root, ...(under ? [`~/${under}`, `$HOME/${under}`, `\${HOME}/${under}`] : [])];
}

// Each root's spellings, with the names that now live in its .oner/ and not in
// its .specs/, longest first, so a reference is rewritten only to where its
// entry went.
function moved(roots) {
  return roots.flatMap((root) => {
    const names = (existsSync(join(root, NEW)) ? readdirSync(join(root, NEW)) : [])
      .filter((name) => !exists(join(root, OLD, name))).sort((a, b) => b.length - a.length);
    return names.length ? prefixes(root).map((prefix) => ({ prefix, names })) : [];
  });
}

function rewriteText(text, targets) {
  let next = text;
  for (const { prefix, names } of targets) {
    next = next.replace(new RegExp(`${escape(prefix)}/${escape(OLD)}/([^/\\n]*)`, 'g'), (match, rest) => {
      const name = names.find((n) => rest === n || (rest.startsWith(n) && !/[\w-]/.test(rest[n.length]) && !(rest[n.length] === '.' && /[\w-]/.test(rest[n.length + 1] ?? ''))));
      return name ? `${prefix}/${NEW}/${rest}` : match;
    });
  }
  return next;
}

// Rewrites every text file under `path`, keeping its mode, without following a
// symlink. Returns the files it could not rewrite.
function rewrite(path, targets, warn) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return 0;
  try {
    if (stat.isDirectory()) return readdirSync(path).reduce((n, name) => n + rewrite(join(path, name), targets, warn), 0);
    if (!stat.isFile() || path.endsWith('.migrate.tmp')) return 0;
    const buffer = readFileSync(path);
    if (buffer.includes(0)) return 0;
    const text = buffer.toString('utf8');
    const next = rewriteText(text, targets);
    if (next === text) return 0;
    const tmp = `${path}.${process.pid}.migrate.tmp`;
    writeFileSync(tmp, next);
    chmodSync(tmp, stat.mode & 0o7777);
    renameSync(tmp, path);
    return 0;
  } catch (error) {
    warn(`Could not rewrite the ${OLD}/ paths in ${path}: ${error.message}`);
    return 1;
  }
}

// Returns the entries it left in .specs/.
export function migrate(roots, { warn = (text) => process.stderr.write(`${text}\n`), tracked = true } = {}) {
  const all = [...new Set(roots.filter(Boolean).map((root) => resolve(root)))];
  const left = [];
  for (const root of all) {
    const from = join(root, OLD);
    const to = join(root, NEW);
    try {
      if (!lstatSync(from, { throwIfNoEntry: false })?.isDirectory() || git(root, ['ls-files', '--', OLD]).out) continue;
      mkdirSync(to, { recursive: true });
      if (!ignoreNew(root, tracked)) {
        warn(`Left ${from} in place: git does not ignore ${to}/.`);
        continue;
      }
      for (const name of readdirSync(from)) {
        const src = join(from, name);
        const dest = join(to, name);
        if (exists(dest)) {
          left.push(src);
          warn(`Left ${src} in place: ${dest} already exists. Merge the two by hand.`);
          continue;
        }
        try {
          renameSync(src, dest);
        } catch (error) {
          if (!exists(src)) continue;
          left.push(src);
          warn(`Left ${src} in place: ${error.message}`);
        }
      }
      const failed = rewrite(to, moved(all), warn);
      if (!failed && !readdirSync(from).length) {
        rmdirSync(from);
        const file = join(root, '.gitignore');
        const text = read(file);
        if (tracked && lists(text, NEW) && lists(text, OLD)) writeFileSync(file, text.split('\n').filter((l) => !line(OLD).test(l)).join('\n'));
      }
    } catch (error) {
      warn(`Stopped moving ${from} to ${NEW}/: ${error.message}`);
    }
  }
  return left;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) migrate(process.argv.slice(2));
