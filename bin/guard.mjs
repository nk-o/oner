#!/usr/bin/env node
// PreToolUse hook for Bash in Claude Code and Codex, written when `guard.enabled` is on. It
// never asks the user. It refuses what would destroy shared history or the machine (a
// force-push or delete of the default branch, a mirror push, a recursive delete of /, the home
// directory, or a repository root or anything above it). It stops what would lose local work (a
// hard reset, a forced clean, discarding every change, a forced delete of a branch whose commits
// are nowhere else, a stash drop, any other force-push) until the agent has checked it and runs
// the line again with `ONER_GUARD=checked;` at its start.
//
// It catches an agent's mistake, not an attacker: a command written to a file and run by another
// interpreter is out of its reach. Within the line it reads, it follows the shell: quotes and
// $'...', $(...), backticks and <(...), here-documents fed to a shell, bash -c and eval, git
// aliases, and every directory a cd can leave the shell in, counting a cd that may fail or that
// runs in a subshell or a pipeline. Anything else passes untouched. A line it fails to read is
// stopped until the agent splits it, and input it cannot parse at all passes to the host's own
// check.
//
// It refuses only what is certain: a command that reaches a protected path in every directory
// and with every value the shell can have at that point. When only some of them reach it, it
// stops. So the model of the shell can stay simple and over-cautious, since a case it cannot
// settle becomes a check for the agent rather than a silent pass or a hard refusal.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Wrappers that run the command after them: the options of theirs that take a value, and how
// many words of their own come before the command.
const PREFIXES = {
  sudo: { takes: ['-u', '-g', '-C', '-h', '-p', '-U', '-r', '-t', '-D'] },
  env: { takes: ['-u', '-C', '-S', '--unset', '--chdir'] },
  nice: { takes: ['-n', '--adjustment'] },
  nohup: {},
  time: { takes: ['-f', '-o'] },
  timeout: { takes: ['-s', '-k', '--signal', '--kill-after'], words: 1 },
  gtimeout: { takes: ['-s', '-k', '--signal', '--kill-after'], words: 1 },
  command: {},
  builtin: {},
  exec: { takes: ['-a'] },
};
// Shell words that open a body the shell may skip, close one, or only join two commands.
const OPENS = new Set(['if', 'while', 'until', 'for', 'case', 'select']);
const CLOSES = new Set(['fi', 'done', 'esac']);
const JOINS = new Set(['then', 'else', 'elif', 'do', '!', '{', '}']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const GIT_BUILTINS = new Set(['status', 'log', 'diff', 'show', 'add', 'commit', 'fetch', 'pull', 'merge', 'rebase', 'rev-parse',
  'remote', 'config', 'tag', 'worktree', 'ls-files', 'grep', 'blame', 'init', 'clone', 'cherry-pick', 'revert', 'mv', 'rm', 'apply',
  'describe', 'symbolic-ref', 'for-each-ref', 'rev-list', 'shortlog', 'reflog', 'notes', 'submodule', 'archive', 'bisect', 'gc']);
const MAX_DEPTH = 8;

class Unreadable extends Error {}

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

const isDir = (path) => {
  try { return statSync(path).isDirectory(); } catch { return false; }
};

// The end of a `(` group that starts at `from`, past nested parentheses and quotes.
function closeParen(src, from) {
  let depth = 1;
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"') i++;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '\\') i++;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return src.length;
}

// The command substitutions an unquoted here-document body runs.
function substitutions(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '$' && text[i + 1] === '(') {
      const end = closeParen(text, i + 2);
      out.push(text.slice(i + 2, end));
      i = end;
    } else if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      out.push(text.slice(i + 1, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end;
    }
  }
  return out;
}

const ANSI = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };

// Splits a command line into simple commands. Each holds its words with quotes removed, the
// operator after it, its subshell depth, the scripts its substitutions run, and the
// here-documents it reads.
export function lex(src) {
  const commands = [];
  let current = { words: [], op: null, depth: 0, nested: [], heredocs: [] };
  let word = null;
  let depth = 0;
  let pending = [];
  let skipWord = false;
  const endWord = () => {
    if (word !== null) {
      if (skipWord) skipWord = false;
      else current.words.push(word);
    }
    word = null;
  };
  const endCommand = (op) => {
    endWord();
    skipWord = false;
    current.op = op;
    if (current.words.length || current.nested.length) commands.push(current);
    current = { words: [], op: null, depth, nested: [], heredocs: [] };
  };
  const add = (text) => { word = (word ?? '') + text; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '\\') { if (next !== '\n') add(next ?? ''); i++; continue; }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      add(src.slice(i + 1, end < 0 ? src.length : end));
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '$' && next === "'") {
      let j = i + 2;
      let text = '';
      while (j < src.length && src[j] !== "'") {
        if (src[j] === '\\' && j + 1 < src.length) { text += ANSI[src[j + 1]] ?? src[j + 1]; j += 2; continue; }
        text += src[j++];
      }
      add(text);
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let text = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) { text += src[j + 1]; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '(') {
          const end = closeParen(src, j + 2);
          current.nested.push(src.slice(j + 2, end));
          text += src.slice(j, end + 1);
          j = end + 1;
          continue;
        }
        if (src[j] === '`') {
          const end = src.indexOf('`', j + 1);
          current.nested.push(src.slice(j + 1, end < 0 ? src.length : end));
          text += '$(...)';
          j = end < 0 ? src.length : end + 1;
          continue;
        }
        text += src[j++];
      }
      add(text);
      i = j;
      continue;
    }
    if ((c === '$' || c === '<' || c === '>') && next === '(') {
      const end = closeParen(src, i + 2);
      current.nested.push(src.slice(i + 2, end));
      if (c === '$') add(src.slice(i, end + 1));
      else { endWord(); add('/dev/fd/63'); }
      i = end;
      continue;
    }
    if (c === '$' && next === '{') {
      const end = src.indexOf('}', i + 2);
      add(src.slice(i, end < 0 ? src.length : end + 1));
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      current.nested.push(src.slice(i + 1, end < 0 ? src.length : end));
      add('$(...)');
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '#' && word === null) {
      const end = src.indexOf('\n', i);
      i = (end < 0 ? src.length : end) - 1;
      continue;
    }
    if (c === '<' && next === '<' && src[i + 2] !== '<') {
      endWord();
      const m = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|\\?([^\s'"<>;&|()]+))/.exec(src.slice(i));
      if (m) {
        const delimiter = m[2] ?? m[3] ?? m[4];
        const quoted = m[2] !== undefined || m[3] !== undefined || src.slice(i).replace(/^<<-?\s*/, '').startsWith('\\');
        const heredoc = { delimiter, tabs: m[1] === '-', quoted, body: '' };
        current.heredocs.push(heredoc);
        pending.push(heredoc);
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === '\n') {
      endCommand('\n');
      let at = i + 1;
      for (const heredoc of pending) {
        const lines = [];
        while (at <= src.length) {
          const end = src.indexOf('\n', at);
          const line = src.slice(at, end < 0 ? src.length : end);
          at = end < 0 ? src.length + 1 : end + 1;
          if ((heredoc.tabs ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) break;
          lines.push(line);
        }
        heredoc.body = lines.join('\n');
      }
      if (pending.length) i = at - 2;
      pending = [];
      continue;
    }
    if (c === '&' && next === '&') { endCommand('&&'); i++; continue; }
    if (c === '|' && next === '|') { endCommand('||'); i++; continue; }
    if (c === '|') { endCommand('|'); if (next === '&') i++; continue; }
    if (c === '&' && next === '>') { endWord(); i++; if (src[i + 1] === '>') i++; skipWord = true; continue; }
    if (c === '&') { endCommand('&'); continue; }
    if (c === ';') { endCommand(';'); while (src[i + 1] === ';' || src[i + 1] === '&') i++; continue; }
    if (c === '(') {
      endCommand(current.words.length ? ';' : null);
      depth++;
      current.depth = depth;
      continue;
    }
    if (c === ')') { endCommand(')'); depth = Math.max(0, depth - 1); current.depth = depth; continue; }
    if (c === '<' || c === '>') {
      // A number right before the operator is the file descriptor it redirects, not a word.
      if (!skipWord && word !== null && /^\d+$/.test(word)) {
        const start = i - word.length;
        if (src.slice(start, i) === word && (start === 0 || /[\s;|&()]/.test(src[start - 1]))) word = null;
      }
      endWord();
      while (src[i + 1] === '>' || src[i + 1] === '&' || src[i + 1] === '|') i++;
      skipWord = true;
      continue;
    }
    if (/\s/.test(c)) { endWord(); continue; }
    add(c);
  }
  endCommand(null);
  return commands;
}

// {a,b} in one word, without nesting, which is the form a path takes.
function braces(word) {
  const m = /^(.*?)\{([^{}]*,[^{}]*)\}(.*)$/.exec(word);
  if (!m) return [word];
  return m[2].split(',').flatMap((alt) => braces(m[1] + alt + m[3]));
}

// Every value a word can take. Variables come from the line's own assignments and loops first,
// then the environment. A name with no value stays as written.
function expandAll(word, dir, vars = new Map()) {
  const values = (name) => vars.get(name) ?? [name === 'HOME' ? homedir() : name === 'PWD' ? dir : process.env[name]];
  let out = [word.replace(/^~(?=\/|$)/, homedir()).replace(/\$\(pwd\)/g, dir)];
  const step = (pattern, value) => {
    out = out.flatMap((text) => {
      const m = pattern.exec(text);
      if (!m) return [text];
      const found = value(m);
      return found === null ? [text] : found.map((v) => text.slice(0, m.index) + v + text.slice(m.index + m[0].length));
    });
    if (out.length > 32) throw new Unreadable('too many values to check');
  };
  for (let round = 0; round < 8; round++) {
    const before = out.join('\0');
    step(/\$\{(\w+):?-([^}]*)\}/, (m) => values(m[1]).map((v) => v || m[2]));
    step(/\$\{(\w+):?\+([^}]*)\}/, (m) => values(m[1]).map((v) => (v ? m[2] : '')));
    step(/\$\{(\w+):0\}|\$\{(\w+)\}|\$(\w+)/, (m) => {
      const found = values(m[1] ?? m[2] ?? m[3]);
      return found.every((v) => v === undefined) ? null : found.map((v) => v ?? '');
    });
    if (out.join('\0') === before) break;
  }
  return out.map((text) => text.replace(/^~(?=\/|$)/, homedir()));
}

const expand = (word, dir, vars) => expandAll(word, dir, vars)[0];

const real = (path) => {
  try { return realpathSync(path); } catch { return path; }
};

function defaultBranches(cwd) {
  const head = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '');
  return head ? [head] : ['main', 'master'];
}

const short = (args, letter) => args.some((a) => new RegExp(`^-[a-zA-Z]*${letter}[a-zA-Z]*$`).test(a));
// git accepts any unambiguous prefix of a long option.
const long = (args, name, min) => args.some((a) => a.length >= min && name.startsWith(a.split('=')[0]));

// Whether a refspec destination, possibly a pattern, can name the branch.
function reaches(dst, branch) {
  const ref = dst.startsWith('refs/') ? dst : `refs/heads/${dst}`;
  if (!ref.startsWith('refs/heads/')) return false;
  const pattern = new RegExp('^' + ref.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return pattern.test(`refs/heads/${branch}`);
}

function checkPush(args, cwd, config) {
  const mirrorRemote = Object.entries(config).some(([k, v]) => /^remote\..+\.mirror$/.test(k) && v !== 'false');
  if (long(args, '--mirror', 4) || mirrorRemote) return ['deny', 'a mirror push overwrites every ref on the remote'];
  const positional = [];
  let repo = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--repo=')) repo = a.slice(7);
    else if (['--repo', '-o', '--push-option', '--receive-pack', '--exec'].includes(a)) { if (a === '--repo') repo = args[i + 1]; i++; }
    else if (!a.startsWith('-')) positional.push(a);
  }
  const refs = repo === null ? positional.slice(1) : positional;
  const force = args.some((a) => a.startsWith('--force') || a === '--for') || short(args, 'f');
  const del = long(args, '--delete', 5) || short(args, 'd');
  const current = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const main = defaultBranches(cwd);
  let all = long(args, '--all', 4) || long(args, '--branches', 4);
  let plus = false;
  let colon = false;
  let hit = null;
  for (const ref of refs) {
    const body = ref.replace(/^\+/, '');
    plus ||= ref.startsWith('+');
    if (body === ':') { all = true; continue; }
    colon ||= body.startsWith(':');
    const dst = body.split(':').pop().replace(/^HEAD$/, current);
    hit ??= main.find((b) => reaches(dst, b)) ?? null;
  }
  if (!refs.length && !all) hit = main.includes(current) ? current : null;
  if (all) hit ??= main[0];
  if (!force && !del && !plus && !colon) return null;
  if (hit) return ['deny', `this rewrites or deletes ${hit}, the default branch`];
  return ['ask', del || colon ? 'this deletes a remote branch' : 'this force-pushes, which replaces commits on the remote'];
}

// Whether deleting a local branch loses no work: a default branch that stays holds its
// commits, or every file the branch changed already reads the same there, as after a squash
// merge. Another remote-tracking branch is no proof, since the remote may have dropped it.
function keptElsewhere(dir, name, deleting) {
  const tip = git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}^{commit}`]);
  if (!tip) return false;
  const bases = defaultBranches(dir).flatMap((b) => [`refs/remotes/origin/${b}`, `refs/heads/${b}`])
    .filter((ref) => !deleting.some((other) => ref === `refs/heads/${other}`));
  if (git(dir, ['for-each-ref', '--count=1', '--contains', tip, '--format=x', ...bases])) return true;
  return bases.some((base) => {
    const fork = git(dir, ['merge-base', base, tip]);
    if (!fork) return false;
    const changed = spawnSync('git', ['-C', dir, 'diff', '--name-only', '-z', '--no-renames', fork, tip], { encoding: 'utf8' });
    if (changed.status !== 0) return false;
    const paths = changed.stdout.split('\0').filter(Boolean).map((path) => `:(literal)${path}`);
    const same = spawnSync('git', ['-C', dir, 'diff', '--quiet', '--no-ext-diff', '--no-textconv', base, tip, '--', ...paths]);
    return same.status === 0;
  });
}

// Variables that point git at a repository other than the one in its directory.
const LOCATORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'];

// `located` is true when GIT_DIR or a similar variable can point git at another repository.
function checkGit(w, cwd, depth, located = false) {
  let i = 1;
  let dir = cwd;
  const config = {};
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C') dir = resolve(dir, expand(w[++i] ?? '.', dir));
    else if (w[i] === '-c') {
      const [key, ...value] = (w[++i] ?? '').split('=');
      config[key.toLowerCase()] = value.length ? value.join('=') : 'true';
    } else if (['--git-dir', '--work-tree', '--namespace'].includes(w[i])) {
      located ||= w[i] !== '--namespace';
      i++;
    } else if (/^--(git-dir|work-tree)=/.test(w[i])) located = true;
    i++;
  }
  const sub = w[i];
  const args = w.slice(i + 1);
  if (sub && !GIT_BUILTINS.has(sub) && !['push', 'reset', 'clean', 'checkout', 'switch', 'restore', 'branch', 'stash'].includes(sub)) {
    const alias = config[`alias.${sub.toLowerCase()}`] ?? git(dir, ['config', '--get', `alias.${sub}`]);
    if (alias) {
      if (alias.startsWith('!')) return decide(`${alias.slice(1)} ${args.join(' ')}`, dir, null, depth + 1, located ? new Map([['GIT_DIR', [dir]]]) : undefined);
      const words = lex(alias)[0]?.words ?? [];
      return checkGit(['git', ...Object.entries(config).flatMap(([k, v]) => ['-c', `${k}=${v}`]), ...words, ...args], dir, depth + 1, located);
    }
  }
  const wide = args.some((a) => a === '.' || a === ':/' || a === '*');
  const discard = ['ask', 'this discards changes in the working tree'];
  switch (sub) {
    case 'push': return checkPush(args, dir, config);
    case 'reset': return long(args, '--hard', 4) ? ['ask', 'a hard reset discards uncommitted changes'] : null;
    case 'clean':
      return (long(args, '--force', 4) || short(args, 'f')) && !(long(args, '--dry-run', 4) || short(args, 'n'))
        ? ['ask', 'a forced clean deletes untracked files'] : null;
    case 'checkout': return wide || long(args, '--force', 4) || short(args, 'f') ? discard : null;
    case 'switch': return long(args, '--force', 4) || long(args, '--discard-changes', 4) || short(args, 'f') ? discard : null;
    case 'restore': {
      const staged = long(args, '--staged', 4) || short(args, 'S');
      const worktree = long(args, '--worktree', 4) || short(args, 'W');
      return wide && (!staged || worktree) ? discard : null;
    }
    case 'branch': {
      const del = long(args, '--delete', 5) || short(args, 'd') || short(args, 'D');
      const force = long(args, '--force', 4) || short(args, 'f') || short(args, 'D');
      if (!del || !force) return null;
      const end = args.indexOf('--');
      const options = end < 0 ? args : args.slice(0, end);
      const names = [...options.filter((a) => !a.startsWith('-')), ...(end < 0 ? [] : args.slice(end + 1))];
      const remote = long(options, '--remotes', 4) || short(options, 'r');
      // Each name costs several git calls, and the hook has 5 s in all.
      const checkable = !remote && !located && names.length && names.length <= 10;
      if (checkable && names.every((name) => keptElsewhere(dir, name, names))) return null;
      return ['ask', 'this deletes a branch that may hold unmerged commits'];
    }
    case 'stash':
      return args[0] === 'drop' || args[0] === 'clear' ? ['ask', 'this deletes stashed changes, and other sessions share the stash'] : null;
    default: return null;
  }
}

function checkRm(w, dir, roots, vars, shellDir = dir) {
  const args = w.slice(1);
  const end = args.indexOf('--');
  const head = end < 0 ? args : args.slice(0, end);
  if (!head.some((a) => a === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a))) return null;
  const home = homedir();
  const operands = [...head.filter((a) => !a.startsWith('-')), ...(end < 0 ? [] : args.slice(end + 1))];
  let doubt = null;
  for (const raw of operands.flatMap(braces)) {
    // An empty value deletes nothing, so it counts as a harmless alternative.
    const hits = expandAll(raw, shellDir, vars).map((expanded) => (expanded === '' ? null : protectedPath(expanded, raw, dir, roots, home)));
    const found = hits.find((hit) => hit?.[0] === 'deny');
    if (found && hits.every((hit) => hit?.[0] === 'deny')) return found;
    if (found) doubt ??= ['ask', `${found[1].replace(/^this /, 'this may ')}, depending on the value ${raw} takes`];
    doubt ??= hits.find(Boolean) ?? null;
  }
  return doubt;
}

// Whether one value of an rm operand reaches /, the home directory, a repository root, or .git.
function protectedPath(expanded, raw, dir, roots, home) {
  // A path that is only a variable or a substitution can be anything, / included.
  if (/^(\$\{?\w+\}?|\$\(.*\))\/?\*?$/.test(expanded)) return ['ask', `${raw} can be any path, / included`];
  if (/\$\{[^}]*[^\w}]/.test(expanded)) return ['ask', `${raw} is a path this guard cannot work out`];
  if (expanded.includes('$')) {
    const empty = expanded.replace(/\$\{?\w+\}?/g, '');
    if (!empty.includes('$') && empty !== expanded) {
      const blank = resolve(dir, empty.replace(/(^|\/)\*$/, '$1'));
      const under = (path) => path === blank || path.startsWith(blank === '/' ? '/' : blank + sep);
      if (blank === '/' || under(home) || roots.some(under)) return ['ask', `${raw} deletes ${blank} when a variable in it is empty`];
    }
    return null;
  }
  const glob = /(^|\/)\*$/.test(expanded);
  const named = resolve(dir, expanded.replace(/(^|\/)\*$/, '$1'));
  for (const target of new Set([named, real(named)])) {
    const holds = (path) => path === target || path.startsWith(target === '/' ? '/' : target + sep);
    if (target === '/' || holds(home) || holds(real(home)) || roots.some(holds) || /(^|\/)\.git$/.test(target)) {
      return ['deny', `this deletes ${glob ? 'everything in ' : ''}${named}`];
    }
  }
  return null;
}

function stripPrefixes(w, chdir = []) {
  for (;;) {
    while (w.length && (JOINS.has(w[0]) || OPENS.has(w[0]) || CLOSES.has(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w = w.slice(1);
    const prefix = PREFIXES[w[0]];
    if (!prefix) return w;
    w = w.slice(1);
    while (w.length && w[0].startsWith('-')) {
      const option = w[0];
      if (prefix === PREFIXES.env && (option === '-C' || option === '--chdir')) chdir.push(w[1] ?? '.');
      else if (prefix === PREFIXES.env && option.startsWith('--chdir=')) chdir.push(option.slice(8));
      w = w.slice(prefix.takes?.includes(option) ? 2 : 1);
      if (option === '--') break;
    }
    w = w.slice(prefix.words ?? 0);
  }
}

// Walks the commands with every directory the shell can be in at each one. A cd counts for
// certain only when it runs unconditionally, outside a subshell or a pipeline, into a
// directory that exists. Otherwise its target joins the directories already possible.
export function decide(command, cwd, roots = null, depth = 0, inherited = new Map()) {
  if (depth > MAX_DEPTH) throw new Unreadable('nested too deep');
  const tops = new Set(roots ?? [git(cwd, ['rev-parse', '--show-toplevel'])].filter(Boolean));
  const vars = new Map(inherited);
  const commands = lex(String(command));
  let verdict = null;
  // A refusal wins. Every stop is kept in the reason, so the agent checks each one.
  const take = (found) => {
    if (!found || verdict?.[0] === 'deny') return;
    if (!verdict || found[0] === 'deny') verdict = found;
    else if (!verdict[1].split('; ').includes(found[1])) verdict = ['ask', `${verdict[1]}; ${found[1]}`];
  };
  const addTop = (dir) => {
    const top = git(dir, ['rev-parse', '--show-toplevel']);
    if (top) tops.add(top);
  };
  const inner = (script, dir) => decide(script, dir, [...tops], depth + 1, vars);
  // A refusal holds only when the command is refused in every directory the shell can be in.
  // Refused in some of them, it is asked about.
  const across = (places, check) => {
    const found = places.map(check);
    const refused = found.find((hit) => hit?.[0] === 'deny');
    if (refused && found.every((hit) => hit?.[0] === 'deny')) return refused;
    if (refused) return ['ask', `${refused[1].replace(/^this /, 'this may ')}, depending on which directory the shell is in`];
    return found.find(Boolean) ?? null;
  };
  const strongest = (found) => found.find((hit) => hit?.[0] === 'deny') ?? found.find(Boolean) ?? null;
  let dirs = new Set([cwd]);
  const seen = new Set([cwd]);
  let chain = null;
  // The compound commands open at this point: if, loops, case, and { } groups. A for loop
  // remembers the value its variable had before it.
  const open = [];
  const frozen = new Set();
  const saved = [];
  let lastDepth = 0;
  for (let k = 0; k < commands.length; k++) {
    const entry = commands[k];
    while (entry.depth > lastDepth) { saved.push({ dirs: new Set(dirs), chain }); lastDepth++; }
    while (entry.depth < lastDepth) {
      ({ dirs, chain } = saved.pop());
      if (chain) { dirs = new Set([...dirs, ...chain]); chain = null; }
      lastDepth--;
    }
    const here = [...(chain ?? dirs)];
    const before = commands[k - 1]?.op;
    for (const word of entry.words) {
      // A { } group runs for certain unless && or || can skip it, or it is a function's body.
      if (OPENS.has(word)) open.push({ word, skippable: true });
      else if (word === '{') open.push({ word, skippable: before === '&&' || before === '||' || before === ')' });
      else if (CLOSES.has(word) || word === '}') {
        const closed = open.pop();
        // After the loop the variable holds its last item, or its old value when the list was empty.
        if (closed?.name) vars.set(closed.name, [...new Set([...closed.previous, ...(vars.get(closed.name) ?? [])])]);
      } else if (!JOINS.has(word)) break;
    }
    const branches = open.filter((item) => item.skippable).length;
    take(across(here, (dir) => strongest(entry.nested.map((script) => inner(script, dir)))));
    if (verdict?.[0] === 'deny') return verdict;
    // An assignment that surely runs replaces the value. One inside a compound command, a
    // subshell, or a pipeline, or after && or ||, can be skipped or confined, so it only joins
    // the values the name already had, unset included.
    const surely = !branches && !entry.depth && before !== '&&' && before !== '||' && before !== '|' &&
      entry.op !== '|' && entry.op !== '&';
    const bind = (name, values) => {
      vars.set(name, surely ? values : [...new Set([...(vars.get(name) ?? [process.env[name]]), ...values])]);
    };
    const lead = entry.words.findIndex((word) => !JOINS.has(word) && !OPENS.has(word) && !CLOSES.has(word));
    if (entry.words[lead - 1] === 'for' && entry.words[lead + 1] === 'in') {
      const list = entry.words.slice(lead + 2).flatMap(braces);
      const name = entry.words[lead];
      const loop = open.findLast((item) => item.word === 'for');
      if (loop) Object.assign(loop, { name, previous: vars.get(name) ?? [process.env[name]] });
      // Inside the body the variable is one of the items, nothing else.
      vars.set(name, here.flatMap((dir) => list.flatMap((item) => expandAll(item, dir, vars))));
      continue;
    }
    let declared = entry.words.slice(Math.max(lead, 0));
    const builtin = ['export', 'declare', 'local', 'readonly', 'typeset'].includes(declared[0]);
    const flags = builtin ? declared.slice(1).filter((word) => word.startsWith('-')) : [];
    if (builtin) declared = declared.slice(1).filter((word) => !word.startsWith('-'));
    const shape = builtin ? /^[A-Za-z_][A-Za-z0-9_]*(=|$)/ : /^[A-Za-z_][A-Za-z0-9_]*=/;
    if (lead >= 0 && declared.length && declared.every((word) => shape.test(word))) {
      // Every value is expanded before any is set, as the shell does. A declaration builtin can
      // fail, and a readonly name keeps its value, so neither replaces what the name held.
      const values = declared.filter((item) => item.includes('=')).map((word) => {
        const [name, ...value] = word.split('=');
        return [name, here.flatMap((dir) => expandAll(value.join('='), dir, vars))];
      });
      for (const [name, found] of values) {
        if (builtin || frozen.has(name)) vars.set(name, [...new Set([...(vars.get(name) ?? [process.env[name]]), ...found])]);
        else bind(name, found);
      }
      if (declared[0] && (entry.words[lead] === 'readonly' || flags.some((flag) => flag.includes('r')))) {
        for (const word of declared) frozen.add(word.split('=')[0]);
      }
    }
    const chdir = [];
    const w = stripPrefixes(entry.words, chdir);
    // A prefix such as GIT_DIR=... reaches git, a shell, or an eval after it, so it joins the
    // values the name can have from here on.
    for (const word of entry.words) {
      const key = LOCATORS.find((name) => word.startsWith(`${name}=`));
      if (key) vars.set(key, [...(vars.get(key) ?? [process.env[key]]), word.slice(key.length + 1) || '.']);
    }
    const name = w[0]?.split('/').pop();
    // Pairs of the directory a command runs in and the one its words were expanded in.
    const at = here.flatMap((dir) => (chdir.length
      ? chdir.flatMap((to) => expandAll(to, dir, vars)).map((to) => [resolve(dir, to), dir])
      : [[dir, dir]]));
    // A shell later in the pipeline with no script of its own runs what this command prints.
    let piped = false;
    for (let n = k; commands[n]?.op === '|'; n++) {
      const consumer = stripPrefixes(commands[n + 1].words);
      const args = consumer.slice(1);
      let reads = !args.some((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (reads && !args.some((a) => /^-[a-zA-Z]*s[a-zA-Z]*$/.test(a))) {
        for (let n2 = 0; n2 < args.length; n2++) {
          const a = args[n2];
          if (/^[-+][oO]$/.test(a) || a === '--rcfile' || a === '--init-file') { n2++; continue; }
          // The first operand is a script file, unless it names standard input.
          const script = a === '--' ? args[n2 + 1] : /^[-+]/.test(a) ? null : a;
          if (script !== null) { reads = script === undefined || script === '/dev/stdin' || script === '-'; break; }
        }
      }
      if (SHELLS.has(consumer[0]?.split('/').pop()) && reads) piped = true;
    }
    for (const heredoc of entry.heredocs) {
      const scripts = SHELLS.has(name) || name === 'eval' || piped ? [heredoc.body] : heredoc.quoted ? [] : substitutions(heredoc.body);
      take(across(here, (dir) => strongest(scripts.map((script) => inner(script, dir)))));
    }
    if (verdict?.[0] === 'deny') return verdict;
    const background = entry.op === '|' || before === '|' || entry.op === '&';
    if ((name === 'cd' && w[1] === '-') || name === 'popd') {
      if (!background) dirs = new Set(seen);
    } else if (name === 'cd' || name === 'pushd') {
      let operands = w.slice(1);
      while (operands.length && /^-[LPe@]+$/.test(operands[0])) operands = operands.slice(1);
      if (operands[0] === '--') operands = operands.slice(1);
      const targets = here.flatMap((dir) => expandAll(operands[0] ?? '~', dir, vars).filter((to) => !to.includes('$')).map((to) => resolve(dir, to)));
      if (!background && targets.length) {
        targets.forEach((target) => { seen.add(target); addTop(target); });
        if (entry.op === '&&') chain = new Set(targets);
        else {
          const certain = !branches && before !== '&&' && before !== '||' && entry.op !== '||' && targets.every(isDir);
          dirs = certain ? new Set(targets) : new Set([...dirs, ...targets]);
        }
      }
    } else if (name && SHELLS.has(name)) {
      const flag = w.findIndex((a, n) => n > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (flag > 0 && w[flag + 1] !== undefined) take(across(here, (dir) => inner(w[flag + 1], dir)));
    } else if (name === 'eval') take(across(here, (dir) => inner(w.slice(1).join(' '), dir)));
    else if (name === 'git') {
      const located = LOCATORS.some((key) => (vars.get(key) ?? [process.env[key]]).some(Boolean));
      take(across(at, ([dir]) => checkGit(w, dir, depth, located)));
    }
    else if (name === 'rm') take(across(at, ([dir, shellDir]) => checkRm(w, dir, [...tops], vars, shellDir)));
    if (verdict?.[0] === 'deny') return verdict;
    if (chain && entry.op !== '&&') {
      dirs = new Set([...dirs, ...chain]);
      chain = null;
    }
  }
  return verdict;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = null;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    // Input this hook cannot parse passes to the host's own permission check.
  }
  if (input?.tool_name === 'Bash') {
    let verdict;
    try {
      const cwd = input.cwd && existsSync(input.cwd) ? input.cwd : process.cwd();
      verdict = decide(input.tool_input?.command ?? '', cwd);
    } catch {
      verdict = ['split', 'this command is too nested or unusual for it to read'];
    }
    const checked = /^\s*ONER_GUARD=checked[;\s]/.test(input.tool_input?.command ?? '');
    if (verdict && !(verdict[0] === 'ask' && checked)) {
      const [found, why] = verdict;
      const reason = {
        deny: `Blocked by the oner guard: ${why}. Reach the goal another way.`,
        split: `Stopped by the oner guard: ${why}. Run it as several simpler commands.`,
        ask: `Stopped by the oner guard: ${why}. Check yourself that this loses no work, and do not ask the user. When it is safe, run the same line again with \`ONER_GUARD=checked;\` at its start.`,
      }[found];
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
      }));
    }
  }
}
