#!/usr/bin/env node
// PreToolUse hook for Bash in Claude Code and, with `--host codex`, in Codex, written when
// `guard.enabled` is on. It refuses what would destroy shared history or the machine (a
// force-push or delete of the default branch, a mirror push, a recursive delete of /, the home
// directory, or a repository root or anything above it) and asks before what would lose local
// work (a hard reset, a forced clean, discarding every change, a forced branch delete, a stash
// drop, any other force-push). It reads the command the way a shell does: quotes, `;` `&&` `|`
// and newlines, `$(...)` and backticks, `bash -c`, here-documents, and `cd` before a later
// command. Everything else, and any input it cannot read, passes untouched.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const PREFIXES = new Set(['sudo', 'command', 'builtin', 'exec', 'time', 'nohup', 'env', 'nice']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', '!', '{', '}']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

// The end of a `$(` that starts at `from`, past nested parentheses and quotes.
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

// Splits a command line into simple commands, each a list of words with quotes removed, and
// collects the text of every command substitution, which the shell also runs.
export function lex(src) {
  const commands = [];
  const nested = [];
  let words = [];
  let word = null;
  let heredocs = [];
  let skipWord = false;
  const endWord = () => {
    if (word !== null) {
      if (skipWord) skipWord = false;
      else words.push(word);
    }
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  const add = (text) => { word = (word ?? '') + text; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { if (src[i + 1] !== '\n') add(src[i + 1] ?? ''); i++; continue; }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      add(src.slice(i + 1, end < 0 ? src.length : end));
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let text = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) { text += src[j + 1]; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '(') {
          const end = closeParen(src, j + 2);
          nested.push(src.slice(j + 2, end));
          text += src.slice(j, end + 1);
          j = end + 1;
          continue;
        }
        if (src[j] === '`') {
          const end = src.indexOf('`', j + 1);
          nested.push(src.slice(j + 1, end < 0 ? src.length : end));
          j = end < 0 ? src.length : end + 1;
          continue;
        }
        text += src[j++];
      }
      add(text);
      i = j;
      continue;
    }
    if (c === '$' && src[i + 1] === '(') {
      const end = closeParen(src, i + 2);
      nested.push(src.slice(i + 2, end));
      add(src.slice(i, end + 1));
      i = end;
      continue;
    }
    if (c === '$' && src[i + 1] === '{') {
      const end = src.indexOf('}', i + 2);
      add(src.slice(i, end < 0 ? src.length : end + 1));
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      nested.push(src.slice(i + 1, end < 0 ? src.length : end));
      i = end < 0 ? src.length : end;
      continue;
    }
    if (c === '#' && word === null) {
      const end = src.indexOf('\n', i);
      i = (end < 0 ? src.length : end) - 1;
      continue;
    }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      endWord();
      const m = /^<<-?\s*(['"]?)([^\s'"<>;&|]+)\1/.exec(src.slice(i));
      if (m) { heredocs.push(m[2]); i += m[0].length - 1; continue; }
    }
    if (c === '\n') {
      endCommand();
      for (const delimiter of heredocs) {
        const lines = src.slice(i + 1).split('\n');
        let consumed = 0;
        for (const line of lines) {
          consumed += line.length + 1;
          if (line.trim() === delimiter) break;
        }
        i += consumed;
      }
      if (heredocs.length) i--;
      heredocs = [];
      continue;
    }
    if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') { endCommand(); continue; }
    if (c === '<' || c === '>') {
      endWord();
      while (src[i + 1] === '>' || src[i + 1] === '&') i++;
      skipWord = true;
      continue;
    }
    if (/\s/.test(c)) { endWord(); continue; }
    add(c);
  }
  endCommand();
  return { commands, nested };
}

function expand(word) {
  const env = (name) => (name === 'HOME' ? homedir() : process.env[name]);
  return word
    .replace(/^~(?=\/|$)/, homedir())
    .replace(/\$\{(\w+):?-([^}]*)\}/g, (all, name, fallback) => env(name) || fallback)
    .replace(/\$\{(\w+)\}|\$(\w+)/g, (all, a, b) => env(a ?? b) ?? all);
}

function defaultBranches(cwd) {
  const head = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '');
  return head ? [head] : ['main', 'master'];
}

const short = (args, letter) => args.some((a) => new RegExp(`^-[a-zA-Z]*${letter}[a-zA-Z]*$`).test(a));

function checkPush(args, cwd) {
  if (args.includes('--mirror')) return ['deny', 'a mirror push overwrites every ref on the remote'];
  const positional = [];
  let repo = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--repo=')) repo = a.slice(7);
    else if (a === '--repo' || a === '-o' || a === '--push-option' || a === '--receive-pack') { if (a === '--repo') repo = args[i + 1]; i++; }
    else if (!a.startsWith('-')) positional.push(a);
  }
  const refs = repo === null ? positional.slice(1) : positional;
  const force = args.some((a) => a === '--force' || a.startsWith('--force-with-lease')) || short(args, 'f');
  const del = args.includes('--delete') || short(args, 'd');
  const current = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  let every = args.includes('--all') || args.includes('--branches');
  let plus = false;
  let colon = false;
  const targets = [];
  for (const ref of refs) {
    const body = ref.replace(/^\+/, '');
    plus ||= ref.startsWith('+');
    if (body === ':' || body.includes('*')) every = true;
    else {
      colon ||= body.startsWith(':');
      targets.push(body.split(':').pop().replace(/^refs\/heads\//, '').replace(/^HEAD$/, current));
    }
  }
  if (!refs.length && !every) targets.push(current);
  if (!force && !del && !plus && !colon) return null;
  const main = defaultBranches(cwd);
  const hit = every ? main[0] : targets.find((t) => main.includes(t));
  if (hit) return ['deny', `this rewrites or deletes ${hit}, the default branch`];
  return ['ask', del || colon ? 'this deletes a remote branch' : 'this force-pushes, which replaces commits on the remote'];
}

function checkGit(w, cwd) {
  let i = 1;
  let dir = cwd;
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C') dir = resolve(dir, expand(w[++i] ?? '.'));
    else if (['-c', '--git-dir', '--work-tree', '--namespace'].includes(w[i])) i++;
    i++;
  }
  const sub = w[i];
  const args = w.slice(i + 1);
  const wide = args.some((a) => a === '.' || a === ':/' || a === '*');
  const discard = ['ask', 'this discards changes in the working tree'];
  switch (sub) {
    case 'push': return checkPush(args, dir);
    case 'reset': return args.includes('--hard') ? ['ask', 'a hard reset discards uncommitted changes'] : null;
    case 'clean':
      return (args.includes('--force') || short(args, 'f')) && !(args.includes('--dry-run') || short(args, 'n'))
        ? ['ask', 'a forced clean deletes untracked files'] : null;
    case 'checkout': return wide || args.includes('--force') || short(args, 'f') ? discard : null;
    case 'switch': return args.includes('--force') || args.includes('--discard-changes') || short(args, 'f') ? discard : null;
    case 'restore': {
      const staged = args.includes('--staged') || short(args, 'S');
      const worktree = args.includes('--worktree') || short(args, 'W');
      return wide && (!staged || worktree) ? discard : null;
    }
    case 'branch': {
      const del = args.includes('--delete') || short(args, 'd') || short(args, 'D');
      const force = args.includes('--force') || short(args, 'f') || short(args, 'D');
      return del && force ? ['ask', 'this deletes a branch that may hold unmerged commits'] : null;
    }
    case 'stash':
      return args[0] === 'drop' || args[0] === 'clear' ? ['ask', 'this deletes stashed changes, and other sessions share the stash'] : null;
    default: return null;
  }
}

function checkRm(w, cwd, roots) {
  const args = w.slice(1);
  const end = args.indexOf('--');
  const options = end < 0 ? args.filter((a) => a.startsWith('-')) : args.slice(0, end);
  if (!options.some((a) => a === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a))) return null;
  const home = homedir();
  const targets = end < 0 ? args.filter((a) => !a.startsWith('-')) : args.slice(end + 1);
  for (const raw of targets) {
    const expanded = expand(raw);
    // An empty variable turns `$DIR/` into `/`.
    if (/^\$\{?\w+\}?\/\*?$/.test(expanded)) return ['ask', `${raw} deletes / when the variable is empty`];
    if (expanded.includes('$')) continue;
    const glob = /(^|\/)\*$/.test(expanded);
    const target = resolve(cwd, expanded.replace(/(^|\/)\*$/, '$1'));
    const holds = (path) => path === target || path.startsWith(target === '/' ? '/' : target + sep);
    if (target === '/' || holds(home) || roots.some(holds) || /(^|\/)\.git$/.test(target)) {
      return ['deny', `this deletes ${glob ? 'everything in ' : ''}${target}`];
    }
  }
  return null;
}

export function decide(command, cwd, roots = null) {
  const tops = roots ?? [git(cwd, ['rev-parse', '--show-toplevel'])].filter(Boolean);
  const { commands, nested } = lex(String(command));
  let verdict = null;
  const take = (found) => {
    if (found && (!verdict || found[0] === 'deny')) verdict = found;
  };
  let dir = cwd;
  for (const script of nested) take(decide(script, dir, tops));
  for (let w of commands) {
    if (verdict?.[0] === 'deny') break;
    while (w.length && (KEYWORDS.has(w[0]) || PREFIXES.has(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) w = w.slice(1);
    if (!w.length) continue;
    const name = w[0].split('/').pop();
    if (name === 'cd' || name === 'pushd') {
      const to = expand(w[1] ?? '~');
      if (!to.includes('$') && to !== '-') {
        dir = resolve(dir, to);
        const top = git(dir, ['rev-parse', '--show-toplevel']);
        if (top && !tops.includes(top)) tops.push(top);
      }
    } else if (SHELLS.has(name)) {
      const flag = w.findIndex((a, k) => k > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
      if (flag > 0 && w[flag + 1] !== undefined) take(decide(w[flag + 1], dir, tops));
    } else if (name === 'eval') take(decide(w.slice(1).join(' '), dir, tops));
    else if (name === 'git') take(checkGit(w, dir));
    else if (name === 'rm') take(checkRm(w, dir, tops));
  }
  return verdict;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    if (input.tool_name === 'Bash') {
      const verdict = decide(input.tool_input?.command ?? '', input.cwd || process.cwd());
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
  } catch {
    // A request this hook cannot read passes to the host's own permission check.
  }
}
