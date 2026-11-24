import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { renderTarget } from './install.mjs';
import { TARGETS } from './targets.mjs';

// Claude Code moves a hook's output past about 10k characters into a file the
// eval sandbox will not let the agent read, so the instructions go in smaller pieces.
export const CHUNK_LIMIT = 8000;

export function chunkInstructions(text, limit = CHUNK_LIMIT) {
  const chunks = [];
  let cur = '';
  for (const para of text.split(/(?<=\n\n)/)) {
    if (cur && cur.length + para.length > limit) {
      chunks.push(cur);
      cur = '';
    }
    for (let i = 0; i < para.length; i += limit) {
      const piece = para.slice(i, i + limit);
      if (cur && cur.length + piece.length > limit) {
        chunks.push(cur);
        cur = '';
      }
      cur += piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function writeEvalPlugin(repo, config, dir) {
  const hooks = runHooks(repo);
  for (const [rel, { data, mode }] of renderTarget(repo, config, 'claude', dir)) {
    if (rel === 'CLAUDE.md') {
      const context = chunkInstructions(data.toString('utf8')).map((chunk, i) => {
        const name = `${String(i + 1).padStart(2, '0')}.md`;
        write(join(dir, 'context', name), chunk);
        return { hooks: [{ type: 'command', command: `cat "\${CLAUDE_PLUGIN_ROOT}/context/${name}"` }] };
      });
      hooks.SessionStart = [...context, ...(hooks.SessionStart ?? [])];
      continue;
    }
    write(join(dir, rel), data, mode);
  }
  write(join(dir, 'hooks', 'hooks.json'), JSON.stringify({ hooks }, null, 2) + '\n');
  write(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'oner', version: '0.0.0-eval' }, null, 2) + '\n');
  cpSync(join(repo, 'evals'), join(dir, 'evals'), { recursive: true });
}

// Only the oneshot lifecycle hook shapes a run. The template's other hooks act on
// the machine outside it: the build, the update check, the dev-server gate.
function runHooks(repo) {
  const template = JSON.parse(readFileSync(join(repo, TARGETS.claude.settings.template), 'utf8'));
  const out = {};
  for (const [event, entries] of Object.entries(template.hooks)) {
    const kept = entries
      .filter((e) => e.hooks.some((h) => h.command.includes('/oneshot/hook.sh')))
      .map((e) => ({ ...e, hooks: e.hooks.map((h) => ({ ...h, command: h.command.replace('{{skills_dir}}', '${CLAUDE_PLUGIN_ROOT}/skills') })) }));
    if (kept.length) out[event] = kept;
  }
  return out;
}

// The eval child inherits PATH. macOS's /usr/bin/git goes through xcrun, whose
// cache write the sandbox denies, and a version manager's shim needs the real
// HOME, so the first binary that is neither goes first.
export function toolPath(name, path = process.env.PATH ?? '') {
  for (const entry of path.split(delimiter)) {
    const bin = join(entry, name);
    if (!entry || !existsSync(bin)) continue;
    const real = realpathSync(bin);
    if (real === '/usr/bin/git' || /\/shims?\//.test(real) || real.endsWith('/mise')) continue;
    return dirname(real);
  }
  return null;
}

function write(path, data, mode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, mode ? { mode } : undefined);
}
