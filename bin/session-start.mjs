#!/usr/bin/env node
// Session-start hook for agents whose hooks take JSON: `session-start.mjs <format> <dir>`.
// Rebuilds when the sources changed, then hands a pending update and any open
// oneshot run to the session.
//   cursor  {additional_context}, with the rules too: the Cursor CLI reads no
//           user-level rules file, so this is how AGENTS.md reaches it.
//   json    {hookSpecificOutput: {additionalContext}}, the Claude-shaped reply
//           Gemini CLI and Grok Build take; they load the rules themselves.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cursor rejects additional_context past this many characters.
const CAP = 10000;
const here = dirname(fileURLToPath(import.meta.url));
const [format, dir, skillsDir = join(dir ?? '', 'skills')] = process.argv.slice(2);
if (!['cursor', 'json'].includes(format) || !dir) {
  console.error('Usage: session-start.mjs <cursor|json> <target dir> [skills dir]');
  process.exit(2);
}
// A refusal on stderr is the only notice the user gets from here, so it is kept.
const run = (cmd, args, input = '') => {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', timeout: 30000 });
  return [r.stdout, r.status ? r.stderr : ''].filter(Boolean).join('\n').trim();
};

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8')) ?? {};
} catch {}

// The build's own lines stay in: one may be the only notice that Codex's hooks
// changed and need trusting again.
const notes = [
  run(process.execPath, [join(here, 'build.mjs'), '--auto']),
  run(process.execPath, [join(here, 'update-check.mjs')]),
];
const root = input.cwd ?? input.workspace_roots?.[0];
if (root) {
  const event = JSON.stringify({ hook_event_name: 'SessionStart', cwd: root });
  notes.push(run(join(skillsDir, 'oneshot', 'hook.sh'), [], event));
}
const extra = notes.filter(Boolean).join('\n\n');
if (format === 'json') {
  if (extra) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: extra } }) + '\n');
  }
  process.exit(0);
}

const rulesPath = join(dir, 'agent-config', 'AGENTS.md');
let rules = '';
try {
  rules = readFileSync(rulesPath, 'utf8');
} catch {}
let context = [rules.trim(), extra].filter(Boolean).join('\n\n');
if (context.length > CAP) {
  context = [`Your standing rules are in ${rulesPath}. Read that file in full before anything else and follow it.`, extra]
    .filter(Boolean)
    .join('\n\n');
}
process.stdout.write(JSON.stringify({ additional_context: context }) + '\n');
