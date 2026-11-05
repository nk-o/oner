import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { repoLabel } from '../repos.mjs';
import { run, SourceOff } from '../run.mjs';
import { startOfDay } from './claude.mjs';

const TAIL_BYTES = 300 * 1024;
// A rollout quiet for this long has stopped, whatever its last event says.
const QUIET_MS = 10 * 60 * 1000;
const ENDED = new Set(['task_complete', 'turn_aborted']);

// node:sqlite is not in Node 20, which oner supports, so reads go through the CLI.
export async function queryCodex(codexDir, sql, signal) {
  const names = await readdir(codexDir).catch(() => null);
  if (!names) throw new SourceOff('Codex is not on this machine');
  const newest = names
    .map((name) => /^state_(\d+)\.sqlite$/.exec(name))
    .filter(Boolean)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  if (!newest) throw new SourceOff('Codex has no state database');
  const out = await run('sqlite3', ['-readonly', '-json', join(codexDir, newest[0]), sql], { signal });
  return out.trim() ? JSON.parse(out) : [];
}

// The last lifecycle event in a rollout's tail, or null when the tail holds none.
export function lastLifecycle(text) {
  let last = null;
  for (const raw of text.split('\n')) {
    if (!raw.includes('"task_')  && !raw.includes('"turn_aborted"')) continue;
    try {
      const type = JSON.parse(raw).payload?.type;
      if (type === 'task_started' || ENDED.has(type)) last = type;
    } catch {}
  }
  return last;
}

async function rolloutState(path, now) {
  const info = await stat(path).catch(() => null);
  if (!info || now - info.mtimeMs > QUIET_MS) return false;
  const handle = await open(path, 'r');
  try {
    const length = Math.min(info.size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, info.size - length);
    return !ENDED.has(lastLifecycle(buffer.toString('utf8')));
  } finally {
    await handle.close();
  }
}

// Codex keeps no signal for a question to the person, so a thread is running or finished.
export function codexSource({ codexDir }) {
  return {
    id: 'codex',
    label: 'Codex',
    interval: 10_000,
    timeout: 30_000,
    async read({ signal, now }) {
      const since = Math.floor(startOfDay(now) / 1000);
      const rows = await queryCodex(
        codexDir,
        `select id, rollout_path, coalesce(nullif(name, ''), title) as title, cwd, updated_at from threads
         where source in ('vscode', 'cli') and updated_at >= ${since} order by updated_at desc limit 100`,
        signal,
      );
      const items = [];
      for (const row of rows) {
        items.push({
          id: `codex:${row.id}`,
          kind: 'session',
          agent: 'Codex',
          group: (await rolloutState(row.rollout_path, now)) ? 'running' : 'finished',
          title: String(row.title ?? 'Untitled thread').split('\n')[0],
          detail: null,
          repo: repoLabel(row.cwd),
          at: row.updated_at * 1000,
          url: null,
          scheduled: false,
          prUrls: [],
        });
      }
      return { items };
    },
  };
}
