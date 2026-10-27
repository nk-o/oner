import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { EFFORT_STAGES } from './targets.mjs';

const PATH_TOKENS = ['skills_dir', 'agents_dir', 'repo_dir', 'target_dir'];
const EFFORT_TOKENS = Object.keys(EFFORT_STAGES).map((stage) => `effort_${stage}`);
const TOKENS = [...PATH_TOKENS, 'skills_dir_abs', 'repo_dir_abs', 'home', 'reply_language', ...EFFORT_TOKENS];
const TOKEN_RE = new RegExp(`\\{\\{(${TOKENS.join('|')})\\}\\}`, 'g');

// Everything the output depends on, the build's own code included.
const INPUTS = ['AGENTS.md', 'agents', 'bin', 'build', 'config.json', 'local', 'skills', 'targets'];

// `form` is 'tilde' for text a reader sees, 'home' for JSON commands and shell
// scripts, where a path sits inside quotes and a tilde does not expand.
// `home`, `skills_dir_abs` and `repo_dir_abs` are always absolute, for files such as a launchd
// plist that no shell reads.
export function tokenValues(paths, form, config) {
  const home = homedir();
  const show = (p) => {
    if (p !== home && !p.startsWith(home + sep)) return p;
    const rest = relative(home, p);
    const prefix = form === 'home' ? '$HOME' : '~';
    return rest ? `${prefix}/${rest}` : prefix;
  };
  return {
    ...Object.fromEntries(PATH_TOKENS.map((t) => [t, show(paths[t])])),
    skills_dir_abs: paths.skills_dir,
    repo_dir_abs: paths.repo_dir,
    home,
    reply_language: config.language,
    ...Object.fromEntries(Object.keys(EFFORT_STAGES).map((stage) => [`effort_${stage}`, config.effort[stage]])),
  };
}

export function renderText(text, values) {
  return text.replace(TOKEN_RE, (_, name) => values[name]);
}

// Replaces tokens inside every string of a parsed JSON value, so a path with a
// quote or a backslash cannot break the document.
export function renderJson(value, values) {
  if (typeof value === 'string') return renderText(value, values);
  if (Array.isArray(value)) return value.map((v) => renderJson(v, values));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renderJson(v, values)]));
  }
  return value;
}

// Regular files under dir, as [{ rel, abs, mode }] sorted by rel. Symlinks and
// Finder litter are skipped.
export function walk(dir) {
  const out = [];
  const visit = (abs) => {
    for (const name of readdirSync(abs).sort()) {
      if (name === '.DS_Store') continue;
      const child = join(abs, name);
      const st = lstatSync(child);
      if (st.isDirectory()) visit(child);
      else if (st.isFile()) out.push({ rel: relative(dir, child), abs: child, mode: st.mode & 0o777 });
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

export function renderFile(abs, values) {
  const buf = readFileSync(abs);
  // Decoding a binary asset as UTF-8 would corrupt it, so only files that hold a token are.
  if (!TOKENS.some((t) => buf.includes(`{{${t}}}`))) return buf;
  return Buffer.from(renderText(buf.toString('utf8'), values));
}

export function hashInputs(repoDir) {
  const h = createHash('sha256');
  for (const name of INPUTS) {
    const abs = join(repoDir, name);
    if (!existsSync(abs)) continue;
    const files = lstatSync(abs).isDirectory()
      ? walk(abs).map((f) => ({ ...f, rel: join(name, f.rel) }))
      : [{ rel: name, abs, mode: lstatSync(abs).mode & 0o777 }];
    for (const f of files) {
      h.update(`${f.rel}\0${f.mode}\0`);
      h.update(readFileSync(f.abs));
      h.update('\0');
    }
  }
  return h.digest('hex');
}
