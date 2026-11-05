import { existsSync } from 'node:fs';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { repoLabel } from '../repos.mjs';
import { SourceOff } from '../run.mjs';

const TAIL_BYTES = 768 * 1024;

export const desktopStore = (home = homedir()) => join(home, 'Library', 'Application Support', 'Claude', 'claude-code-sessions');

export function startOfDay(now) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

const yieldToServer = () => new Promise((resolve) => setImmediate(resolve));

function pick(raw) {
  if (typeof raw?.sessionId !== 'string' || typeof raw.lastActivityAt !== 'number') return null;
  const summary = raw.postTurnSummary;
  return {
    id: raw.sessionId,
    title: typeof raw.title === 'string' ? raw.title : null,
    cwd: typeof raw.cwd === 'string' ? raw.cwd : null,
    archived: raw.isArchived === true,
    at: raw.lastActivityAt,
    transcript: raw.lastAssistantCliSessionId ?? raw.cliSessionId ?? null,
    category: summary?.status_category ?? null,
    detail: summary?.status_detail ?? null,
    needsAction: summary?.needs_action || null,
    scheduled: Boolean(raw.scheduledTaskId),
    prs: Array.isArray(raw.prs) ? raw.prs.map((pr) => ({ url: pr?.url, state: pr?.state })) : [],
  };
}

// Reads the desktop app's session records. Its format is not documented, so a record
// that does not parse is counted, and a parse is kept until the file changes.
export function createRecords(store) {
  const known = new Map();
  return async function records() {
    let folders;
    try {
      folders = (await readdir(store)).map((account) => join(store, account));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
    const files = [];
    for (const account of folders) {
      for (const org of await readdir(account).catch(() => [])) {
        const dir = join(account, org);
        for (const name of await readdir(dir).catch(() => [])) {
          if (name.startsWith('local_') && name.endsWith('.json')) files.push(join(dir, name));
        }
      }
    }
    const list = [];
    let unread = 0;
    let index = 0;
    for (const file of files) {
      if (++index % 20 === 0) await yieldToServer();
      const info = await stat(file).catch(() => null);
      if (!info) continue;
      let entry = known.get(file);
      if (!entry || entry.mtime !== info.mtimeMs || entry.size !== info.size) {
        let record = null;
        try {
          record = pick(JSON.parse(await readFile(file, 'utf8')));
        } catch {}
        entry = { mtime: info.mtimeMs, size: info.size, record };
        known.set(file, entry);
      }
      if (entry.record) list.push(entry.record);
      else unread++;
    }
    const byId = new Map();
    for (const record of list) {
      const seen = byId.get(record.id);
      if (!seen || record.at > seen.at) byId.set(record.id, record);
    }
    return { records: [...byId.values()], unread, total: files.length };
  };
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// One file per running process. External review runs through sdk-cli, so those are
// another session's helpers, not work of their own.
export async function readLive(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const live = [];
  let unread = 0;
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    try {
      const raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
      if (typeof raw.pid !== 'number' || typeof raw.status !== 'string') throw new Error('unknown shape');
      if (raw.entrypoint === 'sdk-cli' || !alive(raw.pid)) continue;
      live.push({
        host: raw.hostSessionId ?? null,
        session: raw.sessionId ?? null,
        status: raw.status,
        waitingFor: raw.waitingFor ?? null,
        name: raw.name ?? null,
        cwd: raw.cwd ?? null,
        at: raw.statusUpdatedAt ?? raw.updatedAt ?? null,
      });
    } catch (err) {
      if (err.code !== 'ENOENT') unread++;
    }
  }
  return { live, unread };
}

const isHuman = (line) => {
  if (line.type !== 'user' || line.isMeta || line.isSidechain) return false;
  const content = line.message?.content;
  return typeof content === 'string' || (Array.isArray(content) && content.some((part) => part?.type === 'text'));
};

// The question the last turn ended on, when nothing was said after it.
export function lastAsk(text) {
  let ask = null;
  for (const raw of text.split('\n')) {
    if (!raw.includes('wrap_up') && !raw.includes('"type":"user"')) continue;
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (isHuman(line)) ask = null;
    else if (line.type === 'assistant' && !line.isSidechain && Array.isArray(line.message?.content)) {
      for (const part of line.message.content) {
        if (part?.type === 'tool_use' && String(part.name).endsWith('wrap_up')) ask = part.input?.ask ?? null;
      }
    }
  }
  return ask;
}

async function readTail(file) {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const text = buffer.toString('utf8');
    return length < size ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    await handle.close();
  }
}

function createAsks(claudeDir) {
  const known = new Map();
  const projects = join(claudeDir, 'projects');
  async function locate(record) {
    const direct = join(projects, String(record.cwd).replace(/[^A-Za-z0-9]/g, '-'), `${record.transcript}.jsonl`);
    if (existsSync(direct)) return direct;
    for (const dir of await readdir(projects).catch(() => [])) {
      const file = join(projects, dir, `${record.transcript}.jsonl`);
      if (existsSync(file)) return file;
    }
    return null;
  }
  return async function askOf(record) {
    if (!record.transcript) return null;
    const file = await locate(record);
    const info = file && (await stat(file).catch(() => null));
    if (!info) return null;
    const entry = known.get(file);
    if (entry?.mtime === info.mtimeMs && entry.size === info.size) return entry.ask;
    const ask = lastAsk(await readTail(file));
    known.set(file, { mtime: info.mtimeMs, size: info.size, ask });
    return ask;
  };
}

// Which group a session belongs to. Running wins over everything, and archiving a
// session is how the person says it no longer needs them.
export function classify(record, live, ask, dayStart) {
  if (live?.status === 'busy') return { group: 'running', detail: record?.detail ?? null };
  if (live?.status === 'waiting') return { group: 'waiting', detail: live.waitingFor ?? 'Waiting for you' };
  if (!record) return null;
  if (!record.archived) {
    if (ask) return { group: 'waiting', detail: ask };
    if (record.category === 'blocked') return { group: 'waiting', detail: record.needsAction ?? record.detail };
    const landed = record.prs.length > 0 && record.prs.every((pr) => pr.state === 'MERGED');
    if (record.category === 'review_ready' && !landed) return { group: 'waiting', detail: record.detail ?? 'Ready for your review' };
  }
  if (record.at >= dayStart) return { group: 'finished', detail: record.detail };
  return record.archived ? null : { group: 'parked' };
}

export function claudeSource({ claudeDir, store = desktopStore(), records = createRecords(store) }) {
  const askOf = createAsks(claudeDir);
  return {
    id: 'claude',
    label: 'Claude',
    interval: 10_000,
    timeout: 60_000,
    async read({ now }) {
      const [stored, running] = await Promise.all([records(), readLive(join(claudeDir, 'sessions'))]);
      if (!stored && !running) throw new SourceOff('no Claude Code sessions on this machine');
      if (stored && stored.total > 0 && stored.unread === stored.total) throw new Error('session records are in an unknown format');
      const liveByHost = new Map((running?.live ?? []).filter((l) => l.host).map((l) => [l.host, l]));
      const dayStart = startOfDay(now);
      const items = [];
      let parked = 0;
      const known = new Set();
      for (const record of stored?.records ?? []) {
        known.add(record.id);
        const live = liveByHost.get(record.id);
        const needsAsk = !record.archived && (!live || live.status === 'idle');
        const placed = classify(record, live, needsAsk ? await askOf(record).catch(() => null) : null, dayStart);
        if (!placed) continue;
        if (placed.group === 'parked') {
          parked++;
          continue;
        }
        items.push({
          id: `claude:${record.id}`,
          kind: 'session',
          agent: 'Claude',
          group: placed.group,
          title: record.title ?? live?.name ?? 'Untitled session',
          detail: placed.detail ?? null,
          repo: repoLabel(record.cwd),
          at: record.at,
          url: `claude://claude.ai/epitaxy/${record.id}`,
          scheduled: record.scheduled,
          prUrls: record.prs.map((pr) => pr.url).filter(Boolean),
        });
      }
      // A terminal session has no desktop record, so it shows only while it needs a group.
      for (const live of running?.live ?? []) {
        if (live.host && known.has(live.host)) continue;
        const placed = classify(null, live, null, dayStart);
        if (!placed) continue;
        items.push({
          id: `claude:${live.session}`,
          kind: 'session',
          agent: 'Claude',
          group: placed.group,
          title: live.name ?? 'Terminal session',
          detail: placed.detail ?? null,
          repo: repoLabel(live.cwd),
          at: live.at ?? now,
          url: null,
          scheduled: false,
          prUrls: [],
        });
      }
      return {
        items,
        unread: (stored?.unread ?? 0) + (running?.unread ?? 0),
        data: { parked },
      };
    },
  };
}
