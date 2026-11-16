#!/usr/bin/env node
// PreToolUse hook for Bash in Claude Code and, with `--host codex`, in Codex, written when
// `guard.enabled` is on. It refuses what would destroy shared history or the machine (a
// force-push or delete of the default branch, a mirror push, a recursive delete of /, the home
// directory, or a repository root or anything above it) and asks before what would lose local
// work (a hard reset, a forced clean, discarding every change, a forced branch delete, a stash
// drop, any other force-push).
//
// It catches an agent's mistake, not an attacker: a command written to a file and run by another
// interpreter is out of its reach. Within the line it reads, it follows the shell: quotes and
// $'...', $(...), backticks and <(...), here-documents fed to a shell, bash -c and eval, git
// aliases, and every directory a cd can leave the shell in, counting a cd that may fail or that
// runs in a subshell or a pipeline. Anything else passes untouched. A line it fails to read is
// asked about, and input it cannot parse at all passes to the host's own check.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Wrappers that run the command after them, with the options of theirs that take a value.
const PREFIXES = {
  sudo: ['-u', '-g', '-C', '-h', '-p', '-U', '-r', '-t', '-D'],
  env: ['-u', '-C', '-S', '--unset', '--chdir'],
  nice: ['-n', '--adjustment'],
  nohup: [],
  time: ['-f', '-o'],
  command: [],
  builtin: [],
  exec: ['-a'],
};
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}']);
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

function expand(word, dir) {
  const env = (name) => (name === 'HOME' ? homedir() : name === 'PWD' ? dir : process.env[name]);
  return word
    .replace(/^~(?=\/|$)/, homedir())
    .replace(/\$\(pwd\)/g, dir)
    .replace(/\$\{(\w+):?-([^}]*)\}/g, (all, name, fallback) => env(name) || fallback)
    .replace(/\$\{(\w+):?\+([^}]*)\}/g, (all, name, alt) => (env(name) ? alt : ''))
    .replace(/\$\{(\w+):0\}/g, (all, name) => env(name) ?? all)
    .replace(/\$\{(\w+)\}|\$(\w+)/g, (all, a, b) => env(a ?? b) ?? all)
    .replace(/^~(?=\/|$)/, homedir());
}

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

function checkGit(w, cwd, depth) {
  let i = 1;
  let dir = cwd;
  const config = {};
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C') dir = resolve(dir, expand(w[++i] ?? '.', dir));
    else if (w[i] === '-c') {
      const [key, ...value] = (w[++i] ?? '').split('=');
      config[key.toLowerCase()] = value.length ? value.join('=') : 'true';
    } else if (['--git-dir', '--work-tree', '--namespace'].includes(w[i])) i++;
    i++;
  }
  const sub = w[i];
  const args = w.slice(i + 1);
  if (sub && !GIT_BUILTINS.has(sub) && !['push', 'reset', 'clean', 'checkout', 'switch', 'restore', 'branch', 'stash'].includes(sub)) {
    const alias = config[`alias.${sub.toLowerCase()}`] ?? git(dir, ['config', '--get', `alias.${sub}`]);
    if (alias) {
      if (alias.startsWith('!')) return decide(`${alias.slice(1)} ${args.join(' ')}`, dir, null, depth + 1);
      const words = lex(alias)[0]?.words ?? [];
      return checkGit(['git', ...Object.entries(config).flatMap(([k, v]) => ['-c', `${k}=${v}`]), ...words, ...args], dir, depth + 1);
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
      return del && force ? ['ask', 'this deletes a branch that may hold unmerged commits'] : null;
    }
    case 'stash':
      return args[0] === 'drop' || args[0] === 'clear' ? ['ask', 'this deletes stashed changes, and other sessions share the stash'] : null;
    default: return null;
  }
}

function checkRm(w, dir, roots) {
  const args = w.slice(1);
  const end = args.indexOf('--');
  const head = end < 0 ? args : args.slice(0, end);
  if (!head.some((a) => a === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a))) return null;
  const home = homedir();
  const operands = [...head.filter((a) => !a.startsWith('-')), ...(end < 0 ? [] : args.slice(end + 1))];
  for (const raw of operands.flatMap(braces)) {
    const expanded = expand(raw, dir);
    // An empty variable or substitution turns `$DIR/` into `/`.
    if (/^(\$\{?\w+\}?|\$\(.*\))\/\*?$/.test(expanded)) return ['ask', `${raw} deletes / when it is empty`];
    if (/\$\{[^}]*[^\w}]/.test(expanded) || /^\$\(.*\)$/.test(expanded)) return ['ask', `${raw} is a path this guard cannot work out`];
    if (expanded.includes('$')) continue;
    const glob = /(^|\/)\*$/.test(expanded);
    const target = resolve(dir, expanded.replace(/(^|\/)\*$/, '$1'));
    const holds = (path) => path === target || path.startsWith(target === '/' ? '/' : target + sep);
    if (target === '/' || holds(home) || roots.some(holds) || /(^|\/)\.git$/.test(target)) {
      return ['deny', `this deletes ${glob ? 'everything in ' : ''}${target}`];
    }
  }
  return null;
}

function stripPrefixes(w) {
  for (;;) {
    while (w.length && (KEYWORDS.has(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w = w.slice(1);
    const takes = PREFIXES[w[0]];
    if (!takes) return w;
    w = w.slice(1);
    while (w.length && w[0].startsWith('-')) {
      const option = w[0];
      w = w.slice(takes.includes(option) ? 2 : 1);
      if (option === '--') break;
    }
  }
}

// Every directory the shell can be in when it reaches each command, with the roots of the
// repositories those directories sit in.
export function decide(command, cwd, roots = null, depth = 0) {
  if (depth > MAX_DEPTH) throw new Unreadable('nested too deep');
  const tops = new Set(roots ?? [git(cwd, ['rev-parse', '--show-toplevel'])].filter(Boolean));
  const commands = lex(String(command));
  let verdict = null;
  const take = (found) => {
    if (found && (!verdict || found[0] === 'deny')) verdict = found;
  };
  const addTop = (dir) => {
    const top = git(dir, ['rev-parse', '--show-toplevel']);
    if (top) tops.add(top);
  };
  let dirs = new Set([cwd]);
  let chain = null;
  const saved = [];
  let lastDepth = 0;
  for (let k = 0; k < commands.length; k++) {
    const entry = commands[k];
    while (entry.depth > lastDepth) { saved.push({ dirs: new Set(dirs), chain }); lastDepth++; }
    while (entry.depth < lastDepth) { ({ dirs, chain } = saved.pop()); lastDepth--; }
    const here = [...(chain ?? dirs)];
    const before = commands[k - 1]?.op;
    for (const dir of here) {
      for (const script of entry.nested) take(decide(script, dir, [...tops], depth + 1));
    }
    const w = stripPrefixes(entry.words);
    const name = w[0]?.split('/').pop();
    for (const heredoc of entry.heredocs) {
      for (const dir of here) {
        if (SHELLS.has(name) || name === 'eval') take(decide(heredoc.body, dir, [...tops], depth + 1));
        else if (!heredoc.quoted) for (const script of substitutions(heredoc.body)) take(decide(script, dir, [...tops], depth + 1));
      }
    }
    if (verdict?.[0] === 'deny') return verdict;
    if (name === 'cd' || name === 'pushd') {
      let operands = w.slice(1);
      while (operands.length && /^-[LPe@]+$/.test(operands[0])) operands = operands.slice(1);
      if (operands[0] === '--') operands = operands.slice(1);
      const to = expand(operands[0] ?? '~', here[0]);
      const piped = entry.op === '|' || before === '|' || entry.op === '&';
      if (!piped && to !== '-' && !to.includes('$')) {
        const targets = here.map((dir) => resolve(dir, to));
        targets.forEach(addTop);
        if (entry.op === '&&') chain = new Set(targets.filter(isDir));
        else {
          const certain = before !== '&&' && before !== '||' && entry.op !== '||' && targets.every(isDir);
          dirs = certain ? new Set(targets) : new Set([...dirs, ...targets.filter(isDir)]);
        }
      }
    } else if (name && SHELLS.has(name)) {
      const flag = w.findIndex((a, n) => n > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (flag > 0 && w[flag + 1] !== undefined) for (const dir of here) take(decide(w[flag + 1], dir, [...tops], depth + 1));
    } else if (name === 'eval') for (const dir of here) take(decide(w.slice(1).join(' '), dir, [...tops], depth + 1));
    else if (name === 'git') for (const dir of here) take(checkGit(w, dir, depth));
    else if (name === 'rm') for (const dir of here) take(checkRm(w, dir, [...tops]));
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
      verdict = ['ask', 'this command is too nested or unusual for it to read'];
    }
    if (verdict) {
      const [found, why] = verdict;
      // Codex parses `ask` but does not act on it, so the command would run unasked.
      const at = process.argv.indexOf('--host');
      const askable = at < 0 || process.argv[at + 1] !== 'codex';
      const decision = found === 'ask' && askable ? 'ask' : 'deny';
      const reason = found === 'deny'
        ? `Blocked by the oner guard: ${why}. If it is intended, the user runs it themselves, or turns off guard in config.json.`
        : askable ? `The oner guard asks first: ${why}.`
          : `Stopped by the oner guard, since this agent cannot ask: ${why}. Ask the user, who runs it themselves if it is intended.`;
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
      }));
    }
  }
}
