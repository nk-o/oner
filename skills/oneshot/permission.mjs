#!/usr/bin/env node
// Answers a Claude Code PermissionRequest for an open oneshot run. hook.sh calls
// it only while a run is running in a session that loaded the skill, with the
// hook input on stdin and the skills directory as its argument. It approves the
// run's local work: edits inside this repository's worktrees or the session
// scratchpad, reads, and shell commands. It prints nothing, which leaves the
// prompt to the user, for any other tool, and for a command that runs as
// another user, opens a remote shell, deploys, changes infrastructure,
// publishes, rewrites or deletes a shared branch, or deletes recursively
// outside the repository.
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READS = new Set(['Read', 'Glob', 'Grep']);
const ASK_TOOLS = ['sudo', 'doas', 'su', 'ssh', 'scp', 'launchctl', 'vercel', 'netlify', 'fly', 'flyctl', 'heroku',
  'railway', 'wrangler', 'firebase', 'amplify', 'kubectl', 'helm', 'terraform', 'tofu', 'pulumi', 'ansible',
  'ansible-playbook', 'aws', 'gcloud', 'gsutil', 'az', 'doctl', 'supabase'];
// A tool name as a word of its own, so `vercel.json` or `aws-sdk` does not match.
const ASK_TOOL = new RegExp(`(^|[\\s;&|(\`'"])(${ASK_TOOLS.join('|')})(?=[\\s;&|)\`'"]|$)`);
const PUBLISH = [
  /\b(npm|pnpm|yarn|bun)\s+(\S+\s+)?publish\b/,
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(deploy|release)\S*/,
  /\bcargo\s+publish\b/,
  /\bgem\s+push\b/,
  /\btwine\s+upload\b/,
  /\bpoetry\s+publish\b/,
  /\bdocker\s+push\b/,
  /\bgh\s+release\s+(create|upload|delete|edit)\b/,
  /\bgh\s+repo\s+(delete|archive|rename|edit)\b/,
  /\bgh\s+(secret|variable)\b/,
  /\bgh\s+api\b.*(-X|--method)[\s=]*['"]?DELETE\b/i,
];

const inside = (path, roots) => roots.some((root) => path === root || path.startsWith(root + sep));

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function pushIsSafe(command, defaultBranch, branch) {
  for (const m of command.matchAll(/\bgit\b(?:\s+-[Cc]\s+\S+)*\s+push\b([^;&|\n]*)/g)) {
    const args = m[1].replace(/--force-with-lease(=\S+)?|--force-if-includes/g, ' ');
    if (/(^|\s)(--force|--delete|--mirror|--all|--tags|--prune|-[a-zA-Z]*[fd][a-zA-Z]*)(\s|$)/.test(args)) return false;
    const refs = args.trim().split(/\s+/).filter((t) => t && !t.startsWith('-')).map((t) => t.replace(/^['"]|['"]$/g, ''));
    // refs[0] is the remote. Without a refspec, git pushes the current branch.
    if (refs.slice(1).some((t) => /^[+:]/.test(t) || t.split(':').pop().replace(/^refs\/heads\//, '') === defaultBranch)) return false;
    if (refs.length < 2 && branch === defaultBranch) return false;
  }
  return true;
}

function rmIsSafe(command, cwd, roots) {
  for (const m of command.matchAll(/(^|[\s;&|(`'"])rm\s+([^;&|\n`)]*)/g)) {
    const args = m[2].trim().split(/\s+/).map((a) => a.replace(/^['"]|['"]$/g, ''));
    if (!args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) continue;
    for (const target of args.filter((a) => a && !a.startsWith('-'))) {
      if (/^[~$*]|^\.\.?\/?$|(^|\/)\.\.(\/|$)/.test(target)) return false;
      if (!inside(resolve(cwd, target), roots)) return false;
    }
  }
  return true;
}

function decide(input, skillsDir) {
  const cwd = input.cwd || process.cwd();
  const tool = input.tool_name;
  const args = input.tool_input ?? {};
  const worktrees = git(cwd, ['worktree', 'list', '--porcelain']).split('\n')
    .filter((l) => l.startsWith('worktree ')).map((l) => l.slice('worktree '.length));
  const writable = [...worktrees, input.scratchpad_dir].filter(Boolean);
  const readable = [...writable, skillsDir, realpathSync(skillsDir)];

  if (EDITS.has(tool)) {
    const path = args.file_path ?? args.notebook_path;
    if (!path || !isAbsolute(path) || path.split(sep).includes('..')) return false;
    // The repository's history and the host's own permissions stay the user's.
    if (/(^|\/)\.git(\/|$)/.test(path) || /\/\.claude\/settings[^/]*\.json$/.test(path)) return false;
    return inside(path, writable);
  }
  if (READS.has(tool)) {
    const path = args.file_path ?? args.path ?? cwd;
    return isAbsolute(path) && !path.split(sep).includes('..') && inside(path, readable);
  }
  if (tool === 'Bash') {
    const command = String(args.command ?? '');
    if (ASK_TOOL.test(command) || PUBLISH.some((r) => r.test(command))) return false;
    const defaultBranch = git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '') || 'main';
    const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return pushIsSafe(command, defaultBranch, branch) && rmIsSafe(command, cwd, writable);
  }
  return false;
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (decide(input, resolve(process.argv[2] ?? '.'))) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } }));
  }
} catch {
  // A request this script cannot read goes to the user.
}
