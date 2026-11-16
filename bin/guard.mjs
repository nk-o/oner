#!/usr/bin/env node
// PreToolUse hook for Bash in Claude Code and, with `--host codex`, in Codex, written when
// `guard.enabled` is on. It refuses what
// would destroy shared history or the machine (a force-push or delete of the default branch,
// a mirror push, a recursive delete of /, the home directory, or a repository root) and asks
// before what would lose local work (a hard reset, a forced clean, discarding every change, a
// forced branch delete, a stash drop, any other force-push). Everything else, and any input it
// cannot read, passes untouched.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const PREFIXES = new Set(['sudo', 'command', 'exec', 'time', 'nohup', 'env']);

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function words(segment) {
  const out = segment.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/^(['"])(.*)\1$/, '$2'));
  while (out.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(out[0]) || PREFIXES.has(out[0]))) out.shift();
  return out;
}

function defaultBranches(cwd) {
  const head = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '');
  return head ? [head] : ['main', 'master'];
}

function checkPush(args, cwd) {
  if (args.includes('--mirror')) return ['deny', 'a mirror push overwrites every ref on the remote'];
  const force = args.some((a) => /^--force/.test(a) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a));
  const del = args.some((a) => a === '--delete' || /^-[a-zA-Z]*d[a-zA-Z]*$/.test(a));
  const refs = args.filter((a) => !a.startsWith('-')).slice(1);
  const plus = refs.some((r) => r.startsWith('+'));
  const colon = refs.some((r) => r.startsWith(':'));
  if (!force && !del && !plus && !colon) return null;
  const main = defaultBranches(cwd);
  const current = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const targets = args.includes('--all') ? main
    : refs.length ? refs.map((r) => r.replace(/^\+/, '').split(':').pop().replace(/^refs\/heads\//, '').replace(/^HEAD$/, current))
      : [current];
  if (targets.some((t) => main.includes(t))) {
    return ['deny', `this rewrites or deletes ${targets.find((t) => main.includes(t))}, the default branch`];
  }
  return ['ask', del || colon ? 'this deletes a remote branch' : 'this force-pushes, which replaces commits on the remote'];
}

function checkGit(w, cwd) {
  let i = 1;
  let dir = cwd;
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C') dir = resolve(dir, w[++i] ?? '.');
    else if (w[i] === '-c') i++;
    i++;
  }
  const sub = w[i];
  const args = w.slice(i + 1);
  const wide = args.some((a) => a === '.' || a === ':/' || a === '*');
  switch (sub) {
    case 'push': return checkPush(args, dir);
    case 'reset': return args.includes('--hard') ? ['ask', 'a hard reset discards uncommitted changes'] : null;
    case 'clean':
      return args.some((a) => a === '--force' || /^-[a-zA-Z]*f/.test(a)) && !args.some((a) => a === '-n' || a === '--dry-run')
        ? ['ask', 'a forced clean deletes untracked files'] : null;
    case 'checkout':
      return wide || args.some((a) => a === '-f' || a === '--force') ? ['ask', 'this discards changes in the working tree'] : null;
    case 'restore':
      return wide && (!args.includes('--staged') || args.includes('--worktree')) ? ['ask', 'this discards changes in the working tree'] : null;
    case 'branch':
      return args.includes('-D') || (args.includes('--delete') && args.includes('--force')) ? ['ask', 'this deletes a branch that may hold unmerged commits'] : null;
    case 'stash':
      return args[0] === 'drop' || args[0] === 'clear' ? ['ask', 'this deletes stashed changes, and other sessions share the stash'] : null;
    default: return null;
  }
}

function checkRm(w, cwd) {
  const args = w.slice(1);
  if (!args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) return null;
  const home = homedir();
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  for (const raw of args.filter((a) => !a.startsWith('-'))) {
    const expanded = raw.replace(/^~(?=\/|$)/, home).replace(/^\$\{?HOME\}?(?=\/|$)/, home);
    // An empty variable turns `$DIR/` into `/`.
    if (/^\$\{?\w+\}?\/?\*?$/.test(expanded)) return ['ask', `${raw} deletes / when the variable is empty`];
    const glob = /(^|\/)\*$/.test(expanded);
    const target = resolve(cwd, expanded.replace(/(^|\/)\*$/, '$1'));
    const root = target === '/' || target === home || home.startsWith(target + sep);
    if (root || (top && target === top) || /(^|\/)\.git$/.test(target)) {
      return ['deny', `this deletes ${glob ? 'everything in ' : ''}${target}`];
    }
  }
  return null;
}

export function decide(command, cwd) {
  let verdict = null;
  for (const segment of String(command).split(/&&|\|\||[;|\n]/)) {
    const w = words(segment);
    const found = w[0] === 'git' ? checkGit(w, cwd) : w[0] === 'rm' ? checkRm(w, cwd) : null;
    if (found && (!verdict || found[0] === 'deny')) verdict = found;
    if (verdict?.[0] === 'deny') break;
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
